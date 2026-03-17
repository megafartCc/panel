const express = require('express');
const crypto = require('crypto');
const { dbAll, dbGet, dbRun, ensureCloudPresetSchema, isMySql } = require('../db');

const router = express.Router();

const SIGNATURE_WINDOW_SECONDS = Math.max(30, Number(process.env.CLOUD_SIGNATURE_WINDOW_SECONDS) || 120);
const MAX_PRESETS_PER_USER = Math.max(1, Number(process.env.CLOUD_MAX_PRESETS_PER_USER) || 5);
const MAX_PRESETS_PER_USER_GLOBAL = Math.max(1, Number(process.env.CLOUD_MAX_PRESETS_PER_USER_GLOBAL) || 5);
const MAX_PRESET_NAME_LENGTH = Math.max(8, Number(process.env.CLOUD_MAX_PRESET_NAME_LENGTH) || 48);
const MAX_PAYLOAD_BYTES = Math.max(512, Number(process.env.CLOUD_MAX_PRESET_BYTES) || 24 * 1024);

const RATE_LIMIT_WINDOW_SECONDS = Math.max(10, Number(process.env.CLOUD_RATE_LIMIT_WINDOW_SECONDS) || 60);
const RATE_LIMIT_MAX_REQUESTS_PER_USER = Math.max(1, Number(process.env.CLOUD_RATE_LIMIT_MAX_REQUESTS) || 25);
const RATE_LIMIT_MAX_REQUESTS_PER_IP = Math.max(1, Number(process.env.CLOUD_RATE_LIMIT_MAX_REQUESTS_PER_IP) || 120);

const rateLimitBuckets = new Map();
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000;

    for (const [key, timestamps] of rateLimitBuckets.entries()) {
        let firstInWindow = 0;
        while (firstInWindow < timestamps.length && now - timestamps[firstInWindow] > windowMs) {
            firstInWindow += 1;
        }

        if (firstInWindow > 0) {
            timestamps.splice(0, firstInWindow);
        }

        if (timestamps.length === 0) {
            rateLimitBuckets.delete(key);
        }
    }
}, Math.max(15000, RATE_LIMIT_WINDOW_SECONDS * 1000));

if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
}

ensureCloudPresetSchema().catch((err) => {
    console.error('[Cloud] Initial schema ensure failed:', err.message);
});

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        const first = forwarded.split(',')[0].trim();
        if (first) {
            return first;
        }
    }
    return req.socket?.remoteAddress || 'unknown';
}

function normalizeSignature(signature, expectedHex) {
    if (typeof signature !== 'string' || !signature) {
        return null;
    }

    if (/[^0-9a-fA-F]/.test(signature)) {
        try {
            return Buffer.from(signature, 'base64').toString('hex');
        } catch {
            return null;
        }
    }

    if (expectedHex && signature.length !== expectedHex.length) {
        return null;
    }

    return signature.toLowerCase();
}

async function getScriptRow(script) {
    return dbGet('SELECT id, slug, hmac_key FROM scripts WHERE slug = ?', [script]);
}

async function verifySignedScriptPayload(payload) {
    const script = String(payload?.script || payload?.slug || payload?.script_slug || '').trim();
    const { userid, timestamp, signature } = payload || {};

    if (!script || !userid || !timestamp || !signature) {
        return { ok: false, status: 400, error: 'Missing required fields' };
    }

    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts) || Math.abs(now - ts) > SIGNATURE_WINDOW_SECONDS) {
        return { ok: false, status: 400, error: 'Invalid timestamp' };
    }

    const scriptRow = await getScriptRow(script);
    if (!scriptRow) {
        return { ok: false, status: 404, error: 'Script not found' };
    }

    const message = `${script}:${userid}:${timestamp}`;
    const expectedHex = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');
    const sigHex = normalizeSignature(signature, expectedHex);

    if (!sigHex) {
        return { ok: false, status: 401, error: 'Invalid signature format' };
    }

    if (!crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex'))) {
        return { ok: false, status: 401, error: 'Invalid signature' };
    }

    return { ok: true, scriptRow };
}

