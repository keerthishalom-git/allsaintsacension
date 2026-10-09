// Gives the admin page the PUBLIC Supabase address + public (anon) key from environment
// variables. The anon key is designed to be public; the database security rules protect the data.
const { env, send } = require('./_lib');

module.exports = (req, res) => {
  const { url, anon } = env();
  if (!url || !anon) return send(res, 500, { error: 'not-configured' }, { 'Cache-Control': 'no-store' });
  send(res, 200, { url, anonKey: anon }, { 'Cache-Control': 'public, max-age=300' });
};
