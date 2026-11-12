// Daily keep-alive. A Vercel scheduled job (see vercel.json) calls this once a day so the free
// Supabase database always has recent activity and is not paused for inactivity.
// It only reads one harmless public row. It returns an error status if the database is not reachable,
// which shows up in Vercel's logs.
const { env, send, sb } = require('./_lib');

module.exports = async (req, res) => {
  const { url, anon } = env();
  if (!url || !anon) return send(res, 500, { ok: false, error: 'not-configured' }, { 'Cache-Control': 'no-store' });
  try {
    const r = await sb('/rest/v1/site_settings?select=key&limit=1', { key: anon });
    if (!r.ok) return send(res, 502, { ok: false, status: r.status }, { 'Cache-Control': 'no-store' });
    send(res, 200, { ok: true, at: new Date().toISOString() }, { 'Cache-Control': 'no-store' });
  } catch (e) {
    send(res, 502, { ok: false, error: 'unreachable' }, { 'Cache-Control': 'no-store' });
  }
};
