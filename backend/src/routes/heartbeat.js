const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { dbGet, dbRun, toDbDateTime } = require('../db');

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { script, user, userid, executor, jobid, timestamp, signature } = req.body;

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

        const existing = await dbGet(
            'SELECT id FROM sessions WHERE script_id = ? AND roblox_userid = ? AND is_active = 1',
            [scriptRow.id, String(userid)]
        );

        let sessionId;
        if (existing) {
            sessionId = existing.id;
            await dbRun(
                'UPDATE sessions SET last_heartbeat = ?, executor = ?, server_jobid = ?, ip_address = ? WHERE id = ?',
                [nowIso, executor || 'Unknown', jobid || '', String(ip), sessionId]
            );
        } else {
            sessionId = uuidv4();
            await dbRun(
                `INSERT INTO sessions (
                    id, script_id, roblox_user, roblox_userid, executor, server_jobid, ip_address, first_seen, last_heartbeat, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [sessionId, scriptRow.id, String(user), String(userid), executor || 'Unknown', jobid || '', String(ip), nowIso, nowIso]
            );
        }

        await dbRun('INSERT INTO heartbeat_log (session_id, timestamp) VALUES (?, ?)', [sessionId, nowIso]);
        res.json({ ok: true, sessionId });
    } catch (err) {
        console.error('[Heartbeat] Error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

module.exports = router;
