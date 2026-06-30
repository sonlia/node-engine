/**
 * LGraphCanvas - ES6 Class Refactoring
 *
 * The core visual component for rendering and interacting with a node graph.
 * Handles canvas drawing, mouse/keyboard interaction, selection, connection
 * rendering, context menus, search boxes, and subgraph navigation.
 *
 * Original: prototype-based constructor in litegraph.js (lines 5325-13556)
 * Refactored: ES6 class with static properties and methods
 */

import { LiteGraph } from "./LiteGraph.js";
import { DragAndScale } from "./DragAndScale.js";
import { LGraphGroup } from "./LGraphGroup.js";
import {
    clamp,
    distance,
    isInsideRectangle,
    overlapBounding,
    getTime,
    pointerListenerAdd,
    pointerListenerRemove,
} from "./utils.js";

// Temp arrays reused during rendering to avoid GC pressure
const temp_vec2 = new Float32Array(2);
const tmp_area = new Float32Array(4);
const margin_area = new Float32Array(4);

/**
 * Get the mouse button from an event.
 * PointerEvent may not set e.which, so we fall back to e.button.
 * Returns: 1=left, 2=middle, 3=right
 */
function getMouseButton(e) {
    if (e.which !== undefined && e.which !== 0) return e.which;
    // e.button: 0=left, 1=middle, 2=right
    if (e.button === 0) return 1;
    if (e.button === 1) return 2;
    if (e.button === 2) return 3;
    return 0;
}
const link_bounding = new Float32Array(4);
const tempA = new Float32Array(2);
const tempB = new Float32Array(2);
const temp = new Float32Array(4);

class LGraphCanvas {
    // ==================== STATIC PROPERTIES ====================

    static DEFAULT_BACKGROUND_IMAGE =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAQBJREFUeNrs1rEKwjAUhlETUkj3vP9rdmr1Ysammk2w5wdxuLgcMHyptfawuZX4pJSWZTnfnu/lnIe/jNNxHHGNn//HNbbv+4dr6V+11uF527arU7+u63qfa/bnmh8sWLBgwYJlqRf8MEptXPBXJXa37BSl3ixYsGDBMliwFLyCV/DeLIMFCxYsWLBMwSt4Be/NggXLYMGCBUvBK3iNruC9WbBgwYJlsGApeAWv4L1ZBgsWLFiwYJmCV/AK3psFC5bBggULloJX8BpdwXuzYMGCBctgwVLwCl7Be7MMFixYsGDBsu8FH1FaSmExVfAxBa/gvVmwYMGCZbBg/W4vAQYA5tRF9QYlv/QAAAAASUVORK5CYII=";

    static link_type_colors = {
        number: "#AAA",
        node: "#DCA",
    };

    static gradients = {}; // cache of gradients

    static node_colors = {
        red: { color: "#322", bgcolor: "#533", groupcolor: "#A88" },
        brown: { color: "#332922", bgcolor: "#593930", groupcolor: "#b06634" },
        green: { color: "#232", bgcolor: "#353", groupcolor: "#8A8" },
        blue: { color: "#223", bgcolor: "#335", groupcolor: "#88A" },
        pale_blue: { color: "#2a363b", bgcolor: "#3f5159", groupcolor: "#3f789e" },
        cyan: { color: "#233", bgcolor: "#355", groupcolor: "#8AA" },
        purple: { color: "#323", bgcolor: "#535", groupcolor: "#a1309b" },
        yellow: { color: "#432", bgcolor: "#653", groupcolor: "#b58b2a" },
        black: { color: "#222", bgcolor: "#000", groupcolor: "#444" },
    };

    static active_canvas = null;
    static active_node = null;
    static search_limit = -1;

    // ==================== CONSTRUCTOR ====================

    /**
     * @param {HTMLCanvasElement|string} canvas - The canvas element or selector
     * @param {LGraph} [graph] - Optional graph to attach
     * @param {Object} [options] - { skip_rendering, autoresize, viewport }
     */
    constructor(canvas, graph, options) {
        this.options = (options = options || {});

        this.background_image = LGraphCanvas.DEFAULT_BACKGROUND_IMAGE;

        if (canvas && canvas.constructor === String) {
            canvas = document.querySelector(canvas);
        }

        this.ds = new DragAndScale();
        this.zoom_modify_alpha = true; // otherwise it generates ugly patterns when scaling down too much

        this.title_text_font = "" + LiteGraph.NODE_TEXT_SIZE + "px Arial";
        this.inner_text_font =
            "normal " + LiteGraph.NODE_SUBTEXT_SIZE + "px Arial";
        this.node_title_color = LiteGraph.NODE_TITLE_COLOR;
        this.default_link_color = LiteGraph.LINK_COLOR;
        this.default_connection_color = {
            input_off: "#778",
            input_on: "#7F7",
            output_off: "#778",
            output_on: "#7F7",
        };
        this.default_connection_color_byType = {};
        this.default_connection_color_byTypeOff = {};

        // Rendering flags
        this.highquality_render = true;
        this.use_gradients = false;
        this.editor_alpha = 1;
        this.pause_rendering = false;
        this.clear_background = true;
        this.clear_background_color = "#222";

        // Interaction flags
        this.read_only = false;
        this.render_only_selected = true;
        this.live_mode = false;
        this.show_info = true;
        this.allow_dragcanvas = true;
        this.allow_dragnodes = true;
        this.allow_interaction = true;
        this.multi_select = false;
        this.allow_searchbox = true;
        this.allow_reconnect_links = true;
        this.align_to_grid = false;

        this.drag_mode = false;
        this.dragging_rectangle = null;

        this.filter = null;

        this.set_canvas_dirty_on_mouse_event = true;
        this.always_render_background = false;
        this.render_shadows = true;
        this.render_canvas_border = true;
        this.render_connections_shadows = false;
        this.render_connections_border = true;
        this.render_curved_connections = false;
        this.render_connection_arrows = false;
        this.render_collapsed_slots = true;
        this.render_execution_order = false;
        this.render_title_colored = true;
        this.render_link_tooltip = true;

        this.links_render_mode = LiteGraph.SPLINE_LINK;

        this.mouse = [0, 0];
        this.graph_mouse = [0, 0];
        this.canvas_mouse = this.graph_mouse; // LEGACY

        // Search box callbacks
        this.onSearchBox = null;
        this.onSearchBoxSelection = null;

        // Callbacks
        this.onMouse = null;
        this.onDrawBackground = null;
        this.onDrawForeground = null;
        this.onDrawOverlay = null;
        this.onDrawLinkTooltip = null;
        this.onNodeMoved = null;
        this.onSelectionChange = null;
        this.onConnectingChange = null;
        this.onBeforeChange = null;
        this.onAfterChange = null;

        this.connections_width = 3;
        this.round_radius = 8;

        this.current_node = null;
        this.node_widget = null;
        this.over_link_center = null;
        this.last_mouse_position = [0, 0];
        this.visible_area = this.ds.visible_area;
        this.visible_links = [];

        this.viewport = options.viewport || null;

        // Link canvas and graph
        if (graph) {
            graph.attachCanvas(this);
        }

        this.setCanvas(canvas, options.skip_events);
        this.clear();

        if (!options.skip_render) {
            this.startRendering();
        }

        this.autoresize = options.autoresize;
    }

    // ==================== INIT & CLEAR ====================

    /** clears all the data inside */
    clear() {
        this.frame = 0;
        this.last_draw_time = 0;
        this.render_time = 0;
        this.fps = 0;

        this.dragging_rectangle = null;

        this.selected_nodes = {};
        this.selected_group = null;

        this.visible_nodes = [];
        this.node_dragged = null;
        this.node_over = null;
        this.node_capturing_input = null;
        this.connecting_node = null;
        this.highlighted_links = {};

        this.dragging_canvas = false;

        this.dirty_canvas = true;
        this.dirty_bgcanvas = true;
        this.dirty_area = null;

        this.node_in_panel = null;
        this.node_widget = null;

        this.last_mouse = [0, 0];
        this.last_mouseclick = 0;
        this.pointer_is_down = false;
        this.pointer_is_double = false;
        this.visible_area.set([0, 0, 0, 0]);

        if (this.onClear) {
            this.onClear();
        }
    }

    // ==================== GRAPH MANAGEMENT ====================

    /** assigns a graph, you can reassign graphs to the same canvas */
    setGraph(graph, skip_clear) {
        if (this.graph === graph) return;

        if (!skip_clear) {
            this.clear();
        }

        if (!graph && this.graph) {
            this.graph.detachCanvas(this);
            return;
        }

        graph.attachCanvas(this);

        // remove the graph stack in case a subgraph was open
        if (this._graph_stack) this._graph_stack = null;

        this.setDirty(true, true);
    }

    /** returns the top level graph (in case there are subgraphs open on the canvas) */
    getTopGraph() {
        if (this._graph_stack && this._graph_stack.length)
            return this._graph_stack[0];
        return this.graph;
    }

    /** opens a graph contained inside a node in the current graph */
    openSubgraph(graph) {
        if (!graph) throw "graph cannot be null";
        if (this.graph === graph) throw "graph cannot be the same";

        this.clear();

        if (this.graph) {
            if (!this._graph_stack) {
                this._graph_stack = [];
            }
            this._graph_stack.push(this.graph);
        }

        graph.attachCanvas(this);
        // Restore original: close stale panels from the previous graph so
        // they don't linger on top of the new subgraph view.
        this.checkPanels();
        this.setDirty(true, true);
    }

    /** closes a subgraph contained inside a node */
    closeSubgraph() {
        if (!this._graph_stack || this._graph_stack.length === 0) return;
        const subgraph_node = this.graph._subgraph_node;
        const graph = this._graph_stack.pop();
        this.selected_nodes = {};
        this.highlighted_links = {};
        graph.attachCanvas(this);
        this.setDirty(true, true);
        if (subgraph_node) {
            this.centerOnNode(subgraph_node);
            this.selectNodes([subgraph_node]);
        }
        this.ds.offset = [0, 0];
        this.ds.scale = 1;
    }

    /** returns the visually active graph */
    getCurrentGraph() {
        return this.graph;
    }

    // ==================== CANVAS SETUP ====================

    /** assigns a canvas */
    setCanvas(canvas, skip_events) {
        if (canvas) {
            if (canvas.constructor === String) {
                canvas = document.getElementById(canvas);
                if (!canvas) {
                    throw "Error creating LiteGraph canvas: Canvas not found";
                }
            }
        }

        if (canvas === this.canvas) return;

        if (!canvas && this.canvas) {
            if (!skip_events) {
                this.unbindEvents();
            }
        }

        this.canvas = canvas;
        this.ds.element = canvas;

        if (!canvas) return;

        canvas.className += " lgraphcanvas";
        canvas.data = this;
        canvas.tabindex = "1";

        // bg canvas: used for non changing stuff
        this.bgcanvas = null;
        if (!this.bgcanvas) {
            this.bgcanvas = document.createElement("canvas");
            this.bgcanvas.width = this.canvas.width;
            this.bgcanvas.height = this.canvas.height;
        }

        if (canvas.getContext == null) {
            if (canvas.localName !== "canvas") {
                throw (
                    "Element supplied for LGraphCanvas must be a <canvas> element, you passed a " +
                    canvas.localName
                );
            }
            throw "This browser doesn't support Canvas";
        }

        const ctx = (this.ctx = canvas.getContext("2d"));
        if (ctx == null) {
            if (!canvas.webgl_enabled) {
                console.warn("This canvas seems to be WebGL, enabling WebGL renderer");
            }
            this.enableWebGL();
        }

        if (!skip_events) {
            this.bindEvents();
        }
    }

    /** enables WebGL rendering */
    enableWebGL() {
        if (typeof GL === "undefined") {
            throw "litegl.js must be included to use a WebGL canvas";
        }
        if (typeof enableWebGLCanvas === "undefined") {
            throw "webglCanvas.js must be included to use this feature";
        }
        this.gl = this.ctx = enableWebGLCanvas(this.canvas);
        this.ctx.webgl = true;
        this.bgcanvas = this.canvas;
        this.bgctx = this.gl;
        this.canvas.webgl_enabled = true;
    }

    // ==================== EVENT BINDING ====================

    /** binds mouse, keyboard, touch and drag events to the canvas */
    bindEvents() {
        if (this._events_binded) {
            console.warn("LGraphCanvas: events already binded");
            return;
        }

        const canvas = this.canvas;
        const ref_window = this.getCanvasWindow();
        const doc = ref_window.document;

        this._mousedown_callback = this.processMouseDown.bind(this);
        this._mousewheel_callback = this.processMouseWheel.bind(this);
        this._mousemove_callback = this.processMouseMove.bind(this);
        this._mouseup_callback = this.processMouseUp.bind(this);

        pointerListenerAdd(canvas, "down", this._mousedown_callback, true);
        canvas.addEventListener("mousewheel", this._mousewheel_callback, false);
        pointerListenerAdd(canvas, "up", this._mouseup_callback, true);
        pointerListenerAdd(canvas, "move", this._mousemove_callback);

        canvas.addEventListener("contextmenu", this._doNothing);
        canvas.addEventListener(
            "DOMMouseScroll",
            this._mousewheel_callback,
            false
        );

        // Keyboard
        this._key_callback = this.processKey.bind(this);
        canvas.setAttribute("tabindex", 1);
        canvas.addEventListener("keydown", this._key_callback, true);
        doc.addEventListener("keyup", this._key_callback, true);

        // Drop
        this._ondrop_callback = this.processDrop.bind(this);
        canvas.addEventListener("dragover", this._doNothing, false);
        canvas.addEventListener("dragend", this._doNothing, false);
        canvas.addEventListener("drop", this._ondrop_callback, false);
        canvas.addEventListener("dragenter", this._doReturnTrue, false);

        this._events_binded = true;
    }

    /** unbinds mouse events from the canvas */
    unbindEvents() {
        if (!this._events_binded) {
            console.warn("LGraphCanvas: no events binded");
            return;
        }

        const ref_window = this.getCanvasWindow();
        const doc = ref_window.document;

        pointerListenerRemove(this.canvas, "move", this._mousemove_callback);
        pointerListenerRemove(this.canvas, "up", this._mouseup_callback);
        pointerListenerRemove(this.canvas, "down", this._mousedown_callback);
        this.canvas.removeEventListener("mousewheel", this._mousewheel_callback);
        this.canvas.removeEventListener(
            "DOMMouseScroll",
            this._mousewheel_callback
        );
        this.canvas.removeEventListener("keydown", this._key_callback);
        doc.removeEventListener("keyup", this._key_callback);
        this.canvas.removeEventListener("contextmenu", this._doNothing);
        this.canvas.removeEventListener("drop", this._ondrop_callback);
        this.canvas.removeEventListener("dragenter", this._doReturnTrue);

        this._mousedown_callback = null;
        this._mousewheel_callback = null;
        this._key_callback = null;
        this._ondrop_callback = null;

        this._events_binded = false;
    }

    // used to block/capture events
    _doNothing(e) {
        e.preventDefault();
        return false;
    }

    _doReturnTrue(e) {
        e.preventDefault();
        return true;
    }

    /** used to block future mouse events (because of imgui) */
    blockClick() {
        this.block_click = true;
        this.last_mouseclick = 0;
    }

    // ==================== RENDERING LOOP ====================

    /** marks as dirty the canvas */
    setDirty(fgcanvas, bgcanvas) {
        if (fgcanvas) this.dirty_canvas = true;
        if (bgcanvas) this.dirty_bgcanvas = true;
    }

    /** returns the window where the canvas is attached */
    getCanvasWindow() {
        if (!this.canvas) return window;
        const doc = this.canvas.ownerDocument;
        return doc.defaultView || doc.parentWindow;
    }

    /** starts rendering the content of the canvas when needed */
    startRendering() {
        if (this.is_rendering) return;

        this.is_rendering = true;
        const renderFrame = () => {
            if (!this.pause_rendering) {
                this.draw();
            }
            const win = this.getCanvasWindow();
            if (this.is_rendering) {
                win.requestAnimationFrame(renderFrame.bind(this));
            }
        };
        renderFrame.call(this);
    }

    /** stops rendering the content of the canvas */
    stopRendering() {
        this.is_rendering = false;
    }

    // ==================== MOUSE HANDLING ====================

