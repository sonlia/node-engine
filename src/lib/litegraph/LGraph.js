/**
 * LGraph - The main graph class that holds nodes, links, and groups
 *
 * Refactored from a constructor function + prototype to ES6 class.
 * Original: function LGraph(o) { ... }
 *
 * Key changes:
 * - Constructor function → ES6 class constructor
 * - Prototype methods → class methods
 * - var → const/let
 * - Function expressions → arrow functions where appropriate
 * - Static properties defined on the class
 * - Proper ES6 module imports
 */

import { LiteGraph } from "./LiteGraph.js";
import { LLink } from "./LLink.js";
import { cloneObject, getTime, uuidv4 } from "./utils.js";
import { LGraphGroup } from "./LGraphGroup.js";
import { LGraphNode } from "./LGraphNode.js";

class LGraph extends EventTarget {
  // ===================== STATIC PROPERTIES =====================

  static STATUS_STOPPED = 1;
  static STATUS_RUNNING = 2;

  //default supported types
  static supported_types = ["number", "string", "boolean"];

  // ===================== CONSTRUCTOR =====================

  constructor(o) {
    super();
    if (LiteGraph.debug) {
      console.log("Graph created");
    }
    this.list_of_graphcanvas = null;
    this.clear();

    if (o) {
      this.configure(o);
    }
  }

  // ===================== STATIC METHODS =====================

  /**
   * Returns the supported types for this graph
   */
  getSupportedTypes() {
    return this.supported_types || LGraph.supported_types;
  }

  // ===================== CORE METHODS =====================

  /**
   * Removes all nodes from this graph
   * @method clear
   */
  clear() {
    this.stop();
    this.status = LGraph.STATUS_STOPPED;

    this.last_node_id = 0;
    this.last_link_id = 0;

    this._version = -1; //used to detect changes

    //safe clear
    if (this._nodes) {
      for (let i = 0; i < this._nodes.length; ++i) {
        const node = this._nodes[i];
        if (node.onRemoved) {
          node.onRemoved();
        }
      }
    }

    //nodes
    this._nodes = [];
    this._nodes_by_id = {};
    this._nodes_in_order = []; //nodes sorted in execution order
    this._nodes_executable = null; //nodes that contain onExecute sorted in execution order

    //other scene stuff
    this._groups = [];

    //links
    this.links = {}; //container with all the links

    //iterations
    this.iteration = 0;

    //custom data
    this.config = {};
    this.vars = {};
    this.extra = {}; //to store custom data

    //timing
    this.globaltime = 0;
    this.runningtime = 0;
    this.fixedtime = 0;
    this.fixedtime_lapse = 0.01;
    this.elapsed_time = 0.01;
    this.last_update_time = 0;
    this.starttime = 0;

    this.catch_errors = true;

    this.nodes_executing = [];
    this.nodes_actioning = [];
    this.nodes_executedAction = [];

    // ====================================================================
    // Execution Optimization infrastructure (Strategies 3 / 4 / 5).
    // --------------------------------------------------------------------
    // _cacheStore: WeakMap<LGraphNode, {key, output}> (Strategy 3).
    //   Lazily created on first storeCachedOutput() call. When a node is
    //   dropped, its entry auto-GCs — no manual sweep. Centralized on the
    //   graph so `clear()` just reassigns to null and all prior entries
    //   become eligible for collection.
    //
    // _downstreamAdjacency: Map<nodeId, LGraphNode[]> (Strategy 4).
    //   Precomputed direct-successor list per node. Built by
    //   rebuildTopology() alongside the topological order. Powers:
    //     • LGraphNode.markDirty() — Strategy 1+4 fusion, fast propagation
    //     • LGraph.runTarget()    — Strategy 2+4 fusion, lazy chain walk
    //
    // asyncScheduler: AsyncScheduler instance (Strategy 5).
    //   Hosts assign `graph.asyncScheduler = new WorkerScheduler({...})`
    //   to enable heavy-node offloading. When null, heavy nodes fall
    //   back to synchronous execution in _runStepOptimized.
    //
    // config.optimized_execution: bool (default false for backward compat).
    //   When true, runStep dispatches to _runStepOptimized (Strategy 1+3+4+5
    //   fusion). When false, falls back to classic full-traversal.
    // ====================================================================
    this._cacheStore = null;
    this._downstreamAdjacency = null;
    this.asyncScheduler = null;

    //subgraph_data
    this.inputs = {};
    this.outputs = {};

    //notify canvas to redraw
    this.change();

    this.sendActionToCanvas("clear");
  }

  /**
   * Attach Canvas to this graph
   * @method attachCanvas
   * @param {GraphCanvas} graphcanvas
   */
  attachCanvas(graphcanvas) {
    // Resolve LGraphCanvas through the late-attached LiteGraph reference to
    // avoid a direct circular import (LGraphCanvas.js imports LGraph.js).
    // index.js sets `LiteGraph.LGraphCanvas = LGraphCanvas` after both
    // modules finish evaluating.
    const LGraphCanvasClass = LiteGraph.LGraphCanvas;
    if (LGraphCanvasClass && !(graphcanvas instanceof LGraphCanvasClass)) {
      throw "attachCanvas expects a LGraphCanvas instance";
    }
    if (graphcanvas.graph && graphcanvas.graph !== this) {
      graphcanvas.graph.detachCanvas(graphcanvas);
    }

    graphcanvas.graph = this;

    if (!this.list_of_graphcanvas) {
      this.list_of_graphcanvas = [];
    }
    this.list_of_graphcanvas.push(graphcanvas);
  }

  /**
   * Detach Canvas from this graph
   * @method detachCanvas
   * @param {GraphCanvas} graphcanvas
   */
  detachCanvas(graphcanvas) {
    if (!this.list_of_graphcanvas) {
      return;
    }

    const pos = this.list_of_graphcanvas.indexOf(graphcanvas);
    if (pos === -1) {
      return;
    }
    graphcanvas.graph = null;
    this.list_of_graphcanvas.splice(pos, 1);
  }

