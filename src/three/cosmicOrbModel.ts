import * as THREE from 'three';
import type { CosmicMode, CosmicState } from '../types/cosmic.ts';
import {
  createContactShadowTexture,
  createPedestalRingTexture,
} from './proceduralTextures.ts';

export const COSMIC_ORB_CENTER_Y = 1.48;

const NORMAL_PRIMARY = new THREE.Color('#38bdf8');
const NORMAL_GLOW = new THREE.Color('#67e8f9');
const NORMAL_SHELL = new THREE.Color('#dbeafe');

const BADMASH_PRIMARY = new THREE.Color('#a855f7');
const BADMASH_GLOW = new THREE.Color('#e879f9');
const BADMASH_SHELL = new THREE.Color('#f3e8ff');

const ERROR_ACCENT = new THREE.Color('#ef4444');

// Module-level reusable math helpers (zero per-frame allocations)
const _tmpColor = new THREE.Color();
const _tmpGlow = new THREE.Color();

export interface CosmicOrbRig {
  root: THREE.Group;
  orbGroup: THREE.Group;
  coreShaderMat: THREE.ShaderMaterial;
  shellMesh: THREE.Mesh;
  shellMat: THREE.MeshStandardMaterial;
  ring1Group: THREE.Group;
  ring2Group: THREE.Group;
  ringGlowMat: THREE.MeshStandardMaterial;
  pedestalRimMat: THREE.MeshStandardMaterial;
  pedestalTopMat: THREE.MeshStandardMaterial;
  badmashMix: number;
  errorMix: number;
  smoothAudio: number;
}

const CORE_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uAudioLevel;
  uniform float uStateEnergy;

  varying vec3 vNormalDir;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  void main() {
    float wave = sin(position.x * 4.5 + uTime * 2.0) * cos(position.y * 4.5 - uTime * 1.6);
    float disp = wave * (0.01 + uAudioLevel * 0.055 + uStateEnergy * 0.008);

    vec3 displaced = position + normal * disp;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);

    vLocalPos = displaced;
    vWorldPos = worldPosition.xyz;
    vNormalDir = normalize(normalMatrix * normal);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const CORE_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uAudioLevel;
  uniform float uBadmashMix;
  uniform float uErrorMix;
  uniform float uStateEnergy;

  varying vec3 vNormalDir;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 n = normalize(vNormalDir);
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, n)), 2.1);

    float swirlA = sin(vLocalPos.x * 3.8 + uTime * 1.35) * cos(vLocalPos.y * 4.0 - uTime * 1.15);
    float swirlB = sin(vLocalPos.z * 4.2 + uTime * 1.6);
    float swirl = smoothstep(-0.55, 0.75, (swirlA + swirlB) * 0.5);

    // Normal Mode palette: Deep Sapphire -> Electric Cyan -> Soft Light-Blue
    vec3 normalDeep = vec3(0.05, 0.16, 0.45);
    vec3 normalMid = vec3(0.12, 0.64, 0.96);
    vec3 normalHot = vec3(0.75, 0.95, 1.00);

    // Badmash Mode palette: Deep Violet -> Rich Purple -> Magenta Glow
    vec3 badDeep = vec3(0.18, 0.04, 0.36);
    vec3 badMid = vec3(0.66, 0.26, 0.96);
    vec3 badHot = vec3(0.96, 0.76, 1.00);

    vec3 deepCol = mix(normalDeep, badDeep, uBadmashMix);
    vec3 midCol = mix(normalMid, badMid, uBadmashMix);
    vec3 hotCol = mix(normalHot, badHot, uBadmashMix);

    vec3 baseCol = mix(deepCol, midCol, swirl);
    float pulseBoost = clamp(0.24 + uAudioLevel * 0.8 + uStateEnergy * 0.2, 0.0, 1.2);
    baseCol = mix(baseCol, hotCol, swirl * swirl * (0.38 + pulseBoost * 0.32));
    baseCol += hotCol * fresnel * (0.55 + uAudioLevel * 0.8);

    vec3 errCol = vec3(0.95, 0.22, 0.24);
    baseCol = mix(baseCol, mix(errCol * 0.45, errCol * 1.2, fresnel), uErrorMix);

    gl_FragColor = vec4(baseCol, 1.0);
  }
