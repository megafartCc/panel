const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./db');

// Dashboard clients (admin panel viewers)
const dashboardClients = new Set();

// Script clients (Lua executor connections) — Map<ws, sessionData>
const scriptClients = new Map();

function initWebSocket(server) {
    // Use noServer mode to manually handle upgrades — avoids conflicts with
    // multiple WebSocketServers on the same HTTP server
    const dashWss = new WebSocketServer({ noServer: true });
    const scriptWss = new WebSocketServer({ noServer: true });

    // Route upgrade requests to the correct WebSocket server
    server.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;

        if (pathname === '/ws') {
            dashWss.handleUpgrade(request, socket, head, (ws) => {
                dashWss.emit('connection', ws, request);
            });
        } else if (pathname === '/ws/script') {
            scriptWss.handleUpgrade(request, socket, head, (ws) => {
                scriptWss.emit('connection', ws, request);
            });
        } else {
            socket.destroy();
        }
    });

    // --- Dashboard WebSocket ---
    dashWss.on('connection', (ws, req) => {
        try {
            const urlObj = new URL(req.url, 'http://localhost');
            const token = urlObj.searchParams.get('token');

            if (!token) { ws.close(4001, 'Missing token'); return; }
            try { jwt.verify(token, process.env.JWT_SECRET); }
            catch { ws.close(4001, 'Invalid token'); return; }

            dashboardClients.add(ws);
            console.log(`[WS:Dash] Connected (${dashboardClients.size} total)`);

            ws.on('close', () => {
                dashboardClients.delete(ws);
                console.log(`[WS:Dash] Disconnected (${dashboardClients.size} total)`);
            });
            ws.on('error', (err) => {
                console.error('[WS:Dash] Error:', err.message);
                dashboardClients.delete(ws);
            });

            // Send current active sessions
            try {
                const db = getDb();
                const activeSessions = db.prepare(`
          SELECT sess.id, sess.roblox_user, sess.roblox_userid, sess.executor,
                 sess.server_jobid, sess.first_seen, sess.last_heartbeat, sess.is_active,
                 s.name as script_name, s.slug as script_slug
          FROM sessions sess
          JOIN scripts s ON sess.script_id = s.id
          WHERE sess.is_active = 1
          ORDER BY sess.last_heartbeat DESC
          LIMIT 200
        `).all();

                ws.send(JSON.stringify({ type: 'init', data: { sessions: activeSessions } }));
            } catch (err) {
                console.error('[WS:Dash] Failed to send init:', err.message);
                ws.send(JSON.stringify({ type: 'init', data: { sessions: [] } }));
            }
        } catch (err) {
            console.error('[WS:Dash] Connection handler error:', err.message);
        }
    });

    // --- Script WebSocket (Lua clients) ---
    scriptWss.on('connection', (ws, req) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        let identified = false;
        let identifyTimeout;

        identifyTimeout = setTimeout(() => {
            if (!identified) ws.close(4002, 'Identify timeout');
        }, 10000);

        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch { return; }

            if (!identified) {
                if (msg.type !== 'identify') { ws.close(4003, 'Expected identify'); return; }
                const result = handleIdentify(ws, msg, ip);
                if (result) {
                    identified = true;
                    clearTimeout(identifyTimeout);
                    ws.send(JSON.stringify({ type: 'identified', sessionId: result.sessionId }));
                } else {
                    ws.close(4004, 'Auth failed');
                }
                return;
            }

            if (msg.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
                const session = scriptClients.get(ws);
                if (session) {
                    try {
                        const db = getDb();
                        const now = new Date().toISOString();
                        db.prepare('UPDATE sessions SET last_heartbeat = ? WHERE id = ?').run(now, session.sessionId);
                        db.prepare('INSERT INTO heartbeat_log (session_id, timestamp) VALUES (?, ?)').run(session.sessionId, now);

                        broadcastDashboard({
                            type: 'session:heartbeat',
                            data: {
                                sessionId: session.sessionId,
                                script: session.scriptSlug,
                                scriptName: session.scriptName,
                                user: session.user,
                                userid: session.userid,
                                executor: session.executor,
                                timestamp: now
                            }
                        });
                    } catch (err) {
                        console.error('[WS:Script] Heartbeat error:', err.message);
                    }
                }
            }
        });

        ws.on('close', () => { clearTimeout(identifyTimeout); handleScriptDisconnect(ws); });
        ws.on('error', () => { clearTimeout(identifyTimeout); handleScriptDisconnect(ws); });
    });

    // Stale session cleanup every 30s
    setInterval(cleanupStaleSessions, 30000);

    // Keepalive pings every 25s
    setInterval(() => {
        for (const [ws] of scriptClients) {
            if (ws.readyState === 1) {
                try { ws.send(JSON.stringify({ type: 'ping' })); } catch { /* */ }
            }
        }
    }, 25000);

    console.log('[WS] Dashboard (/ws) + Script (/ws/script) servers initialized');
    console.log(`[WS] Script clients: ${scriptClients.size}, Dashboard clients: ${dashboardClients.size}`);
}

