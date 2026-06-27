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
import { cloneObject, uuidv4 } from "./utils.js";

class LGraphNode {
  constructor(title) {
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

    // Rendering/execution state
    this._shape = null;
    this._waiting_actions = [];
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

    // Restore widget values
    if (this.widgets) {
      for (let i = 0; i < this.widgets.length; ++i) {
        const w = this.widgets[i];
        if (!w) continue;
        if (w.options && w.options.property && this.properties[w.options.property] !== undefined) {
          w.value = JSON.parse(JSON.stringify(this.properties[w.options.property]));
        }
      }
      if (info.widgets_values) {
        for (let i = 0; i < info.widgets_values.length; ++i) {
          if (this.widgets[i]) {
            this.widgets[i].value = info.widgets_values[i];
          }
        }
      }
    }

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

    if (this.widgets && this.serialize_widgets) {
      o.widgets_values = [];
      for (let i = 0; i < this.widgets.length; ++i) {
        o.widgets_values[i] = this.widgets[i] ? this.widgets[i].value : null;
      }
    }

    if (!o.type) {
      o.type = this.constructor.type;
    }

    if (this.onSerialize) {
      this.onSerialize(o);
    }

    return o;
  }

  // ===================== CLONE =====================

  clone() {
    const cloned = LiteGraph.createNode(this.type);
    if (!cloned) return null;
    const data = this.serialize();
    delete data.id;
    cloned.configure(data);
    return cloned;
  }

  toString() {
    return `[LGraphNode(${this.title})]`;
  }

  // ===================== PROPERTIES =====================

  getTitle() {
    return this.title || this.constructor.title;
  }

