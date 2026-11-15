/*
 * A small stand-in for the parts of the After Effects scripting DOM that Simplify's math
 * depends on. It lets the host files (real ES3 source) run under Node so keyframe retiming,
 * easing and the call envelope can be tested without After Effects.
 * It is NOT a full emulation: it cannot prove an action works in After Effects.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
const PropertyType = { PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3 };
const PropertyValueType = {
  NO_VALUE: 0, ThreeD_SPATIAL: 1, ThreeD: 2, TwoD_SPATIAL: 3, TwoD: 4, OneD: 5, COLOR: 6,
  CUSTOM_VALUE: 7, MARKER: 8, LAYER_INDEX: 9, MASK_INDEX: 10, SHAPE: 11, TEXT_DOCUMENT: 12
};

function KeyframeEase(speed, influence) {
  if (influence < 0.1 || influence > 100) throw new Error('influence out of range: ' + influence);
  this.speed = speed;
  this.influence = influence;
}

class FakeProperty {
  constructor(name, type, dims) {
    this.name = name;
    this.matchName = name;
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = type;
    this.dims = dims;                 // number of ease dimensions
    this.isSpatial = type === PropertyValueType.TwoD_SPATIAL || type === PropertyValueType.ThreeD_SPATIAL;
    this.keys = [];
    this.expression = '';
    this.expressionEnabled = false;
  }
  get numKeys() { return this.keys.length; }
  get selectedKeys() { return this.keys.map((k, i) => (k.sel ? i + 1 : 0)).filter(Boolean); }
  _k(i) { if (!this.keys[i - 1]) throw new Error('no key ' + i); return this.keys[i - 1]; }
  _ease() { return Array.from({ length: this.dims }, () => new KeyframeEase(0, 16.666666667)); }
  keyTime(i) { return this._k(i).t; }
  keyValue(i) { return this._k(i).v; }
  keyInInterpolationType(i) { return this._k(i).ii; }
  keyOutInterpolationType(i) { return this._k(i).oi; }
  keyInTemporalEase(i) { return this._k(i).ie; }
  keyOutTemporalEase(i) { return this._k(i).oe; }
  keyTemporalContinuous(i) { return this._k(i).tc; }
  keyTemporalAutoBezier(i) { return this._k(i).tab; }
  keySelected(i) { return this._k(i).sel; }
  keyInSpatialTangent(i) { return this._k(i).ist; }
  keyOutSpatialTangent(i) { return this._k(i).ost; }
  keySpatialContinuous(i) { return this._k(i).sc; }
  keySpatialAutoBezier(i) { return this._k(i).sab; }
  keyRoving(i) { return this._k(i).rov; }
  removeKey(i) { this._k(i); this.keys.splice(i - 1, 1); }
  setValueAtTime(t, v) {
    const hit = this.keys.find((k) => Math.abs(k.t - t) < 1e-9);
    if (hit) { hit.v = v; return; }
    this.keys.push({
      t, v, ii: KeyframeInterpolationType.LINEAR, oi: KeyframeInterpolationType.LINEAR, ie: this._ease(), oe: this._ease(),
      tc: false, tab: false, sel: false, ist: [0, 0, 0], ost: [0, 0, 0], sc: false, sab: false, rov: false
    });
    this.keys.sort((a, b) => a.t - b.t);
  }
  nearestKeyIndex(t) {
    let best = 1;
    this.keys.forEach((k, i) => { if (Math.abs(k.t - t) < Math.abs(this.keys[best - 1].t - t)) best = i + 1; });
    return best;
  }
  setTemporalEaseAtKey(i, inE, outE) {
    if (inE.length !== this.dims || outE.length !== this.dims) throw new Error('wrong ease dimensions');
    const k = this._k(i);
    k.ie = inE; k.oe = outE;
    k.ii = k.oi = KeyframeInterpolationType.BEZIER;      // AE turns the key bezier
  }
  setInterpolationTypeAtKey(i, a, b) { const k = this._k(i); k.ii = a; k.oi = b; }
  setTemporalContinuousAtKey(i, v) { this._k(i).tc = v; }
  setTemporalAutoBezierAtKey(i, v) { this._k(i).tab = v; }
  setSpatialTangentsAtKey(i, a, b) { const k = this._k(i); k.ist = a; k.ost = b; }
  setSpatialContinuousAtKey(i, v) { this._k(i).sc = v; }
  setSpatialAutoBezierAtKey(i, v) { this._k(i).sab = v; }
  setRovingAtKey(i, v) { this._k(i).rov = v; }
  setSelectedAtKey(i, v) { this._k(i).sel = v; }
  // linear interpolation is enough for arc-length sampling in tests
  valueAtTime(t) {
    const ks = this.keys;
    if (t <= ks[0].t) return ks[0].v;
    for (let i = 1; i < ks.length; i++) {
      if (t <= ks[i].t) {
        const f = (t - ks[i - 1].t) / (ks[i].t - ks[i - 1].t);
        const a = ks[i - 1].v, b = ks[i].v;
        return Array.isArray(a) ? a.map((x, d) => x + (b[d] - x) * f) : a + (b - a) * f;
      }
    }
    return ks[ks.length - 1].v;
  }
}

function load() {
  const undo = [];
  const ctx = {
    KeyframeInterpolationType, PropertyType, PropertyValueType, KeyframeEase,
    CompItem: function CompItem() {}, AVLayer: function AVLayer() {}, TextLayer: function TextLayer() {},
    ShapeLayer: function ShapeLayer() {}, CameraLayer: function CameraLayer() {}, LightLayer: function LightLayer() {},
    SolidSource: function SolidSource() {}, ParagraphJustification: { CENTER_JUSTIFY: 1 }, PurgeTarget: { ALL_CACHES: 1 },
    app: {
      version: '23.0', buildName: 'mock', isoLanguage: 'en_US', project: { activeItem: null, selection: [], items: [] },
      beginUndoGroup: (n) => undo.push(n), endUndoGroup: () => undo.push('end'), effects: [],
      preferences: { getPrefAsLong: () => 1 }, executeCommand: () => {}
    },
    File: function File(p) { this.fsName = p; this.exists = fs.existsSync(p); },
    Folder: function Folder(p) { this.fsName = p; this.exists = fs.existsSync(p); },
    Math, String, Number, Array, Object, RegExp, Error, Date, isFinite, isNaN, parseInt, parseFloat, Infinity
  };
  ctx.$ = { global: ctx, evalFile: (f) => vm.runInContext(fs.readFileSync(f.fsName, 'utf8'), ctx, { filename: f.fsName }) };
  vm.createContext(ctx);
  const root = path.join(__dirname, '..', 'extension');
  vm.runInContext(fs.readFileSync(path.join(root, 'host/index.jsx'), 'utf8'), ctx, { filename: 'index.jsx' });
  ctx.Simplify.load(root);
  return { S: ctx.Simplify, ctx, undo };
}

module.exports = { load, FakeProperty, PropertyValueType, KeyframeInterpolationType, KeyframeEase };