    processMouseDown(e) {
        if (this.set_canvas_dirty_on_mouse_event) this.dirty_canvas = true;

        if (!this.graph) return;

        this.adjustMouseEvent(e);

        const ref_window = this.getCanvasWindow();
        LGraphCanvas.active_canvas = this;

        const x = e.clientX;
        const y = e.clientY;

        this.ds.viewport = this.viewport;
        const is_inside =
            !this.viewport ||
            (this.viewport &&
                x >= this.viewport[0] &&
                x < this.viewport[0] + this.viewport[2] &&
                y >= this.viewport[1] &&
                y < this.viewport[1] + this.viewport[3]);

        // move mouse move event to the window in case it drags outside of the canvas
        if (!this.options.skip_events) {
            pointerListenerRemove(this.canvas, "move", this._mousemove_callback);
            pointerListenerAdd(
                ref_window.document,
                "move",
                this._mousemove_callback,
                true
            );
            pointerListenerAdd(
                ref_window.document,
                "up",
                this._mouseup_callback,
                true
            );
        }

        if (!is_inside) return;

        let node = this.graph.getNodeOnPos(
            e.canvasX,
            e.canvasY,
            this.visible_nodes,
            5
        );
        let skip_dragging = false;
        let skip_action = false;
        const now = getTime();
        const is_primary = e.isPrimary === undefined || !e.isPrimary;
        const is_double_click =
            now - this.last_mouseclick < 300 && is_primary;

        this.mouse[0] = e.clientX;
        this.mouse[1] = e.clientY;
        this.graph_mouse[0] = e.canvasX;
        this.graph_mouse[1] = e.canvasY;
        this.last_click_position = [this.mouse[0], this.mouse[1]];

        if (this.pointer_is_down && is_primary) {
            this.pointer_is_double = true;
        } else {
            this.pointer_is_double = false;
        }
        this.pointer_is_down = true;

        this.canvas.focus();

        LiteGraph.closeAllContextMenus(ref_window);

        if (this.onMouse) {
            if (this.onMouse(e) === true) return;
        }

        // LEFT BUTTON / single finger
        if (getMouseButton(e) === 1 && !this.pointer_is_double) {
            if (e.ctrlKey) {
                this.dragging_rectangle = new Float32Array(4);
                this.dragging_rectangle[0] = e.canvasX;
                this.dragging_rectangle[1] = e.canvasY;
                this.dragging_rectangle[2] = 1;
                this.dragging_rectangle[3] = 1;
                skip_action = true;
            }

            // clone node ALT dragging
            if (
                LiteGraph.alt_drag_do_clone_nodes &&
                e.altKey &&
                node &&
                this.allow_interaction &&
                !skip_action &&
                !this.read_only
            ) {
                const cloned = node.clone();
                if (cloned) {
                    cloned.pos[0] += 5;
                    cloned.pos[1] += 5;
                    this.graph.add(cloned, false, { doCalcSize: false });
                    node = cloned;
                    skip_action = true;
                    if (this.allow_dragnodes) {
                        this.graph.beforeChange();
                        this.node_dragged = node;
                    }
                    if (!this.selected_nodes[node.id]) {
                        this.processNodeSelected(node, e);
                    }
                }
            }

            let clicking_canvas_bg = false;

            // when clicked on top of a node and it is not interactive
            if (
                node &&
                (this.allow_interaction || node.flags.allow_interaction) &&
                !skip_action &&
                !this.read_only
            ) {
                if (!this.live_mode && !node.flags.pinned) {
                    this.bringToFront(node);
                }

                // not dragging mouse to connect two slots
                if (
                    this.allow_interaction &&
                    !this.connecting_node &&
                    !node.flags.collapsed &&
                    !this.live_mode
                ) {
                    // Search for corner for resize
                    if (
                        !skip_action &&
                        node.resizable !== false &&
                        isInsideRectangle(
                            e.canvasX,
                            e.canvasY,
                            node.pos[0] + node.size[0] - 5,
                            node.pos[1] + node.size[1] - 5,
                            10,
                            10
                        )
                    ) {
                        this.graph.beforeChange();
                        this.resizing_node = node;
                        this.canvas.style.cursor = "se-resize";
                        skip_action = true;
                    } else {
                        // search for outputs
                        if (node.outputs) {
                            // UNIFIED: delegate to isOverNodeOutput so the
                            // click hit-box is identical to the hover hit-box
                            // used by processMouseMove. Previous hard-coded
                            // 30×20 rect drifted from isOverNodeOutput's
                            // 40×10 rect, causing click/hover mismatch.
                            const outIdx = this.isOverNodeOutput(
                                node,
                                e.canvasX,
                                e.canvasY
                            );
                            if (outIdx !== -1) {
                                const i = outIdx;
                                const output = node.outputs[i];
                                this.connecting_node = node;
                                this.connecting_output = output;
                                this.connecting_output.slot_index = i;
                                this.connecting_pos =
                                    node.getConnectionPos(false, i);
                                this.connecting_slot = i;

                                if (LiteGraph.shift_click_do_break_link_from) {
                                    if (e.shiftKey) {
                                        node.disconnectOutput(i);
                                    }
                                }

                                if (is_double_click) {
                                    if (node.onOutputDblClick) {
                                        node.onOutputDblClick(i, e);
                                    }
                                } else {
                                    if (node.onOutputClick) {
                                        node.onOutputClick(i, e);
                                    }
                                }

                                // BUGFIX: foreground canvas must be dirtied so the
                                // connecting link renders during drag. Original code
                                // only broke out of the loop without marking dirty.
                                this.dirty_canvas = true;
                                this.dirty_bgcanvas = true;
                                skip_action = true;
                            }
                        }

                        // search for inputs
                        if (node.inputs) {
                            // UNIFIED: delegate to isOverNodeInput (same as
                            // processMouseMove hover detection) so click and
                            // hover hit-boxes are identical.
                            const inIdx = this.isOverNodeInput(
                                node,
                                e.canvasX,
                                e.canvasY
                            );
                            if (inIdx !== -1) {
                                const i = inIdx;
                                const input = node.inputs[i];
                                {
                                    if (is_double_click) {
                                        if (node.onInputDblClick) {
                                            node.onInputDblClick(i, e);
                                        }
                                    } else {
                                        if (node.onInputClick) {
                                            node.onInputClick(i, e);
                                        }
                                    }

                                    if (input.link !== null) {
                                        const link_info =
                                            this.graph.links[input.link];
                                        if (LiteGraph.click_do_break_link_to) {
                                            node.disconnectInput(i);
                                            this.dirty_bgcanvas = true;
                                            skip_action = true;
                                        }

                                        if (
                                            this.allow_reconnect_links ||
                                            e.shiftKey
                                        ) {
                                            if (!LiteGraph.click_do_break_link_to) {
                                                node.disconnectInput(i);
                                            }
                                            this.connecting_node =
                                                this.graph._nodes_by_id[
                                                    link_info.origin_id
                                                ];
                                            this.connecting_slot =
                                                link_info.origin_slot;
                                            this.connecting_output =
                                                this.connecting_node.outputs[
                                                    this.connecting_slot
                                                ];
                                            this.connecting_pos =
                                                this.connecting_node.getConnectionPos(
                                                    false,
                                                    this.connecting_slot
                                                );

                                            // BUGFIX: connecting link is rendered in
                                            // drawFrontCanvas (line ~2478), so we must
                                            // mark dirty_canvas (foreground) — not just
                                            // dirty_bgcanvas. Without this the dragged
                                            // link never appears until mouseup.
                                            this.dirty_canvas = true;
                                            this.dirty_bgcanvas = true;
                                            skip_action = true;
                                        }
                                    }

                                    if (!skip_action) {
                                        this.connecting_node = node;
                                        this.connecting_input = input;
                                        this.connecting_input.slot_index = i;
                                        this.connecting_pos =
                                            node.getConnectionPos(true, i);
                                        this.connecting_slot = i;

                                        // BUGFIX: same as above — foreground canvas
                                        // must be dirtied so the connecting link renders.
                                        this.dirty_canvas = true;
                                        this.dirty_bgcanvas = true;
                                        skip_action = true;
                                    }
                                }
                            }
                        }
                    }
                }

                // it wasn't clicked on the links boxes
                if (!skip_action) {
                    let block_drag_node = false;
                    const pos = [
                        e.canvasX - node.pos[0],
                        e.canvasY - node.pos[1],
                    ];

                    // Collapse box: mousedown only marks it so mouseup can
                    // toggle. We do NOT collapse here — if we did, a fast
                    // click would collapse on mousedown AND collapse again
                    // (uncollapse) on mouseup, causing a visible flicker.
                    // The actual collapse toggle happens in processMouseUp
                    // when click_time < 300. We still set skip_action so
                    // the double-click panel handler below doesn't fire.
                    if (this.isOverNodeBox(node, e.canvasX, e.canvasY)) {
                        skip_action = true;
                    }

                    // widgets removed — processNodeWidgets is now a no-op stub

                    // double clicking (node body, NOT the collapse box)
                    if (
                        !skip_action &&
                        this.allow_interaction &&
                        is_double_click &&
                        this.selected_nodes[node.id]
                    ) {
                        if (node.onDblClick) {
                            node.onDblClick(e, pos, this);
                        }
                        this.processNodeDblClicked(node);
                        block_drag_node = true;
                    }

                    // if do not capture mouse
                    if (node.onMouseDown && node.onMouseDown(e, pos, this)) {
                        block_drag_node = true;
                    } else {
                        // open subgraph button
                        if (node.subgraph && !node.skip_subgraph_button) {
                            if (
                                !node.flags.collapsed &&
                                pos[0] >
                                    node.size[0] -
                                        LiteGraph.NODE_TITLE_HEIGHT &&
                                pos[1] < 0
                            ) {
                                setTimeout(() => {
                                    this.openSubgraph(node.subgraph);
                                }, 10);
                            }
                        }

                        if (this.live_mode) {
                            clicking_canvas_bg = true;
                            block_drag_node = true;
                        }
                    }

                    if (!block_drag_node) {
                        if (this.allow_dragnodes) {
                            this.graph.beforeChange();
                            this.node_dragged = node;
                        }
                        this.processNodeSelected(node, e);
                    } else {
                        if (!node.is_selected) this.processNodeSelected(node, e);
                    }

                    this.dirty_canvas = true;
                }
            } else {
                // clicked outside of nodes
                if (!skip_action) {
                    // search for link connector
                    if (!this.read_only) {
                        for (
                            let i = 0;
                            i < this.visible_links.length;
                            ++i
                        ) {
                            const link = this.visible_links[i];
                            const center = link._pos;
                            if (
                                !center ||
                                e.canvasX < center[0] - 4 ||
                                e.canvasX > center[0] + 4 ||
                                e.canvasY < center[1] - 4 ||
                                e.canvasY > center[1] + 4
                            ) {
                                continue;
                            }
                            this.showLinkMenu(link, e);
                            this.over_link_center = null;
                            break;
                        }
                    }

                    this.selected_group = this.graph.getGroupOnPos(
                        e.canvasX,
                        e.canvasY
                    );
                    this.selected_group_resizing = false;
                    if (this.selected_group && !this.read_only) {
                        if (e.ctrlKey) {
                            this.dragging_rectangle = null;
                        }

                        const dist = distance(
                            [e.canvasX, e.canvasY],
                            [
                                this.selected_group.pos[0] +
                                    this.selected_group.size[0],
                                this.selected_group.pos[1] +
                                    this.selected_group.size[1],
                            ]
                        );
                        if (dist * this.ds.scale < 10) {
                            this.selected_group_resizing = true;
                        } else {
                            this.selected_group.recomputeInsideNodes();
                        }
                    }

                    // Search box removed — double-click on empty canvas
                    // no longer opens a node-creation dialog. Hosts should
                    // provide their own node-creation UI (sidebar, etc.).

                    clicking_canvas_bg = true;
                }
            }

            if (
                !skip_action &&
                clicking_canvas_bg &&
                this.allow_dragcanvas
            ) {
                this.dragging_canvas = true;
            }
        } else if (getMouseButton(e) === 2) {
            // MIDDLE BUTTON
            if (
                LiteGraph.middle_click_slot_add_default_node &&
                node &&
                this.allow_interaction &&
                !skip_action &&
                !this.read_only
            ) {
                if (
                    !this.connecting_node &&
                    !node.flags.collapsed &&
                    !this.live_mode
                ) {
                    let mClikSlot = false;
                    let mClikSlot_index = false;
                    let mClikSlot_isOut = false;
                    if (node.outputs) {
                        for (
                            let i = 0, l = node.outputs.length;
                            i < l;
                            ++i
                        ) {
                            const output = node.outputs[i];
                            const link_pos = node.getConnectionPos(false, i);
                            if (
                                isInsideRectangle(
                                    e.canvasX,
                                    e.canvasY,
                                    link_pos[0] - 15,
                                    link_pos[1] - 10,
                                    30,
                                    20
                                )
                            ) {
                                mClikSlot = output;
                                mClikSlot_index = i;
                                mClikSlot_isOut = true;
                                break;
                            }
                        }
                    }
                    if (node.inputs) {
                        for (
                            let i = 0, l = node.inputs.length;
                            i < l;
                            ++i
                        ) {
                            const input = node.inputs[i];
                            const link_pos = node.getConnectionPos(true, i);
                            if (
                                isInsideRectangle(
                                    e.canvasX,
                                    e.canvasY,
                                    link_pos[0] - 15,
                                    link_pos[1] - 10,
                                    30,
                                    20
                                )
                            ) {
                                mClikSlot = input;
                                mClikSlot_index = i;
                                mClikSlot_isOut = false;
                                break;
                            }
                        }
                    }
                    if (mClikSlot && mClikSlot_index !== false) {
                        // createDefaultNodeForSlot removed — this was a
                        // middle-click-on-slot shortcut to auto-create a
                        // compatible node. Hosts should provide their own
                        // node-creation UI.
                    }
                }
            } else if (!skip_action && this.allow_dragcanvas) {
                this.dragging_canvas = true;
            }
        } else if (getMouseButton(e) === 3 || this.pointer_is_double) {
            // RIGHT BUTTON
            if (
                this.allow_interaction &&
                !skip_action &&
                !this.read_only
            ) {
                if (node) {
                    if (
                        Object.keys(this.selected_nodes).length &&
                        (this.selected_nodes[node.id] ||
                            e.shiftKey ||
                            e.ctrlKey ||
                            e.metaKey)
                    ) {
                        if (!this.selected_nodes[node.id])
                            this.selectNodes([node], true);
                    } else {
                        this.selectNodes([node]);
                    }
                }

                // Context menu removed — right-click no longer opens a menu.
            }
        }

        this.last_mouse[0] = e.clientX;
        this.last_mouse[1] = e.clientY;
        this.last_mouseclick = getTime();
        this.last_mouse_dragging = true;

        this.graph.change();

        if (
            !ref_window.document.activeElement ||
            (ref_window.document.activeElement.nodeName.toLowerCase() !==
                "input" &&
                ref_window.document.activeElement.nodeName.toLowerCase() !==
                    "textarea")
        ) {
            e.preventDefault();
        }
        e.stopPropagation();

        if (this.onMouseDown) {
            this.onMouseDown(e);
        }

        return false;
    }

    processMouseMove(e) {
        if (this.autoresize) {
            this.resize();
        }

        if (this.set_canvas_dirty_on_mouse_event) this.dirty_canvas = true;

        if (!this.graph) return;

        LGraphCanvas.active_canvas = this;
        this.adjustMouseEvent(e);
        const mouse = [e.clientX, e.clientY];
        this.mouse[0] = mouse[0];
        this.mouse[1] = mouse[1];
        const delta = [
            mouse[0] - this.last_mouse[0],
            mouse[1] - this.last_mouse[1],
        ];
        this.last_mouse = mouse;
        this.graph_mouse[0] = e.canvasX;
        this.graph_mouse[1] = e.canvasY;

        if (this.block_click) {
            e.preventDefault();
            return false;
        }

        e.dragging = this.last_mouse_dragging;

        // widgets removed — this.node_widget is never set now

        // get node over
        const node = this.graph.getNodeOnPos(
            e.canvasX,
            e.canvasY,
            this.visible_nodes
        );

        if (this.dragging_rectangle) {
            this.dragging_rectangle[2] =
                e.canvasX - this.dragging_rectangle[0];
            this.dragging_rectangle[3] =
                e.canvasY - this.dragging_rectangle[1];
            this.dirty_canvas = true;
        } else if (this.selected_group && !this.read_only) {
            if (this.selected_group_resizing) {
                this.selected_group.size = [
                    e.canvasX - this.selected_group.pos[0],
                    e.canvasY - this.selected_group.pos[1],
                ];
            } else {
                const deltax = delta[0] / this.ds.scale;
                const deltay = delta[1] / this.ds.scale;
                this.selected_group.move(deltax, deltay, e.ctrlKey);
                if (this.selected_group._nodes.length) {
                    this.dirty_canvas = true;
                }
            }
            this.dirty_bgcanvas = true;
        } else if (this.dragging_canvas) {
            this.ds.offset[0] += delta[0] / this.ds.scale;
            this.ds.offset[1] += delta[1] / this.ds.scale;
            this.dirty_canvas = true;
            this.dirty_bgcanvas = true;
        } else if (
            (this.allow_interaction ||
                (node && node.flags.allow_interaction)) &&
            !this.read_only
        ) {
            if (this.connecting_node) {
                this.dirty_canvas = true;
            }

            // remove mouseover flag
            for (
                let i = 0, l = this.graph._nodes.length;
                i < l;
                ++i
            ) {
                if (
                    this.graph._nodes[i].mouseOver &&
                    node !== this.graph._nodes[i]
                ) {
                    this.graph._nodes[i].mouseOver = false;
                    if (this.node_over && this.node_over.onMouseLeave) {
                        this.node_over.onMouseLeave(e);
                    }
                    this.node_over = null;
                    this.dirty_canvas = true;
                }
            }

            // mouse over a node
            if (node) {
                if (node.redraw_on_mouse) this.dirty_canvas = true;

                if (!node.mouseOver) {
                    node.mouseOver = true;
                    this.node_over = node;
                    this.dirty_canvas = true;
                    if (node.onMouseEnter) {
                        node.onMouseEnter(e);
                    }
                }

                if (node.onMouseMove) {
                    node.onMouseMove(e, [
                        e.canvasX - node.pos[0],
                        e.canvasY - node.pos[1],
                    ], this);
                }

                // if dragging a link
                if (this.connecting_node) {
                    if (this.connecting_output) {
                        const pos =
                            this._highlight_input || [0, 0];

                        if (this.isOverNodeBox(node, e.canvasX, e.canvasY)) {
                            // mouse on top of the corner box
                        } else {
                            const slot = this.isOverNodeInput(
                                node,
                                e.canvasX,
                                e.canvasY,
                                pos
                            );
                            if (slot !== -1 && node.inputs[slot]) {
                                const slot_type = node.inputs[slot].type;
                                if (
                                    LiteGraph.isValidConnection(
                                        this.connecting_output.type,
                                        slot_type
                                    )
                                ) {
                                    this._highlight_input = pos;
                                    this._highlight_input_slot =
                                        node.inputs[slot];
                                }
                            } else {
                                this._highlight_input = null;
                                this._highlight_input_slot = null;
                            }
                        }
                    } else if (this.connecting_input) {
                        const pos =
                            this._highlight_output || [0, 0];

                        if (this.isOverNodeBox(node, e.canvasX, e.canvasY)) {
                            // mouse on top of the corner box
                        } else {
                            const slot = this.isOverNodeOutput(
                                node,
                                e.canvasX,
                                e.canvasY,
                                pos
                            );
                            if (slot !== -1 && node.outputs[slot]) {
                                const slot_type = node.outputs[slot].type;
                                if (
                                    LiteGraph.isValidConnection(
                                        this.connecting_input.type,
                                        slot_type
                                    )
                                ) {
                                    this._highlight_output = pos;
                                }
                            } else {
                                this._highlight_output = null;
                            }
                        }
                    }
                }

                // Search for corner
                if (this.canvas) {
                    if (
                        isInsideRectangle(
                            e.canvasX,
                            e.canvasY,
                            node.pos[0] + node.size[0] - 5,
                            node.pos[1] + node.size[1] - 5,
                            5,
                            5
                        )
                    ) {
                        this.canvas.style.cursor = "se-resize";
                    } else {
                        this.canvas.style.cursor = "crosshair";
                    }
                }
            } else {
                // not over a node — search for link connector
                let over_link = null;
                for (let i = 0; i < this.visible_links.length; ++i) {
                    const link = this.visible_links[i];
                    const center = link._pos;
                    if (
                        !center ||
                        e.canvasX < center[0] - 4 ||
                        e.canvasX > center[0] + 4 ||
                        e.canvasY < center[1] - 4 ||
                        e.canvasY > center[1] + 4
                    ) {
                        continue;
                    }
                    over_link = link;
                    break;
                }
                if (over_link !== this.over_link_center) {
                    this.over_link_center = over_link;
                    this.dirty_canvas = true;
                }

                if (this.canvas) {
                    this.canvas.style.cursor = "";
                }
            }

            // send event to node if capturing input
            if (
                this.node_capturing_input &&
                this.node_capturing_input !== node &&
                this.node_capturing_input.onMouseMove
            ) {
                this.node_capturing_input.onMouseMove(e, [
                    e.canvasX - this.node_capturing_input.pos[0],
                    e.canvasY - this.node_capturing_input.pos[1],
                ], this);
            }

            // node being dragged
            if (this.node_dragged && !this.live_mode) {
                for (const i in this.selected_nodes) {
                    const n = this.selected_nodes[i];
                    n.pos[0] += delta[0] / this.ds.scale;
                    n.pos[1] += delta[1] / this.ds.scale;
                    if (!n.is_selected) this.processNodeSelected(n, e);
                }

                this.dirty_canvas = true;
                this.dirty_bgcanvas = true;
            }

            if (this.resizing_node && !this.live_mode) {
                const desired_size = [
                    e.canvasX - this.resizing_node.pos[0],
                    e.canvasY - this.resizing_node.pos[1],
                ];
                const min_size = this.resizing_node.computeSize();
                desired_size[0] = Math.max(min_size[0], desired_size[0]);
                desired_size[1] = Math.max(min_size[1], desired_size[1]);
                this.resizing_node.setSize(desired_size);

                this.canvas.style.cursor = "se-resize";
                this.dirty_canvas = true;
                this.dirty_bgcanvas = true;
            }
        }

        e.preventDefault();
        return false;
    }

