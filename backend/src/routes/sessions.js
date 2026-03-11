const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const ACTIVE_SESSION_TIMEOUT_SECONDS = Math.max(1, Number(process.env.SESSION_TIMEOUT_SECONDS) || 10);
const ACTIVE_WINDOW_SQL = `-${ACTIVE_SESSION_TIMEOUT_SECONDS} seconds`;

router.use(authMiddleware);

// GET /api/sessions — list active sessions, optionally filtered by script slug
router.get('/', (req, res) => {
    const db = getDb();
    const { script, limit = 100, offset = 0 } = req.query;

    let query, params;

    if (script) {
        query = `
      SELECT sess.*, s.name as script_name, s.slug as script_slug
      FROM sessions sess
      JOIN scripts s ON sess.script_id = s.id
      WHERE sess.is_active = 1 AND sess.last_heartbeat >= datetime('now', ?) AND s.slug = ?
      ORDER BY sess.last_heartbeat DESC
      LIMIT ? OFFSET ?
    `;
        params = [ACTIVE_WINDOW_SQL, script, parseInt(limit), parseInt(offset)];
    } else {
        query = `
      SELECT sess.*, s.name as script_name, s.slug as script_slug
      FROM sessions sess
      JOIN scripts s ON sess.script_id = s.id
      WHERE sess.is_active = 1 AND sess.last_heartbeat >= datetime('now', ?)
      ORDER BY sess.last_heartbeat DESC
      LIMIT ? OFFSET ?
    `;
        params = [ACTIVE_WINDOW_SQL, parseInt(limit), parseInt(offset)];
    }

    const sessions = db.prepare(query).all(...params);
    const total = db.prepare(
        "SELECT COUNT(*) as count FROM sessions WHERE is_active = 1 AND last_heartbeat >= datetime('now', ?)"
    ).get(ACTIVE_WINDOW_SQL).count;

    res.json({ sessions, total });
});

// GET /api/sessions/stats — aggregated statistics
router.get('/stats', (req, res) => {
    const db = getDb();

    const totalActive = db.prepare(
        "SELECT COUNT(*) as count FROM sessions WHERE is_active = 1 AND last_heartbeat >= datetime('now', ?)"
    ).get(ACTIVE_WINDOW_SQL).count;

    const perScript = db.prepare(`
    SELECT s.name, s.slug, COUNT(sess.id) as active_users
    FROM scripts s
    LEFT JOIN sessions sess ON sess.script_id = s.id AND sess.is_active = 1 AND sess.last_heartbeat >= datetime('now', ?)
    GROUP BY s.id
    ORDER BY active_users DESC
  `).all(ACTIVE_WINDOW_SQL);

    const totalSessions = db.prepare(
        'SELECT COUNT(*) as count FROM sessions'
    ).get().count;

    // Unique users (by roblox_userid)
    const uniqueUsers = db.prepare(
        'SELECT COUNT(DISTINCT roblox_userid) as count FROM sessions'
    ).get().count;

    // Sessions in last 24h
    const last24h = db.prepare(
        "SELECT COUNT(*) as count FROM sessions WHERE first_seen >= datetime('now', '-24 hours')"
    ).get().count;

    // Hourly activity for chart (last 24 hours)
    const hourlyActivity = db.prepare(`
    SELECT 
      strftime('%Y-%m-%dT%H:00:00', timestamp) as hour,
      COUNT(DISTINCT session_id) as users
    FROM heartbeat_log
    WHERE timestamp >= datetime('now', '-24 hours')
    GROUP BY hour
    ORDER BY hour ASC
  `).all();

    res.json({
        totalActive,
        perScript,
        totalSessions,
        uniqueUsers,
        last24h,
        hourlyActivity
    });
});

// GET /api/sessions/recent — recent join/leave log
router.get('/recent', (req, res) => {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const recent = db.prepare(`
    SELECT sess.id, sess.roblox_user, sess.roblox_userid, sess.executor,
           sess.server_jobid, sess.first_seen, sess.last_heartbeat, sess.is_active,
           s.name as script_name, s.slug as script_slug
    FROM sessions sess
    JOIN scripts s ON sess.script_id = s.id
    ORDER BY sess.last_heartbeat DESC
    LIMIT ?
  `).all(limit);

    res.json(recent);
});

module.exports = router;
