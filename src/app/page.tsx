'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  LiteGraph,
  LGraph,
  LGraphNode,
  LGraphCanvas,
  LGraphGroup,
  WorkerScheduler,
} from '@/lib/litegraph';

// ===== Node type registry for sidebar =====
const NODE_CATEGORIES: Record<string, { type: string; title: string; desc: string }[]> = {
  'Basic': [
    { type: 'basic/number', title: 'Number', desc: 'Constant number' },
    { type: 'basic/string', title: 'String', desc: 'String constant' },
    { type: 'basic/display', title: 'Display', desc: 'Show value' },
    { type: 'basic/console', title: 'Console', desc: 'Console log' },
  ],
  'Math': [
    { type: 'math/math', title: 'Math', desc: 'Math operation' },
    { type: 'math/multiply', title: 'Multiply', desc: 'A × B' },
    { type: 'math/add', title: 'Add', desc: 'A + B' },
    { type: 'math/abs', title: 'Abs', desc: '|v|' },
    { type: 'math/clamp', title: 'Clamp', desc: 'Clamp value' },
    { type: 'math/heavy_matrix', title: 'Heavy Matrix', desc: 'Worker offload demo (Strategy 5)' },
  ],
  'Logic': [
    { type: 'logic/compare', title: 'Compare', desc: 'Compare values' },
    { type: 'logic/conditional', title: 'Conditional', desc: 'If/else gate' },
  ],
  'Event': [
    { type: 'event/timer', title: 'Timer', desc: 'Elapsed time' },
  ],
};

// ===== Register all ES6 Class-based node types =====

