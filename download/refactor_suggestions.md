# LiteGraph 重构优化建议（v2）

基于当前 12824 行代码的完整扫描。**原则：减少复杂逻辑和冗余代码，问题聚焦不分散。** 不考虑保守/替代方案，只做明确能降低复杂度且零风险的工作。

已完成（见 git log）：死代码删除（nodes.js / CurveEditor.js / widget 渲染）、EVENT/ACTION 系统移除、右键菜单移除、5 策略融合、runStep 双路径合并、缓存精细化失效、折叠/拖线 bug 修复。

---

## 当前状态

| 文件 | 行数 | 占比 |
|---|---|---|
| LGraphCanvas.js | 6267 | 48.9% |
| LGraphNode.js | 2045 | 15.9% |
| LGraph.js | 1860 | 14.5% |
| LiteGraph.js | 795 | 6.2% |
| 其他 7 个文件 | 1857 | 14.5% |
| **总计** | **12824** | |

---

## P0：菜单/面板死代码删除（~1100 行，零风险）

### 问题

上一轮把 `processContextMenu` / `showSearchBox` / `showShowNodePanel` / `showConnectionMenu` / `createDefaultNodeForSlot` 改成了 no-op stub，但**它们背后的整套菜单构建和面板系统还在**，且无人调用：

| 方法 | 行数 | 调用者 | 状态 |
|---|---|---|---|
| `getCanvasMenuOptions` | ~30 | 无（原被 processContextMenu 调，已 stub） | 死代码 |
| `getNodeMenuOptions` | ~110 | 无（同上） | 死代码 |
| `onMenuAdd` | ~80 | 仅被 getCanvasMenuOptions 引用 | 死代码 |
| `onMenuNodeRemove` | ~30 | 仅被 getNodeMenuOptions 引用 | 死代码 |
| `onMenuNodeClone` | ~35 | 同上 | 死代码 |
| `onMenuNodeCollapse` | ~25 | 同上 | 死代码 |
| `onMenuNodeMode` | ~35 | 同上 | 死代码 |
| `onMenuNodeColors` | ~65 | 同上 | 死代码 |
| `onMenuNodeShapes` | ~40 | 同上 | 死代码 |
| `onMenuNodePin` | ~15 | 同上 | 死代码 |
| `onShowMenuNodeProperties` | ~150 | 同上 | 死代码 |
| `onMenuResizeNode` | ~40 | 同上 | 死代码 |
| `prompt` | ~110 | 仅被 onShowMenuNodeProperties 调 | 死代码 |
| `showEditPropertyValue` | ~130 | 仅被 onShowMenuNodeProperties 调 | 死代码 |
| `createPanel` | ~180 | 仅被 showEditPropertyValue / drawSubgraphPanel* 调 | 见 P0.2 |
| `checkPanels` | ~50 | 仅被构造函数调，但 node_panel/options_panel 永远 null | 死代码 |

**总计约 1100 行死代码**，集中在 LGraphCanvas.js 第 4400-6300 行区间。

### P0.1 删除 onMenu* 静态方法 + getCanvasMenuOptions + getNodeMenuOptions

这些方法只互相引用，对外没有任何调用入口（`processContextMenu` 已是 stub）。整段删除。

### P0.2 删除 prompt + showEditPropertyValue + onShowMenuNodeProperties

`onShowMenuNodeProperties` 只被 `getNodeMenuOptions`（P0.1 已删）引用；`showEditPropertyValue` 只被 `onShowMenuNodeProperties` 调；`prompt` 只被 `showEditPropertyValue` 调。链条断开后全删。

### P0.3 删除 checkPanels + 简化 createPanel

`checkPanels` 检查 `this.node_panel` / `this.options_panel`，但这俩字段永远 null（只有 `showShowNodePanel` 和 `showEditPropertyValue` 会赋值，都是 stub）。`checkPanels` 本身也只在构造函数调一次。

`createPanel` 被 `drawSubgraphPanelLeft/Right` 调用（见 P0.4 判断）。如果 subgraph 面板保留则 createPanel 保留；如果删则一起删。

### P0.4 drawSubgraphPanel 系列（需确认）

`drawSubgraphPanel` / `drawSubgraphPanelLeft` / `drawSubgraphPanelRight`（~180 行）在 `drawFrontCanvas` 第 2630 行被调用，但只在 `this._graph_stack` 非空时（即打开了 subgraph）。当前 demo 不用 subgraph，但 `openSubgraph` / `closeSubgraph` 方法还在且可用。

**建议保留**（功能完整，不是死代码，只是 demo 没用到）。如果确认永远不用 subgraph，再删。

### P0.5 ContextMenu.js 文件

`ContextMenu.js`（488 行）只被 LGraphCanvas.js 里的 `onMenu*` 方法 `new ContextMenu(...)` 调用。P0.1 删完后，`ContextMenu` 类无任何调用者。

**建议删除文件 + 清理 index.js 的 import/挂载/export**。如果外部代码可能直接用 `LiteGraph.ContextMenu`，保留文件但它是纯死代码。

---

## P1：processMouseDown 拆分（572 行 → 拆成 4 个聚焦方法）

### 问题

`processMouseDown` 是整个代码库最大的方法（572 行），职责混杂：canvas 空白点击、节点点击、slot 点击、折叠框点击、resize handle、group 操作、连接拖动起点。难以维护和测试。

### 建议拆分

按职责拆成 4 个私有方法（不拆文件，保持 LGraphCanvas 单文件）：

```
processMouseDown(e)
  ├─ _handleCanvasBgClick(e)      // 空白画布点击/框选起点（~80 行）
  ├─ _handleNodeClick(e, node)    // 节点体点击/折叠框/double-click（~150 行）
  ├─ _handleSlotClick(e, node)    // input/output slot 点击/断开重连（~180 行）
  └─ _handleResizeHandle(e, node) // 右下角 resize（~40 行）
```

