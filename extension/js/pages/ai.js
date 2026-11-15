/*
 * Simplify — Assistant: describe what you want, get an After Effects script or expression,
 * review it, then run it. Nothing the model writes runs until you press Run, and every run is
 * a single undo step with errors caught on the After Effects side.
 */
(function (SP) {
  'use strict';
  var ui = SP.ui;
  var h = ui.h;

  var IDEAS = [
    'Stagger the selected layers by 3 frames',
    'Rename the selected layers with a numbered prefix',
    'Add a typewriter reveal to the selected text layer',
    'Write an expression that makes scale react to the audio level'
  ];

  function copy(text) {
    var ta = h('textarea', { style: { position: 'fixed', left: '-9999px', top: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      ui.toast({ title: 'Copied' });
    } catch (e) {
      ui.toast({ kind: 'error', title: 'Could not copy' });
    }
    document.body.removeChild(ta);
  }

  // Minimal, safe markdown: fenced code blocks, paragraphs, `inline code` and **bold**.
  // Everything goes through textContent, so model output can never inject markup.
  function inline(text, into) {
    var re = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
    var last = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) into.appendChild(document.createTextNode(text.slice(last, m.index)));
      var tok = m[0];
      if (tok.charAt(0) === '`') into.appendChild(h('code', { text: tok.slice(1, -1) }));
      else into.appendChild(h('strong', { text: tok.slice(2, -2) }));
      last = m.index + tok.length;
    }
    if (last < text.length) into.appendChild(document.createTextNode(text.slice(last)));
  }

  function parse(text) {
    var parts = [];
    var lines = text.split('\n');
    var buf = [];
    var code = null;
    lines.forEach(function (line) {
      var fence = /^\s*```\s*([\w-]*)\s*$/.exec(line);
      if (fence && code === null) {
        if (buf.length) parts.push({ type: 'text', text: buf.join('\n') });
        buf = [];
        code = { type: 'code', lang: fence[1].toLowerCase(), lines: [], closed: false };
      } else if (fence && code !== null) {
        code.closed = true;
        parts.push(code);
        code = null;
      } else if (code !== null) {
        code.lines.push(line);
      } else {
        buf.push(line);
      }
    });
    if (code !== null) parts.push(code);
    if (buf.length) parts.push({ type: 'text', text: buf.join('\n') });
    return parts;
  }

  SP.pages.push({
    id: 'ai', title: 'Assistant', icon: 'ai',
    render: function (root) {
      var turns = [];              // { role, text, payload?, blocks? }
      var active = null;           // in-flight request
      var withContext = SP.settings.get('ai.context', true);

      var chat = h('div', { class: 'chat' });
      var banner = h('div', { class: 'banner', hidden: true });
      var ideas = h('div', { class: 'list' });
      var input = h('textarea', {
        rows: 1, placeholder: 'Ask for a script, an expression, or how to do something', 'aria-label': 'Message',
        oninput: grow,
        onkeydown: function (e) {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        }
      });
      var sendBtn = h('button', { class: 'btn primary small', title: 'Send (Enter)', 'aria-label': 'Send', onclick: function () { if (active) active.abort(); else submit(); } }, ui.icon('send'));

      function grow() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 140) + 'px';
      }

      function setBusy(on) {
        while (sendBtn.firstChild) sendBtn.removeChild(sendBtn.firstChild);
        sendBtn.appendChild(ui.icon(on ? 'stop' : 'send'));
        sendBtn.title = on ? 'Stop' : 'Send (Enter)';
        sendBtn.setAttribute('aria-label', on ? 'Stop' : 'Send');
      }

      function refreshBanner() {
        var s = SP.assistant.settings();
        var ok = SP.assistant.ready();
        banner.hidden = ok;
        if (ok) return;
        while (banner.firstChild) banner.removeChild(banner.firstChild);
        banner.appendChild(h('div', null,
          h('strong', { text: s.provider === 'claude' ? 'Add your Claude API key to start. ' : 'Choose a local model to start. ' }),
          'It is stored on this computer only. ',
          h('a', { href: '#', text: 'Open Settings', style: { color: 'var(--accent-hi)' }, onclick: function (e) { e.preventDefault(); SP.go('settings'); } })));
      }

      function runScript(code) {
        SP.bridge.call('ai.run', { code: code }).then(function (res) {
          var out = res.data && res.data.result;
          ui.toast({ kind: (res.warnings || []).length ? 'warn' : 'ok', title: 'Script ran', detail: out || (res.warnings || []).join(' '), action: { label: 'Undo', run: ui.undoLast } });
        }, function (err) {
          ui.toast({ kind: 'error', title: 'The script failed', detail: err.message, duration: 9000 });
          // Hand the error back so one more message fixes it.
          if (!input.value) {
            input.value = 'That script failed with: ' + err.message + '. Please fix it.';
            grow();
            input.focus();
          }
        });
      }

      function renderAssistant(el, text, done) {
        while (el.firstChild) el.removeChild(el.firstChild);
        parse(text).forEach(function (part) {
          if (part.type === 'text') {
            part.text.split(/\n{2,}/).forEach(function (para) {
              if (!para.trim()) return;
              var p = h('p', { style: { whiteSpace: 'pre-wrap' } });
              inline(para.replace(/^\n+|\n+$/g, ''), p);
              el.appendChild(p);
            });
            return;
          }
          var code = part.lines.join('\n');
          var isExpr = part.lang === 'expression' || part.lang === 'expr';
          var isScript = /^(jsx|js|javascript|extendscript)$/.test(part.lang);
          var bar = h('div', { class: 'codeblock-bar' }, h('span', { text: isExpr ? 'Expression' : isScript ? 'Script' : (part.lang || 'Code') }));
          bar.appendChild(h('button', { class: 'btn ghost small', onclick: function () { copy(code); } }, 'Copy'));
          // Run only appears once the block is complete, never on half-streamed code.
          if (done && part.closed && isScript) {
            bar.appendChild(h('button', { class: 'btn primary small', title: 'Runs as one undo step', onclick: function () { runScript(code); } }, ui.icon('play'), 'Run'));
          }
          if (done && part.closed && isExpr) {
            bar.appendChild(h('button', {
              class: 'btn primary small', title: 'Apply to the selected properties', onclick: function () {
                ui.run({ id: 'expr.apply', title: 'Expression', done: function (d) { return 'Expression added to ' + d.applied + (d.applied === 1 ? ' property' : ' properties'); } }, null, { code: code });
              }
            }, 'Apply'));
          }
          el.appendChild(h('div', { class: 'codeblock' }, h('pre', { text: code }), bar));
        });
      }

      function scrollDown() {
        var view = root.parentNode;
        if (view) view.scrollTop = view.scrollHeight;
      }

      function submit(preset) {
        var text = (preset || input.value).trim();
        if (!text || active) return;
        if (!SP.assistant.ready()) { refreshBanner(); SP.go('settings'); return; }
        input.value = '';
        grow();
        ideas.hidden = true;

        var turn = { role: 'user', text: text };
        chat.appendChild(h('div', { class: 'msg user', text: text }));
        var bubble = h('div', { class: 'msg assistant' }, h('span', { class: 'typing', 'aria-label': 'Thinking' }, h('i'), h('i'), h('i')));
        chat.appendChild(bubble);
        scrollDown();
        setBusy(true);

        var answer = '';
        var frame = 0;
        var paint = function () {
          frame = 0;
          renderAssistant(bubble, answer, false);
          scrollDown();
        };

        var context = withContext ? SP.bridge.call('ai.context', {}).then(function (r) { return r.data; }, function () { return null; }) : Promise.resolve(null);
        context.then(function (ctx) {
          if (ctx) turn.payload = '<comp>\n' + JSON.stringify(ctx) + '\n</comp>\n\n' + text;
          turns.push(turn);
          active = SP.assistant.send(turns, {
            text: function (delta) {
              answer += delta;
              if (!frame) frame = requestAnimationFrame(paint);
            }
          });
          return active.promise;
        }).then(function (res) {
          if (frame) cancelAnimationFrame(frame);
          if (res.stop === 'refusal') {
            // A declined turn is not kept in the history that is sent with later messages.
            turns.pop();
            renderAssistant(bubble, answer || res.note, true);
          } else {
            turns.push({ role: 'assistant', text: answer, blocks: res.blocks });
            renderAssistant(bubble, answer || '(empty answer)', true);
          }
          if (res.note && answer) bubble.appendChild(h('p', { class: 'muted', text: res.note }));
        }, function (err) {
          if (frame) cancelAnimationFrame(frame);
          if (turns[turns.length - 1] === turn) turns.pop();
          if (err.cancelled) {
            renderAssistant(bubble, answer || 'Stopped.', true);
          } else {
            renderAssistant(bubble, answer, true);
            bubble.appendChild(h('p', { text: err.message, style: { color: 'var(--err)' } }));
          }
        }).then(function () {
          active = null;
          setBusy(false);
          scrollDown();
        });
      }

      IDEAS.forEach(function (idea) {
        ideas.appendChild(h('div', { class: 'row' }, h('button', { class: 'row-main', onclick: function () { submit(idea); } }, h('div', { class: 'row-title', text: idea, style: { fontWeight: '480', whiteSpace: 'normal' } }))));
      });

      var clear = h('button', {
        class: 'btn ghost small', onclick: function () {
          if (active) active.abort();
          turns = [];
          while (chat.firstChild) chat.removeChild(chat.firstChild);
          ideas.hidden = false;
        }
      }, 'New chat');

      root.appendChild(ui.pageHead('Assistant', 'Describe it; review the script; run it. One undo step per run.'));
      root.appendChild(banner);
      root.appendChild(h('div', { class: 'mt' }, ideas));
      root.appendChild(chat);
      root.appendChild(h('div', { class: 'composer' },
        h('div', { class: 'composer-box' }, input, sendBtn),
        h('div', { class: 'field' },
          h('label', { text: 'Send comp and selection info' }),
          ui.toggle(withContext, function (v) { withContext = v; SP.settings.set('ai.context', v); }, 'Send comp and selection info'),
          clear)));
      refreshBanner();
      this._refresh = refreshBanner;
    },
    onShow: function () { if (this._refresh) this._refresh(); }
  });
}(window.SP = window.SP || {}));
