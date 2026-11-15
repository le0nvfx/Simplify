/*
 * Simplify — stand-in for After Effects when the panel runs in a plain browser (design work,
 * automated UI tests). It answers every host call with plausible data after a short delay.
 */
(function (SP) {
  'use strict';

  var EFFECTS = [
    ['Gaussian Blur', 'ADBE Gaussian Blur 2', 'Blur & Sharpen'], ['Camera Lens Blur', 'ADBE Camera Lens Blur', 'Blur & Sharpen'],
    ['Directional Blur', 'ADBE Motion Blur', 'Blur & Sharpen'], ['Sharpen', 'ADBE Sharpen', 'Blur & Sharpen'],
    ['Curves', 'ADBE CurvesCustom', 'Color Correction'], ['Lumetri Color', 'ADBE Lumetri', 'Color Correction'],
    ['Hue/Saturation', 'ADBE HUE SATURATION', 'Color Correction'], ['Tint', 'ADBE Tint', 'Color Correction'],
    ['Exposure', 'ADBE Exposure2', 'Color Correction'], ['Vibrance', 'ADBE Vibrance', 'Color Correction'],
    ['Glow', 'ADBE Glo2', 'Stylize'], ['Posterize Time', 'ADBE Posterize Time', 'Time'],
    ['Echo', 'ADBE Echo', 'Time'], ['Turbulent Displace', 'ADBE Turbulent Displace', 'Distort'],
    ['Transform', 'ADBE Geometry2', 'Distort'], ['Optics Compensation', 'ADBE Optics Compensation', 'Distort'],
    ['Fractal Noise', 'ADBE Fractal Noise', 'Noise & Grain'], ['Noise', 'ADBE Noise', 'Noise & Grain'],
    ['Drop Shadow', 'ADBE Drop Shadow', 'Perspective'], ['Fill', 'ADBE Fill', 'Generate'],
    ['Gradient Ramp', 'ADBE Ramp', 'Generate'], ['CC Vignette', 'CC Vignette', 'Stylize'],
    ['Twixtor Pro', 'Twixtor Pro', 'RE:Vision Plug-ins'], ['Deep Glow', 'PEDG', 'Plugin Everything']
  ];

  var answers = {
    'core.info': function () { return { version: 'preview', ae: 'browser preview', canWriteFiles: true }; },
    'core.undo': function () { return null; },
    'fx.list': function () { return EFFECTS; },
    'comps.precomposeEach': function () { return { count: 3 }; },
    'comps.unprecompose': function () { return { precomps: 1, layers: 6 }; },
    'comps.duplicateDeep': function () { return { comps: 4, top: ['Main copy'] }; },
    'comps.makeUnique': function () { return { layers: 1, comps: 2 }; },
    'comps.trimToContent': function () { return { duration: 8.4 }; },
    'layers.anchor': function () { return { moved: 2, total: 2 }; },
    'layers.center': function () { return { moved: 2 }; },
    'layers.fit': function () { return { fitted: 1 }; },
    'layers.sequence': function () { return { count: 5 }; },
    'layers.nullParent': function () { return { parented: 3 }; },
    'layers.adjustment': function () { return { count: 1 }; },
    'keys.fitToLayer': function () { return { keys: 6, layers: 2 }; },
    'presets.capture': function (a) {
      return { preset: { format: 'simplify-preset', version: 1, name: a.name || 'Layer', duration: 4, frameRate: 30, keySpan: [0, 3.9], effects: [{ matchName: 'ADBE Glo2', name: 'Glow', enabled: true, props: [] }] }, effects: 1, keys: 2 };
    },
    'presets.apply': function () { return { layers: 2, effects: 2, keys: 4 }; },
    'presets.applyFfx': function () { return { layers: 2, keys: 4 }; },
    'ease.apply': function () { return { pairs: 3, properties: 2 }; },
    'ease.read': function () { return { x1: 0.6, y1: 0, x2: 0.2, y2: 1, property: 'Position' }; },
    'expr.apply': function () { return { applied: 1, total: 1 }; },
    'expr.clear': function () { return { removed: 2 }; },
    'expr.read': function () { return { code: 'wiggle(2, 30)', property: 'Position' }; },
    'fx.apply': function () { return { applied: 1 }; },
    'captions.build': function (a) { return { count: (a.cues || []).length }; },
    'captions.clear': function () { return { removed: 12 }; },
    'captions.restyle': function () { return { count: 11 }; },
    'captions.readStyle': function () { return { font: 'Montserrat-ExtraBold', size: 72, fill: [1, 1, 1], strokeWidth: 6, stroke: [0, 0, 0], x: 0.5, y: 0.8 }; },
    'captions.source': function () { return { path: '/footage/interview.mp4', name: 'interview.mp4', sourceStart: 0, duration: 42, compStart: 0, stretch: 100, remapped: false }; },
    'ai.context': function () { return { aeVersion: 'preview', comp: { name: 'Main', width: 1920, height: 1080, frameRate: 30, duration: 20, time: 2, numLayers: 3 }, layers: [], selectedLayers: [], selectedProperties: [] }; },
    'ai.run': function () { return { result: null }; }
  };

  SP.mock = function (name, args) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        var fn = answers[name];
        if (!fn) return reject(new Error('Unknown action: ' + name));
        resolve({ ok: true, data: fn(args), warnings: [] });
      }, 180);
    });
  };
}(window.SP = window.SP || {}));
