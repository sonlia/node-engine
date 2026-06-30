/**
 * LGraphNode - Base class for all node types
 * 
 * Refactored from a constructor function + prototype to ES6 class.
 * Original: function LGraphNode(title) { this._ctor(title); }
 * 
 * Key changes:
 * - Constructor body replaces _ctor()
 * - All prototype methods become class methods
 * - Object.defineProperty for 'pos' replaced with ES6 get/set
 * - Mixin inheritance replaced by proper class extension
 */

import { LiteGraph } from "./LiteGraph.js";
import { cloneObject, uuidv4, isInsideRectangle } from "./utils.js";

// ============================================================================
// Strategy 3 (Result Caching) — module-private WeakMaps
// ----------------------------------------------------------------------------
// `_objectIdMap` gives each object a stable numeric id WITHOUT mutating the
// object itself. This avoids polluting user data, breaking structured-clone
// transfer to Web Workers (Strategy 5), and failing on frozen/sealed objects.
// The WeakMap lets the id be GC'd when the object is no longer referenced.
// ============================================================================
const _objectIdMap = new WeakMap();
let _nextObjectId = 1;
function getObjectId(obj) {
  let id = _objectIdMap.get(obj);
  if (id === undefined) {
    id = _nextObjectId++;
    _objectIdMap.set(obj, id);
  }
  return id;
}

class LGraphNode extends EventTarget {
  constructor(title) {
    super();
    this.title = title || "Unnamed";
    this.size = [LiteGraph.NODE_WIDTH, 60];
    this.graph = null;
    this._pos = new Float32Array([10, 10]);
    this.id = LiteGraph.use_uuids ? uuidv4() : -1;
    this.type = null;

    // Inputs/outputs slots
    this.inputs = [];
    this.outputs = [];
    this.connections = [];

    // Local data
    this.properties = {};
    this.properties_info = [];
    this.flags = {};

    // Execution mode: 0=ALWAYS, 1=ON_EVENT, 2=NEVER, 3=ON_TRIGGER
    this.mode = LiteGraph.ALWAYS;

    // Rendering/execution state
    this._shape = null;
    // _waiting_actions removed (EVENT/ACTION deferred-execution model deleted)

    // ====================================================================
    // Execution Optimization State (fusion of strategies 1/3/5)
    // --------------------------------------------------------------------
    // Strategy 1 (Reactive Dirty Marking, Polygonjs-style):
    //   `_dirty` starts true so the first run computes everything.
    //   markDirty() propagates downstream so unchanged branches are skipped.
    //
    // Strategy 3 (Result Caching / Memoization — WeakMap-backed):
    //   Cache entries live in `graph._cacheStore` (WeakMap<LGraphNode,
    //   {key, output}>) so removed nodes' entries auto-GC.
    //
    // Strategy 5 (Async Execution for heavy nodes):
    //   `_isHeavy` flags nodes for Worker dispatch (see WorkerScheduler.js).
    //
    // `_alwaysDirty`: for nodes whose output changes every step regardless
    //   of input (e.g. Timer reading graph.globaltime). Bypasses the dirty
    //   skip so the node always re-executes, but its downstream still gets
    //   the setOutputData equality check to avoid spurious dirty cascades.
    // ====================================================================
    this._dirty = true;
    this._isHeavy = false;
    this._asyncPending = false;
    this._alwaysDirty = false;
  }

  // ===================== POSITION GETTER/SETTER =====================
  // Replaces Object.defineProperty from original code

  get pos() {
    return this._pos;
  }

  set pos(v) {
    if (!v || v.length < 2) return;
    this._pos[0] = v[0];
    this._pos[1] = v[1];
  }

  get shape() {
    return this._shape;
  }

  set shape(v) {
    switch (v) {
      case "default": delete this._shape; break;
      case "box": this._shape = LiteGraph.BOX_SHAPE; break;
      case "round": this._shape = LiteGraph.ROUND_SHAPE; break;
      case "circle": this._shape = LiteGraph.CIRCLE_SHAPE; break;
      case "card": this._shape = LiteGraph.CARD_SHAPE; break;
      default: this._shape = v;
    }
  }

  // ===================== SERIALIZATION =====================

  /**
   * Configure this node from a serialized info object
   */
  configure(info) {
    if (this.graph) {
      this.graph._version++;
    }

    for (const j in info) {
      if (j === "properties") {
        for (const k in info.properties) {
          this.properties[k] = info.properties[k];
          if (this.onPropertyChanged) {
            this.onPropertyChanged(k, info.properties[k]);
          }
        }
        continue;
      }

      if (info[j] == null) {
        continue;
      } else if (typeof info[j] === "object") {
        if (this[j] && this[j].configure) {
          this[j].configure(info[j]);
        } else {
          this[j] = cloneObject(info[j], this[j]);
        }
      } else {
        this[j] = info[j];
      }
    }

    if (!info.title) {
      this.title = this.constructor.title;
    }

    // Notify connections
    if (this.inputs) {
      for (let i = 0; i < this.inputs.length; ++i) {
        const input = this.inputs[i];
        const linkInfo = this.graph ? this.graph.links[input.link] : null;
        if (this.onConnectionsChange) {
          this.onConnectionsChange(LiteGraph.INPUT, i, true, linkInfo, input);
        }
        if (this.onInputAdded) {
          this.onInputAdded(input);
        }
      }
    }

    if (this.outputs) {
      for (let i = 0; i < this.outputs.length; ++i) {
        const output = this.outputs[i];
        if (!output.links) continue;
        for (let j = 0; j < output.links.length; ++j) {
          const linkInfo = this.graph ? this.graph.links[output.links[j]] : null;
          if (this.onConnectionsChange) {
            this.onConnectionsChange(LiteGraph.OUTPUT, i, true, linkInfo, output);
          }
        }
        if (this.onOutputAdded) {
          this.onOutputAdded(output);
        }
      }
    }

    // Widget system removed — widgets_values from legacy serializations
    // are silently ignored. Properties (restored above) are the single
    // source of truth for node parameters now.

    // Strategy 1 (Reactive Dirty Marking): freshly configured nodes start
    // dirty so the first run after a load/serialize cycle recomputes
    // everything from scratch. Without this, a deserialized graph could
    // falsely report cached values as still valid.
    this._dirty = true;

    if (this.onConfigure) {
      this.onConfigure(info);
    }
  }

  /**
   * Serialize this node to a plain object
   */
  serialize() {
    const o = {
      id: this.id,
      type: this.type,
      pos: this.pos,
      size: this.size,
      flags: cloneObject(this.flags),
      order: this.order,
      mode: this.mode,
    };

    // Special case for when there were errors
    if (this.constructor === LGraphNode && this.last_serialization) {
      return this.last_serialization;
    }

    if (this.inputs) o.inputs = this.inputs;
    if (this.outputs) {
      for (let i = 0; i < this.outputs.length; i++) {
        delete this.outputs[i]._data;
      }
      o.outputs = this.outputs;
    }

    if (this.title && this.title !== this.constructor.title) {
      o.title = this.title;
    }

    if (this.properties) {
      o.properties = cloneObject(this.properties);
    }

    // Widget system removed — serialize no longer writes widgets_values.
    // Properties (serialized above via `o.properties = this.properties`)
    // are the single source of truth.

    if (!o.type) {
      o.type = this.constructor.type;
    }

    // Restore visual-style fields so saved graphs keep node appearance.
    if (this.color) o.color = this.color;
    if (this.bgcolor) o.bgcolor = this.bgcolor;
    if (this.boxcolor) o.boxcolor = this.boxcolor;
    if (this.shape) o.shape = this.shape;

    if (this.onSerialize) {
      if (this.onSerialize(o)) {
        console.warn(
          "node onSerialize shouldnt return anything, data should be stored in the object pass in the first parameter"
        );
      }
    }

    return o;
  }

  // ===================== CLONE =====================

