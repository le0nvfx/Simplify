/*
 * Simplify — captions. The panel does transcription / subtitle parsing and sends timed cues;
 * this module turns them into styled, animated text layers (one layer per caption, so every
 * caption stays individually editable).
 *
 * cue: { start, end, text, words: [{ start, end, text }] }   (seconds, comp time)
 */
(function (S) {
    var TAG = "simplify-caption";
    var TRANSFORM = "ADBE Transform Group";
    var HOLD = KeyframeInterpolationType.HOLD;

    function tprop(layer, name) {
        return layer.property(TRANSFORM).property(name);
    }

    function textDocProp(layer) {
        return layer.property("ADBE Text Properties").property("ADBE Text Document");
    }

    function rgb(c, fallback) {
        if (c && c.length >= 3) {
            return [c[0], c[1], c[2]];
        }
        return fallback;
    }

    function styleDocument(layer, st, state) {
        var tp = textDocProp(layer);
        var doc = tp.value;
        if (st.font) {
            try {
                doc.font = st.font;
            } catch (e) {
                if (!state.fontWarned) {
                    S.warn("Font \"" + st.font + "\" was not found; the current font is used.");
                    state.fontWarned = true;
                }
            }
        }
        if (st.size) {
            doc.fontSize = st.size;
        }
        doc.applyFill = true;
        doc.fillColor = rgb(st.fill, [1, 1, 1]);
        if (st.strokeWidth > 0) {
            doc.applyStroke = true;
            doc.strokeColor = rgb(st.stroke, [0, 0, 0]);
            doc.strokeWidth = st.strokeWidth;
            try {
                doc.strokeOverFill = false;
            } catch (e1) {}
        } else {
            doc.applyStroke = false;
        }
        if (st.tracking !== undefined && st.tracking !== null) {
            try {
                doc.tracking = st.tracking;
            } catch (e2) {}
        }
        try {
            doc.justification = ParagraphJustification.CENTER_JUSTIFY;
        } catch (e3) {}
        tp.setValue(doc);
    }

    // Put the anchor in the middle of the text so scale animations grow from the centre.
    function centreAnchor(layer, t) {
        try {
            var r = layer.sourceRectAtTime(t, false);
            tprop(layer, "ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
        } catch (e) {}
    }

    function twoKeys(prop, t0, t1, v0, v1, bez) {
        prop.setValueAtTime(t0, v0);
        prop.setValueAtTime(t1, v1);
        if (bez) {
            try {
                S.ease.pair(prop, prop.nearestKeyIndex(t0), prop.nearestKeyIndex(t1), bez);
            } catch (e) {}
        }
    }

    // ---- text animators -------------------------------------------------------------------
    // Returns the selector of a new animator that selects by word index.
    function addWordAnimator(layer, name, propertyMatchName, value) {
        var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
        var animator = animators.addProperty("ADBE Text Animator");
        animator.name = name;
        var index = animator.propertyIndex;
        animator.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
        // Re-resolve after every addProperty: earlier references are invalidated.
        animator = layer.property("ADBE Text Properties").property("ADBE Text Animators").property(index);
        animator.property("ADBE Text Animator Properties").addProperty(propertyMatchName);
        animator = layer.property("ADBE Text Properties").property("ADBE Text Animators").property(index);
        animator.property("ADBE Text Animator Properties").property(propertyMatchName).setValue(value);
        var selector = animator.property("ADBE Text Selectors").property(1);
        var advanced = selector.property("ADBE Text Range Advanced");
        advanced.property("ADBE Text Range Units").setValue(2);   // index
        advanced.property("ADBE Text Range Type2").setValue(3);   // words
        return selector;
    }

    function holdKey(prop, t, v) {
        prop.setValueAtTime(t, v);
        var k = prop.nearestKeyIndex(t);
        prop.setInterpolationTypeAtKey(k, HOLD, HOLD);
    }

    function wordTimes(cue, count, offset) {
        var times = [];
        var i;
        var words = cue.words || [];
        if (words.length === count) {
            for (i = 0; i < count; i++) {
                times.push(Math.max(cue.start, words[i].start) + offset);
            }
        } else {
            // No per-word timing: spread the words evenly over the caption.
            for (i = 0; i < count; i++) {
                times.push(cue.start + offset + (cue.end - cue.start) * i / count);
            }
        }
        return times;
    }

    function addHighlight(layer, cue, count, color, offset) {
        var selector = addWordAnimator(layer, "Highlight", "ADBE Text Fill Color", color);
        var start = selector.property("ADBE Text Index Start");
        var end = selector.property("ADBE Text Index End");
        var times = wordTimes(cue, count, offset);
        for (var i = 0; i < count; i++) {
            holdKey(start, times[i], i);
            holdKey(end, times[i], i + 1);
        }
    }

    function addWordReveal(layer, cue, count, offset) {
        var selector = addWordAnimator(layer, "Reveal", "ADBE Text Opacity", 0);
        var start = selector.property("ADBE Text Index Start");
        selector.property("ADBE Text Index End").setValue(count);
        var times = wordTimes(cue, count, offset);
        // Start = number of words already shown; everything after it stays hidden.
        for (var i = 0; i < count; i++) {
            holdKey(start, times[i], i + 1);
        }
    }

    // ---- entrance animation ---------------------------------------------------------------
    var EASE_OUT = [0.23, 1, 0.32, 1];
    var BACK_OUT = [0.34, 1.56, 0.64, 1];

    function animateIn(layer, st, t0, len, fd) {
        var anim = st.anim || "pop";
        var frames = function (n) {
            return Math.min(n * fd, len / 2);
        };
        var opacity = tprop(layer, "ADBE Opacity");
        if (anim === "pop") {
            var scale = tprop(layer, "ADBE Scale");
            twoKeys(scale, t0, t0 + frames(6), [78, 78], [100, 100], BACK_OUT);
            twoKeys(opacity, t0, t0 + frames(2), 0, 100, null);
        } else if (anim === "fade") {
            twoKeys(opacity, t0, t0 + frames(5), 0, 100, EASE_OUT);
        } else if (anim === "slide") {
            var pos = tprop(layer, "ADBE Position");
            var p = pos.value;
            var from = [p[0], p[1] + (st.size || 60) * 0.5];
            twoKeys(pos, t0, t0 + frames(7), from, [p[0], p[1]], EASE_OUT);
            twoKeys(opacity, t0, t0 + frames(3), 0, 100, null);
        }
        if (st.fadeOut) {
            var end = t0 + len - fd;
            twoKeys(opacity, Math.max(t0 + len / 2, end - 3 * fd), end, 100, 0, null);
        }
    }

    // ---- build ----------------------------------------------------------------------------
    S.register("captions.build", "Build Captions", function (a) {
        var comp = S.comp();
        var cues = a.cues || [];
        var st = a.style || {};
        var fd = comp.frameDuration;
        var offset = Number(a.offset) || 0;
        var state = { fontWarned: false };
        var made = [];
        var animatorFailed = false;
        if (!cues.length) {
            S.fail("There are no captions to build.");
        }
        var x = comp.width * (st.x === undefined ? 0.5 : st.x);
        var y = comp.height * (st.y === undefined ? 0.82 : st.y);

        for (var i = 0; i < cues.length; i++) {
            var cue = cues[i];
            var t0 = Math.round((cue.start + offset) / fd) * fd;
            var t1 = Math.round((cue.end + offset) / fd) * fd;
            if (t0 < 0) {
                t0 = 0;
            }
            if (t1 > comp.duration) {
                t1 = comp.duration;
            }
            if (t0 >= comp.duration || t1 - t0 < fd) {
                continue;
            }
            var text = String(cue.text).replace(/\r?\n/g, "\r");
            var layer = comp.layers.addText(text);
            layer.name = "CC " + (made.length + 1) + " " + String(cue.text).replace(/\s+/g, " ").substr(0, 28);
            layer.comment = TAG;
            layer.label = 9;
            styleDocument(layer, st, state);
            centreAnchor(layer, 0);
            tprop(layer, "ADBE Position").setValue([x, y]);
            layer.inPoint = t0;
            layer.outPoint = t1;

            var count = String(cue.text).replace(/^\s+|\s+$/g, "").split(/\s+/).length;
            if (!animatorFailed) {
                try {
                    if (st.anim === "words") {
                        addWordReveal(layer, cue, count, offset);
                    }
                    if (st.highlight && st.highlightColor) {
                        addHighlight(layer, cue, count, rgb(st.highlightColor, [1, 0.85, 0]), offset);
                    }
                } catch (e) {
                    animatorFailed = true;
                    S.warn("Word animation could not be created in this After Effects version.");
                }
            }
            animateIn(layer, st, t0, t1 - t0, fd);
            made.push(layer);
        }
        if (!made.length) {
            S.fail("All captions fall outside the composition's duration.");
        }
        S.select(comp, []);
        return { count: made.length };
    });

    function captionLayers(comp) {
        var out = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).comment === TAG) {
                out.push(comp.layer(i));
            }
        }
        return out;
    }

    S.register("captions.clear", "Remove Captions", function () {
        var comp = S.comp();
        var list = captionLayers(comp);
        if (!list.length) {
            S.fail("This composition has no Simplify captions.");
        }
        for (var i = list.length - 1; i >= 0; i--) {
            list[i].locked = false;
            list[i].remove();
        }
        return { removed: list.length };
    });

    function readStyle(layer) {
        var doc = textDocProp(layer).value;
        var out = { font: doc.font, size: doc.fontSize };
        try {
            if (doc.applyFill) {
                out.fill = doc.fillColor;
            }
        } catch (e) {}
        try {
            out.strokeWidth = doc.applyStroke ? doc.strokeWidth : 0;
            if (doc.applyStroke) {
                out.stroke = doc.strokeColor;
            }
        } catch (e1) {}
        try {
            out.tracking = doc.tracking;
        } catch (e2) {}
        return out;
    }

    function selectedTextLayer(comp) {
        var sel = comp.selectedLayers;
        for (var i = 0; i < sel.length; i++) {
            if (sel[i] instanceof TextLayer) {
                return sel[i];
            }
        }
        S.fail("Select a text layer to take the style from.");
    }

    S.register("captions.readStyle", "Read Text Style", function () {
        var comp = S.comp();
        var layer = selectedTextLayer(comp);
        var st = readStyle(layer);
        var pos = tprop(layer, "ADBE Position").value;
        st.x = pos[0] / comp.width;
        st.y = pos[1] / comp.height;
        return st;
    }, { undo: false });

    // Style one caption by hand, then push that look onto every other caption.
    S.register("captions.restyle", "Restyle Captions", function () {
        var comp = S.comp();
        var source = selectedTextLayer(comp);
        var st = readStyle(source);
        var list = captionLayers(comp);
        var state = { fontWarned: false };
        var n = 0;
        for (var i = 0; i < list.length; i++) {
            if (list[i].index === source.index) {
                continue;
            }
            S.unlocked(list[i], function (l) {
                styleDocument(l, st, state);
            });
            n++;
        }
        if (!n) {
            S.fail("No other Simplify captions found in this composition.");
        }
        return { count: n };
    });

    // Media behind the selected layer, for transcription.
    S.register("captions.source", "Caption Source", function () {
        var comp = S.comp();
        var sel = comp.selectedLayers;
        for (var i = 0; i < sel.length; i++) {
            var layer = sel[i];
            var file = null;
            try {
                if (layer.hasAudio && layer.source && layer.source.mainSource && layer.source.mainSource.file) {
                    file = layer.source.mainSource.file;
                }
            } catch (e) {}
            if (file) {
                var lo = Math.min(layer.inPoint, layer.outPoint);
                var hi = Math.max(layer.inPoint, layer.outPoint);
                return {
                    path: file.fsName,
                    name: layer.name,
                    // position inside the source file where the layer starts playing
                    sourceStart: Math.max(0, (lo - layer.startTime) * 100 / (layer.stretch || 100)),
                    duration: (hi - lo) * 100 / (layer.stretch || 100),
                    compStart: lo,
                    stretch: layer.stretch || 100,
                    remapped: !!layer.timeRemapEnabled
                };
            }
        }
        S.fail("Select a footage or audio layer that has sound.");
    }, { undo: false });
}($.global.Simplify));
