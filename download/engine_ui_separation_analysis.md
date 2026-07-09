# LiteGraph.js 引擎/UI 分离与接口完整性分析报告

> 分析对象: 原始 `litegraph.js`（14424 行）
> 分析重点: ① 节点引擎（LGraph/LGraphNode）与 UI（LGraphCanvas）的耦合问题 ② 接口冗余/缺失/不一致
> 分析方法: 双向引用追踪 + 接口表审查 + 职责归属分析

---

## 第一部分：引擎与 UI 耦合问题

### 一、现状：引擎与 UI 双向深度耦合

原始 litegraph.js 的引擎层（LGraph/LGraphNode/LLink）与 UI 层（LGraphCanvas）之间存在**双向直接引用**，没有清晰的边界。

```
┌─────────────────────────────────────────────────┐
│              引擎层 (Engine)                      │
│  LGraph / LGraphNode / LLink / LGraphGroup       │
│                                                   │
│  问题：                                           │
│  • LGraph 持有 list_of_graphcanvas（UI 引用）     │
│  • LGraphNode.captureInput 直接操作 canvas 状态  │
│  • LGraphNode.computeSize 依赖渲染常量            │
│  • LGraphNode.getConnectionPos 是渲染位置计算     │
│  • LGraphNode.setDirtyCanvas 调用 UI             │
└────────────┬────────────────────────────────────┘
             │ 双向直接引用（无接口隔离）
┌────────────▼────────────────────────────────────┐
│              UI 层 (UI)                           │
│  LGraphCanvas / DragAndScale / ContextMenu       │
│                                                   │
│  问题：                                           │
│  • 直接修改 graph._nodes / graph.links / _version│
│  • 直接读 node._data / _pos / _waiting_actions   │
│  • 56 处直接访问 engine 内部状态                  │
└─────────────────────────────────────────────────┘
```

---

### 二、引擎层 → UI 层的违规引用（共 6 类）

#### 1. **LGraph 持有并管理 UI 引用** ⚠️ 严重

**事实**：
```js
// LGraph.js
this.list_of_graphcanvas = null;  // engine 持有 UI 列表

attachCanvas(graphcanvas) {
    if (graphcanvas.constructor != LGraphCanvas) { ... }  // 直接依赖 UI 类
    graphcanvas.graph = this;
    this.list_of_graphcanvas.push(graphcanvas);
}

sendActionToCanvas(action, params) {
    for (var c of this.list_of_graphcanvas) {
        if (c[action]) c[action].apply(c, params);  // 字符串调用 UI 方法
    }
}
```

**问题**：
- `LGraph`（引擎）直接持有 `LGraphCanvas`（UI）实例引用
- `attachCanvas` 用 `instanceof` 检查 UI 类型，硬依赖
- `sendActionToCanvas` 用字符串反射调用 UI 方法，无类型安全
- 引擎无法脱离 UI 独立运行（无头模式不可用）

**建议**：用**观察者模式** + **接口抽象**：
```js
// engine 层定义接口（不依赖 UI）
class LGraph extends EventTarget {
    // 不再持有 list_of_graphcanvas
    // 改为派发事件
    emit(eventName, detail) { this.dispatchEvent(new CustomEvent(eventName, {detail})); }
}

// UI 层订阅事件
graphCanvas.graph.addEventListener('nodeAdded', (e) => { ... });
graphCanvas.graph.addEventListener('connectionChange', (e) => { ... });
```

#### 2. **LGraphNode.captureInput 直接操作 canvas 内部状态** ⚠️ 严重

**事实**：
```js
// LGraphNode.js (engine 层)
captureInput(v) {
    var list = this.graph.list_of_graphcanvas;
    for (var c of list) {
        c.node_capturing_input = v ? this : null;  // 直接修改 UI 字段！
    }
}
```

**问题**：
- engine 节点直接修改 UI 的 `node_capturing_input` 字段
- `node_capturing_input` 是 UI 输入处理的状态，不应被 engine 触碰
- 如果 UI 未实现该字段，engine 静默失败