每个方法返回 `true` 表示已处理（skip_action），`false` 表示继续。`processMouseDown` 变成协调器（~50 行）。

**收益**：每个方法职责单一，可独立测试；修改 slot 逻辑不会碰 group 逻辑。

**风险**：低，行为完全等价，只是拆分。

---

## P2：LGraphNode find*Slot 系列去重（7 个方法 → 3 个）

### 问题

LGraphNode.js 有 7 个 slot 查找方法，逻辑大量重复：

| 方法 | 行数 | 作用 |
|---|---|---|
| `findInputSlot(name, returnObj)` | 10 | 按名找 input |
| `findOutputSlot(name, returnObj)` | 10 | 按名找 output |
| `findInputSlotFree(optsIn)` | 20 | 找空闲 input |
| `findOutputSlotFree(optsIn)` | 20 | 找空闲 output |
| `findInputSlotByType(type, ...)` | 4 | 按类型找 input（委托 findSlotByType）|
| `findOutputSlotByType(type, ...)` | 4 | 按类型找 output（委托 findSlotByType）|
| `findSlotByType(input, type, ...)` | 50 | 实际实现 |

`findInputSlot`/`findOutputSlot` 几乎一模一样（只差 `this.inputs` vs `this.outputs`）。`findInputSlotFree`/`findOutputSlotFree` 同理。

### 建议

合并成 3 个方法：

```
findSlot(name_or_type, opts)   // 统一入口，opts.isInput + opts.byType + opts.freeSlot + opts.returnObj
_findSlotInArray(arr, name, opts)  // 私有实现
```

`findInputSlot`/`findOutputSlot`/`findInputSlotFree`/`findOutputSlotFree`/`findInputSlotByType`/`findOutputSlotByType` 保留为薄包装（一行委托），接口兼容。

**收益**：实现逻辑只写一遍，~40 行重复代码消除。

**风险**：低，包装方法保证接口不变。

---

## P3：onConnectionsChange 调用去重（20 处 → 提取公共方法）

### 问题

`onConnectionsChange` 在 LGraphNode.js 里被调了 20 次（connect/disconnectInput/disconnectOutput 的各种分支），每次都是：

```js
if (this.onConnectionsChange) {
  this.onConnectionsChange(LiteGraph.INPUT/OUTPUT, slot, true/false, link_info, slot_obj);
}
if (target_node.onConnectionsChange) {
  target_node.onConnectionsChange(LiteGraph.OUTPUT/INPUT, slot, true/false, link_info, slot_obj);
}
if (this.graph && this.graph.onNodeConnectionChange) {
  this.graph.onNodeConnectionChange(LiteGraph.OUTPUT/INPUT, ...);
  this.graph.onNodeConnectionChange(LiteGraph.INPUT/OUTPUT, ...);
}
```

同样的 6-8 行模式重复 20 次。

### 建议

提取私有方法：

```js
_fireConnectionChange(side, slot, isConnect, linkInfo, slotObj, otherNode, otherSide) {
  if (this.onConnectionsChange) this.onConnectionsChange(side, slot, isConnect, linkInfo, slotObj);
  if (otherNode && otherNode.onConnectionsChange) otherNode.onConnectionsChange(otherSide, slot, isConnect, linkInfo, slotObj);
  if (this.graph) {
    this.graph.onNodeConnectionChange?.(otherSide, otherNode, slot);
    this.graph.onNodeConnectionChange?.(side, this, slot);
  }
}
```

每个调用点变成一行。

**收益**：~120 行重复代码消除，连接变更逻辑集中一处。

**风险**：低，行为等价。

---

## P4：LGraphCanvas.createDefaultNodeForSlot 调用清理

### 问题

第 1036 行 `this.createDefaultNodeForSlot({...})` 还在 processMouseUp 里被调用，但方法本身已经是 no-op stub（上一轮改的）。这行调用是无意义的。

### 建议

删除 processMouseUp 里对 `createDefaultNodeForSlot` 的调用块（~15 行）。stub 方法本身保留（接口兼容）。

---

## 不做的事（已确认无收益）

1. **不拆 LGraphCanvas.js 成多文件** —— 风险高，收益是可维护性而非复杂度降低，与"减少复杂逻辑"目标不符
2. **不动 5 策略融合代码** —— 已验证，重复计算消除 80%
3. **不动 getConnectionPos** —— canvas 13 处调用依赖完整行为
4. **不动工具函数 LiteGraph.X 挂载** —— 兼容性需要
5. **不删 drawSubgraphPanel** —— 功能完整，是可用特性不是死代码
6. **不合并 find*Slot 的对外接口** —— 只合并内部实现，对外保持 7 个方法名

---

## 优先级排序

| 建议 | 行数减少 | 风险 | 优先级 |
|---|---|---|---|
| P0.1 删 onMenu* + getCanvasMenuOptions + getNodeMenuOptions | ~500 | 无 | **立即做** |
| P0.2 删 prompt + showEditPropertyValue + onShowMenuNodeProperties | ~400 | 无 | **立即做** |
| P0.3 删 checkPanels | ~50 | 无 | **立即做** |
| P0.5 删 ContextMenu.js | ~490 | 无（外部不依赖）| **立即做** |
| P4 删 createDefaultNodeForSlot 调用 | ~15 | 无 | **立即做** |
| P3 onConnectionsChange 提取公共方法 | ~120 | 低 | P1 |
| P2 find*Slot 去重 | ~40 | 低 | P1 |
| P1 processMouseDown 拆分 | 0（可读性）| 低 | P2 |

**P0 总收益**：删除约 1455 行死代码，12824 → ~11370 行（-11%）。
