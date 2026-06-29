/**
 * WorkerScheduler — Strategy 5 (Async Execution) implementation.
 *
 * Spawns a pool of Web Workers and dispatches heavy nodes (`_isHeavy === true`)
 * to them so the main thread stays responsive. Each worker maintains a
 * registry of {nodeType → compute(inputs, properties) → outputs} handlers
 * that the host registers up-front via `registerHandler(type, fnSource)`.
 *
 * DESIGN NOTES
 * ------------
 * - The worker script is generated inline via a Blob URL so this module is
 *   self-contained and doesn't require a separate `static/worker.js` file.
 *
 * - Handlers are registered by **function reference**; we send `fn.toString()`
 *   to the worker and reconstruct via `new Function(...)`. The function must
 *   be self-contained (no closure captures) — only (inputs, properties) args.
 *
 * - Inputs and outputs are structured-cloned (postMessage default). For
 *   objects backed by ArrayBuffer/ImageBitmap/etc., the host can pass
 *   transferables to avoid copying (not exposed in this minimal version).
 *
 * - Worker pool size defaults to `navigator.hardwareConcurrency - 1` so we
 *   leave one core for the main thread + UI. Falls back to 2 if hardware
 *   concurrency is unavailable.
 *
 * FUSION WITH OTHER STRATEGIES
 * ----------------------------
 * - Strategy 4 (Topological Sort): the main run loop dispatches heavy nodes
 *   in topological order (it walks `_nodes_executable`), so by the time a
 *   heavy node is dispatched, all its ancestors have already executed and
 *   their outputs are visible via `link.data`. The worker does NOT need to
 *   resolve dependencies itself.
 *
 * - Strategy 2 (Lazy Execution): when a heavy node's async result resolves,
 *   the scheduler calls `graph.runTarget(downstreamNode)` for every direct
 *   consumer — only the affected downstream branch recomputes instead of
 *   the whole graph.
 *
 * - Strategy 3 (Result Caching): the main loop's `storeCachedOutput` runs
 *   after the worker resolves, so async-computed results are cached exactly
 *   like sync results — subsequent steps with unchanged inputs hit the
 *   cache and skip the worker round-trip entirely.
 */
export class WorkerScheduler {
  /**
   * @param {Object} opts
   * @param {number} opts.poolSize  Number of workers in the pool. Defaults
   *                                to `navigator.hardwareConcurrency - 1`.
   * @param {boolean} opts.lazyPropagate  When true (default), async node
   *                                completion triggers `graph.runTarget`
   *                                on each downstream consumer (Strategy 2
   *                                fusion). Set false to disable.
   */
  constructor(opts = {}) {
    const defaultPool =
      typeof navigator !== "undefined" && navigator.hardwareConcurrency
        ? Math.max(1, navigator.hardwareConcurrency - 1)
        : 2;
    this.poolSize = opts.poolSize || defaultPool;
    this.lazyPropagate = opts.lazyPropagate !== false;

    // Inline worker source. The worker maintains its own handler registry
    // and responds to two message kinds:
    //   - { op: "register", type, src }  → compile & store handler
    //   - { op: "run", id, type, inputs, properties }
    //     → invoke handler, post back { id, outputs } or { id, error }
    const workerSource = `
      const handlers = {};
      self.onmessage = function (e) {
        const msg = e.data;
        // ---- register ----
        if (msg.op === "register") {
          try {
            // Reconstruct the handler from its source string.
            // msg.src is fn.toString() which may be:
            //   "function (inputs, properties) { ... }"   (anonymous)
            //   "function name(inputs, properties) { ... }" (named)
            //   "(inputs, properties) => { ... }"          (arrow)
            // We wrap in parentheses and eval so all three forms parse
            // as a function expression. Using new Function("inputs",
            // "properties", src) would fail because src already contains
            // the full function header, producing an invalid nested
            // declaration ("Function statements require a function name").
            const fn = eval("(" + msg.src + ")");
            handlers[msg.type] = fn;
            self.postMessage({ op: "registered", type: msg.type });
          } catch (err) {
            self.postMessage({
              op: "register_error",
              type: msg.type,
              error: String(err && err.message || err),
            });
          }
          return;
        }
        // ---- run ----
        if (msg.op === "run") {
          const handler = handlers[msg.type];
          if (!handler) {
            self.postMessage({
              op: "run_error",
              id: msg.id,
              error: "No handler registered for type: " + msg.type,
            });
            return;
          }
          // Handler may return either a value or a Promise.
          Promise.resolve()
            .then(() => handler(msg.inputs, msg.properties))
            .then(
              function (outputs) {
                const arr = Array.isArray(outputs) ? outputs : [outputs];
                self.postMessage({ op: "run_done", id: msg.id, outputs: arr });
              },
              function (err) {
                self.postMessage({
                  op: "run_error",
                  id: msg.id,
                  error: String(err && err.message || err),
                });
              }
            );
          return;
        }
      };
    `;

    // Skip worker creation in non-browser environments (SSR / tests).
    this._noWorkers = (typeof Worker === "undefined" || typeof Blob === "undefined");
    if (this._noWorkers) {
      this.workers = [];
      this.queue = [];
      this.pending = new Map();
      this.registeredTypes = new Set();
      this._typeRegisterPromise = new Map();
      return;
    }

    // Build the Blob URL once and reuse for all workers in the pool.
    const blob = new Blob([workerSource], { type: "application/javascript" });
    this._blobUrl = URL.createObjectURL(blob);

    this.workers = [];
    this.queue = [];
    this.pending = new Map(); // id → { resolve, reject, node, downstream }
    this.registeredTypes = new Set();
    this._typeRegisterPromise = new Map(); // type → Promise<void>

    for (let i = 0; i < this.poolSize; i++) {
      const w = new Worker(this._blobUrl);
      w.onmessage = (e) => this._handleMessage(e.data, w);
      this.workers.push({ worker: w, busy: false, currentId: null });
    }
  }

