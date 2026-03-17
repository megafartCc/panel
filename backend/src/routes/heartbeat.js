const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { dbAll, dbGet, dbRun, getCutoffDateTime, toDbDateTime } = require('../db');

const router = express.Router();
const ACTIVE_SESSION_TIMEOUT_SECONDS = Math.max(3, Number(process.env.SESSION_TIMEOUT_SECONDS) || 10);

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

        const message = `${script}:${userid}:${timestamp}`;
        const expectedHex = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');

        let sigHex = signature;
        if (/[^0-9a-fA-F]/.test(signature)) {
            try {
                sigHex = Buffer.from(signature, 'base64').toString('hex');
            } catch {
                return res.status(401).json({ error: 'Invalid signature format' });
            }
        }

        if (sigHex.length !== expectedHex.length ||
            !crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex'))) {
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

        const message = `${script}:${userid}:${timestamp}`;
        const expectedHex = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');

        let sigHex = signature;
        if (/[^0-9a-fA-F]/.test(signature)) {
            try {
                sigHex = Buffer.from(signature, 'base64').toString('hex');
            } catch {
                return res.status(401).json({ error: 'Invalid signature format' });
            }
        }

        if (sigHex.length !== expectedHex.length ||
            !crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex'))) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const activeCutoff = getCutoffDateTime(ACTIVE_SESSION_TIMEOUT_SECONDS + 5);
        let query = `
            SELECT roblox_user, roblox_userid, server_jobid, place_id, last_heartbeat
            FROM sessions
            WHERE script_id = ?
                AND is_active = 1
                AND last_heartbeat >= ?
        `;
        const params = [scriptRow.id, activeCutoff];
        const normalizedJobId = String(jobid || '').trim();

        if (normalizedJobId !== '') {
            query += ' AND server_jobid = ?';
            params.push(normalizedJobId);
        }

        query += ' ORDER BY last_heartbeat DESC LIMIT 200';

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
                join_url: row && row.place_id && row.server_jobid
                    ? `roblox://placeID=${String(row.place_id)}&gameInstanceId=${String(row.server_jobid)}`
                    : '',
                last_heartbeat: row ? row.last_heartbeat : null,
            });
        }

        res.json({
            ok: true,
            script: String(script),
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

        const message = `${script}:${userid}:${timestamp}`;
        const expectedHex = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');

        let sigHex = signature;
        if (/[^0-9a-fA-F]/.test(signature)) {
            try {
                sigHex = Buffer.from(signature, 'base64').toString('hex');
            } catch {
                return res.status(401).json({ error: 'Invalid signature format' });
            }
        }

        if (sigHex.length !== expectedHex.length ||
            !crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex'))) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const activeCutoff = getCutoffDateTime(ACTIVE_SESSION_TIMEOUT_SECONDS + 5);
        const rows = await dbAll(
            `SELECT roblox_userid, server_jobid
             FROM sessions
             WHERE script_id = ?
                AND is_active = 1
                AND last_heartbeat >= ?`,
            [scriptRow.id, activeCutoff]
        );

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

        const message = `${script}:${userid}:${timestamp}`;
        const expectedHex = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');

        let sigHex = signature;
        if (/[^0-9a-fA-F]/.test(signature)) {
            try {
                sigHex = Buffer.from(signature, 'base64').toString('hex');
            } catch {
                return res.status(401).json({ error: 'Invalid signature format' });
            }
        }

        if (sigHex.length !== expectedHex.length ||
            !crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex'))) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const activeCutoff = getCutoffDateTime(ACTIVE_SESSION_TIMEOUT_SECONDS + 5);
        const rows = await dbAll(
            `SELECT roblox_user, roblox_userid, server_jobid, place_id, last_heartbeat
             FROM sessions
             WHERE script_id = ?
                AND is_active = 1
                AND last_heartbeat >= ?
             ORDER BY last_heartbeat DESC
             LIMIT 600`,
            [scriptRow.id, activeCutoff]
        );

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

            if (!grouped.has(rowJobId)) {
                grouped.set(rowJobId, {
                    jobid: rowJobId,
                    placeid: rowPlaceId,
                    join_url: rowPlaceId !== '' && rowJobId !== ''
                        ? `roblox://placeID=${rowPlaceId}&gameInstanceId=${rowJobId}`
                        : '',
                    users: [],
                    count: 0,
                    last_heartbeat: row && row.last_heartbeat ? row.last_heartbeat : null,
                });
            }

            const bucket = grouped.get(rowJobId);
            bucket.users.push({
                user: rowUser,
                userid: rowUserId,
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
                return String(a && a.jobid || '').localeCompare(String(b && b.jobid || ''));
            });

        res.json({
            ok: true,
            script: String(script),
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
