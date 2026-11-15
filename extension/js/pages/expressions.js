/*
 * Simplify — Expressions: a library of the expressions editors actually use, with their numbers
 * exposed as fields, plus a place for your own.
 *
 * Each library entry is a normal action, so it also shows up in search. Entries with a `target`
 * work with just a layer selected (they go to that property); the rest need a selected property.
 */
(function (SP) {
  'use strict';
  var ui = SP.ui;
  var h = ui.h;
  var T = 'ADBE Transform Group';

  var num = function (key, label, value, extra) { return Object.assign({ key: key, type: 'number', label: label, value: value, step: 'any' }, extra || {}); };

  var LIBRARY = [
    {
      id: 'wiggle', title: 'Wiggle', desc: 'Organic random motion', keywords: 'shake random camera shake',
      target: [T, 'ADBE Position'], options: [num('freq', 'Times per second', 2), num('amp', 'Amount', 30)],
      code: function (o) { return 'wiggle(' + o.freq + ', ' + o.amp + ')'; }
    },
    {
      id: 'steppedWiggle', title: 'Stepped wiggle', desc: 'Jitter at a low frame rate', keywords: 'jitter stop motion posterize',
      target: [T, 'ADBE Position'], options: [num('fps', 'Steps per second', 8), num('amp', 'Amount', 20)],
      code: function (o) { return 'posterizeTime(' + o.fps + ');\nwiggle(' + o.fps + ', ' + o.amp + ')'; }
    },
    {
      id: 'loop', title: 'Loop keyframes', desc: 'Repeat the animation forever', keywords: 'loopOut cycle pingpong repeat',
      options: [{
        key: 'type', type: 'seg', label: 'Type', value: 'cycle',
        choices: [{ value: 'cycle', label: 'Cycle' }, { value: 'pingpong', label: 'Ping-pong' }, { value: 'offset', label: 'Offset' }, { value: 'continue', label: 'Continue' }]
      }],
      code: function (o) { return 'loopOut("' + o.type + '")'; }
    },
    {
      id: 'bounce', title: 'Bounce', desc: 'Overshoot and settle after each keyframe', keywords: 'inertia overshoot elastic spring',
      options: [num('amp', 'Amplitude', 0.06), num('freq', 'Frequency', 2.5), num('decay', 'Decay', 5)],
      code: function (o) {
        return [
          'amp = ' + o.amp + '; freq = ' + o.freq + '; decay = ' + o.decay + ';',
          'n = 0;',
          'if (numKeys > 0) {',
          '  n = nearestKey(time).index;',
          '  if (key(n).time > time) { n--; }',
          '}',
          't = n === 0 ? 0 : time - key(n).time;',
          'if (n > 0 && t < 1) {',
          '  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);',
          '  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);',
          '} else {',
          '  value;',
          '}'
        ].join('\n');
      }
    },
    {
      id: 'autoFade', title: 'Auto fade', desc: 'Fade in and out at the layer edges', keywords: 'opacity fade in out',
      target: [T, 'ADBE Opacity'], options: [num('fadeIn', 'Fade in (s)', 0.3, { min: 0 }), num('fadeOut', 'Fade out (s)', 0.3, { min: 0 })],
      code: function (o) {
        return [
          'fadeIn = ' + o.fadeIn + '; fadeOut = ' + o.fadeOut + ';',
          'a = fadeIn > 0 ? ease(time, inPoint, inPoint + fadeIn, 0, 100) : 100;',
          'b = fadeOut > 0 ? ease(time, outPoint - fadeOut, outPoint, 100, 0) : 100;',
          'Math.min(a, b) * value / 100'
        ].join('\n');
      }
    },
    {
      id: 'spin', title: 'Constant spin', desc: 'Rotate at a steady speed', keywords: 'rotate rotation time',
      target: [T, 'ADBE Rotate Z'], options: [num('speed', 'Degrees per second', 90)],
      code: function (o) { return 'value + (time - inPoint) * ' + o.speed; }
    },
    {
      id: 'pulse', title: 'Scale pulse', desc: 'Breathe in and out', keywords: 'scale beat sine',
      target: [T, 'ADBE Scale'], options: [num('freq', 'Pulses per second', 1), num('amp', 'Amount (%)', 5)],
      code: function (o) { return 's = Math.sin(time * Math.PI * 2 * ' + o.freq + ') * ' + o.amp + ';\n[value[0] + s, value[1] + s]'; }
    },
    {
      id: 'posterize', title: 'Posterize time', desc: 'Play this property at a lower frame rate', keywords: 'stop motion fps choppy',
      options: [num('fps', 'Frames per second', 12, { min: 1 })],
      code: function (o) { return 'posterizeTime(' + o.fps + ');\nvalue'; }
    },
    {
      id: 'delay', title: 'Follow layer above', desc: 'Copy its position with a delay', keywords: 'delay trail offset follow echo',
      target: [T, 'ADBE Position'], options: [num('delay', 'Delay (s)', 0.1)],
      code: function (o) { return 'thisComp.layer(index - 1).transform.position.valueAtTime(time - ' + o.delay + ')'; }
    },
    {
      id: 'ignoreParentScale', title: 'Ignore parent scale', desc: 'Keep size when the parent scales', keywords: 'parent scale inverse maintain',
      target: [T, 'ADBE Scale'],
      code: function () {
        return [
          'if (hasParent) {',
          '  ps = parent.transform.scale.value;',
          '  [value[0] * 100 / ps[0], value[1] * 100 / ps[1]];',
          '} else {',
          '  value;',
          '}'
        ].join('\n');
      }
    },
    {
      id: 'counter', title: 'Number counter', desc: 'Count between two numbers on a text layer', keywords: 'count up numbers text',
      target: ['ADBE Text Properties', 'ADBE Text Document'],
      options: [num('from', 'From', 0), num('to', 'To', 100), num('dur', 'Duration (s)', 2, { min: 0.01 }), num('dec', 'Decimals', 0, { min: 0, max: 6, step: 1 })],
      code: function (o) { return 'v = linear(time - inPoint, 0, ' + o.dur + ', ' + o.from + ', ' + o.to + ');\nv.toFixed(' + o.dec + ')'; }
    },
    {
      id: 'smooth', title: 'Smooth', desc: 'Soften jittery keyframes', keywords: 'smooth stabilise',
      options: [num('width', 'Window (s)', 0.2, { min: 0.01 }), num('samples', 'Samples', 5, { min: 2, step: 1 })],
      code: function (o) { return 'smooth(' + o.width + ', ' + o.samples + ')'; }
    }
  ];

  var ids = LIBRARY.map(function (e) {
    return ui.define({
      id: 'expr.lib.' + e.id, call: 'expr.apply', icon: 'expr', title: e.title, desc: e.desc,
      keywords: 'expression ' + (e.keywords || ''), options: e.options || [],
      build: function (values) { return { code: e.code(values), target: e.target || null }; },
      done: function (d) { return e.title + ' added to ' + d.applied + (d.applied === 1 ? ' property' : ' properties'); }
    }).id;
  });

  // ---- your own expressions -------------------------------------------------------------
  function custom() { return SP.settings.get('expr.custom', []); }

  function applyCode(name, code) {
    return ui.run({
      id: 'expr.apply', title: name,
      done: function (d) { return name + ' added to ' + d.applied + (d.applied === 1 ? ' property' : ' properties'); }
    }, null, { code: code });
  }

  // Used by the search palette.
  SP.expressionLibrary = function () {
    return custom().map(function (c) { return { name: c.name, tags: 'expression custom', code: c.code }; });
  };
  SP.applyExpression = function (e) { return applyCode(e.name, e.code); };

  SP.pages.push({
    id: 'expressions', title: 'Expressions', icon: 'expr',
    render: function (root) {
      var list = h('div', { class: 'list' });
      var editor = h('textarea', { class: 'textarea code', rows: 4, spellcheck: 'false', placeholder: 'Write or paste an expression' });
      var nameInput = ui.textInput('', function () {}, { placeholder: 'Name' });

      function refresh() {
        while (list.firstChild) list.removeChild(list.firstChild);
        custom().forEach(function (c) {
          list.appendChild(h('div', { class: 'row' },
            h('button', { class: 'row-main', title: c.code, onclick: function () { applyCode(c.name, c.code); } },
              h('div', { class: 'row-title', text: c.name }),
              h('div', { class: 'row-meta', text: c.code.split('\n')[0] })),
            h('button', { class: 'icon-btn', title: 'Edit', 'aria-label': 'Edit ' + c.name, onclick: function () { editor.value = c.code; nameInput.value = c.name; editor.focus(); } }, ui.icon('read')),
            h('button', {
              class: 'icon-btn danger', title: 'Delete', 'aria-label': 'Delete ' + c.name, onclick: function () {
                SP.settings.set('expr.custom', custom().filter(function (x) { return x.name !== c.name; }));
                refresh();
                ui.toast({ kind: 'hint', title: 'Deleted "' + c.name + '"', duration: 6000, action: { label: 'Restore', run: function () { SP.settings.set('expr.custom', custom().concat([c])); refresh(); } } });
              }
            }, ui.icon('trash'))));
        });
      }

      var applyBtn = h('button', { class: 'btn primary', onclick: function () { if (editor.value.trim()) applyCode('Expression', editor.value); else editor.focus(); } }, 'Apply');
      var readBtn = h('button', {
        class: 'btn', title: 'Load the expression of the selected property', onclick: function () {
          ui.run({ id: 'expr.read', title: 'Read expression', silent: true, undo: false }, null).then(function (d) {
            if (d) { editor.value = d.code; if (!nameInput.value) nameInput.value = d.property; }
          });
        }
      }, ui.icon('read'), 'Read');
      var saveBtn = h('button', {
        class: 'btn', onclick: function () {
          var name = nameInput.value.trim();
          var code = editor.value.trim();
          if (!code) { editor.focus(); return; }
          if (!name) { nameInput.focus(); return; }
          SP.settings.set('expr.custom', custom().filter(function (x) { return x.name !== name; }).concat([{ name: name, code: code }]));
          nameInput.value = '';
          refresh();
          ui.toast({ title: 'Saved "' + name + '"' });
        }
      }, ui.icon('plus'), 'Save');

      root.appendChild(ui.pageHead('Expressions', 'Click to apply. Open the arrow on a card to change its numbers first.'));
      root.appendChild(ui.section('Library', ui.tiles(ids)));
      root.appendChild(ui.section('Your own', h('div', { class: 'card' },
        editor, h('div', { class: 'btn-row' }, applyBtn, readBtn),
        h('div', { class: 'field' }, nameInput, saveBtn)), h('div', { class: 'mt' }, list)));
      root.appendChild(ui.section('Clean up', ui.tiles(['expr.clear'])));
      refresh();
    }
  });
}(window.SP = window.SP || {}));
