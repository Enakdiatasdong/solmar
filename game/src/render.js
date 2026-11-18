// three.js rendering: the scene, warm coastal light, sky and fog, a follow camera for foot and
// car, plus resize handling. Shadows are one directional light with a tight box that moves with
// the player instead of covering the whole city, which keeps the polygon and draw cost modest.
import * as THREE from '../vendor/three.module.min.js';
import { CAMERA, PALETTE, TITLE_CAMERA } from './config.js';

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

  const camera = new THREE.PerspectiveCamera(58, initialSize.width / initialSize.height, 0.1, 1800);
  camera.position.set(0, 8, 14);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.64);
  scene.add(hemi);

  // Fixed south-west sun, 14.2 degrees above the horizon. Share its direction with the sky
  // and keep this offset when the shadow box follows the player: screenshots never use a clock.
  const sunOffset = new THREE.Vector3(-72, 56, 210);
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
    },
    vertexShader: 'varying vec3 vWorld; void main(){ vWorld = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 bottom;
      uniform vec3 rose;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
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
        color += sunColor * (glow * 0.45 + aureole * 0.7 + disc * 4.0);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
  scene.add(skyDome);

  const cameraState = {
    yaw: 0,
    pitch: CAMERA.pitch,
    distance: CAMERA.distance,
    target: new THREE.Vector3(),
    pos: new THREE.Vector3(0, 6, 12),
    mode: 'foot',
  };
  let snapCamera = true;
  let hasPreviousFocus = false;
  const previousFocus = new THREE.Vector3();

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
   * Follow the player or their car. `orbit` is the player's mouse-orbit state ({yaw, pitch});
   * `cameraYaw` is the direction the minimap uses. The camera's own state is smoothed.
   */
  function updateCamera(dt, player, orbit, shake) {
    const state = player?.state ?? {};
    const inCar = state.inCar;
    const focus = inCar ? inCar.state : player.state;
    const height = inCar ? CAMERA.carHeight : CAMERA.height;
    const requestedDistance = inCar ? CAMERA.carDistance : orbit?.distance ?? CAMERA.distance;
    const distance = THREE.MathUtils.clamp(
      Number.isFinite(requestedDistance) ? requestedDistance : CAMERA.distance,
      CAMERA.minDistance,
      CAMERA.maxDistance,
    );
    const requestedYaw = Number.isFinite(orbit?.yaw) ? orbit.yaw : 0;
    const requestedPitch = Number.isFinite(orbit?.pitch) ? orbit.pitch : CAMERA.pitch;
    const yaw = requestedYaw;
    const pitch = THREE.MathUtils.clamp(requestedPitch, CAMERA.minPitch, CAMERA.maxPitch);
    const focusY = (inCar ? 1.4 : 1.5) + (inCar ? 0 : Number.isFinite(state.y) ? state.y : 0);
    cameraState.target.set(focus.x, focusY + 0.9, focus.z);
    const horizontal = Math.cos(pitch) * distance;
    const desiredX = focus.x - Math.sin(yaw) * horizontal;
    const desiredZ = focus.z - Math.cos(yaw) * horizontal;
    const desiredY = focusY + height + Math.sin(pitch) * distance * 0.55;
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const lerp = 1 - Math.exp(-elapsed * CAMERA.follow);
    const teleported = hasPreviousFocus && Math.hypot(focus.x - previousFocus.x, focus.z - previousFocus.z) > 80;
    if (snapCamera || teleported) {
      cameraState.pos.set(desiredX, desiredY, desiredZ);
      snapCamera = false;
    } else {
      cameraState.pos.x += (desiredX - cameraState.pos.x) * lerp;
      cameraState.pos.y += (desiredY - cameraState.pos.y) * lerp;
      cameraState.pos.z += (desiredZ - cameraState.pos.z) * lerp;
    }
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
    cameraState.yaw = yaw;
    cameraState.pitch = pitch;
    cameraState.distance = distance;
    cameraState.mode = inCar ? 'car' : 'foot';
    skyDome.position.copy(camera.position);
    const shadowX = Math.round(focus.x / 90) * 90;
    const shadowZ = Math.round(focus.z / 90) * 90;
    sun.position.set(shadowX + sunOffset.x, sunOffset.y, shadowZ + sunOffset.z);
    sun.target.position.set(shadowX, 0, shadowZ);
    sun.target.updateMatrixWorld();
  }

  function frameTitle() {
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
    snapCamera = true;
    hasPreviousFocus = false;
  }

  function render() {
    if (renderer) renderer.render(scene, camera);
  }

  function dispose() {
    window.removeEventListener('resize', resize);
    scene.remove(skyDome, sun, sun.target, hemi);
    skyGeometry.dispose();
    skyMaterial.dispose();
    if (renderer) renderer.dispose();
  }

  return {
    scene,
    camera,
    cameraState,
    sun,
    hemi,
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
