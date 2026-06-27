/**
 * ContextMenu - ES6 Class Refactoring
 *
 * A right-click / custom context menu for LiteGraph.
 * Creates a floating DOM panel with menu entries, supports submenus,
 * separators, disabled items, and callback functions.
 *
 * Original: prototype-based constructor in litegraph.js (lines 13662-14049)
 * Refactored: ES6 class with static helpers
 */

import { LiteGraph } from "./LiteGraph.js";
import { pointerListenerAdd, pointerListenerRemove } from "./utils.js";

class ContextMenu {
    /**
     * @param {Array|Object} values - Menu entries. If an Array, each item is a name/string.
     *                                 If an Object, keys are names and values are entry descriptors.
     * @param {Object} options - Configuration options.
     * @param {ContextMenu} [options.parentMenu] - Parent menu when this is a submenu.
     * @param {Event} [options.event] - The triggering MouseEvent / PointerEvent / CustomEvent.
     * @param {Function} [options.callback] - Global callback invoked on item click.
     * @param {String} [options.title] - Optional title bar for the menu.
     * @param {String} [options.className] - Additional CSS class(es) for the root element.
     * @param {Number} [options.left] - Explicit left position (px).
     * @param {Number} [options.top] - Explicit top position (px).
     * @param {Number} [options.scale] - CSS transform scale factor.
     * @param {Number} [options.scroll_speed] - Scroll speed for mouse-wheel (default 0.1).
     * @param {Boolean} [options.autoopen] - Auto-open submenus on hover.
     * @param {Boolean} [options.ignore_item_callbacks] - Skip per-item callbacks.
     * @param {*} [options.extra] - Extra data forwarded to callbacks.
     * @param {*} [options.node] - Node reference forwarded to callbacks.
     */
    constructor(values, options) {
        options = options || {};
        this.options = options;

        // ---- link with parent menu ----
        if (options.parentMenu) {
            if (options.parentMenu.constructor !== this.constructor) {
                console.error(
                    "parentMenu must be of class ContextMenu, ignoring it"
                );
                options.parentMenu = null;
            } else {
                this.parentMenu = options.parentMenu;
                this.parentMenu.lock = true;
                this.parentMenu.current_submenu = this;
            }
        }

        // ---- validate event type ----
        let eventClass = null;
        if (options.event) {
            // use strings because comparing classes between windows doesn't work
            eventClass = options.event.constructor.name;
        }
        if (
            eventClass !== "MouseEvent" &&
            eventClass !== "CustomEvent" &&
            eventClass !== "PointerEvent"
        ) {
            console.error(
                "Event passed to ContextMenu is not of type MouseEvent or CustomEvent. Ignoring it. (" +
                    eventClass +
                    ")"
            );
            options.event = null;
        }

        // ---- create root DOM element ----
        const root = document.createElement("div");
        root.className = "litegraph litecontextmenu litemenubar-panel";
        if (options.className) {
            root.className += " " + options.className;
        }
        root.style.minWidth = 100;
        root.style.minHeight = 100;
        root.style.pointerEvents = "none";
        setTimeout(function () {
            root.style.pointerEvents = "auto";
        }, 100); // delay so the mouse up event is not caught by this element

        // prevent the default browser context menu from opening
        pointerListenerAdd(
            root,
            "up",
            function (e) {
                e.preventDefault();
                return true;
            },
            true
        );

        root.addEventListener(
            "contextmenu",
            function (e) {
                if (e.button != 2) {
                    // right button
                    return false;
                }
                e.preventDefault();
                return false;
            },
            true
        );

        pointerListenerAdd(
            root,
            "down",
            (e) => {
                if (e.button == 2) {
                    this.close();
                    e.preventDefault();
                    return true;
                }
            },
            true
        );

        // ---- mouse wheel scrolling ----
        function on_mouse_wheel(e) {
            const pos = parseInt(root.style.top);
            root.style.top =
                (pos + e.deltaY * options.scroll_speed).toFixed() + "px";
            e.preventDefault();
            return true;
        }

        if (!options.scroll_speed) {
            options.scroll_speed = 0.1;
        }

        root.addEventListener("wheel", on_mouse_wheel, true);
        root.addEventListener("mousewheel", on_mouse_wheel, true);

        this.root = root;

        // ---- optional title ----
        if (options.title) {
            const element = document.createElement("div");
            element.className = "litemenu-title";
            element.innerHTML = options.title;
            root.appendChild(element);
        }

        // ---- populate entries ----
        let num = 0;
        for (let i = 0; i < values.length; i++) {
            let name = values.constructor === Array ? values[i] : i;
            if (name != null && name.constructor !== String) {
                name = name.content === undefined ? String(name) : name.content;
            }
            const value = values[i];
            this.addItem(name, value, options);
            num++;
        }

        // ---- cancel closing timer on mouse enter ----
        // (close-on-leave is commented out in the original but enter handler remains)
        pointerListenerAdd(root, "enter", function (e) {
            if (root.closing_timer) {
                clearTimeout(root.closing_timer);
            }
        });

        // ---- attach to DOM ----
        let root_document = document;
        if (options.event) {
            root_document = options.event.target.ownerDocument;
        }
        if (!root_document) {
            root_document = document;
        }

        if (root_document.fullscreenElement) {
            root_document.fullscreenElement.appendChild(root);
        } else {
            root_document.body.appendChild(root);
        }

        // ---- compute best position ----
        let left = options.left || 0;
        let top = options.top || 0;
        if (options.event) {
            left = options.event.clientX - 10;
            top = options.event.clientY - 10;
            if (options.title) {
                top -= 20;
            }

            if (options.parentMenu) {
                const rect = options.parentMenu.root.getBoundingClientRect();
                left = rect.left + rect.width;
            }

            const body_rect = document.body.getBoundingClientRect();
            const root_rect = root.getBoundingClientRect();
            if (body_rect.height === 0) {
                console.error(
                    "document.body height is 0. That is dangerous, set html,body { height: 100%; }"
                );
            }

            if (body_rect.width && left > body_rect.width - root_rect.width - 10) {
                left = body_rect.width - root_rect.width - 10;
            }
            if (body_rect.height && top > body_rect.height - root_rect.height - 10) {
                top = body_rect.height - root_rect.height - 10;
            }
        }

        root.style.left = left + "px";
        root.style.top = top + "px";

        if (options.scale) {
            root.style.transform = "scale(" + options.scale + ")";
        }
    }

