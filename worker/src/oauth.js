// TaskNotes Worker - the "connect Claude once with your PIN" part (OAuth 2.1 + PKCE, what Claude's connectors use).
// No database: every code and token is a signed note (HMAC with TOKEN_SECRET). Change TOKEN_SECRET to sign Claude out.
// Optional KV binding LOCKS: 5 wrong PINs = locked for 15 minutes.

const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

async function hmac(secret, text) {
  if (!secret || secret.length < 16) throw new Error('TOKEN_SECRET must be set (at least 16 characters).');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
export async function sign(env, obj) { const body = b64url(enc.encode(JSON.stringify(obj))); return body + '.' + await hmac(env.TOKEN_SECRET, body); }
export async function verify(env, tok, typ) {
  try {
    const [body, sig] = String(tok || '').split('.');
    if (!body || !sig || !same(sig, await hmac(env.TOKEN_SECRET, body))) return null;
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(unb64url(body), c => c.charCodeAt(0))));
    if (o.typ !== typ || !o.exp || Date.now() > o.exp) return null;
    return o;
  } catch (e) { return null; }
}
export function same(a, b) {                      // compare without leaking timing
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
const sha256url = async t => b64url(await crypto.subtle.digest('SHA-256', enc.encode(t)));

// where Claude may send the code back to
export function redirectOk(uri) {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:' && /(^|\.)claude\.(ai|com)$/.test(u.hostname)) return true;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;   // MCP Inspector / Claude Code
    return false;
  } catch (e) { return false; }
}

const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), {status, headers: Object.assign({'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'}, extra)});
const oops = (error, desc, status = 400) => json({error, error_description: desc}, status);

export function metadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: origin + '/authorize',
    token_endpoint: origin + '/token',
    registration_endpoint: origin + '/register',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['tasknotes'],
  };
}
export const resourceMeta = origin => ({resource: origin + '/mcp', authorization_servers: [origin], scopes_supported: ['tasknotes'], bearer_methods_supported: ['header']});

