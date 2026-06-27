/**
 * LLink - Represents a connection link between node slots
 * 
 * Refactored from a constructor function to ES6 class.
 * Original: function LLink(id, type, origin_id, origin_slot, target_id, target_slot)
 */

export class LLink {
  constructor(id, type, origin_id, origin_slot, target_id, target_slot) {
    this.id = id;
    this.type = type;
    this.origin_id = origin_id;
    this.origin_slot = origin_slot;
    this.target_id = target_id;
    this.target_slot = target_slot;
    this._data = null;
    this._pos = new Float32Array(2); // center position
  }

  /**
   * Configure this link from a serialized object or array
   */
  configure(o) {
    if (Array.isArray(o)) {
      this.id = o[0];
      this.origin_id = o[1];
      this.origin_slot = o[2];
      this.target_id = o[3];
      this.target_slot = o[4];
      this.type = o[5];
    } else if (o && typeof o === "object") {
      this.id = o.id;
      this.type = o.type;
      this.origin_id = o.origin_id;
      this.origin_slot = o.origin_slot;
      this.target_id = o.target_id;
      this.target_slot = o.target_slot;
    }
  }

  /**
   * Serialize this link to a compact array format
   */
  serialize() {
    return [
      this.id,
      this.origin_id,
      this.origin_slot,
      this.target_id,
      this.target_slot,
      this.type,
    ];
  }
}

// Lazy registration to avoid circular dependency issues
// LiteGraph.LLink will be set after all modules are loaded
export default LLink;
