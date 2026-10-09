// Public content for the website: published events, announcements, and the top banner.
// With ?preview=1 and a signed-in staff token it ALSO returns drafts (the database rules decide).
const { env, send, bearer, sb } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  const { url, anon } = env();
  if (!url || !anon) return send(res, 500, { error: 'not-configured' }, { 'Cache-Control': 'no-store' });

  const preview = String((req.query && req.query.preview) || '') === '1';
  const token = preview ? bearer(req) : '';
  if (preview && !token) return send(res, 401, { error: 'preview-auth' }, { 'Cache-Control': 'no-store' });

  const y = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10); // a little slack; the page filters exactly
  const pub = preview ? '' : '&status=eq.published';
  const opts = { key: anon, token: token || anon };

  try {
    const [ev, an, st] = await Promise.all([
      sb('/rest/v1/events?select=id,title,description,event_date,time_text,location,registration_url,image_url,status&order=event_date.asc,created_at.asc&limit=100&event_date=gte.' + y + pub, opts),
      sb('/rest/v1/announcements?select=id,title,body,category,image_url,link_url,display_date,status&order=display_date.desc,created_at.desc&limit=60' + (preview ? '' : '&status=eq.published'), opts),
      sb('/rest/v1/site_settings?select=key,value', opts)
    ]);
    if (preview && (ev.status === 401 || an.status === 401)) return send(res, 401, { error: 'preview-auth' }, { 'Cache-Control': 'no-store' });
    if (!ev.ok || !an.ok || !st.ok) return send(res, 502, { error: 'upstream' }, { 'Cache-Control': 'no-store' });
    const settings = {};
    (st.data || []).forEach(r => { settings[r.key] = r.value; });
    send(res, 200, { events: ev.data, announcements: an.data, settings, preview },
      { 'Cache-Control': preview ? 'no-store' : 'public, s-maxage=15, stale-while-revalidate=60' });
  } catch (e) {
    send(res, 502, { error: 'upstream' }, { 'Cache-Control': 'no-store' });
  }
};
