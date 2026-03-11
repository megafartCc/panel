const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const url = require('url');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./db');

// Dashboard clients (admin panel viewers)
const dashboardClients = new Set();

// Script clients (Lua executor connections) — Map<ws, sessionData>
const scriptClients = new Map();

function initWebSocket(server) {
    // --- Dashboard WebSocket (JWT-authed, for the React frontend) ---
    const dashWss = new WebSocketServer({ server, path: '/ws' });

    dashWss.on('connection', (ws, req) => {
        const params = url.parse(req.url, true).query;
        const token = params.token;

        if (!token) { ws.close(4001, 'Missing token'); return; }
        try { jwt.verify(token, process.env.JWT_SECRET); }
        catch { ws.close(4001, 'Invalid token'); return; }

        dashboardClients.add(ws);
        console.log(`[WS:Dash] Connected (${dashboardClients.size} total)`);

        ws.on('close', () => {
            dashboardClients.delete(ws);
            console.log(`[WS:Dash] Disconnected (${dashboardClients.size} total)`);
        });
        ws.on('error', () => dashboardClients.delete(ws));

        // Send current active sessions
        const db = getDb();
        const activeSessions = db.prepare(`
      SELECT sess.*, s.name as script_name, s.slug as script_slug
      FROM sessions sess
      JOIN scripts s ON sess.script_id = s.id
      WHERE sess.is_active = 1
      ORDER BY sess.last_heartbeat DESC
      LIMIT 200
    `).all();

        ws.send(JSON.stringify({ type: 'init', data: { sessions: activeSessions } }));
    });

    // --- Script WebSocket (HMAC-authed, for Lua executor clients) ---
    const scriptWss = new WebSocketServer({ server, path: '/ws/script' });

    scriptWss.on('connection', (ws, req) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        let identified = false;
        let identifyTimeout;

        // Must identify within 10 seconds or get kicked
        identifyTimeout = setTimeout(() => {
            if (!identified) {
                ws.close(4002, 'Identify timeout');
            }
        }, 10000);

        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch { return; }

            if (!identified) {
                // First message MUST be identify
                if (msg.type !== 'identify') {
                    ws.close(4003, 'Expected identify');
                    return;
                }

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

            // After identified, handle keepalive pings and feature updates
            if (msg.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
                // Update last_heartbeat
                const session = scriptClients.get(ws);
                if (session) {
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
                }
            }

            if (msg.type === 'update') {
                // Allow client to update metadata (e.g. feature toggles, game info)
                const session = scriptClients.get(ws);
                if (session && msg.data) {
                    session.meta = { ...(session.meta || {}), ...msg.data };
                }
            }
        });

        ws.on('close', () => {
            clearTimeout(identifyTimeout);
            handleScriptDisconnect(ws);
        });

        ws.on('error', () => {
            clearTimeout(identifyTimeout);
            handleScriptDisconnect(ws);
        });
    });

    // Stale session cleanup (for HTTP heartbeat fallback sessions) — every 30s
    setInterval(cleanupStaleSessions, 30000);

    // Ping connected script clients every 25s to keep the connection alive
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

    // Timestamp check (120s window — slightly wider for network lag)
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(now - ts) > 120) return null;

    // Look up script HMAC key
    const db = getDb();
    const scriptRow = db.prepare('SELECT id, hmac_key, name, slug FROM scripts WHERE slug = ?').get(script);
    if (!scriptRow) return null;

    // Verify HMAC
    const message = `${script}:${userid}:${timestamp}`;
    const expectedSig = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');

    try {
        if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'))) return null;
    } catch {
        return null;
    }

    // Create or update session
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

    // Track this client
    const sessionData = {
        sessionId,
        scriptId: scriptRow.id,
        scriptSlug: scriptRow.slug,
        scriptName: scriptRow.name,
        user,
        userid: String(userid),
        executor: executor || 'Unknown',
        jobid: jobid || '',
        meta: {}
    };
    scriptClients.set(ws, sessionData);

    console.log(`[WS:Script] ${user} identified on ${scriptRow.name} (${scriptClients.size} script clients)`);

    // Broadcast join to dashboard
    broadcastDashboard({
        type: existingSession ? 'session:heartbeat' : 'session:join',
        data: {
            sessionId,
            script: scriptRow.slug,
            scriptName: scriptRow.name,
            user,
            userid: String(userid),
            executor: executor || 'Unknown',
            jobid: jobid || '',
            timestamp: nowIso
        }
    });

    return { sessionId };
}

function handleScriptDisconnect(ws) {
    const session = scriptClients.get(ws);
    if (!session) return;

    scriptClients.delete(ws);

    // Mark session inactive
    const db = getDb();
    db.prepare('UPDATE sessions SET is_active = 0, last_heartbeat = ? WHERE id = ?')
        .run(new Date().toISOString(), session.sessionId);

    console.log(`[WS:Script] ${session.user} disconnected from ${session.scriptName} (${scriptClients.size} remaining)`);

    // Broadcast leave to dashboard
    broadcastDashboard({
        type: 'session:leave',
        data: {
            sessionId: session.sessionId,
            user: session.user,
            userid: session.userid,
            script: session.scriptSlug,
            scriptName: session.scriptName,
            timestamp: new Date().toISOString()
        }
    });
}

function cleanupStaleSessions() {
    const db = getDb();

    // Only clean up sessions NOT held by an active WS client
    const activeWsSessionIds = new Set();
    for (const [, s] of scriptClients) {
        activeWsSessionIds.add(s.sessionId);
    }

    const staleSessions = db.prepare(`
    SELECT sess.id, sess.roblox_user, sess.roblox_userid, s.slug as script_slug, s.name as script_name
    FROM sessions sess
    JOIN scripts s ON sess.script_id = s.id
    WHERE sess.is_active = 1 AND sess.last_heartbeat < datetime('now', '-90 seconds')
  `).all();

    const toDeactivate = staleSessions.filter(s => !activeWsSessionIds.has(s.id));

    if (toDeactivate.length > 0) {
        const staleIds = toDeactivate.map(s => s.id);
        const placeholders = staleIds.map(() => '?').join(',');
        db.prepare(`UPDATE sessions SET is_active = 0 WHERE id IN (${placeholders})`).run(...staleIds);

        for (const session of toDeactivate) {
            broadcastDashboard({
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

function broadcastDashboard(message) {
    const data = JSON.stringify(message);
    for (const client of dashboardClients) {
        if (client.readyState === 1) {
            try { client.send(data); } catch { dashboardClients.delete(client); }
        }
    }
}

// Keep backward compat — heartbeat.js still calls broadcast()
function broadcast(message) {
    broadcastDashboard(message);
}

module.exports = { initWebSocket, broadcast, broadcastDashboard };
