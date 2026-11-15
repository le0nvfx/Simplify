/*
 * Simplify — speech to text.
 * Two engines, both producing word-level timestamps:
 *   api    any OpenAI-compatible /audio/transcriptions endpoint (hosted or a local server).
 *          The audio of the selected layer is uploaded to the address set in Settings.
 *   local  a whisper.cpp binary on this machine; nothing leaves the computer.
 * ffmpeg (if installed) cuts out just the part of the file the layer uses and shrinks it to
 * speech-quality mono, which keeps uploads small and transcription fast.
 */
(function (SP) {
  'use strict';
  var MAX_UPLOAD = 25 * 1024 * 1024;

  function cfg() {
    return {
      baseUrl: SP.settings.get('stt.baseUrl', 'https://api.openai.com/v1').replace(/\/+$/, ''),
      key: SP.settings.get('stt.key', ''),
      model: SP.settings.get('stt.model', 'whisper-1'),
      language: SP.settings.get('stt.language', '').trim(),
      ffmpeg: SP.settings.get('tools.ffmpeg', '').trim() || 'ffmpeg',
      whisper: SP.settings.get('tools.whisper', '').trim(),
      whisperModel: SP.settings.get('tools.whisperModel', '').trim()
    };
  }

  function remove(file) {
    try {
      SP.net.node('fs').unlinkSync(file);
    } catch (e) { /* already gone */ }
  }

  // Cut [sourceStart, sourceStart + duration] out of the media file as compact audio.
  function extract(c, source, kind) {
    var out = SP.net.tempFile(kind === 'wav' ? 'audio.wav' : 'audio.mp3');
    var args = ['-y', '-loglevel', 'error', '-ss', String(source.sourceStart), '-t', String(source.duration), '-i', source.path, '-vn', '-ac', '1', '-ar', '16000'];
    args = args.concat(kind === 'wav' ? ['-c:a', 'pcm_s16le', out] : ['-b:a', '48k', out]);
    return SP.net.exec(c.ffmpeg, args).then(function () { return out; });
  }

  function viaApi(c, source, status) {
    var fs = SP.net.node('fs');
    var temp = null;
    var offset = source.sourceStart;
    status('Preparing audio…');
    return extract(c, source, 'mp3').then(function (file) {
      temp = file;
      return file;
    }, function (err) {
      if (!err.notFound) throw err;
      // No ffmpeg: fall back to uploading the original file when it is small enough.
      if (fs.statSync(source.path).size > MAX_UPLOAD) {
        throw new Error('This file is larger than 25 MB. Install ffmpeg (or set its path in Settings) so only the audio is uploaded.');
      }
      offset = 0;
      return source.path;
    }).then(function (file) {
      if (fs.statSync(file).size > MAX_UPLOAD) throw new Error('The audio is longer than the service accepts in one request (25 MB). Trim the layer or split it.');
      status('Transcribing…');
      var fields = { model: c.model, response_format: 'verbose_json', 'timestamp_granularities[]': 'word' };
      if (c.language) fields.language = c.language;
      var mp = SP.net.multipart(fields, { field: 'file', name: file.replace(/^.*[\\/]/, ''), type: 'application/octet-stream', data: fs.readFileSync(file) });
      if (c.key) mp.headers.Authorization = 'Bearer ' + c.key;
      return SP.net.request({ url: c.baseUrl + '/audio/transcriptions', headers: mp.headers, body: mp.body }).promise;
    }).then(function (res) {
      if (temp) remove(temp);
      var data = null;
      try {
        data = JSON.parse(res.body);
      } catch (e) { /* handled below */ }
      if (res.status < 200 || res.status >= 300) {
        var msg = data && data.error && (data.error.message || data.error);
        if (res.status === 401) msg = 'The speech-to-text API key was rejected. Check it in Settings.';
        throw new Error(msg || 'The transcription service answered with status ' + res.status + '.');
      }
      if (!data) throw new Error('The transcription service sent an unreadable answer.');
      return { data: data, offset: offset };
    }, function (err) {
      if (temp) remove(temp);
      throw err;
    });
  }

  function viaLocal(c, source, status) {
    var fs = SP.net.node('fs');
    if (!c.whisper || !c.whisperModel) return Promise.reject(new Error('Set the whisper.cpp program and model file in Settings first.'));
    var wav = null;
    var base = SP.net.tempFile('transcript');
    status('Preparing audio…');
    return extract(c, source, 'wav').then(function (file) {
      wav = file;
      status('Transcribing on this computer…');
      // --max-len 1 with --split-on-word yields one segment per word, i.e. word timestamps.
      var args = ['-m', c.whisperModel, '-f', wav, '-oj', '-of', base, '-ml', '1', '-sow', '-l', c.language || 'auto'];
      return SP.net.exec(c.whisper, args, { timeout: 3600000 });
    }, function (err) {
      throw err.notFound ? new Error('Local transcription needs ffmpeg. Install it or set its path in Settings.') : err;
    }).then(function () {
      var text = fs.readFileSync(base + '.json', 'utf8');
      remove(wav);
      remove(base + '.json');
      return { data: JSON.parse(text), offset: source.sourceStart };
    }, function (err) {
      if (wav) remove(wav);
      throw err;
    });
  }

  // Resolves with { words, cues } in composition time.
  function transcribe(source, engine, status) {
    if (!SP.net.hasNode()) return Promise.reject(new Error('Transcription only works inside After Effects.'));
    var c = cfg();
    var run = engine === 'local' ? viaLocal(c, source, status) : viaApi(c, source, status);
    return run.then(function (r) {
      var parsed = SP.captions.parseTranscriptJSON(r.data);
      var lo = source.sourceStart - 0.05;
      var hi = source.sourceStart + source.duration + 0.05;
      var k = source.stretch / 100;
      var map = function (list) {
        return list.map(function (x) {
          return Object.assign({}, x, { start: x.start + r.offset, end: x.end + r.offset });
        }).filter(function (x) {
          return x.start >= lo && x.start <= hi;
        }).map(function (x) {
          return Object.assign({}, x, { start: source.compStart + (x.start - source.sourceStart) * k, end: source.compStart + (x.end - source.sourceStart) * k });
        });
      };
      return { words: map(parsed.words), cues: map(parsed.cues) };
    });
  }

  SP.stt = { transcribe: transcribe };
}(window.SP = window.SP || {}));
