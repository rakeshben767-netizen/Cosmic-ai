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
const _dummy = new THREE.Object3D();
const _tmpColor = new THREE.Color();
const _tmpGlow = new THREE.Color();

interface MoteOrbitParams {
  radius: number;
  speed: number;
  phase: number;
  tiltX: number;
  tiltZ: number;
  scale: number;
}

export interface CosmicOrbRig {
  root: THREE.Group;
  orbGroup: THREE.Group;
  coreShaderMat: THREE.ShaderMaterial;
  latticeMesh: THREE.Mesh;
  latticeMat: THREE.MeshStandardMaterial;
  shellMesh: THREE.Mesh;
  shellMat: THREE.MeshPhysicalMaterial;
  ring1Group: THREE.Group;
  ring2Group: THREE.Group;
  ring3Group: THREE.Group;
  ringGlowMat: THREE.MeshStandardMaterial;
  beaconMat: THREE.MeshStandardMaterial;
  pedestalRimMat: THREE.MeshStandardMaterial;
  pedestalTopMat: THREE.MeshStandardMaterial;
  motesMesh: THREE.InstancedMesh;
  moteParams: MoteOrbitParams[];
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
    vec3 dir = normalize(position);
    float waveA = sin(dir.x * 5.0 + uTime * 2.4) * cos(dir.y * 5.0 - uTime * 1.9);
    float waveB = sin(dir.z * 6.5 - uTime * 3.1 + dir.x * 3.0);
    float disp = (waveA * 0.6 + waveB * 0.4) * (0.018 + uAudioLevel * 0.085 + uStateEnergy * 0.012);

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

  float plasmaField(vec3 p, float t) {
    float a = sin(p.x * 4.2 + t * 1.6) * cos(p.y * 4.6 - t * 1.3);
    float b = sin(p.z * 5.1 + t * 2.1 + p.x * 2.4);
    float c = cos((p.x + p.y - p.z) * 3.8 - t * 1.8);
    return (a + b + c) / 3.0;
  }

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 n = normalize(vNormalDir);
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, n)), 2.25);

    float f1 = plasmaField(vLocalPos * 1.45, uTime);
    float f2 = plasmaField(vLocalPos * 2.75 + vec3(f1 * 0.55), uTime * 1.35);
    float swirl = smoothstep(-0.45, 0.72, f1 * 0.55 + f2 * 0.45);

    // Normal Mode palette: Deep Sapphire -> Electric Cyan -> White-Blue Plasma
    vec3 normalDeep = vec3(0.04, 0.14, 0.42);
    vec3 normalMid = vec3(0.08, 0.62, 0.96);
    vec3 normalHot = vec3(0.74, 0.95, 1.00);

    // Badmash Mode palette: Deep Obsidian Violet -> Savage Purple -> Magenta Plasma
    vec3 badDeep = vec3(0.16, 0.03, 0.34);
    vec3 badMid = vec3(0.66, 0.24, 0.96);
    vec3 badHot = vec3(0.98, 0.76, 1.00);

    vec3 deepCol = mix(normalDeep, badDeep, uBadmashMix);
    vec3 midCol = mix(normalMid, badMid, uBadmashMix);
    vec3 hotCol = mix(normalHot, badHot, uBadmashMix);

    vec3 baseCol = mix(deepCol, midCol, swirl);
    float pulseBoost = clamp(0.28 + uAudioLevel * 0.95 + uStateEnergy * 0.25, 0.0, 1.4);
    baseCol = mix(baseCol, hotCol, pow(swirl, 2.2) * (0.45 + pulseBoost * 0.4));
    baseCol += hotCol * fresnel * (0.65 + uAudioLevel * 0.95);

    vec3 errCol = vec3(0.95, 0.22, 0.24);
    baseCol = mix(baseCol, mix(errCol * 0.45, errCol * 1.3, fresnel + swirl * 0.5), uErrorMix);

    gl_FragColor = vec4(baseCol, 1.0);
  }