function normalizeUsername(user, userid) {
    const raw = typeof user === 'string' ? user.trim() : '';
    if (raw && raw.length <= 32 && /^[A-Za-z0-9_]+$/.test(raw)) {
        return {
            display: raw,
            normalized: raw.toLowerCase(),
        };
    }

    const fallbackUserId = typeof userid === 'string' || typeof userid === 'number'
        ? String(userid).trim()
        : '';
    if (!fallbackUserId) {
        return null;
    }

    return {
        display: `userid_${fallbackUserId}`,
        normalized: `userid_${fallbackUserId}`,
    };
}

function normalizePresetName(value) {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }

    const text = String(value).trim();
    if (!text || text.length > MAX_PRESET_NAME_LENGTH) {
        return null;
    }

    if (/[\u0000-\u001f\u007f]/.test(text)) {
        return null;
    }

    return text;
}

function encodeCloudData(data) {
    if (data === undefined) {
        return { ok: false, status: 400, error: 'Missing preset data' };
    }

    let encoded;
    try {
        encoded = JSON.stringify(data);
    } catch {
        return { ok: false, status: 400, error: 'Invalid preset data' };
    }

    if (typeof encoded !== 'string' || encoded.length === 0) {
        return { ok: false, status: 400, error: 'Invalid preset data' };
    }

    if (Buffer.byteLength(encoded, 'utf8') > MAX_PAYLOAD_BYTES) {
        return { ok: false, status: 413, error: `Preset too large (max ${MAX_PAYLOAD_BYTES} bytes)` };
    }

    return { ok: true, encoded };
}

function parseCloudData(jsonText) {
    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}

function consumeRateLimit(key, limitPerWindow) {
    const now = Date.now();
    const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000;
    const bucket = rateLimitBuckets.get(key) || [];

    let firstInWindow = 0;
    while (firstInWindow < bucket.length && now - bucket[firstInWindow] > windowMs) {
        firstInWindow += 1;
    }
    if (firstInWindow > 0) {
        bucket.splice(0, firstInWindow);
    }

    if (bucket.length >= limitPerWindow) {
        const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - bucket[0])) / 1000));
        rateLimitBuckets.set(key, bucket);
        return { ok: false, retryAfterSeconds };
    }

    bucket.push(now);
    rateLimitBuckets.set(key, bucket);
    return { ok: true };
}

function checkRateLimit(scriptSlug, usernameNormalized, ip) {
    const userKey = `u:${scriptSlug}:${usernameNormalized}`;
    const userCheck = consumeRateLimit(userKey, RATE_LIMIT_MAX_REQUESTS_PER_USER);
    if (!userCheck.ok) {
        return userCheck;
    }

    const ipKey = `ip:${scriptSlug}:${ip || 'unknown'}`;
    const ipCheck = consumeRateLimit(ipKey, RATE_LIMIT_MAX_REQUESTS_PER_IP);
    if (!ipCheck.ok) {
        return ipCheck;
    }

    return { ok: true };
}

async function getUsageCount(scriptId, usernameNormalized) {
    const row = await dbGet(
        'SELECT COUNT(*) AS total FROM cloud_presets WHERE script_id = ? AND username_normalized = ?',
        [scriptId, usernameNormalized]
    );
    return Number(row?.total || 0);
}

async function getGlobalUsageCount(usernameNormalized) {
    const row = await dbGet(
        'SELECT COUNT(*) AS total FROM cloud_presets WHERE username_normalized = ?',
        [usernameNormalized]
    );
    return Number(row?.total || 0);
}

