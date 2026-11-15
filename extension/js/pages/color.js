/*
 * Simplify — Color: one-click looks.
 * A look is an ordinary Simplify preset (the same format the Presets page saves), applied to a
 * new adjustment layer so it stays non-destructive; the strength slider is that layer's opacity.
 * Looks are built from After Effects' stock effects only, so they work on every install. They
 * are a fast starting point, not a replacement for grading a shot properly.
 */
(function (SP) {
  'use strict';
  var ui = SP.ui;
  var h = ui.h;

  // Effect parameters are addressed as "<effect match name>-000N" (N = position in the effect).
  function fx(matchName, name, values) {
    var props = [];
    Object.keys(values).forEach(function (n) {
      props.push({ path: [matchName + '-' + ('0000' + n).slice(-4)], v: values[n] });
    });
    return { matchName: matchName, name: name, enabled: true, props: props };
  }
  var contrast = function (c, b) { return fx('ADBE Brightness & Contrast 2', 'Brightness & Contrast', { 1: b || 0, 2: c }); };
  var vibrance = function (v, s) { return fx('ADBE Vibrance', 'Vibrance', { 1: v, 2: s || 0 }); };
  var hls = function (hue, light, sat) { return fx('ADBE Color Balance (HLS)', 'Color Balance (HLS)', { 1: hue, 2: light, 3: sat }); };
  // shadows / midtones / highlights, each [red, green, blue] in -100..100
  var balance = function (sh, mid, hi) {
    return fx('ADBE Color Balance 2', 'Color Balance', { 1: sh[0], 2: sh[1], 3: sh[2], 4: mid[0], 5: mid[1], 6: mid[2], 7: hi[0], 8: hi[1], 9: hi[2] });
  };
  var tint = function (black, white, amount) { return fx('ADBE Tint', 'Tint', { 1: black.concat([1]), 2: white.concat([1]), 3: amount }); };
  var exposure = function (stops, offset, gamma) { return fx('ADBE Exposure2', 'Exposure', { 3: stops, 4: offset, 5: gamma }); };
  var sharpen = function (amount) { return fx('ADBE Sharpen', 'Sharpen', { 1: amount }); };
  var noise = function (amount) { return fx('ADBE Noise', 'Noise', { 1: amount, 2: 0 }); };
  var vignette = function (amount) { return fx('CC Vignette', 'CC Vignette', { 1: amount }); };
  var glow = function (radius, intensity) { return fx('ADBE Glo2', 'Glow', { 3: radius, 4: intensity }); };

  var LOOKS = [
    { name: 'Clean Pop', note: 'Contrast, colour, crispness', swatch: 'linear-gradient(135deg,#2d6cdf,#f2b84b)', effects: [contrast(12), vibrance(25, 4), sharpen(10)] },
    { name: 'Warm Film', note: 'Golden mids, soft grain', swatch: 'linear-gradient(135deg,#7a3b1d,#f0b46a)', effects: [balance([4, 0, -6], [6, 1, -8], [5, 2, -10]), contrast(8), vibrance(10, -6), noise(3)] },
    { name: 'Teal & Orange', note: 'Cool shadows, warm skin', swatch: 'linear-gradient(135deg,#0f6f7a,#f08a3c)', effects: [balance([-10, 3, 12], [3, 0, -3], [10, 2, -10]), contrast(10), vibrance(18, 0)] },
    { name: 'Faded Matte', note: 'Lifted blacks, muted', swatch: 'linear-gradient(135deg,#4a4f57,#b9b3a6)', effects: [exposure(0, 0.035, 1.06), contrast(-8), hls(0, 0, -14)] },
    { name: 'Punchy', note: 'Loud and sharp', swatch: 'linear-gradient(135deg,#d7263d,#1b1b3a)', effects: [contrast(22), vibrance(35, 6), sharpen(18), vignette(40)] },
    { name: 'Mono Hard', note: 'High-contrast black & white', swatch: 'linear-gradient(135deg,#0c0c0c,#e8e8e8)', effects: [tint([0, 0, 0], [1, 1, 1], 100), contrast(26)] },
    { name: 'Sepia', note: 'Aged warm monochrome', swatch: 'linear-gradient(135deg,#3b2414,#e6cfa4)', effects: [tint([0.09, 0.05, 0.02], [1, 0.93, 0.8], 70), contrast(6), noise(4), vignette(45)] },
    { name: 'Dream Glow', note: 'Soft bloom on highlights', swatch: 'linear-gradient(135deg,#8e6bd8,#ffd9ec)', effects: [glow(70, 0.6), contrast(-4, 4), vibrance(12, 4)] },
    { name: 'Night Cool', note: 'Blue, darker, quieter', swatch: 'linear-gradient(135deg,#0b1d3a,#4f7fb8)', effects: [exposure(-0.35, 0, 1), balance([-6, 0, 12], [-4, 0, 8], [-2, 0, 6]), hls(0, 0, -12)] },
    { name: 'Crisp', note: 'Sharpening only', swatch: 'linear-gradient(135deg,#2a2a2f,#9aa0ab)', effects: [sharpen(24)] }
  ];

  SP.pages.push({
    id: 'color', title: 'Color', icon: 'color',
    render: function (root) {
      var strength = SP.settings.get('color.strength', 100);
      var onLayers = false;
      var strengthLabel = h('span', { class: 'tag', text: strength + '%' });
      var slider = h('input', {
        type: 'range', min: '10', max: '100', step: '5', value: String(strength), 'aria-label': 'Strength',
        oninput: function () { strength = Number(slider.value); strengthLabel.textContent = strength + '%'; SP.settings.set('color.strength', strength); }
      });

      var grid = h('div', { class: 'looks' });
      LOOKS.forEach(function (look) {
        grid.appendChild(h('button', {
          class: 'look', title: 'Apply ' + look.name, onclick: function () {
            var preset = { format: 'simplify-preset', version: 1, name: look.name, duration: 0, keySpan: null, effects: look.effects };
            ui.run({
              id: 'presets.apply', title: look.name,
              done: function (d) { return onLayers ? look.name + ' applied to ' + d.layers + (d.layers === 1 ? ' layer' : ' layers') : look.name + ' added on an adjustment layer'; }
            }, null, { preset: preset, mode: 'start', target: onLayers ? 'selected' : 'adjustment', strength: strength });
          }
        }, h('div', { class: 'look-swatch', style: { background: look.swatch } }),
          h('div', { class: 'look-name' }, look.name, h('span', { class: 'look-note', text: look.note }))));
      });

      root.appendChild(ui.pageHead('Color', 'One-click looks on an adjustment layer. Select clips first to trim the layer to them.'));
      root.appendChild(h('div', { class: 'card' },
        h('div', { class: 'field' }, h('label', { text: 'Strength' }), slider, strengthLabel),
        ui.field('Apply directly to selected layers', ui.toggle(false, function (v) { onLayers = v; }, 'Apply directly to selected layers'))));
      root.appendChild(ui.section('Looks', grid));
      root.appendChild(h('p', { class: 'hint mt', text: 'Built from stock After Effects effects, so they work everywhere and stay fully editable. Save your own grade as a preset on the Presets page and it applies the same way.' }));
    }
  });
}(window.SP = window.SP || {}));
