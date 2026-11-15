/*
 * Simplify — JSON for ExtendScript (which ships without a JSON object).
 * parse() validates the text against the JSON grammar before evaluating it (the json2 approach),
 * so only data can ever be evaluated. stringify() escapes everything outside printable ASCII so
 * results survive the CEP bridge on every platform.
 */
(function (S) {
    var J = {};
    S.json = J;

    function pad4(n) {
        var s = n.toString(16);
        while (s.length < 4) {
            s = "0" + s;
        }
        return s;
    }

    function quote(str) {
        var out = '"';
        for (var i = 0; i < str.length; i++) {
            var c = str.charAt(i);
            var code = str.charCodeAt(i);
            if (c === '"') {
                out += '\\"';
            } else if (c === "\\") {
                out += "\\\\";
            } else if (c === "\n") {
                out += "\\n";
            } else if (c === "\r") {
                out += "\\r";
            } else if (c === "\t") {
                out += "\\t";
            } else if (code < 32 || code > 126) {
                out += "\\u" + pad4(code);
            } else {
                out += c;
            }
        }
        return out + '"';
    }

    function isArray(v) {
        return Object.prototype.toString.call(v) === "[object Array]";
    }

    function str(v) {
        var t = typeof v;
        var parts, i, k, s;
        if (v === null || v === undefined) {
            return "null";
        }
        if (t === "number") {
            return isFinite(v) ? String(v) : "null";
        }
        if (t === "boolean") {
            return v ? "true" : "false";
        }
        if (t === "string") {
            return quote(v);
        }
        if (t === "object") {
            parts = [];
            if (isArray(v)) {
                for (i = 0; i < v.length; i++) {
                    parts.push(str(v[i]));
                }
                return "[" + parts.join(",") + "]";
            }
            for (k in v) {
                if (Object.prototype.hasOwnProperty.call(v, k)) {
                    s = v[k];
                    if (s !== undefined && typeof s !== "function") {
                        parts.push(quote(String(k)) + ":" + str(s));
                    }
                }
            }
            return "{" + parts.join(",") + "}";
        }
        return "null";
    }

    J.stringify = function (value) {
        return str(value);
    };

    J.parse = function (text) {
        var t = String(text);
        var check = t
            .replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@")
            .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]")
            .replace(/(?:^|:|,)(?:\s*\[)+/g, "");
        if (!/^[\],:{}\s]*$/.test(check)) {
            throw new Error("Invalid JSON");
        }
        return eval("(" + t + ")");
    };

    if (typeof JSON !== "object" || !JSON) {
        $.global.JSON = { parse: J.parse, stringify: J.stringify };
    }
}($.global.Simplify));
