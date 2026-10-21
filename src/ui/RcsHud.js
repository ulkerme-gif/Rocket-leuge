/**
 * HUD for a car with RCS thrusters (the secret YILDIRIM car), on both pages.
 *
 * - body.rcs-car      : you drive an RCS car (shows the "RCS ∞" badge and the flight hints)
 * - body.rcs-air      : ...and it is in the air: ZIPLA reads YUKARI ▲, DRIFT reads İN ▼
 * - #rcs-badge[data-jet] : 0 idle, 1 hover, 2 rising, -1 descending (glows while firing)
 *
 * Only toggles classes / attributes when something changes, so it is cheap to call every frame.
 * The buttons keep their data-touch-action (jump / handbrake): the car reads them differently.
 */
const ARIA = {
  jump: { std: null, rcs: 'Zıpla. Basılı tutarsan uçarsın; havada yüksel' },
  handbrake: { std: null, rcs: 'Drift; havada alçal' },
};

export class RcsHud {
  constructor(doc = typeof document !== 'undefined' ? document : null) {
    this.doc = doc;
    this.enabled = null;
    this.air = null;
    this.jet = null;
  }

  /** @param {{enabled:boolean, airborne?:boolean, jet?:number}} s */
  set({ enabled, airborne = false, jet = 0 }) {
    const body = this.doc?.body;
    if (!body) return;
    const on = !!enabled;
    const air = on && !!airborne;
    const firing = on ? String(jet | 0) : '0';
    if (on !== this.enabled) {
      this.enabled = on;
      body.classList.toggle('rcs-car', on);
      this.doc.getElementById?.('rcs-badge')?.classList.toggle('hidden', !on);
      for (const [action, labels] of Object.entries(ARIA)) {
        const button = this.doc.querySelector?.(`#touch-controls [data-touch-action="${action}"]`);
        if (!button) continue;
        labels.std ??= button.getAttribute('aria-label');
        button.setAttribute('aria-label', on ? labels.rcs : labels.std);
      }
    }
    if (air !== this.air) {
      this.air = air;
      body.classList.toggle('rcs-air', air);
    }
    if (firing !== this.jet) {
      this.jet = firing;
      const badge = this.doc.getElementById?.('rcs-badge');
      if (badge) badge.dataset.jet = firing;
    }
  }

  clear() {
    this.set({ enabled: false });
  }
}