  clone() {
    const cloned = LiteGraph.createNode(this.type);
    if (!cloned) return null;

    // Deep-clone the serialize output (otherwise shared arrays/objects
    // would be mutated when the clone is configured).
    const data = cloneObject(this.serialize());

    // Sever input/output links so the clone starts disconnected.
    if (data.inputs) {
      for (let i = 0; i < data.inputs.length; ++i) {
        data.inputs[i].link = null;
      }
    }
    if (data.outputs) {
      for (let i = 0; i < data.outputs.length; ++i) {
        if (data.outputs[i].links) {
          data.outputs[i].links.length = 0;
        }
      }
    }

    delete data["id"];
    if (LiteGraph.use_uuids) {
      data["id"] = LiteGraph.uuidv4();
    }

    cloned.configure(data);
    return cloned;
  }

  toString() {
    // Match original: full JSON of serialize() output.
    return JSON.stringify(this.serialize());
  }

  // ===================== PROPERTIES =====================

  getTitle() {
    return this.title || this.constructor.title;
  }

  setProperty(name, value) {
    if (!this.properties) this.properties = {};
    // No-op short-circuit: avoid firing callbacks when nothing changed.
    if (value === this.properties[name]) return;
    const prevValue = this.properties[name];
    this.properties[name] = value;
    if (this.onPropertyChanged) {
      // Allow the handler to veto (return false) and revert the change.
      if (this.onPropertyChanged(name, value, prevValue) === false) {
        this.properties[name] = prevValue;
      }
    }
    // Widget system removed — no widget sync needed.
    // Strategy 1 (Reactive Dirty Marking): a parameter change invalidates
    // this node's cache and propagates dirty downstream so the next run
    // only recomputes affected branches.
    this.markDirty();
  }

  addProperty(name, defaultValue, type, extraInfo) {
    const o = { name: name, type: type, default_value: defaultValue };
    if (extraInfo) {
      for (const i in extraInfo) o[i] = extraInfo[i];
    }
    if (!this.properties_info) this.properties_info = [];
    this.properties_info.push(o);
    if (typeof defaultValue === "function") {
      this.properties[name] = defaultValue();
    } else {
      this.properties[name] = defaultValue;
    }
    return o;
  }

  getPropertyInfo(property) {
    let info = null;

    // There are several ways to define info about a property.
    // Legacy mode: search in this.properties_info.
    if (this.properties_info) {
      for (let i = 0; i < this.properties_info.length; ++i) {
        if (this.properties_info[i].name === property) {
          info = this.properties_info[i];
          break;
        }
      }
    }
    // Litescene mode using the constructor.
    if (this.constructor["@" + property]) {
      info = this.constructor["@" + property];
    }
    if (this.constructor.widgets_info && this.constructor.widgets_info[property]) {
      info = this.constructor.widgets_info[property];
    }
    // Litescene mode using the constructor callback.
    if (!info && this.onGetPropertyInfo) {
      info = this.onGetPropertyInfo(property);
    }

    if (!info) info = {};
    if (!info.type) {
      info.type = typeof this.properties[property];
    }
    if (info.widget === "combo") {
      info.type = "enum";
    }
    return info;
  }

  // ===================== EXECUTION OPTIMIZATION =====================
  // Fuses three runtime strategies (see design doc):
  //   - Strategy 1: Reactive Dirty Marking (Polygonjs)
  //   - Strategy 2: Lazy Execution (Rete fetch())         — see LGraph.runTarget
  //   - Strategy 3: Result Caching / Memoization          — see computeCacheKey
  //   - Strategy 5: Async Execution for heavy nodes       — see _isHeavy
  //
  // Backward compatibility: every method below is a no-op for nodes that
  // never opted in. Old nodes have no _dirty / cache fields and runStep
  // will simply call onExecute() every frame as before.

  /**
   * Mark this node as dirty and propagate the dirty flag to all downstream
   * consumers (Strategy 1 + Strategy 4 fusion).
   *
   * Propagation path:
   *   - If the graph has a precomputed `_downstreamAdjacency` (built by
   *     LGraph.rebuildTopology, Strategy 4), walk that array directly.
   *     Cost: O(direct_successors) with no link-object dereferences.
   *   - Otherwise (graph not yet topologically analyzed, e.g. during
   *     initial construction before the first connectionChange), fall
   *     back to walking this.outputs[i].links[j] and looking up each
   *     target node.
   *
   * Idempotent — if the node is already dirty we stop propagation early
   * to avoid recomputing the same closure twice.
   *
   * Side effects:
   *   - clears cached output (Strategy 3 cache invalidation — WeakMap entry)
   */
  markDirty() {
    // Already dirty — skip redundant downstream propagation.
    if (this._dirty) return;
    this._dirty = true;
    // Strategy 3 — clear WeakMap cache entry. WeakMap.delete is O(1) and
    // safe to call even if no entry exists. When the node is later GC'd,
    // any lingering entry is collected automatically — no manual sweep.
    if (this.graph && this.graph._cacheStore) {
      this.graph._cacheStore.delete(this);
    }

    // Strategy 1+4 fusion — propagate via precomputed adjacency list
    // when available. This is the hot path after the first
    // connectionChange / rebuildTopology.
    if (this.graph && this.graph._downstreamAdjacency) {
      const successors = this.graph._downstreamAdjacency.get(this.id);
      if (successors) {
        for (let i = 0; i < successors.length; i++) {
          const target = successors[i];
          if (target && target.markDirty) target.markDirty();
        }
      }
    } else if (this.outputs && this.graph) {
      // Fallback path: graph hasn't been topologically analyzed yet.
      for (let i = 0; i < this.outputs.length; i++) {
        const output = this.outputs[i];
        if (!output || !output.links) continue;
        for (let j = 0; j < output.links.length; j++) {
          const link = this.graph.links[output.links[j]];
          if (!link) continue;
          const target = this.graph.getNodeById(link.target_id);
          if (target && target.markDirty) target.markDirty();
        }
      }
    }
  }

  /** Returns true if the node needs to recompute (Strategy 1 gate). */
  isDirty() {
    // _alwaysDirty nodes (Timer, etc.) always report dirty so the
    // optimized run loop re-executes them every step.
    if (this._alwaysDirty) return true;
    return this._dirty !== false;
  }

  /** Mark the node clean after a successful onExecute (Strategy 1 close). */
  clearDirty() {
    this._dirty = false;
  }

  /**
   * Compute a cache key from the node's input signature (Strategy 3).
   * Combines serialized properties + upstream output data references.
   * Returns null when inputs are not yet available (forces execution).
   *
   * For _alwaysDirty nodes, returns null so the cache never hits —
   * the output genuinely changes every step.
   */
  computeCacheKey() {
    if (this._alwaysDirty) return null;
    if (!this.inputs) return null;
    const parts = [];
    if (this.properties) {
      try {
        parts.push(JSON.stringify(this.properties));
      } catch (e) {
        return null;
      }
    }
    for (let i = 0; i < this.inputs.length; i++) {
      const input = this.inputs[i];
      if (!input || input.link == null) {
        parts.push("null");
        continue;
      }
      const link = this.graph ? this.graph.links[input.link] : null;
      if (!link) {
        parts.push("null");
        continue;
      }
      const data = link.data;
      if (data == null) {
        parts.push("null");
      } else if (typeof data === "object") {
        // Object identity cache via module-private WeakMap — no data
        // mutation. Invalidates when upstream produces a new instance.
        parts.push(`obj:${data.constructor.name}:${getObjectId(data)}`);
      } else {
        parts.push(`${typeof data}:${String(data)}`);
      }
    }
    return parts.join("|");
  }

  /**
   * Return cached output if the current input signature matches the
   * stored cache key (Strategy 3 fast path). Returns null on miss.
   */
  getCachedOutput() {
    if (!this.graph || !this.graph._cacheStore) return null;
    const entry = this.graph._cacheStore.get(this);
    if (!entry) return null;
    const key = this.computeCacheKey();
    if (key == null || key !== entry.key) return null;
    return entry.output;
  }

