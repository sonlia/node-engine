#!/usr/bin/env python3
"""
Extract specific method bodies from original litegraph.js for detailed comparison.
"""
import re
import sys

ORIGINAL = "/home/z/my-project/scripts/original_litegraph.js"

with open(ORIGINAL) as f:
    content = f.read()

def extract_method_body(class_name, method_name, content):
    """Extract the body of a method from the original."""
    # Try prototype pattern first
    patterns = [
        rf'{re.escape(class_name)}\.prototype\.{re.escape(method_name)}\s*=\s*function\s*\([^)]*\)\s*\{{',
        rf'{re.escape(class_name)}\.{re.escape(method_name)}\s*=\s*function\s*\([^)]*\)\s*\{{',
    ]
    
    for pattern in patterns:
        m = re.search(pattern, content)
        if m:
            start = m.end() - 1  # at the {
            # Find matching closing brace
            depth = 0
            for i in range(start, len(content)):
                if content[i] == '{':
                    depth += 1
                elif content[i] == '}':
                    depth -= 1
                    if depth == 0:
                        return content[m.start():i+1]
            break
    return None

# Methods to inspect - from the issues list
methods_to_check = [
    # Real missing methods
    ('LGraphNode', 'deserialize'),
    ('LGraph', 'updateExecutionOrder'),
    
    # Parameter mismatches in LGraphNode
    ('LGraphNode', 'actionDo'),
    ('LGraphNode', 'addConnection'),
    ('LGraphNode', 'clearTriggeredSlot'),
    ('LGraphNode', 'connectByType'),
    ('LGraphNode', 'connectByTypeOutput'),
    ('LGraphNode', 'doExecute'),
    ('LGraphNode', 'executeAction'),
    ('LGraphNode', 'findInputSlot'),
    ('LGraphNode', 'findInputSlotByType'),
    ('LGraphNode', 'findOutputSlot'),
    ('LGraphNode', 'findOutputSlotByType'),
    ('LGraphNode', 'findSlotByType'),
    ('LGraphNode', 'getInputData'),
    ('LGraphNode', 'getInputDataByName'),
    ('LGraphNode', 'isPointInside'),
    ('LGraphNode', 'onAfterExecuteNode'),
    ('LGraphNode', 'trigger'),
    ('LGraphNode', 'triggerSlot'),
    ('LGraphNode', 'setOutputData'),
    
    # Parameter mismatches in LGraphCanvas
    ('LGraphCanvas', 'isAreaClicked'),
    ('LGraphCanvas', 'onNodeSelectionChange'),
    ('LGraphCanvas', 'showShowGraphOptionsPanel'),
    
    # Parameter mismatch in LGraphGroup
    ('LGraphGroup', 'move'),
    ('LGraphGroup', '_ctor'),
    ('LGraphGroup', 'isPointInside'),
    
    # Check key utility functions in LiteGraph
    ('LiteGraph', 'getParameterNames'),
    ('LiteGraph', 'compareObjects'),
    ('LiteGraph', 'distance'),
    ('LiteGraph', 'growBounding'),
    ('LiteGraph', 'hex2num'),
    ('LiteGraph', 'isInsideBounding'),
    ('LiteGraph', 'isInsideRectangle'),
    ('LiteGraph', 'num2hex'),
    ('LiteGraph', 'overlapBounding'),
    ('LiteGraph', 'colorToString'),
    ('LiteGraph', 'closeAllContextMenus'),
    ('LiteGraph', 'extendClass'),
    ('LiteGraph', 'pointerListenerAdd'),
    ('LiteGraph', 'pointerListenerRemove'),
]

# Output file
output_path = "/home/z/my-project/scripts/original_methods_dump.txt"
with open(output_path, 'w') as out:
    for cls, method in methods_to_check:
        body = extract_method_body(cls, method, content)
        out.write(f"\n{'='*80}\n")
        out.write(f"ORIGINAL: {cls}.prototype.{method}\n")
        out.write(f"{'='*80}\n")
        if body:
            out.write(body + "\n")
        else:
            out.write("NOT FOUND AS PROTOTYPE METHOD\n")
            # Try as standalone function
            standalone_pattern = rf'\bfunction\s+{re.escape(method)}\s*\([^)]*\)\s*\{{'
            m = re.search(standalone_pattern, content)
            if m:
                start = m.end() - 1
                depth = 0
                for i in range(start, len(content)):
                    if content[i] == '{':
                        depth += 1
                    elif content[i] == '}':
                        depth -= 1
                        if depth == 0:
                            out.write(content[m.start():i+1] + "\n")
                            break
            else:
                # Try LiteGraph.compareObjects = compareObjects pattern (just an alias)
                alias_pattern = rf'LiteGraph\.{re.escape(method)}\s*=\s*([^;]+);'
                m = re.search(alias_pattern, content)
                if m:
                    out.write(f"LiteGraph.{method} = {m.group(1)};  (alias)\n")

print(f"Output saved to {output_path}")
print(f"Size: {os.path.getsize(output_path)} bytes" if (os := __import__('os')).path.exists(output_path) else "No output")
