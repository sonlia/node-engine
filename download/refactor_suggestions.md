# LiteGraph 重构优化建议（v3）

基于当前 11125 行代码的完整扫描。**原则：减少复杂逻辑和冗余代码，问题聚焦不分散。** 不考虑保守/替代方案，只做明确能降低复杂度且零风险的工作。

已完成：5 策略融合、死代码删除（nodes.js / CurveEditor.js / widget / ContextMenu.js / 菜单方法）、EVENT/ACTION 系统移除、右键菜单移除、bug 修复。

---

## 当前状态

| 文件 | 行数 | 占比 |
|---|---|---|
| LGraphCanvas.js | 5076 | 45.6% |
| LGraphNode.js | 2045 | 18.4% |
| LGraph.js | 1860 | 16.7% |
| LiteGraph.js | 778 | 7.0% |
| 其他 6 个文件 | 1366 | 12.3% |
| **总计** | **11125** | |

---

## P0：EVENT/ACTION stub 方法清理（~60 行，零风险）

### 问题

LGraphNode.js 第 1872-1924 行有 11 个 EVENT/ACTION no-op stub 方法。扫描调用情况：

| 方法 | 被调用情况 | 处理 |
|---|---|---|
| `addOnTriggerInput` | 0 处 | **可删** |
| `addOnExecutedOutput` | 0 处 | **可删** |
| `onAfterExecuteNode` | 0 处（只被 doExecute/actionDo stub 内部调） | **可删** |
| `changeMode` | 0 处外部调用 | **可删** |
| `doExecute` | LGraph.js runStep 调用 | **保留**（但可简化）|
| `executePendingActions` | 0 处 | **可删** |
| `actionDo` | 0 处 | **可删** |
| `trigger` | 0 处 | **可删** |
| `triggerSlot` | 0 处 | **可删** |
| `clearTriggeredSlot` | 0 处 | **可删** |
| `executeAction` | 0 处 | **可删** |

`doExecute` 被 `_runStepInternal` 调用（`do_not_catch_errors=true` 路径），但当前 stub 只是 `onExecute + onAfterExecuteNode`，而 `onAfterExecuteNode` 本身也是 stub。可以**把 doExecute 简化成直接调 onExecute**，然后让 runStep 直接调 `node.onExecute()` 而不是 `node.doExecute()`，最后删掉 doExecute。

### 建议

- 删除 10 个无人调用的 stub 方法（`addOnTriggerInput`/`addOnExecutedOutput`/`onAfterExecuteNode`/`changeMode`/`executePendingActions`/`actionDo`/`trigger`/`triggerSlot`/`clearTriggeredSlot`/`executeAction`）
- `doExecute` 简化：`_runStepInternal` 里 `do_not_catch_errors=true` 时直接调 `node.onExecute()`，不再走 `doExecute`
- 删除 `_waiting_actions` 字段初始化（构造函数第 61 行）
- 删除 `use_deferred_actions` 相关的 flush 逻辑（`_runStepInternal` 里第 377-384 行的 if 块）
- 删除 `LiteGraph.use_deferred_actions` / `do_add_triggers_slots` / `allow_multi_output_for_events` 死常量

**收益**：~60 行 + 移除 runStep 里的死分支。

**风险**：零。外部节点如果 override `onAction`/`onTrigger`，override 的方法不会被调用，但这本来就是 stub 行为。

---

## P1：onConnectionsChange 调用去重（20 处 → 提取公共方法，~120 行）

### 问题

LGraphNode.js 里 `onConnectionsChange` 被调 20 次，`onNodeConnectionChange` 被调 14 次。每次都是 6-8 行的重复模式：

```js
if (this.onConnectionsChange) {
  this.onConnectionsChange(LiteGraph.INPUT, slot, true, link_info, input);
}
if (target_node.onConnectionsChange) {
  target_node.onConnectionsChange(LiteGraph.OUTPUT, slot, true, link_info, output);
}
if (this.graph && this.graph.onNodeConnectionChange) {
  this.graph.onNodeConnectionChange(LiteGraph.OUTPUT, target_node, slot);
  this.graph.onNodeConnectionChange(LiteGraph.INPUT, this, slot);
}
```

出现在 `connect`（7 次）、`disconnectOutput`（多处）、`disconnectInput`（多处）。

### 建议

提取私有方法：

```js
_fireConnChange(side, slot, isConnect, linkInfo, slotObj, otherNode, otherSide, otherSlot) {
  if (this.onConnectionsChange) this.onConnectionsChange(side, slot, isConnect, linkInfo, slotObj);
  if (otherNode?.onConnectionsChange) otherNode.onConnectionsChange(otherSide, otherSlot, isConnect, linkInfo, slotObj);
  if (this.graph?.onNodeConnectionChange) {
    this.graph.onNodeConnectionChange(otherSide, otherNode, otherSlot);
    this.graph.onNodeConnectionChange(side, this, slot);
  }
}
```

每个调用点从 6-8 行变成 1 行。

**收益**：~120 行重复代码消除，连接变更逻辑集中一处，未来改事件签名只改一处。

**风险**：低，行为等价，需仔细核对参数顺序。

---

## P2：find*Slot 系列去重（7 方法 → 3 实现 + 包装，~40 行）

### 问题

7 个 slot 查找方法，逻辑大量重复：