  /**
   * Store output after a successful onExecute (Strategy 3 store).
   * Writes to the graph's WeakMap cache (lazily created on first use).
   */
  storeCachedOutput() {
    if (!this.graph) return;
    if (!this.graph._cacheStore) {
      this.graph._cacheStore = new WeakMap();
    }
    const key = this.computeCacheKey();
    if (key == null) {
      // Un-cacheable node — explicitly delete any prior entry.
      this.graph._cacheStore.delete(this);
      return;
    }
    const snapshot = [];
    if (this.outputs) {
      for (let i = 0; i < this.outputs.length; i++) {
        const output = this.outputs[i];
        snapshot.push(output ? output._data : undefined);
      }
    }
    this.graph._cacheStore.set(this, { key, output: snapshot });
  }

  /**
   * Apply cached outputs back to the output slots (Strategy 3 restore).
   * Called by runOptimized when a cache hit occurs so downstream nodes
   * see the same data values as if onExecute had run.
   */
  applyCachedOutput() {
    if (!this.graph || !this.graph._cacheStore) return;
    const entry = this.graph._cacheStore.get(this);
    if (!entry || !entry.output || !this.outputs) return;
    for (let i = 0; i < this.outputs.length && i < entry.output.length; i++) {
      if (this.outputs[i]) {
        this.outputs[i]._data = entry.output[i];
        if (this.outputs[i].links && this.graph) {
          for (let j = 0; j < this.outputs[i].links.length; j++) {
            const link = this.graph.links[this.outputs[i].links[j]];
            if (link) link.data = entry.output[i];
          }
        }
      }
    }
  }

  // ===================== DATA FLOW =====================

  setOutputData(slot, data) {
    if (!this.outputs) return;
    if (slot >= 0 && slot < this.outputs.length) {
      const output = this.outputs[slot];

      // Strategy 1 guard — value-equality short-circuit.
      // If the new value is identical to the existing output, skip the
      // downstream dirty cascade entirely. This is THE critical optimization
      // for static graphs: a Number(42) → Math(+) → Display chain only
      // executes ONCE on the first frame, then every subsequent frame is
      // a no-op because 42 === 42.
      //
      // For objects we use reference equality (===) — if the upstream
      // produces a new instance every time, downstream re-executes (correct).
      // If it reuses the same instance and mutates in place, the upstream
      // must call markDirty() explicitly to signal the change.
      const prev = output._data;
      if (prev === data) return;
      // NaN !== NaN, so handle NaN explicitly to avoid spurious dirty cascades
      // when a math node outputs NaN every frame.
      if (prev !== prev && data !== data) return;

      // Original keeps both an `_data` debug copy on the output slot AND
      // propagates the value to every live link's `.data` field. Downstream
      // nodes read it back via `getInputData` → `link.data`.
      output._data = data;
      if (output.links && this.graph) {
        for (let i = 0; i < output.links.length; i++) {
          const link = this.graph.links[output.links[i]];
          if (link) {
            link.data = data;
          }
        }
      }

      // Strategy 1 (Reactive Dirty Marking): output mutation invalidates
      // downstream caches so the next run recomputes them. This is reached
      // only when the value actually changed (see equality check above),
      // so spurious dirty cascades are eliminated.
      this._markDownstreamDirty(slot);
    }
  }

  /**
   * Propagate dirty flag to all downstream consumers (Strategy 1+4 fusion).
   * Internal helper used by setOutputData; does NOT mark this node itself
   * dirty (the node just produced fresh output).
   *
   * Optimization: the per-slot filter is rarely useful in practice
   * (most downstream consumers connect to one slot at a time), so we
   * just walk the precomputed `_downstreamAdjacency` list and mark every
   * direct successor dirty. If a downstream node is connected to multiple
   * of our output slots, markDirty's idempotency check makes the
   * duplicate call a no-op.
   */
  _markDownstreamDirty(slot) {
    if (!this.graph) return;
    // Strategy 1+4 fusion — fast path via precomputed adjacency.
    if (this.graph._downstreamAdjacency) {
      const successors = this.graph._downstreamAdjacency.get(this.id);
      if (successors) {
        for (let i = 0; i < successors.length; i++) {
          const target = successors[i];
          if (target && target.markDirty) target.markDirty();
        }
      }
      return;
    }
    // Fallback: walk this specific output slot's links directly. Used
    // only before the first rebuildTopology.
    if (!this.outputs || !this.outputs[slot]) return;
    const output = this.outputs[slot];
    if (!output.links) return;
    for (let i = 0; i < output.links.length; i++) {
      const link = this.graph.links[output.links[i]];
      if (!link) continue;
      const target = this.graph.getNodeById(link.target_id);
      if (target && target.markDirty) target.markDirty();
    }
  }

  setOutputDataType(slot, type) {
    if (!this.outputs) return;
    if (slot >= 0 && slot < this.outputs.length) {
      const output = this.outputs[slot];
      output.type = type;
      // Mirror the type onto every live link so downstream type inference
      // (getInputDataType) keeps working after a runtime type change.
      if (output.links && this.graph) {
        for (let i = 0; i < output.links.length; i++) {
          const link = this.graph.links[output.links[i]];
          if (link) {
            link.type = type;
          }
        }
      }
    }
  }

  getInputData(slot, force_update) {
    if (!this.inputs) return;
    if (slot >= this.inputs.length || this.inputs[slot].link == null) return;

    const linkId = this.inputs[slot].link;
    const link = this.graph ? this.graph.links[linkId] : null;
    if (!link) return null;

    if (!force_update) return link.data;

    // Pull fresh data from the upstream node.
    const node = this.graph.getNodeById(link.origin_id);
    if (!node) return link.data;

    // Strategy 1 respect: if the upstream node is NOT dirty, its current
    // output is already valid — no need to re-execute it. This prevents
    // a force_update call from triggering redundant recomputation when
    // the optimized path has already determined the upstream is clean.
    if (node.isDirty && !node.isDirty()) {
      return link.data;
    }

    if (node.updateOutputData) node.updateOutputData(link.origin_slot);
    else if (node.onExecute) node.onExecute();
    return link.data;
  }

  getInputDataType(slot) {
    if (!this.inputs) return null;
    if (slot >= 0 && slot < this.inputs.length) {
      const input = this.inputs[slot];
      if (!input) return null;
      const linkId = input.link;
      if (linkId != null && this.graph) {
        const link = this.graph.links[linkId];
        if (link) {
          // Original looks up the *upstream output slot's* type so a
          // runtime type change on the source is reflected here.
          const node = this.graph.getNodeById(link.origin_id);
          if (node && node.outputs && node.outputs[link.origin_slot]) {
            return node.outputs[link.origin_slot].type;
          }
        }
      }
      return input.type;
    }
    return null;
  }

  getInputDataByName(name, force_update) {
    if (!this.inputs) return null;
    const slot = this.findInputSlot(name);
    if (slot === -1) return null;
    return this.getInputData(slot, force_update);
  }

  isInputConnected(slot) {
    if (!this.inputs) return false;
    return slot >= 0 && slot < this.inputs.length && this.inputs[slot].link != null;
  }

  getInputInfo(slot) {
    if (!this.inputs) return null;
    if (slot >= 0 && slot < this.inputs.length) return this.inputs[slot];
    return null;
  }

  getInputLink(slot) {
    if (!this.inputs) return null;
    if (slot < this.inputs.length) {
      const linkId = this.inputs[slot].link;
      return this.graph ? this.graph.links[linkId] : null;
    }
    return null;
  }

  getInputNode(slot) {
    if (!this.inputs) return null;
    if (slot >= 0 && slot < this.inputs.length) {
      const linkId = this.inputs[slot].link;
      if (linkId != null) {
        const link = this.graph ? this.graph.links[linkId] : null;
        if (link) return this.graph.getNodeById(link.origin_id);
      }
    }
    return null;
  }

  getInputOrProperty(name) {
    if (!this.inputs) return this.properties[name];
    for (let i = 0; i < this.inputs.length; ++i) {
      if (name === this.inputs[i].name) {
        const data = this.getInputData(i);
        if (data !== undefined && data !== null) return data;
      }
    }
    return this.properties[name];
  }

  getOutputData(slot) {
    if (!this.outputs) return undefined;
    if (slot >= 0 && slot < this.outputs.length) return this.outputs[slot]._data;
    return null;
  }

