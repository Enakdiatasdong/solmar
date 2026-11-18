// Input is a queue of deliberate actions plus a continuous keyboard state.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_RESTART = 'restart';
export const ACTION_MUTE = 'mute';
export const ACTION_MENU = 'menu';
export const ACTION_ENTER = 'enter';
export const ACTION_PUNCH = 'punch';
export const ACTION_FIRE = 'fire';
export const ACTION_JUMP = 'jump';

export function createInput(target) {
  const held = new Set();
  const actions = [];
  const pointer = { dx: 0, dy: 0, wheel: 0 };
  const listeners = [];
  let drag = null;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  document.body.classList.toggle('touch', Boolean(coarse || 'ontouchstart' in window));
  const listen = (element, type, callback, options) => {
    element.addEventListener(type, callback, options);
    listeners.push(() => element.removeEventListener(type, callback, options));
  };
  const actionFor = (code, shift) => {
    if (code === 'Enter') return ACTION_CONFIRM;
    if (['Escape', 'KeyP', 'KeyQ'].includes(code)) return ACTION_PAUSE;
    if (code === 'KeyR') return ACTION_RESTART;
    if (code === 'KeyN' || code === 'KeyM' && shift) return ACTION_MUTE;
    if (code === 'KeyM') return ACTION_MENU;
    if (code === 'KeyE') return ACTION_ENTER;
    if (code === 'KeyF') return ACTION_PUNCH;
    return null;
  };
  listen(window, 'keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    held.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space') actions.push(ACTION_CONFIRM, ACTION_JUMP);
    const action = actionFor(event.code, event.shiftKey);
    if (action) actions.push(action);
  });
  listen(window, 'keyup', event => held.delete(event.code));
  listen(window, 'blur', () => { held.clear(); drag = null; });
  listen(target, 'pointerdown', event => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
    target.setPointerCapture?.(event.pointerId);
  });
  listen(target, 'pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.distance += Math.abs(dx) + Math.abs(dy);
    drag.x = event.clientX;
    drag.y = event.clientY;
    pointer.dx += dx;
    pointer.dy += dy;
  });
  const release = event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (event.type === 'pointerup' && drag.distance < 6) actions.push(ACTION_FIRE);
    drag = null;
  };
  listen(target, 'pointerup', release);
  listen(target, 'pointercancel', release);
  listen(target, 'contextmenu', event => event.preventDefault());
  listen(target, 'wheel', event => {
    event.preventDefault();
    pointer.wheel += event.deltaY;
  }, { passive: false });
  document.querySelectorAll('[data-touch]').forEach(button => {
    const code = button.dataset.touch;
    listen(button, 'pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
      button.setPointerCapture?.(event.pointerId);
      held.add(code);
      if (code === 'Space') actions.push(ACTION_JUMP, ACTION_CONFIRM);
      else if (code === 'Fire') actions.push(ACTION_FIRE);
      else {
        const action = actionFor(code, false);
        if (action) actions.push(action);
      }
    });
    const clear = event => {
      event.preventDefault();
      event.stopPropagation();
      held.delete(code);
    };
    listen(button, 'pointerup', clear);
    listen(button, 'pointercancel', clear);
  });
  return {
    down: code => held.has(code),
    consumeActions: () => actions.splice(0),
    consumePointer() {
      const next = { ...pointer };
      pointer.dx = pointer.dy = pointer.wheel = 0;
      return next;
    },
    destroy() { listeners.forEach(remove => remove()); held.clear(); actions.length = 0; },
  };
}
