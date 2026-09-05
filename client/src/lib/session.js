// ============================================================
//  session.js — client-side inactivity watchdog.
//
//  Tracks real user activity (mouse / keyboard / scroll / touch). If nothing
//  happens for `idleMs` it calls onIdle() so the app can log out immediately.
//  While the user IS active it fires onBeat() periodically (a heartbeat), so
//  someone who is only reading isn't logged out by the server.
//
//  The server enforces the same timeout independently — this is the UX half,
//  not the security boundary.
// ============================================================

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart', 'click'];

export function startIdleWatch({ idleMs, heartbeatMs = 60000, onIdle, onBeat }) {
  let lastActivity = Date.now();
  let activeSinceBeat = false;
  let stopped = false;

  const mark = () => { lastActivity = Date.now(); activeSinceBeat = true; };
  EVENTS.forEach((e) => window.addEventListener(e, mark, { passive: true }));

  const tick = setInterval(() => {
    if (stopped) return;
    if (Date.now() - lastActivity >= idleMs) { stop(); onIdle?.(); }
  }, 5000);

  const beat = setInterval(() => {
    if (stopped || !activeSinceBeat) return;
    activeSinceBeat = false;
    onBeat?.();
  }, heartbeatMs);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(tick);
    clearInterval(beat);
    EVENTS.forEach((e) => window.removeEventListener(e, mark));
  }

  return stop;
}
