// TaskNotes Worker - talking to Google Sheets with a service account (a "robot" Google account).
// The Sheet is shared with the robot's email once, so no Google login is ever needed on the phone.
import {TABS, COLS, fromValues, toValues} from './data.js';

let cached = {token: '', exp: 0};
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = t => b64url(new TextEncoder().encode(t));

function account(env) {
  let sa;
  try { sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT || ''); } catch (e) { throw new Error('GOOGLE_SERVICE_ACCOUNT is missing or not valid JSON.'); }
  if (!sa.client_email || !sa.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT needs client_email and private_key.');
  return sa;
}

async function token(env, fetcher = fetch) {
  if (cached.token && Date.now() < cached.exp - 60000) return cached.token;
  const sa = account(env);
  const now = Math.floor(Date.now() / 1000);
  const head = b64urlText(JSON.stringify({alg: 'RS256', typ: 'JWT'}));
  const claim = b64urlText(JSON.stringify({iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600}));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + claim));
  const r = await fetcher('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + claim + '.' + b64url(sig)});
  const j = await r.json();
  if (!r.ok) throw new Error('Google sign-in for the robot failed: ' + (j.error_description || j.error || r.status));
  cached = {token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000};
  return cached.token;
}

async function api(env, path, opts = {}, fetcher = fetch) {
  if (!env.SHEET_ID) throw new Error('SHEET_ID is not set.');
  const r = await fetcher('https://sheets.googleapis.com/v4/spreadsheets/' + env.SHEET_ID + path, Object.assign({}, opts,
    {headers: Object.assign({Authorization: 'Bearer ' + await token(env, fetcher), 'Content-Type': 'application/json'}, opts.headers || {})}));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || r.status;
    if (r.status === 403 || r.status === 404) throw new Error('The robot cannot open the Sheet. Share the Sheet with the robot email as Editor. (' + msg + ')');
    throw new Error('Google Sheets: ' + msg);
  }
  return j;
}

// the whole Sheet as {tasks, notes, cats}. Missing tabs are made.
export async function readAll(env, fetcher = fetch) {
  const ranges = Object.values(TABS).map(t => 'ranges=' + encodeURIComponent(t + '!A1:Z')).join('&');
  let j;
  try { j = await api(env, '/values:batchGet?' + ranges + '&valueRenderOption=FORMATTED_VALUE', {}, fetcher); }
  catch (e) {
    if (!/Unable to parse range/i.test(e.message)) throw e;
    await makeTabs(env, fetcher);
    j = await api(env, '/values:batchGet?' + ranges + '&valueRenderOption=FORMATTED_VALUE', {}, fetcher);
  }
  const out = {};
  Object.keys(TABS).forEach((k, i) => { out[k] = fromValues(k, (j.valueRanges[i] || {}).values || []); });
  return out;
}

async function makeTabs(env, fetcher) {
  const meta = await api(env, '?fields=sheets.properties.title', {}, fetcher);
  const have = new Set(meta.sheets.map(s => s.properties.title));
  const add = Object.values(TABS).filter(t => !have.has(t)).map(title => ({addSheet: {properties: {title}}}));
  if (add.length) await api(env, ':batchUpdate', {method: 'POST', body: JSON.stringify({requests: add})}, fetcher);
}

// write the whole Sheet back (it is small), then clear any old rows under it
export async function writeAll(env, snap, fetcher = fetch) {
  const data = Object.entries(TABS).map(([k, tab]) => ({range: tab + '!A1', values: toValues(k, snap[k])}));
  await api(env, '/values:batchUpdate', {method: 'POST', body: JSON.stringify({valueInputOption: 'RAW', data})}, fetcher);
  const clear = Object.entries(TABS).map(([k, tab]) => `${tab}!A${snap[k].length + 2}:Z`);
  await api(env, '/values:batchClear', {method: 'POST', body: JSON.stringify({ranges: clear})}, fetcher);
}

export const _test = {reset: () => { cached = {token: '', exp: 0}; }, COLS};
