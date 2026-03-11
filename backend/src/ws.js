const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const { getDb } = require('./db');

let wss;
const clients = new Set();

function initWebSocket(server) {
    wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws, req) => {
        // Authenticate via query param: ?token=<jwt>
        const params = url.parse(req.url, true).query;
        const token = params.token;

        if (!token) {
            ws.close(4001, 'Missing token');
            return;
        }

        try {
            jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            ws.close(4001, 'Invalid token');
            return;
        }

        clients.add(ws);
        console.log(`[WS] Client connected (${clients.size} total)`);

        ws.on('close', () => {
            clients.delete(ws);
            console.log(`[WS] Client disconnected (${clients.size} total)`);
        });

        ws.on('error', () => {
            clients.delete(ws);
        });

        // Send initial state
        const db = getDb();
        const activeSessions = db.prepare(`
      SELECT sess.*, s.name as script_name, s.slug as script_slug
      FROM sessions sess
      JOIN scripts s ON sess.script_id = s.id
      WHERE sess.is_active = 1
      ORDER BY sess.last_heartbeat DESC
      LIMIT 200
    `).all();

        ws.send(JSON.stringify({
            type: 'init',
            data: { sessions: activeSessions }
        }));
    });

    // Stale session cleanup — every 15 seconds
    setInterval(() => {
        cleanupStaleSessions();
    }, 15000);

    console.log('[WS] WebSocket server initialized');
}

function cleanupStaleSessions() {
    const db = getDb();

    // Find sessions with no heartbeat in the last 60 seconds
    const staleSessions = db.prepare(`
    SELECT sess.id, sess.roblox_user, sess.roblox_userid, s.slug as script_slug, s.name as script_name
    FROM sessions sess
    JOIN scripts s ON sess.script_id = s.id
    WHERE sess.is_active = 1 AND sess.last_heartbeat < datetime('now', '-60 seconds')
  `).all();

    if (staleSessions.length > 0) {
        const staleIds = staleSessions.map(s => s.id);
        const placeholders = staleIds.map(() => '?').join(',');
        db.prepare(`UPDATE sessions SET is_active = 0 WHERE id IN (${placeholders})`).run(...staleIds);

        // Broadcast leave events
        for (const session of staleSessions) {
            broadcast({
                type: 'session:leave',
                data: {
                    sessionId: session.id,
                    user: session.roblox_user,
                    userid: session.roblox_userid,
                    script: session.script_slug,
                    scriptName: session.script_name,
                    timestamp: new Date().toISOString()
                }
            });
        }
    }
}

function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
            try {
                client.send(data);
            } catch {
                clients.delete(client);
            }
        }
    }
}

module.exports = { initWebSocket, broadcast };