  /**
   * Starts running this graph every interval milliseconds.
   * @method start
   * @param {number} interval amount of milliseconds between executions, if 0 then it renders to the monitor refresh rate
   */
  start(interval) {
    if (this.status === LGraph.STATUS_RUNNING) {
      return;
    }
    this.status = LGraph.STATUS_RUNNING;

    if (this.onPlayEvent) {
      this.onPlayEvent();
    }

    this.sendEventToAllNodes("onStart");

    //launch
    this.starttime = getTime();
    this.last_update_time = this.starttime;
    interval = interval || 0;

    //execute once per frame
    if (
      interval === 0 &&
      typeof window !== "undefined" &&
      window.requestAnimationFrame
    ) {
      const on_frame = () => {
        if (this.execution_timer_id !== -1) {
          return;
        }
        window.requestAnimationFrame(on_frame);
        if (this.onBeforeStep) this.onBeforeStep();
        this.runStep(1, !this.catch_errors);
        if (this.onAfterStep) this.onAfterStep();
      };
      this.execution_timer_id = -1;
      on_frame();
    } else {
      //execute every 'interval' ms
      this.execution_timer_id = setInterval(() => {
        //execute
        if (this.onBeforeStep) this.onBeforeStep();
        this.runStep(1, !this.catch_errors);
        if (this.onAfterStep) this.onAfterStep();
      }, interval);
    }
  }

  /**
   * Stops the execution loop of the graph
   * @method stop
   */
  stop() {
    if (this.status === LGraph.STATUS_STOPPED) {
      return;
    }

    this.status = LGraph.STATUS_STOPPED;

    if (this.onStopEvent) {
      this.onStopEvent();
    }

    if (this.execution_timer_id != null) {
      if (this.execution_timer_id !== -1) {
        clearInterval(this.execution_timer_id);
      }
      this.execution_timer_id = null;
    }

    this.sendEventToAllNodes("onStop");
  }

  /**
   * Run N steps (cycles) of the graph.
   *
   * Backward-compatible entry point. Behavior depends on
   * `this.config.optimized_execution`:
   *
   *   - falsy (default): classic full-graph traversal — every node with
   *     mode=ALWAYS and an onExecute() runs every step. Identical to the
   *     original LiteGraph semantics; old nodes work unchanged.
   *
   *   - true: Strategy 1+3+4+5 fused path. Iterates `_nodes_executable`
   *     (topological order, Strategy 4), skips clean nodes (Strategy 1),
   *     short-circuits via getCachedOutput() on cache hit (Strategy 3),
   *     and dispatches `_isHeavy` nodes to asyncScheduler (Strategy 5).
   *
   * @method runStep
   * @param {number} num number of steps to run, default is 1
   * @param {Boolean} do_not_catch_errors [optional] if you want to try/catch errors
   * @param {number} limit max number of nodes to execute (used to execute from start to a node)
   */
  runStep(num, do_not_catch_errors, limit) {
    num = num || 1;

    const start = getTime();
    this.globaltime = 0.001 * (start - this.starttime);

    // Strategy 4 (Topological Sort Pre-computation): `_nodes_executable`
    // is rebuilt by updateExecutionOrder() whenever the connection graph
    // changes (see connectionChange). Falling back to `_nodes` keeps
    // things working during initial setup before the first sort.
    const nodes = this._nodes_executable
      ? this._nodes_executable
      : this._nodes;
    if (!nodes) {
      return;
    }

    limit = limit || nodes.length;

    // Dispatch to the optimized path when enabled; otherwise run the
    // classic full-traversal loop for backward compatibility.
    if (this.config && this.config.optimized_execution) {
      this._runStepOptimized(nodes, limit, do_not_catch_errors);
    } else {
      this._runStepClassic(nodes, num, limit, do_not_catch_errors);
    }

    const now = getTime();
    let elapsed = now - start;
    if (elapsed === 0) {
      elapsed = 1;
    }
    this.execution_time = 0.001 * elapsed;
    this.globaltime += 0.001 * elapsed;
    this.iteration += 1;
    this.elapsed_time = (now - this.last_update_time) * 0.001;
    this.last_update_time = now;
    this.nodes_executing = [];
    this.nodes_actioning = [];
    this.nodes_executedAction = [];
  }

  /**
   * Classic full-graph traversal — original LiteGraph behavior.
   * Every node with mode=ALWAYS and onExecute() runs every step,
   * regardless of dirty state or cache.
   *
   * Interface compatibility (matches original litegraph):
   *   - do_not_catch_errors=true  → calls node.doExecute() which wraps
   *     onExecute with action tracking (nodes_executing,
   *     nodes_executedAction, action_call) and fires onAfterExecuteNode.
   *   - do_not_catch_errors=false → calls node.onExecute() directly
   *     (bare, no action tracking) so exceptions propagate to the try/catch.
   *   - Both branches flush _waiting_actions first when
   *     LiteGraph.use_deferred_actions is enabled.
   */
  _runStepClassic(nodes, num, limit, do_not_catch_errors) {
    const runOnce = () => {
      for (let j = 0; j < limit; ++j) {
        const node = nodes[j];
        if (
          LiteGraph.use_deferred_actions &&
          node._waiting_actions &&
          node._waiting_actions.length
        ) {
          node.executePendingActions();
        }
        if (node.mode === LiteGraph.ALWAYS && node.onExecute) {
          // Match original: doExecute() in the no-catch path (action
          // tracking + onAfterExecuteNode), bare onExecute() in the
          // catch path so exceptions bubble up cleanly.
          if (do_not_catch_errors && node.doExecute) {
            node.doExecute();
          } else {
            node.onExecute();
          }
        }
      }
      this.fixedtime += this.fixedtime_lapse;
      if (this.onExecuteStep) this.onExecuteStep();
    };

    if (do_not_catch_errors) {
      for (let i = 0; i < num; i++) runOnce();
      if (this.onAfterExecute) this.onAfterExecute();
    } else {
      try {
        for (let i = 0; i < num; i++) runOnce();
        if (this.onAfterExecute) this.onAfterExecute();
        this.errors_in_execution = false;
      } catch (err) {
        this.errors_in_execution = true;
        if (LiteGraph.throw_errors) throw err;
        if (LiteGraph.debug) console.log("Error during execution: " + err);
        this.stop();
      }
    }
  }

