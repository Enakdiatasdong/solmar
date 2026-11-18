// Arcade cars: box bodies with cabins, bumpers, lights and spinning wheels. Jax has a starter car,
// a handful of other cars are parked and stealable, and damaged cars smoke when wrecked. The
// driving model is deliberately simple: accelerate, brake/reverse, steer with speed-scaled grip,
// handbrake for a loose tail. Collision with buildings uses the city AABBs and the car's radius.
import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, STARTER_CAR, VEHICLE } from './config.js';
import { clampToWorld, resolveCollisions } from './world.js';

const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10);
wheelGeometry.rotateZ(Math.PI / 2);
const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x1d1e21 });
const glassMaterial = new THREE.MeshLambertMaterial({ color: 0x24323c });
const lightMaterial = new THREE.MeshLambertMaterial({ color: 0xfff1c0, emissive: 0xffcf7a, emissiveIntensity: 0.6 });
const brakeMaterial = new THREE.MeshLambertMaterial({ color: 0xa32f2a, emissive: 0x8c1f1c, emissiveIntensity: 0.5 });

function buildCarMesh(spec) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: spec.body });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.62, 4.4), bodyMaterial);
  body.position.y = 0.66;
  body.castShadow = true;
  group.add(body);

  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.3, 4.1), new THREE.MeshLambertMaterial({ color: spec.cabin }));
  lower.position.y = 0.36;
  group.add(lower);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.56, 2.15), glassMaterial);
  cabin.position.set(0, 1.2, -0.15);
  cabin.castShadow = true;
  group.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 2.2), bodyMaterial);
  roof.position.set(0, 1.51, -0.15);
  group.add(roof);

  if (spec.variant === 'van') {
    cabin.scale.set(0.96, 1.5, 1.3);
    cabin.position.set(0, 1.42, -0.1);
    roof.position.set(0, 1.9, -0.1);
  } else if (spec.variant === 'pickup') {
    cabin.scale.set(1, 0.9, 0.8);
    cabin.position.set(0, 1.13, -0.7);
    roof.position.set(0, 1.44, -0.7);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 1.5), new THREE.MeshLambertMaterial({ color: spec.cabin }));
    bed.position.set(0, 1.06, 1.2);
    group.add(bed);
  } else if (spec.variant === 'coupe') {
    cabin.scale.set(0.94, 0.8, 0.86);
    cabin.position.set(0, 1.12, -0.35);
    roof.position.set(0, 1.38, -0.35);
    body.scale.set(1, 0.9, 1);
  }

  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMaterial);
    head.position.set(side * 0.68, 0.76, 2.2);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.08), brakeMaterial);
    tail.position.set(side * 0.68, 0.78, -2.2);
    group.add(tail);
  }

  const wheels = [];
  for (const [x, z] of [[-1.04, 1.38], [1.04, 1.38], [-1.04, -1.38], [1.04, -1.38]]) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.position.set(x, 0.42, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push({ mesh: wheel, front: z > 0 });
  }

  if (spec.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 3.4), new THREE.MeshLambertMaterial({ color: spec.stripe }));
    stripe.position.y = 0.82;
    group.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.3), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    bar.position.set(0, 1.64, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.32), new THREE.MeshLambertMaterial({ color: spec.lightAlt, emissive: spec.lightAlt, emissiveIntensity: 1.4 }));
    red.position.set(-0.3, 1.76, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.32), new THREE.MeshLambertMaterial({ color: spec.light, emissive: spec.light, emissiveIntensity: 1.4 }));
    blue.position.set(0.3, 1.76, -0.2);
    group.add(blue);
    group.userData.lightbar = { red, blue };
  }

  return { group, wheels };
}

function addSmoke(car) {
  if (car.smoke) return car.smoke;
  const smoke = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0x66625e, transparent: true, opacity: 0.55 });
  const puffs = [];
  for (let puff = 0; puff < 5; puff += 1) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + puff * 0.09, 0), material.clone());
    mesh.position.y = 0.6 + puff * 0.28;
    mesh.visible = false;
    smoke.add(mesh);
    puffs.push(mesh);
  }
  smoke.visible = false;
  car.group.add(smoke);
  car.smoke = { group: smoke, puffs, material };
  return car.smoke;
}

