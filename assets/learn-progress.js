/*
  Course progress tracking.

  Storage sits behind a single adapter on purpose. Today it's localStorage — no account, nothing
  leaves the browser, which is what the privacy page promises. If accounts are added later, replace
  ONLY the `store` object with a server-backed one (same four methods) and every call site below
  keeps working unchanged.

  localStorage throws outright in some privacy modes, so every access is wrapped.
*/
(function () {
  'use strict';

  var KEY = 'siau.learn.completed.v1';

  var store = {
    read: function () {
      try {
        var raw = window.localStorage.getItem(KEY);
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
      } catch (e) { return {}; }
    },
    write: function (obj) {
      try { window.localStorage.setItem(KEY, JSON.stringify(obj)); return true; }
      catch (e) { return false; }
    },
    clear: function () {
      try { window.localStorage.removeItem(KEY); return true; }
      catch (e) { return false; }
    },
    available: function () {
      try {
        var k = '__siau_probe__';
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
        return true;
      } catch (e) { return false; }
    }
  };

  var completed = store.read();

  function isDone(slug) { return completed[slug] === true; }
  function setDone(slug, done) {
    if (done) completed[slug] = true; else delete completed[slug];
    store.write(completed);
  }

  // Only free lessons count toward progress — planned/paid lessons aren't reachable content.
  function trackableLessons() {
    var m = window.LEARN_MANIFEST;
    if (!m || !m.modules) return [];
    var out = [];
    m.modules.forEach(function (mod) {
      if (mod.planned) return;
      mod.lessons.forEach(function (l) { if (l.access === 'free') out.push(l.slug); });
    });
    return out;
  }

  function overallPercent() {
    var all = trackableLessons();
    if (!all.length) return 0;
    var done = all.filter(isDone).length;
    return Math.round((done / all.length) * 100);
  }

  /* ------------------------------------------------------- overview page UI */

  function paintOverview() {
    var manifest = window.LEARN_MANIFEST;
    if (!manifest) return;

    document.querySelectorAll('.lesson-row[data-lesson]').forEach(function (row) {
      row.classList.toggle('is-done', isDone(row.getAttribute('data-lesson')));
    });

    manifest.modules.forEach(function (mod) {
      var wrap = document.querySelector('[data-module-progress="' + mod.id + '"]');
      if (!wrap || mod.planned) return;
      var slugs = mod.lessons.filter(function (l) { return l.access === 'free'; }).map(function (l) { return l.slug; });
      var done = slugs.filter(isDone).length;
      var pct = slugs.length ? Math.round((done / slugs.length) * 100) : 0;
      var bar = wrap.querySelector('.module-progress-bar span');
      var label = wrap.querySelector('.module-progress-label');
      if (bar) bar.style.width = pct + '%';
      if (label) label.textContent = done + ' of ' + slugs.length;
      wrap.classList.toggle('is-complete', slugs.length > 0 && done === slugs.length);
    });

    var overall = document.querySelector('[data-overall-percent]');
    if (overall) overall.textContent = overallPercent() + '%';
  }

  /* --------------------------------------------------------- lesson page UI */

  function paintLesson() {
    var pct = overallPercent();
    var bar = document.querySelector('[data-course-progress-bar]');
    var text = document.querySelector('[data-course-progress-text]');
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = pct + '% complete';

    var btn = document.getElementById('markComplete');
    if (!btn) return;
    var slug = btn.getAttribute('data-lesson');
    var done = isDone(slug);
    btn.textContent = done ? '✓ Completed' : 'Mark as complete';
    btn.classList.toggle('is-done', done);
    btn.setAttribute('aria-pressed', String(done));
  }

  function wireLesson() {
    var btn = document.getElementById('markComplete');
    if (!btn) return;
    if (!store.available()) {
      btn.disabled = true;
      btn.title = 'Progress needs browser storage, which is unavailable here.';
      return;
    }
    btn.addEventListener('click', function () {
      var slug = btn.getAttribute('data-lesson');
      setDone(slug, !isDone(slug));
      paintLesson();
    });
  }

  function wireReset() {
    var reset = document.getElementById('resetProgress');
    if (!reset) return;
    reset.addEventListener('click', function () {
      completed = {};
      store.clear();
      paintOverview();
    });
  }

  function init() {
    paintOverview();
    paintLesson();
    wireLesson();
    wireReset();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exposed so a future account-backed version can rehydrate after sign-in.
  window.LearnProgress = {
    isDone: isDone,
    setDone: function (slug, done) { setDone(slug, done); paintOverview(); paintLesson(); },
    overallPercent: overallPercent,
    reload: function () { completed = store.read(); paintOverview(); paintLesson(); }
  };
})();