  /**
   * Optimized run path — fuses Strategies 1, 3, 4, 5.
   *
   * Flow (matches the design doc's "组合执行流程"):
   *   1. Iterate `_nodes_executable` in topological order (Strategy 4).
   *   2. Flush _waiting_actions (deferred actions) — interface compat
   *      with original litegraph's use_deferred_actions behavior.
   *   3. For each node, check `_dirty` (Strategy 1). If false, skip —
   *      the node's previous output is still valid. Order matters:
   *      dirty check is cheaper than cache key computation, so we do
   *      it first.
   *   4. If dirty, check getCachedOutput() (Strategy 3). On hit,
   *      applyCachedOutput() and skip onExecute entirely.
   *   5. On cache miss, dispatch onExecute:
   *        - synchronous for light nodes (via doExecute for action
   *          tracking parity, or bare onExecute in catch-error path)
   *        - async (Promise / Worker) for `_isHeavy` nodes (Strategy 5)
   *   6. After successful sync execution: storeCachedOutput() + clearDirty().
   *
   * Interface compatibility:
   *   - do_not_catch_errors=true  → doExecute() (action tracking + onAfterExecuteNode)
   *   - do_not_catch_errors=false → onExecute() (bare, so try/catch sees the error)
   *   - _waiting_actions flushed before each node when use_deferred_actions is on
   *
   * Note: the heavy-node async path falls back to sync execution if no
   * asyncScheduler is attached. This keeps default single-threaded
   * behavior intact while allowing hosts to plug in a Worker pool.
   */
  _runStepOptimized(nodes, limit, do_not_catch_errors) {
    const runOnce = () => {
      for (let j = 0; j < limit; ++j) {
        const node = nodes[j];
        if (!node || node.mode !== LiteGraph.ALWAYS || !node.onExecute) continue;

        // Flush deferred actions — interface compat with original litegraph.
        // Must happen BEFORE the dirty check so pending actions are processed
        // even if the node would otherwise be skipped.
        if (
          LiteGraph.use_deferred_actions &&
          node._waiting_actions &&
          node._waiting_actions.length
        ) {
          node.executePendingActions();
        }

        // Strategy 1 (Reactive Dirty Marking) — skip clean nodes.
        // _alwaysDirty nodes (Timer, etc.) report dirty every step.
        if (node.isDirty && !node.isDirty()) {
          continue;
        }

        // Strategy 3 (Result Caching) — fast path on cache hit.
        if (node.getCachedOutput) {
          const cached = node.getCachedOutput();
          if (cached != null) {
            if (node.applyCachedOutput) node.applyCachedOutput();
            // Even on cache hit we should fire onAfterExecuteNode for
            // interface parity — but original litegraph only fires it
            // inside doExecute, so we skip here too. Cache hit = no
            // re-execution = no after-execute callback.
            continue;
          }
        }

        // Strategy 5 (Async Execution) — heavy nodes off the main thread.
        if (node._isHeavy && this.asyncScheduler && !node._asyncPending) {
          node._asyncPending = true;
          this.asyncScheduler
            .run(node)
            .then(() => {
              node._asyncPending = false;
              if (node.storeCachedOutput) node.storeCachedOutput();
              if (node.clearDirty) node.clearDirty();
            })
            .catch((err) => {
              node._asyncPending = false;
              if (LiteGraph.debug) {
                console.error("[LiteGraph] async node failed", node, err);
              }
            });
          continue;
        }

        // Synchronous execution (default).
        // Match _runStepClassic: doExecute() in the no-catch path for
        // action tracking + onAfterExecuteNode; bare onExecute() in the
        // catch path so exceptions propagate to the try/catch wrapper.
        if (do_not_catch_errors && node.doExecute) {
          node.doExecute();
        } else {
          node.onExecute();
        }
        if (node.storeCachedOutput) node.storeCachedOutput();
        if (node.clearDirty) node.clearDirty();
      }
      this.fixedtime += this.fixedtime_lapse;
      if (this.onExecuteStep) this.onExecuteStep();
    };

    if (do_not_catch_errors) {
      runOnce();
      if (this.onAfterExecute) this.onAfterExecute();
    } else {
      try {
        runOnce();
        if (this.onAfterExecute) this.onAfterExecute();
        this.errors_in_execution = false;
      } catch (err) {
        this.errors_in_execution = true;
        if (LiteGraph.throw_errors) throw err;
        if (LiteGraph.debug) console.log("Error during execution: " + err);
        this.stop();
      }
    }
  }

  /**
   * Public alias for the optimized run path (Strategy fusion entry point).
   * Equivalent to calling runStep() with config.optimized_execution=true,
   * but makes intent explicit at call sites and works even if the host
   * forgot to flip the config flag.
   */
  runOptimized(num, do_not_catch_errors) {
    const prev = this.config && this.config.optimized_execution;
    if (!this.config) this.config = {};
    this.config.optimized_execution = true;
    try {
      this.runStep(num || 1, do_not_catch_errors);
    } finally {
      // Restore previous setting so callers don't accidentally flip the
      // global mode just by calling runOptimized once.
      if (prev === undefined) delete this.config.optimized_execution;
      else this.config.optimized_execution = prev;
    }
  }

  /**
   * Lazy / on-demand execution (Strategy 2 + Strategy 4 fusion).
   *
   * Walks the dependency chain backwards from `targetNode`, ensuring
   * every ancestor has fresh output before executing the target.
   * Combined with the cache (Strategy 3) and dirty flag (Strategy 1),
   * only the chain feeding the requested output recomputes.
   *
   * Strategy 2+4 fusion:
   *   - When `_downstreamAdjacency` is available, use
   *     _getAncestorsViaAdjacency() — O(ancestors) BFS with no per-link
   *     lookup. Falls back to getAncestors() during early bootstrap.
   *   - The chain is already in topological order (parents before
   *     children) so each input is fresh by the time its consumer runs.
   */
  runTarget(targetNode, do_not_catch_errors) {
    if (!targetNode) return;
    if (typeof targetNode === "string" || typeof targetNode === "number") {
      targetNode = this.getNodeById(targetNode);
    }
    if (!targetNode) return;

    let chain;
    if (this._downstreamAdjacency) {
      chain = this._getAncestorsViaAdjacency(targetNode);
    } else {
      const ancestors = this.getAncestors(targetNode);
      chain = ancestors.concat([targetNode]);
    }

    const exec = (node) => {
      if (!node || !node.onExecute) return;
      // Strategy 1 — skip clean nodes.
      if (node.isDirty && !node.isDirty()) return;
      // Strategy 3 — cache hit short-circuits the subtree.
      if (node.getCachedOutput) {
        const cached = node.getCachedOutput();
        if (cached != null) {
          if (node.applyCachedOutput) node.applyCachedOutput();
          return;
        }
      }
      node.onExecute();
      if (node.storeCachedOutput) node.storeCachedOutput();
      if (node.clearDirty) node.clearDirty();
    };

    if (do_not_catch_errors) {
      for (let i = 0; i < chain.length; i++) exec(chain[i]);
      if (this.onAfterExecute) this.onAfterExecute();
    } else {
      try {
        for (let i = 0; i < chain.length; i++) exec(chain[i]);
        if (this.onAfterExecute) this.onAfterExecute();
        this.errors_in_execution = false;
      } catch (err) {
        this.errors_in_execution = true;
        if (LiteGraph.throw_errors) throw err;
        this.stop();
      }
    }
  }

