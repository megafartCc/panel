const { dbRun, getCutoffDateTime } = require('./db');

const ACTIVE_SESSION_TIMEOUT_SECONDS = Math.max(1, Number(process.env.SESSION_TIMEOUT_SECONDS) || 10);
const FINDER_RETENTION_SECONDS = Math.max(60, Number(process.env.FINDER_RETENTION_SECONDS) || 600);

function startCleanupTimer() {
    setInterval(async () => {
        try {
            const staleCutoff = getCutoffDateTime(ACTIVE_SESSION_TIMEOUT_SECONDS);
            const stale = await dbRun(
                'UPDATE sessions SET is_active = 0 WHERE is_active = 1 AND last_heartbeat < ?',
                [staleCutoff]
            );
            if (stale.changes > 0) {
                console.log(`[Cleanup] Marked ${stale.changes} stale sessions inactive`);
            }

            const finderCutoff = getCutoffDateTime(FINDER_RETENTION_SECONDS);
            const staleFinder = await dbRun(
                'DELETE FROM finder_reports WHERE discovered_at < ?',
                [finderCutoff]
            );
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
