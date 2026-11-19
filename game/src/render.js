// three.js rendering: the scene, warm coastal light, sky and fog, a follow camera for foot and
// car, plus resize handling. Shadows are one directional light with a tight box that moves with
// the player instead of covering the whole city, which keeps the polygon and draw cost modest.
import * as THREE from '../vendor/three.module.min.js';
import { CAMERA, CITY, DAYNIGHT, PALETTE, SUNSET_MINUTE, SUNSET_OFFSET, TITLE_CAMERA } from './config.js';
import { aimFovFor, CAMERA_MODE_ORDER, cameraModeParams } from './camera-modes.js';

// Match the light positions on the car meshes. A motorbike has a single center lamp.
const HEADLIGHT_POSITIONS = {
  bike: [0, 0.71, 0.97],
  truck: [0.94, 0.99, 3.25],
  buggy: [0.64, 0.96, 1.62],
  sport: [0.83, 0.7, 2.3],
  vespera: [0.96, 0.72, 2.33],
  cargovan: [0.83, 0.85, 2.43],
  standard: [0.68, 0.76, 2.26],
};

const LIGHT_COLORS = ['sky', 'skyRose', 'skyTop', 'fog', 'sun', 'hemiSky', 'hemiGround'];
const lightFrames = [...DAYNIGHT, { ...DAYNIGHT[0], minute: 1440, azimuth: DAYNIGHT[0].azimuth + 360 }]
  .map((frame) => ({
    ...frame,
    colors: Object.fromEntries(LIGHT_COLORS.map((key) => [key, new THREE.Color(frame[key])])),
  }));

