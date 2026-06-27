#!/usr/bin/env python3
"""
Compare methods between original litegraph.js and refactored ES6 modules.
Extracts method names and signatures from both, then reports differences.
"""
import re
import os
import json

ORIGINAL = "/home/z/my-project/scripts/original_litegraph.js"
REFACTORED_DIR = "/home/z/my-project/src/lib/litegraph"

# ============================================================
# Parse original file to extract all method definitions
# ============================================================

def extract_original_methods(content):
    """Extract all prototype method definitions from the original IIFE code."""
    methods = {}
    
    # Pattern: ClassName.prototype.methodName = function(...)
    proto_pattern = re.compile(
        r'(\w+)\.prototype\.(\w+)\s*=\s*function\s*\(([^)]*)\)',
        re.MULTILINE
    )
    for m in proto_pattern.finditer(content):
        cls_name = m.group(1)
        method_name = m.group(2)
        params = m.group(3).strip()
        start = m.start()
        # Find the function body
        methods.setdefault(cls_name, {})[method_name] = {
            'params': params,
            'start': start,
            'type': 'prototype'
        }
    
    # Pattern: Object.defineProperty(ClassName.prototype, "propName", {...})
    defineprop_pattern = re.compile(
        r'Object\.defineProperty\s*\(\s*(\w+)\.prototype\s*,\s*["\'](\w+)["\']',
        re.MULTILINE
    )
    for m in defineprop_pattern.finditer(content):
        cls_name = m.group(1)
        prop_name = m.group(2)
        methods.setdefault(cls_name, {})[prop_name] = {
            'params': '(getter/setter)',
            'start': m.start(),
            'type': 'defineProperty'
        }
    
    # Pattern: LiteGraph.staticMethod = function(...)
    static_pattern = re.compile(
        r'LiteGraph\.(\w+)\s*=\s*function\s*\(([^)]*)\)',
        re.MULTILINE
    )
    for m in static_pattern.finditer(content):
        method_name = m.group(1)
        params = m.group(2).strip()
        methods.setdefault('LiteGraph_static', {})[method_name] = {
            'params': params,
            'start': m.start(),
            'type': 'static'
        }
    
    # Pattern: ClassName.staticMethod = function(...)
    other_static_pattern = re.compile(
        r'(LGraph|LGraphNode|LGraphCanvas|LLink|LGraphGroup)\.(\w+)\s*=\s*function\s*\(([^)]*)\)',
        re.MULTILINE
    )
    for m in other_static_pattern.finditer(content):
        cls_name = m.group(1) + '_static'
        method_name = m.group(2)
        params = m.group(3).strip()
        if method_name not in ['prototype']:  # skip prototype assignments
            methods.setdefault(cls_name, {})[method_name] = {
                'params': params,
                'start': m.start(),
                'type': 'static'
            }
    
    return methods

def extract_refactored_methods(content, class_name):
    """Extract methods from ES6 class definition."""
    methods = {}
    
    # Pattern: methodName(params) {  or  async methodName(params) {
    method_pattern = re.compile(
        r'(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*\{',
        re.MULTILINE
    )
    
    # Find the class body first
    class_match = re.search(
        rf'class\s+{class_name}\s*(?:extends\s+\w+\s*)?\{{',
        content
    )
    if not class_match:
        return methods
    
    # Find matching closing brace for the class
    start = class_match.end() - 1
    depth = 0
    class_end = start
    for i in range(start, len(content)):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                class_end = i
                break
    
    class_body = content[start:class_end]
    
    # Also get static methods
    for m in method_pattern.finditer(class_body):
        method_name = m.group(1)
        if method_name == class_name:  # skip constructor
            continue
        params = m.group(2).strip()
        # Check if it's static by looking for 'static' keyword before method name
        before = class_body[max(0, m.start()-20):m.start()]
        is_static = 'static' in before
        methods[method_name] = {
            'params': params,
            'is_static': is_static
        }
    
    # Also check for get/set properties
    getter_pattern = re.compile(r'get\s+(\w+)\s*\(\s*\)\s*\{', re.MULTILINE)
    setter_pattern = re.compile(r'set\s+(\w+)\s*\(([^)]*)\)\s*\{', re.MULTILINE)
    
    for m in getter_pattern.finditer(class_body):
        name = m.group(1)
        before = class_body[max(0, m.start()-20):m.start()]
        is_static = 'static' in before
        methods.setdefault(name, {})['is_getter'] = True
        methods.setdefault(name, {})['is_static'] = is_static
    
    for m in setter_pattern.finditer(class_body):
        name = m.group(1)
        params = m.group(2).strip()
        before = class_body[max(0, m.start()-20):m.start()]
        is_static = 'static' in before
        methods.setdefault(name, {})['is_setter'] = True
        methods.setdefault(name, {})['params'] = params
        methods.setdefault(name, {})['is_static'] = is_static
    
    return methods

