/**
 * LiteGraph - The Global Registry
 * 
 * Refactored from a plain object literal to an ES6 class with static members.
 * This is the central registry for all node types, constants, and configuration.
 * 
 * Original: var LiteGraph = global.LiteGraph = { ... }
 * Refactored: class LiteGraph with static properties and methods
 */

import { cloneObject, uuidv4, getTime, getParameterNames } from "./utils.js";

class LiteGraphClass {
  // ===================== VERSION =====================
  static VERSION = 0.4;

  // ===================== CANVAS =====================
  static CANVAS_GRID_SIZE = 10;

  // ===================== NODE RENDERING =====================
  static NODE_TITLE_HEIGHT = 30;
  static NODE_TITLE_TEXT_Y = 20;
  static NODE_SLOT_HEIGHT = 20;
  static NODE_WIDGET_HEIGHT = 20;
  static NODE_WIDTH = 140;
  static NODE_MIN_WIDTH = 50;
  static NODE_COLLAPSED_RADIUS = 10;
  static NODE_COLLAPSED_WIDTH = 80;
  static NODE_TITLE_COLOR = "#999";
  static NODE_SELECTED_TITLE_COLOR = "#FFF";
  static NODE_TEXT_SIZE = 14;
  static NODE_TEXT_COLOR = "#AAA";
  static NODE_SUBTEXT_SIZE = 12;
  static NODE_DEFAULT_COLOR = "#333";
  static NODE_DEFAULT_BGCOLOR = "#353535";
  static NODE_DEFAULT_BOXCOLOR = "#666";
  static NODE_DEFAULT_SHAPE = "box";
  static NODE_BOX_OUTLINE_COLOR = "#FFF";
  static DEFAULT_SHADOW_COLOR = "rgba(0,0,0,0.5)";
  static DEFAULT_GROUP_FONT = 24;

  // ===================== WIDGET =====================
  static WIDGET_BGCOLOR = "#222";
  static WIDGET_OUTLINE_COLOR = "#666";
  static WIDGET_TEXT_COLOR = "#DDD";
  static WIDGET_SECONDARY_TEXT_COLOR = "#999";

  // ===================== LINK =====================
  static LINK_COLOR = "#9A9";
  static EVENT_LINK_COLOR = "#A86";
  static CONNECTING_LINK_COLOR = "#AFA";

  // ===================== LIMITS =====================
  static MAX_NUMBER_OF_NODES = 1000;
  static DEFAULT_POSITION = [100, 100];
  static VALID_SHAPES = ["default", "box", "round", "card"];

  // ===================== SHAPES =====================
  static BOX_SHAPE = 1;
  static ROUND_SHAPE = 2;
  static CIRCLE_SHAPE = 3;
  static CARD_SHAPE = 4;
  static ARROW_SHAPE = 5;
  static GRID_SHAPE = 6;

  // ===================== DIRECTION =====================
  static INPUT = 1;
  static OUTPUT = 2;

  // ===================== EVENT/ACTION =====================
  static EVENT = -1;
  static ACTION = -1;

  // ===================== NODE MODES =====================
  static NODE_MODES = ["Always", "On Event", "Never", "On Trigger"];
  static NODE_MODES_COLORS = ["#666", "#422", "#333", "#224", "#626"];
  static ALWAYS = 0;
  static ON_EVENT = 1;
  static NEVER = 2;
  static ON_TRIGGER = 3;

  // ===================== ORIENTATION =====================
  static UP = 1;
  static DOWN = 2;
  static LEFT = 3;
  static RIGHT = 4;
  static CENTER = 5;

  // ===================== LINK RENDERING =====================
  static LINK_RENDER_MODES = ["Straight", "Linear", "Spline"];
  static STRAIGHT_LINK = 0;
  static LINEAR_LINK = 1;
  static SPLINE_LINK = 2;

  // ===================== TITLE MODES =====================
  static NORMAL_TITLE = 0;
  static NO_TITLE = 1;
  static TRANSPARENT_TITLE = 2;
  static AUTOHIDE_TITLE = 3;
  static VERTICAL_LAYOUT = "vertical";

  // ===================== REGISTRY =====================
  static registered_node_types = {};
  static node_types_by_file_extension = {};
  static Nodes = {};
  static Globals = {};

  // ===================== SEARCH =====================
  static searchbox_extras = {};

  // ===================== CONFIG FLAGS =====================
  static auto_sort_node_types = false;
  static node_box_coloured_when_on = false;
  static node_box_coloured_by_mode = false;
  static dialog_close_on_mouse_leave = true;
  static dialog_close_on_mouse_leave_delay = 500;
  static shift_click_do_break_link_from = false;
  static click_do_break_link_to = false;
  static search_hide_on_mouse_leave = true;
  static search_filter_enabled = false;
  static search_show_all_on_open = true;
  static auto_load_slot_types = false;

