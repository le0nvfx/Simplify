/*
 * Simplify — network + process helpers.
 * Requests go through the panel's Node runtime (no CORS, works with localhost model servers);
 * a fetch fallback covers the browser preview. Nothing here runs unless the user starts a
 * transcription or an assistant request.
 */
(function (SP) {
  'use strict';

  function node(name) {
    var req = SP.bridge.node();
    if (!req) return null;
    try {
      return req(name);
    } catch (e) {
      return null;
    }
  }

  // opts: { url, method, headers, body (string | Buffer), timeout, onChunk(text) }
  // Returns { promise -> { status, body }, abort() }. With onChunk, a 2xx body is streamed to
  // the callback and `body` stays empty; error bodies are always collected for the message.
  function request(opts) {
    var https = node('https');
    var http = node('http');
    if (https && http) return nodeRequest(opts, https, http);
    return fetchRequest(opts);
  }

  function nodeRequest(opts, https, http) {
    var req = null;
    var aborted = false;
    var promise = new Promise(function (resolve, reject) {
      var u;
      try {
        u = new URL(opts.url);
      } catch (e) {
        reject(new Error('The address "' + opts.url + '" is not a valid URL.'));
        return;
      }
      var mod = u.protocol === 'https:' ? https : http;
      req = mod.request({
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method: opts.method || 'POST',
        headers: opts.headers || {}
      }, function (res) {
        var body = '';
        var streaming = !!opts.onChunk && res.statusCode >= 200 && res.statusCode < 300;
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
          if (streaming) opts.onChunk(chunk);
          else body += chunk;
        });
        res.on('end', function () { resolve({ status: res.statusCode, body: body, headers: res.headers }); });
        res.on('error', reject);
      });
      req.on('error', function (err) {
        if (aborted) reject(Object.assign(new Error('Cancelled'), { cancelled: true }));
        else reject(new Error(friendlyNetworkError(err, u.host)));
      });
      req.setTimeout(opts.timeout || 600000, function () { req.destroy(new Error('The request timed out.')); });
      if (opts.body !== undefined && opts.body !== null) req.write(opts.body);
      req.end();
    });
    return { promise: promise, abort: function () { aborted = true; if (req) req.destroy(); } };
  }

  function friendlyNetworkError(err, host) {
    var code = err && err.code;
    if (code === 'ECONNREFUSED') return 'Nothing is listening at ' + host + '. Is the server running?';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Could not reach ' + host + '. Check your internet connection.';
    if (code === 'ECONNRESET') return 'The connection to ' + host + ' was interrupted.';
    return (err && err.message) || 'Network error';
  }

  function fetchRequest(opts) {
    var controller = new AbortController();
    var promise = fetch(opts.url, {
      method: opts.method || 'POST', headers: opts.headers || {}, body: opts.body, signal: controller.signal
    }).then(function (res) {
      if (!opts.onChunk || !res.ok || !res.body) {
        return res.text().then(function (text) { return { status: res.status, body: text }; });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var pump = function () {
        return reader.read().then(function (r) {
          if (r.done) return { status: res.status, body: '' };
          opts.onChunk(decoder.decode(r.value, { stream: true }));
          return pump();
        });
      };
      return pump();
    }, function (err) {
      if (err && err.name === 'AbortError') throw Object.assign(new Error('Cancelled'), { cancelled: true });
      throw new Error('Network error: ' + (err && err.message));
    });
    return { promise: promise, abort: function () { controller.abort(); } };
  }

  // Incremental Server-Sent Events parser. feed(text) calls onEvent(dataString, eventName).
  function sse(onEvent) {
    var buffer = '';
    return function feed(text) {
      buffer += text;
      var at;
      while ((at = buffer.search(/\r?\n\r?\n/)) !== -1) {
        var block = buffer.slice(0, at);
        buffer = buffer.slice(at).replace(/^\r?\n\r?\n/, '');
        var name = '';
        var data = [];
        block.split(/\r?\n/).forEach(function (line) {
          if (line.indexOf('event:') === 0) name = line.slice(6).trim();
          else if (line.indexOf('data:') === 0) data.push(line.slice(5).replace(/^ /, ''));
        });
        if (data.length) onEvent(data.join('\n'), name);
      }
    };
  }

  // multipart/form-data body built by hand: the embedded Node has no FormData.
  function multipart(fields, file) {
    var Buffer = node('buffer').Buffer;
    var boundary = '----simplify' + Date.now().toString(16) + Math.random().toString(16).slice(2);
    var parts = [];
    Object.keys(fields).forEach(function (key) {
      [].concat(fields[key]).forEach(function (value) {
        parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + key + '"\r\n\r\n' + value + '\r\n', 'utf8'));
      });
    });
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + file.field + '"; filename="' + file.name.replace(/"/g, '') + '"\r\nContent-Type: ' + file.type + '\r\n\r\n', 'utf8'));
    parts.push(file.data);
    parts.push(Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8'));
    var body = Buffer.concat(parts);
    return { body: body, headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length } };
  }

  // Run a program without a shell (arguments are passed as an array, never interpolated).
  function exec(file, args, opts) {
    var cp = node('child_process');
    if (!cp) return Promise.reject(new Error('Running local tools needs the panel\'s Node runtime.'));
    return new Promise(function (resolve, reject) {
      var env = Object.assign({}, node('process') ? node('process').env : {});
      // GUI apps on macOS start with a minimal PATH that misses Homebrew.
      env.PATH = (env.PATH || '') + (navigator.platform.indexOf('Win') === 0 ? '' : ':/opt/homebrew/bin:/usr/local/bin');
      cp.execFile(file, args, Object.assign({ env: env, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, opts || {}), function (err, stdout, stderr) {
        if (err) {
          var e = new Error(err.code === 'ENOENT' ? '"' + file + '" was not found.' : (String(stderr || err.message).trim().split('\n').slice(-3).join(' ')));
          e.notFound = err.code === 'ENOENT';
          reject(e);
        } else {
          resolve({ stdout: stdout, stderr: stderr });
        }
      });
    });
  }

  function tempFile(name) {
    var os = node('os');
    var path = node('path');
    return path.join(os.tmpdir(), 'simplify-' + Date.now().toString(36) + '-' + name);
  }

  SP.net = { node: node, request: request, sse: sse, multipart: multipart, exec: exec, tempFile: tempFile, hasNode: function () { return !!node('fs'); } };
}(window.SP = window.SP || {}));