`;

export function buildCosmicOrbRig(initialMode: CosmicMode, isSoftwareGl: boolean): CosmicOrbRig {
  const isBadmash = initialMode === 'badmash';
  const badmashMix = isBadmash ? 1 : 0;

  const root = new THREE.Group();

  // =====================================
  // GROUNDED CONTACT SHADOW & BASE HALO
  // =====================================
  const shadowTex = createContactShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = -0.24;
  root.add(shadowMesh);

  const ringTex = createPedestalRingTexture('#38bdf8', '#7dd3fc');
  const pedestalTopMat = new THREE.MeshStandardMaterial({
    map: ringTex,
    emissiveMap: ringTex,
    emissive: isBadmash ? BADMASH_PRIMARY.clone() : NORMAL_PRIMARY.clone(),
    emissiveIntensity: 0.72,
    metalness: 0.55,
    roughness: 0.35,
  });
  const basePlate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.38, 1.56, 0.08, 64),
    new THREE.MeshStandardMaterial({
      color: '#1b2232',
      metalness: 0.85,
      roughness: 0.28,
    }),
  );
  basePlate.position.y = -0.22;
  basePlate.receiveShadow = true;
  root.add(basePlate);

  const topDisc = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.36, 0.025, 64), pedestalTopMat);
  topDisc.position.y = -0.175;
  topDisc.receiveShadow = true;
  root.add(topDisc);

  const pedestalRimMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? BADMASH_GLOW.clone() : NORMAL_GLOW.clone(),
    emissive: isBadmash ? BADMASH_PRIMARY.clone() : NORMAL_PRIMARY.clone(),
    emissiveIntensity: 1.15,
    metalness: 0.45,
    roughness: 0.22,
  });
  const pedestalRim = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.014, 12, 72), pedestalRimMat);
  pedestalRim.rotation.x = Math.PI / 2;
  pedestalRim.position.y = -0.16;
  root.add(pedestalRim);

  // =====================================
  // LEVITATING COSMIC BALL GROUP
  // =====================================
  const orbGroup = new THREE.Group();
  orbGroup.position.set(0, COSMIC_ORB_CENTER_Y, 0);
  root.add(orbGroup);

  // 1. Inner Swirling Plasma Core
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
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.66, 64, 64), coreShaderMat);
  orbGroup.add(coreMesh);

  // 2. Geodesic Energy Lattice Cage
  const latticeMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? BADMASH_GLOW.clone() : NORMAL_GLOW.clone(),
    emissive: isBadmash ? BADMASH_PRIMARY.clone() : NORMAL_PRIMARY.clone(),
    emissiveIntensity: 0.9,
    wireframe: true,
    transparent: true,
    opacity: 0.34,
    roughness: 0.3,
    metalness: 0.6,
  });
  const latticeMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), latticeMat);
  orbGroup.add(latticeMesh);

  // 3. Outer Iridescent Crystal Containment Shell
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: isBadmash ? BADMASH_SHELL.clone() : NORMAL_SHELL.clone(),
    metalness: 0.08,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    iridescence: isSoftwareGl ? 0.35 : 0.9,
    iridescenceIOR: 1.35,
    ior: 1.48,
    transparent: true,
    opacity: isSoftwareGl ? 0.26 : 0.22,
    depthWrite: false,
  });
  const shellMesh = new THREE.Mesh(new THREE.SphereGeometry(0.88, 64, 64), shellMat);
  shellMesh.renderOrder = 2;
  orbGroup.add(shellMesh);

  // 4. Precision Metallic & Luminous Gyroscopic Rings
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0.9,
    roughness: 0.22,
  });
  const brushedTrimMat = new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0.88,
    roughness: 0.26,
  });
  const ringGlowMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? BADMASH_GLOW.clone() : NORMAL_GLOW.clone(),
    emissive: isBadmash ? BADMASH_PRIMARY.clone() : NORMAL_PRIMARY.clone(),
    emissiveIntensity: 1.35,
    metalness: 0.35,
    roughness: 0.2,
  });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: isBadmash ? BADMASH_GLOW.clone() : NORMAL_GLOW.clone(),
    emissiveIntensity: 1.5,
    metalness: 0.2,
    roughness: 0.15,
  });

  // Ring 1: Primary Equatorial Gimbal + 4 Cardinal Energy Nodes
  const ring1Group = new THREE.Group();
  ring1Group.rotation.set(0.32, 0.18, 0.12);
  const ring1Torus = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.024, 16, 96), darkMetalMat);
  ring1Torus.castShadow = true;
  ring1Group.add(ring1Torus);

  const nodeGeo = new THREE.OctahedronGeometry(0.055, 0);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const node = new THREE.Mesh(nodeGeo, beaconMat);
    node.position.set(Math.cos(angle) * 1.14, Math.sin(angle) * 1.14, 0);
    ring1Group.add(node);
  }
  orbGroup.add(ring1Group);

  // Ring 2: Tilted Plasma Halo Ring
  const ring2Group = new THREE.Group();
  ring2Group.rotation.set(-0.55, 0.4, 0.72);
  const ring2Torus = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.015, 14, 96), ringGlowMat);
  ring2Group.add(ring2Torus);
  orbGroup.add(ring2Group);

  // Ring 3: Outer Gyroscopic Stabilizer + 2 Satellite Orbs
  const ring3Group = new THREE.Group();
  ring3Group.rotation.set(0.92, -0.35, -0.28);
  const ring3Torus = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.012, 12, 96), brushedTrimMat);
  ring3Group.add(ring3Torus);

  const satGeo = new THREE.SphereGeometry(0.044, 16, 16);
  for (const dir of [-1, 1] as const) {
    const sat = new THREE.Mesh(satGeo, beaconMat);
    sat.position.set(dir * 1.46, 0, 0);
    ring3Group.add(sat);
  }
  orbGroup.add(ring3Group);

  // 5. Instanced Orbiting Cosmic Motes
  const moteCount = 32;
  const moteGeo = new THREE.OctahedronGeometry(0.028, 0);
  const moteMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#ffffff',
    emissiveIntensity: 1.25,
    roughness: 0.25,
    metalness: 0.3,
  });
  const motesMesh = new THREE.InstancedMesh(moteGeo, moteMat, moteCount);
  motesMesh.frustumCulled = false;

  const moteParams: MoteOrbitParams[] = [];
  for (let i = 0; i < moteCount; i++) {
    moteParams.push({
      radius: 1.02 + (i % 7) * 0.11,
      speed: 0.42 + (i % 5) * 0.18,
      phase: (i * 2.39996) % (Math.PI * 2),
      tiltX: ((i % 9) - 4) * 0.24,
      tiltZ: (((i * 3) % 9) - 4) * 0.22,
      scale: 0.65 + (i % 4) * 0.25,
    });
  }
  orbGroup.add(motesMesh);

  return {
    root,
    orbGroup,
    coreShaderMat,
    latticeMesh,
    latticeMat,
    shellMesh,
    shellMat,
    ring1Group,
    ring2Group,
    ring3Group,
    ringGlowMat,
    beaconMat,
    pedestalRimMat,
    pedestalTopMat,
    motesMesh,
    moteParams,
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

  // Smooth exponential transitions across modes & audio amplitude
  const targetBadmash = mode === 'badmash' ? 1 : 0;
  rig.badmashMix = THREE.MathUtils.damp(rig.badmashMix, targetBadmash, 5.5, dt);
  rig.errorMix = THREE.MathUtils.damp(rig.errorMix, isError ? 1 : 0, 7.0, dt);
  rig.smoothAudio = THREE.MathUtils.damp(rig.smoothAudio, audioLevel, 14.0, dt);

  const stateEnergy = isSpeaking
    ? 1.0
    : isListening
      ? 0.48
      : isConnecting
        ? 0.68
        : isError
          ? 0.35
          : 0.14;

  // Interpolate shared accent colors cleanly
  _tmpColor.copy(NORMAL_PRIMARY).lerp(BADMASH_PRIMARY, rig.badmashMix);
  _tmpGlow.copy(NORMAL_GLOW).lerp(BADMASH_GLOW, rig.badmashMix);
  if (rig.errorMix > 0.001) {
    _tmpColor.lerp(ERROR_ACCENT, rig.errorMix);
    _tmpGlow.lerp(ERROR_ACCENT, rig.errorMix);
  }

  // Update core plasma uniforms
  rig.coreShaderMat.uniforms.uTime.value = elapsed;
  rig.coreShaderMat.uniforms.uAudioLevel.value = rig.smoothAudio;
  rig.coreShaderMat.uniforms.uBadmashMix.value = rig.badmashMix;
  rig.coreShaderMat.uniforms.uErrorMix.value = rig.errorMix;
  rig.coreShaderMat.uniforms.uStateEnergy.value = stateEnergy;

  // Levitation & responsive scale pulse
  const floatAmp = isSpeaking ? 0.065 : isListening ? 0.05 : 0.038;
  const floatFreq = isSpeaking ? 2.6 : 1.45;
  rig.orbGroup.position.y = COSMIC_ORB_CENTER_Y + Math.sin(elapsed * floatFreq) * floatAmp;

  const audioScale = 1 + rig.smoothAudio * 0.085 + (isListening ? Math.sin(elapsed * 3.8) * 0.014 : 0);
  rig.orbGroup.scale.setScalar(audioScale);

  // Lattice & shell rotation
  const spinBoost = 1 + rig.smoothAudio * 2.4 + (isConnecting ? 1.5 : 0);
  rig.latticeMesh.rotation.y -= dt * 0.42 * spinBoost;
  rig.latticeMesh.rotation.x += dt * 0.21 * spinBoost;
  rig.shellMesh.rotation.y += dt * 0.18;

  // Gyroscopic rings motion
  rig.ring1Group.rotation.z += dt * 0.52 * spinBoost;
  rig.ring1Group.rotation.x = 0.32 + Math.sin(elapsed * 0.9) * (0.08 + rig.smoothAudio * 0.14);

  rig.ring2Group.rotation.y -= dt * 0.78 * spinBoost;
  rig.ring2Group.rotation.x = -0.55 + Math.cos(elapsed * 1.15) * (0.1 + rig.smoothAudio * 0.16);

  rig.ring3Group.rotation.z -= dt * 0.36 * spinBoost;
  rig.ring3Group.rotation.y += dt * 0.28 * spinBoost;

  // Emissive intensity & color updates
  const glowIntensity = isSpeaking
    ? 1.35 + rig.smoothAudio * 1.95
    : isListening
      ? 1.1 + Math.sin(elapsed * 4.2) * 0.22
      : isConnecting
        ? 0.85 + Math.abs(Math.sin(elapsed * 3.8)) * 0.65
        : isError
          ? 0.7 + Math.abs(Math.sin(elapsed * 7.0)) * 0.7
          : 0.9;

  rig.ringGlowMat.color.copy(_tmpGlow);
  rig.ringGlowMat.emissive.copy(_tmpColor);
  rig.ringGlowMat.emissiveIntensity = glowIntensity;

  rig.beaconMat.emissive.copy(_tmpGlow);
  rig.beaconMat.emissiveIntensity = glowIntensity * 1.15;

  rig.latticeMat.color.copy(_tmpGlow);
  rig.latticeMat.emissive.copy(_tmpColor);
  rig.latticeMat.emissiveIntensity = 0.65 + rig.smoothAudio * 1.25;

  rig.shellMat.color.copy(NORMAL_SHELL).lerp(BADMASH_SHELL, rig.badmashMix);

  rig.pedestalRimMat.color.copy(_tmpGlow);
  rig.pedestalRimMat.emissive.copy(_tmpColor);
  rig.pedestalRimMat.emissiveIntensity = 0.9 + rig.smoothAudio * 0.95;

  rig.pedestalTopMat.emissive.copy(_tmpColor);
  rig.pedestalTopMat.emissiveIntensity = 0.55 + rig.smoothAudio * 0.6;

  // Orbiting cosmic motes (zero allocations)
  const moteMat = rig.motesMesh.material as THREE.MeshStandardMaterial;
  moteMat.emissive.copy(_tmpGlow);
  moteMat.emissiveIntensity = 0.95 + rig.smoothAudio * 1.4;

  const orbitExpand = 1 + rig.smoothAudio * 0.16;
  for (let i = 0; i < rig.moteParams.length; i++) {
    const p = rig.moteParams[i];
    const angle = p.phase + elapsed * p.speed * (1 + rig.smoothAudio * 1.4);
    const r = p.radius * orbitExpand;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = Math.sin(angle * 1.5 + p.tiltX) * 0.34;

    // Apply subtle tilt rotation around X/Z
    const cosT = Math.cos(p.tiltZ);
    const sinT = Math.sin(p.tiltZ);
    _dummy.position.set(x * cosT - y * sinT, x * sinT + y * cosT, z);
    _dummy.rotation.set(elapsed + p.phase, elapsed * 0.8, 0);
    _dummy.scale.setScalar(p.scale * (1 + rig.smoothAudio * 0.35));
    _dummy.updateMatrix();
    rig.motesMesh.setMatrixAt(i, _dummy.matrix);
  }
  rig.motesMesh.instanceMatrix.needsUpdate = true;
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
