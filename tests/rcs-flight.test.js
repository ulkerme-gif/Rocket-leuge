import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSim, steps, C, place, initRapier } from './helpers.js';
import { MatchHost } from '../src/net/MatchHost.js';
import { PROTOCOL_VERSION } from '../src/net/roomCode.js';
import { compactState } from '../src/net/snapshot.js';
import { hasRcs } from '../src/visuals/skins.js';
import { CarView } from '../src/visuals/CarView.js';
import { makeStaticCar } from '../src/visuals/staticCar.js';
import { RcsHud } from '../src/ui/RcsHud.js';

const ctl = (o) => () => ({ player: C(o) });

async function flyer(rcs = true) {
  const sim = await createSim({ players: [{ id: 'player', team: 'blue', rcs }] });
  sim.ball.setEnabled(false);
  const car = sim.cars[0];
  place(car, 4, 30, 0, 50);
  steps(sim, 1, ctl({}));
  return { sim, car };
}

test('only the YILDIRIM skin has RCS', () => {
  assert.equal(hasRcs({ body: 'roadster' }), true);
  for (const skin of [null, {}, { body: 'classic' }, { body: 'tank' }]) assert.equal(hasRcs(skin), false);
});

test('YILDIRIM: hold ZIPLA to rise, release to hover, hold DRIFT to land', async () => {
  const { sim, car } = await flyer();
  steps(sim, 1.5, ctl({ jump: true }));
  assert.ok(car.position.y > 7, `rose to ${car.position.y}`);
  assert.equal(car.state.rcsJet, 2, 'lift jets firing');
  assert.equal(car.state.numWheelsContact, 0);

  steps(sim, 1.5, ctl({}));
  const y = car.position.y;
  steps(sim, 3, ctl({}));
  assert.ok(Math.abs(car.position.y - y) < 0.3, `hover drifted ${y} -> ${car.position.y}`);
  assert.ok(Math.abs(car.velocity.y) < 0.1, `vy ${car.velocity.y}`);
  assert.ok(car.up.y > 0.995, 'stays level');
  assert.equal(car.state.rcsJet, 1);

  steps(sim, 4, ctl({ handbrake: true }));
  assert.equal(car.state.numWheelsContact, 4, 'landed on its wheels');
  assert.equal(car.state.rcsHover, false, 'hover ends on landing');
  assert.equal(car.state.rcsJet, 0);
  sim.dispose();
});

test('the classic car still cannot fly with the same buttons', async () => {
  const { sim, car } = await flyer(false);
  let maxY = 0;
  steps(sim, 3, ctl({ jump: true }), () => (maxY = Math.max(maxY, car.position.y)));
  assert.ok(maxY < 3.5, `classic jumped to ${maxY}`);
  assert.equal(car.state.rcsJet, 0);
  sim.dispose();
});

test('flight controls: stick moves forward, steers the heading, no flips, levels itself', async () => {
  const { sim, car } = await flyer();
  steps(sim, 1, ctl({ jump: true }));
  steps(sim, 1, ctl({}));
  const z0 = car.position.z;
  steps(sim, 1.5, ctl({ pitch: 1 }));
  assert.ok(z0 - car.position.z > 8, `moved ${z0 - car.position.z} m forward`);
  assert.ok(car.up.y > 0.99, 'no nose dive: pitch input translates instead');

  const before = car.forward.clone();
  steps(sim, 0.6, ctl({ steer: 1 }));
  assert.ok(car.forward.x > 0.5 && before.x < 0.1, `turned right: ${car.forward.toArray()}`);

  steps(sim, 0.05, ctl({ jump: true, pitch: 1, steer: 1 }));
  steps(sim, 0.3, ctl({ jump: false, pitch: 1, steer: 1 }));
  steps(sim, 0.05, ctl({ jump: true, pitch: 1 }));
  assert.equal(car.state.isFlipping, false, 'no dodge in the air');
  assert.equal(car.hasFlipAvailable, false);

  car.body.setRotation({ x: Math.sin(0.6), y: 0, z: Math.sin(0.2), w: Math.cos(0.6) }, true);
  steps(sim, 1.2, ctl({}));
  assert.ok(car.up.y > 0.99, `levelled: up.y ${car.up.y}`);
  sim.dispose();
});

test('RCS fuel is unlimited and boost is not used by RCS', async () => {
  const { sim, car } = await flyer();
  const boost = car.boost;
  steps(sim, 1.2, ctl({ jump: true }));
  for (let i = 0; i < 10; i++) {
    steps(sim, 1, ctl({ pitch: i % 2 ? 1 : -1, steer: 0.3 }));
    steps(sim, 1, ctl({}));
  }
  assert.ok(car.position.y > 5, `still flying after 20 s: y ${car.position.y}`);
  assert.equal(car.state.rcsHover, true);
  assert.equal(car.boost, boost, 'boost untouched');
  sim.dispose();
});

