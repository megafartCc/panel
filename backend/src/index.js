require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { migrate } = require('./db');
const { initWebSocket } = require('./ws');

const authRoutes = require('./routes/auth');
const heartbeatRoutes = require('./routes/heartbeat');
const scriptsRoutes = require('./routes/scripts');
const sessionsRoutes = require('./routes/sessions');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.set('trust proxy', 1); // Railway runs behind a reverse proxy
app.use(helmet({
    contentSecurityPolicy: false, // React app handles its own CSP
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true
}));
app.use(express.json({ limit: '1kb' })); // Small payload limit — heartbeats are tiny

// Rate limiters
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts, try again later' }
});

const heartbeatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Rate limit exceeded' }
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: 'API rate limit exceeded' }
});

// --- Routes ---
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/heartbeat', heartbeatLimiter, heartbeatRoutes);
app.use('/api/scripts', apiLimiter, scriptsRoutes);
app.use('/api/sessions', apiLimiter, sessionsRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve Lua SDK
const sdkPath = path.join(__dirname, '..', '..', 'sdk', 'panel_sdk.lua');
app.get('/sdk/panel_sdk.lua', (req, res) => {
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
    // 404 handler (dev mode - frontend served by Vite)
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
migrate();
initWebSocket(server);

server.listen(PORT, () => {
    console.log(`\n🚀 Panel backend running on http://localhost:${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
