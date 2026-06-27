/**
 * DragAndScale - Handles drag and scale (zoom) interactions for canvas elements
 *
 * Refactored from the original prototype-based constructor function to a proper ES6 class.
 * Provides pan (drag) and zoom (scale) functionality with mouse/pointer event handling.
 *
 * Original: function DragAndScale(element, skip_events) { ... }
 * Refactored: class DragAndScale
 */

import { LiteGraph } from "./LiteGraph.js";

class DragAndScale {
    /**
     * @param {HTMLElement} element - The DOM element (typically a canvas) to attach drag/scale behavior to
     */
    constructor(element) {
        /** @type {Float32Array} Pan offset [x, y] in canvas coordinates */
        this.offset = new Float32Array([0, 0]);

        /** @type {number} Current zoom scale factor */
        this.scale = 1;

        /** @type {number} Maximum allowed scale */
        this.max_scale = 10;

        /** @type {number} Minimum allowed scale */
        this.min_scale = 0.1;

        /** @type {Function|null} Callback invoked when a redraw is needed */
        this.onredraw = null;

        /** @type {boolean} Whether drag/scale interactions are enabled */
        this.enabled = true;

        /** @type {Float32Array} Last known mouse position [x, y] */
        this.last_mouse = new Float32Array([0, 0]);

        /** @type {HTMLElement|null} The bound DOM element */
        this.element = null;

        /** @type {Float32Array} Computed visible area [x, y, width, height] */
        this.visible_area = new Float32Array(4);

        if (element) {
            this.element = element;
            this.bindEvents(element);
        }
    }

    /**
     * Binds pointer and wheel event listeners to the given element.
     * Stores a bound reference to onMouse for later removal.
     *
     * @param {HTMLElement} element - The DOM element to bind events to
     */
    bindEvents(element) {
        this.last_mouse = new Float32Array(2);

        this._binded_mouse_callback = this.onMouse.bind(this);

        LiteGraph.pointerListenerAdd(element, "down", this._binded_mouse_callback);
        LiteGraph.pointerListenerAdd(element, "move", this._binded_mouse_callback);
        LiteGraph.pointerListenerAdd(element, "up", this._binded_mouse_callback);

        element.addEventListener(
            "mousewheel",
            this._binded_mouse_callback,
            false
        );
        element.addEventListener("wheel", this._binded_mouse_callback, false);
    }

    /**
     * Computes the visible area in canvas-space coordinates and stores it
     * in this.visible_area as [startx, starty, width, height].
     *
     * @param {Array<number>} [viewport] - Optional viewport rectangle [x, y, width, height]
     *   to restrict the visible area calculation to a sub-region of the element
     */
    computeVisibleArea(viewport) {
        if (!this.element) {
            this.visible_area[0] = this.visible_area[1] = this.visible_area[2] = this.visible_area[3] = 0;
            return;
        }

        let width = this.element.width;
        let height = this.element.height;
        let startx = -this.offset[0];
        let starty = -this.offset[1];

        if (viewport) {
            startx += viewport[0] / this.scale;
            starty += viewport[1] / this.scale;
            width = viewport[2];
            height = viewport[3];
        }

        const endx = startx + width / this.scale;
        const endy = starty + height / this.scale;

        this.visible_area[0] = startx;
        this.visible_area[1] = starty;
        this.visible_area[2] = endx - startx;
        this.visible_area[3] = endy - starty;
    }

