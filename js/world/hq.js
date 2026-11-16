// The CDC headquarters building: rooms, walls, props, lighting, signage and interaction stations.
//
// Floor plan (top view, north = -Z):
//   z=-18 ┌──────────────┬───────────────────┬──────────────┐
//         │ VACCINE R&D  │  EMERGENCY OPS    │  LABORATORY  │
//   z=-5  ├─────door─────┴──────glass/door───┴──glass/door──┤
//         │                    CORRIDOR                     │
//   z=5   ├─door─┬─door──┬──── LOBBY ────┬─door──┬──door────┤
//         │ DIR. │ OFFICE│   (entrance)  │ BREAK │  PRESS   │
//   z=18  └──────┴───────┴───────────────┴───────┴──────────┘
//       x=-24  -14     -6               6      14        24
import * as THREE from '../three.js';
import { mat, basic, canvasPanel, textSprite, roundRect } from './util.js';

const WALL_H = 3.1;
const WALL_T = 0.24;

const C = {
  wall: 0xe9edf1,
  wallAccent: 0x1f3a5a,
  corridor: 0xc9cfd6,
  eocFloor: 0x1a222d,
  labFloor: 0xe3eaee,
  vaxFloor: 0xcfe3df,
  wood: 0x7a5a40,
  carpet: 0x55606e,
  lobby: 0xd8d2c8,
  breakFloor: 0xb9b2a6,
  press: 0x3b4656,
  desk: 0xdfe3e8,
  deskDark: 0x2a3340,
  steel: 0xb8c0c8,
  glass: 0x9fd3ff,
};

export const STATIONS = [
  { id: 'eoc', name: 'Emergency Operations Center', short: 'EOC', verb: 'Open the response console', x: 0, z: -8.6, r: 2.4, color: 0x4cc3ff, room: 'eoc' },
  { id: 'lab', name: 'Laboratory', short: 'Lab', verb: 'Open lab projects', x: 12.6, z: -7.4, r: 1.9, color: 0x7fe0ff, room: 'lab' },
  { id: 'vaccine', name: 'Vaccine R&D Wing', short: 'Vaccines', verb: 'Open the vaccine pipeline', x: -11.6, z: -7.4, r: 1.9, color: 0x6fe3a6, room: 'vaccine' },
  { id: 'press', name: 'Press Briefing Room', short: 'Press', verb: 'Step up to the podium', x: 19, z: 14.6, r: 1.8, color: 0xffa36b, room: 'press' },
  { id: 'director', name: "Director's Office", short: 'Director', verb: 'Talk to Dr. Hale', x: -19, z: 12.5, r: 1.9, color: 0xe8c45a, room: 'director' },
  { id: 'office', name: 'Your Office', short: 'Office', verb: 'Use your computer', x: -10, z: 13.3, r: 1.7, color: 0xc7a6ff, room: 'office' },
  { id: 'coffee', name: 'Coffee Machine', short: 'Coffee', verb: 'Grab a coffee', x: 12.6, z: 15, r: 1.3, color: 0xd08a5a, room: 'break', minor: true },
  { id: 'jersey', name: 'Framed #85 Jersey', short: '#85', verb: 'Admire the jersey', x: -7.1, z: 9.2, r: 1.2, color: 0xd4af37, room: 'office', minor: true },
];

export const ROOMS = {
  eoc: { name: 'Emergency Operations Center', minX: -9, maxX: 9, minZ: -18, maxZ: -5 },
  lab: { name: 'Laboratory · BSL-3', minX: 9, maxX: 24, minZ: -18, maxZ: -5 },
  vaccine: { name: 'Vaccine R&D Wing', minX: -24, maxX: -9, minZ: -18, maxZ: -5 },
  corridor: { name: 'Main Corridor', minX: -24, maxX: 24, minZ: -5, maxZ: 5 },
  director: { name: "Director's Office", minX: -24, maxX: -14, minZ: 5, maxZ: 18 },
  office: { name: 'Your Office', minX: -14, maxX: -6, minZ: 5, maxZ: 18 },
  lobby: { name: 'Lobby', minX: -6, maxX: 6, minZ: 5, maxZ: 18 },
  break: { name: 'Break Room', minX: 6, maxX: 14, minZ: 5, maxZ: 18 },
  press: { name: 'Press Briefing Room', minX: 14, maxX: 24, minZ: 5, maxZ: 18 },
};

export function roomAt(x, z) {
  for (const [id, r] of Object.entries(ROOMS)) {
    if (id === 'corridor') continue;
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return id;
  }
  return 'corridor';
}

export class HQ {
  constructor(scene, { shadows = true } = {}) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.colliders = [];
    this.walls = [];
    this.screens = {};
    this.npcSpots = [];
    this.wanderPoints = [];
    this.animated = [];
    this.alertLights = [];
    this.stationMarkers = {};
    this.shadows = shadows;

