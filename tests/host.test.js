'use strict';
const assert = require('assert');
const { load, FakeProperty, PropertyValueType: T, KeyframeInterpolationType: I, KeyframeEase } = require('./aemock.js');

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const { S, ctx, undo } = load();

function prop1D(times, values) {
  const p = new FakeProperty('Slider', T.OneD, 1);
  times.forEach((t, i) => p.setValueAtTime(t, values[i]));
  return p;
}

module.exports = {
  'all host modules load and register their actions'() {
    assert.strictEqual(S.ready, true);
    for (const id of ['comps.precomposeEach', 'comps.unprecompose', 'comps.makeUnique', 'comps.duplicateDeep', 'layers.anchor',
      'layers.center', 'layers.fit', 'layers.sequence', 'keys.fitToLayer', 'presets.capture', 'presets.apply', 'presets.applyFfx',
      'ease.apply', 'ease.read', 'expr.apply', 'fx.list', 'fx.apply', 'captions.build', 'ai.run', 'core.undo']) {
      assert.strictEqual(typeof S.fn[id], 'function', 'missing ' + id);
    }
  },

  'version names increment, keep zero padding and never collide'() {
    const none = () => false;
    assert.strictEqual(S.nextVersionName('edit_v07', none), 'edit_v08');
    assert.strictEqual(S.nextVersionName('edit_v09', none), 'edit_v10');
    assert.strictEqual(S.nextVersionName('edit', none), 'edit_v02');
    assert.strictEqual(S.nextVersionName('cut 3', (n) => n === 'cut 4'), 'cut 5');
  },

  'JSON round-trips nested data and escapes non-ASCII'() {
    const data = { a: [1, 2.5, -3e-7, null, true], s: 'q"uo\\te\n  é 日本', o: { k: 'v' } };
    const text = S.json.stringify(data);
    assert.ok(/^[\x20-\x7e]*$/.test(text), 'output must be printable ASCII');
    assert.deepStrictEqual(JSON.parse(text), data);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(S.json.parse(JSON.stringify(data)))), data);
  },

  'JSON.parse refuses anything that is not data'() {
    assert.throws(() => S.json.parse('{"a": alert(1)}'));
    assert.throws(() => S.json.parse('app.quit()'));
  },

  'run() reports unknown actions without throwing'() {
    const res = JSON.parse(S.run('nope.nothing', '{}'));
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.user, false);
  },

  'run() marks expected conditions as user errors and closes the undo group'() {
    undo.length = 0;
    ctx.app.project.activeItem = null;
    const res = JSON.parse(S.run('comps.precomposeEach', '{}'));
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.user, true);
    assert.strictEqual(res.error, 'Open a composition first.');
    assert.deepStrictEqual(undo, ['Simplify: Precompose Each Layer', 'end']);
  },

  'run() never opens an undo group for read-only actions'() {
    undo.length = 0;
    const res = JSON.parse(S.run('core.info', '{}'));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(undo.length, 0);
  },

  'ai.run executes a script body and reports its failure as data'() {
    assert.strictEqual(JSON.parse(S.run('ai.run', JSON.stringify({ code: 'return 1 + 1;' }))).data.result, '2');
    const bad = JSON.parse(S.run('ai.run', JSON.stringify({ code: 'throw new Error("boom");' })));
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(bad.error, 'boom');
    assert.strictEqual(JSON.parse(S.run('ai.run', JSON.stringify({ code: 'var = ;' }))).user, true);
  },

  'snapTimes snaps to frames unless keys would collide'() {
    const fd = 1 / 30;
    const snapped = S.keys.snapTimes([0.01, 0.52, 1.0], fd);
    near(snapped[0], 0); near(snapped[1], 16 * fd); near(snapped[2], 1);
    const tight = [0.5, 0.505];
    assert.strictEqual(S.keys.snapTimes(tight, fd), tight);
  },

  'retime moves keys, keeps values and rescales ease speed'() {
    const p = prop1D([1, 2, 3], [0, 50, 100]);
    p.setTemporalEaseAtKey(2, [new KeyframeEase(40, 30)], [new KeyframeEase(40, 60)]);
    p.setInterpolationTypeAtKey(3, I.HOLD, I.HOLD);
    p.setSelectedAtKey(2, true);
    S.keys.retime(p, 1, 10, 2, 0);          // t' = 10 + (t - 1) * 2
    assert.deepStrictEqual(p.keys.map((k) => k.t), [10, 12, 14]);
    assert.deepStrictEqual(p.keys.map((k) => k.v), [0, 50, 100]);
    near(p.keyInTemporalEase(2)[0].speed, 20);         // twice as long -> half the speed
    near(p.keyOutTemporalEase(2)[0].influence, 60);
    assert.strictEqual(p.keyInInterpolationType(3), I.HOLD);
    assert.strictEqual(p.keyInInterpolationType(1), I.LINEAR);
    assert.strictEqual(p.keySelected(2), true);
  },

  'fitToLayer puts the first key on the in point and the last on the last frame'() {
    const fd = 1 / 25;
    const a = prop1D([0, 1, 4], [0, 1, 2]);
    const b = prop1D([2], [5]);
    const layer = { name: 'L', inPoint: 10, outPoint: 12 };
    const moved = S.keys.fitToLayer(layer, [a, b], fd);
    assert.strictEqual(moved, 4);
    near(a.keyTime(1), 10);
    near(a.keyTime(3), 12 - fd);
    near(a.keyTime(2), 10 + (2 - fd) / 4, fd / 2 + 1e-9);          // proportional, frame-snapped
    near(b.keyTime(1), 10 + (2 - fd) / 2, fd / 2 + 1e-9);
  },

  'fitToLayer works on reversed (negative stretch) layers and single keys'() {
    const p = prop1D([3], [1]);
    S.keys.fitToLayer({ name: 'L', inPoint: 8, outPoint: 5 }, [p], 1 / 30);
    near(p.keyTime(1), 5);
  },

  'ease.pair converts a bezier into speed and influence'() {
    const p = prop1D([0, 2], [0, 100]);                  // average speed 50 units/s
    S.ease.pair(p, 1, 2, [0.25, 0.1, 0.4, 1]);
    const out = p.keyOutTemporalEase(1)[0];
    const inn = p.keyInTemporalEase(2)[0];
    near(out.influence, 25); near(out.speed, 50 * 0.1 / 0.25);
    near(inn.influence, 60); near(inn.speed, 0);
    assert.strictEqual(p.keyOutInterpolationType(1), I.BEZIER);
    assert.strictEqual(p.keyInInterpolationType(1), I.LINEAR, 'outer side of the first key is left alone');
    assert.strictEqual(p.keyOutInterpolationType(2), I.LINEAR, 'outer side of the last key is left alone');
  },

  'ease.pair handles overshoot, decreasing values and extreme handles'() {
    const p = prop1D([0, 1], [100, 0]);                  // average speed -100
    S.ease.pair(p, 1, 2, [0, 0, 1, 1.5]);                // x1 = 0 and x2 = 1 must not divide by zero
    assert.ok(isFinite(p.keyOutTemporalEase(1)[0].speed));
    assert.ok(isFinite(p.keyInTemporalEase(2)[0].speed));
    near(p.keyOutTemporalEase(1)[0].influence, 0.1);
    near(p.keyInTemporalEase(2)[0].influence, 0.1);
    assert.ok(p.keyInTemporalEase(2)[0].speed > 0, 'overshoot on a falling value comes back upwards');
  },

  'ease.pair uses one speed per dimension and path length for spatial properties'() {
    const scale = new FakeProperty('Scale', T.ThreeD, 3);
    scale.setValueAtTime(0, [100, 100, 100]);
    scale.setValueAtTime(1, [200, 100, 50]);
    S.ease.pair(scale, 1, 2, [0.5, 0.5, 0.5, 0.5]);
    assert.deepStrictEqual(Array.from(scale.keyOutTemporalEase(1), (e) => Math.round(e.speed)), [100, 0, -50]);

    const pos = new FakeProperty('Position', T.TwoD_SPATIAL, 1);
    pos.setValueAtTime(0, [0, 0]);
    pos.setValueAtTime(2, [300, 400]);                   // 500 px in 2 s
    S.ease.pair(pos, 1, 2, [0.5, 0.5, 0.5, 0.5]);
    near(pos.keyOutTemporalEase(1)[0].speed, 250, 1e-3);
  },

  'ease.read is the inverse of ease.apply'() {
    const p = prop1D([0, 1.5], [10, 250]);
    p.keys.forEach((k) => { k.sel = true; });
    const comp = new ctx.CompItem();
    comp.selectedProperties = [p];
    ctx.app.project.activeItem = comp;
    const want = { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 };
    assert.strictEqual(JSON.parse(S.run('ease.apply', JSON.stringify(want))).data.pairs, 1);
    const got = JSON.parse(S.run('ease.read', '{}')).data;
    for (const k of Object.keys(want)) near(got[k], want[k], 1e-6);
    ctx.app.project.activeItem = null;
  },

  'ease.apply tells the user what to select when there is nothing to ease'() {
    const comp = new ctx.CompItem();
    comp.selectedProperties = [];
    ctx.app.project.activeItem = comp;
    const res = JSON.parse(S.run('ease.apply', '{"x1":0.2,"y1":0,"x2":0.2,"y2":1}'));
    assert.strictEqual(res.user, true);
    ctx.app.project.activeItem = null;
  }
};