**建议**：改为事件派发：
```js
// engine
captureInput(v) { this.graph.emit('captureInput', {node: this, capture: v}); }
// UI
graph.addEventListener('captureInput', (e) => { this.node_capturing_input = e.detail.capture ? e.detail.node : null; });
```

#### 3. **LGraphNode.setDirtyCanvas 调用 UI** ⚠️ 中等

**事实**：
```js
// LGraphNode.js
setDirtyCanvas(dirty_foreground, dirty_background) {
    if (!this.graph) return;
    this.graph.sendActionToCanvas("setDirty", [dirty_foreground, dirty_background]);
}
```

**问题**：
- 节点修改后要通知 UI 重绘，这是合理的
- 但 `setDirtyCanvas` 是 engine 方法，名字带 "Canvas"（UI 概念）
- 12 处 LGraphNode 方法调用 `this.setDirtyCanvas(true, true)`

**建议**：engine 用脏标记，UI 轮询或订阅：
```js
// engine
addInput(...) { ...; this._dirty = true; this.graph.emit('nodeChanged', {node: this}); }
// UI
graph.addEventListener('nodeChanged', () => { this.dirty_canvas = true; });
```

#### 4. **LGraphNode.computeSize 依赖渲染常量** ⚠️ 中等

**事实**：
```js
// LGraphNode.js (engine 层)
computeSize() {
    var font_size = LiteGraph.NODE_TEXT_SIZE;  // 渲染常量！
    var title_width = compute_text_size(this.title);  // 基于字体大小
    size[0] = Math.max(size[0], LiteGraph.NODE_WIDTH);  // 渲染常量
    size[1] = rows * LiteGraph.NODE_SLOT_HEIGHT;  // 渲染常量
    widgets_height += LiteGraph.NODE_WIDGET_HEIGHT + 4;  // 渲染常量
}
```

**问题**：
- 节点尺寸计算依赖 `NODE_TEXT_SIZE`、`NODE_WIDTH`、`NODE_SLOT_HEIGHT`、`NODE_WIDGET_HEIGHT` 等**渲染常量**
- 这些常量定义在 `LiteGraph` 全局对象中，属于 UI 配置
- engine 的尺寸计算结果依赖 UI 渲染参数，无法独立测试
- 注释 `//although it should be graphcanvas.inner_text_font size` 说明作者知道有问题

**建议**：
- 渲染常量移到 `LGraphCanvas.LAYOUT` 配置
- engine 的 `computeSize` 接收 `layoutConfig` 参数，或由 UI 调用时传入

#### 5. **LGraphNode.getConnectionPos / getBounding / isPointInside / getSlotInPosition 是渲染逻辑** ⚠️ 严重

**事实**：这 4 个方法本质是**渲染/命中测试**逻辑，却在 engine 层：

| 方法 | 职责 | 依赖的渲染常量 |
|------|------|---------------|
| `getConnectionPos` | 计算槽位在画布上的像素坐标 | NODE_SLOT_HEIGHT, NODE_TITLE_HEIGHT, NODE_COLLAPSED_WIDTH |
| `getBounding` | 计算节点边界框（含阴影偏移） | 无直接常量，但 `compute_outer` 控制渲染边距 |
| `isPointInside` | 命中测试（含 collapsed 标题栏） | NODE_TITLE_HEIGHT, NODE_COLLAPSED_WIDTH |
| `getSlotInPosition` | 槽位命中测试（20x10 矩形） | 调用 getConnectionPos |

**问题**：
- 这些是纯 UI 关注点，却放在 `LGraphNode.prototype`
- 依赖 `this.flags.collapsed`、`this.horizontal`、`this._collapsed_width` 等渲染状态
- engine 测试要 mock 渲染常量

**建议**：移到 `LGraphCanvas` 或独立的 `NodeRenderer` 类：
```js
class NodeRenderer {
    getConnectionPos(node, isInput, slotNumber, out) { ... }
    getBounding(node, out, computeOuter) { ... }
    isPointInside(node, x, y, margin) { ... }
    getSlotInPosition(node, x, y) { ... }
}
```