export function createRenderer(canvas) {
  const viewport = () => ({
    width: Number.isFinite(window.innerWidth) && window.innerWidth > 0 ? window.innerWidth : 1280,
    height: Number.isFinite(window.innerHeight) && window.innerHeight > 0 ? window.innerHeight : 720,
  });
  const initialSize = viewport();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    renderer = null;
  }
  if (renderer) {
    renderer.setPixelRatio(Math.min(Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1, 1.75));
    renderer.setSize(initialSize.width, initialSize.height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 175, 1050);

  const camera = new THREE.PerspectiveCamera(CAMERA.modes.near.foot.fov, initialSize.width / initialSize.height, 0.1, 1800);
  camera.position.set(0, 8, 14);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.64);
  scene.add(hemi);

  // Staged shots never advance the clock, so they start with the exact original offset.
  const sunOffset = new THREE.Vector3(...SUNSET_OFFSET);
  const sunDistance = sunOffset.length();
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.25);
  sun.position.copy(sunOffset);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const skyGeometry = new THREE.SphereGeometry(1500, 20, 12);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      bottom: { value: new THREE.Color(PALETTE.sky) },
      rose: { value: new THREE.Color(PALETTE.skyRose) },
      sunColor: { value: new THREE.Color(PALETTE.sun) },
      sunDirection: { value: sunOffset.clone().normalize() },
      sunDisc: { value: 1 },
    },
    vertexShader: 'varying vec3 vWorld; void main(){ vWorld = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 bottom;
      uniform vec3 rose;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      uniform float sunDisc;
      varying vec3 vWorld;
      void main() {
        vec3 direction = normalize(vWorld);
        float h = max(direction.y, 0.0);
        vec3 color = mix(bottom, rose, smoothstep(0.0, 0.32, h));
        color = mix(color, top, pow(smoothstep(0.08, 1.0, h), 0.7));
        float facingSun = max(dot(direction, sunDirection), 0.0);
        float glow = pow(facingSun, 10.0);
        float aureole = pow(facingSun, 96.0);
        float disc = smoothstep(0.99982, 0.99994, facingSun);
        color += sunColor * (glow * 0.45 + aureole * 0.7 + disc * 4.0) * sunDisc;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
  scene.add(skyDome);

  const headlightCanvas = document.createElement('canvas');
  headlightCanvas.width = headlightCanvas.height = 64;
  const headlightContext = headlightCanvas.getContext('2d');
  if (headlightContext) {
    const fade = headlightContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    fade.addColorStop(0, 'rgba(255,255,255,0.95)');
    fade.addColorStop(0.18, 'rgba(255,255,255,0.46)');
    fade.addColorStop(0.48, 'rgba(255,255,255,0.12)');
    fade.addColorStop(1, 'rgba(255,255,255,0)');
    headlightContext.fillStyle = fade;
    headlightContext.fillRect(0, 0, 64, 64);
  }
  const headlightMap = new THREE.CanvasTexture(headlightCanvas);
  const headlightMaterial = new THREE.SpriteMaterial({
    map: headlightMap, color: 0xffedcd, opacity: 0, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const headlights = Array.from({ length: 2 }, () => {
    const sprite = new THREE.Sprite(headlightMaterial);
    sprite.name = 'player:headlight';
    sprite.scale.set(1.9, 1.9, 1);
    sprite.visible = false;
    scene.add(sprite);
    return sprite;
  });
  // Sprites alone disappear behind the car from the follow camera. These two pooled lamps
  // also illuminate the road and make the light volume readable from behind and the side.
  const beamGeometry = new THREE.ConeGeometry(4.2, 24, 16, 1, true)
    .rotateX(-Math.PI / 2).translate(0, 0, 12);
  const beamMaterial = new THREE.ShaderMaterial({
    uniforms: { strength: { value: 0 } },
    vertexShader: 'varying float travel; void main(){ travel = position.z / 24.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float strength; varying float travel; void main(){ float fade = pow(1.0-clamp(travel,0.0,1.0),1.6); gl_FragColor = vec4(1.0,0.9,0.66,strength*fade*0.18); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  const roadGlowGeometry = new THREE.PlaneGeometry(8.4, 24).rotateX(-Math.PI / 2);
  const roadGlowMaterial = new THREE.MeshBasicMaterial({
    map: headlightMap, color: 0xffedbd, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const headlightEffects = headlights.map((_, index) => {
    const cone = new THREE.Mesh(beamGeometry, beamMaterial);
    const pool = new THREE.Mesh(roadGlowGeometry, roadGlowMaterial);
    const light = new THREE.SpotLight(0xffedcd, 0, 36, Math.PI / 7, 0.65, 1.5);
    cone.name = `player:headlight-cone:${index}`;
    pool.name = `player:headlight-road-glow:${index}`;
    light.name = `player:headlight-spot:${index}`;
    cone.visible = pool.visible = light.visible = false;
    scene.add(cone, pool, light, light.target);
    return { cone, pool, light };
  });

  function hideHeadlights() {
    headlights.forEach((sprite) => { sprite.visible = false; });
    headlightEffects.forEach(({ cone, pool, light }) => {
      cone.visible = pool.visible = light.visible = false;
    });
  }

  let appliedMinute;
  let nightFactor;
  let downtownShadows = false;
  const shadowAnchor = new THREE.Vector3();

  function followSun(x, z, downtown = downtownShadows) {
    const distanceScale = downtown ? 2.4 : 1;
    if (downtown !== downtownShadows) {
      // Keep the same light angle while admitting distant sunset shadow casters.
      const shadowCamera = sun.shadow.camera;
      const extent = downtown ? 115 : 95;
      shadowCamera.left = shadowCamera.bottom = -extent;
      shadowCamera.right = shadowCamera.top = extent;
      shadowCamera.far = 420 + sunDistance * (distanceScale - 1);
      shadowCamera.updateProjectionMatrix();
      downtownShadows = downtown;
    }
    shadowAnchor.set(x, 0, z);
    sun.position.copy(shadowAnchor).addScaledVector(sunOffset, distanceScale);
    sun.target.position.copy(shadowAnchor);
    sun.target.updateMatrixWorld();
  }

  function applyTimeOfDay(clockMinutes, setNightFactor) {
    const minute = ((clockMinutes % 1440) + 1440) % 1440;
    if (!Number.isFinite(minute)) return;
    if (minute !== appliedMinute) {
      const next = lightFrames.findIndex((frame) => frame.minute > minute);
      const before = lightFrames[next - 1];
      const after = lightFrames[next];
      const mix = THREE.MathUtils.smoothstep(minute, before.minute, after.minute);
      const value = (key) => THREE.MathUtils.lerp(before[key], after[key], mix);
      const color = (target, key) => target.copy(before.colors[key]).lerp(after.colors[key], mix);
      const uniforms = skyMaterial.uniforms;
      color(scene.background, 'sky');
      uniforms.bottom.value.copy(scene.background);
      color(uniforms.rose.value, 'skyRose');
      color(uniforms.top.value, 'skyTop');
      color(sun.color, 'sun');
      uniforms.sunColor.value.copy(sun.color);
      uniforms.sunDisc.value = value('sunDisc');
      color(scene.fog.color, 'fog');
      // Retain the original linear fog and change its effective density by scaling its range.
      scene.fog.far = 1 / value('fogDensity');
      scene.fog.near = scene.fog.far / 6;
      color(hemi.color, 'hemiSky');
      color(hemi.groundColor, 'hemiGround');
      hemi.intensity = value('hemiIntensity');
      sun.intensity = value('sunIntensity');
      sun.castShadow = sun.intensity > 0;
      if (minute === SUNSET_MINUTE) {
        sunOffset.set(...SUNSET_OFFSET);
      } else {
        const azimuth = THREE.MathUtils.degToRad(value('azimuth'));
        const elevation = THREE.MathUtils.degToRad(value('elevation'));
        const horizontal = Math.cos(elevation) * sunDistance;
        sunOffset.set(Math.sin(azimuth) * horizontal, Math.sin(elevation) * sunDistance,
          Math.cos(azimuth) * horizontal);
      }
      uniforms.sunDirection.value.copy(sunOffset).normalize();
      followSun(shadowAnchor.x, shadowAnchor.z);
      nightFactor = value('nightFactor');
      headlightMaterial.opacity = value('headlights');
      beamMaterial.uniforms.strength.value = headlightMaterial.opacity;
      roadGlowMaterial.opacity = headlightMaterial.opacity * 0.38;
      if (headlightMaterial.opacity === 0) hideHeadlights();
      appliedMinute = minute;
    }
    setNightFactor?.(nightFactor);
  }

  const cameraState = {
    yaw: 0,
    pitch: CAMERA.modes.near.foot.pitch,
    distance: CAMERA.modes.near.foot.distance,
    fov: camera.fov,
    focusY: 1.5,
    target: new THREE.Vector3(),
    pos: new THREE.Vector3(0, 6, 12),
    mode: 'foot',
    view: 'near',
  };
  let snapCamera = true;
  let hasPreviousFocus = false;
  const previousFocus = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();

  function resize() {
    const { width, height } = viewport();
    if (renderer) {
      renderer.setPixelRatio(Math.min(Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1, 1.75));
      renderer.setSize(width, height, false);
    }
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  /**
   * Follow the player or their car with one camera. Resolve the selected view and
   * ease the camera from its current pose, including when the view changes.
   */
  function updateCamera(dt, player, orbit, shake) {
    const state = player?.state;
    const inCar = state?.inCar;
    const chase = Boolean(orbit?.chase);
    const view = !chase && CAMERA_MODE_ORDER.includes(orbit?.cameraMode) ? orbit.cameraMode : 'near';
    const params = cameraModeParams(view, inCar);
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const blend = (rate) => 1 - Math.exp(-elapsed * rate);
    // Aim zoom lives here and nowhere else: FOV eases toward the mode FOV minus
    // the aim delta (58 -> 46 in near) while aiming on foot, never in chase.
    const aiming = Boolean(orbit?.aiming) && !inCar && !chase;
    const targetFov = chase ? CAMERA.chaseFov : aiming ? aimFovFor(params.fov) : params.fov;
    camera.fov += (targetFov - camera.fov) * blend(10);
    if (Math.abs(camera.fov - targetFov) < 0.05) camera.fov = targetFov;
    if (camera.fov !== cameraState.fov) {
      cameraState.fov = camera.fov;
      camera.updateProjectionMatrix();
    }
    if (!state) return; // The title view only resets the lens here.

    const focus = inCar?.state ?? state;
    const mode = inCar ? 'car' : 'foot';
    const first = view === 'first';
    const fixedDistance = first || view === 'top';
    const height = params.height + (chase ? CAMERA.chaseLift : 0);
    const zoomDistance = chase ? CAMERA.chaseDistance : fixedDistance ? params.distance : THREE.MathUtils.clamp(
      Number.isFinite(orbit?.distance) ? orbit.distance : params.distance, CAMERA.minDistance, CAMERA.maxDistance,
    );
    const requestedYaw = Number.isFinite(orbit?.yaw) ? orbit.yaw : 0;
    const orbitPitch = Number.isFinite(orbit?.pitch) ? orbit.pitch : CAMERA.pitch;
    const requestedPitch = view === 'top' ? params.pitch : THREE.MathUtils.clamp(
      first ? orbitPitch : params.pitch + (orbitPitch - CAMERA.pitch), CAMERA.minPitch, CAMERA.maxPitch,
    );
    const baseFocusY = inCar ? 1.4 : 1.5;
    const focusY = baseFocusY + (Number.isFinite(focus.y) ? focus.y : 0);
    const damping = inCar ? CAMERA.carDamping : CAMERA.footDamping;
    const teleported = hasPreviousFocus && Math.hypot(focus.x - previousFocus.x, focusY - previousFocus.y,
      focus.z - previousFocus.z) > 80;
    // startRun and staged views pass a one-second update to settle the camera.
    const snap = snapCamera || teleported || cameraState.mode !== mode || elapsed >= 1;
    if (snap) {
      cameraState.yaw = requestedYaw;
      cameraState.pitch = requestedPitch;
      cameraState.focusY = focusY;
    } else {
      const yawDelta = Math.atan2(Math.sin(requestedYaw - cameraState.yaw), Math.cos(requestedYaw - cameraState.yaw));
      cameraState.yaw += yawDelta * blend(damping.yaw);
      cameraState.pitch += (requestedPitch - cameraState.pitch) * blend(damping.pitch);
      cameraState.focusY += (focusY - cameraState.focusY) * blend(damping.focusY);
    }
    cameraState.yaw = Math.atan2(Math.sin(cameraState.yaw), Math.cos(cameraState.yaw));

    const clearance = !fixedDistance && typeof orbit?.safeDistance === 'function'
      ? orbit.safeDistance(cameraState.yaw, cameraState.pitch, cameraState.focusY, height) : zoomDistance;
    const distance = Number.isFinite(clearance) ? THREE.MathUtils.clamp(clearance, 0, zoomDistance) : zoomDistance;
    const distanceRate = distance < zoomDistance
      ? (distance < cameraState.distance ? CAMERA.collisionIn : CAMERA.collisionOut) : damping.distance;
    if (snap) cameraState.distance = distance;
    else cameraState.distance += (distance - cameraState.distance) * blend(distanceRate);

    const { yaw, pitch } = cameraState;
    const horizontal = Math.cos(pitch) * cameraState.distance;
    if (first) {
      // On cars, place the eye at the left seat. Bikes have a centred rider.
      const heading = inCar ? focus.heading : 0;
      const seatOffset = inCar && inCar.spec?.variant !== 'bike' ? 0.45 : 0;
      desiredPosition.set(focus.x - Math.cos(heading) * seatOffset, cameraState.focusY - baseFocusY + height,
        focus.z + Math.sin(heading) * seatOffset);
      // Chase sits behind the focus and above the look point for positive pitch.
      desiredTarget.set(desiredPosition.x + Math.sin(yaw) * horizontal,
        desiredPosition.y - Math.sin(pitch) * cameraState.distance,
        desiredPosition.z + Math.cos(yaw) * horizontal);
    } else {
      desiredTarget.set(focus.x, cameraState.focusY + 0.9 + (chase ? (inCar ? 3.4 : 2.6) : 0), focus.z);
      desiredPosition.set(focus.x - Math.sin(yaw) * horizontal,
        cameraState.focusY + height + Math.sin(pitch) * cameraState.distance * 0.55,
        focus.z - Math.cos(yaw) * horizontal);
    }
    if (snap) {
      cameraState.pos.copy(desiredPosition);
      cameraState.target.copy(desiredTarget);
    } else {
      cameraState.pos.lerp(desiredPosition, blend(damping.position));
      cameraState.target.lerp(desiredTarget, blend(damping.target));
    }
    snapCamera = false;
    previousFocus.set(focus.x, focusY, focus.z);
    hasPreviousFocus = true;
    if (shake > 0) {
      camera.position.copy(cameraState.pos);
      // Impact noise follows the simulation's shake envelope, so even shaken shots repeat.
      camera.position.x += Math.sin(shake * 83.1) * shake * 0.09;
      camera.position.y += Math.sin(shake * 61.7 + 1.3) * shake * 0.09;
    } else {
      camera.position.copy(cameraState.pos);
    }
    camera.lookAt(cameraState.target);
    cameraState.mode = mode;
    cameraState.view = view;
    if (player.body) player.body.visible = !inCar && !first;
    skyDome.position.copy(camera.position);
    const { minX, maxX, minZ, maxZ } = CITY.downtown;
    const downtown = focus.x >= minX && focus.x <= maxX && focus.z >= minZ && focus.z <= maxZ;
    followSun(Math.round(focus.x / 90) * 90, Math.round(focus.z / 90) * 90, downtown);

    const [lampX, lampY, lampZ] = HEADLIGHT_POSITIONS[inCar?.spec?.variant] ?? HEADLIGHT_POSITIONS.standard;
    headlights.forEach((sprite, index) => {
      const { cone, pool, light } = headlightEffects[index];
      sprite.visible = Boolean(inCar && !inCar.state.wrecked && headlightMaterial.opacity > 0 && (lampX || index === 0));
      cone.visible = pool.visible = light.visible = sprite.visible;
      if (sprite.visible) {
        const x = index === 0 ? -lampX : lampX;
        sprite.position.set(x, lampY, lampZ);
        inCar.group.localToWorld(sprite.position);
        cone.position.copy(sprite.position);
        cone.quaternion.copy(inCar.group.quaternion);
        cone.rotateX(Math.atan2(lampY, 24));
        light.position.copy(sprite.position);
        light.intensity = 90 * headlightMaterial.opacity;
        light.target.position.set(x, 0.3, lampZ + 24);
        inCar.group.localToWorld(light.target.position);
        pool.position.set(x, 0.31, lampZ + 11);
        inCar.group.localToWorld(pool.position);
        pool.rotation.y = inCar.group.rotation.y;
      }
    });
  }

  function frameTitle() {
    updateCamera(1);
    camera.position.set(TITLE_CAMERA.x, TITLE_CAMERA.y, TITLE_CAMERA.z);
    camera.lookAt(TITLE_CAMERA.lookX, TITLE_CAMERA.lookY, TITLE_CAMERA.lookZ);
    cameraState.pos.copy(camera.position);
    cameraState.target.set(TITLE_CAMERA.lookX, TITLE_CAMERA.lookY, TITLE_CAMERA.lookZ);
    const dx = TITLE_CAMERA.lookX - TITLE_CAMERA.x;
    const dy = TITLE_CAMERA.lookY - TITLE_CAMERA.y;
    const dz = TITLE_CAMERA.lookZ - TITLE_CAMERA.z;
    cameraState.distance = Math.hypot(dx, dy, dz);
    cameraState.yaw = Math.atan2(-dx, -dz);
    cameraState.pitch = Math.asin(dy / cameraState.distance);
    skyDome.position.copy(camera.position);
    followSun(0, 0, false);
    hideHeadlights();
    snapCamera = true;
    hasPreviousFocus = false;
  }

  function render() {
    if (renderer) renderer.render(scene, camera);
  }

  function dispose() {
    window.removeEventListener('resize', resize);
    scene.remove(skyDome, sun, sun.target, hemi, ...headlights);
    headlightEffects.forEach(({ cone, pool, light }) => scene.remove(cone, pool, light, light.target));
    skyGeometry.dispose();
    skyMaterial.dispose();
    headlightMap.dispose();
    headlightMaterial.dispose();
    beamGeometry.dispose();
    beamMaterial.dispose();
    roadGlowGeometry.dispose();
    roadGlowMaterial.dispose();
    if (renderer) renderer.dispose();
  }

  applyTimeOfDay(SUNSET_MINUTE);
  return {
    scene,
    camera,
    cameraState,
    sun,
    hemi,
    applyTimeOfDay,
    resize,
    updateCamera,
    frameTitle,
    render,
    dispose,
    get renderer() {
      return renderer;
    },
  };
}
