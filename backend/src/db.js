const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'panel.db');

let db;

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

function syncSeededScript(conn, script) {
    const existing = conn.prepare('SELECT id, hmac_key FROM scripts WHERE slug = ?').get(script.slug);
    const resolvedKey = script.envKey || crypto.randomBytes(32).toString('hex');

    if (!existing) {
        conn.prepare('INSERT INTO scripts (id, name, slug, hmac_key) VALUES (?, ?, ?, ?)').run(
            uuidv4(), script.name, script.slug, resolvedKey
        );
        console.log(`[DB] Created default script: ${script.name} (slug: ${script.slug})`);
        if (script.envKey) {
            console.log(`[DB] Using ${script.envName} from environment`);
        }
        return;
    }

    if (script.envKey && existing.hmac_key !== script.envKey) {
        conn.prepare('UPDATE scripts SET name = ?, hmac_key = ? WHERE slug = ?').run(
            script.name, script.envKey, script.slug
        );
        console.log(`[DB] Synced ${script.slug} hmac_key from environment`);
        return;
    }

    conn.prepare('UPDATE scripts SET name = ? WHERE slug = ?').run(script.name, script.slug);
}

function migrate() {
    const conn = getDb();

    conn.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      hmac_key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL,
      roblox_user TEXT NOT NULL,
      roblox_userid TEXT NOT NULL,
      executor TEXT DEFAULT 'Unknown',
      server_jobid TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      first_seen TEXT DEFAULT (datetime('now')),
      last_heartbeat TEXT DEFAULT (datetime('now')),
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS heartbeat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);
    CREATE INDEX IF NOT EXISTS idx_sessions_script ON sessions(script_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_last_hb ON sessions(last_heartbeat);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_log_ts ON heartbeat_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_log_session ON heartbeat_log(session_id);
  `);

    // Seed default admin if none exists
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || 'changeme123';
    const existing = conn.prepare('SELECT id FROM admin_users WHERE username = ?').get(adminUser);
    if (!existing) {
        const hash = bcrypt.hashSync(adminPass, 12);
        conn.prepare('INSERT INTO admin_users (id, username, password_hash) VALUES (?, ?, ?)').run(
            uuidv4(), adminUser, hash
        );
        console.log(`[DB] Created default admin user: ${adminUser}`);
    }

    const sharedEnvKey = process.env.PANEL_SHARED_HMAC_KEY || process.env.SABNEW_HMAC_KEY || process.env.PANEL_SABNEW_HMAC_KEY;
    const seededScripts = [
        {
            name: 'SAB New',
            slug: 'sabnew',
            envName: 'SABNEW_HMAC_KEY',
            envKey: process.env.SABNEW_HMAC_KEY || process.env.PANEL_SABNEW_HMAC_KEY || sharedEnvKey,
        },
        {
            name: 'Fisch',
            slug: 'fisch',
            envName: 'FISCH_HMAC_KEY',
            envKey: process.env.FISCH_HMAC_KEY || process.env.PANEL_FISCH_HMAC_KEY || sharedEnvKey,
        },
        {
            name: 'BeeSwarm',
            slug: 'beeswarm',
            envName: 'BEESWARM_HMAC_KEY',
            envKey: process.env.BEESWARM_HMAC_KEY || process.env.PANEL_BEESWARM_HMAC_KEY || sharedEnvKey,
        },
    ];

    for (const script of seededScripts) {
        syncSeededScript(conn, script);
    }

    console.log('[DB] Migrations complete');
}

module.exports = { getDb, migrate };
