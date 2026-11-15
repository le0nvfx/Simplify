/*
 * Simplify — effect search: list every installed effect once, apply by match name.
 */
(function (S) {
    S.register("fx.list", "List Effects", function () {
        var all = app.effects;
        var out = [];
        for (var i = 0; i < all.length; i++) {
            var e = all[i];
            if (!e.displayName || !e.matchName || !e.category) {
                continue;
            }
            // [name, matchName, category] keeps the payload small for ~1000 effects.
            out.push([e.displayName, e.matchName, e.category]);
        }
        return out;
    }, { undo: false });

    S.register("fx.apply", "Apply Effect", function (a) {
        var comp = S.comp();
        var targets = [];
        var i;
        if (a.adjustment) {
            var sel = comp.selectedLayers;
            var lo = Infinity;
            var hi = -Infinity;
            var top = Infinity;
            for (i = 0; i < sel.length; i++) {
                lo = Math.min(lo, sel[i].inPoint, sel[i].outPoint);
                hi = Math.max(hi, sel[i].inPoint, sel[i].outPoint);
                top = Math.min(top, sel[i].index);
            }
            targets.push(sel.length ? S.makeAdjustment(comp, comp.layer(top), a.name || "Adjustment Layer", lo, hi)
                : S.makeAdjustment(comp, null, a.name || "Adjustment Layer"));
        } else {
            targets = S.layers(comp);
        }
        var applied = 0;
        for (i = 0; i < targets.length; i++) {
            var layer = targets[i];
            if (!S.isAV(layer)) {
                continue;
            }
            var done = S.unlocked(layer, function (l) {
                var fx = l.property("ADBE Effect Parade");
                if (!fx || !fx.canAddProperty(a.matchName)) {
                    return false;
                }
                fx.addProperty(a.matchName);
                return true;
            });
            if (done) {
                applied++;
            }
        }
        if (!applied) {
            S.fail("That effect cannot be applied to the selected layers.");
        }
        if (a.adjustment) {
            S.select(comp, targets);
        }
        return { applied: applied };
    });
}($.global.Simplify));