  getOutputInfo(slot) {
    if (!this.outputs) return null;
    if (slot >= 0 && slot < this.outputs.length) return this.outputs[slot];
    return null;
  }

  isOutputConnected(slot) {
    if (!this.outputs) return false;
    return slot >= 0 && slot < this.outputs.length && this.outputs[slot].links && this.outputs[slot].links.length > 0;
  }

  isAnyOutputConnected() {
    if (!this.outputs) return false;
    for (let i = 0; i < this.outputs.length; ++i) {
      if (this.outputs[i].links && this.outputs[i].links.length > 0) return true;
    }
    return false;
  }

  getOutputNodes(slot) {
    if (!this.outputs || slot < 0 || slot >= this.outputs.length) return null;
    const output = this.outputs[slot];
    if (!output.links) return null;
    const r = [];
    for (let i = 0; i < output.links.length; i++) {
      const linkId = output.links[i];
      const link = this.graph ? this.graph.links[linkId] : null;
      if (link) {
        const targetNode = this.graph.getNodeById(link.target_id);
        if (targetNode) r.push(targetNode);
      }
    }
    return r;
  }

  // ===================== SLOT MANAGEMENT =====================

  addInput(name, type, extraInfo) {
    type = type || 0;
    const o = { name: name, type: type, link: null };
    if (extraInfo) {
      for (const i in extraInfo) o[i] = extraInfo[i];
    }
    if (!this.inputs) this.inputs = [];
    this.inputs.push(o);
    this.setSize(this.computeSize());
    if (this.onInputAdded) this.onInputAdded(o);
    // Register slot type so global type-based lookups (connectByType /
    // findSlotByType) can find this slot at runtime.
    LiteGraph.registerNodeAndSlotType(this, type);
    this.setDirtyCanvas(true, true);
    return o;
  }

  addInputs(list) {
    // Original input format: array of triplets like [[name, type, extra_info], ...]
    for (let i = 0; i < list.length; ++i) {
      const info = list[i];
      const o = { name: info[0], type: info[1], link: null };
      if (info[2]) {
        for (const j in info[2]) o[j] = info[2][j];
      }
      if (!this.inputs) this.inputs = [];
      this.inputs.push(o);
      if (this.onInputAdded) this.onInputAdded(o);
      LiteGraph.registerNodeAndSlotType(this, info[1]);
    }
    this.setSize(this.computeSize());
    this.setDirtyCanvas(true, true);
  }

  removeInput(slot) {
    this.disconnectInput(slot);
    const input = this.inputs.splice(slot, 1)[0];
    // Reindex links still attached to higher-indexed inputs so they keep
    // pointing at the right slot — matches the original behaviour.
    if (this.inputs && this.graph) {
      for (let i = slot; i < this.inputs.length; ++i) {
        const input = this.inputs[i];
        if (!input || input.link == null) continue;
        const link = this.graph.links[input.link];
        if (link) link.target_slot -= 1;
      }
    }
    this.setSize(this.computeSize());
    if (this.onInputRemoved) this.onInputRemoved(slot, input && input.name);
    this.setDirtyCanvas(true, true);
    return input;
  }

  addOutput(name, type, extraInfo) {
    const o = { name: name, type: type, links: null };
    if (extraInfo) {
      for (const i in extraInfo) o[i] = extraInfo[i];
    }
    if (!this.outputs) this.outputs = [];
    this.outputs.push(o);
    if (this.onOutputAdded) this.onOutputAdded(o);
    // Match original: only auto-register when auto_load_slot_types is on
    // (avoids polluting the slot type registry during static class setup).
    if (LiteGraph.auto_load_slot_types)
      LiteGraph.registerNodeAndSlotType(this, type, true);
    this.setSize(this.computeSize());
    this.setDirtyCanvas(true, true);
    return o;
  }

  addOutputs(list) {
    // Original input format: array of triplets like [[name, type, extra_info], ...]
    for (let i = 0; i < list.length; ++i) {
      const info = list[i];
      const o = { name: info[0], type: info[1], links: null };
      if (info[2]) {
        for (const j in info[2]) o[j] = info[2][j];
      }
      if (!this.outputs) this.outputs = [];
      this.outputs.push(o);
      if (this.onOutputAdded) this.onOutputAdded(o);
      if (LiteGraph.auto_load_slot_types)
        LiteGraph.registerNodeAndSlotType(this, info[1], true);
    }
    this.setSize(this.computeSize());
    this.setDirtyCanvas(true, true);
  }

  removeOutput(slot) {
    this.disconnectOutput(slot);
    const output = this.outputs.splice(slot, 1)[0];
    // Reindex links still attached to higher-indexed outputs so they keep
    // pointing at the right slot — otherwise the graph structure corrupts
    // after a slot is removed.
    if (this.outputs && this.graph) {
      for (let i = slot; i < this.outputs.length; ++i) {
        const output = this.outputs[i];
        if (!output || !output.links) continue;
        for (let j = 0; j < output.links.length; ++j) {
          const link = this.graph.links[output.links[j]];
          if (link) link.origin_slot -= 1;
        }
      }
    }
    this.setSize(this.computeSize());
    if (this.onOutputRemoved) this.onOutputRemoved(slot);
    this.setDirtyCanvas(true, true);
    return output;
  }

  // ===================== CONNECTION =====================