    /**
     * Add a single menu entry.
     *
     * @param {String} name - Display label for the entry.
     * @param {*} value - Entry value. Can be:
     *   - null            → separator
     *   - Function        → click callback (stored as onclick_callback)
     *   - Object with .disabled, .submenu, .has_submenu, .callback, .title, .className
     *   - any other value → stored as dataset value
     * @param {Object} options - Same options bag passed from the constructor.
     * @returns {HTMLDivElement} The created DOM element.
     */
    addItem(name, value, options) {
        options = options || {};

        const element = document.createElement("div");
        element.className = "litemenu-entry submenu";

        let disabled = false;

        if (value === null) {
            element.classList.add("separator");
        } else {
            element.innerHTML = value && value.title ? value.title : name;
            element.value = value;

            if (value) {
                if (value.disabled) {
                    disabled = true;
                    element.classList.add("disabled");
                }
                if (value.submenu || value.has_submenu) {
                    element.classList.add("has_submenu");
                }
            }

            if (typeof value === "function") {
                element.dataset["value"] = name;
                element.onclick_callback = value;
            } else {
                element.dataset["value"] = value;
            }

            if (value.className) {
                element.className += " " + value.className;
            }
        }

        this.root.appendChild(element);

        // ---- inner helpers (closure over element, options, and lexically-bound `this`) ----

        const inner_over = (e) => {
            const val = element.value;
            if (!val || !val.has_submenu) {
                return;
            }
            // if it is a submenu, auto-open like the item was clicked
            handleItemClick(element, e);
        };

        const handleItemClick = (target, e) => {
            const itemValue = target.value;
            let close_parent = true;

            if (this.current_submenu) {
                this.current_submenu.close(e);
            }

            // global callback
            if (options.callback) {
                const r = options.callback.call(
                    target,
                    itemValue,
                    options,
                    e,
                    this,
                    options.node
                );
                if (r === true) {
                    close_parent = false;
                }
            }

            // special cases
            if (itemValue) {
                if (
                    itemValue.callback &&
                    !options.ignore_item_callbacks &&
                    itemValue.disabled !== true
                ) {
                    // item callback
                    const r = itemValue.callback.call(
                        target,
                        itemValue,
                        options,
                        e,
                        this,
                        options.extra
                    );
                    if (r === true) {
                        close_parent = false;
                    }
                }
                if (itemValue.submenu) {
                    if (!itemValue.submenu.options) {
                        throw "ContextMenu submenu needs options";
                    }
                    const submenu = new this.constructor(itemValue.submenu.options, {
                        callback: itemValue.submenu.callback,
                        event: e,
                        parentMenu: this,
                        ignore_item_callbacks:
                            itemValue.submenu.ignore_item_callbacks,
                        title: itemValue.submenu.title,
                        extra: itemValue.submenu.extra,
                        autoopen: options.autoopen,
                    });
                    close_parent = false;
                }
            }

            if (close_parent && !this.lock) {
                this.close();
            }
        };

        const inner_onclick = function (e) {
            handleItemClick(this, e);
        };

        if (!disabled) {
            element.addEventListener("click", inner_onclick);
        }
        if (!disabled && options.autoopen) {
            pointerListenerAdd(element, "enter", inner_over);
        }

        return element;
    }

