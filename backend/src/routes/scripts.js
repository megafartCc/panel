const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const ACTIVE_SESSION_TIMEOUT_SECONDS = Math.max(1, Number(process.env.SESSION_TIMEOUT_SECONDS) || 10);
const ACTIVE_WINDOW_SQL = `-${ACTIVE_SESSION_TIMEOUT_SECONDS} seconds`;

// All routes require admin auth
router.use(authMiddleware);

// GET /api/scripts — list all scripts with active user counts
router.get('/', (req, res) => {
    const db = getDb();
    const scripts = db.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM sessions sess WHERE sess.script_id = s.id AND sess.is_active = 1 AND sess.last_heartbeat >= datetime('now', ?)) as active_users
    FROM scripts s
    ORDER BY s.created_at DESC
  `).all(ACTIVE_WINDOW_SQL);

    res.json(scripts);
});

// POST /api/scripts — create a new script
router.post('/', (req, res) => {
    const { name, slug } = req.body;

    if (!name || !slug) {
        return res.status(400).json({ error: 'Name and slug are required' });
    }

    if (typeof name !== 'string' || typeof slug !== 'string') {
        return res.status(400).json({ error: 'Invalid input types' });
    }

    // Validate slug format (lowercase, alphanumeric + underscores)
    if (!/^[a-z0-9_]+$/.test(slug) || slug.length > 32) {
        return res.status(400).json({ error: 'Slug must be lowercase alphanumeric with underscores, max 32 chars' });
    }

    if (name.length > 64) {
        return res.status(400).json({ error: 'Name too long (max 64 chars)' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM scripts WHERE slug = ?').get(slug);
    if (existing) {
        return res.status(409).json({ error: 'A script with this slug already exists' });
    }

    const id = uuidv4();
    const hmacKey = crypto.randomBytes(32).toString('hex');

    db.prepare('INSERT INTO scripts (id, name, slug, hmac_key) VALUES (?, ?, ?, ?)').run(
        id, name, slug, hmacKey
    );

    res.status(201).json({ id, name, slug, hmac_key: hmacKey });
});

// DELETE /api/scripts/:id — delete a script and its sessions
router.delete('/:id', (req, res) => {
    const db = getDb();
    const result = db.prepare('DELETE FROM scripts WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
        return res.status(404).json({ error: 'Script not found' });
    }

    res.json({ ok: true });
});

// GET /api/scripts/:id/key — get HMAC key for a script (for embedding in Lua)
router.get('/:id/key', (req, res) => {
    const db = getDb();
    const script = db.prepare('SELECT hmac_key, slug, name FROM scripts WHERE id = ?').get(req.params.id);

    if (!script) {
        return res.status(404).json({ error: 'Script not found' });
    }

    res.json({ hmac_key: script.hmac_key, slug: script.slug, name: script.name });
});

module.exports = router;