  /**
   * Register a handler function for a node type on every worker.
   * The function source is sent as a string and reconstructed via
   * `new Function` inside the worker.
   *
   * @param {string} type  Node type string (e.g. "math/heavy_matrix")
   * @param {Function} fn  Handler with signature (inputs, properties) → outputs | Promise<outputs>
   * @returns {Promise<void>} resolves when all workers have registered.
   */
  registerHandler(type, fn) {
    if (typeof fn !== "function") {
      throw new Error("WorkerScheduler.registerHandler: fn must be a function");
    }
    if (this.registeredTypes.has(type)) {
      return this._typeRegisterPromise.get(type) || Promise.resolve();
    }
    if (this._noWorkers) {
      // Remember the handler for fallback path (run on main thread).
      this._fallbackHandlers = this._fallbackHandlers || {};
      this._fallbackHandlers[type] = fn;
      this.registeredTypes.add(type);
      this._typeRegisterPromise.set(type, Promise.resolve());
      return Promise.resolve();
    }
    const src = fn.toString();
    const promise = new Promise((resolve, reject) => {
      let pending = this.workers.length;
      const onAck = (data) => {
        if (data.op === "registered" && data.type === type) {
          pending--;
          if (pending === 0) resolve();
        } else if (data.op === "register_error" && data.type === type) {
          reject(new Error("Worker failed to register " + type + ": " + data.error));
        }
      };
      this._registerAcks = this._registerAcks || [];
      this._registerAcks.push(onAck);
      for (const w of this.workers) {
        w.worker.postMessage({ op: "register", type, src });
      }
    });
    this.registeredTypes.add(type);
    this._typeRegisterPromise.set(type, promise);
    return promise;
  }

