const { getDb } = require('./db');
const ACTIVE_SESSION_TIMEOUT_SECONDS = Math.max(1, Number(process.env.SESSION_TIMEOUT_SECONDS) || 10);
const FINDER_RETENTION_SECONDS = Math.max(60, Number(process.env.FINDER_RETENTION_SECONDS) || 600);

// ============================================
// Simple approach: Lua scripts POST heartbeat
// Frontend polls /api/sessions every few sec
// No WebSocket needed for Lua clients
// Dashboard WS is optional — we keep it minimal
// ============================================

// Stale session cleanup — runs every 10s
function startCleanupTimer() {
    setInterval(() => {
        try {
            const db = getDb();
            const stale = db.prepare(`
                UPDATE sessions SET is_active = 0
                WHERE is_active = 1 AND datetime(replace(substr(last_heartbeat, 1, 19), 'T', ' ')) < datetime('now', ?)
            `).run(`-${ACTIVE_SESSION_TIMEOUT_SECONDS} seconds`);
            if (stale.changes > 0) {
                console.log(`[Cleanup] Marked ${stale.changes} stale sessions inactive`);
            }

            const staleFinder = db.prepare(`
                DELETE FROM finder_reports
                WHERE datetime(replace(substr(discovered_at, 1, 19), 'T', ' ')) < datetime('now', ?)
            `).run(`-${FINDER_RETENTION_SECONDS} seconds`);
            if (staleFinder.changes > 0) {
                console.log(`[Cleanup] Pruned ${staleFinder.changes} stale finder rows`);
            }
        } catch (err) {
            console.error('[Cleanup] Error:', err.message);
        }
    }, 5000);
}

function init() {
    startCleanupTimer();
    console.log(`[Server] Cleanup timer started (5s interval, ${ACTIVE_SESSION_TIMEOUT_SECONDS}s timeout)`);
}

module.exports = { init };
