const express = require('express');
const crypto = require('crypto');
const { authMiddleware } = require('../middleware/auth');
const { dbAll, dbGet, dbRun, getCutoffDateTime, isMySql, toDbDateTime } = require('../db');

const router = express.Router();

const SIGNATURE_WINDOW_SECONDS = 120;
const FINDER_TTL_SECONDS = Math.max(5, Number(process.env.FINDER_SERVER_TTL_SECONDS) || 25);
const MAX_BRAINROTS_PER_REQUEST = 100;

async function getScriptRow(script) {
    return dbGet('SELECT id, name, slug, hmac_key FROM scripts WHERE slug = ?', [script]);
}

function normalizeSignature(signature, expectedHex) {
    if (typeof signature !== 'string' || !signature) {
        return null;
    }

    if (/[^0-9a-fA-F]/.test(signature)) {
        try {
            return Buffer.from(signature, 'base64').toString('hex');
        } catch {
            return null;
        }
    }

    if (expectedHex && signature.length !== expectedHex.length) {
        return null;
    }

    return signature.toLowerCase();
}

async function verifySignedScriptPayload(payload) {
    const script = String(payload?.script || payload?.slug || payload?.script_slug || '').trim();
    const { userid, timestamp, signature } = payload || {};

    if (!script || !userid || !timestamp || !signature) {
        return { ok: false, status: 400, error: 'Missing required fields' };
    }

    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts) || Math.abs(now - ts) > SIGNATURE_WINDOW_SECONDS) {
        return { ok: false, status: 400, error: 'Invalid timestamp' };
    }

    const scriptRow = await getScriptRow(script);
    if (!scriptRow) {
        return { ok: false, status: 404, error: 'Script not found' };
    }

    const message = `${script}:${userid}:${timestamp}`;
    const expectedHex = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');
    const sigHex = normalizeSignature(signature, expectedHex);

    if (!sigHex) {
        return { ok: false, status: 401, error: 'Invalid signature format' };
    }

    if (!crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex'))) {
        return { ok: false, status: 401, error: 'Invalid signature' };
    }

    return { ok: true, scriptRow };
}

async function listFinderRows({ script, excludeJobId, limit }) {
    const params = [getCutoffDateTime(FINDER_TTL_SECONDS)];
    let sql = `
        SELECT
            fr.*,
            s.slug AS script_slug,
            s.name AS script_name
        FROM finder_reports fr
        JOIN scripts s ON s.id = fr.script_id
        WHERE fr.discovered_at >= ?
    `;

    if (script) {
        sql += ' AND s.slug = ?';
        params.push(script);
    }

    if (excludeJobId) {
        sql += ' AND fr.server_jobid != ?';
        params.push(excludeJobId);
    }

    sql += `
        ORDER BY fr.discovered_at DESC, fr.money_per_sec DESC
        LIMIT ?
    `;
    params.push(Math.max(1, Math.min(parseInt(limit, 10) || 250, 500)));

    return dbAll(sql, params);
}

function buildFinderServers(rows) {
    const servers = new Map();

    for (const row of rows) {
        const serverKey = `${row.script_slug}:${row.server_jobid}`;
        let server = servers.get(serverKey);

        if (!server) {
            server = {
                script: row.script_slug,
                scriptName: row.script_name,
                serverJobId: row.server_jobid,
                placeId: row.place_id || '',
                reportedByUser: row.reported_by_user || '',
                reportedByUserId: row.reported_by_userid || '',
                executor: row.executor || 'Unknown',
                playerCount: Number(row.player_count || 0),
                lastSeen: row.discovered_at,
                joinUrl: row.place_id && row.server_jobid
                    ? `roblox://placeID=${row.place_id}&gameInstanceId=${row.server_jobid}`
                    : null,
                brainrots: [],
                _brainrotKeys: new Set(),
            };
            servers.set(serverKey, server);
        }

        if (row.discovered_at > server.lastSeen) {
            server.lastSeen = row.discovered_at;
            server.reportedByUser = row.reported_by_user || server.reportedByUser;
            server.reportedByUserId = row.reported_by_userid || server.reportedByUserId;
            server.executor = row.executor || server.executor;
            server.playerCount = Number(row.player_count || 0);
        }

        if (!server._brainrotKeys.has(row.brainrot_key)) {
            server._brainrotKeys.add(row.brainrot_key);
            server.brainrots.push({
                key: row.brainrot_key,
                name: row.brainrot_name,
                moneyPerSec: Number(row.money_per_sec || 0),
                discoveredAt: row.discovered_at,
            });
        }
    }

    return Array.from(servers.values())
        .map((server) => {
            server.brainrots.sort((left, right) => {
                if (right.moneyPerSec !== left.moneyPerSec) {
                    return right.moneyPerSec - left.moneyPerSec;
                }
                return String(right.discoveredAt).localeCompare(String(left.discoveredAt));
            });
            server.brainrotCount = server.brainrots.length;
            delete server._brainrotKeys;
            return server;
        })
        .sort((left, right) => {
            const timeSort = String(right.lastSeen).localeCompare(String(left.lastSeen));
            if (timeSort !== 0) {
                return timeSort;
            }
            return (right.brainrots[0]?.moneyPerSec || 0) - (left.brainrots[0]?.moneyPerSec || 0);
        });
}