test('online: the host gives a guest\'s YILDIRIM RCS, streams the jets, and a bot gets a classic car', async () => {
  const RAPIER = await initRapier();
  let t = 0;
  const match = new MatchHost({ RAPIER, roomCode: 'K7M2', teamSize: 2, now: () => t });
  const sent = { host: [], guest: [] };
  const host = { send: (m) => sent.host.push(m) };
  const guest = { send: (m) => sent.guest.push(m) };
  match.join(host, 'Kurucu', { local: true });
  match.handlePacket(guest, { type: 'join', name: 'Uçan', version: PROTOCOL_VERSION, skin: { body: 'roadster' } });
  match.startMatch();
  const seat = match.playerFor(guest).id;
  const hostSeat = match.playerFor(host).id;
  assert.equal(match.sim.carById.get(seat).rcs, true);
  assert.equal(match.sim.carById.get(hostSeat).rcs, false);

  const snap = compactState(match.sim.getState());
  const mine = snap.cars.find((c) => c.id === seat);
  assert.deepEqual([mine.rcs, typeof mine.jet, typeof mine.air], [1, 'number', 'number']);
  assert.equal('rcs' in snap.cars.find((c) => c.id === hostSeat), false, 'classic cars cost no extra bytes');

  match.leave(guest);
  assert.equal(match.sim.carById.get(seat).rcs, false, 'the replacement bot does not fly');
  const late = { send: () => {} };
  match.handlePacket(late, { type: 'join', name: 'Geç', version: PROTOCOL_VERSION, skin: { body: 'roadster' } });
  assert.equal(match.sim.carById.get(match.playerFor(late).id).rcs, true, 'mid-match YILDIRIM flies too');
  match.dispose();
});

test('CarView: YILDIRIM shows RCS jets only while they fire; the classic car never', () => {
  const car = makeStaticCar({ id: 'x', team: 'blue' });
  const view = new CarView(car, new THREE.Group());
  car.state.rcsJet = 2;
  view.update(1);
  assert.equal(view.rcsJets.visible, false, 'classic has no pods');
  view.setBody('roadster');
  view.update(1);
  assert.equal(view.rcsJets.visible, true);
  assert.ok(view.rcsJetList[0].scale.y > 0, 'rising: jets point down');
  car.state.rcsJet = -1;
  view.update(1);
  assert.ok(view.rcsJetList[0].scale.y < 0, 'descending: jets point up');
  car.state.rcsJet = 0;
  view.update(1);
  assert.equal(view.rcsJets.visible, false);
});

test('HUD: flight labels and the ∞ RCS badge follow the car', () => {
  const classes = new Set();
  const attrs = { jump: 'Zıpla', handbrake: 'Drift' };
  const button = (action) => ({ getAttribute: () => attrs[action], setAttribute: (_k, v) => { attrs[action] = v; } });
  const badgeClasses = new Set(['hidden']);
  const badge = { dataset: {}, classList: { toggle: (c, on) => (on ? badgeClasses.add(c) : badgeClasses.delete(c)) } };
  const doc = {
    body: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } },
    getElementById: (id) => (id === 'rcs-badge' ? badge : null),
    querySelector: (sel) => button(sel.match(/action="(\w+)"/)[1]),
  };
  const hud = new RcsHud(doc);
  hud.set({ enabled: true, airborne: false, jet: 0 });
  assert.ok(classes.has('rcs-car') && !classes.has('rcs-air'));
  assert.equal(badgeClasses.has('hidden'), false);
  assert.match(attrs.jump, /uçarsın/);
  hud.set({ enabled: true, airborne: true, jet: 2 });
  assert.ok(classes.has('rcs-air'));
  assert.equal(badge.dataset.jet, '2');
  hud.clear();
  assert.equal(classes.size, 0);
  assert.ok(badgeClasses.has('hidden'));
  assert.equal(attrs.jump, 'Zıpla', 'original label restored');

  for (const page of ['index.html', 'online.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.match(html, /id="rcs-badge"/, page);
    assert.match(html, /data-touch-action="jump"[^>]*><span class="lbl-ground">ZIPLA.*?<span class="lbl-air">YUKARI/, page);
    assert.match(html, /data-touch-action="handbrake"[^>]*><span class="lbl-ground">DRIFT<\/span><span class="lbl-air">İN/, page);
  }
});
