const crypto = require('crypto');
const { getDb } = require('../db');

function verifyHmac(req, res, next) {
    const { script, userid, timestamp, signature } = req.body;

    // Validate required fields
    if (!script || !userid || !timestamp || !signature) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate timestamp (reject if older than 60 seconds)
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(now - ts) > 60) {
        return res.status(403).json({ error: 'Invalid or expired timestamp' });
    }

    // Look up the script's HMAC key
    const db = getDb();
    const scriptRow = db.prepare('SELECT id, hmac_key FROM scripts WHERE slug = ?').get(script);
    if (!scriptRow) {
        return res.status(404).json({ error: 'Unknown script' });
    }

    // Verify HMAC: sign "{script}:{userid}:{timestamp}"
    const message = `${script}:${userid}:${timestamp}`;
    const expectedSig = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'))) {
        return res.status(403).json({ error: 'Invalid signature' });
    }

    // Attach script info to request
    req.scriptRow = scriptRow;
    next();
}

module.exports = { verifyHmac };
