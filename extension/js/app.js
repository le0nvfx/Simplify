/*
 * Simplify — app shell: navigation rail, page host, and the search palette.
 *
 * Search is the fast path: start typing anywhere in the panel (or press Ctrl/Cmd+K) and effects,
 * actions, expressions and pages are filtered as you type. Enter runs the first hit.
 * It opens and closes without animation on purpose — it is used far too often to be animated.
 */
(function (SP) {
  'use strict';
  var h = SP.ui.h;
  var icon = SP.ui.icon;

  SP.pages = SP.pages || [];
  var rendered = {};
  var current = null;
  var els = {};

  // ---- navigation -----------------------------------------------------------------------
  function movePill() {
    var btn = els.nav.querySelector('[aria-current="page"]');
    if (!btn) { els.pill.hidden = true; return; }
    els.pill.hidden = false;
    els.pill.style.transform = 'translateY(' + btn.offsetTop + 'px)';
  }

  function go(id, opts) {
    var page = SP.pages.filter(function (p) { return p.id === id; })[0];
    if (!page) return;
    if (current === id) return;
    current = id;
    SP.settings.set('page', id);
    Array.prototype.forEach.call(els.nav.querySelectorAll('.nav-btn'), function (b) {
      if (b.dataset.page === id) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (opts && opts.instant) {
      // First paint: place the pill without sliding in from the top.
      els.pill.style.transition = 'none';
      movePill();
      void els.pill.offsetWidth;
      els.pill.style.transition = '';
    } else {
      movePill();
    }
    // Pages are built once and re-attached, so their state (chat, curve, form values) survives.
    if (!rendered[id]) {
      rendered[id] = h('div', { class: 'page', 'data-page': id });
      page.render(rendered[id], { first: !!(opts && opts.instant) });
    }
    while (els.view.firstChild) els.view.removeChild(els.view.firstChild);
    els.view.appendChild(rendered[id]);
    els.view.scrollTop = 0;
    if (page.onShow) page.onShow(rendered[id]);
  }
  SP.go = go;

  // ---- search ---------------------------------------------------------------------------
  var effects = null;          // [[name, matchName, category], ...] loaded on first use
  var effectsLoading = null;
  var results = [];
  var selected = 0;

  function loadEffects() {
    if (effects || effectsLoading) return effectsLoading || Promise.resolve(effects);
    effectsLoading = SP.bridge.call('fx.list', {}).then(function (res) {
      effects = res.data || [];
      effectsLoading = null;
      if (!els.palette.hidden) search(els.input.value);
    }, function () {
      effectsLoading = null;
    });
    return effectsLoading;
  }

  // Higher is better; 0 means no match. Prefix > word start > substring > in-order letters.
  function score(query, text) {
    var q = query.toLowerCase();
    var t = text.toLowerCase();
    if (!q) return 1;
    if (t === q) return 1000;
    if (t.indexOf(q) === 0) return 800 - t.length;
    var at = t.indexOf(' ' + q);
    if (at !== -1) return 600 - at;
    at = t.indexOf(q);
    if (at !== -1) return 400 - at;
    // Initials: "gb" finds "Gaussian Blur".
    var initials = t.split(/[\s\-_/]+/).map(function (w) { return w.charAt(0); }).join('');
    if (initials.indexOf(q) === 0) return 500 - t.length;
    var ti = 0;
    var gaps = 0;
    for (var qi = 0; qi < q.length; qi++) {
      var found = t.indexOf(q.charAt(qi), ti);
      if (found === -1) return 0;
      gaps += found - ti;
      ti = found + 1;
    }
    return Math.max(1, 200 - gaps * 4 - t.length);
  }

  function rememberEffect(fx) {
    var recent = SP.settings.get('fx.recent', []).filter(function (r) { return r[1] !== fx[1]; });
    recent.unshift(fx);
    SP.settings.set('fx.recent', recent.slice(0, 8));
  }

  function applyEffect(fx, onAdjustment) {
    rememberEffect(fx);
    return SP.ui.run({
      id: 'fx.apply', title: fx[0], undo: true,
      done: function (d) { return fx[0] + (onAdjustment ? ' added on an adjustment layer' : ' applied to ' + d.applied + (d.applied === 1 ? ' layer' : ' layers')); }
    }, null, { matchName: fx[1], adjustment: !!onAdjustment, name: fx[0] });
  }

  function search(query) {
    var q = query.trim();
    var out = [];
    var push = function (group, list, limit) {
      list.sort(function (a, b) { return b.s - a.s; });
      list.slice(0, limit).forEach(function (r) { r.group = group; out.push(r); });
    };

    var fxHits = [];
    if (q) {
      (effects || []).forEach(function (fx) {
        var s = score(q, fx[0]);
        if (s) fxHits.push({ s: s, icon: 'fx', name: fx[0], meta: fx[2], run: function (alt) { return applyEffect(fx, alt); } });
      });
    } else {
      SP.settings.get('fx.recent', []).forEach(function (fx, i) {
        fxHits.push({ s: 100 - i, icon: 'fx', name: fx[0], meta: fx[2], run: function (alt) { return applyEffect(fx, alt); } });
      });
    }

    var actionHits = [];
    Object.keys(SP.ui.actions).forEach(function (id) {
      var a = SP.ui.actions[id];
      var s = Math.max(score(q, a.title), q ? Math.floor(score(q, a.keywords || '') * 0.6) : 0);
      if (s && q) actionHits.push({ s: s, icon: a.icon, name: a.title, meta: a.desc || '', run: function () { return SP.ui.run(a, null); } });
    });

    var exprHits = [];
    if (q && SP.expressionLibrary) {
      SP.expressionLibrary().forEach(function (e) {
        var s = Math.max(score(q, e.name), Math.floor(score(q, e.tags || '') * 0.5));
        if (s) exprHits.push({ s: s, icon: 'expr', name: e.name, meta: 'Expression', run: function () { return SP.applyExpression(e); } });
      });
    }

    var pageHits = [];
    if (q) {
      SP.pages.forEach(function (p) {
        var s = score(q, p.title);
        if (s) pageHits.push({ s: s - 50, icon: p.icon, name: p.title, meta: 'Open', run: function () { go(p.id); } });
      });
    }

    push(q ? 'Effects' : 'Recent effects', fxHits, q ? 12 : 8);
    push('Actions', actionHits, 6);
    push('Expressions', exprHits, 4);
    push('Pages', pageHits, 3);

    // The best overall hit goes first so Enter does the obvious thing.
    if (q && out.length) {
      var best = out.reduce(function (a, b) { return b.s > a.s ? b : a; });
      var group = best.group;
      out = out.filter(function (r) { return r.group === group; }).concat(out.filter(function (r) { return r.group !== group; }));
    }
    results = out;
    selected = 0;
    renderResults(q);
  }

  function renderResults(q) {
    var p = els.palette;
    while (p.firstChild) p.removeChild(p.firstChild);
    if (!results.length) {
      p.appendChild(h('div', { class: 'pal-empty', text: q ? (effects ? 'Nothing matches "' + q + '"' : 'Loading effects…') : 'Type to search effects, actions and expressions' }));
    }
    var lastGroup = null;
    results.forEach(function (r, i) {
      if (r.group !== lastGroup) {
        p.appendChild(h('div', { class: 'pal-group', text: r.group }));
        lastGroup = r.group;
      }
      p.appendChild(h('div', {
        class: 'pal-item', role: 'option', 'aria-selected': String(i === selected), 'data-i': i,
        onmousedown: function (e) { e.preventDefault(); },          // keep focus in the input
        onclick: function (e) { choose(i, e.shiftKey); },
        onmousemove: function () { if (selected !== i) { selected = i; markSelected(); } }
      }, icon(r.icon), h('span', { class: 'pal-name', text: r.name }), r.meta ? h('span', { class: 'pal-meta', text: r.meta }) : null));
    });
    if (results.length) {
      p.appendChild(h('div', { class: 'pal-foot' },
        h('span', null, h('span', { class: 'kbd', text: '↵' }), ' apply'),
        h('span', null, h('span', { class: 'kbd', text: '⇧↵' }), ' effect on adjustment layer'),
        h('span', null, h('span', { class: 'kbd', text: 'esc' }), ' close')));
    }
  }

  function markSelected() {
    Array.prototype.forEach.call(els.palette.querySelectorAll('.pal-item'), function (el) {
      var on = Number(el.dataset.i) === selected;
      el.setAttribute('aria-selected', String(on));
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function openPalette() {
    if (!els.palette.hidden) return;
    els.palette.hidden = false;
    loadEffects();
    search(els.input.value);
  }

  function closePalette(clear) {
    els.palette.hidden = true;
    if (clear) els.input.value = '';
  }

  function choose(i, alt) {
    var r = results[i];
    if (!r) return;
    closePalette(true);
    els.input.blur();
    r.run(alt);
  }

  function onSearchKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      markSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(selected, e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette(true);
      els.input.blur();
    }
  }

  function isTyping(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function onGlobalKey(e) {
    var mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      els.input.focus();
      els.input.select();
      return;
    }
    if (isTyping(e.target) || mod || e.altKey) return;
    // Type-to-search: a printable key anywhere in the panel lands in the search field.
    if (e.key.length === 1 && e.key !== ' ') {
      els.input.focus();
    }
  }

  // ---- boot -----------------------------------------------------------------------------
  function buildShell() {
    els.nav = h('nav', { class: 'rail-nav', 'aria-label': 'Sections' });
    els.pill = h('div', { class: 'rail-pill', hidden: true });
    els.nav.appendChild(els.pill);

    SP.pages.forEach(function (p) {
      var btn = h('button', { class: 'nav-btn', 'data-page': p.id, title: p.title, 'aria-label': p.title, onclick: function () { go(p.id); } },
        icon(p.icon), h('span', { class: 'nav-label', text: p.title }));
      els.nav.appendChild(btn);
    });

    els.input = h('input', {
      type: 'text', placeholder: 'Search effects and actions', spellcheck: 'false', autocomplete: 'off',
      'aria-label': 'Search effects and actions',
      onfocus: openPalette,
      oninput: function () { openPalette(); search(els.input.value); },
      onkeydown: onSearchKey,
      onblur: function () { setTimeout(function () { if (document.activeElement !== els.input) closePalette(false); }, 0); }
    });
    els.status = h('span', { class: 'status-dot', 'data-state': SP.bridge.live ? 'live' : 'preview', title: SP.bridge.live ? 'Connected to After Effects' : 'Preview mode: not connected to After Effects' });
    els.palette = h('div', { class: 'palette', role: 'listbox', hidden: true });
    els.view = h('div', { class: 'view' });

    var isMac = navigator.platform.indexOf('Mac') === 0;
    var app = h('div', { class: 'app' },
      h('aside', { class: 'rail' },
        h('div', { class: 'rail-logo', title: 'Simplify' }, icon('logo')),
        els.nav),
      h('main', { class: 'main' },
        h('div', { class: 'top' },
          h('label', { class: 'search' }, icon('search'), els.input, h('span', { class: 'kbd', text: isMac ? '⌘K' : 'Ctrl K' })),
          els.status),
        els.view, els.palette,
        h('div', { class: 'toasts', 'aria-live': 'polite' })));
    document.body.appendChild(app);

    document.addEventListener('keydown', onGlobalKey);
    window.addEventListener('resize', movePill);
    // Ctrl/Cmd+K would otherwise be taken by After Effects while the panel has focus.
    SP.bridge.claimKeys([{ keyCode: 75, ctrlKey: true }, { keyCode: 40, metaKey: true }]);
  }

  function applyPreferences() {
    var root = document.documentElement;
    root.setAttribute('data-scale', SP.settings.get('ui.scale', 'm'));
    if (SP.settings.get('ui.motion', true)) root.removeAttribute('data-motion');
    else root.setAttribute('data-motion', 'off');
  }
  SP.applyPreferences = applyPreferences;

  function start() {
    applyPreferences();
    buildShell();
    var wanted = SP.settings.get('page', 'home');
    go(SP.pages.some(function (p) { return p.id === wanted; }) ? wanted : 'home', { instant: true });

    SP.bridge.boot().then(function (info) {
      SP.host = info;
      if (SP.bridge.live) els.status.title = 'Connected to After Effects ' + info.ae;
    }, function (err) {
      els.status.setAttribute('data-state', 'error');
      els.status.title = err.message;
      SP.ui.toast({ kind: 'error', title: 'Not connected to After Effects', detail: err.message, duration: 12000 });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}(window.SP = window.SP || {}));
