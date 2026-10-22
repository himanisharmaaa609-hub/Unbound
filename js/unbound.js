/* ==========================================================================
   UNBOUND — motion for the sections added on top of site.js
   1. hero film + headline   2. word rotator   3. story paths
   4. workspace screens
   Reduced motion and ?static=1 show every final state at once.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var staticMode = /[?&]static=1/.test(location.search);
  var still = prefersReduced || staticMode;

  // one rAF-throttled scroll loop for everything scroll-driven
  var onScrollFns = [];
  var ticking = false;
  var runScroll = function () { ticking = false; onScrollFns.forEach(function (f) { f(); }); };
  var queue = function () { if (!ticking) { ticking = true; requestAnimationFrame(runScroll); } };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);

  /* ---------- 1. hero: the film plays only while on screen; phones get the lighter file ---------- */
  var video = $('[data-ub-video]');
  if (video) {
    var mobileSrc = video.getAttribute('data-src-mobile');
    if (mobileSrc && window.innerWidth < 760) {
      $$('source', video).forEach(function (s) { s.remove(); });
      video.src = mobileSrc;
    }
    var ready = function () { video.classList.add('is-ready'); };
    video.addEventListener('playing', ready, { once: true });
    if (still) { video.removeAttribute('autoplay'); video.pause(); }
    else {
      var tryPlay = function () { var p = video.play(); if (p && p.catch) p.catch(function () {}); };
      if (video.readyState >= 2) tryPlay(); else video.addEventListener('canplay', tryPlay, { once: true });
      video.load();
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) tryPlay(); else video.pause(); });
        }, { threshold: 0.05 }).observe(video);
      }
      document.addEventListener('visibilitychange', function () { if (document.hidden) video.pause(); else tryPlay(); });
    }
  }

  // headline: each word rises in on its own, in order
  var h1 = $('.ub-h1');
  if (h1 && !still) {
    var i = 0;
    var wrapWords = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = document.createElement('span'); w.className = 'ub-w';
            var inner = document.createElement('span'); inner.style.setProperty('--i', i++); inner.textContent = part;
            w.appendChild(inner); frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) wrapWords(n);
      });
    };
    wrapWords(h1);
  }

  /* ---------- 2. word rotator ---------- */
  var rot = $('.ub-rot');
  if (rot && !still) {
    var words = $$('.ub-rot-w', rot), at = 0;
    setInterval(function () {
      if (document.hidden) return;
      var cur = words[at], next = words[(at + 1) % words.length];
      cur.classList.remove('is-on'); cur.classList.add('is-out');
      next.classList.remove('is-out'); next.classList.add('is-on');
      setTimeout(function () { cur.classList.remove('is-out'); }, 700);
      at = (at + 1) % words.length;
    }, 2800);
  }

  /* ---------- 3. story: two lines draw as you read, and meet at the end ---------- */
  var story = $('#story');
  if (story) {
    var chapters = $$('.ub-chapter', story), stepEl = $('[data-ub-step]', story), list = $('.ub-chapters', story);
    var setStory = function (p) {
      story.style.setProperty('--sp-story', p.toFixed(4));
      story.classList.toggle('is-met', p > 0.94);
    };
    if (still) {
      setStory(1);
      chapters.forEach(function (c) { c.classList.add('is-on'); });
      if (stepEl) stepEl.textContent = '04';
    } else {
      onScrollFns.push(function () {
        var r = list.getBoundingClientRect(), vh = window.innerHeight;
        var p = (vh * 0.65 - r.top) / Math.max(1, r.height);
        setStory(Math.max(0, Math.min(1, p)));
        var active = 0;
        chapters.forEach(function (c, k) { if (c.getBoundingClientRect().top < vh * 0.62) active = k; });
        chapters.forEach(function (c, k) { c.classList.toggle('is-on', k === active); });
        if (stepEl) stepEl.textContent = '0' + (active + 1);
      });
    }
  }

  /* ---------- 4. workspace: sample screens rotate on their own ---------- */
  var wrap = $('[data-ub-work]');
  if (wrap) {
    var tabs = $$('[data-ub-shot]', wrap), shots = $$('.ub-shot', wrap);
    var cur = 0, t0 = 0, DUR = 7000, paused = false, visible = false;
    var show = function (k) {
      cur = k; t0 = performance.now();
      tabs.forEach(function (t, j) { t.classList.toggle('is-on', j === k); t.setAttribute('aria-selected', j === k ? 'true' : 'false'); t.style.setProperty('--wp', 0); });
      shots.forEach(function (s, j) { s.classList.toggle('is-on', j === k); });
    };
    tabs.forEach(function (t, k) { t.addEventListener('click', function () { show(k); }); });
    if (!still) {
      wrap.addEventListener('pointerenter', function () { paused = true; });
      wrap.addEventListener('pointerleave', function () { paused = false; });
      var tick = function (now) {
        var done = parseFloat(tabs[cur].style.getPropertyValue('--wp')) || 0;
        if (visible && !paused && !document.hidden) {
          var p = Math.min(1, (now - t0) / DUR);
          tabs[cur].style.setProperty('--wp', p.toFixed(4));
          if (p >= 1) show((cur + 1) % tabs.length);
        } else t0 = now - DUR * done;
        requestAnimationFrame(tick);
      };
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { es.forEach(function (e) { visible = e.isIntersecting; }); }, { threshold: 0.3 }).observe(wrap);
      else visible = true;
      t0 = performance.now(); requestAnimationFrame(tick);
    }
  }

  queue();
})();
