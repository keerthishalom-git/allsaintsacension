/* ============================================================
   Website Admin for All Saints and Ascension.
   All permissions are enforced by the database (Row Level
   Security) and the /api/users function. This file only draws
   the screens; hiding a button here is a convenience, never the
   security.
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'asa-admin-auth';
  var IDLE_MS = 60 * 60 * 1000;           // sign out after 60 minutes of no activity
  var CATEGORIES = ['Community', 'Worship', 'Food Pantry', 'Youth', 'Outreach', 'Parish Life', 'Music'];
  var TIMES = ['9:00 AM', '10:00 AM', '12:00 PM', '6:00 PM', 'After Service', 'All Day'];

  var sb = null;          // supabase client
  var me = null;          // my profile row
  var recovery = /type=recovery/.test(location.hash);
  var dirty = false;
  var idleTimer = null;
  var app = document.getElementById('app');

  /* ---------- tiny helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function today() { return new Date().toLocaleDateString('en-CA'); }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtLong(s) { return parseDate(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
  function monthAbbr(s) { return parseDate(s).toLocaleDateString('en-US', { month: 'short' }); }
  function dayNum(s) { return parseDate(s).getDate(); }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function isAdmin() { return me && me.role === 'admin'; }

  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, kind === 'err' ? 7000 : 3500);
  }

  function friendly(err) {
    var m = String((err && (err.message || err.error_description || err.error)) || err || '').toLowerCase();
    var code = err && err.code;
    if (code === '42501' || m.indexOf('row-level security') > -1 || m.indexOf('permission') > -1) return "You don't have permission to do that.";
    if (m.indexOf('banned') > -1) return "Your account doesn't have access to the admin area. Please contact the parish office.";
    if (m.indexOf('invalid login') > -1 || m.indexOf('invalid credentials') > -1) return "That email or password isn't right. Please try again.";
    if (m.indexOf('failed to fetch') > -1 || m.indexOf('network') > -1) return "We couldn't reach the server. Please check your internet and try again.";
    if (m.indexOf('jwt') > -1 || m.indexOf('expired') > -1) return 'Your session has ended. Please sign in again.';
    if (m.indexOf('rate limit') > -1 || m.indexOf('too many') > -1) return 'Too many tries. Please wait a few minutes and try again.';
    if (m.indexOf('same password') > -1 || m.indexOf('different from the old') > -1) return 'Please choose a password you have not used before.';
    if (m.indexOf('weak') > -1 || m.indexOf('at least') > -1) return 'That password is too short or too easy to guess. Please try a longer one.';
    if (m.indexOf('too large') > -1 || m.indexOf('size') > -1 && m.indexOf('exceed') > -1) return 'That photo is too large. Please choose a smaller one.';
    return 'Something went wrong. Please try again.';
  }

  // Our own photo messages are already friendly; anything else is translated.
  function errMsg(e) { return e && e.message && /^Please choose a photo|^Could not read|^That photo is too large/.test(e.message) ? e.message : friendly(e); }

  function confirmBox(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      var o = document.createElement('div');
      o.className = 'overlay';
      o.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>' +
        '<div class="btns"><button class="btn ghost" data-r="0">Cancel</button><button class="btn ' + (danger ? 'danger' : '') + '" data-r="1">' + esc(okLabel || 'OK') + '</button></div></div>';
      o.addEventListener('click', function (e) {
        var b = e.target.closest('[data-r]');
        if (b || e.target === o) { o.remove(); resolve(!!b && b.dataset.r === '1'); }
      });
      document.body.appendChild(o);
      $('[data-r="0"]', o).focus();
    });
  }

  function infoBox(title, html, okLabel) {
    return new Promise(function (resolve) {
      var o = document.createElement('div');
      o.className = 'overlay';
      o.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h2>' + esc(title) + '</h2>' + html +
        '<div class="btns"><button class="btn" data-r="1">' + esc(okLabel || 'Done') + '</button></div></div>';
      o.addEventListener('click', function (e) {
        if (e.target.closest('[data-r]')) { o.remove(); resolve(); }
        var c = e.target.closest('[data-copy]');
        if (c) { copyText(c.dataset.copy); toast('Copied', 'ok'); }
      });
      document.body.appendChild(o);
    });
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(function () {});
    else { var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); }
  }

  function setBusy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.l = btn.textContent; btn.textContent = label || 'Please wait…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.l || btn.textContent; btn.disabled = false; }
  }

  async function token() {
    var r = await sb.auth.getSession();
    return r.data && r.data.session ? r.data.session.access_token : '';
  }

  async function api(method, body) {
    var r = await fetch('/api/users', {
      method: method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await token()) },
      body: JSON.stringify(body || {})
    });
    var data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  /* ---------- boot ---------- */
  async function boot() {
    var cfg;
    try {
      var r = await fetch('/api/config');
      if (!r.ok) throw new Error('config');
      cfg = await r.json();
    } catch (e) {
      app.innerHTML = '<div class="login-wrap"><div class="login-card"><h2>Almost ready</h2>' +
        '<p>The admin area is not connected to its database yet. If you are setting this up, follow the README (step: add the Supabase settings in Vercel).</p></div></div>';
      return;
    }
    sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { storageKey: STORE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'PASSWORD_RECOVERY') { recovery = true; }
      if (ev === 'SIGNED_OUT') { me = null; }
    });
    var s = await sb.auth.getSession();
    if (s.data.session && !recovery && tooIdle()) {
      await logout('You were signed out after a long time away, to keep the website safe.');
      return;
    }
    if (s.data.session) {
      if (recovery) { await loadMe(); return renderForcedPassword(true); }
      var ok = await loadMe();
      if (ok) return start();
    }
    renderLogin();
  }

  async function loadMe() {
    var s = await sb.auth.getSession();
    if (!s.data.session) return false;
    var r = await sb.from('profiles').select('*').eq('id', s.data.session.user.id).maybeSingle();
    if (r.error || !r.data || !r.data.active) {
      await sb.auth.signOut();
      me = null;
      return false;
    }
    me = r.data;
    return true;
  }

  function start() {
    if (me.must_change_password) return renderForcedPassword(false);
    armIdle();
    renderShell();
    route();
  }

  /* ---------- idle sign-out ---------- */
  // The time of the last activity is saved in the browser, so closing the tab and coming back
  // later (without pressing Sign Out) still ends the session once 60 minutes have passed.
  var ACT_KEY = 'asa-admin-last';
  function lastActive() { try { return parseInt(localStorage.getItem(ACT_KEY) || '0', 10); } catch (e) { return 0; } }
  function markActive() { try { localStorage.setItem(ACT_KEY, String(Date.now())); } catch (e) {} }
  function tooIdle() { var t = lastActive(); return !!t && Date.now() - t > IDLE_MS; }

  function armIdle() {
    var lastMark = 0;
    function act() { var n = Date.now(); if (n - lastMark > 15000) { lastMark = n; markActive(); } }
    ['click', 'keydown', 'touchstart', 'mousemove', 'scroll'].forEach(function (e) { document.addEventListener(e, act, { passive: true }); });
    markActive();
    clearInterval(idleTimer);
    idleTimer = setInterval(function () { if (tooIdle()) logout('You were signed out after a long time away, to keep the website safe.'); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && tooIdle()) logout('You were signed out after a long time away, to keep the website safe.'); });
  }

  async function logout(msg) {
    dirty = false;
    clearInterval(idleTimer);
    try { localStorage.removeItem(ACT_KEY); } catch (e) {}
    try { await sb.auth.signOut(); } catch (e) {}
    me = null;
    location.hash = '';
    renderLogin(msg);
  }

  /* ---------- login / forgot / password ---------- */
  function brand() {
    return '<div class="brand"><img src="/logo.png" alt=""/><div class="n">All Saints and Ascension</div><div class="s">Website Admin</div></div>';
  }

  function renderLogin(message, kind) {
    document.title = 'Sign in · Website Admin';
    app.innerHTML = '<div class="login-wrap"><form class="login-card" id="loginForm" novalidate>' + brand() +
      (message ? '<div class="notice ' + (kind || 'info') + '" role="alert">' + esc(message) + '</div>' : '') +
      '<label for="em">Email</label><input type="email" id="em" autocomplete="username" required/>' +
      '<label for="pw">Password</label><input type="password" id="pw" autocomplete="current-password" required/>' +
      '<div style="margin-top:24px"><button class="btn big" type="submit">Sign In</button></div>' +
      '<div style="text-align:center;margin-top:10px"><button type="button" class="linkish" data-act="forgot">Forgot your password?</button></div>' +
      '</form></div>';
    $('#em').focus();
    $('#loginForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = $('#em').value.trim(), pw = $('#pw').value, btn = $('button[type=submit]', this);
      if (!email || !pw) return renderLoginKeep(email, 'Please enter your email and password.', 'err');
      setBusy(btn, true, 'Signing in…');
      var r = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (r.error) { return renderLoginKeep(email, friendly(r.error), 'err'); }
      var ok = await loadMe();
      if (!ok) return renderLoginKeep(email, "Your account doesn't have access to the admin area. Please contact the parish office.", 'err');
      start();
    });
  }
  function renderLoginKeep(email, msg, kind) { renderLogin(msg, kind); $('#em').value = email || ''; $('#pw').focus(); }

  function renderForgot() {
    app.innerHTML = '<div class="login-wrap"><form class="login-card" id="fgForm" novalidate>' + brand() +
      '<h2>Reset your password</h2><p>Type your email and we will send you a link to choose a new password.</p>' +
      '<label for="em">Email</label><input type="email" id="em" autocomplete="username" required/>' +
      '<div style="margin-top:24px"><button class="btn big" type="submit">Send Me the Link</button></div>' +
      '<div style="text-align:center;margin-top:10px"><button type="button" class="linkish" data-act="tologin">Back to sign in</button></div></form></div>';
    $('#em').focus();
    $('#fgForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = $('#em').value.trim(), btn = $('button[type=submit]', this);
      if (!email) return toast('Please enter your email.', 'err');
      setBusy(btn, true, 'Sending…');
      await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/admin/' });
      renderLogin('If that email has an account, a link is on its way. If nothing arrives in a few minutes, ask an Admin to reset your password.', 'ok');
    });
  }

  function renderForcedPassword(isRecovery) {
    app.innerHTML = '<div class="login-wrap"><form class="login-card" id="npForm" novalidate>' + brand() +
      '<h2>' + (isRecovery ? 'Choose a new password' : 'Welcome! Choose your own password') + '</h2>' +
      '<p>' + (isRecovery ? '' : 'For your safety, please replace the temporary password you were given. ') + 'Use at least 10 characters.</p>' +
      '<label for="p1">New password</label><input type="password" id="p1" autocomplete="new-password"/>' +
      '<label for="p2">Type it again</label><input type="password" id="p2" autocomplete="new-password"/>' +
      '<div style="margin-top:24px"><button class="btn big" type="submit">Save Password</button></div></form></div>';
    $('#p1').focus();
    $('#npForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var p1 = $('#p1').value, p2 = $('#p2').value, btn = $('button[type=submit]', this);
      if (p1.length < 10) return toast('Please use at least 10 characters.', 'err');
      if (p1 !== p2) return toast('The two passwords are not the same.', 'err');
      setBusy(btn, true, 'Saving…');
      var r = await sb.auth.updateUser({ password: p1 });
      if (r.error) { setBusy(btn, false); return toast(friendly(r.error), 'err'); }
      await sb.rpc('clear_must_change');
      recovery = false;
      history.replaceState(null, '', location.pathname);
      var ok = await loadMe();
      if (!ok) return renderLogin('Your password was saved. Please sign in.', 'ok');
      toast('Password saved', 'ok');
      start();
    });
  }

  /* ---------- shell ---------- */
  var NAV = [
    ['#/', 'Home'], ['#/events', 'Events'], ['#/announcements', 'Announcements'], ['#/photos', 'Photos'],
    ['#/banner', 'Top Banner', true], ['#/users', 'People', true]
  ];

  function renderShell() {
    app.innerHTML = '<div class="topbar"><div class="topbar-in"><img src="/logo.png" alt=""/>' +
      '<div class="t">All Saints and Ascension<small>Website Admin</small></div>' +
      '<div class="who"><span class="nm"><b>' + esc(me.full_name || me.email) + '</b> · ' + (isAdmin() ? 'Admin' : 'Editor') + '</span>' +
      '<a class="btn secondary small" href="#/password">My Password</a><button class="btn ghost small" data-act="logout">Sign Out</button></div></div></div>' +
      '<div class="navwrap"><nav class="tabs" id="tabs" aria-label="Admin sections">' +
      NAV.filter(function (n) { return !n[2] || isAdmin(); }).map(function (n) { return '<a href="' + n[0] + '" data-nav="' + n[0] + '">' + n[1] + '</a>'; }).join('') +
      '</nav></div><main id="view" tabindex="-1"></main>';
  }

  function highlightNav(hash) {
    var base = hash.replace(/^(#\/[a-z]*).*$/, '$1');
    if (base === '#/') base = '#/';
    document.querySelectorAll('#tabs a').forEach(function (a) {
      a.classList.toggle('on', a.dataset.nav === base);
      if (a.dataset.nav === base) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* ---------- router ---------- */
  function route() {
    if (!me) return;
    var h = location.hash || '#/';
    if (h.indexOf('#/') !== 0) h = '#/';
    var view = $('#view');
    if (!view) return;
    dirty = false;
    highlightNav(h);
    var m;
    var adminOnly = function (fn) { return isAdmin() ? fn() : (view.innerHTML = '<div class="empty">Only an Admin can open this page.</div>'); };
    if (h === '#/') viewDashboard(view);
    else if (h === '#/events') viewList(view, 'events');
    else if (h === '#/events/new') viewEventForm(view, null);
    else if ((m = /^#\/events\/([0-9a-f-]{36})$/.exec(h))) viewEventForm(view, m[1]);
    else if (h === '#/announcements') viewList(view, 'announcements');
    else if (h === '#/announcements/new') viewAnnForm(view, null);
    else if ((m = /^#\/announcements\/([0-9a-f-]{36})$/.exec(h))) viewAnnForm(view, m[1]);
    else if (h === '#/photos') viewPhotos(view);
    else if (h === '#/banner') adminOnly(function () { viewBanner(view); });
    else if (h === '#/users') adminOnly(function () { viewUsers(view); });
    else if (h === '#/password') viewMyPassword(view);
    else viewDashboard(view);
    document.title = 'Website Admin · All Saints and Ascension';
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- dashboard ---------- */
  async function viewDashboard(view) {
    view.innerHTML = '<p class="loading">Loading…</p>';
    var t = today();
    var res = await Promise.all([
      sb.from('events').select('id,title,status,event_date,updated_at').order('updated_at', { ascending: false }).limit(500),
      sb.from('announcements').select('id,title,status,updated_at').order('updated_at', { ascending: false }).limit(500)
    ]);
    if (res[0].error || res[1].error) { view.innerHTML = '<div class="notice err">' + esc(friendly(res[0].error || res[1].error)) + '</div>'; return; }
    var ev = res[0].data, an = res[1].data;
    var liveEv = ev.filter(function (e) { return e.status === 'published' && e.event_date >= t; }).length;
    var draftEv = ev.filter(function (e) { return e.status === 'draft'; }).length;
    var liveAn = an.filter(function (e) { return e.status === 'published'; }).length;
    var draftAn = an.filter(function (e) { return e.status === 'draft'; }).length;
    var recent = ev.map(function (e) { return { k: 'Event', t: e.title, s: e.status, u: e.updated_at, h: '#/events/' + e.id }; })
      .concat(an.map(function (e) { return { k: 'Announcement', t: e.title, s: e.status, u: e.updated_at, h: '#/announcements/' + e.id }; }))
      .sort(function (a, b) { return a.u < b.u ? 1 : -1; }).slice(0, 6);
    var name = (me.full_name || '').split(' ')[0];
    view.innerHTML = '<h1>Welcome' + (name ? ', ' + esc(name) : '') + '</h1><p>What would you like to do today?</p>' +
      '<div class="bigbtns"><a class="btn big" href="#/events/new">＋ Add an Event</a><a class="btn big" href="#/announcements/new">＋ Add an Announcement</a>' +
      '<a class="btn big secondary" href="/index.html" target="_blank" rel="noopener">View the Website ↗</a></div>' +
      '<div class="grid3">' +
      '<a class="stat" href="#/events" style="text-decoration:none;color:inherit"><div class="num">' + liveEv + '</div><div class="lbl">Upcoming events showing on the website</div></a>' +
      '<a class="stat" href="#/events" style="text-decoration:none;color:inherit"><div class="num">' + draftEv + '</div><div class="lbl">Event drafts (not showing yet)</div></a>' +
      '<a class="stat" href="#/announcements" style="text-decoration:none;color:inherit"><div class="num">' + liveAn + '</div><div class="lbl">Announcements showing on the website</div></a>' +
      '<a class="stat" href="#/announcements" style="text-decoration:none;color:inherit"><div class="num">' + draftAn + '</div><div class="lbl">Announcement drafts</div></a></div>' +
      '<h2>Recently edited</h2>' +
      (recent.length ? recent.map(function (r) {
        return '<a class="item" href="' + r.h + '" style="text-decoration:none;color:inherit"><div class="body"><h3>' + esc(r.t) + '<span class="badge ' + (r.s === 'published' ? 'pub' : 'draft') + '">' + (r.s === 'published' ? 'Showing' : 'Draft') + '</span></h3>' +
          '<div class="meta">' + r.k + ' · edited ' + new Date(r.u).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</div></div></a>';
      }).join('') : '<div class="empty">Nothing yet. Add your first event or announcement above.</div>');
  }

  /* ---------- lists (events / announcements) ---------- */
  var listFilter = { events: 'upcoming', announcements: 'all' };

  async function viewList(view, kind) {
    var isEv = kind === 'events';
    view.innerHTML = '<p class="loading">Loading…</p>';
    var q = sb.from(kind).select('*');
    q = isEv ? q.order('event_date', { ascending: true }) : q.order('display_date', { ascending: false });
    var r = await q.limit(500);
    if (r.error) { view.innerHTML = '<div class="notice err">' + esc(friendly(r.error)) + '</div>'; return; }
    var rows = r.data, t = today(), f = listFilter[kind];
    var shown = rows.filter(function (x) {
      if (f === 'drafts') return x.status === 'draft';
      if (isEv && f === 'upcoming') return x.event_date >= t;
      if (isEv && f === 'past') return x.event_date < t;
      return true;
    });
    if (isEv && f === 'past') shown.reverse();
    var tabs = isEv ? [['upcoming', 'Upcoming'], ['drafts', 'Drafts'], ['past', 'Past'], ['all', 'All']] : [['all', 'All'], ['drafts', 'Drafts']];
    view.innerHTML = '<div class="page-head"><h1>' + (isEv ? 'Events' : 'Announcements') + '</h1>' +
      '<a class="btn" href="#/' + kind + '/new">＋ Add ' + (isEv ? 'an Event' : 'an Announcement') + '</a></div>' +
      '<div class="filters" role="tablist">' + tabs.map(function (x) { return '<button data-act="filter" data-k="' + kind + '" data-f="' + x[0] + '" class="' + (f === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      (shown.length ? shown.map(function (x) { return itemHtml(kind, x); }).join('') :
        '<div class="empty">' + (f === 'drafts' ? 'No drafts right now.' : 'Nothing here yet.') + '</div>');
  }

  function itemHtml(kind, x) {
    var isEv = kind === 'events', pub = x.status === 'published';
    var meta = isEv ? [fmtLong(x.event_date), x.time_text, x.location].filter(Boolean).join(' · ') :
      [x.category, parseDate(x.display_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })].filter(Boolean).join(' · ');
    var canDelete = isAdmin() || !pub;
    return '<div class="item">' +
      (isEv ? '<div class="date"><div class="m">' + monthAbbr(x.event_date) + '</div><div class="d">' + dayNum(x.event_date) + '</div></div>' : '') +
      (x.image_url && safeUrl(x.image_url) ? '<img class="thumb" src="' + esc(x.image_url) + '" alt=""/>' : '') +
      '<div class="body"><h3>' + esc(x.title) + '<span class="badge ' + (pub ? 'pub' : 'draft') + '">' + (pub ? 'Showing on website' : 'Draft') + '</span></h3>' +
      '<div class="meta">' + esc(meta) + '</div>' +
      '<div class="acts"><a class="btn small secondary" href="#/' + kind + '/' + x.id + '">Edit</a>' +
      '<button class="btn small ghost" data-act="toggle" data-k="' + kind + '" data-id="' + x.id + '" data-to="' + (pub ? 'draft' : 'published') + '">' + (pub ? 'Take Down (make draft)' : 'Publish') + '</button>' +
      (canDelete ? '<button class="btn small danger" data-act="delete" data-k="' + kind + '" data-id="' + x.id + '" data-t="' + esc(x.title) + '">Delete</button>' : '') +
      '</div></div></div>';
  }

  async function toggleStatus(kind, id, to) {
    var r = await sb.from(kind).update({ status: to }).eq('id', id);
    if (r.error) return toast(friendly(r.error), 'err');
    toast(to === 'published' ? 'Published. It is now on the website.' : 'Taken down. It is now a draft.', 'ok');
    route();
  }

  async function deleteItem(kind, id, title) {
    if (!(await confirmBox('Delete this?', '"' + title + '" will be permanently deleted. This cannot be undone.', 'Yes, Delete', true))) return;
    var r = await sb.from(kind).delete().eq('id', id).select('id');
    if (r.error || !r.data || !r.data.length) return toast(r.error ? friendly(r.error) : "You can only delete drafts. Take it down first, or ask an Admin.", 'err');
    toast('Deleted', 'ok');
    route();
  }

  /* ---------- image field (upload / choose) ---------- */
  function imageFieldHtml(url) {
    return '<label>Photo <span class="hint" style="display:inline">(optional)</span></label>' +
      '<div class="imgbox"><div class="pv" id="imgPv">' + (safeUrl(url) ? '<img src="' + esc(url) + '" alt="Selected photo"/>' : 'No photo') + '</div>' +
      '<div><button type="button" class="btn small secondary" data-act="pickimg">Choose or Upload Photo</button> ' +
      '<button type="button" class="btn small ghost" data-act="rmimg" id="rmImg"' + (safeUrl(url) ? '' : ' hidden') + '>Remove</button></div></div>' +
      '<input type="hidden" id="imgUrl" value="' + esc(url || '') + '"/>';
  }
  function setImage(url) {
    $('#imgUrl').value = url || '';
    $('#imgPv').innerHTML = url ? '<img src="' + esc(url) + '" alt="Selected photo"/>' : 'No photo';
    $('#rmImg').hidden = !url;
    dirty = true;
  }

  // Shrinks big phone photos before upload so pages stay fast.
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { return file.type === 'image/gif' ? resolve(file) : reject(new Error('Please choose a photo (JPG, PNG, or WebP).')); }
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600, w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not read that photo.')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(u); reject(new Error('Could not read that photo.')); };
      img.src = u;
    });
  }

  async function uploadFile(file) {
    var blob = await shrink(file);
    if (blob.size > 5 * 1024 * 1024) throw new Error('That photo is too large. Please choose a smaller one.');
    var isGif = blob.type === 'image/gif';
    var path = 'uploads/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + (isGif ? '.gif' : '.jpg');
    var r = await sb.storage.from('media').upload(path, blob, { contentType: isGif ? 'image/gif' : 'image/jpeg', cacheControl: '31536000' });
    if (r.error) throw r.error;
    return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
  }

  async function listPhotos() {
    var r = await sb.storage.from('media').list('uploads', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
    if (r.error) throw r.error;
    return (r.data || []).filter(function (f) { return f.name && f.id; }).map(function (f) {
      return { name: f.name, url: sb.storage.from('media').getPublicUrl('uploads/' + f.name).data.publicUrl };
    });
  }

  function pickImage() {
    return new Promise(async function (resolve) {
      var o = document.createElement('div');
      o.className = 'overlay';
      o.innerHTML = '<div class="modal wide" role="dialog" aria-modal="true" aria-label="Choose a photo"><h2>Choose a photo</h2>' +
        '<p><label class="btn" style="cursor:pointer;margin:0">Upload a new photo<input type="file" id="pkFile" accept="image/*" hidden/></label></p>' +
        '<div id="pkMsg"></div><h3>Or pick one you already uploaded</h3><div class="photos" id="pkGrid"><p class="loading">Loading…</p></div>' +
        '<div class="btns"><button class="btn ghost" data-r="0">Cancel</button></div></div>';
      document.body.appendChild(o);
      function close(v) { o.remove(); resolve(v); }
      o.addEventListener('click', function (e) {
        if (e.target === o || e.target.closest('[data-r]')) return close(null);
        var p = e.target.closest('[data-url]'); if (p) close(p.dataset.url);
      });
      $('#pkFile', o).addEventListener('change', async function () {
        var f = this.files[0]; if (!f) return;
        $('#pkMsg', o).innerHTML = '<div class="notice info">Uploading your photo…</div>';
        try { close(await uploadFile(f)); } catch (e) { $('#pkMsg', o).innerHTML = '<div class="notice err">' + esc(errMsg(e)) + '</div>'; }
      });
      try {
        var ph = await listPhotos();
        $('#pkGrid', o).innerHTML = ph.length ? ph.map(function (p) { return '<div class="photo pick"><img src="' + esc(p.url) + '" data-url="' + esc(p.url) + '" alt="Uploaded photo"/></div>'; }).join('') : '<p class="hint">No photos uploaded yet.</p>';
      } catch (e) { $('#pkGrid', o).innerHTML = '<div class="notice err">' + esc(friendly(e)) + '</div>'; }
    });
  }

  /* ---------- event form ---------- */
  async function viewEventForm(view, id) {
    var x = { title: '', description: '', event_date: '', time_text: '', location: '', registration_url: '', image_url: '', status: 'draft' };
    if (id) {
      view.innerHTML = '<p class="loading">Loading…</p>';
      var r = await sb.from('events').select('*').eq('id', id).maybeSingle();
      if (r.error || !r.data) { view.innerHTML = '<div class="empty">That event could not be found. <a href="#/events">Back to events</a></div>'; return; }
      x = r.data;
    }
    view.innerHTML = '<div class="page-head"><h1>' + (id ? 'Edit Event' : 'Add an Event') + '</h1><a href="#/events" class="btn ghost small">← Back to Events</a></div>' +
      '<form class="card" id="frm" novalidate>' +
      '<label for="f_title">Event name *</label><input type="text" id="f_title" maxlength="150" value="' + esc(x.title) + '"/>' +
      '<div class="row2"><div><label for="f_date">Date *</label><input type="date" id="f_date" value="' + esc(x.event_date) + '"/></div>' +
      '<div><label for="f_time">Time</label><input type="text" id="f_time" list="times" maxlength="60" placeholder="9:00 AM" value="' + esc(x.time_text) + '"/>' +
      '<datalist id="times">' + TIMES.map(function (t) { return '<option value="' + t + '">'; }).join('') + '</datalist></div></div>' +
      '<label for="f_loc">Where</label><input type="text" id="f_loc" maxlength="200" placeholder="Fellowship Hall" value="' + esc(x.location) + '"/>' +
      '<label for="f_desc">Details</label><textarea id="f_desc" maxlength="2000">' + esc(x.description) + '</textarea>' +
      '<label for="f_reg">Sign-up link <span class="hint" style="display:inline">(optional, must start with https://)</span></label><input type="url" id="f_reg" placeholder="https://" value="' + esc(x.registration_url) + '"/>' +
      imageFieldHtml(x.image_url) +
      '<div id="formMsg"></div>' + formButtons(x, 'events') + '</form>';
    wireForm('events', id, x);
  }

  function formButtons(x, kind) {
    var live = x.status === 'published';
    return '<div class="form-actions">' +
      (live ? '<button type="submit" class="btn" data-s="published">Save Changes</button><button type="submit" class="btn ghost" data-s="draft">Take Down (make draft)</button>' :
        '<button type="submit" class="btn" data-s="published">Publish to Website</button><button type="submit" class="btn secondary" data-s="draft">Save as Draft</button>' +
        '<button type="submit" class="btn ghost" data-s="draft" data-preview="1">Save Draft &amp; Preview</button>') +
      '<a href="#/' + kind + '" class="btn ghost">Cancel</a></div>' +
      '<p class="preview-note">' + (live ? 'This is showing on the website. Save Changes updates it right away.' : '“Preview” shows your draft on the real website page, only to you.') + '</p>';
  }

  function wireForm(kind, id, original) {
    var form = $('#frm');
    form.addEventListener('input', function () { dirty = true; });
    var clicked = null;
    form.addEventListener('click', function (e) { var b = e.target.closest('button[type=submit]'); if (b) clicked = b; });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = clicked || $('button[type=submit]', form);
      var status = btn.dataset.s || original.status;
      var wantPreview = !!btn.dataset.preview;
      var pvWin = wantPreview ? window.open('', '_blank') : null;
      var msg = $('#formMsg'); msg.innerHTML = '';
      var rec;
      try { rec = kind === 'events' ? readEvent(status) : readAnn(status); }
      catch (err) { if (pvWin) pvWin.close(); msg.innerHTML = '<div class="notice err" role="alert">' + esc(err.message) + '</div>'; msg.scrollIntoView({ block: 'center' }); return; }
      setBusy(btn, true, 'Saving…');
      var q = id ? sb.from(kind).update(rec).eq('id', id).select('id').maybeSingle() : sb.from(kind).insert(rec).select('id').maybeSingle();
      var r = await q;
      if (r.error || !r.data) { if (pvWin) pvWin.close(); setBusy(btn, false); msg.innerHTML = '<div class="notice err" role="alert">' + esc(r.error ? friendly(r.error) : "That didn't save. You may not have permission.") + '</div>'; return; }
      dirty = false;
      toast(status === 'published' ? 'Saved and showing on the website' : 'Saved as a draft', 'ok');
      if (wantPreview) { if (pvWin) pvWin.location.href = '/' + (kind === 'events' ? 'schedule' : 'news') + '.html?preview=1'; location.hash = '#/' + kind + '/' + r.data.id; return; }
      location.hash = '#/' + kind;
    });
  }

  function val(id) { return $('#' + id).value.trim(); }
  function readEvent(status) {
    var title = val('f_title'), date = val('f_date'), reg = val('f_reg');
    if (!title) throw new Error('Please type the event name.');
    if (!date) throw new Error('Please choose the date.');
    if (reg && !/^https?:\/\//i.test(reg)) throw new Error('The sign-up link must start with https://');
    return { title: title, event_date: date, time_text: val('f_time') || null, location: val('f_loc') || null, description: val('f_desc') || null,
      registration_url: reg || null, image_url: val('imgUrl') || null, status: status };
  }

  /* ---------- announcement form ---------- */
  async function viewAnnForm(view, id) {
    var x = { title: '', body: '', category: '', image_url: '', link_url: '', display_date: today(), status: 'draft' };
    if (id) {
      view.innerHTML = '<p class="loading">Loading…</p>';
      var r = await sb.from('announcements').select('*').eq('id', id).maybeSingle();
      if (r.error || !r.data) { view.innerHTML = '<div class="empty">That announcement could not be found. <a href="#/announcements">Back to announcements</a></div>'; return; }
      x = r.data;
    }
    view.innerHTML = '<div class="page-head"><h1>' + (id ? 'Edit Announcement' : 'Add an Announcement') + '</h1><a href="#/announcements" class="btn ghost small">← Back to Announcements</a></div>' +
      '<form class="card" id="frm" novalidate>' +
      '<label for="f_title">Headline *</label><input type="text" id="f_title" maxlength="150" value="' + esc(x.title) + '"/>' +
      '<div class="row2"><div><label for="f_cat">Topic</label><input type="text" id="f_cat" list="cats" maxlength="40" placeholder="Community" value="' + esc(x.category) + '"/>' +
      '<datalist id="cats">' + CATEGORIES.map(function (t) { return '<option value="' + t + '">'; }).join('') + '</datalist></div>' +
      '<div><label for="f_date">Date shown</label><input type="date" id="f_date" value="' + esc(x.display_date) + '"/></div></div>' +
      '<label for="f_body">Message</label><textarea id="f_body" maxlength="5000">' + esc(x.body) + '</textarea>' +
      '<label for="f_link">Link <span class="hint" style="display:inline">(optional, must start with https://)</span></label><input type="url" id="f_link" placeholder="https://" value="' + esc(x.link_url) + '"/>' +
      imageFieldHtml(x.image_url) +
      '<div id="formMsg"></div>' + formButtons(x, 'announcements') + '</form>';
    wireForm('announcements', id, x);
  }
  function readAnn(status) {
    var title = val('f_title'), link = val('f_link');
    if (!title) throw new Error('Please type a headline.');
    if (link && !/^https?:\/\//i.test(link)) throw new Error('The link must start with https://');
    return { title: title, category: val('f_cat') || null, display_date: val('f_date') || today(), body: val('f_body') || null,
      link_url: link || null, image_url: val('imgUrl') || null, status: status };
  }

  /* ---------- photos ---------- */
  async function viewPhotos(view) {
    view.innerHTML = '<div class="page-head"><h1>Photos</h1><label class="btn" style="cursor:pointer;margin:0">＋ Upload Photos<input type="file" id="upl" accept="image/*" multiple hidden/></label></div>' +
      '<p class="hint" style="margin-top:-8px">Photos you upload here can be used in events and announcements. Large photos are shrunk automatically.</p><div id="phGrid"><p class="loading">Loading…</p></div>';
    $('#upl').addEventListener('change', async function () {
      var files = Array.prototype.slice.call(this.files), ok = 0;
      for (var i = 0; i < files.length; i++) {
        try { toast('Uploading ' + (i + 1) + ' of ' + files.length + '…'); await uploadFile(files[i]); ok++; }
        catch (e) { toast(errMsg(e), 'err'); }
      }
      if (ok) toast(ok + ' photo' + (ok > 1 ? 's' : '') + ' uploaded', 'ok');
      loadPhotoGrid();
    });
    loadPhotoGrid();
  }
  async function loadPhotoGrid() {
    var g = $('#phGrid'); if (!g) return;
    try {
      var ph = await listPhotos();
      g.innerHTML = ph.length ? '<div class="photos">' + ph.map(function (p) {
        return '<div class="photo"><a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="' + esc(p.url) + '" alt="Uploaded photo"/></a><div class="p"><button class="linkish" style="padding:2px;font-size:.8rem" data-act="copyurl" data-u="' + esc(p.url) + '">Copy link</button>' +
          (isAdmin() ? '<button class="linkish" style="padding:2px;font-size:.8rem;color:#b42318" data-act="delphoto" data-n="' + esc(p.name) + '">Delete</button>' : '') + '</div></div>';
      }).join('') + '</div>' : '<div class="empty">No photos yet. Tap “Upload Photos” to add some.</div>';
    } catch (e) { g.innerHTML = '<div class="notice err">' + esc(friendly(e)) + '</div>'; }
  }

  /* ---------- banner ---------- */
  async function viewBanner(view) {
    view.innerHTML = '<p class="loading">Loading…</p>';
    var r = await sb.from('site_settings').select('key,value').in('key', ['announce_enabled', 'announce_text']);
    if (r.error) { view.innerHTML = '<div class="notice err">' + esc(friendly(r.error)) + '</div>'; return; }
    var s = {}; r.data.forEach(function (x) { s[x.key] = x.value; });
    view.innerHTML = '<div class="page-head"><h1>Top Banner</h1></div><form class="card" id="bnForm" novalidate>' +
      '<p>This is the red message strip at the very top of every page on the website.</p>' +
      '<label class="check"><input type="checkbox" id="b_on"' + (s.announce_enabled === 'false' ? '' : ' checked') + '/> Show the banner</label>' +
      '<label for="b_txt">Banner message</label><input type="text" id="b_txt" maxlength="160" value="' + esc(s.announce_text || '') + '"/>' +
      '<div class="hint">Keep it short. The “View Full Schedule” link is added for you.</div><div id="formMsg"></div>' +
      '<div class="form-actions"><button class="btn" type="submit">Save Banner</button></div></form>';
    $('#bnForm').addEventListener('input', function () { dirty = true; });
    $('#bnForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', this); setBusy(btn, true, 'Saving…');
      var rows = [{ key: 'announce_enabled', value: String($('#b_on').checked) }, { key: 'announce_text', value: val('b_txt') }];
      var w = await sb.from('site_settings').upsert(rows, { onConflict: 'key' });
      setBusy(btn, false);
      if (w.error) return toast(friendly(w.error), 'err');
      dirty = false; toast('Banner saved', 'ok');
    });
  }

  /* ---------- people ---------- */
  async function viewUsers(view) {
    view.innerHTML = '<p class="loading">Loading…</p>';
    var r = await sb.from('profiles').select('*').order('created_at', { ascending: true });
    if (r.error) { view.innerHTML = '<div class="notice err">' + esc(friendly(r.error)) + '</div>'; return; }
    view.innerHTML = '<div class="page-head"><h1>People</h1><button class="btn" data-act="adduser">＋ Add a Person</button></div>' +
      '<p class="hint" style="margin-top:-8px"><b>Admins</b> can do everything, including adding people. <b>Editors</b> can add, edit and publish events and announcements, and upload photos.</p>' +
      r.data.map(function (u) {
        var self = u.id === me.id;
        return '<div class="item"><div class="body"><h3>' + esc(u.full_name || u.email) + '<span class="badge ' + u.role + '">' + (u.role === 'admin' ? 'Admin' : 'Editor') + '</span>' +
          (u.active ? '' : '<span class="badge off">Turned off</span>') + (self ? '<span class="badge off">You</span>' : '') + '</h3>' +
          '<div class="meta">' + esc(u.email) + '</div>' +
          (self ? '' : '<div class="acts">' +
            '<button class="btn small secondary" data-act="role" data-id="' + u.id + '" data-to="' + (u.role === 'admin' ? 'editor' : 'admin') + '">Make ' + (u.role === 'admin' ? 'Editor' : 'Admin') + '</button>' +
            '<button class="btn small ghost" data-act="active" data-id="' + u.id + '" data-to="' + (u.active ? '0' : '1') + '">' + (u.active ? 'Turn Off Access' : 'Turn On Access') + '</button>' +
            '<button class="btn small ghost" data-act="resetpw" data-id="' + u.id + '" data-e="' + esc(u.email) + '">Reset Password</button>' +
            '<button class="btn small danger" data-act="rmuser" data-id="' + u.id + '" data-e="' + esc(u.email) + '">Remove</button></div>') +
          '</div></div>';
      }).join('');
  }

  function tempBox(email, pw, intro) {
    return infoBox('Temporary password', '<p>' + esc(intro) + '</p><p><b>' + esc(email) + '</b></p><div class="secret">' + esc(pw) + '</div>' +
      '<p><button class="btn small secondary" data-copy="' + esc(pw) + '">Copy password</button></p>' +
      '<p class="hint">Share it privately (not in a public message). They will be asked to choose their own password the first time they sign in. This is the only time it is shown.</p>', 'I have saved it');
  }

  function addUserDialog() {
    return new Promise(function (resolve) {
      var o = document.createElement('div');
      o.className = 'overlay';
      o.innerHTML = '<form class="modal" id="auForm" novalidate><h2>Add a person</h2>' +
        '<label for="au_n">Name</label><input type="text" id="au_n" maxlength="100"/>' +
        '<label for="au_e">Email *</label><input type="email" id="au_e"/>' +
        '<label for="au_r">What can they do?</label><select id="au_r"><option value="editor">Editor: add, edit and publish events and announcements</option><option value="admin">Admin: everything, including adding people</option></select>' +
        '<div id="auMsg"></div><div class="btns"><button type="button" class="btn ghost" data-r="0">Cancel</button><button type="submit" class="btn">Create Account</button></div></form>';
      document.body.appendChild(o);
      $('#au_n', o).focus();
      o.addEventListener('click', function (e) { if (e.target === o || e.target.closest('[data-r]')) { o.remove(); resolve(false); } });
      $('#auForm', o).addEventListener('submit', async function (e) {
        e.preventDefault();
        var btn = $('button[type=submit]', o); setBusy(btn, true, 'Creating…');
        try {
          var res = await api('POST', { email: $('#au_e', o).value, full_name: $('#au_n', o).value, role: $('#au_r', o).value });
          o.remove(); resolve(true);
          await tempBox(res.email, res.tempPassword, 'The account is ready. Give them this temporary password:');
        } catch (err) { setBusy(btn, false); $('#auMsg', o).innerHTML = '<div class="notice err" role="alert">' + esc(err.message) + '</div>'; }
      });
    });
  }

  /* ---------- my password ---------- */
  function viewMyPassword(view) {
    view.innerHTML = '<div class="page-head"><h1>My Password</h1></div><form class="card" id="mpForm" novalidate style="max-width:520px">' +
      '<label for="p1">New password</label><input type="password" id="p1" autocomplete="new-password"/><div class="hint">At least 10 characters.</div>' +
      '<label for="p2">Type it again</label><input type="password" id="p2" autocomplete="new-password"/>' +
      '<div class="form-actions"><button class="btn" type="submit">Save Password</button></div></form>';
    $('#mpForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var p1 = $('#p1').value, p2 = $('#p2').value, btn = $('button[type=submit]', this);
      if (p1.length < 10) return toast('Please use at least 10 characters.', 'err');
      if (p1 !== p2) return toast('The two passwords are not the same.', 'err');
      setBusy(btn, true, 'Saving…');
      var r = await sb.auth.updateUser({ password: p1 });
      setBusy(btn, false);
      if (r.error) return toast(friendly(r.error), 'err');
      this.reset(); toast('Password changed', 'ok');
    });
  }

  /* ---------- click actions ---------- */
  document.addEventListener('click', async function (e) {
    var a = e.target.closest('a[href^="#/"]');
    if (a && dirty) {
      e.preventDefault();
      if (await confirmBox('Leave without saving?', 'Your changes on this page have not been saved.', 'Leave', true)) { dirty = false; location.hash = a.getAttribute('href'); }
      return;
    }
    var b = e.target.closest('[data-act]'); if (!b) return;
    var d = b.dataset;
    switch (d.act) {
      case 'forgot': return renderForgot();
      case 'tologin': return renderLogin();
      case 'logout': return logout();
      case 'filter': listFilter[d.k] = d.f; return route();
      case 'toggle': return toggleStatus(d.k, d.id, d.to);
      case 'delete': return deleteItem(d.k, d.id, d.t);
      case 'pickimg': var u = await pickImage(); if (u) setImage(u); return;
      case 'rmimg': return setImage('');
      case 'copyurl': copyText(d.u); return toast('Link copied', 'ok');
      case 'delphoto':
        if (!(await confirmBox('Delete this photo?', 'If it is used in an event or announcement, it will stop showing there.', 'Yes, Delete', true))) return;
        var dr = await sb.storage.from('media').remove(['uploads/' + d.n]);
        if (dr.error) return toast(friendly(dr.error), 'err');
        toast('Photo deleted', 'ok'); return loadPhotoGrid();
      case 'adduser': if (await addUserDialog()) route(); return;
      case 'role':
        if (!(await confirmBox('Change role?', 'This person will become ' + (d.to === 'admin' ? 'an Admin, with full control, including adding and removing people.' : 'an Editor.'), 'Yes, Change'))) return;
        try { await api('PATCH', { id: d.id, role: d.to }); toast('Role updated', 'ok'); } catch (err) { toast(err.message, 'err'); }
        return route();
      case 'active':
        if (!(await confirmBox(d.to === '1' ? 'Turn access back on?' : 'Turn off access?', d.to === '1' ? 'They will be able to sign in again.' : 'They will not be able to sign in or change anything. You can turn it back on any time.', 'Yes'))) return;
        try { await api('PATCH', { id: d.id, active: d.to === '1' }); toast('Updated', 'ok'); } catch (err) { toast(err.message, 'err'); }
        return route();
      case 'resetpw':
        if (!(await confirmBox('Reset password?', 'A new temporary password will be created for ' + d.e + '. Their old password will stop working.', 'Yes, Reset'))) return;
        try { var rp = await api('PATCH', { id: d.id, reset_password: true }); await tempBox(d.e, rp.tempPassword, 'Give them this new temporary password:'); } catch (err) { toast(err.message, 'err'); }
        return route();
      case 'rmuser':
        if (!(await confirmBox('Remove this person?', d.e + ' will lose access permanently. Their past work stays on the website.', 'Yes, Remove', true))) return;
        try { await api('DELETE', { id: d.id }); toast('Removed', 'ok'); } catch (err) { toast(err.message, 'err'); }
        return route();
    }
  });

  boot();
})();