  /**
   * Connect this node's output slot to a target node's input slot.
   * Restored original signature & full validation/event flow.
   * Returns the created LLink on success, null on failure.
   * @param {number|string} slot - output slot index or name
   * @param {LGraphNode|number} target_node - target node or its id
   * @param {number|string} target_slot - input slot index, name, or LiteGraph.EVENT (-1) for trigger
   */
  connect(slot, target_node, target_slot) {
    target_slot = target_slot || 0;

    if (!this.graph) {
      console.log(
        "Connect: Error, node doesn't belong to any graph. Nodes must be added first to a graph before connecting them."
      );
      return null;
    }

    // Seek for the output slot (by name or index)
    if (slot && slot.constructor === String) {
      slot = this.findOutputSlot(slot);
      if (slot == -1) {
        if (LiteGraph.debug) console.log("Connect: Error, no slot of name " + slot);
        return null;
      }
    } else if (!this.outputs || slot >= this.outputs.length) {
      if (LiteGraph.debug) console.log("Connect: Error, slot number not found");
      return null;
    }

    if (target_node && target_node.constructor === Number) {
      target_node = this.graph.getNodeById(target_node);
    }
    if (!target_node) {
      throw "target node is null";
    }

    // Avoid loopback
    if (target_node === this) {
      return null;
    }

    // Seek for the input slot (by name, index, or EVENT for trigger)
    if (target_slot && target_slot.constructor === String) {
      target_slot = target_node.findInputSlot(target_slot);
      if (target_slot == -1) {
        if (LiteGraph.debug)
          console.log("Connect: Error, no slot of name " + target_slot);
        return null;
      }
    } else if (target_slot === LiteGraph.EVENT) {
      // EVENT slot connection removed (EVENT/ACTION model deleted)
      return null;
    } else if (!target_node.inputs || target_slot >= target_node.inputs.length) {
      if (LiteGraph.debug) console.log("Connect: Error, slot number not found");
      return null;
    }

    let changed = false;
    const input = target_node.inputs[target_slot];
    let link_info = null;
    const output = this.outputs[slot];

    if (!this.outputs[slot]) {
      return null;
    }

    // Allow target node to redirect the slot at connect time
    if (target_node.onBeforeConnectInput) {
      target_slot = target_node.onBeforeConnectInput(target_slot);
    }

    // Validate type compatibility
    if (
      target_slot === false ||
      target_slot === null ||
      !LiteGraph.isValidConnection(output.type, input.type)
    ) {
      this.setDirtyCanvas(false, true);
      if (changed) this.graph.connectionChange(this, link_info);
      return null;
    }

    // Allow nodes to veto the connection
    if (target_node.onConnectInput) {
      if (
        target_node.onConnectInput(target_slot, output.type, output, this, slot) === false
      ) {
        return null;
      }
    }
    if (this.onConnectOutput) {
      if (
        this.onConnectOutput(slot, input.type, input, target_node, target_slot) === false
      ) {
        return null;
      }
    }

    // If something is already plugged at the target input, disconnect it first
    if (
      target_node.inputs[target_slot] &&
      target_node.inputs[target_slot].link != null
    ) {
      this.graph.beforeChange();
      target_node.disconnectInput(target_slot, { doProcessChange: false });
      changed = true;
    }

    // For EVENT outputs, optionally enforce single-output
    if (output.links !== null && output.links.length) {
      switch (output.type) {
        case LiteGraph.EVENT:
          // allow_multi_output_for_events removed (EVENT/ACTION model deleted)
          break;
        default:
          break;
      }
    }

    // Generate next link id
    let nextId;
    if (LiteGraph.use_uuids) nextId = LiteGraph.uuidv4();
    else nextId = ++this.graph.last_link_id;

    // Create the link
    const LLinkCtor = LiteGraph.LLink || LiteGraph._LLink;
    link_info = LLinkCtor
      ? new LLinkCtor(
          nextId,
          input.type || output.type,
          this.id,
          slot,
          target_node.id,
          target_slot
        )
      : {
          id: nextId,
          type: input.type || output.type,
          origin_id: this.id,
          origin_slot: slot,
          target_id: target_node.id,
          target_slot: target_slot,
          _data: null,
          _pos: new Float32Array(2),
        };

    this.graph.links[link_info.id] = link_info;

    if (output.links == null) output.links = [];
    output.links.push(link_info.id);
    target_node.inputs[target_slot].link = link_info.id;

    if (this.graph) this.graph._version++;

    if (this.onConnectionsChange) {
      this.onConnectionsChange(LiteGraph.OUTPUT, slot, true, link_info, output);
    }
    if (target_node.onConnectionsChange) {
      target_node.onConnectionsChange(
        LiteGraph.INPUT,
        target_slot,
        true,
        link_info,
        input
      );
    }
    if (this.graph && this.graph.onNodeConnectionChange) {
      this.graph.onNodeConnectionChange(
        LiteGraph.INPUT,
        target_node,
        target_slot,
        this,
        slot
      );
      this.graph.onNodeConnectionChange(
        LiteGraph.OUTPUT,
        this,
        slot,
        target_node,
        target_slot
      );
    }

    this.setDirtyCanvas(false, true);
    this.graph.afterChange();
    this.graph.connectionChange(this, link_info);

    // Strategy 1 (Reactive Dirty Marking): a new connection means the
    // target node now has fresh upstream data to consume. Mark it dirty
    // so the next run actually pulls the value through. The source node
    // is NOT marked dirty — its output hasn't changed.
    if (target_node && target_node.markDirty) target_node.markDirty();

    return link_info;
  }

  /**
   * Connect by type - find a compatible input slot on the target node.
   * Restored original options + fallback paths.
   */
  connectByType(slot, target_node, target_slotType, optsIn) {
    const opts = Object.assign(
      {
        createEventInCase: true,
        firstFreeIfOutputGeneralInCase: true,
        generalTypeInCase: true,
      },
      optsIn || {}
    );

    if (target_node && target_node.constructor === Number) {
      target_node = this.graph.getNodeById(target_node);
    }

    let target_slot = target_node.findInputSlotByType(target_slotType, false, true);
    if (target_slot >= 0 && target_slot !== null) {
      return this.connect(slot, target_node, target_slot);
    }

    if (opts.createEventInCase && target_slotType === LiteGraph.EVENT) {
      return this.connect(slot, target_node, -1);
    }

    if (opts.generalTypeInCase) {
      const generalSlot = target_node.findInputSlotByType(0, false, true, true);
      if (generalSlot >= 0) {
        return this.connect(slot, target_node, generalSlot);
      }
    }

    if (
      opts.firstFreeIfOutputGeneralInCase &&
      (target_slotType === 0 || target_slotType === "*" || target_slotType === "")
    ) {
      const freeSlot = target_node.findInputSlotFree({
        typesNotAccepted: [LiteGraph.EVENT],
      });
      if (freeSlot >= 0) {
        return this.connect(slot, target_node, freeSlot);
      }
    }

    console.debug("no way to connect type: ", target_slotType, " to targetNODE ", target_node);
    return null;
  }

  /**
   * Connect by type (output side) - find a compatible output slot on the source node.
   */
  connectByTypeOutput(slot, source_node, source_slotType, optsIn) {
    const opts = Object.assign(
      {
        createEventInCase: true,
        firstFreeIfInputGeneralInCase: true,
        generalTypeInCase: true,
      },
      optsIn || {}
    );

    if (source_node && source_node.constructor === Number) {
      source_node = this.graph.getNodeById(source_node);
    }

    let source_slot = source_node.findOutputSlotByType(source_slotType, false, true);
    if (source_slot >= 0 && source_slot !== null) {
      return source_node.connect(source_slot, this, slot);
    }

    if (opts.generalTypeInCase) {
      const generalSlot = source_node.findOutputSlotByType(0, false, true, true);
      if (generalSlot >= 0) {
        return source_node.connect(generalSlot, this, slot);
      }
    }

    if (opts.createEventInCase && source_slotType === LiteGraph.EVENT) {
      // EVENT slot auto-connection removed (EVENT/ACTION model deleted)
    }

    if (
      opts.firstFreeIfInputGeneralInCase &&
      (source_slotType === 0 || source_slotType === "*" || source_slotType === "")
    ) {
      const freeSlot = source_node.findOutputSlotFree({
        typesNotAccepted: [LiteGraph.EVENT],
      });
      if (freeSlot >= 0) {
        return source_node.connect(freeSlot, this, slot);
      }
    }

    console.debug("no way to connect byOUT type: ", source_slotType, " to sourceNODE ", source_node);
    return null;
  }

  /**
   * Disconnect one output slot, optionally only for a specific target node.
   * Restored original full event-firing flow.
   */
  disconnectOutput(slot, target_node) {
    if (slot && slot.constructor === String) {
      slot = this.findOutputSlot(slot);
      if (slot == -1) {
        if (LiteGraph.debug) console.log("Connect: Error, no slot of name " + slot);
        return false;
      }
    } else if (!this.outputs || slot >= this.outputs.length) {
      if (LiteGraph.debug) console.log("Connect: Error, slot number not found");
      return false;
    }

    const output = this.outputs[slot];
    if (!output || !output.links || output.links.length === 0) {
      return false;
    }

    // Disconnect only the link(s) targeting a specific node
    if (target_node) {
      if (target_node.constructor === Number) {
        target_node = this.graph.getNodeById(target_node);
      }
      if (!target_node) {
        throw "Target Node not found";
      }

      for (let i = 0, l = output.links.length; i < l; i++) {
        const link_id = output.links[i];
        const link_info = this.graph.links[link_id];
        if (!link_info) continue;

        if (link_info.target_id === target_node.id) {
          output.links.splice(i, 1);
          const input = target_node.inputs[link_info.target_slot];
          input.link = null;
          delete this.graph.links[link_id];
          if (this.graph) this.graph._version++;
          if (target_node.onConnectionsChange) {
            target_node.onConnectionsChange(
              LiteGraph.INPUT,
              link_info.target_slot,
              false,
              link_info,
              input
            );
          }
          if (this.onConnectionsChange) {
            this.onConnectionsChange(LiteGraph.OUTPUT, slot, false, link_info, output);
          }
          if (this.graph && this.graph.onNodeConnectionChange) {
            this.graph.onNodeConnectionChange(LiteGraph.OUTPUT, this, slot);
            this.graph.onNodeConnectionChange(
              LiteGraph.INPUT,
              target_node,
              link_info.target_slot
            );
          }
          break;
        }
      }
    } else {
      // Disconnect ALL links from this output
      for (let i = 0, l = output.links.length; i < l; i++) {
        const link_id = output.links[i];
        const link_info = this.graph.links[link_id];
        if (!link_info) continue;

        const target = this.graph.getNodeById(link_info.target_id);
        let input = null;
        if (this.graph) this.graph._version++;
        if (target) {
          input = target.inputs[link_info.target_slot];
          input.link = null;
          if (target.onConnectionsChange) {
            target.onConnectionsChange(
              LiteGraph.INPUT,
              link_info.target_slot,
              false,
              link_info,
              input
            );
          }
          if (this.graph && this.graph.onNodeConnectionChange) {
            this.graph.onNodeConnectionChange(
              LiteGraph.INPUT,
              target,
              link_info.target_slot
            );
          }
          // Strategy 1: mark each affected downstream node dirty.
          if (target.markDirty) target.markDirty();
        }
        delete this.graph.links[link_id];
        if (this.onConnectionsChange) {
          this.onConnectionsChange(LiteGraph.OUTPUT, slot, false, link_info, output);
        }
        if (this.graph && this.graph.onNodeConnectionChange) {
          this.graph.onNodeConnectionChange(LiteGraph.OUTPUT, this, slot);
          this.graph.onNodeConnectionChange(
            LiteGraph.INPUT,
            target,
            link_info.target_slot
          );
        }
      }
      output.links = null;
    }

    this.setDirtyCanvas(false, true);
    this.graph.connectionChange(this);
    // Strategy 1: single-target branch — mark that target dirty.
    if (target_node && target_node.markDirty) target_node.markDirty();
    return true;
  }

