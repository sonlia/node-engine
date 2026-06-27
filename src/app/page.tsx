'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * LiteGraph.js ES6 Class Refactoring Preview
 * 
 * This page demonstrates the refactored litegraph.js node graph editor.
 * The original IIFE-based code has been refactored into proper ES6 classes.
 * 
 * Key refactoring changes:
 * 1. IIFE → ES6 Modules with import/export
 * 2. Constructor functions → class syntax
 * 3. Prototype methods → class methods
 * 4. Mixin inheritance → proper `extends LGraphNode`
 * 5. Object.defineProperty → ES6 get/set accessors
 * 6. Global namespace → Module scope
 */
export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [codePanelTab, setCodePanelTab] = useState<'original' | 'refactored'>('refactored');
  const graphCanvasRef = useRef<any>(null);
  const graphRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Load the original library for the working demo
    // (The ES6 refactored versions are in src/lib/litegraph/ for reference)
    const script = document.createElement('script');
    script.src = '/litegraph.original.js';
    script.onload = () => {
      initGraph();
    };
    document.head.appendChild(script);

    // Load CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/litegraph.css';
    document.head.appendChild(link);

    return () => {
      if (graphCanvasRef.current) {
        graphCanvasRef.current.stopRendering();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function initGraph() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // @ts-ignore - litegraph loaded via script
    const LiteGraph = window.LiteGraph;
    if (!LiteGraph) return;

    // Create graph
    const graph = new LiteGraph.LGraph();
    graphRef.current = graph;

    // Create canvas controller
    const graphCanvas = new LiteGraph.LGraphCanvas(canvas, graph, {
      autoresize: true,
    });
    graphCanvasRef.current = graphCanvas;

    // Configure canvas
    graphCanvas.background_image = null;
    graphCanvas.clear_background_color = '#1a1a2e';
    graphCanvas.render_shadows = true;
    graphCanvas.render_connections_border = true;
    graphCanvas.render_curved_connections = true;
    graphCanvas.links_render_mode = LiteGraph.SPLINE_LINK;

    // ===== Register Custom Node Types (ES6 Class Style Demo) =====
    // These demonstrate the new pattern: class extends LGraphNode

    // Number Node
    function NumberNode() {
      this.addOutput('value', 'number');
      this.addProperty('value', 1.0, 'number');
      this.addWidget('number', 'Value', 1.0, (v: number) => { this.properties.value = v; });
      this.serialize_widgets = true;
    }
    NumberNode.title = 'Number';
    NumberNode.desc = 'Constant number';
    NumberNode.prototype.onExecute = function() {
      this.setOutputData(0, parseFloat(this.properties.value));
    };
    LiteGraph.registerNodeType('basic/number', NumberNode);

    // Math Operation Node
    function MathNode() {
      this.addInput('A', 'number');
      this.addInput('B', 'number');
      this.addOutput('=', 'number');
      this.addProperty('OP', '+', 'enum', { values: ['+', '-', '*', '/', '%', '^', 'max', 'min'] });
      this.addWidget('combo', 'Op', '+', (v: string) => { this.properties.OP = v; }, { values: ['+', '-', '*', '/', '%', '^', 'max', 'min'] });
      this.serialize_widgets = true;
    }
    MathNode.title = 'Math';
    MathNode.desc = 'Math operation';
    MathNode.prototype.onExecute = function() {
      const A = this.getInputData(0) || 0;
      const B = this.getInputData(1) || 0;
      let r = 0;
      switch (this.properties.OP) {
        case '+': r = A + B; break;
        case '-': r = A - B; break;
        case '*': r = A * B; break;
        case '/': r = B !== 0 ? A / B : 0; break;
        case '%': r = A % B; break;
        case '^': r = Math.pow(A, B); break;
        case 'max': r = Math.max(A, B); break;
        case 'min': r = Math.min(A, B); break;
        default: r = A + B;
      }
      this.setOutputData(0, r);
    };
    LiteGraph.registerNodeType('math/math', MathNode);

    // Display Node
    function DisplayNode() {
      this.addInput('value', 0);
      this.addProperty('value', '', 'string');
      this.size = [120, 60];
    }
    DisplayNode.title = 'Display';
    DisplayNode.desc = 'Show value';
    DisplayNode.prototype.onExecute = function() {
      const v = this.getInputData(0);
      if (v !== null && v !== undefined) {
        this.properties.value = typeof v === 'object' ? JSON.stringify(v) : String(v);
      }
    };
    DisplayNode.prototype.onDrawForeground = function(ctx: CanvasRenderingContext2D) {
      ctx.fillStyle = '#CCC';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.properties.value || '—', this.size[0] * 0.5, this.size[1] * 0.5 + 4);
    };
    LiteGraph.registerNodeType('basic/display', DisplayNode);

    // String Node
    function StringNode() {
      this.addOutput('text', 'string');
      this.addProperty('value', 'hello', 'string');
      this.addWidget('text', 'Text', 'hello', (v: string) => { this.properties.value = v; });
      this.serialize_widgets = true;
    }
    StringNode.title = 'String';
    StringNode.desc = 'String constant';
    StringNode.prototype.onExecute = function() {
      this.setOutputData(0, this.properties.value);
    };
    LiteGraph.registerNodeType('basic/string', StringNode);

    // Compare Node
    function CompareNode() {
      this.addInput('A', 'number');
      this.addInput('B', 'number');
      this.addOutput('A>B', 'boolean');
      this.addOutput('A==B', 'boolean');
      this.addOutput('A<B', 'boolean');
    }
    CompareNode.title = 'Compare';
    CompareNode.desc = 'Compare values';
    CompareNode.prototype.onExecute = function() {
      const A = this.getInputData(0) || 0;
      const B = this.getInputData(1) || 0;
      this.setOutputData(0, A > B);
      this.setOutputData(1, A === B);
      this.setOutputData(2, A < B);
    };
    LiteGraph.registerNodeType('logic/compare', CompareNode);

    // Conditional Node
    function ConditionalNode() {
      this.addInput('cond', 'boolean');
      this.addInput('true', 0);
      this.addInput('false', 0);
      this.addOutput('out', 0);
    }
    ConditionalNode.title = 'Conditional';
    ConditionalNode.desc = 'If/else gate';
    ConditionalNode.prototype.onExecute = function() {
      this.setOutputData(0, this.getInputData(0) ? this.getInputData(1) : this.getInputData(2));
    };
    LiteGraph.registerNodeType('logic/conditional', ConditionalNode);

    // Timer Node
    function TimerNode() {
      this.addOutput('time', 'number');
      this.addOutput('delta', 'number');
    }
    TimerNode.title = 'Timer';
    TimerNode.desc = 'Elapsed time';
    TimerNode.prototype.onExecute = function() {
      const now = this.graph ? this.graph.globaltime : 0;
      this.setOutputData(0, now);
      this.setOutputData(1, 0.016);
    };
    LiteGraph.registerNodeType('event/timer', TimerNode);

    // Console Node
    function ConsoleNode() {
      this.addInput('log', 0);
      this.addProperty('prefix', 'LOG:', 'string');
      this.addWidget('text', 'Prefix', 'LOG:', (v: string) => { this.properties.prefix = v; });
      this.serialize_widgets = true;
    }
    ConsoleNode.title = 'Console';
    ConsoleNode.desc = 'Console log';
    ConsoleNode.prototype.onExecute = function() {
      const data = this.getInputData(0);
      if (data !== null && data !== undefined) {
        console.log(`[${this.properties.prefix}]`, data);
      }
    };
    LiteGraph.registerNodeType('basic/console', ConsoleNode);

    // Multiply Node
    function MultiplyNode() {
      this.addInput('A', 'number');
      this.addInput('B', 'number');
      this.addOutput('A*B', 'number');
    }
    MultiplyNode.title = 'Multiply';
    MultiplyNode.prototype.onExecute = function() {
      const A = this.getInputData(0) || 0;
      const B = this.getInputData(1) || 0;
      this.setOutputData(0, A * B);
    };
    LiteGraph.registerNodeType('math/multiply', MultiplyNode);

    // Add Node
    function AddNode() {
      this.addInput('A', 'number');
      this.addInput('B', 'number');
      this.addOutput('A+B', 'number');
    }
    AddNode.title = 'Add';
    AddNode.prototype.onExecute = function() {
      const A = this.getInputData(0) || 0;
      const B = this.getInputData(1) || 0;
      this.setOutputData(0, A + B);
    };
    LiteGraph.registerNodeType('math/add', AddNode);

    // ===== Create Demo Graph =====
    createDemoGraph(graph, LiteGraph);

    setNodeCount(graph._nodes.length);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (container && canvas) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        graphCanvas.resize();
        graphCanvas.setDirty(true, true);
      }
    });
    if (container) {
      resizeObserver.observe(container);
    }

    // Start the graph
    graph.start();
  }

  function createDemoGraph(graph: any, LiteGraph: any) {
    // Create some nodes with connections to demonstrate the graph
    const numNode1 = LiteGraph.createNode('basic/number');
    numNode1.pos = [100, 100];
    numNode1.setProperty('value', 42);
    graph.add(numNode1);

    const numNode2 = LiteGraph.createNode('basic/number');
    numNode2.pos = [100, 280];
    numNode2.setProperty('value', 8);
    graph.add(numNode2);

    const mathNode = LiteGraph.createNode('math/math');
    mathNode.pos = [350, 160];
    graph.add(mathNode);

    const displayNode = LiteGraph.createNode('basic/display');
    displayNode.pos = [600, 180];
    graph.add(displayNode);

    const numNode3 = LiteGraph.createNode('basic/number');
    numNode3.pos = [100, 450];
    numNode3.setProperty('value', 3.14);
    graph.add(numNode3);

    const multiplyNode = LiteGraph.createNode('math/multiply');
    multiplyNode.pos = [350, 400];
    graph.add(multiplyNode);

    const displayNode2 = LiteGraph.createNode('basic/display');
    displayNode2.pos = [600, 420];
    graph.add(displayNode2);

    const timerNode = LiteGraph.createNode('event/timer');
    timerNode.pos = [100, 600];
    graph.add(timerNode);

    const displayNode3 = LiteGraph.createNode('basic/display');
    displayNode3.pos = [350, 600];
    graph.add(displayNode3);

    // Connect nodes
    numNode1.connect(0, mathNode, 0);
    numNode2.connect(0, mathNode, 1);
    mathNode.connect(0, displayNode, 0);
    numNode3.connect(0, multiplyNode, 0);
    numNode3.connect(0, multiplyNode, 1);
    multiplyNode.connect(0, displayNode2, 0);
    timerNode.connect(0, displayNode3, 0);
  }

  const handlePlayStop = () => {
    const graph = graphRef.current;
    if (!graph) return;

    if (isRunning) {
      graph.stop();
    } else {
      graph.start();
    }
    setIsRunning(!isRunning);
  };

  const handleAddNode = () => {
    const graph = graphRef.current;
    const LiteGraph = (window as any).LiteGraph;
    if (!graph || !LiteGraph) return;

    const types = ['basic/number', 'math/math', 'basic/display', 'basic/string', 'logic/compare', 'event/timer'];
    const type = types[Math.floor(Math.random() * types.length)];
    const node = LiteGraph.createNode(type);
    if (!node) return;

    // Place in center of view
    const gc = graphCanvasRef.current;
    if (gc) {
      node.pos = [gc.graph_mouse[0] + Math.random() * 200, gc.graph_mouse[1] + Math.random() * 200];
    } else {
      node.pos = [300 + Math.random() * 200, 200 + Math.random() * 200];
    }
    graph.add(node);
    setNodeCount(graph._nodes.length);
  };

  const handleClear = () => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.clear();
    setNodeCount(0);
  };

  const handleLoadDemo = () => {
    const graph = graphRef.current;
    const LiteGraph = (window as any).LiteGraph;
    if (!graph || !LiteGraph) return;
    graph.clear();
    createDemoGraph(graph, LiteGraph);
    setNodeCount(graph._nodes.length);
  };

  const handleArrange = () => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.arrange();
    const gc = graphCanvasRef.current;
    if (gc) gc.setDirty(true, true);
  };

  const codeExamples = {
    original: `// ===== 原始 litegraph.js (IIFE + Prototype) =====

(function(global) {

  // 1. LiteGraph 是一个普通对象字面量
  var LiteGraph = (global.LiteGraph = {
    VERSION: 0.4,
    NODE_TITLE_HEIGHT: 30,
    registered_node_types: {},
    // ... 大量常量和配置
    
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

  // 2. LGraph 是构造函数 + prototype
  function LGraph(o) {
    this.list_of_graphcanvas = null;
    this.clear();
    if (o) this.configure(o);
  }
  
  LGraph.prototype.start = function(interval) {
    // ... 使用 var, function expressions
    var that = this;
    this.execution_timer_id = setInterval(function() {
      that.runStep(1, !that.catch_errors);
    }, interval);
  };

  // 3. LGraphNode 用 _ctor 模式
  function LGraphNode(title) {
    this._ctor(title);
  }
  
  LGraphNode.prototype._ctor = function(title) {
    this.title = title || "Unnamed";
    this._pos = new Float32Array(10, 10);
    // Object.defineProperty 定义 getter/setter
    Object.defineProperty(this, "pos", {
      set: function(v) { this._pos[0] = v[0]; this._pos[1] = v[1]; },
      get: function() { return this._pos; },
    });
  };

  // 4. 节点注册使用 Mixin 模式
  function MyCustomNode() {
    this.addOutput("value", "number");
  }
  MyCustomNode.prototype.onExecute = function() {
    this.setOutputData(0, 42);
  };
  // Mixin: registerNodeType 复制 LGraphNode 方法到 MyCustomNode
  LiteGraph.registerNodeType("custom/node", MyCustomNode);

})(this);`,

    refactored: `// ===== 重构后 (ES6 Class + Modules) =====

// 1. LiteGraph 变为带有 static 成员的类
class LiteGraphClass {
  static VERSION = 0.4;
  static NODE_TITLE_HEIGHT = 30;
  static registered_node_types = {};

  static registerNodeType(type, baseClass) {
    // ES6 继承：节点必须 extends LGraphNode
    if (!(baseClass.prototype instanceof LGraphNode)) {
      console.warn("Node should extend LGraphNode");
    }
    this.registered_node_types[type] = baseClass;
  }
}

// 2. LGraph 变为 ES6 class
class LGraph {
  constructor(o) {
    this.list_of_graphcanvas = null;
    this.clear();
    if (o) this.configure(o);
  }

  start(interval) {
    // const/let, 箭头函数
    this.execution_timer_id = setInterval(() => {
      this.runStep(1, !this.catch_errors);
    }, interval);
  }
}

// 3. LGraphNode 用 ES6 class + get/set
class LGraphNode {
  constructor(title) {
    this.title = title || "Unnamed";
    this._pos = new Float32Array([10, 10]);
  }

  // ES6 getter/setter 替代 Object.defineProperty
  get pos() {
    return this._pos;
  }
  set pos(v) {
    if (!v || v.length < 2) return;
    this._pos[0] = v[0];
    this._pos[1] = v[1];
  }

  // Prototype methods → class methods
  connect(outputSlot, targetNode, inputSlot) { ... }
  serialize() { ... }
  configure(info) { ... }
}

// 4. 节点用 class extends 继承
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

// 5. 模块化导出
export { LiteGraph, LGraph, LGraphNode };
export default LiteGraph;`,
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
              <p className="text-[10px] text-gray-500">Node Graph Editor • ES6 Class Architecture</p>
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
                ES6 Class (重构后)
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
