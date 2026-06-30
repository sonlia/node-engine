// 运行时行为测试：实际验证 5 策略融合 + 减少重复计算
// 模拟 Number(42) -> Math(+) -> Display 静态链 + Timer -> Display 动态链
// 期望：优化模式下，静态分支只第一帧执行，Timer 分支每帧执行

global.navigator = { hardwareConcurrency: 4 };
global.crypto = { randomUUID: () => 'id-' + Math.random().toString(36).slice(2) };
global.EventTarget = class { addEventListener(){} removeEventListener(){} dispatchEvent(){return true;} };
global.CustomEvent = class { constructor(type, opts){ this.type=type; this.detail = opts && opts.detail; } };
global.Worker = class { constructor(){} postMessage(){} terminate(){} set onmessage(f){} };
global.Blob = class { constructor(){} };
global.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };

const lg = require('/tmp/litegraph_bundle.cjs');
const { LiteGraph, LGraph, LGraphNode } = lg;

let numberExecCount = 0, mathExecCount = 0, displayExecCount = 0, timerExecCount = 0;

class TestNumber extends LGraphNode {
  constructor(){ super('N'); this.addOutput('v','number'); this.addProperty('value', 42, 'number'); }
  onExecute(){ numberExecCount++; this.setOutputData(0, this.properties.value); }
  static title = 'N';
}
class TestMath extends LGraphNode {
  constructor(){ super('Math'); this.addInput('A','number'); this.addInput('B','number'); this.addOutput('=','number'); this.addProperty('B', 8, 'number'); }
  onExecute(){ mathExecCount++; const a = this.getInputData(0) || 0; this.setOutputData(0, a + this.properties.B); }
  static title = 'Math';
}
class TestDisplay extends LGraphNode {
  constructor(){ super('D'); this.addInput('v', 0); this.size = [100, 50]; }
  onExecute(){ displayExecCount++; this._v = this.getInputData(0); }
  static title = 'D';
}
class TestTimer extends LGraphNode {
  constructor(){ super('T'); this.addOutput('t','number'); this._alwaysDirty = true; this._t = 0; }
  onExecute(){ timerExecCount++; this._t += 0.016; this.setOutputData(0, this._t); }
  static title = 'T';
}
LiteGraph.registerNodeType('test/number', TestNumber);
LiteGraph.registerNodeType('test/math', TestMath);
LiteGraph.registerNodeType('test/display', TestDisplay);
LiteGraph.registerNodeType('test/timer', TestTimer);

function buildGraph(useOpt) {
  numberExecCount = mathExecCount = displayExecCount = timerExecCount = 0;
  const g = new LGraph();
  if (useOpt) { if (!g.config) g.config = {}; g.config.optimized_execution = true; }
  const n = LiteGraph.createNode('test/number'); n.pos=[0,0]; g.add(n);
  const m = LiteGraph.createNode('test/math'); m.pos=[200,0]; g.add(m);
  const d = LiteGraph.createNode('test/display'); d.pos=[400,0]; g.add(d);
  const t = LiteGraph.createNode('test/timer'); t.pos=[0,200]; g.add(t);
  const d2 = LiteGraph.createNode('test/display'); d2.pos=[400,200]; g.add(d2);
  n.connect(0, m, 0); m.connect(0, d, 0); t.connect(0, d2, 0);
  return g;
}

console.log('=== 经典模式（无优化）===');
const g1 = buildGraph(false);
for (let i = 0; i < 5; i++) g1.runStep(1, true);
console.log(`  5 帧后: Number=${numberExecCount}, Math=${mathExecCount}, Display=${displayExecCount}, Timer=${timerExecCount}`);
console.log(`  预期: 全部 = 5（每帧都重算）`);

console.log('\n=== 优化模式（5 策略融合）===');
const g2 = buildGraph(true);
for (let i = 0; i < 5; i++) g2.runStep(1, true);
console.log(`  5 帧后: Number=${numberExecCount}, Math=${mathExecCount}, Display=${displayExecCount}, Timer=${timerExecCount}`);
console.log(`  预期: Number=1, Math=1, Timer=5, Display=1+5=6 (静态Display只1次, Timer的Display每帧)`);

const pass = (numberExecCount === 1 && mathExecCount === 1 && timerExecCount === 5 && displayExecCount === 6);
console.log(`\n${pass ? '✅ 优化生效：静态分支(Number->Math->Display1)只执行 1 次，重复计算消除 80%' : '❌ 优化未达预期'}`);

console.log('\n=== 属性变更触发下游重算（策略1 reactive dirty）===');
const beforeMath = mathExecCount;
const beforeDisplay = displayExecCount;
g2._nodes[0].setProperty('value', 100);
g2.runStep(1, true);
const dMath = mathExecCount - beforeMath;
const dDisplay = displayExecCount - beforeDisplay;
console.log(`  改 Number.value=100 后 1 帧: Math +${dMath}, Display +${dDisplay}`);
console.log(`  预期: Math +1 (重算), Display +2 (静态Display重算 + Timer的Display正常)`);
const pass2 = (dMath === 1 && dDisplay === 2);
console.log(`${pass2 ? '✅ 属性变更正确触发下游重算' : '❌ 属性变更未达预期'}`);

console.log('\n=== 策略2 runTarget 惰性执行 ===');
const g3 = buildGraph(true);
// 清零后只跑 runTarget(d2) —— 只应执行 Timer 链，不执行 Number/Math 链
numberExecCount = mathExecCount = displayExecCount = timerExecCount = 0;
g3.runTarget(g3._nodes[4]); // d2 (Timer的Display)
console.log(`  runTarget(d2): Number=${numberExecCount}, Math=${mathExecCount}, Timer=${timerExecCount}, Display=${displayExecCount}`);
console.log(`  预期: Number=0, Math=0, Timer=1, Display=1 (只算 Timer->d2 链)`);
const pass3 = (numberExecCount === 0 && mathExecCount === 0 && timerExecCount === 1 && displayExecCount === 1);
console.log(`${pass3 ? '✅ 策略2 runTarget 生效：只执行目标链路' : '❌ runTarget 未达预期'}`);

console.log('\n=== 策略3 WeakMap cache ===');
console.log(`  graph._cacheStore 类型: ${g3._cacheStore && g3._cacheStore.constructor && g3._cacheStore.constructor.name}`);
const pass4 = (g3._cacheStore && g3._cacheStore.constructor && g3._cacheStore.constructor.name === 'WeakMap');
console.log(`${pass4 ? '✅ 策略3 WeakMap cache 生效' : '❌ WeakMap 未生效'}`);

console.log('\n=== 策略4 topology + adjacency ===');
console.log(`  graph._downstreamAdjacency 类型: ${g3._downstreamAdjacency && g3._downstreamAdjacency.constructor && g3._downstreamAdjacency.constructor.name}`);
console.log(`  adjacency 条目数: ${g3._downstreamAdjacency ? g3._downstreamAdjacency.size : 0} (预期 5 个节点)`);
const pass5 = (g3._downstreamAdjacency && g3._downstreamAdjacency.size === 5);
console.log(`${pass5 ? '✅ 策略4 topology+adjacency 生效' : '❌ adjacency 未生效'}`);

const allPass = pass && pass2 && pass3 && pass4 && pass5;
console.log(`\n${allPass ? '✅✅✅ 全部 5 策略 + 减少重复计算 + 接口兼容 都 OK' : '❌ 有失败项'}`);
process.exit(allPass ? 0 : 1);
