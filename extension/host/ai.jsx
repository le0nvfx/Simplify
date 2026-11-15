/*
 * Simplify — assistant support: a compact description of the current comp for the model, and a
 * guarded runner for scripts the user has reviewed and chosen to run.
 */
(function (S) {
    function layerKind(layer) {
        if (layer instanceof TextLayer) {
            return "text";
        }
        if (layer instanceof ShapeLayer) {
            return "shape";
        }
        if (layer instanceof CameraLayer) {
            return "camera";
        }
        if (layer instanceof LightLayer) {
            return "light";
        }
        if (layer.nullObject) {
            return "null";
        }
        if (layer.adjustmentLayer) {
            return "adjustment";
        }
        if (S.isPrecomp(layer)) {
            return "precomp";
        }
        try {
            if (layer.source && layer.source.mainSource instanceof SolidSource) {
                return "solid";
            }
        } catch (e) {}
        return "footage";
    }

    function describe(layer, detailed) {
        var d = {
            index: layer.index,
            name: layer.name,
            kind: layerKind(layer),
            "in": Math.round(layer.inPoint * 1000) / 1000,
            out: Math.round(layer.outPoint * 1000) / 1000
        };
        if (layer.parent) {
            d.parent = layer.parent.index;
        }
        if (detailed) {
            try {
                var fx = layer.property("ADBE Effect Parade");
                var names = [];
                for (var i = 1; fx && i <= fx.numProperties && i <= 12; i++) {
                    names.push(fx.property(i).name + " (" + fx.property(i).matchName + ")");
                }
                if (names.length) {
                    d.effects = names;
                }
            } catch (e) {}
            if (layer.threeDLayer) {
                d.threeD = true;
            }
        }
        return d;
    }

    S.register("ai.context", "Comp Context", function () {
        var item = app.project ? app.project.activeItem : null;
        var out = { aeVersion: app.version };
        if (!item || !(item instanceof CompItem)) {
            out.comp = null;
            return out;
        }
        var i;
        out.comp = {
            name: item.name,
            width: item.width,
            height: item.height,
            frameRate: item.frameRate,
            duration: Math.round(item.duration * 1000) / 1000,
            time: Math.round(item.time * 1000) / 1000,
            numLayers: item.numLayers
        };
        out.layers = [];
        for (i = 1; i <= item.numLayers && i <= 40; i++) {
            out.layers.push(describe(item.layer(i), false));
        }
        out.selectedLayers = [];
        var sel = item.selectedLayers;
        for (i = 0; i < sel.length && i < 12; i++) {
            out.selectedLayers.push(describe(sel[i], true));
        }
        out.selectedProperties = [];
        var props = item.selectedProperties;
        for (i = 0; i < props.length && i < 12; i++) {
            try {
                if (props[i].propertyType === PropertyType.PROPERTY) {
                    out.selectedProperties.push({
                        name: props[i].name,
                        matchName: props[i].matchName,
                        keys: props[i].numKeys,
                        selectedKeys: props[i].selectedKeys.length,
                        hasExpression: props[i].expression !== ""
                    });
                }
            } catch (e) {}
        }
        return out;
    }, { undo: false });

    // Runs inside Simplify.run, so it is one undo step and any error is caught and reported.
    S.register("ai.run", "Run Assistant Script", function (a) {
        var code = String(a.code || "");
        if (!code) {
            S.fail("There is no script to run.");
        }
        var fn;
        try {
            fn = new Function(code);
        } catch (e) {
            S.fail("The script has a syntax error: " + (e.message || e));
        }
        var result = fn();
        return { result: result === undefined || result === null ? null : String(result) };
    });
}($.global.Simplify));
