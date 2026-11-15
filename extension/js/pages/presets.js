/*
 * Simplify — Presets.
 * Save a layer's effect stack as a reusable preset, then apply it to any selection. On apply the
 * keyframes are fitted to each target layer (first key on the in point, last key on the last
 * frame, everything between keeps its proportions), which is what you would otherwise do by
 * hand with Alt-drag on every layer. Native .ffx presets get the same treatment.
 */
(function (SP) {
  'use strict';
  var ui = SP.ui;
  var h = ui.h;
  var list = null;

  var MODES = [
    { value: 'stretch', label: 'Fit to layer', title: 'First key on the in point, last key on the last frame' },
    { value: 'start', label: 'From start', title: 'Keep the original timing, aligned to the in point' },
    { value: 'end', label: 'From end', title: 'Keep the original timing, aligned to the out point' }
  ];

  function mode() { return SP.settings.get('presets.mode', 'stretch'); }

  function describe(p) {
    var keys = 0;
    (p.effects || []).forEach(function (e) {
      (e.props || []).forEach(function (pr) { keys += (pr.keys || []).length; });
    });
    var parts = [(p.effects || []).length + ((p.effects || []).length === 1 ? ' effect' : ' effects')];
    if (keys) parts.push(keys + ' keyframes');
    if (p.transform && p.transform.length) parts.push('transform');
    return parts.join(' · ');
  }

  function applyPreset(preset, target) {
    return ui.run({
      id: 'presets.apply', title: preset.name,
      done: function (d) {
        return target === 'adjustment' ? preset.name + ' added on an adjustment layer'
          : preset.name + ' applied to ' + d.layers + (d.layers === 1 ? ' layer' : ' layers');
      }
    }, null, { preset: preset, mode: mode(), target: target || 'selected' });
  }
  SP.applyPreset = applyPreset;

  function refresh() {
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    var items;
    try {
      items = SP.presetFiles.list();
    } catch (e) {
      list.appendChild(h('div', { class: 'empty', text: 'The preset folder could not be read.' }));
      return;
    }
    if (!items.length) {
      list.appendChild(h('div', { class: 'empty', text: 'No presets yet. Select a layer with effects and save it above.' }));
      return;
    }
    items.forEach(function (item) {
      var p = item.preset;
      list.appendChild(h('div', { class: 'row' },
        h('button', { class: 'row-main', title: 'Apply to the selected layers', onclick: function () { applyPreset(p, 'selected'); } },
          h('div', { class: 'row-title', text: p.name }),
          h('div', { class: 'row-meta', text: describe(p) })),
        h('button', { class: 'icon-btn', title: 'Apply on a new adjustment layer', 'aria-label': 'Apply ' + p.name + ' on a new adjustment layer', onclick: function () { applyPreset(p, 'adjustment'); } }, ui.icon('adjust')),
        h('button', {
          class: 'icon-btn danger', title: 'Delete preset', 'aria-label': 'Delete ' + p.name, onclick: function () {
            SP.presetFiles.remove(item.id);
            refresh();
            // Deleting is instant but forgiving: the toast puts it back.
            ui.toast({ kind: 'hint', title: 'Deleted "' + p.name + '"', duration: 6000, action: { label: 'Restore', run: function () { SP.presetFiles.save(p); refresh(); } } });
          }
        }, ui.icon('trash'))));
    });
  }

  // ---- .ffx favourites ------------------------------------------------------------------
  var ffxList = null;

  function ffxName(path) {
    return path.replace(/^.*[\\/]/, '').replace(/\.ffx$/i, '');
  }

  function applyFfx(path) {
    return ui.run({
      id: 'presets.applyFfx', title: ffxName(path),
      done: function (d) { return ffxName(path) + ' applied to ' + d.layers + (d.layers === 1 ? ' layer' : ' layers') + (d.keys ? ', keyframes fitted' : ''); }
    }, null, { path: path, mode: mode() === 'stretch' ? 'stretch' : 'start' });
  }

  function refreshFfx() {
    if (!ffxList) return;
    while (ffxList.firstChild) ffxList.removeChild(ffxList.firstChild);
    var paths = SP.settings.get('ffx.favourites', []);
    paths.forEach(function (path) {
      ffxList.appendChild(h('div', { class: 'row' },
        h('button', { class: 'row-main', title: path, onclick: function () { applyFfx(path); } },
          h('div', { class: 'row-title', text: ffxName(path) }),
          h('div', { class: 'row-meta', text: '.ffx preset' })),
        h('button', {
          class: 'icon-btn danger', title: 'Remove from this list', 'aria-label': 'Remove ' + ffxName(path), onclick: function () {
            SP.settings.set('ffx.favourites', SP.settings.get('ffx.favourites', []).filter(function (x) { return x !== path; }));
            refreshFfx();
          }
        }, ui.icon('x'))));
    });
  }

  function addFfx() {
    var fs = window.cep && window.cep.fs;
    if (!fs || !fs.showOpenDialogEx) {
      ui.toast({ kind: 'hint', title: 'File dialogs only work inside After Effects' });
      return;
    }
    var res = fs.showOpenDialogEx(true, false, 'Choose animation presets', '', ['ffx']);
    if (!res || res.err || !res.data || !res.data.length) return;
    var paths = SP.settings.get('ffx.favourites', []);
    res.data.forEach(function (p) { if (paths.indexOf(p) === -1) paths.push(p); });
    SP.settings.set('ffx.favourites', paths);
    refreshFfx();
  }

  SP.pages.push({
    id: 'presets', title: 'Presets', icon: 'presets',
    render: function (root) {
      root.appendChild(ui.pageHead('Presets', 'Reusable effect stacks whose keyframes snap to each layer.'));

      root.appendChild(ui.section('Keyframe timing on apply',
        ui.segmented(MODES, mode(), function (v) { SP.settings.set('presets.mode', v); })));

      var name = '';
      var withTransform = false;
      var nameInput = ui.textInput('', function (v) { name = v; }, { placeholder: 'Preset name (defaults to the layer name)' });
      var save = h('button', {
        class: 'btn primary block', onclick: function () {
          ui.run({ id: 'presets.capture', title: 'Save preset', silent: true, undo: false }, null, { name: name.trim(), transform: withTransform })
            .then(function (d) {
              if (!d) return;
              try {
                SP.presetFiles.save(d.preset);
              } catch (e) {
                ui.toast({ kind: 'error', title: 'Could not write the preset file', detail: e.message });
                return;
              }
              nameInput.value = '';
              name = '';
              refresh();
              ui.toast({ title: 'Saved "' + d.preset.name + '"', detail: d.effects + (d.effects === 1 ? ' effect' : ' effects') + (d.keys ? ', ' + d.keys + ' keyframes' : '') });
            });
        }
      }, ui.icon('save'), 'Save from selected layer');
      root.appendChild(ui.section('New preset', h('div', { class: 'card' },
        nameInput,
        ui.field('Include transform animation', ui.toggle(false, function (v) { withTransform = v; }, 'Include transform animation')),
        save,
        h('p', { class: 'hint', text: 'Saves the selected effects, or all effects if none is selected. Curves graphs and other custom data cannot be read by scripts; use an .ffx for those.' }))));

      list = h('div', { class: 'list' });
      root.appendChild(ui.section('My presets', list));

      ffxList = h('div', { class: 'list' });
      root.appendChild(ui.section('.ffx presets', ffxList,
        h('button', { class: 'btn block mt', onclick: addFfx }, ui.icon('plus'), 'Add .ffx files'),
        h('p', { class: 'hint', text: 'Applied through After Effects, then their keyframes are fitted to every selected layer. Works with third-party presets such as Twixtor setups.' })));

      root.appendChild(ui.section('Existing keyframes', ui.tiles(['keys.fitToLayer'])));

      refresh();
      refreshFfx();
    },
    onShow: function () { refresh(); }
  });
}(window.SP = window.SP || {}));
