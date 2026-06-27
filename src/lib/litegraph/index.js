/**
 * LiteGraph ES6 Module - Barrel Export with Lazy Registration
 * 
 * All classes are registered onto the LiteGraph object here
 * to avoid circular dependency issues at module evaluation time.
 */

import { LiteGraph, LiteGraphClass } from "./LiteGraph.js";
import { LGraphNode } from "./LGraphNode.js";
import { LGraph } from "./LGraph.js";
import { LLink } from "./LLink.js";
import { LGraphGroup } from "./LGraphGroup.js";
import { DragAndScale } from "./DragAndScale.js";
import { LGraphCanvas } from "./LGraphCanvas.js";
import { ContextMenu } from "./ContextMenu.js";
import {
  _setLiteGraphRef,
  pointerListenerAdd,
  pointerListenerRemove,
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
} from "./utils.js";

// ===== Lazy Registration =====
// These assignments must happen AFTER all modules are imported
// to avoid circular dependency errors during module evaluation.

// Set the LiteGraph reference in utils.js so pointerListenerAdd/Remove
// can access LiteGraph.pointerevents_method without a circular import.
_setLiteGraphRef(LiteGraph);

LiteGraph._LGraphNode = LGraphNode;
LiteGraph.LGraph = LGraph;
LiteGraph.LLink = LLink;
LiteGraph.LGraphGroup = LGraphGroup;
LiteGraph.LGraphCanvas = LGraphCanvas;
LiteGraph.DragAndScale = DragAndScale;
LiteGraph.ContextMenu = ContextMenu;

// Register utility functions on LiteGraph for API compatibility.
// In the original IIFE every one of these helpers was attached to the
// global LiteGraph object (e.g. `LiteGraph.compareObjects(...)`). Without
// these re-attachments, external callers that use the `LiteGraph.X(...)`
// form would silently get `undefined` and crash at runtime.
LiteGraph.pointerListenerAdd = pointerListenerAdd;
LiteGraph.pointerListenerRemove = pointerListenerRemove;
LiteGraph.compareObjects = compareObjects;
LiteGraph.distance = distance;
LiteGraph.colorToString = colorToString;
LiteGraph.isInsideRectangle = isInsideRectangle;
LiteGraph.growBounding = growBounding;
LiteGraph.isInsideBounding = isInsideBounding;
LiteGraph.overlapBounding = overlapBounding;
LiteGraph.hex2num = hex2num;
LiteGraph.num2hex = num2hex;
LiteGraph.getTime = getTime;
LiteGraph.cloneObject = cloneObject;
LiteGraph.uuidv4 = uuidv4;
LiteGraph.getParameterNames = getParameterNames;

// Process any pending node type registrations that happened before
// _LGraphNode was set (e.g., nodes registered in page.tsx at module level)
if (LiteGraph._pendingRegistrations) {
  for (const baseClass of LiteGraph._pendingRegistrations) {
    if (!(baseClass.prototype instanceof LGraphNode)) {
      for (const i in LGraphNode.prototype) {
        if (baseClass.prototype[i] === undefined) {
          baseClass.prototype[i] = LGraphNode.prototype[i];
        }
      }
    }
  }
  delete LiteGraph._pendingRegistrations;
}

// Re-export everything
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
  _setLiteGraphRef,
} from "./utils.js";
