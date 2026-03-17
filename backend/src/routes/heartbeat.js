const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { dbAll, dbGet, dbRun, getCutoffDateTime, toDbDateTime } = require('../db');

const router = express.Router();
const ACTIVE_SESSION_TIMEOUT_SECONDS = Math.max(3, Number(process.env.SESSION_TIMEOUT_SECONDS) || 10);
const HMAC_DEBUG = String(process.env.HMAC_DEBUG || '').toLowerCase() === 'true';
const GLOBAL_UILIB_KEYS = [
    process.env.UILIB_CHAT_KEY,
    process.env.PANEL_CUSTOM_KEY,
    process.env.PANEL_KEY,
].filter((v) => typeof v === 'string' && v.trim() !== '');

function logVerify(route, details) {
    if (!HMAC_DEBUG) {
        return;
    }
    console.log(`[HMAC:${route}]`, JSON.stringify(details));
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

function validateSignedRequest({ route, script, userid, timestamp, signature, hmacKey }) {
    const message = `${script}:${userid}:${timestamp}`;
    const candidateKeys = [hmacKey, ...GLOBAL_UILIB_KEYS]
        .filter((v) => typeof v === 'string' && v.trim() !== '');
    const uniqueKeys = Array.from(new Set(candidateKeys));

    if (uniqueKeys.length === 0) {
        return { ok: false, reason: 'missing_key' };
    }

    const expectedByKey = uniqueKeys.map((keyValue) => ({
        source: keyValue === hmacKey ? 'script' : 'global',
        expectedHex: crypto.createHmac('sha256', keyValue).update(message).digest('hex'),
    }));
    const sigHex = normalizeSignature(signature, expectedByKey[0].expectedHex);

    logVerify(route, {
        script,
        userid: String(userid),
        timestamp: String(timestamp),
        incomingSignature: String(signature),
        computedSignature: expectedByKey[0].expectedHex,
        candidateCount: expectedByKey.length,
        message,
    });

    if (!sigHex) {
        logVerify(route, {
            script,
            userid: String(userid),
            reason: 'invalid_signature_format',
        });
        return { ok: false, reason: 'format' };
    }

    let matched = null;
    for (const candidate of expectedByKey) {
        if (crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(candidate.expectedHex, 'hex'))) {
            matched = candidate;
            break;
        }
    }

    if (!matched) {
        logVerify(route, {
            script,
            userid: String(userid),
            reason: 'signature_mismatch',
            normalizedIncomingSignature: sigHex,
            computedSignature: expectedByKey[0].expectedHex,
        });
        return { ok: false, reason: 'mismatch' };
    }

    logVerify(route, {
        script,
        userid: String(userid),
        reason: 'signature_match',
        keySource: matched.source,
    });

    return { ok: true };
}

function isTruthyScope(value) {
    if (value === true || value === 1) {
        return true;
    }
    const text = String(value || '').trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'global' || text === 'all' || text === 'shared';
}

function useGlobalScope(body) {
    return isTruthyScope(body?.scope)
        || isTruthyScope(body?.global_scope)
        || isTruthyScope(body?.shared_scope)
        || isTruthyScope(body?.global);
}

