# LiteGraph.js ES6 重构项目 — 代码质量与改进分析报告

> 分析日期: 2026-06-28
> 分析范围: `src/app/page.tsx` + `src/lib/litegraph/*` + 项目整体架构
> 分析方法: 静态代码审查 + 运行时行为验证

---

## 总体评价

项目整体架构清晰，重构工作扎实，已通过 4 轮方法级对比修复。但仍存在以下**不合理**之处需要改进，按优先级分为 P0（必须改）/ P1（应该改）/ P2（建议改）三级。

---

## P0 — 必须改进的问题（影响功能或稳定性）

### 1. **`eval()` 安全漏洞** — `LGraphCanvas.js:4488`

```js
try {
    v = eval(v);
} catch (e) {}
```

**问题**：在 `processNodeWidgets` 中使用 `eval()` 处理用户输入的数字表达式。虽然在 demo 场景下用户输入可控，但这是**生产代码的安全反模式**。任意 JavaScript 都可以通过 widget 输入执行。

**建议**：用安全的表达式解析器替代：
```js
// 方案 A：限制为纯数学表达式
function safeEval(expr) {
  if (!/^[0-9+\-*/()\s.]+$/.test(expr)) return expr;
  try { return Function('"use strict"; return (' + expr + ')')(); }
  catch { return expr; }
}
// 方案 B：用 math.js 等库
```

### 2. **`new Function()` 代码注入风险** — `LiteGraph.js:396, 452`

```js
new Function(ctor_code).call(this);
```

**问题**：`buildNodeClassFromObject` 和 `wrapFunctionAsNode` 用 `new Function()` 动态构造函数体。如果 `object.inputs[i][0]`（name）或 `func` 来源不可信，可注入任意代码。

**建议**：
- 短期：在文档中明确警告这两个方法只接受可信输入
- 长期：用模板字面量 + 参数传递替代字符串拼接

### 3. **React useEffect 未清理 window 全局变量** — `page.tsx:255-257`

```js
(window as any).__graphCanvas = graphCanvas;
(window as any).__graph = graph;
(window as any).__LiteGraph = LiteGraph;
```

**问题**：组件卸载时未清理 `window.__graphCanvas` 等 3 个全局变量，会导致：
- 内存泄漏（旧 graph/graphCanvas 实例无法 GC）
- React 18 StrictMode 双挂载时，第二次挂载会覆盖第一次的引用
- HMR 热更新时残留旧实例

**建议**：
```js
return () => {
  graph.stop();
  graphCanvas.stopRendering();
  ro.disconnect();
  if (propPollRef.current) clearInterval(propPollRef.current);
  // 清理全局变量
  delete (window as any).__graphCanvas;
  delete (window as any).__graph;
  delete (window as any).__LiteGraph;
};
```

### 4. **`nodes.js` 是死代码** — `src/lib/litegraph/nodes.js` (337 行)

**问题**：`nodes.js` 定义了 NumberNode/MathNode 等节点类，但**从未被任何文件导入**。`page.tsx` 自己重新定义了所有节点类（行 38-98）。这导致：
- 337 行无用代码进入构建
- 两份节点定义容易产生分歧
- 维护成本翻倍

**建议**：
- 方案 A（推荐）：删除 `nodes.js`，统一用 `page.tsx` 中的定义
- 方案 B：把 `page.tsx` 中的节点定义移到 `nodes.js`，在 `page.tsx` 中 `import` 它们

### 5. **未使用的导入** — `page.tsx:9`

```tsx
import { LiteGraph, LGraph, LGraphNode, LGraphCanvas, LGraphGroup } from '@/lib/litegraph';
```

**问题**：`LGraphGroup` 被导入但从未在 `page.tsx` 中使用（grep 全文件只有 import 行）。这会触发 ESLint 警告，也说明原本可能计划支持 group 功能但未实现。

**建议**：删除未使用的导入，或实现 group 功能。

---

## P1 — 应该改进的问题（影响可维护性或用户体验）

### 6. **大量 `any` 类型** — `page.tsx` 共 10 处

```tsx
const [selectedNode, setSelectedNode] = useState<any>(null);
function PropertyEditor({ node, onChange }: { node: any; onChange: () => void })
const handleChange = (key: string, value: any) => { ... }
{node.inputs.map((inp: any, i: number) => ...)}
```

**问题**：TypeScript 的类型安全完全失效。重构的 ES6 模块没有导出类型定义，导致 `page.tsx` 无法获得类型提示。

**建议**：
1. 在 `LGraphNode.js` 等模块顶部添加 JSDoc 类型注释
2. 创建 `src/lib/litegraph/types.d.ts` 提供类型声明
3. 至少为 `LGraphNode`、`LGraph`、`LGraphCanvas` 提供基础接口