  // ===================== SLOT TYPES =====================
  static registered_slot_in_types = {};
  static registered_slot_out_types = {};
  static slot_types_in = [];
  static slot_types_out = [];
  static slot_types_default_in = [];
  static slot_types_default_out = [];

  // ===================== BEHAVIOR =====================
  static alt_drag_do_clone_nodes = false;
  static do_add_triggers_slots = false;
  static allow_multi_output_for_events = true;
  static middle_click_slot_add_default_node = false;
  static release_link_on_empty_shows_menu = false;
  static pointerevents_method = "pointer";
  static ctrl_shift_v_paste_connect_unselected_outputs = false;
  static use_uuids = false;

  // ===================== OTHER =====================
  static proxy = null;
  static node_images_path = "";
  static debug = false;
  static catch_exceptions = true;
  static throw_errors = true;
  static allow_scripts = false;
  static use_deferred_actions = true;

  /**
   * Register a node class so it can be listed when the user wants to create a new one.
   * In the original code, this uses a mixin pattern (copying LGraphNode.prototype methods).
   * In ES6 refactored version, registered nodes MUST extend LGraphNode.
   * 
   * @static
   * @param {string} type - Name of the node and path (e.g. "math/sin")
   * @param {class} baseClass - Class extending LGraphNode
   */
  static registerNodeType(type, baseClass) {
    if (!baseClass.prototype) {
      throw new Error("Cannot register a simple object, it must be a class with a prototype");
    }

    baseClass.type = type;

    if (LiteGraph.debug) {
      console.log("Node registered: " + type);
    }

    const classname = baseClass.name;
    const pos = type.lastIndexOf("/");
    baseClass.category = type.substring(0, pos);

    if (!baseClass.title) {
      baseClass.title = classname;
    }

    // In ES6 refactored version, nodes MUST extend LGraphNode
    // We no longer do the mixin pattern, but we still verify the prototype chain
    const LGraphNode = LiteGraphClass._LGraphNode;
    if (LGraphNode && !(baseClass.prototype instanceof LGraphNode)) {
      console.warn(
        `LiteGraph: Node class "${classname}" should extend LGraphNode. ` +
        `Mixing in LGraphNode prototype methods for compatibility.`
      );
      // Fallback: mixin for backward compatibility
      for (const i in LGraphNode.prototype) {
        if (baseClass.prototype[i] === undefined) {
          baseClass.prototype[i] = LGraphNode.prototype[i];
        }
      }
    }

    const prev = LiteGraph.registered_node_types[type];
    if (prev) {
      console.log("replacing node type: " + type);
    }

    if (!Object.prototype.hasOwnProperty.call(baseClass.prototype, "shape")) {
      Object.defineProperty(baseClass.prototype, "shape", {
        set(v) {
          switch (v) {
            case "default": delete this._shape; break;
            case "box": this._shape = LiteGraph.BOX_SHAPE; break;
            case "round": this._shape = LiteGraph.ROUND_SHAPE; break;
            case "circle": this._shape = LiteGraph.CIRCLE_SHAPE; break;
            case "card": this._shape = LiteGraph.CARD_SHAPE; break;
            default: this._shape = v;
          }
        },
        get() {
          return this._shape;
        },
        enumerable: true,
        configurable: true,
      });
    }

    LiteGraph.registered_node_types[type] = baseClass;
    if (classname) {
      LiteGraph.Nodes[classname] = baseClass;
    }
    if (baseClass.prototype.onPropertyChange) {
      baseClass.prototype.onPropertyChanged = baseClass.prototype.onPropertyChange;
    }

    // Support for file extensions
    if (baseClass.supported_extensions) {
      for (let i = 0; i < baseClass.supported_extensions.length; i++) {
        LiteGraph.node_types_by_file_extension[baseClass.supported_extensions[i]] = baseClass;
      }
    }

    // Register slot types
    if (LiteGraph.auto_load_slot_types) {
      for (const i in baseClass.prototype) {
        if (typeof baseClass.prototype[i] === "function" && i.charCodeAt(0) === 111 && i.charCodeAt(1) === 110) {
          // on* callbacks
          const func = baseClass.prototype[i];
          const params = getParameterNames(func);
          if (params.length === 0) continue;
          const slotType = params[0];
          if (slotType === "type" || slotType === "slot" || slotType === "output") continue;
          // Register input slot type
          if (i.startsWith("onInput")) {
            if (!LiteGraph.registered_slot_in_types[slotType]) {
              LiteGraph.registered_slot_in_types[slotType] = { nodes: [] };
            }
            LiteGraph.registered_slot_in_types[slotType].nodes.push(classname);
            if (!LiteGraph.slot_types_in.includes(slotType)) {
              LiteGraph.slot_types_in.push(slotType);
            }
          } else if (i.startsWith("onOutput")) {
            if (!LiteGraph.registered_slot_out_types[slotType]) {
              LiteGraph.registered_slot_out_types[slotType] = { nodes: [] };
            }
            LiteGraph.registered_slot_out_types[slotType].nodes.push(classname);
            if (!LiteGraph.slot_types_out.includes(slotType)) {
              LiteGraph.slot_types_out.push(slotType);
            }
          }
        }
      }
    }
  }

