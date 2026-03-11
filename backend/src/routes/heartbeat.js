const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { verifyHmac } = require('../middleware/hmac');

const router = express.Router();

// POST /api/heartbeat
router.post('/', verifyHmac, (req, res) => {
    const { user, userid, executor, jobid } = req.body;
    const scriptRow = req.scriptRow;
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    // Validate fields
    if (!user || !userid) {
        return res.status(400).json({ error: 'Missing user or userid' });
    }

    if (typeof user !== 'string' || user.length > 64) {
        return res.status(400).json({ error: 'Invalid user field' });
    }

    const db = getDb();

    // Find existing active session for this user + script
    const existingSession = db.prepare(
        'SELECT id FROM sessions WHERE script_id = ? AND roblox_userid = ? AND is_active = 1'
    ).get(scriptRow.id, String(userid));

    let sessionId;
    const now = new Date().toISOString();

    if (existingSession) {
        sessionId = existingSession.id;
        db.prepare(
            'UPDATE sessions SET last_heartbeat = ?, executor = ?, server_jobid = ?, ip_address = ? WHERE id = ?'
        ).run(now, executor || 'Unknown', jobid || '', ip, sessionId);
    } else {
        sessionId = uuidv4();
        db.prepare(
            `INSERT INTO sessions (id, script_id, roblox_user, roblox_userid, executor, server_jobid, ip_address, first_seen, last_heartbeat, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        ).run(sessionId, scriptRow.id, user, String(userid), executor || 'Unknown', jobid || '', ip, now, now);
    }

    // Log heartbeat
    db.prepare('INSERT INTO heartbeat_log (session_id, timestamp) VALUES (?, ?)').run(sessionId, now);

    // Broadcast via WebSocket
    const { broadcast } = require('../ws');
    const eventType = existingSession ? 'session:heartbeat' : 'session:join';

    // Get the script slug for the broadcast
    const scriptInfo = db.prepare('SELECT slug, name FROM scripts WHERE id = ?').get(scriptRow.id);

    broadcast({
        type: eventType,
        data: {
            sessionId,
            script: scriptInfo?.slug || 'unknown',
            scriptName: scriptInfo?.name || 'Unknown',
            user,
            userid: String(userid),
            executor: executor || 'Unknown',
            jobid: jobid || '',
            timestamp: now
        }
    });

    res.json({ ok: true, sessionId });
});

module.exports = router;
