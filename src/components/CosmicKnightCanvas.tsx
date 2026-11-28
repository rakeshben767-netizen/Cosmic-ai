import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CosmicMode, CosmicState } from '../types/cosmic.ts';
import {
  animateCosmicOrbRig,
  buildCosmicOrbRig,
  COSMIC_ORB_CENTER_Y,
  disposeObjectTree,
  type CosmicOrbRig,
} from '../three/cosmicOrbModel.ts';
import type { MoodVisualProfile } from '../utils/responseMood.ts';

interface CosmicKnightCanvasProps {
  mode: CosmicMode;
  cosmicState: CosmicState;
  moodProfile?: MoodVisualProfile;
  audioLevelRef: React.MutableRefObject<number>;
  resetViewSignal: number;
}

const DEFAULT_YAW = 0;
const DEFAULT_PITCH = 0.16;
const DEFAULT_RADIUS = 4.65;
const TARGET_Y = COSMIC_ORB_CENTER_Y - 0.12;

const NORMAL_KEY_COLOR = new THREE.Color('#93c5fd');
const BADMASH_KEY_COLOR = new THREE.Color('#d8b4fe');
const NORMAL_RIM_COLOR = new THREE.Color('#38bdf8');
const BADMASH_RIM_COLOR = new THREE.Color('#c084fc');

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render|Mesa/i.test(gpu);
  } catch {
    return true;
  }
}

