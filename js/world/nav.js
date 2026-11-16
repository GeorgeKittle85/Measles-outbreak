// Grid-based A* pathfinding over the HQ floor, built from the same colliders used for movement.

export class NavGrid {
  constructor(colliders, { minX = -24, maxX = 24, minZ = -18, maxZ = 18, cell = 0.35, radius = 0.36 } = {}) {
    this.minX = minX; this.minZ = minZ; this.cell = cell;
    this.w = Math.ceil((maxX - minX) / cell);
    this.h = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = minX + (i + 0.5) * cell;
        const z = minZ + (j + 0.5) * cell;
        for (const b of colliders) {
          if (x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius) {
            this.blocked[j * this.w + i] = 1;
            break;
          }
        }
      }
    }
  }

  toCell(x, z) {
    return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)];
  }
  toWorld(i, j) {
    return { x: this.minX + (i + 0.5) * this.cell, z: this.minZ + (j + 0.5) * this.cell };
  }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h; }
  open(i, j) { return this.inside(i, j) && !this.blocked[j * this.w + i]; }

  nearestOpen(i, j, maxR = 8) {
    if (this.open(i, j)) return [i, j];
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (this.open(i + di, j + dj)) {
          const d = di * di + dj * dj;
          if (d < bd) { bd = d; best = [i + di, j + dj]; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  findPath(sx, sz, tx, tz) {
    const s = this.nearestOpen(...this.toCell(sx, sz));
    const t = this.nearestOpen(...this.toCell(tx, tz));
    if (!s || !t) return null;
    const W = this.w;
    const start = s[1] * W + s[0];
    const goal = t[1] * W + t[0];
    const g = new Float32Array(W * this.h).fill(Infinity);
    const came = new Int32Array(W * this.h).fill(-1);
    const closed = new Uint8Array(W * this.h);
    const heap = new MinHeap();
    const hfn = (idx) => {
      const dx = Math.abs((idx % W) - t[0]);
      const dz = Math.abs(((idx / W) | 0) - t[1]);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    g[start] = 0;
    heap.push(start, hfn(start));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false;
    let iter = 0;
    while (heap.size && iter++ < 60000) {
      const cur = heap.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % W, cj = (cur / W) | 0;
      for (const [di, dj, cost] of dirs) {
        const ni = ci + di, nj = cj + dj;
        if (!this.open(ni, nj)) continue;
        if (di && dj && (!this.open(ci + di, cj) || !this.open(ci, cj + dj))) continue; // no corner cutting
        const n = nj * W + ni;
        const ng = g[cur] + cost;
        if (ng < g[n]) {
          g[n] = ng;
          came[n] = cur;
          heap.push(n, ng + hfn(n));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map(c => this.toWorld(c % W, (c / W) | 0));
    // string-pull: keep only points needed to preserve line of sight
    const out = [pts[0]];
    let anchor = 0;
    for (let k = 2; k < pts.length; k++) {
      if (!this.lineClear(pts[anchor], pts[k])) {
        out.push(pts[k - 1]);
        anchor = k - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    // end exactly at the requested target if it is reachable
    const last = out[out.length - 1];
    const [ti, tj] = this.toCell(tx, tz);
    if (this.open(ti, tj)) { last.x = tx; last.z = tz; }
    return out;
  }

  lineClear(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / (this.cell * 0.5));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const [i, j] = this.toCell(a.x + dx * t, a.z + dz * t);
      if (!this.open(i, j)) return false;
    }
    return true;
  }
}

class MinHeap {
  constructor() { this.items = []; this.prio = []; }
  get size() { return this.items.length; }
  push(item, p) {
    const a = this.items, pr = this.prio;
    a.push(item); pr.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= pr[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [pr[i], pr[parent]] = [pr[parent], pr[i]];
      i = parent;
    }
  }
  pop() {
    const a = this.items, pr = this.prio;
    const top = a[0];
    const lastI = a.pop(), lastP = pr.pop();
    if (a.length) {
      a[0] = lastI; pr[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && pr[l] < pr[m]) m = l;
        if (r < a.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [pr[i], pr[m]] = [pr[m], pr[i]];
        i = m;
      }
    }
    return top;
  }
}
