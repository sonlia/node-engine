#!/usr/bin/env python3
"""
Spot-check verification: confirm that each P0/P1 fix is actually in place
by looking for specific markers in the refactored source code.
"""
from pathlib import Path

LGNODE = Path('/home/z/my-project/src/lib/litegraph/LGraphNode.js').read_text()
LGRAPH = Path('/home/z/my-project/src/lib/litegraph/LGraph.js').read_text()
LGCANVAS = Path('/home/z/my-project/src/lib/litegraph/LGraphCanvas.js').read_text()
LITEGRAPH = Path('/home/z/my-project/src/lib/litegraph/LiteGraph.js').read_text()
UTILS = Path('/home/z/my-project/src/lib/litegraph/utils.js').read_text()
LGGROUP = Path('/home/z/my-project/src/lib/litegraph/LGraphGroup.js').read_text()
INDEX = Path('/home/z/my-project/src/lib/litegraph/index.js').read_text()
CURVE = Path('/home/z/my-project/src/lib/litegraph/CurveEditor.js').read_text()

checks = [
    # ===================== P0 Fixes (from earlier round) =====================
    ('P0-1', 'LGraphCanvas.drawFrontCanvas: shape declared outside both if-blocks',
     'let shape = null;', LGCANVAS),
    ('P0-2', 'LGraphCanvas.drawButton: outer parens around (h*0.65)|0',
     '((h * 0.65) | 0) + "px Arial"', LGCANVAS),
    ('P0-3', 'LGraphNode.setOutputData: writes link.data (not link._data)',
     'link.data = data;', LGNODE),
    ('P0-4', 'LGraphNode.getInputData: reads link.data + force_update param',
     'if (!force_update) return link.data;', LGNODE),
    ('P0-5', 'LGraphNode.removeOutput: reindexes link.origin_slot',
     'link.origin_slot -= 1;', LGNODE),
    ('P0-6', 'LGraphNode.removeInput: reindexes link.target_slot',
     'link.target_slot -= 1;', LGNODE),
    ('P0-7', 'LGraphGroup constructor: color is a hex string (not DEFAULT_GROUP_FONT)',
     'this.color = "#3f789e";', LGGROUP),
    ('P0-8', 'LGraphGroup: _pos is subarray view of _bounding',
     'this._pos = this._bounding.subarray(0, 2);', LGGROUP),
    ('P0-9', 'utils.isInsideBounding: nested-array bb format',
     'p[0] < bb[0][0]', UTILS),
    ('P0-10', 'LiteGraph.extendClass: copies prototype + getter/setter',
     '__lookupGetter__', LITEGRAPH),
    ('P0-11', 'LiteGraph.isValidConnection: multi-type permutation check',
     'for (let i = 0; i < supportedA.length; ++i) {', LITEGRAPH),
    ('P0-12', 'LiteGraph.createNode: full initialization with onNodeCreated',
     'if (node.onNodeCreated)', LITEGRAPH),
    
    # ===================== P1 Fixes (from second round) =====================
    ('P1-1', 'LGraphNode.serialize: includes color/bgcolor/boxcolor/shape',
     'if (this.color) o.color = this.color;', LGNODE),
    ('P1-2', 'LGraphNode.clone: deep-clones via cloneObject',
     'const data = cloneObject(this.serialize());', LGNODE),
    ('P1-3', 'LGraphNode.clone: severs input links',
     'data.inputs[i].link = null;', LGNODE),
    ('P1-4', 'LGraphNode.clone: severs output links',
     'data.outputs[i].links.length = 0;', LGNODE),
    ('P1-5', 'LGraphNode.toString: returns JSON of serialize',
     'return JSON.stringify(this.serialize());', LGNODE),
    ('P1-6', 'LGraphNode.addInput: calls registerNodeAndSlotType',
     'LiteGraph.registerNodeAndSlotType(this, type);', LGNODE),
    ('P1-7', 'LGraphNode.addOutput: calls registerNodeAndSlotType (gated)',
     'if (LiteGraph.auto_load_slot_types)\n      LiteGraph.registerNodeAndSlotType(this, type, true);', LGNODE),
    ('P1-8', 'LGraphNode.addInputs: accepts triplet array format',
     'const o = { name: info[0], type: info[1], link: null };', LGNODE),
    ('P1-9', 'LGraphNode.connect: returns link_info',
     'return link_info;', LGNODE),
    ('P1-10', 'LGraphNode.connect: handles EVENT target_slot',
     'else if (target_slot === LiteGraph.EVENT)', LGNODE),
    ('P1-11', 'LGraphNode.connect: calls onBeforeConnectInput',
     'target_node.onBeforeConnectInput', LGNODE),
    ('P1-12', 'LGraphNode.connect: calls beforeChange/afterChange',
     'this.graph.afterChange();', LGNODE),
    ('P1-13', 'LGraphNode.disconnectOutput: string slot lookup',
     'slot = this.findOutputSlot(slot);', LGNODE),
    ('P1-14', 'LGraphNode.disconnectInput: string slot lookup',
     'slot = this.findInputSlot(slot);', LGNODE),
    ('P1-15', 'LGraphNode.findInputSlot: returnObj param',
     'findInputSlot(name, returnObj)', LGNODE),
    ('P1-16', 'LGraphNode.findSlotByType: comma-split matching',
     "(type + \"\").toLowerCase().split(\",\")", LGNODE),
    ('P1-17', 'LGraphNode.findSlotByType: preferFreeSlot first pass',
     'if (preferFreeSlot && !doNotUseOccupied)', LGNODE),
    ('P1-18', 'LGraphNode.getConnectionPos: -1 special case',
     'if (is_input && slot_number === -1)', LGNODE),
    ('P1-19', 'LGraphNode.getConnectionPos: horizontal layout',
     'if (this.horizontal)', LGNODE),
    ('P1-20', 'LGraphNode.getConnectionPos: (slot+0.7)*NODE_SLOT_HEIGHT',
     '(slot_number + 0.7) * LiteGraph.NODE_SLOT_HEIGHT', LGNODE),
    ('P1-21', 'LGraphNode.computeSize: constructor.size shortcut',
     'if (this.constructor.size)', LGNODE),
    ('P1-22', 'LGraphNode.computeSize: font_size * text.length * 0.6',
     'font_size * text.length * 0.6', LGNODE),
    ('P1-23', 'LGraphNode.computeSize: +6 margin',
     'size[1] += 6; // margin', LGNODE),
    ('P1-24', 'LGraphNode.isPointInside: skip_title + isLive',
     'this.graph && this.graph.isLive()', LGNODE),
    ('P1-25', 'LGraphNode.isPointInside: collapsed branch',
     'if (this.flags && this.flags.collapsed)', LGNODE),
    ('P1-26', 'LGraphNode.getSlotInPosition: link_pos key (snake_case)',
     'link_pos: link_pos', LGNODE),
    ('P1-27', 'LGraphNode.getSlotInPosition: 20x10 rect hit-test',
     'link_pos[0] - 10, link_pos[1] - 5, 20, 10', LGNODE),
    ('P1-28', 'LGraphNode.getPropertyInfo: constructor["@" + property]',
     'this.constructor["@" + property]', LGNODE),
    ('P1-29', 'LGraphNode.getPropertyInfo: combo → enum conversion',
     'info.type = "enum";', LGNODE),
    ('P1-30', 'LGraphNode.addWidget: callback-as-object polymorphism',
     'if (!options && callback && callback.constructor === Object)', LGNODE),
    ('P1-31', 'LGraphNode.addWidget: combo without values throws',
     "throw \"LiteGraph addWidget('combo',...)", LGNODE),
    ('P1-32', 'LGraphNode.addOnTriggerInput: returns slot INDEX',
     'return this.findInputSlot("onTrigger");', LGNODE),
    ('P1-33', 'LGraphNode.addOnExecutedOutput: uses ACTION (not EVENT)',
     'this.addOutput("onExecuted", LiteGraph.ACTION', LGNODE),
    ('P1-34', 'LGraphNode.onAfterExecuteNode: finds onExecuted slot',
     'const trigS = this.findOutputSlot("onExecuted");', LGNODE),
    ('P1-35', 'LGraphNode.changeMode: ON_TRIGGER calls addOnTriggerInput',
     'case LiteGraph.ON_TRIGGER:', LGNODE),
    ('P1-36', 'LGraphNode.doExecute: action_call id generation',
     'options.action_call =\n          this.id + "_exec_"', LGNODE),
    ('P1-37', 'LGraphNode.doExecute: graph.nodes_executing tracking',
     'this.graph.nodes_executing[this.id] = true;', LGNODE),
    ('P1-38', 'LGraphNode.actionDo: IMMEDIATE executor (not deferred)',
     'this.onAction(action, param, options, action_slot);', LGNODE),
    ('P1-39', 'LGraphNode.triggerSlot: link_id filter',
     'if (link_id != null && link_id !== id) continue;', LGNODE),
    ('P1-40', 'LGraphNode.triggerSlot: ON_TRIGGER doExecute path',
     'if (node.mode === LiteGraph.ON_TRIGGER)', LGNODE),
    ('P1-41', 'LGraphNode.triggerSlot: deferred _waiting_actions push',
     'node._waiting_actions.push([', LGNODE),
    ('P1-42', 'LGraphNode.clearTriggeredSlot: clears link._last_time',
     'link_info._last_time = 0;', LGNODE),
    ('P1-43', 'LGraphNode.addConnection: 4-arg signature with pos',
     'addConnection(name, type, pos, direction)', LGNODE),
    ('P1-44', 'LGraphNode.captureInput: direct canvas manipulation',
     'c.node_capturing_input = v ? this : null;', LGNODE),
    ('P1-45', 'LGraphNode.localToScreen: supports both .ds.scale and .scale',
     'graphcanvas.ds ? graphcanvas.ds.scale : graphcanvas.scale', LGNODE),
    ('P1-46', 'LGraph.attachCanvas: uses LiteGraph.LGraphCanvas + instanceof',
     'LiteGraph.LGraphCanvas', LGRAPH),
    
    # ===================== CurveEditor addition =====================
    ('CE-1', 'CurveEditor.js exists with constructor',
     'class CurveEditor {', CURVE),
    ('CE-2', 'CurveEditor.sampleCurve static method',
     'static sampleCurve(f, points)', CURVE),
    ('CE-3', 'CurveEditor.draw method',
     'draw(ctx, size, graphcanvas, background_color, line_color, inactive)', CURVE),
    ('CE-4', 'CurveEditor.onMouseDown method',
     'onMouseDown(localpos, graphcanvas)', CURVE),
    ('CE-5', 'CurveEditor.onMouseMove method',
     'onMouseMove(localpos, graphcanvas)', CURVE),
    ('CE-6', 'CurveEditor.onMouseUp method',
     'onMouseUp(localpos, graphcanvas)', CURVE),
    ('CE-7', 'CurveEditor.getCloserPoint method',
     'getCloserPoint(pos, max_dist)', CURVE),
    ('CE-8', 'CurveEditor registered in index.js',
     'LiteGraph.CurveEditor = CurveEditor;', INDEX),
    ('CE-9', 'CurveEditor exported from index.js',
     'export { CurveEditor } from "./CurveEditor.js";', INDEX),
    
    # ===================== Utility re-attachments =====================
    ('UTIL-1', 'LiteGraph.compareObjects re-attached',
     'LiteGraph.compareObjects = compareObjects;', INDEX),
    ('UTIL-2', 'LiteGraph.distance re-attached',
     'LiteGraph.distance = distance;', INDEX),
    ('UTIL-3', 'LiteGraph.isInsideBounding re-attached',
     'LiteGraph.isInsideBounding = isInsideBounding;', INDEX),
    ('UTIL-4', 'LiteGraph.getTime re-attached',
     'LiteGraph.getTime = getTime;', INDEX),
    ('UTIL-5', 'LiteGraph.cloneObject re-attached',
     'LiteGraph.cloneObject = cloneObject;', INDEX),
    ('UTIL-6', 'LiteGraph.uuidv4 re-attached',
     'LiteGraph.uuidv4 = uuidv4;', INDEX),
    ('UTIL-7', 'LiteGraph.getParameterNames re-attached',
     'LiteGraph.getParameterNames = getParameterNames;', INDEX),
]

print("=" * 70)
print("SPOT-CHECK VERIFICATION OF ALL P0/P1 FIXES + CurveEditor ADDITION")
print("=" * 70)
passed = 0
failed = 0
for fix_id, description, marker, source in checks:
    found = marker in source
    status = '✅' if found else '❌'
    if found:
        passed += 1
    else:
        failed += 1
    print(f"{status} {fix_id}: {description}")

print()
print("=" * 70)
print(f"TOTAL: {passed} passed, {failed} failed, out of {len(checks)} checks")
print("=" * 70)