#### 6. **LGraphNode.localToScreen 需要 graphcanvas 参数** ⚠️ 轻微

**事实**：
```js
localToScreen(x, y, graphcanvas) {
    return [(x + this.pos[0]) * graphcanvas.scale + graphcanvas.offset[0], ...];
}
```

**问题**：engine 方法需要 UI 参数，职责混淆。

**建议**：移到 `LGraphCanvas.localToScreen(node, x, y)`。

---

### 三、UI 层 → 引擎层的违规引用（共 3 类）

#### 7. **LGraphCanvas 直接修改 engine 内部状态** ⚠️ 严重

**事实**（56 处直接访问）：
```js
// LGraphCanvas.js (UI 层)
this.graph._version++;  // 直接修改 engine 版本号
this.graph.links[link_info.id] = link_info;  // 直接操作 links 池
++this.graph.last_link_id;  // 直接修改 ID 生成器
this.graph._nodes.splice(i, 1);  // 直接操作节点数组（bringToFront）
this.graph._nodes.push(node);  // 直接操作节点数组
```

**问题**：
- UI 绕过 engine API 直接操作内部数据结构
- `_version`、`links`、`last_link_id`、`_nodes` 是 engine 实现细节
- engine 无法感知 UI 的修改（无法派发事件、无法验证）

**建议**：engine 暴露显式 API：
```js
// engine
class LGraph {
    addLink(link) { this.links[link.id] = link; this._version++; this.emit('linkAdded', {link}); }
    removeLink(id) { delete this.links[id]; this._version++; this.emit('linkRemoved', {id}); }
    bringNodeToFront(node) { /* 内部操作 _nodes */ }
}
// UI 调用
this.graph.addLink(link);  // 而非 this.graph.links[id] = link;
```

#### 8. **LGraphCanvas 直接读 node._data / _pos / _waiting_actions** ⚠️ 中等

**事实**：
```js
// UI 读取 engine 内部字段
node._data  // 读取输出数据缓存（下划线前缀=私有）
node._pos   // 读取内部位置数组
node._waiting_actions  // 读取延迟动作队列
node._last_trigger_time  // 读取触发时间
node._collapsed_width  // 读取折叠宽度
```

**问题**：
- 下划线前缀字段本应是私有，UI 直接读取破坏封装
- engine 修改这些字段名会破坏 UI

**建议**：提供公开 getter：
```js
// engine
getOutputData(slot) { return this.outputs[slot]?._data; }
getPendingActions() { return this._waiting_actions || []; }
// UI 用 getter 而非直接访问
```

#### 9. **LGraphCanvas 静态方法依赖 active_canvas 全局状态** ⚠️ 严重

**事实**：
```js
// UI 静态方法
static onMenuNodeRemove(value, options, e, menu, node) {
    var canvas = LGraphCanvas.active_canvas;  // 全局状态
    canvas.graph.remove(node);
}
```

**问题**：
- 静态菜单回调通过全局变量获取 canvas 实例
- 多 canvas 场景下 `active_canvas` 可能指向错误的实例
- 与引擎无关，但加剧了 UI 的全局状态问题

**建议**：菜单回调通过参数接收 canvas：
```js
static onMenuNodeRemove(canvas, value, options, e, menu, node) { ... }
```

---

### 四、配置层职责混淆

#### 10. **LiteGraph 全局对象混合了 engine 配置和 UI 配置** ⚠️ 中等

