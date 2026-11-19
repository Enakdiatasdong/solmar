// Keyboard, mouse and a cheap touch layer. Held controls are read as state; one-shot presses are
// queued as bit flags and taken exactly once by the loop. Mouse drag orbits the camera, a click
// without a drag fires. Wheel switches weapons on foot; Ctrl-wheel and driving wheel zoom.
// The touch buttons in the HTML map to the
// same action flags, so the game is playable without a keyboard.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_FIRE = 16;
export const ACTION_MENU = 32;
export const ACTION_MUTE = 64;
export const ACTION_RESTART = 128;
export const ACTION_JETPACK = 256;
export const ACTION_HORN = 512;
export const ACTION_BUY_AMMO = 1024;
export const ACTION_RADIO = 2048;


const KEYMAP = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

export function createInput(target, canCycleWeapon = () => false) {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches) {
    document.body?.classList.add('touch');
    document.getElementById('touch')?.setAttribute('aria-hidden', 'false');
  }
  const held = { up: false, down: false, left: false, right: false, jump: false, descend: false };
  const touchHeld = { up: false, down: false, left: false, right: false, run: false };
  const directionKeys = new Set();
  const runKeys = new Set();
  const aimKeys = new Set();
  // Aim mode (hold right mouse / Alt / touch AIM). Right-button state is tracked
  // separately from the left-button drag orbit, so aiming never starts a drag.
  let aiming = false;
  let touchAim = false;
  let actions = 0;
  let dragX = 0;
  let dragY = 0;
  let wheel = 0;
  let weaponWheel = 0;
  let weapon = null;
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let downAt = 0;
  let moved = 0;

  function queue(action) {
    actions |= action;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (KEYMAP[event.code] || event.code === 'Space') event.preventDefault();
      return;
    }
    const direction = KEYMAP[event.code];
    if (direction) {
      directionKeys.add(event.code);
      held[direction] = true;
      event.preventDefault();
      return;
    }
    if (/^Digit[1-5]$/.test(event.code)) {
      weapon = Number(event.code.slice(-1)) - 1;
      event.preventDefault();
      return;
    }
    switch (event.code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        runKeys.add(event.code);
        break;
      case 'AltLeft':
      case 'AltRight':
        aimKeys.add(event.code);
        break;
      case 'Space':
        held.jump = true;
        queue(ACTION_CONFIRM);
        event.preventDefault();
        break;
      case 'Enter':
        queue(ACTION_CONFIRM);
        break;
      case 'KeyE':
        queue(ACTION_ENTER);
        break;
      case 'KeyJ':
        queue(ACTION_JETPACK);
        break;
      case 'KeyC':
        held.descend = true;
        break;
      case 'KeyF':
        queue(ACTION_PUNCH);
        break;
      case 'KeyB':
        queue(ACTION_BUY_AMMO);
        break;
      case 'KeyH':
        queue(ACTION_HORN);
        break;
      case 'KeyV':
        queue(ACTION_RADIO);
        break;
      case 'KeyM':
        if (event.shiftKey) queue(ACTION_MUTE);
        else queue(ACTION_MENU);
        break;
      case 'KeyN':
        queue(ACTION_MUTE);
        break;
      case 'KeyQ':
        queue(ACTION_PAUSE);
        break;
      case 'KeyP':
      case 'Escape':
        queue(ACTION_PAUSE);
        event.preventDefault();
        break;
      case 'KeyR':
        queue(ACTION_RESTART);
        break;
      default:
        return;
    }
  });

  window.addEventListener('keyup', (event) => {
    const direction = KEYMAP[event.code];
    if (direction) {
      directionKeys.delete(event.code);
      held[direction] = [...directionKeys].some((code) => KEYMAP[code] === direction);
      return;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') runKeys.delete(event.code);
    if (event.code === 'AltLeft' || event.code === 'AltRight') aimKeys.delete(event.code);
    if (event.code === 'Space') held.jump = false;
    if (event.code === 'KeyC') held.descend = false;
  });

  function clearHeld() {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    held.jump = false;
    held.descend = false;
    directionKeys.clear();
    runKeys.clear();
    aimKeys.clear();
    aiming = false;
    touchAim = false;
    touchHeld.up = false;
    touchHeld.down = false;
    touchHeld.left = false;
    touchHeld.right = false;
    touchHeld.run = false;
    dragging = false;
    pointerId = null;
    dragX = 0;
    dragY = 0;
    wheel = 0;
    weaponWheel = 0;
    weapon = null;
  }
  window.addEventListener('blur', clearHeld);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearHeld();
  });

  if (target && target.addEventListener) {
    target.addEventListener('contextmenu', (event) => event.preventDefault());
    target.addEventListener('pointerdown', (event) => {
      // Right button held = aim mode; it never starts a camera drag.
      if (event.button === 2) {
        aiming = true;
        return;
      }
      if (event.button !== undefined && event.button !== 0) return;
      pointerId = event.pointerId;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      downAt = performance.now();
      moved = 0;
      target.setPointerCapture?.(event.pointerId);
    });
    target.addEventListener('pointermove', (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      dragX += dx;
      dragY += dy;
      moved += Math.abs(dx) + Math.abs(dy);
    });
    const release = (event) => {
      if (event.button === 2) {
        aiming = false;
        return;
      }
      if (event.pointerId !== pointerId) return;
      const elapsed = performance.now() - downAt;
      if (moved < 7 && elapsed < 380) queue(ACTION_FIRE);
      dragging = false;
      pointerId = null;
    };
    target.addEventListener('pointerup', release);
    target.addEventListener('pointercancel', () => {
      aiming = false;
      dragging = false;
      pointerId = null;
    });
    target.addEventListener('wheel', (event) => {
      if (!dragging && !event.ctrlKey && canCycleWeapon()) weaponWheel += Math.sign(event.deltaY);
      else wheel += Math.sign(event.deltaY);
      event.preventDefault();
    }, { passive: false });
  }

  // Cheap touch controls: elements with data-touch="up" etc. hold their direction while pressed.
  const touchButtons = typeof document !== 'undefined' ? document.querySelectorAll('[data-touch]') : [];
  for (const button of touchButtons) {
    const name = button.getAttribute('data-touch');
    const press = (event) => {
      event.preventDefault();
      if (name === 'enter') queue(ACTION_ENTER);
      else if (name === 'fire') queue(ACTION_FIRE);
      else if (name === 'punch') queue(ACTION_PUNCH);
      else if (name === 'menu') queue(ACTION_MENU);
      else if (name === 'aim') touchAim = true;
      else if (name === 'run') touchHeld.run = true;
      else if (touchHeld[name] !== undefined) touchHeld[name] = true;
    };
    const lift = (event) => {
      event.preventDefault();
      if (name === 'run') touchHeld.run = false;
      else if (name === 'aim') touchAim = false;
      else if (touchHeld[name] !== undefined) touchHeld[name] = false;
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', lift);
    button.addEventListener('pointercancel', lift);
    button.addEventListener('pointerleave', lift);
  }

  return {
    state() {
      return {
        up: held.up || touchHeld.up,
        down: held.down || touchHeld.down,
        left: held.left || touchHeld.left,
        right: held.right || touchHeld.right,
        run: runKeys.size > 0 || touchHeld.run,
        jump: held.jump,
        descend: held.descend,
        brake: held.down,
      };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeOrbit() {
      const delta = { x: dragX, y: dragY };
      dragX = 0;
      dragY = 0;
      return delta;
    },
    takeWheel() {
      const value = wheel;
      wheel = 0;
      return value;
    },
    takeWeaponWheel() {
      const value = weaponWheel;
      weaponWheel = 0;
      return value;
    },
    takeWeapon() {
      const value = weapon;
      weapon = null;
      return value;
    },
    isDragging() {
      return dragging;
    },
    isAiming() {
      return aiming || touchAim || aimKeys.size > 0;
    },
    clearHeld,
  };
}
