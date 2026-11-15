/*
 * Simplify — action catalogue. One entry per host call; tiles and the search palette both read
 * from here. `options` become the fold-out controls on a tile and are remembered per action.
 */
(function (SP) {
  'use strict';
  var define = SP.ui.define;
  var n = function (count, word) { return count + ' ' + word + (count === 1 ? '' : 's'); };

  // ---- compositions ----
  define({
    id: 'comps.precomposeEach', icon: 'box', title: 'Precompose each',
    desc: 'One precomp per selected layer',
    keywords: 'precomp separate individual pre-compose',
    options: [
      { key: 'trim', type: 'toggle', label: 'Trim comp to layer length', value: true },
      { key: 'moveAttributes', type: 'toggle', label: 'Move all attributes', value: true, hint: 'Off keeps effects and transforms on the outer layer.' },
      { key: 'suffix', type: 'text', label: 'Name suffix', value: ' Comp' }
    ],
    done: function (d) { return n(d.count, 'precomp') + ' created'; }
  });
  define({
    id: 'comps.unprecompose', icon: 'unbox', title: 'Un-precompose',
    desc: 'Unpack a precomp back into this comp',
    keywords: 'decompose de-compose unpack explode extract precomp',
    options: [{ key: 'keepOriginal', type: 'toggle', label: 'Keep the precomp layer (hidden)', value: false }],
    done: function (d) { return n(d.layers, 'layer') + ' unpacked'; }
  });
  define({
    id: 'comps.makeUnique', icon: 'unique', title: 'Make unique',
    desc: 'Give selected precomps their own copy',
    keywords: 'independent duplicate precomp instance unlink true duplicate',
    options: [
      { key: 'suffix', type: 'text', label: 'Name suffix', value: ' copy' },
      { key: 'fixExpressions', type: 'toggle', label: 'Re-point comp() expressions', value: true }
    ],
    done: function (d) { return n(d.layers, 'precomp') + ' made unique'; }
  });
  define({
    id: 'comps.duplicateDeep', icon: 'copy', title: 'Independent duplicate',
    desc: 'Duplicate a comp with all nested comps',
    keywords: 'true comp duplicator deep copy nested',
    options: [
      { key: 'suffix', type: 'text', label: 'Name suffix', value: ' copy' },
      { key: 'fixExpressions', type: 'toggle', label: 'Re-point comp() expressions', value: true }
    ],
    done: function (d) { return n(d.comps, 'comp') + ' duplicated'; }
  });
  define({
    id: 'comps.trimToContent', icon: 'trim', title: 'Trim comp to content',
    desc: 'Comp starts and ends with its layers',
    keywords: 'duration crop length',
    done: function () { return 'Comp trimmed to its content'; }
  });

  // ---- layers ----
  define({
    id: 'layers.anchorCenter', call: 'layers.anchor', args: { x: 0.5, y: 0.5 }, icon: 'layers', title: 'Center anchor point',
    desc: 'Anchor to the middle, layer stays put', keywords: 'anchor pivot centre',
    done: function (d) { return d.moved ? 'Anchor centred on ' + n(d.moved, 'layer') : 'Anchor is already centred'; }
  });
  define({
    id: 'layers.center', call: 'layers.center', args: { axis: 'both' }, icon: 'center', title: 'Center in comp',
    desc: 'Move layers to the middle of the frame', keywords: 'align centre middle',
    done: function (d) { return n(d.moved, 'layer') + ' centred'; }
  });
  define({
    id: 'layers.centerH', call: 'layers.center', args: { axis: 'h' }, icon: 'center', title: 'Center horizontally',
    keywords: 'align centre x', done: function (d) { return n(d.moved, 'layer') + ' centred horizontally'; }
  });
  define({
    id: 'layers.centerV', call: 'layers.center', args: { axis: 'v' }, icon: 'center', title: 'Center vertically',
    keywords: 'align centre y', done: function (d) { return n(d.moved, 'layer') + ' centred vertically'; }
  });
  define({
    id: 'layers.fit', call: 'layers.fit', args: { mode: 'fit' }, icon: 'fit', title: 'Fit to comp',
    desc: 'Scale to fit inside the frame', keywords: 'scale contain',
    done: function (d) { return n(d.fitted, 'layer') + ' fitted'; }
  });
  define({
    id: 'layers.fill', call: 'layers.fit', args: { mode: 'fill' }, icon: 'fill', title: 'Fill comp',
    desc: 'Scale to cover the whole frame', keywords: 'scale cover',
    done: function (d) { return n(d.fitted, 'layer') + ' scaled to fill'; }
  });
  define({
    id: 'layers.sequence', icon: 'sequence', title: 'Sequence layers',
    desc: 'Stagger or chain layers in time', keywords: 'stagger offset cascade staircase',
    options: [
      { key: 'frames', type: 'number', label: 'Frames', value: 5, min: -600, max: 600, hint: 'Stagger: offset between starts. Chain: overlap (negative = gap).' },
      { key: 'mode', type: 'seg', label: 'Mode', value: 'stagger', choices: [{ value: 'stagger', label: 'Stagger' }, { value: 'chain', label: 'Chain' }] },
      { key: 'order', type: 'seg', label: 'Order', value: 'selection', choices: [{ value: 'selection', label: 'Selection' }, { value: 'top', label: 'Top down' }, { value: 'bottom', label: 'Bottom up' }] }
    ],
    done: function (d) { return n(d.count, 'layer') + ' sequenced'; }
  });
  define({
    id: 'layers.nullParent', icon: 'nullobj', title: 'Parent to new null',
    desc: 'One controller for the selection', keywords: 'null control parent',
    done: function (d) { return n(d.parented, 'layer') + ' parented to a null'; }
  });
  define({
    id: 'layers.adjustment', icon: 'adjust', title: 'Adjustment layer above',
    desc: 'Trimmed to the selected layers', keywords: 'adjustment',
    options: [{ key: 'perLayer', type: 'toggle', label: 'One per selected layer', value: false }],
    done: function (d) { return n(d.count, 'adjustment layer') + ' added'; }
  });

  // ---- keyframes ----
  define({
    id: 'keys.fitToLayer', icon: 'snap', title: 'Fit keyframes to layer',
    desc: 'First key to the in point, last key to the last frame',
    keywords: 'snap stretch keyframes twixtor alt drag retime',
    options: [{
      key: 'scope', type: 'seg', label: 'Keyframes to fit', value: 'effects',
      choices: [{ value: 'effects', label: 'Effects' }, { value: 'all', label: 'Whole layer' }, { value: 'selected', label: 'Selected' }]
    }],
    done: function (d) { return n(d.keys, 'keyframe') + ' fitted on ' + n(d.layers, 'layer'); }
  });

  // ---- misc ----
  define({
    id: 'expr.clear', icon: 'x', title: 'Remove expressions',
    desc: 'From the selected properties or layers', keywords: 'delete clear expression',
    done: function (d) { return n(d.removed, 'expression') + ' removed'; }
  });
  define({
    id: 'captions.clear', icon: 'trash', title: 'Remove captions',
    desc: 'Deletes the captions Simplify built in this comp', keywords: 'subtitles delete',
    done: function (d) { return n(d.removed, 'caption') + ' removed'; }
  });
}(window.SP = window.SP || {}));
