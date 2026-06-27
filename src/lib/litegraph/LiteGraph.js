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
  // Match original default: "mouse" (use mouse for retrocompatibility).
  // The earlier refactored version changed this to "pointer" which broke
  // touch-device fallback in pointerListenerAdd when PointerEvent wasn't
  // available (older iOS Safari, etc.).
  static pointerevents_method = "mouse";
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
    if (LGraphNode) {
      if (!(baseClass.prototype instanceof LGraphNode)) {
        // Fallback: mixin for backward compatibility
        for (const i in LGraphNode.prototype) {
          if (baseClass.prototype[i] === undefined) {
            baseClass.prototype[i] = LGraphNode.prototype[i];
          }
        }
      }
    } else {
      // LGraphNode not yet registered - mixin will happen later via index.js
      // Store pending registration
      if (!LiteGraphClass._pendingRegistrations) {
        LiteGraphClass._pendingRegistrations = [];
      }
      LiteGraphClass._pendingRegistrations.push(baseClass);
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

      // Used to know which nodes to create when dragging files to the canvas.
      // Original nests this inside the hasOwnProperty("shape") guard.
      if (baseClass.supported_extensions) {
        for (let i = 0; i < baseClass.supported_extensions.length; i++) {
          const ext = baseClass.supported_extensions[i];
          if (ext && ext.constructor === String) {
            LiteGraph.node_types_by_file_extension[ext.toLowerCase()] = baseClass;
          }
        }
      }
    }

    LiteGraph.registered_node_types[type] = baseClass;
    if (classname) {
      LiteGraph.Nodes[classname] = baseClass;
    }

    // Restored original lifecycle callbacks
    if (LiteGraph.onNodeTypeRegistered) {
      LiteGraph.onNodeTypeRegistered(type, baseClass);
    }
    if (prev && LiteGraph.onNodeTypeReplaced) {
      LiteGraph.onNodeTypeReplaced(type, baseClass, prev);
    }

    // Warnings: original warns about legacy `onPropertyChange` method name.
    if (baseClass.prototype.onPropertyChange) {
      console.warn(
        "LiteGraph node class " +
          type +
          " has onPropertyChange method, it must be called onPropertyChanged with d at the end"
      );
    }

    // TODO one would want to know input and ouput :: this would allow through registerNodeAndSlotType to get all the slots types
    if (LiteGraph.auto_load_slot_types) {
      // Original creates an instance to force addInput/addOutput calls
      // which then register slot types via registerNodeAndSlotType.
      try {
        new baseClass(baseClass.title || "tmpnode");
      } catch (e) {
        /* ignore */
      }
    }
  }

  /**
   * Removes a node type from the system.
   * Restored original: accepts String OR Class; throws if not found.
   */
  static unregisterNodeType(type) {
    const baseClass =
      type && type.constructor === String
        ? LiteGraph.registered_node_types[type]
        : type;
    if (!baseClass) {
      throw "node type not found: " + type;
    }
    delete LiteGraph.registered_node_types[baseClass.type];
    if (baseClass.constructor && baseClass.constructor.name) {
      delete LiteGraph.Nodes[baseClass.constructor.name];
    }
    // Remove from file extensions
    if (baseClass.supported_extensions) {
      for (let i = 0; i < baseClass.supported_extensions.length; i++) {
        const ext = baseClass.supported_extensions[i];
        if (ext && ext.constructor === String) {
          delete LiteGraph.node_types_by_file_extension[ext.toLowerCase()];
        }
      }
    }
  }

  /**
   * Save a slot type and its node.
   * Restored original behaviour: default out=false (input direction),
   * EVENT/ACTION → "_event_" mapping, comma-split, toLowerCase + sort.
   */
  static registerNodeAndSlotType(type, slot_type, out) {
    out = out || false;
    const base_class =
      type && type.constructor === String &&
      LiteGraph.registered_node_types[type] !== "anonymous"
        ? LiteGraph.registered_node_types[type]
        : type;

    // Match original: `base_class.constructor.type` — for a class this is
    // the static `type` field set by registerNodeType.
    const class_type = (base_class && base_class.constructor && base_class.constructor.type) ||
                       (base_class && base_class.type) ||
                       (type && type.constructor === String ? type : type && type.name);

    let allTypes = [];
    if (typeof slot_type === "string") {
      allTypes = slot_type.split(",");
    } else if (slot_type === LiteGraph.EVENT || slot_type === LiteGraph.ACTION) {
      allTypes = ["_event_"];
    } else {
      allTypes = ["*"];
    }

    for (let i = 0; i < allTypes.length; ++i) {
      let slotType = allTypes[i];
      if (slotType === "") slotType = "*";
      const registerTo = out
        ? "registered_slot_out_types"
        : "registered_slot_in_types";
      if (LiteGraph[registerTo][slotType] === undefined) {
        LiteGraph[registerTo][slotType] = { nodes: [] };
      }
      if (!LiteGraph[registerTo][slotType].nodes.includes(class_type)) {
        LiteGraph[registerTo][slotType].nodes.push(class_type);
      }

      if (!out) {
        if (!LiteGraph.slot_types_in.includes(slotType.toLowerCase())) {
          LiteGraph.slot_types_in.push(slotType.toLowerCase());
          LiteGraph.slot_types_in.sort();
        }
      } else {
        if (!LiteGraph.slot_types_out.includes(slotType.toLowerCase())) {
          LiteGraph.slot_types_out.push(slotType.toLowerCase());
          LiteGraph.slot_types_out.sort();
        }
      }
    }
  }

  /**
   * Build a node class from a plain config object.
   * Restored original (name, object) signature and the Function()-based
   * constructor that calls addInput/addOutput/addProperty based on the
   * object's inputs/outputs/properties arrays. Also calls registerNodeType
   * and returns the class.
   */
  static buildNodeClassFromObject(name, object) {
    let ctor_code = "";
    if (object.inputs) {
      for (let i = 0; i < object.inputs.length; ++i) {
        const _name = object.inputs[i][0];
        let _type = object.inputs[i][1];
        if (_type && _type.constructor === String) _type = '"' + _type + '"';
        ctor_code += "this.addInput('" + _name + "'," + _type + ");\n";
      }
    }
    if (object.outputs) {
      for (let i = 0; i < object.outputs.length; ++i) {
        const _name = object.outputs[i][0];
        let _type = object.outputs[i][1];
        if (_type && _type.constructor === String) _type = '"' + _type + '"';
        ctor_code += "this.addOutput('" + _name + "'," + _type + ");\n";
      }
    }
    if (object.properties) {
      for (let i in object.properties) {
        let prop = object.properties[i];
        if (prop && prop.constructor === String) prop = '"' + prop + '"';
        ctor_code += "this.addProperty('" + i + "'," + prop + ");\n";
      }
    }
    ctor_code += "if(this.onCreate)this.onCreate()";
    // Use Function() ctor to match original behavior. In strict-mode ES6
    // modules the Function body runs in non-strict mode, so addInput/addOutput
    // (which expect `this` to be the instance) work correctly when bound via
    // .call(this) at instantiation time.
    const classobj = function () {
      // Evaluate ctor_code in this context
      // eslint-disable-next-line no-new-func
      new Function(ctor_code).call(this);
    };
    for (const i in object) {
      if (i !== "inputs" && i !== "outputs" && i !== "properties") {
        classobj.prototype[i] = object[i];
      }
    }
    classobj.title = object.title || name.split("/").pop();
    classobj.desc = object.desc || "Generated from object";
    // Make sure registerNodeType treats it like a class (needs .prototype)
    classobj.prototype.constructor = classobj;
    LiteGraph.registerNodeType(name, classobj);
    return classobj;
  }

  /**
   * Wrap a simple function as a node type.
   * Restored original signature: param_types is an array of type strings
   * (or null for no inputs); parameter names are auto-derived via
   * getParameterNames(func). Uses Function()-based ctor like the original.
   */
  static wrapFunctionAsNode(name, func, param_types, return_type, properties) {
    const params = Array(func.length);
    let code = "";
    if (param_types !== null) {
      // null means no inputs
      const names = getParameterNames(func);
      for (let i = 0; i < names.length; ++i) {
        let type = 0;
        if (param_types) {
          if (param_types[i] != null && param_types[i].constructor === String) {
            type = "'" + param_types[i] + "'";
          } else if (param_types[i] != null) {
            type = param_types[i];
          }
        }
        code += "this.addInput('" + names[i] + "'," + type + ");\n";
      }
    }
    if (return_type !== null) {
      // null means no output
      code +=
        "this.addOutput('out'," +
        (return_type != null
          ? return_type.constructor === String
            ? "'" + return_type + "'"
            : return_type
          : 0) +
        ");\n";
    }
    if (properties) {
      code += "this.properties = " + JSON.stringify(properties) + ";\n";
    }

    const classobj = function () {
      // eslint-disable-next-line no-new-func
      new Function(code).call(this);
    };
    classobj.title = name.split("/").pop();
    classobj.desc = "Generated from " + (func.name || "anonymous");
    classobj.prototype.onExecute = function onExecute() {
      for (let i = 0; i < params.length; ++i) {
        params[i] = this.getInputData(i);
      }
      const r = func.apply(this, params);
      this.setOutputData(0, r);
    };
    classobj.prototype.constructor = classobj;
    LiteGraph.registerNodeType(name, classobj);
    return classobj;
  }

  /**
   * Clear all registered types.
   * Restored original: also resets searchbox_extras (was dropped).
   */
  static clearRegisteredTypes() {
    LiteGraph.registered_node_types = {};
    LiteGraph.node_types_by_file_extension = {};
    LiteGraph.Nodes = {};
    LiteGraph.searchbox_extras = {};
  }

  /**
   * Reload nodes from a folder (used with external node definitions).
   * Scans for scripts and loads them to register new node types.
   */
  static reloadNodes(folder) {
    // In a module-based environment, this is typically a no-op
    // as node types are imported directly. Kept for API compatibility.
    if (LiteGraph.debug) {
      console.log("LiteGraph.reloadNodes: folder=" + folder);
    }
  }

  /**
   * Adds a method to ALL node types (existing + future via LGraphNode.prototype).
   * Restored original backup behavior: keeps the old method as `"_" + name`
   * before overwriting.
   */
  static addNodeMethod(name, func) {
    const LGraphNode = LiteGraphClass._LGraphNode;
    if (LGraphNode) {
      LGraphNode.prototype[name] = func;
    }
    for (const i in LiteGraph.registered_node_types) {
      const type = LiteGraph.registered_node_types[i];
      if (type.prototype[name]) {
        // Keep old in case of replacing
        type.prototype["_" + name] = type.prototype[name];
      }
      type.prototype[name] = func;
    }
  }

  /**
   * Factory: create a node instance by type string
   * Restored original signature `(type, title, options)` and the full set
   * of post-construction initialization (properties, flags, size, pos,
   * mode, options spread, onNodeCreated callback).
   */
  static createNode(type, title, options) {
    const baseClass = LiteGraph.registered_node_types[type];
    if (!baseClass) {
      if (LiteGraph.debug) {
        console.log(`LiteGraph: node type "${type}" not registered.`);
      }
      return null;
    }
    title = title || baseClass.title || type;

    let node = null;
    if (LiteGraph.catch_exceptions) {
      try {
        node = new baseClass(title);
      } catch (err) {
        console.error(err);
        return null;
      }
    } else {
      node = new baseClass(title);
    }

    node.type = type;
    if (!node.title && title) node.title = title;
    if (!node.properties) node.properties = {};
    if (!node.properties_info) node.properties_info = [];
    if (!node.flags) node.flags = {};
    if (!node.size) node.size = node.computeSize();
    if (!node.pos) node.pos = LiteGraph.DEFAULT_POSITION.concat();
    if (!node.mode) node.mode = LiteGraph.ALWAYS;

    if (options) {
      for (const i in options) {
        node[i] = options[i];
      }
    }

    if (LiteGraph.use_uuids) {
      node.id = uuidv4();
    }

    if (node.onNodeCreated) {
      node.onNodeCreated();
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
   * Get all node types in a category.
   * Restored original `filter` semantics: `filter` is a value compared
   * against each type's `.filter` property via `!=` (not a predicate).
   */
  static getNodeTypesInCategory(category, filter) {
    const r = [];
    for (const i in LiteGraph.registered_node_types) {
      const type = LiteGraph.registered_node_types[i];
      if (type.category == null) {
        if (category === "") r.push(type);
      } else if (category === type.category) {
        if (filter == null || type.filter == filter) r.push(type);
      }
    }
    if (LiteGraph.auto_sort_node_types) {
      r.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    return r;
  }

  /**
   * Get all node type categories.
   * Restored original behaviour: respects the per-type `skip_list` flag
   * and the value-equality `filter` parameter.
   */
  static getNodeTypesCategories(filter) {
    const categories = { "": 1 };
    for (const i in LiteGraph.registered_node_types) {
      const type = LiteGraph.registered_node_types[i];
      if (type.category && !type.skip_list) {
        if (type.filter != filter) continue;
        categories[type.category] = 1;
      }
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
    // Normalize "" / "*" to 0 (wildcard / any type). 0 already means any.
    if (typeA === "" || typeA === "*") typeA = 0;
    if (typeB === "" || typeB === "*") typeB = 0;
    // Wildcard short-circuit (covers 0, null, undefined).
    if (
      typeA === 0 || typeA === null || typeA === undefined ||
      typeB === 0 || typeB === null || typeB === undefined
    ) {
      return true;
    }

    if (
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

    // Multi-type slots: comma-separated type lists. A connection is valid
    // when ANY permutation of the two lists is itself valid. (Earlier
    // refactored versions only compared `split(",")[0]`, which silently
    // rejected overlapping multi-type slots like "string,number" vs
    // "number,float".)
    if (typeA.indexOf(",") !== -1 || typeB.indexOf(",") !== -1) {
      const supportedA = typeA.split(",");
      const supportedB = typeB.split(",");
      for (let i = 0; i < supportedA.length; ++i) {
        for (let j = 0; j < supportedB.length; ++j) {
          if (LiteGraph.isValidConnection(supportedA[i], supportedB[j])) {
            return true;
          }
        }
      }
      return false;
    }

    return false;
  }

  /**
   * Register an extra entry in the search box.
   * Restored original: storage key is description.toLowerCase(),
   * field name is `desc` (not `description`).
   */
  static registerSearchboxExtra(node_type, description, data) {
    LiteGraph.searchbox_extras[description.toLowerCase()] = {
      type: node_type,
      desc: description,
      data: data,
    };
  }

  /**
   * Wrapper to load files (from URL using fetch, or from File/Blob using FileReader).
   * Restored original (url, type, on_complete, on_error) signature with
   * full response-type support (text/arraybuffer/json/blob), proxy prefixing,
   * and FileReader branches for File/Blob inputs. Returns Promise (URL) or
   * FileReader (File/Blob).
   */
  static fetchFile(url, type, on_complete, on_error) {
    type = type || "text";
    if (!url) return null;

    if (url.constructor === String) {
      // Apply proxy if configured (e.g. for CORS workarounds).
      if (url.substr(0, 4) === "http" && LiteGraph.proxy) {
        url = LiteGraph.proxy + url.substr(url.indexOf(":") + 3);
      }
      return fetch(url)
        .then(function (response) {
          if (!response.ok) throw new Error("File not found");
          if (type === "arraybuffer") return response.arrayBuffer();
          else if (type === "text" || type === "string") return response.text();
          else if (type === "json") return response.json();
          else if (type === "blob") return response.blob();
        })
        .then(function (data) {
          if (on_complete) on_complete(data);
        })
        .catch(function (error) {
          console.error("error fetching file:", url);
          if (on_error) on_error(error);
        });
    } else if (url.constructor === File || url.constructor === Blob) {
      const reader = new FileReader();
      reader.onload = function (e) {
        let v = e.target.result;
        if (type === "json") v = JSON.parse(v);
        if (on_complete) on_complete(v);
      };
      if (type === "arraybuffer") return reader.readAsArrayBuffer(url);
      else if (type === "text" || type === "json") return reader.readAsText(url);
      else if (type === "blob") return reader.readAsBinaryString(url);
      return reader;
    }
    return null;
  }

  /**
   * Close all open context menus
   */
  static closeAllContextMenus(refWindow) {
    refWindow = refWindow || window;
    const elements = refWindow.document.querySelectorAll(".litecontextmenu");
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].close) elements[i].close();
      else if (elements[i].parentNode) elements[i].parentNode.removeChild(elements[i]);
    }
    // Also close panels
    const panels = refWindow.document.querySelectorAll(".litepanel");
    for (let i = 0; i < panels.length; i++) {
      if (panels[i].close) panels[i].close();
      else if (panels[i].parentNode) panels[i].parentNode.removeChild(panels[i]);
    }
    const dialogs = refWindow.document.querySelectorAll(".litedialog");
    for (let i = 0; i < dialogs.length; i++) {
      if (dialogs[i].close) dialogs[i].close();
      else if (dialogs[i].parentNode) dialogs[i].parentNode.removeChild(dialogs[i]);
    }
  }

  /**
   * Extend class (copy prototype properties)
   */
  static extendClass(target, origin) {
    // Copy own static properties from origin to target (skip ones target
    // already owns, mirroring the original `hasOwnProperty` guard).
    for (const i in origin) {
      if (target[i] === undefined) {
        target[i] = origin[i];
      }
    }
    // Copy prototype properties (including getters/setters) so subclassing
    // via `LiteGraph.extendClass(Sub, LGraphNode)` actually inherits methods.
    if (origin.prototype) {
      for (const i in origin.prototype) {
        if (!Object.prototype.hasOwnProperty.call(origin.prototype, i))
          continue;
        if (Object.prototype.hasOwnProperty.call(target.prototype, i))
          continue;
        const getter = origin.prototype.__lookupGetter__(i);
        const setter = origin.prototype.__lookupSetter__(i);
        if (getter) {
          target.prototype.__defineGetter__(i, getter);
        }
        if (setter) {
          target.prototype.__defineSetter__(i, setter);
        }
        if (!getter && !setter) {
          target.prototype[i] = origin.prototype[i];
        }
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