| 方法 | 行数 | 实现 |
|---|---|---|
| `findInputSlot(name, returnObj)` | 10 | 独立实现 |
| `findOutputSlot(name, returnObj)` | 10 | 独立实现（与上几乎一样）|
| `findInputSlotFree(optsIn)` | 20 | 独立实现 |
| `findOutputSlotFree(optsIn)` | 20 | 独立实现（与上几乎一样）|
| `findInputSlotByType(...)` | 4 | 委托 findSlotByType |
| `findOutputSlotByType(...)` | 4 | 委托 findSlotByType |
| `findSlotByType(...)` | 50 | 实际实现 |

`findInputSlot`/`findOutputSlot` 只差 `this.inputs` vs `this.outputs`。`findInputSlotFree`/`findOutputSlotFree` 同理。

### 建议

提取私有 `_findSlotInArray(arr, name, returnObj)` 和 `_findFreeSlotInArray(arr, optsIn)`。6 个公开方法变成一行委托包装。

**收益**：~40 行重复消除，查找逻辑集中。

**风险**：低，包装方法保证接口不变。

---

## P3：未使用的 accessor 方法删除（~30 行，零风险）

### 问题

LGraphNode.js 有一批 accessor 方法，扫描发现无外部调用：

| 方法 | 外部调用 | 处理 |
|---|---|---|
| `getInputInfo(slot)` | 0 | **可删** |
| `getInputLink(slot)` | 0 | **可删** |
| `getInputOrProperty(name)` | 0 | **可删** |
| `getOutputData(slot)` | 2（仅 LGraphNode 内部） | **可删**（内部直接读）|
| `getOutputInfo(slot)` | 0 | **可删** |
| `isAnyOutputConnected()` | 0 | **可删** |

### 建议

删除这 6 个方法。`getOutputData` 的 2 处内部调用直接改成 `this.outputs[slot]._data`。

**收益**：~30 行，减少 API 表面积。

**风险**：零（无外部调用）。但如果有第三方代码用这些方法，会 break —— 需确认是否要保留兼容。**建议保留**（接口稳定优先）。

---

## P4：LiteGraph.js 死常量清理（~10 行，零风险）

### 问题

LiteGraph.js 有一批EVENT/ACTION 相关的死常量，默认 false 且无人修改：

| 常量 | 当前值 | 引用 |
|---|---|---|
| `use_deferred_actions` | false | runStep 里 if 判断（P0 删后无引用）|
| `do_add_triggers_slots` | false | connect 里 if 判断（永远不进）|
| `allow_multi_output_for_events` | true | 无引用 |
| `EVENT_LINK_COLOR` | "#A86" | LGraphCanvas 渲染（EVENT slot 颜色）|
| `node_box_coloured_when_on` | false | drawNodeShape 里 if（永远不进）|
| `node_box_coloured_by_mode` | false | drawNodeShape 里 if（永远不进）|
| `shift_click_do_break_link_from` | false | processMouseDown 里 if（永远不进）|
| `click_do_break_link_to` | false | processMouseDown 里 if（永远不进）|
| `release_link_on_empty_shows_menu` | false | processMouseUp 里 if（永远不进）|

### 建议

P0 完成后删除 `use_deferred_actions`/`do_add_triggers_slots`/`allow_multi_output_for_events`。其余保留（它们是行为开关，虽然默认 false，但外部可能改成 true 启用功能 —— 删了会破坏兼容）。

`node_box_coloured_when_on`/`node_box_coloured_by_mode` 的 if 块可以删（永远不进），但常量保留。

**收益**：~10 行 + 移除死分支。

**风险**：零。

---

## P5：processMouseDown / processMouseUp 右键分支清理（~30 行，零风险）

### 问题

processMouseDown 第 1025 行 `else if (getMouseButton(e) === 3 || this.pointer_is_double)` 是右键处理分支，调用 `processContextMenu`（已是 stub）。processMouseUp 也有类似右键分支。这些分支现在什么都不做。

### 建议

删除 processMouseDown / processMouseUp 里的右键分支（`getMouseButton(e) === 3` 的 else if 块），右键事件让浏览器默认行为处理。

**收益**：~30 行，减少 processMouseDown 的嵌套层级。

**风险**：零（右键本来就不做事）。

---

## 不做的事（已确认）

1. **不拆 LGraphCanvas.js 成多文件** —— 风险高，收益是可维护性而非复杂度降低
2. **不动 5 策略融合代码** —— 已验证，重复计算消除 80%
3. **不动 getConnectionPos** —— canvas 13 处调用依赖完整行为
4. **不动工具函数 LiteGraph.X 挂载** —— 兼容性需要
5. **不删 drawSubgraphPanel / createPanel** —— 子图功能完整可用
6. **不删 P3 的 accessor 方法** —— 接口稳定优先，保留兼容
7. **不拆 processMouseDown** —— 572 行但逻辑聚焦，拆分收益不抵风险
8. **不动 LiteGraph.EVENT/ACTION 常量** —— slot 类型判断还在用

---

## 优先级排序

| 建议 | 行数减少 | 风险 | 优先级 |
|---|---|---|---|
| P0 EVENT/ACTION stub 清理 | ~60 | 无 | **立即做** |
| P4 死常量 + 死分支 | ~10 | 无 | **立即做** |
| P5 右键分支清理 | ~30 | 无 | **立即做** |
| P1 onConnectionsChange 去重 | ~120 | 低 | P1 |
| P2 find*Slot 去重 | ~40 | 低 | P1 |

**P0+P4+P5 总收益**：删除约 100 行，11125 → ~11025 行。零风险。