function handleIdentify(ws, msg, ip) {
    const { script, user, userid, executor, jobid, timestamp, signature } = msg;
    if (!script || !user || !userid || !timestamp || !signature) return null;

    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(now - ts) > 120) return null;

    const db = getDb();
    const scriptRow = db.prepare('SELECT id, hmac_key, name, slug FROM scripts WHERE slug = ?').get(script);
    if (!scriptRow) return null;

    const message = `${script}:${userid}:${timestamp}`;
    const expectedSig = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');

    try {
        if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'))) return null;
    } catch { return null; }

    const existingSession = db.prepare(
        'SELECT id FROM sessions WHERE script_id = ? AND roblox_userid = ? AND is_active = 1'
    ).get(scriptRow.id, String(userid));

    let sessionId;
    const nowIso = new Date().toISOString();

    if (existingSession) {
        sessionId = existingSession.id;
        db.prepare('UPDATE sessions SET last_heartbeat = ?, executor = ?, server_jobid = ?, ip_address = ? WHERE id = ?')
            .run(nowIso, executor || 'Unknown', jobid || '', ip, sessionId);
    } else {
        sessionId = uuidv4();
        db.prepare(
            `INSERT INTO sessions (id, script_id, roblox_user, roblox_userid, executor, server_jobid, ip_address, first_seen, last_heartbeat, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        ).run(sessionId, scriptRow.id, user, String(userid), executor || 'Unknown', jobid || '', ip, nowIso, nowIso);
    }

    db.prepare('INSERT INTO heartbeat_log (session_id, timestamp) VALUES (?, ?)').run(sessionId, nowIso);

    const sessionData = {
        sessionId, scriptId: scriptRow.id, scriptSlug: scriptRow.slug,
        scriptName: scriptRow.name, user, userid: String(userid),
        executor: executor || 'Unknown', jobid: jobid || '', meta: {}
    };
    scriptClients.set(ws, sessionData);

    console.log(`[WS:Script] ${user} identified on ${scriptRow.name} (${scriptClients.size} script clients)`);

    broadcastDashboard({
        type: existingSession ? 'session:heartbeat' : 'session:join',
        data: {
            sessionId, script: scriptRow.slug, scriptName: scriptRow.name,
            user, userid: String(userid), executor: executor || 'Unknown',
            jobid: jobid || '', timestamp: nowIso
        }
    });

    return { sessionId };
}

function handleScriptDisconnect(ws) {
    const session = scriptClients.get(ws);
    if (!session) return;
    scriptClients.delete(ws);

    try {
        const db = getDb();
        db.prepare('UPDATE sessions SET is_active = 0, last_heartbeat = ? WHERE id = ?')
            .run(new Date().toISOString(), session.sessionId);
    } catch (err) {
        console.error('[WS:Script] Disconnect DB error:', err.message);
    }

    console.log(`[WS:Script] ${session.user} disconnected from ${session.scriptName} (${scriptClients.size} remaining)`);

    broadcastDashboard({
        type: 'session:leave',
        data: {
            sessionId: session.sessionId, user: session.user, userid: session.userid,
            script: session.scriptSlug, scriptName: session.scriptName,
            timestamp: new Date().toISOString()
        }
    });
}

function cleanupStaleSessions() {
    const db = getDb();
    const activeWsSessionIds = new Set();
    for (const [, s] of scriptClients) activeWsSessionIds.add(s.sessionId);

    const staleSessions = db.prepare(`
    SELECT sess.id, sess.roblox_user, sess.roblox_userid, s.slug as script_slug, s.name as script_name
    FROM sessions sess JOIN scripts s ON sess.script_id = s.id
    WHERE sess.is_active = 1 AND sess.last_heartbeat < datetime('now', '-90 seconds')
  `).all();

    const toDeactivate = staleSessions.filter(s => !activeWsSessionIds.has(s.id));
    if (toDeactivate.length > 0) {
        const ids = toDeactivate.map(s => s.id);
        db.prepare(`UPDATE sessions SET is_active = 0 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
        for (const s of toDeactivate) {
            broadcastDashboard({
                type: 'session:leave',
                data: {
                    sessionId: s.id, user: s.roblox_user, userid: s.roblox_userid,
                    script: s.script_slug, scriptName: s.script_name, timestamp: new Date().toISOString()
                }
            });
        }
    }
}

function broadcastDashboard(message) {
    const data = JSON.stringify(message);
    for (const client of dashboardClients) {
        if (client.readyState === 1) {
            try { client.send(data); } catch { dashboardClients.delete(client); }
        }
    }
}

function broadcast(message) { broadcastDashboard(message); }

module.exports = { initWebSocket, broadcast, broadcastDashboard };
