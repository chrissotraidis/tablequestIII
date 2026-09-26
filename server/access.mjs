// Optional shared password for a public host. Set TQ_ACCESS_PASSWORD and every
// page, API call and Arena socket needs a sign-in cookie; unset, nothing changes.
import { createHmac, timingSafeEqual } from 'node:crypto';

const PASSWORD = process.env.TQ_ACCESS_PASSWORD || '';
const COOKIE = 'tq_access';
const MAX_AGE = 30 * 24 * 3600;
const sign = (value) => createHmac('sha256', value).update('tablequest-access-v1').digest('base64url');
const TOKEN = PASSWORD ? sign(PASSWORD) : '';
export const accessEnabled = Boolean(PASSWORD);

const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
function cookie(req) {
    const entry = String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
    return entry ? entry.slice(COOKIE.length + 1) : '';
}
export function hasAccess(req) { return !accessEnabled || same(cookie(req), TOKEN); }

// Coarse brute-force brake per connecting address (a shared proxy shares it).
const attempts = new Map();
function limited(req) {
    const key = req.socket.remoteAddress || '?', now = Date.now();
    if (attempts.size > 1000) for (const [k, v] of attempts) if (now - v.start > 60000) attempts.delete(k);
    let record = attempts.get(key);
    if (!record || now - record.start > 60000) attempts.set(key, record = { start: now, count: 0 });
    return ++record.count > 20;
}
const safeNext = (value) => (typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : '/');
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(res, status, next, error = '') {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Table Quest</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 30%,#2a1c10,#08090c 70%);color:#f2e2c0;font:15px Arial,sans-serif}
form{width:min(360px,calc(100% - 40px));padding:28px 30px;background:linear-gradient(135deg,#23180ef5,#100e0bf5);border:1px solid #80613a;border-top:3px solid #c9a227;box-shadow:0 20px 80px #000a}
small{letter-spacing:2px;color:#cbb387;font-size:11px}h1{font:italic 36px Georgia,serif;color:#f1d5ad;margin:8px 0 18px;text-shadow:2px 3px #291306}
label{display:grid;gap:6px;font-size:11px;letter-spacing:1px;color:#d6be95}input{padding:11px;border:1px solid #886b45;border-radius:3px;background:#130f0b;color:#f2e2c0;font:16px Arial,sans-serif}
button{margin-top:16px;width:100%;min-height:44px;border:1px solid #e4c383;border-radius:3px;background:#c7a15b;color:#211609;font:700 15px Arial,sans-serif;cursor:pointer}button:hover{background:#e4c383}
p{margin:12px 0 0;color:#ff9c8a;font-size:13px}input:focus-visible,button:focus-visible{outline:2px solid #f5d883;outline-offset:3px}</style></head>
<body><form method="post" action="/login"><small>ARTISAN SOFTWARE PRESENTS</small><h1>Table Quest</h1>
<label>PASSWORD<input name="password" type="password" autocomplete="current-password" autofocus required></label>
<input type="hidden" name="next" value="${escape(next)}"><button>Enter</button>${error ? `<p role="alert">${escape(error)}</p>` : ''}</form></body></html>`);
}

function readForm(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; if (body.length > 4096) { reject(new Error('too large')); req.destroy(); } });
        req.on('end', () => resolve(new URLSearchParams(body)));
        req.on('error', reject);
    });
}

/** Returns true when it answered the request (sign-in page, login, or refusal). */
export async function handleAccess(req, res, url) {
    if (!accessEnabled) return false;
    if (url.pathname === '/login' && req.method === 'POST') {
        if (limited(req)) { res.writeHead(429, { 'retry-after': '60', 'content-type': 'text/plain' }); res.end('Too many attempts. Try again in a minute.'); return true; }
        const form = await readForm(req).catch(() => new URLSearchParams());
        const next = safeNext(form.get('next'));
        if (!same(sign(form.get('password') || ''), TOKEN)) { page(res, 401, next, 'That password is not right.'); return true; }
        const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
        res.writeHead(303, { location: next, 'set-cookie': `${COOKIE}=${TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}` });
        res.end();
        return true;
    }
    if (hasAccess(req)) return false;
    if (url.pathname.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"Password required"}'); return true; }
    page(res, 401, url.pathname + url.search);
    return true;
}
