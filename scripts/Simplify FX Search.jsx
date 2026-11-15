/*
 * Simplify FX Search — a standalone effect search you can put on a keyboard shortcut.
 *
 * Install: copy this file into After Effects' Scripts folder
 *   Windows  C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts
 *   macOS    /Applications/Adobe After Effects <version>/Scripts
 * restart After Effects, then assign a key under Edit > Keyboard Shortcuts (search for
 * "Simplify FX Search"). The spacebar itself cannot be used: After Effects reserves it for
 * playback, and only native plug-ins can intercept it.
 *
 * Type to filter, Up/Down to choose, Enter to apply to the selected layers,
 * Shift+Enter (or Shift+click Apply) to put the effect on a new adjustment layer.
 * ExtendScript (ES3). Works without the Simplify panel.
 */
(function () {
    var SECTION = "Simplify";
    var KEY = "recentEffects";
    var MAX_ROWS = 40;

    var comp = app.project ? app.project.activeItem : null;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Open a composition first.", "Simplify FX Search");
        return;
    }

    // ---- data ----
    var all = [];
    var i;
    for (i = 0; i < app.effects.length; i++) {
        var e = app.effects[i];
        if (e.displayName && e.matchName && e.category) {
            all.push({ name: e.displayName, match: e.matchName, category: e.category, lower: e.displayName.toLowerCase() });
        }
    }

    function recent() {
        try {
            if (app.settings.haveSetting(SECTION, KEY)) {
                return app.settings.getSetting(SECTION, KEY).split("\n");
            }
        } catch (err) {}
        return [];
    }

    function remember(matchName) {
        var list = recent();
        var out = [matchName];
        for (var r = 0; r < list.length && out.length < 10; r++) {
            if (list[r] && list[r] !== matchName) {
                out.push(list[r]);
            }
        }
        try {
            app.settings.saveSetting(SECTION, KEY, out.join("\n"));
        } catch (err) {}
    }

    // Prefix > word start > substring > initials ("gb" finds Gaussian Blur).
    function score(q, item) {
        var t = item.lower;
        if (t.indexOf(q) === 0) {
            return 800 - t.length;
        }
        var at = t.indexOf(" " + q);
        if (at !== -1) {
            return 600 - at;
        }
        at = t.indexOf(q);
        if (at !== -1) {
            return 400 - at;
        }
        var words = t.split(/[\s\-_\/]+/);
        var initials = "";
        for (var w = 0; w < words.length; w++) {
            initials += words[w].charAt(0);
        }
        if (initials.indexOf(q) === 0) {
            return 300 - t.length;
        }
        return 0;
    }

    function find(query) {
        var q = query.toLowerCase().replace(/^\s+|\s+$/g, "");
        var hits = [];
        var n;
        if (!q) {
            var rec = recent();
            for (n = 0; n < rec.length; n++) {
                for (var m = 0; m < all.length; m++) {
                    if (all[m].match === rec[n]) {
                        hits.push(all[m]);
                        break;
                    }
                }
            }
            return hits;
        }
        var scored = [];
        for (n = 0; n < all.length; n++) {
            var s = score(q, all[n]);
            if (s > 0) {
                scored.push({ s: s, item: all[n] });
            }
        }
        scored.sort(function (a, b) {
            return b.s - a.s;
        });
        for (n = 0; n < scored.length && n < MAX_ROWS; n++) {
            hits.push(scored[n].item);
        }
        return hits;
    }

    // ---- window ----
    var win = new Window("dialog", "Simplify FX Search");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 8;
    win.margins = 12;

    var input = win.add("edittext", undefined, "");
    input.characters = 36;
    var list = win.add("listbox", undefined, [], { multiselect: false });
    list.preferredSize = [380, 280];
    win.add("statictext", undefined, "Enter: apply    Shift+Enter: on a new adjustment layer    Esc: close");
    var buttons = win.add("group");
    buttons.alignment = ["right", "top"];
    var cancel = buttons.add("button", undefined, "Cancel", { name: "cancel" });
    var ok = buttons.add("button", undefined, "Apply", { name: "ok" });

    var shown = [];

    function refresh() {
        shown = find(input.text);
        list.removeAll();
        for (var r = 0; r < shown.length; r++) {
            list.add("item", shown[r].name + "   \u00B7   " + shown[r].category);
        }
        if (shown.length) {
            list.selection = 0;
        }
    }

    function move(step) {
        if (!shown.length) {
            return;
        }
        var cur = list.selection ? list.selection.index : 0;
        var next = cur + step;
        if (next < 0) {
            next = shown.length - 1;
        }
        if (next >= shown.length) {
            next = 0;
        }
        list.selection = next;
    }

    function apply() {
        if (!shown.length || !list.selection) {
            return;
        }
        var fx = shown[list.selection.index];
        var onAdjustment = false;
        try {
            onAdjustment = ScriptUI.environment.keyboardState.shiftKey;
        } catch (err) {}
        var sel = comp.selectedLayers;
        if (!onAdjustment && !sel.length) {
            alert("Select a layer first, or hold Shift to add the effect on a new adjustment layer.", "Simplify FX Search");
            return;
        }
        win.close();
        app.beginUndoGroup("Simplify: " + fx.name);
        try {
            var applied = 0;
            var t;
            if (onAdjustment) {
                var lo = Infinity;
                var hi = -Infinity;
                var top = Infinity;
                for (t = 0; t < sel.length; t++) {
                    lo = Math.min(lo, sel[t].inPoint, sel[t].outPoint);
                    hi = Math.max(hi, sel[t].inPoint, sel[t].outPoint);
                    top = Math.min(top, sel[t].index);
                }
                var above = sel.length ? comp.layer(top) : null;
                var solid = comp.layers.addSolid([1, 1, 1], fx.name, comp.width, comp.height, comp.pixelAspect, comp.duration);
                solid.adjustmentLayer = true;
                solid.label = 5;
                if (above) {
                    solid.moveBefore(above);
                    if (hi > lo) {
                        solid.inPoint = lo;
                        solid.outPoint = hi;
                    }
                }
                solid.property("ADBE Effect Parade").addProperty(fx.match);
                applied = 1;
            } else {
                for (t = 0; t < sel.length; t++) {
                    var group = sel[t].property("ADBE Effect Parade");
                    if (group && group.canAddProperty(fx.match)) {
                        var locked = sel[t].locked;
                        if (locked) {
                            sel[t].locked = false;
                        }
                        group.addProperty(fx.match);
                        if (locked) {
                            sel[t].locked = true;
                        }
                        applied++;
                    }
                }
            }
            if (applied) {
                remember(fx.match);
            } else {
                alert("\"" + fx.name + "\" cannot be applied to the selected layers.", "Simplify FX Search");
            }
        } catch (err2) {
            alert("Could not apply the effect: " + err2.message, "Simplify FX Search");
        }
        app.endUndoGroup();
    }

    input.onChanging = refresh;
    input.addEventListener("keydown", function (k) {
        if (k.keyName === "Down") {
            move(1);
            k.preventDefault();
        } else if (k.keyName === "Up") {
            move(-1);
            k.preventDefault();
        }
    });
    list.onDoubleClick = apply;
    ok.onClick = apply;
    cancel.onClick = function () {
        win.close();
    };

    win.onShow = function () {
        input.active = true;
    };
    refresh();
    win.center();
    win.show();
}());
