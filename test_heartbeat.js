// Debug script — simulates a Lua script sending a heartbeat to the panel backend
// Run: node test_heartbeat.js

const crypto = require('crypto');

const PANEL_URL = 'https://panel-production-dd46.up.railway.app';
const SCRIPT_SLUG = 'sabnew';
const HMAC_KEY = '7b958df78041586523a225ca164b6417f6dc764a64a0fbcef28e4ecd6c191c10';

const USER = 'TestPlayer123';
const USERID = '999888777';
const EXECUTOR = 'DebugTest';

async function sendHeartbeat() {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `${SCRIPT_SLUG}:${USERID}:${timestamp}`;
    const signature = crypto.createHmac('sha256', HMAC_KEY).update(message).digest('hex');

    const body = JSON.stringify({
        script: SCRIPT_SLUG,
        user: USER,
        userid: USERID,
        executor: EXECUTOR,
        jobid: 'debug-test-job',
        timestamp,
        signature
    });

    console.log('--- Sending heartbeat ---');
    console.log('URL:', PANEL_URL + '/api/heartbeat');
    console.log('Body:', body);
    console.log('HMAC message:', message);
    console.log('Signature:', signature);
    console.log('');

    try {
        const res = await fetch(PANEL_URL + '/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        });

        const text = await res.text();
        console.log('Status:', res.status);
        console.log('Response:', text);

        if (res.ok) {
            console.log('\n✅ Heartbeat SUCCESS! Check your dashboard.');
        } else {
            console.log('\n❌ Heartbeat FAILED');
        }
    } catch (err) {
        console.error('❌ Network error:', err.message);
    }
}

sendHeartbeat();
