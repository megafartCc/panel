const express = require('express');
const crypto = require('crypto');
const { dbAll, dbGet, dbRun, toDbDateTime } = require('../db');

const router = express.Router();

const SIGNATURE_WINDOW_SECONDS = Math.max(30, Number(process.env.CHAT_SIGNATURE_WINDOW_SECONDS) || 120);
const CHAT_MAX_MESSAGE_LENGTH = Math.max(16, Number(process.env.CHAT_MAX_MESSAGE_LENGTH) || 240);
const CHAT_DEFAULT_LIMIT = Math.max(5, Number(process.env.CHAT_DEFAULT_LIMIT) || 60);
const CHAT_MAX_LIMIT = Math.max(CHAT_DEFAULT_LIMIT, Number(process.env.CHAT_MAX_LIMIT) || 150);
const CHAT_DEFAULT_ROOM = 'global';
const HMAC_DEBUG = String(process.env.HMAC_DEBUG || '').toLowerCase() === 'true';
const GLOBAL_UILIB_KEYS = [
    process.env.UILIB_CHAT_KEY,
    process.env.PANEL_CUSTOM_KEY,
    process.env.PANEL_KEY,
].filter((v) => typeof v === 'string' && v.trim() !== '');

async function getScriptRow(script) {
    return dbGet('SELECT id, name, slug, hmac_key FROM scripts WHERE slug = ?', [script]);
}

function normalizeSignature(signature, expectedHex) {
    if (typeof signature !== 'string' || !signature) {
        return null;
    }

    let value = signature.trim();
    if (!value) {
        return null;
    }

    if (value.startsWith('0x') || value.startsWith('0X')) {
        value = value.slice(2);
    }

    if (/^[0-9a-fA-F]+$/.test(value)) {
        if (expectedHex && value.length !== expectedHex.length) {
            return null;
        }
        return value.toLowerCase();
    }

    const base64 = value
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const padding = base64.length % 4;
    const padded = padding === 0 ? base64 : `${base64}${'='.repeat(4 - padding)}`;

    try {
        const decoded = Buffer.from(padded, 'base64');
        if (!decoded || decoded.length === 0) {
            return null;
        }

        const decodedAscii = decoded.toString('utf8').trim();
        if (/^[0-9a-fA-F]+$/.test(decodedAscii)) {
            if (expectedHex && decodedAscii.length !== expectedHex.length) {
                return null;
            }
            return decodedAscii.toLowerCase();
        }

        const decodedHex = decoded.toString('hex').toLowerCase();
        if (expectedHex && decodedHex.length !== expectedHex.length) {
            return null;
        }
        return decodedHex;
    } catch {
        return null;
    }
}

function logVerify(route, details) {
    if (!HMAC_DEBUG) {
        return;
    }
    console.log(`[HMAC:${route}]`, JSON.stringify(details));
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
    const candidateKeys = [scriptRow.hmac_key, ...GLOBAL_UILIB_KEYS]
        .filter((v) => typeof v === 'string' && v.trim() !== '');
    const uniqueKeys = Array.from(new Set(candidateKeys));
    if (uniqueKeys.length === 0) {
        return { ok: false, status: 500, error: 'No signing key configured' };
    }
    const expectedByKey = uniqueKeys.map((keyValue) => ({
        source: keyValue === scriptRow.hmac_key ? 'script' : 'global',
        expectedHex: crypto.createHmac('sha256', keyValue).update(message).digest('hex'),
    }));
    const sigHex = normalizeSignature(signature, expectedByKey[0].expectedHex);

    logVerify('chat', {
        script,
        userid: String(userid),
        timestamp: String(timestamp),
        incomingSignature: String(signature),
        computedSignature: expectedByKey[0].expectedHex,
        candidateCount: expectedByKey.length,
        message,
        hasScriptRow: true,
    });

    if (!sigHex) {
        logVerify('chat', { script, userid: String(userid), reason: 'invalid_signature_format' });
        return { ok: false, status: 401, error: 'Invalid signature format' };
    }

    let matched = null;
    for (const candidate of expectedByKey) {
        if (crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(candidate.expectedHex, 'hex'))) {
            matched = candidate;
            break;
        }
    }

    if (!matched) {
        logVerify('chat', {
            script,
            userid: String(userid),
            reason: 'signature_mismatch',
            normalizedIncomingSignature: sigHex,
            computedSignature: expectedByKey[0].expectedHex,
        });
        return { ok: false, status: 401, error: 'Invalid signature' };
    }

    logVerify('chat', {
        script,
        userid: String(userid),
        reason: 'signature_match',
        keySource: matched.source,
    });

    return { ok: true, scriptRow };
}

function normalizeRoom(roomRaw) {
    const room = String(roomRaw || CHAT_DEFAULT_ROOM).trim().toLowerCase();
    if (!room) {
        return CHAT_DEFAULT_ROOM;
    }
    if (!/^[a-z0-9_-]{1,32}$/.test(room)) {
        return CHAT_DEFAULT_ROOM;
    }
    return room;
}

function isTruthyScope(value) {
    if (value === true || value === 1) {
        return true;
    }
    const text = String(value || '').trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'global' || text === 'all' || text === 'shared';
}

function useGlobalScope(payload) {
    return isTruthyScope(payload?.scope)
        || isTruthyScope(payload?.global_scope)
        || isTruthyScope(payload?.shared_scope)
        || isTruthyScope(payload?.global);
}

