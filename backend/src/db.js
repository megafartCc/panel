const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'panel.db');

let sqliteDb = null;
let mysqlPool = null;
let dbKind = null; // 'sqlite' | 'mysql'
let dbInitPromise = null;

function toDbDateTime(date = new Date()) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getCutoffDateTime(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    return toDbDateTime(new Date(Date.now() - (safeSeconds * 1000)));
}

function isMySql() {
    return dbKind === 'mysql';
}

function resolveMySqlConfig() {
    const mysqlUrl = process.env.MYSQL_URL;
    if (typeof mysqlUrl === 'string' && mysqlUrl.trim() !== '') {
        try {
            const parsed = new URL(mysqlUrl);
            return {
                host: parsed.hostname,
                port: parsed.port ? Number(parsed.port) : 3306,
                user: decodeURIComponent(parsed.username || ''),
                password: decodeURIComponent(parsed.password || ''),
                database: decodeURIComponent((parsed.pathname || '').replace(/^\//, '') || ''),
            };
        } catch (err) {
            console.warn('[DB] Invalid MYSQL_URL, falling back to MYSQL_* vars:', err.message);
        }
    }

    const host = process.env.MYSQL_HOST;
    const user = process.env.MYSQL_USER;
    const database = process.env.MYSQL_DATABASE;
    if (!host || !user || !database) {
        return null;
    }

    return {
        host,
        port: Number(process.env.MYSQL_PORT || 3306),
        user,
        password: process.env.MYSQL_PASSWORD || '',
        database,
    };
}

async function initDbConnection() {
    if (dbKind) {
        return;
    }

    const mysqlConfig = resolveMySqlConfig();
    if (mysqlConfig) {
        mysqlPool = mysql.createPool({
            host: mysqlConfig.host,
            port: mysqlConfig.port,
            user: mysqlConfig.user,
            password: mysqlConfig.password,
            database: mysqlConfig.database,
            connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
            waitForConnections: true,
            queueLimit: 0,
            timezone: 'Z',
            ssl: process.env.MYSQL_SSL === 'false' ? undefined : { rejectUnauthorized: false },
        });

        const conn = await mysqlPool.getConnection();
        try {
            await conn.query('SELECT 1');
            dbKind = 'mysql';
            console.log(`[DB] Connected to MySQL ${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
        } finally {
            conn.release();
        }
        return;
    }

    sqliteDb = new Database(DB_PATH);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    dbKind = 'sqlite';
    console.log(`[DB] Using SQLite ${DB_PATH}`);
}

async function ensureDbReady() {
    if (!dbInitPromise) {
        dbInitPromise = initDbConnection().catch((err) => {
            dbInitPromise = null;
            throw err;
        });
    }
    await dbInitPromise;
}

async function dbGet(sql, params = []) {
    await ensureDbReady();
    if (isMySql()) {
        const [rows] = await mysqlPool.query(sql, params);
        return rows[0] || null;
    }
    return sqliteDb.prepare(sql).get(...params) || null;
}

async function dbAll(sql, params = []) {
    await ensureDbReady();
    if (isMySql()) {
        const [rows] = await mysqlPool.query(sql, params);
        return rows;
    }
    return sqliteDb.prepare(sql).all(...params);
}

async function dbRun(sql, params = []) {
    await ensureDbReady();
    if (isMySql()) {
        const [result] = await mysqlPool.query(sql, params);
        return {
            changes: Number(result.affectedRows || 0),
            insertId: Number(result.insertId || 0),
        };
    }

    const result = sqliteDb.prepare(sql).run(...params);
    return {
        changes: Number(result.changes || 0),
        insertId: Number(result.lastInsertRowid || 0),
    };
}

async function runStatements(statements) {
    for (const sql of statements) {
        if (typeof sql === 'string' && sql.trim() !== '') {
            await dbRun(sql);
        }
    }
}

async function syncSeededScript(script) {
    const existing = await dbGet('SELECT id, hmac_key FROM scripts WHERE slug = ?', [script.slug]);
    const resolvedKey = script.envKey || crypto.randomBytes(32).toString('hex');

    if (!existing) {
        await dbRun(
            'INSERT INTO scripts (id, name, slug, hmac_key) VALUES (?, ?, ?, ?)',
            [uuidv4(), script.name, script.slug, resolvedKey]
        );
        console.log(`[DB] Created default script: ${script.name} (slug: ${script.slug})`);
        if (script.envKey) {
            console.log(`[DB] Using ${script.envName} from environment`);
        }
        return;
    }

    if (script.envKey && existing.hmac_key !== script.envKey) {
        await dbRun('UPDATE scripts SET name = ?, hmac_key = ? WHERE slug = ?', [script.name, script.envKey, script.slug]);
        console.log(`[DB] Synced ${script.slug} hmac_key from environment`);
        return;
    }

    await dbRun('UPDATE scripts SET name = ? WHERE slug = ?', [script.name, script.slug]);
}

async function ensureCloudPresetSchema() {
    await ensureDbReady();

    if (isMySql()) {
        await runStatements([
            `CREATE TABLE IF NOT EXISTS cloud_presets (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                script_id CHAR(36) NOT NULL,
                username VARCHAR(64) NOT NULL,
                username_normalized VARCHAR(64) NOT NULL,
                roblox_userid VARCHAR(32) NOT NULL,
                preset_name VARCHAR(96) NOT NULL,
                data_json LONGTEXT NOT NULL,
                last_ip VARCHAR(96) NOT NULL DEFAULT '',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_cloud_owner_preset (script_id, username_normalized, preset_name),
                KEY idx_cloud_presets_owner (script_id, username_normalized, updated_at),
                KEY idx_cloud_presets_userid (script_id, roblox_userid),
                CONSTRAINT fk_cloud_presets_script FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        ]);
        return;
    }

    await runStatements([
        `CREATE TABLE IF NOT EXISTS cloud_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            script_id TEXT NOT NULL,
            username TEXT NOT NULL,
            username_normalized TEXT NOT NULL,
            roblox_userid TEXT NOT NULL,
            preset_name TEXT NOT NULL,
            data_json TEXT NOT NULL,
            last_ip TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
            UNIQUE(script_id, username_normalized, preset_name)
        )`,
        'CREATE INDEX IF NOT EXISTS idx_cloud_presets_owner ON cloud_presets(script_id, username_normalized, updated_at)',
        'CREATE INDEX IF NOT EXISTS idx_cloud_presets_userid ON cloud_presets(script_id, roblox_userid)',
    ]);
}

async function migrate() {
    await ensureDbReady();

    if (isMySql()) {
        await runStatements([
            `CREATE TABLE IF NOT EXISTS admin_users (
                id CHAR(36) PRIMARY KEY,
                username VARCHAR(64) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS scripts (
                id CHAR(36) PRIMARY KEY,
                name VARCHAR(64) NOT NULL,
                slug VARCHAR(64) UNIQUE NOT NULL,
                hmac_key VARCHAR(128) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS sessions (
                id CHAR(36) PRIMARY KEY,
                script_id CHAR(36) NOT NULL,
                roblox_user VARCHAR(64) NOT NULL,
                roblox_userid VARCHAR(32) NOT NULL,
                executor VARCHAR(64) DEFAULT 'Unknown',
                server_jobid VARCHAR(96) DEFAULT '',
                ip_address VARCHAR(96) DEFAULT '',
                first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_heartbeat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                KEY idx_sessions_active (is_active),
                KEY idx_sessions_script (script_id),
                KEY idx_sessions_last_hb (last_heartbeat),
                CONSTRAINT fk_sessions_script FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS heartbeat_log (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                session_id CHAR(36) NOT NULL,
                timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_heartbeat_log_ts (timestamp),
                KEY idx_heartbeat_log_session (session_id),
                CONSTRAINT fk_heartbeat_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS finder_reports (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                script_id CHAR(36) NOT NULL,
                server_jobid VARCHAR(96) NOT NULL,
                place_id VARCHAR(32) DEFAULT '',
                reported_by_user VARCHAR(64) DEFAULT '',
                reported_by_userid VARCHAR(32) DEFAULT '',
                executor VARCHAR(64) DEFAULT 'Unknown',
                player_count INT DEFAULT 0,
                brainrot_key VARCHAR(128) NOT NULL,
                brainrot_name VARCHAR(128) NOT NULL,
                money_per_sec DOUBLE DEFAULT 0,
                discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_finder_key (script_id, server_jobid, brainrot_key),
                KEY idx_finder_reports_script_time (script_id, discovered_at),
                KEY idx_finder_reports_server_time (server_jobid, discovered_at),
                CONSTRAINT fk_finder_script FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS chat_messages (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                script_id CHAR(36) NOT NULL,
                room VARCHAR(32) NOT NULL DEFAULT 'global',
                roblox_user VARCHAR(64) NOT NULL,
                roblox_userid VARCHAR(32) NOT NULL,
                message_content VARCHAR(512) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_chat_script_room_id (script_id, room, id),
                KEY idx_chat_script_room_time (script_id, room, created_at),
                CONSTRAINT fk_chat_script FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        ]);
    } else {
        await runStatements([
            `CREATE TABLE IF NOT EXISTS admin_users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS scripts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                hmac_key TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS sessions (
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
            )`,
            `CREATE TABLE IF NOT EXISTS heartbeat_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                timestamp TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS finder_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                script_id TEXT NOT NULL,
                server_jobid TEXT NOT NULL,
                place_id TEXT DEFAULT '',
                reported_by_user TEXT DEFAULT '',
                reported_by_userid TEXT DEFAULT '',
                executor TEXT DEFAULT 'Unknown',
                player_count INTEGER DEFAULT 0,
                brainrot_key TEXT NOT NULL,
                brainrot_name TEXT NOT NULL,
                money_per_sec REAL DEFAULT 0,
                discovered_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
                UNIQUE(script_id, server_jobid, brainrot_key)
            )`,
            `CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                script_id TEXT NOT NULL,
                room TEXT NOT NULL DEFAULT 'global',
                roblox_user TEXT NOT NULL,
                roblox_userid TEXT NOT NULL,
                message_content TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
            )`,
            'CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_script ON sessions(script_id)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_last_hb ON sessions(last_heartbeat)',
            'CREATE INDEX IF NOT EXISTS idx_heartbeat_log_ts ON heartbeat_log(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_heartbeat_log_session ON heartbeat_log(session_id)',
            'CREATE INDEX IF NOT EXISTS idx_finder_reports_script_time ON finder_reports(script_id, discovered_at)',
            'CREATE INDEX IF NOT EXISTS idx_finder_reports_server_time ON finder_reports(server_jobid, discovered_at)',
            'CREATE INDEX IF NOT EXISTS idx_chat_messages_script_room_id ON chat_messages(script_id, room, id)',
            'CREATE INDEX IF NOT EXISTS idx_chat_messages_script_room_time ON chat_messages(script_id, room, created_at)',
        ]);
    }

    await ensureCloudPresetSchema();

    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || 'changeme123';
    const existingAdmin = await dbGet('SELECT id FROM admin_users WHERE username = ?', [adminUser]);
    if (!existingAdmin) {
        const hash = bcrypt.hashSync(adminPass, 12);
        await dbRun('INSERT INTO admin_users (id, username, password_hash) VALUES (?, ?, ?)', [
            uuidv4(),
            adminUser,
            hash,
        ]);
        console.log(`[DB] Created default admin user: ${adminUser}`);
    }

    const sharedEnvKey = process.env.PANEL_SHARED_HMAC_KEY || process.env.SABNEW_HMAC_KEY || process.env.PANEL_SABNEW_HMAC_KEY;
    const seededScripts = [
        {
            name: 'SAB New',
            slug: 'sabnew',
            envName: 'SABNEW_HMAC_KEY',
            envKey: process.env.SABNEW_HMAC_KEY || process.env.PANEL_SABNEW_HMAC_KEY || sharedEnvKey || 'DSD3213232sfdxzcvxcfhhjgfj',
        },
        {
            name: 'Escape Tsunami',
            slug: 'escape_tsunami',
            envName: 'ESCAPE_TSUNAMI_HMAC_KEY',
            envKey: process.env.ESCAPE_TSUNAMI_HMAC_KEY || process.env.PANEL_ESCAPE_TSUNAMI_HMAC_KEY || sharedEnvKey,
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
        {
            name: 'Forsaken',
            slug: 'forsaken',
            envName: 'FORSAKEN_HMAC_KEY',
            envKey: process.env.FORSAKEN_HMAC_KEY || process.env.PANEL_FORSAKEN_HMAC_KEY || sharedEnvKey || 'DSD3213232sfdxzcvxcfhhjgfj',
        },
        {
            name: 'Jujutsu Shenanigans',
            slug: 'jujutsu-shenanigans',
            envName: 'JUJUTSU_SHENANIGANS_HMAC_KEY',
            envKey: process.env.JUJUTSU_SHENANIGANS_HMAC_KEY || process.env.PANEL_JUJUTSU_SHENANIGANS_HMAC_KEY || sharedEnvKey || 'DSD3213232sfdxzcvxcfhhjgfj',
        },
        {
            name: 'Blox Fruits',
            slug: 'bloxfruits',
            envName: 'BLOXFRUITS_HMAC_KEY',
            envKey: process.env.BLOXFRUITS_HMAC_KEY || process.env.PANEL_BLOXFRUITS_HMAC_KEY || sharedEnvKey || 'DSD3213232sfdxzcvxcfhhjgfj',
        },
    ];

    for (const script of seededScripts) {
        await syncSeededScript(script);
    }

    console.log(`[DB] Migrations complete (${dbKind})`);
}

module.exports = {
    dbAll,
    dbGet,
    dbRun,
    ensureCloudPresetSchema,
    getCutoffDateTime,
    isMySql,
    migrate,
    toDbDateTime,
};
