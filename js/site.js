/* ==========================================================================
   UNBOUND — site script
   1. nav state   2. lane tabs   3. reveal-on-scroll
   4. hanging team cards (wire layout, swing, pointer shimmer, flip)
   5. booking calendar (no backend: the visitor requests a slot by email,
      or adds a Google Calendar invite with the team as guests)
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- config ---------- */
  var SITE = {
    // Where every "Email us" link, booking invite and fallback message goes.
    emails: ['hello@example.com'],
    // Paste a Cal.com / Calendly / Google appointment link here and the
    // "Book in Google Calendar" button will send visitors there instead of a Google Calendar invite.
    bookingUrl: '',
    // Lead capture. leadUrl: a web app (for example Google Apps Script) that receives form posts as JSON.
    // formTo: an inbox for FormSubmit (formsubmit.co) when there is no leadUrl. With both empty, forms
    // fall back to the visitor's own email app.
    leadUrl: '',
    formTo: '',
    hostTz: 'Asia/Kolkata',       // working hours are defined in this zone
    hostOffsetMin: 330,           // IST = UTC+5:30, no daylight saving
    workStart: 10 * 60,           // 10:00
    workEnd: 18 * 60 + 30,        // 18:30 (last slot starts 18:00)
    slotMin: 30,
    daysAhead: 60,
    leadHours: 3                  // nothing sooner than this from now
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 0. lead capture ----------
     fwSend(payload) posts a booking, sign-up or message to SITE.leadUrl.
     Without it, FormSubmit forwards the payload to SITE.formTo. ?dryrun=1 logs payloads instead of sending (for QA). */
  function fwTrack(name, params) { try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {} }
  window.fwTrack = fwTrack;
  function fwSend(payload, keepalive) {
    if (payload && payload.type && payload.type !== 'check') fwTrack('generate_lead', { lead_type: payload.type });
    var p = Object.assign({}, payload, { page: location.href.split('#')[0], referrer: document.referrer || '', tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''), lang: navigator.language || '', ua: navigator.userAgent, ts: new Date().toISOString() });
    if (/[?&]dryrun=1/.test(location.search)) { window.__fwSent = (window.__fwSent || []).concat([p]); return Promise.resolve({ ok: true, dry: true }); }
    var timeout = function (pr, ms) { return Promise.race([pr, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); };
    var body = JSON.stringify(p);
    if (SITE.leadUrl) {
      return timeout(fetch(SITE.leadUrl, { method: 'POST', body: body, keepalive: !!keepalive && body.length < 60000 }).then(function (r) { return r.json(); }).then(function (j) { if (!j || !j.ok) throw new Error((j && j.error) || 'not sent'); return j; }), 25000);
    }
    if (!SITE.formTo) return Promise.reject(new Error('no endpoint'));
    var f = { _captcha: 'false', _template: 'table' };
    if (p.type === 'report') { f._subject = 'Report requested · ' + p.name + ' · ' + p.domain + (p.score != null ? ' · ' + p.score + '/100' : ''); f.name = p.name; f.email = p.email; f.company = p.company; f._replyto = p.email; f._autoresponse = p.textReport; }
    else if (p.type === 'check') { f._subject = 'AI check · ' + p.domain + (p.score != null ? ' · ' + p.score + '/100' : ' · partial'); }
    else if (p.type === 'booking') { f._subject = 'Booking opened · ' + p.slotLabel; f.slot = p.slotLabel; f.slot_utc = p.slot; f.visitor_timezone = p.visitorTz; }
    if (p.domain) { f.domain = p.domain; f.score = p.score == null ? 'not available' : p.score + '/100 (' + p.grade + ')'; f.top_issues = (p.topIssues || []).join('; '); }
    f.page = p.page; f.referrer = p.referrer; f.timezone = p.tz; f.time = p.ts;
    return timeout(fetch('https://formsubmit.co/ajax/' + SITE.formTo, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(f), keepalive: !!keepalive }).then(function (r) { return r.json(); }).then(function (j) { if (String(j.success) !== 'true') throw new Error(j.message || 'not sent'); return j; }), 25000);
  }

  /* ---------- 1. nav ---------- */
  var nav = $('#nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    var burger = $('.nav-burger', nav);
    if (burger) {
      burger.addEventListener('click', function () {
        var open = nav.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      $$('.nav-links a', nav).forEach(function (a) {
        a.addEventListener('click', function () { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); });
      });
    }
    /* resources menu */
    $$('.nav-drop', nav).forEach(function (d) {
      var btn = $('.nav-drop-btn', d);
      var set = function (on) { d.classList.toggle('is-open', on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
      btn.addEventListener('click', function (e) { e.stopPropagation(); set(!d.classList.contains('is-open')); });
      document.addEventListener('click', function (e) { if (!d.contains(e.target)) set(false); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { set(false); btn.focus(); } });
      d.addEventListener('focusout', function (e) { if (!d.contains(e.relatedTarget)) set(false); });
      if (/[?&]menu=1/.test(location.search)) set(true);   // ?menu=1 opens it (screenshots)
    });
    // highlight the section in view
    var links = $$('.nav-links a', nav);
    var targets = links.map(function (a) { var h = a.getAttribute('href') || ''; return h.charAt(0) === '#' && h.length > 1 ? $(h) : null; }).filter(Boolean);
    if ('IntersectionObserver' in window && targets.length) {
      var current = null;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) current = e.target.id; });
        links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + current); });
      }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
      targets.forEach(function (t) { io.observe(t); });
    }
  }

  /* ---------- 2. what-we-do tabs ---------- */
  var tablist = $('.tabs[role="tablist"]');
  if (tablist) {
    var tabs = $$('[role="tab"]', tablist);
    var panels = tabs.map(function (t) { return $('#' + t.getAttribute('aria-controls')); });
    var select = function (i, focus) {
      tabs.forEach(function (t, j) {
        var on = i === j;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (panels[j]) { panels[j].classList.toggle('is-active', on); panels[j].hidden = !on; }
      });
      if (focus) tabs[i].focus();
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i); });
      t.addEventListener('keydown', function (e) {
        var n = i;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        else return;
        e.preventDefault(); select(n, true);
      });
    });
  }

  /* ---------- 3. reveal ---------- */
  var revealEls = $$('.reveal');
  var staticMode = /[?&]static=1/.test(location.search);   // ?static=1 shows everything at once (screenshots, print)
  if (staticMode) document.documentElement.classList.add('static');
  if (prefersReduced || staticMode || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); ro.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { ro.observe(el); });
  }

  /* ---------- 4. team: hanging profile cards ----------
     Behaviour measured from the reference: cards hang from a sagging cord on fine wires;
     the pointer "pushes" a card (damped pendulum, ~2.7 Hz, settles in ~1 s); hovering tilts
     the card up to ±9°, lights a holographic sheen that follows the pointer, and flips it to
     the back (760 ms); leaving flips it back. On touch, a tap toggles the flip. */
  var tmSection = $('#team');
  if (tmSection) {
    var track = $('#tm-track'), cord = $('.tm-cord', track), cordPath = $('path', cord);
    var enters = $$('.tm-enter', track);
    var finePointer = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    tmSection.classList.add('tm-ready');

    // the cord is a quadratic curve through every anchor, overshooting 32px past the outer ones;
    // each card hangs from the point where the curve passes its anchor
    var layoutCord = function () {
      if (!enters.length) return;
      var xs = enters.map(function (e) { return e.offsetLeft + e.offsetWidth / 2; });
      var left = xs[0] - 32, width = xs[xs.length - 1] - xs[0] + 64;
      cord.style.left = left + 'px'; cord.style.width = width + 'px';
      cord.setAttribute('viewBox', '0 0 ' + width + ' 50');
      cordPath.setAttribute('d', 'M 0 13 Q ' + (width / 2) + ' 57 ' + width + ' 13');
      enters.forEach(function (e, i) {
        var t = (xs[i] - left) / width;
        var y = 13 + 2 * (1 - t) * t * 44;          // y on the curve (control point at 57)
        e.style.marginTop = (y - 13).toFixed(2) + 'px';
      });
    };
    layoutCord();
    // on screens narrower than the rig (1276px) but wider than a phone, scale the whole
    // rig down so all four cards stay in view together; phones keep the swipe row
    var scrollEl = track.parentElement;
    var fitTrack = function () {
      var natural = track.scrollWidth, avail = scrollEl.clientWidth, s = avail / natural;
      if (s >= 1 || avail < 760) { track.style.transform = ''; track.style.transformOrigin = ''; scrollEl.style.height = ''; scrollEl.style.overflowX = ''; return; }
      track.style.transformOrigin = 'top left';
      track.style.transform = 'scale(' + s.toFixed(4) + ')';
      scrollEl.style.overflowX = 'hidden';
      scrollEl.style.height = Math.round(track.offsetHeight * s) + 'px';
      scrollEl.scrollLeft = 0;
    };
    fitTrack();
    window.addEventListener('resize', function () { layoutCord(); fitTrack(); });

    // entrance: drop in with a little swing, staggered 85 ms per card
    var played = false;
    var play = function () { if (played) return; played = true; enters.forEach(function (e) { e.classList.add('tm-enter-play'); }); };
    if (prefersReduced || staticMode || !('IntersectionObserver' in window)) play();
    else { var tio = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { play(); tio.disconnect(); } }); }, { threshold: 0.12 }); tio.observe(track); }

    // springs (mass 1): sway is soft and swings; tilt, highlight and glow are quicker
    var K_SWAY = 290, C_SWAY = 10.5, K_TILT = 510, C_TILT = 16, MAX_GLOW = 0.78;
    var cards = $$('.tm-item', track).map(function (item) {
      return { item: item, pend: $('.tm-pendulum', item), hit: $('.tm-hit', item), flipper: $('.tm-flipper', item), front: $('.tm-front', item), back: $('.tm-back', item),
        sway: 0, swayV: 0, rx: 0, rxV: 0, ry: 0, ryV: 0, px: 50, pxV: 0, py: 50, pyV: 0, il: 0, ilV: 0,
        tRx: 0, tRy: 0, tPx: 50, tPy: 50, tIl: 0, flipped: false, lastX: null };
    });
    var running = false, last = 0;
    var spring = function (c, x, v, target, k, damp, dt) { var a = -k * (c[x] - target) - damp * c[v]; c[v] += a * dt; c[x] += c[v] * dt; };
    var settled = function (c, x, v, target, eps) { return Math.abs(c[x] - target) < eps && Math.abs(c[v]) < eps * 10; };
    var step = function (now) {
      var dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000)); last = now;
      var active = false;
      cards.forEach(function (c) {
        spring(c, 'sway', 'swayV', 0, K_SWAY, C_SWAY, dt);
        spring(c, 'rx', 'rxV', c.tRx, K_TILT, C_TILT, dt);
        spring(c, 'ry', 'ryV', c.tRy, K_TILT, C_TILT, dt);
        spring(c, 'px', 'pxV', c.tPx, K_TILT, C_TILT, dt);
        spring(c, 'py', 'pyV', c.tPy, K_TILT, C_TILT, dt);
        spring(c, 'il', 'ilV', c.tIl, K_TILT, C_TILT, dt);
        c.pend.style.setProperty('--sway', c.sway.toFixed(3) + 'deg');
        c.hit.style.setProperty('--rx', c.rx.toFixed(3) + 'deg');
        c.hit.style.setProperty('--ry', c.ry.toFixed(3) + 'deg');
        c.hit.style.setProperty('--px', c.px.toFixed(2) + '%');
        c.hit.style.setProperty('--py', c.py.toFixed(2) + '%');
        c.hit.style.setProperty('--il', Math.max(0, c.il).toFixed(3));
        if (!(settled(c, 'sway', 'swayV', 0, 0.003) && settled(c, 'rx', 'rxV', c.tRx, 0.003) && settled(c, 'ry', 'ryV', c.tRy, 0.003) &&
              settled(c, 'px', 'pxV', c.tPx, 0.02) && settled(c, 'py', 'pyV', c.tPy, 0.02) && settled(c, 'il', 'ilV', c.tIl, 0.001))) active = true;
      });
      if (active) requestAnimationFrame(step); else running = false;
    };
    var wake = function () { if (!running) { running = true; last = performance.now(); requestAnimationFrame(step); } };

    var setFlipped = function (c, on) {
      if (c.flipped === on) return;
      c.flipped = on;
      c.flipper.classList.toggle('is-flipped', on);
      c.front.setAttribute('aria-expanded', on ? 'true' : 'false');
      c.back.setAttribute('aria-hidden', on ? 'false' : 'true');
      c.swayV += on ? -60 : 40;                    // the turn gives the card a small kick
      wake();
    };

    cards.forEach(function (c) {
      var hit = c.hit;
      if (finePointer) {
        hit.addEventListener('pointerenter', function (e) { c.tIl = MAX_GLOW; c.lastX = e.clientX; setFlipped(c, true); wake(); });
        hit.addEventListener('pointermove', function (e) {
          var r = hit.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          c.tPx = px * 100; c.tPy = py * 100;
          c.tRx = (0.5 - py) * 18; c.tRy = (px - 0.5) * 18;
          var dx = c.lastX == null ? 0 : e.clientX - c.lastX; c.lastX = e.clientX;
          c.swayV += Math.max(-60, Math.min(60, dx)) * 2.8;   // the pointer pushes the card along
          wake();
        });
        hit.addEventListener('pointerleave', function () { c.tIl = 0; c.tRx = 0; c.tRy = 0; c.lastX = null; setFlipped(c, false); wake(); });
      }
      hit.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        if (e.target.closest('.tm-close')) { setFlipped(c, false); return; }
        setFlipped(c, !c.flipped);
      });
      c.front.addEventListener('keydown', function (e) { if (e.key === 'Escape') setFlipped(c, false); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cards.forEach(function (c) { setFlipped(c, false); }); });

    // ?flip=2,3 pre-flips cards (static previews and screenshots)
    var fm = /[?&]flip=([\d,]+)/.exec(location.search);
    if (fm) fm[1].split(',').forEach(function (n) { var c = cards[+n - 1]; if (c) { c.flipped = true; c.flipper.classList.add('is-flipped'); c.front.setAttribute('aria-expanded', 'true'); c.back.setAttribute('aria-hidden', 'false'); } });
  }

  /* ---------- 5. booking calendar ---------- */
  var booker = $('#booker');
  if (booker) {
    var titleEl = $('[data-cal-title]', booker), daysEl = $('[data-cal-days]', booker);
    var prevBtn = $('[data-cal-prev]', booker), nextBtn = $('[data-cal-next]', booker);
    var tzSel = $('[data-tz]', booker);
    var slotTitle = $('[data-slot-title]', booker), slotSub = $('[data-slot-sub]', booker);
    var slotList = $('[data-slot-list]', booker), slotEmpty = $('[data-slot-empty]', booker);
    var sumEl = $('[data-sum]', booker), reqBtn = $('[data-request]', booker);
    var gcal = $('[data-gcal]', booker), gcalSep = $('[data-gcal-sep]', booker);

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };

    // "now" expressed as a calendar date in the host zone
    var hostToday = (function () {
      var ms = Date.now() + SITE.hostOffsetMin * 60000;
      var d = new Date(ms);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
    })();
    var hostKey = function (y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); };
    var todayKey = hostKey(hostToday.y, hostToday.m, hostToday.d);
    var maxDate = new Date(Date.UTC(hostToday.y, hostToday.m, hostToday.d + SITE.daysAhead));
    var maxKey = hostKey(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate());

    // timezone list
    var browserTz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || SITE.hostTz;
    if (browserTz === 'Asia/Calcutta') browserTz = 'Asia/Kolkata';   // legacy alias some browsers still report
    var zones;
    try { zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : null; } catch (e) { zones = null; }
    if (!zones || !zones.length) zones = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo'];
    if (zones.indexOf(browserTz) < 0) zones.unshift(browserTz);
    if (zones.indexOf(SITE.hostTz) < 0) zones.unshift(SITE.hostTz);
    zones.forEach(function (z) {
      var o = document.createElement('option'); o.value = z; o.textContent = z.replace(/_/g, ' '); tzSel.appendChild(o);
    });
    tzSel.value = browserTz;

    var view = { y: hostToday.y, m: hostToday.m };
    var selectedDay = null;   // {y,m,d}
    var selectedSlot = null;  // utc ms

    var fmt = function (ms, opts) {
      opts.timeZone = tzSel.value;
      return new Intl.DateTimeFormat('en-GB', opts).format(new Date(ms));
    };
    var tzShort = function (ms) {
      if (tzSel.value === 'Asia/Kolkata' || tzSel.value === 'Asia/Calcutta') return 'IST';
      try {
        var parts = new Intl.DateTimeFormat('en-GB', { timeZone: tzSel.value, timeZoneName: 'short' }).formatToParts(new Date(ms));
        var p = parts.filter(function (x) { return x.type === 'timeZoneName'; })[0];
        return p ? p.value : tzSel.value;
      } catch (e) { return tzSel.value; }
    };
    // true when the visitor's zone shows the same wall-clock time as the host zone
    var sameAsHost = function (ms) {
      var o = { hour: '2-digit', minute: '2-digit', day: 'numeric', hour12: false, timeZone: tzSel.value };
      var a = new Intl.DateTimeFormat('en-GB', o).format(new Date(ms));
      o.timeZone = SITE.hostTz;
      return a === new Intl.DateTimeFormat('en-GB', o).format(new Date(ms));
    };

    var slotsFor = function (day) {
      var out = [];
      var earliest = Date.now() + SITE.leadHours * 3600000;
      for (var t = SITE.workStart; t + SITE.slotMin <= SITE.workEnd; t += SITE.slotMin) {
        var ms = Date.UTC(day.y, day.m, day.d, 0, t) - SITE.hostOffsetMin * 60000;
        if (ms >= earliest) out.push(ms);
      }
      return out;
    };

    var renderMonth = function () {
      titleEl.textContent = MONTHS[view.m] + ' ' + view.y;
      daysEl.innerHTML = '';
      var first = new Date(Date.UTC(view.y, view.m, 1));
      var lead = (first.getUTCDay() + 6) % 7;             // Monday first
      var count = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
      for (var i = 0; i < lead; i++) { var e = document.createElement('span'); e.className = 'day is-empty'; daysEl.appendChild(e); }
      for (var d = 1; d <= count; d++) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'day'; b.textContent = d;
        var key = hostKey(view.y, view.m, d);
        var dow = new Date(Date.UTC(view.y, view.m, d)).getUTCDay();
        var past = key < todayKey, far = key > maxKey, weekend = dow === 0 || dow === 6;
        var noSlots = key === todayKey && slotsFor({ y: view.y, m: view.m, d: d }).length === 0;
        if (past || far || weekend || noSlots) b.disabled = true;
        if (key === todayKey) b.classList.add('is-today');
        if (selectedDay && key === hostKey(selectedDay.y, selectedDay.m, selectedDay.d)) b.classList.add('is-selected');
        b.setAttribute('aria-label', DOW[dow] + ' ' + d + ' ' + MONTHS[view.m] + ' ' + view.y);
        (function (dd) { b.addEventListener('click', function () { pickDay({ y: view.y, m: view.m, d: dd }); }); })(d);
        daysEl.appendChild(b);
      }
      prevBtn.disabled = view.y === hostToday.y && view.m === hostToday.m;
      nextBtn.disabled = view.y === maxDate.getUTCFullYear() && view.m === maxDate.getUTCMonth();
    };

    var renderSlots = function () {
      slotList.innerHTML = '';
      if (!selectedDay) {
        slotTitle.textContent = 'Pick a day';
        slotSub.textContent = 'Monday to Friday, 10:00 to 18:30 India time';
        slotList.hidden = true; slotEmpty.hidden = false;
        slotEmpty.textContent = 'Choose a weekday on the calendar to see available times.';
        return;
      }
      var dayMs = Date.UTC(selectedDay.y, selectedDay.m, selectedDay.d, 6, 0);
      slotTitle.textContent = fmt(dayMs, { weekday: 'long', day: 'numeric', month: 'long' });
      slotSub.textContent = '30-minute slots · ' + tzShort(dayMs);
      var list = slotsFor(selectedDay);
      if (!list.length) { slotList.hidden = true; slotEmpty.hidden = false; slotEmpty.textContent = 'No times left on this day. Try the next one.'; return; }
      slotList.hidden = false; slotEmpty.hidden = true;
      var dayLabel = fmt(dayMs, { day: 'numeric', month: 'short' });
      list.forEach(function (ms) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'slot';
        var local = fmt(ms, { hour: '2-digit', minute: '2-digit', hour12: false });
        var localDay = fmt(ms, { day: 'numeric', month: 'short' });
        b.textContent = localDay === dayLabel ? local : local + ' · ' + localDay;
        if (selectedSlot === ms) b.classList.add('is-selected');
        b.addEventListener('click', function () { selectedSlot = ms; renderSlots(); renderConfirm(); });
        slotList.appendChild(b);
      });
    };

    var renderConfirm = function () {
      if (!selectedSlot) {
        sumEl.textContent = 'No time selected yet';
        reqBtn.setAttribute('aria-disabled', 'true'); reqBtn.href = '#';
        gcal.hidden = true; gcalSep.hidden = true;
        return;
      }
      var start = selectedSlot, end = start + SITE.slotMin * 60000;
      var local = fmt(start, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' +
        fmt(start, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' to ' + fmt(end, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' + tzShort(start);
      var saved = tzSel.value, same = sameAsHost(start); tzSel.value = SITE.hostTz;
      var host = fmt(start, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + fmt(start, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
      tzSel.value = saved;
      sumEl.textContent = local + (same ? '' : ' (' + host + ')');

      reqBtn.setAttribute('aria-disabled', 'false');
      var iso = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
      var gcalHref = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        '&text=' + encodeURIComponent('Intro call with UNBOUND') +
        '&dates=' + iso(start) + '/' + iso(end) +
        '&details=' + encodeURIComponent('30 minutes with the UNBOUND founders.\n\nWe will talk about your brand, the story you want told, and where PR, social, ATL, BTL and events can move it.\n\nYour brand:\nWhat you want people to say about it:\n\nBooked from ' + location.origin + location.pathname) +
        '&add=' + encodeURIComponent(SITE.emails.join(','));
      reqBtn.href = SITE.bookingUrl || gcalHref;
      reqBtn.target = '_blank'; reqBtn.rel = 'noopener';
      reqBtn.setAttribute('data-slot', new Date(start).toISOString());
      reqBtn.setAttribute('data-slot-label', host + (same ? '' : ' (' + local + ')'));
      gcal.hidden = true; gcalSep.hidden = true;
    };

    var pickDay = function (day) { selectedDay = day; selectedSlot = null; renderMonth(); renderSlots(); renderConfirm(); };

    prevBtn.addEventListener('click', function () { view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderMonth(); });
    nextBtn.addEventListener('click', function () { view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderMonth(); });
    tzSel.addEventListener('change', function () { renderSlots(); renderConfirm(); });
    reqBtn.addEventListener('click', function (e) {
      if (reqBtn.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
      fwSend({ type: 'booking', slot: reqBtn.getAttribute('data-slot'), slotLabel: reqBtn.getAttribute('data-slot-label'), visitorTz: tzSel.value }, true).catch(function () {});
    });

    renderMonth(); renderSlots(); renderConfirm();
  }

  /* ---------- 6. floating composer ("Talk" bar) ----------
     No backend: short answers for the usual questions, each pointing at the section that
     proves it; anything else is handed to the team by email. The mic uses the browser's
     own speech recognition where it exists (Chrome, Edge, Safari). */
  var talk = $('#talk');
  if (talk) {
    var tForm = $('#talk-form'), tInput = $('#talk-input'), tSend = $('#talk-send'), tMic = $('#talk-mic');
    var tSheet = $('#talk-sheet'), tLog = $('#talk-log'), tSuggest = $('#talk-suggest');
    var mailAll = 'mailto:' + SITE.emails.join(',');

    // placeholder types itself, like a prompt waiting to be answered
    var prompts = ['Talk', 'Ask what we do', 'Ask what makes us different', 'Ask about the founders', 'Talk'];
    var pIdx = 0, pTimer = null;
    var typePlaceholder = function () {
      if (prefersReduced || staticMode) { tInput.placeholder = 'Talk'; return; }
      var text = prompts[pIdx % prompts.length], i = 0;
      var tick = function () {
        if (document.activeElement === tInput && tInput.value) return;
        i++; tInput.placeholder = text.slice(0, i);
        if (i < text.length) pTimer = setTimeout(tick, 42);
        else pTimer = setTimeout(function () { pIdx++; typePlaceholder(); }, text === 'Talk' ? 5200 : 2600);
      };
      tick();
    };
    typePlaceholder();

    var autosize = function () { tInput.style.height = '20px'; tInput.style.height = Math.max(20, Math.min(120, tInput.scrollHeight - 16)) + 'px'; };
    tInput.addEventListener('input', function () { autosize(); tSend.disabled = !tInput.value.trim(); });
    tInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); tForm.requestSubmit(); } if (e.key === 'Escape') closeSheet(); });

    var openSheet = function () { if (tSheet.hidden) { tSheet.hidden = false; } };
    var closeSheet = function () { tSheet.hidden = true; };
    $('[data-talk-close]', talk).addEventListener('click', closeSheet);
    tInput.addEventListener('focus', openSheet);
    tForm.addEventListener('pointerdown', openSheet);
    tInput.addEventListener('input', function () { if (tInput.value) openSheet(); });
    document.addEventListener('pointerdown', function (e) { if (!talk.contains(e.target)) closeSheet(); });   // tap anywhere else to put it away; the conversation is kept
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
    var tChip = function (label, href, dark, external) {
      return '<a class="talk-chip' + (dark ? ' dark' : '') + '" href="' + href + '"' + (external ? ' target="_blank" rel="noopener"' : '') + '>' + esc(label) + ' <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>';
    };
    var answers = [
      { id: 'thanks', re: /\b(thanks|thank you|bye|goodbye|cheers)\b/i, text: 'Thanks for stopping by. If you would like to talk it through, pick a time below.', actions: [['Book a call', '#book', true]] },
      { id: 'hi', re: /\b(hi|hello|hey|yo|namaste)\b/i, text: 'Hi. Ask about what we do, how we work, the founders, or pick a time below.', actions: [['See services', '#services'], ['Book a call', '#book', true]] },
      { id: 'why', re: /\b(why (you|unbound|should|choose|hire|pick)|different|difference|unique|usp|stand out|better than|agency|agencies|freelancer\w*|in-house)\b/i, text: 'Most brands juggle a PR firm, a social shop, a media agency and an events vendor, each with its own brief. UNBOUND runs all of it from one story, one plan and one founder-led team, so every channel says the same thing.', actions: [['Why UNBOUND', '#usp'], ['Book a call', '#book', true]] },
      { id: 'services', re: /\b(what do you do|services?|offer|offerings|capabilit\w*|do you do|help (me|us) with|everything you do|what can you)\b/i, text: 'Everything a brand needs to be seen and talked about: PR and reputation, growth strategy, social media, ATL campaigns, BTL activations and events. One team, one plan.', actions: [['See services', '#services']] },
      { id: 'pricing', re: /\b(price|pricing|cost|budget|fee|retainer|how much|rates?)\b/i, text: 'Two ways in: a monthly partnership, or a fixed-scope project such as a launch or a campaign. The price comes with your written plan, within three working days of a call.', actions: [['Ways to work with us', '#ways'], ['Book a call', '#book', true]] },
      { id: 'timeline', re: /\b(how long|how soon|how quickly|how fast|timeline|time ?frame|turnaround|see results)\b/i, text: 'Within three working days of a call you get a written plan and the price. Once we start: a weekly update, a review every two weeks and a full report every month.', actions: [['How we start', '#process'], ['Book a call', '#book', true]] },
      { id: 'team', re: /\b(team|who|people|founders?|himani|amisha)\b/i, text: 'UNBOUND was founded by Himani Sharma and Amisha Sethi. The founders lead every account themselves.', actions: [['Our story', '#story'], ['Meet the founders', '#team']] },
      { id: 'pr', re: /\b(pr|press|media|reputation|crisis|journalist|coverage|thought leadership)\b/i, text: 'PR and reputation: media relations, founder and executive profiling, launches, crisis communication and reputation management.', actions: [['See services', '#services']] },
      { id: 'growth', re: /\b(growth|strategy|positioning|brand strategy|go[- ]to[- ]market|gtm|launch|plan)\b/i, text: 'Growth strategy: positioning, go-to-market plans, audience insight and a channel plan that ties PR, social, ATL and BTL to the numbers you need to move.', actions: [['See services', '#services']] },
      { id: 'social', re: /\b(social|instagram|linkedin|youtube|influencer\w*|creator\w*|content|reels?)\b/i, text: 'Social media: strategy, content, community management, creator and influencer programmes, and paid social.', actions: [['See services', '#services']] },
      { id: 'atl', re: /\b(atl|above the line|tv|radio|print|outdoor|ooh|billboard|campaign|advertis\w*)\b/i, text: 'ATL: big-idea campaigns across TV, radio, print, outdoor and digital video, with media planning and buying.', actions: [['See services', '#services']] },
      { id: 'btl', re: /\b(btl|below the line|activation\w*|sampling|retail|mall|on[- ]ground|experiential)\b/i, text: 'BTL: on-ground activations, retail and in-store, sampling, mall and campus programmes, and experiential marketing.', actions: [['See services', '#services']] },
      { id: 'events', re: /\b(event|events|launch event|summit|conference|dinner|roundtable|exhibition|booth)\b/i, text: 'Events: product launches, conferences, brand experiences, executive dinners and exhibitions, from concept to follow-up.', actions: [['See services', '#services']] },
      { id: 'start', re: /\b(start|begin|first|onboard|kick ?off|engage|hire|work with|how do we)\b/i, text: 'Book a 30-minute call with the founders. Tell us what you want people to say about your brand. Within three working days you get a written plan and what it would cost.', actions: [['Book a call', '#book', true], ['How we start', '#process']] },
      { id: 'book', re: /\b(book|call|meeting|calendar|schedule|talk to|speak|contact|reach)\b/i, text: 'Pick a time below; it opens Google Calendar with the UNBOUND founders invited.', actions: [['Book a call', '#book', true], ['Contact us', 'contact/']] },
      { id: 'where', re: /\b(where|location|based|india|remote|time ?zones?|countr\w*|international\w*|globally|overseas|abroad)\b/i, text: 'We are based in India and work with brands anywhere; call times are shown in your timezone in the booking calendar.', actions: [['Book a call', '#book', true]] }
    ];
    var reply = function (q) {
      var soft = { hi: 1, thanks: 1, services: 1, start: 1, growth: 1 }, hit = null;
      for (var i = 0; i < answers.length; i++) if (answers[i].re.test(q)) { if (!soft[answers[i].id]) return answers[i]; hit = hit || answers[i]; }
      if (hit) return hit;
      return { id: 'unknown', text: 'Noted. The quickest way to get a real answer is to send this to the team, or pick a time below and we will come prepared.', actions: [['Email this to the team', mailAll + '?subject=' + encodeURIComponent('From the UNBOUND website') + '&body=' + encodeURIComponent(q + '\n\n'), true, true], ['Book a call', '#book']] };
    };
    var tAdd = function (cls, html) { var d = document.createElement('div'); d.className = 'talk-msg ' + cls; d.innerHTML = html; tLog.appendChild(d); tSheet.scrollTop = tSheet.scrollHeight; return d; };
    var ask = function (q) {
      q = q.trim(); if (!q) return;
      openSheet(); tSuggest.hidden = true;
      tAdd('user', esc(q));
      var typing = tAdd('bot', '<span class="talk-typing"><i></i><i></i><i></i></span>');
      var a = reply(q);
      setTimeout(function () {
        typing.innerHTML = esc(a.text) + '<div class="talk-actions">' + a.actions.map(function (x) { return tChip(x[0], x[1], x[2], x[3]); }).join('') + '</div>';
        tSheet.scrollTop = tSheet.scrollHeight;
      }, prefersReduced ? 0 : 650);
      tInput.value = ''; autosize(); tSend.disabled = true; tInput.focus();
    };
    tForm.addEventListener('submit', function (e) { e.preventDefault(); ask(tInput.value); });
    $$('[data-talk-ask]', talk).forEach(function (b) { b.addEventListener('click', function () { ask(b.getAttribute('data-talk-ask')); }); });
    tLog.addEventListener('click', function (e) { var a = e.target.closest('a'); if (a && a.getAttribute('href').charAt(0) === '#') closeSheet(); });

    // speech to text where the browser offers it
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      tMic.hidden = false;
      var rec = null, listening = false;
      tMic.addEventListener('click', function () {
        if (listening) { rec.stop(); return; }
        rec = new SR(); rec.lang = (navigator.language || 'en-IN'); rec.interimResults = true; rec.maxAlternatives = 1;
        var base = tInput.value ? tInput.value.replace(/\s+$/, '') + ' ' : '';
        rec.onstart = function () { listening = true; tMic.classList.add('is-listening'); tInput.placeholder = 'Listening…'; };
        rec.onresult = function (ev) { var s = ''; for (var i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript; tInput.value = base + s; autosize(); tSend.disabled = !tInput.value.trim(); };
        rec.onerror = function () { listening = false; tMic.classList.remove('is-listening'); tInput.placeholder = 'Talk'; };
        rec.onend = function () { listening = false; tMic.classList.remove('is-listening'); tInput.placeholder = 'Talk'; if (tInput.value.trim()) tInput.focus(); };
        try { rec.start(); } catch (err) { listening = false; }
      });
    }

    // ?talk=<question> opens the sheet with that question (screenshots, QA)
    var tq = /[?&]talk=([^&]+)/.exec(location.search);
    if (tq) ask(decodeURIComponent(tq[1].replace(/\+/g, ' ')));
  }



  /* ---------- 8. process: the monthly rhythm ----------
     When the section scrolls into view a cursor sweeps across thirty days; each dot lights as it
     passes and wakes the card it belongs to. Hovering a card highlights its lane, and back. */
  var rh = $('#rhythm');
  if (rh) {
    var rhDots = $$('.rh-lane i', rh).map(function (el) { return { el: el, d: parseFloat(el.style.getPropertyValue('--d')) || 1, kind: el.closest('.rh-row').getAttribute('data-kind') }; });
    var rhCards = {}, rhRows = {};
    $$('.rh-card', rh).forEach(function (c) { rhCards[c.getAttribute('data-kind')] = c; });
    $$('.rh-row', rh).forEach(function (r) { rhRows[r.getAttribute('data-kind')] = r; });
    var rhSet = function (p, quiet) {
      rh.style.setProperty('--p', p.toFixed(4));
      rhDots.forEach(function (o) {
        if (o.el.classList.contains('is-lit') || p < (o.d - 0.5) / 30) return;
        o.el.classList.add('is-lit');
        var c = rhCards[o.kind]; if (!c) return;
        c.classList.add('is-lit');
        if (!quiet) { c.classList.remove('is-pulse'); void c.offsetWidth; c.classList.add('is-pulse'); }
      });
    };
    var rhPlay = function () {
      if (prefersReduced || staticMode) { rhSet(1, true); rh.classList.add('is-done'); return; }
      var t0 = null, dur = 5600;
      var tick = function (now) { if (t0 === null) t0 = now; var p = Math.min(1, (now - t0) / dur); rhSet(p); if (p < 1) requestAnimationFrame(tick); else setTimeout(function () { rh.classList.add('is-done'); }, 600); };
      requestAnimationFrame(tick);
    };
    if (prefersReduced || staticMode || !('IntersectionObserver' in window)) rhPlay();
    else { var rio = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { rhPlay(); rio.disconnect(); } }); }, { threshold: 0.3 }); rio.observe(rh); }
    Object.keys(rhCards).forEach(function (k) {
      var on = function () { rh.setAttribute('data-focus', k); }, off = function () { rh.removeAttribute('data-focus'); };
      [rhCards[k], rhRows[k]].forEach(function (el) { if (el) { el.addEventListener('pointerenter', on); el.addEventListener('pointerleave', off); } });
    });
  }

  /* ---------- 9. live work mocks ----------
     Each work card plays a short loop of what we shipped, only while it is on screen.
     Reduced motion and ?static=1 show the finished frame. */
  (function () {
    var mocks = $$('[data-live]');
    if (!mocks.length) return;
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var count = function (el, ms) {
      var to = parseFloat(el.getAttribute('data-count')), dec = +(el.getAttribute('data-dec') || 0), t0 = performance.now();
      return new Promise(function (done) {
        var tick = function (t) { var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = (to * e).toFixed(dec); if (k < 1) requestAnimationFrame(tick); else done(); };
        requestAnimationFrame(tick);
      });
    };
    var finalFrame = function (m) {
      $$('.lm-w-flow li, .lm-e-seats i', m).forEach(function (el) { el.classList.add('on'); }); m.style.setProperty('--wp', '100%');
      for (var i = 1; i <= 7; i++) m.classList.add('s' + i);
      $$('[data-count]', m).forEach(function (el) { el.textContent = (+el.getAttribute('data-count')).toFixed(+(el.getAttribute('data-dec') || 0)); });
      $$('[data-type]', m).forEach(function (el) { el.textContent = el.getAttribute('data-type'); });
      var c = $('.lm-caret', m); if (c) c.style.display = 'none';
    };
    var reset = function (m) {
      $$('.lm-w-flow li, .lm-e-seats i', m).forEach(function (el) { el.classList.remove('on'); }); m.style.removeProperty('--wp');
      for (var i = 1; i <= 7; i++) m.classList.remove('s' + i);
      $$('[data-count]', m).forEach(function (el) { el.textContent = (0).toFixed(+(el.getAttribute('data-dec') || 0)); });
      $$('[data-type]', m).forEach(function (el) { el.textContent = ''; });
    };
    var PLAY = {
      w: function (m) {
        var steps = $$('.lm-w-flow li', m), i = 0;
        return wait(400).then(function next() {
          if (i >= steps.length) return null;
          steps[i].classList.add('on'); m.style.setProperty('--wp', ((i + 1) / steps.length * 100) + '%'); i++;
          return wait(850).then(next);
        }).then(function () { m.classList.add('s1'); return wait(3800); });
      },
      e: function (m) {
        var dots = $$('.lm-e-seats i', m), i = 0;
        return wait(400)
          .then(function () { m.classList.add('s1'); var c = $('[data-count]', m); if (c) count(c, 2200); return new Promise(function (done) {
            var t = setInterval(function () { if (i < dots.length) { dots[i].classList.add('on'); i++; } else { clearInterval(t); done(); } }, 2200 / dots.length);
          }); })
          .then(function () { return wait(500); })
          .then(function () { m.classList.add('s2'); return wait(3800); });
      },
      g: function (m, on) {
        var q = $('[data-type]', m), text = q.getAttribute('data-type'), i = 0;
        return wait(500).then(function type() {
          if (!on()) return;
          q.textContent = text.slice(0, ++i);
          return i < text.length ? wait(45 + Math.random() * 45).then(type) : null;
        }).then(function () { return wait(350); })
          .then(function () { m.classList.add('s1', 's2'); return wait(1100); })
          .then(function () { m.classList.add('s3'); return wait(1500); })
          .then(function () { m.classList.add('s4'); return wait(1100); })
          .then(function () { m.classList.add('s5'); return wait(3800); });
      },
      r: function (m) {
        return wait(400)
          .then(function () { m.classList.add('s1'); return Promise.all($$('[data-count]', m).map(function (el) { return count(el, 1400); })); })
          .then(function () { return wait(600); })
          .then(function () { m.classList.add('s2'); return wait(4200); });
      },
      v: function (m) {
        var cta = $('.lm-v-cta', m);
        return wait(300)
          .then(function () { m.classList.add('s1'); return wait(1100); })
          .then(function () { m.classList.add('s2'); return wait(600); })
          .then(function () { m.classList.add('s3'); return wait(900); })
          .then(function () {
            var a = m.getBoundingClientRect(), b = cta.getBoundingClientRect();
            m.style.setProperty('--cx', (b.left - a.left + b.width * 0.62) + 'px'); m.style.setProperty('--cy', (b.top - a.top + b.height * 0.45) + 'px');
            m.classList.add('s4'); return wait(150);
          })
          .then(function () { m.classList.add('s5'); return wait(1150); })
          .then(function () { m.classList.add('s6'); return wait(900); })
          .then(function () { m.classList.add('s7'); return Promise.all($$('[data-count]', m).map(function (el) { return count(el, 1300); })); })
          .then(function () { return wait(3600); });
      }
    };
    if (prefersReduced || staticMode || !('IntersectionObserver' in window)) { mocks.forEach(finalFrame); return; }
    mocks.forEach(function (m) {
      var visible = false, running = false;
      var loop = function () {
        if (running || !visible) return;
        running = true; reset(m);
        PLAY[m.getAttribute('data-live')](m, function () { return visible; }).then(function () {
          running = false;
          if (visible) { m.classList.add('is-out'); setTimeout(function () { m.classList.remove('is-out'); loop(); }, 450); }
        });
      };
      new IntersectionObserver(function (es) { es.forEach(function (e) { visible = e.isIntersecting; if (visible) loop(); }); }, { threshold: 0.35 }).observe(m);
    });
  })();

  /* ---------- 11b. analytics: key clicks and the AI check (GA4 via fwTrack) ---------- */
  (function () {
    var where = function (el) { var s = el.closest('section[id],header,footer,aside,.strip,.talk'); return s ? (s.id || s.className.split(' ')[0] || s.tagName.toLowerCase()) : 'page'; };
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a,button');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (/#book$/.test(href)) fwTrack('book_call_click', { cta_location: where(a), cta_text: (a.textContent || '').trim().slice(0, 40) });
      else if (/^mailto:/.test(href)) fwTrack('email_click', { cta_location: where(a) });
      else if (a.hasAttribute('data-ai')) fwTrack('ai_summary_click', { assistant: a.getAttribute('data-label') || '' });
      else if (/google\.com\/preferences\/source/.test(href)) fwTrack('preferred_source_click', {});
    }, true);
  })();

  /* ---------- 10. services: tap to open on touch screens ----------
     Hover (or keyboard focus) makes a card bigger and shows the detail; touch toggles it. */
  (function () {
    var cards = $$('.svc');
    // pin each slot to its resting height, so a hovered card can grow over the content below without moving it
    var size = function () {
      cards.forEach(function (c) { c.classList.remove('js-sized'); c.style.height = ''; });
      if (window.matchMedia('(hover: none)').matches) return;
      var hs = cards.map(function (c) { return c.offsetHeight; });
      cards.forEach(function (c, i) { c.style.height = hs[i] + 'px'; c.classList.add('js-sized'); });
    };
    if (cards.length) { size(); window.addEventListener('resize', function () { clearTimeout(size.t); size.t = setTimeout(size, 150); }); if (document.fonts && document.fonts.ready) document.fonts.ready.then(size); }
    cards.forEach(function (c) {
      c.addEventListener('click', function (e) {
        if (e.target.closest('a') || window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        var on = !c.classList.contains('is-open');
        cards.forEach(function (o) { o.classList.remove('is-open'); });
        c.classList.toggle('is-open', on);
      });
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.svc')) cards.forEach(function (o) { o.classList.remove('is-open'); }); });
  })();

  /* ---------- 11. email capture and contact form ----------
     Both post through fwSend. Until the backend knows the "subscribe" and "contact" types, the same
     details are logged through the existing booking type so nothing is lost; the contact form
     falls back to the visitor's own email app as a last resort. */
  (function () {
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var send = function (payload, bridgeLabel) {
      return fwSend(payload).catch(function (err) {
        if (!/unknown type/i.test(String(err && err.message))) throw err;
        return fwSend({ type: 'booking', slotLabel: bridgeLabel.slice(0, 480), slot: payload.type, visitorTz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''), website: payload.website });
      });
    };
    var subscribed = function () { try { return !!localStorage.getItem('fw-sub'); } catch (e) { return false; } };

    // subscribe forms (section and pop-up)
    $$('[data-sub]').forEach(function (f) {
      var st = $('.sub-status', f), em = $('input[name="email"]', f), hp = $('input[name="website"]', f), btn = $('button[type="submit"]', f);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = em.value.trim();
        if (hp.value) { st.textContent = 'Thanks.'; return; }
        if (!EMAIL_RE.test(email)) { st.className = 'sub-status err'; st.textContent = 'Please add a valid email.'; em.focus(); return; }
        btn.disabled = true; st.className = 'sub-status'; st.textContent = 'Subscribing…';
        send({ type: 'subscribe', email: email, source: f.getAttribute('data-sub'), website: hp.value }, 'Email sign-up · ' + email + ' · ' + f.getAttribute('data-sub'))
          .then(function () {
            try { localStorage.setItem('fw-sub', String(Date.now())); } catch (err) {}
            f.classList.add('is-done'); st.className = 'sub-status ok'; st.textContent = 'You are in. Thanks for subscribing.';
            if (f.getAttribute('data-sub') === 'popup') setTimeout(hidePop, 1800);
          })
          .catch(function () { btn.disabled = false; st.className = 'sub-status err'; st.innerHTML = 'That did not go through. <a href="mailto:' + SITE.emails[0] + '?subject=' + encodeURIComponent('Subscribe me to UNBOUND notes') + '&body=' + encodeURIComponent(email) + '">Email us to subscribe</a> instead.'; });
      });
    });

    // pop-up: once, after the visitor has read half the page; never if subscribed or dismissed in the last 21 days
    var pop = $('#sub-pop');
    var hidePop = function () { if (pop) pop.hidden = true; };
    if (pop) {
      var KEY = 'fw-sub-pop', recent = false;
      try { recent = Date.now() - (+localStorage.getItem(KEY) || 0) < 21 * 864e5; } catch (e) {}
      var shown = false;
      var maybe = function () {
        if (shown || recent || subscribed() || staticMode) return;
        var talk = $('#talk'); if (talk && talk.classList.contains('is-voice')) return;
        var p = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
        if (p > 0.55) { shown = true; pop.hidden = false; try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} window.removeEventListener('scroll', maybe); }
      };
      window.addEventListener('scroll', maybe, { passive: true });
      $('[data-sub-close]', pop).addEventListener('click', hidePop);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hidePop(); });
      if (/[?&]subpop=1/.test(location.search)) { pop.hidden = false; }
    }

    // contact page form
    var cf = $('[data-contact]');
    if (cf) {
      var cst = $('.form-status', cf), cbtn = $('button[type="submit"]', cf);
      cf.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = function (n) { var el = $('[name="' + n + '"]', cf); return el ? el.value.trim() : ''; };
        var d = { type: 'contact', name: v('name'), email: v('email'), company: v('company'), message: v('message'), website: v('website') };
        if (d.website) { cst.textContent = 'Sent.'; return; }
        if (d.name.length < 2) { cst.className = 'form-status err'; cst.textContent = 'Please add your name.'; $('[name="name"]', cf).focus(); return; }
        if (!EMAIL_RE.test(d.email)) { cst.className = 'form-status err'; cst.textContent = 'Please add a valid email.'; $('[name="email"]', cf).focus(); return; }
        if (d.message.length < 5) { cst.className = 'form-status err'; cst.textContent = 'Please add a short message.'; $('[name="message"]', cf).focus(); return; }
        cbtn.disabled = true; cst.className = 'form-status'; cst.textContent = 'Sending…';
        send(d, 'Contact · ' + d.name + ' · ' + d.email + (d.company ? ' · ' + d.company : '') + ' · ' + d.message)
          .then(function () { cf.reset(); cbtn.disabled = false; cst.className = 'form-status ok'; cst.textContent = 'Thanks, ' + d.name.split(' ')[0] + '. Your message is with the UNBOUND team, and we will reply by email.'; })
          .catch(function () {
            cbtn.disabled = false;
            var mail = 'mailto:' + SITE.emails[0] + '?subject=' + encodeURIComponent('Hello from ' + d.name + (d.company ? ' · ' + d.company : '')) + '&body=' + encodeURIComponent(d.message + '\n\n' + d.name + '\n' + d.email);
            cst.className = 'form-status err'; cst.innerHTML = 'We could not send it from here just now. <a href="' + mail + '">Send it from your email app</a> instead.';
          });
      });
    }
  })();

})();
