# Simplify

A workflow panel for Adobe After Effects (2023 / v23.0 and newer, macOS and Windows).
One dockable window with the tools editors otherwise collect from a dozen scripts: precomp
handling, keyframe-snapping presets, an ease curve editor, effect search, captions from speech,
one-click looks and a script-writing assistant.

No build step, no dependencies: the `extension` folder is the product.

> **Status: v0.1, not yet run inside After Effects.** The panel UI and all pure logic are
> tested (see [Testing](#testing)), but this code was written without access to After Effects.
> Expect some actions to need fixes on first contact with the real application. Test on a copy
> of a project first, and please report what breaks.

## Install

1. Download or clone this repository.
2. Run the installer for your system:
   - macOS: `./install/install-mac.sh`
   - Windows: double-click `install\install-win.bat`
3. Restart After Effects and open **Window > Extensions > Simplify**.

The installer copies `extension/` to your user CEP folder and sets Adobe's `PlayerDebugMode`
flag, which After Effects requires for unsigned panels. (A signed `.zxp` is a later step.)

## What it does

| Area | Tools |
| --- | --- |
| **Search** | Click the panel and type: effects, actions and expressions filter as you type. Enter applies, Shift+Enter puts an effect on a new adjustment layer. Recently used effects come first. |
| **Comps** | *Precompose each* (one precomp per selected layer, trimmed to the layer). *Un-precompose* (unpack a precomp back into its parent, keeping timing, parenting, track mattes and the precomp layer's transform). *Make unique* and *Independent duplicate* (deep copies, so editing the copy never changes the original; `comp("…")` expressions are re-pointed). *Trim comp to content*. |
| **Layers** | 9-point anchor grid that does not move the layer, centre in comp, fit / fill, sequence (stagger or chain), parent to new null, adjustment layer above the selection. |
| **Presets** | Save a layer's effect stack as a reusable preset. On apply the keyframes snap to each target layer: first key on the in point, last key on the last frame, everything between in proportion with its easing intact. Native `.ffx` presets (Twixtor setups etc.) get the same snapping. *Fit keyframes to layer* does it for keys that already exist. |
| **Ease** | Bezier curve editor that writes to the selected keyframes of any number of properties. Read a curve back from keyframes, save your own, overshoot supported. |
| **Expressions** | Twelve common expressions with their numbers as fields (wiggle, loop, bounce, auto fade, counter, …), plus your own saved ones. |
| **Captions** | Import SRT / VTT / transcript JSON, or transcribe the selected layer with word timestamps (online service or fully offline with whisper.cpp). Group, style, animate (pop, fade, slide, word by word), highlight the spoken word. One editable text layer per caption. |
| **Color** | Ten looks built from stock effects, applied on a trimmed adjustment layer with a strength control. |
| **Assistant** | Describe what you need; get a script or expression; review it; run it as one undo step. Uses the Claude API with your own key, or a local model server. |

Every action is a single undo step, and each result toast has an **Undo** button.

### Effect search on a keyboard shortcut

A panel only receives keys while it has focus, and the spacebar belongs to After Effects'
playback (only native plug-ins can intercept it). For a global hotkey:

1. Copy `scripts/Simplify FX Search.jsx` into After Effects' `Scripts` folder and restart.
2. **Edit > Keyboard Shortcuts**, search for "Simplify FX Search", assign a key.

### Speech to text

- **Online:** Settings > *Speech to text · online service*. Any OpenAI-compatible
  `/audio/transcriptions` endpoint. The audio of the layer you transcribe is uploaded there.
- **Offline:** install [whisper.cpp](https://github.com/ggerganov/whisper.cpp) and ffmpeg, then
  set the program and model paths in Settings. Nothing leaves the computer.

ffmpeg is optional for the online engine but recommended: with it, only the part of the file
the layer actually uses is extracted and uploaded.

### Assistant

Settings > *Assistant*: paste a Claude API key (requests are billed to your account) or point it
at a local OpenAI-compatible server such as Ollama. Scripts written by the model never run by
themselves; small local models write noticeably weaker scripts, so read before you run.

## Stability

After Effects crashes are the thing this panel is built to avoid:

- One guarded entry point on the After Effects side: every action is wrapped in `try/catch`
  and an undo group, and reports failures as data instead of throwing into the application.
- Calls are queued, never overlapping, and a second click while one runs is ignored.
- No timers, polling or background work touch After Effects; the panel is idle until you click.
- No native code, so the panel itself cannot take the application down with a memory fault.

That removes the panel as a crash source. It cannot fix crashes caused by After Effects itself,
drivers or other plug-ins.

## Known limits

- **Not in this version: face tracking and automatic rotoscoping.** Both need per-frame pixel
  access and a neural network, which a panel cannot do at usable speed; they belong in a native
  (C++) effect plug-in, which is a separate project with its own build and signing pipeline.
- Presets cannot store effect parameters with custom data (Curves graphs, gradients, paths).
  Use an `.ffx` for those; it is applied with the same keyframe snapping.
- Un-precompose does not carry over time remapping, stretch, effects or masks that sit on the
  precomp layer itself (it warns when they are present).
- Looks are a starting point built from stock effects, not a substitute for grading a shot.
- API keys are stored in plain text in the panel's local storage on your computer.

## Development

```
extension/
  CSXS/manifest.xml      CEP manifest (AE 23.0+)
  index.html, css/, js/  the panel (plain ES2019 scripts, Chromium 88 compatible)
  host/*.jsx             After Effects side (ExtendScript, ES3 only)
scripts/                 standalone ScriptUI scripts
install/                 installers
tests/                   dev-only checks
```

Open `extension/index.html` in a browser to work on the UI: a mock stands in for After Effects.
Inside After Effects, remote DevTools are at `http://localhost:8733` while the panel is open.
Use `./install/install-mac.sh --link` to run straight from the repository.

### Testing

```bash
cd tests && npm install && npm test
```

- ES3 syntax gate for every host file (ExtendScript rejects newer syntax at load time).
- ES2019 syntax gate for the panel.
- Unit tests for caption parsing and chunking.
- Host logic (keyframe retiming, bezier-to-ease conversion, JSON, error envelope) run against a
  small fake of the After Effects property model.

```bash
cd tests && node ui.check.js
```

Browser smoke test of the main interactions (needs Playwright).

None of this replaces testing in After Effects: the fake model checks the math, not Adobe's API.