  /**
   * Build the ancestor chain for `targetNode` by BFS from the target's
   * inputs upward (Strategy 2+4 fusion). Returns an array in topological
   * order (parents-first), ending with `targetNode` itself.
   * @private
   */
  _getAncestorsViaAdjacency(targetNode) {
    const visited = new Set();
    const order = [];
    const queue = [targetNode];

    while (queue.length) {
      const node = queue.shift();
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      if (node !== targetNode) order.unshift(node);

      if (!node.inputs) continue;
      for (let i = 0; i < node.inputs.length; i++) {
        const input = node.inputs[i];
        if (!input || input.link == null) continue;
        const link = this.links[input.link];
        if (!link) continue;
        const origin = this.getNodeById(link.origin_id);
        if (origin && !visited.has(origin.id)) {
          queue.push(origin);
        }
      }
    }

    order.push(targetNode);
    return order;
  }

  /**
   * Rebuild the cached topological execution order (Strategy 4) AND the
   * downstream adjacency index that powers markDirty / runTarget fusion.
   *
   *   1. Builds `_downstreamAdjacency: Map<nodeId, LGraphNode[]>` —
   *      direct-successor list per node, in O(N+E).
   *   2. Bulk-invalidates caches (sets _dirty directly on every node,
   *      drops the WeakMap so old entries become GC-eligible).
   *   3. Dispatches 'topologyRebuilt' for external listeners.
   *
   * Called automatically from connectionChange(); hosts can also call
   * it manually after bulk-editing the graph.
   */
  rebuildTopology() {
    this.updateExecutionOrder();

    // ---- Strategy 4: build downstream adjacency index ----
    const adj = new Map();
    if (this._nodes) {
      for (let i = 0; i < this._nodes.length; i++) {
        const node = this._nodes[i];
        adj.set(node.id, []);
        if (!node.outputs) continue;
        for (let j = 0; j < node.outputs.length; j++) {
          const output = node.outputs[j];
          if (!output || !output.links) continue;
          for (let k = 0; k < output.links.length; k++) {
            const link = this.links[output.links[k]];
            if (!link) continue;
            const target = this.getNodeById(link.target_id);
            if (target && target !== node) {
              adj.get(node.id).push(target);
            }
          }
        }
      }
    }
    this._downstreamAdjacency = adj;

    // ---- Strategy 3: fine-grained cache invalidation ----
    // Previous code bulk-set _dirty=true on EVERY node and dropped the
    // entire WeakMap cache here. That was wasteful: connecting A→B
    // would invalidate the C→D chain's cache even though C→D was
    // untouched, forcing a full recompute on the next step.
    //
    // The connect()/disconnectInput()/disconnectOutput() call sites
    // already invoke markDirty() on the precise set of affected nodes
    // (the target node + its downstream via markDirty propagation).
    // So rebuildTopology() does NOT need to touch _dirty or _cacheStore
    // at all — the fine-grained invalidation is already done by the
    // callers.
    //
    // We only dispatch the event so external listeners (auto-save,
    // debug overlays) can react.

    this.dispatchEvent(new CustomEvent("topologyRebuilt", { detail: { graph: this } }));
  }

  /**
   * Updates the graph execution order according to relevance of the nodes (nodes with only outputs have more relevance than
   * nodes with only inputs.
   * @method updateExecutionOrder
   */
  updateExecutionOrder() {
    this._nodes_in_order = this.computeExecutionOrder(false);
    this._nodes_executable = [];
    for (let i = 0; i < this._nodes_in_order.length; ++i) {
      if (this._nodes_in_order[i].onExecute) {
        this._nodes_executable.push(this._nodes_in_order[i]);
      }
    }
  }

  //This is more internal, it computes the executable nodes in order and returns it
  computeExecutionOrder(only_onExecute, set_level) {
    let L = [];
    const S = [];
    const M = {};
    const visited_links = {}; //to avoid repeating links
    const remaining_links = {}; //to a

    //search for the nodes without inputs (starting nodes)
    for (let i = 0, l = this._nodes.length; i < l; ++i) {
      const node = this._nodes[i];
      if (only_onExecute && !node.onExecute) {
        continue;
      }

      M[node.id] = node; //add to pending nodes

      let num = 0; //num of input connections
      if (node.inputs) {
        for (let j = 0, l2 = node.inputs.length; j < l2; j++) {
          if (node.inputs[j] && node.inputs[j].link != null) {
            num += 1;
          }
        }
      }

      if (num === 0) {
        //is a starting node
        S.push(node);
        if (set_level) {
          node._level = 1;
        }
      } //num of input links
      else {
        if (set_level) {
          node._level = 0;
        }
        remaining_links[node.id] = num;
      }
    }

    while (true) {
      if (S.length === 0) {
        break;
      }

      //get a starting node
      const node = S.shift();
      L.push(node); //add to ordered list
      delete M[node.id]; //remove from the pending nodes

      if (!node.outputs) {
        continue;
      }

      //for every output
      for (let i = 0; i < node.outputs.length; i++) {
        const output = node.outputs[i];
        //not connected
        if (
          output == null ||
          output.links == null ||
          output.links.length === 0
        ) {
          continue;
        }

        //for every connection
        for (let j = 0; j < output.links.length; j++) {
          const link_id = output.links[j];
          const link = this.links[link_id];
          if (!link) {
            continue;
          }

          //already visited link (ignore it)
          if (visited_links[link.id]) {
            continue;
          }

          const target_node = this.getNodeById(link.target_id);
          if (target_node == null) {
            visited_links[link.id] = true;
            continue;
          }

          if (
            set_level &&
            (!target_node._level || target_node._level <= node._level)
          ) {
            target_node._level = node._level + 1;
          }

          visited_links[link.id] = true; //mark as visited
          remaining_links[target_node.id] -= 1; //reduce the number of links remaining
          if (remaining_links[target_node.id] === 0) {
            S.push(target_node);
          } //if no more links, then add to starters array
        }
      }
    }

    //the remaining ones (loops)
    for (const i in M) {
      L.push(M[i]);
    }

    if (L.length !== this._nodes.length && LiteGraph.debug) {
      console.warn("something went wrong, nodes missing");
    }

    const l = L.length;

    //save order number in the node
    for (let i = 0; i < l; ++i) {
      L[i].order = i;
    }

    //sort now by priority
    L = L.sort((A, B) => {
      const Ap = A.constructor.priority || A.priority || 0;
      const Bp = B.constructor.priority || B.priority || 0;
      if (Ap === Bp) {
        //if same priority, sort by order
        return A.order - B.order;
      }
      return Ap - Bp; //sort by priority
    });

    //save order number in the node, again...
    for (let i = 0; i < l; ++i) {
      L[i].order = i;
    }

    return L;
  }

