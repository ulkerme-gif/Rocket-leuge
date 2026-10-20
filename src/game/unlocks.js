/**
 * Secret unlocks. A code typed into the online page's ODA KODU box unlocks a reward
 * on this tablet. Room codes never contain 0/O/1/I/L (see src/net/roomCode.js), so a
 * code made of those characters can never collide with a real room.
 */
export const UNLOCKS_KEY = 'rocket-arena-unlocks';

const SECRET_CODES = Object.freeze({
  1331: 'roadster',
});

/** Reward id for a typed code, or null. Accepts " 13-31 " style input. */
export function codeReward(text) {
  const code = String(text ?? '').toUpperCase().replace(/[\s_-]+/g, '');
  return Object.hasOwn(SECRET_CODES, code) ? SECRET_CODES[code] : null;
}

export function loadUnlocks(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(UNLOCKS_KEY) ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export const isUnlocked = (id, storage = globalThis.localStorage) => loadUnlocks(storage).has(id);

/** Unlocks a reward on this device. Returns true the first time, false if it was already unlocked. */
export function unlock(id, storage = globalThis.localStorage) {
  const unlocks = loadUnlocks(storage);
  if (unlocks.has(id)) return false;
  unlocks.add(id);
  try { storage?.setItem(UNLOCKS_KEY, JSON.stringify([...unlocks])); } catch { /* private mode */ }
  return true;
}