export function createVehicles(city, scene) {
  const cityColliders = city?.colliders ?? [];
  const cars = [];
  const collisionGroups = [cars];
  const smokeMaterial = new THREE.MeshLambertMaterial({ color: 0x55524e, transparent: true, opacity: 0.5 });

  function addCar(spec, position, heading, options = {}) {
    const built = buildCarMesh(spec);
    const group = built.group;
    group.position.set(position.x, 0, position.z);
    group.rotation.y = heading;
    scene.add(group);
    const car = {
      id: options.id ?? `car-${cars.length}`,
      group,
      wheels: built.wheels,
      spec,
      state: {
        x: position.x,
        z: position.z,
        heading,
        speed: 0,
        steerAngle: 0,
        health: VEHICLE.health,
        maxHealth: VEHICLE.health,
        wrecked: false,
        occupied: false,
        stolen: Boolean(options.stolen),
        isPolice: Boolean(spec.police),
        wheelSpin: 0,
        bob: 0,
      },
      smoke: null,
      ai: options.ai ?? null,
      kind: options.kind ?? 'parked',
    };
    cars.push(car);
    return car;
  }

  function spawnStarter() {
    return addCar(
      { body: 0xc9a227, cabin: 0x2d2a22, name: 'Cometa GT', variant: 'coupe' },
      { x: STARTER_CAR.x, z: STARTER_CAR.z },
      STARTER_CAR.heading,
      { id: 'starter', stolen: true },
    );
  }

  function spawnParked(random) {
    const edges = city?.graph?.edges ?? [];
    const spots = [];
    for (const edge of edges) {
      for (const t of [0.22, 0.5, 0.78]) {
        const centerX = edge.a.x + edge.dx * t;
        const centerZ = edge.a.z + edge.dz * t;
        const normalX = -edge.dz / edge.length;
        const normalZ = edge.dx / edge.length;
        for (const side of [-1, 1]) {
          const x = centerX + normalX * side * 5.2;
          const z = centerZ + normalZ * side * 5.2;
          if (resolveCollisions(cityColliders, x, z, 2.25).hit) continue;
          spots.push({ x, z, heading: Math.atan2(edge.dx, edge.dz) });
        }
      }
    }
    random.shuffle(spots);
    let spawned = 0;
    for (const spot of spots) {
      if (spawned >= 9) break;
      if (cars.some((car) => Math.hypot(car.state.x - spot.x, car.state.z - spot.z) < 12)) continue;
      const base = PALETTE.cars[spawned % PALETTE.cars.length];
      const variant = random.pick(['sedan', 'coupe', 'van', 'pickup']);
      const spec = {
        ...base,
        name: variant === 'coupe' ? 'Cometa GT' : variant === 'pickup' ? 'Bison Pickup' : variant === 'sedan' ? 'Vela Sedan' : 'Marina Van',
        variant,
      };
      addCar(spec, spot, spot.heading, { kind: 'parked' });
      spawned += 1;
    }
  }

  function spawnPoliceCar(x, z, heading) {
    return addCar(
      { body: PALETTE.police.body, cabin: PALETTE.police.cabin, stripe: PALETTE.police.stripe, light: PALETTE.police.light, lightAlt: PALETTE.police.lightAlt, police: true, name: 'SMPD cruiser', variant: 'sedan' },
      { x, z },
      heading,
      { kind: 'police', ai: 'pursue' },
    );
  }

  function damage(car, amount) {
    if (car.state.wrecked) return;
    car.state.health = Math.max(0, car.state.health - amount);
    if (car.state.health <= 0) {
      car.state.wrecked = true;
      car.state.speed = 0;
      addSmoke(car).group.visible = true;
      car.group.rotation.z = car.state.isPolice ? 0 : 0.06;
    } else if (car.state.health < VEHICLE.smokeBelow) {
      addSmoke(car).group.visible = true;
    }
  }

  function repair(car) {
    car.state.health = car.state.maxHealth;
    car.state.wrecked = false;
    if (car.smoke) car.smoke.group.visible = false;
    car.group.rotation.z = 0;
  }

  /** The nearest car Jax may enter, looking from his current position. */
  function nearest(x, z, maxDistance = 4.5) {
    let best = null;
    let bestDistance = maxDistance;
    for (let index = 0; index < cars.length; index += 1) {
      const car = cars[index];
      if (car.state.wrecked) continue;
      const distance = Math.hypot(car.state.x - x, car.state.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = car;
      }
    }
    return best;
  }

  function resolveCarCollisions(car) {
    const state = car.state ?? car;
    for (const group of collisionGroups) {
      for (const other of group) {
        if (other === car) continue;
        const otherState = other.state ?? other;
        const dx = state.x - otherState.x;
        const dz = state.z - otherState.z;
        const distance = Math.hypot(dx, dz);
        const separation = VEHICLE.radius * 2;
        if (distance >= separation) continue;
        const nx = distance > 0.001 ? dx / distance : Math.sin(state.heading);
        const nz = distance > 0.001 ? dz / distance : Math.cos(state.heading);
        const push = (separation - distance + 0.01) * 0.5;
        const position = clampToWorld(resolveCollisions(cityColliders, state.x + nx * push, state.z + nz * push, VEHICLE.radius));
        const otherPosition = clampToWorld(resolveCollisions(cityColliders, otherState.x - nx * push, otherState.z - nz * push, VEHICLE.radius));
        state.x = position.x;
        state.z = position.z;
        otherState.x = otherPosition.x;
        otherState.z = otherPosition.z;
        const closingSpeed = (Math.sin(otherState.heading) * otherState.speed - Math.sin(state.heading) * state.speed) * nx
          + (Math.cos(otherState.heading) * otherState.speed - Math.cos(state.heading) * state.speed) * nz;
        if (closingSpeed > 0) {
          state.speed *= 0.55;
          otherState.speed *= 0.55;
          if (closingSpeed > 4) {
            const impactDamage = Math.min(4, closingSpeed * 0.15);
            if (car.state) damage(car, impactDamage);
            if (other.state) damage(other, impactDamage);
          }
        }
        car.group.position.set(state.x, 0, state.z);
        other.group.position.set(otherState.x, 0, otherState.z);
      }
    }
  }

  function stepCar(car, dt, controls, colliders = cityColliders) {
    const state = car.state;
    if (state.wrecked) {
      state.speed *= Math.max(0, 1 - dt * 2.2);
    } else {
      const accelerating = Boolean(controls.accelerate);
      const braking = Boolean(controls.brake);
      if (accelerating && !braking) {
        if (state.speed < 0) state.speed = Math.min(0, state.speed + VEHICLE.brake * dt);
        else state.speed += VEHICLE.accel * dt;
      } else if (braking && !accelerating) {
        if (state.speed > 0) state.speed = Math.max(0, state.speed - VEHICLE.brake * dt);
        else state.speed -= VEHICLE.reverseAccel * dt;
      } else if (!accelerating && !braking) {
        const drag = state.speed < 0 ? VEHICLE.drag : VEHICLE.roll;
        state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), drag * dt);
      }
      if (controls.handbrake) state.speed *= Math.max(0, 1 - VEHICLE.handbrakeDrag * dt);
      state.speed = Math.max(-VEHICLE.maxReverse, Math.min(VEHICLE.maxSpeed, state.speed));
    }

    const speedRatio = Math.min(1, Math.abs(state.speed) / VEHICLE.maxSpeed);
    const steerInput = (controls.left ? 1 : 0) - (controls.right ? 1 : 0);
    const grip = controls.handbrake ? 0.55 : 1;
    const turnRate = (controls.handbrake ? VEHICLE.handbrakeSteer : VEHICLE.steer) * (0.35 + speedRatio * 0.85);
    if (state.speed !== 0 || controls.handbrake) {
      const direction = state.speed < 0 ? -1 : 1;
      state.heading += steerInput * turnRate * dt * direction * grip;
    }
    state.steerAngle += (steerInput * 0.5 - state.steerAngle) * Math.min(1, dt * 8);

    const sin = Math.sin(state.heading);
    const cos = Math.cos(state.heading);
    let nextX = state.x + sin * state.speed * dt;
    let nextZ = state.z + cos * state.speed * dt;
    const resolved = resolveCollisions(colliders, nextX, nextZ, VEHICLE.radius);
    if (resolved.hit) {
      const impact = Math.abs(state.speed);
      if (impact > VEHICLE.crashSpeed) damage(car, impact * 0.9);
      state.speed *= 0.25;
      nextX = resolved.x;
      nextZ = resolved.z;
    }
    const bounded = clampToWorld({ x: nextX, z: nextZ });
    state.x = bounded.x;
    state.z = bounded.z;
    resolveCarCollisions(car);

    car.group.position.set(state.x, 0, state.z);
    car.group.rotation.y = state.heading;
    state.wheelSpin += state.speed * dt * 2.4;
    const spin = state.steerAngle;
    for (const wheel of car.wheels) {
      wheel.mesh.rotation.x = state.wheelSpin;
      if (wheel.front) wheel.mesh.rotation.y = spin;
    }
    if (car.smoke && car.smoke.group.visible) {
      for (let index = 0; index < car.smoke.puffs.length; index += 1) {
        const puff = car.smoke.puffs[index];
        const phase = (state.wheelSpin * 0.05 + index * 0.37) % 1;
        puff.position.y = 0.6 + phase * 2.2;
        puff.position.x = Math.sin(phase * 6 + index) * 0.25;
        puff.position.z = -1.6 + phase * 0.6;
        puff.scale.setScalar(0.6 + phase * 1.4);
        puff.visible = true;
        if (puff.material) puff.material.opacity = 0.5 * (1 - phase);
      }
    }
    if (car.group.userData.lightbar) {
      const flash = Math.floor(performance.now() / 260) % 2 === 0;
      car.group.userData.lightbar.red.visible = flash;
      car.group.userData.lightbar.blue.visible = !flash;
    }
  }

  function setCarPosition(car, x, z, heading) {
    car.state.x = x;
    car.state.z = z;
    car.state.heading = heading;
    car.group.position.set(x, 0, z);
    car.group.rotation.y = heading;
  }

  return {
    cars,
    collisionGroups,
    scene,
    addCar,
    spawnStarter,
    spawnParked,
    spawnPoliceCar,
    damage,
    repair,
    nearest,
    resolveCarCollisions,
    stepCar,
    setCarPosition,
    smokeMaterial,
  };
}

/** Where Jax should stand when leaving a car: to the driver's left, clear of the body. */
export function exitSpot(car) {
  const heading = car.state.heading;
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  return { x: car.state.x - rightX * 1.9, z: car.state.z - rightZ * 1.9, heading };
}
