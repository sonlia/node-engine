// Test that module initialization works correctly without circular dependency errors
// This simulates the module loading that happens when page.tsx imports from index.js

async function test() {
  try {
    // Import from the barrel file (like page.tsx does now)
    const module = await import('../src/lib/litegraph/index.js');
    
    console.log('✅ Module loaded successfully');
    console.log('  LiteGraph:', typeof module.LiteGraph);
    console.log('  LGraph:', typeof module.LGraph);
    console.log('  LGraphNode:', typeof module.LGraphNode);
    console.log('  LGraphCanvas:', typeof module.LGraphCanvas);
    console.log('  pointerListenerAdd:', typeof module.pointerListenerAdd);
    console.log('  pointerListenerRemove:', typeof module.pointerListenerRemove);
    console.log('  _setLiteGraphRef:', typeof module._setLiteGraphRef);
    
    // Verify LiteGraph is properly set up
    console.log('\n✅ LiteGraph.VERSION:', module.LiteGraph.VERSION);
    console.log('✅ LiteGraph.pointerevents_method:', module.LiteGraph.pointerevents_method);
    console.log('✅ LiteGraph.NODE_TITLE_HEIGHT:', module.LiteGraph.NODE_TITLE_HEIGHT);
    
    // Test pointerListenerAdd (this was the function that threw ReferenceError)
    const { pointerListenerAdd, pointerListenerRemove } = module;
    
    // Create a mock element to test event binding
    const mockElement = {
      addEventListener: (event, handler, capture) => {
        console.log(`  ✅ addEventListener called with event: "${event}"`);
      },
      removeEventListener: (event, handler, capture) => {
        console.log(`  ✅ removeEventListener called with event: "${event}"`);
      }
    };
    
    console.log('\nTesting pointerListenerAdd:');
    pointerListenerAdd(mockElement, 'down', () => {});
    pointerListenerAdd(mockElement, 'move', () => {});
    pointerListenerAdd(mockElement, 'up', () => {});
    pointerListenerAdd(mockElement, 'click', () => {}); // Unknown suffix, should pass through
    
    console.log('\nTesting pointerListenerRemove:');
    pointerListenerRemove(mockElement, 'down', () => {});
    
    // Test node registration
    const { LiteGraph, LGraphNode } = module;
    
    class TestNode extends LGraphNode {
      constructor() {
        super('Test');
        this.addOutput('value', 'number');
      }
      onExecute() { this.setOutputData(0, 42); }
    }
    
    LiteGraph.registerNodeType('test/node', TestNode);
    console.log('\n✅ Node registered: test/node');
    
    const created = LiteGraph.createNode('test/node');
    console.log('✅ Node created:', created ? created.title : 'FAILED');
    
    // Test LGraph creation
    const { LGraph } = module;
    const graph = new LGraph();
    console.log('✅ LGraph created');
    
    console.log('\n🎉 All tests passed! No ReferenceError for LiteGraph!');
    
  } catch(e) {
    console.error('❌ Error:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

test();
