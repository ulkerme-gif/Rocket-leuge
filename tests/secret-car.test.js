import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { UNLOCKS_KEY, codeReward, isUnlocked, loadUnlocks, unlock } from '../src/game/unlocks.js';
import { PROTOCOL_VERSION, normalizeRoomCode } from '../src/net/roomCode.js';
import { DEFAULT_SKIN, carBody, cleanSkin, isDefaultPaint, isDefaultSkin } from '../src/visuals/skins.js';
import { CarView } from '../src/visuals/CarView.js';
import { makeStaticCar } from '../src/visuals/staticCar.js';
import { MatchHost } from '../src/net/MatchHost.js';

const memoryStorage = () => {
  const store = new Map();
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
};

test('1331 unlocks the YILDIRIM roadster and can never be a real room code', () => {
  assert.equal(codeReward('1331'), 'roadster');
  assert.equal(codeReward(' 13-31 '), 'roadster');
  for (const other of ['', '1332', '133', 'K7M2', null, undefined, 'toString', '__proto__']) assert.equal(codeReward(other), null, String(other));
  assert.equal(normalizeRoomCode('1331'), null);
});

test('unlocks persist on the device and survive broken storage', () => {
  const storage = memoryStorage();
  assert.equal(isUnlocked('roadster', storage), false);
  assert.equal(unlock('roadster', storage), true);
  assert.equal(unlock('roadster', storage), false, 'second time: already unlocked');
  assert.equal(isUnlocked('roadster', storage), true);
  storage.store.set(UNLOCKS_KEY, '{broken');
  assert.deepEqual([...loadUnlocks(storage)], []);
  assert.equal(isUnlocked('roadster', null), false);
});

test('skins: the car model is optional, validated and kept separate from the paint', () => {
  assert.equal('body' in cleanSkin({}), false, 'classic car keeps the old skin format');
  assert.deepEqual(cleanSkin({ body: 'classic' }), DEFAULT_SKIN);
  assert.equal(cleanSkin({ body: 'roadster' }).body, 'roadster');
  assert.equal(cleanSkin({ body: 'tank' }).body, undefined);
  assert.equal(carBody(cleanSkin({ body: 'roadster' })), 'roadster');
  assert.equal(carBody(null), 'classic');
  assert.equal(isDefaultPaint({ body: 'roadster' }), true);
  assert.equal(isDefaultSkin({ body: 'roadster' }), false, 'a roadster must reach the other tablets');
});

test('CarView swaps between models, keeps the wheels and moves the boost to the new emitter', () => {
  const parent = new THREE.Group();
  const view = new CarView(makeStaticCar({ id: 'x', team: 'orange' }), parent);
  const wheels = view.wheels.map((w) => w.steer);
  const classicNozzle = view.nozzleLocal.clone();
  const classicFlame = view.flameOuterMat.color.getHex();
  view.setSkin({ body: 'roadster', base: '#e8eef5' });
  assert.equal(view.bodyKind, 'roadster');
  assert.notEqual(view.flameOuterMat.color.getHex(), classicFlame, 'electric boost colour');
  assert.notDeepEqual(view.nozzleLocal.toArray(), classicNozzle.toArray());
  assert.equal(view.paintMat.color.getHexString(), 'e8eef5', 'humps and arches follow the paint');
  assert.deepEqual(view.wheels.map((w) => w.steer), wheels);
  for (const w of wheels) assert.ok(view.group.children.includes(w));
  view.setSkin(null);
  assert.equal(view.bodyKind, 'classic');
  assert.equal(view.bodyMat.color.getHexString(), 'f0661a');
  assert.ok(view.shell.children.includes(view.bodyMesh));
});

test('the roadster stays inside the classic car footprint (same hitbox, fair play)', () => {
  const size = (body) => {
    const view = new CarView(makeStaticCar({ id: 'x', team: 'blue' }), new THREE.Group());
    view.setBody(body);
    view.group.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(view.shell);
  };
  const classic = size('classic'), roadster = size('roadster');
  assert.ok(roadster.max.y < classic.max.y, 'lower than the classic car');
  assert.ok(Math.abs(roadster.min.z - classic.min.z) < 0.06 && Math.abs(roadster.max.z - classic.max.z) < 0.06, 'same length');
  assert.ok(Math.abs(roadster.max.x - classic.max.x) < 0.05, 'same width');
});

test('the host keeps a guest\'s roadster in the roster', () => {
  const sent = [];
  // 2v2 so the room is not full yet and the match (physics) does not start.
  const match = new MatchHost({ RAPIER: null, roomCode: 'K7M2', teamSize: 2 });
  const host = { send: (m) => sent.push(m) };
  match.join(host, 'Kurucu', { local: true });
  match.handlePacket({ send: (m) => sent.push(m) }, { type: 'join', name: 'Misafir', version: PROTOCOL_VERSION, skin: { body: 'roadster' } });
  const roster = sent.filter((m) => m.type === 'roster').at(-1);
  assert.ok(roster, 'roster sent');
  const guest = roster.seats.find((s) => s.name === 'Misafir');
  assert.equal(guest?.skin?.body, 'roadster');
  match.dispose();
});

test('online page: secret codes are checked before the room code and the garage has the car row', () => {
  const online = readFileSync(new URL('../src/online-main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(online, /redeemSecret\(el\('room-code'\)\)\) return;\s+const typed/);
  for (const id of ['garage-body-row', 'garage-body']) assert.match(html, new RegExp(`id="${id}"`));
});
