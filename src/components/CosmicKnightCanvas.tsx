import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CosmicMode, CosmicState } from '../types/cosmic.ts';
import {
  createBlueKnightRig,
  createPurpleKnightRig,
  type KnightRigHandle,
} from '../three/knightModels.ts';
import { createProceduralTextureSet } from '../three/proceduralTextures.ts';

interface CosmicKnightCanvasProps {
  mode: CosmicMode;
  cosmicState: CosmicState;
  audioLevelRef: React.MutableRefObject<number>;
  cameraResetTick: number;
}

const DEFAULT_CAM_POS = new THREE.Vector3(0, 1.48, 5.1);
const DEFAULT_TARGET = new THREE.Vector3(0, 1.15, 0);

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export function CosmicKnightCanvas({
  mode,
  cosmicState,
  audioLevelRef,
  cameraResetTick,
}: CosmicKnightCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef<CosmicMode>(mode);
  const stateRef = useRef<CosmicState>(cosmicState);
  const transitionPulseRef = useRef<number>(0);
  const resetCamRequestedRef = useRef<boolean>(false);
  const [contextLost, setContextLost] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    if (modeRef.current !== mode) {
      modeRef.current = mode;
      transitionPulseRef.current = 1.0;
    }
  }, [mode]);

  useEffect(() => {
    stateRef.current = cosmicState;
  }, [cosmicState]);

  useEffect(() => {
    if (cameraResetTick > 0) {
      resetCamRequestedRef.current = true;
    }
  }, [cameraResetTick]);

  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('data-testid', 'cosmic-3d-canvas');
    mount.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    const normalBgColor = new THREE.Color(0x0d101b);
    const badmashBgColor = new THREE.Color(0x130c1c);
    const activeBgColor = normalBgColor.clone();
    scene.background = activeBgColor;
    scene.fog = new THREE.FogExp2(activeBgColor.getHex(), 0.092);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 80);
    camera.position.copy(DEFAULT_CAM_POS);

    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(DEFAULT_TARGET);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 2.6;
    controls.maxDistance = 6.2;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.54;
    controls.update();

    const onControlStart = () => {
      resetCamRequestedRef.current = false;
    };
    controls.addEventListener('start', onControlStart);

    // Mandatory RoomEnvironment IBL reflections for realistic dark metallic armor
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // 3-Point Studio Lighting Rig
    const hemiFill = new THREE.HemisphereLight(0x94b8ff, 0x1a1528, 0.72);
    scene.add(hemiFill);

    const keyLight = new THREE.DirectionalLight(0xfff1e0, 2.1);
    keyLight.position.set(3.2, 5.2, 4.0);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 16;
    keyLight.shadow.camera.left = -2.5;
    keyLight.shadow.camera.right = 2.5;
    keyLight.shadow.camera.top = 3.2;
    keyLight.shadow.camera.bottom = -0.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 2.3);
    rimLight.position.set(-3.4, 3.0, -3.5);
    scene.add(rimLight);

    const lowFillLight = new THREE.PointLight(0x0ea5e9, 1.3, 8, 1.5);
    lowFillLight.position.set(1.4, 0.45, 2.1);
    scene.add(lowFillLight);

    // Procedural Textures
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures = createProceduralTextureSet(maxAniso);

    // Ground Stage & Obsidian Cosmic Pedestal
    const floorGeo = new THREE.CircleGeometry(28, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0e17,
      roughness: 0.92,
      metalness: 0.08,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.09;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const pedestalGeo = new THREE.CylinderGeometry(1.38, 1.56, 0.09, 48);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x151926,
      metalness: 0.82,
      roughness: 0.3,
    });
    const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestalMesh.position.y = -0.045;
    pedestalMesh.receiveShadow = true;
    scene.add(pedestalMesh);

    const runeTopGeo = new THREE.CircleGeometry(1.34, 48);
    const runeTopMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.pedestalRuneBlue,
      emissive: 0x0284c7,
      emissiveMap: textures.pedestalRuneBlue,
      emissiveIntensity: 0.65,
      roughness: 0.35,
      metalness: 0.45,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const runeTopMesh = new THREE.Mesh(runeTopGeo, runeTopMat);
    runeTopMesh.rotation.x = -Math.PI / 2;
    runeTopMesh.position.y = 0.004;
    scene.add(runeTopMesh);

    const shadowDiscGeo = new THREE.CircleGeometry(1.05, 32);
    const shadowDiscMat = new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const shadowDisc = new THREE.Mesh(shadowDiscGeo, shadowDiscMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.008;
    scene.add(shadowDisc);

    // Transition Portal Shockwave Ring
    const shockwaveGeo = new THREE.TorusGeometry(1.1, 0.025, 10, 48);
    const shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const shockwaveMesh = new THREE.Mesh(shockwaveGeo, shockwaveMat);
    shockwaveMesh.rotation.x = -Math.PI / 2;
    shockwaveMesh.position.y = 0.06;
    scene.add(shockwaveMesh);

    // Build BOTH Knights once so switching modes is instantaneous & zero-stutter
    const blueKnight: KnightRigHandle = createBlueKnightRig(textures, !isSoftwareGl);
    const purpleKnight: KnightRigHandle = createPurpleKnightRig(textures, !isSoftwareGl);
    scene.add(blueKnight.root);
    scene.add(purpleKnight.root);

    const applyInitialVisibility = () => {
      const isBadmash = modeRef.current === 'badmash';
      blueKnight.root.visible = !isBadmash;
      purpleKnight.root.visible = isBadmash;
    };
    applyInitialVisibility();

    // Floating Cosmic Particles
    const particleCount = 72;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSpeeds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      const angle = (i * 2.39996) % (Math.PI * 2);
      const radius = 0.75 + ((i * 17) % 100) / 70;
      particlePositions[i * 3] = Math.cos(angle) * radius;
      particlePositions[i * 3 + 1] = 0.1 + ((i * 31) % 100) / 38;
      particlePositions[i * 3 + 2] = Math.sin(angle) * radius;
      particleSpeeds[i] = 0.25 + ((i * 13) % 100) / 220;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.036,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    };
    window.addEventListener('resize', onResize);

    // Pre-allocated scratch helpers (zero GC inside animation loop)
    const normalRimColor = new THREE.Color(0x38bdf8);
    const badmashRimColor = new THREE.Color(0xc084fc);
    const badmashEmberColor = new THREE.Color(0xf97316);
    const badmashAuraBase = new THREE.Color(0xa855f7);
    const normalAuraBase = new THREE.Color(0x22d3ee);
    const normalParticleColor = new THREE.Color(0x38bdf8);
    const errorColor = new THREE.Color(0xef4444);
    const targetBg = new THREE.Color();
    const targetRim = new THREE.Color();

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;
    let smoothedAudio = 0;
    let lastPaintedMode: CosmicMode | null = null;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;

      const isBadmash = modeRef.current === 'badmash';
      const currentState = stateRef.current;

      // Instant mode switch (Blue Knight <-> Purple Knight)
      if (lastPaintedMode !== modeRef.current) {
        lastPaintedMode = modeRef.current;
        blueKnight.root.visible = !isBadmash;
        purpleKnight.root.visible = isBadmash;
        runeTopMat.map = isBadmash ? textures.pedestalRunePurple : textures.pedestalRuneBlue;
        runeTopMat.emissiveMap = runeTopMat.map;
        runeTopMat.emissive.setHex(isBadmash ? 0x9333ea : 0x0284c7);
        runeTopMat.needsUpdate = true;
      }

      // Smooth audio reactive envelope
      const rawLevel = audioLevelRef.current || 0;
      const targetLevel =
        currentState === 'SPEAKING'
          ? Math.max(rawLevel, 0.25 + Math.abs(Math.sin(elapsed * 9.5)) * 0.28)
          : currentState === 'LISTENING'
            ? Math.max(rawLevel, 0.12)
            : 0.04;
      smoothedAudio = THREE.MathUtils.damp(smoothedAudio, targetLevel, 10, dt);

      // Update colors smoothly
      targetBg.copy(isBadmash ? badmashBgColor : normalBgColor);
      activeBgColor.lerp(targetBg, 1 - Math.exp(-6 * dt));
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(activeBgColor);
      }

      targetRim.copy(isBadmash ? badmashRimColor : normalRimColor);
      if (currentState === 'ERROR') {
        targetRim.lerp(errorColor, 0.55);
      }
      rimLight.color.lerp(targetRim, 1 - Math.exp(-8 * dt));
      lowFillLight.color.copy(isBadmash ? badmashEmberColor : normalRimColor);
      lowFillLight.intensity = 1.15 + smoothedAudio * 1.4;

      particleMat.color.copy(isBadmash ? badmashRimColor : normalParticleColor);
      particleMat.opacity = 0.45 + smoothedAudio * 0.45;

      // Mode transition portal shockwave
      if (transitionPulseRef.current > 0.02) {
        transitionPulseRef.current = THREE.MathUtils.damp(transitionPulseRef.current, 0, 8.5, dt);
        const progress = 1 - transitionPulseRef.current;
        shockwaveMesh.scale.setScalar(0.8 + progress * 1.25);
        shockwaveMesh.position.y = 0.08 + progress * 1.35;
        shockwaveMat.color.setHex(isBadmash ? 0xa855f7 : 0x38bdf8);
        shockwaveMat.opacity = transitionPulseRef.current * 0.8;
      } else {
        transitionPulseRef.current = 0;
        shockwaveMat.opacity = 0;
      }

      // Animate Active Knight Rig
      const activeRig = isBadmash ? purpleKnight : blueKnight;
      const breathAmp = currentState === 'SPEAKING' ? 0.022 + smoothedAudio * 0.025 : 0.014;
      const breathFreq = currentState === 'SPEAKING' ? 4.2 : 1.9;
      activeRig.upperBody.position.y = 1.155 + Math.sin(elapsed * breathFreq) * breathAmp;

      // Subtle commanding head & posture response (extra Don lean-in in Badmash Mode)
      if (currentState === 'SPEAKING') {
        const swagger = isBadmash ? 1.35 : 1.0;
        activeRig.headGroup.rotation.y = Math.sin(elapsed * 2.4) * 0.09 * swagger;
        activeRig.headGroup.rotation.x = Math.sin(elapsed * 5.2) * 0.055 * (0.4 + smoothedAudio);
        activeRig.upperBody.rotation.y = Math.sin(elapsed * 1.6) * 0.055 * swagger;
        activeRig.upperBody.rotation.x = isBadmash ? 0.035 + smoothedAudio * 0.045 : 0;
        activeRig.leftArmGroup.rotation.z = Math.sin(elapsed * 4.5) * 0.065 * smoothedAudio * swagger;
        activeRig.rightArmGroup.rotation.x = Math.sin(elapsed * 3.1) * 0.035 * swagger;
      } else if (currentState === 'LISTENING') {
        activeRig.headGroup.rotation.y = Math.sin(elapsed * 0.9) * 0.04;
        activeRig.headGroup.rotation.x = 0.05;
        activeRig.upperBody.rotation.y = Math.sin(elapsed * 0.7) * 0.025;
        activeRig.upperBody.rotation.x = 0;
        activeRig.leftArmGroup.rotation.z = 0;
        activeRig.rightArmGroup.rotation.x = 0;
      } else if (currentState === 'CONNECTING') {
        activeRig.upperBody.rotation.y = Math.sin(elapsed * 2.8) * 0.06;
        activeRig.upperBody.rotation.x = 0;
        activeRig.headGroup.rotation.x = -0.04;
      } else {
        activeRig.headGroup.rotation.y = Math.sin(elapsed * 0.75) * 0.05;
        activeRig.headGroup.rotation.x = Math.sin(elapsed * 1.2) * 0.02;
        activeRig.upperBody.rotation.y = Math.sin(elapsed * 0.65) * 0.03;
        activeRig.upperBody.rotation.x = 0;
        activeRig.leftArmGroup.rotation.z = Math.sin(elapsed * 1.4) * 0.02;
        activeRig.rightArmGroup.rotation.x = 0;
      }

      // Flowing cape sway
      const capeEnergy = 1 + smoothedAudio * (isBadmash ? 2.9 : 2.4);
      for (let i = 0; i < activeRig.capeFronds.length; i++) {
        const frond = activeRig.capeFronds[i];
        const baseX = 0.24;
        frond.rotation.x = baseX + Math.sin(elapsed * 2.1 + i * 0.8) * 0.045 * capeEnergy;
      }

      // Purple Knight cosmic halo rotation & audio-reactive pulse surge
      if (activeRig.haloRing) {
        activeRig.haloRing.rotation.z = elapsed * (currentState === 'SPEAKING' ? 0.52 : 0.16);
        const haloScale = currentState === 'SPEAKING' ? 1 + smoothedAudio * 0.06 : 1;
        activeRig.haloRing.scale.setScalar(haloScale);
      }
      if (activeRig.haloPortal) {
        activeRig.haloPortal.rotation.z = -elapsed * (currentState === 'SPEAKING' ? 0.95 : 0.28);
      }

      // Voice-reactive emissive glow on armor & sword
      const glowMult =
        currentState === 'SPEAKING'
          ? (isBadmash ? 1.32 : 1.18) + smoothedAudio * (isBadmash ? 1.35 : 1.15)
          : currentState === 'LISTENING'
            ? 0.98 + Math.sin(elapsed * 4.5) * 0.16
            : 0.78 + Math.sin(elapsed * 2.0) * 0.08;
      for (const mat of activeRig.emissiveMaterials) {
        mat.emissiveIntensity = glowMult;
      }
      if (isBadmash) {
        activeRig.auraLight.color.copy(badmashAuraBase).lerp(badmashEmberColor, Math.min(0.6, smoothedAudio * 0.85));
      } else {
        activeRig.auraLight.color.copy(normalAuraBase);
      }
      activeRig.auraLight.intensity = (isBadmash ? 2.85 : 2.2) * (0.85 + smoothedAudio * 0.95);

      // Update floating particles
      const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        let py = posAttr.getY(i) + particleSpeeds[i] * dt * (1 + smoothedAudio * 2);
        if (py > 2.9) py = 0.08;
        posAttr.setY(i, py);
      }
      posAttr.needsUpdate = true;
      particles.rotation.y = elapsed * 0.08;

      // Smooth damped camera reset if requested
      if (resetCamRequestedRef.current) {
        const alpha = 1 - Math.exp(-6 * dt);
        camera.position.lerp(DEFAULT_CAM_POS, alpha);
        controls.target.lerp(DEFAULT_TARGET, alpha);
        if (camera.position.distanceTo(DEFAULT_CAM_POS) < 0.02) {
          camera.position.copy(DEFAULT_CAM_POS);
          controls.target.copy(DEFAULT_TARGET);
          resetCamRequestedRef.current = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      // Draw initial frame then pace cleanly
      tick();
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);

      blueKnight.dispose();
      purpleKnight.dispose();
      textures.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      pedestalGeo.dispose();
      pedestalMat.dispose();
      runeTopGeo.dispose();
      runeTopMat.dispose();
      shadowDiscGeo.dispose();
      shadowDiscMat.dispose();
      shockwaveGeo.dispose();
      shockwaveMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      envTarget.dispose();
      renderer.dispose();

      if (canvas.parentNode === mount) {
        mount.removeChild(canvas);
      }
    };
  }, [audioLevelRef]);

  if (webglUnavailable || contextLost) {
    const fallbackSrc =
      mode === 'badmash'
        ? '/assets/aistudio/IMG_20261122_150443_2bf25043.jpg'
        : '/assets/aistudio/IMG_20261122_150432_29af8877.jpg';
    return (
      <div
        className="relative flex h-full w-full items-center justify-center bg-[#12151f]"
        data-testid="cosmic-3d-fallback"
      >
        <img
          src={fallbackSrc}
          alt={mode === 'badmash' ? 'Cosmic AI Purple Knight' : 'Cosmic AI Blue Knight'}
          referrerPolicy="no-referrer"
          className="h-full max-h-[82vh] w-auto object-contain"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full touch-none select-none"
      data-testid="cosmic-3d-stage"
      data-knight={mode === 'badmash' ? 'purple-knight' : 'blue-knight'}
    />
  );
}
