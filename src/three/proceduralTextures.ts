import * as THREE from 'three';

export interface ProceduralTextureSet {
  armorBump: THREE.CanvasTexture;
  armorRoughness: THREE.CanvasTexture;
  blueSwordEnergy: THREE.CanvasTexture;
  purpleSwordLightning: THREE.CanvasTexture;
  cosmicPortal: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  pedestalRuneBlue: THREE.CanvasTexture;
  pedestalRunePurple: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 2D canvas context for procedural textures');
  }
  return [canvas, ctx];
}

export function createProceduralTextureSet(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Armor Micro-Brushed Bump & Roughness
  const [bumpCanvas, bumpCtx] = makeCanvas(256, 256);
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 650; i++) {
    const y = (i * 19) % 256;
    const x = (i * 53) % 256;
    const w = 18 + (i % 45);
    const tone = 112 + (i % 34);
    bumpCtx.fillStyle = `rgb(${tone},${tone},${tone})`;
    bumpCtx.fillRect(x, y, w, 1);
  }
  bumpCtx.strokeStyle = 'rgba(45,45,45,0.65)';
  bumpCtx.lineWidth = 2;
  for (let y = 32; y < 256; y += 64) {
    bumpCtx.beginPath();
    bumpCtx.moveTo(0, y);
    bumpCtx.lineTo(256, y);
    bumpCtx.stroke();
  }
  const armorBump = new THREE.CanvasTexture(bumpCanvas);
  armorBump.wrapS = THREE.RepeatWrapping;
  armorBump.wrapT = THREE.RepeatWrapping;
  armorBump.repeat.set(2, 2);
  armorBump.anisotropy = maxAnisotropy;

  const [roughCanvas, roughCtx] = makeCanvas(256, 256);
  roughCtx.fillStyle = '#484848';
  roughCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    const x = (i * 71) % 256;
    const y = (i * 37) % 256;
    const v = 55 + (i % 45);
    roughCtx.fillStyle = `rgb(${v},${v},${v})`;
    roughCtx.fillRect(x, y, 22, 2);
  }
  const armorRoughness = new THREE.CanvasTexture(roughCanvas);
  armorRoughness.wrapS = THREE.RepeatWrapping;
  armorRoughness.wrapT = THREE.RepeatWrapping;
  armorRoughness.repeat.set(2, 2);
  armorRoughness.anisotropy = maxAnisotropy;

  // 2. Blue Sword Energy Core Texture
  const [blueCanvas, blueCtx] = makeCanvas(256, 1024);
  const blueGrad = blueCtx.createLinearGradient(0, 0, 256, 0);
  blueGrad.addColorStop(0, '#72e6ff');
  blueGrad.addColorStop(0.18, '#0c4e8f');
  blueGrad.addColorStop(0.5, '#072a57');
  blueGrad.addColorStop(0.82, '#0c4e8f');
  blueGrad.addColorStop(1, '#72e6ff');
  blueCtx.fillStyle = blueGrad;
  blueCtx.fillRect(0, 0, 256, 1024);

  blueCtx.strokeStyle = 'rgba(135, 240, 255, 0.9)';
  blueCtx.shadowColor = '#38bdf8';
  blueCtx.shadowBlur = 12;
  blueCtx.lineWidth = 3;
  for (let vein = 0; vein < 4; vein++) {
    blueCtx.beginPath();
    let cx = 80 + vein * 30;
    blueCtx.moveTo(cx, 20);
    for (let y = 60; y <= 980; y += 45) {
      cx += Math.sin(y * 0.04 + vein * 2.1) * 16;
      blueCtx.lineTo(Math.max(48, Math.min(208, cx)), y);
    }
    blueCtx.stroke();
  }
  blueCtx.shadowBlur = 0;
  const blueSwordEnergy = new THREE.CanvasTexture(blueCanvas);
  blueSwordEnergy.colorSpace = THREE.SRGBColorSpace;
  blueSwordEnergy.anisotropy = maxAnisotropy;

  // 3. Purple Lightning Greatsword Core Texture (Crackling Violet Plasma)
  const [purpleCanvas, purpleCtx] = makeCanvas(256, 1024);
  const purpleGrad = purpleCtx.createLinearGradient(0, 0, 256, 0);
  purpleGrad.addColorStop(0, '#2a2438');
  purpleGrad.addColorStop(0.16, '#140f22');
  purpleGrad.addColorStop(0.36, '#4c1d95');
  purpleGrad.addColorStop(0.5, '#c084fc');
  purpleGrad.addColorStop(0.64, '#4c1d95');
  purpleGrad.addColorStop(0.84, '#140f22');
  purpleGrad.addColorStop(1, '#2a2438');
  purpleCtx.fillStyle = purpleGrad;
  purpleCtx.fillRect(0, 0, 256, 1024);

  // Inner metallic purple bevel trim
  purpleCtx.strokeStyle = '#a855f7';
  purpleCtx.shadowColor = '#c084fc';
  purpleCtx.shadowBlur = 16;
  purpleCtx.lineWidth = 4;
  purpleCtx.strokeRect(20, 12, 216, 1000);

  // Jagged branching electric violet lightning arc down the blade
  purpleCtx.strokeStyle = '#f5d0fe';
  purpleCtx.shadowColor = '#d946ef';
  purpleCtx.shadowBlur = 18;
  purpleCtx.lineWidth = 3.5;
  purpleCtx.beginPath();
  let lx = 128;
  purpleCtx.moveTo(lx, 18);
  for (let y = 42; y <= 996; y += 26) {
    lx = 128 + Math.sin(y * 0.13) * 26 + ((y * 7) % 19) - 9;
    purpleCtx.lineTo(lx, y);
  }
  purpleCtx.stroke();

  purpleCtx.lineWidth = 1.8;
  for (let y = 90; y < 940; y += 95) {
    const startX = 128 + Math.sin(y * 0.13) * 20;
    purpleCtx.beginPath();
    purpleCtx.moveTo(startX, y);
    purpleCtx.lineTo(startX - 42, y + 36);
    purpleCtx.moveTo(startX, y + 18);
    purpleCtx.lineTo(startX + 44, y + 52);
    purpleCtx.stroke();
  }
  purpleCtx.shadowBlur = 0;

  const purpleSwordLightning = new THREE.CanvasTexture(purpleCanvas);
  purpleSwordLightning.colorSpace = THREE.SRGBColorSpace;
  purpleSwordLightning.anisotropy = maxAnisotropy;

  // 4. Cosmic Nebula Halo Portal Disc Texture
  const [portalCanvas, portalCtx] = makeCanvas(512, 512);
  const pGrad = portalCtx.createRadialGradient(256, 256, 20, 256, 256, 250);
  pGrad.addColorStop(0, 'rgba(20, 10, 42, 0.92)');
  pGrad.addColorStop(0.45, 'rgba(67, 20, 118, 0.85)');
  pGrad.addColorStop(0.78, 'rgba(147, 51, 234, 0.78)');
  pGrad.addColorStop(0.95, 'rgba(192, 132, 252, 0.92)');
  pGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
  portalCtx.fillStyle = pGrad;
  portalCtx.fillRect(0, 0, 512, 512);

  // Swirling cosmic nebula dust streaks
  for (let i = 0; i < 65; i++) {
    const angle = (i * 0.42) % (Math.PI * 2);
    const radius = 52 + ((i * 29) % 185);
    const px = 256 + Math.cos(angle) * radius;
    const py = 256 + Math.sin(angle) * radius;
    const starSize = i % 7 === 0 ? 3.2 : 1.5;
    portalCtx.fillStyle = i % 5 === 0 ? '#f5d0fe' : 'rgba(216, 180, 254, 0.78)';
    portalCtx.beginPath();
    portalCtx.arc(px, py, starSize, 0, Math.PI * 2);
    portalCtx.fill();
  }

  // Subtle violet cosmic ring glow
  portalCtx.strokeStyle = 'rgba(217, 70, 239, 0.45)';
  portalCtx.lineWidth = 4;
  portalCtx.beginPath();
  portalCtx.arc(256, 256, 214, 0, Math.PI * 2);
  portalCtx.stroke();

  const cosmicPortal = new THREE.CanvasTexture(portalCanvas);
  cosmicPortal.colorSpace = THREE.SRGBColorSpace;
  cosmicPortal.anisotropy = maxAnisotropy;

  // 5. Soft Radial Contact Shadow
  const [shadowCanvas, shadowCtx] = makeCanvas(256, 256);
  const shGrad = shadowCtx.createRadialGradient(128, 128, 10, 128, 128, 126);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0.84)');
  shGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
  shGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shadowCtx.fillStyle = shGrad;
  shadowCtx.fillRect(0, 0, 256, 256);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);

  // 6. Pedestal Rune Discs (Blue & Purple)
  const makeRuneTexture = (primary: string, glow: string): THREE.CanvasTexture => {
    const [c, ctx] = makeCanvas(512, 512);
    ctx.fillStyle = '#0d1018';
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = primary;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(256, 256, 232, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(256, 256, 198, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(256, 256, 132, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      ctx.beginPath();
      ctx.moveTo(256 + Math.cos(a) * 198, 256 + Math.sin(a) * 198);
      ctx.lineTo(256 + Math.cos(a) * 232, 256 + Math.sin(a) * 232);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  const pedestalRuneBlue = makeRuneTexture('rgba(56, 189, 248, 0.72)', '#0ea5e9');
  const pedestalRunePurple = makeRuneTexture('rgba(168, 85, 247, 0.85)', '#9333ea');

  return {
    armorBump,
    armorRoughness,
    blueSwordEnergy,
    purpleSwordLightning,
    cosmicPortal,
    contactShadow,
    pedestalRuneBlue,
    pedestalRunePurple,
    dispose: () => {
      armorBump.dispose();
      armorRoughness.dispose();
      blueSwordEnergy.dispose();
      purpleSwordLightning.dispose();
      cosmicPortal.dispose();
      contactShadow.dispose();
      pedestalRuneBlue.dispose();
      pedestalRunePurple.dispose();
    },
  };
}
