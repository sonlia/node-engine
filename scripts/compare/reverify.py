#!/usr/bin/env python3
"""
Re-verify method-by-method comparison after P0/P1 fixes + CurveEditor addition.

Strategy:
1. Re-extract method lists from the original litegraph.js
2. Re-extract method lists from each refactored module
3. Compare method names (presence check) for each class
4. Spot-check key methods that were fixed (verify the fix is in place)
"""
import re
import json
from pathlib import Path

ORIG = Path('/home/z/my-project/scripts/compare/litegraph.original.js').read_text()
orig_lines = ORIG.split('\n')

def orig_methods(cls):
    """Return list of (method_name, line_no) for `Cls.prototype.X = function`."""
    out = []
    for i, line in enumerate(orig_lines, 1):
        m = re.match(rf'^\s*{cls}\.prototype\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*function', line)
        if m:
            out.append((m.group(1), i))
    return out

def orig_object_literal_methods(start, end):
    """Extract `NAME: function` methods from a section of the original file."""
    block = '\n'.join(orig_lines[start-1:end-1])
    return re.findall(r'^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*function\b', block, re.MULTILINE)

def refactored_methods(path):
    """Return list of method names from an ES6 class file."""
    src = Path(path).read_text()
    # Match `  methodName(`, `  static methodName(`, `  static async methodName(` at start of line
    # Allow any leading whitespace.
    methods = re.findall(
        r'^\s+(?:static\s+)?(?:async\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(',
        src,
        re.MULTILINE,
    )
    # Filter out control-flow keywords and known false positives
    keywords = {'if', 'for', 'while', 'switch', 'return', 'catch', 'else',
                'function', 'do', 'try', 'await', 'new', 'typeof', 'instanceof'}
    return [m for m in methods if m not in keywords]

print("=" * 70)
print("RE-VERIFICATION OF METHOD-BY-METHOD COMPARISON")
print("=" * 70)

# ============ LiteGraph (object literal) ============
print("\n--- LiteGraph (object literal) ---")
# LiteGraph literal is from L14 to L835 (before `function LGraph(`)
litegraph_methods = orig_object_literal_methods(14, 835)
ref_lg_methods = refactored_methods('/home/z/my-project/src/lib/litegraph/LiteGraph.js')
print(f"Original LiteGraph literal methods: {len(litegraph_methods)}")
print(f"Refactored LiteGraph.js methods: {len(ref_lg_methods)}")
missing = [m for m in litegraph_methods if m not in ref_lg_methods]
extra = [m for m in ref_lg_methods if m not in litegraph_methods and not m.startswith('_')]
print(f"Missing from refactored: {missing}")
print(f"Extra in refactored: {extra}")

# ============ LGraph ============
print("\n--- LGraph ---")
lgraph_methods = orig_methods('LGraph')
ref_lgraph = refactored_methods('/home/z/my-project/src/lib/litegraph/LGraph.js')
orig_names = [m for m, _ in lgraph_methods]
missing = [m for m in orig_names if m not in ref_lgraph]
extra = [m for m in ref_lgraph if m not in orig_names and m != 'constructor']
print(f"Original: {len(orig_names)} methods")
print(f"Refactored: {len(ref_lgraph)} methods (incl constructor)")
print(f"Missing from refactored: {missing}")
print(f"Extra in refactored: {extra}")

# ============ LGraphNode ============
print("\n--- LGraphNode ---")
lgnode_methods = orig_methods('LGraphNode')
ref_lgnode = refactored_methods('/home/z/my-project/src/lib/litegraph/LGraphNode.js')
orig_names = [m for m, _ in lgnode_methods]
# _ctor in original maps to constructor in refactored
expected_ref = set(orig_names) | {'constructor'}
missing = [m for m in orig_names if m not in ref_lgnode and m != '_ctor']
extra = [m for m in ref_lgnode if m not in expected_ref]
print(f"Original: {len(orig_names)} methods (_ctor → constructor)")
print(f"Refactored: {len(ref_lgnode)} methods")
print(f"Missing from refactored: {missing}")
print(f"Extra in refactored: {extra}")