  /**
   * Returns all the nodes that could affect this one (ancestors) by crawling all the inputs recursively.
   * It doesn't include the node itself
   * @method getAncestors
   * @return {Array} an array with all the LGraphNodes that affect this node, in order of execution
   */
  getAncestors(node) {
    const ancestors = [];
    const pending = [node];
    const visited = {};

    while (pending.length) {
      const current = pending.shift();
      if (!current.inputs) {
        continue;
      }
      if (!visited[current.id] && current !== node) {
        visited[current.id] = true;
        ancestors.push(current);
      }

      for (let i = 0; i < current.inputs.length; ++i) {
        const input = current.getInputNode(i);
        if (input && ancestors.indexOf(input) === -1) {
          pending.push(input);
        }
      }
    }

    ancestors.sort((a, b) => a.order - b.order);
    return ancestors;
  }

  /**
   * Positions every node in a more readable manner
   * @method arrange
   */
  arrange(margin, layout) {
    margin = margin || 100;

    const nodes = this.computeExecutionOrder(false, true);
    const columns = [];
    for (let i = 0; i < nodes.length; ++i) {
      const node = nodes[i];
      const col = node._level || 1;
      if (!columns[col]) {
        columns[col] = [];
      }
      columns[col].push(node);
    }

    let x = margin;

    for (let i = 0; i < columns.length; ++i) {
      const column = columns[i];
      if (!column) {
        continue;
      }
      let max_size = 100;
      let y = margin + LiteGraph.NODE_TITLE_HEIGHT;
      for (let j = 0; j < column.length; ++j) {
        const node = column[j];
        node.pos[0] = layout === LiteGraph.VERTICAL_LAYOUT ? y : x;
        node.pos[1] = layout === LiteGraph.VERTICAL_LAYOUT ? x : y;
        const max_size_index =
          layout === LiteGraph.VERTICAL_LAYOUT ? 1 : 0;
        if (node.size[max_size_index] > max_size) {
          max_size = node.size[max_size_index];
        }
        const node_size_index =
          layout === LiteGraph.VERTICAL_LAYOUT ? 0 : 1;
        y += node.size[node_size_index] + margin + LiteGraph.NODE_TITLE_HEIGHT;
      }
      x += max_size + margin;
    }

    this.setDirtyCanvas(true, true);
  }

  /**
   * Returns the amount of time the graph has been running in milliseconds
   * @method getTime
   * @return {number} number of milliseconds the graph has been running
   */
  getTime() {
    return this.globaltime;
  }

  /**
   * Returns the amount of time accumulated using the fixedtime_lapse var. This is used in context where the time increments should be constant
   * @method getFixedTime
   * @return {number} number of milliseconds the graph has been running
   */
  getFixedTime() {
    return this.fixedtime;
  }

  /**
   * Returns the amount of time it took to compute the latest iteration. Take into account that this number could be not correct
   * if the nodes are using graphical actions
   * @method getElapsedTime
   * @return {number} number of milliseconds it took the last cycle
   */
  getElapsedTime() {
    return this.elapsed_time;
  }

  /**
   * Sends an event to all the nodes, useful to trigger stuff
   * @method sendEventToAllNodes
   * @param {String} eventname the name of the event (function to be called)
   * @param {Array} params parameters in array format
   */
  sendEventToAllNodes(eventname, params, mode) {
    mode = mode || LiteGraph.ALWAYS;

    const nodes = this._nodes_in_order ? this._nodes_in_order : this._nodes;
    if (!nodes) {
      return;
    }

    for (let j = 0, l = nodes.length; j < l; ++j) {
      const node = nodes[j];

      if (
        node.constructor === LiteGraph.Subgraph &&
        eventname !== "onExecute"
      ) {
        if (node.mode === mode) {
          node.sendEventToAllNodes(eventname, params, mode);
        }
        continue;
      }

      if (!node[eventname] || node.mode !== mode) {
        continue;
      }
      if (params === undefined) {
        node[eventname]();
      } else if (params && params.constructor === Array) {
        node[eventname].apply(node, params);
      } else {
        node[eventname](params);
      }
    }
  }

  sendActionToCanvas(action, params) {
    if (!this.list_of_graphcanvas) {
      return;
    }

    for (let i = 0; i < this.list_of_graphcanvas.length; ++i) {
      const c = this.list_of_graphcanvas[i];
      if (c[action]) {
        c[action].apply(c, params);
      }
    }
  }

  /**
   * Adds a new node instance to this graph
   * @method add
   * @param {LGraphNode} node the instance of the node
   */
  add(node, skip_compute_order) {
    if (!node) {
      return;
    }

    //groups
    if (node.constructor === LGraphGroup) {
      this._groups.push(node);
      this.setDirtyCanvas(true);
      this.change();
      node.graph = this;
      this._version++;
      return;
    }

    //nodes
    if (node.id !== -1 && this._nodes_by_id[node.id] != null) {
      console.warn(
        "LiteGraph: there is already a node with this ID, changing it"
      );
      if (LiteGraph.use_uuids) {
        node.id = uuidv4();
      } else {
        node.id = ++this.last_node_id;
      }
    }

    if (this._nodes.length >= LiteGraph.MAX_NUMBER_OF_NODES) {
      throw "LiteGraph: max number of nodes in a graph reached";
    }

    //give him an id
    if (LiteGraph.use_uuids) {
      if (node.id == null || node.id === -1) node.id = uuidv4();
    } else {
      if (node.id == null || node.id === -1) {
        node.id = ++this.last_node_id;
      } else if (this.last_node_id < node.id) {
        this.last_node_id = node.id;
      }
    }

    node.graph = this;
    this._version++;

    this._nodes.push(node);
    this._nodes_by_id[node.id] = node;

    if (node.onAdded) {
      node.onAdded(this);
    }

    if (this.config.align_to_grid) {
      node.alignToGrid();
    }

    if (!skip_compute_order) {
      this.updateExecutionOrder();
    }

    if (this.onNodeAdded) {
      this.onNodeAdded(node);
    }

    this.setDirtyCanvas(true);
    this.change();

    return node; //to chain actions
  }

