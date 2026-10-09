// Admin-only user management. Every call is checked on the server: the caller must be
// a signed-in, active Admin. The powerful service key never leaves the server.
const { send, sb, requireAdmin, tempPassword } = require('./_lib');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = ['admin', 'editor'];

async function activeAdminCountExcluding(service, id) {
  const r = await sb('/rest/v1/profiles?select=id&role=eq.admin&active=eq.true&id=neq.' + encodeURIComponent(id), { key: service });
  return r.ok && Array.isArray(r.data) ? r.data.length : 0;
}

async function getProfile(service, id) {
  const r = await sb('/rest/v1/profiles?select=*&id=eq.' + encodeURIComponent(id), { key: service });
  return r.ok && Array.isArray(r.data) ? r.data[0] : null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const a = await requireAdmin(req);
  if (a.error) return send(res, a.error[0], { error: a.error[1] });
  const { service, userId } = a;
  const body = (req.body && typeof req.body === 'object') ? req.body : {};

  try {
    // ---- Add a person --------------------------------------------------
    if (req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.full_name || '').trim().slice(0, 100);
      const role = String(body.role || 'editor');
      if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'Please enter a valid email address.' });
      if (!ROLES.includes(role)) return send(res, 400, { error: 'Please choose Admin or Editor.' });
      const pw = tempPassword();
      const created = await sb('/auth/v1/admin/users', { method: 'POST', key: service, body: { email, password: pw, email_confirm: true } });
      if (!created.ok) {
        const msg = JSON.stringify(created.data || '').toLowerCase();
        if (created.status === 422 || msg.includes('already')) return send(res, 409, { error: 'Someone with that email already exists.' });
        return send(res, 502, { error: 'Could not create the account. Please try again.' });
      }
      const newId = created.data.id;
      const prof = await sb('/rest/v1/profiles?on_conflict=id', {
        method: 'POST', key: service, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: { id: newId, email, full_name: name || null, role, active: true, must_change_password: true }
      });
      if (!prof.ok) {
        await sb('/auth/v1/admin/users/' + newId, { method: 'DELETE', key: service });
        return send(res, 502, { error: 'Could not finish creating the account. Please try again.' });
      }
      return send(res, 200, { ok: true, id: newId, email, tempPassword: pw });
    }

    // ---- Change a person -----------------------------------------------
    if (req.method === 'PATCH') {
      const id = String(body.id || '');
      const target = id && await getProfile(service, id);
      if (!target) return send(res, 404, { error: 'That person was not found.' });
      const self = id === userId;
      const patch = {};
      let out = { ok: true };

      if (body.full_name !== undefined) patch.full_name = String(body.full_name).trim().slice(0, 100) || null;

      if (body.role !== undefined && body.role !== target.role) {
        if (!ROLES.includes(body.role)) return send(res, 400, { error: 'Please choose Admin or Editor.' });
        if (self) return send(res, 400, { error: 'You cannot change your own role.' });
        if (target.role === 'admin' && target.active && await activeAdminCountExcluding(service, id) < 1)
          return send(res, 400, { error: 'There must always be at least one Admin.' });
        patch.role = body.role;
      }

      if (body.active !== undefined && !!body.active !== target.active) {
        if (self) return send(res, 400, { error: 'You cannot turn off your own account.' });
        if (!body.active && target.role === 'admin' && await activeAdminCountExcluding(service, id) < 1)
          return send(res, 400, { error: 'There must always be at least one Admin.' });
        patch.active = !!body.active;
        await sb('/auth/v1/admin/users/' + id, { method: 'PUT', key: service, body: { ban_duration: body.active ? 'none' : '876000h' } });
      }

      if (body.reset_password) {
        if (self) return send(res, 400, { error: 'Use "Change my password" for your own account.' });
        const pw = tempPassword();
        const r = await sb('/auth/v1/admin/users/' + id, { method: 'PUT', key: service, body: { password: pw } });
        if (!r.ok) return send(res, 502, { error: 'Could not reset the password. Please try again.' });
        patch.must_change_password = true;
        out.tempPassword = pw;
      }

      if (Object.keys(patch).length) {
        const r = await sb('/rest/v1/profiles?id=eq.' + encodeURIComponent(id), { method: 'PATCH', key: service, headers: { Prefer: 'return=minimal' }, body: patch });
        if (!r.ok) return send(res, 502, { error: 'Could not save the change. Please try again.' });
      }
      return send(res, 200, out);
    }

    // ---- Remove a person -----------------------------------------------
    if (req.method === 'DELETE') {
      const id = String(body.id || (req.query && req.query.id) || '');
      const target = id && await getProfile(service, id);
      if (!target) return send(res, 404, { error: 'That person was not found.' });
      if (id === userId) return send(res, 400, { error: 'You cannot remove your own account.' });
      if (target.role === 'admin' && target.active && await activeAdminCountExcluding(service, id) < 1)
        return send(res, 400, { error: 'There must always be at least one Admin.' });
      const r = await sb('/auth/v1/admin/users/' + id, { method: 'DELETE', key: service });
      if (!r.ok) return send(res, 502, { error: 'Could not remove the account. Please try again.' });
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    return send(res, 500, { error: 'Something went wrong. Please try again.' });
  }
};
