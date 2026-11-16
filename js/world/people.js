// Low-poly people built from primitives, with procedural walk / idle / seated animation.
import * as THREE from '../three.js';
import { mat, damp, angleDamp, resolveCircle } from './util.js';

const SKIN = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0xffdbac, 0x5c3a21, 0xa66a3f];
const HAIR = [0x1b1b1b, 0x3b2a1a, 0x6b4423, 0xa67b5b, 0xd9c08c, 0x8a8a8a, 0x2b1a12];
const SHIRTS = [0x3a6ea5, 0x7a9cc6, 0xc96e5b, 0x5b8c6b, 0x8e7cc3, 0xd8b45a, 0x4a5568, 0xb85c8a];

const OUTFITS = {
  labcoat: r => ({ top: r(SHIRTS), coat: 0xf6f8fa, pants: 0x2f3a46, shoes: 0x22262b }),
  bunny: () => ({ top: 0xe9f1f7, coat: 0xdde9f2, pants: 0xdde9f2, shoes: 0xc4d3de, hood: 0xdde9f2, visor: true }),
  uniform: () => ({ top: 0xf2f2f0, pants: 0x1b2433, shoes: 0x111111, epaulets: true }),
  suit: r => ({ top: r([0x2c3e50, 0x3d3d3d, 0x1f2f45, 0x4a3f35]), shirt: 0xf4f4f4, pants: 0x262b33, shoes: 0x15171a, tie: r([0x9b2c2c, 0x2b6cb0, 0xb7791f]) }),
  director: () => ({ top: 0x1f2f45, shirt: 0xf4f4f4, pants: 0x1f2f45, shoes: 0x15171a, tie: 0xb3995d }),
  casual: r => ({ top: r(SHIRTS), pants: r([0x2f3a46, 0x4b5563, 0x6b5b4b, 0x34495e]), shoes: r([0x22262b, 0xe5e5e5, 0x7b4b2a]) }),
  player: () => ({ top: 0x2a7fa8, coat: 0xffffff, pants: 0x232a35, shoes: 0x1a1d22, badge: true }),
};

const geo = {
  leg: new THREE.CapsuleGeometry(0.095, 0.5, 4, 10),
  arm: new THREE.CapsuleGeometry(0.07, 0.46, 4, 10),
  torso: new THREE.CapsuleGeometry(0.22, 0.36, 6, 14),
  coat: new THREE.CylinderGeometry(0.26, 0.31, 0.88, 14, 1, true),
  head: new THREE.SphereGeometry(0.165, 18, 14),
  hair: new THREE.SphereGeometry(0.175, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hand: new THREE.SphereGeometry(0.06, 10, 8),
  shoe: new THREE.BoxGeometry(0.15, 0.08, 0.27),
  eye: new THREE.SphereGeometry(0.022, 8, 6),
  tie: new THREE.BoxGeometry(0.07, 0.34, 0.02),
  badge: new THREE.BoxGeometry(0.09, 0.12, 0.015),
  visor: new THREE.SphereGeometry(0.21, 16, 10, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.32),
};

export function createPerson(kind = 'casual', rng = Math.random, { shadows = true } = {}) {
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const o = (OUTFITS[kind] || OUTFITS.casual)(pick);
  const skin = kind === 'player' ? 0xc68642 : pick(SKIN);
  const hairColor = kind === 'player' ? 0x2b1a12 : pick(HAIR);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const add = (parent, g, m, x, y, z) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadows;
    parent.add(mesh);
    return mesh;
  };

  // legs (pivot at hip)
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.11 * side, 0.88, 0);
    add(hip, geo.leg, mat(o.pants), 0, -0.4, 0);
    add(hip, geo.shoe, mat(o.shoes), 0, -0.83, 0.05);
    body.add(hip);
    legs.push(hip);
  }
  // torso
  const torso = add(body, geo.torso, mat(o.top), 0, 1.24, 0);
  torso.scale.set(1, 1, 0.72);
  if (o.shirt) {
    const v = add(body, new THREE.PlaneGeometry(0.16, 0.3), mat(o.shirt), 0, 1.36, 0.165);
    v.castShadow = false;
  }
  if (o.tie) add(body, geo.tie, mat(o.tie), 0, 1.3, 0.17);
  if (o.coat) {
    const coat = add(body, geo.coat, mat(o.coat, { side: THREE.DoubleSide }), 0, 1.06, 0);
    coat.scale.set(1, 1, 0.78);
  }
  if (o.epaulets) for (const s of [-1, 1]) add(body, new THREE.BoxGeometry(0.12, 0.03, 0.12), mat(0xd4af37), 0.2 * s, 1.5, 0);
  if (o.badge) add(body, geo.badge, mat(0x2b6cb0), 0.12, 1.36, 0.2);

  // arms (pivot at shoulder)
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(0.3 * side, 1.47, 0);
    add(sh, geo.arm, mat(o.coat || o.top), 0, -0.28, 0);
    add(sh, geo.hand, mat(skin), 0, -0.58, 0);
    body.add(sh);
    arms.push(sh);
  }
  // head
  const headG = new THREE.Group();
  headG.position.set(0, 1.76, 0);
  add(headG, geo.head, mat(skin), 0, 0, 0);
  if (o.hood) {
    add(headG, new THREE.SphereGeometry(0.205, 16, 12), mat(o.hood), 0, 0.01, -0.01);
    if (o.visor) add(headG, geo.visor, mat(0x9fd8ff, { transparent: true, opacity: 0.6, roughness: 0.05 }), 0, 0, 0.02).rotation.y = 0;
  } else {
    const hair = add(headG, geo.hair, mat(hairColor), 0, 0.02, -0.015);
    hair.rotation.x = -0.25;
  }
  for (const s of [-1, 1]) add(headG, geo.eye, mat(0x111111), 0.06 * s, 0.02, 0.152).castShadow = false;
  body.add(headG);

  // soft contact shadow
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.015;
  root.add(blob);

  const person = {
    root, body, legs, arms, head: headG, phase: rng() * 10, seated: false, t: rng() * 10,
    update(dt, speed = 0) {
      this.t += dt;
      if (this.seated) {
        body.position.y = -0.42;
        for (const l of legs) l.rotation.x = -1.45;
        legs[0].children[1].rotation.x = 0;
        const typing = Math.sin(this.t * 14) * 0.05;
        arms[0].rotation.x = -1.0 + typing;
        arms[1].rotation.x = -1.0 - typing;
        headG.rotation.x = 0.12 + Math.sin(this.t * 0.6) * 0.04;
        headG.rotation.y = Math.sin(this.t * 0.31) * 0.25;
        return;
      }
      const moving = speed > 0.05;
      if (moving) this.phase += dt * speed * 2.6;
      const amp = Math.min(1, speed / 4) * 0.7;
      const s = Math.sin(this.phase);
      legs[0].rotation.x = damp(legs[0].rotation.x, moving ? s * amp : 0, 12, dt);
      legs[1].rotation.x = damp(legs[1].rotation.x, moving ? -s * amp : 0, 12, dt);
      arms[0].rotation.x = damp(arms[0].rotation.x, moving ? -s * amp * 0.8 : Math.sin(this.t * 1.1) * 0.03, 12, dt);
      arms[1].rotation.x = damp(arms[1].rotation.x, moving ? s * amp * 0.8 : -Math.sin(this.t * 1.1) * 0.03, 12, dt);
      arms[0].rotation.z = -0.06; arms[1].rotation.z = 0.06;
      body.position.y = moving ? Math.abs(Math.cos(this.phase)) * 0.05 * amp : Math.sin(this.t * 2) * 0.006;
      body.rotation.x = moving ? Math.min(0.12, speed * 0.02) : 0;
      headG.rotation.y = moving ? 0 : Math.sin(this.t * 0.4) * 0.3;
      headG.rotation.x = 0;
    },
  };
  return person;
}

