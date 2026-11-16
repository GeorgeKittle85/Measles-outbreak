// Epicenter: bootstraps the 3D headquarters, the simulation and the UI, and runs the game loop.
import * as THREE from './three.js';
import { Game } from './core/game.js';
import { CITY_DATA } from './core/data.js';
import { HQ, STATIONS, roomAt } from './world/hq.js';
import { NavGrid } from './world/nav.js';
import { Crowd } from './world/people.js';
import { HoloMap } from './world/holomap.js';
import { drawScreens, drawStandby } from './world/screens.js';
import { Player, CameraRig, Input } from './world/player.js';
import { damp } from './world/util.js';
import { HUD } from './ui/hud.js';
import { Consoles } from './ui/consoles.js';
import { Modal, showEnd } from './ui/dialogs.js';

const SECONDS_PER_DAY = 2.0;

const COFFEE_FACTS = [
  'In 1854 John Snow mapped cholera deaths in London and traced them to the Broad Street water pump. Field epidemiology started there.',
  'CDC began in 1946 as the Communicable Disease Center, fighting malaria across the southern United States.',
  'The Epidemic Intelligence Service has trained "disease detectives" since 1951. Officers can deploy within a day.',
  'Smallpox is the only human disease ever eradicated. The last natural case was in 1977.',
  'Measles has an R0 of 12–18, so stopping it takes about 95% vaccine coverage.',
  '"Quarantine" comes from the Venetian quaranta giorni: the 40 days ships waited offshore during plague years.',
  'In 1918, cities that brought in distancing early and kept it longer had markedly lower flu death rates.',
  'Wastewater surveillance can pick up a rise in infections days before case counts climb.',
  'mRNA vaccines built on more than 30 years of research. That groundwork made the record speed possible.',
  'Contact tracing works best when cases are few. During exponential growth it gets overwhelmed fast.',
  'The serial interval is the time between symptom onset in one case and in the person they infect.',
  'Ronald Ross, who proved mosquitoes spread malaria, also wrote some of the first mathematical epidemic models.',
];
const JERSEY_LINES = [
  'A signed #85 jersey. A good reminder that great blocking (masks, distancing, vaccines) is what lets the whole team score.',
  '#85: relentless effort on every down. Same energy for contact tracing.',
  'You tap the frame for luck. Somewhere a tight end pancakes a linebacker, and Rt drops by 0.01. Probably.',
  'The jersey stares back at you: "Keep blocking!" You straighten your badge and get back to work.',
];

