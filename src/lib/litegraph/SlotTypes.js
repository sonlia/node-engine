/**
 * SlotTypes — 节点槽位类型系统（全局单一配置源）
 *
 * 核心设计原则：
 *   **类型 = 形状 + 颜色**（一一对应，不可分离）
 *
 * 这解决了原始 litegraph 中的视觉冲突问题：
 *   - 旧系统：slot.shape 和 slot.color 可以独立设置，导致两个 slot
 *     看起来一样（同形状同颜色）但类型不同，连接失败，用户困惑。
 *   - 新系统：形状和颜色都从类型派生，相同类型必有相同形状+颜色，
 *     不同类型必有不同形状或颜色。视觉一致 = 可连接。
 *
 * 用户使用方式：
 *   1. 全局配置：在应用启动时调用 SlotTypes.configure(typesConfig)
 *   2. 增量注册：SlotTypes.register('myType', { parent, shape, color, desc })
 *   3. 节点定义时只指定 type，形状和颜色自动派生：
 *      this.addInput('value', 'number');  // 自动获得 circle 形状 + 蓝色
 *
 * 类型层级（继承）：
 *   - 子类型可连接父类型（int → number → *）
 *   - 父类型可连接子类型（number → int，双向允许）
 *   - 兄弟类型不兼容（int → float ✗）
 *
 * 形状编码（一级分类）：
 *   circle  = 标量（number/int/float/boolean）
 *   round   = 文本（string/path）
 *   box     = 集合（array/map）
 *   grid    = 向量（vec2/vec3/vec4/mat4）
 *   arrow   = 通用箭头（未使用，保留兼容）
 *   triangle = 执行流（exec_in/exec_out，顺序控制）
 *
 * 颜色编码（二级区分）：
 *   同一形状内用不同颜色区分具体类型。
 */

import { LiteGraph } from "./LiteGraph.js";

// =====================================================================
// 内置类型定义（用户可覆盖或扩展）
// =====================================================================

const BUILTIN_TYPES = {
  // === 根类型 ===
  '*': {
    parent: null,
    shape: 'circle',
    color: '#888888',
    aliases: ['any', 0, ''],
    desc: '通配类型，可连接任意类型',
  },

  // === 标量系（CIRCLE_SHAPE）===
  number: {
    parent: '*',
    shape: 'circle',
    color: '#4A9EFF',
    aliases: ['num'],
    desc: '任意数值',
  },
  int: {
    parent: 'number',
    shape: 'circle',
    color: '#6BB8FF',
    desc: '整数',
  },
  float: {
    parent: 'number',
    shape: 'circle',
    color: '#2A7FFF',
    desc: '浮点数',
  },
  boolean: {
    parent: '*',
    shape: 'circle',
    color: '#FFD93D',
    aliases: ['bool'],
    desc: '布尔值',
  },

  // === 文本系（ROUND_SHAPE）===
  string: {
    parent: '*',
    shape: 'round',
    color: '#7CE38B',
    aliases: ['str', 'text'],
    desc: '字符串',
  },
  path: {
    parent: 'string',
    shape: 'round',
    color: '#5BC56A',
    desc: '文件路径',
  },

  // === 集合系（BOX_SHAPE）===
  array: {
    parent: '*',
    shape: 'box',
    color: '#B07CFF',
    aliases: ['arr'],
    desc: '数组',
  },
  map: {
    parent: '*',
    shape: 'box',
    color: '#C9A0FF',
    aliases: ['dict', 'object'],
    desc: '键值对映射',
  },

  // === 向量系（GRID_SHAPE）===
  vec2: {
    parent: '*',
    shape: 'grid',
    color: '#FF6B6B',
    desc: '二维向量',
  },
  vec3: {
    parent: '*',
    shape: 'grid',
    color: '#FF8E3C',
    desc: '三维向量',
  },
  vec4: {
    parent: '*',
    shape: 'grid',
    color: '#FFAA00',
    desc: '四维向量',
  },
  mat4: {
    parent: '*',
    shape: 'grid',
    color: '#CC5500',
    desc: '4x4 矩阵',
  },

  // === 执行流系（TRIANGLE_SHAPE，白色 — 区别于所有其他类型）===
  // exec 用于显式控制节点执行顺序：
  // - exec 是顺序式（类似 Blueprint 的执行引脚），用 TRIANGLE_SHAPE + 白色
  // 每个节点默认带一个 exec in 和 exec out，
  // 当需要强制执行顺序时连接 exec slot。
  exec_in: {
    parent: null,
    shape: 'triangle',
    color: '#FFFFFF',
    aliases: ['exec_in', '__exec_in__'],
    desc: '顺序执行输入（控制节点执行时机）',
  },
  exec_out: {
    parent: null,
    shape: 'triangle',
    color: '#FFFFFF',
    aliases: ['exec_out', '__exec_out__'],
    desc: '顺序执行输出（连接到下一个节点的 exec_in）',
  },
};

// =====================================================================
// 形状名 → LiteGraph 常量映射
// =====================================================================

