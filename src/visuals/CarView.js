import * as THREE from 'three';
import { ATLAS_SIZE, TEAM_BODY, bodyUVGenerator, carBody, cleanSkin, drawSkinAtlas, isDefaultPaint } from './skins.js';

const PALETTE = {
  blue: { body: 0x1f74e0, accent: 0x8fd0ff, trim: 0x0d2a52 },
  orange: { body: 0xf0661a, accent: 0xffc68f, trim: 0x5a2208 },
};

function profile(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

/** Extrudes a side profile (x = towards the nose, y = up) across the car width. */
function extrudeProfile(shape, width, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2); // nose -> -Z (car forward), width -> X
  return g;
}

/** Body with UVs laid out for skins (sides, roof), from a side profile. */
function skinnedBody(points, width, bevel) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const m = bevel * 1.6; // bevel corners poke out a little further than the bevel size
  const bounds = {
    minX: Math.min(...xs) - m, maxX: Math.max(...xs) + m,
    minY: Math.min(...ys) - m, maxY: Math.max(...ys) + m,
    minZ: -bevel, maxZ: width + bevel,
  };
  const g = new THREE.ExtrudeGeometry(profile(points), {
    depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    steps: 1, curveSegments: 4, UVGenerator: bodyUVGenerator(bounds),
  });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

function box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

function fenderArches(radius, tube, mat, x, y, zs) {
  const geo = new THREE.TorusGeometry(radius, tube, 6, 20, Math.PI);
  geo.rotateY(Math.PI / 2);
  const list = [];
  for (const z of zs) for (const side of [-1, 1]) {
    const fender = new THREE.Mesh(geo, mat);
    fender.position.set(side * x, y, z);
    list.push(fender);
  }
  return list;
}

// ---------------------------------------------------------------- classic
const CLASSIC_PROFILE = [[-0.6, -0.12], [-0.62, 0.05], [-0.5, 0.1], [0.18, 0.085], [0.56, 0], [0.64, -0.05], [0.6, -0.12]];

/** The original low-poly "Rocket Arena" car. */
function buildClassic(m) {
  const body = new THREE.Mesh(skinnedBody(CLASSIC_PROFILE, 0.76, 0.03), m.body);
  const cabin = new THREE.Mesh(extrudeProfile(profile([[-0.34, 0.08], [-0.18, 0.25], [0.1, 0.26], [0.32, 0.075]]), 0.56, 0.02), m.glass);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.08, 14).rotateX(Math.PI / 2), m.trim);
  nozzle.position.set(0, -0.03, 0.64);
  const parts = [
    body, cabin,
    box(0.42, 0.012, 0.22, m.window, 0, 0.17, -0.255, -0.62),
    box(0.38, 0.012, 0.16, m.window, 0, 0.17, 0.205, 0.62),
    ...fenderArches(0.16, 0.025, m.fender, 0.39, -0.085, [-0.38, 0.4]),
    box(0.86, 0.035, 0.16, m.trim, 0, 0.24, 0.52),
    box(0.035, 0.13, 0.06, m.trim, 0.28, 0.16, 0.52),
    box(0.035, 0.13, 0.06, m.trim, -0.28, 0.16, 0.52),
    box(0.72, 0.07, 0.075, m.trim, 0, -0.09, -0.6),
    box(0.72, 0.045, 0.08, m.trim, 0, -0.105, 0.61),
    box(0.055, 0.055, 0.72, m.trim, 0.385, -0.105, 0),
    box(0.055, 0.055, 0.72, m.trim, -0.385, -0.105, 0),
    box(0.04, 0.03, 0.92, m.accent, 0.405, -0.03, 0),
    box(0.04, 0.03, 0.92, m.accent, -0.405, -0.03, 0),
    box(0.16, 0.035, 0.02, m.light, 0.24, -0.02, -0.66),
    box(0.16, 0.035, 0.02, m.light, -0.24, -0.02, -0.66),
    box(0.2, 0.035, 0.02, m.tail, 0.27, 0.03, 0.645),
    box(0.2, 0.035, 0.02, m.tail, -0.27, 0.03, 0.645),
    nozzle,
  ];
  body.castShadow = true;
  cabin.castShadow = true;
  return { parts, body, flame: { outer: 0xff8a2a, inner: 0xfff1b0, z: 0.68 }, nozzleZ: 0.72, nozzleY: -0.03 };
}

// ---------------------------------------------------------------- roadster
/**
 * YILDIRIM: an original, open-top electric roadster. Long low nose, a ducktail deck,
 * two seats behind a wrap-around screen with speedster humps behind them, and an
 * electric-blue boost. Same wheels and hitbox as the classic car, so it plays the same.
 */