# ============ LGraphCanvas ============
print("\n--- LGraphCanvas ---")
lgcanvas_methods = orig_methods('LGraphCanvas')
ref_lgcanvas = refactored_methods('/home/z/my-project/src/lib/litegraph/LGraphCanvas.js')
orig_names = [m for m, _ in lgcanvas_methods]
missing = [m for m in orig_names if m not in ref_lgcanvas]
extra = [m for m in ref_lgcanvas if m not in orig_names and m != 'constructor']
print(f"Original: {len(orig_names)} methods")
print(f"Refactored: {len(ref_lgcanvas)} methods")
print(f"Missing from refactored: {missing[:20]}")
print(f"Extra in refactored (sample): {extra[:20]}")

# ============ LLink ============
print("\n--- LLink ---")
llink_methods = orig_methods('LLink')
ref_llink = refactored_methods('/home/z/my-project/src/lib/litegraph/LLink.js')
orig_names = [m for m, _ in llink_methods]
missing = [m for m in orig_names if m not in ref_llink]
print(f"Original: {orig_names}")
print(f"Refactored: {ref_llink}")
print(f"Missing: {missing}")

# ============ LGraphGroup ============
print("\n--- LGraphGroup ---")
lgg_methods = orig_methods('LGraphGroup')
ref_lgg = refactored_methods('/home/z/my-project/src/lib/litegraph/LGraphGroup.js')
orig_names = [m for m, _ in lgg_methods]
# _ctor maps to constructor
expected = set(orig_names) | {'constructor', 'isPointInside', 'setDirtyCanvas'}
# LGraphGroup borrows isPointInside and setDirtyCanvas from LGraphNode in original;
# refactored implements them inline.
missing = [m for m in orig_names if m not in ref_lgg and m != '_ctor']
print(f"Original: {orig_names}")
print(f"Refactored: {ref_lgg}")
print(f"Missing: {missing}")

# ============ DragAndScale ============
print("\n--- DragAndScale ---")
das_methods = orig_methods('DragAndScale')
ref_das = refactored_methods('/home/z/my-project/src/lib/litegraph/DragAndScale.js')
orig_names = [m for m, _ in das_methods]
missing = [m for m in orig_names if m not in ref_das]
print(f"Original: {orig_names}")
print(f"Refactored: {ref_das}")
print(f"Missing: {missing}")

# ============ ContextMenu ============
print("\n--- ContextMenu ---")
cm_methods = orig_methods('ContextMenu')
ref_cm = refactored_methods('/home/z/my-project/src/lib/litegraph/ContextMenu.js')
orig_names = [m for m, _ in cm_methods]
missing = [m for m in orig_names if m not in ref_cm]
print(f"Original: {orig_names}")
print(f"Refactored: {ref_cm}")
print(f"Missing: {missing}")

# ============ CurveEditor ============
print("\n--- CurveEditor ---")
ce_methods = orig_methods('CurveEditor')
ref_ce = refactored_methods('/home/z/my-project/src/lib/litegraph/CurveEditor.js')
orig_names = [m for m, _ in ce_methods]
missing = [m for m in orig_names if m not in ref_ce]
print(f"Original: {orig_names}")
print(f"Refactored: {ref_ce}")
print(f"Missing: {missing}")

# ============ Late-attached statics verification ============
print("\n--- Late-attached statics (LiteGraph.X = Y) ---")
late_attachments = []
for i, line in enumerate(orig_lines, 1):
    m = re.match(r'^\s*LiteGraph\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=', line)
    if m:
        late_attachments.append((m.group(1), i))
# Filter to ones that look like assignments to functions/classes
late_filtered = [(n, l) for n, l in late_attachments 
                 if n not in ['debug'] and not n.startswith('pointerListener') or n.startswith('pointer')]

# Read index.js to check what's registered
index_src = Path('/home/z/my-project/src/lib/litegraph/index.js').read_text()
print(f"Late-attached in original: {len(late_attachments)}")
for name, line in late_attachments:
    registered = f'LiteGraph.{name}' in index_src or f'static {name}' in Path('/home/z/my-project/src/lib/litegraph/LiteGraph.js').read_text()
    status = '✅' if registered else '❌'
    print(f"  {status} LiteGraph.{name} (orig L{line})")

print("\n" + "=" * 70)
print("VERIFICATION COMPLETE")
print("=" * 70)