**事实**：
```js
var LiteGraph = {
    // === engine 配置（应在 engine 层） ===
    VERSION: 0.4,
    registered_node_types: {},
    Nodes: {},
    Globals: {},
    catch_exceptions: true,
    throw_errors: true,
    use_deferred_actions: true,
    allow_multi_output_for_events: true,
    use_uuids: false,

    // === UI 配置（应在 UI 层） ===
    NODE_TITLE_HEIGHT: 30,
    NODE_SLOT_HEIGHT: 20,
    NODE_TEXT_SIZE: 14,
    NODE_WIDTH: 140,
    NODE_TITLE_COLOR: "#999",
    LINK_COLOR: "#9A9",
    DEFAULT_SHADOW_COLOR: "rgba(0,0,0,0.5)",
    node_images_path: "",
    pointerevents_method: "mouse",

    // === 渲染配置（应在 UI 层） ===
    BOX_SHAPE: 1,
    ROUND_SHAPE: 2,
    CIRCLE_SHAPE: 3,
    CARD_SHAPE: 4,
    ARROW_SHAPE: 5,
    GRID_SHAPE: 6,

    // === 网络层（应在独立模块） ===
    proxy: null,
    fetchFile: function(...) { ... },
};
```

**问题**：单个全局对象承担 4 种职责，无法独立配置 engine 而不带 UI 常量。

**建议**：拆分为：
```js
// engine 常量
LiteGraphEngine = { VERSION, registered_node_types, catch_exceptions, ... };

// UI 常量
LiteGraphUI = { NODE_TITLE_HEIGHT, NODE_SLOT_HEIGHT, LINK_COLOR, ... };

// 形状常量（UI 渲染）
LiteGraphShapes = { BOX_SHAPE, ROUND_SHAPE, ... };

// 网络/IO
LiteGraphIO = { proxy, fetchFile };
```

---

## 第二部分：接口冗余、缺失与不一致

### 五、冗余接口（应删除或合并）

#### 11. **槽位查找 7 个方法，应合并为 2 个** ⚠️ 中等

**事实**：
```
findInputSlot(name, returnObj)          // 按名查找输入
findOutputSlot(name, returnObj)         // 按名查找输出
findInputSlotFree({returnObj, typesNotAccepted})  // 查找空闲输入
findOutputSlotFree({returnObj, typesNotAccepted}) // 查找空闲输出
findInputSlotByType(type, returnObj, preferFreeSlot, doNotUseOccupied)  // 按类型查找输入
findOutputSlotByType(type, returnObj, preferFreeSlot, doNotUseOccupied) // 按类型查找输出
findSlotByType(input, type, returnObj, preferFreeSlot, doNotUseOccupied)  // 统一查找
```

**问题**：
- `findInputSlotByType` 只是 `findSlotByType(true, ...)` 的代理
- `findOutputSlotByType` 只是 `findSlotByType(false, ...)` 的代理
- 7 个方法共 46 处调用，API 表面过大

**建议**：合并为 2 个：
```js
findSlot(direction, nameOrType, options)  // direction: 'in'|'out'
findFreeSlot(direction, nameOrType, options)
```

#### 12. **`isInputConnected` / `isOutputConnected` / `isAnyOutputConnected` 3 个相似方法** ⚠️ 轻微

**事实**：
```js
isInputConnected(slot)   // 检查单个输入是否连接
isOutputConnected(slot)  // 检查单个输出是否连接
isAnyOutputConnected()   // 检查是否有任意输出连接
```

**建议**：合并为 `isConnected(direction, slot)` + `hasConnections(direction)`。

#### 13. **`getInputInfo` / `getOutputInfo` 冗余** ⚠️ 轻微

**事实**：
```js
getInputInfo(slot) { return this.inputs && slot < this.inputs.length ? this.inputs[slot] : null; }
getOutputInfo(slot) { return this.outputs && slot < this.outputs.length ? this.outputs[slot] : null; }
```

**建议**：直接用 `node.inputs[slot]` / `node.outputs[slot]`，或合并为 `getSlot(direction, slot)`。

#### 14. **`setProperty` vs `addProperty` 语义重叠** ⚠️ 轻微

**事实**：
- `addProperty(name, defaultValue, type, extraInfo)` — 注册属性（带类型）
- `setProperty(name, value)` — 设置属性值（带 onPropertyChanged 回调）

**问题**：`setProperty` 对未注册的属性也会创建 `this.properties[name] = value`，绕过 `addProperty` 的类型注册。