class NumberNode extends LGraphNode {
  constructor() { super('Number'); this.addOutput('value', 'number'); this.addProperty('value', 1.0, 'number'); this.addWidget('number', 'Value', 1.0, (v: number) => { this.properties.value = v; }); this.serialize_widgets = true; }
  onExecute() { this.setOutputData(0, parseFloat(this.properties.value)); }
  static title = 'Number'; static desc = 'Constant number';
}
class MathOpNode extends LGraphNode {
  constructor() { super('Math'); this.addInput('A', 'number'); this.addInput('B', 'number'); this.addOutput('=', 'number'); this.addProperty('OP', '+', 'enum', { values: ['+', '-', '*', '/', '%', '^', 'max', 'min'] }); this.addWidget('combo', 'Op', '+', (v: string) => { this.properties.OP = v; }, { values: ['+', '-', '*', '/', '%', '^', 'max', 'min'] }); this.serialize_widgets = true; }
  onExecute() { const A = this.getInputData(0) || 0; const B = this.getInputData(1) || 0; let r = 0; switch (this.properties.OP) { case '+': r = A + B; break; case '-': r = A - B; break; case '*': r = A * B; break; case '/': r = B !== 0 ? A / B : 0; break; case '%': r = A % B; break; case '^': r = Math.pow(A, B); break; case 'max': r = Math.max(A, B); break; case 'min': r = Math.min(A, B); break; default: r = A + B; } this.setOutputData(0, r); }
  static title = 'Math'; static desc = 'Math operation';
}
class DisplayNode extends LGraphNode {
  constructor() { super('Display'); this.addInput('value', 0); this.addProperty('value', '', 'string'); this.size = [120, 60]; }
  onExecute() { const v = this.getInputData(0); if (v !== null && v !== undefined) { this.properties.value = typeof v === 'object' ? JSON.stringify(v) : String(v); } }
  onDrawForeground(ctx: CanvasRenderingContext2D) { ctx.fillStyle = '#CCC'; ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillText(this.properties.value || '—', this.size[0] * 0.5, this.size[1] * 0.5 + 4); }
  static title = 'Display'; static desc = 'Show value';
}
class StringNode extends LGraphNode {
  constructor() { super('String'); this.addOutput('text', 'string'); this.addProperty('value', 'hello', 'string'); this.addWidget('text', 'Text', 'hello', (v: string) => { this.properties.value = v; }); this.serialize_widgets = true; }
  onExecute() { this.setOutputData(0, this.properties.value); }
  static title = 'String'; static desc = 'String constant';
}
class CompareNode extends LGraphNode {
  constructor() { super('Compare'); this.addInput('A', 'number'); this.addInput('B', 'number'); this.addOutput('A>B', 'boolean'); this.addOutput('A==B', 'boolean'); this.addOutput('A<B', 'boolean'); }
  onExecute() { const A = this.getInputData(0) || 0; const B = this.getInputData(1) || 0; this.setOutputData(0, A > B); this.setOutputData(1, A === B); this.setOutputData(2, A < B); }
  static title = 'Compare'; static desc = 'Compare values';
}
class ConditionalNode extends LGraphNode {
  constructor() { super('Conditional'); this.addInput('cond', 'boolean'); this.addInput('true', 0); this.addInput('false', 0); this.addOutput('out', 0); }
  onExecute() { this.setOutputData(0, this.getInputData(0) ? this.getInputData(1) : this.getInputData(2)); }
  static title = 'Conditional'; static desc = 'If/else gate';
}
class TimerNode extends LGraphNode {
  constructor() { super('Timer'); this.addOutput('time', 'number'); this.addOutput('delta', 'number'); this._alwaysDirty = true; }
  onExecute() { const now = this.graph ? this.graph.globaltime : 0; this.setOutputData(0, now); this.setOutputData(1, 0.016); }
  static title = 'Timer'; static desc = 'Elapsed time';
}
class ConsoleNode extends LGraphNode {
  constructor() { super('Console'); this.addInput('log', 0); this.addProperty('prefix', 'LOG:', 'string'); this.addWidget('text', 'Prefix', 'LOG:', (v: string) => { this.properties.prefix = v; }); this.serialize_widgets = true; }
  onExecute() { const data = this.getInputData(0); if (data !== null && data !== undefined) { console.log(`[${this.properties.prefix}]`, data); } }
  static title = 'Console'; static desc = 'Console log';
}
class MultiplyNode extends LGraphNode {
  constructor() { super('Multiply'); this.addInput('A', 'number'); this.addInput('B', 'number'); this.addOutput('A*B', 'number'); }
  onExecute() { const A = this.getInputData(0) || 0; const B = this.getInputData(1) || 0; this.setOutputData(0, A * B); }
  static title = 'Multiply';
}
class AddNode extends LGraphNode {
  constructor() { super('Add'); this.addInput('A', 'number'); this.addInput('B', 'number'); this.addOutput('A+B', 'number'); }
  onExecute() { const A = this.getInputData(0) || 0; const B = this.getInputData(1) || 0; this.setOutputData(0, A + B); }
  static title = 'Add';
}
class AbsNode extends LGraphNode {
  constructor() { super('Abs'); this.addInput('v', 'number'); this.addOutput('|v|', 'number'); }
  onExecute() { this.setOutputData(0, Math.abs(this.getInputData(0) || 0)); }
  static title = 'Abs';
}
class ClampNode extends LGraphNode {
  constructor() { super('Clamp'); this.addInput('v', 'number'); this.addOutput('out', 'number'); this.addProperty('min', 0, 'number'); this.addProperty('max', 1, 'number'); this.addWidget('number', 'Min', 0, (v: number) => { this.properties.min = v; }); this.addWidget('number', 'Max', 1, (v: number) => { this.properties.max = v; }); this.serialize_widgets = true; }
  onExecute() { const v = this.getInputData(0) || 0; this.setOutputData(0, Math.max(this.properties.min, Math.min(this.properties.max, v))); }
  static title = 'Clamp';
}

// ===== Heavy node (Strategy 5 demo) =====
// Simulates a compute-intensive operation. Marked _isHeavy = true so the
// optimized run loop dispatches it to a WorkerScheduler. The actual compute
// happens in the worker thread via the handler registered in the useEffect
// below — the main thread stays free for UI rendering.
//
// When asyncScheduler is NOT attached (default), _runStepOptimized falls
// back to calling onExecute() synchronously, so the node still works
// correctly — just without the worker offload.
class HeavyMatrixNode extends LGraphNode {
  constructor() {
    super('Heavy Matrix');
    this.addInput('A', 'number');
    this.addInput('B', 'number');
    this.addOutput('det', 'number');
    this.addProperty('size', 30, 'number');
    this._isHeavy = true;
    this.size = [140, 60];
  }
  // onExecute is only called when no asyncScheduler is attached.
  // When a scheduler IS attached, the worker handler runs instead.
  onExecute() {
    const A = this.getInputData(0) != null ? this.getInputData(0) : 1;
    const B = this.getInputData(1) != null ? this.getInputData(1) : 1;
    const n = Math.max(2, Math.min(100, this.properties.size | 0));
    let acc = A * B;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        acc += Math.sin(i * 0.1) * Math.cos(j * 0.1);
      }
    }
    this.setOutputData(0, acc);
  }
  static title = 'Heavy Matrix';
  static desc = 'Simulated heavy compute (Strategy 5 demo)';
}

