/*
 * Simplify — Captions: from subtitles or speech to styled, animated text layers.
 * Flow: 1. get timed words (import a file or transcribe the selected layer)
 *       2. choose how they are grouped, styled and animated
 *       3. build — one editable text layer per caption.
 */
(function (SP) {
  'use strict';
  var ui = SP.ui;
  var h = ui.h;

  var DEFAULTS = {
    maxWords: 4, maxChars: 28, lineChars: 18, textCase: 'upper', stripPunctuation: true,
    font: '', size: 72, fill: '#ffffff', stroke: '#000000', strokeWidth: 6, y: 82,
    anim: 'pop', highlight: true, highlightColor: '#ffd60a', fadeOut: false
  };

  function load() { return Object.assign({}, DEFAULTS, SP.settings.get('captions.style', {})); }

  function fmt(seconds) {
    var s = Math.max(0, Math.round(seconds));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  SP.pages.push({
    id: 'captions', title: 'Captions', icon: 'captions',
    render: function (root) {
      var st = load();
      var parsed = null;          // { words, cues } — comp time for transcripts, file time for imports
      var offset = 0;
      var sourceMode = SP.settings.get('captions.source', 'file');
      var engine = SP.settings.get('captions.engine', 'api');
      var working = false;

      var save = function () { SP.settings.set('captions.style', st); drawPreview(); };
      var bind = function (key) { return function (v) { st[key] = v; save(); }; };

      // ---- 1. source ----
      var status = h('p', { class: 'hint', text: 'Nothing loaded yet.' });

      function setParsed(p, label) {
        parsed = p;
        var count = p.words.length || p.cues.length;
        var items = p.words.length ? p.words : p.cues;
        var span = count ? items[items.length - 1].end - items[0].start : 0;
        status.textContent = count ? label + ': ' + count + (p.words.length ? ' words' : ' subtitle lines') + ' over ' + fmt(span) + '.' : 'No speech or subtitles were found.';
        buildBtn.disabled = !count;
      }

      var fileInput = h('input', {
        type: 'file', accept: '.srt,.vtt,.json,.txt', style: { display: 'none' }, onchange: function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            try {
              var text = String(reader.result).trim();
              var p = (text.charAt(0) === '{' || text.charAt(0) === '[') ? SP.captions.parseTranscriptJSON(JSON.parse(text)) : { words: [], cues: SP.captions.parseSubtitles(text) };
              setParsed(p, file.name);
            } catch (e) {
              ui.toast({ kind: 'error', title: 'Could not read ' + file.name, detail: 'Expected an SRT, VTT or transcript JSON file.' });
            }
            fileInput.value = '';
          };
          reader.readAsText(file);
        }
      });

      var transcribeBtn = h('button', {
        class: 'btn block', onclick: function () {
          if (working) return;
          ui.run({ id: 'captions.source', title: 'Transcribe', silent: true, undo: false }, null).then(function (source) {
            if (!source) return;
            if (source.remapped) ui.toast({ kind: 'warn', title: 'This layer is time-remapped', detail: 'Caption timing follows the original footage speed.' });
            working = true;
            transcribeBtn.disabled = true;
            var setStatus = function (t) { status.textContent = t; };
            SP.stt.transcribe(source, engine, setStatus).then(function (p) {
              setParsed(p, source.name);
              offset = 0;
              offsetInput.value = '0';
            }, function (err) {
              status.textContent = 'Transcription failed.';
              ui.toast({ kind: 'error', title: 'Transcription failed', detail: err.message, duration: 10000 });
            }).then(function () {
              working = false;
              transcribeBtn.disabled = false;
            });
          });
        }
      }, ui.icon('mic'), 'Transcribe selected layer');

      var offsetInput = ui.numberInput(0, function (v) { offset = v; }, { step: 0.1 });
      var filePane = h('div', { class: 'card' },
        h('button', { class: 'btn block', onclick: function () { fileInput.click(); } }, ui.icon('file'), 'Import SRT, VTT or transcript JSON'),
        fileInput);
      var sttPane = h('div', { class: 'card' },
        ui.stackField('Engine', ui.segmented([
          { value: 'api', label: 'Online service', title: 'Uploads the layer\'s audio to the endpoint set in Settings' },
          { value: 'local', label: 'This computer', title: 'whisper.cpp, nothing is uploaded' }
        ], engine, function (v) { engine = v; SP.settings.set('captions.engine', v); })),
        transcribeBtn,
        h('p', { class: 'hint' }, 'Endpoint, key and local model are set in ', h('a', { href: '#', text: 'Settings', style: { color: 'var(--accent-hi)' }, onclick: function (e) { e.preventDefault(); SP.go('settings'); } }), '.'));

      function showSource() {
        filePane.hidden = sourceMode !== 'file';
        sttPane.hidden = sourceMode !== 'stt';
      }

      // ---- 3. build ----
      var buildBtn = h('button', {
        class: 'btn primary block', disabled: true, onclick: function () {
          if (!parsed) return;
          var cues = SP.captions.build(parsed, {
            maxWords: st.maxWords, maxChars: st.maxChars, lineChars: st.lineChars, textCase: st.textCase,
            stripPunctuation: st.stripPunctuation, timeOffset: offset
          });
          ui.run({
            id: 'captions.build', title: 'Build captions',
            done: function (d) { return d.count + (d.count === 1 ? ' caption' : ' captions') + ' built'; }
          }, null, {
            cues: cues,
            style: {
              font: st.font.trim(), size: st.size, fill: ui.hexToRgb(st.fill), stroke: ui.hexToRgb(st.stroke), strokeWidth: st.strokeWidth,
              x: 0.5, y: st.y / 100, anim: st.anim, highlight: st.highlight, highlightColor: ui.hexToRgb(st.highlightColor), fadeOut: st.fadeOut
            }
          });
        }
      }, ui.icon('captions'), 'Build captions');

      // ---- preview ----
      var sample = h('span');
      var preview = h('div', { class: 'cap-preview', 'aria-hidden': 'true' }, sample);

      function drawPreview() {
        var words = ['This', 'is', 'your', 'caption'];
        while (sample.firstChild) sample.removeChild(sample.firstChild);
        words.forEach(function (w, i) {
          var t = st.textCase === 'upper' ? w.toUpperCase() : st.textCase === 'lower' ? w.toLowerCase() : w;
          sample.appendChild(h('span', { text: t + (i < words.length - 1 ? ' ' : ''), style: { position: 'static', padding: '0', color: st.highlight && i === 2 ? st.highlightColor : st.fill } }));
        });
        var px = Math.max(10, Math.min(30, st.size / 4));
        sample.style.fontSize = px + 'px';
        sample.style.fontFamily = (st.font ? '"' + st.font.replace(/"/g, '') + '", ' : '') + 'var(--font)';
        sample.style.top = st.y + '%';
        sample.style.webkitTextStroke = st.strokeWidth > 0 ? Math.min(2, st.strokeWidth / 5) + 'px ' + st.stroke : '0';
        sample.style.paintOrder = 'stroke fill';
      }

      // ---- 2. controls ----
      var fontInput = ui.textInput(st.font, bind('font'), { placeholder: 'PostScript name, e.g. Montserrat-ExtraBold' });
      var sizeInput = ui.numberInput(st.size, bind('size'), { min: 6, max: 600 });
      var fillInput = h('input', { type: 'color', value: st.fill, 'aria-label': 'Text colour', oninput: function () { st.fill = fillInput.value; save(); } });
      var strokeInput = h('input', { type: 'color', value: st.stroke, 'aria-label': 'Outline colour', oninput: function () { st.stroke = strokeInput.value; save(); } });
      var strokeWidthInput = ui.numberInput(st.strokeWidth, bind('strokeWidth'), { min: 0, max: 100 });
      var ySlider = h('input', { type: 'range', min: '5', max: '95', value: String(st.y), 'aria-label': 'Vertical position', oninput: function () { st.y = Number(ySlider.value); save(); } });
      var hiInput = h('input', { type: 'color', value: st.highlightColor, 'aria-label': 'Highlight colour', oninput: function () { st.highlightColor = hiInput.value; save(); } });

      var pick = h('button', {
        class: 'btn block', title: 'Copy font, size, colours and position from the selected text layer', onclick: function () {
          ui.run({ id: 'captions.readStyle', title: 'Read text style', silent: true, undo: false }, null).then(function (d) {
            if (!d) return;
            if (d.font) { st.font = d.font; fontInput.value = d.font; }
            if (d.size) { st.size = Math.round(d.size); sizeInput.value = String(st.size); }
            if (d.fill) { st.fill = ui.rgbToHex(d.fill); fillInput.value = st.fill; }
            st.strokeWidth = Math.round(d.strokeWidth || 0);
            strokeWidthInput.value = String(st.strokeWidth);
            if (d.stroke) { st.stroke = ui.rgbToHex(d.stroke); strokeInput.value = st.stroke; }
            if (typeof d.y === 'number') { st.y = Math.round(Math.max(5, Math.min(95, d.y * 100))); ySlider.value = String(st.y); }
            save();
            ui.toast({ title: 'Style copied from the selected text layer' });
          });
        }
      }, ui.icon('read'), 'Use the selected text layer\'s style');

      var restyle = h('button', {
        class: 'btn block', title: 'Restyle one caption by hand, select it, then push its look onto all others', onclick: function () {
          ui.run({ id: 'captions.restyle', title: 'Restyle captions', done: function (d) { return d.count + ' captions restyled'; } }, null);
        }
      }, ui.icon('wand'), 'Match all captions to the selected one');

      root.appendChild(ui.pageHead('Captions', 'Subtitles or speech in, animated text layers out.'));

      root.appendChild(ui.section('1 · Words',
        ui.segmented([{ value: 'file', label: 'Import file' }, { value: 'stt', label: 'Speech to text' }], sourceMode, function (v) { sourceMode = v; SP.settings.set('captions.source', v); showSource(); }),
        h('div', { class: 'mt' }, filePane, sttPane), status,
        h('div', { class: 'mt' }, ui.field('Shift all captions by (seconds)', offsetInput))));

      root.appendChild(ui.section('2 · Grouping', h('div', { class: 'card' },
        ui.field('Words per caption', ui.numberInput(st.maxWords, bind('maxWords'), { min: 1, max: 30 })),
        ui.field('Characters per caption', ui.numberInput(st.maxChars, bind('maxChars'), { min: 4, max: 200 })),
        ui.field('Break into two lines after', ui.numberInput(st.lineChars, bind('lineChars'), { min: 4, max: 200 })),
        ui.stackField('Letter case', ui.segmented([{ value: 'upper', label: 'UPPER' }, { value: 'asis', label: 'As spoken' }, { value: 'lower', label: 'lower' }], st.textCase, bind('textCase'))),
        ui.field('Remove end punctuation', ui.toggle(st.stripPunctuation, bind('stripPunctuation'), 'Remove end punctuation')))));

      root.appendChild(ui.section('3 · Look', preview, h('div', { class: 'card mt' },
        ui.stackField('Font', fontInput),
        ui.field('Size', sizeInput),
        h('div', { class: 'field' }, h('label', { text: 'Text and outline colour' }), fillInput, strokeInput),
        ui.field('Outline width', strokeWidthInput),
        h('div', { class: 'field' }, h('label', { text: 'Vertical position' }), ySlider),
        pick)));

      root.appendChild(ui.section('4 · Motion', h('div', { class: 'card' },
        ui.field('Entrance', ui.select([
          { value: 'pop', label: 'Pop' }, { value: 'fade', label: 'Fade' }, { value: 'slide', label: 'Slide up' },
          { value: 'words', label: 'Word by word' }, { value: 'none', label: 'None' }
        ], st.anim, bind('anim'))),
        h('div', { class: 'field' }, h('label', { text: 'Highlight the spoken word' }), hiInput, ui.toggle(st.highlight, bind('highlight'), 'Highlight the spoken word')),
        ui.field('Fade out at the end', ui.toggle(st.fadeOut, bind('fadeOut'), 'Fade out at the end')))));

      root.appendChild(h('div', { class: 'section' }, buildBtn, h('div', { class: 'mt' }, restyle)));
      root.appendChild(ui.section('Start over', ui.tiles(['captions.clear'])));

      showSource();
      drawPreview();
    }
  });
}(window.SP = window.SP || {}));