**建议**：`setProperty` 对未注册属性应警告或自动调用 `addProperty`。

#### 15. **`getInputData` vs `getInputDataByName`** ⚠️ 轻微

**事实**：`getInputDataByName(name)` 只是 `findInputSlot(name)` + `getInputData(slot)` 的组合。

**建议**：保留 `getInputData(slot)`，删除 `getInputDataByName`（调用者可自行组合）。

---

### 六、缺失接口（应补充）

#### 16. **LLink 只有 configure + serialize，无操作方法** ⚠️ 中等

**事实**：
```js
LLink.prototype.configure  // 反序列化
LLink.prototype.serialize  // 序列化
// 无 disconnect / update / clone / getInfo 方法
```

**问题**：LLink 是纯数据容器，所有操作都通过 LGraphNode.disconnectOutput/Input 间接完成。

**建议**：补充：
```js
class LLink {
    disconnect(graph) { /* 从 graph.links 移除，清理两端槽位引用 */ }
    getOriginNode(graph) { return graph.getNodeById(this.origin_id); }
    getTargetNode(graph) { return graph.getNodeById(this.target_id); }
    clone() { return new LLink(this.id, this.type, ...); }
}
```

#### 17. **LGraphGroup 缺少 addNode / removeNode / contains 方法** ⚠️ 中等

**事实**：LGraphGroup 只有 5 个方法，`_nodes` 数组由 `recomputeInsideNodes` 基于边界框自动计算，无法手动添加/移除节点。

**问题**：用户无法显式将节点加入/移出分组（只能移动节点到分组区域内）。

**建议**：
```js
class LGraphGroup {
    addNode(node) { /* 显式添加 */ }
    removeNode(node) { /* 显式移除 */ }
    contains(node) { return this._nodes.includes(node); }
    clear() { this._nodes.length = 0; }
}
```

#### 18. **LGraph 缺少 link 操作的公开 API** ⚠️ 严重

**事实**：engine 层只有 `removeLink(id)`，没有：
- `getLink(id)` — 获取链接
- `getLinks()` — 获取所有链接
- `getLinksForNode(nodeId, direction)` — 获取节点的所有连接
- `hasLink(id)` — 检查链接是否存在

**问题**：UI 和外部代码要直接访问 `graph.links` 字典（56 处）。

**建议**：补充显式 API。

#### 19. **LGraphNode 缺少 disconnectAll 方法** ⚠️ 中等

**事实**：要断开节点的所有连接，需要手动遍历 inputs/outputs 调用 disconnectInput/Output。

**建议**：
```js
disconnectAll() {
    for (let i = this.inputs.length - 1; i >= 0; i--) this.disconnectInput(i);
    for (let i = this.outputs.length - 1; i >= 0; i--) this.disconnectOutput(i);
}
```

#### 20. **LGraph 缺少 clearSelection / getSelection** ⚠️ 轻微

**事实**：选择状态（`selected_nodes`）完全在 UI 层（LGraphCanvas），engine 无感知。

**问题**：如果未来要支持 headless 模式下的"逻辑选择"（如批量操作），engine 无基础设施。

**建议**：engine 层可选维护 `_selected_nodes`，UI 同步即可。

#### 21. **无统一事件系统** ⚠️ 严重

**事实**：
- `LGraph.onAction(action, param)` 存在
- `LGraph.trigger(action, param)` 只是调用 `this.onTrigger`
- `LGraphNode.onAction` 是约定回调，无统一签名
- 8 处 `onAction` 引用，无 EventTarget 接口
- `onConnectionsChange`、`onInputAdded` 等 66 个回调分散

**问题**：
- 无统一事件总线
- 无法订阅全局事件（如 "任意节点添加"）
- 无法取消订阅

**建议**：engine 实现 `EventTarget`：
```js
class LGraph extends EventTarget {
    add(node) { ...; this.dispatchEvent(new CustomEvent('nodeAdded', {detail: {node}})); }
}
// 外部订阅
graph.addEventListener('nodeAdded', (e) => { console.log(e.detail.node); });
```

