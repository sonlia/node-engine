'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { LiteGraph } from '@/lib/litegraph/LiteGraph';
import { LGraph } from '@/lib/litegraph/LGraph';
import { LGraphNode } from '@/lib/litegraph/LGraphNode';
import { LGraphCanvas } from '@/lib/litegraph/LGraphCanvas';
import { LGraphGroup } from '@/lib/litegraph/LGraphGroup';

// ===== Register all ES6 Class-based node types =====

class NumberNode extends LGraphNode {
  constructor() {
    super('Number');
    this.addOutput('value', 'number');
    this.addProperty('value', 1.0, 'number');
    this.addWidget('number', 'Value', 1.0, (v: number) => { this.properties.value = v; });
    this.serialize_widgets = true;
  }
  onExecute() { this.setOutputData(0, parseFloat(this.properties.value)); }
  static title = 'Number';
  static desc = 'Constant number';
}

class MathOpNode extends LGraphNode {
  constructor() {
    super('Math');
    this.addInput('A', 'number');
    this.addInput('B', 'number');
    this.addOutput('=', 'number');
    this.addProperty('OP', '+', 'enum', { values: ['+', '-', '*', '/', '%', '^', 'max', 'min'] });
    this.addWidget('combo', 'Op', '+', (v: string) => { this.properties.OP = v; }, { values: ['+', '-', '*', '/', '%', '^', 'max', 'min'] });
    this.serialize_widgets = true;
  }
  onExecute() {
    const A = this.getInputData(0) || 0;
    const B = this.getInputData(1) || 0;
    let r = 0;
    switch (this.properties.OP) {
      case '+': r = A + B; break; case '-': r = A - B; break;
      case '*': r = A * B; break; case '/': r = B !== 0 ? A / B : 0; break;
      case '%': r = A % B; break; case '^': r = Math.pow(A, B); break;
      case 'max': r = Math.max(A, B); break; case 'min': r = Math.min(A, B); break;
      default: r = A + B;
    }
    this.setOutputData(0, r);
  }
  static title = 'Math';
  static desc = 'Math operation';
}

