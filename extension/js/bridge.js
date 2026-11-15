/*
 * Simplify — bridge between the panel and After Effects.
 * Talks to the CEP runtime directly (window.__adobe_cep__), so no vendored CSInterface.js.
 * Calls are queued: ExtendScript is single-threaded, and overlapping evalScript calls are a
 * classic source of hangs. Outside After Effects (a normal browser) a mock answers instead,
 * which is what makes the panel previewable and testable.
 */
(function (SP) {
  'use strict';

  var cep = window.__adobe_cep__ || null;
  var queue = Promise.resolve();
  var booted = null;

  function nodeRequire() {
    if (window.cep_node && typeof window.cep_node.require === 'function') return window.cep_node.require;
    if (typeof window.require === 'function') return window.require;
    return null;
  }

  // JSON that is also a safe ExtendScript string literal: everything non-ASCII is escaped.
  function literal(value) {
    return JSON.stringify(value).replace(/[\u007f-￿]/g, function (c) {
      return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  function evalScript(script) {
    return new Promise(function (resolve) {
      cep.evalScript(script, resolve);
    });
  }

  function systemPath(kind) {
    var p = decodeURI(cep.getSystemPath(kind));
    var isWin = navigator.platform.indexOf('Win') === 0;
    return isWin ? p.replace(/^file:\/\/\//, '') : p.replace(/^file:\/\//, '');
  }

  function boot() {
    if (booted) return booted;
    if (!cep) {
      booted = Promise.resolve({ version: 'preview', ae: 'browser preview', canWriteFiles: true });
      return booted;
    }
    var root = systemPath('extension');
    var load = '(function(){try{$.evalFile(new File(' + literal(root + '/host/index.jsx') + '));' +
      'return Simplify.load(' + literal(root) + ');}catch(e){return "ERR:"+e.message+" (line "+e.line+")";}}())';
    booted = evalScript(load).then(function (res) {
      if (!res || res === 'EvalScript error.' || String(res).indexOf('ERR:') === 0) {
        booted = null;
        throw new Error('Could not start the After Effects side: ' + String(res).replace(/^ERR:/, ''));
      }
      return raw('core.info', {});
    }).then(function (r) { return r.data; });
    return booted;
  }

  function raw(name, args) {
    var script = 'Simplify.run(' + literal(name) + ',' + literal(JSON.stringify(args || {})) + ')';
    return evalScript(script).then(function (text) {
      var res;
      try {
        res = JSON.parse(text);
      } catch (e) {
        throw new Error(text === 'EvalScript error.' ? 'After Effects did not answer. Reopen the panel.' : 'Unreadable answer from After Effects.');
      }
      if (!res.ok) {
        var err = new Error(res.error || 'Unknown error');
        err.user = !!res.user;
        err.detail = res.file ? res.file + ':' + res.line : '';
        err.warnings = res.warnings || [];
        throw err;
      }
      return res;
    });
  }

  // Resolves with { data, warnings }. Rejects with an Error (err.user = expected condition).
  function call(name, args) {
    var run = function () {
      if (!cep) return SP.mock(name, args || {});
      return boot().then(function () { return raw(name, args); });
    };
    var next = queue.then(run, run);
    queue = next.catch(function () {});
    return next;
  }

  SP.bridge = {
    live: !!cep,
    boot: boot,
    call: call,
    literal: literal,
    node: nodeRequire,
    systemPath: function (kind) { return cep ? systemPath(kind) : ''; },
    openURL: function (url) {
      if (window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) {
        window.cep.util.openURLInDefaultBrowser(url);
      } else {
        window.open(url, '_blank');
      }
    },
    // Ask AE to hand these keys to the panel instead of using them itself while it has focus.
    claimKeys: function (keys) {
      if (cep && cep.registerKeyEventsInterest) {
        try { cep.registerKeyEventsInterest(JSON.stringify(keys)); } catch (e) { /* older runtimes */ }
      }
    }
  };
}(window.SP = window.SP || {}));