  /**
   * Disconnect an input slot.
   * Restored original full event-firing flow.
   */
  disconnectInput(slot) {
    if (slot && slot.constructor === String) {
      slot = this.findInputSlot(slot);
      if (slot == -1) {
        if (LiteGraph.debug) console.log("Connect: Error, no slot of name " + slot);
        return false;
      }
    } else if (!this.inputs || slot >= this.inputs.length) {
      if (LiteGraph.debug) console.log("Connect: Error, slot number not found");
      return false;
    }

    const input = this.inputs[slot];
    if (!input) return false;

    const link_id = this.inputs[slot].link;
    if (link_id != null) {
      this.inputs[slot].link = null;

      const link_info = this.graph.links[link_id];
      if (link_info) {
        const target_node = this.graph.getNodeById(link_info.origin_id);
        if (!target_node) return false;

        const output = target_node.outputs[link_info.origin_slot];
        if (!output || !output.links || output.links.length === 0) return false;

        // Find & remove this link from the output's links array
        // BUGFIX: `l` was not declared (only `i` was), causing
        // "l is not defined" in strict mode after minification.
        let i;
        const linkCount = output.links.length;
        for (i = 0; i < linkCount; i++) {
          if (output.links[i] === link_id) {
            output.links.splice(i, 1);
            break;
          }
        }

        delete this.graph.links[link_id];
        if (this.graph) this.graph._version++;

        if (this.onConnectionsChange) {
          this.onConnectionsChange(LiteGraph.INPUT, slot, false, link_info, input);
        }
        if (target_node.onConnectionsChange) {
          target_node.onConnectionsChange(
            LiteGraph.OUTPUT,
            i,
            false,
            link_info,
            output
          );
        }
        if (this.graph && this.graph.onNodeConnectionChange) {
          this.graph.onNodeConnectionChange(LiteGraph.OUTPUT, target_node, i);
          this.graph.onNodeConnectionChange(LiteGraph.INPUT, this, slot);
        }
      }
    }

    this.setDirtyCanvas(false, true);
    if (this.graph) this.graph.connectionChange(this);
    // Strategy 1 (Reactive Dirty Marking): this node lost an upstream
    // input — mark itself dirty so onExecute runs with the new (null)
    // input state on the next step.
    if (this.markDirty) this.markDirty();
    return true;
  }

  // ===================== CONNECTION POSITION =====================

  /**
   * Returns the center of a connection point in canvas coords.
   * Restored original full algorithm: collapsed handling (incl. horizontal
   * layout), -1 special case, hard-coded slot.pos overrides, horizontal
   * distributed slots, and slot_start_y offset.
   */
  getConnectionPos(is_input, slot_number, out) {
    out = out || new Float32Array(2);
    let num_slots = 0;
    if (is_input && this.inputs) num_slots = this.inputs.length;
    if (!is_input && this.outputs) num_slots = this.outputs.length;

    const offset = LiteGraph.NODE_SLOT_HEIGHT * 0.5;

    if (this.flags && this.flags.collapsed) {
      const w = this._collapsed_width || LiteGraph.NODE_COLLAPSED_WIDTH;
      if (this.horizontal) {
        out[0] = this.pos[0] + w * 0.5;
        if (is_input) {
          out[1] = this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT;
        } else {
          out[1] = this.pos[1];
        }
      } else {
        if (is_input) {
          out[0] = this.pos[0];
        } else {
          out[0] = this.pos[0] + w;
        }
        out[1] = this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT * 0.5;
      }
      return out;
    }

    // Weird feature that never got finished — special -1 slot
    if (is_input && slot_number === -1) {
      out[0] = this.pos[0] + LiteGraph.NODE_TITLE_HEIGHT * 0.5;
      out[1] = this.pos[1] + LiteGraph.NODE_TITLE_HEIGHT * 0.5;
      return out;
    }

    // Hard-coded per-slot pos override
    if (
      is_input &&
      num_slots > slot_number &&
      this.inputs[slot_number] &&
      this.inputs[slot_number].pos
    ) {
      out[0] = this.pos[0] + this.inputs[slot_number].pos[0];
      out[1] = this.pos[1] + this.inputs[slot_number].pos[1];
      return out;
    } else if (
      !is_input &&
      num_slots > slot_number &&
      this.outputs[slot_number] &&
      this.outputs[slot_number].pos
    ) {
      out[0] = this.pos[0] + this.outputs[slot_number].pos[0];
      out[1] = this.pos[1] + this.outputs[slot_number].pos[1];
      return out;
    }

    // Horizontal distributed slots
    if (this.horizontal) {
      out[0] =
        this.pos[0] + (slot_number + 0.5) * (this.size[0] / num_slots);
      if (is_input) {
        out[1] = this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT;
      } else {
        out[1] = this.pos[1] + this.size[1];
      }
      return out;
    }

    // Default vertical slots
    if (is_input) {
      out[0] = this.pos[0] + offset;
    } else {
      out[0] = this.pos[0] + this.size[0] + 1 - offset;
    }
    out[1] =
      this.pos[1] +
      (slot_number + 0.7) * LiteGraph.NODE_SLOT_HEIGHT +
      (this.constructor.slot_start_y || 0);
    return out;
  }

  // ===================== SLOT SEARCH =====================

  findInputSlot(name, returnObj) {
    if (!this.inputs) return -1;
    for (let i = 0, l = this.inputs.length; i < l; ++i) {
      if (name === this.inputs[i].name) {
        return !returnObj ? i : this.inputs[i];
      }
    }
    return -1;
  }

  findOutputSlot(name, returnObj) {
    returnObj = returnObj || false;
    if (!this.outputs) return -1;
    for (let i = 0, l = this.outputs.length; i < l; ++i) {
      if (name === this.outputs[i].name) {
        return !returnObj ? i : this.outputs[i];
      }
    }
    return -1;
  }

  /**
   * Returns the first free input slot.
   * Restored original options: { returnObj, typesNotAccepted }.
   */
  findInputSlotFree(optsIn) {
    const opts = Object.assign(
      { returnObj: false, typesNotAccepted: [] },
      optsIn || {}
    );
    if (!this.inputs) return -1;
    for (let i = 0, l = this.inputs.length; i < l; ++i) {
      if (this.inputs[i].link && this.inputs[i].link != null) continue;
      if (
        opts.typesNotAccepted &&
        opts.typesNotAccepted.includes &&
        opts.typesNotAccepted.includes(this.inputs[i].type)
      ) {
        continue;
      }
      return !opts.returnObj ? i : this.inputs[i];
    }
    return -1;
  }

