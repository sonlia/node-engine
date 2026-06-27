const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  
  page.on('pageerror', error => {
    consoleErrors.push(`[pageerror] ${error.message}`);
  });
  
  try {
    await page.goto('http://0.0.0.0:3000', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Check if graphCanvas exists
    const graphCanvas = await page.evaluate(() => {
      return window.__graphCanvas ? 'exists' : 'missing';
    });
    console.log('graphCanvas:', graphCanvas);
    
    // Check LiteGraph reference
    const litegraphCheck = await page.evaluate(() => {
      try {
        const gc = window.__graphCanvas;
        if (!gc) return 'no graphCanvas';
        return {
          hasGraph: !!gc.graph,
          hasCanvas: !!gc.canvas,
          hasDs: !!gc.ds,
          nodeCount: gc.graph ? gc.graph._nodes.length : 0,
          eventsBinded: gc._events_binded,
          scale: gc.ds ? gc.ds.scale : 'no ds',
          offset: gc.ds ? Array.from(gc.ds.offset) : 'no ds'
        };
      } catch(e) {
        return 'Error: ' + e.message;
      }
    });
    console.log('LiteGraph state:', JSON.stringify(litegraphCheck, null, 2));
    
    // Try a mouse click on canvas
    const canvas = await page.locator('canvas');
    if (canvas) {
      const box = await canvas.boundingBox();
      if (box) {
        // Click on canvas center
        await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
        await page.waitForTimeout(500);
        
        // Check if dragging_canvas works
        const afterClick = await page.evaluate(() => {
          const gc = window.__graphCanvas;
          if (!gc) return 'no gc';
          return {
            dragging_canvas: gc.dragging_canvas,
            mouse: gc.mouse,
            graph_mouse: gc.graph_mouse,
            last_mouse: gc.last_mouse,
            pointer_is_down: gc.pointer_is_down
          };
        });
        console.log('After click:', JSON.stringify(afterClick, null, 2));
      }
    }
    
    if (consoleErrors.length > 0) {
      console.log('\n--- Console Errors ---');
      consoleErrors.forEach(e => console.log(e));
    } else {
      console.log('\nNo console errors!');
    }
    
  } catch(e) {
    console.error('Test failed:', e.message);
  } finally {
    await browser.close();
  }
})();
