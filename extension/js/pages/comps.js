/* Simplify — Comps: precompose, unpack and duplicate without side effects. */
(function (SP) {
  'use strict';
  var ui = SP.ui;

  SP.pages.push({
    id: 'comps', title: 'Comps', icon: 'comps',
    render: function (root) {
      root.appendChild(ui.pageHead('Comps', 'Precompose, unpack and duplicate without touching the originals.'));
      root.appendChild(ui.section('Precompose', ui.tiles(['comps.precomposeEach', 'comps.unprecompose'])));
      root.appendChild(ui.section('Independent copies', ui.tiles(['comps.makeUnique', 'comps.duplicateDeep'])));
      root.appendChild(ui.section('Tidy', ui.tiles(['comps.trimToContent'])));
    }
  });
}(window.SP = window.SP || {}));
