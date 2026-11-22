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
  // Subtle geometric armor panel seams
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

  // 2. Blue Sword Energy Core Texture (Sapphire + Cyan Electric Veins)
  const [blueCanvas, blueCtx] = makeCanvas(256, 1024);
  const blueGrad = blueCtx.createLinearGradient(0, 0, 256, 0);
  blueGrad.addColorStop(0, '#72e6ff');
  blueGrad.addColorStop(0.18, '#0c4e8f');
  blueGrad.addColorStop(0.5, '#072a57');
  blueGrad.addColorStop(0.82, '#0c4e8f');
  blueGrad.addColorStop(1, '#72e6ff');
  blueCtx.fillStyle = blueGrad;
  blueCtx.fillRect(0, 0, 256, 1024);

  // Glowing cyan energy cracks running vertically down the blade
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

  // 3. Purple Sword Lightning Core Texture (Dark Obsidian + Jagged Violet Lightning)
  const [purpleCanvas, purpleCtx] = makeCanvas(256, 1024);
  const purpleGrad = purpleCtx.createLinearGradient(0, 0, 256, 0);
  purpleGrad.addColorStop(0, '#514b63');
  purpleGrad.addColorStop(0.16, '#15121d');
  purpleGrad.addColorStop(0.5, '#1d1033');
  purpleGrad.addColorStop(0.84, '#15121d');
  purpleGrad.addColorStop(1, '#514b63');
  purpleCtx.fillStyle = purpleGrad;
  purpleCtx.fillRect(0, 0, 256, 1024);

  // Bright purple outer glow bolt
  purpleCtx.strokeStyle = 'rgba(192, 132, 252, 0.95)';
  purpleCtx.shadowColor = '#a855f7';
  purpleCtx.shadowBlur = 18;
  purpleCtx.lineWidth = 6;
  purpleCtx.beginPath();
  let lx = 128;
  purpleCtx.moveTo(lx, 10);
  for (let y = 45; y <= 990; y += 35) {
    lx = 128 + Math.sin(y * 0.065) * 26 + Math.cos(y * 0.13) * 12;
    purpleCtx.lineTo(lx, y);
  }
  purpleCtx.stroke();

  // Hot white-violet inner lightning core
  purpleCtx.strokeStyle = '#f5d0fe';
  purpleCtx.lineWidth = 2.2;
  purpleCtx.stroke();

  // Secondary branch arcs
  purpleCtx.lineWidth = 1.8;
  purpleCtx.strokeStyle = 'rgba(216, 180, 254, 0.85)';
  for (let y = 140; y < 860; y += 160) {
    purpleCtx.beginPath();
    purpleCtx.moveTo(128, y);
    purpleCtx.lineTo(y % 320 === 140 ? 72 : 184, y + 48);
    purpleCtx.lineTo(y % 320 === 140 ? 54 : 202, y + 92);
    purpleCtx.stroke();
  }
  purpleCtx.shadowBlur = 0;
  const purpleSwordLightning = new THREE.CanvasTexture(purpleCanvas);
  purpleSwordLightning.colorSpace = THREE.SRGBColorSpace;
  purpleSwordLightning.anisotropy = maxAnisotropy;

  // 4. Cosmic Purple Galaxy Portal Texture (for Purple Knight's Halo)
  const [portalCanvas, portalCtx] = makeCanvas(512, 512);
  const cx = 256;
  const cy = 256;
  const bgRad = portalCtx.createRadialGradient(cx, cy, 12, cx, cy, 250);
  bgRad.addColorStop(0, 'rgba(168, 85, 247, 0.72)');
  bgRad.addColorStop(0.32, 'rgba(88, 28, 135, 0.65)');
  bgRad.addColorStop(0.72, 'rgba(22, 12, 42, 0.85)');
  bgRad.addColorStop(0.95, 'rgba(147, 51, 234, 0.55)');
  bgRad.addColorStop(1, 'rgba(10, 6, 18, 0)');
  portalCtx.fillStyle = bgRad;
  portalCtx.fillRect(0, 0, 512, 512);

  // Swirling cosmic nebula arcs
  for (let arm = 0; arm < 5; arm++) {
    portalCtx.save();
    portalCtx.translate(cx, cy);
    portalCtx.rotate((arm * Math.PI * 2) / 5);
    const armGrad = portalCtx.createLinearGradient(0, 0, 210, 80);
    armGrad.addColorStop(0, 'rgba(216, 180, 254, 0.55)');
    armGrad.addColorStop(0.5, 'rgba(147, 51, 234, 0.32)');
    armGrad.addColorStop(1, 'rgba(88, 28, 135, 0)');
    portalCtx.strokeStyle = armGrad;
    portalCtx.lineWidth = 22;
    portalCtx.beginPath();
    portalCtx.moveTo(18, 0);
    portalCtx.quadraticCurveTo(110, 95, 215, 20);
    portalCtx.stroke();
    portalCtx.restore();
  }

  // Crisp stars inside halo
  for (let s = 0; s < 140; s++) {
    const angle = s * 2.39996;
    const dist = Math.sqrt(s / 140) * 232;
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;
    const r = s % 11 === 0 ? 2.4 : s % 4 === 0 ? 1.4 : 0.9;
    portalCtx.fillStyle = s % 7 === 0 ? '#f3e8ff' : '#d8b4fe';
    portalCtx.beginPath();
    portalCtx.arc(sx, sy, r, 0, Math.PI * 2);
    portalCtx.fill();
  }
  const cosmicPortal = new THREE.CanvasTexture(portalCanvas);
  cosmicPortal.colorSpace = THREE.SRGBColorSpace;
  cosmicPortal.anisotropy = maxAnisotropy;

  // 5. Soft Radial Contact Shadow
  const [shadowCanvas, shadowCtx] = makeCanvas(256, 256);
  const shGrad = shadowCtx.createRadialGradient(128, 128, 10, 128, 128, 126);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  shGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.36)');
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
    ctx.shadowBlur = 10;
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
  const pedestalRunePurple = makeRuneTexture('rgba(192, 132, 252, 0.78)', '#9333ea');

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
