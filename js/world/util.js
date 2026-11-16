import * as THREE from '../three.js';

const matCache = new Map();

export function mat(color, opts = {}) {
  const key = JSON.stringify([color, opts]);
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const { unique, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.04, ...rest });
  if (!unique) matCache.set(key, m);
  return m;
}

export function basic(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, ctx, tex };
}

// A flat panel showing a canvas texture (signs, screens, posters).
export function canvasPanel(w, h, pxW, pxH, draw, { emissive = false, intensity = 1 } = {}) {
  const c = makeCanvas(pxW, pxH);
  if (draw) draw(c.ctx, pxW, pxH);
  c.tex.needsUpdate = true;
  const material = emissive
    ? new THREE.MeshBasicMaterial({ map: c.tex, toneMapped: false, color: new THREE.Color(intensity, intensity, intensity) })
    : new THREE.MeshStandardMaterial({ map: c.tex, roughness: 0.6 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.userData.canvas = c;
  return mesh;
}

export function textSprite(text, { size = 48, color = '#e8f6ff', bg = 'rgba(8,16,26,0.78)', font = '600 {s}px "Barlow Condensed", "Arial Narrow", sans-serif', pad = 14, scale = 0.006, border = null } = {}) {
  const f = font.replace('{s}', size);
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = f;
  const tw = Math.ceil(probe.measureText(text).width);
  const w = tw + pad * 2;
  const h = Math.ceil(size * 1.35);
  const c = makeCanvas(w, h);
  const ctx = c.ctx;
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, w, h, h * 0.28);
    ctx.fill();
  }
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 3;
    roundRect(ctx, 1.5, 1.5, w - 3, h - 3, h * 0.28);
    ctx.stroke();
  }
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, h / 2 + 1);
  c.tex.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: c.tex, depthWrite: false, toneMapped: false, transparent: true }));
  sprite.scale.set(w * scale, h * scale, 1);
  sprite.userData.aspect = w / h;
  return sprite;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function angleDamp(current, target, lambda, dt) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-lambda * dt));
}

// Push a circle (x,z,r) out of axis-aligned boxes.
export function resolveCircle(pos, r, colliders) {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const b of colliders) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d);
        pos.z += (dz / d) * (r - d);
      } else {
        // centre inside the box: push out along the shallowest axis
        const pl = pos.x - b.minX, pr = b.maxX - pos.x, pt = pos.z - b.minZ, pb = b.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = b.minX - r;
        else if (m === pr) pos.x = b.maxX + r;
        else if (m === pt) pos.z = b.minZ - r;
        else pos.z = b.maxZ + r;
      }
      moved = true;
    }
    if (!moved) break;
  }
}
