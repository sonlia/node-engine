// 测试 Worker 注册逻辑 + 接口兼容性
global.navigator = { hardwareConcurrency: 4 };
global.crypto = { randomUUID: () => 'id-' + Math.random().toString(36).slice(2) };
global.EventTarget = class { addEventListener(){} removeEventListener(){} dispatchEvent(){return true;} };
global.CustomEvent = class { constructor(type, opts){ this.type=type; this.detail = opts && opts.detail; } };
global.Worker = class {
  constructor(url){ this._onmessage = null; }
  postMessage(msg){
    if (msg.op === 'register') {
      try {
        eval("(" + msg.src + ")");
        setTimeout(() => this._onmessage && this._onmessage({ data: { op: 'registered', type: msg.type } }), 0);
      } catch (e) {
        setTimeout(() => this._onmessage && this._onmessage({ data: { op: 'register_error', type: msg.type, error: e.message } }), 0);
      }
    }
  }
  terminate(){}
  set onmessage(f){ this._onmessage = f; }
};
global.Blob = class { constructor(){} };
global.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };

const lg = require('/tmp/litegraph_bundle.cjs');
const { LiteGraph, LGraph, LGraphNode, WorkerScheduler } = lg;

async function test() {
  const scheduler = new WorkerScheduler({ poolSize: 1 });

  console.log('=== Worker 注册: 匿名函数 ===');
  try { await scheduler.registerHandler('test/anonymous', function (inputs, properties) { return [inputs[0] * 2]; }); console.log('  ✅ 成功'); }
  catch (e) { console.log('  ❌ 失败:', e.message); }

  console.log('=== Worker 注册: 命名函数 ===');
  try { await scheduler.registerHandler('test/named', function heavyCompute(inputs, properties) { return [inputs[0] + 1]; }); console.log('  ✅ 成功'); }
  catch (e) { console.log('  ❌ 失败:', e.message); }

  console.log('=== Worker 注册: 箭头函数 ===');
  try { await scheduler.registerHandler('test/arrow', (inputs, properties) => { return [inputs[0] - 1]; }); console.log('  ✅ 成功'); }
  catch (e) { console.log('  ❌ 失败:', e.message); }

  scheduler.terminate();

  console.log('\n=== 接口兼容性检查 ===');
  const node = new LGraphNode('Test');
  const compat = [
    ['doExecute 方法', typeof node.doExecute === 'function'],
    ['executePendingActions 方法', typeof node.executePendingActions === 'function'],
    ['actionDo 方法', typeof node.actionDo === 'function'],
    ['trigger 方法', typeof node.trigger === 'function'],
    ['triggerSlot 方法', typeof node.triggerSlot === 'function'],
    ['onAfterExecuteNode 方法', typeof node.onAfterExecuteNode === 'function'],
    ['changeMode 方法', typeof node.changeMode === 'function'],
    ['_waiting_actions 初始化', Array.isArray(node._waiting_actions)],
    ['addWidget no-op stub', typeof node.addWidget === 'function'],
    ['LiteGraph.INPUT 常量', LiteGraph.INPUT === 1],
    ['LiteGraph.OUTPUT 常量', LiteGraph.OUTPUT === 2],
    ['LiteGraph.EVENT 常量', LiteGraph.EVENT === -1],
    ['LiteGraph.ACTION 常量', LiteGraph.ACTION === -1],
    ['LiteGraph.ALWAYS 常量', LiteGraph.ALWAYS === 0],
    ['LiteGraph.ON_EVENT 常量', LiteGraph.ON_EVENT === 1],
    ['LiteGraph.NEVER 常量', LiteGraph.NEVER === 2],
    ['LiteGraph.ON_TRIGGER 常量', LiteGraph.ON_TRIGGER === 3],
  ];
  let allPass = true;
  for (const [name, ok] of compat) {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
    if (!ok) allPass = false;
  }
  console.log(allPass ? '\n✅ 接口兼容性全部通过' : '\n❌ 有接口缺失');
}

test().catch(e => { console.error(e); process.exit(1); });