// NPC staff: seated operators, standers, patrols between points, and wanderers using the nav grid.
export class Crowd {
  constructor(scene, hq, nav, { shadows = true } = {}) {
    this.npcs = [];
    this.nav = nav;
    this.hq = hq;
    this.urgency = 0;
    let seed = 1234;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    this.rng = rng;
    for (const spot of hq.npcSpots) {
      const p = createPerson(spot.outfit, rng, { shadows });
      scene.add(p.root);
      const npc = { p, spot, state: 'idle', wait: rng() * 3, path: null, speed: 0, yaw: spot.ry || 0, who: spot.who };
      if (spot.type === 'seated') {
        p.seated = true;
        p.root.position.set(spot.x, 0, spot.z);
        p.root.rotation.y = spot.ry;
      } else if (spot.type === 'stand' || spot.type === 'patrol') {
        p.root.position.set(spot.x, 0, spot.z);
        p.root.rotation.y = spot.ry;
      } else {
        const wp = hq.wanderPoints[Math.floor(rng() * hq.wanderPoints.length)];
        p.root.position.set(wp[0], 0, wp[1]);
      }
      this.npcs.push(npc);
    }
  }

  update(dt, player) {
    const walkSpeed = 1.3 + this.urgency * 1.1;
    for (const n of this.npcs) {
      const { p, spot } = n;
      if (spot.type === 'seated' || spot.type === 'stand') {
        if (spot.type === 'stand') {
          // glance at the player when they are close
          const dx = player.x - p.root.position.x, dz = player.z - p.root.position.z;
          const near = dx * dx + dz * dz < 6;
          const target = near ? Math.atan2(dx, dz) : spot.ry;
          p.root.rotation.y = angleDamp(p.root.rotation.y, target, 3, dt);
        }
        p.update(dt, 0);
        continue;
      }
      if (!n.path) {
        n.wait -= dt;
        p.update(dt, 0);
        if (n.wait <= 0) {
          let tgt;
          if (spot.type === 'patrol') tgt = spot.pts[Math.floor(this.rng() * spot.pts.length)];
          else tgt = this.hq.wanderPoints[Math.floor(this.rng() * this.hq.wanderPoints.length)];
          const path = this.nav.findPath(p.root.position.x, p.root.position.z, tgt[0], tgt[1]);
          if (path && path.length > 1) { n.path = path; n.idx = 1; }
          n.wait = 1.5 + this.rng() * (spot.type === 'patrol' ? 4 : 6);
        }
        continue;
      }
      const target = n.path[n.idx];
      const pos = p.root.position;
      const dx = target.x - pos.x, dz = target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) {
        n.idx++;
        if (n.idx >= n.path.length) { n.path = null; }
        p.update(dt, 0);
        continue;
      }
      const step = Math.min(d, walkSpeed * dt);
      pos.x += (dx / d) * step;
      pos.z += (dz / d) * step;
      // keep a little personal space from the player
      const px = pos.x - player.x, pz = pos.z - player.z;
      const pd = Math.hypot(px, pz);
      if (pd < 0.7 && pd > 0.001) { pos.x += (px / pd) * (0.7 - pd) * 0.5; pos.z += (pz / pd) * (0.7 - pd) * 0.5; }
      p.root.rotation.y = angleDamp(p.root.rotation.y, Math.atan2(dx, dz), 8, dt);
      p.update(dt, walkSpeed);
    }
  }
}

export { resolveCircle };
