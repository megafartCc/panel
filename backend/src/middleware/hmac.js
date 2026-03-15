const crypto = require('crypto');
const { dbGet } = require('../db');

async function verifyHmac(req, res, next) {
    try {
        const { script, userid, timestamp, signature } = req.body;

        if (!script || !userid || !timestamp || !signature) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const now = Math.floor(Date.now() / 1000);
        const ts = parseInt(timestamp, 10);
        if (isNaN(ts) || Math.abs(now - ts) > 60) {
            return res.status(403).json({ error: 'Invalid or expired timestamp' });
        }

        const scriptRow = await dbGet('SELECT id, hmac_key FROM scripts WHERE slug = ?', [script]);
        if (!scriptRow) {
            return res.status(404).json({ error: 'Unknown script' });
        }

        const message = `${script}:${userid}:${timestamp}`;
        const expectedSig = crypto.createHmac('sha256', scriptRow.hmac_key).update(message).digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'))) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        req.scriptRow = scriptRow;
        next();
    } catch (err) {
        console.error('[HMAC] Verification error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = { verifyHmac };
