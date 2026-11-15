/*
 * Simplify — composition tools: precompose each layer, un-precompose, independent duplicates.
 */
(function (S) {
    var K = S.keys;

    function numeric(a, b) {
        return a - b;
    }

    // ---- precompose each ------------------------------------------------------------------
    // After "move all attributes", the new comp is as long as the parent. Trimming shifts the
    // content to time 0 and shortens the comp to the layer's own span.
    function trimPrecomp(comp, index, inner, lo, hi) {
        var dur = hi - lo;
        if (dur < comp.frameDuration) {
            return;
        }
        for (var i = 1; i <= inner.numLayers; i++) {
            S.unlocked(inner.layer(i), function (l) {
                l.startTime = l.startTime - lo;
            });
        }
        inner.duration = dur;
        var outer = comp.layer(index);
        outer.startTime = lo;
        try {
            outer.inPoint = lo;
            outer.outPoint = hi;
        } catch (e) {}
    }

    S.register("comps.precomposeEach", "Precompose Each Layer", function (a) {
        var comp = S.comp();
        var layers = S.layers(comp);
        var indices = [];
        var i;
        for (i = 0; i < layers.length; i++) {
            indices.push(layers[i].index);
        }
        indices.sort(numeric);

        var suffix = a.suffix === undefined ? " Comp" : String(a.suffix);
        var moveAll = a.moveAttributes !== false;
        var made = [];
        for (i = 0; i < indices.length; i++) {
            var layer = comp.layer(indices[i]);
            var lo = Math.min(layer.inPoint, layer.outPoint);
            var hi = Math.max(layer.inPoint, layer.outPoint);
            var hasSource = false;
            try {
                hasSource = !!layer.source;
            } catch (e) {}
            // "Leave all attributes" is only valid for a layer with a source (footage, solid, comp).
            var move = moveAll || !hasSource;
            if (!moveAll && !hasSource) {
                S.warn(layer.name + ": no source, attributes were moved into the new comp.");
            }
            var wasLocked = layer.locked;
            if (wasLocked) {
                layer.locked = false;
            }
            var inner = comp.layers.precompose([indices[i]], layer.name + suffix, move);
            if (move && a.trim !== false) {
                try {
                    trimPrecomp(comp, indices[i], inner, lo, hi);
                } catch (e2) {
                    S.warn(inner.name + ": could not trim to the layer's length.");
                }
            }
            made.push(comp.layer(indices[i]));
        }
        S.select(comp, made);
        return { count: made.length };
    });

    // ---- un-precompose --------------------------------------------------------------------
    var TRANSFORM = "ADBE Transform Group";

    function tprop(layer, matchName) {
        return layer.property(TRANSFORM).property(matchName);
    }

    function isAnimated(prop) {
        try {
            return prop.numKeys > 0 || (prop.expressionEnabled && prop.expression !== "");
        } catch (e) {
            return false;
        }
    }

    // True when the precomp layer maps its inner comp 1:1 onto the parent comp, so the inner
    // layers can be dropped in without a carrier null.
    function isIdentity(pl) {
        if (pl.threeDLayer || pl.parent) {
            return false;
        }
        var ap = tprop(pl, "ADBE Anchor Point");
        var pos = tprop(pl, "ADBE Position");
        var sc = tprop(pl, "ADBE Scale");
        var rot = tprop(pl, "ADBE Rotate Z");
        if (pos.dimensionsSeparated) {
            return false;
        }
        if (isAnimated(ap) || isAnimated(pos) || isAnimated(sc) || isAnimated(rot)) {
            return false;
        }
        var a = ap.value;
        var p = pos.value;
        var s = sc.value;
        return S.near(a[0], p[0], 0.01) && S.near(a[1], p[1], 0.01) &&
            S.near(s[0], 100, 0.001) && S.near(s[1], 100, 0.001) && S.near(rot.value, 0, 0.001);
    }

    // A null that carries the precomp layer's transform, so layers parented to it sit exactly
    // where they were inside the precomp.
    function makeCarrier(comp, pl) {
        var nul = comp.layers.addNull(comp.duration);
        nul.name = pl.name + " Transform";
        if (pl.threeDLayer) {
            nul.threeDLayer = true;
        }
        var names = ["ADBE Anchor Point", "ADBE Scale", "ADBE Rotate Z"];
        if (pl.threeDLayer) {
            names.push("ADBE Rotate X", "ADBE Rotate Y", "ADBE Orientation");
        }
        for (var i = 0; i < names.length; i++) {
            K.copyProp(tprop(pl, names[i]), tprop(nul, names[i]), 0);
        }
        var srcPos = tprop(pl, "ADBE Position");
        if (srcPos.dimensionsSeparated) {
            tprop(nul, "ADBE Position").dimensionsSeparated = true;
            K.copyProp(tprop(pl, "ADBE Position_0"), tprop(nul, "ADBE Position_0"), 0);
            K.copyProp(tprop(pl, "ADBE Position_1"), tprop(nul, "ADBE Position_1"), 0);
            if (pl.threeDLayer) {
                K.copyProp(tprop(pl, "ADBE Position_2"), tprop(nul, "ADBE Position_2"), 0);
            }
        } else {
            K.copyProp(srcPos, tprop(nul, "ADBE Position"), 0);
        }
        if (pl.parent) {
            nul.setParentWithJump(pl.parent);
        }
        try {
            nul.inPoint = Math.min(pl.inPoint, pl.outPoint);
            nul.outPoint = Math.max(pl.inPoint, pl.outPoint);
        } catch (e) {}
        return nul;
    }

    function unprecompose(comp, pl, keepOriginal) {
        var src = pl.source;
        var n = src.numLayers;
        var i;
        if (n === 0) {
            S.warn(pl.name + ": the precomp is empty.");
            return [];
        }
        if (pl.timeRemapEnabled || !S.near(pl.stretch, 100, 0.001)) {
            S.warn(pl.name + ": time remap / stretch on the precomp layer is not carried over.");
        }
        try {
            if (pl.property("ADBE Effect Parade").numProperties > 0 || pl.property("ADBE Mask Parade").numProperties > 0) {
                S.warn(pl.name + ": effects and masks on the precomp layer are not carried over.");
            }
        } catch (e) {}

        var offset = pl.startTime;
        var identity = isIdentity(pl);

        // Copy bottom-up: every copy lands at index 1, so the stacking order is preserved.
        var copies = [];
        for (i = n; i >= 1; i--) {
            src.layer(i).copyToComp(comp);
            copies[i - 1] = comp.layer(1);
        }

        // copyToComp drops parenting and track mattes because the targets did not exist yet.
        for (i = 0; i < n; i++) {
            var original = src.layer(i + 1);
            var copy = copies[i];
            var wasLocked = copy.locked;
            if (wasLocked) {
                copy.locked = false;
            }
            try {
                copy.startTime = copy.startTime + offset;
            } catch (e1) {}
            try {
                if (original.parent) {
                    copy.setParentWithJump(copies[original.parent.index - 1]);
                }
            } catch (e2) {}
            try {
                if (original.trackMatteLayer) {
                    copy.setTrackMatte(copies[original.trackMatteLayer.index - 1], original.trackMatteType);
                }
            } catch (e3) {}
            if (wasLocked) {
                copy.locked = true;
            }
        }

        var carrier = null;
        if (!identity) {
            carrier = makeCarrier(comp, pl);
            for (i = 0; i < n; i++) {
                if (!copies[i].parent) {
                    S.unlocked(copies[i], function (l) {
                        l.setParentWithJump(carrier);
                    });
                }
            }
        }

        // Each moveBefore places the layer directly above the precomp layer, so going top-down
        // rebuilds the original order in place.
        if (carrier) {
            carrier.moveBefore(pl);
        }
        for (i = 0; i < n; i++) {
            copies[i].moveBefore(pl);
        }

        if (keepOriginal) {
            pl.enabled = false;
            try {
                pl.audioEnabled = false;
            } catch (e4) {}
        } else {
            pl.remove();
        }
        return copies;
    }

    S.register("comps.unprecompose", "Un-Precompose", function (a) {
        var comp = S.comp();
        var layers = S.layers(comp);
        var targets = [];
        var i;
        for (i = 0; i < layers.length; i++) {
            if (S.isPrecomp(layers[i])) {
                targets.push(layers[i]);
            }
        }
        if (!targets.length) {
            S.fail("Select a precomp layer to unpack.");
        }
        var all = [];
        for (i = 0; i < targets.length; i++) {
            if (targets[i].source.id === comp.id) {
                continue;
            }
            if (targets[i].locked) {
                targets[i].locked = false;
            }
            var copies = unprecompose(comp, targets[i], !!a.keepOriginal);
            for (var j = 0; j < copies.length; j++) {
                all.push(copies[j]);
            }
        }
        S.select(comp, all);
        return { precomps: targets.length, layers: all.length };
    });

    // ---- independent duplicates -----------------------------------------------------------
    function escapeRegExp(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    // Point comp("Old") references in expressions at the duplicated comps.
    function fixExpressions(group, pairs) {
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
            if (p.propertyType === PropertyType.PROPERTY) {
                try {
                    if (p.canSetExpression && p.expression) {
                        var ex = p.expression;
                        var out = ex;
                        for (var j = 0; j < pairs.length; j++) {
                            var re = new RegExp("comp\\(\\s*([\"'])" + escapeRegExp(pairs[j][0]) + "\\1\\s*\\)", "g");
                            out = out.replace(re, 'comp("' + pairs[j][1].replace(/"/g, '\\"') + '")');
                        }
                        if (out !== ex) {
                            p.expression = out;
                        }
                    }
                } catch (e2) {}
            } else {
                fixExpressions(p, pairs);
            }
        }
    }

    // Names of every comp in the project, so duplicates never collide with an existing name
    // (two comps with one name make comp("Name") expressions ambiguous).
    function compNames() {
        var names = {};
        var items = app.project.items;
        for (var i = 1; i <= items.length; i++) {
            if (items[i] instanceof CompItem) {
                names["n" + items[i].name] = true;
            }
        }
        return names;
    }

    function uniqueName(names, base) {
        var name = base;
        var n = 2;
        while (names["n" + name]) {
            name = base + " " + n;
            n++;
        }
        names["n" + name] = true;
        return name;
    }

    // ctx.map: original comp id -> duplicate. Shared nested comps are duplicated once and
    // reused, so the copy has the same internal structure as the original.
    function deepDuplicate(comp, ctx) {
        var key = "c" + comp.id;
        if (ctx.map[key]) {
            return ctx.map[key];
        }
        var dup = comp.duplicate();
        dup.name = uniqueName(ctx.names, comp.name + ctx.suffix);
        ctx.map[key] = dup;
        ctx.order.push([comp, dup]);
        for (var i = 1; i <= dup.numLayers; i++) {
            var layer = dup.layer(i);
            if (S.isPrecomp(layer)) {
                var inner = deepDuplicate(layer.source, ctx);
                S.unlocked(layer, function (l) {
                    l.replaceSource(inner, false);
                });
            }
        }
        return dup;
    }

    function finishDuplicates(order, fix) {
        if (!fix) {
            return;
        }
        var pairs = [];
        var i;
        for (i = 0; i < order.length; i++) {
            pairs.push([order[i][0].name, order[i][1].name]);
        }
        for (i = 0; i < order.length; i++) {
            var dup = order[i][1];
            for (var j = 1; j <= dup.numLayers; j++) {
                fixExpressions(dup.layer(j), pairs);
            }
        }
    }

    S.register("comps.duplicateDeep", "Independent Duplicate", function (a) {
        var suffix = a.suffix === undefined || a.suffix === "" ? " copy" : String(a.suffix);
        var targets = [];
        var sel = app.project.selection;
        var i;
        for (i = 0; i < sel.length; i++) {
            if (sel[i] instanceof CompItem) {
                targets.push(sel[i]);
            }
        }
        if (!targets.length) {
            targets.push(S.comp());
        }
        var ctx = { map: {}, order: [], suffix: suffix, names: compNames() };
        var top = [];
        for (i = 0; i < targets.length; i++) {
            top.push(deepDuplicate(targets[i], ctx).name);
        }
        finishDuplicates(ctx.order, a.fixExpressions !== false);
        return { comps: ctx.order.length, top: top };
    });

    S.register("comps.makeUnique", "Make Precomp Unique", function (a) {
        var comp = S.comp();
        var layers = S.layers(comp);
        var suffix = a.suffix === undefined || a.suffix === "" ? " copy" : String(a.suffix);
        var ctx = { map: {}, order: [], suffix: suffix, names: compNames() };
        var count = 0;
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (!S.isPrecomp(layer)) {
                continue;
            }
            // A fresh map per layer: every selected instance gets its own independent copy.
            ctx.map = {};
            var dup = deepDuplicate(layer.source, ctx);
            S.unlocked(layer, function (l) {
                l.replaceSource(dup, false);
            });
            count++;
        }
        if (!count) {
            S.fail("Select one or more precomp layers.");
        }
        finishDuplicates(ctx.order, a.fixExpressions !== false);
        return { layers: count, comps: ctx.order.length };
    });

    // ---- trim comp to its content ---------------------------------------------------------
    S.register("comps.trimToContent", "Trim Comp to Content", function () {
        var comp = S.comp();
        if (comp.numLayers === 0) {
            S.fail("The composition has no layers.");
        }
        var lo = Infinity;
        var hi = -Infinity;
        var i;
        for (i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i);
            lo = Math.min(lo, l.inPoint, l.outPoint);
            hi = Math.max(hi, l.inPoint, l.outPoint);
        }
        lo = Math.max(0, lo);
        if (hi - lo < comp.frameDuration) {
            S.fail("Nothing to trim to.");
        }
        if (lo > 0) {
            for (i = 1; i <= comp.numLayers; i++) {
                S.unlocked(comp.layer(i), function (layer) {
                    layer.startTime = layer.startTime - lo;
                });
            }
        }
        comp.duration = hi - lo;
        comp.workAreaStart = 0;
        comp.workAreaDuration = comp.duration;
        if (lo > 0) {
            S.warn("Content was shifted " + Math.round(lo / comp.frameDuration) + " frames earlier; layers using this comp elsewhere shift with it.");
        }
        return { duration: comp.duration };
    });
}($.global.Simplify));
