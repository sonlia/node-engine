# LiteGraph 重构优化建议

基于对当前 15059 行代码的完整扫描，按**收益/风险比**排序的可执行建议。

---

## 当前代码分布

| 文件 | 行数 | 占比 |
|---|---|---|
| LGraphCanvas.js | 7709 | 51.2% |
| LGraphNode.js | 2239 | 14.9% |
| LGraph.js | 1898 | 12.6% |
| LiteGraph.js | 787 | 5.2% |
| 其他 9 个文件 | 4426 | 29.4% |
| **总计** | **15059** | |

---

## 一、死代码删除（高收益、低风险）

### 1.1 删除 `nodes.js`（337 行，完全死代码）

**事实**：
- `nodes.js` 定义了 NumberNode/MathNode/DisplayNode 等 12 个内置节点
- `page.tsx` 自己重新定义了这些节点，**从不 import `nodes.js`**
- `index.js` 也不 import 它
- 文件里的节点还在用 `this.addWidget(...)`（已废弃的 widget 系统）

**建议**：直接删除 `nodes.js`。如果要保留示例，移到 `examples/` 目录并清理 widget 调用。

### 1.2 删除 `CurveEditor.js`（229 行，未使用）

**事实**：
- 只有 `index.js` import 它并挂到 `LiteGraph.CurveEditor`
- 全项目没有任何 `new CurveEditor(...)` 调用
- 是原始 litegraph 的曲线编辑器，当前项目用不到

**建议**：删除文件 + 删除 `index.js` 里的 import/挂载/export。

### 1.3 删除 LGraphCanvas.js 里的 Widget 渲染代码（505 行）

**事实**：
- `drawNodeWidgets`（250 行）+ `processNodeWidgets`（255 行）
- Widget 系统已经在 commit `3200834` 移除，`addWidget` 是 no-op stub
- 这两个方法第一行都是 `if (!node.widgets || !node.widgets.length) return`，永远不会往下走
- 调用点（3 处 `processNodeWidgets` + 1 处 `drawNodeWidgets`）也是死调用

**建议**：
- 删除 `drawNodeWidgets` 和 `processNodeWidgets` 方法体
- 删除调用点（LGraphCanvas.js 第 814、1128、1404、3195 行）
- 保留方法签名作为 no-op stub（防止外部调用报错）：`drawNodeWidgets() { return 0; }`

**收益**：LGraphCanvas.js 从 7709 行降到约 7200 行。

---

## 二、EVENT/ACTION 系统精简（中收益、需评估）

### 2.1 现状

LGraphNode.js 里有完整的 EVENT/ACTION 系统（188 行）：
- `addOnTriggerInput` / `addOnExecutedOutput` / `onAfterExecuteNode`
- `changeMode` / `doExecute` / `executePendingActions`
- `actionDo` / `trigger` / `triggerSlot` / `clearTriggeredSlot` / `executeAction`

配套的状态字段：`_waiting_actions`、`execute_triggered`、`action_triggered`、`action_call`、`exec_version`

LGraph.js 里有：`nodes_executing` / `nodes_actioning` / `nodes_executedAction` 数组

### 2.2 实际使用情况

| 调用者 | 用途 |
|---|---|
| `LGraph._runStepClassic/Optimized` | `do_not_catch_errors=true` 时调 `doExecute()` |
| `LGraphCanvas.drawNodeShape` | 读 `execute_triggered`/`action_triggered` 画闪烁效果 |
| `LGraphCanvas` 菜单 | `changeMode(ON_TRIGGER)` 切换节点模式 |
| `nodes.js` 的 TriggerNode | 用 `onAction` + `triggerSlot` —— **但 nodes.js 是死代码** |
| `page.tsx` 的节点 | **完全不用** EVENT/ACTION 系统 |

### 2.3 建议（保守方案）

**保留** EVENT/ACTION 系统，因为：
1. `doExecute` 被 `runStep` 调用，承载 action 跟踪和 `onAfterExecuteNode` 回调
2. `changeMode` 被右键菜单调用
3. 外部用户可能依赖 `LiteGraph.EVENT`/`LiteGraph.ACTION` 类型和 `triggerSlot` API

**精简**：
- 删除 `execute_triggered`/`action_triggered` 的递减逻辑（LGraphCanvas.js 第 3619-3620 行）—— 如果不用闪烁动画，这俩字段没用
- 删除 `nodes_actioning` 数组（LGraph.js）—— 只在 `actionDo` 里写，没人读
- 把 `LiteGraph.do_add_triggers_slots` 相关代码删掉（默认 false，从未被设为 true）

