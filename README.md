# Script Panel — Real-Time Analytics

Real-time dashboard to monitor users of your Lua scripts.

## Stack
- **Backend:** Node.js + Express + SQLite + WebSocket
- **Frontend:** React + TailwindCSS + Recharts
- **Security:** HMAC-SHA256 signed heartbeats, JWT auth, rate limiting

## Deploy on Railway

1. Fork or push this repo to your GitHub
2. Create a new project on [Railway](https://railway.app)
3. Connect your GitHub repo
4. Set these environment variables in Railway:
   - `JWT_SECRET` — random 64-char string
   - `ADMIN_USER` — your admin username
   - `ADMIN_PASS` — your admin password
   - `PORT` — Railway sets this automatically
   - Optional MySQL metrics mirror:
     - `MYSQL_HOST`
     - `MYSQL_PORT` (default `3306`)
     - `MYSQL_USER`
     - `MYSQL_PASSWORD`
     - `MYSQL_DATABASE`
     - `MYSQL_SSL=true` (recommended on Railway)
5. Set the build command: `cd frontend && npm install && npm run build`
6. Set the start command: `cd backend && npm install && node src/index.js`
7. Deploy!

If MySQL variables are set, heartbeat/session connection data is mirrored into `panel_connections` table automatically.

## Local Development

```bash
# Install all deps
cd backend && npm install
cd ../frontend && npm install

# Terminal 1: Backend
cd backend && node src/index.js

# Terminal 2: Frontend (with proxy)
cd frontend && npm run dev
```

Login at `http://localhost:5173` with your admin credentials (default: `admin` / `changeme123`).

## Lua Script Integration

Go to **Scripts** page in the panel → click **Integration** → copy the snippet into your script.

## Project Structure
```
panel/
├── backend/           # Express API server
│   ├── src/
│   │   ├── index.js         # Entry point
│   │   ├── db.js            # SQLite schema & migrations
│   │   ├── ws.js            # WebSocket server
│   │   ├── middleware/      # auth.js, hmac.js
│   │   └── routes/          # auth, heartbeat, scripts, sessions
│   └── package.json
├── frontend/          # React dashboard
│   ├── src/
│   │   ├── pages/           # Login, Dashboard, Scripts
│   │   ├── components/      # Layout, sidebar
│   │   ├── hooks/           # useWebSocket
│   │   └── lib/             # api.js
│   └── package.json
├── sdk/               # Lua heartbeat SDK
│   └── panel_sdk.lua
└── package.json       # Root scripts
```