  /**
   * Removes a node from the graph
   * @method remove
   * @param {LGraphNode} node the instance of the node
   */
  remove(node) {
    if (node.constructor === LGraphGroup) {
      const index = this._groups.indexOf(node);
      if (index !== -1) {
        this._groups.splice(index, 1);
      }
      node.graph = null;
      this._version++;
      this.setDirtyCanvas(true, true);
      this.change();
      return;
    }

    if (this._nodes_by_id[node.id] == null) {
      return;
    } //not found

    if (node.ignore_remove) {
      return;
    } //cannot be removed

    this.beforeChange(); //sure? - almost sure is wrong

    //disconnect inputs
    if (node.inputs) {
      for (let i = 0; i < node.inputs.length; i++) {
        const slot = node.inputs[i];
        if (slot.link != null) {
          node.disconnectInput(i);
        }
      }
    }

    //disconnect outputs
    if (node.outputs) {
      for (let i = 0; i < node.outputs.length; i++) {
        const slot = node.outputs[i];
        if (slot.links != null && slot.links.length) {
          node.disconnectOutput(i);
        }
      }
    }

    //node.id = -1; //why?

    //callback
    if (node.onRemoved) {
      node.onRemoved();
    }

    node.graph = null;
    this._version++;

    //remove from canvas render
    if (this.list_of_graphcanvas) {
      for (let i = 0; i < this.list_of_graphcanvas.length; ++i) {
        const canvas = this.list_of_graphcanvas[i];
        if (canvas.selected_nodes[node.id]) {
          delete canvas.selected_nodes[node.id];
        }
        if (canvas.node_dragged === node) {
          canvas.node_dragged = null;
        }
      }
    }

    //remove from containers
    const pos = this._nodes.indexOf(node);
    if (pos !== -1) {
      this._nodes.splice(pos, 1);
    }
    delete this._nodes_by_id[node.id];

    if (this.onNodeRemoved) {
      this.onNodeRemoved(node);
    }

    //close panels
    this.sendActionToCanvas("checkPanels");

    this.setDirtyCanvas(true, true);
    this.afterChange(); //sure? - almost sure is wrong
    this.change();

    this.updateExecutionOrder();
  }

  /**
   * Returns a node by its id.
   * @method getNodeById
   * @param {Number} id
   */
  getNodeById(id) {
    if (id == null) {
      return null;
    }
    return this._nodes_by_id[id];
  }

  /**
   * Returns a list of nodes that matches a class
   * @method findNodesByClass
   * @param {Class} classObject the class itself (not an string)
   * @return {Array} a list with all the nodes of this type
   */
  findNodesByClass(classObject, result) {
    result = result || [];
    result.length = 0;
    for (let i = 0, l = this._nodes.length; i < l; ++i) {
      if (this._nodes[i].constructor === classObject) {
        result.push(this._nodes[i]);
      }
    }
    return result;
  }

  /**
   * Returns a list of nodes that matches a type
   * @method findNodesByType
   * @param {String} type the name of the node type
   * @return {Array} a list with all the nodes of this type
   */
  findNodesByType(type, result) {
    const typeLower = type.toLowerCase();
    result = result || [];
    result.length = 0;
    for (let i = 0, l = this._nodes.length; i < l; ++i) {
      if (this._nodes[i].type.toLowerCase() === typeLower) {
        result.push(this._nodes[i]);
      }
    }
    return result;
  }

  /**
   * Returns the first node that matches a name in its title
   * @method findNodeByTitle
   * @param {String} name the name of the node to search
   * @return {Node} the node or null
   */
  findNodeByTitle(title) {
    for (let i = 0, l = this._nodes.length; i < l; ++i) {
      if (this._nodes[i].title === title) {
        return this._nodes[i];
      }
    }
    return null;
  }

  /**
   * Returns a list of nodes that matches a name
   * @method findNodesByTitle
   * @param {String} name the name of the node to search
   * @return {Array} a list with all the nodes with this name
   */
  findNodesByTitle(title) {
    const result = [];
    for (let i = 0, l = this._nodes.length; i < l; ++i) {
      if (this._nodes[i].title === title) {
        result.push(this._nodes[i]);
      }
    }
    return result;
  }

  /**
   * Returns the top-most node in this position of the canvas
   * @method getNodeOnPos
   * @param {number} x the x coordinate in canvas space
   * @param {number} y the y coordinate in canvas space
   * @param {Array} nodes_list a list with all the nodes to search from, by default is all the nodes in the graph
   * @return {LGraphNode} the node at this position or null
   */
  getNodeOnPos(x, y, nodes_list, margin) {
    nodes_list = nodes_list || this._nodes;
    let nRet = null;
    for (let i = nodes_list.length - 1; i >= 0; i--) {
      const n = nodes_list[i];
      if (n.isPointInside(x, y, margin)) {
        // check for lesser interest nodes (TODO check for overlapping, use the top)
        /*if (typeof n == "LGraphGroup"){
                    nRet = n;
                }else{*/
        return n;
        /*}*/
      }
    }
    return nRet;
  }

  /**
   * Returns the top-most group in that position
   * @method getGroupOnPos
   * @param {number} x the x coordinate in canvas space
   * @param {number} y the y coordinate in canvas space
   * @return {LGraphGroup} the group or null
   */
  getGroupOnPos(x, y) {
    for (let i = this._groups.length - 1; i >= 0; i--) {
      const g = this._groups[i];
      if (g.isPointInside(x, y, 2, true)) {
        return g;
      }
    }
    return null;
  }

  /**
   * Checks that the node type matches the node type registered, used when replacing a nodetype by a newer version during execution
   * this replaces the ones using the old version with the new version
   * @method checkNodeTypes
   */
  checkNodeTypes() {
    let changes = false;
    for (let i = 0; i < this._nodes.length; i++) {
      const node = this._nodes[i];
      const ctor = LiteGraph.registered_node_types[node.type];
      if (node.constructor === ctor) {
        continue;
      }
      console.log("node being replaced by newer version: " + node.type);
      const newnode = LiteGraph.createNode(node.type);
      changes = true;
      this._nodes[i] = newnode;
      newnode.configure(node.serialize());
      newnode.graph = this;
      this._nodes_by_id[newnode.id] = newnode;
      if (node.inputs) {
        newnode.inputs = node.inputs.concat();
      }
      if (node.outputs) {
        newnode.outputs = node.outputs.concat();
      }
    }
    this.updateExecutionOrder();
  }

  // ********** GLOBALS *****************

