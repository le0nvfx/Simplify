/*
 * Simplify — host core (ExtendScript, ES3 only: no let/const, arrows, trailing commas).
 *
 * Every panel action goes through Simplify.run(name, argsJson). That single entry point
 *  - wraps the action in one undo group (one Ctrl+Z reverts the whole action),
 *  - catches every exception so a failing action can never take After Effects down with it,
 *  - returns a JSON envelope: { ok, data, warnings } or { ok:false, error, user }.
 */
(function (g) {
    var S = {
        version: "0.1.0",
        fn: {},
        ready: false,
        root: null,
        _warnings: []
    };
    g.Simplify = S;

    // ---- errors ---------------------------------------------------------------------------
    // A UserError is an expected condition ("select a layer first"), shown as a hint in the
    // panel rather than as a failure.
    function UserError(message) {
        this.message = message;
        this.user = true;
    }
    UserError.prototype = new Error();
    S.UserError = UserError;

    S.fail = function (message) {
        throw new UserError(message);
    };

    S.warn = function (message) {
        if (S._warnings.length < 20) {
            S._warnings.push(String(message));
        }
    };

    // ---- registry -------------------------------------------------------------------------
    // opts.undo === false  -> read-only action, no undo group
    S.register = function (name, label, fn, opts) {
        fn.label = label;
        fn.undo = !(opts && opts.undo === false);
        S.fn[name] = fn;
    };

    S.run = function (name, argsJson) {
        var res;
        var opened = false;
        S._warnings = [];
        try {
            var fn = S.fn[name];
            if (!fn) {
                throw new Error("Unknown action: " + name);
            }
            var args = argsJson ? S.json.parse(argsJson) : {};
            if (fn.undo) {
                app.beginUndoGroup("Simplify: " + fn.label);
                opened = true;
            }
            var data = fn(args || {});
            res = { ok: true, data: data === undefined ? null : data, warnings: S._warnings };
        } catch (e) {
            res = {
                ok: false,
                user: !!(e && e.user),
                error: String((e && e.message) || e),
                line: e && e.line ? e.line : null,
                file: e && e.fileName ? String(e.fileName).replace(/^.*[\/\\]/, "") : null,
                warnings: S._warnings
            };
        }
        if (opened) {
            try {
                app.endUndoGroup();
            } catch (e2) {}
        }
        try {
            return S.json.stringify(res);
        } catch (e3) {
            return '{"ok":false,"error":"Could not serialise the result."}';
        }
    };

    // ---- shared helpers -------------------------------------------------------------------
    S.comp = function () {
        var item = app.project ? app.project.activeItem : null;
        if (!item || !(item instanceof CompItem)) {
            S.fail("Open a composition first.");
        }
        return item;
    };

    S.layers = function (comp, min) {
        var sel = comp.selectedLayers;
        var need = min || 1;
        if (!sel || sel.length < need) {
            S.fail(need > 1 ? "Select at least " + need + " layers." : "Select at least one layer.");
        }
        // copy: the live array changes while layers are added or removed
        var out = [];
        for (var i = 0; i < sel.length; i++) {
            out.push(sel[i]);
        }
        return out;
    };

    // Text and shape layers do not reliably report as AVLayer through instanceof.
    S.isAV = function (layer) {
        return (layer instanceof AVLayer) || (layer instanceof TextLayer) || (layer instanceof ShapeLayer);
    };

    S.isPrecomp = function (layer) {
        var src = null;
        try {
            src = layer.source;
        } catch (e) {}
        return !!(src && (src instanceof CompItem));
    };

    // Run fn on a layer that may be locked, restoring the lock afterwards.
    S.unlocked = function (layer, fn) {
        var was = layer.locked;
        if (was) {
            layer.locked = false;
        }
        try {
            return fn(layer);
        } finally {
            if (was) {
                try {
                    layer.locked = true;
                } catch (e) {}
            }
        }
    };

    S.select = function (comp, layers) {
        var i;
        var cur = comp.selectedLayers;
        for (i = cur.length - 1; i >= 0; i--) {
            cur[i].selected = false;
        }
        for (i = 0; i < layers.length; i++) {
            try {
                layers[i].selected = true;
            } catch (e) {}
        }
    };

    S.near = function (a, b, eps) {
        return Math.abs(a - b) <= (eps === undefined ? 0.001 : eps);
    };

    S.plural = function (n, word) {
        return n + " " + word + (n === 1 ? "" : "s");
    };

    // ---- module loader --------------------------------------------------------------------
    var MODULES = [
        "json.jsx", "keys.jsx", "comps.jsx", "layers.jsx", "presets.jsx", "ease.jsx",
        "expressions.jsx", "fx.jsx", "captions.jsx", "ai.jsx"
    ];

    S.load = function (root) {
        var base = new Folder(root);
        for (var i = 0; i < MODULES.length; i++) {
            var f = new File(base.fsName + "/host/" + MODULES[i]);
            if (!f.exists) {
                throw new Error("Simplify: missing host file " + MODULES[i]);
            }
            $.evalFile(f);
        }
        S.root = base.fsName;
        S.ready = true;
        return S.version;
    };

    // 16 is the command id of Edit > Undo; it steps back the last undo group (one Simplify action).
    S.register("core.undo", "Undo", function () {
        app.executeCommand(16);
    }, { undo: false });

    S.register("core.info", "Info", function () {
        var canWrite = true;
        try {
            canWrite = app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY") === 1;
        } catch (e) {}
        return {
            version: S.version,
            ae: app.version,
            build: app.buildName,
            language: app.isoLanguage,
            canWriteFiles: canWrite
        };
    }, { undo: false });
}($.global));
