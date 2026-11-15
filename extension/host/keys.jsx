/*
 * Simplify — keyframe engine.
 * ExtendScript cannot move a keyframe; it can only delete and recreate it. Everything that
 * retimes keys (fit to layer, presets, un-precompose) therefore goes through read() -> write(),
 * which preserves value, interpolation, temporal ease, spatial tangents, roving and selection.
 */
(function (S) {
    var K = {};
    S.keys = K;

    var INTERP = {};
    INTERP.L = KeyframeInterpolationType.LINEAR;
    INTERP.B = KeyframeInterpolationType.BEZIER;
    INTERP.H = KeyframeInterpolationType.HOLD;

    function interpCode(type) {
        if (type === KeyframeInterpolationType.LINEAR) {
            return "L";
        }
        if (type === KeyframeInterpolationType.HOLD) {
            return "H";
        }
        return "B";
    }

    function easeToPlain(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            out.push([list[i].speed, list[i].influence]);
        }
        return out;
    }

    function easeFromPlain(list, speedScale) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var infl = list[i][1];
            if (infl < 0.1) {
                infl = 0.1;
            }
            if (infl > 100) {
                infl = 100;
            }
            out.push(new KeyframeEase(list[i][0] * speedScale, infl));
        }
        return out;
    }

    // Plain, JSON-safe description of every key on a property (values stay live objects for
    // shapes / text documents, which is fine for in-memory retiming).
    K.read = function (prop) {
        var keys = [];
        var spatial = false;
        try {
            spatial = prop.isSpatial;
        } catch (e) {}
        for (var i = 1; i <= prop.numKeys; i++) {
            var k = {
                t: prop.keyTime(i),
                v: prop.keyValue(i),
                ii: interpCode(prop.keyInInterpolationType(i)),
                oi: interpCode(prop.keyOutInterpolationType(i)),
                ie: easeToPlain(prop.keyInTemporalEase(i)),
                oe: easeToPlain(prop.keyOutTemporalEase(i)),
                tc: prop.keyTemporalContinuous(i),
                tab: prop.keyTemporalAutoBezier(i),
                sel: prop.keySelected(i)
            };
            if (spatial) {
                k.ist = prop.keyInSpatialTangent(i);
                k.ost = prop.keyOutSpatialTangent(i);
                k.sc = prop.keySpatialContinuous(i);
                k.sab = prop.keySpatialAutoBezier(i);
                k.rov = prop.keyRoving(i);
            }
            keys.push(k);
        }
        return keys;
    };

    K.clear = function (prop) {
        for (var i = prop.numKeys; i >= 1; i--) {
            prop.removeKey(i);
        }
    };

    // speedScale: ease speeds are in units/second, so when time is stretched by f the speeds
    // must be divided by f to keep the curve shape (this is what Alt-dragging keys does).
    K.write = function (prop, keys, speedScale) {
        var i, idx, k;
        var scale = speedScale === undefined ? 1 : speedScale;
        for (i = 0; i < keys.length; i++) {
            prop.setValueAtTime(keys[i].t, keys[i].v);
        }
        for (i = 0; i < keys.length; i++) {
            k = keys[i];
            idx = prop.nearestKeyIndex(k.t);
            try {
                if (k.ie && k.oe && k.ie.length && k.oe.length) {
                    prop.setTemporalEaseAtKey(idx, easeFromPlain(k.ie, scale), easeFromPlain(k.oe, scale));
                }
            } catch (e1) {}
            try {
                prop.setInterpolationTypeAtKey(idx, INTERP[k.ii] || INTERP.B, INTERP[k.oi] || INTERP.B);
            } catch (e2) {}
            try {
                if (k.tc) {
                    prop.setTemporalContinuousAtKey(idx, true);
                }
                if (k.tab) {
                    prop.setTemporalAutoBezierAtKey(idx, true);
                }
            } catch (e3) {}
            if (k.ist && k.ost) {
                try {
                    if (k.sab) {
                        prop.setSpatialAutoBezierAtKey(idx, true);
                    } else {
                        prop.setSpatialTangentsAtKey(idx, k.ist, k.ost);
                        prop.setSpatialContinuousAtKey(idx, !!k.sc);
                    }
                    if (k.rov && i > 0 && i < keys.length - 1) {
                        prop.setRovingAtKey(idx, true);
                    }
                } catch (e4) {}
            }
            try {
                if (k.sel) {
                    prop.setSelectedAtKey(idx, true);
                }
            } catch (e5) {}
        }
    };

    // Snap times to the frame grid when that keeps them strictly increasing.
    K.snapTimes = function (times, frameDuration) {
        var snapped = [];
        var i;
        for (i = 0; i < times.length; i++) {
            snapped.push(Math.round(times[i] / frameDuration) * frameDuration);
        }
        for (i = 1; i < snapped.length; i++) {
            if (snapped[i] - snapped[i - 1] < frameDuration * 0.5) {
                return times;
            }
        }
        return snapped;
    };

    // Linear remap t' = dst + (t - src) * f applied to every key of a property.
    K.retime = function (prop, src, dst, f, frameDuration) {
        var keys = K.read(prop);
        var times = [];
        var i;
        if (!keys.length) {
            return 0;
        }
        for (i = 0; i < keys.length; i++) {
            times.push(dst + (keys[i].t - src) * f);
        }
        if (frameDuration) {
            times = K.snapTimes(times, frameDuration);
        }
        for (i = 0; i < keys.length; i++) {
            keys[i].t = times[i];
        }
        K.clear(prop);
        K.write(prop, keys, f > 0 ? 1 / f : 1);
        return keys.length;
    };

    // Depth-first list of every keyframed property below a group.
    K.collect = function (group, out) {
        var n = 0;
        try {
            n = group.numProperties;
        } catch (e) {
            return out;
        }
        for (var i = 1; i <= n; i++) {
            var p = null;
            try {
                p = group.property(i);
            } catch (e2) {}
            if (!p) {
                continue;
            }
            if (p.propertyType === PropertyType.PROPERTY) {
                try {
                    if (p.numKeys > 0 && p.matchName !== "ADBE Marker") {
                        out.push(p);
                    }
                } catch (e3) {}
            } else {
                K.collect(p, out);
            }
        }
        return out;
    };

    K.span = function (props) {
        var lo = Infinity;
        var hi = -Infinity;
        for (var i = 0; i < props.length; i++) {
            var a = props[i].keyTime(1);
            var b = props[i].keyTime(props[i].numKeys);
            if (a < lo) {
                lo = a;
            }
            if (b > hi) {
                hi = b;
            }
        }
        return { lo: lo, hi: hi };
    };

    // Stretch a set of keyed properties so the first key lands on the layer's in point and the
    // last key on the layer's last frame; keys in between keep their proportions.
    K.fitToLayer = function (layer, props, frameDuration) {
        var moved = 0;
        if (!props.length) {
            return 0;
        }
        var span = K.span(props);
        var a = Math.min(layer.inPoint, layer.outPoint);
        var b = Math.max(layer.inPoint, layer.outPoint) - frameDuration;
        if (b < a) {
            b = a;
        }
        var len = span.hi - span.lo;
        var f = len > 0 ? (b - a) / len : 1;
        if (len > 0 && f <= 0) {
            S.warn(layer.name + ": layer is too short to fit the keyframes.");
            return 0;
        }
        for (var i = 0; i < props.length; i++) {
            try {
                moved += K.retime(props[i], span.lo, a, f, frameDuration);
            } catch (e) {
                S.warn(layer.name + ": could not retime \"" + props[i].name + "\".");
            }
        }
        return moved;
    };

    // Copy a property's value, keys and expression onto another property of the same type.
    K.copyProp = function (src, dst, timeOffset) {
        var off = timeOffset || 0;
        try {
            if (src.numKeys > 0) {
                var keys = K.read(src);
                for (var i = 0; i < keys.length; i++) {
                    keys[i].t += off;
                    keys[i].sel = false;
                }
                K.write(dst, keys, 1);
            } else {
                dst.setValue(src.value);
            }
            if (src.expressionEnabled && src.expression) {
                dst.expression = src.expression;
            }
            return true;
        } catch (e) {
            return false;
        }
    };

    // ---- actions --------------------------------------------------------------------------
    // Layer wrappers are not guaranteed to be identical objects, so compare by index.
    function ownerIndex(prop) {
        try {
            return prop.propertyGroup(prop.propertyDepth).index;
        } catch (e) {
            return -1;
        }
    }

    S.register("keys.fitToLayer", "Fit Keyframes to Layer", function (a) {
        var comp = S.comp();
        var layers = S.layers(comp);
        var scope = a.scope || "effects";
        var fd = comp.frameDuration;
        var total = 0;
        var touched = 0;
        var selProps = scope === "selected" ? comp.selectedProperties : null;
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            var props = [];
            if (scope === "selected") {
                for (var j = 0; j < selProps.length; j++) {
                    var p = selProps[j];
                    if (p.propertyType === PropertyType.PROPERTY && p.numKeys > 0 && ownerIndex(p) === layer.index) {
                        props.push(p);
                    }
                }
            } else if (scope === "all") {
                K.collect(layer, props);
            } else {
                var fx = layer.property("ADBE Effect Parade");
                if (fx) {
                    K.collect(fx, props);
                }
            }
            if (props.length) {
                var n = S.unlocked(layer, function (l) {
                    return K.fitToLayer(l, props, fd);
                });
                if (n) {
                    total += n;
                    touched++;
                }
            }
        }
        if (!total) {
            S.fail(scope === "selected" ? "Select the keyframed properties you want to fit."
                : "No keyframes found on the selected layers.");
        }
        return { keys: total, layers: touched };
    });
}($.global.Simplify));
