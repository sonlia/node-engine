/**
 * LGraphGroup - Visual grouping rectangle for nodes
 *
 * Refactored from a constructor function + prototype to ES6 class.
 * Original borrowed isPointInside and setDirtyCanvas from LGraphNode.prototype.
 */

import { LiteGraph } from "./LiteGraph.js";

class LGraphGroup {
  constructor(title) {
    this.title = title || "Group";
    this.font_size = 24;
    // Pick a default group color that actually exists. Original used
    // `LGraphCanvas.node_colors.pale_blue.groupcolor` ("#3f789e"); we use a
    // hardcoded fallback so we don't have to import LGraphCanvas here.
    this.color = "#3f789e";

    // Restore the original memory-sharing layout: `_pos` and `_size` are
    // subarray *views* of `_bounding`, so mutating `_pos[0]` (e.g. via
    // `move()`) automatically updates `_bounding[0]`. The previous refactor
    // used three independent Float32Arrays, which broke serialize-after-move.
    this._bounding = new Float32Array([10, 10, 140, 80]);
    this._pos = this._bounding.subarray(0, 2);
    this._size = this._bounding.subarray(2, 4);

    this._nodes = [];
    this.graph = null;

    Object.defineProperty(this, "pos", {
      set(v) {
        if (!v || v.length < 2) return;
        this._pos[0] = v[0];
        this._pos[1] = v[1];
      },
      get() {
        return this._pos;
      },
      enumerable: true,
    });

    Object.defineProperty(this, "size", {
      set(v) {
        if (!v || v.length < 2) return;
        // Match original size clamps so groups can't be shrunk below their
        // default minimum dimensions.
        this._size[0] = Math.max(140, v[0]);
        this._size[1] = Math.max(80, v[1]);
      },
      get() {
        return this._size;
      },
      enumerable: true,
    });
  }

  configure(o) {
    this.title = o.title;
    // In-place set keeps the subarray sharing intact (a fresh `new
    // Float32Array(o.bounding)` would disconnect _pos/_size from _bounding).
    if (o.bounding) {
      this._bounding.set(o.bounding);
    }
    this.color = o.color;
    this.font_size = o.font_size;
    // Older serializations may carry explicit `pos`/`size` fields — apply
    // them too for backward compatibility, but they write through the
    // subarray views so `_bounding` stays in sync.
    if (o.pos) {
      this._pos[0] = o.pos[0];
      this._pos[1] = o.pos[1];
    }
    if (o.size) {
      this._size[0] = o.size[0];
      this._size[1] = o.size[1];
    }
  }

  serialize() {
    const b = this._bounding;
    // Match original rounding so saved graphs don't accumulate float drift.
    return {
      title: this.title,
      bounding: [
        Math.round(b[0]),
        Math.round(b[1]),
        Math.round(b[2]),
        Math.round(b[3]),
      ],
      color: this.color,
      font_size: this.font_size,
    };
  }

  move(deltaX, deltaY, ignore_nodes) {
    this._pos[0] += deltaX;
    this._pos[1] += deltaY;
    // Original third parameter lets callers move the rectangle without
    // dragging contained nodes (used during resize, etc.).
    if (ignore_nodes) {
      return;
    }
    for (let i = 0; i < this._nodes.length; ++i) {
      const node = this._nodes[i];
      node.pos[0] += deltaX;
      node.pos[1] += deltaY;
    }
  }

  recomputeInsideNodes() {
    this._nodes.length = 0;
    if (!this.graph) return;
    const nodes = this.graph._nodes;
    const nodeBounding = new Float32Array(4);
    for (let i = 0; i < nodes.length; ++i) {
      const node = nodes[i];
      node.getBounding(nodeBounding);
      if (!LiteGraph.overlapBounding(this._bounding, nodeBounding)) continue;
      this._nodes.push(node);
    }
  }

  isPointInside(x, y, margin) {
    margin = margin || 0;
    return (
      x >= this._pos[0] - margin &&
      x < this._pos[0] + this._size[0] + margin &&
      y >= this._pos[1] - margin &&
      y < this._pos[1] + this._size[1] + margin
    );
  }

  setDirtyCanvas(fg, bg) {
    if (this.graph) {
      this.graph.sendActionToCanvas("setDirty", [fg, bg]);
    }
  }
}

// Lazy registration to avoid circular dependency issues
export { LGraphGroup };
export default LGraphGroup;
