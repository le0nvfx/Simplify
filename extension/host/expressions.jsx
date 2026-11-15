/*
 * Simplify — expressions: apply / read / clear on the selected properties.
 */
(function (S) {
    function selectedProps(comp) {
        var props = comp.selectedProperties;
        var out = [];
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            try {
                if (p.propertyType === PropertyType.PROPERTY && p.canSetExpression) {
                    out.push(p);
                }
            } catch (e) {}
        }
        return out;
    }

    function resolve(layer, path) {
        var p = layer;
        for (var i = 0; i < path.length; i++) {
            try {
                p = p.property(path[i]);
            } catch (e) {
                return null;
            }
            if (!p) {
                return null;
            }
        }
        return p;
    }

    // a.code: the expression. a.target: optional matchName path from the layer, used when no
    // property is selected (e.g. "Auto fade" goes to Opacity with just layers selected).
    S.register("expr.apply", "Apply Expression", function (a) {
        var comp = S.comp();
        var props = selectedProps(comp);
        var i;
        if (!props.length && a.target && a.target.length) {
            var layers = comp.selectedLayers;
            for (i = 0; i < layers.length; i++) {
                var p = resolve(layers[i], a.target);
                if (p && p.canSetExpression) {
                    props.push(p);
                }
            }
        }
        if (!props.length) {
            S.fail(a.target && a.target.length ? "Select a layer or a property first."
                : "Select the property the expression should go on.");
        }
        var applied = 0;
        var firstError = "";
        for (i = 0; i < props.length; i++) {
            try {
                props[i].expression = String(a.code);
                if (props[i].expressionError) {
                    if (!firstError) {
                        firstError = String(props[i].expressionError).split(/[\r\n]/)[0];
                    }
                } else {
                    applied++;
                }
            } catch (e) {
                if (!firstError) {
                    firstError = String(e.message || e);
                }
            }
        }
        if (firstError) {
            S.warn("Expression error: " + firstError);
        }
        return { applied: applied, total: props.length };
    });

    S.register("expr.clear", "Remove Expressions", function () {
        var comp = S.comp();
        var props = selectedProps(comp);
        var n = 0;
        var i;
        if (!props.length) {
            // No property selected: clear every expression on the selected layers.
            var layers = S.layers(comp);
            var stack = [];
            for (i = 0; i < layers.length; i++) {
                stack.push(layers[i]);
            }
            while (stack.length) {
                var g = stack.pop();
                var count = 0;
                try {
                    count = g.numProperties;
                } catch (e) {}
                for (var j = 1; j <= count; j++) {
                    var p = null;
                    try {
                        p = g.property(j);
                    } catch (e1) {}
                    if (!p) {
                        continue;
                    }
                    if (p.propertyType === PropertyType.PROPERTY) {
                        try {
                            if (p.canSetExpression && p.expression !== "") {
                                props.push(p);
                            }
                        } catch (e2) {}
                    } else {
                        stack.push(p);
                    }
                }
            }
        }
        for (i = 0; i < props.length; i++) {
            try {
                if (props[i].expression !== "") {
                    props[i].expression = "";
                    n++;
                }
            } catch (e3) {}
        }
        if (!n) {
            S.fail("No expressions found on the selection.");
        }
        return { removed: n };
    });

    S.register("expr.read", "Read Expression", function () {
        var comp = S.comp();
        var props = selectedProps(comp);
        for (var i = 0; i < props.length; i++) {
            if (props[i].expression !== "") {
                return { code: props[i].expression, property: props[i].name };
            }
        }
        S.fail("Select a property that has an expression.");
    }, { undo: false });
}($.global.Simplify));
