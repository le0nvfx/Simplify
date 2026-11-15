/*
 * Simplify — persistence.
 * settings: small values in localStorage (per machine, per AE version).
 * files:    user presets as JSON files in <user data>/Simplify/presets, so they survive panel
 *           updates and can be backed up or shared. Falls back to localStorage in a browser.
 */
(function (SP) {
  'use strict';

  var KEY = 'simplify.settings.v1';
  var cache = null;

  function load() {
    if (cache) return cache;
    try {
      cache = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    } catch (e) {
      cache = {};
    }
    return cache;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (e) { /* storage unavailable: settings last for this session only */ }
  }

  SP.settings = {
    get: function (key, fallback) {
      var v = load()[key];
      return v === undefined ? fallback : v;
    },
    set: function (key, value) {
      load()[key] = value;
      persist();
    },
    remove: function (key) {
      delete load()[key];
      persist();
    }
  };

  // ---- preset files ---------------------------------------------------------------------
  var fs = null;
  var path = null;
  var dir = null;

  function ready() {
    if (dir !== null) return !!dir;
    dir = '';
    var req = SP.bridge.node();
    if (!req || !SP.bridge.live) return false;
    try {
      fs = req('fs');
      path = req('path');
      var base = SP.bridge.systemPath('userData');
      dir = path.join(base, 'Simplify', 'presets');
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      dir = '';
    }
    return !!dir;
  }

  function safeName(name) {
    return String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 80) || 'Preset';
  }

  function lsAll() {
    return SP.settings.get('presets', {});
  }

  SP.presetFiles = {
    folder: function () { return ready() ? dir : ''; },

    list: function () {
      var out = [];
      if (ready()) {
        fs.readdirSync(dir).forEach(function (file) {
          if (!/\.json$/i.test(file)) return;
          try {
            var data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            if (data && data.format === 'simplify-preset') out.push({ id: file, preset: data });
          } catch (e) { /* unreadable file: skip it rather than break the list */ }
        });
      } else {
        var all = lsAll();
        Object.keys(all).forEach(function (id) { out.push({ id: id, preset: all[id] }); });
      }
      out.sort(function (a, b) { return a.preset.name.localeCompare(b.preset.name); });
      return out;
    },

    save: function (preset) {
      var base = safeName(preset.name);
      if (ready()) {
        var file = base + '.json';
        var n = 2;
        while (fs.existsSync(path.join(dir, file))) {
          file = base + ' ' + n + '.json';
          n++;
        }
        fs.writeFileSync(path.join(dir, file), JSON.stringify(preset, null, 1), 'utf8');
        return file;
      }
      var all = lsAll();
      var id = base;
      var i = 2;
      while (all[id]) {
        id = base + ' ' + i;
        i++;
      }
      all[id] = preset;
      SP.settings.set('presets', all);
      return id;
    },

    remove: function (id) {
      if (ready()) {
        // id comes from readdir, but never let a crafted name escape the preset folder.
        var target = path.join(dir, path.basename(id));
        if (fs.existsSync(target)) fs.unlinkSync(target);
        return;
      }
      var all = lsAll();
      delete all[id];
      SP.settings.set('presets', all);
    }
  };
}(window.SP = window.SP || {}));
