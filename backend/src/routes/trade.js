const express = require('express');
const crypto = require('crypto');
const { authMiddleware } = require('../middleware/auth');
const { dbAll, dbGet, dbRun, ensureTradeSchema, isMySql, toDbDateTime } = require('../db');

const router = express.Router();

const SIGNATURE_WINDOW_SECONDS = 120;
const INVENTORY_STALE_SECONDS = Math.max(30, Number(process.env.TRADE_INVENTORY_STALE_SECONDS) || 30);

function toUnixMs(value) {
    if (!value && value !== 0) return null;

    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value > 1e12) return Math.floor(value);
        if (value > 0) return Math.floor(value * 1000);
        return null;
    }

    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw) return null;

        if (/^\d+$/.test(raw)) {
            const numeric = Number(raw);
            if (Number.isFinite(numeric) && numeric > 0) {
                return numeric > 1e12 ? Math.floor(numeric) : Math.floor(numeric * 1000);
            }
        }

        let parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.getTime();
        }

        // Handle SQL-like "YYYY-MM-DD HH:mm:ss" timestamps.
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
            parsed = new Date(raw.replace(' ', 'T') + 'Z');
            if (!Number.isNaN(parsed.getTime())) {
                return parsed.getTime();
            }
        }
    }

    return null;
}

