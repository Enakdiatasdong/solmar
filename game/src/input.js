import { MathUtils } from '../vendor/three.module.min.js';
export const ACTION_ENTER = 'enter';
export const ACTION_PUNCH = 'punch';
export const ACTION_FIRE = 'fire';
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_RESTART = 'restart';
export const ACTION_MENU = 'menu';
export const ACTION_MUTE = 'mute';
export const ACTION_JUMP = 'jump';
export const ACTION_CAMERA = 'camera';
export const ACTION_RADIO = 'radio';
export const ACTION_WORKSHOP = 'workshop';

export function createInput(target) {
  const held = new Set(), touchHeld = new Map(), actions = [], disposers = [];
  const look = { dx: 0, dy: 0, zoom: 0 };
  const actionKeys = { KeyE: ACTION_ENTER, KeyF: ACTION_PUNCH, Enter: ACTION_CONFIRM, Escape: ACTION_PAUSE, KeyP: ACTION_PAUSE, KeyQ: ACTION_RADIO, KeyC: ACTION_CAMERA, KeyG: ACTION_WORKSHOP, KeyR: ACTION_RESTART, KeyN: ACTION_MUTE, KeyM: ACTION_MENU };
  const movement = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', brake: 'Space', jump: 'Space' };
  const touchActions = { enter: ACTION_ENTER, punch: ACTION_PUNCH, fire: ACTION_FIRE, pause: ACTION_PAUSE, jump: ACTION_JUMP, confirm: ACTION_CONFIRM };
  let dragging = false, pointerX = 0, pointerY = 0, moved = 0;
  function on(element, name, handler, options) { element.addEventListener(name, handler, options); disposers.push(() => element.removeEventListener(name, handler, options)); }
  function reset() { held.clear(); touchHeld.clear(); dragging = false; actions.length = 0; look.dx = look.dy = look.zoom = 0; }
  on(window, 'keydown', event => {
    if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (['Enter', 'Space'].includes(event.code) && event.target.closest?.('button, a, summary')) return;
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
    held.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space') actions.push(ACTION_CONFIRM, ACTION_JUMP);
    else if (event.code === 'KeyM' && event.shiftKey) actions.push(ACTION_MUTE);
    else if (actionKeys[event.code]) actions.push(actionKeys[event.code]);
  });
  on(window, 'keyup', event => held.delete(event.code));
  on(window, 'blur', reset);
  on(target, 'contextmenu', event => event.preventDefault());
  on(target, 'pointerdown', event => {
    if (event.pointerType === 'touch') return;
    dragging = true; pointerX = event.clientX; pointerY = event.clientY; moved = 0;
    target.setPointerCapture?.(event.pointerId);
  });
  on(target, 'pointermove', event => {
    if (!dragging) return;
    const dx = event.clientX - pointerX, dy = event.clientY - pointerY;
    moved += Math.abs(dx) + Math.abs(dy);
    look.dx += MathUtils.clamp(dx, -100, 100); look.dy += MathUtils.clamp(dy, -100, 100);
    pointerX = event.clientX; pointerY = event.clientY;
  });
  on(target, 'pointerup', event => { if (dragging && moved < 6 && event.button === 0) actions.push(ACTION_FIRE); dragging = false; });
  on(target, 'pointercancel', () => { dragging = false; });
  on(target, 'wheel', event => { event.preventDefault(); look.zoom += Math.sign(event.deltaY); }, { passive: false });
  if (('ontouchstart' in window) || window.matchMedia?.('(pointer: coarse)').matches) document.body.classList.add('touch');
  for (const button of document.querySelectorAll('[data-touch]')) {
    const command = button.dataset.touch;
    on(button, 'pointerdown', event => {
      event.preventDefault(); button.setPointerCapture?.(event.pointerId);
      if (movement[command]) touchHeld.set(event.pointerId, movement[command]);
      if (touchActions[command]) actions.push(touchActions[command]);
      button.classList.add('pressed');
    });
    const release = event => { touchHeld.delete(event.pointerId); button.classList.remove('pressed'); };
    on(button, 'pointerup', release); on(button, 'pointercancel', release);
  }
  const aliases = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD', ShiftRight: 'ShiftLeft' };
  function down(code) {
    const canonical = aliases[code] || code;
    return held.has(code) || held.has(canonical) || [...held].some(key => aliases[key] === canonical) || [...touchHeld.values()].includes(canonical);
  }
  return { down, takeActions: () => actions.splice(0), takeLook: () => { const result = { ...look }; look.dx = look.dy = look.zoom = 0; return result; }, reset, dispose: () => { for (const dispose of disposers) dispose(); reset(); } };
}
