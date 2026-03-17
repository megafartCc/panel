require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const { migrate } = require('./db');
const { init } = require('./ws');

const authRoutes = require('./routes/auth');
const heartbeatRoutes = require('./routes/heartbeat');
const scriptsRoutes = require('./routes/scripts');
const sessionsRoutes = require('./routes/sessions');
const finderRoutes = require('./routes/finder');
const cloudRoutes = require('./routes/cloud');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true
}));
app.use(express.json({ limit: '64kb' }));

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/heartbeat', heartbeatRoutes);
app.use('/api/scripts', scriptsRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/finder', finderRoutes);
app.use('/api/cloud', cloudRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve Lua SDK
const sdkPath = path.join(__dirname, '..', '..', 'sdk', 'panel_sdk.lua');
app.get(['/sdk/panel_sdk.lua', '/sdk/monitor_sdk.lua'], (req, res) => {
    if (fs.existsSync(sdkPath)) {
        res.type('text/plain').sendFile(sdkPath);
    } else {
        res.status(404).send('-- SDK not found');
    }
});

// Serve frontend build in production
const frontendBuild = path.join(__dirname, '..', '..', 'frontend', 'dist');
console.log(`[Static] Looking for frontend build at: ${frontendBuild}`);
console.log(`[Static] Exists: ${fs.existsSync(frontendBuild)}`);
if (fs.existsSync(frontendBuild)) {
    app.use(express.static(frontendBuild));
    app.get('*', (req, res) => {
        res.sendFile(path.join(frontendBuild, 'index.html'));
    });
} else {
    app.use((req, res) => {
        res.status(404).json({ error: 'Not found' });
    });
}

// Error handler
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// --- Start ---
(async () => {
    try {
        await migrate();
        init(); // starts the stale session cleanup timer

        app.listen(PORT, () => {
            console.log(`\nPanel running on http://localhost:${PORT}`);
            console.log(`   Health: http://localhost:${PORT}/api/health\n`);
        });
    } catch (err) {
        console.error('[Startup] Failed to initialize backend:', err.message);
        process.exit(1);
    }
})();