function normalizeMessage(value) {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }
    const text = String(value).replace(/\r/g, '').trim();
    if (!text) {
        return null;
    }
    if (text.length > CHAT_MAX_MESSAGE_LENGTH) {
        return text.slice(0, CHAT_MAX_MESSAGE_LENGTH);
    }
    return text;
}

function parseDbTimestamp(value) {
    if (value instanceof Date) {
        return value;
    }

    const text = String(value || '').trim();
    if (!text) {
        return new Date();
    }

    const withIso = text.includes('T') ? text : text.replace(' ', 'T');
    const withUtc = withIso.endsWith('Z') ? withIso : `${withIso}Z`;
    const parsed = new Date(withUtc);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed;
    }

    const fallback = new Date(text);
    if (!Number.isNaN(fallback.getTime())) {
        return fallback;
    }

    return new Date();
}

function buildUtcMinus3Label(value) {
    const parsed = parseDbTimestamp(value);
    const shifted = new Date(parsed.getTime() - (3 * 60 * 60 * 1000));
    return shifted.toISOString().slice(11, 19);
}

function mapMessageRow(row) {
    return {
        id: Number(row.id || 0),
        user: row.roblox_user != null ? String(row.roblox_user) : '',
        userid: row.roblox_userid != null ? String(row.roblox_userid) : '',
        message: row.message_content != null ? String(row.message_content) : '',
        room: row.room != null ? String(row.room) : CHAT_DEFAULT_ROOM,
        created_at: row.created_at || null,
        time_utc_minus3: buildUtcMinus3Label(row.created_at),
    };
}

router.post('/send', async (req, res) => {
    try {
        const verification = await verifySignedScriptPayload(req.body);
        if (!verification.ok) {
            return res.status(verification.status).json({ error: verification.error });
        }
        const globalScope = useGlobalScope(req.body);

        const username = String(req.body.user || '').trim();
        const userid = String(req.body.userid || '').trim();
        const message = normalizeMessage(req.body.message || req.body.content || req.body.text);
        const room = normalizeRoom(req.body.room);

        if (!username || !userid || !message) {
            return res.status(400).json({ error: 'Invalid chat payload' });
        }

        const createdAt = toDbDateTime();
        const insertResult = await dbRun(
            `INSERT INTO chat_messages (
                script_id,
                room,
                roblox_user,
                roblox_userid,
                message_content,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [verification.scriptRow.id, room, username, userid, message, createdAt]
        );

        let insertedId = Number(insertResult.insertId || 0);
        if (!insertedId) {
            const fallbackRow = await dbGet(
                `SELECT id
                 FROM chat_messages
                 WHERE script_id = ? AND room = ? AND roblox_userid = ? AND created_at = ?
                 ORDER BY id DESC
                 LIMIT 1`,
                [verification.scriptRow.id, room, userid, createdAt]
            );
            insertedId = Number(fallbackRow?.id || 0);
        }

        return res.json({
            ok: true,
            id: insertedId,
            scope: globalScope ? 'global' : 'script',
            message: {
                id: insertedId,
                user: username,
                userid,
                message,
                room,
                created_at: createdAt,
                time_utc_minus3: buildUtcMinus3Label(createdAt),
            },
        });
    } catch (err) {
        console.error('[Chat] send error:', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
});

router.post('/feed', async (req, res) => {
    try {
        const verification = await verifySignedScriptPayload(req.body);
        if (!verification.ok) {
            return res.status(verification.status).json({ error: verification.error });
        }
        const globalScope = useGlobalScope(req.body);

        const room = normalizeRoom(req.body.room);
        const afterId = Math.max(0, Number.parseInt(req.body.after_id || req.body.afterId || '0', 10) || 0);
        const requestedLimit = Number.parseInt(req.body.limit || '', 10);
        const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : CHAT_DEFAULT_LIMIT, CHAT_MAX_LIMIT));

        let rows = [];
        if (afterId > 0) {
            if (globalScope) {
                rows = await dbAll(
                    `SELECT id, room, roblox_user, roblox_userid, message_content, created_at
                     FROM chat_messages
                     WHERE room = ? AND id > ?
                     ORDER BY id ASC
                     LIMIT ?`,
                    [room, afterId, limit]
                );
            } else {
                rows = await dbAll(
                    `SELECT id, room, roblox_user, roblox_userid, message_content, created_at
                     FROM chat_messages
                     WHERE script_id = ? AND room = ? AND id > ?
                     ORDER BY id ASC
                     LIMIT ?`,
                    [verification.scriptRow.id, room, afterId, limit]
                );
            }
        } else {
            if (globalScope) {
                rows = await dbAll(
                    `SELECT id, room, roblox_user, roblox_userid, message_content, created_at
                     FROM chat_messages
                     WHERE room = ?
                     ORDER BY id DESC
                     LIMIT ?`,
                    [room, limit]
                );
            } else {
                rows = await dbAll(
                    `SELECT id, room, roblox_user, roblox_userid, message_content, created_at
                     FROM chat_messages
                     WHERE script_id = ? AND room = ?
                     ORDER BY id DESC
                     LIMIT ?`,
                    [verification.scriptRow.id, room, limit]
                );
            }
            rows.reverse();
        }

        const messages = rows.map(mapMessageRow);
        const lastId = messages.length > 0 ? Number(messages[messages.length - 1].id || afterId) : afterId;

        return res.json({
            ok: true,
            room,
            scope: globalScope ? 'global' : 'script',
            count: messages.length,
            last_id: lastId,
            messages,
        });
    } catch (err) {
        console.error('[Chat] feed error:', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
});

module.exports = router;