const ROADSTER_PROFILE = [
  [-0.62, -0.12], [-0.655, -0.03], [-0.645, 0.068], [-0.52, 0.06], [-0.3, 0.052], [0.0, 0.04],
  [0.24, 0.034], [0.48, -0.006], [0.63, -0.06], [0.665, -0.1], [0.6, -0.125],
];

function buildRoadster(m) {
  const body = new THREE.Mesh(skinnedBody(ROADSTER_PROFILE, 0.8, 0.03), m.body);
  body.castShadow = true;
  const parts = [body];

  // Cockpit: dark tub with a trimmed rim, two seats, steering wheel on the left.
  parts.push(
    box(0.6, 0.03, 0.42, m.interior, 0, 0.074, 0.08),
    box(0.03, 0.022, 0.44, m.trim, 0.315, 0.088, 0.08),
    box(0.03, 0.022, 0.44, m.trim, -0.315, 0.088, 0.08),
    box(0.66, 0.022, 0.03, m.trim, 0, 0.09, 0.3),
  );
  for (const side of [-1, 1]) {
    parts.push(
      box(0.17, 0.035, 0.16, m.seat, side * 0.14, 0.098, 0.12),
      box(0.17, 0.12, 0.04, m.seat, side * 0.14, 0.14, 0.215, 0.32),
      box(0.03, 0.07, 0.008, m.accent, side * 0.14, 0.15, 0.192, 0.32),
      // Hood vents.
      box(0.045, 0.008, 0.15, m.trim, side * 0.13, 0.034, -0.43, -0.18),
    );
    // Speedster hump behind each seat, painted like the body.
    const hump = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), m.paint);
    hump.scale.set(0.12, 0.085, 0.24);
    hump.position.set(side * 0.14, 0.085, 0.42);
    hump.castShadow = true;
    parts.push(hump);
    // Mirror on a short stalk.
    parts.push(box(0.04, 0.012, 0.012, m.trim, side * 0.33, 0.11, -0.12), box(0.07, 0.04, 0.025, m.paint, side * 0.37, 0.12, -0.12));
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.009, 6, 18), m.trim);
  wheel.position.set(-0.14, 0.15, -0.04);
  wheel.rotation.x = -0.45;
  parts.push(wheel, box(0.012, 0.012, 0.08, m.trim, -0.14, 0.125, -0.08, -0.45));

  // Wrap-around screen (raked) with a thin top frame.
  const rake = -0.85;
  parts.push(
    box(0.62, 0.01, 0.17, m.window, 0, 0.135, -0.16, rake),
    box(0.64, 0.016, 0.016, m.trim, 0, 0.135 + 0.085 * Math.sin(-rake), -0.16 + 0.085 * Math.cos(-rake)),
  );

  // Arches, sills, team-colour strips (sides + front splitter), lights, diffuser.
  parts.push(...fenderArches(0.172, 0.032, m.paint, 0.41, -0.085, [-0.38, 0.4]));
  for (const side of [-1, 1]) {
    parts.push(
      box(0.05, 0.05, 0.84, m.trim, side * 0.405, -0.11, 0.01),
      box(0.03, 0.022, 0.4, m.accent, side * 0.43, -0.07, 0.01),
      box(0.17, 0.012, 0.05, m.light, side * 0.22, -0.04, -0.656, -0.6, 0, side * -0.12),
      box(0.03, 0.03, 0.022, m.tail, side * 0.345, 0.04, 0.68),
    );
  }
  parts.push(
    box(0.72, 0.016, 0.06, m.accent, 0, -0.132, -0.665),
    box(0.6, 0.02, 0.02, m.tail, 0, 0.04, 0.682),
    box(0.62, 0.05, 0.07, m.trim, 0, -0.1, 0.64),
  );
  for (const x of [-0.18, 0.18]) parts.push(box(0.012, 0.05, 0.09, m.trim, x, -0.12, 0.655));

  // RCS thruster pods at the four corners (the jets themselves live in CarView).
  const rcsPods = [];
  for (const z of [-0.55, 0.57]) for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.05, 10), m.trim);
    pod.position.set(side * 0.395, -0.125, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 5, 14).rotateX(Math.PI / 2), m.rcs);
    ring.position.set(side * 0.395, -0.152, z);
    parts.push(pod, ring);
    rcsPods.push([side * 0.395, -0.155, z]);
  }

  // Electric "exhaust": recessed emitter with a glowing team-colour ring.
  const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.06, 16).rotateX(Math.PI / 2), m.trim);
  emitter.position.set(0, -0.045, 0.665);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.012, 6, 20), m.accent);
  coil.position.set(0, -0.045, 0.697);
  parts.push(emitter, coil);
  return { parts, body, flame: { outer: 0x3fd8ff, inner: 0xeaffff, z: 0.71 }, nozzleZ: 0.75, nozzleY: -0.045, rcsPods };
}

