# 引擎/UI 分离改造方案

## 当前耦合问题（精确清单）

### 1. engine→UI 耦合（9处 sendActionToCanvas）
- LGraph.js: 7处 (clear, checkPanels, onBeforeChange, onAfterChange, onConnectionChange, setDirty x2)
- LGraphNode.js: 1处 setDirtyCanvas → sendActionToCanvas

### 2. UI→engine 耦合（6处直接修改）
- LGraphCanvas 直接操作 graph._nodes (splice/push/unshift)
- LGraphCanvas 直接访问 graph.links[]

### 3. 渲染方法在 engine 层（5个方法）
- getConnectionPos, computeSize, getBounding, isPointInside, getSlotInPosition

### 4. 配置混合
- NODE_TITLE_HEIGHT, NODE_SLOT_HEIGHT 等 UI 常量在 LiteGraph (engine)

## 改造方案

### Step 1: LGraph 实现 EventTarget
- LGraph extends EventTarget
- sendActionToCanvas 改为 dispatchEvent
- LGraphNode.setDirtyCanvas 改为 dispatchEvent

### Step 2: LGraphCanvas 订阅事件
- 替代 sendActionToCanvas 的字符串反射调用

### Step 3: 渲染常量分离
- UI 常量移到 LGraphCanvas 静态属性

### Step 4: 接口审查
- 移除冗余接口
- 补充缺失接口
