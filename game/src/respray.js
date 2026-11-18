// A garage drive-in service that trades cash for a clean wanted state.
import * as THREE from '../vendor/three.module.min.js';
import { POLICE } from './config.js';

const BASE_FEE = 100;
const FEE_PER_STAR = 100;
const GARAGE_RADIUS = 12;
const PAINT_COLORS = [0x49c6b8, 0x7a4f8e, 0xd2b24c, 0x4c6f9e];

function wantedLevel(value) {
  const level = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(0, Math.min(POLICE.maxWanted, level));
}

export function resprayFee(wanted) {
  const stars = wantedLevel(wanted);
  return stars === 0 ? 0 : BASE_FEE + FEE_PER_STAR * stars;
}

export function createRespray({ scene, city, hud, audio, police, player, stats, getCash, setCash, onPaid }) {
  const state = { insideGarage: false, lastResult: null };
  const garage = city?.landmarks?.garage;
  const paintedCars = new WeakMap();
  let elapsed = 0;
  const marker = new THREE.Group();
  marker.name = 'solmar-respray-marker';
  if (garage) marker.position.set(garage.x, 0, garage.z);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.12, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0x49c6b8, transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 1.4, 8, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x49c6b8, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  beam.position.y = 4;
  marker.add(ring, beam);
  scene?.add?.(marker);

  function repaint(car) {
    if (!car?.group?.traverse || !Number.isFinite(car.spec?.body)) return false;
    const previous = paintedCars.get(car);
    const fromColor = previous?.color ?? car.spec.body;
    const paintIndex = ((previous?.index ?? -1) + 1) % PAINT_COLORS.length;
    const toColor = PAINT_COLORS[paintIndex];
    let changed = false;
    car.group.traverse((node) => {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material?.color?.getHex?.() !== fromColor) continue;
        material.color.setHex(toColor);
        changed = true;
      }
    });
    if (changed) paintedCars.set(car, { color: toColor, index: paintIndex });
    return changed;
  }

  function pay(car = player?.state?.inCar ?? null) {
    const stars = wantedLevel(police.state.wanted);
    if (stars === 0) {
      const result = { ok: false, reason: 'clean', fee: 0 };
      state.lastResult = result;
      hud?.toast?.('Already clean — no respray needed.', 'info', 2.6);
      return result;
    }

    const cost = resprayFee(stars);
    const cash = getCash();
    if (cash < cost) {
      const shortfall = cost - cash;
      const result = { ok: false, reason: 'insufficient-cash', fee: cost, shortfall };
      state.lastResult = result;
      hud?.toast?.(`You need $${shortfall.toLocaleString('en-US')} more to clear the heat.`, 'info', 3);
      return result;
    }

    setCash(cash - cost);
    stats?.recordMoneySpent?.(cost);
    police.clear();
    audio?.updateSiren?.(0);
    hud?.setWanted?.(0);
    const carRepainted = repaint(car);
    const result = { ok: true, reason: 'paid', fee: cost, stars, carRepainted };
    state.lastResult = result;
    hud?.toast?.(`Respray done — heat cleared ($${cost.toLocaleString('en-US')}).`, 'mission', 3.5);
    onPaid?.(result);
    return result;
  }

  function update(dt, player) {
    elapsed += Number.isFinite(dt) ? dt : 0;
    ring.rotation.z += (Number.isFinite(dt) ? dt : 0) * 0.4;
    beam.material.opacity = 0.12 + (Math.sin(elapsed * 3) + 1) * 0.035;
    const car = player?.state?.inCar;
    const position = car?.state;
    const inside = Boolean(position && garage
      && Math.hypot(position.x - garage.x, position.z - garage.z) <= GARAGE_RADIUS);
    if (!inside) {
      state.insideGarage = false;
      return null;
    }
    if (state.insideGarage) return null;
    state.insideGarage = true;
    return pay(car);
  }

  function reset() {
    state.insideGarage = false;
    state.lastResult = null;
    elapsed = 0;
    ring.rotation.z = 0;
  }

  return {
    state,
    group: marker,
    garage,
    radius: GARAGE_RADIUS,
    fee: resprayFee,
    pay,
    update,
    reset,
  };
}
