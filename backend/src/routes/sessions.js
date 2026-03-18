const express = require('express');
const { dbAll, dbGet, getCutoffDateTime, isMySql } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const ACTIVE_SESSION_TIMEOUT_SECONDS = Math.max(1, Number(process.env.SESSION_TIMEOUT_SECONDS) || 10);

router.use(authMiddleware);

router.get('/', async (req, res) => {
    try {
        const { script, limit = 100, offset = 0 } = req.query;
        const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 100, 500));
        const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
        const activeCutoff = getCutoffDateTime(ACTIVE_SESSION_TIMEOUT_SECONDS);

        let sessionsSql = `
            SELECT sess.*, s.name AS script_name, s.slug AS script_slug
            FROM sessions sess
            JOIN scripts s ON sess.script_id = s.id
            WHERE sess.is_active = 1
                AND sess.last_heartbeat >= ?
        `;
        const sessionsParams = [activeCutoff];

        if (script) {
            sessionsSql += ' AND s.slug = ?';
            sessionsParams.push(String(script));
        }

        sessionsSql += `
            ORDER BY sess.last_heartbeat DESC
            LIMIT ? OFFSET ?
        `;
        sessionsParams.push(safeLimit, safeOffset);

        const sessions = await dbAll(sessionsSql, sessionsParams);
        const totalRow = await dbGet(
            'SELECT COUNT(*) AS count FROM sessions WHERE is_active = 1 AND last_heartbeat >= ?',
            [activeCutoff]
        );

        res.json({
            sessions,
            total: Number(totalRow?.count || 0),
        });
    } catch (err) {
        console.error('[Sessions] List error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const activeCutoff = getCutoffDateTime(ACTIVE_SESSION_TIMEOUT_SECONDS);
        const dayCutoff = getCutoffDateTime(24 * 60 * 60);

        const totalActiveRow = await dbGet(
            'SELECT COUNT(*) AS count FROM sessions WHERE is_active = 1 AND last_heartbeat >= ?',
            [activeCutoff]
        );

        const perScript = await dbAll(`
            SELECT s.name, s.slug, COUNT(sess.id) AS active_users
            FROM scripts s
            LEFT JOIN sessions sess
                ON sess.script_id = s.id
                AND sess.is_active = 1
                AND sess.last_heartbeat >= ?
            GROUP BY s.id, s.name, s.slug
            ORDER BY active_users DESC
        `, [activeCutoff]);

        const totalSessionsRow = await dbGet('SELECT COUNT(*) AS count FROM sessions');
        const uniqueUsersRow = await dbGet('SELECT COUNT(DISTINCT roblox_userid) AS count FROM sessions');
        const last24hRow = await dbGet('SELECT COUNT(*) AS count FROM sessions WHERE first_seen >= ?', [dayCutoff]);
        const returningConnectionsRow = await dbGet(`
            SELECT COALESCE(SUM(repeat_runs), 0) AS count
            FROM (
                SELECT CASE
                    WHEN COUNT(*) > 1 THEN COUNT(*) - 1
                    ELSE 0
                END AS repeat_runs
                FROM sessions
                GROUP BY script_id, roblox_userid
            ) grouped_runs
        `);
        const returningUsersRow = await dbGet(`
            SELECT COUNT(*) AS count
            FROM (
                SELECT roblox_userid
                FROM sessions
                GROUP BY roblox_userid
                HAVING COUNT(*) >= 2
            ) grouped_users
        `);

        const hourlySql = isMySql()
            ? `
                SELECT
                    DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') AS hour,
                    COUNT(DISTINCT session_id) AS users
                FROM heartbeat_log
                WHERE timestamp >= ?
                GROUP BY DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00')
                ORDER BY hour ASC
            `
            : `
                SELECT
                    strftime('%Y-%m-%d %H:00:00', timestamp) AS hour,
                    COUNT(DISTINCT session_id) AS users
                FROM heartbeat_log
                WHERE timestamp >= ?
                GROUP BY strftime('%Y-%m-%d %H:00:00', timestamp)
                ORDER BY hour ASC
            `;

        const heartbeatAggRows = await dbAll(hourlySql, [dayCutoff]);
        const hourlyActivity = heartbeatAggRows.map((row) => ({
            hour: String(row.hour || '').replace(' ', 'T'),
            users: Number(row.users || 0),
        }));

        res.json({
            totalActive: Number(totalActiveRow?.count || 0),
            perScript,
            totalSessions: Number(totalSessionsRow?.count || 0),
            uniqueUsers: Number(uniqueUsersRow?.count || 0),
            last24h: Number(last24hRow?.count || 0),
            returningConnections: Number(returningConnectionsRow?.count || 0),
            returningUsers: Number(returningUsersRow?.count || 0),
            hourlyActivity,
        });
    } catch (err) {
        console.error('[Sessions] Stats error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/recent', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const recent = await dbAll(`
            SELECT
                sess.id,
                sess.roblox_user,
                sess.roblox_userid,
                sess.executor,
                sess.server_jobid,
                sess.first_seen,
                sess.last_heartbeat,
                sess.is_active,
                s.name AS script_name,
                s.slug AS script_slug
            FROM sessions sess
            JOIN scripts s ON sess.script_id = s.id
            ORDER BY sess.last_heartbeat DESC
            LIMIT ?
        `, [limit]);

        res.json(recent);
    } catch (err) {
        console.error('[Sessions] Recent error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
