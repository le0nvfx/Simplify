/*
 * Simplify — UI toolkit: DOM helper, icons, toasts, form controls, and the action system that
 * tiles and the search palette share.
 */
(function (SP) {
  'use strict';

  // ---- DOM ------------------------------------------------------------------------------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var key, i, child;
    if (attrs) {
      for (key in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
        var v = attrs[key];
        if (v === null || v === undefined || v === false) continue;
        if (key === 'class') el.className = v;
        else if (key === 'text') el.textContent = v;
        else if (key.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(key.slice(2), v);
        else if (key === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (key in el && key !== 'list' && key !== 'type' && typeof v !== 'string') el[key] = v;
        else el.setAttribute(key, v === true ? '' : v);
      }
    }
    for (i = 2; i < arguments.length; i++) {
      child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) child.forEach(append);
      else append(child);
    }
    function append(c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  }

  // ---- icons (24px grid, 1.8 stroke) ----------------------------------------------------
  var ICONS = {
    logo: '<path d="M5 8.5c0-2 1.8-3.5 4.4-3.5H19M5 12h14M19 15.5c0 2-1.8 3.5-4.4 3.5H5"/>',
    home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
    comps: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/>',
    layers: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
    presets: '<path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-3.6-6 3.6v-16a1 1 0 0 1 1-1z"/>',
    ease: '<path d="M3.5 19.5C11 19.5 13 4.5 20.5 4.5"/><circle cx="3.5" cy="19.5" r="1.2"/><circle cx="20.5" cy="4.5" r="1.2"/>',
    expr: '<path d="M8.5 3.5H8a2.5 2.5 0 0 0-2.5 2.5v3.2c0 1.5-.9 2.8-2.5 2.8 1.6 0 2.5 1.300 2.500 2.800V18A2.500 2.500 0 0 0 8 20.500h.5M15.500 3.500h.5A2.500 2.500 0 0 1 18.500 6v3.200c0 1.500.9 2.800 2.500 2.800-1.600 0-2.500 1.300-2.500 2.800V18a2.500 2.500 0 0 1-2.500 2.500h-.5"/>',
    captions: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 14.500h4M14 14.500h3M7 10.500h2M12 10.500h5"/>',
    color: '<path d="M12 3.500s6 6 6 10.700a6 6 0 0 1-12 0C6 9.500 12 3.500 12 3.500z"/>',
    ai: '<path d="m11 4 1.700 4.800L17.500 10.500l-4.800 1.700L11 17l-1.700-4.800L4.500 10.500l4.800-1.700z"/><path d="m18.500 15 .7 1.800 1.800.700-1.800.700-.7 1.800-.7-1.800-1.800-.700 1.800-.700z"/>',
    settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
    search: '<circle cx="11" cy="11" r="6.500"/><path d="m20 20-4.200-4.200"/>',
    check: '<path d="m5 12.500 4.500 4.500L19 7"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    trash: '<path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l.8 12a1 1 0 0 0 1 1h7.400a1 1 0 0 0 1-1l.8-12"/>',
    undo: '<path d="M8 7 4 11l4 4"/><path d="M4 11h10a5 5 0 0 1 0 10h-3"/>',
    play: '<path d="M7 5v14l11-7z"/>',
    box: '<path d="m12 3 8 4.500v9L12 21l-8-4.500v-9z"/><path d="m4 7.500 8 4.500 8-4.500M12 12v9"/>',
    unbox: '<path d="m12 12 8-4.500M12 12 4 7.500M12 12v9"/><path d="M20 12v4.500L12 21l-8-4.500V12"/><path d="M9 3.500 12 6l3-2.500"/>',
    copy: '<rect x="8.500" y="8.500" width="11.500" height="11.500" rx="2"/><path d="M15.500 5.500v-.5a1.500 1.500 0 0 0-1.500-1.500H5.500A1.500 1.500 0 0 0 4 5v8.500A1.500 1.500 0 0 0 5.500 15H6"/>',
    unique: '<rect x="4" y="4" width="9" height="9" rx="2"/><rect x="11" y="11" width="9" height="9" rx="2"/><path d="M17.500 4v4M15.500 6h4"/>',
    trim: '<path d="M5 4v16M19 4v16M9 12h6M9 9l-3 3 3 3M15 9l3 3-3 3"/>',
    center: '<rect x="7" y="7" width="10" height="10" rx="1.500"/><path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500"/>',
    fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><rect x="8.500" y="8.500" width="7" height="7" rx="1"/>',
    fill: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><path d="M9 9l6 6M15 9l-6 6"/>',
    sequence: '<path d="M4 6h8M7 12h8M10 18h10"/>',
    nullobj: '<rect x="5" y="5" width="14" height="14" rx="1.500"/><path d="M12 9v6M9 12h6"/>',
    adjust: '<circle cx="12" cy="12" r="8.500"/><path d="M12 3.500v17"/><path d="M12 7.500a4.500 4.500 0 0 1 0 9"/>',
    snap: '<path d="M4 5v14M20 5v14"/><path d="M8 12h8M8 12l2.500-2.500M8 12l2.500 2.500M16 12l-2.500-2.500M16 12l-2.500 2.500"/>',
    file: '<path d="M7 3.500h7l4 4V20a.500.500 0 0 1-.500.500h-10.500A.500.500 0 0 1 6.500 20V4a.500.500 0 0 1 .500-.500z"/><path d="M14 3.500V8h4"/>',
    save: '<path d="M12 4v11M7.500 10.500 12 15l4.500-4.500M5 19.500h14"/>',
    wand: '<path d="m5 19 10-10M13.500 7.500l3 3"/><path d="M18 3.500v3M16.500 5h3M19.500 12v2M18.500 13h2M9 3.500v2M8 4.500h2"/>',
    send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    stop: '<rect x="6.500" y="6.500" width="11" height="11" rx="1.500"/>',
    read: '<path d="M4 12s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="12" cy="12" r="2.500"/>',
    fx: '<path d="M5 19 9.500 5M4 12h7M13 19l6-8M13 11l6 8"/>',
    mic: '<rect x="9" y="3.500" width="6" height="10" rx="3"/><path d="M6 11.500a6 6 0 0 0 12 0M12 17.500v3"/>',
    folder: '<path d="M3.500 6.500a1 1 0 0 1 1-1h4.500l2 2.500h8.500a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/>'
  };

  function icon(name, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    svg.innerHTML = ICONS[name] || ICONS.box;   // static, trusted markup defined above
    return svg;
  }

  // ---- toasts ---------------------------------------------------------------------------
  var toastHost = null;

  function toast(opts) {
    if (!toastHost) toastHost = document.querySelector('.toasts');
    var el = h('div', { class: 'toast is-entering', 'data-kind': opts.kind || 'ok', role: 'status' },
      h('span', { class: 'toast-mark' }),
      h('div', { class: 'toast-body' },
        h('div', { class: 'toast-title', text: opts.title }),
        opts.detail ? h('div', { class: 'toast-detail', text: opts.detail }) : null),
      opts.action ? h('button', { class: 'btn small', text: opts.action.label, onclick: function () { dismiss(); opts.action.run(); } }) : null);
    var timer = null;
    var gone = false;

    function dismiss() {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      el.classList.add('is-leaving');
      var remove = function () { if (el.parentNode) el.parentNode.removeChild(el); };
      el.addEventListener('transitionend', remove);
      setTimeout(remove, 400);
    }

    // Keep at most three on screen; the oldest leaves first.
    while (toastHost.children.length >= 3) toastHost.removeChild(toastHost.firstChild);
    toastHost.appendChild(el);
    void el.offsetWidth;                       // commit the start state before transitioning
    el.classList.remove('is-entering');

    var life = opts.duration || (opts.kind === 'error' ? 7000 : opts.kind === 'warn' ? 5500 : 3200);
    var arm = function () { timer = setTimeout(dismiss, life); };
    el.addEventListener('mouseenter', function () { clearTimeout(timer); });
    el.addEventListener('mouseleave', arm);
    arm();
    return dismiss;
  }

  // ---- controls -------------------------------------------------------------------------
  function toggle(value, onChange, label) {
    var btn = h('button', {
      class: 'switch', role: 'switch', 'aria-checked': String(!!value), 'aria-label': label || null, onclick: function () {
        var next = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(next));
        onChange(next);
      }
    });
    return btn;
  }

  function segmented(options, value, onChange) {
    var root = h('div', { class: 'seg', role: 'group' });
    options.forEach(function (o) {
      root.appendChild(h('button', {
        text: o.label, title: o.title || null, 'aria-pressed': String(o.value === value), onclick: function () {
          Array.prototype.forEach.call(root.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
          this.setAttribute('aria-pressed', 'true');
          onChange(o.value);
        }
      }));
    });
    return root;
  }

  function numberInput(value, onChange, o) {
    o = o || {};
    var el = h('input', {
      class: 'input num', type: 'number', value: String(value), step: o.step || 1,
      min: o.min === undefined ? null : o.min, max: o.max === undefined ? null : o.max,
      onchange: function () {
        var v = parseFloat(el.value);
        if (isNaN(v)) v = value;
        if (o.min !== undefined) v = Math.max(o.min, v);
        if (o.max !== undefined) v = Math.min(o.max, v);
        el.value = String(v);
        onChange(v);
      }
    });
    return el;
  }

  function textInput(value, onChange, o) {
    o = o || {};
    return h('input', {
      class: 'input ' + (o.cls || 'grow'), type: o.type || 'text', value: value || '', placeholder: o.placeholder || null,
      spellcheck: 'false', autocomplete: 'off',
      oninput: function () { onChange(this.value); }
    });
  }

  function select(options, value, onChange, cls) {
    var el = h('select', { class: 'select ' + (cls || ''), onchange: function () { onChange(el.value); } });
    options.forEach(function (o) {
      el.appendChild(h('option', { value: o.value, text: o.label, selected: o.value === value }));
    });
    return el;
  }

  function field(label, control, hint) {
    var f = h('div', { class: 'field' }, h('label', { text: label }), control);
    if (!hint) return f;
    return h('div', null, f, h('p', { class: 'hint', text: hint }));
  }

  function stackField(label, control, hint) {
    return h('div', { class: 'field stack' }, h('label', { text: label }), control, hint ? h('p', { class: 'hint', text: hint }) : null);
  }

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return [1, 1, 1];
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }

  function rgbToHex(rgb) {
    return '#' + rgb.slice(0, 3).map(function (c) {
      return ('0' + Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16)).slice(-2);
    }).join('');
  }

  // ---- actions --------------------------------------------------------------------------
  // An action = one host call. Tiles, quick actions and the search palette all run the same
  // definition, so behaviour and wording stay consistent everywhere.
  var actions = {};
  var busy = false;

  function optionValues(action) {
    var saved = SP.settings.get('opt.' + action.id, {});
    var out = {};
    (action.options || []).forEach(function (o) {
      out[o.key] = saved[o.key] === undefined ? o.value : saved[o.key];
    });
    return out;
  }

  function setOption(action, key, value) {
    var saved = SP.settings.get('opt.' + action.id, {});
    saved[key] = value;
    SP.settings.set('opt.' + action.id, saved);
  }

  function define(action) {
    actions[action.id] = action;
    return action;
  }

  function undoLast() {
    SP.bridge.call('core.undo', {}).catch(function () {});
  }

  // Runs a host call with shared feedback. `el` (a tile) shows busy / done state.
  function run(action, el, extraArgs) {
    if (busy) return Promise.resolve(null);       // one host call at a time
    busy = true;
    var args = Object.assign({}, action.args || {}, optionValues(action), extraArgs || {});
    var started = Date.now();
    var spin = setTimeout(function () { if (el) el.setAttribute('data-state', 'busy'); }, 120);

    return SP.bridge.call(action.call || action.id, args).then(function (res) {
      clearTimeout(spin);
      if (el) {
        el.setAttribute('data-state', 'done');
        setTimeout(function () { el.removeAttribute('data-state'); }, 900);
      }
      var warnings = res.warnings || [];
      var summary = action.done ? action.done(res.data || {}) : action.title + ' done';
      if (action.silent && !warnings.length) return res.data;
      toast({
        kind: warnings.length ? 'warn' : 'ok',
        title: summary,
        detail: warnings.join(' '),
        action: action.undo === false ? null : { label: 'Undo', run: undoLast }
      });
      return res.data;
    }, function (err) {
      clearTimeout(spin);
      if (el) el.removeAttribute('data-state');
      if (err.user) {
        toast({ kind: 'hint', title: err.message });
      } else {
        toast({ kind: 'error', title: action.title + ' failed', detail: err.message + (err.detail ? ' (' + err.detail + ')' : '') });
      }
      return null;
    }).then(function (data) {
      busy = false;
      SP.log && SP.log(action.id, Date.now() - started);
      return data;
    });
  }

  function optionControl(action, o, values) {
    var set = function (v) { setOption(action, o.key, v); };
    if (o.type === 'toggle') return field(o.label, toggle(values[o.key], set, o.label), o.hint);
    if (o.type === 'number') return field(o.label, numberInput(values[o.key], set, o), o.hint);
    if (o.type === 'text') return field(o.label, textInput(values[o.key], set, { cls: '', placeholder: o.placeholder }), o.hint);
    if (o.type === 'seg') return stackField(o.label, segmented(o.choices, values[o.key], set), o.hint);
    return null;
  }

  function tile(action) {
    var root = h('div', { class: 'tile' });
    var main = h('button', { class: 'tile-main', title: action.desc || null, onclick: function () { run(action, root); } },
      h('span', { class: 'tile-icon' }, icon(action.icon, 'i-main'), icon('check', 'i-done'), h('span', { class: 'spinner' })),
      h('span', { class: 'tile-text' },
        h('div', { class: 'tile-title', text: action.title }),
        action.desc ? h('div', { class: 'tile-desc', text: action.desc }) : null));
    if (!action.options || !action.options.length) {
      root.appendChild(main);
      return root;
    }
    var opts = h('div', { class: 'tile-opts', hidden: true });
    var built = false;
    var more = h('button', {
      class: 'tile-more', 'aria-expanded': 'false', 'aria-label': 'Options for ' + action.title, title: 'Options', onclick: function () {
        var open = more.getAttribute('aria-expanded') !== 'true';
        more.setAttribute('aria-expanded', String(open));
        if (open && !built) {
          var values = optionValues(action);
          action.options.forEach(function (o) { opts.appendChild(optionControl(action, o, values)); });
          built = true;
        }
        opts.hidden = !open;
      }
    }, icon('chevron'));
    root.appendChild(h('div', { class: 'tile-row' }, main, more));
    root.appendChild(opts);
    return root;
  }

  function tiles(ids, stagger) {
    var grid = h('div', { class: 'tiles' + (stagger ? ' stagger' : '') });
    ids.forEach(function (id, i) {
      var t = tile(actions[id]);
      if (stagger) t.style.setProperty('--i', String(i));
      grid.appendChild(t);
    });
    return grid;
  }

  function section(title) {
    var s = h('section', { class: 'section' }, title ? h('h3', { class: 'section-title', text: title }) : null);
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) s.appendChild(arguments[i]);
    return s;
  }

  function pageHead(title, sub) {
    return h('header', { class: 'page-head' },
      h('h2', { class: 'page-title', text: title }),
      sub ? h('p', { class: 'page-sub', text: sub }) : null);
  }

  SP.pages = SP.pages || [];

  SP.ui = {
    h: h, icon: icon, toast: toast, toggle: toggle, segmented: segmented, numberInput: numberInput,
    textInput: textInput, select: select, field: field, stackField: stackField,
    hexToRgb: hexToRgb, rgbToHex: rgbToHex,
    define: define, run: run, tile: tile, tiles: tiles, section: section, pageHead: pageHead,
    actions: actions, optionValues: optionValues, undoLast: undoLast,
    isBusy: function () { return busy; }
  };
}(window.SP = window.SP || {}));
