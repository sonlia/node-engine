# 重构后 LiteGraph 设计分析报告（最终版）

> 分析对象: 重构后的 ES6 模块化 litegraph（12751 行，11 个模块）
> 分析日期: 2026-06-28

---

## 一、已完成的改进

经过多轮重构，以下问题已解决：

1. ✅ Widget 系统完全移除
2. ✅ EVENT/ACTION 事件系统完全移除
3. ✅ use_uuids 条件判断清理，UUID 始终生效
4. ✅ 右键菜单清空，保留接口
5. ✅ Search 框移除，保留 stub 接口
6. ✅ eval() 替换为安全 Function 求值
7. ✅ throw 字符串全部改为 Error 对象
8. ✅ pointerListenerAdd/Remove fall-through bug 修复
9. ✅ SlotTypes 类型系统（形状+颜色从类型派生）
10. ✅ Exec slot 系统（三角形，顺序执行控制）
11. ✅ 自定义 slot 渲染管线（三层：node→global→default）
12. ✅ Slot 可见性配置（visible 布尔/函数）
13. ✅ Subgraph/GraphInput/GraphOutput 节点
14. ✅ CurveEditor.js 删除（未使用）
15. ✅ LGraph extends EventTarget（事件系统基础）
16. ✅ LGraphNode.MAX_CONSOLE 定义
17. ✅ LLink 操作方法补充（disconnect/getOriginNode/getTargetNode/clone）
18. ✅ LGraphGroup 节点管理方法补充（addNode/removeNode/contains/clear）
19. ✅ LGraph link API 补充（getLink/hasLink/getLinks/getLinksForNode）

---

## 二、仍存在的设计问题

### ⚠️ 严重（5 个）

#### 1. exec 连接不渲染、不序列化、不触发回调

**事实**：
- `drawConnections` 只遍历 `node.inputs`，exec 链接存在 `_exec_input.link` 中，**连接线永远画不出来**
- `serialize()` / `configure()` 不包含 `_exec_input` / `_exec_output`，**保存/加载后 exec 连接丢失**
- `connectExec` / `disconnectExecIn` 不通知 `onConnectionsChange` / `connectionChange`

**影响**：exec slot 功能虽然能连线，但连线后看不见、保存不了、其他系统不知道。

#### 2. LGraphCanvas 仍是 6683 行上帝类

**事实**：190 个方法，承担渲染/事件/选择/面板/菜单/剪贴板/子图/exec slot 等 10+ 职责。

**建议**：拆分为 LGraphRenderer / LGraphInputHandler / LGraphSelectionModel 等。

#### 3. processMouseDown 595 行，72 个分支

**事实**：单方法 595 行，深层嵌套，状态依赖隐式。

**建议**：用状态机模式重构。

#### 4. 渲染方法在 engine 层（LGraphNode）

**事实**：`getConnectionPos`、`computeSize`、`getBounding`、`isPointInside`、`getSlotInPosition` 依赖 UI 常量（NODE_TITLE_HEIGHT 等），却在 LGraphNode 中。

**建议**：移到 LGraphCanvas 或独立 NodeRenderer。

#### 5. sendActionToCanvas 双模式共存

**事实**：LGraph 已 extends EventTarget 并 `dispatchEvent`，但同时仍保留 `list_of_graphcanvas` 遍历调用。两种机制并存，冗余。

**建议**：完全迁移到事件系统，删除 list_of_graphcanvas 和直接调用。

---

### ⚠️ 中等（7 个）

#### 6. LGraphNode 14 处 setDirtyCanvas 调用

**事实**：engine 节点通过 `setDirtyCanvas` → `sendActionToCanvas("setDirty")` 通知 UI 重绘。这是 engine→UI 耦合。

**建议**：engine 用脏标记 `_dirty`，UI 轮询或订阅事件。

#### 7. LiteGraph 全局对象混合 engine 和 UI 配置

**事实**：7 个 UI 渲染常量（NODE_TITLE_HEIGHT、NODE_SLOT_HEIGHT 等）定义在 LiteGraph（engine 层）。

**建议**：移到 LGraphCanvas 静态属性。

#### 8. 槽位查找 7 个方法，21 处调用

**事实**：findInputSlot / findOutputSlot / findInputSlotFree / findOutputSlotFree / findInputSlotByType / findOutputSlotByType / findSlotByType。