    this.buildEnvironment();
    this.buildShell();
    this.buildEOC();
    this.buildLab();
    this.buildVaccine();
    this.buildDirector();
    this.buildOffice();
    this.buildLobby();
    this.buildBreak();
    this.buildPress();
    this.buildCorridor();
    this.buildStations();
  }

  // ---------- primitives ----------
  box(w, h, d, x, y, z, material, { collide = false, cast = true, receive = true, parent = this.root, ry = 0 } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast && this.shadows;
    m.receiveShadow = receive && this.shadows;
    parent.add(m);
    if (collide) {
      const rw = Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d;
      const rd = Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d;
      this.colliders.push({ minX: x - rw / 2, maxX: x + rw / 2, minZ: z - rd / 2, maxZ: z + rd / 2 });
    }
    return m;
  }

  cyl(rt, rb, h, x, y, z, material, { seg = 20, collide = false, cast = true } = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
    m.position.set(x, y, z);
    m.castShadow = cast && this.shadows;
    m.receiveShadow = this.shadows;
    this.root.add(m);
    if (collide) {
      const r = Math.max(rt, rb);
      this.colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
    }
    return m;
  }

  floor(minX, maxX, minZ, maxZ, color, y = 0.006, opts = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), mat(color, { roughness: opts.roughness ?? 0.55, metalness: opts.metalness ?? 0.02 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2);
    m.receiveShadow = this.shadows;
    m.userData.floor = true;
    this.root.add(m);
    return m;
  }

  wall(x1, z1, x2, z2, { glass = false, h = WALL_H, color = C.wall } = {}) {
    const horiz = z1 === z2;
    const len = horiz ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const w = horiz ? len : WALL_T;
    const d = horiz ? WALL_T : len;
    if (glass) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.1, d * 0.4),
        new THREE.MeshStandardMaterial({ color: C.glass, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false }));
      g.position.set(cx, h / 2, cz);
      this.root.add(g);
      // frame: base, top rail and mullions
      const frameMat = mat(0x3a4552, { metalness: 0.5, roughness: 0.4 });
      this.box(w + (horiz ? 0 : 0.02), 0.12, d + (horiz ? 0.02 : 0), cx, 0.06, cz, frameMat, { cast: false });
      this.box(w, 0.1, d, cx, h - 0.05, cz, frameMat, { cast: false });
      const n = Math.max(1, Math.round(len / 2.2));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const mx = horiz ? x1 + (x2 - x1) * t : cx;
        const mz = horiz ? cz : z1 + (z2 - z1) * t;
        this.box(0.07, h, 0.07, mx, h / 2, mz, frameMat, { cast: false });
      }
      this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      return g;
    }
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }));
    m.position.set(cx, h / 2, cz);
    m.castShadow = this.shadows;
    m.receiveShadow = this.shadows;
    this.root.add(m);
    this.walls.push(m);
    // navy accent stripe at the top
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.16, d + 0.01), mat(C.wallAccent));
    stripe.position.set(cx, h - 0.08, cz);
    this.root.add(stripe);
    m.userData.stripe = stripe;
    // baseboard
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02), mat(0x5b6673));
    base.position.set(cx, 0.06, cz);
    this.root.add(base);
    this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return m;
  }

  sign(text, x, z, ry, { sub = '', color = '#ffffff', bg = '#1f3a5a', w = 3.2, y = 2.62 } = {}) {
    const panel = canvasPanel(w, 0.46, 640, 92, (ctx, W, H) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, H - 6, W, 6);
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      fitText(ctx, text.toUpperCase(), W / 2, sub ? 36 : H / 2, W - 30, 44, '700 {s}px "Barlow Condensed", "Arial Narrow", sans-serif');
      if (sub) {
        ctx.font = '500 22px "Public Sans", Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(sub, W / 2, 72);
      }
    }, { emissive: true, intensity: 0.95 });
    panel.position.set(x, y, z);
    panel.rotation.y = ry;
    this.root.add(panel);
    return panel;
  }

  screen(key, w, h, pxW, pxH, x, y, z, ry) {
    const panel = canvasPanel(w, h, pxW, pxH, (ctx, W, H) => { ctx.fillStyle = '#04080d'; ctx.fillRect(0, 0, W, H); }, { emissive: true, intensity: 1.0 });
    panel.position.set(x, y, z);
    panel.rotation.y = ry;
    // bezel
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.06), mat(0x0d1117, { roughness: 0.4 }));
    bezel.position.set(0, 0, -0.035);
    panel.add(bezel);
    this.root.add(panel);
    this.screens[key] = panel.userData.canvas;
    return panel;
  }

  plant(x, z, s = 1) {
    this.cyl(0.28 * s, 0.22 * s, 0.5 * s, x, 0.25 * s, z, mat(0xd9d4cc), { collide: true });
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * s, 1), mat(0x3f7d4f, { flatShading: true, roughness: 0.9 }));
    leaves.position.set(x, 0.5 * s + 0.5 * s, z);
    leaves.scale.set(1, 1.25, 1);
    leaves.castShadow = this.shadows;
    this.root.add(leaves);
  }

  chair(x, z, ry, color = 0x2b3440) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const cm = mat(color);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.48), cm);
    seat.position.set(0, 0.46, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.07), cm);
    back.position.set(0, 0.76, -0.24);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), mat(0x6a737d, { metalness: 0.6 }));
    post.position.set(0, 0.22, 0);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 12), mat(0x3a424c));
    foot.position.set(0, 0.02, 0);
    for (const m of [seat, back, post, foot]) { m.castShadow = this.shadows; g.add(m); }
    this.root.add(g);
    return g;
  }

  desk(x, z, w, d, ry = 0, { color = C.desk, monitors = 1, monitorColor = 0x4cc3ff } = {}) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), mat(color, { roughness: 0.5 }));
    top.position.y = 0.74;
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, d * 0.9), mat(0x59636e));
    leg1.position.set(-w / 2 + 0.06, 0.36, 0);
    const leg2 = leg1.clone();
    leg2.position.x = w / 2 - 0.06;
    const modesty = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.4, 0.04), mat(0x59636e));
    modesty.position.set(0, 0.5, d / 2 - 0.08);
    for (const m of [top, leg1, leg2, modesty]) { m.castShadow = this.shadows; m.receiveShadow = this.shadows; g.add(m); }
    for (let i = 0; i < monitors; i++) {
      const off = monitors === 1 ? 0 : (i - (monitors - 1) / 2) * 0.62;
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.36, 0.04), mat(0x111820));
      mon.position.set(off, 1.05, d / 2 - 0.18);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.53, 0.31), basic(monitorColor, { toneMapped: false }));
      scr.position.set(0, 0, -0.022);
      scr.rotation.y = Math.PI;
      mon.add(scr);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), mat(0x333b44));
      stand.position.set(off, 0.86, d / 2 - 0.16);
      g.add(mon, stand);
      this.animated.push({ type: 'monitor', mesh: scr, phase: Math.random() * 6, base: new THREE.Color(monitorColor) });
    }
    this.root.add(g);
    const rw = Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d;
    const rd = Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d;
    this.colliders.push({ minX: x - rw / 2, maxX: x + rw / 2, minZ: z - rd / 2, maxZ: z + rd / 2 });
    return g;
  }

  // ---------- environment ----------
  buildEnvironment() {
    const scene = this.scene;
    scene.background = new THREE.Color(0x9fc3e3);
    scene.fog = new THREE.Fog(0x9fc3e3, 70, 160);

    const hemi = new THREE.HemisphereLight(0xeaf3ff, 0x4a4f58, 1.25);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3df, 2.0);
    sun.position.set(22, 38, 18);
    sun.target.position.set(0, 0, 0);
    if (this.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const s = sun.shadow.camera;
      s.left = -32; s.right = 32; s.top = 26; s.bottom = -26; s.near = 5; s.far = 90;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.02;
    }
    scene.add(sun, sun.target);
    this.sun = sun;

    // grounds
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), mat(0x6c8f57, { roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.04;
    grass.receiveShadow = this.shadows;
    this.root.add(grass);
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), mat(0xbdb8ae, { roughness: 0.95 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, -0.02, 25);
    plaza.receiveShadow = this.shadows;
    this.root.add(plaza);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(5, 30), mat(0xc9c4ba, { roughness: 0.95 }));
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(0, -0.015, 45);
    this.root.add(walk);
    // trees around the campus
    const rnd = mulberry(7);
    for (let i = 0; i < 46; i++) {
      const ang = rnd() * Math.PI * 2;
      const dist = 34 + rnd() * 40;
      const x = Math.cos(ang) * dist * 1.1;
      const z = Math.sin(ang) * dist;
      if (Math.abs(x) < 9 && z > 18) continue;
      this.tree(x, z, 0.8 + rnd() * 0.7);
    }
    for (const x of [-12, -7, 7, 12]) this.tree(x, 27, 0.8);
    // flagpole with a plain banner
    this.cyl(0.06, 0.08, 9, 6, 4.5, 23, mat(0xcfd6dd, { metalness: 0.7 }));
    const banner = canvasPanel(2.2, 1.3, 220, 130, (ctx, W, H) => {
      for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#b22234'; ctx.fillRect(0, (i * H) / 7, W, H / 7 + 1); }
      ctx.fillStyle = '#3c3b6e'; ctx.fillRect(0, 0, W * 0.42, H * 0.57);
    });
    banner.position.set(7.15, 8.0, 23);
    banner.material.side = THREE.DoubleSide;
    this.root.add(banner);
    this.animated.push({ type: 'flag', mesh: banner });
    // campus sign
    const campus = canvasPanel(6, 1.1, 900, 165, (ctx, W, H) => {
      ctx.fillStyle = '#e9e5dc'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1f3a5a'; ctx.font = '700 64px "Barlow Condensed", Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CENTERS FOR DISEASE CONTROL', W / 2, 62);
      ctx.font = '500 34px "Public Sans", Arial, sans-serif';
      ctx.fillText('Emergency Response Headquarters · Atlanta, GA', W / 2, 126);
    });
    campus.position.set(-8, 0.9, 30.5);
    this.root.add(campus);
    this.box(6.3, 1.4, 0.4, -8, 0.7, 30.3, mat(0x8d8a83), { cast: true });
    campus.position.z = 30.52;
    campus.position.y = 0.8;
  }

  tree(x, z, s) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 2.2 * s, 8), mat(0x6b4a33));
    trunk.position.set(x, 1.1 * s, z);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7 * s, 1), mat(0x4f7f3f, { flatShading: true, roughness: 1 }));
    crown.position.set(x, 3.2 * s, z);
    trunk.castShadow = crown.castShadow = this.shadows;
    this.root.add(trunk, crown);
  }

  // ---------- shell ----------
  buildShell() {
    // base slab & floors
    const slab = new THREE.Mesh(new THREE.BoxGeometry(48.6, 0.2, 36.6), mat(0x8e959c));
    slab.position.set(0, -0.1, 0);
    slab.receiveShadow = this.shadows;
    this.root.add(slab);
    this.floor(-24, 24, -18, 18, C.corridor, 0.002, { roughness: 0.35 });
    this.floor(-9, 9, -18, -5, C.eocFloor, 0.008, { roughness: 0.5 });
    this.floor(9, 24, -18, -5, C.labFloor, 0.008, { roughness: 0.3 });
    this.floor(-24, -9, -18, -5, C.vaxFloor, 0.008, { roughness: 0.35 });
    this.floor(-24, -14, 5, 18, C.wood, 0.008, { roughness: 0.6 });
    this.floor(-14, -6, 5, 18, C.carpet, 0.008, { roughness: 0.95 });
    this.floor(-6, 6, 5, 18, C.lobby, 0.008, { roughness: 0.25 });
    this.floor(6, 14, 5, 18, C.breakFloor, 0.008, { roughness: 0.7 });
    this.floor(14, 24, 5, 18, C.press, 0.008, { roughness: 0.9 });
    // corridor runner
    this.floor(-23, 23, -1.1, 1.1, 0x9aa6b3, 0.01, { roughness: 0.9 });

    // perimeter
    this.wall(-24, -18, 24, -18);
    this.wall(-24, -18, -24, 18);
    this.wall(24, -18, 24, 18);
    this.wall(-24, 18, -2, 18);
    this.wall(2, 18, 24, 18);
    this.wall(-2, 18, 2, 18, { glass: true });

    // corridor north side (z = -5)
    this.wall(-24, -5, -17.8, -5);
    this.wall(-15.2, -5, -9, -5);
    this.wall(-9, -5, -2, -5, { glass: true });
    this.wall(2, -5, 9, -5, { glass: true });
    this.wall(9, -5, 15.2, -5, { glass: true });
    this.wall(17.8, -5, 24, -5);
    // north room dividers
    this.wall(-9, -18, -9, -5);
    this.wall(9, -18, 9, -5);

    // corridor south side (z = 5)
    this.wall(-24, 5, -20.3, 5);
    this.wall(-17.7, 5, -14, 5);
    this.wall(-14, 5, -11.3, 5);
    this.wall(-8.7, 5, -6, 5);
    this.wall(6, 5, 8.7, 5);
    this.wall(11.3, 5, 14, 5);
    this.wall(14, 5, 17.7, 5);
    this.wall(20.3, 5, 24, 5);
    // south room dividers
    this.wall(-14, 5, -14, 18);
    this.wall(-6, 5, -6, 18);
    this.wall(6, 5, 6, 18);
    this.wall(14, 5, 14, 18);

    // door signs (corridor side)
    this.sign('Vaccine R&D', -16.5, -4.86, 0, { sub: 'Platform development · Clinical ops', bg: '#1d5a4d' });
    this.sign('Emergency Operations Center', 0, -4.86, 0, { sub: 'Authorized personnel · Activation status board', bg: '#14304f', w: 4.6 });
    this.sign('Laboratory · BSL-3', 16.5, -4.86, 0, { sub: 'Special pathogens branch', bg: '#22506e' });
    this.sign("Director's Office", -19, 4.86, Math.PI, { bg: '#5b4a1e' });
    this.sign('Your Office', -10, 4.86, Math.PI, { sub: 'Incident Manager', bg: '#3b2f5c' });
    this.sign('Break Room', 10, 4.86, Math.PI, { bg: '#5b3d2a' });
    this.sign('Press Briefing Room', 19, 4.86, Math.PI, { sub: 'Joint Information Center', bg: '#6b3a24' });
  }

  // ---------- rooms ----------
  buildEOC() {
    // holo table
    const tableMat = mat(0x10161e, { roughness: 0.35, metalness: 0.5 });
    this.box(7.6, 0.9, 4.4, 0, 0.45, -12, tableMat, { collide: true });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.04, 4.5), basic(0x2a8fd6, { toneMapped: false }));
    rim.position.set(0, 0.91, -12);
    this.root.add(rim);
    const glassTop = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 4.2), new THREE.MeshBasicMaterial({ color: 0x0a2a44, transparent: true, opacity: 0.85 }));
    glassTop.rotation.x = -Math.PI / 2;
    glassTop.position.set(0, 0.925, -12);
    this.root.add(glassTop);
    this.holoAnchor = new THREE.Vector3(0, 0.95, -12);

    // operator desks (west & east clusters)
    for (const z of [-15.4, -12, -8.6]) {
      this.desk(-7.0, z, 1.9, 1.0, Math.PI / 2, { color: C.deskDark, monitors: 2, monitorColor: 0x2f9be0 });
      this.chair(-7.95, z, Math.PI / 2);
      this.npcSpots.push({ type: 'seated', x: -7.95, z, ry: Math.PI / 2, outfit: 'uniform' });
      this.desk(7.0, z, 1.9, 1.0, -Math.PI / 2, { color: C.deskDark, monitors: 2, monitorColor: 0x2f9be0 });
      this.chair(7.95, z, -Math.PI / 2);
      this.npcSpots.push({ type: 'seated', x: 7.95, z, ry: -Math.PI / 2, outfit: z === -12 ? 'suit' : 'uniform' });
    }
    this.npcSpots.push({ type: 'stand', x: 2.6, z: -15.0, ry: Math.atan2(-2.6, 3), outfit: 'uniform', who: 'eoc' });
    this.npcSpots.push({ type: 'stand', x: -3.1, z: -15.1, ry: Math.atan2(3.1, 3.1), outfit: 'suit' });

    // wall screens
    this.screen('eocMain', 7.2, 2.6, 1280, 462, 0, 1.95, -17.84, 0);
    this.screen('eocLeft', 3.4, 2.0, 640, 376, -6.6, 1.95, -17.84, 0);
    this.screen('eocRight', 3.4, 2.0, 640, 376, 6.6, 1.95, -17.84, 0);

    // status light bar along the north wall
    const bar = new THREE.Mesh(new THREE.BoxGeometry(17.4, 0.08, 0.08), basic(0x3ddc97, { toneMapped: false }));
    bar.position.set(0, 3.0, -17.8);
    this.root.add(bar);
    this.alertLights.push(bar);
    const eocLight = new THREE.PointLight(0x5aa8ff, 18, 16, 2);
    eocLight.position.set(0, 2.9, -12);
    this.root.add(eocLight);
    this.eocLight = eocLight;
  }

  buildLab() {
    const white = mat(0xf1f4f6, { roughness: 0.4 });
    const steel = mat(C.steel, { metalness: 0.65, roughness: 0.35 });
    // island bench
    this.box(8.4, 0.92, 1.3, 16.2, 0.46, -12.6, white, { collide: true });
    this.box(8.6, 0.05, 1.4, 16.2, 0.94, -12.6, mat(0x2b3138, { roughness: 0.3 }), { cast: false });
    // wall bench (north)
    this.box(12.6, 0.92, 0.9, 16.8, 0.46, -17.35, white, { collide: true });
    this.box(12.6, 0.05, 0.95, 16.8, 0.94, -17.35, mat(0x2b3138, { roughness: 0.3 }), { cast: false });
    // props on benches
    for (const x of [13, 15.2, 17.4, 19.6]) {
      this.microscope(x, -12.4);
      this.tubes(x + 0.9, -12.9);
    }
    for (const x of [12, 14.5, 21]) this.box(0.6, 0.38, 0.5, x, 1.15, -17.35, mat(0xdfe5ea), { cast: false });
    // centrifuge
    this.cyl(0.32, 0.36, 0.34, 17.5, 1.13, -17.35, mat(0xe5e9ec));
    // sequencer with screen
    this.box(1.2, 1.5, 0.8, 10.3, 0.75, -9.6, mat(0x25303b, { roughness: 0.4 }), { collide: true });
    const seqScreen = canvasPanel(0.8, 0.5, 256, 160, null, { emissive: true });
    seqScreen.position.set(10.92, 1.15, -9.6);
    seqScreen.rotation.y = Math.PI / 2;
    this.root.add(seqScreen);
    this.screens.sequencer = seqScreen.userData.canvas;
    // biosafety cabinets (east wall)
    for (const z of [-15.2, -12.5, -9.8]) {
      this.box(0.95, 2.0, 1.5, 23.35, 1.0, z, mat(0xe8ecef, { roughness: 0.35 }), { collide: true });
      const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), basic(0xbfe8ff, { transparent: true, opacity: 0.55, toneMapped: false }));
      glassPane.position.set(22.86, 1.25, z);
      glassPane.rotation.y = -Math.PI / 2;
      this.root.add(glassPane);
      this.box(0.5, 0.1, 1.4, 23.1, 0.85, z, steel, { cast: false });
    }
    // freezers
    for (const x of [10.1, 11.1]) this.box(0.9, 1.95, 0.8, x, 0.98, -15.9, mat(0xdde3e8, { roughness: 0.3 }), { collide: true });
    // lab terminal (station kiosk)
    this.kiosk(12.6, -8.6, 0, 0x7fe0ff);
    this.screen('labWall', 3.2, 1.6, 600, 300, 16.8, 2.25, -17.86, 0);
    // biohazard sign by door
    const bio = canvasPanel(0.7, 0.7, 128, 128, (ctx, W, H) => {
      ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.moveTo(W / 2, 6); ctx.lineTo(W - 6, H - 8); ctx.lineTo(6, H - 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '900 70px Arial'; ctx.textAlign = 'center'; ctx.fillText('☣', W / 2, H - 22);
    });
    bio.position.set(18.6, 1.7, -4.86);
    this.root.add(bio);
    const labLight = new THREE.PointLight(0xdff4ff, 14, 16, 2);
    labLight.position.set(16.5, 2.9, -11.5);
    this.root.add(labLight);

    this.npcSpots.push({ type: 'stand', x: 13.8, z: -16.4, ry: Math.PI, outfit: 'labcoat' });
    this.npcSpots.push({ type: 'stand', x: 22.2, z: -12.5, ry: Math.PI / 2, outfit: 'bunny', who: 'lab' });
    this.npcSpots.push({ type: 'patrol', x: 16.2, z: -11.3, ry: Math.PI, outfit: 'labcoat', pts: [[14, -11.4], [19, -11.4], [16.2, -13.9]] });
  }

  microscope(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0.97, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.25), mat(0x2d3640));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.06), mat(0x2d3640));
    arm.position.set(0, 0.2, -0.08);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 10), mat(0xe6e9ec));
    tube.position.set(0, 0.32, 0.0);
    tube.rotation.x = 0.4;
    g.add(base, arm, tube);
    this.root.add(g);
  }

  tubes(x, z) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.12), mat(0x3a7bd5));
    rack.position.set(x, 1.0, z);
    this.root.add(rack);
    const colors = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0];
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), mat(colors[i], { transparent: true, opacity: 0.85 }));
      t.position.set(x - 0.12 + i * 0.08, 1.1, z);
      this.root.add(t);
    }
  }

  kiosk(x, z, ry, color) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.05, 0.32), mat(0x26303b, { roughness: 0.4 }));
    post.position.y = 0.52;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.08), mat(0x111820));
    head.position.set(0, 1.25, 0.05);
    head.rotation.x = -0.5;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.43), basic(color, { toneMapped: false }));
    scr.position.set(0, 0, 0.045);
    head.add(scr);
    post.castShadow = head.castShadow = this.shadows;
    g.add(post, head);
    this.root.add(g);
    this.animated.push({ type: 'monitor', mesh: scr, phase: Math.random() * 6, base: new THREE.Color(color) });
    this.colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.25, maxZ: z + 0.25 });
  }

  buildVaccine() {
    const steel = mat(0xc9d1d8, { metalness: 0.8, roughness: 0.25 });
    for (const x of [-21.4, -18.4, -15.4]) {
      this.cyl(0.85, 0.85, 2.3, x, 1.15, -15.6, steel, { collide: true, seg: 28 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel);
      dome.position.set(x, 2.3, -15.6);
      dome.castShadow = this.shadows;
      this.root.add(dome);
      // sight glass + status light
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.7), basic(0x8af5c8, { toneMapped: false, transparent: true, opacity: 0.8 }));
      sg.position.set(x, 1.3, -14.74);
      this.root.add(sg);
      this.animated.push({ type: 'reactor', mesh: sg, phase: x });
      // pipes
      this.cyl(0.07, 0.07, 1.6, x + 0.6, 2.9, -15.6, mat(0x9aa4ad, { metalness: 0.7 }), { cast: false }).rotation.z = Math.PI / 2;
    }
    this.cyl(0.08, 0.08, 7.6, -18.4, 3.0, -16.9, mat(0x9aa4ad, { metalness: 0.7 }), { cast: false }).rotation.z = Math.PI / 2;
    // fill-finish conveyor with moving vials
    this.box(7.6, 0.9, 0.8, -17.2, 0.45, -10.6, mat(0x5e6b77, { metalness: 0.4 }), { collide: true });
    const belt = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.03, 0.55), mat(0x1e252c, { roughness: 0.7 }));
    belt.position.set(-17.2, 0.915, -10.6);
    this.root.add(belt);
    const vialGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10);
    const vialMat = mat(0xdff3ff, { transparent: true, opacity: 0.9, roughness: 0.1 });
    const capMat = mat(0xff6b6b);
    const vials = [];
    for (let i = 0; i < 22; i++) {
      const v = new THREE.Mesh(vialGeo, vialMat);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.04, 10), capMat);
      cap.position.y = 0.1;
      v.add(cap);
      v.position.set(-20.8 + i * 0.33, 1.01, -10.6);
      this.root.add(v);
      vials.push(v);
    }
    this.animated.push({ type: 'vials', list: vials });
    this.vials = vials;
    // ultra-cold freezers
    for (const z of [-12.2, -7.4]) {
      this.box(0.95, 2.0, 1.1, -23.35, 1.0, z, mat(0xe9eef2, { roughness: 0.3 }), { collide: true });
      const disp = canvasPanel(0.42, 0.18, 128, 56, (ctx, W, H) => {
        ctx.fillStyle = '#04121a'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#7fe0ff'; ctx.font = '700 32px "IBM Plex Mono", monospace'; ctx.textBaseline = 'middle';
        ctx.fillText('-72.4°C', 8, H / 2);
      }, { emissive: true });
      disp.position.set(-22.86, 1.6, z);
      disp.rotation.y = Math.PI / 2;
      this.root.add(disp);
    }
    this.kiosk(-11.6, -8.6, 0, 0x6fe3a6);
    this.screen('vaxWall', 3.4, 1.7, 640, 320, -12.0, 2.15, -17.86, 0);
    const vaxLight = new THREE.PointLight(0xd9fff2, 12, 16, 2);
    vaxLight.position.set(-16.5, 2.9, -11);
    this.root.add(vaxLight);

    this.npcSpots.push({ type: 'stand', x: -17.6, z: -9.6, ry: Math.PI, outfit: 'labcoat', who: 'vaccine' });
    this.npcSpots.push({ type: 'patrol', x: -19.9, z: -13.6, ry: Math.PI, outfit: 'bunny', pts: [[-19.9, -13.7], [-16.9, -13.7], [-13.2, -12.5]] });
  }

  buildDirector() {
    this.floor(-22, -16, 10, 17, 0x7d2f2f, 0.012, { roughness: 1 }); // rug
    this.desk(-19, 14.6, 2.6, 1.15, Math.PI, { color: 0x5a3e2b, monitors: 1, monitorColor: 0x9ad1ff });
    this.chair(-19, 15.75, Math.PI, 0x3b2a20);
    this.chair(-19.8, 13.0, 0, 0x6b4f3a);
    this.chair(-18.2, 13.0, 0, 0x6b4f3a);
    // bookshelf
    const shelf = this.box(0.45, 2.3, 4.2, -23.6, 1.15, 9.5, mat(0x5a3e2b), { collide: true });
    shelf.castShadow = this.shadows;
    const bookColors = [0x8b2e2e, 0x2e5b8b, 0x2e8b57, 0xc49a3a, 0x6b4f8b, 0x333333];
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 12; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32 + ((i * 7 + row) % 3) * 0.04, 0.24), mat(bookColors[(i + row * 2) % bookColors.length]));
        b.position.set(-23.32, 0.42 + row * 0.55, 7.75 + i * 0.3);
        this.root.add(b);
      }
    }
    // window
    const win = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.8), basic(0xcfe8ff, { toneMapped: false }));
    win.position.set(-19, 1.85, 17.86);
    win.rotation.y = Math.PI;
    this.root.add(win);
    for (const x of [-21.5, -19, -16.5]) this.box(0.08, 1.9, 0.06, x, 1.85, 17.84, mat(0x2b3138), { cast: false });
    // flags
    for (const [x, col] of [[-22.6, '#b22234'], [-15.4, '#1f3a5a']]) {
      this.cyl(0.03, 0.03, 2.4, x, 1.2, 17.2, mat(0xc8a951, { metalness: 0.8 }));
      const f = canvasPanel(0.6, 0.9, 64, 96, (ctx, W, H) => { ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, 0, 8, H); });
      f.position.set(x + 0.32, 1.85, 17.2);
      f.material.side = THREE.DoubleSide;
      this.root.add(f);
    }
    this.plant(-15, 6.2, 1.1);
    this.npcSpots.push({ type: 'stand', x: -17.2, z: 15.5, ry: Math.PI + 0.35, outfit: 'director', who: 'director' });
  }

  buildOffice() {
    this.desk(-10, 15.4, 2.1, 0.95, Math.PI, { color: 0xb8a58c, monitors: 2, monitorColor: 0xb59cff });
    this.chair(-10, 16.4, Math.PI, 0x3a3150);
    this.plant(-13.2, 17.2, 0.9);
    this.plant(-6.8, 17.2, 0.8);
    // whiteboard with an SEIR sketch
    const wb = canvasPanel(3.4, 1.5, 680, 300, (ctx, W, H) => {
      ctx.fillStyle = '#fbfbf8'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#2b5fb3'; ctx.lineWidth = 4; ctx.font = '600 44px "Comic Sans MS", "Segoe Print", cursive';
      const labels = ['S', 'E', 'I', 'R'];
      labels.forEach((l, i) => {
        const x = 70 + i * 160;
        ctx.strokeRect(x - 40, 60, 80, 70);
        ctx.fillStyle = '#2b5fb3'; ctx.fillText(l, x - 13, 112);
        if (i < 3) { ctx.beginPath(); ctx.moveTo(x + 44, 95); ctx.lineTo(x + 112, 95); ctx.lineTo(x + 100, 85); ctx.moveTo(x + 112, 95); ctx.lineTo(x + 100, 105); ctx.stroke(); }
      });
      ctx.fillStyle = '#c0392b'; ctx.font = '600 34px "Comic Sans MS", "Segoe Print", cursive';
      ctx.fillText('R₀ = β · D', 70, 200);
      ctx.fillStyle = '#1e8449';
      ctx.fillText('Rt < 1 → we win', 340, 200);
      ctx.fillStyle = '#555'; ctx.font = '500 26px "Comic Sans MS", cursive';
      ctx.fillText('herd immunity ≈ 1 − 1/R₀', 70, 262);
    });
    wb.position.set(-13.86, 1.6, 11.5);
    wb.rotation.y = Math.PI / 2;
    this.root.add(wb);
    // framed #85 jersey (a little personal touch)
    const jersey = canvasPanel(1.1, 1.3, 256, 300, (ctx, W, H) => {
      ctx.fillStyle = '#2a1d10'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f3efe6'; ctx.fillRect(14, 14, W - 28, H - 28);
      ctx.fillStyle = '#aa0000';
      ctx.beginPath();
      ctx.moveTo(70, 50); ctx.lineTo(105, 40); ctx.quadraticCurveTo(128, 62, 151, 40); ctx.lineTo(186, 50);
      ctx.lineTo(230, 92); ctx.lineTo(206, 126); ctx.lineTo(186, 112); ctx.lineTo(186, 262); ctx.lineTo(70, 262);
      ctx.lineTo(70, 112); ctx.lineTo(50, 126); ctx.lineTo(26, 92); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#b3995d'; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#b3995d'; ctx.lineWidth = 4;
      ctx.font = '900 92px "Barlow Condensed", Impact, sans-serif'; ctx.textAlign = 'center';
      ctx.strokeText('85', W / 2, 200); ctx.fillText('85', W / 2, 200);
      ctx.fillStyle = '#222'; ctx.font = 'italic 20px "Segoe Script", cursive';
      ctx.fillText('Keep blocking!', W / 2, 250);
    });
    jersey.position.set(-6.15, 1.75, 9.2);
    jersey.rotation.y = -Math.PI / 2;
    this.root.add(jersey);
    // diplomas
    for (const z of [14, 15.2]) {
      const d = canvasPanel(0.5, 0.38, 100, 76, (ctx, W, H) => { ctx.fillStyle = '#3b2a1a'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#f7f1e1'; ctx.fillRect(6, 6, W - 12, H - 12); ctx.fillStyle = '#7a5c2e'; ctx.fillRect(20, 24, W - 40, 4); ctx.fillRect(26, 40, W - 52, 3); });
      d.position.set(-13.86, 1.9, z);
      d.rotation.y = Math.PI / 2;
      this.root.add(d);
    }
  }

  buildLobby() {
    // reception desk
    this.box(4.6, 1.05, 0.85, 0, 0.52, 12.6, mat(0x26384d, { roughness: 0.4 }), { collide: true });
    this.box(4.8, 0.06, 1.0, 0, 1.08, 12.6, mat(0xd9dee4, { roughness: 0.3 }), { cast: false });
    const front = canvasPanel(4.0, 0.5, 900, 112, (ctx, W, H) => {
      ctx.fillStyle = '#26384d'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e7edf3'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitText(ctx, 'EMERGENCY RESPONSE HEADQUARTERS', W / 2, H / 2 + 2, W - 40, 54, '700 {s}px "Barlow Condensed", Arial, sans-serif');
    });
    front.position.set(0, 0.62, 13.04);
    front.rotation.y = 0;
    this.root.add(front);
    this.chair(0, 11.75, 0);
    this.npcSpots.push({ type: 'seated', x: 0, z: 11.75, ry: 0, outfit: 'casual' });
    // big status wall
    this.screen('lobby', 4.6, 2.2, 840, 400, -5.86, 1.85, 11.5, Math.PI / 2);
    this.screen('lobbyNews', 4.6, 2.2, 840, 400, 5.86, 1.85, 11.5, -Math.PI / 2);
    this.plant(-5.2, 17.2, 1.2);
    this.plant(5.2, 17.2, 1.2);
    // benches
    for (const x of [-3.4, 3.4]) this.box(1.8, 0.45, 0.55, x, 0.23, 16.4, mat(0x7a8692), { collide: true });
    // entrance mat
    this.floor(-2.2, 2.2, 16.6, 18, 0x3d454e, 0.014, { roughness: 1 });
  }

  buildBreak() {
    this.box(0.8, 0.95, 6.2, 13.45, 0.48, 14.1, mat(0xe8e3da, { roughness: 0.5 }), { collide: true });
    this.box(0.86, 0.05, 6.3, 13.45, 0.97, 14.1, mat(0x3c3f44, { roughness: 0.3 }), { cast: false });
    // coffee machine
    this.box(0.5, 0.62, 0.45, 13.35, 1.3, 15.0, mat(0x1d2126, { roughness: 0.3, metalness: 0.4 }));
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), basic(0xff4d4d, { toneMapped: false }));
    led.position.set(13.09, 1.45, 15.0);
    led.rotation.y = -Math.PI / 2;
    this.root.add(led);
    this.cyl(0.05, 0.04, 0.1, 13.1, 1.05, 15.0, mat(0xffffff));
    // fridge
    this.box(0.85, 1.95, 0.8, 13.4, 0.98, 9.2, mat(0xd6dbe0, { metalness: 0.5, roughness: 0.3 }), { collide: true });
    // table and chairs
    this.cyl(0.75, 0.75, 0.05, 9.5, 0.74, 13.4, mat(0xf2efe9), { collide: true });
    this.cyl(0.07, 0.07, 0.72, 9.5, 0.36, 13.4, mat(0x666f78));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      this.chair(9.5 + Math.cos(a) * 1.1, 13.4 + Math.sin(a) * 1.1, Math.atan2(-Math.cos(a), -Math.sin(a)), 0xc0603a);
    }
    const a0 = 0.4;
    this.npcSpots.push({ type: 'seated', x: 9.5 + Math.cos(a0) * 1.1, z: 13.4 + Math.sin(a0) * 1.1, ry: Math.atan2(-Math.cos(a0), -Math.sin(a0)), outfit: 'casual' });
    // TV with cable news
    this.screen('tv', 2.6, 1.46, 640, 360, 6.14, 1.95, 12.6, Math.PI / 2);
    this.plant(6.8, 17.2, 0.8);
  }

  buildPress() {
    // podium
    this.box(0.95, 1.15, 0.62, 19, 0.58, 15.8, mat(0x22344a, { roughness: 0.45 }), { collide: true });
    const seal = canvasPanel(0.6, 0.6, 128, 128, (ctx, W, H) => {
      ctx.fillStyle = '#22344a'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(W / 2, H / 2, 54, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#d4af37'; ctx.font = '700 30px "Barlow Condensed", Arial'; ctx.textAlign = 'center'; ctx.fillText('JIC', W / 2, H / 2 + 10);
    });
    seal.position.set(19, 0.75, 15.48);
    seal.rotation.y = Math.PI;
    this.root.add(seal);
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), mat(0x222222));
    mic.position.set(19, 1.3, 15.6);
    mic.rotation.x = -0.6;
    this.root.add(mic);
    // backdrop
    const backdrop = canvasPanel(6.4, 2.5, 1024, 400, (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#16324f'); g.addColorStop(1, '#0d2135');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 14; i++) ctx.fillRect(i * 80, 0, 2, H);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
      ctx.font = '700 74px "Barlow Condensed", Arial, sans-serif';
      ctx.fillText('OUTBREAK RESPONSE BRIEFING', W / 2, 170);
      ctx.fillStyle = '#d4af37'; ctx.fillRect(W / 2 - 180, 200, 360, 5);
      ctx.fillStyle = '#c9d6e3'; ctx.font = '500 34px "Public Sans", Arial, sans-serif';
      ctx.fillText('Joint Information Center · Atlanta', W / 2, 262);
    }, { emissive: true, intensity: 0.85 });
    backdrop.position.set(19, 1.75, 17.86);
    backdrop.rotation.y = Math.PI;
    this.root.add(backdrop);
    // audience chairs
    for (const z of [8.6, 10.0, 11.4]) {
      for (const x of [15.6, 16.8, 21.2, 22.4]) this.chair(x, z, 0, 0x4b5868);
    }
    // camera tripods
    for (const x of [16.4, 21.6]) {
      this.cyl(0.02, 0.18, 1.4, x, 0.7, 6.6, mat(0x222222));
      this.box(0.3, 0.22, 0.45, x, 1.5, 6.6, mat(0x111111));
    }
    this.npcSpots.push({ type: 'stand', x: 21.3, z: 15.0, ry: -2.5, outfit: 'suit', who: 'comms' });
    this.npcSpots.push({ type: 'seated', x: 16.8, z: 10.0, ry: 0, outfit: 'casual' });
    this.npcSpots.push({ type: 'seated', x: 21.2, z: 8.6, ry: 0, outfit: 'suit' });
    const pressLight = new THREE.SpotLight(0xffffff, 40, 14, 0.5, 0.4, 2);
    pressLight.position.set(19, 3.0, 10);
    pressLight.target.position.set(19, 1, 15.8);
    this.root.add(pressLight, pressLight.target);
  }

  buildCorridor() {
    for (const x of [-22.6, -12.6, -6.8, 6.8, 13.2, 22.6]) this.plant(x, -4.3, 0.85);
    for (const x of [-22.6, 22.6]) this.plant(x, 4.3, 0.85);
    for (const x of [-4.2, 4.2]) this.box(1.6, 0.45, 0.5, x, 0.23, -4.45, mat(0x7a8692), { collide: true });
    // wayfinding posters
    const poster = (x, z, ry, title, lines, color) => {
      const p = canvasPanel(0.9, 1.25, 180, 250, (ctx, W, H) => {
        ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = '700 26px "Barlow Condensed", Arial'; ctx.fillText(title, 12, 36);
        ctx.font = '500 15px "Public Sans", Arial';
        lines.forEach((l, i) => ctx.fillText(l, 12, 70 + i * 24));
      });
      p.position.set(x, 1.6, z);
      p.rotation.y = ry;
      this.root.add(p);
    };
    poster(-21, -4.86, 0, 'WASH YOUR HANDS', ['20 seconds.', 'Soap + water.', 'Every time.'], '#2b6cb0');
    poster(-11.8, -4.86, 0, 'COVER YOUR COUGH', ['Use your elbow.', 'Stay home if sick.'], '#2f855a');
    poster(21, 4.86, Math.PI, 'EIS: 75+ YEARS', ['Disease detectives', 'since 1951.'], '#9b2c2c');
    poster(-22.2, 4.86, Math.PI, 'GET VACCINATED', ['Protect yourself', 'and your family.'], '#6b46c1');

    // wandering destinations
    for (const x of [-21, -15, -9, -4, 4, 9, 15, 21]) for (const z of [-2.4, 2.4]) this.wanderPoints.push([x, z]);
    this.wanderPoints.push([-3, 8.5], [3, 8.5], [-4, 15], [4, 15], [8.5, 9.5], [11, 11], [16, 7.6], [-12, 8], [-20, 8.4]);
    for (let i = 0; i < 4; i++) this.npcSpots.push({ type: 'wander', outfit: ['suit', 'casual', 'labcoat', 'uniform'][i] });
  }

  buildStations() {
    for (const st of STATIONS) {
      const g = new THREE.Group();
      g.position.set(st.x, 0, st.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), basic(st.color, { transparent: true, opacity: 0.75, toneMapped: false, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(st.minor ? 0.12 : 0.18), basic(st.color, { toneMapped: false }));
      gem.position.y = st.minor ? 1.7 : 2.25;
      const label = textSprite(st.short, { size: 40, color: '#ffffff', bg: 'rgba(10,18,28,0.7)', scale: 0.0055, border: '#' + st.color.toString(16).padStart(6, '0') });
      label.position.y = st.minor ? 2.0 : 2.62;
      const alert = textSprite('!', { size: 56, color: '#111', bg: '#ffd23f', scale: 0.006, pad: 16 });
      alert.position.set(label.scale.x / 2 + alert.scale.x / 2 + 0.04, st.minor ? 2.0 : 2.62, 0);
      alert.visible = false;
      g.add(ring, gem, label, alert);
      g.userData = { station: st, ring, gem, label, alert };
      gem.userData.stationId = st.id;
      ring.userData.stationId = st.id;
      label.userData.stationId = st.id;
      this.root.add(g);
      this.stationMarkers[st.id] = g;
    }
  }

  update(t, dt) {
    for (const a of this.animated) {
      if (a.type === 'monitor') {
        const f = 0.82 + 0.18 * Math.sin(t * 1.7 + a.phase) * Math.sin(t * 0.37 + a.phase * 2);
        a.mesh.material.color.copy(a.base).multiplyScalar(f);
      } else if (a.type === 'reactor') {
        a.mesh.material.opacity = 0.55 + 0.3 * Math.sin(t * 2 + a.phase);
      } else if (a.type === 'vials') {
        const speed = this.vialSpeed ?? 0.15;
        for (const v of a.list) {
          v.position.x += speed * dt;
          if (v.position.x > -13.6) v.position.x -= 7.26;
          v.visible = speed > 0.001 || v.position.x < -17;
        }
      } else if (a.type === 'flag') {
        a.mesh.rotation.y = Math.sin(t * 1.3) * 0.18;
      }
    }
    for (const id in this.stationMarkers) {
      const g = this.stationMarkers[id];
      const { gem, ring, alert } = g.userData;
      gem.rotation.y = t * 1.4;
      gem.position.y = (g.userData.station.minor ? 1.7 : 2.25) + Math.sin(t * 2 + g.position.x) * 0.06;
      const pulse = alert.visible ? 1 + 0.25 * Math.sin(t * 6) : 1 + 0.06 * Math.sin(t * 2.5);
      ring.scale.setScalar(pulse);
      if (alert.visible) alert.position.y = (g.userData.station.minor ? 2.0 : 2.62) + Math.abs(Math.sin(t * 4)) * 0.12;
    }
  }

  setAlertLevel(level, t) {
    // 0 = calm (green), 1 = elevated (amber), 2 = crisis (red, pulsing)
    const colors = [0x3ddc97, 0xffb547, 0xff4545];
    for (const bar of this.alertLights) {
      bar.material.color.setHex(colors[level]);
      if (level === 2) bar.material.color.multiplyScalar(0.55 + 0.45 * Math.abs(Math.sin(t * 3)));
    }
    if (this.eocLight) {
      this.eocLight.color.setHex(level === 2 ? 0xff6a6a : level === 1 ? 0xffc27a : 0x5aa8ff);
      this.eocLight.intensity = level === 2 ? 14 + 8 * Math.abs(Math.sin(t * 3)) : 18;
    }
  }
}

function fitText(ctx, text, x, y, maxW, size, fontTpl) {
  let s = size;
  ctx.font = fontTpl.replace('{s}', s);
  while (s > 10 && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = fontTpl.replace('{s}', s); }
  ctx.fillText(text, x, y);
}

function mulberry(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { roundRect };