class DisplayNode extends LGraphNode {
  constructor() {
    super('Display');
    this.addInput('value', 0);
    this.addProperty('value', '', 'string');
    this.size = [120, 60];
  }
  onExecute() {
    const v = this.getInputData(0);
    if (v !== null && v !== undefined) {
      this.properties.value = typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
  }
  onDrawForeground(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#CCC';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.properties.value || '—', this.size[0] * 0.5, this.size[1] * 0.5 + 4);
  }
  static title = 'Display';
  static desc = 'Show value';
}

class StringNode extends LGraphNode {
  constructor() {
    super('String');
    this.addOutput('text', 'string');
    this.addProperty('value', 'hello', 'string');
    this.addWidget('text', 'Text', 'hello', (v: string) => { this.properties.value = v; });
    this.serialize_widgets = true;
  }
  onExecute() { this.setOutputData(0, this.properties.value); }
  static title = 'String';
  static desc = 'String constant';
}

class CompareNode extends LGraphNode {
  constructor() {
    super('Compare');
    this.addInput('A', 'number');
    this.addInput('B', 'number');
    this.addOutput('A>B', 'boolean');
    this.addOutput('A==B', 'boolean');
    this.addOutput('A<B', 'boolean');
  }
  onExecute() {
    const A = this.getInputData(0) || 0;
    const B = this.getInputData(1) || 0;
    this.setOutputData(0, A > B);
    this.setOutputData(1, A === B);
    this.setOutputData(2, A < B);
  }
  static title = 'Compare';
  static desc = 'Compare values';
}

class ConditionalNode extends LGraphNode {
  constructor() {
    super('Conditional');
    this.addInput('cond', 'boolean');
    this.addInput('true', 0);
    this.addInput('false', 0);
    this.addOutput('out', 0);
  }
  onExecute() {
    this.setOutputData(0, this.getInputData(0) ? this.getInputData(1) : this.getInputData(2));
  }
  static title = 'Conditional';
  static desc = 'If/else gate';
}

class TimerNode extends LGraphNode {
  constructor() {
    super('Timer');
    this.addOutput('time', 'number');
    this.addOutput('delta', 'number');
  }
  onExecute() {
    const now = this.graph ? this.graph.globaltime : 0;
    this.setOutputData(0, now);
    this.setOutputData(1, 0.016);
  }
  static title = 'Timer';
  static desc = 'Elapsed time';
}

class ConsoleNode extends LGraphNode {
  constructor() {
    super('Console');
    this.addInput('log', 0);
    this.addProperty('prefix', 'LOG:', 'string');
    this.addWidget('text', 'Prefix', 'LOG:', (v: string) => { this.properties.prefix = v; });
    this.serialize_widgets = true;
  }
  onExecute() {
    const data = this.getInputData(0);
    if (data !== null && data !== undefined) {
      console.log(`[${this.properties.prefix}]`, data);
    }
  }
  static title = 'Console';
  static desc = 'Console log';
}

class MultiplyNode extends LGraphNode {
  constructor() {
    super('Multiply');
    this.addInput('A', 'number');
    this.addInput('B', 'number');
    this.addOutput('A*B', 'number');
  }
  onExecute() {
    const A = this.getInputData(0) || 0;
    const B = this.getInputData(1) || 0;
    this.setOutputData(0, A * B);
  }
  static title = 'Multiply';
}

class AddNode extends LGraphNode {
  constructor() {
    super('Add');
    this.addInput('A', 'number');
    this.addInput('B', 'number');
    this.addOutput('A+B', 'number');
  }
  onExecute() {
    const A = this.getInputData(0) || 0;
    const B = this.getInputData(1) || 0;
    this.setOutputData(0, A + B);
  }
  static title = 'Add';
}

class AbsNode extends LGraphNode {
  constructor() {
    super('Abs');
    this.addInput('v', 'number');
    this.addOutput('|v|', 'number');
  }
  onExecute() { this.setOutputData(0, Math.abs(this.getInputData(0) || 0)); }
  static title = 'Abs';
}

class ClampNode extends LGraphNode {
  constructor() {
    super('Clamp');
    this.addInput('v', 'number');
    this.addOutput('out', 'number');
    this.addProperty('min', 0, 'number');
    this.addProperty('max', 1, 'number');
    this.addWidget('number', 'Min', 0, (v: number) => { this.properties.min = v; });
    this.addWidget('number', 'Max', 1, (v: number) => { this.properties.max = v; });
    this.serialize_widgets = true;
  }
  onExecute() {
    const v = this.getInputData(0) || 0;
    this.setOutputData(0, Math.max(this.properties.min, Math.min(this.properties.max, v)));
  }
  static title = 'Clamp';
}

// Register all node types (ES6 Class inheritance!)
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

// ===== Page Component =====

function createDemoGraph(graph: LGraph) {
  const n1 = LiteGraph.createNode('basic/number');
  n1.pos = [100, 100]; n1.setProperty('value', 42); graph.add(n1);

  const n2 = LiteGraph.createNode('basic/number');
  n2.pos = [100, 280]; n2.setProperty('value', 8); graph.add(n2);

  const m = LiteGraph.createNode('math/math');
  m.pos = [350, 160]; graph.add(m);

  const d = LiteGraph.createNode('basic/display');
  d.pos = [600, 180]; graph.add(d);

  const n3 = LiteGraph.createNode('basic/number');
  n3.pos = [100, 450]; n3.setProperty('value', 3.14); graph.add(n3);

  const mul = LiteGraph.createNode('math/multiply');
  mul.pos = [350, 400]; graph.add(mul);

  const d2 = LiteGraph.createNode('basic/display');
  d2.pos = [600, 420]; graph.add(d2);

  const t = LiteGraph.createNode('event/timer');
  t.pos = [100, 600]; graph.add(t);

  const d3 = LiteGraph.createNode('basic/display');
  d3.pos = [350, 600]; graph.add(d3);

  const n4 = LiteGraph.createNode('basic/number');
  n4.pos = [100, 750]; n4.setProperty('value', -5); graph.add(n4);

  const abs = LiteGraph.createNode('math/abs');
  abs.pos = [350, 750]; graph.add(abs);

  const d4 = LiteGraph.createNode('basic/display');
  d4.pos = [600, 750]; graph.add(d4);

  n1.connect(0, m, 0);
  n2.connect(0, m, 1);
  m.connect(0, d, 0);
  n3.connect(0, mul, 0);
  n3.connect(0, mul, 1);
  mul.connect(0, d2, 0);
  t.connect(0, d3, 0);
  n4.connect(0, abs, 0);
  abs.connect(0, d4, 0);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [codePanelTab, setCodePanelTab] = useState<'original' | 'refactored'>('refactored');
  const graphCanvasRef = useRef<LGraphCanvas | null>(null);
  const graphRef = useRef<LGraph | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Create graph using ES6 refactored LGraph class
    const graph = new LGraph();
    graphRef.current = graph;

    // Create canvas controller using ES6 refactored LGraphCanvas class
    const graphCanvas = new LGraphCanvas(canvas, graph, { autoresize: true });
    graphCanvasRef.current = graphCanvas;

    // Expose for debugging
    (window as any).__graphCanvas = graphCanvas;
    (window as any).__graph = graph;
    (window as any).__LiteGraph = LiteGraph;

    // Configure canvas appearance
    graphCanvas.background_image = null;
    graphCanvas.clear_background_color = '#1a1a2e';
    graphCanvas.render_shadows = true;
    graphCanvas.render_connections_border = true;
    graphCanvas.render_curved_connections = true;
    graphCanvas.links_render_mode = LiteGraph.SPLINE_LINK;

    // Create demo graph
    createDemoGraph(graph);
    // Use microtask to avoid synchronous setState in effect
    queueMicrotask(() => setNodeCount(graph._nodes.length));

    // Handle resize
    const ro = new ResizeObserver(() => {
      if (container && canvas) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        graphCanvas.resize();
        graphCanvas.setDirty(true, true);
      }
    });
    ro.observe(container);