`;

export function buildCosmicOrbRig(initialMode: CosmicMode, isSoftwareGl: boolean): CosmicOrbRig {
  const isBadmash = initialMode === 'badmash';
  const badmashMix = isBadmash ? 1 : 0;

  const root = new THREE.Group();

  // Lightweight baked contact shadow (no real-time shadow map pass)
  const shadowTex = createContactShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = -0.24;
  root.add(shadowMesh);

  const ringTex = createPedestalRingTexture('#38bdf8', '#7dd3fc');
  const pedestalTopMat = new THREE.MeshStandardMaterial({
    map: ringTex,
    emissiveMap: ringTex,
    emissive: isBadmash ? BADMASH_PRIMARY.clone() : NORMAL_PRIMARY.clone(),
    emissiveIntensity: 0.65,
    metalness: 0.5,
    roughness: 0.4,
  });
  const basePlate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.34, 1.5, 0.08, 32),
    new THREE.MeshStandardMaterial({
      color: '#1b2232',
      metalness: 0.75,
      roughness: 0.35,
    }),
  );
  basePlate.position.y = -0.22;
  root.add(basePlate);

  const topDisc = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.024, 32), pedestalTopMat);
  topDisc.position.y = -0.175;
  root.add(topDisc);

  const pedestalRimMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? BADMASH_GLOW.clone() : NORMAL_GLOW.clone(),
    emissive: isBadmash ? BADMASH_PRIMARY.clone() : NORMAL_PRIMARY.clone(),
    emissiveIntensity: 0.95,
    metalness: 0.4,
    roughness: 0.28,
  });
  const pedestalRim = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.014, 8, 44), pedestalRimMat);
  pedestalRim.rotation.x = Math.PI / 2;
  pedestalRim.position.y = -0.16;
  root.add(pedestalRim);

  // =====================================
  // CLEAN LEVITATING COSMIC BALL
  // =====================================
  const orbGroup = new THREE.Group();
  orbGroup.position.set(0, COSMIC_ORB_CENTER_Y, 0);
  root.add(orbGroup);

  // 1. Lightweight Glowing Plasma Core
  const coreShaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAudioLevel: { value: 0 },
      uBadmashMix: { value: badmashMix },
      uErrorMix: { value: 0 },
      uStateEnergy: { value: 0.2 },
    },
    vertexShader: CORE_VERTEX_SHADER,
    fragmentShader: CORE_FRAGMENT_SHADER,
  });
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 24), coreShaderMat);
  orbGroup.add(coreMesh);

  // 2. Lightweight Translucent Outer Glass Shell (no heavy physical iridescence)
  const shellMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? BADMASH_SHELL.clone() : NORMAL_SHELL.clone(),
    metalness: 0.15,
    roughness: 0.14,
    transparent: true,
    opacity: isSoftwareGl ? 0.22 : 0.18,
    depthWrite: false,
  });
  const shellMesh = new THREE.Mesh(new THREE.SphereGeometry(0.84, 28, 20), shellMat);
  shellMesh.renderOrder = 2;
  orbGroup.add(shellMesh);

  // 3. Two Clean Minimalist Rings (low segment count for mobile 60fps)
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0.85,
    roughness: 0.28,
  });
  const ringGlowMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? BADMASH_GLOW.clone() : NORMAL_GLOW.clone(),
    emissive: isBadmash ? BADMASH_PRIMARY.clone() : NORMAL_PRIMARY.clone(),
    emissiveIntensity: 1.15,
    metalness: 0.3,
    roughness: 0.25,
  });

  const ring1Group = new THREE.Group();
  ring1Group.rotation.set(0.35, 0.18, 0.12);
  const ring1Torus = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.02, 8, 48), darkMetalMat);
  ring1Group.add(ring1Torus);
  orbGroup.add(ring1Group);

  const ring2Group = new THREE.Group();
  ring2Group.rotation.set(-0.55, 0.4, 0.7);
  const ring2Torus = new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.013, 8, 48), ringGlowMat);
  ring2Group.add(ring2Torus);
  orbGroup.add(ring2Group);

  return {
    root,
    orbGroup,
    coreShaderMat,
    shellMesh,
    shellMat,
    ring1Group,
    ring2Group,
    ringGlowMat,
    pedestalRimMat,
    pedestalTopMat,
    badmashMix,
    errorMix: 0,
    smoothAudio: 0,
  };
}

export function animateCosmicOrbRig(
  rig: CosmicOrbRig,
  params: {
    elapsed: number;
    dt: number;
    mode: CosmicMode;
    state: CosmicState;
    audioLevel: number;
  },
): void {
  const { elapsed, dt, mode, state, audioLevel } = params;

  const isSpeaking = state === 'SPEAKING';
  const isListening = state === 'LISTENING';
  const isConnecting = state === 'CONNECTING' || state === 'RECONNECTING';
  const isError = state === 'ERROR';

  const targetBadmash = mode === 'badmash' ? 1 : 0;
  rig.badmashMix = THREE.MathUtils.damp(rig.badmashMix, targetBadmash, 5.5, dt);
  rig.errorMix = THREE.MathUtils.damp(rig.errorMix, isError ? 1 : 0, 7.0, dt);
  rig.smoothAudio = THREE.MathUtils.damp(rig.smoothAudio, audioLevel, 14.0, dt);

  const stateEnergy = isSpeaking
    ? 1.0
    : isListening
      ? 0.45
      : isConnecting
        ? 0.65
        : isError
          ? 0.35
          : 0.12;

  _tmpColor.copy(NORMAL_PRIMARY).lerp(BADMASH_PRIMARY, rig.badmashMix);
  _tmpGlow.copy(NORMAL_GLOW).lerp(BADMASH_GLOW, rig.badmashMix);
  if (rig.errorMix > 0.001) {
    _tmpColor.lerp(ERROR_ACCENT, rig.errorMix);
    _tmpGlow.lerp(ERROR_ACCENT, rig.errorMix);
  }

  rig.coreShaderMat.uniforms.uTime.value = elapsed;
  rig.coreShaderMat.uniforms.uAudioLevel.value = rig.smoothAudio;
  rig.coreShaderMat.uniforms.uBadmashMix.value = rig.badmashMix;
  rig.coreShaderMat.uniforms.uErrorMix.value = rig.errorMix;
  rig.coreShaderMat.uniforms.uStateEnergy.value = stateEnergy;

  const floatAmp = isSpeaking ? 0.05 : isListening ? 0.04 : 0.03;
  const floatFreq = isSpeaking ? 2.2 : 1.35;
  rig.orbGroup.position.y = COSMIC_ORB_CENTER_Y + Math.sin(elapsed * floatFreq) * floatAmp;

  const audioScale = 1 + rig.smoothAudio * 0.07 + (isListening ? Math.sin(elapsed * 3.4) * 0.01 : 0);
  rig.orbGroup.scale.setScalar(audioScale);

  const spinBoost = 1 + rig.smoothAudio * 1.6 + (isConnecting ? 1.2 : 0);
  rig.shellMesh.rotation.y += dt * 0.14;
  rig.ring1Group.rotation.z += dt * 0.42 * spinBoost;
  rig.ring2Group.rotation.y -= dt * 0.56 * spinBoost;

  const glowIntensity = isSpeaking
    ? 1.15 + rig.smoothAudio * 1.4
    : isListening
      ? 0.95 + Math.sin(elapsed * 3.8) * 0.18
      : isConnecting
        ? 0.8 + Math.abs(Math.sin(elapsed * 3.5)) * 0.5
        : isError
          ? 0.65 + Math.abs(Math.sin(elapsed * 6.5)) * 0.55
          : 0.8;

  rig.ringGlowMat.color.copy(_tmpGlow);
  rig.ringGlowMat.emissive.copy(_tmpColor);
  rig.ringGlowMat.emissiveIntensity = glowIntensity;

  rig.shellMat.color.copy(NORMAL_SHELL).lerp(BADMASH_SHELL, rig.badmashMix);

  rig.pedestalRimMat.color.copy(_tmpGlow);
  rig.pedestalRimMat.emissive.copy(_tmpColor);
  rig.pedestalRimMat.emissiveIntensity = 0.8 + rig.smoothAudio * 0.65;

  rig.pedestalTopMat.emissive.copy(_tmpColor);
  rig.pedestalTopMat.emissiveIntensity = 0.5 + rig.smoothAudio * 0.45;
}

export function disposeObjectTree(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      geometries.add(mesh.geometry);
    }
    const matOrArr = mesh.material;
    if (Array.isArray(matOrArr)) {
      matOrArr.forEach((m) => materials.add(m));
    } else if (matOrArr) {
      materials.add(matOrArr);
    }
  });

  materials.forEach((mat) => {
    const m = mat as THREE.MeshStandardMaterial;
    if (m.map) textures.add(m.map);
    if (m.emissiveMap) textures.add(m.emissiveMap);
    mat.dispose();
  });

  textures.forEach((tex) => tex.dispose());
  geometries.forEach((geo) => geo.dispose());
}