  findOutputSlotFree(optsIn) {
    const opts = Object.assign(
      { returnObj: false, typesNotAccepted: [] },
      optsIn || {}
    );
    if (!this.outputs) return -1;
    for (let i = 0, l = this.outputs.length; i < l; ++i) {
      if (this.outputs[i].links && this.outputs[i].links != null) continue;
      if (
        opts.typesNotAccepted &&
        opts.typesNotAccepted.includes &&
        opts.typesNotAccepted.includes(this.outputs[i].type)
      ) {
        continue;
      }
      return !opts.returnObj ? i : this.outputs[i];
    }
    return -1;
  }

  findInputSlotByType(type, returnObj, preferFreeSlot, doNotUseOccupied) {
    return this.findSlotByType(true, type, returnObj, preferFreeSlot, doNotUseOccupied);
  }

  findOutputSlotByType(type, returnObj, preferFreeSlot, doNotUseOccupied) {
    return this.findSlotByType(false, type, returnObj, preferFreeSlot, doNotUseOccupied);
  }

  /**
   * Returns the output (or input) slot with a given type.
   * Restored original rich matching: comma-split, _event_/EVENT and star/0
   * normalization, preferFreeSlot first pass, doNotUseOccupied fallback.
   * First argument is boolean `input` (true=inputs, false=outputs).
   */
  findSlotByType(input, type, returnObj, preferFreeSlot, doNotUseOccupied) {
    input = input || false;
    returnObj = returnObj || false;
    preferFreeSlot = preferFreeSlot || false;
    doNotUseOccupied = doNotUseOccupied || false;
    const aSlots = input ? this.inputs : this.outputs;
    if (!aSlots) return -1;

    // Empty string / "*" → 0 (wildcard)
    if (type === "" || type === "*") type = 0;

    // First pass: prefer free slots if requested
    for (let i = 0, l = aSlots.length; i < l; ++i) {
      const aSource = (type + "").toLowerCase().split(",");
      let aDest =
        aSlots[i].type === "0" || aSlots[i].type === "*" ? "0" : aSlots[i].type;
      aDest = (aDest + "").toLowerCase().split(",");
      for (let sI = 0; sI < aSource.length; sI++) {
        for (let dI = 0; dI < aDest.length; dI++) {
          if (aSource[sI] === "_event_") aSource[sI] = LiteGraph.EVENT;
          if (aDest[sI] === "_event_") aDest[sI] = LiteGraph.EVENT;
          if (aSource[sI] === "*") aSource[sI] = 0;
          if (aDest[sI] === "*") aDest[sI] = 0;
          if (aSource[sI] === aDest[dI]) {
            if (preferFreeSlot && aSlots[i].links && aSlots[i].links !== null) continue;
            return !returnObj ? i : aSlots[i];
          }
        }
      }
    }

    // Second pass (only if preferFreeSlot was requested and we're allowed to use occupied)
    if (preferFreeSlot && !doNotUseOccupied) {
      for (let i = 0, l = aSlots.length; i < l; ++i) {
        const aSource = (type + "").toLowerCase().split(",");
        let aDest =
          aSlots[i].type === "0" || aSlots[i].type === "*" ? "0" : aSlots[i].type;
        aDest = (aDest + "").toLowerCase().split(",");
        for (let sI = 0; sI < aSource.length; sI++) {
          for (let dI = 0; dI < aDest.length; dI++) {
            if (aSource[sI] === "*") aSource[sI] = 0;
            if (aDest[sI] === "*") aDest[sI] = 0;
            if (aSource[sI] === aDest[dI]) {
              return !returnObj ? i : aSlots[i];
            }
          }
        }
      }
    }
    return -1;
  }

  // ===================== SIZE & LAYOUT =====================

  setSize(size) {
    this.size = size;
    if (this.onResize) this.onResize(size);
  }

  /**
   * Computes the minimum size of a node according to its slots & widgets.
   * Restored original algorithm: constructor.size shortcut, font-based text
   * width, widgets_up/widgets_start_y, slot_start_y, min_height, +6 margin.
   */
  computeSize(out) {
    if (this.constructor.size) {
      return this.constructor.size.concat();
    }

    const rows = Math.max(
      this.inputs ? this.inputs.length : 1,
      this.outputs ? this.outputs.length : 1
    );
    const size = out || new Float32Array([0, 0]);
    const font_size = LiteGraph.NODE_TEXT_SIZE;

    const compute_text_size = (text) => {
      if (!text) return 0;
      return font_size * text.length * 0.6;
    };

    const title_width = compute_text_size(this.title);
    let input_width = 0;
    let output_width = 0;

    if (this.inputs) {
      for (let i = 0, l = this.inputs.length; i < l; ++i) {
        const input = this.inputs[i];
        const text = input.label || input.name || "";
        const text_width = compute_text_size(text);
        if (input_width < text_width) input_width = text_width;
      }
    }
    if (this.outputs) {
      for (let i = 0, l = this.outputs.length; i < l; ++i) {
        const output = this.outputs[i];
        const text = output.label || output.name || "";
        const text_width = compute_text_size(text);
        if (output_width < text_width) output_width = text_width;
      }
    }

    size[0] = Math.max(input_width + output_width + 10, title_width);
    size[0] = Math.max(size[0], LiteGraph.NODE_WIDTH);
    // Widget system removed — no widget width inflation.

    size[1] =
      (this.constructor.slot_start_y || 0) +
      rows * LiteGraph.NODE_SLOT_HEIGHT;

    // Widget system removed — no widget height calculation.
    // (Previous code added widgets_height based on this.widgets[].computeSize;
    //  with widgets gone, node height is purely slot-driven.)

    if (this.constructor.min_height && size[1] < this.constructor.min_height) {
      size[1] = this.constructor.min_height;
    }

    size[1] += 6; // margin
    return size;
  }

  getBounding(out, compute_outer) {
    out = out || new Float32Array(4);
    const nodePos = this.pos;
    const isCollapsed = this.flags && this.flags.collapsed;
    const nodeSize = this.size;

    let left_offset = 0;
    let right_offset = 1;
    let top_offset = 0;
    let bottom_offset = 0;

    if (compute_outer) {
      left_offset = 4;
      right_offset = 6 + left_offset;
      top_offset = 4;
      bottom_offset = 5 + top_offset;
    }

    out[0] = nodePos[0] - left_offset;
    out[1] = nodePos[1] - LiteGraph.NODE_TITLE_HEIGHT - top_offset;
    out[2] = isCollapsed
      ? (this._collapsed_width || LiteGraph.NODE_COLLAPSED_WIDTH) + right_offset
      : nodeSize[0] + right_offset;
    out[3] = isCollapsed
      ? LiteGraph.NODE_TITLE_HEIGHT + bottom_offset
      : nodeSize[1] + LiteGraph.NODE_TITLE_HEIGHT + bottom_offset;

    if (this.onBounding) {
      this.onBounding(out);
    }
    return out;
  }

  /**
   * Returns true if the point (x, y) is inside this node.
   * Restored original logic: skip_title flag, graph.isLive() check,
   * collapsed-node branch (using isInsideRectangle + _collapsed_width),
   * 4px x-margin buffer.
   */
  isPointInside(x, y, margin, skip_title) {
    margin = margin || 0;
    let margin_top =
      this.graph && this.graph.isLive() ? 0 : LiteGraph.NODE_TITLE_HEIGHT;
    if (skip_title) margin_top = 0;

    if (this.flags && this.flags.collapsed) {
      if (
        isInsideRectangle(
          x,
          y,
          this.pos[0] - margin,
          this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT - margin,
          (this._collapsed_width || LiteGraph.NODE_COLLAPSED_WIDTH) +
            2 * margin,
          LiteGraph.NODE_TITLE_HEIGHT + 2 * margin
        )
      ) {
        return true;
      }
    } else if (
      this.pos[0] - 4 - margin < x &&
      this.pos[0] + this.size[0] + 4 + margin > x &&
      this.pos[1] - margin_top - margin < y &&
      this.pos[1] + this.size[1] + margin > y
    ) {
      return true;
    }
    return false;
  }

