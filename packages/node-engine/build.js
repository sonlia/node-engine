/**
 * Build script for node-engine npm package.
 * Bundles src/lib/litegraph/index.js into 3 formats:
 *   - ESM (for bundlers: Vite, Webpack, Rollup)
 *   - CommonJS (for Node.js require)
 *   - UMD (for <script> tag / browser global)
 */
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const entry = path.resolve(__dirname, "../../src/lib/litegraph/index.js");
const outdir = path.resolve(__dirname, "dist");

// Ensure dist exists
if (!fs.existsSync(outdir)) fs.mkdirSync(outdir, { recursive: true });

// CSS is no longer needed — canvas styles are inlined in the constructor.
// (user-select, outline, font-family set via canvas.style.*)

async function build() {
  console.log("Building node-engine npm package...");

  // ESM build
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    outfile: path.join(outdir, "node-engine.esm.js"),
    target: "es2020",
    minify: true,
    sourcemap: false,
    logLevel: "info",
  });
  console.log("✅ ESM build done");

  // CommonJS build
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    outfile: path.join(outdir, "node-engine.cjs.js"),
    target: "es2020",
    minify: true,
    sourcemap: false,
    logLevel: "info",
  });
  console.log("✅ CJS build done");

  // UMD build (for browser <script> tag)
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    globalName: "NodeEngine",
    outfile: path.join(outdir, "node-engine.umd.js"),
    target: "es2020",
    minify: true,
    sourcemap: false,
    logLevel: "info",
  });
  console.log("✅ UMD build done");

  // Generate minimal type declarations
  const dts = `/** node-engine type declarations */
export class LGraph extends EventTarget {
  constructor(o?: any);
  runStep(num?: number, do_not_catch_errors?: boolean, limit?: number): void;
  runOnce(do_not_catch_errors?: boolean): void;
  runOptimized(num?: number, do_not_catch_errors?: boolean): void;
  runTarget(targetNode: any, do_not_catch_errors?: boolean): void;
  start(interval?: number): void;
  stop(): void;
  clear(): void;
  add(node: any, skip_compute_order?: boolean): any;
  remove(node: any): void;
  serialize(): any;
  configure(data: any, keep_old?: boolean): void;
  getNodeById(id: any): any;
  connectionChange(node: any, link_info?: any): void;
  rebuildTopology(): void;
  [key: string]: any;
}

export class LGraphNode extends EventTarget {
  constructor(title?: string);
  addInput(name: string, type: any, extra_info?: any): void;
  addOutput(name: string, type: any, extra_info?: any): void;
  removeInput(slot: any): void;
  removeOutput(slot: any): void;
  connect(slot: any, target_node: any, target_slot?: any): any;
  disconnectInput(slot: any): boolean;
  disconnectOutput(slot: any, target_node?: any): boolean;
  setProperty(name: string, value: any): void;
  addProperty(name: string, defaultValue: any, type?: string, extraInfo?: any): any;
  getInputData(slot: number, force_update?: boolean): any;
  setOutputData(slot: number, data: any): void;
  getInputDataType(slot: number): any;
  findInputSlot(name: string, returnObj?: boolean): any;
  findOutputSlot(name: string, returnObj?: boolean): any;
  findInputSlotById(slotId: any): number;
  findOutputSlotById(slotId: any): number;
  findSlotById(slotId: any): { isInput: boolean; index: number; slot: any } | null;
  isInputConnected(slot: number): boolean;
  isOutputConnected(slot: number): boolean;
  serialize(): any;
  configure(info: any): void;
  markDirty(): void;
  isDirty(): boolean;
  clearDirty(): void;
  getCachedOutput(): any;
  storeCachedOutput(): void;
  applyCachedOutput(): void;
  [key: string]: any;
}

export class LGraphCanvas {
  constructor(canvas: any, graph?: any, options?: any);
  resize(width?: number, height?: number): void;
  setDirty(fgcanvas?: boolean, bgcanvas?: boolean): void;
  startRendering(): void;
  stopRendering(): void;
  draw(force_canvas?: boolean, force_bgcanvas?: boolean): void;
  computeVisibleNodes(nodes?: any, out?: any[]): any[];
  isOverNodeBox(node: any, canvasx: number, canvasy: number): boolean;
  isOverNodeInput(node: any, canvasx: number, canvasy: number, slot_pos?: any): number;
  isOverNodeOutput(node: any, canvasx: number, canvasy: number, slot_pos?: any): number;
  [key: string]: any;
}

export class LLink {
  constructor(id?: any, type?: any, origin_id?: any, origin_slot?: any, target_id?: any, target_slot?: any);
  [key: string]: any;
}

export class LGraphGroup {
  constructor(title?: string);
  [key: string]: any;
}

export class DragAndScale {
  constructor(element?: any, options?: any);
  [key: string]: any;
}

export class WorkerScheduler {
  constructor(opts?: any);
  registerHandler(type: string, fn: Function): Promise<void>;
  run(node: any): Promise<any>;
  terminate(): void;
}

export class LiteGraphClass {
  static createNode(type: string): any;
  static registerNodeType(type: string, base_class: any): void;
  static isValidConnection(typeA: any, typeB: any): boolean;
  static [key: string]: any;
}

export const LiteGraph: LiteGraphClass;

export function clamp(v: number, min: number, max: number): number;
export function compareObjects(a: any, b: any): boolean;
export function distance(a: number[], b: number[]): number;
export function colorToString(c: any): string;
export function isInsideRectangle(x: number, y: number, left: number, top: number, width: number, height: number): boolean;
export function growBounding(bounding: number[], x: number, y: number): void;
export function isInsideBounding(bounding: number[], x: number, y: number): boolean;
export function overlapBounding(a: number[], b: number[]): boolean;
export function hex2num(hex: string): number[];
export function num2hex(num: number[]): string;
export function getTime(): number;
export function cloneObject(obj: any, target?: any): any;
export function uuidv4(): string;
export function getParameterNames(func: Function): string[];
export function pointerListenerAdd(elem: any, evname: string, func: any, capture?: boolean): void;
export function pointerListenerRemove(elem: any, evname: string, func: any, capture?: boolean): void;
`;
  fs.writeFileSync(path.join(outdir, "index.d.ts"), dts);
  console.log("✅ Type declarations done");

  // Copy LICENSE and README
  const licenseSrc = path.resolve(__dirname, "../../LICENSE");
  if (fs.existsSync(licenseSrc)) {
    fs.copyFileSync(licenseSrc, path.resolve(__dirname, "LICENSE"));
  }
  const readmeSrc = path.resolve(__dirname, "../../README.md");
  if (fs.existsSync(readmeSrc)) {
    fs.copyFileSync(readmeSrc, path.resolve(__dirname, "README.md"));
  }

  console.log("\n✅ All builds complete. Output in packages/node-engine/dist/");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