  /**
   * Unregister a node type
   */
  static unregisterNodeType(type) {
    const baseClass = LiteGraph.registered_node_types[type];
    if (!baseClass) return;
    delete LiteGraph.registered_node_types[type];
    delete LiteGraph.Nodes[baseClass.name];
    // Remove from file extensions
    if (baseClass.supported_extensions) {
      for (let i = 0; i < baseClass.supported_extensions.length; i++) {
        delete LiteGraph.node_types_by_file_extension[baseClass.supported_extensions[i]];
      }
    }
  }

  /**
   * Register a slot type association
   */
  static registerNodeAndSlotType(type, slotType, direction) {
    direction = direction || LiteGraph.OUTPUT;
    if (!type || !slotType) return;
    const classname = type.constructor === String ? type : type.name;
    const slotTypeStr = slotType.constructor === String ? slotType : slotType.name;
    if (direction === LiteGraph.OUTPUT) {
      if (!LiteGraph.registered_slot_out_types[slotTypeStr]) {
        LiteGraph.registered_slot_out_types[slotTypeStr] = { nodes: [] };
      }
      if (!LiteGraph.registered_slot_out_types[slotTypeStr].nodes.includes(classname)) {
        LiteGraph.registered_slot_out_types[slotTypeStr].nodes.push(classname);
      }
      if (!LiteGraph.slot_types_out.includes(slotTypeStr)) {
        LiteGraph.slot_types_out.push(slotTypeStr);
      }
    } else {
      if (!LiteGraph.registered_slot_in_types[slotTypeStr]) {
        LiteGraph.registered_slot_in_types[slotTypeStr] = { nodes: [] };
      }
      if (!LiteGraph.registered_slot_in_types[slotTypeStr].nodes.includes(classname)) {
        LiteGraph.registered_slot_in_types[slotTypeStr].nodes.push(classname);
      }
      if (!LiteGraph.slot_types_in.includes(slotTypeStr)) {
        LiteGraph.slot_types_in.push(slotTypeStr);
      }
    }
  }

  /**
   * Build a node class from a plain config object
   */
  static buildNodeClassFromObject(object) {
    const LGraphNode = LiteGraphClass._LGraphNode;

    class LGraphNodeExtend extends LGraphNode {
      constructor() {
        super(object.title || "Derived");
        // Copy properties from object
        for (const key in object) {
          if (key !== "title" && typeof object[key] !== "function") {
            this[key] = object[key];
          }
        }
      }
    }

    // Copy functions as prototype methods
    for (const key in object) {
      if (typeof object[key] === "function") {
        LGraphNodeExtend.prototype[key] = object[key];
      }
    }

    return LGraphNodeExtend;
  }

  /**
   * Wrap a simple function as a node type
   */
  static wrapFunctionAsNode(name, func, paramTypes, returnType, properties) {
    const LGraphNode = LiteGraphClass._LGraphNode;

    class FunctionNode extends LGraphNode {
      constructor() {
        super(name);
        if (paramTypes) {
          for (let i = 0; i < paramTypes.length; i++) {
            const paramName = paramTypes[i].name || `in${i}`;
            const paramType = paramTypes[i].type || 0;
            this.addInput(paramName, paramType);
          }
        }
        if (returnType) {
          this.addOutput("out", returnType);
        }
        if (properties) {
          for (const key in properties) {
            this.addProperty(key, properties[key]);
          }
        }
      }

      onExecute() {
        const args = [];
        for (let i = 0; i < this.inputs.length; i++) {
          args.push(this.getInputData(i));
        }
        const result = func.apply(this, args);
        if (this.outputs && this.outputs.length) {
          this.setOutputData(0, result);
        }
      }
    }

    FunctionNode.desc = `Wrapper for ${name}`;
    LiteGraph.registerNodeType(name, FunctionNode);
  }

