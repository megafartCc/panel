const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./db');

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
                WHERE is_active = 1 AND last_heartbeat < datetime('now', '-15 seconds')
            `).run();
            if (stale.changes > 0) {
                console.log(`[Cleanup] Marked ${stale.changes} stale sessions inactive`);
            }
        } catch (err) {
            console.error('[Cleanup] Error:', err.message);
        }
    }, 10000);
}

function init() {
    startCleanupTimer();
    console.log('[Server] Cleanup timer started (10s interval, 15s timeout)');
}

module.exports = { init };
