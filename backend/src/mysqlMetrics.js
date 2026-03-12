const mysql = require('mysql2/promise');

let pool;
let ready = false;

function mysqlEnabled() {
    return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

async function initMySqlMetrics() {
    if (!mysqlEnabled()) {
        return;
    }

    pool = mysql.createPool({
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
        queueLimit: 0,
        ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });

    await pool.execute(`
        CREATE TABLE IF NOT EXISTS panel_connections (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(64) NOT NULL,
            script_slug VARCHAR(64) NOT NULL,
            roblox_user VARCHAR(255) NOT NULL,
            roblox_userid VARCHAR(64) NOT NULL,
            executor VARCHAR(128) DEFAULT 'Unknown',
            server_jobid VARCHAR(255) DEFAULT '',
            ip_address VARCHAR(64) DEFAULT '',
            first_seen DATETIME NOT NULL,
            last_heartbeat DATETIME NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_session_id (session_id),
            INDEX idx_script_slug (script_slug),
            INDEX idx_last_heartbeat (last_heartbeat),
            INDEX idx_is_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    ready = true;
    console.log('[MySQL] Metrics writer enabled');
}

async function upsertConnectionMetric(payload) {
    if (!ready || !pool) return;

    const sql = `
        INSERT INTO panel_connections
            (session_id, script_slug, roblox_user, roblox_userid, executor, server_jobid, ip_address, first_seen, last_heartbeat, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            script_slug = VALUES(script_slug),
            roblox_user = VALUES(roblox_user),
            roblox_userid = VALUES(roblox_userid),
            executor = VALUES(executor),
            server_jobid = VALUES(server_jobid),
            ip_address = VALUES(ip_address),
            first_seen = LEAST(first_seen, VALUES(first_seen)),
            last_heartbeat = VALUES(last_heartbeat),
            is_active = VALUES(is_active)
    `;

    try {
        await pool.execute(sql, [
            payload.sessionId,
            payload.scriptSlug,
            payload.robloxUser,
            payload.robloxUserId,
            payload.executor || 'Unknown',
            payload.serverJobId || '',
            payload.ipAddress || '',
            payload.firstSeen,
            payload.lastHeartbeat,
            payload.isActive ? 1 : 0,
        ]);
    } catch (error) {
        console.error('[MySQL] Failed to upsert metric:', error.message);
    }
}

module.exports = {
    initMySqlMetrics,
    upsertConnectionMetric,
    mysqlEnabled,
};