**建议**：合并为 2 个：`findSlot(direction, nameOrType, options)` + `findFreeSlot(direction, nameOrType, options)`。

#### 9. LGraphCanvas 13 处直接修改 engine 内部状态

**事实**：直接操作 `graph._nodes.splice/push/unshift`、`graph.links[]`、`graph._version++`。

**建议**：engine 暴露显式 API（bringNodeToFront/sendToBack/addLink/removeLink）。

#### 10. isValidConnection 双向继承

**事实**：`isSubtypeOf(normA, normB) || isSubtypeOf(normB, normA)` 允许父→子和子→父两个方向。用户定义"包含关系"是子→父单向。

**建议**：改为单向（只允许子→父）。

#### 11. new Function() 代码注入风险

**事实**：`buildNodeClassFromObject` 和 `wrapFunctionAsNode` 用 `new Function(ctor_code)` 构造函数体。

**建议**：用显式方法调用替代字符串拼接。

#### 12. LGraphGroup 借用 LGraphNode 语义

**事实**：`isPointInside` 和 `setDirtyCanvas` 是从 LGraphNode 复制的实现，两者隐式耦合。

**建议**：提取共同基类 LGraphElement。

---

### ⚠️ 轻微（5 个）

#### 13. 65 处 console.log/warn 残留

**分布**：LGraphCanvas 23、LGraph 14、LGraphNode 13、LiteGraph 7、utils 4、ContextMenu 3、SlotTypes 1。

#### 14. 5 处 TODO/FIXME

#### 15. connect 方法 165 行

承担 8+ 职责（槽位解析、类型校验、回调、断开旧连接、LLink 创建、事件通知）。

#### 16. EVENT/ACTION 已删除但 NODE_MODES_COLORS 仍保留 5 项

**事实**：`NODE_MODES` 已简化为 `["Always", "Never"]`（2 项），但 `NODE_MODES_COLORS` 仍是 5 项数组。

#### 17. drawNodeShape 385 行

单方法承担形状绘制、标题栏、折叠按钮、exec slot、subgraph 按钮等全部渲染。

---

## 三、接口审查

### 冗余接口（3 个）

| 接口 | 问题 | 建议 |
|------|------|------|
| `getInputInfo(slot)` / `getOutputInfo(slot)` | 只返回 `this.inputs[slot]` | 直接用数组访问 |
| `getInputDataByName(name)` | 只是 `findInputSlot` + `getInputData` 组合 | 删除，调用者自行组合 |
| `isInputConnected` / `isOutputConnected` / `isAnyOutputConnected` | 3 个相似方法 | 合并为 `isConnected(direction, slot)` |

### 缺失接口（3 个）

| 缺失 | 影响 | 建议 |
|------|------|------|
| exec 连接序列化 | 保存/加载丢失 exec 连接 | serialize/configure 添加 exec 数据 |
| exec 连接渲染 | 连接线不可见 | drawConnections 添加 exec 渲染 |
| `LGraph.bringNodeToFront(node)` / `sendToBack(node)` | UI 绕过 API 直接操作 _nodes | 暴露公开方法 |

### 不一致（2 个）

| 不一致 | 说明 |
|--------|------|
| connect 返回 link_info，disconnect 返回 boolean | 返回值类型不统一 |
| NODE_MODES_COLORS 长度与 NODE_MODES 不匹配 | 2 项 vs 5 项 |

---

## 四、问题统计

| 严重度 | 数量 |
|--------|------|
| ⚠️ 严重 | 5 |
| ⚠️ 中等 | 7 |
| ⚠️ 轻微 | 5 |
| **总计** | **17** |

---

## 五、修复优先级

### 立即修复（影响功能）
1. exec 连接渲染 — drawConnections 添加 exec 渲染
2. exec 连接序列化 — serialize/configure 添加 exec 数据
3. connectExec 触发回调 — onConnectionsChange + connectionChange
4. NODE_MODES_COLORS 长度修正

### 短期修复（架构改进）
5. sendActionToCanvas 完全迁移到事件系统
6. UI 常量移到 LGraphCanvas
7. LGraphCanvas 直接修改 engine → 用公开 API
8. isValidConnection 改为单向继承

### 长期优化
9. LGraphCanvas 拆分
10. 渲染方法从 LGraphNode 移到 UI 层
11. 槽位查找 7→2 方法
12. connect 165 行拆分
13. 清理 65 处 console
14. new Function 替代

---

**报告生成完毕**