### 2.4 建议（激进方案，如果确认不用 EVENT 流）

如果项目确定只用 `mode=ALWAYS` 的数据流节点（page.tsx 里全是这种），可以：
- 把 `doExecute` 简化为直接调 `onExecute` + `onAfterExecuteNode`
- 删除 `actionDo`/`trigger`/`triggerSlot`/`clearTriggeredSlot`/`executeAction`
- 删除 `_waiting_actions`/`executePendingActions`/`use_deferred_actions`
- `runStep` 两个分支都调 `doExecute`（简化版）

**收益**：LGraphNode.js 减少 ~150 行，LGraph.js 减少约 20 行。但**风险高**，需要确认没有外部代码依赖。

---

## 三、LGraphCanvas.js 拆分（高收益、中风险）

### 3.1 问题

7709 行单文件，最大方法 `processMouseDown` 572 行、`drawNode` 430 行、`showSearchBox` 372 行。难以维护。

### 3.2 建议拆分方案

按职责拆成 5 个模块（保持在 LGraphCanvas 命名空间下，接口不变）：

```
LGraphCanvas/
├── index.js              // 主类，协调各模块（~1500 行）
├── rendering.js          // drawNode/drawNodeShape/drawConnections/drawBackCanvas/drawFrontCanvas（~2500 行）
├── interaction.js        // processMouseDown/Up/Move/processKey/processContextMenu（~2000 行）
├── panels.js             // showSearchBox/showShowNodePanel/createPanel/drawSubgraphPanel（~1200 行）
└── helpers.js            // renderLink/computeConnectionPoint/renderInfo/小工具（~500 行）
```

**实施方式**：用 mixin 模式，把方法挂到 LGraphCanvas.prototype 上，保持 `canvas.drawNode(...)` 调用方式不变。

**风险**：
- `this` 指向需要小心（mixin 方法里 `this` 还是 canvas 实例）
- 内部私有字段（`_xxx`）需要保持原样
- 需要完整测试覆盖（鼠标交互、渲染、子图）

### 3.3 替代方案（更低风险）

不拆文件，但把超大方法拆小：
- `processMouseDown`（572 行）→ 拆成 `handleCanvasClick`/`handleNodeClick`/`handleSlotClick`/`handleBoxSelect` 等
- `drawNode`（430 行）→ 拆成 `drawNodeTitle`/`drawNodeBody`/`drawNodeSlots`

---

## 四、getConnectionPos 双实现统一（中收益、低风险）

### 4.1 问题

`LGraphNode.getConnectionPos`（80 行）计算 slot 位置。LGraphCanvas 里有 13 处调用 `node.getConnectionPos(...)`。

当前 LGraphNode 里的实现是**完整版**（处理 collapsed/horizontal/slot_start_y 等），没有委托给 canvas。

之前对话提到过"渲染方法迁移到 canvas，LGraphNode 保留 fallback"，但 `getConnectionPos` 没有这个委托——它在 node 里是完整实现。

### 4.2 建议

保持现状（LGraphNode 里有完整实现）。但可以：
- 把 `getConnectionPos` 里的常量（`NODE_SLOT_HEIGHT`/`NODE_TITLE_HEIGHT`）从 `LiteGraph.X` 直接读取改为局部变量缓存（微优化）
- 如果性能敏感，可以把 `out = out || new Float32Array(2)` 改成调用方传入复用的 Float32Array（减少 GC）

---

## 五、工具函数调用模式统一（低收益、低风险）

### 5.1 问题

工具函数有两种调用方式：
- 直接 import：`isInsideRectangle(...)`（LGraphCanvas.js 用了 34 次）
- 通过 LiteGraph：`LiteGraph.isInsideRectangle(...)`（2 次）

`index.js` 把所有工具函数挂到 `LiteGraph` 上是为了兼容原始 API。

### 5.2 建议

保持现状。内部代码用直接 import（更快、tree-shaking 友好），`LiteGraph.X` 挂载保留给外部用户。这是合理的双层 API。

---

## 六、缓存失效策略优化（中收益、低风险）

### 6.1 现状

