#!/usr/bin/env python3
"""
Comprehensive spot-check verification after the fourth round of fixes
(LGraphCanvas method restorations + LGraphGroup.isPointInside restoration).
"""
from pathlib import Path

LGNODE = Path('/home/z/my-project/src/lib/litegraph/LGraphNode.js').read_text()
LGRAPH = Path('/home/z/my-project/src/lib/litegraph/LGraph.js').read_text()
LGCANVAS = Path('/home/z/my-project/src/lib/litegraph/LGraphCanvas.js').read_text()
LITEGRAPH = Path('/home/z/my-project/src/lib/litegraph/LiteGraph.js').read_text()
UTILS = Path('/home/z/my-project/src/lib/litegraph/utils.js').read_text()
LGGROUP = Path('/home/z/my-project/src/lib/litegraph/LGraphGroup.js').read_text()
LLINK = Path('/home/z/my-project/src/lib/litegraph/LLink.js').read_text()
DAS = Path('/home/z/my-project/src/lib/litegraph/DragAndScale.js').read_text()
INDEX = Path('/home/z/my-project/src/lib/litegraph/index.js').read_text()
CURVE = Path('/home/z/my-project/src/lib/litegraph/CurveEditor.js').read_text()

checks = [
    # ===================== Round 1: P0 critical fixes =====================
    ('P0-1', 'drawFrontCanvas: shape outside both if-blocks', 'let shape = null;', LGCANVAS),
    ('P0-2', 'drawButton: outer parens', '((h * 0.65) | 0) + "px Arial"', LGCANVAS),
    ('P0-3', 'setOutputData: link.data', 'link.data = data;', LGNODE),
    ('P0-4', 'getInputData: link.data + force_update', 'if (!force_update) return link.data;', LGNODE),
    ('P0-5', 'removeOutput: reindex link.origin_slot', 'link.origin_slot -= 1;', LGNODE),
    ('P0-6', 'removeInput: reindex link.target_slot', 'link.target_slot -= 1;', LGNODE),
    ('P0-7', 'LGraphGroup color hex string', 'this.color = "#3f789e";', LGGROUP),
    ('P0-8', 'LGraphGroup subarray sharing', 'this._pos = this._bounding.subarray(0, 2);', LGGROUP),
    ('P0-9', 'isInsideBounding nested array', 'p[0] < bb[0][0]', UTILS),
    ('P0-10', 'extendClass prototype + getter/setter', '__lookupGetter__', LITEGRAPH),
    ('P0-11', 'isValidConnection multi-type permutation', 'for (let i = 0; i < supportedA.length; ++i) {', LITEGRAPH),
    ('P0-12', 'createNode full init + onNodeCreated', 'if (node.onNodeCreated)', LITEGRAPH),

    # ===================== Round 2: P1 LGraphNode + CurveEditor =====================
    ('P1-1', 'serialize: color/bgcolor/boxcolor/shape', 'if (this.color) o.color = this.color;', LGNODE),
    ('P1-2', 'clone: deep cloneObject', 'const data = cloneObject(this.serialize());', LGNODE),
    ('P1-9', 'connect: returns link_info', 'return link_info;', LGNODE),
    ('P1-10', 'connect: EVENT target_slot', 'else if (target_slot === LiteGraph.EVENT)', LGNODE),
    ('P1-32', 'addOnTriggerInput: returns slot index', 'return this.findInputSlot("onTrigger");', LGNODE),
    ('P1-33', 'addOnExecutedOutput: ACTION type', 'this.addOutput("onExecuted", LiteGraph.ACTION', LGNODE),
    ('P1-38', 'actionDo: immediate executor', 'this.onAction(action, param, options, action_slot);', LGNODE),
    ('P1-40', 'triggerSlot: ON_TRIGGER doExecute', 'if (node.mode === LiteGraph.ON_TRIGGER)', LGNODE),
    ('P1-42', 'clearTriggeredSlot: link._last_time', 'link_info._last_time = 0;', LGNODE),
    ('P1-46', 'attachCanvas: LiteGraph.LGraphCanvas', 'LiteGraph.LGraphCanvas', LGRAPH),
    ('CE-1', 'CurveEditor class exists', 'class CurveEditor {', CURVE),
    ('CE-8', 'CurveEditor registered', 'LiteGraph.CurveEditor = CurveEditor;', INDEX),

    # ===================== Round 3: LiteGraph method + utils restorations =====================
    ('R1', 'registerNodeType: onNodeTypeRegistered callback', 'if (LiteGraph.onNodeTypeRegistered)', LITEGRAPH),
    ('R8', 'registerNodeAndSlotType: default out=false', 'out = out || false;', LITEGRAPH),
    ('R9', 'registerNodeAndSlotType: EVENT→_event_', 'allTypes = ["_event_"];', LITEGRAPH),
    ('R12', 'buildNodeClassFromObject: (name, object) signature', 'static buildNodeClassFromObject(name, object)', LITEGRAPH),
    ('R15', 'wrapFunctionAsNode: getParameterNames', 'const names = getParameterNames(func);', LITEGRAPH),
    ('R18', 'clearRegisteredTypes: searchbox_extras reset', 'LiteGraph.searchbox_extras = {};', LITEGRAPH),
    ('R20', 'registerSearchboxExtra: key is description.toLowerCase()', 'LiteGraph.searchbox_extras[description.toLowerCase()]', LITEGRAPH),
    ('R22', 'fetchFile: (url, type, on_complete, on_error)', 'static fetchFile(url, type, on_complete, on_error)', LITEGRAPH),
    ('R29', 'pointerevents_method default = "mouse"', 'static pointerevents_method = "mouse";', LITEGRAPH),
    ('U1', 'compareObjects: loose !=', 'if (a[i] != b[i]) return false;', UTILS),
    ('U8', 'pointerListenerAdd: input validation', 'if (!oDOM || !oDOM.addEventListener', UTILS),
    ('U9', 'pointerListenerAdd: touch fallback', '!window.PointerEvent', UTILS),
    ('U14', '_getPointereventsMethod defaults "mouse"', 'return "mouse";', UTILS),
    ('S2', 'DragAndScale skip_events param', 'constructor(element, skip_events)', DAS),
    ('N1', 'loadImage: img.ready = false', 'img.ready = false;', LGNODE),
    ('N3', 'trace: in-node console buffer', 'if (!this.console) {', LGNODE),

    # ===================== Round 4: LGraphCanvas + LGraphGroup restorations =====================
    ('LC-1', 'isAreaClicked: 5-arg signature (x, y, w, h, hold_click)',
     'isAreaClicked(x, y, w, h, hold_click)', LGCANVAS),
    ('LC-2', 'isAreaClicked: uses this.mouse for hover', 'const pos = this.mouse;', LGCANVAS),
    ('LC-3', 'isAreaClicked: uses last_click_position', 'const clickPos = this.last_click_position;', LGCANVAS),
    ('LC-4', 'isAreaClicked: block_click guard', 'const was_clicked = clicked && !this.block_click;', LGCANVAS),
    ('LC-5', 'isAreaClicked: hold_click calls blockClick()', 'this.blockClick();', LGCANVAS),
    ('LC-6', 'switchLiveMode: transition param (not animate)', 'switchLiveMode(transition)', LGCANVAS),
    ('LC-7', 'switchLiveMode: !transition immediate toggle', 'if (!transition) {', LGCANVAS),
    ('LC-8', 'switchLiveMode: setInterval animation', 'const t = setInterval(function () {', LGCANVAS),
    ('LC-9', 'switchLiveMode: editor_alpha *= delta', 'self.editor_alpha *= delta;', LGCANVAS),
    ('LC-10', 'switchLiveMode: delta < 1 clearInterval', 'if (delta < 1 && self.editor_alpha < 0.01)', LGCANVAS),
    ('LC-11', 'checkPanels: DOM querySelectorAll .litegraph.dialog', 'querySelectorAll(".litegraph.dialog")', LGCANVAS),
    ('LC-12', 'checkPanels: iterates panels', 'for (let i = 0; i < panels.length; ++i)', LGCANVAS),
    ('LC-13', 'checkPanels: panel.node.graph check', 'if (!panel.node.graph || panel.graph !== this.graph)', LGCANVAS),
    ('LC-14', 'openSubgraph: calls this.checkPanels()', 'this.checkPanels();', LGCANVAS),
    ('LC-15', 'getBoundaryNodes: static method exists', 'static getBoundaryNodes(nodes)', LGCANVAS),
    ('LC-16', 'getBoundaryNodes: returns {top, right, bottom, left}', 'return { top, right, bottom, left };', LGCANVAS),
    ('LC-17', 'boundaryNodesForSelection: delegates to static', 'LGraphCanvas.getBoundaryNodes(', LGCANVAS),
    ('LC-18', 'boundaryNodesForSelection: Object.values(this.selected_nodes)', 'Object.values(this.selected_nodes)', LGCANVAS),
    ('LC-19', 'adjustNodesSize: direct size = (not setSize)', 'nodes[i].size = nodes[i].computeSize();', LGCANVAS),
    ('LC-20', 'drawSubgraphPanelRight: right-aligned title via measureText', 'const tw = ctx.measureText(title_text).width;', LGCANVAS),
    ('LC-21', 'drawSubgraphPanelRight: canvas_w - tw - 20', 'ctx.fillText(title_text, canvas_w - tw - 20, 34);', LGCANVAS),
    ('LC-22', 'processMouseDown: alphaPosY calculation', 'const alphaPosY =', LGCANVAS),
    ('LC-23', 'processMouseDown: posAdd uses -alphaPosY*130', 'posAdd: [!mClikSlot_isOut ? -30 : 30, -alphaPosY * 130]', LGCANVAS),
    ('LG-1', 'LGraphGroup.isPointInside: 4-arg (x, y, margin, skip_title)', 'isPointInside(x, y, margin, skip_title)', LGGROUP),
    ('LG-2', 'LGraphGroup.isPointInside: graph.isLive() check', 'this.graph && this.graph.isLive()', LGGROUP),
    ('LG-3', 'LGraphGroup.isPointInside: collapsed branch', 'if (this.flags && this.flags.collapsed)', LGGROUP),
    ('LG-4', 'LGraphGroup.isPointInside: isInsideRectangle import', 'isInsideRectangle(', LGGROUP),
    ('LG-5', 'LGraphGroup.isPointInside: 4px x-buffer', 'this.pos[0] - 4 - margin < x', LGGROUP),
    ('LG-6', 'LGraphGroup.isPointInside: NODE_COLLAPSED_WIDTH fallback', 'LiteGraph.NODE_COLLAPSED_WIDTH', LGGROUP),
]

print("=" * 70)
print("COMPREHENSIVE SPOT-CHECK (rounds 1+2+3+4 combined)")
print("=" * 70)
passed = 0
failed = 0
fail_details = []
for fix_id, description, marker, source in checks:
    found = marker in source
    status = '✅' if found else '❌'
    if found:
        passed += 1
    else:
        failed += 1
        fail_details.append((fix_id, description))
    print(f"{status} {fix_id}: {description}")

print()
print("=" * 70)
print(f"TOTAL: {passed} passed, {failed} failed, out of {len(checks)} checks")
if fail_details:
    print("FAILED:")
    for fid, desc in fail_details:
        print(f"  - {fid}: {desc}")
print("=" * 70)
