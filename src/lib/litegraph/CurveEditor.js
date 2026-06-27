/**
 * CurveEditor - A simple curve editor for widget-based curve editing.
 *
 * Refactored from the original IIFE-style constructor + prototype to an ES6
 * class. Original was attached to LiteGraph as `LiteGraph.CurveEditor`.
 * Used by some widgets (e.g. curve widget) to render an editable curve
 * with draggable points.
 *
 * NOTE: the original used `vec2.distance(pos, p2)` from an external
 * gl-matrix-style global. We compute the distance inline to avoid that
 * external dependency — mathematically identical.
 */

/**
 * Sample the curve at position f (0..1) using linear interpolation between
 * the given control points. Each point is `[x, y]` with both in 0..1 range.
 * Returns 0 if points is null or f is beyond the last point.
 */
export function sampleCurve(f, points) {
  if (!points) return;
  for (let i = 0; i < points.length - 1; ++i) {
    const p = points[i];
    const pn = points[i + 1];
    if (pn[0] < f) continue;
    const r = pn[0] - p[0];
    if (Math.abs(r) < 0.00001) return p[1];
    const local_f = (f - p[0]) / r;
    return p[1] * (1.0 - local_f) + pn[1] * local_f;
  }
  return 0;
}

class CurveEditor {
  constructor(points) {
    this.points = points;
    this.selected = -1;
    this.nearest = -1;
    this.size = null; // stores last size used
    this.must_update = true;
    this.margin = 5;
  }

  /**
   * Static curve sampler (kept for API parity with the original
   * `CurveEditor.sampleCurve` static method).
   */
  static sampleCurve(f, points) {
    return sampleCurve(f, points);
  }

  /**
   * Draw the curve into the given canvas 2D context.
   * @param {CanvasRenderingContext2D} ctx
   * @param {[number, number]} size - [width, height] of the editor area
   * @param {LGraphCanvas} graphcanvas - used for zoom scale
   * @param {boolean} background_color - if true, draws a dark background
   * @param {string} line_color - stroke color for the curve (default "#666")
   * @param {boolean} inactive - if true, dims the curve (no point markers)
   */
  draw(ctx, size, graphcanvas, background_color, line_color, inactive) {
    const points = this.points;
    if (!points) return;
    this.size = size;
    const w = size[0] - this.margin * 2;
    const h = size[1] - this.margin * 2;

    line_color = line_color || "#666";

    ctx.save();
    ctx.translate(this.margin, this.margin);

    if (background_color) {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#222";
      ctx.fillRect(w * 0.5, 0, 1, h);
      ctx.strokeStyle = "#333";
      ctx.strokeRect(0, 0, w, h);
    }
    ctx.strokeStyle = line_color;
    if (inactive) ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (let i = 0; i < points.length; ++i) {
      const p = points[i];
      ctx.lineTo(p[0] * w, (1.0 - p[1]) * h);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (!inactive) {
      for (let i = 0; i < points.length; ++i) {
        const p = points[i];
        ctx.fillStyle =
          this.selected === i ? "#FFF" : this.nearest === i ? "#DDD" : "#AAA";
        ctx.beginPath();
        ctx.arc(p[0] * w, (1.0 - p[1]) * h, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Mouse-down handler. `localpos` is the mouse position in curve-editor
   * space. Selects a nearby point if one exists within max_dist, otherwise
   * creates a new point at the click location.
   * Returns true if a point is selected (so the caller knows to capture
   * further mouse events).
   */
  onMouseDown(localpos, graphcanvas) {
    const points = this.points;
    if (!points) return;
    if (localpos[1] < 0) return;

    // this.captureInput(true);
    const w = this.size[0] - this.margin * 2;
    const h = this.size[1] - this.margin * 2;
    const x = localpos[0] - this.margin;
    const y = localpos[1] - this.margin;
    const pos = [x, y];
    const max_dist = 30 / graphcanvas.ds.scale;
    // search closer one
    this.selected = this.getCloserPoint(pos, max_dist);
    // create one
    if (this.selected === -1) {
      const point = [x / w, 1 - y / h];
      points.push(point);
      points.sort(function (a, b) {
        return a[0] - b[0];
      });
      this.selected = points.indexOf(point);
      this.must_update = true;
    }
    if (this.selected !== -1) return true;
  }

  /**
   * Mouse-move handler. Drags the currently selected point. Edge points
   * (first/last) only move vertically; interior points dragged outside
   * the editor bounds are deleted.
   */
  onMouseMove(localpos, graphcanvas) {
    const points = this.points;
    if (!points) return;
    const s = this.selected;
    if (s < 0) return;
    const x = (localpos[0] - this.margin) / (this.size[0] - this.margin * 2);
    const y = (localpos[1] - this.margin) / (this.size[1] - this.margin * 2);
    const curvepos = [localpos[0] - this.margin, localpos[1] - this.margin];
    const max_dist = 30 / graphcanvas.ds.scale;
    this._nearest = this.getCloserPoint(curvepos, max_dist);
    const point = points[s];
    if (point) {
      const is_edge_point = s === 0 || s === points.length - 1;
      if (
        !is_edge_point &&
        (localpos[0] < -10 ||
          localpos[0] > this.size[0] + 10 ||
          localpos[1] < -10 ||
          localpos[1] > this.size[1] + 10)
      ) {
        points.splice(s, 1);
        this.selected = -1;
        return;
      }
      if (!is_edge_point) {
        // not edges
        point[0] = clamp(x, 0, 1);
      } else {
        point[0] = s === 0 ? 0 : 1;
      }
      point[1] = 1.0 - clamp(y, 0, 1);
      points.sort(function (a, b) {
        return a[0] - b[0];
      });
      this.selected = points.indexOf(point);
      this.must_update = true;
    }
  }

  /**
   * Mouse-up handler. Clears the current selection.
   */
  onMouseUp(localpos, graphcanvas) {
    this.selected = -1;
    return false;
  }

  /**
   * Find the closest control point to `pos` within `max_dist` (in editor
   * space, before the margin translate). Returns -1 if none found.
   */
  getCloserPoint(pos, max_dist) {
    const points = this.points;
    if (!points) return -1;
    max_dist = max_dist || 30;
    const w = this.size[0] - this.margin * 2;
    const h = this.size[1] - this.margin * 2;
    const num = points.length;
    const p2 = [0, 0];
    let min_dist = 1000000;
    let closest = -1;
    let last_valid = -1;
    for (let i = 0; i < num; ++i) {
      const p = points[i];
      p2[0] = p[0] * w;
      p2[1] = (1.0 - p[1]) * h;
      if (p2[0] < pos[0]) last_valid = i;
      // Inline euclidean distance (original used vec2.distance).
      const dx = pos[0] - p2[0];
      const dy = pos[1] - p2[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > min_dist || dist > max_dist) continue;
      closest = i;
      min_dist = dist;
    }
    return closest;
  }
}

/**
 * Inline clamp helper (matches the global `clamp` used in the original).
 * Kept local to avoid importing from utils.js just for this one call site.
 */
function clamp(v, a, b) {
  return a > v ? a : b < v ? b : v;
}

export { CurveEditor };
export default CurveEditor;
