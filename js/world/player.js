// Player character, third-person camera rig and input handling.
import * as THREE from '../three.js';
import { createPerson } from './people.js';
import { damp, angleDamp, resolveCircle, basic } from './util.js';

const WALK = 4.3;
const RUN = 7.0;
const RADIUS = 0.33;

export class Player {
  constructor(scene, nav, colliders, { shadows = true } = {}) {
    this.person = createPerson('player', Math.random, { shadows });
    this.root = this.person.root;
    scene.add(this.root);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 36), basic(0x4cc3ff, { transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    this.root.add(ring);
    this.ring = ring;
    this.nav = nav;
    this.colliders = colliders;
    this.pos = this.root.position;
    this.yaw = Math.PI;
    this.path = null;
    this.onArrive = null;
    this.speed = 0;
    this.enabled = true;
    // destination marker
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 28), basic(0xffffff, { transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.03;
    scene.add(this.marker);
    this.markerT = 0;
  }

  setPosition(x, z, yaw = this.yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.root.rotation.y = yaw;
  }

  walkTo(x, z, onArrive = null) {
    const path = this.nav.findPath(this.pos.x, this.pos.z, x, z);
    if (!path) return false;
    this.path = path;
    this.idx = 1;
    this.onArrive = onArrive;
    this.marker.position.set(path[path.length - 1].x, 0.03, path[path.length - 1].z);
    this.markerT = 1;
    return true;
  }

  stop() { this.path = null; this.onArrive = null; }

  update(dt, input, camYaw) {
    let mx = 0, mz = 0;
    let speed = 0;
    if (this.enabled) {
      const f = input.forward, r = input.right;
      if (f || r) {
        this.path = null;
        this.onArrive = null;
        const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
        const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
        mx = fx * f + rx * r;
        mz = fz * f + rz * r;
        const len = Math.hypot(mx, mz);
        mx /= len; mz /= len;
        speed = input.run ? RUN : WALK;
      } else if (this.path) {
        const tgt = this.path[this.idx];
        const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        const last = this.idx === this.path.length - 1;
        if (d < (last ? 0.12 : 0.3)) {
          this.idx++;
          if (this.idx >= this.path.length) {
            this.path = null;
            const cb = this.onArrive;
            this.onArrive = null;
            if (cb) cb();
          }
        } else {
          mx = dx / d; mz = dz / d;
          speed = Math.min(input.run ? RUN : WALK + 0.8, d / Math.max(dt, 1e-3));
        }
      }
    }
    this.speed = damp(this.speed, speed, 14, dt);
    if (mx || mz) {
      this.pos.x += mx * this.speed * dt;
      this.pos.z += mz * this.speed * dt;
      this.yaw = Math.atan2(mx, mz);
    }
    resolveCircle(this.pos, RADIUS, this.colliders);
    this.root.rotation.y = angleDamp(this.root.rotation.y, this.yaw, 14, dt);
    this.person.update(dt, this.speed);
    this.ring.material.opacity = 0.45 + 0.25 * Math.sin(performance.now() / 300);
    if (this.markerT > 0) {
      this.markerT = Math.max(0, this.markerT - dt * 0.8);
      this.marker.material.opacity = this.path ? 0.8 : this.markerT * 0.8;
      this.marker.scale.setScalar(1 + (1 - this.markerT) * 0.6);
    }
  }

  faceTowards(x, z) {
    this.yaw = Math.atan2(x - this.pos.x, z - this.pos.z);
  }
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0.35;
    this.pitch = 0.72;
    this.dist = 10.5;
    this.target = new THREE.Vector3(0, 1.2, 8);
    this.mode = 'follow';
    this.focusPos = new THREE.Vector3();
    this.focusLook = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.cinematic = null;
  }

  focus(pos, look) {
    this.mode = 'focus';
    this.focusPos.copy(pos);
    this.focusLook.copy(look);
  }

  release() { this.mode = 'follow'; }

  orbit(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = Math.min(1.35, Math.max(0.2, this.pitch + dy * 0.004));
  }

  zoom(delta) {
    this.dist = Math.min(20, Math.max(4.5, this.dist * (1 + delta)));
  }

  update(dt, playerPos) {
    const cam = this.camera;
    if (this.cinematic) {
      const c = this.cinematic;
      c.t = Math.min(1, c.t + dt / c.duration);
      const e = c.t < 0.5 ? 4 * c.t ** 3 : 1 - Math.pow(-2 * c.t + 2, 3) / 2;
      cam.position.lerpVectors(c.fromPos, c.toPos(), e);
      this.look.lerpVectors(c.fromLook, c.toLook(), e);
      cam.lookAt(this.look);
      if (c.t >= 1) { this.cinematic = null; if (c.done) c.done(); }
      return;
    }
    if (this.mode === 'focus') {
      cam.position.x = damp(cam.position.x, this.focusPos.x, 4, dt);
      cam.position.y = damp(cam.position.y, this.focusPos.y, 4, dt);
      cam.position.z = damp(cam.position.z, this.focusPos.z, 4, dt);
      this.look.x = damp(this.look.x, this.focusLook.x, 5, dt);
      this.look.y = damp(this.look.y, this.focusLook.y, 5, dt);
      this.look.z = damp(this.look.z, this.focusLook.z, 5, dt);
      cam.lookAt(this.look);
      return;
    }
    this.target.x = damp(this.target.x, playerPos.x, 10, dt);
    this.target.y = 1.3;
    this.target.z = damp(this.target.z, playerPos.z, 10, dt);
    const desired = this.desiredPosition();
    cam.position.x = damp(cam.position.x, desired.x, 8, dt);
    cam.position.y = damp(cam.position.y, desired.y, 8, dt);
    cam.position.z = damp(cam.position.z, desired.z, 8, dt);
    this.look.x = damp(this.look.x, this.target.x, 12, dt);
    this.look.y = damp(this.look.y, this.target.y, 12, dt);
    this.look.z = damp(this.look.z, this.target.z, 12, dt);
    cam.lookAt(this.look);
  }

  desiredPosition(target = this.target) {
    const h = Math.cos(this.pitch) * this.dist;
    return new THREE.Vector3(
      target.x + Math.sin(this.yaw) * h,
      target.y + Math.sin(this.pitch) * this.dist,
      target.z + Math.cos(this.yaw) * h,
    );
  }

  flyTo(fromPos, fromLook, playerPos, duration, done) {
    const tgt = new THREE.Vector3(playerPos.x, 1.3, playerPos.z);
    this.target.copy(tgt);
    this.cinematic = {
      t: 0, duration, done,
      fromPos: fromPos.clone(), fromLook: fromLook.clone(),
      toPos: () => this.desiredPosition(tgt), toLook: () => tgt,
    };
    this.look.copy(tgt);
  }
}

// Keyboard + pointer input. Emits click (tap) and drag (orbit) gestures.
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.onClick = null;
    this.onDrag = null;
    this.onZoom = null;
    this.onKey = null;
    this.pointers = new Map();
    this.pinchDist = 0;

    window.addEventListener('keydown', e => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, button: e.button });
      if (this.pointers.size === 2) this.pinchDist = this.currentPinch();
    });
    el.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (this.pointers.size === 2) {
        const d = this.currentPinch();
        if (this.pinchDist && this.onZoom) this.onZoom((this.pinchDist - d) * 0.004);
        this.pinchDist = d;
        return;
      }
      if (p.moved > 6 && this.onDrag) this.onDrag(dx, dy);
    });
    const end = e => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (p.moved <= 6 && this.pointers.size === 0 && p.button === 0 && this.onClick) this.onClick(e.clientX, e.clientY);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', e => this.pointers.delete(e.pointerId));
    el.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.onZoom) this.onZoom(Math.sign(e.deltaY) * 0.08);
    }, { passive: false });
  }

  currentPinch() {
    const ps = [...this.pointers.values()];
    return Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
  }

  axes() {
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    return { forward: f, right: r, run: k.has('ShiftLeft') || k.has('ShiftRight') };
  }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
