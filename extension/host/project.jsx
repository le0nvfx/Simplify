/*
 * Simplify — project safety: the two habits that save work when After Effects gets unstable.
 */
(function (S) {
    function pad(n, width) {
        var s = String(n);
        while (s.length < width) {
            s = "0" + s;
        }
        return s;
    }

    // "edit_v07.aep" -> "edit_v08.aep"; "edit.aep" -> "edit_v02.aep". Never overwrites a file.
    S.nextVersionName = function (base, exists) {
        var m = /^(.*?)(\d+)$/.exec(base);
        var stem = m ? m[1] : base + "_v";
        var width = m ? m[2].length : 2;
        var n = m ? parseInt(m[2], 10) + 1 : 2;
        var name = stem + pad(n, width);
        var guard = 0;
        while (exists(name) && guard < 10000) {
            n++;
            guard++;
            name = stem + pad(n, width);
        }
        return name;
    };

    S.register("project.saveIncrement", "Save New Version", function () {
        var file = app.project.file;
        if (!file) {
            S.fail("Save the project once first; after that this saves numbered versions.");
        }
        var full = file.displayName;
        var ext = /\.aepx$/i.test(full) ? ".aepx" : ".aep";
        var base = full.replace(/\.aepx?$/i, "");
        var folder = file.parent.fsName;
        var next = S.nextVersionName(base, function (name) {
            return new File(folder + "/" + name + ext).exists;
        });
        app.project.save(new File(folder + "/" + next + ext));
        return { name: next + ext };
    }, { undo: false });

    S.register("project.purge", "Purge Memory", function () {
        app.purge(PurgeTarget.ALL_CACHES);
        return {};
    }, { undo: false });
}($.global.Simplify));
