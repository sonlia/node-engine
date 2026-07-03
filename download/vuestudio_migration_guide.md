# vuestudio 迁移指南：用重构版 litegraph 替换 editor.js

## 概述

重构版 litegraph 已合并 vuestudio 所需的全部功能（valueMode、slot by id、节点/slot 可见性、runOnce、onTabMenu 回调、setProperty on_change 等）。本指南列出替换 editor.js 时需要注意的所有问题。

---

## 阻断点（必须处理才能运行）

### 阻断点 1：ContextMenu import/export

**位置**：editor.js 第 10 行 import、第 2662 行 export

**问题**：重构版没有 `ContextMenu` 类（已删除右键菜单功能）。editor.js import 它会得到 `undefined`。

**修复**：删除 editor.js 里 `ContextMenu` 的 import 和 export。editor.js 里没有 `new ContextMenu(...)` 调用，只调了 `LiteGraph.closeAllContextMenus(ref_window)`（重构版有这个 stub）。

---

### 阻断点 2：editor.js 重写方法引用已删 API

**位置**：editor.js 的 `processMouseDown`（第 521/554/631 行）、`processMouseUp`（第 1156/1162/1170/1176 行）

**问题**：这些重写方法调用了重构版已删的方法：
- `this.showLinkMenu(link, e)` — 已删
- `this.showSearchBox(e)` — 已删
- `this.createDefaultNodeForSlot(...)` — 已删
- `this.showConnectionMenu({...})` — 已删

**修复**：删除 editor.js 里 `processMouseDown`/`processMouseUp`/`processMouseMove`/`processMouseWheel` 的重写，用重构版原生实现。重构版已包含 vuestudio 需要的 bug 修复（折叠框点击、slot hit-box 统一、拖动连线渲染等）。

---

### 阻断点 3：LiteGraph.GraphInput 赋值 bug

**位置**：nodeMetea.js 第 1225 行和第 1272 行

**问题**：
```js
// 第 1225 行
LiteGraph.GraphInput = GraphInput;  // ✅ 正确
// 第 1272 行（BUG！应该是 GraphOutput）
LiteGraph.GraphInput = GraphOutput;  // ❌ 覆盖了上面的赋值
```

**修复**：第 1272 行改成 `LiteGraph.GraphOutput = GraphOutput;`

**重构版侧**：不需要做什么。nodeMetea.js 自己定义和注册 GraphInput/GraphOutput。

---

### 阻断点 4（⚠️ 重点）：graph.start() vs graph.runOnce() 执行模式冲突

**这是最需要注意的问题。**

#### vuestudio 的执行模式

vuestudio 有两种执行方式并存：

**方式 A：手动触发（主要模式）**
- `useLitegraphEditor.js` 的 `runStep()` 函数调 `graph.runOnce()`
- 属性变化时通过防抖触发 `runStep()`（第 45-50 行）
- 节点选择、结构变化时手动调 `runStep()`（第 262/350/514 行）
- 多个 Vue 面板（ifPanel/forLoopPanel/whilePanel 等）直接调 `props.value.graph.runStep()`
- 注释明确说："不启动自动循环，改为手动调用 runStep()"

**方式 B：自动循环（start(x)）**
- `useLitegraphEditor.js` 第 494-498 行 `export function start(x) { graph.stop(); graph.start(x); }`
- `start(x)` 的 `x` 参数是执行周期（毫秒），传 0 表示 60fps RAF 循环
- `meta2dEditor/PenLogicEditor.vue` 第 80 行直接调 `graph.start()`

#### 重构版 start() 的行为

重构版的 `graph.start(interval)` 行为：
- `interval === 0`（默认）：启动 `requestAnimationFrame` 60fps 循环，每帧调 `runStep(1)` + `onAfterStep`
- `interval > 0`：启动 `setInterval` 以指定毫秒周期执行
- `graph.stop()`：停止循环

#### 冲突分析

| 场景 | vuestudio 期望 | 重构版实际行为 | 冲突？ |
|---|---|---|---|
| **手动触发 runStep()** | 只执行一次，触发 onAfterStep | runOnce → runStep(1) → onAfterStep | ✅ 无冲突 |
| **graph.start(0)** | 60fps 循环执行 | 60fps RAF 循环 | ✅ 无冲突 |
| **graph.start(100)** | 每 100ms 执行一次 | 每 100ms setInterval | ✅ 无冲突 |
| **graph.start() 不传参** | ？ | interval=0，60fps 循环 | ⚠️ 需确认 |
| **start + runStep 并存** | start 启动循环，runStep 额外触发 | start 的 RAF 循环 + runStep 额外调用 = 可能双重执行 | 🔴 **冲突** |

#### ⚠️ 关键风险：start() 和 runStep() 并存导致双重执行

如果 vuestudio 同时：
1. 调了 `graph.start(x)` 启动循环
2. 又在属性变化/节点选择时调 `runStep()`