  onAction(action, param, options) {
    this._input_nodes = this.findNodesByClass(
      LiteGraph.GraphInput,
      this._input_nodes
    );
    for (let i = 0; i < this._input_nodes.length; ++i) {
      const node = this._input_nodes[i];
      if (node.properties.name !== action) {
        continue;
      }
      //wrap node.onAction(action, param);
      node.actionDo(action, param, options);
      break;
    }
  }

  trigger(action, param) {
    if (this.onTrigger) {
      this.onTrigger(action, param);
    }
  }

  /**
   * Tell this graph it has a global graph input of this type
   * @method addInput
   * @param {String} name
   * @param {String} type
   * @param {*} value [optional]
   */
  addInput(name, type, value) {
    const input = this.inputs[name];
    if (input) {
      //already exist
      return;
    }

    this.beforeChange();
    this.inputs[name] = { name: name, type: type, value: value };
    this._version++;
    this.afterChange();

    if (this.onInputAdded) {
      this.onInputAdded(name, type);
    }

    if (this.onInputsOutputsChange) {
      this.onInputsOutputsChange();
    }
  }

  /**
   * Assign a data to the global graph input
   * @method setInputData
   * @param {String} name
   * @param {*} data
   */
  setInputData(name, data) {
    const input = this.inputs[name];
    if (!input) {
      return;
    }
    input.value = data;
  }

  /**
   * Returns the current value of a global graph input
   * @method getInputData
   * @param {String} name
   * @return {*} the data
   */
  getInputData(name) {
    const input = this.inputs[name];
    if (!input) {
      return null;
    }
    return input.value;
  }

  /**
   * Changes the name of a global graph input
   * @method renameInput
   * @param {String} old_name
   * @param {String} new_name
   */
  renameInput(old_name, name) {
    if (name === old_name) {
      return;
    }

    if (!this.inputs[old_name]) {
      return false;
    }

    if (this.inputs[name]) {
      console.error("there is already one input with that name");
      return false;
    }

    this.inputs[name] = this.inputs[old_name];
    delete this.inputs[old_name];
    this._version++;

    if (this.onInputRenamed) {
      this.onInputRenamed(old_name, name);
    }

    if (this.onInputsOutputsChange) {
      this.onInputsOutputsChange();
    }
  }

  /**
   * Changes the type of a global graph input
   * @method changeInputType
   * @param {String} name
   * @param {String} type
   */
  changeInputType(name, type) {
    if (!this.inputs[name]) {
      return false;
    }

    if (
      this.inputs[name].type &&
      String(this.inputs[name].type).toLowerCase() ===
        String(type).toLowerCase()
    ) {
      return;
    }

    this.inputs[name].type = type;
    this._version++;
    if (this.onInputTypeChanged) {
      this.onInputTypeChanged(name, type);
    }
  }

  /**
   * Removes a global graph input
   * @method removeInput
   * @param {String} name
   * @param {String} type
   */
  removeInput(name) {
    if (!this.inputs[name]) {
      return false;
    }

    delete this.inputs[name];
    this._version++;

    if (this.onInputRemoved) {
      this.onInputRemoved(name);
    }

    if (this.onInputsOutputsChange) {
      this.onInputsOutputsChange();
    }
    return true;
  }

  /**
   * Creates a global graph output
   * @method addOutput
   * @param {String} name
   * @param {String} type
   * @param {*} value
   */
  addOutput(name, type, value) {
    this.outputs[name] = { name: name, type: type, value: value };
    this._version++;

    if (this.onOutputAdded) {
      this.onOutputAdded(name, type);
    }

    if (this.onInputsOutputsChange) {
      this.onInputsOutputsChange();
    }
  }

  /**
   * Assign a data to the global output
   * @method setOutputData
   * @param {String} name
   * @param {String} value
   */
  setOutputData(name, value) {
    const output = this.outputs[name];
    if (!output) {
      return;
    }
    output.value = value;
  }

  /**
   * Returns the current value of a global graph output
   * @method getOutputData
   * @param {String} name
   * @return {*} the data
   */
  getOutputData(name) {
    const output = this.outputs[name];
    if (!output) {
      return null;
    }
    return output.value;
  }

  /**
   * Renames a global graph output
   * @method renameOutput
   * @param {String} old_name
   * @param {String} new_name
   */
  renameOutput(old_name, name) {
    if (!this.outputs[old_name]) {
      return false;
    }

    if (this.outputs[name]) {
      console.error("there is already one output with that name");
      return false;
    }

    this.outputs[name] = this.outputs[old_name];
    delete this.outputs[old_name];
    this._version++;

    if (this.onOutputRenamed) {
      this.onOutputRenamed(old_name, name);
    }

    if (this.onInputsOutputsChange) {
      this.onInputsOutputsChange();
    }
  }

  /**
   * Changes the type of a global graph output
   * @method changeOutputType
   * @param {String} name
   * @param {String} type
   */
  changeOutputType(name, type) {
    if (!this.outputs[name]) {
      return false;
    }

    if (
      this.outputs[name].type &&
      String(this.outputs[name].type).toLowerCase() ===
        String(type).toLowerCase()
    ) {
      return;
    }

    this.outputs[name].type = type;
    this._version++;
    if (this.onOutputTypeChanged) {
      this.onOutputTypeChanged(name, type);
    }
  }

  /**
   * Removes a global graph output
   * @method removeOutput
   * @param {String} name
   */
  removeOutput(name) {
    if (!this.outputs[name]) {
      return false;
    }
    delete this.outputs[name];
    this._version++;

    if (this.onOutputRemoved) {
      this.onOutputRemoved(name);
    }

    if (this.onInputsOutputsChange) {
      this.onInputsOutputsChange();
    }
    return true;
  }

  triggerInput(name, value) {
    const nodes = this.findNodesByTitle(name);
    for (let i = 0; i < nodes.length; ++i) {
      nodes[i].onTrigger(value);
    }
  }

  setCallback(name, func) {
    const nodes = this.findNodesByTitle(name);
    for (let i = 0; i < nodes.length; ++i) {
      nodes[i].setTrigger(func);
    }
  }

  //used for undo, called before any change is made to the graph
  beforeChange(info) {
    if (this.onBeforeChange) {
      this.onBeforeChange(this, info);
    }
    this.sendActionToCanvas("onBeforeChange", this);
  }

  //used to resend actions, called after any change is made to the graph
  afterChange(info) {
    if (this.onAfterChange) {
      this.onAfterChange(this, info);
    }
    this.sendActionToCanvas("onAfterChange", this);
  }

