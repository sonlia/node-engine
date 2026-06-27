#!/usr/bin/env python3
"""
Comprehensive spot-check verification after the third round of fixes
(P2 cosmetic items + LiteGraph method restorations + CurveEditor).
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
    # ===================== P0 Fixes (round 1) =====================
    ('P0-1', 'LGraphCanvas.drawFrontCanvas: shape declared outside both if-blocks',
     'let shape = null;', LGCANVAS),
    ('P0-2', 'LGraphCanvas.drawButton: outer parens around (h*0.65)|0',
     '((h * 0.65) | 0) + "px Arial"', LGCANVAS),
    ('P0-3', 'LGraphNode.setOutputData: writes link.data',
     'link.data = data;', LGNODE),
    ('P0-4', 'LGraphNode.getInputData: reads link.data + force_update',
     'if (!force_update) return link.data;', LGNODE),
    ('P0-5', 'LGraphNode.removeOutput: reindexes link.origin_slot',
     'link.origin_slot -= 1;', LGNODE),
    ('P0-6', 'LGraphNode.removeInput: reindexes link.target_slot',
     'link.target_slot -= 1;', LGNODE),
    ('P0-7', 'LGraphGroup constructor: color is a hex string',
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

    # ===================== P1 Fixes (round 2) =====================
    ('P1-1', 'LGraphNode.serialize: includes color/bgcolor/boxcolor/shape',
     'if (this.color) o.color = this.color;', LGNODE),
    ('P1-2', 'LGraphNode.clone: deep-clones via cloneObject',
     'const data = cloneObject(this.serialize());', LGNODE),
    ('P1-9', 'LGraphNode.connect: returns link_info',
     'return link_info;', LGNODE),
    ('P1-10', 'LGraphNode.connect: handles EVENT target_slot',
     'else if (target_slot === LiteGraph.EVENT)', LGNODE),
    ('P1-32', 'LGraphNode.addOnTriggerInput: returns slot INDEX',
     'return this.findInputSlot("onTrigger");', LGNODE),
    ('P1-33', 'LGraphNode.addOnExecutedOutput: uses ACTION (not EVENT)',
     'this.addOutput("onExecuted", LiteGraph.ACTION', LGNODE),
    ('P1-38', 'LGraphNode.actionDo: IMMEDIATE executor',
     'this.onAction(action, param, options, action_slot);', LGNODE),
    ('P1-40', 'LGraphNode.triggerSlot: ON_TRIGGER doExecute path',
     'if (node.mode === LiteGraph.ON_TRIGGER)', LGNODE),
    ('P1-42', 'LGraphNode.clearTriggeredSlot: clears link._last_time',
     'link_info._last_time = 0;', LGNODE),
    ('P1-46', 'LGraph.attachCanvas: uses LiteGraph.LGraphCanvas + instanceof',
     'LiteGraph.LGraphCanvas', LGRAPH),

    # ===================== P2 / LiteGraph method restorations (round 3) =====================
    ('R1', 'LiteGraph.registerNodeType: calls onNodeTypeRegistered callback',
     'if (LiteGraph.onNodeTypeRegistered)', LITEGRAPH),
    ('R2', 'LiteGraph.registerNodeType: calls onNodeTypeReplaced callback',
     'if (prev && LiteGraph.onNodeTypeReplaced)', LITEGRAPH),
    ('R3', 'LiteGraph.registerNodeType: warns about onPropertyChange',
     'has onPropertyChange method', LITEGRAPH),
    ('R4', 'LiteGraph.registerNodeType: uses new baseClass() for auto_load_slot_types',
     'new baseClass(baseClass.title || "tmpnode")', LITEGRAPH),
    ('R5', 'LiteGraph.registerNodeType: file extensions inside hasOwnProperty shape guard',
     'LiteGraph.node_types_by_file_extension[ext.toLowerCase()] = baseClass;', LITEGRAPH),
    ('R6', 'LiteGraph.unregisterNodeType: accepts String OR Class',
     'type && type.constructor === String', LITEGRAPH),
    ('R7', 'LiteGraph.unregisterNodeType: throws if not found',
     'throw "node type not found: " + type;', LITEGRAPH),
    ('R8', 'LiteGraph.registerNodeAndSlotType: default out=false',
     'out = out || false;', LITEGRAPH),
    ('R9', 'LiteGraph.registerNodeAndSlotType: EVENT/ACTION → _event_ mapping',
     'allTypes = ["_event_"];', LITEGRAPH),
    ('R10', 'LiteGraph.registerNodeAndSlotType: comma-split',
     'allTypes = slot_type.split(",");', LITEGRAPH),
    ('R11', 'LiteGraph.registerNodeAndSlotType: toLowerCase + sort',
     'LiteGraph.slot_types_in.sort();', LITEGRAPH),
    ('R12', 'LiteGraph.buildNodeClassFromObject: (name, object) signature',
     'static buildNodeClassFromObject(name, object)', LITEGRAPH),
    ('R13', 'LiteGraph.buildNodeClassFromObject: calls registerNodeType',
     'LiteGraph.registerNodeType(name, classobj);', LITEGRAPH),
    ('R14', 'LiteGraph.buildNodeClassFromObject: uses addInput/addOutput via Function ctor',
     'new Function(ctor_code).call(this);', LITEGRAPH),
    ('R15', 'LiteGraph.wrapFunctionAsNode: uses getParameterNames',
     'const names = getParameterNames(func);', LITEGRAPH),
    ('R16', 'LiteGraph.wrapFunctionAsNode: null means no inputs',
     'if (param_types !== null)', LITEGRAPH),
    ('R17', 'LiteGraph.wrapFunctionAsNode: null means no output',
     'if (return_type !== null)', LITEGRAPH),
    ('R18', 'LiteGraph.clearRegisteredTypes: resets searchbox_extras',
     'LiteGraph.searchbox_extras = {};', LITEGRAPH),
    ('R19', 'LiteGraph.addNodeMethod: backup as "_" + name',
     'type.prototype["_" + name] = type.prototype[name];', LITEGRAPH),
    ('R20', 'LiteGraph.registerSearchboxExtra: key is description.toLowerCase()',
     'LiteGraph.searchbox_extras[description.toLowerCase()]', LITEGRAPH),
    ('R21', 'LiteGraph.registerSearchboxExtra: field name is desc (not description)',
     'desc: description,', LITEGRAPH),
    ('R22', 'LiteGraph.fetchFile: (url, type, on_complete, on_error) signature',
     'static fetchFile(url, type, on_complete, on_error)', LITEGRAPH),
    ('R23', 'LiteGraph.fetchFile: proxy support',
     'LiteGraph.proxy + url.substr(url.indexOf(":") + 3)', LITEGRAPH),
    ('R24', 'LiteGraph.fetchFile: arraybuffer response type',
     'if (type === "arraybuffer") return response.arrayBuffer();', LITEGRAPH),
    ('R25', 'LiteGraph.fetchFile: blob response type',
     'else if (type === "blob") return response.blob();', LITEGRAPH),
    ('R26', 'LiteGraph.fetchFile: on_complete callback',
     'if (on_complete) on_complete(data);', LITEGRAPH),
    ('R27', 'LiteGraph.fetchFile: on_error callback',
     'if (on_error) on_error(error);', LITEGRAPH),
    ('R28', 'LiteGraph.fetchFile: FileReader for File/Blob',
     'return reader.readAsArrayBuffer(url);', LITEGRAPH),
    ('R29', 'LiteGraph.pointerevents_method default = "mouse" (matches original)',
     'static pointerevents_method = "mouse";', LITEGRAPH),

    # ===================== P2 / utils.js restorations =====================
    ('U1', 'utils.compareObjects: loose equality (!=)',
     'if (a[i] != b[i]) return false;', UTILS),
    ('U2', 'utils.colorToString: alpha toFixed(2)',
     'c[3].toFixed(2)', UTILS),
    ('U3', 'utils.colorToString: literal "1.0" when no alpha',
     ': "1.0") +', UTILS),
    ('U4', 'utils.num2hex: UPPERCASE hex_alphabets',
     'const hex_alphabets = "0123456789ABCDEF";', UTILS),
    ('U5', 'utils.num2hex: fixed 3-iteration loop',
     'for (let i = 0; i < 3; i++) {', UTILS),
    ('U6', 'utils.getTime: Node.js process.hrtime fallback',
     'process.hrtime', UTILS),
    ('U7', 'utils.isInsideRectangle: strict-< boundary (original semantics)',
     'left < x &&', UTILS),
    ('U8', 'utils.pointerListenerAdd: input validation',
     'if (!oDOM || !oDOM.addEventListener || !sEvIn || typeof fCall !== "function")', UTILS),
    ('U9', 'utils.pointerListenerAdd: touch fallback for !window.PointerEvent',
     '!window.PointerEvent', UTILS),
    ('U10', 'utils.pointerListenerAdd: down → touchstart conversion',
     'sMethod = "touch";\n        sEvent = "start";', UTILS),
    ('U11', 'utils.pointerListenerAdd: up → touchend conversion',
     'sMethod = "touch";\n        sEvent = "end";', UTILS),
    ('U12', 'utils.pointerListenerAdd: leave/cancel/gotpointercapture/lostpointercapture handling',
     'case "lostpointercapture":', UTILS),
    ('U13', 'utils.pointerListenerRemove: leave/cancel/gotpointercapture/lostpointercapture handling',
     'case "lostpointercapture": {', UTILS),
    ('U14', 'utils._getPointereventsMethod: defaults to "mouse"',
     'return "mouse";', UTILS),

    # ===================== P2 / small modules =====================
    ('S1', 'LLink.configure: original else branch (no object type guard)',
     '} else {\n      this.id = o.id;', LLINK),
    ('S2', 'DragAndScale constructor: skip_events 2nd parameter restored',
     'constructor(element, skip_events)', DAS),
    ('S3', 'DragAndScale constructor: gates bindEvents on skip_events',
     'if (!skip_events) {', DAS),

    # ===================== P2 / LGraphNode extras =====================
    ('N1', 'LGraphNode.loadImage: img.ready = false + onload handler',
     'img.ready = false;', LGNODE),
    ('N2', 'LGraphNode.loadImage: onload sets ready=true + setDirtyCanvas',
     'self.setDirtyCanvas(true);', LGNODE),
    ('N3', 'LGraphNode.trace: in-node console buffer',
     'if (!this.console) {', LGNODE),
    ('N4', 'LGraphNode.trace: cap by MAX_CONSOLE',
     'LGraphNode.MAX_CONSOLE || 100', LGNODE),
    ('N5', 'LGraphNode.trace: forwards to graph.onNodeTrace only when graph attached',
     'if (this.graph && this.graph.onNodeTrace)', LGNODE),

    # ===================== CurveEditor (round 2) =====================
    ('CE-1', 'CurveEditor.js exists with constructor',
     'class CurveEditor {', CURVE),
    ('CE-8', 'CurveEditor registered in index.js',
     'LiteGraph.CurveEditor = CurveEditor;', INDEX),

    # ===================== Utility re-attachments (round 1) =====================
    ('UTIL-1', 'LiteGraph.compareObjects re-attached',
     'LiteGraph.compareObjects = compareObjects;', INDEX),
    ('UTIL-7', 'LiteGraph.getParameterNames re-attached',
     'LiteGraph.getParameterNames = getParameterNames;', INDEX),
]

print("=" * 70)
print("COMPREHENSIVE SPOT-CHECK (rounds 1+2+3 combined)")
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
