/**
 * klona/json - MIT License
 *
 * https://github.com/lukeed/klona/blob/master/license
 *
 * Extended with circular reference tracking to support
 * dereferenced OpenAPI schemas that contain self-referencing types.
 */ "use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "klona", {
    enumerable: true,
    get: function() {
        return klona;
    }
});
function klona(val, seen) {
    if (!seen) seen = new Map();
    var index, out, tmp;
    if (Array.isArray(val)) {
        if (seen.has(val)) return seen.get(val);
        out = Array(index = val.length);
        seen.set(val, out);
        while(index--)out[index] = (tmp = val[index]) && typeof tmp === "object" ? klona(tmp, seen) : tmp;
        return out;
    }
    if (Object.prototype.toString.call(val) === "[object Object]") {
        if (seen.has(val)) return seen.get(val);
        out = {}; // null
        seen.set(val, out);
        for(index in val){
            if (index === "__proto__") {
                Object.defineProperty(out, index, {
                    value: klona(val[index], seen),
                    configurable: true,
                    enumerable: true,
                    writable: true
                });
            } else {
                out[index] = (tmp = val[index]) && typeof tmp === "object" ? klona(tmp, seen) : tmp;
            }
        }
        return out;
    }
    return val;
}
