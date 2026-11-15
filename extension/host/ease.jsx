/*
 * Simplify — easing. Converts a cubic-bezier curve (x1, y1, x2, y2 — the same four numbers CSS
 * and Flow use) into After Effects temporal ease (speed + influence) for a pair of keyframes.
 *
 *   influence_out = x1 * 100            speed_out = averageSpeed * y1 / x1
 *   influence_in  = (1 - x2) * 100      speed_in  = averageSpeed * (1 - y2) / (1 - x2)
 *
 * y values outside 0..1 produce overshoot, exactly as in the graph editor.
 */
(function (S) {
    var E = {};
    S.ease = E;
    var BEZIER = KeyframeInterpolationType.BEZIER;

    function clampInfluence(v) {
        return Math.max(0.1, Math.min(100, v));
    }

    function distance(a, b) {
        var sum = 0;
        for (var i = 0; i < a.length && i < b.length; i++) {
            sum += (b[i] - a[i]) * (b[i] - a[i]);
        }
        return Math.sqrt(sum);
    }

    // Average speed between two keys, one entry per ease dimension of the property.
    function averageSpeeds(prop, k1, k2) {
        var t1 = prop.keyTime(k1);
        var dt = prop.keyTime(k2) - t1;
        var dims = prop.keyOutTemporalEase(k1).length;
        var type = prop.propertyValueType;
        var speeds = [];
        var d;
        if (dt <= 0) {
            return null;
        }
        if (type === PropertyValueType.SHAPE) {
            return [1 / dt];
        }
        try {
            var v1 = prop.keyValue(k1);
            var v2 = prop.keyValue(k2);
            if (type === PropertyValueType.COLOR) {
                // Colour speed has no stable unit across versions: shape the curve with influence only.
                return [0];
            }
            if (dims === 1 && (v1 instanceof Array)) {
                // Spatial property: speed runs along the motion path, so measure its length.
                var steps = 24;
                var len = 0;
                var prev = v1;
                for (var s = 1; s <= steps; s++) {
                    var cur = prop.valueAtTime(t1 + dt * s / steps, true);
                    len += distance(prev, cur);
                    prev = cur;
                }
                return [len / dt];
            }
            if (dims === 1) {
                return [(v2 - v1) / dt];
            }
            for (d = 0; d < dims; d++) {
                speeds.push((v2[d] - v1[d]) / dt);
            }
            return speeds;
        } catch (e) {
            for (d = 0; d < dims; d++) {
                speeds.push(0);
            }
            return speeds;
        }
    }

    E.pair = function (prop, k1, k2, bez) {
        var speeds = averageSpeeds(prop, k1, k2);
        if (!speeds) {
            return false;
        }
        var x1 = Math.max(0.001, Math.min(1, bez[0]));
        var x2 = Math.max(0, Math.min(0.999, bez[2]));
        var outEase = [];
        var inEase = [];
        for (var d = 0; d < speeds.length; d++) {
            outEase.push(new KeyframeEase(speeds[d] * bez[1] / x1, clampInfluence(x1 * 100)));
            inEase.push(new KeyframeEase(speeds[d] * (1 - bez[3]) / (1 - x2), clampInfluence((1 - x2) * 100)));
        }
        var in1 = prop.keyInInterpolationType(k1);
        var out2 = prop.keyOutInterpolationType(k2);
        prop.setTemporalEaseAtKey(k1, prop.keyInTemporalEase(k1), outEase);
        prop.setTemporalEaseAtKey(k2, inEase, prop.keyOutTemporalEase(k2));
        // Setting ease turns both sides of a key into bezier; restore the outer sides.
        prop.setInterpolationTypeAtKey(k1, in1, BEZIER);
        prop.setInterpolationTypeAtKey(k2, BEZIER, out2);
        return true;
    };

    function selectedKeyProps(comp) {
        var props = comp.selectedProperties;
        var out = [];
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (p.propertyType === PropertyType.PROPERTY && p.selectedKeys && p.selectedKeys.length >= 2) {
                out.push(p);
            }
        }
        return out;
    }

    S.register("ease.apply", "Apply Ease", function (a) {
        var comp = S.comp();
        var props = selectedKeyProps(comp);
        var bez = [Number(a.x1), Number(a.y1), Number(a.x2), Number(a.y2)];
        var pairs = 0;
        for (var i = 0; i < props.length; i++) {
            var keys = props[i].selectedKeys;
            for (var j = 0; j < keys.length - 1; j++) {
                if (keys[j + 1] !== keys[j] + 1) {
                    continue;
                }
                try {
                    if (E.pair(props[i], keys[j], keys[j + 1], bez)) {
                        pairs++;
                    }
                } catch (e) {
                    S.warn(props[i].name + ": this property cannot be eased.");
                    break;
                }
            }
        }
        if (!pairs) {
            S.fail("Select at least two neighbouring keyframes.");
        }
        return { pairs: pairs, properties: props.length };
    });

    S.register("ease.read", "Read Ease", function () {
        var comp = S.comp();
        var props = selectedKeyProps(comp);
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            var keys = p.selectedKeys;
            var k1 = keys[0];
            var k2 = keys[1];
            if (k2 !== k1 + 1) {
                continue;
            }
            var speeds = averageSpeeds(p, k1, k2);
            if (!speeds) {
                continue;
            }
            var outE = p.keyOutTemporalEase(k1);
            var inE = p.keyInTemporalEase(k2);
            var d = 0;
            for (var j = 0; j < speeds.length; j++) {
                if (Math.abs(speeds[j]) > 1e-9) {
                    d = j;
                    break;
                }
            }
            var x1 = outE[d].influence / 100;
            var x2 = 1 - inE[d].influence / 100;
            var avg = speeds[d];
            var y1 = Math.abs(avg) > 1e-9 ? outE[d].speed / avg * x1 : 0;
            var y2 = Math.abs(avg) > 1e-9 ? 1 - inE[d].speed / avg * (1 - x2) : 1;
            return { x1: x1, y1: y1, x2: x2, y2: y2, property: p.name };
        }
        S.fail("Select two neighbouring keyframes to read their curve.");
    }, { undo: false });
}($.global.Simplify));