def extract_litegraph_static(content):
    """Extract static properties and methods from LiteGraph.js module."""
    methods = {}
    props = {}
    
    # static method = function / static method(...)
    static_method_pattern = re.compile(
        r'static\s+(\w+)\s*\(([^)]*)\)',
        re.MULTILINE
    )
    for m in static_method_pattern.finditer(content):
        methods[m.group(1)] = m.group(2).strip()
    
    # static property = value
    static_prop_pattern = re.compile(
        r'static\s+(\w+)\s*=\s*([^;]+);',
        re.MULTILINE
    )
    for m in static_prop_pattern.finditer(content):
        props[m.group(1)] = m.group(2).strip()
    
    # Also look for: static get propertyName()
    static_get_pattern = re.compile(
        r'static\s+get\s+(\w+)\s*\(',
        re.MULTILINE
    )
    for m in static_get_pattern.finditer(content):
        props[m.group(1)] = '(getter)'
    
    return methods, props

def extract_original_litegraph_props(content):
    """Extract LiteGraph static properties from original."""
    props = {}
    # LiteGraph.propName = value
    prop_pattern = re.compile(
        r'LiteGraph\.(\w+)\s*=\s*([^;]+);',
        re.MULTILINE
    )
    for m in prop_pattern.finditer(content):
        name = m.group(1)
        value = m.group(2).strip()
        # Skip if it's a function assignment (already captured as methods)
        if 'function' in value:
            continue
        props[name] = value
    
    return props


# ============================================================
# Main comparison logic
# ============================================================

with open(ORIGINAL) as f:
    original = f.read()

print("=" * 80)
print("ORIGINAL FILE METHOD EXTRACTION")
print("=" * 80)

orig_methods = extract_original_methods(original)

for cls_name in sorted(orig_methods.keys()):
    methods = orig_methods[cls_name]
    print(f"\n{cls_name}: {len(methods)} methods/properties")
    for m_name in sorted(methods.keys()):
        info = methods[m_name]
        print(f"  {m_name}({info['params']}) [{info['type']}]")

# ============================================================
# Class mapping: original class name -> refactored file
# ============================================================

class_file_map = {
    'LGraphNode': 'LGraphNode.js',
    'LGraph': 'LGraph.js',
    'LGraphCanvas': 'LGraphCanvas.js',
    'LLink': 'LLink.js',
    'LGraphGroup': 'LGraphGroup.js',
    'DragAndScale': 'DragAndScale.js',
    'ContextMenu': 'ContextMenu.js',
}

print("\n" + "=" * 80)
print("METHOD-BY-METHOD COMPARISON")
print("=" * 80)

all_issues = []