### 7. **节点类定义过于压缩** — `page.tsx:38-98`

```tsx
class NumberNode extends LGraphNode {
  constructor() { super('Number'); this.addOutput('value', 'number'); this.addProperty('value', 1.0, 'number'); this.addWidget('number', 'Value', 1.0, (v: number) => { this.properties.value = v; }); this.serialize_widgets = true; }
  onExecute() { this.setOutputData(0, parseFloat(this.properties.value)); }
  static title = 'Number'; static desc = 'Constant number';
}
```

**问题**：12 个节点类全部压缩成单行，可读性极差，难以维护和扩展。

**建议**：展开为正常多行格式，每个方法独占一行。

### 8. **`pollSelectedNode` 使用 300ms 轮询** — `page.tsx:270`

```js
propPollRef.current = setInterval(pollSelectedNode, 300);
```

**问题**：用定时器轮询选中节点状态，而不是事件驱动。这导致：
- 属性面板更新有 0-300ms 延迟
- 即使无操作也持续运行（CPU 占用）
- 不必要的 re-render

**建议**：用 `LGraphCanvas.onNodeSelectionChange` 回调（已在重构中存在）：
```js
graphCanvas.onNodeSelectionChange = () => {
  pollSelectedNode(); // 只在选择变化时触发
};
```

### 9. **PropertyEditor 不支持 combo/enum 类型** — `page.tsx:143-153`

```tsx
{entries.map(([key, val]) => (
  <input
    type={typeof val === 'number' ? 'number' : 'text'}
    ...
  />
))}
```

**问题**：属性面板只支持 number 和 text 输入，但 MathNode 的 `OP` 属性是 enum（`+`/`-`/`*`/...）。用户必须手敲字符串，无法下拉选择。

**建议**：用 `node.getPropertyInfo(key)` 获取类型信息，对 enum 渲染 `<select>`：
```tsx
const info = node.getPropertyInfo(key);
if (info.type === 'enum' && info.values) {
  return <select value={val} onChange={...}>{info.values.map(v => <option>{v}</option>)}</select>;
}
```

### 10. **无键盘快捷键文档/帮助** — `page.tsx`

**问题**：底部 hint 区域只列了 4 个快捷键（Scroll/Space+Drag/Drag slot/Tab），但实际还有：
- `Delete` / `Backspace` 删除节点
- `Ctrl+C` / `Ctrl+V` 复制粘贴
- `Ctrl+A` 全选
- `Esc` 取消选择

**建议**：在 hint 区域补全，或添加 `?` 按钮弹出完整快捷键面板。

### 11. **Demo 图布局硬编码坐标** — `page.tsx:114-127`

```js
const n1 = LiteGraph.createNode('basic/number'); n1.pos = [100, 100]; ...
const n2 = LiteGraph.createNode('basic/number'); n2.pos = [100, 280]; ...
```

**问题**：9 个节点的位置全部硬编码，调整布局需要改源码。画布缩放后节点可能超出可视区域。

**建议**：用 `graph.arrange()` 自动布局，或提取为可配置的 JSON。

### 12. **无错误边界（Error Boundary）** — `page.tsx`

**问题**：`useEffect` 中的 `new LGraph()` / `new LGraphCanvas()` 没有 try/catch。如果 litegraph 模块初始化失败（例如 canvas 为 null），整个页面会白屏。

**建议**：用 React Error Boundary 包裹，或在 useEffect 中 try/catch 并显示错误提示。

### 13. **代码对比面板是静态字符串** — `page.tsx:347-399`