  connectionChange(node, link_info) {
    // Strategy 4 (Topological Sort Pre-computation): rebuild the cached
    // execution order AND _downstreamAdjacency on every connection change
    // so the next runStep can walk `_nodes_executable` directly without
    // re-resolving dependencies. rebuildTopology() also clears downstream
    // caches and dispatches 'topologyRebuilt'.
    this.rebuildTopology();
    if (this.onConnectionChange) {
      this.onConnectionChange(node);
    }
    this._version++;
    this.sendActionToCanvas("onConnectionChange");
  }

  /**
   * returns if the graph is in live mode
   * @method isLive
   */
  isLive() {
    if (!this.list_of_graphcanvas) {
      return false;
    }

    for (let i = 0; i < this.list_of_graphcanvas.length; ++i) {
      const c = this.list_of_graphcanvas[i];
      if (c.live_mode) {
        return true;
      }
    }
    return false;
  }

  /**
   * clears the triggered slot animation in all links (stop visual animation)
   * @method clearTriggeredSlots
   */
  clearTriggeredSlots() {
    for (const i in this.links) {
      const link_info = this.links[i];
      if (!link_info) {
        continue;
      }
      if (link_info._last_time) {
        link_info._last_time = 0;
      }
    }
  }

  /* Called when something visually changed (not the graph!) */
  change() {
    if (LiteGraph.debug) {
      console.log("Graph changed");
    }
    this.sendActionToCanvas("setDirty", [true, true]);
    if (this.on_change) {
      this.on_change(this);
    }
  }

  setDirtyCanvas(fg, bg) {
    this.sendActionToCanvas("setDirty", [fg, bg]);
  }

  /**
   * Destroys a link
   * @method removeLink
   * @param {Number} link_id
   */
  removeLink(link_id) {
    const link = this.links[link_id];
    if (!link) {
      return;
    }
    const node = this.getNodeById(link.target_id);
    if (node) {
      node.disconnectInput(link.target_slot);
    }
  }

  //save and recover app state ***************************************
  /**
   * Creates a Object containing all the info about this graph, it can be serialized
   * @method serialize
   * @return {Object} value of the node
   */
  serialize() {
    const nodes_info = [];
    for (let i = 0, l = this._nodes.length; i < l; ++i) {
      nodes_info.push(this._nodes[i].serialize());
    }

    //pack link info into a non-verbose format
    const links = [];
    for (const i in this.links) {
      //links is an OBJECT
      let link = this.links[i];
      if (!link.serialize) {
        //weird bug I havent solved yet
        console.warn(
          "weird LLink bug, link info is not a LLink but a regular object"
        );
        const link2 = new LLink();
        for (const j in link) {
          link2[j] = link[j];
        }
        this.links[i] = link2;
        link = link2;
      }

      links.push(link.serialize());
    }

    const groups_info = [];
    for (let i = 0; i < this._groups.length; ++i) {
      groups_info.push(this._groups[i].serialize());
    }

    const data = {
      last_node_id: this.last_node_id,
      last_link_id: this.last_link_id,
      nodes: nodes_info,
      links: links,
      groups: groups_info,
      config: this.config,
      extra: this.extra,
      version: LiteGraph.VERSION,
    };

    if (this.onSerialize) this.onSerialize(data);

    return data;
  }

  /**
   * Configure a graph from a JSON string
   * @method configure
   * @param {String} str configure a graph from a JSON string
   * @param {Boolean} returns if there was any error parsing
   */
  configure(data, keep_old) {
    if (!data) {
      return;
    }

    if (!keep_old) {
      this.clear();
    }

    const nodes = data.nodes;

    //decode links info (they are very verbose)
    if (data.links && data.links.constructor === Array) {
      const links = [];
      for (let i = 0; i < data.links.length; ++i) {
        const link_data = data.links[i];
        if (!link_data) {
          //weird bug
          console.warn(
            "serialized graph link data contains errors, skipping."
          );
          continue;
        }
        const link = new LLink();
        link.configure(link_data);
        links[link.id] = link;
      }
      data.links = links;
    }

    //copy all stored fields
    for (const i in data) {
      if (i === "nodes" || i === "groups")
        //links must be accepted
        continue;
      this[i] = data[i];
    }

    let error = false;

    //create nodes
    this._nodes = [];
    if (nodes) {
      for (let i = 0, l = nodes.length; i < l; ++i) {
        const n_info = nodes[i]; //stored info
        let node = LiteGraph.createNode(n_info.type, n_info.title);
        if (!node) {
          if (LiteGraph.debug) {
            console.log("Node not found or has errors: " + n_info.type);
          }

          //in case of error we create a replacement node to avoid losing info
          node = new LGraphNode();
          node.last_serialization = n_info;
          node.has_errors = true;
          error = true;
          //continue;
        }

        node.id = n_info.id; //id it or it will create a new id
        this.add(node, true); //add before configure, otherwise configure cannot create links
      }

      //configure nodes afterwards so they can reach each other
      for (let i = 0, l = nodes.length; i < l; ++i) {
        const n_info = nodes[i];
        const node = this.getNodeById(n_info.id);
        if (node) {
          node.configure(n_info);
        }
      }
    }

    //groups
    this._groups.length = 0;
    if (data.groups) {
      for (let i = 0; i < data.groups.length; ++i) {
        const group = new LGraphGroup();
        group.configure(data.groups[i]);
        this.add(group);
      }
    }

    this.updateExecutionOrder();

    this.extra = data.extra || {};

    if (this.onConfigure) this.onConfigure(data);

    this._version++;
    this.setDirtyCanvas(true, true);
    return error;
  }

  load(url, callback) {
    //from file
    if (url.constructor === File || url.constructor === Blob) {
      const reader = new FileReader();
      reader.addEventListener("load", (event) => {
        const data = JSON.parse(event.target.result);
        this.configure(data);
        if (callback) callback();
      });

      reader.readAsText(url);
      return;
    }

    //is a string, then an URL
    const req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.send(null);
    req.onload = () => {
      if (req.status !== 200) {
        console.error("Error loading graph:", req.status, req.response);
        return;
      }
      const data = JSON.parse(req.response);
      this.configure(data);
      if (callback) callback();
    };
    req.onerror = (err) => {
      console.error("Error loading graph:", err);
    };
  }

  onNodeTrace(node, msg, color) {
    //TODO
  }
}

// Lazy registration to avoid circular dependency issues
// LiteGraph.LGraph will be set after all modules are loaded
export { LGraph };
export default LGraph;