---

### 七、接口不一致

#### 22. **`connect` 返回 `link_info`，但 `connectByType` 返回 `link_info` 或 `null`** ⚠️ 中等

**事实**：
- `connect(slot, target, target_slot)` → 返回 `LLink` 或 `null`
- `connectByType(slot, target, type)` → 返回 `LLink` 或 `null`
- `disconnectOutput(slot, target)` → 返回 `true` / `false`
- `disconnectInput(slot)` → 返回 `true` / `false`

**问题**：connect 系列返回对象，disconnect 系列返回布尔，不一致。

**建议**：统一为返回操作结果对象：
```js
{ success: boolean, link?: LLink, error?: string }
```

#### 23. **`throw` 字符串而非 `Error`** ⚠️ 中等

**事实**（18 处）：`throw "target node is null"` / `throw "graph cannot be null"`

**问题**：丢失堆栈，`catch(e)` 时 `e.stack` 为 undefined。

**建议**：全部改为 `throw new Error("...")` 或自定义 `LiteGraphError`。

#### 24. **`serialize` / `configure` 无 schema 版本** ⚠️ 中等

**事实**：序列化对象无 `version` 字段，库升级后旧数据可能不兼容。

**建议**：
```js
serialize() { return { __schema: 1, id, type, ... }; }
configure(data) {
    if (data.__schema !== 1) throw new Error("Unsupported schema");
    ...
}
```

#### 25. **`LGraphNode.MAX_CONSOLE` 未定义但被引用** ⚠️ 严重（bug）

**事实**：
```js
trace(msg) {
    this.console.push(msg);
    if (this.console.length > LGraphNode.MAX_CONSOLE) {  // MAX_CONSOLE 从未定义！
        this.console.shift();
    }
}
```

**问题**：`LGraphNode.MAX_CONSOLE` 是 `undefined`，`length > undefined` 永远为 false，console 缓冲区无限增长（内存泄漏）。

**建议**：定义 `LGraphNode.MAX_CONSOLE = 100` 或移除该逻辑。

#### 26. **`deserialize` 是空注释** ⚠️ 轻微

**事实**：
```js
//LGraphNode.prototype.deserialize = function(info) {} //this cannot be done from within, must be done in LiteGraph
```

**问题**：注释说"必须在 LiteGraph 中做"，但 `LiteGraph.createNode` + `node.configure` 已经覆盖该需求，注释是误导。

**建议**：删除注释，在 `configure` 文档中说明反序列化流程。

#### 27. **`executeAction` 整段注释掉** ⚠️ 轻微

**事实**：`LGraphNode.prototype.executeAction` 被 `/* ... */` 注释（38 行），用 `eval` 执行动作字符串。

**问题**：死代码，且有安全风险（eval）。

**建议**：删除，用 `actionDo` 替代。

---

## 第三部分：理想架构提案

### 八、推荐的引擎/UI 分离架构

```
┌─────────────────────────────────────────────────────┐
│                  应用层 (Application)                 │
│  page.tsx / 自定义编辑器                              │
└──────────────┬──────────────────┬───────────────────┘
               │                  │
┌──────────────▼──────┐ ┌────────▼────────────────────┐
│   引擎层 (Engine)    │ │      UI 层 (UI)             │
│                      │ │                             │
│  LGraph              │ │  LGraphCanvas              │
│   extends EventTarget│◄─┤   subscribes to events     │
│   - _nodes           │ │   - renderNodes()          │
│   - links            │ │   - handleInput()          │
│   - runStep()        │ │                             │
│   - add/remove/...   │ │  NodeRenderer              │
│   - dispatchEvent()  │ │   - getConnectionPos()     │
│                      │ │   - getBounding()          │
│  LGraphNode          │ │   - isPointInside()        │
│   - inputs/outputs   │ │                             │
│   - onExecute()      │ │  DragAndScale              │
│   - connect()        │ │  ContextMenu               │
│   - NO UI refs       │ │  SelectionModel            │
│                      │ │                             │
│  LLink               │ │  (无 engine 内部字段访问)    │
│   - disconnect()     │ │                             │
│   - getOriginNode()  │ │                             │
└──────────────────────┘ └─────────────────────────────┘
               ▲
               │ 事件订阅（单向依赖）
               │
    engine 派发事件：nodeAdded, linkCreated, connectionChange, etc.
    UI 订阅事件并响应（重绘、更新选择等）
```