LiteGraph.registerNodeType('basic/number', NumberNode);
LiteGraph.registerNodeType('math/math', MathOpNode);
LiteGraph.registerNodeType('basic/display', DisplayNode);
LiteGraph.registerNodeType('basic/string', StringNode);
LiteGraph.registerNodeType('logic/compare', CompareNode);
LiteGraph.registerNodeType('logic/conditional', ConditionalNode);
LiteGraph.registerNodeType('event/timer', TimerNode);
LiteGraph.registerNodeType('basic/console', ConsoleNode);
LiteGraph.registerNodeType('math/multiply', MultiplyNode);
LiteGraph.registerNodeType('math/add', AddNode);
LiteGraph.registerNodeType('math/abs', AbsNode);
LiteGraph.registerNodeType('math/clamp', ClampNode);
LiteGraph.registerNodeType('math/heavy_matrix', HeavyMatrixNode);

// ===== Demo graph =====
function createDemoGraph(graph: LGraph) {
  const n1 = LiteGraph.createNode('basic/number'); n1.pos = [100, 100]; n1.setProperty('value', 42); graph.add(n1);
  const n2 = LiteGraph.createNode('basic/number'); n2.pos = [100, 280]; n2.setProperty('value', 8); graph.add(n2);
  const m = LiteGraph.createNode('math/math'); m.pos = [350, 160]; graph.add(m);
  const d = LiteGraph.createNode('basic/display'); d.pos = [600, 180]; graph.add(d);
  const n3 = LiteGraph.createNode('basic/number'); n3.pos = [100, 450]; n3.setProperty('value', 3.14); graph.add(n3);
  const mul = LiteGraph.createNode('math/multiply'); mul.pos = [350, 400]; graph.add(mul);
  const d2 = LiteGraph.createNode('basic/display'); d2.pos = [600, 420]; graph.add(d2);
  const t = LiteGraph.createNode('event/timer'); t.pos = [100, 600]; graph.add(t);
  const d3 = LiteGraph.createNode('basic/display'); d3.pos = [350, 600]; graph.add(d3);
  n1.connect(0, m, 0); n2.connect(0, m, 1); m.connect(0, d, 0);
  n3.connect(0, mul, 0); n3.connect(0, mul, 1); mul.connect(0, d2, 0);
  t.connect(0, d3, 0);
}