  /**
   * Checks if a point is inside a node slot, returns info about which slot.
   * Restored original hit-test (20x10 rectangle anchored at top-left of
   * the slot position) and the `link_pos` key name (callers may destructure
   * `link_pos`, so the camelCase rename was breaking).
   */
  getSlotInPosition(x, y) {
    const link_pos = new Float32Array(2);
    if (this.inputs) {
      for (let i = 0, l = this.inputs.length; i < l; ++i) {
        const input = this.inputs[i];
        this.getConnectionPos(true, i, link_pos);
        if (isInsideRectangle(x, y, link_pos[0] - 10, link_pos[1] - 5, 20, 10)) {
          return { input: input, slot: i, link_pos: link_pos };
        }
      }
    }
    if (this.outputs) {
      for (let i = 0, l = this.outputs.length; i < l; ++i) {
        const output = this.outputs[i];
        this.getConnectionPos(false, i, link_pos);
        if (isInsideRectangle(x, y, link_pos[0] - 10, link_pos[1] - 5, 20, 10)) {
          return { output: output, slot: i, link_pos: link_pos };
        }
      }
    }
    return null;
  }

  alignToGrid() {
    this.pos[0] = Math.round(this.pos[0] / LiteGraph.CANVAS_GRID_SIZE) * LiteGraph.CANVAS_GRID_SIZE;
    this.pos[1] = Math.round(this.pos[1] / LiteGraph.CANVAS_GRID_SIZE) * LiteGraph.CANVAS_GRID_SIZE;
  }

  // ===================== WIDGETS =====================

  /**
   * Defines a widget inside the node.
   * Restored original full polymorphism:
   *   - callback may be an Object → treated as `options`
   *   - options may be a String → treated as property name
   *   - callback may be a String → treated as property name
   *   - warns if callback isn't a function
   *   - throws for combo widgets without options.values
   *   - copies w.options.y to w.y
   *   - lowercases widget type
   */
  /**
   * addWidget — DEPRECATED, kept as a no-op stub for interface compatibility.
   *
   * The widget system (canvas-rendered input controls on nodes) has been
   * removed. Nodes should expose editable parameters via addProperty()
   * instead; hosts render property editors through their own UI (e.g. the
   * PropertyEditor panel in page.tsx).
   *
   * This stub silently absorbs the call so legacy node constructors that
   * call `this.addWidget(...)` don't throw. The `value` argument is still
   * applied to the bound property (if `options.property` is set) so the
   * initial value isn't lost. The callback is never invoked — hosts must
   * use setProperty() to mutate properties going forward.
   */
  addWidget(type, name, value, callback, options) {
    // Normalize options (same as original so the property-binding branch
    // below doesn't need to handle all the legacy calling conventions).
    if (!options && callback && callback.constructor === Object) {
      options = callback;
      callback = null;
    }
    if (options && options.constructor === String) {
      options = { property: options };
    }
    if (callback && callback.constructor === String) {
      if (!options) options = {};
      options.property = callback;
      callback = null;
    }
    // Apply the initial value to the bound property so nodes that rely on
    // addWidget for default-value setup still work.
    if (options && options.property && this.properties) {
      if (this.properties[options.property] === undefined) {
        this.properties[options.property] = value;
      }
    }
    // Return a stub object so callers that chain off the return value
    // (e.g. `const w = node.addWidget(...); w.something = x`) don't crash.
    return {
      type: type.toLowerCase ? type.toLowerCase() : type,
      name: name,
      value: value,
      options: options || {},
    };
  }

  /** addCustomWidget — DEPRECATED no-op stub. See addWidget docs. */
  addCustomWidget(customWidget) {
    return customWidget;
  }


  // ===================== EVENT/TRIGGER (REMOVED) =====================
  // The EVENT/ACTION execution model has been fully removed. The engine is
  // purely data-flow driven (mode=ALWAYS) now. The following methods are
  // kept as minimal no-op stubs ONLY for doExecute (still called by runStep
  // in the do_not_catch_errors=true path) — all other EVENT/ACTION methods
  // (addOnTriggerInput, addOnExecutedOutput, onAfterExecuteNode, changeMode,
  // executePendingActions, actionDo, trigger, triggerSlot, clearTriggeredSlot,
  // executeAction) have been deleted as they had zero callers.
  //
  // doExecute is kept because _runStepInternal checks `node.doExecute` and
  // calls it. It just forwards to onExecute. If onExecute is undefined this
  // is a no-op.

  /** @deprecated forwards to onExecute. runStep calls this in no-catch path. */
  doExecute(param, options) {
    if (this.onExecute) this.onExecute(param, options);
  }

  // ===================== MISC =====================

  /**
   * Adds a special connection to this node (used for special graph kinds).
   * Restored original signature: (name, type, pos, direction).
   * Creates a connection object and pushes it to this.connections.
   */
  addConnection(name, type, pos, direction) {
    const o = {
      name: name,
      type: type,
      pos: pos,
      direction: direction,
      links: null,
    };
    if (!this.connections) this.connections = [];
    this.connections.push(o);
    return o;
  }

  setDirtyCanvas(fg, bg) {
    if (this.graph) {
      this.graph.sendActionToCanvas("setDirty", [fg, bg]);
    }
  }

  /**
   * Preload an image. Restored original: tracks `img.ready = false` until
   * the load event fires, then sets it true and calls setDirtyCanvas(true)
   * so the canvas redraws with the loaded image.
   */
  loadImage(url) {
    const img = new Image();
    img.src = LiteGraph.node_images_path + url;
    img.ready = false;
    const self = this;
    img.onload = function () {
      this.ready = true;
      self.setDirtyCanvas(true);
    };
    return img;
  }

  /**
   * Console output. Restored original: keeps an in-node console buffer
   * (capped by LGraphNode.MAX_CONSOLE — note: this constant is never
   * defined in the original, so we fall back to 100). Forwards to
   * graph.onNodeTrace if the graph is attached.
   */
  trace(msg) {
    if (!this.console) {
      this.console = [];
    }
    this.console.push(msg);
    const maxConsole = LGraphNode.MAX_CONSOLE || 100;
    if (this.console.length > maxConsole) {
      this.console.shift();
    }
    if (this.graph && this.graph.onNodeTrace) {
      this.graph.onNodeTrace(this, msg);
    }
  }

  /**
   * Allows a node to get onMouseMove / onMouseUp events even when the mouse
   * is out of focus. Restored original direct-manipulation logic (iterates
   * graph canvases and sets node_capturing_input directly).
   */
  captureInput(v) {
    if (!this.graph || !this.graph.list_of_graphcanvas) return;
    const list = this.graph.list_of_graphcanvas;
    for (let i = 0; i < list.length; ++i) {
      const c = list[i];
      // Releasing somebody else's capture?!
      if (!v && c.node_capturing_input !== this) continue;
      c.node_capturing_input = v ? this : null;
    }
  }

  collapse(force) {
    if (this.graph) this.graph._version++;
    if (this.constructor.collapsable === false && !force) return;
    if (!this.flags) this.flags = {};
    if (!this.flags.collapsed) {
      this.flags.collapsed = true;
    } else {
      this.flags.collapsed = false;
    }
    this.setDirtyCanvas(true, true);
  }

  pin(v) {
    if (this.graph) this.graph._version++;
    if (!this.flags) this.flags = {};
    if (v === undefined) {
      this.flags.pinned = !this.flags.pinned;
    } else {
      this.flags.pinned = v;
    }
  }

  localToScreen(x, y, graphcanvas) {
    // Original uses graphcanvas.scale / graphcanvas.offset directly. The
    // refactored LGraphCanvas keeps a DragAndScale instance at .ds but also
    // exposes .scale / .offset proxies — support both to stay compatible
    // with callers using either API.
    const scale = graphcanvas.ds ? graphcanvas.ds.scale : graphcanvas.scale;
    const offset = graphcanvas.ds ? graphcanvas.ds.offset : graphcanvas.offset;
    return [
      (x + this.pos[0]) * scale + offset[0],
      (y + this.pos[1]) * scale + offset[1],
    ];
  }
}

// Lazy registration to avoid circular dependency issues
// LiteGraph._LGraphNode will be set after all modules are loaded

export { LGraphNode };
export default LGraphNode;