  /**
   * Run a heavy node in the worker pool. Returns a Promise that resolves
   * with the outputs array (also written back to the node via setOutputData).
   *
   * If no worker is free, the job is queued and dispatched when one frees up.
   *
   * @param {LGraphNode} node
   * @returns {Promise<Array>}
   */
  run(node) {
    if (!node.graph) {
      return Promise.reject(new Error("WorkerScheduler.run: node has no graph"));
    }

    // Fallback path: no Worker environment. Run on main thread via
    // setTimeout(0) so we still honor the async contract (Promise).
    if (this._noWorkers) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            if (node.onExecute) node.onExecute();
            resolve([]);
          } catch (err) {
            reject(err);
          }
        }, 0);
      });
    }

    // Collect inputs from upstream links. Topological order (Strategy 4)
    // guarantees these are fresh by the time we dispatch.
    const inputs = [];
    if (node.inputs) {
      for (let i = 0; i < node.inputs.length; i++) {
        const input = node.inputs[i];
        if (!input || input.link == null) {
          inputs.push(null);
          continue;
        }
        const link = node.graph.links[input.link];
        inputs.push(link ? link.data : null);
      }
    }

    // Snapshot properties (structured clone happens at postMessage).
    const properties = Object.assign({}, node.properties);

    // Collect direct downstream consumers — used by Strategy 2 fusion
    // after the async result resolves. Prefer precomputed adjacency.
    const downstream = [];
    if (node.graph._downstreamAdjacency) {
      const succ = node.graph._downstreamAdjacency.get(node.id);
      if (succ) for (let i = 0; i < succ.length; i++) downstream.push(succ[i]);
    } else if (node.outputs) {
      for (let i = 0; i < node.outputs.length; i++) {
        const output = node.outputs[i];
        if (!output || !output.links) continue;
        for (let j = 0; j < output.links.length; j++) {
          const link = node.graph.links[output.links[j]];
          if (!link) continue;
          const target = node.graph.getNodeById(link.target_id);
          if (target) downstream.push(target);
        }
      }
    }

    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "job-" + Math.random().toString(36).slice(2) + Date.now().toString(36);

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, node, downstream });
      const free = this.workers.find((w) => !w.busy);
      if (free) {
        free.busy = true;
        free.currentId = id;
        free.worker.postMessage({
          op: "run",
          id,
          type: node.type,
          inputs,
          properties,
        });
      } else {
        this.queue.push({ id, type: node.type, inputs, properties });
      }
    });
  }

  _handleMessage(data, worker) {
    // Route registration acks first.
    if (this._registerAcks && this._registerAcks.length) {
      for (let i = this._registerAcks.length - 1; i >= 0; i--) {
        this._registerAcks[i](data);
      }
    }

    if (data.op === "run_done" || data.op === "run_error") {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);

      // Free the worker that handled this id.
      const w = this.workers.find((w) => w.currentId === data.id);
      if (w) {
        w.busy = false;
        w.currentId = null;
      }

      const { node, downstream, resolve, reject } = pending;

      if (data.op === "run_error") {
        reject(new Error(data.error));
      } else {
        // Write outputs back to the node's output slots.
        if (data.outputs && node.outputs) {
          for (let i = 0; i < data.outputs.length && i < node.outputs.length; i++) {
            if (node.outputs[i]) {
              node.setOutputData(i, data.outputs[i]);
            }
          }
        }
        resolve(data.outputs);

        // Strategy 2 (Lazy Execution) fusion: now that the heavy node has
        // produced fresh output, only its downstream branch needs to
        // recompute. We call graph.runTarget for each direct consumer —
        // this walks the dependency chain from that consumer downward,
        // skipping cached/clean nodes along the way.
        if (this.lazyPropagate && node.graph && downstream.length) {
          for (let i = 0; i < downstream.length; i++) {
            try {
              node.graph.runTarget(downstream[i], true);
            } catch (err) {
              if (typeof console !== "undefined" && console.error) {
                console.error("[WorkerScheduler] downstream runTarget failed", err);
              }
            }
          }
        }
      }

      // Pick up the next queued job, if any.
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        const free = this.workers.find((w) => !w.busy);
        if (free) {
          free.busy = true;
          free.currentId = next.id;
          free.worker.postMessage(next);
        } else {
          this.queue.unshift(next);
        }
      }
    }
  }

  /**
   * Terminate all workers and release the Blob URL. Call this when the
   * graph is destroyed to avoid leaked worker threads.
   */
  terminate() {
    for (const w of this.workers) {
      try { w.worker.terminate(); } catch (e) {}
    }
    this.workers = [];
    this.pending.clear();
    this.queue.length = 0;
    if (this._blobUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }
  }
}

export default WorkerScheduler;
