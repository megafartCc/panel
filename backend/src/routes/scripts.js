const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { dbAll, dbGet, dbRun, getCutoffDateTime } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const ACTIVE_SESSION_TIMEOUT_SECONDS = Math.max(1, Number(process.env.SESSION_TIMEOUT_SECONDS) || 10);

router.use(authMiddleware);

router.get('/', async (req, res) => {
    try {
        const activeCutoff = getCutoffDateTime(ACTIVE_SESSION_TIMEOUT_SECONDS);
        const scripts = await dbAll(`
            SELECT s.*,
                (
                    SELECT COUNT(*)
                    FROM sessions sess
                    WHERE sess.script_id = s.id
                        AND sess.is_active = 1
                        AND sess.last_heartbeat >= ?
                ) AS active_users
            FROM scripts s
            ORDER BY s.created_at DESC
        `, [activeCutoff]);

        res.json(scripts);
    } catch (err) {
        console.error('[Scripts] List error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { name, slug } = req.body;

        if (!name || !slug) {
            return res.status(400).json({ error: 'Name and slug are required' });
        }

        if (typeof name !== 'string' || typeof slug !== 'string') {
            return res.status(400).json({ error: 'Invalid input types' });
        }

        if (!/^[a-z0-9_]+$/.test(slug) || slug.length > 32) {
            return res.status(400).json({ error: 'Slug must be lowercase alphanumeric with underscores, max 32 chars' });
        }

        if (name.length > 64) {
            return res.status(400).json({ error: 'Name too long (max 64 chars)' });
        }

        const existing = await dbGet('SELECT id FROM scripts WHERE slug = ?', [slug]);
        if (existing) {
            return res.status(409).json({ error: 'A script with this slug already exists' });
        }

        const id = uuidv4();
        const hmacKey = crypto.randomBytes(32).toString('hex');
        await dbRun('INSERT INTO scripts (id, name, slug, hmac_key) VALUES (?, ?, ?, ?)', [id, name, slug, hmacKey]);

        res.status(201).json({ id, name, slug, hmac_key: hmacKey });
    } catch (err) {
        console.error('[Scripts] Create error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const result = await dbRun('DELETE FROM scripts WHERE id = ?', [req.params.id]);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Script not found' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('[Scripts] Delete error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:id/key', async (req, res) => {
    try {
        const script = await dbGet('SELECT hmac_key, slug, name FROM scripts WHERE id = ?', [req.params.id]);
        if (!script) {
            return res.status(404).json({ error: 'Script not found' });
        }
        res.json({ hmac_key: script.hmac_key, slug: script.slug, name: script.name });
    } catch (err) {
        console.error('[Scripts] Key error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
