import { CAMERA } from './config.js';

export const CAMERA_MODE_ORDER = Object.freeze(['near', 'far', 'top', 'first']);
export const CAMERA_MODE_LABELS = Object.freeze(Object.fromEntries(
  CAMERA_MODE_ORDER.map((mode) => [mode, CAMERA.modes[mode].label]),
));

export function cameraModeParams(mode, inCar) {
  const { foot, car, label } = CAMERA.modes[CAMERA_MODE_ORDER.includes(mode) ? mode : 'near'];
  return { ...(inCar ? car : foot), label };
}

export function nextCameraMode(mode) {
  return CAMERA_MODE_ORDER[(CAMERA_MODE_ORDER.indexOf(mode) + 1) % CAMERA_MODE_ORDER.length];
}

export function aimFovFor(modeFov) {
  return modeFov - CAMERA.aimFovDelta;
}