for cls_name, filename in class_file_map.items():
    filepath = os.path.join(REFACTORED_DIR, filename)
    if not os.path.exists(filepath):
        print(f"\n⚠️  {cls_name}: File {filename} not found!")
        continue
    
    with open(filepath) as f:
        refactored_content = f.read()
    
    orig_cls_methods = orig_methods.get(cls_name, {})
    
    if cls_name in ['DragAndScale', 'ContextMenu']:
        # These might use different class name pattern in original
        # Check if they exist as separate prototypes in original
        pass
    
    ref_methods = extract_refactored_methods(refactored_content, cls_name)
    
    print(f"\n{'='*60}")
    print(f"{cls_name} ({filename})")
    print(f"  Original methods: {len(orig_cls_methods)}")
    print(f"  Refactored methods: {len(ref_methods)}")
    print(f"{'='*60}")
    
    # Check for missing methods (in original but not in refactored)
    missing = []
    for m_name in sorted(orig_cls_methods.keys()):
        if m_name not in ref_methods:
            missing.append((m_name, orig_cls_methods[m_name]))
    
    if missing:
        print(f"\n  ❌ MISSING in refactored ({len(missing)}):")
        for m_name, info in missing:
            print(f"     - {m_name}({info['params']}) [{info['type']}]")
            all_issues.append(f"{cls_name}.{m_name}: MISSING")
    else:
        print(f"\n  ✅ All original methods present")
    
    # Check for extra methods (in refactored but not in original)
    extra = []
    for m_name in sorted(ref_methods.keys()):
        if m_name not in orig_cls_methods:
            extra.append(m_name)
    
    if extra:
        print(f"\n  ➕ EXTRA in refactored ({len(extra)}):")
        for m_name in extra:
            print(f"     + {m_name}")
    
    # Check parameter signatures
    print(f"\n  📝 Parameter comparison:")
    param_diffs = []
    for m_name in sorted(orig_cls_methods.keys()):
        if m_name in ref_methods:
            orig_params = orig_cls_methods[m_name]['params']
            ref_params = ref_methods[m_name].get('params', '')
            
            # Normalize params for comparison
            orig_param_list = [p.strip() for p in orig_params.split(',') if p.strip()]
            ref_param_list = [p.strip() for p in ref_params.split(',') if p.strip()]
            
            # Remove 'this' param from original (implicit in ES6)
            if orig_param_list and orig_param_list[0] in ['v', 'value', 'e', 'event']:
                pass  # Don't auto-remove, keep for comparison
            
            if len(orig_param_list) != len(ref_param_list):
                # Could be due to 'this' being implicit
                print(f"     ⚠️  {m_name}: orig({orig_params}) vs ref({ref_params})")
                param_diffs.append(m_name)
    
    if not param_diffs:
        print(f"     ✅ All parameters match (or differ only by implicit this)")

# ============================================================
# LiteGraph static comparison
# ============================================================
print(f"\n{'='*80}")
print("LiteGraph STATIC COMPARISON")
print(f"{'='*80}")

orig_static_methods = orig_methods.get('LiteGraph_static', {})
orig_static_props = extract_original_litegraph_props(original)

ref_filepath = os.path.join(REFACTORED_DIR, 'LiteGraph.js')
with open(ref_filepath) as f:
    ref_content = f.read()

ref_static_methods, ref_static_props = extract_litegraph_static(ref_content)

print(f"\nOriginal static methods: {len(orig_static_methods)}")
print(f"Refactored static methods: {len(ref_static_methods)}")
print(f"Original static properties: {len(orig_static_props)}")
print(f"Refactored static properties: {len(ref_static_props)}")

# Missing static methods
missing_static = []
for m_name in sorted(orig_static_methods.keys()):
    if m_name not in ref_static_methods:
        missing_static.append(m_name)

if missing_static:
    print(f"\n  ❌ MISSING static methods ({len(missing_static)}):")
    for m_name in missing_static:
        print(f"     - {m_name}({orig_static_methods[m_name]['params']})")
        all_issues.append(f"LiteGraph.{m_name}: MISSING static method")

# Missing static properties
missing_props = []
for p_name in sorted(orig_static_props.keys()):
    if p_name not in ref_static_props:
        missing_props.append(p_name)

if missing_props:
    print(f"\n  ❌ MISSING static properties ({len(missing_props)}):")
    for p_name in missing_props:
        print(f"     - {p_name} = {orig_static_props[p_name]}")
        all_issues.append(f"LiteGraph.{p_name}: MISSING static property")

# ============================================================
# Summary
# ============================================================
print(f"\n{'='*80}")
print("SUMMARY OF ALL ISSUES")
print(f"{'='*80}")
if all_issues:
    for issue in all_issues:
        print(f"  ❌ {issue}")
    print(f"\nTotal issues: {len(all_issues)}")
else:
    print("  ✅ No issues found!")
