# 重构后 LiteGraph 设计分析报告（第三轮）

> 分析对象: 重构后的 ES6 模块化 litegraph（14746 行，12 个模块）
> 分析重点: slot 类型系统设计、exec slot 集成、引擎/UI 耦合、冗余逻辑
> 分析日期: 2026-06-28

---

## 一、Slot 类型系统设计问题

### 1. **形状-颜色-类型映射不符合用户定义的语义规则** ⚠️ 严重

**用户规则**：
- **形状** = 大类区分（不同形状 = 不同大类，不可连接）
- **同形状不同颜色** = 包含关系（子类型可连父类型）

**当前问题**：

| 类型 | 形状 | 颜色 | parent | 问题 |
|------|------|------|--------|------|
| number | ● circle | #4A9EFF | * | ✅ 正确 |
| int | ● circle | #6BB8FF | number | ✅ 同形状不同色 = 包含关系 |
| **boolean** | **● circle** | **#FFD93D** | **\*** | ❌ **与 number 同形状但 parent 是 *，不是 number 的子类** |
| string | ◯ round | #7CE38B | * | ✅ 正确 |
| vec2 | ▦ grid | #FF6B6B | * | ❌ vec2/vec3/vec4 互为兄弟，parent 都是 * |
| vec3 | ▦ grid | #FF8E3C | * | ❌ 同形状但不可互连（兄弟关系） |
| exec_in | ▶ triangle | #FFFFFF | null | ❌ exec_in 和 exec_out 同形状同颜色 |
| exec_out | ▶ triangle | #FFFFFF | null | ❌ 但它们不是包含关系，是方向关系 |

**核心矛盾**：
- boolean 和 number 都是 circle 形状 → 用户会以为 boolean 是 number 的子类 → 但 `isValidConnection('boolean', 'number')` 返回 `false`（因为 boolean 的 parent 是 `*`，不是 `number`）
- vec2/vec3/vec4 都是 grid 形状 → 用户会以为可以互连 → 但它们是兄弟节点，不可互连
- exec_in 和 exec_out 同形状同颜色 → 用户无法区分输入和输出

**建议**：
- boolean 应改用不同形状（如 `round`），或 parent 改为 `number`
- vec2/vec3/vec4 应有一个共同的 `vector` 父类型
- exec_in 和 exec_out 应有不同颜色（如 exec_in=#FFFFFF, exec_out=#EEEEEE）或不同朝向的三角形

### 2. **isValidConnection 双向继承允许父→子连接，语义错误** ⚠️ 严重

**当前代码**：
```js
// SlotTypes.js isValidConnection
return this.isSubtypeOf(normA, normB) || this.isSubtypeOf(normB, normA);
```

**问题**：这允许 `number → int`（父→子）和 `int → number`（子→父）两个方向。

**用户意图**：包含关系意味着子类型可以连接到父类型（int→number ✓），但父类型不应连接到子类型（number→int ✗，因为 number 可能是 float，赋给 int 会丢失精度）。

**建议**：改为单向：
```js
return this.isSubtypeOf(normA, normB); // 只允许子→父
```
但考虑到实际使用中 output→input 的方向性，需要明确：output 的类型必须是 input 类型的子类或同类。

### 3. **SlotTypes.getVisual() 未被一致使用** ⚠️ 中等

**问题**：部分代码用 `getVisual()`，部分用 `getShape()` + `getColor()` 分开调用。

```js
// 不一致用法
const visual = LiteGraph.SlotTypes.getVisual(slot_type);  // 有些地方
const slotColor = LiteGraph.SlotTypes.getColor(slot_type);  // 另一些地方
```

**建议**：统一用 `getVisual()`，确保形状和颜色永远一起获取。

---

## 二、Exec Slot 集成问题

### 4. **exec 连接不会被渲染** ⚠️ 严重

**问题**：`drawConnections` 遍历 `node.inputs` 来查找链接，但 exec 链接存储在 `_exec_input.link` 中，不在 `node.inputs` 数组里。因此 **exec 连接线永远不会被画出来**。

**验证**：
```js
// drawConnections 只检查 node.inputs
for (let i = 0; i < node.inputs.length; ++i) {
    const input = node.inputs[i];
    if (!input || input.link == null) continue;
    // ... 渲染连接线
}
// _exec_input.link 从未被检查！
```

**建议**：在 `drawConnections` 末尾添加 exec 链接的渲染循环：
```js
// 渲染 exec 连接
for (const node of this.visible_nodes) {
    if (node._exec_input && node._exec_input.link != null) {
        const link = this.graph.links[node._exec_input.link];
        // ... 用 exec_out 位置 → exec_in 位置画线
    }
}
```

### 5. **exec 连接不会被序列化** ⚠️ 严重