### 关键原则

1. **单向依赖**：UI 依赖 engine，engine 不依赖 UI
2. **事件驱动**：engine 状态变化通过事件通知，UI 订阅响应
3. **显式 API**：engine 暴露公开方法，UI 不访问 `_` 前缀字段
4. **配置分离**：engine 配置与 UI 配置分开（渲染常量在 UI 层）
5. **可独立运行**：engine 可在无 UI 环境运行（headless 测试、服务端计算）

### 迁移步骤建议

| 阶段 | 任务 | 优先级 |
|------|------|--------|
| **1** | LGraph 实现 EventTarget，sendActionToCanvas 改为 dispatchEvent | 高 |
| **2** | LGraphNode.captureInput/setDirtyCanvas 改为派发事件 | 高 |
| **3** | LGraphNode.getConnectionPos/getBounding/isPointInside/getSlotInPosition 移到 UI 层 | 高 |
| **4** | LGraphNode.computeSize 接收 layoutConfig 参数，不依赖全局渲染常量 | 中 |
| **5** | LGraphCanvas 改为通过 engine 公开 API 操作，不直接访问 `_` 字段 | 中 |
| **6** | LiteGraph 全局对象拆分为 EngineConfig / UIConfig / Shapes / IO | 中 |
| **7** | 合并槽位查找 7 方法为 2 个 | 低 |
| **8** | 补充 LLink/LGraphGroup/LGraph 缺失的公开 API | 低 |
| **9** | 统一事件系统（EventTarget + 自定义事件） | 低 |
| **10** | 修复 MAX_CONSOLE 未定义 bug、删除死代码 | 低 |

---

## 问题汇总

| 类别 | 数量 | 代表问题 |
|------|------|---------|
| 引擎→UI 违规引用 | 6 | LGraph 持有 list_of_graphcanvas、captureInput 操作 UI 状态、渲染方法在 engine 层 |
| UI→引擎违规引用 | 3 | 直接修改 graph._version/links/_nodes、读 node._data、active_canvas 全局状态 |
| 配置层混淆 | 1 | LiteGraph 全局对象混合 engine/UI/形状/网络 4 种配置 |
| 冗余接口 | 5 | 槽位查找 7 方法、isConnected 3 方法、getInputInfo/getOutputInfo 等 |
| 缺失接口 | 6 | LLink 无操作方法、LGraphGroup 无 addNode、LGraph 无 link API、无事件系统等 |
| 接口不一致 | 6 | connect/disconnect 返回值不一致、throw 字符串、无 schema 版本等 |
| Bug | 1 | LGraphNode.MAX_CONSOLE 未定义导致内存泄漏 |

---

## 结论

原始 litegraph.js 的引擎与 UI **深度耦合**，主要表现为：

1. **双向直接引用**：engine 持有 UI 实例，UI 直接修改 engine 内部状态
2. **职责错位**：渲染位置计算（getConnectionPos）、命中测试（isPointInside）等 UI 逻辑放在 engine 层
3. **配置混合**：单个 LiteGraph 全局对象承担 4 种职责
4. **无事件系统**：靠 sendActionToCanvas 字符串反射 + 66 个约定回调

接口层面存在 **5 处冗余、6 处缺失、6 处不一致、1 个 bug**。

**核心建议**：用 **EventTarget + 单向依赖** 模式重构引擎/UI 边界，让 engine 可独立运行、可独立测试，UI 通过事件订阅响应 engine 状态变化。这不仅能解决耦合问题，还能支持 headless 模式、多实例、SSR 等场景。

---

**报告生成完毕**
