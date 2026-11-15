/* Simplify — Layers: anchor point, centring, fit, sequencing. */
(function (SP) {
  'use strict';
  var ui = SP.ui;
  var h = ui.h;

  var NAMES = ['Top left', 'Top', 'Top right', 'Left', 'Centre', 'Right', 'Bottom left', 'Bottom', 'Bottom right'];

  function anchorGrid() {
    var grid = h('div', { class: 'anchor-grid', role: 'group', 'aria-label': 'Anchor point position' });
    for (var i = 0; i < 9; i++) {
      (function (i) {
        var x = (i % 3) / 2;
        var y = Math.floor(i / 3) / 2;
        grid.appendChild(h('button', {
          class: 'anchor-dot', title: NAMES[i], 'aria-label': 'Anchor ' + NAMES[i],
          onclick: function () {
            ui.run({
              id: 'layers.anchor', title: 'Move anchor point',
              done: function (d) { return d.moved ? 'Anchor moved on ' + d.moved + (d.moved === 1 ? ' layer' : ' layers') : 'Anchor is already there'; }
            }, null, { x: x, y: y });
          }
        }));
      }(i));
    }
    return h('div', { class: 'card' },
      h('div', { class: 'anchor-wrap' }, grid,
        h('div', null,
          h('div', { class: 'tile-title', text: 'Anchor point' }),
          h('p', { class: 'hint', text: 'Click a point of the layer\'s bounds. The layer does not move; position is compensated, keyframes included.' }))));
  }

  SP.pages.push({
    id: 'layers', title: 'Layers', icon: 'layers',
    render: function (root) {
      root.appendChild(ui.pageHead('Layers', 'Position, align and arrange the selected layers.'));
      root.appendChild(ui.section('Anchor', anchorGrid()));
      root.appendChild(ui.section('Align', ui.tiles(['layers.center', 'layers.centerH', 'layers.centerV', 'layers.fit', 'layers.fill'])));
      root.appendChild(ui.section('Arrange', ui.tiles(['layers.sequence', 'layers.nullParent', 'layers.adjustment'])));
    }
  });
}(window.SP = window.SP || {}));
