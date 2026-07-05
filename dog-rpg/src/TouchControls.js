// touch controls: virtual joystick + action buttons feeding the EXISTING keys object.
// pointer events are keyed by pointerId so the joystick + buttons are true multitouch.
// nothing here duplicates gameplay logic: it mutates the same keys object and calls the
// same interact()/attack()/sniff() that the keyboard handlers use.

const T = 0.4;        // per-axis activation threshold for the tank booleans
const RADIUS = 60;    // px of thumb travel that maps to magnitude 1
const DEADZONE = 0.15;

// dynamic-origin joystick: the base appears wherever the thumb first lands.
// exposes a live { x, y } vector in [-1,1] (+x = right, +y = up).
function createJoystick(zone) {
  const base = document.createElement('div');
  const thumb = document.createElement('div');
  base.className = 'vj-base';
  thumb.className = 'vj-thumb';
  base.appendChild(thumb);
  base.style.display = 'none';
  zone.appendChild(base);

  let pointerId = null;
  let ox = 0, oy = 0;
  const out = { x: 0, y: 0 };

  function reset() {
    out.x = 0; out.y = 0;
    base.style.display = 'none';
    pointerId = null;
  }
  function onDown(e) {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    ox = e.clientX; oy = e.clientY;
    base.style.left = ox + 'px';
    base.style.top = oy + 'px';
    base.style.display = 'block';
    thumb.style.transform = 'translate(-50%, -50%)';
    zone.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onMove(e) {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - ox, dy = e.clientY - oy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, RADIUS);
    const ux = dist ? dx / dist : 0;
    const uy = dist ? dy / dist : 0;
    thumb.style.transform =
      `translate(calc(-50% + ${ux * clamped}px), calc(-50% + ${uy * clamped}px))`;
    let m = clamped / RADIUS;
    if (m < DEADZONE) m = 0; else m = (m - DEADZONE) / (1 - DEADZONE);
    out.x = ux * m;    // +x = right
    out.y = -uy * m;   // +y = up (flip screen-down so pushing up is forward)
    e.preventDefault();
  }
  function onUp(e) {
    if (e.pointerId !== pointerId) return;
    reset();
    e.preventDefault();
  }
  zone.addEventListener('pointerdown', onDown, { passive: false });
  zone.addEventListener('pointermove', onMove, { passive: false });
  zone.addEventListener('pointerup', onUp, { passive: false });
  zone.addEventListener('pointercancel', onUp, { passive: false });
  return { value: out, reset, active: () => pointerId !== null };
}

// fire-once-on-press button (bite / beg / sniff); flashes .pressed while held.
function bindTap(el, action) {
  let id = null;
  el.addEventListener('pointerdown', e => {
    if (id !== null) return;
    id = e.pointerId; el.setPointerCapture(id);
    el.classList.add('pressed'); action(); e.preventDefault();
  }, { passive: false });
  const rel = e => {
    if (e.pointerId !== id) return;
    id = null; el.classList.remove('pressed'); e.preventDefault();
  };
  el.addEventListener('pointerup', rel, { passive: false });
  el.addEventListener('pointercancel', rel, { passive: false });
}

// on/off toggle button (run/sprint); .pressed reflects the persistent state so a
// second thumb stays free to steer while sprinting.
function bindToggle(el, onChange) {
  let id = null;
  let on = false;
  el.addEventListener('pointerdown', e => {
    if (id !== null) return;
    id = e.pointerId; el.setPointerCapture(id);
    on = !on;
    el.classList.toggle('pressed', on);
    onChange(on);
    e.preventDefault();
  }, { passive: false });
  const rel = e => {
    if (e.pointerId !== id) return;
    id = null; e.preventDefault();   // leave .pressed reflecting `on`
  };
  el.addEventListener('pointerup', rel, { passive: false });
  el.addEventListener('pointercancel', rel, { passive: false });
  return {
    reset() { id = null; on = false; el.classList.remove('pressed'); },
  };
}

export function initTouchControls({ keys, interact, attack, sniff }) {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const root = document.getElementById('touch-controls');
  if (!root) return { update() {}, show() {}, isTouch };

  const joy = createJoystick(document.getElementById('stick-zone'));

  const sprint = bindToggle(document.getElementById('btn-sprint'), on => { keys.shift = on; });
  bindTap(document.getElementById('btn-bite'), () => attack());
  bindTap(document.getElementById('btn-beg'), () => interact());
  bindTap(document.getElementById('btn-sniff'), () => sniff());

  // anti-stuck-key insurance: clear everything if the app is backgrounded mid-press
  const clearAll = () => {
    joy.reset();
    keys.w = keys.a = keys.s = keys.d = false;
    keys.shift = false;
    sprint.reset();
  };
  window.addEventListener('blur', clearAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); });

  // called once per frame from animate(). authoritative ONLY while the joystick is held:
  // when idle we leave w/a/s/d to the keyboard (so a hybrid touch+keyboard laptop is never
  // clobbered) and clear them exactly once on the release transition. keys.shift is owned
  // by the RUN toggle.
  let joyWasActive = false;
  function update() {
    if (!joy.active()) {
      if (joyWasActive) { keys.w = keys.a = keys.s = keys.d = false; joyWasActive = false; }
      return;
    }
    joyWasActive = true;
    const { x, y } = joy.value;
    keys.w = y > T;    // push up   -> forward
    keys.s = y < -T;   // pull down -> back
    keys.a = x < -T;   // left      -> turn left
    keys.d = x > T;    // right     -> turn right
  }

  function show() {
    if (!isTouch) return;
    root.style.display = 'block';
  }

  return { update, show, isTouch };
}