    /**
     * Main mouse/pointer event handler. Handles:
     * - pointer down: starts dragging, moves listeners to document for capture
     * - pointer move: applies drag delta if dragging
     * - pointer up: stops dragging, restores listeners to canvas
     * - mousewheel/wheel: zooms in/out centered on cursor position
     *
     * @param {PointerEvent|WheelEvent|MouseEvent} e - The DOM event
     */
    onMouse(e) {
        if (!this.enabled) {
            return;
        }

        const canvas = this.element;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        e.canvasx = x;
        e.canvasy = y;
        e.dragging = this.dragging;

        const is_inside =
            !this.viewport ||
            (this.viewport &&
                x >= this.viewport[0] &&
                x < this.viewport[0] + this.viewport[2] &&
                y >= this.viewport[1] &&
                y < this.viewport[1] + this.viewport[3]);

        let ignore = false;
        if (this.onmouse) {
            ignore = this.onmouse(e);
        }

        if (e.type === LiteGraph.pointerevents_method + "down" && is_inside) {
            this.dragging = true;
            LiteGraph.pointerListenerRemove(canvas, "move", this._binded_mouse_callback);
            LiteGraph.pointerListenerAdd(document, "move", this._binded_mouse_callback);
            LiteGraph.pointerListenerAdd(document, "up", this._binded_mouse_callback);
        } else if (e.type === LiteGraph.pointerevents_method + "move") {
            if (!ignore) {
                const deltax = x - this.last_mouse[0];
                const deltay = y - this.last_mouse[1];
                if (this.dragging) {
                    this.mouseDrag(deltax, deltay);
                }
            }
        } else if (e.type === LiteGraph.pointerevents_method + "up") {
            this.dragging = false;
            LiteGraph.pointerListenerRemove(document, "move", this._binded_mouse_callback);
            LiteGraph.pointerListenerRemove(document, "up", this._binded_mouse_callback);
            LiteGraph.pointerListenerAdd(canvas, "move", this._binded_mouse_callback);
        } else if (
            is_inside &&
            (e.type === "mousewheel" ||
                e.type === "wheel" ||
                e.type === "DOMMouseScroll")
        ) {
            e.eventType = "mousewheel";
            if (e.type === "wheel") {
                e.wheel = -e.deltaY;
            } else {
                e.wheel =
                    e.wheelDeltaY != null ? e.wheelDeltaY : e.detail * -60;
            }

            // From stack overflow
            e.delta = e.wheelDelta
                ? e.wheelDelta / 40
                : e.deltaY
                    ? -e.deltaY / 3
                    : 0;

            this.changeDeltaScale(1.0 + e.delta * 0.05);
        }

        this.last_mouse[0] = x;
        this.last_mouse[1] = y;

        if (is_inside) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    /**
     * Applies the current scale and offset to a canvas 2D rendering context.
     * Call this before drawing to set up the correct transform.
     *
     * @param {CanvasRenderingContext2D} ctx - The canvas rendering context to transform
     */
    toCanvasContext(ctx) {
        ctx.scale(this.scale, this.scale);
        ctx.translate(this.offset[0], this.offset[1]);
    }

    /**
     * Converts a position from offset-space to canvas-space.
     *
     * @param {Array<number>|Float32Array} pos - Position in offset-space [x, y]
     * @returns {number[]} Position in canvas-space [x, y]
     */
    convertOffsetToCanvas(pos) {
        return [
            (pos[0] + this.offset[0]) * this.scale,
            (pos[1] + this.offset[1]) * this.scale
        ];
    }

    /**
     * Converts a position from canvas-space to offset-space.
     *
     * @param {Array<number>|Float32Array} pos - Position in canvas-space [x, y]
     * @param {Array<number>} [out] - Optional output array to reuse (avoids allocation)
     * @returns {Array<number>} Position in offset-space [x, y]
     */
    convertCanvasToOffset(pos, out) {
        out = out || [0, 0];
        out[0] = pos[0] / this.scale - this.offset[0];
        out[1] = pos[1] / this.scale - this.offset[1];
        return out;
    }

    /**
     * Applies a drag delta to the current offset, scaled by the inverse of the current scale.
     * Invokes the onredraw callback if defined.
     *
     * @param {number} x - Horizontal drag delta in pixels
     * @param {number} y - Vertical drag delta in pixels
     */
    mouseDrag(x, y) {
        this.offset[0] += x / this.scale;
        this.offset[1] += y / this.scale;

        if (this.onredraw) {
            this.onredraw(this);
        }
    }

    /**
     * Changes the scale to the given value, clamped between min_scale and max_scale.
     * Adjusts the offset so that the zooming_center point remains stationary
     * in canvas-space after the scale change.
     *
     * @param {number} value - The new scale value
     * @param {Array<number>} [zooming_center] - The point in canvas-space that should
     *   remain fixed after zooming. Defaults to the center of the element.
     */
    changeScale(value, zooming_center) {
        if (value < this.min_scale) {
            value = this.min_scale;
        } else if (value > this.max_scale) {
            value = this.max_scale;
        }

        if (value === this.scale) {
            return;
        }

        if (!this.element) {
            return;
        }

        const rect = this.element.getBoundingClientRect();
        if (!rect) {
            return;
        }

        zooming_center = zooming_center || [
            rect.width * 0.5,
            rect.height * 0.5
        ];

        const center = this.convertCanvasToOffset(zooming_center);
        this.scale = value;

        if (Math.abs(this.scale - 1) < 0.01) {
            this.scale = 1;
        }

        const new_center = this.convertCanvasToOffset(zooming_center);
        const delta_offset = [
            new_center[0] - center[0],
            new_center[1] - center[1]
        ];

        this.offset[0] += delta_offset[0];
        this.offset[1] += delta_offset[1];

        if (this.onredraw) {
            this.onredraw(this);
        }
    }

    /**
     * Changes the scale by a multiplicative delta, relative to the current scale.
     *
     * @param {number} value - The scale multiplier (e.g., 1.1 for 10% zoom in)
     * @param {Array<number>} [zooming_center] - The point that should remain fixed
     *   after zooming. Passed through to changeScale.
     */
    changeDeltaScale(value, zooming_center) {
        this.changeScale(this.scale * value, zooming_center);
    }

    /**
     * Resets the scale to 1 and the offset to [0, 0].
     */
    reset() {
        this.scale = 1;
        this.offset[0] = 0;
        this.offset[1] = 0;
    }
}

export { DragAndScale };
export default DragAndScale;