**问题**：`LGraphNode.serialize()` 不包含 `_exec_input` / `_exec_output`，`LGraph.configure()` 也不恢复它们。保存/加载图后所有 exec 连接丢失。

**建议**：
```js
// serialize
if (this._exec_input && this._exec_input.link != null) {
    o.exec_input_link = this._exec_input.link;
}
if (this._exec_output && this._exec_output.links) {
    o.exec_output_links = [...this._exec_output.links];
}
// configure
if (info.exec_input_link) { this.getExecInput().link = info.exec_input_link; }
if (info.exec_output_links) { this.getExecOutput().links = [...info.exec_output_links]; }
```

### 6. **connectExec 不触发 onConnectionsChange / connectionChange** ⚠️ 严重

**问题**：`connectExec` 和 `disconnectExecIn` 创建/删除链接后，不通知 `onConnectionsChange` 回调和 `graph.connectionChange`，导致：
- UI 不知道需要重绘
- undo/redo 历史不记录
- 依赖连接变化的节点逻辑不触发

**建议**：在 connectExec/disconnectExecIn 末尾添加：
```js
if (this.onConnectionsChange) this.onConnectionsChange(LiteGraph.OUTPUT, -1, true, link, execOut);
if (targetNode.onConnectionsChange) targetNode.onConnectionsChange(LiteGraph.INPUT, -1, true, link, execIn);
if (this.graph) this.graph.connectionChange(this);
```

### 7. **exec slot 位置硬编码，与渲染不一致** ⚠️ 中等

**问题**：`isOverExecInput` / `isOverExecOutput` 中的位置计算与 `drawNodeShape` 中的渲染位置是**独立硬编码**的，两处代码必须手动同步。如果一方改了位置，另一方不会自动更新。

**建议**：提取统一的 `getExecSlotPos(node, isInput)` 方法，渲染和命中测试都调用它。

### 8. **`_exec_connected` 字段是死代码** ⚠️ 轻微

**问题**：构造函数中定义了 `this._exec_connected = false`，但全代码库中**从未被读取**。`hasExecInput()` 方法直接检查 `_exec_input.link`。

**建议**：删除 `_exec_connected` 字段。

### 9. **exec slot 的 link 使用 origin_slot=-1, target_slot=-1** ⚠️ 中等

**问题**：`connectExec` 创建的 link 中 `origin_slot` 和 `target_slot` 都是 -1。`drawConnections` 中有 `if (start_node_slot === -1)` 的特殊处理，但 `renderLink` 和其他代码（如 `showLinkMenu`）可能尝试访问 `node.outputs[-1]` 导致崩溃。

**建议**：exec link 应有独立的标识（如 `link._isExec = true`），所有访问 `outputs[origin_slot]` 的代码都应先检查此标志。

---

## 三、引擎/UI 耦合问题（仍未解决）

### 10. **LGraphCanvas 仍是 7900 行上帝类** ⚠️ 严重

**问题**：虽然重构了 ES6 class 语法，但 LGraphCanvas 仍承担 10+ 职责（渲染/事件/选择/面板/菜单/剪贴板/子图/widget/拖放/缩放/exec slot）。127 个静态方法，88 个实例方法。

**建议**：拆分为 LGraphRenderer / LGraphInputHandler / LGraphSelectionModel / LGraphPanelManager 等独立模块。

### 11. **sendActionToCanvas 仍存在（引擎→UI 耦合）** ⚠️ 中等

**问题**：LGraph.js 8 处、LGraphNode.js 1 处调用 `sendActionToCanvas`，engine 仍通过字符串反射调用 UI 方法。

### 12. **LGraphCanvas 仍直接修改 graph._version/links** ⚠️ 中等

**问题**：5 处直接修改 engine 内部状态，绕过公开 API。

---

## 四、冗余与不一致

### 13. **槽位查找仍有 7 个方法，27 处调用** ⚠️ 中等

**问题**：findInputSlot / findOutputSlot / findInputSlotFree / findOutputSlotFree / findInputSlotByType / findOutputSlotByType / findSlotByType — 7 个方法逻辑重复，应合并为 2 个。

### 14. **TRIANGLE_SHAPE 定义但渲染 switch 未处理** ⚠️ 轻微

**问题**：新增了 `TRIANGLE_SHAPE = 7`，但 `drawNodeShape` 中的 slot 渲染 switch 语句只处理 BOX/ARROW/GRID/CIRCLE，没有 TRIANGLE case。exec slot 的三角形渲染是在标题栏单独画的，不走 slot 渲染逻辑。

### 15. **71 处 console.log/warn 残留** ⚠️ 轻微

**问题**：
- LGraphCanvas.js: 24 处
- LGraphNode.js: 18 处
- LGraph.js: 14 处
- LiteGraph.js: 7 处

包括 `console.log("debug: Should I send a move event?")` 等调试输出。

