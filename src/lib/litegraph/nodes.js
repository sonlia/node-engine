/**
 * Example Node Types - Demonstrating ES6 Class inheritance from LGraphNode
 * 
 * In the original litegraph.js, node types used a mixin pattern where
 * registerNodeType() would copy LGraphNode.prototype methods onto each class.
 * 
 * In this refactored version, nodes properly extend LGraphNode using ES6 class syntax:
 * 
 *   class MyNode extends LGraphNode { ... }
 *   LiteGraph.registerNodeType("category/name", MyNode);
 */

import { LiteGraph } from "./LiteGraph.js";
import { LGraphNode } from "./LGraphNode.js";

// ===================== MATH NODES =====================

/**
 * Number constant node - outputs a fixed number value
 */
class NumberNode extends LGraphNode {
  constructor() {
    super("Number");
    this.addOutput("value", "number");
    this.addProperty("value", 1.0, "number");
    this.widget = this.addWidget("number", "Value", 1.0, (v) => {
      this.properties.value = v;
    });
    this.serialize_widgets = true;
  }

  onExecute() {
    this.setOutputData(0, parseFloat(this.properties.value));
  }

  static title = "Number";
  static desc = "Constant number value";
}

/**
 * Math operation node - performs basic math on two inputs
 */
class MathNode extends LGraphNode {
  constructor() {
    super("Math");
    this.addInput("A", "number");
    this.addInput("B", "number");
    this.addOutput("=", "number");
    this.addProperty("OP", "+", "enum", { values: ["+", "-", "*", "/", "%", "^", "max", "min"] });
    this.addWidget("combo", "Operation", "+", (v) => {
      this.properties.OP = v;
    }, { values: ["+", "-", "*", "/", "%", "^", "max", "min"] });
    this.serialize_widgets = true;
  }

  onExecute() {
    const A = this.getInputData(0) || 0;
    const B = this.getInputData(1) || 0;
    let result = 0;
    switch (this.properties.OP) {
      case "+": result = A + B; break;
      case "-": result = A - B; break;
      case "*": result = A * B; break;
      case "/": result = B !== 0 ? A / B : 0; break;
      case "%": result = A % B; break;
      case "^": result = Math.pow(A, B); break;
      case "max": result = Math.max(A, B); break;
      case "min": result = Math.min(A, B); break;
      default: result = A + B;
    }
    this.setOutputData(0, result);
  }

  static title = "Math";
  static desc = "Math operation on two values";
}

/**
 * Sin/Cos node
 */
class TrigNode extends LGraphNode {
  constructor() {
    super("Trigonometry");
    this.addInput("v", "number");
    this.addOutput("sin", "number");
    this.addOutput("cos", "number");
    this.addProperty("operation", "sin", "enum", { values: ["sin", "cos", "tan", "asin", "acos", "atan"] });
    this.addWidget("combo", "Op", "sin", (v) => {
      this.properties.operation = v;
    }, { values: ["sin", "cos", "tan", "asin", "acos", "atan"] });
    this.serialize_widgets = true;
  }

  onExecute() {
    const v = this.getInputData(0) || 0;
    this.setOutputData(0, Math.sin(v));
    this.setOutputData(1, Math.cos(v));
  }

  static title = "Trig";
  static desc = "Trigonometric functions";
}

/**
 * Display node - shows a value
 */
class DisplayNode extends LGraphNode {
  constructor() {
    super("Display");
    this.addInput("value", 0);
    this.addProperty("value", "", "string");
    this.size = [120, 60];
  }

  onExecute() {
    const v = this.getInputData(0);
    if (v !== null && v !== undefined) {
      this.properties.value = typeof v === "object" ? JSON.stringify(v) : String(v);
    }
  }

  onDrawForeground(ctx) {
    ctx.fillStyle = "#CCC";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    const text = this.properties.value || "—";
    ctx.fillText(text, this.size[0] * 0.5, this.size[1] * 0.5 + 4);
  }

  static title = "Display";
  static desc = "Display a value";
}

// ===================== STRING NODES =====================

/**
 * String constant node
 */
class StringNode extends LGraphNode {
  constructor() {
    super("String");
    this.addOutput("text", "string");
    this.addProperty("value", "", "string");
    this.addWidget("text", "Text", "", (v) => {
      this.properties.value = v;
    });
    this.serialize_widgets = true;
  }

  onExecute() {
    this.setOutputData(0, this.properties.value);
  }

  static title = "String";
  static desc = "Constant string value";
}

/**
 * String concatenation node
 */
