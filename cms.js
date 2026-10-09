/* ============================================================
   Public-site loader for the admin-managed content.
   - Fills in Upcoming Events and News from /api/content
   - Updates the top banner
   - Everything is written with textContent (never raw HTML).
   If anything fails, the page keeps its built-in fallback text.
   Add ?preview=1 to a page while signed in to /admin to see drafts.
   ============================================================ */
(function () {
  'use strict';
  var preview = /[?&]preview=1(&|$)/.test(location.search);
  var BAR_KEY = 'asa-bar-cache';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function ymd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { return new Date().toLocaleDateString('en-CA'); }

  /* ---- top banner ---- */
  function applyBar(s) {
    var bar = document.querySelector('.announce-bar');
    if (!bar || !s) return;
    if (s.announce_enabled === 'false') { bar.style.display = 'none'; return; }
    if (s.announce_text) {
      bar.textContent = s.announce_text + ' ';
      var a = el('a', null, 'View Full Schedule →'); a.href = 'schedule.html';
      bar.appendChild(a);
    }
  }
  try { var cached = JSON.parse(localStorage.getItem(BAR_KEY) || 'null'); if (cached && !preview) applyBar(cached); } catch (e) {}

  /* ---- events ---- */
  function eventRow(ev) {
    var row = el('div', 'event-row');
    var d = el('div', 'event-date');
    d.appendChild(el('div', 'month', ymd(ev.event_date).toLocaleDateString('en-US', { month: 'short' })));
    d.appendChild(el('div', 'day', String(ymd(ev.event_date).getDate())));
    row.appendChild(d);
    row.appendChild(el('div', 'event-div'));
    if (safeUrl(ev.image_url)) {
      var im = el('img', 'event-thumb'); im.src = ev.image_url; im.alt = ''; im.loading = 'lazy';
      im.onerror = function () { im.remove(); };
      row.appendChild(im);
    }
    var info = el('div', 'event-info');
    var h = el('h4', null, ev.title);
    if (ev.status === 'draft') h.appendChild(el('span', 'cms-draft', 'DRAFT'));
    info.appendChild(h);
    if (ev.description) info.appendChild(el('p', 'event-desc', ev.description));
    if (ev.location) info.appendChild(el('p', 'event-loc', '📍 ' + ev.location));
    if (safeUrl(ev.registration_url)) {
      var a = el('a', 'event-reg', 'Sign up →'); a.href = ev.registration_url; a.target = '_blank'; a.rel = 'noopener';
      info.appendChild(a);
    }
    row.appendChild(info);
    if (ev.time_text) row.appendChild(el('div', 'event-time', ev.time_text));
    return row;
  }

  function emptyRow() {
    var row = el('div', 'event-row'), info = el('div', 'event-info');
    info.appendChild(el('p', null, 'No upcoming events are posted right now.'));
    row.appendChild(info); return row;
  }

  function renderEvents(list, box) {
    var t = today(), limit = parseInt(box.getAttribute('data-limit') || '0', 10);
    var items = list.filter(function (e) { return e.event_date >= t; });
    if (limit) items = items.slice(0, limit);
    box.textContent = '';
    if (!items.length) { box.appendChild(emptyRow()); return; }
    items.forEach(function (e) { box.appendChild(eventRow(e)); });
  }

  /* ---- announcements ---- */
  function annCard(a) {
    var card = el('div', 'news-card');
    if (safeUrl(a.image_url)) {
      var im = el('img'); im.src = a.image_url; im.alt = a.title || ''; im.loading = 'lazy';
      im.onerror = function () { im.remove(); };
      card.appendChild(im);
    }
    var body = el('div', 'news-card-body');
    if (a.category) body.appendChild(el('div', 'news-tag', a.category));
    var h = el('h3', null, a.title);
    if (a.status === 'draft') h.appendChild(el('span', 'cms-draft', 'DRAFT'));
    body.appendChild(h);
    if (a.body) { var p = el('p', null, a.body); p.style.whiteSpace = 'pre-line'; body.appendChild(p); }
    var foot = el('div', 'news-foot');
    foot.appendChild(el('span', 'news-date', ymd(a.display_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })));
    if (safeUrl(a.link_url)) {
      var l = el('a', 'read-more', 'Learn more →'); l.href = a.link_url; l.target = '_blank'; l.rel = 'noopener';
      foot.appendChild(l);
    }
    body.appendChild(foot);
    card.appendChild(body);
    return card;
  }

  function renderAnnouncements(list, box) {
    box.textContent = '';
    if (!list.length) { box.appendChild(el('p', 'cms-none', 'No announcements right now. Please check back soon.')); return; }
    list.forEach(function (a) { box.appendChild(annCard(a)); });
  }

  /* ---- preview helpers ---- */
  function previewBar(text) {
    var b = el('div', 'cms-preview-bar', text);
    document.body.insertBefore(b, document.body.firstChild);
  }
  function previewToken() {
    try {
      var o = JSON.parse(localStorage.getItem('asa-admin-auth') || 'null');
      return (o && (o.access_token || (o.currentSession && o.currentSession.access_token))) || '';
    } catch (e) { return ''; }
  }

  /* ---- go ---- */
  var evBox = document.querySelector('[data-cms="events"]');
  var anBox = document.querySelector('[data-cms="announcements"]');
  var headers = {};
  if (preview) {
    var tok = previewToken();
    if (!tok) { previewBar('Preview needs you to be signed in. Please go to the Admin area, sign in, and click Preview again.'); return; }
    headers.Authorization = 'Bearer ' + tok;
  }
  if (!window.fetch) return;
  fetch('/api/content' + (preview ? '?preview=1' : ''), { headers: headers })
    .then(function (r) {
      if (r.status === 401 && preview) { previewBar('Your admin session has ended. Please sign in again in the Admin area, then click Preview.'); throw new Error('auth'); }
      if (!r.ok) throw new Error('bad');
      return r.json();
    })
    .then(function (d) {
      if (preview) previewBar('PREVIEW: you are seeing drafts that the public cannot see yet.');
      else { try { localStorage.setItem(BAR_KEY, JSON.stringify(d.settings || {})); } catch (e) {} applyBar(d.settings); }
      if (evBox) renderEvents(d.events || [], evBox);
      if (anBox) renderAnnouncements(d.announcements || [], anBox);
    })
    .catch(function () { /* keep the built-in fallback content */ });
})();