  /**
   * Clear all registered types
   */
  static clearRegisteredTypes() {
    LiteGraph.registered_node_types = {};
    LiteGraph.node_types_by_file_extension = {};
    LiteGraph.Nodes = {};
    LiteGraph.registered_slot_in_types = {};
    LiteGraph.registered_slot_out_types = {};
    LiteGraph.slot_types_in = [];
    LiteGraph.slot_types_out = [];
  }

  /**
   * Add a method to ALL registered node types
   */
  static addNodeMethod(name, func) {
    const LGraphNode = LiteGraphClass._LGraphNode;
    LGraphNode.prototype[name] = func;
    for (const i in LiteGraph.registered_node_types) {
      if (!LiteGraph.registered_node_types[i].prototype[name]) {
        LiteGraph.registered_node_types[i].prototype[name] = func;
      }
    }
  }

  /**
   * Factory: create a node instance by type string
   */
  static createNode(type) {
    const baseClass = LiteGraph.registered_node_types[type];
    if (!baseClass) {
      if (LiteGraph.debug) {
        console.log(`LiteGraph: node type "${type}" not registered.`);
      }
      return null;
    }
    const node = new baseClass();
    node.type = type;
    if (!node.title) node.title = type;
    if (LiteGraph.use_uuids) {
      node.id = uuidv4();
    }
    return node;
  }

  /**
   * Get a registered node class by type
   */
  static getNodeType(type) {
    return LiteGraph.registered_node_types[type];
  }

  /**
   * Get all node types in a category
   */
  static getNodeTypesInCategory(category, filter) {
    const r = [];
    for (const i in LiteGraph.registered_node_types) {
      const type = LiteGraph.registered_node_types[i];
      if (category === "") {
        if (type.category == null) r.push(type);
      } else if (type.category === category) {
        if (!filter || filter(type)) r.push(type);
      }
    }
    if (LiteGraph.auto_sort_node_types) {
      r.sort((a, b) => a.title.localeCompare(b.title));
    }
    return r;
  }

  /**
   * Get all node type categories
   */
  static getNodeTypesCategories() {
    const categories = { "": true };
    for (const i in LiteGraph.registered_node_types) {
      categories[LiteGraph.registered_node_types[i].category || ""] = true;
    }
    const result = Object.keys(categories);
    if (LiteGraph.auto_sort_node_types) {
      result.sort();
    }
    return result;
  }

  /**
   * Check if two slot types are compatible for connection
   */
  static isValidConnection(typeA, typeB) {
    if (
      typeA === "" ||
      typeB === "" ||
      typeA === typeB ||
      (typeA === LiteGraph.EVENT && typeB === LiteGraph.ACTION) ||
      (typeA === LiteGraph.ACTION && typeB === LiteGraph.EVENT)
    ) {
      return true;
    }
    // Enforce string comparison
    typeA = String(typeA);
    typeB = String(typeB);
    if (typeA.toLowerCase() === typeB.toLowerCase()) return true;

    // Check subtypes
    const baseA = typeA.split(",")[0];
    const baseB = typeB.split(",")[0];
    if (baseA === baseB) return true;

    return false;
  }

  /**
   * Register an extra entry in the search box
   */
  static registerSearchboxExtra(nodeType, description, data) {
    LiteGraph.searchbox_extras[nodeType] = {
      type: nodeType,
      description: description,
      data: data,
    };
  }

  /**
   * Fetch a file from URL or File/Blob
   */
  static async fetchFile(url, responseType) {
    if (!url) return null;
    responseType = responseType || "text";
    if (url.constructor === File || url.constructor === Blob) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(url);
      });
    }
    const response = await fetch(url);
    if (responseType === "json") {
      return response.json();
    }
    return response.text();
  }

  /**
   * Close all open context menus
   */
  static closeAllContextMenus(refWindow) {
    refWindow = refWindow || window;
    const elements = refWindow.document.querySelectorAll(".litecontextmenu");
    for (let i = 0; i < elements.length; i++) {
      elements[i].close();
    }
    // Also close panels
    const panels = refWindow.document.querySelectorAll(".litepanel");
    for (let i = 0; i < panels.length; i++) {
      panels[i].close();
    }
    const dialogs = refWindow.document.querySelectorAll(".litedialog");
    for (let i = 0; i < dialogs.length; i++) {
      dialogs[i].close();
    }
  }

  /**
   * Extend class (copy prototype properties)
   */
  static extendClass(target, origin) {
    for (const i in origin) {
      if (target[i] === undefined) {
        target[i] = origin[i];
      }
    }
  }

  // Internal reference to LGraphNode (set after class definition to avoid circular dependency)
  static _LGraphNode = null;
}

// Export as LiteGraph for convenience (maintains API compatibility)
const LiteGraph = LiteGraphClass;

export { LiteGraph, LiteGraphClass };
export default LiteGraph;
