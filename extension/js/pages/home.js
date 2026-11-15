/* Simplify — Home: the actions an editor reaches for all day, one click each. */
(function (SP) {
  'use strict';
  var ui = SP.ui;
  var h = ui.h;

  SP.pages.push({
    id: 'home', title: 'Home', icon: 'home',
    render: function (root, ctx) {
      root.appendChild(ui.pageHead('Simplify', 'Select layers in After Effects, then click. Every action is one undo step.'));
      root.appendChild(ui.section('Quick actions', ui.tiles([
        'comps.precomposeEach', 'comps.unprecompose', 'comps.makeUnique', 'keys.fitToLayer',
        'layers.anchorCenter', 'layers.center', 'layers.fill', 'layers.adjustment',
        'layers.sequence', 'layers.nullParent'
      ], ctx.first)));

      var tips = h('div', { class: 'card' },
        h('div', null, h('strong', { text: 'Search is the fast lane. ' }),
          h('span', { class: 'muted', text: 'Click the panel and just start typing: effects, actions and expressions filter as you type, Enter applies the first hit, Shift+Enter puts an effect on a new adjustment layer.' })),
        h('div', null, h('strong', { text: 'Want it on a hotkey from anywhere? ' }),
          h('span', { class: 'muted', text: 'Install "Simplify FX Search.jsx" from the scripts folder and bind it under Edit > Keyboard Shortcuts. Spacebar itself is reserved by After Effects for playback.' })));
      root.appendChild(ui.section('Tips', tips));
    }
  });
}(window.SP = window.SP || {}));