    processMouseUp(e) {
        const is_primary = e.isPrimary === undefined || e.isPrimary;

        if (!is_primary) {
            return false;
        }

        if (this.set_canvas_dirty_on_mouse_event) this.dirty_canvas = true;

        if (!this.graph) return;

        const win = this.getCanvasWindow();
        const doc = win.document;
        LGraphCanvas.active_canvas = this;

        // restore the mousemove event back to the canvas
        if (!this.options.skip_events) {
            pointerListenerRemove(doc, "move", this._mousemove_callback, true);
            pointerListenerAdd(this.canvas, "move", this._mousemove_callback, true);
            pointerListenerRemove(doc, "up", this._mouseup_callback, true);
        }

        this.adjustMouseEvent(e);
        const now = getTime();
        e.click_time = now - this.last_mouseclick;
        this.last_mouse_dragging = false;
        this.last_click_position = null;

        if (this.block_click) {
            this.block_click = false;
        }

        if (getMouseButton(e) === 1) {
            // widgets removed — this.node_widget is never set now

            // left button
            this.node_widget = null;

            if (this.selected_group) {
                const diffx =
                    this.selected_group.pos[0] -
                    Math.round(this.selected_group.pos[0]);
                const diffy =
                    this.selected_group.pos[1] -
                    Math.round(this.selected_group.pos[1]);
                this.selected_group.move(diffx, diffy, e.ctrlKey);
                this.selected_group.pos[0] = Math.round(
                    this.selected_group.pos[0]
                );
                this.selected_group.pos[1] = Math.round(
                    this.selected_group.pos[1]
                );
                if (this.selected_group._nodes.length) {
                    this.dirty_canvas = true;
                }
                this.selected_group = null;
            }
            this.selected_group_resizing = false;

            const node = this.graph.getNodeOnPos(
                e.canvasX,
                e.canvasY,
                this.visible_nodes
            );

            if (this.dragging_rectangle) {
                if (this.graph) {
                    const nodes = this.graph._nodes;
                    const node_bounding = new Float32Array(4);

                    const w = Math.abs(this.dragging_rectangle[2]);
                    const h = Math.abs(this.dragging_rectangle[3]);
                    const startx =
                        this.dragging_rectangle[2] < 0
                            ? this.dragging_rectangle[0] - w
                            : this.dragging_rectangle[0];
                    const starty =
                        this.dragging_rectangle[3] < 0
                            ? this.dragging_rectangle[1] - h
                            : this.dragging_rectangle[1];
                    this.dragging_rectangle[0] = startx;
                    this.dragging_rectangle[1] = starty;
                    this.dragging_rectangle[2] = w;
                    this.dragging_rectangle[3] = h;

                    if (!node || (w > 10 && h > 10)) {
                        const to_select = [];
                        for (let i = 0; i < nodes.length; ++i) {
                            const nodeX = nodes[i];
                            nodeX.getBounding(node_bounding);
                            if (
                                !overlapBounding(
                                    this.dragging_rectangle,
                                    node_bounding
                                )
                            ) {
                                continue;
                            }
                            to_select.push(nodeX);
                        }
                        if (to_select.length) {
                            this.selectNodes(to_select, e.shiftKey);
                        }
                    } else {
                        this.selectNodes([node], e.shiftKey || e.ctrlKey);
                    }
                }
                this.dragging_rectangle = null;
            } else if (this.connecting_node) {
                // dragging a connection
                this.dirty_canvas = true;
                this.dirty_bgcanvas = true;

                const connInOrOut =
                    this.connecting_output || this.connecting_input;
                const connType = connInOrOut.type;

                if (node) {
                    if (this.connecting_output) {
                        const slot = this.isOverNodeInput(
                            node,
                            e.canvasX,
                            e.canvasY
                        );
                        if (slot !== -1) {
                            this.connecting_node.connect(
                                this.connecting_slot,
                                node,
                                slot
                            );
                        } else {
                            this.connecting_node.connectByType(
                                this.connecting_slot,
                                node,
                                connType
                            );
                        }
                    } else if (this.connecting_input) {
                        const slot = this.isOverNodeOutput(
                            node,
                            e.canvasX,
                            e.canvasY
                        );
                        if (slot !== -1) {
                            node.connect(
                                slot,
                                this.connecting_node,
                                this.connecting_slot
                            );
                        } else {
                            this.connecting_node.connectByTypeOutput(
                                this.connecting_slot,
                                node,
                                connType
                            );
                        }
                    }
                } else {
                    // Releasing a dragged link on empty space: previously
                    // this opened a search/connection menu. Both removed.
                    // The link drag simply cancels (connecting_* stays null
                    // after the cleanup below).
                }

                this.connecting_output = null;
                this.connecting_input = null;
                this.connecting_pos = null;
                this.connecting_node = null;
                this.connecting_slot = -1;
            } else if (this.resizing_node) {
                this.dirty_canvas = true;
                this.dirty_bgcanvas = true;
                this.graph.afterChange(this.resizing_node);
                this.resizing_node = null;
            } else if (this.node_dragged) {
                const draggedNode = this.node_dragged;
                // Quick click (< 300ms) on the title box → toggle collapse.
                // Uses the unified isOverNodeBox so the hit region matches
                // the drawn box. (Previously used a hard-coded 30×30 rect
                // that could drift from the visual box.)
                if (
                    draggedNode &&
                    e.click_time < 300 &&
                    this.isOverNodeBox(draggedNode, e.canvasX, e.canvasY)
                ) {
                    draggedNode.collapse();
                }

                this.dirty_canvas = true;
                this.dirty_bgcanvas = true;
                this.node_dragged.pos[0] = Math.round(this.node_dragged.pos[0]);
                this.node_dragged.pos[1] = Math.round(this.node_dragged.pos[1]);
                if (
                    this.graph.config.align_to_grid ||
                    this.align_to_grid
                ) {
                    this.node_dragged.alignToGrid();
                }
                if (this.onNodeMoved) this.onNodeMoved(this.node_dragged);
                this.graph.afterChange(this.node_dragged);
                this.node_dragged = null;
            } else {
                // get node over
                const nodeOver = this.graph.getNodeOnPos(
                    e.canvasX,
                    e.canvasY,
                    this.visible_nodes
                );

                if (!nodeOver && e.click_time < 300) {
                    this.deselectAllNodes();
                }

                this.dirty_canvas = true;
                this.dragging_canvas = false;

                if (this.node_over && this.node_over.onMouseUp) {
                    this.node_over.onMouseUp(e, [
                        e.canvasX - this.node_over.pos[0],
                        e.canvasY - this.node_over.pos[1],
                    ], this);
                }
                if (
                    this.node_capturing_input &&
                    this.node_capturing_input.onMouseUp
                ) {
                    this.node_capturing_input.onMouseUp(e, [
                        e.canvasX - this.node_capturing_input.pos[0],
                        e.canvasY - this.node_capturing_input.pos[1],
                    ]);
                }
            }
        } else if (getMouseButton(e) === 2) {
            this.dirty_canvas = true;
            this.dragging_canvas = false;
        } else if (getMouseButton(e) === 3) {
            this.dirty_canvas = true;
            this.dragging_canvas = false;
        }

        if (is_primary) {
            this.pointer_is_down = false;
            this.pointer_is_double = false;
        }

        this.graph.change();

        e.stopPropagation();
        e.preventDefault();
        return false;
    }

    processMouseWheel(e) {
        if (!this.graph || !this.allow_dragcanvas) return;

        const delta =
            e.wheelDeltaY != null ? e.wheelDeltaY : e.detail * -60;

        this.adjustMouseEvent(e);

        const x = e.clientX;
        const y = e.clientY;
        const is_inside =
            !this.viewport ||
            (this.viewport &&
                x >= this.viewport[0] &&
                x < this.viewport[0] + this.viewport[2] &&
                y >= this.viewport[1] &&
                y < this.viewport[1] + this.viewport[3]);
        if (!is_inside) return;

        let scale = this.ds.scale;

        if (delta > 0) {
            scale *= 1.1;
        } else if (delta < 0) {
            scale *= 1 / 1.1;
        }

        this.ds.changeScale(scale, [e.clientX, e.clientY]);

        this.graph.change();

        e.preventDefault();
        return false;
    }

    // ==================== KEYBOARD ====================

