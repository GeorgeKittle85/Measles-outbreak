// Holographic map of the United States hovering over the EOC table.
// City pillars show reported incidence (color) and active reported cases (height);
// red pulse rings mark overwhelmed hospitals; arcs show travel flows.
import * as THREE from '../three.js';
import { US_OUTLINE, project } from '../core/data.js';
import { textSprite } from './util.js';

const SCALE = 0.148;
const OFFSET_Y = 0.6; // centre the lower-48 vertically on the table

const STOPS = [
  [0, new THREE.Color(0x29d3a4)],
  [1, new THREE.Color(0xb6e34a)],
  [5, new THREE.Color(0xffd23f)],
  [15, new THREE.Color(0xff8c2a)],
  [40, new THREE.Color(0xff3b3b)],
];

export function incidenceColor(inc, target = new THREE.Color()) {
  if (inc <= 0) return target.copy(STOPS[0][1]);
  for (let i = 1; i < STOPS.length; i++) {
    if (inc <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1];
      const [b, cb] = STOPS[i];
      return target.copy(ca).lerp(cb, (inc - a) / (b - a));
    }
  }
  return target.copy(STOPS[STOPS.length - 1][1]);
}

export function incidenceCss(inc) {
  return '#' + incidenceColor(inc).getHexString();
}

