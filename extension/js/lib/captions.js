/*
 * Simplify — caption parsing and chunking. Pure functions, no DOM, shared by the panel and the
 * Node tests.
 *
 * Internal shape:  word = { start, end, text }      cue = { start, end, text, words: [word] }
 * Times are seconds.
 */
(function (factory) {
  // Check for a browser window first: After Effects panels run with Node enabled, so `module`
  // exists there too, and exporting to it would leave the panel without SP.captions.
  if (typeof window !== 'undefined' && window.document) (window.SP = window.SP || {}).captions = factory();
  else module.exports = factory();
}(function () {
  'use strict';

  // "00:01:02,500" | "01:02.5" | "62.5" -> seconds
  function parseTime(str) {
    var s = String(str).trim().replace(',', '.');
    var parts = s.split(':');
    var sec = 0;
    for (var i = 0; i < parts.length; i++) sec = sec * 60 + parseFloat(parts[i]);
    return isNaN(sec) ? null : sec;
  }

  function stripTags(text) {
    return text.replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
  }

  // SubRip and WebVTT share the "start --> end" cue line, so one parser reads both.
  function parseSubtitles(text) {
    var blocks = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
    var cues = [];
    blocks.forEach(function (block) {
      var lines = block.split('\n').filter(function (l) { return l.trim() !== ''; });
      var at = -1;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('-->') !== -1) { at = i; break; }
      }
      if (at === -1) return;
      var m = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(lines[at]);
      if (!m) return;
      var start = parseTime(m[1]);
      var end = parseTime(m[2]);
      var body = stripTags(lines.slice(at + 1).join(' ')).replace(/\s+/g, ' ').trim();
      if (start === null || end === null || end <= start || !body) return;
      cues.push({ start: start, end: end, text: body, words: [] });
    });
    return cues;
  }

  function word(start, end, text) {
    return { start: start, end: end, text: String(text).trim() };
  }

  // Accepts the JSON shapes produced by the common speech-to-text tools:
  //  - OpenAI-compatible verbose_json: { words: [{ word, start, end }], segments: [...] }
  //  - whisper.cpp -oj / -ojf:         { transcription: [{ offsets: { from, to }, text }] }
  //  - a plain array of { start, end, text }
  function parseTranscriptJSON(data) {
    var words = [];
    var cues = [];
    if (Array.isArray(data)) {
      data.forEach(function (c) {
        if (c && c.text && typeof c.start === 'number' && typeof c.end === 'number') {
          cues.push({ start: c.start, end: c.end, text: String(c.text).trim(), words: [] });
        }
      });
      return { words: [], cues: cues };
    }
    if (data && Array.isArray(data.words) && data.words.length) {
      data.words.forEach(function (w) {
        var t = w.word !== undefined ? w.word : w.text;
        if (t && String(t).trim()) words.push(word(w.start, w.end, t));
      });
    } else if (data && Array.isArray(data.segments)) {
      data.segments.forEach(function (seg) {
        if (Array.isArray(seg.words) && seg.words.length) {
          seg.words.forEach(function (w) {
            var t = w.word !== undefined ? w.word : w.text;
            if (t && String(t).trim()) words.push(word(w.start, w.end, t));
          });
        } else if (seg.text && String(seg.text).trim()) {
          cues.push({ start: seg.start, end: seg.end, text: String(seg.text).trim(), words: [] });
        }
      });
    } else if (data && Array.isArray(data.transcription)) {
      // whisper.cpp emits sub-word tokens when run with --max-len 1: a token that does not
      // start with a space continues the previous word.
      data.transcription.forEach(function (seg) {
        var raw = String(seg.text || '');
        var t = raw.trim();
        if (!t || /^\[.*\]$/.test(t)) return;
        var from = seg.offsets.from / 1000;
        var to = seg.offsets.to / 1000;
        var last = words[words.length - 1];
        if (last && raw.charAt(0) !== ' ' && words.length) {
          last.text += t;
          last.end = to;
        } else {
          words.push(word(from, to, t));
        }
      });
    }
    return { words: words, cues: cues };
  }

  // Break one line into two balanced lines when it is too long.
  function wrap(text, maxChars) {
    if (!maxChars || text.length <= maxChars) return text;
    var tokens = text.split(' ');
    if (tokens.length < 2) return text;
    var best = 1;
    var bestDiff = Infinity;
    for (var i = 1; i < tokens.length; i++) {
      var diff = Math.abs(tokens.slice(0, i).join(' ').length - tokens.slice(i).join(' ').length);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return tokens.slice(0, best).join(' ') + '\n' + tokens.slice(best).join(' ');
  }

  function applyCase(text, mode) {
    if (mode === 'upper') return text.toUpperCase();
    if (mode === 'lower') return text.toLowerCase();
    return text;
  }

  function clean(text, opts) {
    var t = text;
    if (opts.stripPunctuation) t = t.replace(/[.,!?;:…]+$/g, '').replace(/^[¿¡]+/g, '');
    return applyCase(t, opts.textCase);
  }

  // Words -> captions. A caption ends when it is full (maxWords / maxChars), at the end of a
  // sentence, or when the speaker pauses.
  function chunkWords(words, o) {
    var opts = Object.assign({ maxWords: 4, maxChars: 28, lineChars: 18, pause: 0.6, minDuration: 0.25, hold: 0.25 }, o || {});
    var cues = [];
    var cur = [];
    var chars = 0;

    function flush() {
      if (!cur.length) return;
      var shown = cur.map(function (w) { return clean(w.text, opts); }).filter(function (t) { return t !== ''; });
      if (shown.length) {
        var kept = cur.filter(function (w) { return clean(w.text, opts) !== ''; });
        cues.push({
          start: kept[0].start,
          end: kept[kept.length - 1].end,
          text: wrap(shown.join(' '), opts.lineChars),
          words: kept.map(function (w, i) { return { start: w.start, end: w.end, text: shown[i] }; })
        });
      }
      cur = [];
      chars = 0;
    }

    words.forEach(function (w) {
      var len = w.text.length + (cur.length ? 1 : 0);
      var prev = cur[cur.length - 1];
      if (cur.length && (cur.length >= opts.maxWords || chars + len > opts.maxChars || w.start - prev.end > opts.pause)) flush();
      cur.push(w);
      chars += w.text.length + (cur.length > 1 ? 1 : 0);
      if (/[.!?…]["')\]]?$/.test(w.text)) flush();
    });
    flush();
    return tidy(cues, opts);
  }

  // Close small gaps so captions do not flicker, and keep each one on screen long enough.
  function tidy(cues, opts) {
    for (var i = 0; i < cues.length; i++) {
      var c = cues[i];
      var next = cues[i + 1];
      var limit = next ? next.start : Infinity;
      if (next && next.start - c.end < opts.hold * 2) c.end = next.start;
      else c.end = Math.min(limit, c.end + opts.hold);
      if (c.end - c.start < opts.minDuration) c.end = Math.min(limit, c.start + opts.minDuration);
    }
    return cues;
  }

  // Subtitle cues have no word timing: estimate it from word length, then chunk as usual.
  function cuesToWords(cues) {
    var words = [];
    cues.forEach(function (c) {
      var tokens = c.text.split(/\s+/).filter(Boolean);
      var total = tokens.reduce(function (n, t) { return n + t.length + 1; }, 0);
      var t = c.start;
      tokens.forEach(function (tok) {
        var d = (c.end - c.start) * (tok.length + 1) / total;
        words.push(word(t, t + d, tok));
        t += d;
      });
    });
    return words;
  }

  // Read any supported file content and return captions.
  // opts.keepCues: use subtitle cues as they are instead of re-chunking them.
  function fromText(text, opts) {
    var o = opts || {};
    var trimmed = String(text).trim();
    var parsed = { words: [], cues: [] };
    if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
      parsed = parseTranscriptJSON(JSON.parse(trimmed));
    } else {
      parsed.cues = parseSubtitles(trimmed);
    }
    return build(parsed, o);
  }

  function build(parsed, o) {
    var opts = o || {};
    var offset = Number(opts.timeOffset) || 0;
    var scale = Number(opts.timeScale) || 1;
    var shift = function (list) {
      return list.map(function (x) { return Object.assign({}, x, { start: x.start * scale + offset, end: x.end * scale + offset }); });
    };
    if (parsed.words.length) return chunkWords(shift(parsed.words), opts);
    if (opts.keepCues) {
      return shift(parsed.cues).map(function (c) {
        return { start: c.start, end: c.end, text: wrap(clean(c.text, opts), opts.lineChars), words: [] };
      });
    }
    return chunkWords(cuesToWords(shift(parsed.cues)), opts);
  }

  return {
    parseTime: parseTime,
    parseSubtitles: parseSubtitles,
    parseTranscriptJSON: parseTranscriptJSON,
    chunkWords: chunkWords,
    cuesToWords: cuesToWords,
    wrap: wrap,
    fromText: fromText,
    build: build
  };
}));