    // Start graph execution
    graph.start();
    queueMicrotask(() => setIsRunning(true));

    return () => {
      graph.stop();
      graphCanvas.stopRendering();
      ro.disconnect();
    };
  }, []);

  const handlePlayStop = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    if (isRunning) { graph.stop(); } else { graph.start(); }
    setIsRunning(!isRunning);
  }, [isRunning]);

  const handleAddNode = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const types = ['basic/number', 'math/math', 'basic/display', 'basic/string', 'logic/compare', 'event/timer', 'math/multiply', 'math/add', 'math/abs', 'math/clamp'];
    const type = types[Math.floor(Math.random() * types.length)];
    const node = LiteGraph.createNode(type);
    if (!node) return;
    const gc = graphCanvasRef.current;
    node.pos = gc ? [gc.graph_mouse[0] + Math.random() * 200, gc.graph_mouse[1] + Math.random() * 200] : [300 + Math.random() * 200, 200 + Math.random() * 200];
    graph.add(node);
    setNodeCount(graph._nodes.length);
  }, []);

  const handleClear = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.clear();
    setNodeCount(0);
  }, []);

  const handleLoadDemo = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.clear();
    createDemoGraph(graph);
    setNodeCount(graph._nodes.length);
  }, []);

  const handleArrange = useCallback(() => {
    const graph = graphRef.current;
    const gc = graphCanvasRef.current;
    if (!graph) return;
    graph.arrange();
    if (gc) gc.setDirty(true, true);
  }, []);

  const codeExamples = {
    original: `// ===== 原始 litegraph.js (IIFE + Prototype) =====

(function(global) {

  // LiteGraph 是一个普通对象字面量
  var LiteGraph = (global.LiteGraph = {
    VERSION: 0.4,
    NODE_TITLE_HEIGHT: 30,
    registered_node_types: {},

    registerNodeType: function(type, base_class) {
      // Mixin 模式：复制 LGraphNode.prototype 方法
      for (var i in LGraphNode.prototype) {
        if (!base_class.prototype[i]) {
          base_class.prototype[i] = LGraphNode.prototype[i];
        }
      }
      this.registered_node_types[type] = base_class;
    },
  });

  // LGraph 是构造函数 + prototype
  function LGraph(o) {
    this.list_of_graphcanvas = null;
    this.clear();
    if (o) this.configure(o);
  }

  LGraph.prototype.start = function(interval) {
    var that = this;
    this.execution_timer_id = setInterval(function() {
      that.runStep(1, !that.catch_errors);
    }, interval);
  };

  // LGraphNode 用 _ctor 模式 + Object.defineProperty
  function LGraphNode(title) { this._ctor(title); }

  LGraphNode.prototype._ctor = function(title) {
    this.title = title || "Unnamed";
    this._pos = new Float32Array(10, 10);
    Object.defineProperty(this, "pos", {
      set: function(v) { this._pos[0] = v[0]; this._pos[1] = v[1]; },
      get: function() { return this._pos; },
    });
  };

  // 节点注册使用 Mixin 模式
  function MyCustomNode() { this.addOutput("value", "number"); }
  MyCustomNode.prototype.onExecute = function() {
    this.setOutputData(0, 42);
  };
  LiteGraph.registerNodeType("custom/node", MyCustomNode);

})(this);`,

    refactored: `// ===== 重构后 (ES6 Class + Modules) =====
// 本页面直接使用 ES6 重构模块！

import { LiteGraph } from "./LiteGraph.js";
import { LGraph } from "./LGraph.js";
import { LGraphNode } from "./LGraphNode.js";
import { LGraphCanvas } from "./LGraphCanvas.js";

// 1. LiteGraph → static class
class LiteGraphClass {
  static VERSION = 0.4;
  static NODE_TITLE_HEIGHT = 30;
  static registered_node_types = {};

  static registerNodeType(type, baseClass) {
    // ES6 继承：节点必须 extends LGraphNode
    this.registered_node_types[type] = baseClass;
  }
}

// 2. LGraph → ES6 class
class LGraph {
  constructor(o) {
    this.list_of_graphcanvas = null;
    this.clear();
    if (o) this.configure(o);
  }

  start(interval) {
    this.execution_timer_id = setInterval(() => {
      this.runStep(1, !this.catch_errors);
    }, interval);
  }
}

// 3. LGraphNode → ES6 class + get/set
class LGraphNode {
  constructor(title) {
    this.title = title || "Unnamed";
    this._pos = new Float32Array([10, 10]);
  }

  get pos() { return this._pos; }
  set pos(v) {
    if (!v || v.length < 2) return;
    this._pos[0] = v[0];
    this._pos[1] = v[1];
  }

  connect(outputSlot, targetNode, inputSlot) { ... }
  serialize() { ... }
  configure(info) { ... }
}

// 4. 节点用 class extends 继承 ✨
class NumberNode extends LGraphNode {
  constructor() {
    super("Number");
    this.addOutput("value", "number");
    this.addProperty("value", 1.0, "number");
  }

  onExecute() {
    this.setOutputData(0, parseFloat(this.properties.value));
  }
}

LiteGraph.registerNodeType("basic/number", NumberNode);

// 5. 使用重构后的模块
const graph = new LGraph();
const canvas = new LGraphCanvas(canvasEl, graph);
graph.start();  // 实时运行！`,
  };

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-gray-200">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-gray-700/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="6" r="3"/><circle cx="19" cy="6" r="3"/><circle cx="12" cy="18" r="3"/>
                <line x1="8" y1="6" x2="16" y2="6"/><line x1="12" y1="9" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">LiteGraph.js ES6 Refactored</h1>
              <p className="text-[10px] text-gray-500">Node Graph Editor • 100% ES6 Class Architecture • Zero IIFE</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayStop}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isRunning
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
            }`}
          >
            {isRunning ? '⏹ Stop' : '▶ Run'}
          </button>
          <button
            onClick={handleAddNode}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 transition-colors"
          >
            + Add Node
          </button>
          <button
            onClick={handleArrange}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 transition-colors"
          >
            ⬒ Arrange
          </button>
          <button
            onClick={handleLoadDemo}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 transition-colors"
          >
            ↻ Demo
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 border border-gray-500/30 transition-colors"
          >
            ✕ Clear
          </button>
          <div className="ml-2 px-2 py-1 rounded bg-gray-800 text-[10px] text-gray-500">
            Nodes: {nodeCount}
          </div>
          <button
            onClick={() => setShowCodePanel(!showCodePanel)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              showCodePanel
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 border border-gray-500/30'
            }`}
          >
            {'</>'} Code
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas area */}
        <div ref={containerRef} className="flex-1 relative">
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            style={{ background: '#1a1a2e' }}
          />
          {/* Floating info */}
          <div className="absolute bottom-3 left-3 flex gap-2">
            <div className="px-2 py-1 rounded bg-black/60 text-[10px] text-gray-400 backdrop-blur-sm">
              Right-click → Add Node | Drag → Connect | Scroll → Zoom | Space+Drag → Pan
            </div>
            <div className="px-2 py-1 rounded bg-emerald-500/20 text-[10px] text-emerald-400 backdrop-blur-sm border border-emerald-500/30">
              ✨ Powered by ES6 Class Modules
            </div>
          </div>
        </div>

        {/* Code comparison panel */}
        {showCodePanel && (
          <div className="w-[480px] shrink-0 bg-[#0d1117] border-l border-gray-700/50 flex flex-col">
            {/* Tabs */}
            <div className="flex border-b border-gray-700/50">
              <button
                onClick={() => setCodePanelTab('refactored')}
                className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                  codePanelTab === 'refactored'
                    ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                ES6 Class (重构后) ✨
              </button>
              <button
                onClick={() => setCodePanelTab('original')}
                className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                  codePanelTab === 'original'
                    ? 'text-orange-400 border-b-2 border-orange-400 bg-orange-500/5'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Original (原始)
              </button>
            </div>

            {/* Code content */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono">
                <code>
                  {codeExamples[codePanelTab]}
                </code>
              </pre>
            </div>

            {/* Refactoring summary */}
            <div className="border-t border-gray-700/50 p-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">重构要点</h3>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-emerald-400 font-medium">IIFE → ES6 Module</div>
                  <div className="text-gray-500">(function(global){})() → import/export</div>
                </div>
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-emerald-400 font-medium">Function → Class</div>
                  <div className="text-gray-500">function LGraph() → class LGraph</div>
                </div>
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-emerald-400 font-medium">Prototype → Method</div>
                  <div className="text-gray-500">LGraph.prototype.fn → class method</div>
                </div>
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-emerald-400 font-medium">Mixin → Extends</div>
                  <div className="text-gray-500">registerNodeType mixin → extends LGraphNode</div>
                </div>
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-emerald-400 font-medium">defineProperty → get/set</div>
                  <div className="text-gray-500">Object.defineProperty → class accessor</div>
                </div>
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-emerald-400 font-medium">Global → Module Scope</div>
                  <div className="text-gray-500">window.LiteGraph → export default</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