### 16. **new Function() 仍在 LiteGraph.js 中** ⚠️ 中等

**问题**：`buildNodeClassFromObject`（行 397）和 `wrapFunctionAsNode`（行 453）仍用 `new Function(ctor_code)` 构造函数体，存在代码注入风险。

### 17. **EVENT 和 ACTION 仍是 -1，但 exec_in/exec_out 是字符串** ⚠️ 中等

**问题**：原始 EVENT/ACTION 用 -1，新 exec 类型用字符串 'exec_in'/'exec_out'。两套系统并存，`normalize` 方法需要同时处理数字和字符串，增加复杂度。

**建议**：统一为字符串类型，废弃 -1 数字常量。

---

## 五、逻辑问题

### 18. **processMouseDown 中 exec slot 检查的 if 嵌套层次错误** ⚠️ 严重

**问题**：添加 exec slot 检查时引入了 `if (!skip_action) {` 包裹常规 slot 检测，但闭合括号的位置可能导致缩进/作用域问题。如果 exec slot 检查设置了 `skip_action = true`，常规 slot 检测被跳过 — 这是正确的。但如果 exec slot 检查没有设置 `skip_action`（如 exec_in 无连接时），代码会继续进入常规 slot 检测，可能误匹配。

### 19. **runStep 跳过 exec 连接节点的逻辑不完整** ⚠️ 中等

**问题**：
```js
if (node.mode === LiteGraph.ALWAYS && node.onExecute) {
    if (!node.hasExecInput || !node.hasExecInput()) {
        node.doExecute();
    }
}
```
这只跳过了 ALWAYS 模式的节点，但 ON_EVENT 和 ON_TRIGGER 模式的节点如果有 exec 输入，仍会被其他路径触发执行。exec 流和常规执行流没有完全隔离。

### 20. **checkVisualConsistency 只检查颜色冲突，不检查形状+颜色的组合** ⚠️ 轻微

**问题**：`checkVisualConsistency` 检查同颜色+同形状的类型冲突，但如果两个类型有不同形状但相同颜色，不会被报告。根据用户规则，不同形状已经代表不同大类，所以这是合理的。但方法名暗示检查"视觉一致性"，实际只检查部分情况。

---

## 六、问题汇总

| 严重度 | 数量 | 代表问题 |
|--------|------|---------|
| ⚠️ 严重 | 7 | exec 连接不渲染、不序列化、不触发回调；类型形状-颜色映射不符合语义规则；双向继承语义错误；processMouseDown 嵌套问题 |
| ⚠️ 中等 | 8 | exec slot 位置硬编码、origin_slot=-1 风险、sendActionToCanvas 耦合、new Function 注入、EVENT=-1 vs exec 字符串不一致、runStep exec 隔离不完整、getVisual 不一致使用、槽位查找 7 方法 |
| ⚠️ 轻微 | 5 | _exec_connected 死字段、TRIANGLE_SHAPE 未入 switch、71 处 console、checkVisualConsistency 不完整、EVENT/ACTION -1 残留 |

---

## 七、修复优先级

### 立即修复（影响功能）
1. **exec 连接渲染** — drawConnections 添加 exec link 渲染
2. **exec 连接序列化** — serialize/configure 添加 exec 数据
3. **connectExec 触发回调** — 添加 onConnectionsChange + connectionChange
4. **类型形状-颜色映射** — boolean 改形状或改 parent；vec 添加 vector 父类型
5. **isValidConnection 单向继承** — 只允许子→父

### 短期修复（影响健壮性）
6. **exec slot 位置统一** — 提取 getExecSlotPos 方法
7. **exec link 标识** — 添加 _isExec 标志，保护 outputs[-1] 访问
8. **删除 _exec_connected 死字段**
9. **TRIANGLE_SHAPE 加入渲染 switch**

### 长期优化（架构改进）
10. **LGraphCanvas 拆分**
11. **sendActionToCanvas → 事件系统**
12. **槽位查找 7→2 方法**
13. **废弃 EVENT/ACTION -1，统一字符串**
14. **new Function → 安全表达式**
15. **清理 71 处 console**

---

## 结论

重构后的 litegraph 在**方法级一致性**上已达到原始库水平（4 轮对比修复完成），但在**新增功能（exec slot + SlotTypes）的集成完整性**上存在严重缺口：

1. **exec 连接的 3 个核心环节断裂**：不渲染、不序列化、不触发回调 — 意味着 exec 功能虽然能连线，但连线后看不见、保存不了、其他系统不知道
2. **SlotTypes 类型映射违反用户定义的语义规则**：同形状不等于包含关系（boolean vs number、vec2 vs vec3）
3. **isValidConnection 双向继承**与用户"包含关系"定义矛盾

建议优先修复前 5 项严重问题，使 exec slot 和 SlotTypes 真正可用。

---

**报告生成完毕**