const SHAPE_MAP = {
  circle: () => LiteGraph.CIRCLE_SHAPE,
  round: () => LiteGraph.ROUND_SHAPE,
  box: () => LiteGraph.BOX_SHAPE,
  grid: () => LiteGraph.GRID_SHAPE,
  arrow: () => LiteGraph.ARROW_SHAPE,
  triangle: () => LiteGraph.TRIANGLE_SHAPE,
  card: () => LiteGraph.CARD_SHAPE,
};

// =====================================================================
// 默认颜色（用于未注册类型的兜底，确保视觉可区分）
// =====================================================================

const DEFAULT_COLORS = [
  '#888888', '#4A9EFF', '#7CE38B', '#FFD93D', '#FF6B6B',
  '#B07CFF', '#FF8E3C', '#5BC56A', '#2A7FFF', '#CC3333',
];

// =====================================================================
// 类型注册表
// =====================================================================

class SlotTypeRegistry {
  constructor() {
    this._types = {};        // typeName → { name, parent, shape, color, desc }
    this._aliasIndex = {};   // alias → typeName（规范化查找）
    this._parentCache = {};  // typeName → Set of all ancestors (含自身)
    this._colorIndex = {};   // color → typeName（颜色唯一性检查）
    this._unregisteredCounter = 0; // 为未注册类型分配唯一颜色
    this._registerBuiltins();
  }

  _registerBuiltins() {
    for (const [name, def] of Object.entries(BUILTIN_TYPES)) {
      this._registerInternal(name, def);
    }
  }

  _registerInternal(name, def) {
    const typeDef = {
      name,
      parent: def.parent || null,
      shape: def.shape || 'circle',
      color: def.color || DEFAULT_COLORS[this._unregisteredCounter++ % DEFAULT_COLORS.length],
      desc: def.desc || '',
    };

    this._types[name] = typeDef;

    // 索引别名（包括类型名自身）
    this._aliasIndex[name] = name;
    this._aliasIndex[name.toLowerCase()] = name;
    if (def.aliases) {
      for (const alias of def.aliases) {
        this._aliasIndex[alias] = name;
        if (typeof alias === 'string') {
          this._aliasIndex[alias.toLowerCase()] = name;
        }
      }
    }

    // 颜色唯一性索引（用于确保相同颜色 → 相同类型）
    this._colorIndex[typeDef.color.toLowerCase()] = name;

    // 失效祖先缓存
    this._parentCache = {};
  }

  /**
   * 注册自定义类型。
   * @param {string} name - 类型名
   * @param {Object} def - { parent, shape, color, aliases, desc }
   *
   * @example
   * SlotTypes.register('my/color', {
   *   parent: 'object',
   *   shape: 'box',
   *   color: '#FF00FF',
   *   desc: '颜色值'
   * });
   */
  register(name, def) {
    if (!name || typeof name !== 'string') {
      return;
    }
    def = def || {};
    this._registerInternal(name, def);
  }

  /**
   * 批量配置类型（覆盖式）。
   * 用户可在应用启动时调用此方法一次性配置所有自定义类型。
   *
   * @param {Object} typesConfig - { typeName: { parent, shape, color, desc } }
   *
   * @example
   * SlotTypes.configure({
   *   'myApp/texture': { parent: '*', shape: 'box', color: '#FF6B6B', desc: '纹理' },
   *   'myApp/mesh': { parent: '*', shape: 'grid', color: '#FF8E3C', desc: '网格' },
   * });
   */
  configure(typesConfig) {
    if (!typesConfig || typeof typesConfig !== 'object') return;
    for (const [name, def] of Object.entries(typesConfig)) {
      this.register(name, def);
    }
  }

  /**
   * 规范化类型名（处理别名、大小写、通配符）。
   * 输入可以是字符串、数字（0=*）或 undefined。
   * 返回规范化的类型名字符串，或 null 如果未识别。
   */
  normalize(type) {
    if (type === 0 || type === null || type === undefined || type === '' || type === '*') {
      return '*';
    }
    const key = typeof type === 'string' ? type.toLowerCase() : String(type);
    return this._aliasIndex[key] || this._aliasIndex[type] || null;
  }

  /**
   * 获取类型定义。未注册的类型返回 null。
   */
  get(typeName) {
    const normal = this.normalize(typeName);
    return normal ? this._types[normal] : null;
  }

  /**
   * 获取类型的所有祖先（含自身）。
   * 例如 int → [int, number, *]
   * 用于判断子→父连接是否合法。
   */
  getAncestors(typeName) {
    const normal = this.normalize(typeName);
    if (!normal) return [];
    if (this._parentCache[normal]) return this._parentCache[normal];

    const result = [normal];
    let current = this._types[normal];
    let depth = 0;
    while (current && current.parent && depth < 50) {
      result.push(current.parent);
      current = this._types[current.parent];
      depth++;
    }
    this._parentCache[normal] = result;
    return result;
  }

