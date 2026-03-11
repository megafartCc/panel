const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const router = express.Router();

function toSqliteDateTime(date = new Date()) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

// POST /api/heartbeat — called by Lua scripts every 10s
router.post('/', (req, res) => {
    try {
        const { script, user, userid, executor, jobid, timestamp, signature } = req.body;

        if (!script || !user || !userid || !timestamp || !signature) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        // Timestamp check (120s window)
        const now = Math.floor(Date.now() / 1000);
        const ts = parseInt(timestamp, 10);
        if (isNaN(ts) || Math.abs(now - ts) > 120) {
            return res.status(400).json({ error: 'Invalid timestamp' });
        }

        // Look up script
        const db = getDb();
        const scriptRow = db.prepare('SELECT id, hmac_key, name, slug FROM scripts WHERE slug = ?').get(script);
        if (!scriptRow) {
            return res.status(404).json({ error: 'Script not found' });
        }

        // Verify HMAC — executors may send hex OR base64
        const message = `${script}:${userid}:${timestamp}`;
        const expectedHex = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');

        // Convert incoming signature to hex (might be base64 or hex already)
        let sigHex = signature;
        if (/[^0-9a-fA-F]/.test(signature)) {
            // Not hex — assume base64, convert to hex
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
        const nowIso = toSqliteDateTime();

        // Find existing active session for this user + script
        const existing = db.prepare(
            'SELECT id FROM sessions WHERE script_id = ? AND roblox_userid = ? AND is_active = 1'
        ).get(scriptRow.id, String(userid));

        let sessionId;

        if (existing) {
            sessionId = existing.id;
            db.prepare('UPDATE sessions SET last_heartbeat = ?, executor = ?, server_jobid = ?, ip_address = ? WHERE id = ?')
                .run(nowIso, executor || 'Unknown', jobid || '', ip, sessionId);
        } else {
            sessionId = uuidv4();
            db.prepare(
                `INSERT INTO sessions (id, script_id, roblox_user, roblox_userid, executor, server_jobid, ip_address, first_seen, last_heartbeat, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
            ).run(sessionId, scriptRow.id, user, String(userid), executor || 'Unknown', jobid || '', ip, nowIso, nowIso);
        }

        // Log heartbeat
        db.prepare('INSERT INTO heartbeat_log (session_id, timestamp) VALUES (?, ?)').run(sessionId, nowIso);

        res.json({ ok: true, sessionId });
    } catch (err) {
        console.error('[Heartbeat] Error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

module.exports = router;