const BUILDERS = { classic: buildClassic, roadster: buildRoadster };

/**
 * Original low-poly car (classic or YILDIRIM roadster). Reads the CarController
 * state each frame (interpolated transform, wheel suspension/steer/spin, boost)
 * and never writes back to physics. Every model shares the same wheels and hitbox.
 */
export class CarView {
  constructor(car, parent) {
    this.car = car;
    const pal = PALETTE[car.team] ?? PALETTE.blue;
    this.pal = pal;
    this.skinKey = '';
    this.skinTexture = null;
    this.bodyKind = null;
    this.group = new THREE.Group();
    this.group.name = `car-${car.id}`;
    this.bodyMat = new THREE.MeshStandardMaterial({ color: pal.body, metalness: 0.45, roughness: 0.32 });
    this.accentMat = new THREE.MeshStandardMaterial({ color: pal.accent, emissive: pal.accent, emissiveIntensity: 1.2 });
    // Same colour as the paint's base, without the texture (humps, arches and mirrors of the roadster).
    this.paintMat = new THREE.MeshStandardMaterial({ color: pal.body, metalness: 0.5, roughness: 0.3 });
    const trimMat = new THREE.MeshStandardMaterial({ color: pal.trim, metalness: 0.5, roughness: 0.45 });
    this.materials = {
      body: this.bodyMat,
      paint: this.paintMat,
      accent: this.accentMat,
      trim: trimMat,
      glass: new THREE.MeshStandardMaterial({ color: 0x0c1622, metalness: 0.9, roughness: 0.15 }),
      window: new THREE.MeshStandardMaterial({ color: 0x6cc9e8, metalness: 0.65, roughness: 0.18, emissive: 0x12303d, emissiveIntensity: 0.35 }),
      light: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 2 }),
      tail: new THREE.MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xff2a3a, emissiveIntensity: 1.6 }),
      fender: new THREE.MeshStandardMaterial({ color: pal.body, metalness: 0.55, roughness: 0.28 }),
      interior: new THREE.MeshStandardMaterial({ color: 0x0a0f15, metalness: 0.2, roughness: 0.85 }),
      seat: new THREE.MeshStandardMaterial({ color: 0x1b2129, metalness: 0.1, roughness: 0.7 }),
      rcs: new THREE.MeshStandardMaterial({ color: 0x7fe9ff, emissive: 0x3fd8ff, emissiveIntensity: 1.4 }),
    };

    this.shell = new THREE.Group();
    this.shell.name = 'shell';
    this.group.add(this.shell);

    const tireGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 20).rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.125, 6).rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9d2dc, metalness: 0.8, roughness: 0.3 });
    const spokeGeo = new THREE.BoxGeometry(0.022, 0.095, 0.018);
    this.wheels = car.wheels.map(() => {
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      tire.castShadow = true;
      spin.add(tire, rim, new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.135, 12).rotateZ(Math.PI / 2), trimMat));
      for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.position.set(side * 0.067, 0.045, 0);
        spoke.rotation.x = (i * Math.PI) / 3;
        spin.add(spoke);
      }
      steer.add(spin);
      this.group.add(steer);
      return { steer, spin };
    });

    const flameOuter = new THREE.ConeGeometry(0.11, 0.75, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.375);
    const flameInner = new THREE.ConeGeometry(0.06, 0.45, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.225);
    const flameMat = (opacity) => new THREE.MeshBasicMaterial({ transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flameOuterMat = flameMat(0.85);
    this.flameInnerMat = flameMat(0.95);
    this.flame = new THREE.Group();
    this.flame.add(new THREE.Mesh(flameOuter, this.flameOuterMat), new THREE.Mesh(flameInner, this.flameInnerMat));
    this.flame.visible = false;
    this.group.add(this.flame);

    // RCS jets (models with rcsPods only): short cyan cones, pointing down from each pod
    // (hover / rise) or flipped up (descend). Driven by car.state.rcsJet.
    const jetGeo = new THREE.ConeGeometry(0.05, 0.34, 10, 1, true).rotateX(Math.PI).translate(0, -0.17, 0);
    const jetCore = new THREE.ConeGeometry(0.024, 0.22, 8, 1, true).rotateX(Math.PI).translate(0, -0.11, 0);
    this.rcsJetMat = flameMat(0.8);
    this.rcsJetMat.color.set(0x3fd8ff);
    this.rcsCoreMat = flameMat(0.95);
    this.rcsCoreMat.color.set(0xeaffff);
    this.rcsJets = new THREE.Group();
    this.rcsJets.name = 'rcs-jets';
    this.rcsJetList = [0, 1, 2, 3].map(() => {
      const jet = new THREE.Group();
      jet.add(new THREE.Mesh(jetGeo, this.rcsJetMat), new THREE.Mesh(jetCore, this.rcsCoreMat));
      this.rcsJets.add(jet);
      return jet;
    });
    this.rcsJets.visible = false;
    this.hasRcsPods = false;
    this.group.add(this.rcsJets);

    this.nozzleLocal = new THREE.Vector3();
    this.renderPos = new THREE.Vector3();
    this.renderQuat = new THREE.Quaternion();
    this.setBody('classic');
    parent.add(this.group);
  }

  /** Swaps the car model ('classic' | 'roadster'). Wheels, materials and paint are kept. */
  setBody(kind) {
    const next = BUILDERS[kind] ? kind : 'classic';
    if (next === this.bodyKind) return;
    this.bodyKind = next;
    for (const child of [...this.shell.children]) {
      this.shell.remove(child);
      child.geometry?.dispose();
    }
    const built = BUILDERS[next](this.materials);
    this.shell.add(...built.parts);
    this.bodyMesh = built.body;
    this.flameOuterMat.color.set(built.flame.outer);
    this.flameInnerMat.color.set(built.flame.inner);
    this.flame.position.set(0, built.nozzleY, built.flame.z);
    this.nozzleLocal.set(0, built.nozzleY, built.nozzleZ);
    this.hasRcsPods = !!built.rcsPods;
    built.rcsPods?.forEach(([x, y, z], i) => this.rcsJetList[i]?.position.set(x, y, z));
    this.rcsJets.visible = false;
  }

  update(alpha) {
    const car = this.car;
    car.getRenderTransform(alpha, this.renderPos, this.renderQuat);
    this.group.position.copy(this.renderPos);
    this.group.quaternion.copy(this.renderQuat);
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i], n = this.wheels[i];
      n.steer.position.set(w.local.x + w.side * 0.02, w.local.y - w.suspension, w.local.z);
      n.steer.rotation.y = -w.steer;
      n.spin.rotation.x = -w.spin;
    }
    const s = car.state;
    this.flame.visible = s.isBoosting;
    if (s.isBoosting) this.flame.scale.set(1, 1, (s.isSupersonic ? 1.45 : 1) * (0.8 + Math.random() * 0.4));
    this.accentMat.emissiveIntensity = s.isSupersonic ? 2.4 : 1.2;
    const jet = this.hasRcsPods ? s.rcsJet ?? 0 : 0;
    this.rcsJets.visible = jet !== 0;
    if (jet !== 0) {
      // 1 hover (short idle flicker), 2 rising (long), -1 descending (jets point up).
      const length = jet === 2 ? 1.15 : jet === 1 ? 0.45 : -0.8;
      for (const j of this.rcsJetList) j.scale.set(1, length * (0.8 + Math.random() * 0.4), 1);
      this.materials.rcs.emissiveIntensity = jet === 1 ? 1.8 : 2.6;
    } else if (this.hasRcsPods) {
      this.materials.rcs.emissiveIntensity = 1.4;
    }
  }

  /**
   * Applies a player's skin (null = plain team colour, classic car). The glowing side
   * strips, spoiler and name tag keep the team colour, so teams stay recognisable.
   */
  setSkin(skin) {
    const clean = skin ? cleanSkin(skin) : null;
    this.setBody(carBody(clean));
    const paint = clean && !isDefaultPaint(clean) ? { ...clean, body: undefined } : null;
    const key = paint ? JSON.stringify(paint) : '';
    const base = paint && paint.base !== 'team' ? paint.base : (TEAM_BODY[this.car.team] ?? this.pal.body);
    this.paintMat.color.set(base);
    if (key === this.skinKey) return;
    this.skinKey = key;
    this.skinTexture?.dispose();
    this.skinTexture = null;
    this.bodyMat.map = null;
    this.bodyMat.color.set(this.pal.body);
    if (key) {
      const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      let ctx = null;
      if (canvas) { canvas.width = ATLAS_SIZE; canvas.height = ATLAS_SIZE; }
      try { ctx = canvas?.getContext?.('2d') ?? null; } catch { ctx = null; }
      if (ctx) {
        drawSkinAtlas(ctx, clean, this.car.team);
        this.skinTexture = new THREE.CanvasTexture(canvas);
        this.skinTexture.colorSpace = THREE.SRGBColorSpace;
        this.skinTexture.anisotropy = 4;
        this.bodyMat.map = this.skinTexture;
        this.bodyMat.color.set(0xffffff);
      } else if (clean.base !== 'team') {
        this.bodyMat.color.set(clean.base); // no 2D canvas available: at least the colour
      }
    }
    this.bodyMat.needsUpdate = true;
  }

  nozzleWorld(out) {
    return out.copy(this.nozzleLocal).applyQuaternion(this.renderQuat).add(this.renderPos);
  }
}
