/**
 * Utility functions for LiteGraph
 * Refactored from the original IIFE-based global utilities to ES6 module exports
 */

export function clamp(v, a, b) {
  return a > v ? a : b < v ? b : v;
}

export function compareObjects(a, b) {
  for (const i in a) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function distance(a, b) {
  return Math.sqrt(
    (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2
  );
}

export function colorToString(c) {
  return (
    "rgba(" +
    Math.round(c[0] * 255).toString() +
    "," +
    Math.round(c[1] * 255).toString() +
    "," +
    Math.round(c[2] * 255).toString() +
    "," +
    (c.length === 4 ? c[3] : 1).toString() +
    ")"
  );
}

export function isInsideRectangle(x, y, left, top, width, height) {
  return (
    x >= left &&
    x < left + width &&
    y >= top &&
    y < top + height
  );
}

export function growBounding(bounding, x, y) {
  if (x < bounding[0]) bounding[0] = x;
  else if (x > bounding[2]) bounding[2] = x;
  if (y < bounding[1]) bounding[1] = y;
  else if (y > bounding[3]) bounding[3] = y;
}

export function isInsideBounding(p, bb) {
  return (
    p[0] >= bb[0] &&
    p[1] >= bb[1] &&
    p[0] <= bb[2] &&
    p[1] <= bb[3]
  );
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
  let out = "#";
  for (let i = 0; i < triplet.length; i++) {
    let s = triplet[i].toString(16);
    if (s.length === 1) s = "0" + s;
    out += s;
  }
  return out;
}

export function getTime() {
  if (typeof performance !== "undefined") {
    return performance.now();
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
 * Cross-platform pointer event listener binding.
 * Uses LiteGraph.pointerevents_method ("pointer" or "mouse") to construct
 * the event name by concatenating method + event suffix.
 * E.g., method="pointer", event="down" → "pointerdown"
 *       method="mouse", event="down" → "mousedown"
 */
export function pointerListenerAdd(target, event, handler, capture) {
  capture = capture || false;
  const method = LiteGraph.pointerevents_method || "pointer";
  // For known suffixes (down/up/move/over/out/enter), prepend the method
  const knownSuffixes = ["down", "up", "move", "over", "out", "enter"];
  const finalEvent = knownSuffixes.includes(event) ? method + event : event;
  target.addEventListener(finalEvent, handler, capture);
}

/**
 * Cross-platform pointer event listener removal.
 * Must mirror pointerListenerAdd's event name construction.
 */
export function pointerListenerRemove(target, event, handler, capture) {
  capture = capture || false;
  const method = LiteGraph.pointerevents_method || "pointer";
  const knownSuffixes = ["down", "up", "move", "over", "out", "enter"];
  const finalEvent = knownSuffixes.includes(event) ? method + event : event;
  target.removeEventListener(finalEvent, handler, capture);
}
