/**
 * LGraphGroup - Visual grouping rectangle for nodes
 * 
 * Refactored from a constructor function + prototype to ES6 class.
 * Original borrowed isPointInside and setDirtyCanvas from LGraphNode.prototype.
 * Now properly inherits those via a shared base or direct implementation.
 */

import { LiteGraph } from "./LiteGraph.js";

class LGraphGroup {
  constructor(title) {
    this.title = title || "Group";
    this.font_size = 24;
    this.color = LiteGraph.DEFAULT_GROUP_FONT;
    this._bounding = new Float32Array(4);
    this._pos = new Float32Array([10, 10]);
    this._size = new Float32Array([200, 200]);
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
        this._size[0] = v[0];
        this._size[1] = v[1];
      },
      get() {
        return this._size;
      },
      enumerable: true,
    });
  }

  configure(o) {
    this.title = o.title;
    this._bounding = new Float32Array(o.bounding);
    this.color = o.color;
    this.font_size = o.font_size;
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
    const o = {
      title: this.title,
      bounding: Array.from(this._bounding),
      color: this.color,
      font_size: this.font_size,
      pos: [this._pos[0], this._pos[1]],
      size: [this._size[0], this._size[1]],
    };
    return o;
  }

  move(deltaX, deltaY) {
    this._pos[0] += deltaX;
    this._pos[1] += deltaY;
    for (let i = 0; i < this._nodes.length; ++i) {
      const node = this._nodes[i];
      node.pos[0] += deltaX;
      node.pos[1] += deltaY;
    }
  }

  recomputeInsideNodes() {
    this._nodes = [];
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
