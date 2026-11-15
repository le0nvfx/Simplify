/*
 * Simplify — layer tools: anchor point, centering, fit/fill, sequencing, nulls, adjustment layers.
 */
(function (S) {
    var TRANSFORM = "ADBE Transform Group";

    function tprop(layer, matchName) {
        return layer.property(TRANSFORM).property(matchName);
    }

    // Add a delta to a property, on every keyframe when it is animated.
    function shift(prop, delta) {
        function add(v) {
            if (typeof v === "number") {
                return v + delta[0];
            }
            var out = [];
            for (var i = 0; i < v.length; i++) {
                out.push(v[i] + (i < delta.length ? delta[i] : 0));
            }
            return out;
        }
        if (prop.numKeys > 0) {
            for (var k = 1; k <= prop.numKeys; k++) {
                prop.setValueAtKey(k, add(prop.keyValue(k)));
            }
        } else {
            prop.setValue(add(prop.value));
        }
    }

    function shiftPosition(layer, dx, dy) {
        var pos = tprop(layer, "ADBE Position");
        if (pos.dimensionsSeparated) {
            if (dx) {
                shift(tprop(layer, "ADBE Position_0"), [dx]);
            }
            if (dy) {
                shift(tprop(layer, "ADBE Position_1"), [dy]);
            }
        } else {
            shift(pos, [dx, dy, 0]);
        }
    }

    function positionAt(layer, t) {
        var pos = tprop(layer, "ADBE Position");
        if (pos.dimensionsSeparated) {
            return [tprop(layer, "ADBE Position_0").valueAtTime(t, false), tprop(layer, "ADBE Position_1").valueAtTime(t, false)];
        }
        return pos.valueAtTime(t, false);
    }

    // Layer-space vector -> parent-space vector (scale, then Z rotation).
    function toParentSpace(layer, t, vx, vy) {
        var sc = tprop(layer, "ADBE Scale").valueAtTime(t, false);
        var r = tprop(layer, "ADBE Rotate Z").valueAtTime(t, false) * Math.PI / 180;
        var sx = vx * sc[0] / 100;
        var sy = vy * sc[1] / 100;
        return [sx * Math.cos(r) - sy * Math.sin(r), sx * Math.sin(r) + sy * Math.cos(r)];
    }

    function rectOf(layer, t) {
        var r = layer.sourceRectAtTime(t, false);
        if (!r || (r.width === 0 && r.height === 0)) {
            return null;
        }
        return r;
    }

    function avLayers(comp) {
        var layers = S.layers(comp);
        var out = [];
        for (var i = 0; i < layers.length; i++) {
            if (S.isAV(layers[i])) {
                out.push(layers[i]);
            }
        }
        if (!out.length) {
            S.fail("Cameras and lights cannot be used here. Select a visual layer.");
        }
        return out;
    }

    // ---- anchor point ---------------------------------------------------------------------
    // fx, fy in 0..1 pick a point of the layer's bounds (0.5, 0.5 = centre). The layer does
    // not move: position is compensated for the anchor change.
    S.register("layers.anchor", "Move Anchor Point", function (a) {
        var comp = S.comp();
        var layers = avLayers(comp);
        var t = comp.time;
        var fx = a.x === undefined ? 0.5 : a.x;
        var fy = a.y === undefined ? 0.5 : a.y;
        var moved = 0;
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            var rect = rectOf(layer, t);
            if (!rect) {
                S.warn(layer.name + ": has no visible bounds.");
                continue;
            }
            S.unlocked(layer, function (l) {
                var ap = tprop(l, "ADBE Anchor Point");
                var cur = ap.valueAtTime(t, false);
                var dx = rect.left + rect.width * fx - cur[0];
                var dy = rect.top + rect.height * fy - cur[1];
                if (Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005) {
                    return;
                }
                var comp2 = toParentSpace(l, t, dx, dy);
                shift(ap, [dx, dy, 0]);
                shiftPosition(l, comp2[0], comp2[1]);
                moved++;
            });
        }
        return { moved: moved, total: layers.length };
    });

    // ---- centre / fit ---------------------------------------------------------------------
    // Works in comp space: a parented layer is detached, moved and re-attached, which keeps
    // its world transform the same way the pick whip does.
    function inCompSpace(layer, fn) {
        var parent = layer.parent;
        if (parent) {
            layer.parent = null;
        }
        try {
            fn();
        } finally {
            if (parent) {
                layer.parent = parent;
            }
        }
    }

    function centerLayer(comp, layer, t, axis) {
        var rect = rectOf(layer, t);
        if (!rect) {
            return false;
        }
        inCompSpace(layer, function () {
            var ap = tprop(layer, "ADBE Anchor Point").valueAtTime(t, false);
            var pos = positionAt(layer, t);
            var off = toParentSpace(layer, t, rect.left + rect.width / 2 - ap[0], rect.top + rect.height / 2 - ap[1]);
            var dx = axis === "v" ? 0 : comp.width / 2 - (pos[0] + off[0]);
            var dy = axis === "h" ? 0 : comp.height / 2 - (pos[1] + off[1]);
            shiftPosition(layer, dx, dy);
        });
        return true;
    }

    S.register("layers.center", "Center in Comp", function (a) {
        var comp = S.comp();
        var layers = avLayers(comp);
        var n = 0;
        for (var i = 0; i < layers.length; i++) {
            S.unlocked(layers[i], function (l) {
                if (centerLayer(comp, l, comp.time, a.axis || "both")) {
                    n++;
                }
            });
        }
        return { moved: n };
    });

    S.register("layers.fit", "Fit to Comp", function (a) {
        var comp = S.comp();
        var layers = avLayers(comp);
        var t = comp.time;
        var fill = a.mode === "fill";
        var n = 0;
        for (var i = 0; i < layers.length; i++) {
            S.unlocked(layers[i], function (l) {
                var rect = rectOf(l, t);
                if (!rect || !rect.width || !rect.height) {
                    return;
                }
                var kx = comp.width / rect.width;
                var ky = comp.height / rect.height;
                var k = (fill ? Math.max(kx, ky) : Math.min(kx, ky)) * 100;
                var sc = tprop(l, "ADBE Scale");
                var v = sc.value;
                var next = v.length > 2 ? [k, k, v[2]] : [k, k];
                if (sc.numKeys > 0) {
                    sc.setValueAtTime(t, next);
                } else {
                    sc.setValue(next);
                }
                centerLayer(comp, l, t, "both");
                n++;
            });
        }
        return { fitted: n };
    });

    // ---- sequence -------------------------------------------------------------------------
    function byIndex(a, b) {
        return a.index - b.index;
    }

    S.register("layers.sequence", "Sequence Layers", function (a) {
        var comp = S.comp();
        var layers = S.layers(comp, 2);
        var fd = comp.frameDuration;
        var step = (a.frames === undefined ? 5 : Number(a.frames)) * fd;
        if (a.order === "top") {
            layers.sort(byIndex);
        } else if (a.order === "bottom") {
            layers.sort(byIndex);
            layers.reverse();
        }
        var first = layers[0];
        var cursor = Math.min(first.inPoint, first.outPoint);
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            var lo = Math.min(layer.inPoint, layer.outPoint);
            var hi = Math.max(layer.inPoint, layer.outPoint);
            var target = cursor;
            S.unlocked(layer, function (l) {
                l.startTime = l.startTime + (target - lo);
            });
            // stagger: fixed offset between starts. chain: each starts where the last ended,
            // with `frames` of overlap (negative = gap).
            cursor = a.mode === "chain" ? target + (hi - lo) - step : target + step;
        }
        return { count: layers.length };
    });

    // ---- null controller ------------------------------------------------------------------
    S.register("layers.nullParent", "Parent to New Null", function () {
        var comp = S.comp();
        var layers = S.layers(comp);
        var t = comp.time;
        var sumX = 0;
        var sumY = 0;
        var count = 0;
        var lo = Infinity;
        var hi = -Infinity;
        var top = Infinity;
        var any3D = false;
        var i;
        for (i = 0; i < layers.length; i++) {
            var l = layers[i];
            lo = Math.min(lo, l.inPoint, l.outPoint);
            hi = Math.max(hi, l.inPoint, l.outPoint);
            top = Math.min(top, l.index);
            if (l.threeDLayer) {
                any3D = true;
            }
            if (!l.parent) {
                var p = positionAt(l, t);
                sumX += p[0];
                sumY += p[1];
                count++;
            }
        }
        var topLayer = comp.layer(top);
        var nul = comp.layers.addNull(comp.duration);
        nul.name = "Control";
        if (any3D) {
            nul.threeDLayer = true;
        }
        var cx = count ? sumX / count : comp.width / 2;
        var cy = count ? sumY / count : comp.height / 2;
        tprop(nul, "ADBE Position").setValue(any3D ? [cx, cy, 0] : [cx, cy]);
        nul.moveBefore(topLayer);
        try {
            nul.inPoint = lo;
            nul.outPoint = hi;
        } catch (e) {}
        var parented = 0;
        for (i = 0; i < layers.length; i++) {
            if (!layers[i].parent) {
                S.unlocked(layers[i], function (layer) {
                    layer.parent = nul;
                });
                parented++;
            }
        }
        if (parented < layers.length) {
            S.warn(S.plural(layers.length - parented, "layer") + " already had a parent and kept it.");
        }
        return { parented: parented };
    });

    // ---- adjustment layer -----------------------------------------------------------------
    S.makeAdjustment = function (comp, above, name, lo, hi) {
        var solid = comp.layers.addSolid([1, 1, 1], name || "Adjustment Layer", comp.width, comp.height, comp.pixelAspect, comp.duration);
        solid.adjustmentLayer = true;
        solid.label = 5;
        if (above) {
            solid.moveBefore(above);
        }
        if (lo !== undefined && hi !== undefined && hi > lo) {
            try {
                solid.inPoint = lo;
                solid.outPoint = hi;
            } catch (e) {}
        }
        return solid;
    };

    S.register("layers.adjustment", "Adjustment Layer Above", function (a) {
        var comp = S.comp();
        var sel = comp.selectedLayers;
        var made = [];
        var i;
        if (!sel.length) {
            made.push(S.makeAdjustment(comp, null, "Adjustment Layer"));
        } else if (a.perLayer) {
            var targets = [];
            for (i = 0; i < sel.length; i++) {
                targets.push(sel[i]);
            }
            for (i = 0; i < targets.length; i++) {
                made.push(S.makeAdjustment(comp, targets[i], targets[i].name + " Adjust",
                    Math.min(targets[i].inPoint, targets[i].outPoint), Math.max(targets[i].inPoint, targets[i].outPoint)));
            }
        } else {
            var lo = Infinity;
            var hi = -Infinity;
            var topIndex = Infinity;
            for (i = 0; i < sel.length; i++) {
                lo = Math.min(lo, sel[i].inPoint, sel[i].outPoint);
                hi = Math.max(hi, sel[i].inPoint, sel[i].outPoint);
                topIndex = Math.min(topIndex, sel[i].index);
            }
            made.push(S.makeAdjustment(comp, comp.layer(topIndex), "Adjustment Layer", lo, hi));
        }
        S.select(comp, made);
        return { count: made.length };
    });
}($.global.Simplify));