async function validateAndExtractOwner(req, res) {
    try {
        await ensureCloudPresetSchema();
    } catch (err) {
        console.error('[Cloud] Schema ensure failed:', err.message);
        res.status(500).json({ error: 'Cloud schema setup failed' });
        return null;
    }

    const verification = await verifySignedScriptPayload(req.body);
    if (!verification.ok) {
        res.status(verification.status).json({ error: verification.error });
        return null;
    }

    const owner = normalizeUsername(req.body.user, req.body.userid);
    if (!owner) {
        res.status(400).json({ error: 'Invalid username' });
        return null;
    }

    const ip = getClientIp(req);
    const rate = checkRateLimit(verification.scriptRow.slug, owner.normalized, ip);
    if (!rate.ok) {
        res.set('Retry-After', String(rate.retryAfterSeconds || 1));
        res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfterSeconds: rate.retryAfterSeconds || 1,
        });
        return null;
    }

    return { verification, owner, ip };
}

router.post('/save', async (req, res) => {
    try {
        const scope = await validateAndExtractOwner(req, res);
        if (!scope) {
            return;
        }

        const presetName = normalizePresetName(req.body.preset || req.body.name || req.body.presetName);
        if (!presetName) {
            return res.status(400).json({ error: 'Invalid preset name' });
        }

        const encodedData = encodeCloudData(req.body.data);
        if (!encodedData.ok) {
            return res.status(encodedData.status).json({ error: encodedData.error });
        }

        const scriptId = scope.verification.scriptRow.id;
        const username = scope.owner.display;
        const usernameNormalized = scope.owner.normalized;
        const robloxUserId = String(req.body.userid);

        const existing = await dbGet(
            'SELECT id FROM cloud_presets WHERE script_id = ? AND username_normalized = ? AND preset_name = ?',
            [scriptId, usernameNormalized, presetName]
        );

        if (!existing) {
            const usageCount = await getUsageCount(scriptId, usernameNormalized);
            if (usageCount >= MAX_PRESETS_PER_USER) {
                return res.status(429).json({
                    error: `Preset limit reached (${MAX_PRESETS_PER_USER})`,
                    slotsMax: MAX_PRESETS_PER_USER,
                    slotsUsed: usageCount,
                });
            }

            const globalUsage = await getGlobalUsageCount(usernameNormalized);
            if (globalUsage >= MAX_PRESETS_PER_USER_GLOBAL) {
                return res.status(429).json({
                    error: `Global preset limit reached (${MAX_PRESETS_PER_USER_GLOBAL})`,
                    globalSlotsMax: MAX_PRESETS_PER_USER_GLOBAL,
                    globalSlotsUsed: globalUsage,
                });
            }
        }

        if (isMySql()) {
            await dbRun(
                `INSERT INTO cloud_presets (
                    script_id,
                    username,
                    username_normalized,
                    roblox_userid,
                    preset_name,
                    data_json,
                    last_ip,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                    username = VALUES(username),
                    roblox_userid = VALUES(roblox_userid),
                    data_json = VALUES(data_json),
                    last_ip = VALUES(last_ip),
                    updated_at = NOW()`,
                [scriptId, username, usernameNormalized, robloxUserId, presetName, encodedData.encoded, scope.ip]
            );
        } else {
            await dbRun(
                `INSERT INTO cloud_presets (
                    script_id,
                    username,
                    username_normalized,
                    roblox_userid,
                    preset_name,
                    data_json,
                    last_ip,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(script_id, username_normalized, preset_name)
                DO UPDATE SET
                    username = excluded.username,
                    roblox_userid = excluded.roblox_userid,
                    data_json = excluded.data_json,
                    last_ip = excluded.last_ip,
                    updated_at = datetime('now')`,
                [scriptId, username, usernameNormalized, robloxUserId, presetName, encodedData.encoded, scope.ip]
            );
        }

        const usageCount = await getUsageCount(scriptId, usernameNormalized);
        const globalUsage = await getGlobalUsageCount(usernameNormalized);
        return res.json({
            ok: true,
            preset: presetName,
            updated: !!existing,
            slotsUsed: usageCount,
            slotsMax: MAX_PRESETS_PER_USER,
            globalSlotsUsed: globalUsage,
            globalSlotsMax: MAX_PRESETS_PER_USER_GLOBAL,
        });
    } catch (err) {
        console.error('[Cloud] SAVE error:', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
});

router.post('/list', async (req, res) => {
    try {
        const scope = await validateAndExtractOwner(req, res);
        if (!scope) {
            return;
        }

        const rows = await dbAll(
            `SELECT preset_name, created_at, updated_at
             FROM cloud_presets
             WHERE script_id = ? AND username_normalized = ?
             ORDER BY updated_at DESC, preset_name ASC
             LIMIT ?`,
            [scope.verification.scriptRow.id, scope.owner.normalized, MAX_PRESETS_PER_USER]
        );

        return res.json({
            ok: true,
            slotsUsed: rows.length,
            slotsMax: MAX_PRESETS_PER_USER,
            globalSlotsUsed: await getGlobalUsageCount(scope.owner.normalized),
            globalSlotsMax: MAX_PRESETS_PER_USER_GLOBAL,
            presets: rows.map((row) => ({
                name: row.preset_name,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            })),
        });
    } catch (err) {
        console.error('[Cloud] LIST error:', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
});

router.post('/load', async (req, res) => {
    try {
        const scope = await validateAndExtractOwner(req, res);
        if (!scope) {
            return;
        }

        const presetName = normalizePresetName(req.body.preset || req.body.name || req.body.presetName);
        if (!presetName) {
            return res.status(400).json({ error: 'Invalid preset name' });
        }

        const row = await dbGet(
            `SELECT preset_name, data_json, created_at, updated_at
             FROM cloud_presets
             WHERE script_id = ? AND username_normalized = ? AND preset_name = ?`,
            [scope.verification.scriptRow.id, scope.owner.normalized, presetName]
        );

        if (!row) {
            return res.status(404).json({ error: 'Preset not found' });
        }

        const decoded = parseCloudData(row.data_json);
        if (decoded === null && row.data_json !== 'null') {
            return res.status(500).json({ error: 'Corrupted preset payload' });
        }

        return res.json({
            ok: true,
            preset: row.preset_name,
            data: decoded,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
    } catch (err) {
        console.error('[Cloud] LOAD error:', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
});

router.post('/delete', async (req, res) => {
    try {
        const scope = await validateAndExtractOwner(req, res);
        if (!scope) {
            return;
        }

        const presetName = normalizePresetName(req.body.preset || req.body.name || req.body.presetName);
        if (!presetName) {
            return res.status(400).json({ error: 'Invalid preset name' });
        }

        const result = await dbRun(
            'DELETE FROM cloud_presets WHERE script_id = ? AND username_normalized = ? AND preset_name = ?',
            [scope.verification.scriptRow.id, scope.owner.normalized, presetName]
        );

        const usageCount = await getUsageCount(scope.verification.scriptRow.id, scope.owner.normalized);
        return res.json({
            ok: true,
            deleted: (result.changes || 0) > 0,
            slotsUsed: usageCount,
            slotsMax: MAX_PRESETS_PER_USER,
            globalSlotsUsed: await getGlobalUsageCount(scope.owner.normalized),
            globalSlotsMax: MAX_PRESETS_PER_USER_GLOBAL,
        });
    } catch (err) {
        console.error('[Cloud] DELETE error:', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
});

router.post('/quota', async (req, res) => {
    try {
        const scope = await validateAndExtractOwner(req, res);
        if (!scope) {
            return;
        }

        const usageCount = await getUsageCount(scope.verification.scriptRow.id, scope.owner.normalized);
        return res.json({
            ok: true,
            slotsUsed: usageCount,
            slotsMax: MAX_PRESETS_PER_USER,
            globalSlotsUsed: await getGlobalUsageCount(scope.owner.normalized),
            globalSlotsMax: MAX_PRESETS_PER_USER_GLOBAL,
            username: scope.owner.display,
        });
    } catch (err) {
        console.error('[Cloud] QUOTA error:', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
});

module.exports = router;
