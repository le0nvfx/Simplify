/*
 * Simplify — presets.
 * Two kinds:
 *  1. Simplify presets (JSON): effect stacks (and optionally transform animation) captured from
 *     a layer. Keyframe times are stored relative to the layer's in point, so on apply they can
 *     be fitted to the target layer (first key -> in point, last key -> last frame).
 *  2. Native .ffx presets: applied through After Effects, then their keyframes are fitted.
 * Limitation of kind 1: parameters with custom data (Curves graphs, gradients, text documents,
 * paths) cannot be read by scripts. Use an .ffx preset for effects that rely on them.
 */
(function (S) {
    var K = S.keys;
    var FX = "ADBE Effect Parade";
    var TRANSFORM = "ADBE Transform Group";

    function serialisable(type) {
        return type === PropertyValueType.OneD || type === PropertyValueType.TwoD ||
            type === PropertyValueType.ThreeD || type === PropertyValueType.TwoD_SPATIAL ||
            type === PropertyValueType.ThreeD_SPATIAL || type === PropertyValueType.COLOR ||
            type === PropertyValueType.LAYER_INDEX || type === PropertyValueType.MASK_INDEX;
    }

    // ---- capture --------------------------------------------------------------------------
    function captureGroup(group, path, out, t0, stats) {
        var n = 0;
        try {
            n = group.numProperties;
        } catch (e) {
            return;
        }
        for (var i = 1; i <= n; i++) {
            var p = null;
            try {
                p = group.property(i);
            } catch (e1) {}
            if (!p) {
                continue;
            }
            var here = path.concat([p.matchName]);
            if (p.propertyType !== PropertyType.PROPERTY) {
                captureGroup(p, here, out, t0, stats);
                continue;
            }
            try {
                var keyed = p.numKeys > 0;
                var hasExpr = p.expressionEnabled && p.expression !== "";
                if (!keyed && !hasExpr && !p.isModified) {
                    continue;
                }
                if (!serialisable(p.propertyValueType)) {
                    if (p.propertyValueType !== PropertyValueType.NO_VALUE) {
                        stats.skipped.push(p.name);
                    }
                    continue;
                }
                var entry = { path: here, name: p.name };
                if (keyed) {
                    var keys = K.read(p);
                    for (var k = 0; k < keys.length; k++) {
                        keys[k].t -= t0;
                        delete keys[k].sel;
                        stats.lo = Math.min(stats.lo, keys[k].t);
                        stats.hi = Math.max(stats.hi, keys[k].t);
                    }
                    entry.keys = keys;
                    stats.keys += keys.length;
                } else {
                    entry.v = p.value;
                }
                if (hasExpr) {
                    entry.expr = p.expression;
                }
                out.push(entry);
            } catch (e2) {}
        }
    }

    S.register("presets.capture", "Capture Preset", function (a) {
        var comp = S.comp();
        var layer = S.layers(comp)[0];
        var t0 = Math.min(layer.inPoint, layer.outPoint);
        var stats = { lo: Infinity, hi: -Infinity, keys: 0, skipped: [] };
        var preset = {
            format: "simplify-preset",
            version: 1,
            name: a.name || layer.name,
            duration: Math.abs(layer.outPoint - layer.inPoint),
            frameRate: comp.frameRate,
            effects: []
        };

        var fx = layer.property(FX);
        var count = fx ? fx.numProperties : 0;
        var onlySelected = false;
        var i;
        for (i = 1; i <= count; i++) {
            if (fx.property(i).selected) {
                onlySelected = true;
                break;
            }
        }
        for (i = 1; i <= count; i++) {
            var e = fx.property(i);
            if (onlySelected && !e.selected) {
                continue;
            }
            var item = { matchName: e.matchName, name: e.name, enabled: e.enabled, props: [] };
            captureGroup(e, [], item.props, t0, stats);
            preset.effects.push(item);
        }
        if (a.transform) {
            preset.transform = [];
            captureGroup(layer.property(TRANSFORM), [], preset.transform, t0, stats);
        }
        if (!preset.effects.length && !(preset.transform && preset.transform.length)) {
            S.fail(a.transform ? "The layer has no effects or transform changes to save."
                : "The layer has no effects to save.");
        }
        preset.keySpan = stats.keys ? [stats.lo, stats.hi] : null;
        if (stats.skipped.length) {
            S.warn("Not saved (custom data, use an .ffx for these): " + stats.skipped.slice(0, 4).join(", ") +
                (stats.skipped.length > 4 ? " +" + (stats.skipped.length - 4) + " more" : ""));
        }
        return { preset: preset, effects: preset.effects.length, keys: stats.keys };
    }, { undo: false });

    // ---- apply ----------------------------------------------------------------------------
    function resolve(root, path) {
        var p = root;
        for (var i = 0; i < path.length; i++) {
            var next = null;
            try {
                next = p.property(path[i]);
            } catch (e) {}
            if (!next) {
                // Effect parameters are named "<effect>-000N": fall back to position N.
                var m = /-(\d{4})$/.exec(path[i]);
                if (m) {
                    try {
                        next = p.property(parseInt(m[1], 10));
                    } catch (e2) {}
                }
            }
            if (!next) {
                return null;
            }
            p = next;
        }
        return p;
    }

    // Where preset time t (seconds after the captured layer's in point) lands on a layer.
    function timeMap(preset, layer, mode, fd) {
        var a = Math.min(layer.inPoint, layer.outPoint);
        var b = Math.max(layer.inPoint, layer.outPoint);
        var span = preset.keySpan;
        if (mode === "end") {
            return { src: preset.duration || 0, dst: b, f: 1 };
        }
        if (mode === "stretch" && span && span[1] > span[0]) {
            var last = Math.max(a, b - fd);
            var f = (last - a) / (span[1] - span[0]);
            if (f > 0) {
                return { src: span[0], dst: a, f: f };
            }
        }
        if (mode === "stretch" && span) {
            return { src: span[0], dst: a, f: 1 };
        }
        return { src: 0, dst: a, f: 1 };
    }

    function applyProps(root, props, map, fd, stats) {
        for (var i = 0; i < props.length; i++) {
            var entry = props[i];
            var p = resolve(root, entry.path);
            if (!p) {
                stats.missed++;
                continue;
            }
            try {
                if (entry.keys && entry.keys.length) {
                    var keys = [];
                    var times = [];
                    var k;
                    for (k = 0; k < entry.keys.length; k++) {
                        times.push(map.dst + (entry.keys[k].t - map.src) * map.f);
                    }
                    times = K.snapTimes(times, fd);
                    for (k = 0; k < entry.keys.length; k++) {
                        var src = entry.keys[k];
                        keys.push({
                            t: times[k], v: src.v, ii: src.ii, oi: src.oi, ie: src.ie, oe: src.oe,
                            tc: src.tc, tab: src.tab, ist: src.ist, ost: src.ost, sc: src.sc,
                            sab: src.sab, rov: src.rov
                        });
                    }
                    K.clear(p);
                    K.write(p, keys, 1 / map.f);
                    stats.keys += keys.length;
                } else if (entry.v !== undefined) {
                    p.setValue(entry.v);
                }
                if (entry.expr) {
                    p.expression = entry.expr;
                }
            } catch (e) {
                stats.missed++;
            }
        }
    }

    function applyToLayer(preset, layer, mode, fd, stats) {
        var map = timeMap(preset, layer, mode, fd);
        var fx = layer.property(FX);
        var effects = preset.effects || [];
        for (var i = 0; i < effects.length; i++) {
            var item = effects[i];
            if (!fx || !fx.canAddProperty(item.matchName)) {
                stats.missing.push(item.name || item.matchName);
                continue;
            }
            fx.addProperty(item.matchName);
            // Re-read by index: adding an effect invalidates earlier references.
            var effect = layer.property(FX).property(layer.property(FX).numProperties);
            try {
                if (item.name) {
                    effect.name = item.name;
                }
            } catch (e) {}
            applyProps(effect, item.props || [], map, fd, stats);
            if (item.enabled === false) {
                layer.property(FX).property(layer.property(FX).numProperties).enabled = false;
            }
            stats.effects++;
        }
        if (preset.transform && preset.transform.length) {
            applyProps(layer.property(TRANSFORM), preset.transform, map, fd, stats);
        }
    }

    S.register("presets.apply", "Apply Preset", function (a) {
        var comp = S.comp();
        var preset = a.preset;
        if (!preset || preset.format !== "simplify-preset") {
            S.fail("That file is not a Simplify preset.");
        }
        var fd = comp.frameDuration;
        var stats = { effects: 0, keys: 0, missed: 0, missing: [] };
        var targets = [];
        var i;
        if (a.target === "adjustment") {
            var sel = comp.selectedLayers;
            var lo = Infinity;
            var hi = -Infinity;
            var top = Infinity;
            for (i = 0; i < sel.length; i++) {
                lo = Math.min(lo, sel[i].inPoint, sel[i].outPoint);
                hi = Math.max(hi, sel[i].inPoint, sel[i].outPoint);
                top = Math.min(top, sel[i].index);
            }
            var adj = sel.length ? S.makeAdjustment(comp, comp.layer(top), preset.name, lo, hi)
                : S.makeAdjustment(comp, null, preset.name);
            if (a.strength !== undefined && a.strength < 100) {
                adj.property(TRANSFORM).property("ADBE Opacity").setValue(Math.max(0, a.strength));
            }
            targets.push(adj);
        } else {
            targets = S.layers(comp);
        }
        for (i = 0; i < targets.length; i++) {
            if (!S.isAV(targets[i])) {
                S.warn(targets[i].name + ": cannot hold effects, skipped.");
                continue;
            }
            S.unlocked(targets[i], function (l) {
                applyToLayer(preset, l, a.mode || "stretch", fd, stats);
            });
        }
        if (stats.missing.length) {
            S.warn("Not installed: " + stats.missing.slice(0, 3).join(", "));
        }
        if (stats.missed) {
            S.warn(S.plural(stats.missed, "parameter") + " could not be set.");
        }
        if (a.target === "adjustment") {
            S.select(comp, targets);
        }
        return { layers: targets.length, effects: stats.effects, keys: stats.keys };
    });

    // ---- native .ffx ----------------------------------------------------------------------
    function propKey(p) {
        var parts = [];
        for (var d = p.propertyDepth - 1; d >= 1; d--) {
            parts.push(p.propertyGroup(d).propertyIndex);
        }
        parts.push(p.propertyIndex);
        return parts.join(".");
    }

    function snapshot(layer) {
        var list = K.collect(layer, []);
        var map = {};
        for (var i = 0; i < list.length; i++) {
            map[propKey(list[i])] = list[i].numKeys;
        }
        return map;
    }

    S.register("presets.applyFfx", "Apply .ffx Preset", function (a) {
        var comp = S.comp();
        var layers = S.layers(comp);
        var file = new File(a.path);
        if (!file.exists) {
            S.fail("Preset file not found. It may have been moved.");
        }
        var fd = comp.frameDuration;
        var time = comp.time;
        var keys = 0;
        var i;
        try {
            for (i = 0; i < layers.length; i++) {
                var layer = layers[i];
                if (!S.isAV(layer)) {
                    continue;
                }
                if (layer.locked) {
                    layer.locked = false;
                }
                // applyPreset acts on the selection and drops keys at the current time, so
                // isolate the layer and park the time indicator on its in point.
                S.select(comp, [layer]);
                comp.time = Math.max(0, Math.min(layer.inPoint, layer.outPoint));
                var before = snapshot(layer);
                var fxBefore = layer.property(FX).numProperties;
                layer.applyPreset(file);
                if (a.mode === "stretch") {
                    var after = K.collect(layer, []);
                    var fresh = [];
                    for (var j = 0; j < after.length; j++) {
                        var key = propKey(after[j]);
                        var isNewEffect = false;
                        try {
                            var top = after[j].propertyGroup(after[j].propertyDepth - 1);
                            var second = after[j].propertyDepth > 2 ? after[j].propertyGroup(after[j].propertyDepth - 2) : null;
                            isNewEffect = top.matchName === FX && second && second.propertyIndex > fxBefore;
                        } catch (e) {}
                        if (isNewEffect || before[key] !== after[j].numKeys) {
                            fresh.push(after[j]);
                        }
                    }
                    keys += K.fitToLayer(layer, fresh, fd);
                }
            }
        } finally {
            comp.time = time;
            S.select(comp, layers);
        }
        return { layers: layers.length, keys: keys };
    });
}($.global.Simplify));