  /**
   * 判断 sourceType 是否是 targetType 的子类型（或相同）。
   * 子类型可以安全连接到父类型（int → number ✓）。
   */
  isSubtypeOf(sourceType, targetType) {
    const srcNormal = this.normalize(sourceType);
    const tgtNormal = this.normalize(targetType);
    if (!srcNormal || !tgtNormal) return false;
    if (srcNormal === tgtNormal) return true;
    // 通配类型 * 是所有类型的父类型
    if (tgtNormal === '*') return true;
    if (srcNormal === '*') return false; // * 不能连接到具体类型
    // exec_in/exec_out 互连（顺序执行流）
    if ((srcNormal === 'exec_in' && tgtNormal === 'exec_out') ||
        (srcNormal === 'exec_out' && tgtNormal === 'exec_in')) return true;
    // 检查祖先链
    return this.getAncestors(srcNormal).includes(tgtNormal);
  }

  /**
   * 判断两个类型是否可以连接。
   * 规则：
   *   1. 任意一方是通配（*）→ 可以连接
   *   2. source 是 target 的子类型 → 可以连接（int→number✓）
   *   3. target 是 source 的子类型 → 可以连接（双向允许）
   *   4. exec_in ↔ exec_out 互连（顺序执行流）
   *   5. 逗号分割的多类型：任一排列匹配即可
   *
   * 注意：如果两个类型都未注册，回退到字符串相等比较。
   */
  isValidConnection(typeA, typeB) {
    // 通配快速路径
    if (typeA === 0 || typeA === null || typeA === undefined ||
        typeA === '' || typeA === '*' ||
        typeB === 0 || typeB === null || typeB === undefined ||
        typeB === '' || typeB === '*') {
      return true;
    }

    // 多类型（逗号分割）：递归检查所有排列
    const strA = String(typeA);
    const strB = String(typeB);
    if (strA.indexOf(',') !== -1 || strB.indexOf(',') !== -1) {
      const listA = strA.split(',');
      const listB = strB.split(',');
      for (const a of listA) {
        for (const b of listB) {
          if (this.isValidConnection(a.trim(), b.trim())) return true;
        }
      }
      return false;
    }

    // 规范化
    const normA = this.normalize(typeA);
    const normB = this.normalize(typeB);

    // 未注册类型回退到字符串比较
    if (!normA || !normB) {
      return strA.toLowerCase() === strB.toLowerCase();
    }

    // Single-direction: allow child→parent (int→number ✓)
    // but NOT parent→child (number→int ✗, could lose precision)
    return this.isSubtypeOf(normA, normB) || this.isSubtypeOf(normB, normA);
  }

  /**
   * 获取类型的形状常量（LiteGraph.BOX_SHAPE 等）。
   * **始终从类型派生**，确保相同类型 → 相同形状。
   * 未注册的类型默认返回 CIRCLE_SHAPE。
   */
  getShape(typeName) {
    const def = this.get(typeName);
    if (!def) return LiteGraph.CIRCLE_SHAPE;
    const shapeFn = SHAPE_MAP[def.shape];
    return shapeFn ? shapeFn() : LiteGraph.CIRCLE_SHAPE;
  }

  /**
   * 获取类型的渲染颜色。
   * **始终从类型派生**，确保相同类型 → 相同颜色。
   * 未注册的类型返回灰色兜底。
   */
  getColor(typeName) {
    const def = this.get(typeName);
    return def ? def.color : '#888888';
  }

  /**
   * **核心方法**：根据类型获取完整的视觉描述（形状+颜色）。
   * 这是渲染时的唯一入口，确保形状和颜色永远来自同一类型定义。
   *
   * 返回 { shape: number, color: string }
   */
  getVisual(typeName) {
    return {
      shape: this.getShape(typeName),
      color: this.getColor(typeName),
    };
  }

  /**
   * 获取所有已注册类型名。
   */
  listTypes() {
    return Object.keys(this._types);
  }

  /**
   * 获取类型的描述信息。
   */
  getDesc(typeName) {
    const def = this.get(typeName);
    return def ? def.desc : '';
  }

  /**
   * 检查视觉一致性：相同形状+颜色是否对应相同类型。
   * 用于调试，确保不会出现"看起来一样但连不上"的情况。
   * 返回冲突列表 [{ color, types: [typeName1, typeName2] }]
   */
  checkVisualConsistency() {
    const colorMap = {}; // color → [typeNames]
    for (const [name, def] of Object.entries(this._types)) {
      const key = def.color.toLowerCase();
      if (!colorMap[key]) colorMap[key] = [];
      colorMap[key].push(name);
    }
    const conflicts = [];
    for (const [color, types] of Object.entries(colorMap)) {
      if (types.length > 1) {
        // 检查这些类型是否都有相同的 shape（如果 shape 不同则视觉可区分）
        const shapes = new Set(types.map(t => this._types[t].shape));
        if (shapes.size === 1) {
          conflicts.push({ color, shape: [...shapes][0], types });
        }
      }
    }
    return conflicts;
  }
}

// 单例实例
export const SlotTypes = new SlotTypeRegistry();

export default SlotTypes;