class App {
  constructor() {
    const canvas = document.getElementById('scene');
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    this.lowPower = coarse || window.innerWidth < 700;
    const shadows = !this.lowPower;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lowPower, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowPower ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(40, 28, 40);
    this.camera.lookAt(0, 0, 0);

    this.hq = new HQ(this.scene, { shadows });
    this.nav = new NavGrid(this.hq.colliders);
    this.holo = new HoloMap(this.hq.holoAnchor, CITY_DATA);
    this.scene.add(this.holo.group);
    this.crowd = new Crowd(this.scene, this.hq, this.nav, { shadows });
    this.player = new Player(this.scene, this.nav, this.hq.colliders, { shadows });
    this.player.setPosition(0, 9.5, Math.PI);
    this.rig = new CameraRig(this.camera);
    this.input = new Input(canvas);
    this.raycaster = new THREE.Raycaster();
    this.wallRay = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.hud = new HUD(this);
    this.consoles = new Consoles(this);
    this.modal = new Modal(this);

    this.state = 'title';
    this.game = null;
    this.speed = 1;
    this.lastSpeed = 1;
    this.acc = 0;
    this.t = 0;
    this.near = null;
    this.coffeeIdx = Math.floor(Math.random() * COFFEE_FACTS.length);
    this.jerseyIdx = 0;
    drawStandby(this.hq);

    this.bindInput();
    this.bindTitle();
    window.addEventListener('resize', () => this.onResize());
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.loop());
    window.__epicenter = this;
  }

  // ---------------- input ----------------
  bindInput() {
    const inp = this.input;
    inp.onDrag = (dx, dy) => {
      if (this.state !== 'playing' || this.rig.mode === 'focus' || this.rig.cinematic) return;
      this.rig.orbit(dx, dy);
    };
    inp.onZoom = d => { if (this.state === 'playing' && this.rig.mode !== 'focus') this.rig.zoom(d); };
    inp.onClick = (x, y) => this.onWorldClick(x, y);
    inp.onKey = e => {
      if (this.state !== 'playing') return;
      const help = document.getElementById('help');
      if (e.code === 'Escape') {
        if (!help.hidden) help.hidden = true;
        else if (this.consoles.station) this.closeConsole();
        return;
      }
      if (this.modal.open) return;
      if (e.code === 'KeyH') { help.hidden = !help.hidden; return; }
      if (e.code === 'Space') { e.preventDefault(); this.setSpeed(this.speed === 0 ? this.lastSpeed || 1 : 0); return; }
      if (e.code === 'KeyE') { this.interact(); return; }
      const speeds = { Digit1: 1, Digit2: 2, Digit3: 4, Digit4: 8 };
      if (speeds[e.code]) this.setSpeed(speeds[e.code]);
    };
    document.getElementById('help-btn').addEventListener('click', () => { document.getElementById('help').hidden = false; });
    document.getElementById('help-close').addEventListener('click', () => { document.getElementById('help').hidden = true; });
    document.getElementById('again-btn').addEventListener('click', () => this.backToTitle());
  }

  bindTitle() {
    const modeCards = document.querySelectorAll('.mode-card');
    modeCards.forEach(c => c.addEventListener('click', () => {
      modeCards.forEach(o => { o.classList.toggle('selected', o === c); o.setAttribute('aria-checked', String(o === c)); });
    }));
    const diffs = document.querySelectorAll('.seg button');
    diffs.forEach(b => b.addEventListener('click', () => {
      diffs.forEach(o => { o.classList.toggle('selected', o === b); o.setAttribute('aria-checked', String(o === b)); });
    }));
    try {
      const saved = localStorage.getItem('epicenter-name');
      if (saved) document.getElementById('player-name').value = saved;
    } catch { /* storage unavailable */ }
    const start = document.getElementById('start-btn');
    start.disabled = false;
    start.textContent = 'Report for duty';
    start.addEventListener('click', () => this.startGame());
    document.getElementById('title-help').addEventListener('click', () => { document.getElementById('help').hidden = false; });
  }

  // ---------------- game lifecycle ----------------
  startGame() {
    const mode = document.querySelector('.mode-card.selected')?.dataset.mode || 'story';
    const difficulty = document.querySelector('.seg button.selected')?.dataset.diff || 'officer';
    let name = document.getElementById('player-name').value.trim() || 'Dr. Taylor Quinn';
    if (!/^dr\.?\s/i.test(name)) name = 'Dr. ' + name;
    try { localStorage.setItem('epicenter-name', name); } catch { /* ignore */ }
    const autoPause = document.getElementById('opt-autopause').checked;
    const game = new Game({ mode, difficulty, playerName: name, autoPauseConsoles: autoPause, seed: (Date.now() % 1e9) | 0 });
    this.game = game;
    game.on('toast', ({ text, kind }) => this.hud.toast(text, kind));
    game.on('event', () => this.modal.pump());
    game.on('end', outcome => {
      this.closeConsole();
      setTimeout(() => showEnd(this, outcome), 700);
    });
    game.on('firstShot', () => { this.hq.vialSpeed = 0.6; });

    document.getElementById('title').hidden = true;
    document.getElementById('end').hidden = true;
    this.modal.reset();
    this.consoles.close();
    this.hud.show();
    this.speed = 1;
    this.lastSpeed = 1;
    this.acc = 0;
    this.player.setPosition(0, 9.5, Math.PI);
    this.player.stop();
    this.player.enabled = true;
    this.rig.release();
    this.rig.yaw = 0;
    this.rig.pitch = 0.72;
    this.rig.dist = this.lowPower ? 13 : 11.5;
    this.hq.vialSpeed = 0.12;
    this.onDayVisuals();
    this.hud.refreshTicker();
    this.state = 'playing';
    const look = new THREE.Vector3(0, 0, 0);
    this.rig.flyTo(this.camera.position, look, this.player.pos, 2.6, () => {
      game.start();
      this.modal.pump();
      this.hud.toast(this.lowPower ? 'Tap the floor to walk · drag to look · tap glowing markers to use stations' : 'Click the floor or use WASD to walk · drag to look · press E at glowing stations', 'info');
    });
  }

  backToTitle() {
    this.closeConsole();
    this.modal.reset();
    document.getElementById('end').hidden = true;
    document.getElementById('help').hidden = true;
    this.hud.hide();
    this.hud.setPrompt(null);
    document.getElementById('title').hidden = false;
    this.state = 'title';
    drawStandby(this.hq);
  }

  setSpeed(s) {
    if (s !== 0) this.lastSpeed = s;
    this.speed = s;
    this.hud.update(true);
  }

  timeFrozen() {
    const g = this.game;
    return !g || this.state !== 'playing' || g.over || this.speed === 0 || this.modal.open || !!this.rig.cinematic ||
      (!!this.consoles.station && g.settings.autoPauseConsoles) || !g.started;
  }

  // ---------------- stations ----------------
  currentRoom() { return roomAt(this.player.pos.x, this.player.pos.z); }

  nearestStation() {
    let best = null, bd = Infinity;
    for (const st of STATIONS) {
      const d = Math.hypot(st.x - this.player.pos.x, st.z - this.player.pos.z);
      if (d < st.r && d < bd) { bd = d; best = st; }
    }
    return best;
  }

  interact() {
    if (this.state !== 'playing' || this.modal.open) return;
    const st = this.near;
    if (st) this.openStation(st.id);
  }

  goToStation(id, open) {
    if (this.state !== 'playing' || this.modal.open || this.rig.cinematic) return;
    const st = STATIONS.find(s => s.id === id);
    if (!st) return;
    if (this.consoles.station === id) return;
    if (this.consoles.station) this.closeConsole();
    const d = Math.hypot(st.x - this.player.pos.x, st.z - this.player.pos.z);
    if (d < st.r * 0.8) { if (open) this.openStation(id); return; }
    this.player.walkTo(st.x, st.z, open ? () => this.openStation(id) : null);
  }

  openStation(id) {
    const g = this.game;
    if (!g) return;
    const st = STATIONS.find(s => s.id === id);
    if (id === 'coffee') {
      this.hud.toast('☕ ' + COFFEE_FACTS[this.coffeeIdx++ % COFFEE_FACTS.length], 'info');
      return;
    }
    if (id === 'jersey') {
      this.hud.toast(JERSEY_LINES[this.jerseyIdx++ % JERSEY_LINES.length], 'info');
      return;
    }
    this.player.stop();
    this.player.faceTowards(st.x, st.z - 1);
    this.consoles.open(id);
    document.body.classList.add('console-open');
    this.hud.setPrompt(null);
    if (id === 'eoc') {
      this.focusHolo();
      for (const k in this.hq.stationMarkers) this.hq.stationMarkers[k].visible = false;
      this.player.root.visible = false;
    }
    this.hud.update(true);
  }

  // Frame the holo table inside whatever part of the screen the console leaves free.
  focusHolo() {
    const W = window.innerWidth, H = window.innerHeight;
    const panel = this.consoles.el.getBoundingClientRect();
    const tb = document.getElementById('topbar').getBoundingClientRect().bottom;
    const wide = W > 820;
    let freeW = W, freeH = H - tb, cx = W / 2, cy = tb + freeH / 2;
    if (wide) { freeW = Math.max(200, panel.left - 10); cx = freeW / 2; }
    else { freeH = Math.max(120, panel.top - tb); cy = tb + freeH / 2; }
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanH = tanV * (W / H);
    const pitch = wide ? 0.95 : 1.12;
    const d = 1.06 * Math.max(3.9 / (tanH * (freeW / W)), 2.5 / (tanV * (freeH / H)));
    const target = new THREE.Vector3(0, 1.1, -12);
    this.rig.focus(new THREE.Vector3(0, target.y + Math.sin(pitch) * d, target.z + Math.cos(pitch) * d), target);
  }

  closeConsole() {
    if (!this.consoles.station) return;
    this.consoles.close();
    document.body.classList.remove('console-open');
    for (const k in this.hq.stationMarkers) this.hq.stationMarkers[k].visible = true;
    this.player.root.visible = true;
    this.camera.clearViewOffset();
    this.rig.release();
    this.holo.setSelected(-1);
    this.hud.update(true);
  }

  onPlayerAction() { /* hook for future sound effects */ }

  attention() {
    const g = this.game;
    const out = {};
    if (!g) return out;
    const r = g.research;
    const labIdle = r.active.length < r.slots && ['sequencing', 'assay', 'transmission', 'severity'].some(id => !r.done.has(id) && !r.active.some(a => a.id === id) && (id !== 'assay' || r.done.has('sequencing')));
    if (labIdle) out.lab = true;
    const v = g.vaccine;
    if (g.knowledge.sequenced && !v.candidates.some(c => c.stage !== 'failed')) out.vaccine = true;
    if (v.candidates.some(c => c.waitingFunds)) out.vaccine = true;
    if (g.authorizedCount && v.upgrades.size === 0) out.vaccine = true;
    if (!g.flags.briefed && g.day >= 3) out.press = true;
    if (g.budget < 300 && !g.funding.pending && g.day >= g.funding.cooldownUntil) out.director = true;
    const unread = g.messages.filter(m => !m.read).length;
    if (unread) out.office = unread;
    if ((!g.flags.teamDeployed && g.day >= 2) || g.overflowCities() > 0) out.eoc = true;
    return out;
  }

  // ---------------- per-day visuals ----------------
  onDayVisuals() {
    const g = this.game;
    if (!g) return;
    this.holo.refresh(g);
    drawScreens(this.hq, g);
    if (this.consoles.station) this.consoles.render();
    if (g.day % 4 === 0) this.hud.refreshTicker();
    const att = this.attention();
    for (const id in this.hq.stationMarkers) this.hq.stationMarkers[id].userData.alert.visible = !!att[id];
    const overflow = g.overflowCities();
    const strained = g.cities.some(c => g.cityHospitalLoad(c.idx) > 0.8);
    this.alertLevel = overflow > 0 ? 2 : strained || g.nationalReported7() > 500 ? 1 : 0;
    this.crowd.urgency = Math.min(1, overflow / 6 + (this.alertLevel ? 0.3 : 0));
    if (g.vaccine.candidates.some(c => c.mfgStart != null && c.stage !== 'failed')) this.hq.vialSpeed = 0.6;
    this.hud.update(true);
  }

  // ---------------- clicks ----------------
  onWorldClick(x, y) {
    if (this.state !== 'playing' || this.modal.open || this.rig.cinematic) return;
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.consoles.station === 'eoc') {
      const hit = this.raycaster.intersectObjects(this.holo.hitMeshes, false)[0];
      if (hit) { this.consoles.selectCity(hit.object.userData.cityIdx); return; }
      return;
    }
    const markers = [];
    for (const id in this.hq.stationMarkers) {
      const u = this.hq.stationMarkers[id].userData;
      markers.push(u.gem, u.label, u.ring);
    }
    const mh = this.raycaster.intersectObjects(markers, false)[0];
    if (mh) { this.goToStation(mh.object.userData.stationId, true); return; }
    if (this.consoles.station) { this.closeConsole(); return; }
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.ground, p) && Math.abs(p.x) < 24 && Math.abs(p.z) < 18) {
      // clicking right next to a station opens it on arrival
      const st = STATIONS.find(s => Math.hypot(s.x - p.x, s.z - p.z) < 0.9);
      if (st) this.goToStation(st.id, true);
      else this.player.walkTo(p.x, p.z);
    }
  }

  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    if (this.consoles.station === 'eoc') this.focusHolo();
    if (this.consoles.station) this.consoles.render();
  }

  // ---------------- wall fading ----------------
  fadeWalls(dt) {
    const cam = this.camera.position;
    const head = new THREE.Vector3(this.player.pos.x, 1.3, this.player.pos.z);
    const dir = head.clone().sub(cam);
    const dist = dir.length();
    dir.normalize();
    this.wallRay.set(cam, dir);
    this.wallRay.far = dist;
    const hits = new Set(this.rig.mode === 'follow' ? this.wallRay.intersectObjects(this.hq.walls, false).map(h => h.object) : []);
    for (const w of this.hq.walls) {
      const target = hits.has(w) ? 0.14 : 1;
      const cur = w.userData.op ?? 1;
      if (Math.abs(cur - target) < 0.002 && cur === target) continue;
      const op = Math.abs(cur - target) < 0.01 ? target : damp(cur, target, 10, dt);
      w.userData.op = op;
      const m = w.material;
      if (op < 0.995) {
        if (!m.transparent) { m.transparent = true; m.depthWrite = false; m.needsUpdate = true; }
        m.opacity = op;
      } else if (m.transparent) {
        m.transparent = false; m.depthWrite = true; m.opacity = 1; m.needsUpdate = true;
      }
      if (w.userData.stripe) w.userData.stripe.visible = op > 0.5;
    }
  }

  // ---------------- main loop ----------------
  loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;

    if (this.state === 'title') {
      const a = this.t * 0.06;
      this.camera.position.set(Math.cos(a) * 44, 27, Math.sin(a) * 38 + 6);
      this.camera.lookAt(0, 0, 0);
      this.player.update(dt, { forward: 0, right: 0 }, 0);
    } else {
      const g = this.game;
      const blocked = !!this.consoles.station || this.modal.open || !!this.rig.cinematic || g.over;
      const axes = blocked ? { forward: 0, right: 0, run: false } : this.input.axes();
      this.player.enabled = !blocked;
      this.player.update(dt, axes, this.rig.yaw);
      this.rig.update(dt, this.player.pos);

      if (!this.timeFrozen()) {
        this.acc += (dt * this.speed) / SECONDS_PER_DAY;
        let steps = 0;
        while (this.acc >= 1 && steps < 3 && !this.timeFrozen()) {
          this.acc -= 1;
          steps++;
          g.advanceDay();
          this.onDayVisuals();
        }
        if (this.acc > 3) this.acc = 0;
      }

      const near = blocked ? null : this.nearestStation();
      if (near !== this.near) {
        this.near = near;
        this.hud.setPrompt(near);
      }
      this.fadeWalls(dt);
      this.hq.setAlertLevel(this.alertLevel || 0, this.t);
    }

    this.crowd.update(dt, this.player.pos);
    this.hq.update(this.t, dt);
    this.holo.update(dt, this.camera);
    if (this.state === 'playing') this.hud.update();
    this.renderer.render(this.scene, this.camera);
  }
}

try {
  new App();
  window.__epicenterReady = true;
} catch (err) {
  console.error(err);
  const el = document.getElementById('load-error');
  el.hidden = false;
  el.textContent = `Couldn't start the 3D engine: ${err.message}. Try a browser with WebGL enabled.`;
}
