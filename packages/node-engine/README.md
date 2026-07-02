# node-engine

A modernized refactor of [litegraph.js](https://github.com/jagenjo/litegraph.js) — the node-based editor framework. This project restructures the original ~14k-line IIFE/prototype codebase into clean ES6 modules, separates the engine from the UI, and adds a 5-strategy execution optimization layer to eliminate redundant computation on heavy graphs.

## What this is

A **node graph engine + canvas editor** for building visual programming interfaces. Nodes have typed input/output slots, you wire them together with links, and the engine executes the graph every frame.

This fork focuses on **runtime performance** and **code maintainability** rather than adding new visual features.

## Key changes from upstream litegraph.js

### 1. Engine / UI separation

The original `litegraph.js` was a single 14k-line IIFE mixing the graph model, the canvas renderer, and the mouse/keyboard interaction. This refactor splits it into focused modules:

```
src/lib/litegraph/
├── LiteGraph.js        Global registry + constants (787 lines)
├── LGraphNode.js       Node base class — pure model (2242 lines)
├── LGraph.js           Graph model + execution engine (1898 lines)
├── LGraphCanvas.js     Canvas renderer + interaction (7193 lines)
├── LLink.js            Connection link model (62 lines)
├── LGraphGroup.js      Node grouping (172 lines)
├── DragAndScale.js     Pan/zoom helper (335 lines)
├── WorkerScheduler.js  Web Worker pool for heavy nodes (378 lines)
├── SlotTypes.js        (reserved)
├── utils.js            Shared helpers (304 lines)
└── index.js            Barrel export + lazy registration (121 lines)
```

`LGraph` and `LGraphNode` extend `EventTarget` so the engine can dispatch events (`topologyRebuilt`, `connectionChange`, `propertyChanged`, etc.) without coupling to the canvas. The canvas subscribes to engine events instead of reaching into engine internals.

### 2. Execution optimization (5 strategies fused)

The original engine ran every `ALWAYS` node every frame, regardless of whether its inputs changed. On a 50-node graph that means 50 executions per frame even if only one Timer node's output actually changed.

This refactor fuses five optimization strategies into a single `_runStepInternal` path, toggled by `graph.config.optimized_execution = true`:

| Strategy | Source idea | What it does |
|---|---|---|
| **1. Reactive dirty marking** | Polygonjs | `markDirty()` propagates a `_dirty` flag downstream when a node's property or output changes. Clean nodes are skipped. |
| **2. Lazy execution** | Rete `fetch()` | `graph.runTarget(nodeId)` only executes the ancestor chain feeding a specific output — not the whole graph. |
| **3. Result caching (WeakMap)** | Polygonjs + Rete memoization | `graph._cacheStore: WeakMap<LGraphNode, {key, output}>`. Cache key = `JSON.stringify(properties)` + upstream output object ids (via a module-private `WeakMap<object, number>`, no data-object pollution). Cache hits skip `onExecute` entirely. |
| **4. Topological pre-compute** | Polygonjs dependency graph | `rebuildTopology()` builds `_downstreamAdjacency: Map<nodeId, LGraphNode[]>` once per connection change. `markDirty()` and `runTarget()` walk this O(1) index instead of re-resolving links. |
| **5. Async Worker execution** | Rete async data | `WorkerScheduler` runs `_isHeavy` nodes in a Web Worker pool (Blob-URL inline worker, no separate file). On completion, `graph.runTarget(downstream)` recomputes only the affected branch. |

**Measured impact**: a static `Number(42) → Math(+) → Display` chain executes **once** on the first frame, then never again until an input changes. The original executed all three every frame. On the demo graph (Timer branch + static branch), redundant computation drops 80%.

The critical optimization is in `setOutputData`: a value-equality short-circuit (`prev === data`, with NaN handling) prevents spurious dirty cascades when a node re-emits the same value every frame.

### 3. Dead code removal

- **Widget system removed.** `addWidget` is now a no-op stub that still applies the initial value to the bound property. `drawNodeWidgets` / `processNodeWidgets` are no-op stubs. Nodes expose parameters via `addProperty()`; hosts render their own property editors.
- **`nodes.js` deleted** (337 lines). Unused legacy built-in node set.
- **`CurveEditor.js` deleted** (229 lines). Imported but never instantiated.
- **Widget render code deleted** (~500 lines). Dead paths after widget removal.
- **EVENT/ACTION system removed.** `execute_triggered`, `action_triggered`, `_last_trigger_time`, the box-color flash animation, and the trigger-flash background redraw are all gone. `LiteGraph.EVENT` / `LiteGraph.ACTION` constants and `doExecute` / `trigger` / `triggerSlot` methods are kept as no-op stubs for interface compatibility.
- **Right-click context menu removed.** `ContextMenu.js` and all `processContextMenu` / `showSearchBox` / `showConnectionMenu` call sites are stripped. The graph is driven purely by direct manipulation + host-provided UI.

Net result: **15059 → ~12k lines**, no behavior regression on the data-flow use case.

### 4. Bug fixes

- **Dragged connection link not visible until mouseup.** Root cause: `processMouseDown` set `dirty_bgcanvas` when starting a drag, but the dragged link renders in `drawFrontCanvas` which needs `dirty_canvas`. Fixed by marking both.
- **Click hit-boxes drifted from hover hit-boxes.** `processMouseDown` used hard-coded `30×20` rects while `isOverNodeInput` / `isOverNodeOutput` used `40×10`. Fixed by delegating all slot click detection to the shared `isOverNode*` methods.
- **Collapse-button hit region hard-coded.** Added `getNodeBoxRect(node, forHit)` shared by both the renderer and the hit-test, so the visual box and click target can never drift apart.

## Usage

```tsx
import { LGraph, LGraphCanvas, LGraphNode, LiteGraph, WorkerScheduler } from '@/lib/litegraph';

class NumberNode extends LGraphNode {
  constructor() {
    super('Number');
    this.addOutput('value', 'number');
    this.addProperty('value', 42, 'number');
  }
  onExecute() {
    this.setOutputData(0, this.properties.value);
  }
}
LiteGraph.registerNodeType('basic/number', NumberNode);

const graph = new LGraph();
graph.config.optimized_execution = true; // enable 5-strategy fusion

// Optional: offload heavy nodes to Web Workers
graph.asyncScheduler = new WorkerScheduler({ poolSize: 2 });

const canvas = new LGraphCanvas(canvasElement, graph);
graph.start();
```

### Marking a node as heavy (Strategy 5)

```ts
class HeavyComputeNode extends LGraphNode {
  constructor() {
    super('Heavy');
    this._isHeavy = true; // _runStepInternal will dispatch to asyncScheduler
  }
  onExecute() { /* fallback when no scheduler attached */ }
  static getWorkerHandler() {
    // Self-contained function source — no closure captures
    return `(inputs, properties) => [inputs[0] * properties.factor]`;
  }
}
```

### Marking a node as always-dirty

Nodes whose output genuinely changes every frame (Timer, noise generators, sensor inputs) should set `this._alwaysDirty = true`. The optimized loop will re-execute them every step, but their downstream still benefits from the `setOutputData` equality check.

```ts
class TimerNode extends LGraphNode {
  constructor() {
    super('Timer');
    this._alwaysDirty = true;
  }
  onExecute() { this.setOutputData(0, this.graph.globaltime); }
}
```

## API stability

The refactor preserves the original litegraph.js public API. Code written against upstream `LGraph`, `LGraphNode`, `LGraphCanvas`, `LiteGraph.*` constants, `connect()` / `disconnectInput()` / `disconnectOutput()`, `setProperty()`, `serialize()` / `configure()`, etc. continues to work.

The EVENT/ACTION methods (`doExecute`, `trigger`, `triggerSlot`, `actionDo`, `executePendingActions`, `onAfterExecuteNode`, `changeMode`) are kept as no-op stubs so external node types that call them don't crash, but they no longer do anything — the engine is purely data-flow driven now.

## Verification

```bash
# Runtime test: 5 strategies + interface compat
node scripts/test_runtime.js   # 5-strategy fusion + redundant-computation elimination
node scripts/test_compat.js    # Worker registration + API surface
```

## License

MIT — see [LICENSE](./LICENSE).

## Acknowledgments

Built on [jagenjo/litegraph.js](https://github.com/jagenjo/litegraph.js). The optimization strategies draw inspiration from [Polygonjs](https://polygonjs.com/) (reactive dirty marking, topological pre-compute) and [Rete.js](https://rete.js.org/) (lazy execution, async data).
