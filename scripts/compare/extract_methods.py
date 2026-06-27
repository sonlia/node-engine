#!/usr/bin/env python3
"""Extract method names from original litegraph.js file, grouped by class."""
import re
import json
from pathlib import Path

src = Path('/home/z/my-project/scripts/compare/litegraph.original.js').read_text()
lines = src.split('\n')

# Discover top-level classes and their line ranges
# Pattern: function ClassName(
class_defs = []
for i, line in enumerate(lines, 1):
    m = re.match(r'^\s*function\s+([A-Z][A-Za-z0-9_]*)\s*\(', line)
    if m:
        class_defs.append({'name': m.group(1), 'start_line': i})
class_defs.append({'name': '__END__', 'start_line': len(lines) + 1})

# Map each class to a line range
ranges = {}
for i in range(len(class_defs) - 1):
    ranges[class_defs[i]['name']] = (class_defs[i]['start_line'], class_defs[i+1]['start_line']-1)

print("=== Top-level function-class definitions ===")
for c in class_defs[:-1]:
    print(f"  {c['name']}: line {c['start_line']}")

# Extract LiteGraph object literal methods (line 14 to first 'function LGraph(')
litegraph_start = 14
lgraph_start = next((c['start_line'] for c in class_defs if c['name'] == 'LGraph'), None)
litegraph_block = '\n'.join(lines[litegraph_start-1:lgraph_start-1])

# Find method names in the LiteGraph literal: NAME: function(
litegraph_methods = re.findall(r'^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*function\b', litegraph_block, re.MULTILINE)
# Find property names (single line "NAME: value,")
litegraph_props = []
in_obj = True
brace_depth = 0
for line in litegraph_block.split('\n'):
    # crude detection
    m = re.match(r'^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+?),?\s*$', line)
    if m and 'function' not in m.group(2):
        litegraph_props.append(m.group(1))

print(f"\n=== LiteGraph (object literal) ===")
print(f"  Methods ({len(litegraph_methods)}):")
for m in litegraph_methods:
    print(f"    - {m}")
print(f"\n  Properties ({len(litegraph_props)}):")
for p in litegraph_props[:50]:
    print(f"    - {p}")

# Extract prototype methods for each class
print("\n=== Prototype methods per class ===")
for cls_name in ['LGraph', 'LGraphNode', 'LGraphCanvas', 'LLink', 'LGraphGroup', 'DragAndScale', 'ContextMenu']:
    methods = []
    for i, line in enumerate(lines, 1):
        m = re.match(rf'^\s*{cls_name}\.prototype\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*function', line)
        if m:
            methods.append((m.group(1), i))
    print(f"\n  {cls_name}: {len(methods)} methods")
    for name, line_no in methods:
        print(f"    L{line_no}: {name}")

# Also extract Object.defineProperty for prototype (getter/setter)
print("\n=== Object.defineProperty ===")
for i, line in enumerate(lines, 1):
    if 'Object.defineProperty' in line and 'prototype' in lines[i] if i < len(lines) else '':
        m = re.search(r'Object\.defineProperty\(\s*([A-Za-z]+)\.prototype,\s*"([^"]+)"', line)
        if m:
            print(f"  L{i}: {m.group(1)}.prototype.{m.group(2)}")