router.post('/', async (req, res) => {
    try {
        const verification = await verifySignedScriptPayload(req.body);
        if (!verification.ok) {
            return res.status(verification.status).json({ error: verification.error });
        }

        const {
            user,
            userid,
            executor,
            jobid,
            placeid,
            playerCount,
            brainrots,
        } = req.body;

        if (!jobid || !Array.isArray(brainrots)) {
            return res.status(400).json({ error: 'Missing finder payload' });
        }

        const normalizedPlayerCount = Math.max(0, parseInt(playerCount, 10) || 0);
        if (normalizedPlayerCount >= 7) {
            return res.json({ ok: true, inserted: 0, ignored: 0, skipped: 'player_count' });
        }

        const submittedAt = toDbDateTime();
        const normalizedBrainrots = [];
        const seenKeys = new Set();

        for (const rawItem of brainrots.slice(0, MAX_BRAINROTS_PER_REQUEST)) {
            if (!rawItem || typeof rawItem !== 'object') {
                continue;
            }

            const key = String(rawItem.key || '').trim();
            const name = String(rawItem.name || '').trim();
            const moneyPerSec = Number(rawItem.moneyPerSec || rawItem.money_per_sec || 0);

            if (!key || !name || seenKeys.has(key)) {
                continue;
            }

            seenKeys.add(key);
            normalizedBrainrots.push({
                key,
                name,
                moneyPerSec: Number.isFinite(moneyPerSec) ? moneyPerSec : 0,
            });
        }

        if (normalizedBrainrots.length === 0) {
            return res.json({ ok: true, inserted: 0, ignored: 0, skipped: 'empty' });
        }

        const insertSql = isMySql()
            ? `INSERT IGNORE INTO finder_reports (
                script_id,
                server_jobid,
                place_id,
                reported_by_user,
                reported_by_userid,
                executor,
                player_count,
                brainrot_key,
                brainrot_name,
                money_per_sec,
                discovered_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            : `INSERT OR IGNORE INTO finder_reports (
                script_id,
                server_jobid,
                place_id,
                reported_by_user,
                reported_by_userid,
                executor,
                player_count,
                brainrot_key,
                brainrot_name,
                money_per_sec,
                discovered_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        let inserted = 0;
        for (const item of normalizedBrainrots) {
            const result = await dbRun(insertSql, [
                verification.scriptRow.id,
                String(jobid),
                String(placeid || ''),
                String(user || ''),
                String(userid),
                executor || 'Unknown',
                normalizedPlayerCount,
                item.key,
                item.name,
                item.moneyPerSec,
                submittedAt,
            ]);
            inserted += Number(result.changes || 0);
        }

        res.json({
            ok: true,
            script: verification.scriptRow.slug,
            inserted,
            ignored: normalizedBrainrots.length - inserted,
            ttlSeconds: FINDER_TTL_SECONDS,
        });
    } catch (err) {
        console.error('[Finder] POST error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

router.get('/feed', async (req, res) => {
    try {
        const verification = await verifySignedScriptPayload(req.query);
        if (!verification.ok) {
            return res.status(verification.status).json({ error: verification.error });
        }

        const { script, exclude_jobid: excludeJobId, limit } = req.query;
        const servers = buildFinderServers(await listFinderRows({
            script,
            excludeJobId,
            limit,
        }));

        res.json({
            ok: true,
            ttlSeconds: FINDER_TTL_SECONDS,
            generatedAt: new Date().toISOString(),
            servers,
        });
    } catch (err) {
        console.error('[Finder] FEED error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

router.get('/public', async (req, res) => {
    try {
        const { script, exclude_jobid: excludeJobId, limit } = req.query;
        const servers = buildFinderServers(await listFinderRows({
            script,
            excludeJobId,
            limit,
        }));

        res.json({
            ok: true,
            ttlSeconds: FINDER_TTL_SECONDS,
            generatedAt: new Date().toISOString(),
            total: servers.length,
            servers,
        });
    } catch (err) {
        console.error('[Finder] PUBLIC error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

router.get('/', authMiddleware, async (req, res) => {
    try {
        const { script, exclude_jobid: excludeJobId, limit } = req.query;
        const servers = buildFinderServers(await listFinderRows({
            script,
            excludeJobId,
            limit,
        }));

        res.json({
            ok: true,
            ttlSeconds: FINDER_TTL_SECONDS,
            generatedAt: new Date().toISOString(),
            total: servers.length,
            servers,
        });
    } catch (err) {
        console.error('[Finder] GET error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

module.exports = router;