  setProperty(name, value) {
    this.properties[name] = value;
    if (this.onPropertyChanged) {
      this.onPropertyChanged(name, value);
    }
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

  getPropertyInfo(name) {
    let info = null;
    if (this.properties_info) {
      for (let i = 0; i < this.properties_info.length; ++i) {
        if (this.properties_info[i].name === name) {
          info = this.properties_info[i];
          break;
        }
      }
    }
    return info;
  }

  // ===================== DATA FLOW =====================

  setOutputData(slot, data) {
    if (!this.outputs) return;
    if (slot >= 0 && slot < this.outputs.length) {
      this.outputs[slot]._data = data;
    }
  }

  setOutputDataType(slot, type) {
    if (!this.outputs) return;
    if (slot >= 0 && slot < this.outputs.length) {
      this.outputs[slot]._type = type;
    }
  }

  getInputData(slot) {
    if (!this.inputs) return undefined;
    if (slot >= 0 && slot < this.inputs.length) {
      const input = this.inputs[slot];
      if (!input) return null;
      const linkId = input.link;
      if (linkId != null) {
        const link = this.graph ? this.graph.links[linkId] : null;
        if (link) {
          return link._data;
        }
      }
    }
    return null;
  }

  getInputDataType(slot) {
    if (!this.inputs) return null;
    if (slot >= 0 && slot < this.inputs.length) {
      const input = this.inputs[slot];
      if (!input) return null;
      const linkId = input.link;
      if (linkId != null) {
        const link = this.graph ? this.graph.links[linkId] : null;
        if (link) {
          return link.type;
        }
      }
      return input.type;
    }
    return null;
  }

  getInputDataByName(name) {
    if (!this.inputs) return null;
    for (let i = 0; i < this.inputs.length; ++i) {
      if (name === this.inputs[i].name) {
        return this.getInputData(i);
      }
    }
    return null;
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
    const o = { name: name, type: type || 0, link: null };
    if (extraInfo) {
      for (const i in extraInfo) o[i] = extraInfo[i];
    }
    if (!this.inputs) this.inputs = [];
    this.inputs.push(o);
    this.setSize(this.computeSize());
    if (this.onInputAdded) this.onInputAdded(o);
    return o;
  }

  addInputs(list) {
    for (let i = 0; i < list.length; ++i) {
      const input = list[i];
      const o = { name: input.name, type: input.type, link: null };
      if (input.extraInfo) {
        for (const j in input.extraInfo) o[j] = input.extraInfo[j];
      }
      this.inputs.push(o);
      if (this.onInputAdded) this.onInputAdded(o);
    }
    this.setSize(this.computeSize());
  }

  removeInput(slot) {
    this.disconnectInput(slot);
    const input = this.inputs.splice(slot, 1)[0];
    this.setSize(this.computeSize());
    if (this.onInputRemoved) this.onInputRemoved(input, slot);
    return input;
  }

  addOutput(name, type, extraInfo) {
    const o = { name: name, type: type || 0, links: null };
    if (extraInfo) {
      for (const i in extraInfo) o[i] = extraInfo[i];
    }
    if (!this.outputs) this.outputs = [];
    this.outputs.push(o);
    this.setSize(this.computeSize());
    if (this.onOutputAdded) this.onOutputAdded(o);
    return o;
  }

  addOutputs(list) {
    for (let i = 0; i < list.length; ++i) {
      const output = list[i];
      const o = { name: output.name, type: output.type, links: null };
      if (output.extraInfo) {
        for (const j in output.extraInfo) o[j] = output.extraInfo[j];
      }
      this.outputs.push(o);
      if (this.onOutputAdded) this.onOutputAdded(o);
    }
    this.setSize(this.computeSize());
  }

  removeOutput(slot) {
    this.disconnectOutput(slot);
    const output = this.outputs.splice(slot, 1)[0];
    this.setSize(this.computeSize());
    if (this.onOutputRemoved) this.onOutputRemoved(output, slot);
    return output;
  }

  // ===================== CONNECTION =====================

  /**
   * Connect an output slot of this node to an input slot of another node.
   * This is one of the most important methods in the graph system.
   */
  connect(outputSlot, targetNode, inputSlot) {
    inputSlot = inputSlot || 0;

    if (!targetNode || targetNode === this) {
      return false;
    }

    if (outputSlot < 0 || outputSlot >= this.outputs.length) {
      return false;
    }

    if (inputSlot < 0 || inputSlot >= targetNode.inputs.length) {
      return false;
    }

    const output = this.outputs[outputSlot];
    const input = targetNode.inputs[inputSlot];

    // Check if already connected
    if (input.link != null) {
      // Disconnect existing link
      if (this.graph) {
        this.graph.removeLink(input.link);
      }
    }

    // Check type compatibility
    if (!LiteGraph.isValidConnection(output.type, input.type)) {
      return false;
    }

    // Check callbacks
    if (targetNode.onConnectInput) {
      if (targetNode.onConnectInput(inputSlot, output.type, output, this, outputSlot) === false) {
        return false;
      }
    }

    if (this.onConnectOutput) {
      if (this.onConnectOutput(outputSlot, input.type, input, targetNode, inputSlot) === false) {
        return false;
      }
    }

    // Create link
    const linkId = this.graph ? this.graph.last_link_id++ : 0;
    const LLink = LiteGraph._LLink || (this.graph && this.graph._LLink);
    const link = LLink
      ? new LLink(linkId, input.type, this.id, outputSlot, targetNode.id, inputSlot)
      : { id: linkId, type: input.type, origin_id: this.id, origin_slot: outputSlot, target_id: targetNode.id, target_slot: inputSlot, _data: null, _pos: new Float32Array(2) };

    // Update output links
    if (!output.links) output.links = [];
    output.links.push(link.id);

    // Update input link
    input.link = link.id;

    // Add to graph
    if (this.graph) {
      this.graph.links[link.id] = link;
      this.graph._version++;
    }

    // Set graph reference
    if (targetNode.graph !== this.graph) {
      // Cross-graph connection not supported
      return false;
    }

    // Notify
    if (targetNode.onConnectionsChange) {
      targetNode.onConnectionsChange(LiteGraph.INPUT, inputSlot, true, link, input);
    }
    if (this.onConnectionsChange) {
      this.onConnectionsChange(LiteGraph.OUTPUT, outputSlot, true, link, output);
    }

    if (this.graph) {
      this.graph.updateExecutionOrder();
      this.graph.setDirtyCanvas(true, true);
    }

    return true;
  }

  /**
   * Connect by type - find a compatible slot
   */
  connectByType(outputSlot, targetNode, targetType) {
    if (!targetNode) return false;
    const inputSlot = targetNode.findInputSlotByType(targetType);
    if (inputSlot === -1) return false;
    return this.connect(outputSlot, targetNode, inputSlot);
  }

  connectByTypeOutput(inputSlot, sourceNode, sourceType) {
    if (!sourceNode) return false;
    const outputSlot = sourceNode.findOutputSlotByType(sourceType);
    if (outputSlot === -1) return false;
    return sourceNode.connect(outputSlot, this, inputSlot);
  }

  /**
   * Disconnect an output slot
   */
  disconnectOutput(slot, targetNode) {
    if (!this.outputs || slot < 0 || slot >= this.outputs.length) return false;
    const output = this.outputs[slot];
    if (!output.links || output.links.length === 0) return false;

    if (targetNode) {
      // Disconnect from specific target
      for (let i = 0; i < output.links.length; i++) {
        const linkId = output.links[i];
        const link = this.graph ? this.graph.links[linkId] : null;
        if (!link) continue;
        if (link.target_id === targetNode.id) {
          output.links.splice(i, 1);
          const targetInput = targetNode.inputs[link.target_slot];
          if (targetInput) targetInput.link = null;
          delete this.graph.links[linkId];
          if (targetNode.onConnectionsChange) {
            targetNode.onConnectionsChange(LiteGraph.INPUT, link.target_slot, false, link, targetInput);
          }
          if (this.onConnectionsChange) {
            this.onConnectionsChange(LiteGraph.OUTPUT, slot, false, link, output);
          }
          if (this.graph) {
            this.graph.updateExecutionOrder();
            this.graph.setDirtyCanvas(true, true);
          }
          return true;
        }
      }
    } else {
      // Disconnect all from this output
      const removedLinks = [];
      for (let i = output.links.length - 1; i >= 0; i--) {
        const linkId = output.links[i];
        const link = this.graph ? this.graph.links[linkId] : null;
        if (!link) continue;
        const targetNode2 = this.graph.getNodeById(link.target_id);
        if (targetNode2) {
          const targetInput = targetNode2.inputs[link.target_slot];
          if (targetInput) targetInput.link = null;
          if (targetNode2.onConnectionsChange) {
            targetNode2.onConnectionsChange(LiteGraph.INPUT, link.target_slot, false, link, targetInput);
          }
        }
        delete this.graph.links[linkId];
        removedLinks.push(link);
      }
      output.links = null;
      for (const link of removedLinks) {
        if (this.onConnectionsChange) {
          this.onConnectionsChange(LiteGraph.OUTPUT, slot, false, link, output);
        }
      }
      if (this.graph) {
        this.graph.updateExecutionOrder();
        this.graph.setDirtyCanvas(true, true);
      }
      return true;
    }
    return false;
  }

  /**
   * Disconnect an input slot
   */
  disconnectInput(slot) {
    if (!this.inputs || slot < 0 || slot >= this.inputs.length) return false;
    const input = this.inputs[slot];
    if (input.link == null) return false;

    const linkId = input.link;
    const link = this.graph ? this.graph.links[linkId] : null;
    input.link = null;

    if (link) {
      const originNode = this.graph.getNodeById(link.origin_id);
      if (originNode) {
        const output = originNode.outputs[link.origin_slot];
        if (output && output.links) {
          const idx = output.links.indexOf(linkId);
          if (idx !== -1) output.links.splice(idx, 1);
          if (output.links.length === 0) output.links = null;
        }
        if (originNode.onConnectionsChange) {
          originNode.onConnectionsChange(LiteGraph.OUTPUT, link.origin_slot, false, link, output);
        }
      }
      delete this.graph.links[linkId];
    }

    if (this.onConnectionsChange) {
      this.onConnectionsChange(LiteGraph.INPUT, slot, false, link, input);
    }

    if (this.graph) {
      this.graph.updateExecutionOrder();
      this.graph.setDirtyCanvas(true, true);
    }

    return true;
  }

  // ===================== CONNECTION POSITION =====================

  getConnectionPos(isInput, slotNumber, out) {
    out = out || new Float32Array(2);
    const numSlots = isInput ? this.inputs.length : this.outputs.length;

    if (this.flags.collapsed) {
      const w = LiteGraph.NODE_COLLAPSED_WIDTH;
      if (isInput) {
        out[0] = this.pos[0];
        out[1] = this.pos[1] + LiteGraph.NODE_TITLE_HEIGHT * 0.5;
      } else {
        out[0] = this.pos[0] + w;
        out[1] = this.pos[1] + LiteGraph.NODE_TITLE_HEIGHT * 0.5;
      }
      return out;
    }

    // Compute slot position
    if (slotNumber >= numSlots) {
      out[0] = this.pos[0] + this.size[0] * 0.5;
      out[1] = this.pos[1] + this.size[1] * 0.5;
      return out;
    }

    const slot = isInput ? this.inputs[slotNumber] : this.outputs[slotNumber];
    if (!slot) {
      out[0] = this.pos[0] + this.size[0] * 0.5;
      out[1] = this.pos[1] + this.size[1] * 0.5;
      return out;
    }

    // Compute y position
    let y = this.pos[1] + LiteGraph.NODE_TITLE_HEIGHT;
    let currentSlot = 0;
    for (let i = 0; i < slotNumber; ++i) {
      const s = isInput ? this.inputs[i] : this.outputs[i];
      if (!s) continue;
      currentSlot++;
    }
    y += currentSlot * LiteGraph.NODE_SLOT_HEIGHT + LiteGraph.NODE_SLOT_HEIGHT * 0.5;

    if (isInput) {
      out[0] = this.pos[0];
    } else {
      out[0] = this.pos[0] + this.size[0];
    }
    out[1] = y;

    return out;
  }

  // ===================== SLOT SEARCH =====================

  findInputSlot(name) {
    if (!this.inputs) return -1;
    for (let i = 0; i < this.inputs.length; ++i) {
      if (name === this.inputs[i].name) return i;
    }
    return -1;
  }

  findOutputSlot(name) {
    if (!this.outputs) return -1;
    for (let i = 0; i < this.outputs.length; ++i) {
      if (name === this.outputs[i].name) return i;
    }
    return -1;
  }

  findInputSlotFree({ typePref } = {}) {
    if (!this.inputs) return -1;
    for (let i = 0; i < this.inputs.length; ++i) {
      if (this.inputs[i].link == null) return i;
    }
    return -1;
  }

  findOutputSlotFree({ typePref } = {}) {
    if (!this.outputs) return -1;
    for (let i = 0; i < this.outputs.length; ++i) {
      if (!this.outputs[i].links || this.outputs[i].links.length === 0) return i;
    }
    return -1;
  }

  findInputSlotByType(type) {
    if (!this.inputs) return -1;
    for (let i = 0; i < this.inputs.length; ++i) {
      if (this.inputs[i].type === type && this.inputs[i].link == null) return i;
      if (LiteGraph.isValidConnection(type, this.inputs[i].type) && this.inputs[i].link == null) return i;
    }
    return -1;
  }

  findOutputSlotByType(type) {
    if (!this.outputs) return -1;
    for (let i = 0; i < this.outputs.length; ++i) {
      if (this.outputs[i].type === type && (!this.outputs[i].links || this.outputs[i].links.length === 0)) return i;
      if (LiteGraph.isValidConnection(type, this.outputs[i].type) && (!this.outputs[i].links || this.outputs[i].links.length === 0)) return i;
    }
    return -1;
  }

  findSlotByType(inputOrOutput, type) {
    if (inputOrOutput === LiteGraph.INPUT) return this.findInputSlotByType(type);
    if (inputOrOutput === LiteGraph.OUTPUT) return this.findOutputSlotByType(type);
    return -1;
  }

  // ===================== SIZE & LAYOUT =====================

  setSize(size) {
    this.size = size;
    if (this.onResize) this.onResize(size);
  }

  computeSize(out) {
    out = out || [0, 0];
    let rows = Math.max(
      this.inputs ? this.inputs.length : 0,
      this.outputs ? this.outputs.length : 0
    );
    let sizeX = LiteGraph.NODE_WIDTH;
    if (this.widgets && this.widgets.length) {
      rows = Math.max(rows, this.widgets.length);
      for (let i = 0; i < this.widgets.length; ++i) {
        const w = this.widgets[i];
        if (w && w.width) {
          sizeX = Math.max(sizeX, w.width);
        }
      }
    }
    // Title width
    if (this.title) {
      const titleWidth = this.title.length * 8 + 20;
      sizeX = Math.max(sizeX, titleWidth);
    }
    out[0] = Math.max(sizeX, LiteGraph.NODE_MIN_WIDTH);
    out[1] = Math.max(
      rows * LiteGraph.NODE_SLOT_HEIGHT + LiteGraph.NODE_TITLE_HEIGHT,
      LiteGraph.NODE_MIN_WIDTH
    );
    return out;
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

  isPointInside(x, y, margin) {
    margin = margin || 0;
    const marginTop = LiteGraph.NODE_TITLE_HEIGHT;
    return (
      x >= this.pos[0] - margin &&
      x < this.pos[0] + this.size[0] + margin &&
      y >= this.pos[1] - marginTop - margin &&
      y < this.pos[1] + this.size[1] + margin
    );
  }

  getSlotInPosition(x, y) {
    // Find which slot is at this position
    const slotPos = new Float32Array(2);
    if (this.inputs) {
      for (let i = 0; i < this.inputs.length; ++i) {
        this.getConnectionPos(true, i, slotPos);
        if (Math.abs(x - slotPos[0]) < 10 && Math.abs(y - slotPos[1]) < 10) {
          return { input: this.inputs[i], slot: i, linkPos: slotPos };
        }
      }
    }
    if (this.outputs) {
      for (let i = 0; i < this.outputs.length; ++i) {
        this.getConnectionPos(false, i, slotPos);
        if (Math.abs(x - slotPos[0]) < 10 && Math.abs(y - slotPos[1]) < 10) {
          return { output: this.outputs[i], slot: i, linkPos: slotPos };
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

  addWidget(type, name, value, callback, options) {
    if (!this.widgets) this.widgets = [];
    const w = {
      type: type,
      name: name,
      value: value,
      callback: callback,
      options: options || {},
    };
    this.widgets.push(w);
    this.setSize(this.computeSize());
    return w;
  }

  addCustomWidget(customWidget) {
    if (!this.widgets) this.widgets = [];
    this.widgets.push(customWidget);
    return customWidget;
  }

  // ===================== EVENT/TRIGGER =====================

  addOnTriggerInput() {
    const trigSlot = this.findInputSlot("onTrigger");
    if (trigSlot !== -1) return trigSlot;
    return this.addInput("onTrigger", LiteGraph.EVENT);
  }

  addOnExecutedOutput() {
    const execSlot = this.findOutputSlot("onExecuted");
    if (execSlot !== -1) return execSlot;
    return this.addOutput("onExecuted", LiteGraph.EVENT);
  }

  onAfterExecuteNode() {
    if (this._triggerExecuted) {
      this._triggerExecuted = false;
      this.triggerSlot(0);
    }
  }

  changeMode(mode) {
    if (mode === undefined) return;
    this.mode = mode;
    if (mode === LiteGraph.ALWAYS) {
      delete this._serializable;
    } else {
      this._serializable = true;
    }
    if (this.onModeChange) this.onModeChange(mode);
  }

  doExecute(params) {
    if (this.onExecute) {
      if (LiteGraph.catch_exceptions) {
        try {
          this.onExecute(params);
        } catch (err) {
          console.error(`Error executing node "${this.title}":`, err);
          if (LiteGraph.throw_errors) throw err;
        }
      } else {
        this.onExecute(params);
      }
    }
    if (this.onAfterExecuteNode) this.onAfterExecuteNode();
  }

  executePendingActions() {
    if (!this._waiting_actions || !this._waiting_actions.length) return;
    for (let i = 0; i < this._waiting_actions.length; i++) {
      const action = this._waiting_actions[i];
      if (this.onAction) {
        this.onAction(action.name, action.data);
      }
    }
    this._waiting_actions = [];
  }

  actionDo(actionName, data) {
    if (LiteGraph.use_deferred_actions) {
      if (!this._waiting_actions) this._waiting_actions = [];
      this._waiting_actions.push({ name: actionName, data: data });
    } else if (this.onAction) {
      this.onAction(actionName, data);
    }
  }

  trigger(action, param) {
    if (!this.outputs || !this.outputs.length) return;
    for (let i = 0; i < this.outputs.length; ++i) {
      const output = this.outputs[i];
      if (!output || output.type !== LiteGraph.EVENT || output.name !== action) continue;
      this.triggerSlot(i, param);
    }
  }

  triggerSlot(slot, param) {
    if (!this.outputs) return;
    const output = this.outputs[slot];
    if (!output) return;
    if (!output.links) return;

    for (let i = 0; i < output.links.length; i++) {
      const linkId = output.links[i];
      if (!this.graph) continue;
      const link = this.graph.links[linkId];
      if (!link) continue;

      const targetNode = this.graph.getNodeById(link.target_id);
      if (!targetNode) continue;

      param = param || {};

      // Event triggered
      if (!targetNode.onAction) continue;

      if (LiteGraph.use_deferred_actions) {
        targetNode.actionDo(output.name, param);
      } else {
        targetNode.onAction(output.name, param);
      }
    }
  }

  clearTriggeredSlots() {
    if (!this.outputs) return;
    for (let i = 0; i < this.outputs.length; ++i) {
      this.outputs[i]._triggered = false;
    }
  }

  // ===================== MISC =====================

  addConnection(name, type, direction) {
    if (direction === LiteGraph.INPUT) {
      this.addInput(name, type);
    } else {
      this.addOutput(name, type);
    }
  }

  setDirtyCanvas(fg, bg) {
    if (this.graph) {
      this.graph.sendActionToCanvas("setDirty", [fg, bg]);
    }
  }

  loadImage(url) {
    const img = new Image();
    img.src = LiteGraph.node_images_path + url;
    img.loading = "eager";
    return img;
  }

  trace(msg) {
    if (this.graph) {
      this.graph.onNodeTrace(this, msg);
    } else {
      console.log(msg);
    }
  }

  captureInput(v) {
    if (this.graph) {
      this.graph.sendActionToCanvas("captureInput", [v]);
    }
  }

  collapse(v) {
    if (v !== undefined) {
      if (!this.flags) this.flags = {};
      this.flags.collapsed = v;
    } else {
      this.flags.collapsed = !this.flags.collapsed;
    }
    this.setSize(this.computeSize());
    this.setDirtyCanvas(true, true);
  }

  pin(v) {
    if (v !== undefined) {
      if (!this.flags) this.flags = {};
      this.flags.pinned = v;
    } else {
      this.flags.pinned = !this.flags.pinned;
    }
    this.setDirtyCanvas(true);
  }

  localToScreen(x, y, graphCanvas) {
    return [
      (x + this.pos[0]) * graphCanvas.ds.scale + graphCanvas.ds.offset[0],
      (y + this.pos[1]) * graphCanvas.ds.scale + graphCanvas.ds.offset[1],
    ];
  }
}

// Lazy registration to avoid circular dependency issues
// LiteGraph._LGraphNode will be set after all modules are loaded

export { LGraphNode };
export default LGraphNode;
