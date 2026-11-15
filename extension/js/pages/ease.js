/*
 * Simplify — Ease: a cubic-bezier curve editor that writes straight to the selected keyframes,
 * so the graph editor stays closed. Curves use the familiar four numbers (x1, y1, x2, y2).
 *
 * Motion notes: handles track the pointer 1:1 (pointer capture, grab offset respected) with no
 * easing of their own; the preview dot is the one explanatory animation on the page and only
 * plays when the curve changes or when asked.
 */
(function (SP) {
  'use strict';
  var ui = SP.ui;
  var h = ui.h;
  var NS = 'http://www.w3.org/2000/svg';

  var BUILT_IN = [
    { name: 'Linear', v: [0, 0, 1, 1] },
    { name: 'Smooth', v: [0.25, 0.1, 0.25, 1] },
    { name: 'Out', v: [0.23, 1, 0.32, 1] },
    { name: 'In-out', v: [0.77, 0, 0.175, 1] },
    { name: 'In', v: [0.5, 0, 0.75, 0] },
    { name: 'Expo out', v: [0.16, 1, 0.3, 1] },
    { name: 'Snap', v: [0.9, 0, 0.1, 1] },
    { name: 'Overshoot', v: [0.34, 1.56, 0.64, 1] },
    { name: 'Anticipate', v: [0.36, 0, 0.66, -0.56] },
    { name: 'Back', v: [0.68, -0.6, 0.32, 1.6] }
  ];

  // Plot geometry inside a 240 x 240 viewBox: the unit square is 150px with room above and
  // below for overshoot.
  var X0 = 45, Y0 = 195, UNIT = 150, YMIN = -0.28, YMAX = 1.28;
  var px = function (x) { return X0 + x * UNIT; };
  var py = function (y) { return Y0 - y * UNIT; };

  function svg(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    return el;
  }

  function round(n) { return Math.round(n * 1000) / 1000; }

  function thumb(v) {
    var s = svg('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true' });
    var x = function (n) { return 6 + n * 28; };
    var y = function (n) { return 30 - Math.max(-0.3, Math.min(1.3, n)) * 20; };
    s.appendChild(svg('path', { d: 'M' + x(0) + ' ' + y(0) + ' C' + x(v[0]) + ' ' + y(v[1]) + ' ' + x(v[2]) + ' ' + y(v[3]) + ' ' + x(1) + ' ' + y(1) }));
    return s;
  }

  SP.pages.push({
    id: 'ease', title: 'Ease', icon: 'ease',
    render: function (root) {
      var value = SP.settings.get('ease.current', [0.23, 1, 0.32, 1]).slice();
      var inputs = [];
      var chipsHost = h('div', { class: 'chips' });
      var playTimer = null;

      // ---- editor ----
      var el = svg('svg', { class: 'curve', viewBox: '0 0 240 240', role: 'img', 'aria-label': 'Easing curve editor' });
      [0.25, 0.5, 0.75].forEach(function (t) {
        el.appendChild(svg('line', { class: 'grid-line', x1: px(t), y1: py(0), x2: px(t), y2: py(1) }));
        el.appendChild(svg('line', { class: 'grid-line', x1: px(0), y1: py(t), x2: px(1), y2: py(t) }));
      });
      el.appendChild(svg('rect', { class: 'frame', x: px(0), y: py(1), width: UNIT, height: UNIT, rx: 3 }));
      var arm1 = svg('line', { class: 'arm' });
      var arm2 = svg('line', { class: 'arm' });
      var path = svg('path', { class: 'path' });
      var h1 = svg('circle', { class: 'handle', r: 6 });
      var h2 = svg('circle', { class: 'handle', r: 6 });
      // Invisible, larger hit targets: a 6px handle is too small to grab comfortably.
      var hit1 = svg('circle', { class: 'hit', r: 16 });
      var hit2 = svg('circle', { class: 'hit', r: 16 });
      [arm1, arm2, path, h1, h2, hit1, hit2].forEach(function (n) { el.appendChild(n); });

      function draw() {
        var a = [px(value[0]), py(value[1])];
        var b = [px(value[2]), py(value[3])];
        path.setAttribute('d', 'M' + px(0) + ' ' + py(0) + ' C' + a[0] + ' ' + a[1] + ' ' + b[0] + ' ' + b[1] + ' ' + px(1) + ' ' + py(1));
        arm1.setAttribute('x1', px(0)); arm1.setAttribute('y1', py(0)); arm1.setAttribute('x2', a[0]); arm1.setAttribute('y2', a[1]);
        arm2.setAttribute('x1', px(1)); arm2.setAttribute('y1', py(1)); arm2.setAttribute('x2', b[0]); arm2.setAttribute('y2', b[1]);
        [[h1, hit1, a], [h2, hit2, b]].forEach(function (g) {
          g[0].setAttribute('cx', g[2][0]); g[0].setAttribute('cy', g[2][1]);
          g[1].setAttribute('cx', g[2][0]); g[1].setAttribute('cy', g[2][1]);
        });
      }

      function syncInputs() {
        inputs.forEach(function (inp, i) { if (document.activeElement !== inp) inp.value = String(round(value[i])); });
      }

      function syncChips() {
        Array.prototype.forEach.call(chipsHost.children, function (c) {
          var v = c._value;
          var same = v && v.every(function (n, i) { return Math.abs(n - value[i]) < 0.0015; });
          c.setAttribute('aria-pressed', String(!!same));
        });
      }

      function set(next, opts) {
        value = [
          Math.max(0, Math.min(1, next[0])), Math.max(YMIN, Math.min(YMAX, next[1])),
          Math.max(0, Math.min(1, next[2])), Math.max(YMIN, Math.min(YMAX, next[3]))
        ];
        draw();
        syncInputs();
        syncChips();
        SP.settings.set('ease.current', value.map(round));
        if (!opts || opts.play !== false) {
          clearTimeout(playTimer);
          playTimer = setTimeout(play, 220);
        }
      }

      function drag(hit, handle, ix, iy) {
        hit.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          hit.setPointerCapture(e.pointerId);
          handle.classList.add('is-drag');
          var box = el.getBoundingClientRect();
          var scale = 240 / box.width;
          // Keep the offset between pointer and handle centre, so the handle does not jump.
          var offX = (e.clientX - box.left) * scale - px(value[ix]);
          var offY = (e.clientY - box.top) * scale - py(value[iy]);
          var move = function (ev) {
            var next = value.slice();
            next[ix] = ((ev.clientX - box.left) * scale - offX - X0) / UNIT;
            next[iy] = (Y0 - ((ev.clientY - box.top) * scale - offY)) / UNIT;
            if (ev.shiftKey) next[iy] = Math.round(next[iy] * 4) / 4;      // Shift snaps y to quarters
            set(next, { play: false });
          };
          var up = function () {
            handle.classList.remove('is-drag');
            hit.removeEventListener('pointermove', move);
            hit.removeEventListener('pointerup', up);
            hit.removeEventListener('pointercancel', up);
            play();
          };
          hit.addEventListener('pointermove', move);
          hit.addEventListener('pointerup', up);
          hit.addEventListener('pointercancel', up);
        });
      }
      drag(hit1, h1, 0, 1);
      drag(hit2, h2, 2, 3);

      // ---- preview ----
      var dot = h('div', { class: 'track-dot' });
      var track = h('div', { class: 'track', title: 'Click to replay', onclick: function () { play(); } }, dot);
      var anim = null;

      function play() {
        if (!track.offsetWidth || !dot.animate) return;
        if (anim) anim.cancel();
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || !SP.settings.get('ui.motion', true);
        if (reduce) return;
        var dist = track.offsetWidth;
        anim = dot.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + dist + 'px)' }], {
          duration: 700,
          fill: 'forwards',
          easing: 'cubic-bezier(' + value.map(round).join(',') + ')'
        });
      }

      // ---- numeric fields ----
      var values = h('div', { class: 'curve-values' });
      ['x1', 'y1', 'x2', 'y2'].forEach(function (label, i) {
        var inp = h('input', {
          class: 'input', type: 'number', step: '0.01', title: label, 'aria-label': label, value: String(round(value[i])),
          onchange: function () {
            var n = parseFloat(inp.value);
            if (isNaN(n)) { inp.value = String(round(value[i])); return; }
            var next = value.slice();
            next[i] = n;
            set(next);
          }
        });
        inputs.push(inp);
        values.appendChild(inp);
      });

      // ---- library ----
      function userCurves() { return SP.settings.get('ease.curves', []); }

      function chip(c, removable) {
        var b = h('button', { class: 'chip', title: c.name + '  ' + c.v.map(round).join(', '), 'aria-pressed': 'false', onclick: function () { set(c.v); } },
          thumb(c.v), h('span', { text: c.name }));
        b._value = c.v;
        if (removable) {
          b.appendChild(h('span', {
            class: 'chip-del', role: 'button', title: 'Delete curve', onclick: function (e) {
              e.stopPropagation();
              SP.settings.set('ease.curves', userCurves().filter(function (u) { return u.name !== c.name; }));
              renderChips();
            }
          }, ui.icon('x')));
        }
        return b;
      }

      function renderChips() {
        while (chipsHost.firstChild) chipsHost.removeChild(chipsHost.firstChild);
        BUILT_IN.forEach(function (c) { chipsHost.appendChild(chip(c, false)); });
        userCurves().forEach(function (c) { chipsHost.appendChild(chip(c, true)); });
        syncChips();
      }

      var apply = h('button', {
        class: 'btn primary', onclick: function () {
          ui.run({
            id: 'ease.apply', title: 'Apply ease',
            done: function (d) { return 'Ease applied to ' + d.pairs + (d.pairs === 1 ? ' keyframe pair' : ' keyframe pairs'); }
          }, null, { x1: value[0], y1: value[1], x2: value[2], y2: value[3] });
        }
      }, 'Apply to keyframes');

      var read = h('button', {
        class: 'btn', title: 'Load the curve between the two selected keyframes', onclick: function () {
          ui.run({ id: 'ease.read', title: 'Read curve', silent: true, undo: false }, null).then(function (d) {
            if (!d) return;
            set([d.x1, d.y1, d.x2, d.y2]);
            ui.toast({ title: 'Curve read from ' + d.property });
          });
        }
      }, ui.icon('read'), 'Read');

      var saveName = ui.textInput('', function () {}, { placeholder: 'Name this curve' });
      var save = h('button', {
        class: 'btn', onclick: function () {
          var name = saveName.value.trim();
          if (!name) { saveName.focus(); return; }
          var curves = userCurves().filter(function (u) { return u.name !== name; });
          curves.push({ name: name, v: value.map(round) });
          SP.settings.set('ease.curves', curves);
          saveName.value = '';
          renderChips();
        }
      }, ui.icon('plus'), 'Save');

      root.appendChild(ui.pageHead('Ease', 'Shape the curve, select keyframes, apply. Works on any number of properties at once.'));
      root.appendChild(h('div', { class: 'curve-box' }, el, track, values));
      root.appendChild(h('div', { class: 'btn-row mt' }, apply, read));
      root.appendChild(ui.section('Curves', chipsHost, h('div', { class: 'field mt' }, saveName, save)));
      root.appendChild(h('p', { class: 'hint mt', text: 'Drag the two handles; hold Shift to snap. Pull a handle above or below the square for overshoot and anticipation.' }));

      draw();
      renderChips();
    }
  });
}(window.SP = window.SP || {}));
