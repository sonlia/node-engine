/**
 * LiteGraph ES6 Module - Barrel Export
 * 
 * Re-exports all refactored ES6 classes from the litegraph.js library.
 * 
 * Refactoring Summary:
 * - Original: IIFE pattern with global scope, constructor functions, prototype chains
 * - Refactored: ES6 classes with proper inheritance, module imports/exports
 * - Key change: Mixin pattern (copying LGraphNode.prototype) → proper `extends LGraphNode`
 */

export { LiteGraph, LiteGraphClass } from "./LiteGraph.js";
export { LGraphNode } from "./LGraphNode.js";
export { LGraph } from "./LGraph.js";
export { LLink } from "./LLink.js";
export { LGraphGroup } from "./LGraphGroup.js";
export { DragAndScale } from "./DragAndScale.js";
export { LGraphCanvas } from "./LGraphCanvas.js";
export { ContextMenu } from "./ContextMenu.js";

export {
  clamp,
  compareObjects,
  distance,
  colorToString,
  isInsideRectangle,
  growBounding,
  isInsideBounding,
  overlapBounding,
  hex2num,
  num2hex,
  getTime,
  cloneObject,
  uuidv4,
  getParameterNames,
  pointerListenerAdd,
  pointerListenerRemove,
} from "./utils.js";