class ConcatNode extends LGraphNode {
  constructor() {
    super("Concat");
    this.addInput("A", "string");
    this.addInput("B", "string");
    this.addOutput("A+B", "string");
    this.addProperty("separator", "", "string");
    this.addWidget("text", "Separator", "", (v) => {
      this.properties.separator = v;
    });
    this.serialize_widgets = true;
  }

  onExecute() {
    const A = this.getInputData(0) || "";
    const B = this.getInputData(1) || "";
    this.setOutputData(0, A + this.properties.separator + B);
  }

  static title = "Concat";
  static desc = "Concatenate two strings";
}

// ===================== LOGIC NODES =====================

/**
 * Compare node
 */
class CompareNode extends LGraphNode {
  constructor() {
    super("Compare");
    this.addInput("A", "number");
    this.addInput("B", "number");
    this.addOutput("A>B", "boolean");
    this.addOutput("A==B", "boolean");
    this.addOutput("A<B", "boolean");
  }

  onExecute() {
    const A = this.getInputData(0) || 0;
    const B = this.getInputData(1) || 0;
    this.setOutputData(0, A > B);
    this.setOutputData(1, A === B);
    this.setOutputData(2, A < B);
  }

  static title = "Compare";
  static desc = "Compare two values";
}

/**
 * Conditional/Gate node
 */
class ConditionalNode extends LGraphNode {
  constructor() {
    super("Conditional");
    this.addInput("condition", "boolean");
    this.addInput("if true", 0);
    this.addInput("if false", 0);
    this.addOutput("result", 0);
  }

  onExecute() {
    const cond = this.getInputData(0);
    const ifTrue = this.getInputData(1);
    const ifFalse = this.getInputData(2);
    this.setOutputData(0, cond ? ifTrue : ifFalse);
  }

  static title = "Conditional";
  static desc = "Select value based on condition";
}

// ===================== EVENT NODES =====================

/**
 * Timer node - outputs elapsed time
 */
class TimerNode extends LGraphNode {
  constructor() {
    super("Timer");
    this.addOutput("time", "number");
    this.addOutput("delta", "number");
    this.addProperty("interval", 1000, "number");
    this._lastTime = 0;
  }

  onExecute() {
    const now = this.graph ? this.graph.globaltime : 0;
    const delta = now - this._lastTime;
    this._lastTime = now;
    this.setOutputData(0, now);
    this.setOutputData(1, delta);
  }

  static title = "Timer";
  static desc = "Output elapsed time";
}

/**
 * Event Trigger node
 */
class TriggerNode extends LGraphNode {
  constructor() {
    super("Trigger");
    this.addInput("in", LiteGraph.EVENT);
    this.addOutput("out", LiteGraph.EVENT);
    this.addProperty("message", "", "string");
    this.addWidget("text", "Message", "", (v) => {
      this.properties.message = v;
    });
  }

  onAction(action, data) {
    this.triggerSlot(0, { action, message: this.properties.message, ...data });
  }

  static title = "Trigger";
  static desc = "Trigger an event";
}

// ===================== CONSOLE NODE =====================

/**
 * Console log node
 */
class ConsoleNode extends LGraphNode {
  constructor() {
    super("Console");
    this.addInput("log", 0);
    this.addProperty("prefix", "LOG:", "string");
    this.addWidget("text", "Prefix", "LOG:", (v) => {
      this.properties.prefix = v;
    });
    this.serialize_widgets = true;
  }

  onExecute() {
    const data = this.getInputData(0);
    if (data !== null && data !== undefined) {
      console.log(`[${this.properties.prefix}]`, data);
    }
  }

  static title = "Console";
  static desc = "Log value to console";
}

// ===================== REGISTER ALL NODES =====================

export function registerAllNodeTypes() {
  LiteGraph.registerNodeType("basic/number", NumberNode);
  LiteGraph.registerNodeType("math/math", MathNode);
  LiteGraph.registerNodeType("math/trig", TrigNode);
  LiteGraph.registerNodeType("basic/display", DisplayNode);
  LiteGraph.registerNodeType("basic/string", StringNode);
  LiteGraph.registerNodeType("string/concat", ConcatNode);
  LiteGraph.registerNodeType("logic/compare", CompareNode);
  LiteGraph.registerNodeType("logic/conditional", ConditionalNode);
  LiteGraph.registerNodeType("event/timer", TimerNode);
  LiteGraph.registerNodeType("event/trigger", TriggerNode);
  LiteGraph.registerNodeType("basic/console", ConsoleNode);
}

export {
  NumberNode,
  MathNode,
  TrigNode,
  DisplayNode,
  StringNode,
  ConcatNode,
  CompareNode,
  ConditionalNode,
  TimerNode,
  TriggerNode,
  ConsoleNode,
};
