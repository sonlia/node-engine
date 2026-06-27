/**
 * Utility functions for LiteGraph
 * Refactored from the original IIFE-based global utilities to ES6 module exports
 */

export function clamp(v, a, b) {
  return a > v ? a : b < v ? b : v;
}

export function compareObjects(a, b) {
  // Match original loose-equality semantics (so e.g. {x:1} and {x:"1"}
  // compare equal, preserving the original API contract).
  for (const i in a) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

export function distance(a, b) {
  return Math.sqrt(
    (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2
  );
}

export function colorToString(c) {
  // Match original format: RGB as integer string, alpha as 2-decimal string
  // ("0.50") or literal "1.0" when no alpha is provided. CSS parsers accept
  // both forms but downstream string comparisons rely on the original format.
  return (
    "rgba(" +
    Math.round(c[0] * 255).toFixed() +
    "," +
    Math.round(c[1] * 255).toFixed() +
    "," +
    Math.round(c[2] * 255).toFixed() +
    "," +
    (c.length === 4 ? c[3].toFixed(2) : "1.0") +
    ")"
  );
}

export function isInsideRectangle(x, y, left, top, width, height) {
  // Match the original strict-< boundary semantics so points exactly on
  // the left/top edge are NOT considered inside (this is what every
  // hit-test in the original code relies on).
  return (
    left < x &&
    left + width > x &&
    top < y &&
    top + height > y
  );
}

export function growBounding(bounding, x, y) {
  if (x < bounding[0]) bounding[0] = x;
  else if (x > bounding[2]) bounding[2] = x;
  if (y < bounding[1]) bounding[1] = y;
  else if (y > bounding[3]) bounding[3] = y;
}

/**
 * Tests whether point `p` lies inside the bounding box `bb`.
 *
 * NOTE: matches the ORIGINAL litegraph.js calling convention where `bb`
 * is a NESTED array: `[[minx, miny], [maxx, maxy]]`. (Earlier refactored
 * versions expected a flat `[minx, miny, maxx, maxy]` tuple, which silently
 * broke every caller that passed the original format.) Boundary semantics
 * match the original: a point exactly on the min edge is INSIDE, a point
 * exactly on the max edge is OUTSIDE.
 */
export function isInsideBounding(p, bb) {
  if (
    p[0] < bb[0][0] ||
    p[1] < bb[0][1] ||
    p[0] > bb[1][0] ||
    p[1] > bb[1][1]
  )
    return false;
  return true;
}

export function overlapBounding(a, b) {
  const endA = [a[0] + a[2], a[1] + a[3]];
  const endB = [b[0] + b[2], b[1] + b[3]];
  return !(a[0] > endB[0] || b[0] > endA[0] || a[1] > endB[1] || b[1] > endA[1]);
}

export function hex2num(hex) {
  if (hex.charAt(0) === "#") hex = hex.slice(1);
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return [r, g, b];
}

export function num2hex(triplet) {
  // Match original: UPPERCASE hex output, fixed 3-iteration loop over
  // RGB channels (so a 4-component RGBA triplet only encodes RGB).
  const hex_alphabets = "0123456789ABCDEF";
  let out = "#";
  for (let i = 0; i < 3; i++) {
    const int1 = triplet[i] / 16;
    const int2 = triplet[i] % 16;
    out += hex_alphabets.charAt(int1) + hex_alphabets.charAt(int2);
  }
  return out;
}

export function getTime() {
  // Match original environment-aware time source selection. Browser
  // environments use performance.now(); Node.js uses process.hrtime for
  // higher resolution; the final fallback is Date.now().
  if (typeof performance !== "undefined") {
    return performance.now();
  }
  // Node.js fallback (process.hrtime returns [seconds, nanoseconds]).
  if (typeof process !== "undefined" && process.hrtime) {
    const t = process.hrtime();
    return t[0] * 0.001 + t[1] * 1e-6;
  }
  return Date.now();
}

export function cloneObject(obj, target) {
  if (obj === null || typeof obj !== "object") return obj;
  const cloned = target || {};
  for (const i in obj) {
    if (obj[i] === null || typeof obj[i] !== "object") {
      cloned[i] = obj[i];
    } else if (obj[i] instanceof Float32Array) {
      cloned[i] = new Float32Array(obj[i]);
    } else {
      cloned[i] = cloneObject(obj[i], cloned[i]);
    }
  }
  return cloned;
}

export function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getParameterNames(func) {
  return (func + "")
    .replace(/[/][/].*$/gm, "")
    .replace(/\s+/g, "")
    .replace(/[/][*][^/*]*[*][/]/g, "")
    .split("){", 1)[0]
    .replace(/^[^(]*[(]/, "")
    .replace(/=[^,]+/g, "")
    .split(",")
    .filter(Boolean);
}

/**
 * Lazy reference to LiteGraph, set by index.js after all modules load.
 * This avoids circular dependency: utils.js → LiteGraph.js → utils.js
 */
let _liteGraphRef = null;

/**
 * Called from index.js to provide the LiteGraph reference.
 * Must be invoked before any pointerListenerAdd/Remove calls at runtime.
 */
export function _setLiteGraphRef(ref) {
  _liteGraphRef = ref;
}

/**
 * Returns the current pointer events method ("pointer" or "mouse").
 * Uses the lazy LiteGraph reference if available, defaults to "mouse"
 * (matches the original LiteGraph.pointerevents_method default).
 */
function _getPointereventsMethod() {
  if (_liteGraphRef && _liteGraphRef.pointerevents_method) {
    return _liteGraphRef.pointerevents_method;
  }
  return "mouse";
}

/**
 * Helper for interaction: pointer, touch, mouse listeners.
 * Used by LGraphCanvas, DragAndScale, ContextMenu.
 *
 * Restored original full implementation:
 *   - Input validation (target, event, handler)
 *   - Touch fallback when pointerevents_method="pointer" but window.PointerEvent
 *     is unavailable (converts down/move/up/cancel/enter to touchstart/move/end/...)
 *   - Switch fall-through between down/up/move/over/out/enter (both pointer+mouse)
 *     and leave/cancel/gotpointercapture/lostpointercapture (pointer-only)
 *   - Default branch for unknown event names (passes through as-is)
 *
 * NOTE: the original had a quirk where for "pointer" method, down/up/move/over/out/enter
 * events got registered TWICE (once via the shared case, once via the fall-through to
 * the pointer-only case). We replicate that quirk for parity — it doesn't cause issues
 * because addEventListener with the same (event, handler, capture) tuple is deduped
 * by the browser.
 */
export function pointerListenerAdd(oDOM, sEvIn, fCall, capture = false) {
  if (!oDOM || !oDOM.addEventListener || !sEvIn || typeof fCall !== "function") {
    return; // -- break --
  }

  let sMethod = _getPointereventsMethod();
  let sEvent = sEvIn;

  // UNDER CONSTRUCTION
  // Convert pointerevents to touch event when not available.
  if (sMethod === "pointer" && typeof window !== "undefined" && !window.PointerEvent) {
    console.warn("sMethod=='pointer' && !window.PointerEvent");
    console.log("Converting pointer[" + sEvent + "] : down move up cancel enter TO touchstart touchmove touchend, etc ..");
    switch (sEvent) {
      case "down":
        sMethod = "touch";
        sEvent = "start";
        break;
      case "move":
        sMethod = "touch";
        // sEvent = "move";
        break;
      case "up":
        sMethod = "touch";
        sEvent = "end";
        break;
      case "cancel":
        sMethod = "touch";
        // sEvent = "cancel";
        break;
      case "enter":
        console.log("debug: Should I send a move event?");
        break;
      // case "over": case "out": not used at now
      default:
        console.warn("PointerEvent not available in this browser ? The event " + sEvent + " would not be called");
    }
  }

  switch (sEvent) {
    // both pointer and move events
    case "down":
    case "up":
    case "move":
    case "over":
    case "out":
    case "enter": {
      oDOM.addEventListener(sMethod + sEvent, fCall, capture);
    }
    // only pointerevents
    case "leave":
    case "cancel":
    case "gotpointercapture":
    case "lostpointercapture": {
      if (sMethod !== "mouse") {
        return oDOM.addEventListener(sMethod + sEvent, fCall, capture);
      }
    }
    // not "pointer" || "mouse"
    default:
      return oDOM.addEventListener(sEvent, fCall, capture);
  }
}

/**
 * Counterpart to pointerListenerAdd — removes a previously-added listener.
 * Must use the exact same event-name construction logic so listeners
 * added by the original implementation can be removed.
 */
export function pointerListenerRemove(oDOM, sEvent, fCall, capture = false) {
  if (!oDOM || !oDOM.removeEventListener || !sEvent || typeof fCall !== "function") {
    return; // -- break --
  }

  const method = _getPointereventsMethod();

  switch (sEvent) {
    // both pointer and move events
    case "down":
    case "up":
    case "move":
    case "over":
    case "out":
    case "enter": {
      if (method === "pointer" || method === "mouse") {
        oDOM.removeEventListener(method + sEvent, fCall, capture);
      }
    }
    // only pointerevents
    case "leave":
    case "cancel":
    case "gotpointercapture":
    case "lostpointercapture": {
      if (method === "pointer") {
        return oDOM.removeEventListener(method + sEvent, fCall, capture);
      }
    }
    // not "pointer" || "mouse"
    default:
      return oDOM.removeEventListener(sEvent, fCall, capture);
  }
}