// dynamic client registration: the client id is a signed list of its redirect addresses
export async function register(req, env) {
  let b = {};
  try { b = await req.json(); } catch (e) { /* empty */ }
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
  if (!uris.length || !uris.every(redirectOk)) return oops('invalid_redirect_uri', 'Only Claude (claude.ai / claude.com) or localhost can connect.');
  const client_id = await sign(env, {typ: 'client', ru: uris, exp: Date.now() + 10 * 365 * 86400000});
  return json({client_id, client_name: b.client_name || 'Claude', redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'], token_endpoint_auth_method: 'none', client_id_issued_at: Math.floor(Date.now() / 1000)}, 201);
}

async function checkAuthParams(env, p) {
  if (p.get('response_type') !== 'code') return 'response_type must be code';
  const ru = p.get('redirect_uri') || '';
  if (!redirectOk(ru)) return 'That redirect address is not allowed.';
  const cid = p.get('client_id') || '';
  const c = await verify(env, cid, 'client');
  if (c && !c.ru.includes(ru)) return 'redirect_uri does not match this client.';
  if (!p.get('code_challenge') || (p.get('code_challenge_method') || 'S256') !== 'S256') return 'PKCE (S256) is required.';
  return '';
}

// ---------- the PIN page ----------
const page = (inner) => new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect Claude · TaskNotes</title><style>
:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1622;color:#e8eef6;font:16px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;box-sizing:border-box}
.c{width:100%;max-width:340px;display:flex;flex-direction:column;gap:14px;text-align:center;align-items:center}
.logo{width:68px;height:68px;border-radius:20px;background:#6ea0ff;color:#0f1622;display:grid;place-items:center;font-weight:800;font-size:24px}
h1{margin:0;font-size:22px}p{margin:0;color:#8d9bb0}.err{color:#ff6b6b}
input{width:100%;box-sizing:border-box;background:#18212f;border:1px solid #2a3548;border-radius:14px;padding:14px;color:#e8eef6;font-size:24px;letter-spacing:.4em;text-align:center}
button{width:100%;border:0;border-radius:14px;padding:14px;background:#6ea0ff;color:#0f1622;font-weight:800;font-size:16px;cursor:pointer}
</style></head><body><div class="c"><div class="logo">TN</div>${inner}</div></body></html>`, {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY'}});
const esc = t => String(t).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

function form(params, msg) {
  const hidden = [...params].filter(([k]) => k !== 'pin').map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
  return page(`<h1>Connect Claude to TaskNotes</h1><p>Claude will be able to add, edit and tick off your tasks and notes. Deletes always wait for you.</p>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <form method="post" action="/authorize" style="display:contents">${hidden}
    <input name="pin" type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="••••••" autofocus aria-label="Claude PIN">
    <button>Connect</button></form>`);
}

async function tooMany(env, ip) {
  if (!env.LOCKS) return 0;
  const n = Number(await env.LOCKS.get('fail:' + ip)) || 0;
  return n >= 5;
}
async function failed(env, ip) {
  if (!env.LOCKS) { await new Promise(r => setTimeout(r, 800)); return; }
  const n = (Number(await env.LOCKS.get('fail:' + ip)) || 0) + 1;
  await env.LOCKS.put('fail:' + ip, String(n), {expirationTtl: 900});
}

export async function authorize(req, env) {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const bad = await checkAuthParams(env, url.searchParams);
    if (bad) return page(`<h1>Can't connect</h1><p class="err">${esc(bad)}</p>`);
    return form(url.searchParams, '');
  }
  const p = new URLSearchParams(await req.text());
  const bad = await checkAuthParams(env, p);
  if (bad) return page(`<h1>Can't connect</h1><p class="err">${esc(bad)}</p>`);
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  if (await tooMany(env, ip)) return form(p, 'Too many wrong tries. Wait 15 minutes.');
  if (!env.MCP_PIN || !same(p.get('pin') || '', env.MCP_PIN)) { await failed(env, ip); return form(p, 'Wrong PIN. Try again.'); }
  const code = await sign(env, {typ: 'code', ru: p.get('redirect_uri'), cid: p.get('client_id') || '', cc: p.get('code_challenge'), exp: Date.now() + 5 * 60000});
  const back = new URL(p.get('redirect_uri'));
  back.searchParams.set('code', code);
  if (p.get('state')) back.searchParams.set('state', p.get('state'));
  return Response.redirect(back.toString(), 302);
}

async function pair(env) {
  return {access_token: await sign(env, {typ: 'at', exp: Date.now() + 3600 * 1000}), token_type: 'Bearer', expires_in: 3600,
    refresh_token: await sign(env, {typ: 'rt', exp: Date.now() + 90 * 86400000}), scope: 'tasknotes'};
}
export async function tokenEndpoint(req, env) {
  const ct = req.headers.get('Content-Type') || '';
  const p = ct.includes('json') ? new URLSearchParams(await req.json()) : new URLSearchParams(await req.text());
  const g = p.get('grant_type');
  if (g === 'authorization_code') {
    const c = await verify(env, p.get('code'), 'code');
    if (!c) return oops('invalid_grant', 'The code is wrong or too old.');
    if (p.get('redirect_uri') && p.get('redirect_uri') !== c.ru) return oops('invalid_grant', 'redirect_uri does not match.');
    if (!p.get('code_verifier') || await sha256url(p.get('code_verifier')) !== c.cc) return oops('invalid_grant', 'PKCE check failed.');
    return json(await pair(env));
  }
  if (g === 'refresh_token') {
    if (!await verify(env, p.get('refresh_token'), 'rt')) return oops('invalid_grant', 'Please connect again.');
    return json(await pair(env));
  }
  return oops('unsupported_grant_type', 'Use authorization_code or refresh_token.');
}
export const bearerOk = async (req, env) => !!await verify(env, (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), 'at');
