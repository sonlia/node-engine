---
Task ID: 1
Agent: Main
Task: Fix LiteGraph.js ES6 refactoring interaction bugs (circular dependency, canvas panning, node selection, context menu)

Work Log:
- Diagnosed root cause: `utils.js` `pointerListenerAdd()` referenced `LiteGraph.pointerevents_method` without importing `LiteGraph` (circular dependency), causing `ReferenceError: LiteGraph is not defined` at runtime. This broke `LGraphCanvas.bindEvents()`, preventing ALL mouse event binding.
- Fixed `utils.js`: Replaced direct `LiteGraph` reference with lazy getter pattern (`_liteGraphRef` module variable + `_setLiteGraphRef()` setter). `pointerListenerAdd`/`pointerListenerRemove` now use `_resolvePointerEvent()` which lazily reads `pointerevents_method` at call time.
- Fixed `index.js`: Added `_setLiteGraphRef(LiteGraph)` call after all imports, ensuring the lazy reference is set before any runtime calls.
- Fixed `page.tsx`: Changed imports from individual module files (`@/lib/litegraph/LiteGraph`, etc.) to barrel file (`@/lib/litegraph`) to ensure `index.js` is evaluated and `_setLiteGraphRef` is called.
- Fixed `DragAndScale.js`: Replaced `LiteGraph.pointerListenerAdd/Remove()` calls with direct imports from `utils.js` (these aren't static methods on the `LiteGraph` class).
- Fixed `ContextMenu.js`: Same fix - replaced `LiteGraph.pointerListenerAdd/Remove()` with imports from `utils.js`.
- Fixed `LLink.js`: Removed duplicate `export { LLink }` (was conflicting with `export class LLink`).
- Fixed `LGraphCanvas.unbindEvents()`: Corrected callback references from `_mousedown_callback` to `_mousemove_callback` and `_mouseup_callback`.

Stage Summary:
- All mouse interactions now work: canvas panning, node click/select, node dragging, output/input slot connections, right-click context menu, zoom wheel
- No console errors
- All toolbar buttons work: Stop/Run, Add Node, Arrange, Demo, Clear
- Build passes, module initialization test passes