// ===== Property editor helper =====
function PropertyEditor({ node, onChange }: { node: any; onChange: () => void }) {
  if (!node) return null;
  const props = node.properties || {};
  const entries = Object.entries(props);

  const handleChange = (key: string, value: any) => {
    node.setProperty(key, value);
    onChange();
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">Properties</div>
      {entries.map(([key, val]) => (
        <div key={key} className="space-y-0.5">
          <label className="text-[10px] text-gray-400">{key}</label>
          <input
            type={typeof val === 'number' ? 'number' : 'text'}
            value={val ?? ''}
            onChange={(e) => handleChange(key, typeof val === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
            className="w-full px-2 py-1 text-xs bg-[#1c2128] border border-gray-700/50 rounded text-gray-200 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      ))}
      {/* Inputs */}
      {node.inputs && node.inputs.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Inputs</div>
          {node.inputs.map((inp: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500/60 shrink-0" />
              <span className="text-gray-300">{inp.name}</span>
              <span className="text-gray-600 text-[10px] ml-auto">{inp.type || '*'}</span>
            </div>
          ))}
        </div>
      )}
      {/* Outputs */}
      {node.outputs && node.outputs.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Outputs</div>
          {node.outputs.map((out: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
              <span className="w-2 h-2 rounded-full bg-cyan-500/60 shrink-0" />
              <span className="text-gray-300">{out.name}</span>
              <span className="text-gray-600 text-[10px] ml-auto">{out.type || '*'}</span>
            </div>
          ))}
        </div>
      )}
      {/* Position */}
      <div className="mt-3">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Position</div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-gray-400">X</label>
            <input
              type="number"
              value={Math.round(node.pos?.[0] ?? 0)}
              onChange={(e) => { if (node.pos) { node.pos[0] = parseFloat(e.target.value) || 0; onChange(); } }}
              className="w-full px-2 py-1 text-xs bg-[#1c2128] border border-gray-700/50 rounded text-gray-200 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-gray-400">Y</label>
            <input
              type="number"
              value={Math.round(node.pos?.[1] ?? 0)}
              onChange={(e) => { if (node.pos) { node.pos[1] = parseFloat(e.target.value) || 0; onChange(); } }}
              className="w-full px-2 py-1 text-xs bg-[#1c2128] border border-gray-700/50 rounded text-gray-200 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Main Page =====
export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [codePanelTab, setCodePanelTab] = useState<'original' | 'refactored'>('refactored');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ Basic: true, Math: true });
  // ===== Execution Optimization State (Strategy fusion switches) =====
  // useOptimized: toggles config.optimized_execution (Strategies 1+3+4).
  //   When on, runStep dispatches to _runStepOptimized which skips clean
  //   nodes, hits the WeakMap cache, and walks the precomputed adjacency.
  //   When off, falls back to classic full-traversal (every node every step).
  // useWorker: toggles the WorkerScheduler (Strategy 5). When on, heavy
  //   nodes (_isHeavy=true, e.g. HeavyMatrixNode) are dispatched to a
  //   Web Worker pool. When off, heavy nodes run synchronously.
  const [useOptimized, setUseOptimized] = useState(true);
  const [useWorker, setUseWorker] = useState(false);
  const graphCanvasRef = useRef<LGraphCanvas | null>(null);
  const graphRef = useRef<LGraph | null>(null);
  const schedulerRef = useRef<WorkerScheduler | null>(null);
  const propPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll selected node from graphCanvas
  const pollSelectedNode = useCallback(() => {
    const gc = graphCanvasRef.current;
    if (!gc) return;
    const selNodes = gc.selected_nodes || {};
    const ids = Object.keys(selNodes);
    if (ids.length === 1) {
      setSelectedNode((prev: any) => {
        const n = selNodes[ids[0]];
        // Keep same reference if same id
        if (prev && prev.id === n.id) return prev;
        return n;
      });
    } else {
      setSelectedNode(null);
    }
    setNodeCount(gc.graph ? gc.graph._nodes.length : 0);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const graph = new LGraph();
    graphRef.current = graph;

    const graphCanvas = new LGraphCanvas(canvas, graph, { autoresize: true });
    graphCanvasRef.current = graphCanvas;

    (window as any).__graphCanvas = graphCanvas;
    (window as any).__graph = graph;
    (window as any).__LiteGraph = LiteGraph;

    graphCanvas.background_image = LGraphCanvas.DEFAULT_BACKGROUND_IMAGE;
    graphCanvas.clear_background_color = '#222';
    graphCanvas.render_shadows = true;
    graphCanvas.render_connections_border = true;
    graphCanvas.render_curved_connections = true;
    graphCanvas.links_render_mode = LiteGraph.SPLINE_LINK;

    // ===== Execution Optimization Fusion (Strategies 1/2/3/4/5) =====
    // Enable the optimized runStep path (Strategy 1+3+4 fusion: dirty
    // marking + WeakMap cache + topological pre-order). When a node is
    // _isHeavy, the optimized loop dispatches it to the WorkerScheduler
    // (Strategy 5). When the worker resolves, WorkerScheduler calls
    // graph.runTarget(downstream) for each consumer (Strategy 2 fusion)
    // so only the affected branch recomputes.
    if (!graph.config) graph.config = {};
    graph.config.optimized_execution = useOptimized;

    if (useWorker) {
      const scheduler = new WorkerScheduler({ poolSize: 2 });
      schedulerRef.current = scheduler;
      graph.asyncScheduler = scheduler;

      // Register a worker handler for the heavy_matrix node type.
      // The function body is sent to the worker as a string and
      // reconstructed via `new Function`, so it must be self-contained
      // (no closure captures) — only the (inputs, properties) args.
      scheduler.registerHandler('math/heavy_matrix', function (inputs, properties) {
        const A = inputs[0] != null ? inputs[0] : 1;
        const B = inputs[1] != null ? inputs[1] : 1;
        const n = Math.max(2, Math.min(100, (properties.size | 0) || 30));
        let acc = A * B;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            acc += Math.sin(i * 0.1) * Math.cos(j * 0.1);
          }
        }
        return [acc];
      });
    }

    createDemoGraph(graph);
    queueMicrotask(() => setNodeCount(graph._nodes.length));

    // Poll selected node every 300ms
    propPollRef.current = setInterval(pollSelectedNode, 300);

    const ro = new ResizeObserver(() => {
      if (container && canvas) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        graphCanvas.resize();
        graphCanvas.setDirty(true, true);
      }
    });
    ro.observe(container);

    graph.start();
    queueMicrotask(() => setIsRunning(true));

    return () => {
      graph.stop();
      graphCanvas.stopRendering();
      ro.disconnect();
      if (propPollRef.current) clearInterval(propPollRef.current);
      // Terminate the worker pool to avoid leaked Worker threads on HMR.
      if (schedulerRef.current) {
        schedulerRef.current.terminate();
        schedulerRef.current = null;
      }
    };
  }, []);

  // Live-toggle the optimized execution flag without recreating the graph.
  // Strategy fusion toggles: 1+3+4 (optimized) and 5 (worker).
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    if (!graph.config) graph.config = {};
    graph.config.optimized_execution = useOptimized;
  }, [useOptimized]);

  // Live-toggle the WorkerScheduler. When toggled off, the graph falls
  // back to synchronous execution for heavy nodes (they still run, just
  // on the main thread). When toggled on, a new scheduler is created and
  // the heavy_matrix handler is re-registered.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    if (useWorker && !schedulerRef.current) {
      const scheduler = new WorkerScheduler({ poolSize: 2 });
      schedulerRef.current = scheduler;
      graph.asyncScheduler = scheduler;
      scheduler.registerHandler('math/heavy_matrix', function (inputs, properties) {
        const A = inputs[0] != null ? inputs[0] : 1;
        const B = inputs[1] != null ? inputs[1] : 1;
        const n = Math.max(2, Math.min(100, (properties.size | 0) || 30));
        let acc = A * B;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            acc += Math.sin(i * 0.1) * Math.cos(j * 0.1);
          }
        }
        return [acc];
      });
    } else if (!useWorker && schedulerRef.current) {
      schedulerRef.current.terminate();
      schedulerRef.current = null;
      graph.asyncScheduler = null;
    }
  }, [useWorker]);

  const handleAddNodeType = useCallback((type: string) => {
    const graph = graphRef.current;
    const gc = graphCanvasRef.current;
    if (!graph) return;
    const node = LiteGraph.createNode(type);
    if (!node) return;
    // Place at center of current viewport
    const cx = gc ? gc.graph_mouse[0] : 300;
    const cy = gc ? gc.graph_mouse[1] : 200;
    node.pos = [cx + Math.random() * 40 - 20, cy + Math.random() * 40 - 20];
    graph.add(node);
    // Select the new node
    if (gc) {
      gc.selectNodes([node]);
      gc.setDirty(true, true);
    }
    setNodeCount(graph._nodes.length);
    setSelectedNode(node);
  }, []);

  const handlePlayStop = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    if (isRunning) { graph.stop(); } else { graph.start(); }
    setIsRunning(!isRunning);
  }, [isRunning]);

  const handleClear = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.clear();
    setNodeCount(0);
    setSelectedNode(null);
  }, []);

  const handleLoadDemo = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.clear();
    createDemoGraph(graph);
    setNodeCount(graph._nodes.length);
    setSelectedNode(null);
  }, []);

  const handleArrange = useCallback(() => {
    const graph = graphRef.current;
    const gc = graphCanvasRef.current;
    if (!graph) return;
    graph.arrange();
    if (gc) gc.setDirty(true, true);
  }, []);

  const toggleCat = (cat: string) => setExpandedCats((p: any) => ({ ...p, [cat]: !p[cat] }));

  const codeExamples = {
    original: `// ===== Original (IIFE + Prototype) =====
(function(global) {
  var LiteGraph = (global.LiteGraph = {
    VERSION: 0.4,
    registered_node_types: {},
    registerNodeType: function(type, base_class) {
      for (var i in LGraphNode.prototype) {
        if (!base_class.prototype[i])
          base_class.prototype[i] = LGraphNode.prototype[i];
      }
      this.registered_node_types[type] = base_class;
    },
  });
  function LGraphNode(title) { this._ctor(title); }
  LGraphNode.prototype._ctor = function(title) {
    this.title = title || "Unnamed";
    Object.defineProperty(this, "pos", {
      set: function(v) { this._pos[0]=v[0]; this._pos[1]=v[1]; },
      get: function() { return this._pos; },
    });
  };
})(this);`,
    refactored: `// ===== Refactored (ES6 Class + Modules) =====
import { LiteGraph } from "./LiteGraph.js";
import { LGraphNode } from "./LGraphNode.js";

class LiteGraphClass {
  static VERSION = 0.4;
  static registered_node_types = {};
  static registerNodeType(type, baseClass) {
    this.registered_node_types[type] = baseClass;
  }
}

class LGraphNode {
  constructor(title) {
    this.title = title || "Unnamed";
    this._pos = new Float32Array([10, 10]);
  }
  get pos() { return this._pos; }
  set pos(v) { this._pos[0]=v[0]; this._pos[1]=v[1]; }
  connect(outputSlot, targetNode, inputSlot) { ... }
}

class NumberNode extends LGraphNode {
  constructor() {
    super("Number");
    this.addOutput("value", "number");
  }
  onExecute() { this.setOutputData(0, parseFloat(this.properties.value)); }
}
LiteGraph.registerNodeType("basic/number", NumberNode);`,
  };

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-gray-200">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-gray-700/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="6" r="3"/><circle cx="19" cy="6" r="3"/><circle cx="12" cy="18" r="3"/>
              <line x1="8" y1="6" x2="16" y2="6"/><line x1="12" y1="9" x2="12" y2="15"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">LiteGraph.js ES6</h1>
            <p className="text-[10px] text-gray-500">Node Graph Editor &bull; ES6 Class Architecture</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePlayStop} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${isRunning ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'}`}>
            {isRunning ? '⏹ Stop' : '▶ Run'}
          </button>
          <button onClick={handleArrange} className="px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 transition-colors">⬒ Arrange</button>
          <button onClick={handleLoadDemo} className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 transition-colors">↻ Demo</button>
          <button onClick={handleClear} className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 border border-gray-500/30 transition-colors">✕ Clear</button>
          <div className="px-2 py-1 rounded bg-gray-800 text-[10px] text-gray-500">Nodes: {nodeCount}</div>
          {/* ===== Execution Optimization Toggles =====
               Strategy fusion switches (1+3+4 optimized, 5 worker).
               Default ON for optimized so static graphs skip redundant
               re-execution. Worker is OFF by default — enable to see
               HeavyMatrixNode offload to a Web Worker pool. */}
          <button
            onClick={() => setUseOptimized(!useOptimized)}
            title="Toggle optimized execution (Strategies 1+3+4: dirty marking + WeakMap cache + topological pre-order)"
            className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${useOptimized ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 border border-gray-500/30'}`}
          >
            {useOptimized ? '⚡ Opt' : '○ Opt'}
          </button>
          <button
            onClick={() => setUseWorker(!useWorker)}
            title="Toggle Worker pool (Strategy 5: offload heavy nodes to Web Workers)"
            className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${useWorker ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 border border-gray-500/30'}`}
          >
            {useWorker ? '⚙ Worker' : '○ Worker'}
          </button>
          <button onClick={() => setShowCodePanel(!showCodePanel)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showCodePanel ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 border border-gray-500/30'}`}>
            {'</>'}
          </button>
        </div>
      </header>

      {/* Main content: Left Panel | Canvas | Right Panel */}
      <div className="flex flex-1 min-h-0">
        {/* ===== Left Panel: Node Palette ===== */}
        <div className="w-[200px] shrink-0 bg-[#0d1117] border-r border-gray-700/50 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-700/50">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Node Palette</div>
            <div className="text-[10px] text-gray-600 mt-0.5">Click to add node</div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
            {Object.entries(NODE_CATEGORIES).map(([cat, nodes]) => (
              <div key={cat}>
                <button
                  onClick={() => toggleCat(cat)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-gray-300 hover:text-white hover:bg-gray-800/50 rounded transition-colors"
                >
                  <span className={`text-[9px] transition-transform ${expandedCats[cat] ? 'rotate-90' : ''}`}>▶</span>
                  <span>{cat}</span>
                  <span className="ml-auto text-[9px] text-gray-600">{nodes.length}</span>
                </button>
                {expandedCats[cat] && (
                  <div className="ml-3 space-y-0.5 mb-1">
                    {nodes.map((n) => (
                      <button
                        key={n.type}
                        onClick={() => handleAddNodeType(n.type)}
                        className="w-full text-left px-2 py-1.5 rounded text-[11px] hover:bg-cyan-500/10 hover:text-cyan-300 transition-colors group flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/40 group-hover:bg-cyan-400 shrink-0" />
                        <div>
                          <div className="font-medium">{n.title}</div>
                          <div className="text-[9px] text-gray-600 group-hover:text-gray-400">{n.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Hints */}
          <div className="px-3 py-2 border-t border-gray-700/50 text-[9px] text-gray-600 space-y-0.5">
            <div>Scroll → Zoom</div>
            <div>Space+Drag → Pan</div>
            <div>Drag slot → Connect</div>
            <div>Tab → Search</div>
          </div>
        </div>

        {/* ===== Canvas ===== */}
        <div ref={containerRef} className="flex-1 relative">
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            style={{ background: '#1a1a2e' }}
          />
          <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-black/60 text-[10px] text-gray-400 backdrop-blur-sm">
            ✨ ES6 Class Modules
          </div>
        </div>

        {/* ===== Right Panel: Properties ===== */}
        <div className="w-[240px] shrink-0 bg-[#0d1117] border-l border-gray-700/50 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-700/50">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Inspector</div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {selectedNode ? (
              <>
                <div className="mb-3">
                  <div className="text-xs font-bold text-white">{selectedNode.title}</div>
                  <div className="text-[10px] text-gray-500">ID: {selectedNode.id} &bull; {selectedNode.type}</div>
                </div>
                <PropertyEditor
                  node={selectedNode}
                  onChange={() => {
                    const gc = graphCanvasRef.current;
                    if (gc) gc.setDirty(true, true);
                  }}
                />
              </>
            ) : (
              <div className="text-center py-8">
                <div className="text-gray-600 text-xs">No node selected</div>
                <div className="text-gray-700 text-[10px] mt-1">Click a node to inspect</div>
              </div>
            )}
          </div>
        </div>

        {/* ===== Code Panel (overlay on right) ===== */}
        {showCodePanel && (
          <div className="w-[420px] shrink-0 bg-[#0d1117] border-l border-gray-700/50 flex flex-col">
            <div className="flex border-b border-gray-700/50">
              <button onClick={() => setCodePanelTab('refactored')} className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${codePanelTab === 'refactored' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5' : 'text-gray-500 hover:text-gray-300'}`}>
                ES6 ✨
              </button>
              <button onClick={() => setCodePanelTab('original')} className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${codePanelTab === 'original' ? 'text-orange-400 border-b-2 border-orange-400 bg-orange-500/5' : 'text-gray-500 hover:text-gray-300'}`}>
                Original
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-gray-300">
                <code>{codeExamples[codePanelTab]}</code>
              </pre>
            </div>
            <div className="border-t border-gray-700/50 p-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">重构要点</h3>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {[
                  ['IIFE → Module', '(function(){})() → import/export'],
                  ['Function → Class', 'function LGraph() → class LGraph'],
                  ['Prototype → Method', '.prototype.fn → class method'],
                  ['Mixin → Extends', 'registerNodeType mixin → extends'],
                  ['defineProperty → get/set', 'Object.defineProperty → accessor'],
                  ['Global → Scope', 'window.LiteGraph → export default'],
                ].map(([t, d]) => (
                  <div key={t} className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-emerald-400 font-medium">{t}</div>
                    <div className="text-gray-500">{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