router.post('/', async (req, res) => {
    try {
        const body = req.body || {};
        const script = String(body.script || body.slug || body.script_slug || '').trim();
        const { user, userid, executor, jobid, placeid, timestamp, signature } = body;

        if (!script || !user || !userid || !timestamp || !signature) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const ts = parseInt(timestamp, 10);
        if (Number.isNaN(ts) || Math.abs(nowSeconds - ts) > 120) {
            return res.status(400).json({ error: 'Invalid timestamp' });
        }

        const scriptRow = await dbGet('SELECT id, hmac_key, name, slug FROM scripts WHERE slug = ?', [script]);
        if (!scriptRow) {
            return res.status(404).json({ error: 'Script not found' });
        }

        const signatureCheck = validateSignedRequest({
            route: 'heartbeat',
            script,
            userid,
            timestamp,
            signature,
            hmacKey: scriptRow.hmac_key,
        });
        if (!signatureCheck.ok) {
            if (signatureCheck.reason === 'format') {
                return res.status(401).json({ error: 'Invalid signature format' });
            }
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const nowIso = toDbDateTime();
        const normalizedPlaceId = String(placeid || '').trim();

        const existing = await dbGet(
            'SELECT id FROM sessions WHERE script_id = ? AND roblox_userid = ? AND is_active = 1',
            [scriptRow.id, String(userid)]
        );

        let sessionId;
        if (existing) {
            sessionId = existing.id;
            await dbRun(
                'UPDATE sessions SET last_heartbeat = ?, executor = ?, server_jobid = ?, place_id = ?, ip_address = ? WHERE id = ?',
                [nowIso, executor || 'Unknown', jobid || '', normalizedPlaceId, String(ip), sessionId]
            );
        } else {
            sessionId = uuidv4();
            await dbRun(
                `INSERT INTO sessions (
                    id, script_id, roblox_user, roblox_userid, executor, server_jobid, place_id, ip_address, first_seen, last_heartbeat, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [sessionId, scriptRow.id, String(user), String(userid), executor || 'Unknown', jobid || '', normalizedPlaceId, String(ip), nowIso, nowIso]
            );
        }

        await dbRun('INSERT INTO heartbeat_log (session_id, timestamp) VALUES (?, ?)', [sessionId, nowIso]);
        res.json({ ok: true, sessionId });
    } catch (err) {
        console.error('[Heartbeat] Error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

router.post('/peers', async (req, res) => {
    try {
        const body = req.body || {};
        const script = String(body.script || body.slug || body.script_slug || '').trim();
        const { userid, jobid, timestamp, signature, include_self: includeSelfRaw, includeSelf } = body;
        const globalScope = useGlobalScope(body);

        if (!script || !userid || !timestamp || !signature) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const ts = parseInt(timestamp, 10);
        if (Number.isNaN(ts) || Math.abs(nowSeconds - ts) > 120) {
            return res.status(400).json({ error: 'Invalid timestamp' });
        }

        const scriptRow = await dbGet('SELECT id, hmac_key FROM scripts WHERE slug = ?', [script]);
        if (!scriptRow) {
            return res.status(404).json({ error: 'Script not found' });
        }

        const signatureCheck = validateSignedRequest({
            route: 'heartbeat_peers',
            script,
            userid,
            timestamp,
            signature,
            hmacKey: scriptRow.hmac_key,
        });
        if (!signatureCheck.ok) {
            if (signatureCheck.reason === 'format') {
                return res.status(401).json({ error: 'Invalid signature format' });
            }
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const activeCutoff = getCutoffDateTime(ACTIVE_SESSION_TIMEOUT_SECONDS + 5);
        let query = `
            SELECT
                s.roblox_user,
                s.roblox_userid,
                s.server_jobid,
                s.place_id,
                s.last_heartbeat,
                sc.slug AS script_slug,
                sc.name AS script_name
            FROM sessions s
            LEFT JOIN scripts sc ON sc.id = s.script_id
            WHERE s.is_active = 1
                AND s.last_heartbeat >= ?
        `;
        const params = [activeCutoff];
        if (!globalScope) {
            query += ' AND s.script_id = ?';
            params.push(scriptRow.id);
        }
        const normalizedJobId = String(jobid || '').trim();

        if (normalizedJobId !== '') {
            query += ' AND s.server_jobid = ?';
            params.push(normalizedJobId);
        }

        query += ' ORDER BY s.last_heartbeat DESC LIMIT 200';

        const rows = await dbAll(query, params);
        const requesterId = String(userid);
        const allowSelf = includeSelfRaw === true || includeSelf === true || String(includeSelfRaw || includeSelf || '').toLowerCase() === 'true';
        const users = [];
        const seen = new Set();

        for (const row of rows) {
            const rowUser = row && row.roblox_user != null ? String(row.roblox_user) : '';
            const rowUserId = row && row.roblox_userid != null ? String(row.roblox_userid) : '';

            if (!allowSelf && rowUserId === requesterId) {
                continue;
            }

            const dedupeKey = rowUserId !== '' ? rowUserId : `name:${rowUser.toLowerCase()}`;
            if (seen.has(dedupeKey)) {
                continue;
            }
            seen.add(dedupeKey);

            users.push({
                user: rowUser,
                userid: rowUserId,
                jobid: row && row.server_jobid != null ? String(row.server_jobid) : '',
                placeid: row && row.place_id != null ? String(row.place_id) : '',
                script_slug: row && row.script_slug != null ? String(row.script_slug) : '',
                script_name: row && row.script_name != null ? String(row.script_name) : '',
                game: row && row.script_name != null && String(row.script_name).trim() !== ''
                    ? String(row.script_name)
                    : (row && row.script_slug != null ? String(row.script_slug) : ''),
                join_url: row && row.place_id && row.server_jobid
                    ? `roblox://placeID=${String(row.place_id)}&gameInstanceId=${String(row.server_jobid)}`
                    : '',
                last_heartbeat: row ? row.last_heartbeat : null,
            });
        }

        res.json({
            ok: true,
            script: String(script),
            scope: globalScope ? 'global' : 'script',
            jobid: normalizedJobId,
            count: users.length,
            users,
        });
    } catch (err) {
        console.error('[Heartbeat] peers error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

router.post('/connections', async (req, res) => {
    try {
        const body = req.body || {};
        const script = String(body.script || body.slug || body.script_slug || '').trim();
        const { userid, jobid, timestamp, signature, include_self: includeSelfRaw, includeSelf } = body;
        const globalScope = useGlobalScope(body);

        if (!script || !userid || !timestamp || !signature) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const ts = parseInt(timestamp, 10);
        if (Number.isNaN(ts) || Math.abs(nowSeconds - ts) > 120) {
            return res.status(400).json({ error: 'Invalid timestamp' });
        }

        const scriptRow = await dbGet('SELECT id, hmac_key FROM scripts WHERE slug = ?', [script]);
        if (!scriptRow) {
            return res.status(404).json({ error: 'Script not found' });
        }

        const signatureCheck = validateSignedRequest({
            route: 'heartbeat_connections',
            script,
            userid,
            timestamp,
            signature,
            hmacKey: scriptRow.hmac_key,
        });
        if (!signatureCheck.ok) {
            if (signatureCheck.reason === 'format') {
                return res.status(401).json({ error: 'Invalid signature format' });
            }
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const activeCutoff = getCutoffDateTime(ACTIVE_SESSION_TIMEOUT_SECONDS + 5);
        let connectionsSql = `
            SELECT roblox_userid, server_jobid
            FROM sessions
            WHERE is_active = 1
                AND last_heartbeat >= ?
        `;
        const connectionsParams = [activeCutoff];
        if (!globalScope) {
            connectionsSql += ' AND script_id = ?';
            connectionsParams.push(scriptRow.id);
        }
        const rows = await dbAll(connectionsSql, connectionsParams);

        const requesterId = String(userid);
        const normalizedJobId = String(jobid || '').trim();
        const allowSelf = includeSelfRaw !== false
            && includeSelf !== false
            && String(includeSelfRaw || includeSelf || '').toLowerCase() !== 'false';

        const seenUsers = new Set();
        const uniqueServers = new Set();
        let currentServerActive = 0;

        for (const row of rows) {
            const rowUserId = row && row.roblox_userid != null ? String(row.roblox_userid) : '';
            if (rowUserId === '') {
                continue;
            }
            if (!allowSelf && rowUserId === requesterId) {
                continue;
            }
            if (seenUsers.has(rowUserId)) {
                continue;
            }
            seenUsers.add(rowUserId);

            const serverJobId = row && row.server_jobid != null ? String(row.server_jobid).trim() : '';
            if (serverJobId !== '') {
                uniqueServers.add(serverJobId);
                if (normalizedJobId !== '' && serverJobId === normalizedJobId) {
                    currentServerActive += 1;
                }
            }
        }

        res.json({
            ok: true,
            script: String(script),
            scope: globalScope ? 'global' : 'script',
            total_active: seenUsers.size,
            total_servers: uniqueServers.size,
            current_server_active: currentServerActive,
        });
    } catch (err) {
        console.error('[Heartbeat] connections error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

router.post('/servers', async (req, res) => {
    try {
        const body = req.body || {};
        const script = String(body.script || body.slug || body.script_slug || '').trim();
        const { userid, timestamp, signature, include_self: includeSelfRaw, includeSelf } = body;
        const globalScope = useGlobalScope(body);

        if (!script || !userid || !timestamp || !signature) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const ts = parseInt(timestamp, 10);
        if (Number.isNaN(ts) || Math.abs(nowSeconds - ts) > 120) {
            return res.status(400).json({ error: 'Invalid timestamp' });
        }

        const scriptRow = await dbGet('SELECT id, hmac_key FROM scripts WHERE slug = ?', [script]);
        if (!scriptRow) {
            return res.status(404).json({ error: 'Script not found' });
        }

        const signatureCheck = validateSignedRequest({
            route: 'heartbeat_servers',
            script,
            userid,
            timestamp,
            signature,
            hmacKey: scriptRow.hmac_key,
        });
        if (!signatureCheck.ok) {
            if (signatureCheck.reason === 'format') {
                return res.status(401).json({ error: 'Invalid signature format' });
            }
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const activeCutoff = getCutoffDateTime(ACTIVE_SESSION_TIMEOUT_SECONDS + 5);
        let serversSql = `
            SELECT
                s.roblox_user,
                s.roblox_userid,
                s.server_jobid,
                s.place_id,
                s.last_heartbeat,
                sc.slug AS script_slug,
                sc.name AS script_name
            FROM sessions s
            LEFT JOIN scripts sc ON sc.id = s.script_id
            WHERE s.is_active = 1
                AND s.last_heartbeat >= ?
        `;
        const serversParams = [activeCutoff];
        if (!globalScope) {
            serversSql += ' AND s.script_id = ?';
            serversParams.push(scriptRow.id);
        }
        serversSql += ' ORDER BY s.last_heartbeat DESC LIMIT 600';
        const rows = await dbAll(serversSql, serversParams);

        const requesterId = String(userid);
        const allowSelf = includeSelfRaw !== false
            && includeSelf !== false
            && String(includeSelfRaw || includeSelf || '').toLowerCase() !== 'false';

        const grouped = new Map();
        const globalSeen = new Set();

        for (const row of rows) {
            const rowUser = row && row.roblox_user != null ? String(row.roblox_user) : '';
            const rowUserId = row && row.roblox_userid != null ? String(row.roblox_userid) : '';
            const rowJobId = row && row.server_jobid != null ? String(row.server_jobid).trim() : '';
            const rowPlaceId = row && row.place_id != null ? String(row.place_id).trim() : '';
            const rowScriptSlug = row && row.script_slug != null ? String(row.script_slug).trim() : '';
            const rowScriptName = row && row.script_name != null ? String(row.script_name).trim() : '';
            const rowGameName = rowScriptName || rowScriptSlug || (rowPlaceId !== '' ? `Place ${rowPlaceId}` : '');

            if (rowJobId === '' || rowUserId === '') {
                continue;
            }
            if (!allowSelf && rowUserId === requesterId) {
                continue;
            }
            if (globalSeen.has(rowUserId)) {
                continue;
            }
            globalSeen.add(rowUserId);

            const groupKey = `${rowJobId}|${rowPlaceId}|${rowScriptSlug}`;

            if (!grouped.has(groupKey)) {
                grouped.set(groupKey, {
                    jobid: rowJobId,
                    placeid: rowPlaceId,
                    script_slug: rowScriptSlug,
                    script_name: rowScriptName,
                    game: rowGameName,
                    join_url: rowPlaceId !== '' && rowJobId !== ''
                        ? `roblox://placeID=${rowPlaceId}&gameInstanceId=${rowJobId}`
                        : '',
                    users: [],
                    count: 0,
                    last_heartbeat: row && row.last_heartbeat ? row.last_heartbeat : null,
                });
            }

            const bucket = grouped.get(groupKey);
            bucket.users.push({
                user: rowUser,
                userid: rowUserId,
                script_slug: rowScriptSlug,
                script_name: rowScriptName,
                game: rowGameName,
                last_heartbeat: row && row.last_heartbeat ? row.last_heartbeat : null,
            });
            bucket.count += 1;
        }

        const servers = Array.from(grouped.values())
            .sort((a, b) => {
                const countA = Number(a && a.count) || 0;
                const countB = Number(b && b.count) || 0;
                if (countA !== countB) {
                    return countB - countA;
                }
                const gameA = String(a && a.game || '');
                const gameB = String(b && b.game || '');
                if (gameA !== gameB) {
                    return gameA.localeCompare(gameB);
                }
                return String(a && a.jobid || '').localeCompare(String(b && b.jobid || ''));
            });

        res.json({
            ok: true,
            script: String(script),
            scope: globalScope ? 'global' : 'script',
            total_servers: servers.length,
            total_users: globalSeen.size,
            servers,
        });
    } catch (err) {
        console.error('[Heartbeat] servers error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

module.exports = router;
