/* Simplify — Settings. */
(function (SP) {
  'use strict';
  var ui = SP.ui;
  var h = ui.h;

  function text(key, fallback, opts) {
    return ui.textInput(SP.settings.get(key, fallback), function (v) { SP.settings.set(key, v); }, opts);
  }

  SP.pages.push({
    id: 'settings', title: 'Settings', icon: 'settings',
    render: function (root) {
      root.appendChild(ui.pageHead('Settings'));

      // ---- interface ----
      root.appendChild(ui.section('Interface', h('div', { class: 'card' },
        ui.stackField('Size', ui.segmented([{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }],
          SP.settings.get('ui.scale', 'm'), function (v) { SP.settings.set('ui.scale', v); SP.applyPreferences(); window.dispatchEvent(new Event('resize')); })),
        ui.field('Animations', ui.toggle(SP.settings.get('ui.motion', true), function (v) { SP.settings.set('ui.motion', v); SP.applyPreferences(); }, 'Animations'),
          'Your system\'s "reduce motion" setting is always respected.'))));

      // ---- assistant ----
      var provider = SP.settings.get('ai.provider', 'claude');
      var claudePane = h('div', { class: 'card' },
        ui.stackField('API key', text('ai.key', '', { type: 'password', placeholder: 'sk-ant-…' }), 'Create one at console.anthropic.com. Requests are billed to your account.'),
        ui.stackField('Model', ui.select(SP.assistant.MODELS, SP.settings.get('ai.model', 'claude-opus-5-5'), function (v) { SP.settings.set('ai.model', v); }, 'grow')),
        ui.stackField('Thinking effort', ui.segmented([{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }],
          SP.settings.get('ai.effort', 'medium'), function (v) { SP.settings.set('ai.effort', v); }), 'Higher is more careful and slower.'));
      var localPane = h('div', { class: 'card' },
        ui.stackField('Server address', text('ai.localUrl', 'http://localhost:11434/v1'), 'Any OpenAI-compatible server on this machine, for example Ollama or LM Studio.'),
        ui.stackField('Model name', text('ai.localModel', '', { placeholder: 'e.g. qwen2.5-coder:7b' }), 'Small local models write noticeably weaker scripts. Always read them before running.'));
      var showProvider = function () { claudePane.hidden = provider !== 'claude'; localPane.hidden = provider !== 'local'; };
      root.appendChild(ui.section('Assistant',
        ui.segmented([{ value: 'claude', label: 'Claude' }, { value: 'local', label: 'Local model' }], provider, function (v) { provider = v; SP.settings.set('ai.provider', v); showProvider(); }),
        h('div', { class: 'mt' }, claudePane, localPane)));
      showProvider();

      // ---- speech to text ----
      root.appendChild(ui.section('Speech to text · online service', h('div', { class: 'card' },
        ui.stackField('Endpoint', text('stt.baseUrl', 'https://api.openai.com/v1'), 'Any OpenAI-compatible transcription API. The audio of the layer you transcribe is uploaded to this address.'),
        ui.stackField('API key', text('stt.key', '', { type: 'password' })),
        h('div', { class: 'grid-2' },
          ui.stackField('Model', text('stt.model', 'whisper-1')),
          ui.stackField('Language', text('stt.language', '', { placeholder: 'auto' }))))));

      root.appendChild(ui.section('Speech to text · this computer', h('div', { class: 'card' },
        ui.stackField('ffmpeg', text('tools.ffmpeg', '', { placeholder: 'ffmpeg (found automatically if installed)' })),
        ui.stackField('whisper.cpp program', text('tools.whisper', '', { placeholder: 'Path to whisper-cli' })),
        ui.stackField('whisper.cpp model', text('tools.whisperModel', '', { placeholder: 'Path to a ggml model file' }), 'With these set, transcription runs fully offline.'))));

      // ---- about ----
      var about = h('div', { class: 'card' });
      var folder = SP.presetFiles.folder();
      about.appendChild(h('div', { class: 'field' }, h('span', { class: 'label', text: 'Simplify' }), h('span', { class: 'tag', text: 'v0.1.0' })));
      var aeRow = h('div', { class: 'field' }, h('span', { class: 'label', text: 'After Effects' }), h('span', { class: 'tag', text: SP.host ? SP.host.ae : (SP.bridge.live ? '…' : 'not connected') }));
      about.appendChild(aeRow);
      if (folder) about.appendChild(ui.stackField('Presets are stored in', h('p', { class: 'hint', text: folder })));
      about.appendChild(h('p', { class: 'hint', text: 'API keys and settings are saved in plain text in this panel\'s local storage on this computer. They are sent only to the service they belong to.' }));
      root.appendChild(ui.section('About', about));
    }
  });
}(window.SP = window.SP || {}));