export function CosmicKnightCanvas({
  mode,
  cosmicState,
  moodProfile,
  audioLevelRef,
  resetViewSignal,
}: CosmicKnightCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef<CosmicMode>(mode);
  const stateRef = useRef<CosmicState>(cosmicState);
  const moodKeyColorRef = useRef<THREE.Color>(
    new THREE.Color(moodProfile?.keyLightHex ?? (mode === 'badmash' ? '#d8b4fe' : '#93c5fd')),
  );
  const moodRimColorRef = useRef<THREE.Color>(
    new THREE.Color(moodProfile?.rimLightHex ?? (mode === 'badmash' ? '#c084fc' : '#38bdf8')),
  );

  const yawRef = useRef(DEFAULT_YAW);
  const pitchRef = useRef(DEFAULT_PITCH);
  const targetYawRef = useRef(DEFAULT_YAW);
  const targetPitchRef = useRef(DEFAULT_PITCH);
  const radiusRef = useRef(DEFAULT_RADIUS);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    stateRef.current = cosmicState;
  }, [cosmicState]);

  useEffect(() => {
    if (moodProfile) {
      moodKeyColorRef.current.set(moodProfile.keyLightHex);
      moodRimColorRef.current.set(moodProfile.rimLightHex);
    } else {
      moodKeyColorRef.current.copy(mode === 'badmash' ? BADMASH_KEY_COLOR : NORMAL_KEY_COLOR);
      moodRimColorRef.current.copy(mode === 'badmash' ? BADMASH_RIM_COLOR : NORMAL_RIM_COLOR);
    }
  }, [mode, moodProfile]);

  useEffect(() => {
    if (resetViewSignal > 0) {
      targetYawRef.current = DEFAULT_YAW;
      targetPitchRef.current = DEFAULT_PITCH;
      radiusRef.current = DEFAULT_RADIUS;
    }
  }, [resetViewSignal]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: isSoftwareGl ? 'default' : 'high-performance',
        alpha: true,
      });
    } catch {
      return;
    }

    const initialW = container.clientWidth || window.innerWidth;
    const maxDpr = initialW < 768 ? 1.25 : 1.5;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(initialW, container.clientHeight || window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
    };
    canvas.addEventListener('webglcontextlost', onContextLost, false);

    const scene = new THREE.Scene();
    scene.background = null;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(42, width / Math.max(height, 1), 0.1, 60);

    const updateCameraTransform = (aspect: number) => {
      const mobileScale = aspect < 0.72 ? 1.12 : 1.0;
      const dist = radiusRef.current * mobileScale;
      const cosPitch = Math.cos(pitchRef.current);
      camera.position.set(
        Math.sin(yawRef.current) * cosPitch * dist,
        TARGET_Y + Math.sin(pitchRef.current) * dist,
        Math.cos(yawRef.current) * cosPitch * dist,
      );
      camera.lookAt(0, TARGET_Y, 0);
    };
    updateCameraTransform(width / Math.max(height, 1));

    // Lightweight Studio Lighting (no heavy shadow map pass)
    const hemiLight = new THREE.HemisphereLight('#c7d2fe', '#0f172a', 1.1);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(
      modeRef.current === 'badmash' ? BADMASH_KEY_COLOR : NORMAL_KEY_COLOR,
      1.9,
    );
    keyLight.position.set(2.8, 5.2, 4.4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      modeRef.current === 'badmash' ? BADMASH_RIM_COLOR : NORMAL_RIM_COLOR,
      1.55,
    );
    rimLight.position.set(-3.4, 3.6, -2.8);
    scene.add(rimLight);

    // Subtle translucent ground disc so the dynamic mood gradient shines through
    const groundGeo = new THREE.CircleGeometry(6.5, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.9,
      metalness: 0.15,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.26;
    scene.add(groundMesh);

    // Lightweight ambient space dust particles
    const particleCount = 32;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const ang = (i * 2.39996) % (Math.PI * 2);
      const rad = 1.6 + ((i * 19) % 58) * 0.14;
      positions[i * 3] = Math.cos(ang) * rad;
      positions[i * 3 + 1] = 0.2 + ((i * 31) % 45) * 0.12;
      positions[i * 3 + 2] = Math.sin(ang) * rad - 1.5;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: modeRef.current === 'badmash' ? '#c084fc' : '#67e8f9',
      size: 0.048,
      transparent: true,
      opacity: 0.68,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Single unified Cosmic Ball rig for both Normal and Badmash modes
    const orbRig: CosmicOrbRig = buildCosmicOrbRig(modeRef.current, isSoftwareGl);
    scene.add(orbRig.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Pointer orbit interaction
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      targetYawRef.current += dx * 0.007;
      targetPitchRef.current = Math.max(-0.18, Math.min(0.68, targetPitchRef.current + dy * 0.005));
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      canvas.releasePointerCapture?.(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radiusRef.current = Math.max(3.2, Math.min(7.8, radiusRef.current + e.deltaY * 0.003));
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(1, Math.floor(entry.contentRect.width));
        const h = Math.max(1, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer?.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    // Animation loop with software-GL fenceSync + 80ms afterDraw pacing
    let disposed = false;
    let frameId = 0;
    let prevTime = performance.now();

    const afterDraw = (cb: () => void) => {
      if (!isSoftwareGl || !renderer) {
        frameId = requestAnimationFrame(cb);
        return;
      }
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    };

    const tick = () => {
      if (disposed || !renderer) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - prevTime) / 1000);
      prevTime = now;
      const elapsed = now / 1000;

      keyLight.color.lerp(moodKeyColorRef.current, Math.min(1, dt * 3.5));
      rimLight.color.lerp(moodRimColorRef.current, Math.min(1, dt * 3.5));
      particleMat.color.lerp(moodRimColorRef.current, Math.min(1, dt * 3.5));

      yawRef.current += (targetYawRef.current - yawRef.current) * Math.min(1, dt * 10);
      pitchRef.current += (targetPitchRef.current - pitchRef.current) * Math.min(1, dt * 10);
      updateCameraTransform(camera.aspect);

      particles.rotation.y = elapsed * 0.04;

      animateCosmicOrbRig(orbRig, {
        elapsed,
        dt,
        mode: modeRef.current,
        state: stateRef.current,
        audioLevel: audioLevelRef.current || 0,
      });

      renderer.render(scene, camera);
      afterDraw(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);

      scene.remove(orbRig.root);
      disposeObjectTree(orbRig.root);
      groundGeo.dispose();
      groundMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    };
  }, [audioLevelRef]);

  return (
    <div
      ref={containerRef}
      data-testid="cosmic-knight-canvas"
      className="absolute inset-0 h-full w-full"
    />
  );
}