    processKey(e) {
        if (!this.graph) return;

        let block_default = false;

        if (e.target.localName === "input") return;

        if (e.type === "keydown") {
            // Tab — search box removed, let the browser handle Tab normally

            if (e.keyCode === 32) {
                // space
                this.dragging_canvas = true;
                block_default = true;
            }

            if (e.keyCode === 27) {
                // esc
                if (this.node_panel) this.node_panel.close();
                if (this.options_panel) this.options_panel.close();
                block_default = true;
            }

            // select all Control A
            if (e.keyCode === 65 && e.ctrlKey) {
                this.selectNodes();
                block_default = true;
            }

            if (e.keyCode === 67 && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                // copy
                if (this.selected_nodes) {
                    this.copyToClipboard();
                    block_default = true;
                }
            }

            if (e.keyCode === 86 && (e.metaKey || e.ctrlKey)) {
                // paste
                this.pasteFromClipboard(e.shiftKey);
            }

            // delete or backspace
            if (e.keyCode === 46 || e.keyCode === 8) {
                if (
                    e.target.localName !== "input" &&
                    e.target.localName !== "textarea"
                ) {
                    this.deleteSelectedNodes();
                    block_default = true;
                }
            }

            if (this.selected_nodes) {
                for (const i in this.selected_nodes) {
                    if (this.selected_nodes[i].onKeyDown) {
                        this.selected_nodes[i].onKeyDown(e);
                    }
                }
            }
        } else if (e.type === "keyup") {
            if (e.keyCode === 32) {
                this.dragging_canvas = false;
            }

            if (this.selected_nodes) {
                for (const i in this.selected_nodes) {
                    if (this.selected_nodes[i].onKeyUp) {
                        this.selected_nodes[i].onKeyUp(e);
                    }
                }
            }
        }

        this.graph.change();

        if (block_default) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return false;
        }
    }

    // ==================== CLIPBOARD ====================

    copyToClipboard() {
        const clipboard_info = {
            nodes: [],
            links: [],
        };
        let index = 0;
        const selected_nodes_array = [];
        for (const i in this.selected_nodes) {
            const node = this.selected_nodes[i];
            if (node.clonable === false) continue;
            node._relative_id = index;
            selected_nodes_array.push(node);
            index += 1;
        }

        for (let i = 0; i < selected_nodes_array.length; ++i) {
            const node = selected_nodes_array[i];
            if (node.clonable === false) continue;
            const cloned = node.clone();
            if (!cloned) {
                console.warn("node type not found: " + node.type);
                continue;
            }
            clipboard_info.nodes.push(cloned.serialize());
            if (node.inputs && node.inputs.length) {
                for (let j = 0; j < node.inputs.length; ++j) {
                    const input = node.inputs[j];
                    if (!input || input.link == null) continue;
                    const link_info = this.graph.links[input.link];
                    if (!link_info) continue;
                    const target_node = this.graph.getNodeById(
                        link_info.origin_id
                    );
                    if (!target_node) continue;
                    clipboard_info.links.push([
                        target_node._relative_id,
                        link_info.origin_slot,
                        node._relative_id,
                        link_info.target_slot,
                        target_node.id,
                    ]);
                }
            }
        }
        localStorage.setItem(
            "litegrapheditor_clipboard",
            JSON.stringify(clipboard_info)
        );
    }

    pasteFromClipboard(isConnectUnselected = false) {
        if (
            !LiteGraph.ctrl_shift_v_paste_connect_unselected_outputs &&
            isConnectUnselected
        ) {
            return;
        }
        const data = localStorage.getItem("litegrapheditor_clipboard");
        if (!data) return;

        this.graph.beforeChange();

        const clipboard_info = JSON.parse(data);
        let posMin = false;
        for (let i = 0; i < clipboard_info.nodes.length; ++i) {
            if (posMin) {
                if (posMin[0] > clipboard_info.nodes[i].pos[0])
                    posMin[0] = clipboard_info.nodes[i].pos[0];
                if (posMin[1] > clipboard_info.nodes[i].pos[1])
                    posMin[1] = clipboard_info.nodes[i].pos[1];
            } else {
                posMin = [
                    clipboard_info.nodes[i].pos[0],
                    clipboard_info.nodes[i].pos[1],
                ];
            }
        }
        const nodes = [];
        for (let i = 0; i < clipboard_info.nodes.length; ++i) {
            const node_data = clipboard_info.nodes[i];
            const node = LiteGraph.createNode(node_data.type);
            if (node) {
                node.configure(node_data);
                node.pos[0] += this.graph_mouse[0] - posMin[0];
                node.pos[1] += this.graph_mouse[1] - posMin[1];
                this.graph.add(node, { doProcessChange: false });
                nodes.push(node);
            }
        }

        // create links
        for (let i = 0; i < clipboard_info.links.length; ++i) {
            const link_info = clipboard_info.links[i];
            let origin_node;
            const origin_node_relative_id = link_info[0];
            if (origin_node_relative_id != null) {
                origin_node = nodes[origin_node_relative_id];
            } else if (
                LiteGraph.ctrl_shift_v_paste_connect_unselected_outputs &&
                isConnectUnselected
            ) {
                const origin_node_id = link_info[4];
                if (origin_node_id) {
                    origin_node = this.graph.getNodeById(origin_node_id);
                }
            }
            const target_node = nodes[link_info[2]];
            if (origin_node && target_node)
                origin_node.connect(link_info[1], target_node, link_info[3]);
            else console.warn("Warning, nodes missing on pasting");
        }

        this.selectNodes(nodes);

        this.graph.afterChange();
    }

    // ==================== DROP HANDLING ====================

    processDrop(e) {
        e.preventDefault();
        this.adjustMouseEvent(e);
        const x = e.clientX;
        const y = e.clientY;
        const is_inside =
            !this.viewport ||
            (this.viewport &&
                x >= this.viewport[0] &&
                x < this.viewport[0] + this.viewport[2] &&
                y >= this.viewport[1] &&
                y < this.viewport[1] + this.viewport[3]);
        if (!is_inside) return;

        const pos = [e.canvasX, e.canvasY];
        const node = this.graph
            ? this.graph.getNodeOnPos(pos[0], pos[1])
            : null;

        if (!node) {
            let r = null;
            if (this.onDropItem) {
                r = this.onDropItem(event);
            }
            if (!r) {
                this.checkDropItem(e);
            }
            return;
        }

        if (node.onDropFile || node.onDropData) {
            const files = e.dataTransfer.files;
            if (files && files.length) {
                for (let i = 0; i < files.length; i++) {
                    const file = e.dataTransfer.files[0];
                    const filename = file.name;
                    const ext = LGraphCanvas.getFileExtension(filename);

                    if (node.onDropFile) {
                        node.onDropFile(file);
                    }

                    if (node.onDropData) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const data = event.target.result;
                            node.onDropData(data, filename, file);
                        };
                        const type = file.type.split("/")[0];
                        if (type === "text" || type === "") {
                            reader.readAsText(file);
                        } else if (type === "image") {
                            reader.readAsDataURL(file);
                        } else {
                            reader.readAsArrayBuffer(file);
                        }
                    }
                }
            }
        }

        if (node.onDropItem) {
            if (node.onDropItem(event)) return true;
        }

        if (this.onDropItem) {
            return this.onDropItem(event);
        }

        return false;
    }

    checkDropItem(e) {
        if (e.dataTransfer.files.length) {
            const file = e.dataTransfer.files[0];
            const ext = LGraphCanvas.getFileExtension(file.name).toLowerCase();
            const nodetype = LiteGraph.node_types_by_file_extension[ext];
            if (nodetype) {
                this.graph.beforeChange();
                const node = LiteGraph.createNode(nodetype.type);
                node.pos = [e.canvasX, e.canvasY];
                this.graph.add(node);
                if (node.onDropFile) {
                    node.onDropFile(file);
                }
                this.graph.afterChange();
            }
        }
    }

    static getFileExtension(url) {
        let question = url.indexOf("?");
        if (question !== -1) url = url.substr(0, question);
        const point = url.lastIndexOf(".");
        if (point === -1) return "";
        return url.substr(point + 1).toLowerCase();
    }

    // ==================== NODE INTERACTION ====================

    processNodeDblClicked(n) {
        // Panel popup removed — previously this called showShowNodePanel(n)
        // which opened a property editor dialog. Hosts should provide their
        // own property editor UI (e.g. the PropertyEditor sidebar in page.tsx).
        // The onNodeDblClicked callback is preserved so hosts can hook in.
        if (this.onNodeDblClicked) {
            this.onNodeDblClicked(n);
        }
        this.setDirty(true);
    }

    processNodeSelected(node, e) {
        this.selectNode(
            node,
            e && (e.shiftKey || e.ctrlKey || this.multi_select)
        );
        if (this.onNodeSelected) {
            this.onNodeSelected(node);
        }
    }

    // ==================== SELECTION ====================

    selectNode(node, add_to_current_selection) {
        if (node == null) {
            this.deselectAllNodes();
        } else {
            this.selectNodes([node], add_to_current_selection);
        }
    }

    selectNodes(nodes, add_to_current_selection) {
        if (!add_to_current_selection) {
            this.deselectAllNodes();
        }

        nodes = nodes || this.graph._nodes;
        if (typeof nodes === "string") nodes = [nodes];
        for (const i in nodes) {
            const node = nodes[i];
            if (node.is_selected) {
                this.deselectNode(node);
                continue;
            }

            if (!node.is_selected && node.onSelected) {
                node.onSelected();
            }
            node.is_selected = true;
            this.selected_nodes[node.id] = node;

            if (node.inputs) {
                for (let j = 0; j < node.inputs.length; ++j) {
                    this.highlighted_links[node.inputs[j].link] = true;
                }
            }
            if (node.outputs) {
                for (let j = 0; j < node.outputs.length; ++j) {
                    const out = node.outputs[j];
                    if (out.links) {
                        for (let k = 0; k < out.links.length; ++k) {
                            this.highlighted_links[out.links[k]] = true;
                        }
                    }
                }
            }
        }

        if (this.onSelectionChange)
            this.onSelectionChange(this.selected_nodes);

        this.setDirty(true);
    }

    deselectNode(node) {
        if (!node.is_selected) return;
        if (node.onDeselected) {
            node.onDeselected();
        }
        node.is_selected = false;

        if (this.onNodeDeselected) {
            this.onNodeDeselected(node);
        }

        if (node.inputs) {
            for (let i = 0; i < node.inputs.length; ++i) {
                delete this.highlighted_links[node.inputs[i].link];
            }
        }
        if (node.outputs) {
            for (let i = 0; i < node.outputs.length; ++i) {
                const out = node.outputs[i];
                if (out.links) {
                    for (let j = 0; j < out.links.length; ++j) {
                        delete this.highlighted_links[out.links[j]];
                    }
                }
            }
        }
    }

    deselectAllNodes() {
        if (!this.graph) return;
        const nodes = this.graph._nodes;
        for (let i = 0, l = nodes.length; i < l; ++i) {
            const node = nodes[i];
            if (!node.is_selected) continue;
            if (node.onDeselected) {
                node.onDeselected();
            }
            node.is_selected = false;
            if (this.onNodeDeselected) {
                this.onNodeDeselected(node);
            }
        }
        this.selected_nodes = {};
        this.current_node = null;
        this.highlighted_links = {};
        if (this.onSelectionChange)
            this.onSelectionChange(this.selected_nodes);
        this.setDirty(true);
    }

    deleteSelectedNodes() {
        this.graph.beforeChange();

        for (const i in this.selected_nodes) {
            const node = this.selected_nodes[i];
            if (node.block_delete) continue;

            // autoconnect when possible
            if (
                node.inputs &&
                node.inputs.length &&
                node.outputs &&
                node.outputs.length &&
                LiteGraph.isValidConnection(
                    node.inputs[0].type,
                    node.outputs[0].type
                ) &&
                node.inputs[0].link &&
                node.outputs[0].links &&
                node.outputs[0].links.length
            ) {
                const input_link = node.graph.links[node.inputs[0].link];
                const output_link =
                    node.graph.links[node.outputs[0].links[0]];
                const input_node = node.getInputNode(0);
                const output_node = node.getOutputNodes(0)[0];
                if (input_node && output_node)
                    input_node.connect(
                        input_link.origin_slot,
                        output_node,
                        output_link.target_slot
                    );
            }
            this.graph.remove(node);
            if (this.onNodeDeselected) {
                this.onNodeDeselected(node);
            }
        }
        this.selected_nodes = {};
        this.current_node = null;
        this.highlighted_links = {};
        this.setDirty(true);
        this.graph.afterChange();
    }

    // ==================== UTILITY ====================

    /** centers the camera on a given node */
    centerOnNode(node) {
        this.ds.offset[0] =
            -node.pos[0] -
            node.size[0] * 0.5 +
            (this.canvas.width * 0.5) / this.ds.scale;
        this.ds.offset[1] =
            -node.pos[1] -
            node.size[1] * 0.5 +
            (this.canvas.height * 0.5) / this.ds.scale;
        this.setDirty(true, true);
    }

    /** adds some useful properties to a mouse event */
    adjustMouseEvent(e) {
        let clientX_rel = 0;
        let clientY_rel = 0;

        if (this.canvas) {
            const b = this.canvas.getBoundingClientRect();
            clientX_rel = e.clientX - b.left;
            clientY_rel = e.clientY - b.top;
        } else {
            clientX_rel = e.clientX;
            clientY_rel = e.clientY;
        }

        this.last_mouse_position[0] = clientX_rel;
        this.last_mouse_position[1] = clientY_rel;

        e.canvasX = clientX_rel / this.ds.scale - this.ds.offset[0];
        e.canvasY = clientY_rel / this.ds.scale - this.ds.offset[1];
    }

    setZoom(value, zooming_center) {
        this.ds.changeScale(value, zooming_center);
        this.dirty_canvas = true;
        this.dirty_bgcanvas = true;
    }

    convertOffsetToCanvas(pos, out) {
        return this.ds.convertOffsetToCanvas(pos, out);
    }

    convertCanvasToOffset(pos, out) {
        return this.ds.convertCanvasToOffset(pos, out);
    }

    convertEventToCanvasOffset(e) {
        const rect = this.canvas.getBoundingClientRect();
        return this.convertCanvasToOffset([
            e.clientX - rect.left,
            e.clientY - rect.top,
        ]);
    }

    bringToFront(node) {
        const i = this.graph._nodes.indexOf(node);
        if (i === -1) return;
        this.graph._nodes.splice(i, 1);
        this.graph._nodes.push(node);
    }

    sendToBack(node) {
        const i = this.graph._nodes.indexOf(node);
        if (i === -1) return;
        this.graph._nodes.splice(i, 1);
        this.graph._nodes.unshift(node);
    }

    /**
     * Returns the title-collapse-box rectangle for `node` in canvas (world)
     * coordinates: [x, y, w, h]. Used by BOTH the hit-test (isOverNodeBox)
     * and the renderer (drawNodeShape) so the visual box and the click
     * target can NEVER drift apart.
     *
     * Layout (matches the original visual rendering at drawNodeShape):
     *   - The box is drawn in node-local coords centered at
     *     (title_height*0.5, -title_height*0.5) with size box_size (10).
     *   - We add a `hitPadding` (6px) around the visual box for the hit
     *     rect so the click target is forgiving on high-DPI / small nodes,
     *     but the CENTER is always identical to the drawn box.
     *
     * @param {LGraphNode} node
     * @param {boolean} forHit  when true, returns the expanded hit rect;
     *                          when false, returns the exact drawn rect.
     * @returns {[number, number, number, number]} [x, y, w, h] in world coords
     */
    getNodeBoxRect(node, forHit = true) {
        const th = LiteGraph.NODE_TITLE_HEIGHT;
        const boxSize = 10;
        // Visual box center in node-local coords: (th*0.5, -th*0.5)
        // → world coords: (node.pos[0] + th*0.5, node.pos[1] - th*0.5)
        const cx = node.pos[0] + th * 0.5;
        const cy = node.pos[1] - th * 0.5;
        if (forHit) {
            const hitPad = 6;
            const half = boxSize * 0.5 + hitPad;
            return [cx - half, cy - half, half * 2, half * 2];
        }
        const half = boxSize * 0.5;
        return [cx - half, cy - half, half * 2, half * 2];
    }

    isOverNodeBox(node, canvasx, canvasy) {
        // Use the shared rect so the hit region is ALWAYS aligned with the
        // drawn box. Previous hard-coded `[node.pos[0]+2, node.pos[1]+2-th,
        // th-4, th-4]` could drift from the drawn box after layout changes.
        const r = this.getNodeBoxRect(node, true);
        return isInsideRectangle(canvasx, canvasy, r[0], r[1], r[2], r[3]);
    }

    isOverNodeInput(node, canvasx, canvasy, slot_pos) {
        if (node.inputs) {
            for (let i = 0, l = node.inputs.length; i < l; ++i) {
                const link_pos = node.getConnectionPos(true, i);
                let is_inside = false;
                if (node.horizontal) {
                    is_inside = isInsideRectangle(
                        canvasx,
                        canvasy,
                        link_pos[0] - 5,
                        link_pos[1] - 10,
                        10,
                        20
                    );
                } else {
                    is_inside = isInsideRectangle(
                        canvasx,
                        canvasy,
                        link_pos[0] - 10,
                        link_pos[1] - 5,
                        40,
                        10
                    );
                }
                if (is_inside) {
                    if (slot_pos) {
                        slot_pos[0] = link_pos[0];
                        slot_pos[1] = link_pos[1];
                    }
                    return i;
                }
            }
        }
        return -1;
    }

    isOverNodeOutput(node, canvasx, canvasy, slot_pos) {
        if (node.outputs) {
            for (let i = 0, l = node.outputs.length; i < l; ++i) {
                const link_pos = node.getConnectionPos(false, i);
                let is_inside = false;
                if (node.horizontal) {
                    is_inside = isInsideRectangle(
                        canvasx,
                        canvasy,
                        link_pos[0] - 5,
                        link_pos[1] - 10,
                        10,
                        20
                    );
                } else {
                    is_inside = isInsideRectangle(
                        canvasx,
                        canvasy,
                        link_pos[0] - 10,
                        link_pos[1] - 5,
                        40,
                        10
                    );
                }
                if (is_inside) {
                    if (slot_pos) {
                        slot_pos[0] = link_pos[0];
                        slot_pos[1] = link_pos[1];
                    }
                    return i;
                }
            }
        }
        return -1;
    }

    // ==================== RENDERING: MAIN LOOP ====================

    /** checks which nodes are visible (inside the camera area) */
    computeVisibleNodes(nodes, out) {
        const visible_nodes = out || [];
        visible_nodes.length = 0;
        nodes = nodes || this.graph._nodes;
        for (let i = 0, l = nodes.length; i < l; ++i) {
            const n = nodes[i];
            if (
                this.live_mode &&
                !n.onDrawBackground &&
                !n.onDrawForeground
            ) {
                continue;
            }
            if (!overlapBounding(this.visible_area, n.getBounding(temp, true))) {
                continue;
            }
            visible_nodes.push(n);
        }
        return visible_nodes;
    }

    /** renders the whole canvas content */
    draw(force_canvas, force_bgcanvas) {
        if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0)
            return;

        // fps counting
        const now = getTime();
        this.render_time = (now - this.last_draw_time) * 0.001;
        this.last_draw_time = now;

        if (this.graph) {
            this.ds.computeVisibleArea(this.viewport);
        }

        if (
            this.dirty_bgcanvas ||
            force_bgcanvas ||
            this.always_render_background
        ) {
            this.drawBackCanvas();
        }

        if (this.dirty_canvas || force_canvas) {
            this.drawFrontCanvas();
        }

        this.fps = this.render_time ? 1.0 / this.render_time : 0;
        this.frame += 1;
    }

    // ==================== RENDERING: FRONT CANVAS ====================

    /** draws the front canvas (the one containing all the nodes) */
    drawFrontCanvas() {
        this.dirty_canvas = false;

        if (!this.ctx) {
            this.ctx = this.bgcanvas.getContext("2d");
        }
        const ctx = this.ctx;
        if (!ctx) return;

        const canvas = this.canvas;
        if (ctx.start2D && !this.viewport) {
            ctx.start2D();
            ctx.restore();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }

        // clip dirty area if there is one
        const area = this.viewport || this.dirty_area;
        if (area) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(area[0], area[1], area[2], area[3]);
            ctx.clip();
        }

        // clear
        if (this.clear_background) {
            if (area) ctx.clearRect(area[0], area[1], area[2], area[3]);
            else ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // draw bg canvas
        if (this.bgcanvas === this.canvas) {
            this.drawBackCanvas();
        } else {
            ctx.drawImage(this.bgcanvas, 0, 0);
        }

        // rendering
        if (this.onRender) {
            this.onRender(canvas, ctx);
        }

        // info widget
        if (this.show_info) {
            this.renderInfo(ctx, area ? area[0] : 0, area ? area[1] : 0);
        }

        if (this.graph) {
            ctx.save();
            this.ds.toCanvasContext(ctx);

            // draw nodes
            const visible_nodes = this.computeVisibleNodes(
                null,
                this.visible_nodes
            );

            for (let i = 0; i < visible_nodes.length; ++i) {
                const node = visible_nodes[i];
                ctx.save();
                ctx.translate(node.pos[0], node.pos[1]);
                this.drawNode(node, ctx);
                ctx.restore();
            }

            // execution order (debug)
            if (this.render_execution_order) {
                this.drawExecutionOrder(ctx);
            }

            // connections ontop?
            if (this.graph.config.links_ontop) {
                if (!this.live_mode) {
                    this.drawConnections(ctx);
                }
            }

            // current connection (the one being dragged by the mouse)
            if (this.connecting_pos != null) {
                ctx.lineWidth = this.connections_width;
                let link_color = null;

                const connInOrOut =
                    this.connecting_output || this.connecting_input;
                const connType = connInOrOut.type;
                let connDir = connInOrOut.dir;
                if (connDir == null) {
                    if (this.connecting_output)
                        connDir = this.connecting_node.horizontal
                            ? LiteGraph.DOWN
                            : LiteGraph.RIGHT;
                    else
                        connDir = this.connecting_node.horizontal
                            ? LiteGraph.UP
                            : LiteGraph.LEFT;
                }
                const connShape = connInOrOut.shape;

                // EVENT link color branch removed (EVENT/ACTION model deleted)
                link_color = LiteGraph.CONNECTING_LINK_COLOR;

                // the connection being dragged by the mouse
                this.renderLink(
                    ctx,
                    this.connecting_pos,
                    [this.graph_mouse[0], this.graph_mouse[1]],
                    null,
                    false,
                    null,
                    link_color,
                    connDir,
                    LiteGraph.CENTER
                );

                ctx.beginPath();
                if (connShape === LiteGraph.BOX_SHAPE) {
                    ctx.rect(
                        this.connecting_pos[0] - 6 + 0.5,
                        this.connecting_pos[1] - 5 + 0.5,
                        14,
                        10
                    );
                    ctx.fill();
                    ctx.beginPath();
                    ctx.rect(
                        this.graph_mouse[0] - 6 + 0.5,
                        this.graph_mouse[1] - 5 + 0.5,
                        14,
                        10
                    );
                } else if (connShape === LiteGraph.ARROW_SHAPE) {
                    ctx.moveTo(
                        this.connecting_pos[0] + 8,
                        this.connecting_pos[1] + 0.5
                    );
                    ctx.lineTo(
                        this.connecting_pos[0] - 4,
                        this.connecting_pos[1] + 6 + 0.5
                    );
                    ctx.lineTo(
                        this.connecting_pos[0] - 4,
                        this.connecting_pos[1] - 6 + 0.5
                    );
                    ctx.closePath();
                } else {
                    ctx.arc(
                        this.connecting_pos[0],
                        this.connecting_pos[1],
                        4,
                        0,
                        Math.PI * 2
                    );
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(
                        this.graph_mouse[0],
                        this.graph_mouse[1],
                        4,
                        0,
                        Math.PI * 2
                    );
                }
                ctx.fill();

                ctx.fillStyle = "#ffcc00";
                // `shape` declared outside both blocks so the highlight-output branch
                // can read the value set by the highlight-input branch (matches the
                // original `var shape` function-scoped behaviour).
                let shape = null;
                if (this._highlight_input) {
                    ctx.beginPath();
                    shape = this._highlight_input_slot
                        ? this._highlight_input_slot.shape
                        : null;
                    if (shape === LiteGraph.ARROW_SHAPE) {
                        ctx.moveTo(
                            this._highlight_input[0] + 8,
                            this._highlight_input[1] + 0.5
                        );
                        ctx.lineTo(
                            this._highlight_input[0] - 4,
                            this._highlight_input[1] + 6 + 0.5
                        );
                        ctx.lineTo(
                            this._highlight_input[0] - 4,
                            this._highlight_input[1] - 6 + 0.5
                        );
                        ctx.closePath();
                    } else {
                        ctx.arc(
                            this._highlight_input[0],
                            this._highlight_input[1],
                            6,
                            0,
                            Math.PI * 2
                        );
                    }
                    ctx.fill();
                }
                if (this._highlight_output) {
                    ctx.beginPath();
                    if (shape === LiteGraph.ARROW_SHAPE) {
                        ctx.moveTo(
                            this._highlight_output[0] + 8,
                            this._highlight_output[1] + 0.5
                        );
                        ctx.lineTo(
                            this._highlight_output[0] - 4,
                            this._highlight_output[1] + 6 + 0.5
                        );
                        ctx.lineTo(
                            this._highlight_output[0] - 4,
                            this._highlight_output[1] - 6 + 0.5
                        );
                        ctx.closePath();
                    } else {
                        ctx.arc(
                            this._highlight_output[0],
                            this._highlight_output[1],
                            6,
                            0,
                            Math.PI * 2
                        );
                    }
                    ctx.fill();
                }
            }

            // the selection rectangle
            if (this.dragging_rectangle) {
                ctx.strokeStyle = "#FFF";
                ctx.strokeRect(
                    this.dragging_rectangle[0],
                    this.dragging_rectangle[1],
                    this.dragging_rectangle[2],
                    this.dragging_rectangle[3]
                );
            }

            // on top of link center
            if (this.over_link_center && this.render_link_tooltip)
                this.drawLinkTooltip(ctx, this.over_link_center);
            else if (this.onDrawLinkTooltip) this.onDrawLinkTooltip(ctx, null);

            // custom info
            if (this.onDrawForeground) {
                this.onDrawForeground(ctx, this.visible_rect);
            }

            ctx.restore();
        }

        // draws panel in the corner
        if (this._graph_stack && this._graph_stack.length) {
            this.drawSubgraphPanel(ctx);
        }

        if (this.onDrawOverlay) {
            this.onDrawOverlay(ctx);
        }

        if (area) {
            ctx.restore();
        }

        if (ctx.finish2D) {
            ctx.finish2D();
        }
    }

    // ==================== RENDERING: BACK CANVAS ====================

    /** draws the back canvas (the one containing the background and the connections) */
    drawBackCanvas() {
        const canvas = this.bgcanvas;
        if (
            canvas.width !== this.canvas.width ||
            canvas.height !== this.canvas.height
        ) {
            canvas.width = this.canvas.width;
            canvas.height = this.canvas.height;
        }

        if (!this.bgctx) {
            this.bgctx = this.bgcanvas.getContext("2d");
        }
        const ctx = this.bgctx;
        if (ctx.start) ctx.start();

        const viewport = this.viewport || [
            0,
            0,
            ctx.canvas.width,
            ctx.canvas.height,
        ];

        // clear
        if (this.clear_background) {
            ctx.clearRect(viewport[0], viewport[1], viewport[2], viewport[3]);
        }

        // show subgraph stack header
        if (this._graph_stack && this._graph_stack.length) {
            ctx.save();
            const subgraph_node = this.graph._subgraph_node;
            ctx.strokeStyle = subgraph_node.bgcolor;
            ctx.lineWidth = 10;
            ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
            ctx.lineWidth = 1;
            ctx.font = "40px Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = subgraph_node.bgcolor || "#AAA";
            let title = "";
            for (let i = 1; i < this._graph_stack.length; ++i) {
                title +=
                    this._graph_stack[i]._subgraph_node.getTitle() + " >> ";
            }
            ctx.fillText(
                title + subgraph_node.getTitle(),
                canvas.width * 0.5,
                40
            );
            ctx.restore();
        }

        const bg_already_painted = this.onRenderBackground
            ? this.onRenderBackground(canvas, ctx)
            : false;

        // reset in case of error
        if (!this.viewport) {
            ctx.restore();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        this.visible_links.length = 0;

        if (this.graph) {
            ctx.save();
            this.ds.toCanvasContext(ctx);

            // render BG
            if (
                this.ds.scale < 1.5 &&
                !bg_already_painted &&
                this.clear_background_color
            ) {
                ctx.fillStyle = this.clear_background_color;
                ctx.fillRect(
                    this.visible_area[0],
                    this.visible_area[1],
                    this.visible_area[2],
                    this.visible_area[3]
                );
            }

            if (
                this.background_image &&
                this.ds.scale > 0.5 &&
                !bg_already_painted
            ) {
                if (this.zoom_modify_alpha) {
                    ctx.globalAlpha =
                        (1.0 - 0.5 / this.ds.scale) * this.editor_alpha;
                } else {
                    ctx.globalAlpha = this.editor_alpha;
                }
                ctx.imageSmoothingEnabled = false;
                if (
                    !this._bg_img ||
                    this._bg_img.name !== this.background_image
                ) {
                    this._bg_img = new Image();
                    this._bg_img.name = this.background_image;
                    this._bg_img.src = this.background_image;
                    this._bg_img.onload = () => {
                        this.draw(true, true);
                    };
                }

                let pattern = null;
                if (this._pattern == null && this._bg_img.width > 0) {
                    pattern = ctx.createPattern(this._bg_img, "repeat");
                    this._pattern_img = this._bg_img;
                    this._pattern = pattern;
                } else {
                    pattern = this._pattern;
                }
                if (pattern) {
                    ctx.fillStyle = pattern;
                    ctx.fillRect(
                        this.visible_area[0],
                        this.visible_area[1],
                        this.visible_area[2],
                        this.visible_area[3]
                    );
                    ctx.fillStyle = "transparent";
                }

                ctx.globalAlpha = 1.0;
                ctx.imageSmoothingEnabled = true;
            }

            // groups
            if (this.graph._groups.length && !this.live_mode) {
                this.drawGroups(canvas, ctx);
            }

            if (this.onDrawBackground) {
                this.onDrawBackground(ctx, this.visible_area);
            }

            // bg border
            if (this.render_canvas_border) {
                ctx.strokeStyle = "#235";
                ctx.strokeRect(0, 0, canvas.width, canvas.height);
            }

            if (this.render_connections_shadows) {
                ctx.shadowColor = "#000";
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.shadowBlur = 6;
            } else {
                ctx.shadowColor = "rgba(0,0,0,0)";
            }

            // draw connections
            if (!this.live_mode) {
                this.drawConnections(ctx);
            }

            ctx.shadowColor = "rgba(0,0,0,0)";

            ctx.restore();
        }

        if (ctx.finish) ctx.finish();

        this.dirty_bgcanvas = false;
        this.dirty_canvas = true;
    }

    // ==================== RENDERING: DRAW NODE ====================

    /** draws the given node inside the canvas */
    drawNode(node, ctx) {
        this.current_node = node;

        let color =
            node.color ||
            node.constructor.color ||
            LiteGraph.NODE_DEFAULT_COLOR;
        let bgcolor =
            node.bgcolor ||
            node.constructor.bgcolor ||
            LiteGraph.NODE_DEFAULT_BGCOLOR;

        const low_quality = this.ds.scale < 0.6;

        // only render if it forces it to do it
        if (this.live_mode) {
            if (!node.flags.collapsed) {
                ctx.shadowColor = "transparent";
                if (node.onDrawForeground) {
                    node.onDrawForeground(ctx, this, this.canvas);
                }
            }
            return;
        }

        const editor_alpha = this.editor_alpha;
        ctx.globalAlpha = editor_alpha;

        if (this.render_shadows && !low_quality) {
            ctx.shadowColor = LiteGraph.DEFAULT_SHADOW_COLOR;
            ctx.shadowOffsetX = 2 * this.ds.scale;
            ctx.shadowOffsetY = 2 * this.ds.scale;
            ctx.shadowBlur = 3 * this.ds.scale;
        } else {
            ctx.shadowColor = "transparent";
        }

        // custom draw collapsed method
        if (
            node.flags.collapsed &&
            node.onDrawCollapsed &&
            node.onDrawCollapsed(ctx, this) === true
        ) {
            return;
        }

        // clip if required (mask)
        const shape = node._shape || LiteGraph.BOX_SHAPE;
        const size = temp_vec2;
        temp_vec2.set(node.size);
        const horizontal = node.horizontal;

        if (node.flags.collapsed) {
            ctx.font = this.inner_text_font;
            const title = node.getTitle ? node.getTitle() : node.title;
            if (title != null) {
                node._collapsed_width = Math.min(
                    node.size[0],
                    ctx.measureText(title).width +
                        LiteGraph.NODE_TITLE_HEIGHT * 2
                );
                size[0] = node._collapsed_width;
                size[1] = 0;
            }
        }

        if (node.clip_area) {
            ctx.save();
            ctx.beginPath();
            if (shape === LiteGraph.BOX_SHAPE) {
                ctx.rect(0, 0, size[0], size[1]);
            } else if (shape === LiteGraph.ROUND_SHAPE) {
                ctx.roundRect(0, 0, size[0], size[1], [10]);
            } else if (shape === LiteGraph.CIRCLE_SHAPE) {
                ctx.arc(
                    size[0] * 0.5,
                    size[1] * 0.5,
                    size[0] * 0.5,
                    0,
                    Math.PI * 2
                );
            }
            ctx.clip();
        }

        // draw shape
        if (node.has_errors) {
            bgcolor = "red";
        }
        this.drawNodeShape(
            node,
            ctx,
            size,
            color,
            bgcolor,
            node.is_selected,
            node.mouseOver
        );
        ctx.shadowColor = "transparent";

        // draw foreground
        if (node.onDrawForeground) {
            node.onDrawForeground(ctx, this, this.canvas);
        }

        // connection slots
        ctx.textAlign = horizontal ? "center" : "left";
        ctx.font = this.inner_text_font;

        const render_text = !low_quality;

        const out_slot = this.connecting_output;
        const in_slot = this.connecting_input;
        ctx.lineWidth = 1;

        let max_y = 0;
        const slot_pos = new Float32Array(2);

        // render inputs and outputs
        if (!node.flags.collapsed) {
            // input connection slots
            if (node.inputs) {
                for (let i = 0; i < node.inputs.length; i++) {
                    const slot = node.inputs[i];
                    const slot_type = slot.type;
                    let slot_shape = slot.shape;

                    ctx.globalAlpha = editor_alpha;
                    // change opacity of incompatible slots when dragging a connection
                    if (
                        this.connecting_output &&
                        !LiteGraph.isValidConnection(slot.type, out_slot.type)
                    ) {
                        ctx.globalAlpha = 0.4 * editor_alpha;
                    }

                    ctx.fillStyle =
                        slot.link != null
                            ? slot.color_on ||
                              this.default_connection_color_byType[slot_type] ||
                              this.default_connection_color.input_on
                            : slot.color_off ||
                              this.default_connection_color_byTypeOff[slot_type] ||
                              this.default_connection_color_byType[slot_type] ||
                              this.default_connection_color.input_off;

                    const pos = node.getConnectionPos(true, i, slot_pos);
                    pos[0] -= node.pos[0];
                    pos[1] -= node.pos[1];
                    if (
                        max_y <
                        pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5
                    ) {
                        max_y =
                            pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5;
                    }

                    ctx.beginPath();

                    if (slot_type === "array") {
                        slot_shape = LiteGraph.GRID_SHAPE;
                    }

                    let doStroke = true;

                    if (slot_shape === LiteGraph.BOX_SHAPE) {
                        if (horizontal) {
                            ctx.rect(
                                pos[0] - 5 + 0.5,
                                pos[1] - 8 + 0.5,
                                10,
                                14
                            );
                        } else {
                            ctx.rect(
                                pos[0] - 6 + 0.5,
                                pos[1] - 5 + 0.5,
                                14,
                                10
                            );
                        }
                    } else if (slot_shape === LiteGraph.ARROW_SHAPE) {
                        ctx.moveTo(pos[0] + 8, pos[1] + 0.5);
                        ctx.lineTo(pos[0] - 4, pos[1] + 6 + 0.5);
                        ctx.lineTo(pos[0] - 4, pos[1] - 6 + 0.5);
                        ctx.closePath();
                    } else if (slot_shape === LiteGraph.GRID_SHAPE) {
                        ctx.rect(pos[0] - 4, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] - 4, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] - 4, pos[1] + 2, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] + 2, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] + 2, 2, 2);
                        doStroke = false;
                    } else {
                        if (low_quality)
                            ctx.rect(pos[0] - 4, pos[1] - 4, 8, 8);
                        else ctx.arc(pos[0], pos[1], 4, 0, Math.PI * 2);
                    }
                    ctx.fill();

                    // render name
                    if (render_text) {
                        const text =
                            slot.label != null ? slot.label : slot.name;
                        if (text) {
                            ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
                            if (horizontal || slot.dir === LiteGraph.UP) {
                                ctx.fillText(text, pos[0], pos[1] - 10);
                            } else {
                                ctx.fillText(text, pos[0] + 10, pos[1] + 5);
                            }
                        }
                    }
                }
            }

            // output connection slots
            ctx.textAlign = horizontal ? "center" : "right";
            ctx.strokeStyle = "black";
            if (node.outputs) {
                for (let i = 0; i < node.outputs.length; i++) {
                    const slot = node.outputs[i];
                    const slot_type = slot.type;
                    let slot_shape = slot.shape;

                    // change opacity of incompatible slots when dragging a connection
                    if (
                        this.connecting_input &&
                        !LiteGraph.isValidConnection(slot_type, in_slot.type)
                    ) {
                        ctx.globalAlpha = 0.4 * editor_alpha;
                    }

                    const pos = node.getConnectionPos(false, i, slot_pos);
                    pos[0] -= node.pos[0];
                    pos[1] -= node.pos[1];
                    if (
                        max_y <
                        pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5
                    ) {
                        max_y =
                            pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5;
                    }

                    ctx.fillStyle =
                        slot.links && slot.links.length
                            ? slot.color_on ||
                              this.default_connection_color_byType[slot_type] ||
                              this.default_connection_color.output_on
                            : slot.color_off ||
                              this.default_connection_color_byTypeOff[slot_type] ||
                              this.default_connection_color_byType[slot_type] ||
                              this.default_connection_color.output_off;
                    ctx.beginPath();

                    if (slot_type === "array") {
                        slot_shape = LiteGraph.GRID_SHAPE;
                    }

                    let doStroke = true;

                    if (slot_shape === LiteGraph.BOX_SHAPE) {
                        if (horizontal) {
                            ctx.rect(
                                pos[0] - 5 + 0.5,
                                pos[1] - 8 + 0.5,
                                10,
                                14
                            );
                        } else {
                            ctx.rect(
                                pos[0] - 6 + 0.5,
                                pos[1] - 5 + 0.5,
                                14,
                                10
                            );
                        }
                    } else if (slot_shape === LiteGraph.ARROW_SHAPE) {
                        ctx.moveTo(pos[0] + 8, pos[1] + 0.5);
                        ctx.lineTo(pos[0] - 4, pos[1] + 6 + 0.5);
                        ctx.lineTo(pos[0] - 4, pos[1] - 6 + 0.5);
                        ctx.closePath();
                    } else if (slot_shape === LiteGraph.GRID_SHAPE) {
                        ctx.rect(pos[0] - 4, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] - 4, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] - 4, pos[1] + 2, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] + 2, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] + 2, 2, 2);
                        doStroke = false;
                    } else {
                        if (low_quality)
                            ctx.rect(pos[0] - 4, pos[1] - 4, 8, 8);
                        else ctx.arc(pos[0], pos[1], 4, 0, Math.PI * 2);
                    }

                    ctx.fill();
                    if (!low_quality && doStroke) ctx.stroke();

                    // render output name
                    if (render_text) {
                        const text =
                            slot.label != null ? slot.label : slot.name;
                        if (text) {
                            ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
                            if (horizontal || slot.dir === LiteGraph.DOWN) {
                                ctx.fillText(text, pos[0], pos[1] - 8);
                            } else {
                                ctx.fillText(
                                    text,
                                    pos[0] - 10,
                                    pos[1] + 5
                                );
                            }
                        }
                    }
                }
            }

            ctx.textAlign = "left";
            ctx.globalAlpha = 1;

            // widgets removed — drawNodeWidgets is a no-op stub, and
            // node.widgets is never populated by addWidget (also a stub).
        } else if (this.render_collapsed_slots) {
            // if collapsed
            let input_slot = null;
            let output_slot = null;

            // get first connected slot to render
            if (node.inputs) {
                for (let i = 0; i < node.inputs.length; i++) {
                    const slot = node.inputs[i];
                    if (slot.link == null) continue;
                    input_slot = slot;
                    break;
                }
            }
            if (node.outputs) {
                for (let i = 0; i < node.outputs.length; i++) {
                    const slot = node.outputs[i];
                    if (!slot.links || !slot.links.length) continue;
                    output_slot = slot;
                }
            }

            if (input_slot) {
                let x = 0;
                let y = LiteGraph.NODE_TITLE_HEIGHT * -0.5;
                if (horizontal) {
                    x = node._collapsed_width * 0.5;
                    y = -LiteGraph.NODE_TITLE_HEIGHT;
                }
                ctx.fillStyle = "#686";
                ctx.beginPath();
                // BUGFIX: use input_slot (not `slot` which is out of scope
                // after the for loop above). This caused "slot is not defined"
                // when collapsing a node with a connected input.
                if (input_slot.shape === LiteGraph.BOX_SHAPE) {
                    ctx.rect(x - 7 + 0.5, y - 4, 14, 8);
                } else if (input_slot.shape === LiteGraph.ARROW_SHAPE) {
                    ctx.moveTo(x + 8, y);
                    ctx.lineTo(x - 4, y - 4);
                    ctx.lineTo(x - 4, y + 4);
                    ctx.closePath();
                } else {
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                }
                ctx.fill();
            }

            if (output_slot) {
                let x = node._collapsed_width;
                let y = LiteGraph.NODE_TITLE_HEIGHT * -0.5;
                if (horizontal) {
                    x = node._collapsed_width * 0.5;
                    y = 0;
                }
                ctx.fillStyle = "#686";
                ctx.strokeStyle = "black";
                ctx.beginPath();
                // BUGFIX: use output_slot (not `slot` which is out of scope).
                if (output_slot.shape === LiteGraph.BOX_SHAPE) {
                    ctx.rect(x - 7 + 0.5, y - 4, 14, 8);
                } else if (output_slot.shape === LiteGraph.ARROW_SHAPE) {
                    ctx.moveTo(x + 6, y);
                    ctx.lineTo(x - 6, y - 4);
                    ctx.lineTo(x - 6, y + 4);
                    ctx.closePath();
                } else {
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                }
                ctx.fill();
            }
        }

        if (node.clip_area) {
            ctx.restore();
        }

        ctx.globalAlpha = 1.0;
    }

    // ==================== RENDERING: DRAW NODE SHAPE ====================

    /** draws the shape of the given node in the canvas */
    drawNodeShape(node, ctx, size, fgcolor, bgcolor, selected, mouse_over) {
        // bg rect
        ctx.strokeStyle = fgcolor;
        ctx.fillStyle = bgcolor;

        const title_height = LiteGraph.NODE_TITLE_HEIGHT;
        const low_quality = this.ds.scale < 0.5;

        // render node area depending on shape
        const shape =
            node._shape || node.constructor.shape || LiteGraph.ROUND_SHAPE;

        const title_mode = node.constructor.title_mode;

        let render_title = true;
        if (
            title_mode === LiteGraph.TRANSPARENT_TITLE ||
            title_mode === LiteGraph.NO_TITLE
        ) {
            render_title = false;
        } else if (title_mode === LiteGraph.AUTOHIDE_TITLE && mouse_over) {
            render_title = true;
        }

        const area = tmp_area;
        area[0] = 0;
        area[1] = render_title ? -title_height : 0;
        area[2] = size[0] + 1;
        area[3] = render_title ? size[1] + title_height : size[1];

        const old_alpha = ctx.globalAlpha;

        // full node shape
        ctx.beginPath();
        if (shape === LiteGraph.BOX_SHAPE || low_quality) {
            ctx.fillRect(area[0], area[1], area[2], area[3]);
        } else if (
            shape === LiteGraph.ROUND_SHAPE ||
            shape === LiteGraph.CARD_SHAPE
        ) {
            ctx.roundRect(
                area[0],
                area[1],
                area[2],
                area[3],
                shape === LiteGraph.CARD_SHAPE
                    ? [this.round_radius, this.round_radius, 0, 0]
                    : [this.round_radius]
            );
        } else if (shape === LiteGraph.CIRCLE_SHAPE) {
            ctx.arc(
                size[0] * 0.5,
                size[1] * 0.5,
                size[0] * 0.5,
                0,
                Math.PI * 2
            );
        }
        ctx.fill();

        // separator
        if (!node.flags.collapsed && render_title) {
            ctx.shadowColor = "transparent";
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.fillRect(0, -1, area[2], 2);
        }
        ctx.shadowColor = "transparent";

        if (node.onDrawBackground) {
            node.onDrawBackground(ctx, this, this.canvas, this.graph_mouse);
        }

        // title bg
        if (render_title || title_mode === LiteGraph.TRANSPARENT_TITLE) {
            if (node.onDrawTitleBar) {
                node.onDrawTitleBar(ctx, title_height, size, this.ds.scale, fgcolor);
            } else if (
                title_mode !== LiteGraph.TRANSPARENT_TITLE &&
                (node.constructor.title_color || this.render_title_colored)
            ) {
                const title_color = node.constructor.title_color || fgcolor;

                if (node.flags.collapsed) {
                    ctx.shadowColor = LiteGraph.DEFAULT_SHADOW_COLOR;
                }

                if (this.use_gradients) {
                    let grad = LGraphCanvas.gradients[title_color];
                    if (!grad) {
                        grad = LGraphCanvas.gradients[title_color] =
                            ctx.createLinearGradient(0, 0, 400, 0);
                        grad.addColorStop(0, title_color);
                        grad.addColorStop(1, "#000");
                    }
                    ctx.fillStyle = grad;
                } else {
                    ctx.fillStyle = title_color;
                }

                ctx.beginPath();
                if (shape === LiteGraph.BOX_SHAPE || low_quality) {
                    ctx.rect(0, -title_height, size[0] + 1, title_height);
                } else if (
                    shape === LiteGraph.ROUND_SHAPE ||
                    shape === LiteGraph.CARD_SHAPE
                ) {
                    ctx.roundRect(
                        0,
                        -title_height,
                        size[0] + 1,
                        title_height,
                        node.flags.collapsed
                            ? [this.round_radius]
                            : [this.round_radius, this.round_radius, 0, 0]
                    );
                }
                ctx.fill();
                ctx.shadowColor = "transparent";
            }

            let colState = false;
            if (LiteGraph.node_box_coloured_by_mode) {
                if (LiteGraph.NODE_MODES_COLORS[node.mode]) {
                    colState = LiteGraph.NODE_MODES_COLORS[node.mode];
                }
            }
            if (LiteGraph.node_box_coloured_when_on) {
                // execute_triggered / action_triggered removed — the box
                // color now only reflects the node's mode (always / never).
                colState = colState;
            }

            // title box
            const box_size = 10;
            if (node.onDrawTitleBox) {
                node.onDrawTitleBox(ctx, title_height, size, this.ds.scale);
            } else if (
                shape === LiteGraph.ROUND_SHAPE ||
                shape === LiteGraph.CIRCLE_SHAPE ||
                shape === LiteGraph.CARD_SHAPE
            ) {
                if (low_quality) {
                    ctx.fillStyle = "black";
                    ctx.beginPath();
                    ctx.arc(
                        title_height * 0.5,
                        title_height * -0.5,
                        box_size * 0.5 + 1,
                        0,
                        Math.PI * 2
                    );
                    ctx.fill();
                }

                ctx.fillStyle =
                    node.boxcolor || colState || LiteGraph.NODE_DEFAULT_BOXCOLOR;
                if (low_quality)
                    ctx.fillRect(
                        title_height * 0.5 - box_size * 0.5,
                        title_height * -0.5 - box_size * 0.5,
                        box_size,
                        box_size
                    );
                else {
                    ctx.beginPath();
                    ctx.arc(
                        title_height * 0.5,
                        title_height * -0.5,
                        box_size * 0.5,
                        0,
                        Math.PI * 2
                    );
                    ctx.fill();
                }
            } else {
                if (low_quality) {
                    ctx.fillStyle = "black";
                    ctx.fillRect(
                        (title_height - box_size) * 0.5 - 1,
                        (title_height + box_size) * -0.5 - 1,
                        box_size + 2,
                        box_size + 2
                    );
                }
                ctx.fillStyle =
                    node.boxcolor || colState || LiteGraph.NODE_DEFAULT_BOXCOLOR;
                ctx.fillRect(
                    (title_height - box_size) * 0.5,
                    (title_height + box_size) * -0.5,
                    box_size,
                    box_size
                );
            }
            ctx.globalAlpha = old_alpha;

            // title text
            if (node.onDrawTitleText) {
                node.onDrawTitleText(
                    ctx,
                    title_height,
                    size,
                    this.ds.scale,
                    this.title_text_font,
                    selected
                );
            }
            if (!low_quality) {
                ctx.font = this.title_text_font;
                const title = String(node.getTitle());
                if (title) {
                    if (selected) {
                        ctx.fillStyle = LiteGraph.NODE_SELECTED_TITLE_COLOR;
                    } else {
                        ctx.fillStyle =
                            node.constructor.title_text_color ||
                            this.node_title_color;
                    }
                    if (node.flags.collapsed) {
                        ctx.textAlign = "left";
                        ctx.fillText(
                            title.substr(0, 20),
                            title_height,
                            LiteGraph.NODE_TITLE_TEXT_Y - title_height
                        );
                        ctx.textAlign = "left";
                    } else {
                        ctx.textAlign = "left";
                        ctx.fillText(
                            title,
                            title_height,
                            LiteGraph.NODE_TITLE_TEXT_Y - title_height
                        );
                    }
                }
            }

            // subgraph box
            if (
                !node.flags.collapsed &&
                node.subgraph &&
                !node.skip_subgraph_button
            ) {
                const w = LiteGraph.NODE_TITLE_HEIGHT;
                const x = node.size[0] - w;
                const over = isInsideRectangle(
                    this.graph_mouse[0] - node.pos[0],
                    this.graph_mouse[1] - node.pos[1],
                    x + 2,
                    -w + 2,
                    w - 4,
                    w - 4
                );
                ctx.fillStyle = over ? "#888" : "#555";
                if (shape === LiteGraph.BOX_SHAPE || low_quality)
                    ctx.fillRect(x + 2, -w + 2, w - 4, w - 4);
                else {
                    ctx.beginPath();
                    ctx.roundRect(x + 2, -w + 2, w - 4, w - 4, [4]);
                    ctx.fill();
                }
                ctx.fillStyle = "#333";
                ctx.beginPath();
                ctx.moveTo(x + w * 0.2, -w * 0.6);
                ctx.lineTo(x + w * 0.8, -w * 0.6);
                ctx.lineTo(x + w * 0.5, -w * 0.3);
                ctx.fill();
            }

            // custom title render
            if (node.onDrawTitle) {
                node.onDrawTitle(ctx);
            }
        }

        // render selection marker
        if (selected) {
            if (node.onBounding) {
                node.onBounding(area);
            }

            if (title_mode === LiteGraph.TRANSPARENT_TITLE) {
                area[1] -= title_height;
                area[3] += title_height;
            }
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            if (shape === LiteGraph.BOX_SHAPE) {
                ctx.rect(
                    -6 + area[0],
                    -6 + area[1],
                    12 + area[2],
                    12 + area[3]
                );
            } else if (
                shape === LiteGraph.ROUND_SHAPE ||
                (shape === LiteGraph.CARD_SHAPE && node.flags.collapsed)
            ) {
                ctx.roundRect(
                    -6 + area[0],
                    -6 + area[1],
                    12 + area[2],
                    12 + area[3],
                    [this.round_radius * 2]
                );
            } else if (shape === LiteGraph.CARD_SHAPE) {
                ctx.roundRect(
                    -6 + area[0],
                    -6 + area[1],
                    12 + area[2],
                    12 + area[3],
                    [this.round_radius * 2, 2, this.round_radius * 2, 2]
                );
            } else if (shape === LiteGraph.CIRCLE_SHAPE) {
                ctx.arc(
                    size[0] * 0.5,
                    size[1] * 0.5,
                    size[0] * 0.5 + 6,
                    0,
                    Math.PI * 2
                );
            }
            ctx.strokeStyle = LiteGraph.NODE_BOX_OUTLINE_COLOR;
            ctx.stroke();
            ctx.strokeStyle = fgcolor;
            ctx.globalAlpha = 1;
        }

        // execute_triggered / action_triggered decrement removed — these
        // counters were only used for the box-color flash animation which
        // has been removed. Nodes no longer carry execution-frame state.
    }

    // ==================== RENDERING: CONNECTIONS ====================

    /** draws every connection visible in the canvas */
    drawConnections(ctx) {
        const now = getTime();
        const visible_area = this.visible_area;
        margin_area[0] = visible_area[0] - 20;
        margin_area[1] = visible_area[1] - 20;
        margin_area[2] = visible_area[2] + 40;
        margin_area[3] = visible_area[3] + 40;

        ctx.lineWidth = this.connections_width;

        ctx.fillStyle = "#AAA";
        ctx.strokeStyle = "#AAA";
        ctx.globalAlpha = this.editor_alpha;

        const nodes = this.graph._nodes;
        for (let n = 0, l = nodes.length; n < l; ++n) {
            const node = nodes[n];
            if (!node.inputs || !node.inputs.length) continue;

            for (let i = 0; i < node.inputs.length; ++i) {
                const input = node.inputs[i];
                if (!input || input.link == null) continue;
                const link_id = input.link;
                const link = this.graph.links[link_id];
                if (!link) continue;

                const start_node = this.graph.getNodeById(link.origin_id);
                if (start_node == null) continue;
                const start_node_slot = link.origin_slot;
                let start_node_slotpos = null;
                if (start_node_slot === -1) {
                    start_node_slotpos = [
                        start_node.pos[0] + 10,
                        start_node.pos[1] + 10,
                    ];
                } else {
                    start_node_slotpos = start_node.getConnectionPos(
                        false,
                        start_node_slot,
                        tempA
                    );
                }
                const end_node_slotpos = node.getConnectionPos(true, i, tempB);

                // compute link bounding
                link_bounding[0] = start_node_slotpos[0];
                link_bounding[1] = start_node_slotpos[1];
                link_bounding[2] =
                    end_node_slotpos[0] - start_node_slotpos[0];
                link_bounding[3] =
                    end_node_slotpos[1] - start_node_slotpos[1];
                if (link_bounding[2] < 0) {
                    link_bounding[0] += link_bounding[2];
                    link_bounding[2] = Math.abs(link_bounding[2]);
                }
                if (link_bounding[3] < 0) {
                    link_bounding[1] += link_bounding[3];
                    link_bounding[3] = Math.abs(link_bounding[3]);
                }

                // skip links outside of the visible area
                if (!overlapBounding(link_bounding, margin_area)) continue;

                const start_slot = start_node.outputs[start_node_slot];
                const end_slot = node.inputs[i];
                if (!start_slot || !end_slot) continue;
                const start_dir =
                    start_slot.dir ||
                    (start_node.horizontal ? LiteGraph.DOWN : LiteGraph.RIGHT);
                const end_dir =
                    end_slot.dir ||
                    (node.horizontal ? LiteGraph.UP : LiteGraph.LEFT);

                this.renderLink(
                    ctx,
                    start_node_slotpos,
                    end_node_slotpos,
                    link,
                    false,
                    0,
                    null,
                    start_dir,
                    end_dir
                );

                // event triggered rendered on top
                if (link && link._last_time && now - link._last_time < 1000) {
                    const f = 2.0 - (now - link._last_time) * 0.002;
                    const tmp = ctx.globalAlpha;
                    ctx.globalAlpha = tmp * f;
                    this.renderLink(
                        ctx,
                        start_node_slotpos,
                        end_node_slotpos,
                        link,
                        true,
                        f,
                        "white",
                        start_dir,
                        end_dir
                    );
                    ctx.globalAlpha = tmp;
                }
            }
        }
        ctx.globalAlpha = 1;
    }

    // ==================== RENDERING: LINK ====================

    /**
     * draws a link between two points
     * @param {CanvasRenderingContext2D} ctx
     * @param {Array} a - start pos
     * @param {Array} b - end pos
     * @param {Object} link - the link object with all the link info
     * @param {boolean} skip_border - ignore the shadow of the link
     * @param {boolean} flow - show flow animation (for events)
     * @param {string} color - the color for the link
     * @param {number} start_dir - the direction enum
     * @param {number} end_dir - the direction enum
     * @param {number} num_sublines - number of sublines
     */
    renderLink(ctx, a, b, link, skip_border, flow, color, start_dir, end_dir, num_sublines) {
        if (link) {
            this.visible_links.push(link);
        }

        // choose color
        if (!color && link) {
            color =
                link.color || LGraphCanvas.link_type_colors[link.type];
        }
        if (!color) {
            color = this.default_link_color;
        }
        if (link != null && this.highlighted_links[link.id]) {
            color = "#FFF";
        }

        start_dir = start_dir || LiteGraph.RIGHT;
        end_dir = end_dir || LiteGraph.LEFT;

        const dist = distance(a, b);

        if (this.render_connections_border && this.ds.scale > 0.6) {
            ctx.lineWidth = this.connections_width + 4;
        }
        ctx.lineJoin = "round";

        num_sublines = num_sublines || 1;
        if (num_sublines > 1) {
            ctx.lineWidth = 0.5;
        }

        // begin line shape
        ctx.beginPath();
        for (let i = 0; i < num_sublines; i += 1) {
            const offsety = (i - (num_sublines - 1) * 0.5) * 5;

            if (this.links_render_mode === LiteGraph.SPLINE_LINK) {
                ctx.moveTo(a[0], a[1] + offsety);
                let start_offset_x = 0;
                let start_offset_y = 0;
                let end_offset_x = 0;
                let end_offset_y = 0;
                switch (start_dir) {
                    case LiteGraph.LEFT:
                        start_offset_x = dist * -0.25;
                        break;
                    case LiteGraph.RIGHT:
                        start_offset_x = dist * 0.25;
                        break;
                    case LiteGraph.UP:
                        start_offset_y = dist * -0.25;
                        break;
                    case LiteGraph.DOWN:
                        start_offset_y = dist * 0.25;
                        break;
                }
                switch (end_dir) {
                    case LiteGraph.LEFT:
                        end_offset_x = dist * -0.25;
                        break;
                    case LiteGraph.RIGHT:
                        end_offset_x = dist * 0.25;
                        break;
                    case LiteGraph.UP:
                        end_offset_y = dist * -0.25;
                        break;
                    case LiteGraph.DOWN:
                        end_offset_y = dist * 0.25;
                        break;
                }
                ctx.bezierCurveTo(
                    a[0] + start_offset_x,
                    a[1] + start_offset_y + offsety,
                    b[0] + end_offset_x,
                    b[1] + end_offset_y + offsety,
                    b[0],
                    b[1] + offsety
                );
            } else if (this.links_render_mode === LiteGraph.LINEAR_LINK) {
                ctx.moveTo(a[0], a[1] + offsety);
                let start_offset_x = 0;
                let start_offset_y = 0;
                let end_offset_x = 0;
                let end_offset_y = 0;
                switch (start_dir) {
                    case LiteGraph.LEFT:
                        start_offset_x = -1;
                        break;
                    case LiteGraph.RIGHT:
                        start_offset_x = 1;
                        break;
                    case LiteGraph.UP:
                        start_offset_y = -1;
                        break;
                    case LiteGraph.DOWN:
                        start_offset_y = 1;
                        break;
                }
                switch (end_dir) {
                    case LiteGraph.LEFT:
                        end_offset_x = -1;
                        break;
                    case LiteGraph.RIGHT:
                        end_offset_x = 1;
                        break;
                    case LiteGraph.UP:
                        end_offset_y = -1;
                        break;
                    case LiteGraph.DOWN:
                        end_offset_y = 1;
                        break;
                }
                const l = 15;
                ctx.lineTo(
                    a[0] + start_offset_x * l,
                    a[1] + start_offset_y * l + offsety
                );
                ctx.lineTo(
                    b[0] + end_offset_x * l,
                    b[1] + end_offset_y * l + offsety
                );
                ctx.lineTo(b[0], b[1] + offsety);
            } else if (this.links_render_mode === LiteGraph.STRAIGHT_LINK) {
                ctx.moveTo(a[0], a[1]);
                let start_x = a[0];
                let start_y = a[1];
                let end_x = b[0];
                let end_y = b[1];
                if (start_dir === LiteGraph.RIGHT) {
                    start_x += 10;
                } else {
                    start_y += 10;
                }
                if (end_dir === LiteGraph.LEFT) {
                    end_x -= 10;
                } else {
                    end_y -= 10;
                }
                ctx.lineTo(start_x, start_y);
                ctx.lineTo((start_x + end_x) * 0.5, start_y);
                ctx.lineTo((start_x + end_x) * 0.5, end_y);
                ctx.lineTo(end_x, end_y);
                ctx.lineTo(b[0], b[1]);
            } else {
                return;
            }
        }

        // rendering the outline of the connection can be a little bit slow
        if (
            this.render_connections_border &&
            this.ds.scale > 0.6 &&
            !skip_border
        ) {
            ctx.strokeStyle = "rgba(0,0,0,0.5)";
            ctx.stroke();
        }

        ctx.lineWidth = this.connections_width;
        ctx.fillStyle = ctx.strokeStyle = color;
        ctx.stroke();

        const pos = this.computeConnectionPoint(a, b, 0.5, start_dir, end_dir);
        if (link && link._pos) {
            link._pos[0] = pos[0];
            link._pos[1] = pos[1];
        }

        // render arrow in the middle
        if (
            this.ds.scale >= 0.6 &&
            this.highquality_render &&
            end_dir !== LiteGraph.CENTER
        ) {
            if (this.render_connection_arrows) {
                const posA = this.computeConnectionPoint(
                    a,
                    b,
                    0.25,
                    start_dir,
                    end_dir
                );
                const posB = this.computeConnectionPoint(
                    a,
                    b,
                    0.26,
                    start_dir,
                    end_dir
                );
                const posC = this.computeConnectionPoint(
                    a,
                    b,
                    0.75,
                    start_dir,
                    end_dir
                );
                const posD = this.computeConnectionPoint(
                    a,
                    b,
                    0.76,
                    start_dir,
                    end_dir
                );

                let angleA = 0;
                let angleB = 0;
                if (this.render_curved_connections) {
                    angleA = -Math.atan2(posB[0] - posA[0], posB[1] - posA[1]);
                    angleB = -Math.atan2(posD[0] - posC[0], posD[1] - posC[1]);
                } else {
                    angleB = angleA = b[1] > a[1] ? 0 : Math.PI;
                }

                ctx.save();
                ctx.translate(posA[0], posA[1]);
                ctx.rotate(angleA);
                ctx.beginPath();
                ctx.moveTo(-5, -3);
                ctx.lineTo(0, +7);
                ctx.lineTo(+5, -3);
                ctx.fill();
                ctx.restore();
                ctx.save();
                ctx.translate(posC[0], posC[1]);
                ctx.rotate(angleB);
                ctx.beginPath();
                ctx.moveTo(-5, -3);
                ctx.lineTo(0, +7);
                ctx.lineTo(+5, -3);
                ctx.fill();
                ctx.restore();
            }

            // circle
            ctx.beginPath();
            ctx.arc(pos[0], pos[1], 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // render flowing points
        if (flow) {
            ctx.fillStyle = color;
            for (let i = 0; i < 5; ++i) {
                const f = (getTime() * 0.001 + i * 0.2) % 1;
                const flowPos = this.computeConnectionPoint(
                    a,
                    b,
                    f,
                    start_dir,
                    end_dir
                );
                ctx.beginPath();
                ctx.arc(flowPos[0], flowPos[1], 5, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }

    // ==================== RENDERING: CONNECTION POINT ====================

    /** returns the link center point based on curvature */
    computeConnectionPoint(a, b, t, start_dir, end_dir) {
        start_dir = start_dir || LiteGraph.RIGHT;
        end_dir = end_dir || LiteGraph.LEFT;

        const dist = distance(a, b);
        const p0 = a;
        const p1 = [a[0], a[1]];
        const p2 = [b[0], b[1]];
        const p3 = b;

        switch (start_dir) {
            case LiteGraph.LEFT:
                p1[0] += dist * -0.25;
                break;
            case LiteGraph.RIGHT:
                p1[0] += dist * 0.25;
                break;
            case LiteGraph.UP:
                p1[1] += dist * -0.25;
                break;
            case LiteGraph.DOWN:
                p1[1] += dist * 0.25;
                break;
        }
        switch (end_dir) {
            case LiteGraph.LEFT:
                p2[0] += dist * -0.25;
                break;
            case LiteGraph.RIGHT:
                p2[0] += dist * 0.25;
                break;
            case LiteGraph.UP:
                p2[1] += dist * -0.25;
                break;
            case LiteGraph.DOWN:
                p2[1] += dist * 0.25;
                break;
        }

        const c1 = (1 - t) * (1 - t) * (1 - t);
        const c2 = 3 * (1 - t) * (1 - t) * t;
        const c3 = 3 * (1 - t) * (t * t);
        const c4 = t * t * t;

        const x = c1 * p0[0] + c2 * p1[0] + c3 * p2[0] + c4 * p3[0];
        const y = c1 * p0[1] + c2 * p1[1] + c3 * p2[1] + c4 * p3[1];
        return [x, y];
    }


    // ==================== RENDERING: WIDGETS ====================
    // Widget system removed. These are no-op stubs kept for interface compat
    // so any external caller that still invokes them does not crash.

    /** @deprecated no-op stub */
    drawNodeWidgets(node, posY, ctx, active_widget) { return 0; }

    /** @deprecated no-op stub */
    processNodeWidgets(node, pos, event, active_widget) { return null; }

    // ==================== RENDERING: INFO & GROUPS ====================

    /** draws some useful stats in the corner of the canvas */
    renderInfo(ctx, x, y) {
        x = x || 10;
        y = y || this.canvas.height - 80;

        ctx.save();
        ctx.translate(x, y);

        ctx.font = "10px Arial";
        ctx.fillStyle = "#888";
        ctx.textAlign = "left";
        if (this.graph) {
            ctx.fillText(
                "T: " + this.graph.globaltime.toFixed(2) + "s",
                5,
                13 * 1
            );
            ctx.fillText("I: " + this.graph.iteration, 5, 13 * 2);
            ctx.fillText(
                "N: " +
                    this.graph._nodes.length +
                    " [" +
                    this.visible_nodes.length +
                    "]",
                5,
                13 * 3
            );
            ctx.fillText("V: " + this.graph._version, 5, 13 * 4);
            ctx.fillText("FPS:" + this.fps.toFixed(2), 5, 13 * 5);
        } else {
            ctx.fillText("No graph selected", 5, 13 * 1);
        }
        ctx.restore();
    }

    /** draws every group area in the background */
    drawGroups(canvas, ctx) {
        if (!this.graph) return;

        const groups = this.graph._groups;

        ctx.save();
        ctx.globalAlpha = 0.5 * this.editor_alpha;

        for (let i = 0; i < groups.length; ++i) {
            const group = groups[i];

            if (!overlapBounding(this.visible_area, group._bounding)) continue;

            ctx.fillStyle = group.color || "#335";
            ctx.strokeStyle = group.color || "#335";
            const pos = group._pos;
            const size = group._size;
            ctx.globalAlpha = 0.25 * this.editor_alpha;
            ctx.beginPath();
            ctx.rect(pos[0] + 0.5, pos[1] + 0.5, size[0], size[1]);
            ctx.fill();
            ctx.globalAlpha = this.editor_alpha;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(pos[0] + size[0], pos[1] + size[1]);
            ctx.lineTo(pos[0] + size[0] - 10, pos[1] + size[1]);
            ctx.lineTo(pos[0] + size[0], pos[1] + size[1] - 10);
            ctx.fill();

            const font_size = group.font_size || LiteGraph.DEFAULT_GROUP_FONT;
            ctx.font = font_size + "px Arial";
            ctx.textAlign = "left";
            ctx.fillText(group.title, pos[0] + 4, pos[1] + font_size);
        }
        ctx.restore();
    }

    drawExecutionOrder(ctx) {
        ctx.shadowColor = "transparent";
        ctx.globalAlpha = 0.25;

        ctx.textAlign = "center";
        ctx.strokeStyle = "white";
        ctx.globalAlpha = 0.75;

        const visible_nodes = this.visible_nodes;
        for (let i = 0; i < visible_nodes.length; ++i) {
            const node = visible_nodes[i];
            ctx.fillStyle = "black";
            ctx.fillRect(
                node.pos[0] - LiteGraph.NODE_TITLE_HEIGHT,
                node.pos[1] - LiteGraph.NODE_TITLE_HEIGHT,
                LiteGraph.NODE_TITLE_HEIGHT,
                LiteGraph.NODE_TITLE_HEIGHT
            );
            if (node.order === 0) {
                ctx.strokeRect(
                    node.pos[0] - LiteGraph.NODE_TITLE_HEIGHT + 0.5,
                    node.pos[1] - LiteGraph.NODE_TITLE_HEIGHT + 0.5,
                    LiteGraph.NODE_TITLE_HEIGHT,
                    LiteGraph.NODE_TITLE_HEIGHT
                );
            }
            ctx.fillStyle = "#FFF";
            ctx.fillText(
                node.order,
                node.pos[0] + LiteGraph.NODE_TITLE_HEIGHT * -0.5,
                node.pos[1] - 6
            );
        }
        ctx.globalAlpha = 1;
    }

    drawLinkTooltip(ctx, link) {
        const pos = link._pos;
        ctx.fillStyle = "black";
        ctx.beginPath();
        ctx.arc(pos[0], pos[1], 3, 0, Math.PI * 2);
        ctx.fill();

        if (link.data == null) return;

        if (this.onDrawLinkTooltip)
            if (this.onDrawLinkTooltip(ctx, link, this) === true) return;

        const data = link.data;
        let text = null;

        if (data.constructor === Number) text = data.toFixed(2);
        else if (data.constructor === String) text = '"' + data + '"';
        else if (data.constructor === Boolean) text = String(data);
        else if (data.toToolTip) text = data.toToolTip();
        else text = "[" + data.constructor.name + "]";

        if (text == null) return;
        text = text.substr(0, 30);

        ctx.font = "14px Courier New";
        const info = ctx.measureText(text);
        const w = info.width + 20;
        const h = 24;
        ctx.shadowColor = "black";
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.shadowBlur = 3;
        ctx.fillStyle = "#454";
        ctx.beginPath();
        ctx.roundRect(pos[0] - w * 0.5, pos[1] - 15 - h, w, h, [3]);
        ctx.moveTo(pos[0] - 10, pos[1] - 15);
        ctx.lineTo(pos[0] + 10, pos[1] - 15);
        ctx.lineTo(pos[0], pos[1] - 5);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.textAlign = "center";
        ctx.fillStyle = "#CEC";
        ctx.fillText(text, pos[0], pos[1] - 15 - h * 0.3);
    }

    // ==================== SUBGRAPH PANEL ====================

    drawSubgraphPanel(ctx) {
        const subgraph = this.graph;
        const subnode = subgraph._subgraph_node;
        if (!subnode) {
            console.warn("subgraph without subnode");
            return;
        }
        this.drawSubgraphPanelLeft(subgraph, subnode, ctx);
        this.drawSubgraphPanelRight(subgraph, subnode, ctx);
    }

    drawSubgraphPanelLeft(subgraph, subnode, ctx) {
        const num = subnode.inputs ? subnode.inputs.length : 0;
        const w = 200;
        const h = Math.floor(LiteGraph.NODE_SLOT_HEIGHT * 1.6);

        ctx.fillStyle = "#111";
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.roundRect(10, 10, w, (num + 1) * h + 50, [8]);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = "#888";
        ctx.font = "14px Arial";
        ctx.textAlign = "left";
        ctx.fillText("Graph Inputs", 20, 34);

        if (this.drawButton(w - 20, 20, 20, 20, "X", "#151515")) {
            this.closeSubgraph();
            return;
        }

        let y = 50;
        ctx.font = "14px Arial";
        if (subnode.inputs)
            for (let i = 0; i < subnode.inputs.length; ++i) {
                const input = subnode.inputs[i];
                if (input.not_subgraph_input) continue;

                if (this.drawButton(20, y + 2, w - 20, h - 2)) {
                    const type =
                        subnode.constructor.input_node_type || "graph/input";
                    this.graph.beforeChange();
                    const newnode = LiteGraph.createNode(type);
                    if (newnode) {
                        subgraph.add(newnode);
                        this.block_click = false;
                        this.last_click_position = null;
                        this.selectNodes([newnode]);
                        this.node_dragged = newnode;
                        this.dragging_canvas = false;
                        newnode.setProperty("name", input.name);
                        newnode.setProperty("type", input.type);
                        this.node_dragged.pos[0] = this.graph_mouse[0] - 5;
                        this.node_dragged.pos[1] = this.graph_mouse[1] - 5;
                        this.graph.afterChange();
                    }
                }
                ctx.fillStyle = "#9C9";
                ctx.beginPath();
                ctx.arc(w - 16, y + h * 0.5, 5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = "#AAA";
                ctx.fillText(input.name, 30, y + h * 0.75);
                ctx.fillStyle = "#777";
                ctx.fillText(input.type, 130, y + h * 0.75);
                y += h;
            }
        if (
            this.drawButton(20, y + 2, w - 20, h - 2, "+", "#151515", "#222")
        ) {
            this.showSubgraphPropertiesDialog(subnode);
        }
    }

    drawSubgraphPanelRight(subgraph, subnode, ctx) {
        const num = subnode.outputs ? subnode.outputs.length : 0;
        const canvas_w = this.bgcanvas.width;
        const w = 200;
        const h = Math.floor(LiteGraph.NODE_SLOT_HEIGHT * 1.6);

        ctx.fillStyle = "#111";
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.roundRect(canvas_w - w - 10, 10, w, (num + 1) * h + 50, [8]);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = "#888";
        ctx.font = "14px Arial";
        ctx.textAlign = "left";
        const title_text = "Graph Outputs";
        // Restore original: right-align the title text using measureText
        // so it sits flush against the right edge of the panel.
        const tw = ctx.measureText(title_text).width;
        ctx.fillText(title_text, canvas_w - tw - 20, 34);

        if (this.drawButton(canvas_w - w, 20, 20, 20, "X", "#151515")) {
            this.closeSubgraph();
            return;
        }

        let y = 50;
        ctx.font = "14px Arial";
        if (subnode.outputs)
            for (let i = 0; i < subnode.outputs.length; ++i) {
                const output = subnode.outputs[i];
                if (output.not_subgraph_input) continue;

                if (this.drawButton(canvas_w - w, y + 2, w - 20, h - 2)) {
                    const type =
                        subnode.constructor.output_node_type || "graph/output";
                    this.graph.beforeChange();
                    const newnode = LiteGraph.createNode(type);
                    if (newnode) {
                        subgraph.add(newnode);
                        this.block_click = false;
                        this.last_click_position = null;
                        this.selectNodes([newnode]);
                        this.node_dragged = newnode;
                        this.dragging_canvas = false;
                        newnode.setProperty("name", output.name);
                        newnode.setProperty("type", output.type);
                        this.node_dragged.pos[0] = this.graph_mouse[0] - 5;
                        this.node_dragged.pos[1] = this.graph_mouse[1] - 5;
                        this.graph.afterChange();
                    }
                }
                ctx.fillStyle = "#9C9";
                ctx.beginPath();
                ctx.arc(canvas_w - w + 16, y + h * 0.5, 5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = "#AAA";
                ctx.fillText(output.name, canvas_w - w + 30, y + h * 0.75);
                ctx.fillStyle = "#777";
                ctx.fillText(
                    output.type,
                    canvas_w - w + 130,
                    y + h * 0.75
                );
                y += h;
            }
        if (
            this.drawButton(
                canvas_w - w,
                y + 2,
                w - 20,
                h - 2,
                "+",
                "#151515",
                "#222"
            )
        ) {
            this.showSubgraphPropertiesDialogRight(subnode);
        }
    }

    /** Draws a button into the canvas overlay */
    drawButton(x, y, w, h, text, bgcolor, hovercolor, textcolor) {
        const ctx = this.ctx;
        bgcolor = bgcolor || LiteGraph.NODE_DEFAULT_COLOR;
        hovercolor = hovercolor || "#555";
        textcolor = textcolor || LiteGraph.NODE_TEXT_COLOR;
        const pos = this.ds.convertOffsetToCanvas(this.graph_mouse);
        const hover = isInsideRectangle(pos[0], pos[1], x, y, w, h);
        let clickPos = this.last_click_position
            ? [
                  this.last_click_position[0],
                  this.last_click_position[1],
              ]
            : null;
        if (clickPos) {
            const rect = this.canvas.getBoundingClientRect();
            clickPos[0] -= rect.left;
            clickPos[1] -= rect.top;
        }
        const clicked =
            clickPos && isInsideRectangle(clickPos[0], clickPos[1], x, y, w, h);

        ctx.fillStyle = hover ? hovercolor : bgcolor;
        if (clicked) ctx.fillStyle = "#AAA";
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, [4]);
        ctx.fill();

        if (text != null) {
            if (text.constructor === String) {
                ctx.fillStyle = textcolor;
                ctx.textAlign = "center";
                ctx.font = ((h * 0.65) | 0) + "px Arial";
                ctx.fillText(text, x + w * 0.5, y + h * 0.75);
                ctx.textAlign = "left";
            }
        }

        const was_clicked = clicked && !this.block_click;
        if (clicked) this.blockClick();
        return was_clicked;
    }

    // ==================== SEARCH BOX / CONTEXT MENU (REMOVED) ====================
    // The search box, right-click context menu, and all onMenu* handlers have
    // been removed. Hosts should provide their own node-creation and menu UI.
    // The methods below are no-op stubs kept only for interface compatibility
    // so external code that calls them does not crash.

    /** @deprecated no-op stub */ showSearchBox(event, options) {}
    /** @deprecated no-op stub */ processContextMenu(node, event) {}
    /** @deprecated no-op stub */ getCanvasMenuOptions() { return []; }
    /** @deprecated no-op stub */ getNodeMenuOptions(node) { return []; }
    /** @deprecated no-op stub */ getGroupMenuOptions(node) { return []; }
    /** @deprecated no-op stub */ showLinkMenu(link, event) {}
    /** @deprecated no-op stub */ createDefaultNodeForSlot(optPass) {}
    /** @deprecated no-op stub */ showConnectionMenu(optPass) {}
    /** @deprecated no-op stub */ prompt(title, value, callback, event, multiline) {}
    /** @deprecated no-op stub */ showEditPropertyValue(node, property, options) {}
    /** @deprecated no-op stub */ showShowNodePanel(node) {}
    /** @deprecated no-op stub */ checkPanels() {}
    /** @deprecated no-op stub */ static onMenuAdd() {}
    /** @deprecated no-op stub */ static onMenuNodeRemove() {}
    /** @deprecated no-op stub */ static onMenuNodeClone() {}
    /** @deprecated no-op stub */ static onMenuNodeCollapse() {}
    /** @deprecated no-op stub */ static onMenuNodeMode() {}
    /** @deprecated no-op stub */ static onMenuNodeColors() {}
    /** @deprecated no-op stub */ static onMenuNodeShapes() {}
    /** @deprecated no-op stub */ static onMenuNodePin() {}
    /** @deprecated no-op stub */ static onGroupAdd() {}
    /** @deprecated no-op stub */ static showMenuNodeOptionalInputs() {}
    /** @deprecated no-op stub */ static showMenuNodeOptionalOutputs() {}
    /** @deprecated no-op stub */ static onShowMenuNodeProperties() {}
    /** @deprecated no-op stub */ static onShowPropertyEditor() {}
    /** @deprecated no-op stub */ static onMenuResizeNode() {}

    /**
     * Resize the canvas (and bg canvas) to the given dimensions, or to the
     * parent element's size if no arguments. Called on window resize and
     * initial mount.
     */
    resize(width, height) {
        if (!width && !height) {
            const parent = this.canvas.parentNode;
            width = parent.offsetWidth;
            height = parent.offsetHeight;
        }
        if (this.canvas.width == width && this.canvas.height == height) {
            return;
        }
        this.canvas.width = width;
        this.canvas.height = height;
        this.bgcanvas.width = this.canvas.width;
        this.bgcanvas.height = this.canvas.height;
        this.setDirty(true, true);
    }

    static getPropertyPrintableValue(value, values) {
        if (!values)
            return String(value);

        if (values.constructor === Array) {
            return String(value);
        }

        if (values.constructor === Object) {
            let desc_value = "";
            for (const k in values) {
                if (values[k] != value)
                    continue;
                desc_value = k;
                break;
            }
            return String(value) + " (" + desc_value + ")";
        }
    }

    static decodeHTML(str) {
        const e = document.createElement("div");
        e.innerText = str;
        return e.innerHTML;
    }

    // ---------------------------------------------------------------------------
    // Instance menu / dialog methods
    // ---------------------------------------------------------------------------

    // (showLinkMenu / createDefaultNodeForSlot / showConnectionMenu / prompt /
    //  showEditPropertyValue stubs are consolidated above with the other
    //  menu/panel stubs.)

    // TODO refactor, there are different dialog, some uses createDialog, some dont
    createDialog(html, options) {
        const def_options = { checkForInput: false, closeOnLeave: true, closeOnLeave_checkModified: true };
        options = Object.assign(def_options, options || {});

        const dialog = document.createElement("div");
        dialog.className = "graphdialog";
        dialog.innerHTML = html;
        dialog.is_modified = false;

        const rect = this.canvas.getBoundingClientRect();
        let offsetx = -20;
        let offsety = -20;
        if (rect) {
            offsetx -= rect.left;
            offsety -= rect.top;
        }

        if (options.position) {
            offsetx += options.position[0];
            offsety += options.position[1];
        } else if (options.event) {
            offsetx += options.event.clientX;
            offsety += options.event.clientY;
        } //centered
        else {
            offsetx += this.canvas.width * 0.5;
            offsety += this.canvas.height * 0.5;
        }

        dialog.style.left = offsetx + "px";
        dialog.style.top = offsety + "px";

        this.canvas.parentNode.appendChild(dialog);

        // check for input and use default behaviour: save on enter, close on esc
        if (options.checkForInput) {
            const aI = dialog.querySelectorAll("input");
            let focused = false;
            if (aI) {
                aI.forEach(function (iX) {
                    iX.addEventListener("keydown", function (e) {
                        dialog.modified();
                        if (e.keyCode == 27) {
                            dialog.close();
                        } else if (e.keyCode != 13) {
                            return;
                        }
                        // set value ?
                        e.preventDefault();
                        e.stopPropagation();
                    });
                    if (!focused) iX.focus();
                });
            }
        }

        dialog.modified = function () {
            dialog.is_modified = true;
        };
        dialog.close = function () {
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
        };

        let dialogCloseTimer = null;
        let prevent_timeout = false;
        dialog.addEventListener("mouseleave", function (e) {
            if (prevent_timeout)
                return;
            if (options.closeOnLeave || LiteGraph.dialog_close_on_mouse_leave)
                if (!dialog.is_modified && LiteGraph.dialog_close_on_mouse_leave)
                    dialogCloseTimer = setTimeout(dialog.close, LiteGraph.dialog_close_on_mouse_leave_delay); //dialog.close();
        });
        dialog.addEventListener("mouseenter", function (e) {
            if (options.closeOnLeave || LiteGraph.dialog_close_on_mouse_leave)
                if (dialogCloseTimer) clearTimeout(dialogCloseTimer);
        });
        const selInDia = dialog.querySelectorAll("select");
        if (selInDia) {
            // if filtering, check focus changed to comboboxes and prevent closing
            selInDia.forEach(function (selIn) {
                selIn.addEventListener("click", function (e) {
                    prevent_timeout++;
                });
                selIn.addEventListener("blur", function (e) {
                    prevent_timeout = 0;
                });
                selIn.addEventListener("change", function (e) {
                    prevent_timeout = -1;
                });
            });
        }

        return dialog;
    }

    createPanel(title, options) {
        options = options || {};

        const ref_window = options.window || window;
        const root = document.createElement("div");
        root.className = "litegraph dialog";
        root.innerHTML = "<div class='dialog-header'><span class='dialog-title'></span></div><div class='dialog-content'></div><div style='display:none;' class='dialog-alt-content'></div><div class='dialog-footer'></div>";
        root.header = root.querySelector(".dialog-header");

        if (options.width)
            root.style.width = options.width + (options.width.constructor === Number ? "px" : "");
        if (options.height)
            root.style.height = options.height + (options.height.constructor === Number ? "px" : "");
        if (options.closable) {
            const close = document.createElement("span");
            close.innerHTML = "&#10005;";
            close.classList.add("close");
            close.addEventListener("click", function () {
                root.close();
            });
            root.header.appendChild(close);
        }
        root.title_element = root.querySelector(".dialog-title");
        root.title_element.innerText = title;
        root.content = root.querySelector(".dialog-content");
        root.alt_content = root.querySelector(".dialog-alt-content");
        root.footer = root.querySelector(".dialog-footer");

        root.close = function () {
            if (root.onClose && typeof root.onClose == "function") {
                root.onClose();
            }
            if (root.parentNode)
                root.parentNode.removeChild(root);
            /* XXX CHECK THIS */
            if (this.parentNode) {
                this.parentNode.removeChild(this);
            }
            /* XXX this was not working, was fixed with an IF, check this */
        };

        // function to swap panel content
        root.toggleAltContent = function (force) {
            let vTo, vAlt;
            if (typeof force != "undefined") {
                vTo = force ? "block" : "none";
                vAlt = force ? "none" : "block";
            } else {
                vTo = root.alt_content.style.display != "block" ? "block" : "none";
                vAlt = root.alt_content.style.display != "block" ? "none" : "block";
            }
            root.alt_content.style.display = vTo;
            root.content.style.display = vAlt;
        };

        root.toggleFooterVisibility = function (force) {
            let vTo;
            if (typeof force != "undefined") {
                vTo = force ? "block" : "none";
            } else {
                vTo = root.footer.style.display != "block" ? "block" : "none";
            }
            root.footer.style.display = vTo;
        };

        root.clear = function () {
            this.content.innerHTML = "";
        };

        root.addHTML = function (code, classname, on_footer) {
            const elem = document.createElement("div");
            if (classname)
                elem.className = classname;
            elem.innerHTML = code;
            if (on_footer)
                root.footer.appendChild(elem);
            else
                root.content.appendChild(elem);
            return elem;
        };

        root.addButton = function (name, callback, options) {
            const elem = document.createElement("button");
            elem.innerText = name;
            elem.options = options;
            elem.classList.add("btn");
            elem.addEventListener("click", callback);
            root.footer.appendChild(elem);
            return elem;
        };

        root.addSeparator = function () {
            const elem = document.createElement("div");
            elem.className = "separator";
            root.content.appendChild(elem);
        };

        root.addWidget = function (type, name, value, options, callback) {
            options = options || {};
            let str_value = String(value);
            type = type.toLowerCase();
            if (type == "number")
                str_value = value.toFixed(3);

            const elem = document.createElement("div");
            elem.className = "property";
            elem.innerHTML = "<span class='property_name'></span><span class='property_value'></span>";
            elem.querySelector(".property_name").innerText = options.label || name;
            const value_element = elem.querySelector(".property_value");
            value_element.innerText = str_value;
            elem.dataset["property"] = name;
            elem.dataset["type"] = options.type || type;
            elem.options = options;
            elem.value = value;

            if (type == "code")
                elem.addEventListener("click", function (e) { root.inner_showCodePad(this.dataset["property"]); });
            else if (type == "boolean") {
                elem.classList.add("boolean");
                if (value)
                    elem.classList.add("bool-on");
                elem.addEventListener("click", function () {
                    const propname = this.dataset["property"];
                    this.value = !this.value;
                    this.classList.toggle("bool-on");
                    this.querySelector(".property_value").innerText = this.value ? "true" : "false";
                    innerChange(propname, this.value);
                });
            } else if (type == "string" || type == "number") {
                value_element.setAttribute("contenteditable", true);
                value_element.addEventListener("keydown", function (e) {
                    if (e.code == "Enter" && (type != "string" || !e.shiftKey)) // allow for multiline
                    {
                        e.preventDefault();
                        this.blur();
                    }
                });
                value_element.addEventListener("blur", function () {
                    let v = this.innerText;
                    const propname = this.parentNode.dataset["property"];
                    const proptype = this.parentNode.dataset["type"];
                    if (proptype == "number")
                        v = Number(v);
                    innerChange(propname, v);
                });
            } else if (type == "enum" || type == "combo") {
                str_value = LGraphCanvas.getPropertyPrintableValue(value, options.values);
                value_element.innerText = str_value;

                value_element.addEventListener("click", function (event) {
                    const values = options.values || [];
                    const propname = this.parentNode.dataset["property"];
                    const clickedElem = event.currentTarget;
                    const menu = new ContextMenu(values, {
                        event: event,
                        className: "dark",
                        callback: inner_clicked
                    },
                        ref_window);
                    function inner_clicked(v, option, event) {
                        clickedElem.innerText = v;
                        innerChange(propname, v);
                        return false;
                    }
                });
            }

            root.content.appendChild(elem);

            function innerChange(name, value) {
                if (options.callback)
                    options.callback(name, value, options);
                if (callback)
                    callback(name, value, options);
            }

            return elem;
        };

        if (root.onOpen && typeof root.onOpen == "function") root.onOpen();

        return root;
    }

    closePanels() {
        let panel = document.querySelector("#node-panel");
        if (panel)
            panel.close();
        panel = document.querySelector("#option-panel");
        if (panel)
            panel.close();
    }

    // (showShowNodePanel stub consolidated above with other menu/panel stubs)

    showSubgraphPropertiesDialog(node) {
        console.log("showing subgraph properties dialog");

        const old_panel = this.canvas.parentNode.querySelector(".subgraph_dialog");
        if (old_panel)
            old_panel.close();

        const panel = this.createPanel("Subgraph Inputs", { closable: true, width: 500 });
        panel.node = node;
        panel.classList.add("subgraph_dialog");

        function inner_refresh() {
            panel.clear();

            //show currents
            if (node.inputs)
                for (let i = 0; i < node.inputs.length; ++i) {
                    const input = node.inputs[i];
                    if (input.not_subgraph_input)
                        continue;
                    const html = "<button>&#10005;</button> <span class='bullet_icon'></span><span class='name'></span><span class='type'></span>";
                    const elem = panel.addHTML(html, "subgraph_property");
                    elem.dataset["name"] = input.name;
                    elem.dataset["slot"] = i;
                    elem.querySelector(".name").innerText = input.name;
                    elem.querySelector(".type").innerText = input.type;
                    elem.querySelector("button").addEventListener("click", function (e) {
                        node.removeInput(Number(this.parentNode.dataset["slot"]));
                        inner_refresh();
                    });
                }
        }

        //add extra
        const html = " + <span class='label'>Name</span><input class='name'/><span class='label'>Type</span><input class='type'></input><button>+</button>";
        const elem = panel.addHTML(html, "subgraph_property extra", true);
        elem.querySelector("button").addEventListener("click", function (e) {
            const elem = this.parentNode;
            const name = elem.querySelector(".name").value;
            const type = elem.querySelector(".type").value;
            if (!name || node.findInputSlot(name) != -1)
                return;
            node.addInput(name, type);
            elem.querySelector(".name").value = "";
            elem.querySelector(".type").value = "";
            inner_refresh();
        });

        inner_refresh();
        this.canvas.parentNode.appendChild(panel);
        return panel;
    }

    showSubgraphPropertiesDialogRight(node) {
        // console.log("showing subgraph properties dialog");
        // old_panel if old_panel is exist close it
        const old_panel = this.canvas.parentNode.querySelector(".subgraph_dialog");
        if (old_panel)
            old_panel.close();
        // new panel
        const panel = this.createPanel("Subgraph Outputs", { closable: true, width: 500 });
        panel.node = node;
        panel.classList.add("subgraph_dialog");

        function inner_refresh() {
            panel.clear();
            //show currents
            if (node.outputs)
                for (let i = 0; i < node.outputs.length; ++i) {
                    const input = node.outputs[i];
                    if (input.not_subgraph_output)
                        continue;
                    const html = "<button>&#10005;</button> <span class='bullet_icon'></span><span class='name'></span><span class='type'></span>";
                    const elem = panel.addHTML(html, "subgraph_property");
                    elem.dataset["name"] = input.name;
                    elem.dataset["slot"] = i;
                    elem.querySelector(".name").innerText = input.name;
                    elem.querySelector(".type").innerText = input.type;
                    elem.querySelector("button").addEventListener("click", function (e) {
                        node.removeOutput(Number(this.parentNode.dataset["slot"]));
                        inner_refresh();
                    });
                }
        }

        //add extra
        const html = " + <span class='label'>Name</span><input class='name'/><span class='label'>Type</span><input class='type'></input><button>+</button>";
        const elem = panel.addHTML(html, "subgraph_property extra", true);
        elem.querySelector(".name").addEventListener("keydown", function (e) {
            if (e.keyCode == 13) {
                addOutput.apply(this);
            }
        });
        elem.querySelector("button").addEventListener("click", function (e) {
            addOutput.apply(this);
        });
        function addOutput() {
            const elem = this.parentNode;
            const name = elem.querySelector(".name").value;
            const type = elem.querySelector(".type").value;
            if (!name || node.findOutputSlot(name) != -1)
                return;
            node.addOutput(name, type);
            elem.querySelector(".name").value = "";
            elem.querySelector(".type").value = "";
            inner_refresh();
        }

        inner_refresh();
        this.canvas.parentNode.appendChild(panel);
        return panel;
    }

    // ==================== MISSING METHODS RESTORED ====================
    // These methods existed in the original LGraphCanvas.prototype but
    // were accidentally omitted during the ES6 refactoring.

    /**
     * Toggle live mode on/off. In live mode the graph cannot be edited.
     * Restored original: when `transition` is truthy, animates editor_alpha
     * via setInterval (1ms tick) fading from 0.1→1 or 1→0.01. Without
     * transition, toggles immediately.
     */
    switchLiveMode(transition) {
        if (!transition) {
            this.live_mode = !this.live_mode;
            this.dirty_canvas = true;
            this.dirty_bgcanvas = true;
            return;
        }

        const self = this;
        const delta = this.live_mode ? 1.1 : 0.9;
        if (this.live_mode) {
            this.live_mode = false;
            this.editor_alpha = 0.1;
        }

        const t = setInterval(function () {
            self.editor_alpha *= delta;
            self.dirty_canvas = true;
            self.dirty_bgcanvas = true;

            if (delta < 1 && self.editor_alpha < 0.01) {
                clearInterval(t);
                if (delta < 1) {
                    self.live_mode = true;
                }
            }
            if (delta > 1 && self.editor_alpha > 0.99) {
                clearInterval(t);
                self.editor_alpha = 1;
            }
        }, 1);
    }

    /**
     * Touch event handler — translates touch events to mouse events
     * so the canvas can work on mobile devices.
     */
    touchHandler(event) {
        //disable touch scrolling
        event.preventDefault();
        event.stopPropagation();

        const rect = this.canvas.getBoundingClientRect();
        const type = "";

        //translate touch event
        const touches = event.touches;
        if (!touches || touches.length === 0) return;

        const touch0 = touches[0];
        const touch1 = touches[1];

        const x = touch0.clientX - rect.left;
        const y = touch0.clientY - rect.top;

        if (event.type === "touchstart") {
            if (touches.length === 1) {
                const e = new PointerEvent("pointerdown", {
                    button: 0,
                    clientX: touch0.clientX,
                    clientY: touch0.clientY,
                    pointerId: touch0.identifier,
                    isPrimary: true,
                    pointerType: "touch",
                    bubbles: true,
                });
                this.canvas.dispatchEvent(e);
            } else if (touches.length === 2) {
                //pinch
                this._touch_bending = true;
                this._touch_start_dist = Math.sqrt(
                    (touch0.clientX - touch1.clientX) ** 2 +
                    (touch0.clientY - touch1.clientY) ** 2
                );
                this._touch_start_scale = this.ds.scale;
            }
        } else if (event.type === "touchmove") {
            if (this._touch_bending && touches.length === 2) {
                const dist = Math.sqrt(
                    (touch0.clientX - touch1.clientX) ** 2 +
                    (touch0.clientY - touch1.clientY) ** 2
                );
                const scale = this._touch_start_scale * (dist / this._touch_start_dist);
                this.ds.changeScale(scale, [
                    (touch0.clientX + touch1.clientX) / 2 - rect.left,
                    (touch0.clientY + touch1.clientY) / 2 - rect.top,
                ]);
                this.dirty_canvas = true;
                this.dirty_bgcanvas = true;
            } else {
                const e = new PointerEvent("pointermove", {
                    button: 0,
                    clientX: touch0.clientX,
                    clientY: touch0.clientY,
                    pointerId: touch0.identifier,
                    isPrimary: true,
                    pointerType: "touch",
                    bubbles: true,
                });
                this.canvas.dispatchEvent(e);
            }
        } else if (event.type === "touchend") {
            this._touch_bending = false;
            const e = new PointerEvent("pointerup", {
                button: 0,
                clientX: touch0.clientX,
                clientY: touch0.clientY,
                pointerId: touch0.identifier,
                isPrimary: true,
                pointerType: "touch",
                bubbles: true,
            });
            this.canvas.dispatchEvent(e);
        }
    }

    /**
     * Auto-size all nodes to fit their content.
     * Restored original: uses direct `size =` assignment (does NOT trigger
     * the onResize callback). The refactored version used setSize() which
     * fires onResize — a behavior change from the original.
     */
    adjustNodesSize() {
        const nodes = this.graph._nodes;
        for (let i = 0; i < nodes.length; ++i) {
            nodes[i].size = nodes[i].computeSize();
        }
        this.setDirty(true, true);
    }

    /**
     * Find the boundary nodes (topmost, bottommost, leftmost, rightmost)
     * of the current selection. Delegates to the static getBoundaryNodes
     * helper — matches the original implementation.
     */
    boundaryNodesForSelection() {
        return LGraphCanvas.getBoundaryNodes(
            Object.values(this.selected_nodes)
        );
    }

    /**
     * Check/validate open panel state — close stale panels if needed.
     * Restored original: queries the DOM for ALL `.litegraph.dialog` panels
     * and closes any whose panel.node.graph is missing or whose panel.graph
     * differs from the canvas's current graph. This catches node panels,
     * subgraph dialogs, etc. uniformly (the refactored version only checked
     * this.node_panel and this.options_panel explicitly).
     */
    // (checkPanels stub consolidated above with other menu/panel stubs)

    /**
     * Hit-test a rectangular area on the canvas. Used for immediate-mode GUI
     * buttons. Returns true if the area was clicked (not just hovered).
     * Restored original 5-argument signature: (x, y, w, h, hold_click).
     * Checks both current mouse position (hover) and last click position
     * (clicked). When hold_click is true, calls blockClick() to prevent
     * the same click from registering twice.
     */
    isAreaClicked(x, y, w, h, hold_click) {
        const pos = this.mouse;
        const hover = LiteGraph.isInsideRectangle(pos[0], pos[1], x, y, w, h);
        const clickPos = this.last_click_position;
        const clicked = clickPos && LiteGraph.isInsideRectangle(clickPos[0], clickPos[1], x, y, w, h);
        const was_clicked = clicked && !this.block_click;
        if (clicked && hold_click) {
            this.blockClick();
        }
        return was_clicked;
    }

    /**
     * Callback when node selection changes. Can be overridden.
     */
    onNodeSelectionChange() {
        // override point for subclasses or event listeners
    }

    /**
     * Display graph-level options panel.
     */
    showShowGraphOptionsPanel(refOpts, event) {
        const graph = this.graph;
        if (!graph) return;

        const panel = this.createPanel("Options", { closable: true });
        this.options_panel = panel;
        panel.node = null;
        panel.graph = graph;

        // Add common graph options
        const optEl = document.createElement("div");
        optEl.className = "litemenu-entry";
        optEl.innerHTML = "<span>Live Mode</span><input type='checkbox' class='lgraphconfig' id='live_mode'" + (this.live_mode ? " checked" : "") + ">";
        optEl.querySelector("input").addEventListener("change", (e) => {
            this.switchLiveMode(true);
        });
        panel.content.appendChild(optEl);

        this.canvas.parentNode.appendChild(panel);
        return panel;
    }
}

// Assign to LiteGraph for compatibility
// Lazy registration to avoid circular dependency issues
// LiteGraph.LGraphCanvas will be set after all modules are loaded

export { LGraphCanvas };
export default LGraphCanvas;