```tsx
const codeExamples = {
  original: `// ===== Original (IIFE + Prototype) ===== ...`,
  refactored: `// ===== Refactored (ES6 Class + Modules) ===== ...`,
};
```

**问题**：代码对比面板展示的是**简化的示例代码**，不是真实的重构前后代码。用户点开 `</>` 期望看到实际差异，结果只看到教学示例。

**建议**：
- 方案 A：读取真实源文件展示（用 `fetch` 或 `import.meta.glob`）
- 方案 B：明确标注"示例代码"，避免误导
- 方案 C：移除该面板，改为链接到 GitHub 对比

---

## P2 — 建议改进的问题（优化体验）

### 14. **无移动端适配** — `page.tsx`

**问题**：三栏布局（200px + flex-1 + 240px）在小屏上左右面板会挤压画布到不可用尺寸。无 `md:` / `lg:` 响应式断点。

**建议**：小屏（<768px）时折叠左右面板为抽屉式，或隐藏。

### 15. **无暗色/亮色主题切换** — `page.tsx`

**问题**：硬编码暗色主题（`bg-[#0d1117]`），无切换选项。litegraph 原本支持 `clear_background_color` 等配置。

**建议**：添加主题切换按钮，或跟随系统 prefers-color-scheme。

### 16. **无保存/加载图功能** — `page.tsx`

**问题**：用户精心搭建的图无法保存，刷新即丢失。litegraph 原生支持 `graph.serialize()` / `graph.configure()`。

**建议**：添加 Save/Load 按钮，用 localStorage 或文件下载/上传。

### 17. **无撤销/重做** — `page.tsx`

**问题**：误删节点或误断连线后无法恢复。litegraph 原生有 `graph.beforeChange()` / `graph.afterChange()` 钩子。

**建议**：实现简单的 undo stack，记录每次 beforeChange 的图状态。

### 18. **`useCallback` 依赖数组全为空** — `page.tsx`

```tsx
const handleAddNodeType = useCallback((type: string) => { ... }, []);
const handlePlayStop = useCallback(() => { ... }, [isRunning]);
```

**问题**：`handlePlayStop` 依赖 `isRunning` 但其他几个 `useCallback` 依赖为空。这虽然能工作（因为用了 ref），但不符合 React 最佳实践，可能导致闭包陷阱。

**建议**：用 ref 替代 state 依赖，或正确声明依赖。

### 19. **无单元测试** — 整个项目

**问题**：14 个 JS 模块 + 1 个 TSX 页面，0 个测试文件。重构 4 轮全靠手动浏览器验证，回归风险高。

**建议**：至少为关键方法添加 Vitest 测试：
- `LiteGraph.isValidConnection` 多类型匹配
- `LGraphNode.connect` 返回 link_info
- `LGraphNode.clone` 断开链接
- `LGraph.serialize` / `configure` 往返一致性

### 20. **`console.log` 残留** — `page.tsx:76`

```tsx
onExecute() { const data = this.getInputData(0); if (...) { console.log(`[${this.properties.prefix}]`, data); } }
```

**问题**：ConsoleNode 的 `console.log` 是功能性的（用户期望看到日志），但在生产环境会刷屏。

**建议**：添加开关，或用 `console.debug` 替代，便于过滤。

### 21. **无 loading 状态** — `page.tsx`

**问题**：页面加载时 canvas 初始化是同步的，如果节点很多会有短暂白屏。

**建议**：添加 loading skeleton 或 spinner。

### 22. **无 FPS/性能指标** — `page.tsx`

**问题**：图执行性能无可视化指标，用户无法感知是否卡顿。

**建议**：在底部状态栏显示 FPS、节点数、执行时间。

---

## 架构层面建议

### A. **模块导出混乱**

`index.js` 同时导出 `LiteGraph`（实例）和 `LiteGraphClass`（类），但 `page.tsx` 只用 `LiteGraph`。这种双导出容易混淆。

**建议**：只导出 `LiteGraph`（单例模式），移除 `LiteGraphClass`。

### B. **循环依赖处理方式可优化**

当前用 `_setLiteGraphRef` + `index.js` 延迟注册解决循环依赖。这种方式：
- 增加了 `index.js` 的维护成本（每次新增模块都要改）
- 运行时才初始化，调试困难
- 违反 ES6 模块的静态分析特性

**建议**：考虑用 dependency injection 模式，或把 `LiteGraph` 改为可实例化的类而非单例。

### C. **缺少 TypeScript 类型定义**

14 个 JS 模块全部是 `.js`，无 `.d.ts`。在 `page.tsx` 中 `import` 时失去类型检查。

**建议**：添加 `src/lib/litegraph/types.d.ts` 或迁移到 `.ts`。

---

## 优先级修复路线图

| 阶段 | 任务 | 预估工时 |
|------|------|---------|
| **立即** | P0-1 eval 替换、P0-3 window 清理、P0-4 删除 nodes.js、P0-5 删除未用导入 | 1 小时 |
| **短期** | P1-6 类型定义、P1-7 展开节点类、P1-8 事件驱动替代轮询、P1-9 combo 支持 | 4 小时 |
| **中期** | P1-12 错误边界、P1-13 真实代码对比、P2-16 保存加载、P2-17 撤销重做 | 8 小时 |
| **长期** | P2-14 移动端、P2-19 单元测试、架构 A/B/C 优化 | 16+ 小时 |

---

## 结论

项目作为 **litegraph.js 重构演示** 已经达到目标，4 轮对比修复确保了行为一致性。但作为**可实际使用的节点编辑器**，还存在安全漏洞（eval）、内存泄漏（window 全局）、死代码（nodes.js）、类型缺失等问题。

**建议优先处理 P0 的 5 个问题**（约 1 小时工时），可显著提升项目质量。P1/P2 可根据实际使用场景选择性处理。

---

**报告生成完毕**
