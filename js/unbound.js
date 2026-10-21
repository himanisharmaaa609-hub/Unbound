/* ==========================================================================
   UNBOUND — motion for the sections added on top of site.js
   1. scroll progress   2. hero headline + word rotator   3. story paths
   4. compare toggle    5. manifesto words                6. magnetic buttons
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

  /* ---------- 1. scroll progress ---------- */
  var bar = $('.ub-progress');
  if (bar) onScrollFns.push(function () {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.setProperty('--sp', h > 0 ? Math.min(1, window.scrollY / h).toFixed(4) : 0);
  });

  /* ---------- 2. hero: "unbound." rises letter by letter, flame to violet ---------- */
  var word = $('.ub-unbound > span');
  if (word && !still) {
    var text = word.textContent, from = [255, 74, 28], to = [79, 43, 245], n = text.length;
    word.parentNode.classList.add('is-split');
    word.innerHTML = text.split('').map(function (ch, i) {
      var k = Math.min(1, i / Math.max(1, n - 2));
      var c = from.map(function (v, j) { return Math.round(v + (to[j] - v) * k); });
      return '<span class="ub-ch" style="--i:' + i + ';color:rgb(' + c.join(',') + ')">' + ch + '</span>';
    }).join('');
  }

  var rot = $('.ub-rot');
  if (rot && !still) {
    var words = $$('.ub-rot-w', rot), at = 0;
    setInterval(function () {
      if (document.hidden) return;
      var cur = words[at], next = words[(at + 1) % words.length];
      cur.classList.remove('is-on'); cur.classList.add('is-out');
      next.classList.remove('is-out'); next.classList.add('is-on');
      setTimeout(function () { cur.classList.remove('is-out'); }, 600);
      at = (at + 1) % words.length;
    }, 2400);
  }

  /* ---------- 3. story: two paths draw as you read, and meet at the end ---------- */
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
        // 0 when the chapters' top reaches 65% of the screen, 1 when their bottom does
        var p = (vh * 0.65 - r.top) / Math.max(1, r.height);
        setStory(Math.max(0, Math.min(1, p)));
        var active = 0;
        chapters.forEach(function (c, i) {
          var cr = c.getBoundingClientRect();
          if (cr.top < vh * 0.62) active = i;
        });
        chapters.forEach(function (c, i) { c.classList.toggle('is-on', i === active); });
        if (stepEl) stepEl.textContent = '0' + (active + 1);
      });
    }
  }

  /* ---------- 4. compare: the usual way vs the UNBOUND way ---------- */
  var cmp = $('[data-ub-compare]');
  if (cmp) {
    var btns = $$('[data-ub-mode]', cmp), touched = false, auto = null;
    var setMode = function (m) {
      cmp.setAttribute('data-mode', m);
      btns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-ub-mode') === m ? 'true' : 'false'); });
    };
    btns.forEach(function (b) {
      b.addEventListener('click', function () { touched = true; clearInterval(auto); setMode(b.getAttribute('data-ub-mode')); });
    });
    if (still) setMode('unbound');
    else if ('IntersectionObserver' in window) {
      // shows the usual way first, then breaks the walls down; keeps alternating until the visitor picks one
      var started = false;
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting || started || touched) return;
          started = true;
          setTimeout(function () { if (!touched) setMode('unbound'); }, 1400);
          auto = setInterval(function () { if (touched || document.hidden) return; setMode(cmp.getAttribute('data-mode') === 'unbound' ? 'usual' : 'unbound'); }, 5200);
        });
      }, { threshold: 0.45 }).observe(cmp);
    }
  }

  /* ---------- 5. manifesto: words light up as the line scrolls past ---------- */
  var mani = $('[data-ub-mani]');
  if (mani) {
    var hot = { 'silos.': 'is-hot', 'unbound.': 'is-hot2', 'walls.': 'is-hot', 'noise.': 'is-hot2' };
    mani.innerHTML = mani.textContent.trim().split(/\s+/).map(function (w) {
      return '<span class="ub-w ' + (hot[w.toLowerCase()] || '') + '">' + w + '</span>';
    }).join(' ');
    var mw = $$('.ub-w', mani);
    if (still) mw.forEach(function (w) { w.classList.add('is-on'); });
    else onScrollFns.push(function () {
      var r = mani.getBoundingClientRect(), vh = window.innerHeight;
      var p = (vh * 0.85 - r.top) / Math.max(1, r.height + vh * 0.35);
      var lit = Math.round(Math.max(0, Math.min(1, p)) * mw.length);
      mw.forEach(function (w, i) { w.classList.toggle('is-on', i < lit); });
    });
  }

  /* ---------- 6. magnetic buttons (fine pointers only) ---------- */
  if (!still && window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
    $$('.ub-magnet').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.22, y = (e.clientY - r.top - r.height / 2) * 0.35;
        b.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
  }

  queue();
})();
