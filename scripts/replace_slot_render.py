#!/usr/bin/env python3
"""Replace the slot rendering loops in LGraphCanvas.js with calls to _renderSlot."""
import re
from pathlib import Path

f = Path('/home/z/my-project/src/lib/litegraph/LGraphCanvas.js')
src = f.read_text()

# Find and replace the input slots loop (from "// input connection slots" to the end of inputs for loop)
# The input loop starts at "// input connection slots" and ends before "// output connection slots"
input_start = src.find('            // input connection slots')
output_start = src.find('            // output connection slots')

# Find the end of the output loop (before the closing of "render inputs and outputs" block)
# Look for the pattern after the output loop
collapsed_marker = '} else if (this.render_collapsed_slots)'

output_end = src.find(collapsed_marker, output_start)

if input_start == -1 or output_start == -1 or output_end == -1:
    print("ERROR: Could not find markers")
    exit(1)

# Build the replacement
new_code = '''            // input connection slots
            if (node.inputs) {
                for (let i = 0; i < node.inputs.length; i++) {
                    const slot = node.inputs[i];
                    const pos = node.getConnectionPos(true, i, slot_pos);
                    pos[0] -= node.pos[0];
                    pos[1] -= node.pos[1];
                    if (max_y < pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5) {
                        max_y = pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5;
                    }
                    this._renderSlot(ctx, node, slot, pos, {
                        isInput: true, slotIndex: i,
                        connected: slot.link != null,
                        compatible: !this.connecting_output || LiteGraph.isValidConnection(slot.type, out_slot.type),
                        editorAlpha, lowQuality: low_quality, horizontal, renderText: render_text,
                    });
                }
            }

            // output connection slots
            ctx.textAlign = horizontal ? "center" : "right";
            ctx.strokeStyle = "black";
            if (node.outputs) {
                for (let i = 0; i < node.outputs.length; i++) {
                    const slot = node.outputs[i];
                    const pos = node.getConnectionPos(false, i, slot_pos);
                    pos[0] -= node.pos[0];
                    pos[1] -= node.pos[1];
                    if (max_y < pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5) {
                        max_y = pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5;
                    }
                    this._renderSlot(ctx, node, slot, pos, {
                        isInput: false, slotIndex: i,
                        connected: !!(slot.links && slot.links.length),
                        compatible: !this.connecting_input || LiteGraph.isValidConnection(slot.type, in_slot.type),
                        editorAlpha, lowQuality: low_quality, horizontal, renderText: render_text,
                    });
                }
            }

        '''

# Replace the old code between input_start and output_end
new_src = src[:input_start] + new_code + src[output_end:]

f.write_text(new_src)
print(f"Replaced {output_end - input_start} chars with {len(new_code)} chars")
print("Done")