export class HoloMap {
  constructor(anchor, cities) {
    this.group = new THREE.Group();
    this.group.position.copy(anchor);
    this.cities = cities;
    this.pillars = [];
    this.hitMeshes = [];
    this.selected = -1;
    this.mobility = 1;
    this.t = 0;

    const toLocal = (lon, lat) => {
      const p = project(lon, lat);
      return new THREE.Vector2(p.x * SCALE, (p.y + OFFSET_Y) * SCALE);
    };
    this.toLocal = toLocal;

    // landmass
    const shape = new THREE.Shape(US_OUTLINE.map(([lon, lat]) => toLocal(lon, lat)));
    const landGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false });
    landGeo.rotateX(-Math.PI / 2);
    const land = new THREE.Mesh(landGeo, new THREE.MeshBasicMaterial({ color: 0x1d6fa8, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }));
    land.position.y = 0.16;
    this.group.add(land);
    this.land = land;
    const outlinePts = US_OUTLINE.map(([lon, lat]) => { const v = toLocal(lon, lat); return new THREE.Vector3(v.x, 0.2, -v.y); });
    outlinePts.push(outlinePts[0].clone());
    const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(outlinePts), new THREE.LineBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.9, toneMapped: false }));
    this.group.add(outline);
    this.outline = outline;

    // faint grid on the table
    const grid = new THREE.GridHelper(7.2, 24, 0x2a6f9e, 0x173a55);
    grid.position.y = 0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    this.group.add(grid);

    // scanning line
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.05), new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    scan.rotation.x = -Math.PI / 2;
    scan.position.y = 0.22;
    this.group.add(scan);
    this.scan = scan;

    // travel arcs between the most connected city pairs
    this.arcs = [];
    const pairs = [];
    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        const a = cities[i], b = cities[j];
        const d = Math.hypot(a.lon - b.lon, a.lat - b.lat);
        pairs.push({ i, j, w: (a.pop * a.hub * b.pop * b.hub) / Math.pow(d + 3, 1.3) });
      }
    }
    pairs.sort((p, q) => q.w - p.w);
    const dotGeo = new THREE.SphereGeometry(0.028, 8, 6);
    for (const pr of pairs.slice(0, 42)) {
      const A = toLocal(cities[pr.i].lon, cities[pr.i].lat);
      const B = toLocal(cities[pr.j].lon, cities[pr.j].lat);
      const a3 = new THREE.Vector3(A.x, 0.22, -A.y);
      const b3 = new THREE.Vector3(B.x, 0.22, -B.y);
      const mid = a3.clone().add(b3).multiplyScalar(0.5);
      mid.y += 0.12 + a3.distanceTo(b3) * 0.22;
      const curve = new THREE.QuadraticBezierCurve3(a3, mid, b3);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)),
        new THREE.LineBasicMaterial({ color: 0x6fc8ff, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
      this.group.add(line);
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true }));
      this.group.add(dot);
      this.arcs.push({ ...pr, curve, line, dot, t: Math.random(), speed: 0.12 + Math.random() * 0.1, hot: 0 });
    }

    // city pillars
    const pillarGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 14, 1, true);
    pillarGeo.translate(0, 0.5, 0);
    const capGeo = new THREE.CircleGeometry(0.055, 14);
    const discGeo = new THREE.CircleGeometry(0.1, 24);
    const ringGeo = new THREE.RingGeometry(0.11, 0.135, 32);
    const hitGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 8);
    hitGeo.translate(0, 0.6, 0);
    cities.forEach((c, idx) => {
      const p = toLocal(c.lon, c.lat);
      const g = new THREE.Group();
      g.position.set(p.x, 0.2, -p.y);
      const color = new THREE.Color(0x29d3a4);
      const pillar = new THREE.Mesh(pillarGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false }));
      pillar.scale.y = 0.03;
      const cap = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      cap.rotation.x = -Math.PI / 2;
      const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.005;
      const pulse = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      pulse.rotation.x = -Math.PI / 2;
      pulse.position.y = 0.01;
      const halo = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xc77dff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.008;
      halo.scale.setScalar(1.6);
      const sel = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      sel.rotation.x = -Math.PI / 2;
      sel.position.y = 0.012;
      sel.scale.setScalar(1.25);
      const label = textSprite(c.id, { size: 36, color: '#dff6ff', bg: 'rgba(4,20,34,0.75)', scale: 0.0042, pad: 8 });
      label.position.y = 0.15;
      const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.cityIdx = idx;
      g.add(pillar, cap, disc, pulse, halo, sel, label, hit);
      this.group.add(g);
      this.pillars.push({ g, pillar, cap, disc, pulse, halo, sel, label, color, height: 0.03, targetH: 0.03, overflow: false, hidden: 0 });
      this.hitMeshes.push(hit);
    });
  }

  // Called once per simulated day.
  refresh(game) {
    const inc = this.cities.map((_, i) => game.cityIncidence(i));
    this.mobility = game.lastCtx ? game.lastCtx.mobility : 1;
    this.pillars.forEach((pl, i) => {
      const city = game.cities[i];
      let recent = 0;
      const rc = city.repCases;
      for (let k = Math.max(0, rc.length - 14); k < rc.length; k++) recent += rc[k];
      pl.targetH = 0.03 + Math.min(1.1, 0.2 * Math.log10(1 + recent));
      incidenceColor(inc[i], pl.color);
      pl.pillar.material.color.copy(pl.color);
      pl.cap.material.color.copy(pl.color);
      pl.disc.material.color.copy(pl.color);
      pl.overflow = game.cityHospitalLoad(i) > 1;
      pl.strained = game.cityHospitalLoad(i) > 0.8;
      // wastewater reveals hidden spread the case counts miss
      if (game.knowledge.wastewater) {
        const truePrev = game.sim.cityActive(i) / game.sim.cityPop(i);
        pl.hidden = Math.min(1, truePrev * 2000);
      } else pl.hidden = 0;
      pl.team = !!city.team;
    });
    for (const arc of this.arcs) {
      const a = game.sim.cityActive(arc.i) / game.sim.cityPop(arc.i);
      const b = game.sim.cityActive(arc.j) / game.sim.cityPop(arc.j);
      arc.hot = Math.min(1, (a + b) * 3000);
    }
  }

  setSelected(idx) { this.selected = idx; }

  update(dt, camera) {
    this.t += dt;
    const t = this.t;
    this.scan.position.z = Math.sin(t * 0.6) * 2.0;
    this.land.material.opacity = 0.3 + Math.sin(t * 2.3) * 0.03;
    this.pillars.forEach((pl, i) => {
      pl.height += (pl.targetH - pl.height) * Math.min(1, dt * 3);
      pl.pillar.scale.y = pl.height;
      pl.cap.position.y = pl.height;
      pl.label.position.y = pl.height + 0.1;
      if (pl.overflow) {
        const k = (t * 1.2 + i * 0.13) % 1;
        pl.pulse.scale.setScalar(1 + k * 2.2);
        pl.pulse.material.opacity = 0.9 * (1 - k);
        pl.pulse.material.color.setHex(0xff3b3b);
      } else if (pl.strained) {
        pl.pulse.scale.setScalar(1.15);
        pl.pulse.material.opacity = 0.45 + 0.25 * Math.sin(t * 4);
        pl.pulse.material.color.setHex(0xffb547);
      } else pl.pulse.material.opacity = 0;
      pl.halo.material.opacity = pl.hidden * (0.35 + 0.2 * Math.sin(t * 2 + i));
      const selOn = i === this.selected;
      pl.sel.material.opacity = selOn ? 0.95 : 0;
      if (selOn) pl.sel.rotation.z = t;
      pl.label.material.opacity = selOn ? 1 : 0.8;
      const s = selOn ? 1.35 : 1;
      pl.label.scale.set(pl.label.userData.aspect * 0.15 * s, 0.15 * s, 1);
    });
    for (const arc of this.arcs) {
      arc.t = (arc.t + dt * arc.speed * (0.4 + this.mobility)) % 1;
      arc.dot.position.copy(arc.curve.getPoint(arc.t));
      arc.dot.material.color.setHex(arc.hot > 0.15 ? 0xff5a5a : 0xbfefff);
      arc.dot.material.opacity = 0.25 + 0.75 * this.mobility;
      arc.line.material.opacity = 0.06 + 0.22 * this.mobility * (0.4 + arc.hot);
      arc.line.material.color.setHex(arc.hot > 0.15 ? 0xff7a7a : 0x6fc8ff);
    }
  }
}
