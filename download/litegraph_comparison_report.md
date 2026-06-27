# LiteGraph.js ES6 重构 vs 原始 IIFE — 完整方法对比报告

> **原始文件**: https://github.com/jagenjo/litegraph.js/blob/master/src/litegraph.js （14424 行 IIFE + prototype 风格）
> **重构文件**: `/home/z/my-project/src/lib/litegraph/` （11 个 ES6 模块，共 12550 行）
> **比对日期**: 2026-06-27
> **比对策略**: 按模块逐方法对比，再逐行对比逻辑
> **用户特别说明**: 右键菜单与属性面板显示逻辑保持当前实现不变（仅做差异记录，不修改）

---

## 目录

1. [总体统计](#1-总体统计)
2. [LiteGraph 模块对比](#2-litegraph-模块对比)
3. [LGraph 模块对比](#3-lgraph-模块对比)
4. [LGraphNode 模块对比](#4-lgraphnode-模块对比)
5. [LGraphCanvas 模块对比（Part 1: 事件/鼠标/选择/基础绘制）](#5-lgraphcanvas-模块对比part-1)
6. [LGraphCanvas 模块对比（Part 2: 绘制方法）](#6-lgraphcanvas-模块对比part-2)
7. [LGraphCanvas 模块对比（Part 3: 菜单/面板/对话框 — 保持原样）](#7-lgraphcanvas-模块对比part-3)
8. [LLink / LGraphGroup / DragAndScale / ContextMenu / utils 对比](#8-小模块对比)
9. [关键问题清单（按优先级）](#9-关键问题清单按优先级)
10. [建议修复顺序](#10-建议修复顺序)

---

## 1. 总体统计

| 模块 | 原始方法数 | 重构方法数 | 完全匹配 | 逻辑差异 | 缺失 | 额外 |
|------|-----------|-----------|---------|---------|------|------|
| LiteGraph (object literal) | 19 | 19 | 8 | 11 | 0 | 5 (justified) |
| LiteGraph (late-attached statics) | 18 | 7 attached + 13 missing | 5 | 2 | 13 not re-attached + 1 (CurveEditor) | — |
| LGraph | 54 | 54 | 53 | 1 | 0 | 0 |
| LGraphNode | 70 | 72 | 14 | 55 (35 critical) | 0 | 2 (clearTriggeredSlots plural + executeAction live) |
| LGraphCanvas Part 1 (events/mouse/select) | 53 | 53 | 46 | 7 (3 critical) | 0 | 0 |
| LGraphCanvas Part 2 (drawing) | 16 + 13 statics | 16 + 7 statics | 12+7 | 4 (1 critical) + 0 | 0 + 6 statics | 0 |
| LGraphCanvas Part 3 (menus/panels — kept as-is) | 18 | 18 | 9 | 9 (3 critical) | 1 + 2 referenced | 6 relocated |
| LLink | 2 + ctor | 2 + ctor | 3 | 1 (minor) | 0 | 0 |
| LGraphGroup | 5 + 2 getters | 5 + 2 getters | 1 | 6 (3 critical) | 0 | 0 |
| DragAndScale | 10 + ctor | 10 + ctor | 10 | 1 (minor) | 0 | 0 |
| ContextMenu | 4 + ctor + 2 static | 4 + ctor + 2 static | 6 | 1 (minor) | 0 | 1 (root.close binding) |
| utils (standalone helpers) | 13 | 13 | 6 | 7 (4 critical) | 0 | 3 (justified) |

**关键发现汇总**：
- **5 个 P0 级崩溃性 bug**（必须立即修复，会导致渲染崩溃或核心功能失效）
- **~50 个 P1 级功能缺失/语义偏差**（影响节点连接、事件触发、克隆、布局等核心功能）
- **若干 P2 级外观/边界差异**（不影响功能但有细微行为差异）
- **6 个静态对齐方法完全缺失**（导致右键菜单"Align"功能失效 — 但用户要求菜单逻辑保持不变）
- **CurveEditor 类整体缺失**

---

## 2. LiteGraph 模块对比

### 2.1 方法对比表（object literal 19 方法）

| # | 原始方法 | 原始行 | 重构位置 | 状态 | 备注 |
|---|---------|-------|---------|------|------|
| 1 | registerNodeType | L157-253 | LiteGraph.js:160 | ⚠️ 逻辑差异 | 丢弃 onNodeTypeRegistered/onNodeTypeReplaced 回调；EVENT/ACTION→"_event_"映射丢失；auto_load_slot_types 用 on* 回调内省而非 `new base_class()` |
| 2 | unregisterNodeType | L260-272 | LiteGraph.js:276 | ⚠️ 逻辑差异 | 原始接受 String 或 Class；重构只接受 string。原始 `throw` 若未找到；重构静默 return |
| 3 | registerNodeAndSlotType | L280-327 | LiteGraph.js:292 | ⚠️ 逻辑差异 | direction 默认值翻转（false → OUTPUT）；EVENT/ACTION→"_event_"映射丢失；逗号分割丢失；toLowerCase+sort 丢失 |
| 4 | buildNodeClassFromObject | L336-376 | LiteGraph.js:323 | ⚠️ 严重 | **签名改变**：丢弃 `name` 参数；不调用 `registerNodeType`；不使用 `object.inputs/outputs/properties` |
| 5 | wrapFunctionAsNode | L388-439 | LiteGraph.js:351 | ⚠️ 严重 | **签名改变**：`paramTypes` 期望从字符串数组变为 `[{name,type}]` 对象数组；不调用 getParameterNames |
| 6 | clearRegisteredTypes | L444-449 | LiteGraph.js:393 | ⚠️ 逻辑差异 | 添加了 `registered_slot_in/out_types`、`slot_types_in/out` 重置（额外）；**丢失** `searchbox_extras = {}` 重置 |
| 7 | addNodeMethod | L457-466 | LiteGraph.js:418 | ⚠️ 逻辑差异 | 原始备份为 `"_"+name` 再覆盖；重构仅在缺失时覆盖 |
| 8 | createNode | L476-542 | LiteGraph.js:431 | ⚠️ **Critical** | **签名改变**：丢弃 `title`、`options` 参数；丢弃 catch_exceptions；丢弃 properties/properties_info/flags/size/pos/mode 初始化；丢弃 onNodeCreated 回调 |
| 9 | getNodeType | L550-552 | LiteGraph.js:451 | ✅ 匹配 | 仅 this→LiteGraph |
| 10 | getNodeTypesInCategory | L561-583 | LiteGraph.js:458 | ⚠️ **Critical** | **filter 语义改变**：原始是属性相等比较 `type.filter != filter`；重构期望 filter 是函数 `filter(type)` |
| 11 | getNodeTypesCategories | L591-607 | LiteGraph.js:477 | ⚠️ **Critical** | **filter 参数完全丢弃**；**skip_list 检查丢弃** |
| 12 | reloadNodes | L610-652 | LiteGraph.js:407 | ⚠️ 逻辑差异 | 简化为 stub（仅 log）；原始遍历 `<script>` 标签重新加载。ES6 模块环境下合理 |
| 13 | cloneObject | L655-668 | utils.js:93 | ⚠️ 逻辑差异 | 原始 `JSON.parse(JSON.stringify())`；重构递归克隆并保留 Float32Array |
| 14 | uuidv4 | L673-675 | utils.js:108 | ✅ 匹配 | 实现不同但都是有效 RFC 4122 v4 |
| 15 | isValidConnection | L684-720 | LiteGraph.js:492 | ⚠️ **Critical** | 多类型情况**完全破坏**：原始递归检查所有排列组合；重构只比较 `split(",")[0]` |
| 16 | registerSearchboxExtra | L730-736 | LiteGraph.js:528 | ⚠️ 逻辑差异 | 存储键从 `description.toLowerCase()` 改为 `nodeType`；字段名 `desc` → `description` |
| 17 | fetchFile | L747-800 | LiteGraph.js:539 | ⚠️ 严重 | **签名改变**：丢弃 on_complete/on_error 回调；返回 Promise；丢弃 proxy 支持；丢弃 arraybuffer/blob 响应类型 |
| 18 | set (descriptor) | L189 | L207 | ✅ 匹配 | shape getter/setter 的一部分 |
| 19 | get (descriptor) | L210 | L217 | ✅ 匹配 | shape getter/setter 的一部分 |

### 2.2 属性对比（~104 项）

- 99/104 完全匹配
- **`pointerevents_method`**: 原始 `"mouse"` → 重构 `"pointer"`（影响 pointerListenerAdd 事件名构造）
- 5 项额外属性（_LGraphNode、_pendingRegistrations、LGraph、LGraphGroup、LGraphCanvas）— 用于 ES6 循环依赖处理，合理

### 2.3 后附加静态方法对比（18 项）

| 原始附加 | 行号 | 重构位置 | 状态 |
|---------|------|---------|------|
| LiteGraph.getTime | L805-817 | utils.js:86 (未重附加到 LiteGraph) | ⚠️ 未重附加 |
| LiteGraph.LLink = LLink | L2417 | index.js:28 | ✅ |
| LiteGraph.DragAndScale = DragAndScale | L5112 | index.js:31 | ✅ |
| LiteGraph.compareObjects | L13527 | utils.js:10 (**未重附加**) | ❌ |
| LiteGraph.distance | L13534 | utils.js:17 (**未重附加**) | ❌ |
| LiteGraph.colorToString | L13549 | utils.js:23 (**未重附加**) | ❌ |
| LiteGraph.isInsideRectangle | L13557 | utils.js:37 (**未重附加**) | ❌ |
| LiteGraph.growBounding | L13573 | utils.js:46 (**未重附加**) | ❌ |
| LiteGraph.isInsideBounding | L13587 | utils.js:53 (**未重附加**) | ❌ |
| LiteGraph.overlapBounding | L13606 | utils.js:62 (**未重附加**) | ❌ |
| LiteGraph.hex2num | L13629 | utils.js:68 (**未重附加**) | ❌ |
| LiteGraph.num2hex | L13646 | utils.js:76 (**未重附加**) | ❌ |
| LiteGraph.ContextMenu = ContextMenu | L14049 | index.js:32 | ✅ |
| LiteGraph.closeAllContextMenus | L14051 | LiteGraph.js:559 | ⚠️ 额外关闭 .litepanel/.litedialog |
| LiteGraph.extendClass | L14073 | LiteGraph.js:582 | ⚠️ **Critical** 丢失 prototype 复制和 getter/setter |
| LiteGraph.CurveEditor = CurveEditor | L14292 | **完全缺失** | ❌ 整个类不存在 |
| LiteGraph.getParameterNames | L14295 | utils.js:116 (**未重附加**) | ❌ |
| LiteGraph.pointerListenerAdd | L14309 | index.js:36 | ⚠️ Critical 简化（丢 touch fallback + leave/cancel 处理） |
| LiteGraph.pointerListenerRemove | L14373 | index.js:37 | ⚠️ Critical 同上 |

---

## 3. LGraph 模块对比

**结论**：53/54 完全匹配，1 个严重问题。

### 3.1 唯一严重问题：`attachCanvas` 类型检查失效

**原始** (L935-949):
```js
LGraph.prototype.attachCanvas = function(graphcanvas) {
    if (graphcanvas.constructor != LGraphCanvas) {
        throw "attachCanvas expects a LGraphCanvas instance";
    }
    // ...
};
```

**重构** (L129-146):
```js
attachCanvas(graphcanvas) {
    if (graphcanvas.constructor !== LGraph._LGraphCanvas && !graphcanvas.graph) {
      // LGraphCanvas may not be loaded yet; perform a basic sanity check
      if (typeof graphcanvas.setDirty !== "function") {
        throw "attachCanvas expects a LGraphCanvas instance";
      }
    }
    // ...
}
```

**问题**：
1. `LGraph._LGraphCanvas` 从未定义（grep 全代码无 `static _LGraphCanvas` 赋值）
2. 类型检查变成条件性（仅当 `!graphcanvas.graph` 才执行）
3. 类型检查从构造函数身份比较降级为鸭子类型（仅检查 `setDirty` 函数存在）

**严重性**：Critical — 类型安全回退。

### 3.2 其他 53 个方法均为 ✅ 匹配

仅存在以下外观变化：
- `var` → `const`/`let`
- `function` 表达式 → 箭头函数
- `==` → `===`
- `LiteGraph.X()` 调用 → 直接 import 的 `X()` 调用
- prototype 赋值 → class 方法

### 3.3 常量对比

原始只附加了 3 个常量到 `LGraph`（其他常量如 `INPUT`/`OUTPUT`/`ALWAYS` 等都附加在 `LiteGraph` 上）：
- `LGraph.supported_types = ["number","string","boolean"]` ✅
- `LGraph.STATUS_STOPPED = 1` ✅
- `LGraph.STATUS_RUNNING = 2` ✅

---

## 4. LGraphNode 模块对比

**结论**：所有 70 个方法都存在，但 **35 个有 Critical 逻辑差异**。

### 4.1 构造函数对比

**原始 `_ctor`** (L2486-2525):
- 不设置 `this.mode`（在 `LGraph.add` 中延迟设置）
- `this._pos = new Float32Array(10, 10)` — **bug**：创建 10 元素零数组而非 [10,10]
- `Object.defineProperty(this, "pos", ...)` 实例级
- 不初始化 `_shape` / `_waiting_actions`

**重构 `constructor`** (L18-42):
- 修复了 `Float32Array(10,10)` bug → `Float32Array([10,10])`
- 直接设置 `this.mode = LiteGraph.ALWAYS`
- 预初始化 `_shape = null`、`_waiting_actions = []`
- `pos` getter/setter 移到 class 级 ES6 get/set

### 4.2 关键 Critical 逻辑差异（按影响分类）

#### A. 数据流相关（4 处）

| 方法 | 问题 | 影响 |
|------|------|------|
| `setOutputData` | `link.data` → `link._data` 属性重命名 | 任何外部代码读 `link.data` 得到 undefined |
| `getInputData` | 1) 读 `link._data`（同上）2) 丢失 `force_update` 参数 | 调用者传 true 拉取上游最新数据时得到陈旧数据 |
| `setOutputDataType` | 写 `output._type` 而非 `output.type`；不传播到 links | 类型变更不生效 |
| `getInputDataType` | 返回 `link.type` 而非 `node.outputs[link.origin_slot].type` | 类型推断错误 |

#### B. 连接生命周期（4 处）

| 方法 | 问题 |
|------|------|
| `connect` | 返回 `true/false` 而非 `link_info/null`；丢失 onBeforeConnectInput、EVENT target 处理、beforeChange/afterChange、onNodeConnectionChange、connectionChange |
| `connectByType` | 丢弃所有 options（createEventInCase、generalTypeInCase、firstFreeIfOutputGeneralInCase）和 fallback 路径 |
| `connectByTypeOutput` | 同上 |
| `disconnectOutput`/`disconnectInput` | 丢失 `_version++`、graph.onNodeConnectionChange、connectionChange、setDirtyCanvas |

#### C. 事件触发/执行流（5 处）

| 方法 | 问题 |
|------|------|
| `triggerSlot` | 丢弃 `link_id` 过滤、`options`、`_last_trigger_time`、ON_TRIGGER doExecute 路径 |
| `actionDo` | **语义反转**：原始是立即执行器；重构变成延迟（push 到 _waiting_actions） |
| `doExecute` | 丢弃 `options`、`nodes_executing` 跟踪、`exec_version`、`action_call` |
| `clearTriggeredSlot` | 清错属性（`output._triggered` 不存在 vs `link._last_time`）；丢失 per-slot 过滤 |
| `onAfterExecuteNode` | 用了不存在的 `_triggerExecuted` 标志；硬编码 slot 0 而非查找 "onExecuted" |

#### D. 槽位管理（6 处）

| 方法 | 问题 |
|------|------|
| `addInput`/`addOutput` | 丢弃 `LiteGraph.registerNodeAndSlotType(this,type)` 和 `setDirtyCanvas(true,true)` |
| `addInputs`/`addOutputs` | **输入格式改变**：原始 `[[name,type,extra_info]]` → 重构 `[{name,type,extraInfo}]`（破坏性）；同样丢失 registerNodeAndSlotType |
| `removeInput` | 丢失 `link.target_slot -= 1` 重索引（图结构损坏） |
| `removeOutput` | 丢失 `link.origin_slot -= 1` 重索引 |
| `findInputSlot`/`findOutputSlot` | 丢弃 `returnObj` 参数 |
| `findInputSlotFree`/`findOutputSlotFree` | options 从 `{returnObj, typesNotAccepted}` 改为 `{typePref}`（语义不同） |

#### E. 槽位查找/类型匹配（3 处）

| 方法 | 问题 |
|------|------|
| `findInputSlotByType`/`findOutputSlotByType` | 丢弃 returnObj、preferFreeSlot、doNotUseOccupied；用简单相等而非逗号分割匹配 |
| `findSlotByType` | **参数语义改变**：原始 boolean → 重构 `LiteGraph.INPUT`/`OUTPUT` 常量；丢失逗号分割、EVENT/* 归一化、preferFreeSlot |

#### F. 布局/位置计算（4 处）

| 方法 | 问题 |
|------|------|
| `getConnectionPos` | 丢失 horizontal 布局、`-1` 特例、`slot.pos` 覆盖、`slot_start_y`；Y 位置算法完全不同（循环计数 vs `(slot+0.7)*NODE_SLOT_HEIGHT`） |
| `computeSize` | 丢失 `constructor.size` 快捷方式、`compute_text_size`、`widgets_up`/`widgets_start_y`、`min_height`、`+6` 边距；引用不存在的 `LiteGraph.NODE_MIN_WIDTH` |
| `isPointInside` | 丢失 `skip_title`、`graph.isLive()`、collapsed 处理、4px 边距 |
| `getSlotInPosition` | 不同命中测试（中心 vs 左上）；返回键 `link_pos` → `linkPos`（破坏性） |

#### G. 属性/widget（3 处）

| 方法 | 问题 |
|------|------|
| `setProperty` | 丢失 `prev_value`、`onPropertyChanged` 否决回滚、widget 同步、no-op 短路 |
| `addWidget` | 丢失所有多态处理（callback-as-object→options、options-as-string→property 等） |
| `getPropertyInfo` | 丢失 `constructor["@"+property]`、`constructor.widgets_info[property]`、`onGetPropertyInfo`、combo→enum 转换 |

#### H. 克隆/序列化（2 处）

| 方法 | 问题 |
|------|------|
| `clone` | 不深克隆（共享引用）；不断开 inputs/outputs 链接（克隆仍连接到原节点的邻居）；不重新分配 uuid |
| `serialize` | 丢失 `color`/`bgcolor`/`boxcolor`/`shape` 视觉字段 |

#### I. 其他（4 处）

| 方法 | 问题 |
|------|------|
| `changeMode` | 丢失 switch；不调用 addOnTriggerInput/addOnExecutedOutput for ON_TRIGGER |
| `addOnTriggerInput` | 返回 input 对象而非槽位索引；丢失 `{optional:true, nameLocked:true}` extra_info |
| `addOnExecutedOutput` | **类型错误**：用 `LiteGraph.EVENT` 而非 `LiteGraph.ACTION` |
| `localToScreen` | **属性路径错误**：用 `graphCanvas.ds.scale`/`.offset` 而非原始 `graphcanvas.scale`/`.offset`（破坏性） |
| `captureInput` | 不同机制：直接操作 → `sendActionToCanvas` |
| `addConnection` | 签名改变：丢失 `pos` 参数；不创建 connection 对象 |

### 4.3 完全匹配的方法（14 个）

getSupportedTypes, isInputConnected, getInputInfo, getInputLink, getInputNode, getOutputInfo, isOutputConnected, isAnyOutputConnected, getBounding, alignToGrid, setDirtyCanvas, addCustomWidget, setSize, getTitle

---

## 5. LGraphCanvas 模块对比（Part 1）

**范围**：L5325-8350（构造函数 + 53 个事件/鼠标/选择/基础绘制方法）

### 5.1 总体统计

- ✅ 匹配：46
- ⚠️ 逻辑差异：7（3 Critical + 3 Minor + 1 Bugfix）
- ❌ 缺失：0
- ➕ 额外：0
- 构造函数：✅ 完全匹配
- 静态常量：所有 3 个（DEFAULT_BACKGROUND_IMAGE、link_type_colors、gradients）+ getFileExtension 静态方法均正确保留

### 5.2 Critical 问题

#### 5.2.1 `drawFrontCanvas` — `shape` const 作用域 bug

**原始** (L8029-8065):
```js
if (this._highlight_input) {
    var shape = this._highlight_input_slot.shape;  // function-scoped
    // ...
}
if (this._highlight_output) {
    if (shape === LiteGraph.ARROW_SHAPE) {  // ← 可访问（var 提升）
        // ...
    }
}
```

**重构** (L2560-2617):
```js
if (this._highlight_input) {
    const shape = this._highlight_input_slot ? this._highlight_input_slot.shape : null;  // BLOCK-scoped
    // ...
}  // ← 块结束，shape 出作用域
if (this._highlight_output) {
    if (shape === LiteGraph.ARROW_SHAPE) {  // ← ReferenceError: shape is not defined
        // ...
    }
}
```

**影响**：当用户从输入槽拖出连接（`_highlight_output` truthy 而 `_highlight_input` null）时，每次 `draw` 调用都抛 ReferenceError，渲染循环崩溃。

#### 5.2.2 `drawButton` — 字体串运算符优先级 bug

**原始** (L8297): `ctx.font = ((h * 0.65)|0) + "px Arial";`
**重构** (L4903): `ctx.font = (h * 0.65) | 0 + "px Arial";`

**问题**：丢失外层括号。JS 运算符优先级导致 `0 + "px Arial"` 先求值为 `"0px Arial"`，然后 `(h*0.65) | "0px Arial"` → 整数（如 `8`），丢失 `"px Arial"` 后缀。`ctx.font = 8` 无效，被静默拒绝。

#### 5.2.3 `isAreaClicked` — 完全重写

**原始** (L8309-8319): `(x, y, w, h, hold_click)` — 基于 `this.mouse` + `this.last_click_position` 的立即模式 GUI 按钮命中测试
**重构** (L7601-7609): `(area, x, y, margin)` — 纯点-矩形几何测试

**问题**：签名和语义完全不同。任何使用原始 5 参数签名的调用者都会静默失败。

### 5.3 Minor 问题

- `processKey`：额外添加了 Tab 键（keyCode 9）打开搜索框（原始没有）
- `openSubgraph`：丢失 `this.checkPanels()` 调用
- `processMouseDown`：中键分支丢失 `alphaPosY` 垂直偏移计算

### 5.4 Bugfix（重构修了原始的 bug）

- `unbindEvents`：原始对 move/up/down 都传 `_mousedown_callback`（应为 `_mousemove_callback`/`_mouseup_callback`）；重构修正

### 5.5 完全匹配的重要方法（节选）

- `bindEvents` — 事件绑定逻辑一致
- `processMouseDown` (除中键分支) — 几百行的大函数基本匹配
- `processMouseMove` — ✅ 匹配
- `processMouseUp` — ✅ 匹配
- `processMouseWheel` — ✅ 匹配
- `processKey` (除 Tab) — ✅ 匹配
- `copyToClipboard`/`pasteFromClipboard` — ✅ 匹配
- `selectNode`/`selectNodes`/`deselectNode`/`deselectAllNodes` — ✅ 匹配
- `setCanvas`/`setZoom`/`convertOffsetToCanvas`/`convertCanvasToOffset` — ✅ 匹配
- `computeVisibleNodes`/`draw`/`renderInfo` — ✅ 匹配

---

## 6. LGraphCanvas 模块对比（Part 2）

**范围**：L8351-10977（16 个绘制方法 + 13 个静态辅助方法）

### 6.1 总体统计

- 16 个 prototype 方法：12 ✅ 匹配 + 4 ⚠️ 逻辑差异（1 Critical + 3 Minor）
- 13 个静态方法：7 ✅ 匹配 + 6 ❌ 缺失

### 6.2 Critical 问题

#### 6.2.1 `switchLiveMode` — 动画完全丢失

**原始** (L10374-10406)：用 `setInterval` 1ms tick 动画 `editor_alpha` 0.1↔1
**重构** (L7433-7449)：立即切换 `live_mode`，设置 `live_mode_fading` 标志但**该标志从未被读取**

**影响**：Live mode 渐变动画完全失效。

### 6.3 Minor 问题

- `drawNode` 输入槽 shape 检查：用 `slot_shape` 而非 `slot.shape`（可能是 bug fix）
- `drawGroups`：常量名从 `DEFAULT_GROUP_FONT_SIZE`（原始未定义，潜在 bug）改为 `DEFAULT_GROUP_FONT`（已定义）
- `adjustNodesSize`：用 `setSize()` 而非直接 `size = ...`，会触发 `onResize` 回调
- `boundaryNodesForSelection`：内联实现（原始委托 `LGraphCanvas.getBoundaryNodes`）；返回 `null` 而非 `{...nulls}` for 空选择

### 6.4 缺失的静态方法（6 个）

| 静态方法 | 原始行 | 影响 |
|---------|-------|------|
| `LGraphCanvas.getBoundaryNodes` | L10484-10508 | 重构已内联到 boundaryNodesForSelection |
| `LGraphCanvas.alignNodes` | L10529-10566 | "Align" 菜单功能依赖 |
| `LGraphCanvas.onNodeAlign` | L10568-10578 | 节点右键菜单"Align"项 |
| `LGraphCanvas.onGroupAlign` | L10580-10590 | 画布右键菜单"Align"项 |
| `LGraphCanvas.onMenuCollapseAll` | L10662 | 空函数 stub |
| `LGraphCanvas.onMenuNodeEdit` | L10664 | 空函数 stub |

**注**：`onNodeAlign`/`onGroupAlign` 在 Part 3 的菜单方法中被引用，但用户要求菜单逻辑保持不变，所以这些缺失的菜单项也保持不变。

### 6.5 完全匹配的重要方法（节选）

- `drawNodeShape` — 330 行的复杂形状绘制，✅ 匹配
- `drawConnections` — ✅ 匹配
- `renderLink` — 270 行的链接渲染，✅ 匹配
- `computeConnectionPoint` — ✅ 匹配
- `drawNodeWidgets` — ✅ 匹配
- `processNodeWidgets` — ✅ 匹配
- `drawLinkTooltip` — ✅ 匹配
- `drawExecutionOrder` — ✅ 匹配
- `resize` — ✅ 匹配
- `onNodeSelectionChange` — ✅ 匹配（都是空 stub）
- `onMenuAdd`/`showMenuNodeOptionalInputs`/`showMenuNodeOptionalOutputs`/`onShowMenuNodeProperties`/`decodeHTML`/`onMenuResizeNode` — ✅ 匹配

---

## 7. LGraphCanvas 模块对比（Part 3）

**范围**：L10978-13661（18 个菜单/面板/对话框方法）
**⚠️ 用户指示**：右键菜单与属性面板显示逻辑保持当前实现不变 — 仅记录差异，不修改

### 7.1 总体统计

- 18 个方法全部存在
- 9 ✅ 匹配 + 9 ⚠️ 逻辑差异（3 Critical — 全部保持原样）
- 1 个 Part 3 范围内的缺失静态方法：`onMenuNodeToSubgraph`（被 `if(0)` 注释代码引用，影响 latent）
- 6 个 Part 2 静态方法重定位到此区域（标注为"MISSING METHODS RESTORED"）

### 7.2 Critical 差异（保持原样，不修改）

#### 7.2.1 `showConnectionMenu` — `this` 绑定丢失

**问题**：重构用 `const { showSearchBox, createDefaultNodeForSlot } = this;` 解构，导致 ES6 严格模式下 `this` 变为 undefined，调用时抛 TypeError。

**用户决定**：保持原样。

#### 7.2.2 `showSearchBox` — 类型过滤逻辑被简化

**问题**：丢失 `extra.data.inputs` 块、selIn/selOut focus/blur/change 监听器、`inner_test_filter` 函数、`show_general_after_typefiltered` 块、`show_general_if_none_on_typefilter` 块；`addResult` DOM 结构和 CSS 类名改变。

**用户决定**：保持原样。

#### 7.2.3 `showShowGraphOptionsPanel` — 替换为 stub

**问题**：原始 86 行实现（含 `OPTIONPANEL_IS_OPEN` 标志、`inner_refresh()` 遍历 `LiteGraph.availableCanvasOptions`、"Render mode" combo widget 等）；重构为 21 行 stub，仅添加 "Live Mode" 复选框。

**用户决定**：保持原样。

### 7.3 其他差异（保持原样）

- `getCanvasMenuOptions`：移除"Align"子菜单（依赖 `LGraphCanvas.onGroupAlign`，已缺失）
- `getNodeMenuOptions`：移除 Resize、Align Selected To、To Subgraph、onGetNodeMenuOptions hook

### 7.4 非菜单方法的差异

#### `checkPanels` — 不同算法

**原始**：查询所有 `.litegraph.dialog` 面板，关闭 graph 不匹配的任何面板
**重构**：只检查 `this.node_panel`/`this.options_panel`，基于选择数关闭

**问题**：subgraph 对话框不再被自动清理；options_panel 因 `node=null` 设置导致总是被关闭

**严重性**：Minor-to-Medium — 不在用户"保持原样"列表中，可以修复。

### 7.5 完全匹配的方法（节选）

- `showLinkMenu` — ✅ 匹配
- `prompt` — ✅ 匹配
- `showEditPropertyValue` — ✅ 匹配
- `createDialog` — ✅ 匹配
- `createPanel` — ✅ 匹配
- `closePanels` — ✅ 匹配
- `showShowNodePanel` — ✅ 匹配
- `showSubgraphPropertiesDialog` — ✅ 匹配
- `showSubgraphPropertiesDialogRight` — ✅ 匹配
- `getGroupMenuOptions` — ✅ 匹配
- `processContextMenu` — ✅ 匹配

---

## 8. 小模块对比

### 8.1 LLink（2 方法 + 构造函数）

| 方法 | 状态 | 备注 |
|------|------|------|
| constructor | ✅ | function → class |
| configure | ⚠️ Minor | 添加 `else if (o && typeof o === "object")` 保护，原始对 null/undefined 也会写字段 |
| serialize | ✅ | 添加尾逗号 |

### 8.2 LGraphGroup（5 方法 + 2 getter）

#### Critical 问题

**1. 构造函数颜色初始化错误**：
- 原始：`this.color = LGraphCanvas.node_colors.pale_blue.groupcolor` = `"#3f789e"`
- 重构：`this.color = LiteGraph.DEFAULT_GROUP_FONT` = `24`（数字，非颜色）

**2. `_bounding`/`_pos`/`_size` 内存共享断裂**：
- 原始：`_pos = _bounding.subarray(0,2)`、`_size = _bounding.subarray(2,4)` — 写 `_pos[0]` 同步影响 `_bounding[0]`
- 重构：三个独立 Float32Array — `move()` 更新 `_pos` 但 `_bounding` 保持初始值

**3. `isPointInside` 完全重写**：
- 原始：借用 `LGraphNode.prototype.isPointInside`（含 NODE_TITLE_HEIGHT 带、collapsed 处理）
- 重构：简单矩形命中测试

#### Minor 问题

- `move`：丢失 `ignore_nodes` 第 3 参数
- `serialize`：不 Math.round；额外添加 `pos`/`size` 字段（schema 改变）
- `size` setter：丢失 `Math.max(140, v[0])` / `Math.max(80, v[1])` 钳制

### 8.3 DragAndScale（10 方法 + 构造函数）

- 10 个方法全部 ✅ 匹配（仅外观变化）
- **构造函数 Minor 差异**：丢失 `skip_events` 第 2 参数

### 8.4 ContextMenu（4 方法 + 构造函数 + 2 静态）

- 6 个方法 ✅ 匹配
- **构造函数改进**：添加 `root.close = this.close.bind(this)` — 允许 `LiteGraph.closeAllContextMenus` 直接调用 `.close()`（合理增强）
- **`LiteGraph.closeAllContextMenus`**：额外关闭 `.litepanel`/`.litedialog` 元素

### 8.5 utils（13 个独立辅助函数）

| 函数 | 状态 | 备注 |
|------|------|------|
| compareObjects | ⚠️ Minor | `!=` → `!==`（松散→严格） |
| distance | ✅ | `*x` → `**2` |
| colorToString | ⚠️ Minor | alpha 格式从 `"0.50"`/`"1.0"` 变为 `"0.5"`/`"1"` |
| isInsideRectangle | ⚠️ Minor | 边界行为：原始严格 `<`（排除所有边界）→ 重构 `>=`/`<`（含左/顶） |
| growBounding | ✅ | |
| isInsideBounding | ⚠️ **Critical** | **bb 参数格式改变（破坏性）**：原始 `[[minx,miny],[maxx,maxy]]` → 重构 `[minx,miny,maxx,maxy]`；边界语义翻转 |
| overlapBounding | ✅ | |
| hex2num | ✅ | 实现不同但等价 |
| num2hex | ⚠️ Minor | 大小写：原始大写 → 重构小写 |
| getTime | ⚠️ Minor | 丢失 `process.hrtime()` Node.js fallback |
| cloneObject | ⚠️ Minor | 保留 Float32Array；行为改善 |
| uuidv4 | ✅ | 实现不同但等价 |
| getParameterNames | ✅ | |
| pointerListenerAdd | ⚠️ **Critical** | 丢失输入验证、touch fallback、leave/cancel/gotpointercapture/lostpointercapture 处理 |
| pointerListenerRemove | ⚠️ **Critical** | 同上 |

### 8.6 缺失

- **`CurveEditor` 类整体缺失**（原始 L14117-14290，约 175 行）
- 13 个工具函数未重附加到 `LiteGraph` 对象（仍可从 utils.js 导入，但 `LiteGraph.compareObjects(...)` 等调用会得到 undefined）

---

## 9. 关键问题清单（按优先级）

### P0 — 崩溃性 bug（必须立即修复）

| # | 位置 | 问题 | 影响 |
|---|------|------|------|
| P0-1 | LGraphCanvas.js:2563, 2593 | `drawFrontCanvas` 中 `const shape` 作用域 bug | 从输入槽拖出连接时渲染循环崩溃 |
| P0-2 | LGraphCanvas.js:4903 | `drawButton` 字体串运算符优先级 bug | 子图面板按钮字体错误 |
| P0-3 | LGraphNode.js:274-290 | `setOutputData` 写 `link._data` 而非 `link.data` | 数据传播断裂 |
| P0-4 | LGraphNode.js:299-313 | `getInputData` 读 `link._data` 且丢 `force_update` | 数据获取断裂 |
| P0-5 | LGraphNode.js:486-492 | `removeOutput` 丢失 link.origin_slot 重索引 | 删槽位后图结构损坏 |
| P0-6 | LGraphNode.js:453-459 | `removeInput` 丢失 link.target_slot 重索引 | 同上 |
| P0-7 | LGraphGroup.js:15 | 构造函数 `color = LiteGraph.DEFAULT_GROUP_FONT`（=24 数字） | 分组颜色渲染失败 |
| P0-8 | LGraphGroup.js:16-18 | `_bounding`/`_pos`/`_size` 内存共享断裂 | 移动分组后序列化数据为 [0,0,0,0] |
| P0-9 | utils.js:53-60 | `isInsideBounding` bb 参数格式改变（破坏性） | 调用者传原始格式会得到 false |
| P0-10 | LiteGraph.js:582-588 | `extendClass` 丢失 prototype + getter/setter 复制 | 继承式子类化失败 |
| P0-11 | LiteGraph.js:517-522 | `isValidConnection` 多类型情况只比较 `split(",")[0]` | 多类型槽连接被错误拒绝 |
| P0-12 | LiteGraph.js:431-446 | `createNode` 丢 title/options/初始化/onNodeCreated | 新建节点缺少必需字段 |

### P1 — 核心功能缺失（应尽快修复）

| # | 位置 | 问题 |
|---|------|------|
| P1-1 | LGraphNode.js:500-584 | `connect` 返回 true/false 而非 link_info；丢失 EVENT 处理、beforeChange/afterChange、onNodeConnectionChange |
| P1-2 | LGraphNode.js:1024-1050 | `triggerSlot` 丢 link_id 过滤、options、ON_TRIGGER doExecute 路径 |
| P1-3 | LGraphNode.js:1006-1013 | `actionDo` 语义反转（立即→延迟） |
| P1-4 | LGraphNode.js:218-225 | `clone` 不深克隆、不断开链接、不重新分配 uuid |
| P1-5 | LGraphNode.js:166-214 | `serialize` 丢失 color/bgcolor/boxcolor/shape 字段 |
| P1-6 | LGraphNode.js:428-438, 461-471 | `addInput`/`addOutput` 丢失 registerNodeAndSlotType + setDirtyCanvas |
| P1-7 | LGraphNode.js:440-451, 473-484 | `addInputs`/`addOutputs` 输入格式从三元组改为对象（破坏性） |
| P1-8 | LGraphNode.js:237-242 | `setProperty` 丢失 prev_value、否决回滚、widget 同步 |
| P1-9 | LGraphNode.js:710-758 | `getConnectionPos` 丢失 horizontal、-1 特例、slot_start_y；Y 算法不同 |
| P1-10 | LGraphNode.js:825-852 | `computeSize` 引用不存在的 NODE_MIN_WIDTH；算法差异 |
| P1-11 | LGraphNode.js:927-939 | `addWidget` 丢失所有多态处理 |
| P1-12 | LGraphNode.js:968-977 | `changeMode` 不调用 addOnTriggerInput/addOnExecutedOutput for ON_TRIGGER |
| P1-13 | LGraphNode.js:949-959 | `addOnTriggerInput`/`addOnExecutedOutput` 返回对象而非索引；类型用 EVENT 而非 ACTION |
| P1-14 | LGraphNode.js:961-966 | `onAfterExecuteNode` 用不存在的 `_triggerExecuted` 标志 |
| P1-15 | LGraphNode.js:1132-1137 | `localToScreen` 用 `.ds.scale`/`.ds.offset` 而非 `.scale`/`.offset`（破坏性） |
| P1-16 | LGraphNode.js:812-816 | `findSlotByType` 参数从 boolean 改为 LiteGraph.INPUT/OUTPUT 常量（破坏性） |
| P1-17 | LGraphNode.js:794-810 | `findInputSlotByType`/`findOutputSlotByType` 丢失 returnObj、preferFreeSlot、doNotUseOccupied、逗号分割匹配 |
| P1-18 | LGraphNode.js:606-706 | `disconnectOutput`/`disconnectInput` 丢失 _version++、graph.onNodeConnectionChange、connectionChange |
| P1-19 | LGraphNode.js:1052-1062 | `clearTriggeredSlot` 清错属性（`output._triggered` vs `link._last_time`） |
| P1-20 | LGraphNode.js:259-270 | `getPropertyInfo` 丢失多源查找 |
| P1-21 | LGraphNode.js:887-896 | `isPointInside` 丢失 collapsed/isLive 处理 |
| P1-22 | LGraphNode.js:898-918 | `getSlotInPosition` 命中测试不同；返回键 `link_pos` → `linkPos`（破坏性） |
| P1-23 | LGraphNode.js:1076-1082 | `addConnection` 签名改变（丢 pos）；不创建 connection 对象 |
| P1-24 | LiteGraph.js:160-271 | `registerNodeType` 丢失 onNodeTypeRegistered/onNodeTypeReplaced 回调 |
| P1-25 | LiteGraph.js:292-320 | `registerNodeAndSlotType` 默认方向翻转；丢 EVENT/ACTION 映射、逗号分割、sort |
| P1-26 | LiteGraph.js:458-472 | `getNodeTypesInCategory` filter 语义改变（字符串→函数） |
| P1-27 | LiteGraph.js:477-487 | `getNodeTypesCategories` 丢 filter 参数和 skip_list |
| P1-28 | LiteGraph.js:323-350 | `buildNodeClassFromObject` 签名改变（丢 name）；不调用 registerNodeType |
| P1-29 | LiteGraph.js:351-390 | `wrapFunctionAsNode` 签名改变（paramTypes 格式） |
| P1-30 | LiteGraph.js:539-554 | `fetchFile` 丢 on_complete/on_error 回调、proxy、arraybuffer/blob |
| P1-31 | utils.js:172-186 | `pointerListenerAdd/Remove` 丢 touch fallback 和 leave/cancel 处理 |
| P1-32 | LGraph.js:129-146 | `attachCanvas` 类型检查失效（LGraph._LGraphCanvas 未定义） |
| P1-33 | LGraphCanvas.js:7433-7449 | `switchLiveMode` 动画完全丢失 |
| P1-34 | LGraphCanvas.js:7601-7609 | `isAreaClicked` 完全重写（签名和语义不同） |
| P1-35 | LGraphGroup.js:97-105 | `isPointInside` 完全重写 |
| P1-36 | LGraphGroup.js:74-83 | `move` 丢失 `ignore_nodes` 参数 |
| P1-37 | 13 个 utils 函数未重附加到 LiteGraph | 调用 `LiteGraph.compareObjects` 等返回 undefined |
| P1-38 | CurveEditor 类整体缺失 | `new LiteGraph.CurveEditor()` 抛 TypeError |

### P2 — 外观/边界差异（可后续处理）

- LLink `configure` 对 null/undefined 的处理
- LGraphNode `addProperty` 函数默认值支持
- LGraphNode `trace` 丢失 console 缓冲
- LGraphNode `loadImage` 丢失 ready 标志
- LGraphNode `collapse`/`pin` 添加额外 setDirtyCanvas
- `compareObjects` 严格相等
- `colorToString` alpha 格式
- `isInsideRectangle` 边界语义
- `num2hex` 大小写
- `getTime` 丢失 Node.js fallback
- `LGraphNode.serialize` 不警告 onSerialize 返回值

### 保持原样（用户指示）

- LGraphCanvas Part 3 的所有右键菜单与属性面板逻辑（showLinkMenu、createDefaultNodeForSlot、showConnectionMenu、showSearchBox、showEditPropertyValue、createDialog、createPanel、showShowGraphOptionsPanel、showShowNodePanel、showSubgraphPropertiesDialog、showSubgraphPropertiesDialogRight、getCanvasMenuOptions、getNodeMenuOptions、getGroupMenuOptions、processContextMenu）
- 这些方法中的 Critical bug（showConnectionMenu 的 this 绑定、showSearchBox 的类型过滤简化、showShowGraphOptionsPanel 的 stub 化）按用户要求**不修复**

---

## 10. 建议修复顺序

### 第一阶段：P0 崩溃性 bug（必须立即修复）

1. **LGraphCanvas.js drawFrontCanvas**：将 `const shape` 改为 `let shape` 并在 `_highlight_output` 块外声明
2. **LGraphCanvas.js drawButton**：恢复外层括号 `((h * 0.65) | 0) + "px Arial"`
3. **LGraphNode.js setOutputData/getInputData**：恢复 `link.data` 属性名（或全面迁移到 `_data` 并保持一致）
4. **LGraphNode.js removeInput/removeOutput**：恢复 link 重索引
5. **LGraphGroup.js 构造函数**：修复 color 初始化；恢复 _bounding/_pos/_size subarray 共享
6. **utils.js isInsideBounding**：恢复 `[[minx,miny],[maxx,maxy]]` 参数格式
7. **LiteGraph.js extendClass**：恢复 prototype + getter/setter 复制
8. **LiteGraph.js isValidConnection**：恢复多类型排列组合检查
9. **LiteGraph.js createNode**：恢复 title/options/初始化/onNodeCreated

### 第二阶段：P1 核心功能（优先修复影响连接/执行/克隆的方法）

10. **LGraphNode.js connect**：恢复完整验证、EVENT 处理、回调、返回 link_info
11. **LGraphNode.js triggerSlot/actionDo**：恢复 ON_TRIGGER doExecute 路径；actionDo 改回立即执行
12. **LGraphNode.js clone**：恢复深克隆、断开链接、uuid 重分配
13. **LGraphNode.js serialize**：恢复 color/bgcolor/boxcolor/shape 字段
14. **LGraphNode.js addInput/addOutput/addInputs/addOutputs**：恢复 registerNodeAndSlotType + setDirtyCanvas；恢复三元组输入格式
15. **LGraphNode.js setProperty**：恢复 prev_value、否决回滚、widget 同步
16. **LGraphNode.js getConnectionPos/computeSize**：恢复原始算法
17. **LGraphNode.js addWidget**：恢复多态处理
18. **LGraphNode.js changeMode**：恢复 ON_TRIGGER 时的 addOnTriggerInput/addOnExecutedOutput
19. **LGraphNode.js addOnTriggerInput/addOnExecutedOutput**：返回索引；用 ACTION 而非 EVENT
20. **LGraphNode.js onAfterExecuteNode**：恢复查找 "onExecuted" 槽位
21. **LGraphNode.js localToScreen**：恢复 `.scale`/`.offset`（或确认 canvas 一致使用 `.ds`）
22. **LGraphNode.js findSlotByType**：恢复 boolean 参数语义
23. **LGraphNode.js findInputSlotByType/findOutputSlotByType**：恢复逗号分割匹配、returnObj、preferFreeSlot
24. **LGraphNode.js disconnectOutput/disconnectInput**：恢复 _version++、graph.onNodeConnectionChange、connectionChange
25. **LGraphNode.js clearTriggeredSlot**：清 `link._last_time` 而非 `output._triggered`；恢复 per-slot 过滤
26. **LGraphNode.js getPropertyInfo**：恢复多源查找
27. **LGraphNode.js isPointInside**：恢复 collapsed/isLive 处理
28. **LGraphNode.js getSlotInPosition**：恢复原始命中测试；返回键改回 `link_pos`
29. **LGraphNode.js addConnection**：恢复 pos 参数和 connection 对象创建

### 第三阶段：LiteGraph 静态方法

30. **LiteGraph.js registerNodeType**：恢复回调
31. **LiteGraph.js registerNodeAndSlotType**：恢复默认方向、EVENT/ACTION 映射、逗号分割、sort
32. **LiteGraph.js getNodeTypesInCategory/getNodeTypesCategories**：恢复 filter 语义
33. **LiteGraph.js buildNodeClassFromObject/wrapFunctionAsNode**：恢复原始签名
34. **LiteGraph.js fetchFile**：恢复回调、proxy、arraybuffer/blob
35. **utils.js pointerListenerAdd/Remove**：恢复 touch fallback 和特殊事件处理
36. **LGraph.js attachCanvas**：定义 `LGraph._LGraphCanvas` 或改回 instanceof
37. **index.js**：添加 13 个 utils 函数的 `LiteGraph.X = X` 重附加
38. 创建 `CurveEditor.js` 模块并在 index.js 注册

### 第四阶段：LGraphCanvas

39. **LGraphCanvas.js switchLiveMode**：恢复 setInterval 动画
40. **LGraphCanvas.js isAreaClicked**：恢复原始 5 参数签名和立即模式语义
41. **LGraphCanvas.js checkPanels**：恢复 DOM 查询算法（不在用户保持原样列表中）
42. **LGraphCanvas.js openSubgraph**：恢复 `this.checkPanels()` 调用

### 第五阶段：LGraphGroup

43. **LGraphGroup.js isPointInside**：恢复借用 LGraphNode 语义
44. **LGraphGroup.js move**：恢复 `ignore_nodes` 参数
45. **LGraphGroup.js serialize/configure**：决定是恢复原始 schema 还是保持新 schema（涉及 pos/size 字段）
46. **LGraphGroup.js size setter**：恢复钳制

### 不修复（用户指示）

- LGraphCanvas Part 3 的右键菜单与属性面板方法
- 6 个缺失的"Align"静态方法（onNodeAlign/onGroupAlign/alignNodes/getBoundaryNodes/onMenuCollapseAll/onMenuNodeEdit）— 因菜单逻辑保持不变
- `pointerevents_method` 默认值从 "mouse" 改为 "pointer"（这是 ES6 模块的合理选择）

---

## 附录：完整方法对比明细

完整的方法级对比明细（包括每个方法的原始行号、重构行号、差异描述、严重性评级）见各子代理的工作日志记录：

- `/home/z/my-project/worklog.md` — Task ID: compare-LiteGraph
- `/home/z/my-project/worklog.md` — Task ID: compare-LGraph
- `/home/z/my-project/worklog.md` — Task ID: compare-LGraphNode
- `/home/z/my-project/worklog.md` — Task ID: compare-LGraphCanvas-1
- `/home/z/my-project/worklog.md` — Task ID: compare-LGraphCanvas-2
- `/home/z/my-project/worklog.md` — Task ID: compare-LGraphCanvas-3
- `/home/z/my-project/worklog.md` — Task ID: compare-small-modules

---

**报告生成完毕**