    /**
     * Close this menu (remove from DOM) and cascade to parent / child menus.
     *
     * @param {Event} [e] - The triggering event (used for cursor-over detection on parent).
     * @param {Boolean} [ignore_parent_menu] - If true, do not modify / close the parent menu.
     */
    close(e, ignore_parent_menu) {
        if (this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
        if (this.parentMenu && !ignore_parent_menu) {
            this.parentMenu.lock = false;
            this.parentMenu.current_submenu = null;
            if (e === undefined) {
                this.parentMenu.close();
            } else if (
                e &&
                !ContextMenu.isCursorOverElement(e, this.parentMenu.root)
            ) {
                ContextMenu.trigger(
                    this.parentMenu.root,
                    LiteGraph.pointerevents_method + "leave",
                    e
                );
            }
        }
        if (this.current_submenu) {
            this.current_submenu.close(e, true);
        }

        if (this.root.closing_timer) {
            clearTimeout(this.root.closing_timer);
        }

        // TODO implement : LiteGraph.contextMenuClosed(); :: keep track of opened / closed / current ContextMenu
        // on key press, allow filtering/selecting the context menu elements
    }

    /**
     * Walk up the parent chain and return the top-most menu.
     *
     * @returns {ContextMenu}
     */
    getTopMenu() {
        if (this.options.parentMenu) {
            return this.options.parentMenu.getTopMenu();
        }
        return this;
    }

    /**
     * Walk up the parent chain and return the original event from the top-most menu.
     *
     * @returns {Event}
     */
    getFirstEvent() {
        if (this.options.parentMenu) {
            return this.options.parentMenu.getFirstEvent();
        }
        return this.options.event;
    }

    // ========================= Static Helpers =========================

    /**
     * Programmatically trigger a DOM event on an element.
     * Used internally to dispatch pointer-leave on parent menus.
     *
     * @param {HTMLElement} element - Target element.
     * @param {String} event_name - Event name (e.g. "pointerleave").
     * @param {*} params - Custom event detail / params.
     * @param {HTMLElement} [origin] - Set as srcElement on the dispatched event.
     * @returns {CustomEvent} The created event.
     */
    static trigger(element, event_name, params, origin) {
        const evt = document.createEvent("CustomEvent");
        evt.initCustomEvent(event_name, true, true, params); // canBubble, cancelable, detail
        evt.srcElement = origin;
        if (element.dispatchEvent) {
            element.dispatchEvent(evt);
        } else if (element.__events) {
            element.__events.dispatchEvent(evt);
        }
        // else nothing seems bound here so nothing to do
        return evt;
    }

    /**
     * Check whether the cursor position from `event` is inside the bounding
     * rectangle of `element`.
     *
     * @param {MouseEvent} event - Event with clientX / clientY.
     * @param {HTMLElement} element - Element to test against.
     * @returns {Boolean}
     */
    static isCursorOverElement(event, element) {
        const left = event.clientX;
        const top = event.clientY;
        const rect = element.getBoundingClientRect();
        if (!rect) {
            return false;
        }
        if (
            top > rect.top &&
            top < rect.top + rect.height &&
            left > rect.left &&
            left < rect.left + rect.width
        ) {
            return true;
        }
        return false;
    }
}

// Register on LiteGraph for backwards compatibility
// Lazy registration to avoid circular dependency issues

export { ContextMenu };
export default ContextMenu;