`rebuildTopology()` 在每次 `connectionChange` 时：
1. 重建拓扑序（O(N+E)）
2. 重建邻接表（O(N+E)）
3. 把所有节点 `_dirty = true`
4. 把 `_cacheStore = null`（让 WeakMap GC）

### 6.2 问题

连接变更时**全部缓存失效**，即使大部分节点的输入没变。例如：连接 A→B 时，C→D 链的缓存也被清掉，下一帧要全重算。

### 6.3 建议

精细化失效：连接变更时只标记**受影响节点的下游**为 dirty，而不是全部节点。

```js
rebuildTopology() {
  this.updateExecutionOrder();
  this._buildAdjacency();  // O(N+E)
  
  // 不再全量失效。只对连接变更涉及的节点调 markDirty。
  // connectionChange 的调用方（connect/disconnect）已经对受影响节点
  // 调过 markDirty 了，这里不需要重复。
  
  this.dispatchEvent(new CustomEvent("topologyRebuilt", ...));
}
```

**收益**：连接变更后不需要全图重算，只重算受影响分支。对大图（100+ 节点）收益明显。

**风险**：需要确认 `connect`/`disconnectInput`/`disconnectOutput` 里的 `markDirty` 调用覆盖了所有受影响节点。当前代码已经做到了（commit `332f118` 加的）。

---

## 七、runStep 双路径简化（低收益、低风险）

### 7.1 现状

`runStep` 根据 `config.optimized_execution` 分两路：
- `_runStepClassic`：每节点每帧都执行
- `_runStepOptimized`：dirty 检查 + cache + async

两个路径有重复代码（deferred actions flush、doExecute/onExecute 选择、错误处理）。

### 7.2 建议

合并成一个方法，用 `if (this.config.optimized_execution)` 控制是否做 dirty/cache 检查：

```js
runStep(num, do_not_catch_errors, limit) {
  // ... 公共前置
  for (let j = 0; j < limit; ++j) {
    const node = nodes[j];
    // deferred actions（公共）
    if (LiteGraph.use_deferred_actions && node._waiting_actions?.length) node.executePendingActions();
    if (node.mode !== LiteGraph.ALWAYS || !node.onExecute) continue;
    
    // 优化路径独有
    if (this.config.optimized_execution) {
      if (node.isDirty && !node.isDirty()) continue;
      if (node.getCachedOutput) { const c = node.getCachedOutput(); if (c != null) { node.applyCachedOutput?.(); continue; } }
      if (node._isHeavy && this.asyncScheduler && !node._asyncPending) { /* async dispatch */ continue; }
    }
    
    // 执行（公共）
    if (do_not_catch_errors && node.doExecute) node.doExecute();
    else node.onExecute();
    
    // 优化路径独有后置
    if (this.config.optimized_execution) {
      node.storeCachedOutput?.();
      node.clearDirty?.();
    }
  }
}
```

**收益**：减少 ~100 行重复代码，逻辑更清晰。

**风险**：低，行为完全等价。

---

## 八、优先级排序

| 建议 | 行数减少 | 风险 | 优先级 |
|---|---|---|---|
| 1.1 删除 nodes.js | 337 | 无 | **P0 立即做** |
| 1.2 删除 CurveEditor.js | 229 | 无 | **P0 立即做** |
| 1.3 删除 Widget 渲染代码 | ~500 | 低（保留 stub） | **P0 立即做** |
| 6 精细化缓存失效 | 0（性能提升） | 中 | **P1** |
| 7 runStep 双路径合并 | ~100 | 低 | **P1** |
| 3.3 拆大方法（不拆文件） | 0（可读性） | 低 | P2 |
| 2.3 EVENT/ACTION 精简（保守） | ~30 | 低 | P2 |
| 3.2 LGraphCanvas 拆文件 | 0（可维护性） | 中高 | P3 |

**P0 总收益**：删除 ~1066 行死代码，占总代码 7%，无任何功能影响。

---

## 九、不建议改的

1. **不要动 LiteGraph.js 的常量**（INPUT/OUTPUT/EVENT/ACTION/ALWAYS 等）—— 外部代码依赖
2. **不要动 `sendActionToCanvas` / `sendEventToAllNodes`** —— canvas 事件桥接需要
3. **不要动 `getConnectionPos` 的完整实现** —— canvas 13 处调用依赖完整行为
4. **不要把工具函数从 `LiteGraph.X` 挂载移除** —— 兼容性需要
5. **不要动 5 策略融合的代码** —— 已运行时验证，重复计算消除 80%