那么 `onAfterStep` 会被触发两次：
- 一次来自 start 的循环
- 一次来自 runStep → runOnce → runStep(1) → onAfterStep

`onAfterStep` 里调 `codeStrategy.afterStep()` 生成代码，双重执行会导致：
- 性能问题（代码生成跑两遍）
- 可能的状态不一致

#### 建议处理方案

**方案 1（推荐）：vuestudio 统一用 runOnce，不用 start()**

把 `useLitegraphEditor.js` 的 `start(x)` 函数改成：
```js
export function start(x) {
  // 不启动自动循环，只初始化状态
  // 执行由 runStep() 手动触发
  graph.status = LGraph.STATUS_RUNNING;
  graph.starttime = LiteGraph.getTime();
}
```

如果需要周期执行，用 vuestudio 自己的 setTimeout/setInterval 包裹 runStep()：
```js
export function start(x) {
  if (x && x > 0) {
    // 用户指定的执行周期
    graph._customTimer = setInterval(() => runStep(), x);
  }
  // 不调 graph.start()，避免重构版的 RAF 循环
}
```

**方案 2：重构版加一个 start(0) 不启动循环的选项**

重构版的 `start(interval)` 加一个特殊值：
```js
start(interval) {
  // ...
  if (interval === -1) {
    // 不启动循环，只初始化状态（vuestudio 模式）
    this.execution_timer_id = -1;
    return;
  }
  // ... 原有 RAF/setInterval 逻辑
}
```

vuestudio 调 `graph.start(-1)` 表示"初始化但不循环"。

**方案 3：保持现状，vuestudio 确保不同时用 start 和 runStep**

如果 vuestudio 确认在某些场景（如 meta2dEditor）用 `graph.start()` 启动循环，在另一些场景用 `runStep()` 手动触发，**确保两者不在同一个 graph 实例上同时使用**。

---

## 非阻断但建议处理的问题

### 5. nodeMetea.js 删除 getInputData/setOutputData 重写

重构版已合并 valueMode 逻辑，nodeMetea.js 第 22-108 行的 prototype 重写可以删除。

### 6. nodeMetea.js 删除 setProperty 重写

重构版 setProperty 已加 `on_change` 回调，editor.js 第 22-47 行的重写可以删除。

### 7. processKey 重写改为回调

editor.js 重写了整个 `processKey`（115 行），主要加了：
- Tab 键 → `onTabMenu` 回调
- 屏蔽 Ctrl+S / Backspace
- `hideTabMenu()` 调用

重构版 processKey 已支持 `onTabMenu` 回调。vuestudio 侧改为：
```js
graphcanvas.onTabMenu = function(e) { /* 显示 Tab 菜单 */ };
graphcanvas.onHideTabMenu = function() { /* 隐藏 Tab 菜单 */ };
```
不用重写整个 processKey。Ctrl+S/Backspace 屏蔽可以在组件层面用 `e.preventDefault()` 处理。

### 8. editor.js 里的节点注册逻辑

editor.js 末尾注册了 GraphInput/GraphOutput + 所有业务节点：
```js
LiteGraph.GraphInput = GraphInput;
LiteGraph.registerNodeType("graph/input", GraphInput);
LiteGraph.GraphOutput = GraphOutput;
LiteGraph.registerNodeType("graph/output", GraphOutput);

for (let _nodeList in allNodeList) { ... LiteGraph.registerNodeType(...); }
```

这段逻辑需要移到 useLitegraphEditor.js 或单独文件，不能丢。

---

## 迁移步骤（vuestudio 侧）

1. **安装重构版 litegraph**：把 `node-engine` 作为依赖或直接复制 `src/lib/litegraph/` 到 vuestudio

2. **改 import 路径**（6 个文件）：
   - `useLitegraphEditor.js`：`from "../editor.js"` → `from "重构版路径"`
   - `nodeMetea.js`：`from "../editor.js"` → `from "重构版路径"`
   - `storeRef.js`：`from "../../editor.js"` → `from "重构版路径"`
   - `meta2dEventNodes.js`/`meta2dAnimateNodes.js`/`meta2dUnifiedNodes.js`：同上
   - `vue/base.js`：`from "litegraph.js"` → `from "重构版路径"`
   - `DBTableNode.js`/`DBProcedureNode.js`：同上

3. **删除 editor.js**，把节点注册逻辑移到 `useLitegraphEditor.js`

4. **删除 nodeMetea.js 的 prototype 重写**（getInputData/setOutputData/setProperty）

5. **processKey 改为回调模式**（onTabMenu/onHideTabMenu）

6. **处理 start/runStep 执行模式**（见阻断点 4，选择方案 1/2/3）

7. **修复 nodeMetea.js 第 1272 行 bug**（GraphInput → GraphOutput）

8. **测试**：
   - 节点创建/删除/连接
   - 属性编辑触发代码生成
   - slot 可见性（hideOnNode/hideOnSubgraphPanel）
   - 节点可见性（flags.hidden）
   - Tab 菜单
   - Subgraph 创建/编辑
