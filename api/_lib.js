// Shared helpers for the API functions. Files starting with "_" are not public endpoints.
const crypto = require('crypto');

function env() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, anon, service };
}

function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const k in (headers || {})) res.setHeader(k, headers[k]);
  res.end(JSON.stringify(body));
}

function bearer(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : '';
}

// Calls Supabase's REST / Auth APIs. `key` is the apikey; `token` is the Bearer token.
async function sb(path, { method = 'GET', key, token, body, headers } = {}) {
  const { url } = env();
  const r = await fetch(url + path, {
    method,
    headers: Object.assign({
      apikey: key,
      Authorization: 'Bearer ' + (token || key),
      'Content-Type': 'application/json'
    }, headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  const text = await r.text();
  if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
  return { ok: r.ok, status: r.status, data };
}

// Works out who is calling and whether they are an active Admin. Never trusts the browser.
async function requireAdmin(req) {
  const { url, anon, service } = env();
  if (!url || !anon || !service) return { error: [500, 'The website is not fully set up yet (missing server settings).'] };
  const token = bearer(req);
  if (!token) return { error: [401, 'Please sign in again.'] };
  const who = await sb('/auth/v1/user', { key: anon, token });
  if (!who.ok || !who.data || !who.data.id) return { error: [401, 'Your session has expired. Please sign in again.'] };
  const p = await sb('/rest/v1/profiles?select=id,role,active&id=eq.' + encodeURIComponent(who.data.id), { key: service });
  const prof = p.ok && Array.isArray(p.data) ? p.data[0] : null;
  if (!prof || !prof.active) return { error: [403, 'Your account does not have access.'] };
  if (prof.role !== 'admin') return { error: [403, 'Only an Admin can do this.'] };
  return { userId: who.data.id, service };
}

function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) {
    if (i && i % 4 === 0) out += '-';
    out += chars[crypto.randomInt(chars.length)];
  }
  return out;
}

module.exports = { env, send, bearer, sb, requireAdmin, tempPassword };