function normalizeTradeItems(brainrots, fallback) {
    const out = [];
    const seen = new Set();

    const pushItem = (item) => {
        if (!item || typeof item !== 'object') return;

        const rawSlot = item.slot ?? item.brainrotSlot ?? item.brainrot_slot;
        const parsedSlot = Number.parseInt(rawSlot, 10);
        const slot = Number.isFinite(parsedSlot) && parsedSlot > 0 ? parsedSlot : -1;

        const name = String(item.name ?? item.brainrotName ?? item.brainrot_name ?? '').trim();
        const key = String(item.key ?? item.brainrotKey ?? item.brainrot_key ?? name).trim();
        if (!name && !key) return;

        const dedupeKey = `${slot}|${key}|${name}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        out.push({ slot, key, name: name || key });
    };

    if (Array.isArray(brainrots)) {
        for (const entry of brainrots) {
            pushItem(entry);
            if (out.length >= 20) break;
        }
    }

    if (out.length === 0 && fallback) {
        pushItem({
            slot: fallback.brainrotSlot,
            key: fallback.brainrotKey,
            name: fallback.brainrotName,
        });
    }

    return out;
}

// --- HMAC verification (same pattern as finder.js) ---

function normalizeSignature(signature, expectedHex) {
    if (typeof signature !== 'string' || !signature) return null;
    if (/[^0-9a-fA-F]/.test(signature)) {
        try { return Buffer.from(signature, 'base64').toString('hex'); }
        catch { return null; }
    }
    if (expectedHex && signature.length !== expectedHex.length) return null;
    return signature.toLowerCase();
}

async function getScriptRow(script) {
    return dbGet('SELECT id, name, slug, hmac_key FROM scripts WHERE slug = ?', [script]);
}

async function verifySignedPayload(payload) {
    const script = String(payload?.script || payload?.slug || payload?.script_slug || '').trim();
    const { userid, timestamp, signature } = payload || {};

    if (!script || !userid || !timestamp || !signature)
        return { ok: false, status: 400, error: 'Missing required fields' };

    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts) || Math.abs(now - ts) > SIGNATURE_WINDOW_SECONDS)
        return { ok: false, status: 400, error: 'Invalid timestamp' };

    const scriptRow = await getScriptRow(script);
    if (!scriptRow) return { ok: false, status: 404, error: 'Script not found' };

    const message = `${script}:${userid}:${timestamp}`;
    const expectedHex = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');
    const sigHex = normalizeSignature(signature, expectedHex);

    if (!sigHex) return { ok: false, status: 401, error: 'Invalid signature format' };

    if (!crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex')))
        return { ok: false, status: 401, error: 'Invalid signature' };

    return { ok: true, scriptRow };
}

// =============================================
// POST /inventory — Lua client reports brainrots
// =============================================
router.post('/inventory', async (req, res) => {
    try {
        const verification = await verifySignedPayload(req.body);
        if (!verification.ok) return res.status(verification.status).json({ error: verification.error });

        const { user, userid, brainrots } = req.body;
        if (!Array.isArray(brainrots))
            return res.status(400).json({ error: 'Missing brainrots array' });

        const inventoryJson = JSON.stringify(brainrots.slice(0, 200));
        const nowIso = toDbDateTime();

        if (isMySql()) {
            await dbRun(
                `INSERT INTO trade_inventory (script_id, roblox_userid, roblox_user, inventory_json, updated_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    roblox_user = VALUES(roblox_user),
                    inventory_json = VALUES(inventory_json),
                    updated_at = VALUES(updated_at)`,
                [verification.scriptRow.id, String(userid), String(user || ''), inventoryJson, nowIso]
            );
        } else {
            await dbRun(
                `INSERT INTO trade_inventory (script_id, roblox_userid, roblox_user, inventory_json, updated_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(script_id, roblox_userid) DO UPDATE SET
                    roblox_user = excluded.roblox_user,
                    inventory_json = excluded.inventory_json,
                    updated_at = excluded.updated_at`,
                [verification.scriptRow.id, String(userid), String(user || ''), inventoryJson, nowIso]
            );
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('[Trade] inventory error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

// =============================================
// GET /inventory — Panel frontend views all inventories
// =============================================
router.get('/inventory', authMiddleware, async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT ti.roblox_userid, ti.roblox_user, ti.inventory_json, ti.updated_at,
                    s.slug AS script_slug, s.name AS script_name
             FROM trade_inventory ti
             JOIN scripts s ON s.id = ti.script_id
             ORDER BY ti.updated_at DESC
             LIMIT 200`
        );

        const nowMs = Date.now();
        const staleMs = INVENTORY_STALE_SECONDS * 1000;

        const players = rows.map((row) => {
            let brainrots = [];
            try { brainrots = JSON.parse(row.inventory_json); } catch { }

            const updatedMs = toUnixMs(row.updated_at);

            return {
                userid: row.roblox_userid,
                username: row.roblox_user,
                script: row.script_slug,
                scriptName: row.script_name,
                updatedAt: updatedMs ? new Date(updatedMs).toISOString() : null,
                updatedAtMs: updatedMs,
                brainrots,
                brainrotCount: brainrots.length,
            };
        }).filter((player) => {
            if (!player.updatedAtMs) return false;
            return (nowMs - player.updatedAtMs) <= staleMs;
        });

        res.json({ ok: true, players });
    } catch (err) {
        console.error('[Trade] GET inventory error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

// =============================================
// POST /command — Panel frontend creates trade command
// =============================================
router.post('/command', authMiddleware, async (req, res) => {
    try {
        const {
            targetUserid,
            targetUsername,
            recipientUsername,
            sendToUsername,
            tradeWithUsername,
            brainrotSlot,
            brainrotKey,
            brainrotName,
            brainrots,
            script,
        } = req.body;

        if (!targetUserid || !targetUsername)
            return res.status(400).json({ error: 'Missing target player info' });

        const recipient = String(recipientUsername || sendToUsername || tradeWithUsername || '').trim();
        if (!recipient) {
            return res.status(400).json({ error: 'Missing recipient username' });
        }

        const normalizedBrainrots = normalizeTradeItems(brainrots, { brainrotSlot, brainrotKey, brainrotName });
        if (normalizedBrainrots.length === 0) {
            return res.status(400).json({ error: 'Missing brainrots selection' });
        }

        const firstBrainrot = normalizedBrainrots[0];
        const brainrotsJson = JSON.stringify(normalizedBrainrots);
        const scriptSlug = String(script || 'sabnew').trim();
        const scriptRow = await getScriptRow(scriptSlug);
        if (!scriptRow) return res.status(404).json({ error: 'Script not found' });

        // Cancel any existing pending commands for same target
        await dbRun(
            `UPDATE trade_commands SET status = 'cancelled' WHERE script_id = ? AND target_userid = ? AND status = 'pending'`,
            [scriptRow.id, String(targetUserid)]
        );

        const result = await dbRun(
            `INSERT INTO trade_commands (script_id, requester_userid, target_userid, target_username, recipient_username, brainrot_slot, brainrot_key, brainrot_name, brainrots_json, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
                scriptRow.id,
                '',
                String(targetUserid),
                String(targetUsername),
                recipient,
                Number.parseInt(firstBrainrot.slot, 10) || -1,
                String(firstBrainrot.key || ''),
                String(firstBrainrot.name || ''),
                brainrotsJson,
            ]
        );

        res.json({
            ok: true,
            commandId: result.insertId,
            target: targetUsername,
            recipient,
            queuedCount: normalizedBrainrots.length,
            brainrot: firstBrainrot.name || firstBrainrot.key || 'any',
        });
    } catch (err) {
        console.error('[Trade] command error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

// =============================================
// POST /poll — Lua client polls for trade commands
// =============================================
router.post('/poll', async (req, res) => {
    try {
        const verification = await verifySignedPayload(req.body);
        if (!verification.ok) return res.status(verification.status).json({ error: verification.error });

        const { userid } = req.body;
        const requesterUserid = String(userid || '').trim();
        if (!requesterUserid) {
            return res.status(400).json({ error: 'Missing userid' });
        }

        // Find the oldest pending command for this script + exact target user.
        const command = await dbGet(
            `SELECT id, target_userid, target_username, recipient_username, brainrot_slot, brainrot_key, brainrot_name, brainrots_json
             FROM trade_commands
             WHERE script_id = ? AND status = 'pending' AND target_userid = ?
             ORDER BY created_at ASC
             LIMIT 1`,
            [verification.scriptRow.id, requesterUserid]
        );

        if (!command) {
            return res.json({ ok: true, command: null });
        }

        // Atomically claim so command is delivered exactly once.
        const nowIso = toDbDateTime();
        const claimResult = await dbRun(
            `UPDATE trade_commands
             SET status = 'picked_up', picked_up_at = ?
             WHERE id = ? AND script_id = ? AND target_userid = ? AND status = 'pending'`,
            [nowIso, command.id, verification.scriptRow.id, requesterUserid]
        );
        if (!claimResult || Number(claimResult.changes || 0) <= 0) {
            return res.json({ ok: true, command: null });
        }

        let parsedBrainrots = [];
        if (typeof command.brainrots_json === 'string' && command.brainrots_json.trim() !== '') {
            try {
                const json = JSON.parse(command.brainrots_json);
                if (Array.isArray(json)) {
                    parsedBrainrots = json;
                }
            } catch { }
        }
        if (!Array.isArray(parsedBrainrots) || parsedBrainrots.length === 0) {
            parsedBrainrots = [{
                slot: Number.parseInt(command.brainrot_slot, 10) || -1,
                key: String(command.brainrot_key || ''),
                name: String(command.brainrot_name || command.brainrot_key || ''),
            }];
        }

        res.json({
            ok: true,
            command: {
                id: command.id,
                targetUserid: command.target_userid,
                targetUsername: command.target_username,
                recipientUsername: command.recipient_username || '',
                brainrotSlot: command.brainrot_slot,
                brainrotKey: command.brainrot_key,
                brainrotName: command.brainrot_name,
                brainrots: parsedBrainrots,
            },
        });
    } catch (err) {
        console.error('[Trade] poll error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

// =============================================
// GET /commands — Panel frontend views command history
// =============================================
router.get('/commands', authMiddleware, async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT tc.id, tc.target_userid, tc.target_username, tc.brainrot_slot, tc.brainrot_key,
                    tc.brainrot_name, tc.recipient_username, tc.brainrots_json,
                    tc.status, tc.created_at, tc.picked_up_at,
                    s.slug AS script_slug
             FROM trade_commands tc
             JOIN scripts s ON s.id = tc.script_id
             ORDER BY tc.created_at DESC
             LIMIT 50`
        );

        res.json({ ok: true, commands: rows });
    } catch (err) {
        console.error('[Trade] commands history error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

module.exports = router;
