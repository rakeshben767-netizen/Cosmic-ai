import * as THREE from 'three';

export interface ProceduralTextureSet {
  armorBump: THREE.CanvasTexture;
  armorRoughness: THREE.CanvasTexture;
  blueSwordEnergy: THREE.CanvasTexture;
  crimsonSwordMagma: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  pedestalRuneBlue: THREE.CanvasTexture;
  pedestalRuneCrimson: THREE.CanvasTexture;
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

  // 3. Crimson Inferno Magma Runed Greatsword Texture
  const [crimsonCanvas, crimsonCtx] = makeCanvas(256, 1024);
  const crimsonGrad = crimsonCtx.createLinearGradient(0, 0, 256, 0);
  crimsonGrad.addColorStop(0, '#454852');
  crimsonGrad.addColorStop(0.14, '#14151a');
  crimsonGrad.addColorStop(0.32, '#2d0d08');
  crimsonGrad.addColorStop(0.5, '#ff4818');
  crimsonGrad.addColorStop(0.68, '#2d0d08');
  crimsonGrad.addColorStop(0.86, '#14151a');
  crimsonGrad.addColorStop(1, '#454852');
  crimsonCtx.fillStyle = crimsonGrad;
  crimsonCtx.fillRect(0, 0, 256, 1024);

  // Outer crimson bevel edge glow
  crimsonCtx.strokeStyle = '#ff6b2b';
  crimsonCtx.shadowColor = '#ff2e00';
  crimsonCtx.shadowBlur = 20;
  crimsonCtx.lineWidth = 4;
  crimsonCtx.strokeRect(24, 14, 208, 996);

  // Geometric runic magma circuitry down the blade fuller
  crimsonCtx.strokeStyle = '#ff9a3c';
  crimsonCtx.lineWidth = 3.2;
  crimsonCtx.beginPath();
  crimsonCtx.moveTo(128, 22);
  crimsonCtx.lineTo(128, 995);
  crimsonCtx.stroke();

  for (let y = 64; y < 940; y += 72) {
    crimsonCtx.beginPath();
    crimsonCtx.moveTo(128, y);
    crimsonCtx.lineTo(74, y + 24);
    crimsonCtx.lineTo(74, y + 48);
    crimsonCtx.moveTo(128, y);
    crimsonCtx.lineTo(182, y + 24);
    crimsonCtx.lineTo(182, y + 48);
    crimsonCtx.stroke();

    // Glowing magma ember nodes
    crimsonCtx.fillStyle = '#ffd296';
    crimsonCtx.beginPath();
    crimsonCtx.arc(128, y, 5, 0, Math.PI * 2);
    crimsonCtx.fill();
  }
  crimsonCtx.shadowBlur = 0;

  const crimsonSwordMagma = new THREE.CanvasTexture(crimsonCanvas);
  crimsonSwordMagma.colorSpace = THREE.SRGBColorSpace;
  crimsonSwordMagma.anisotropy = maxAnisotropy;

  // 4. Soft Radial Contact Shadow
  const [shadowCanvas, shadowCtx] = makeCanvas(256, 256);
  const shGrad = shadowCtx.createRadialGradient(128, 128, 10, 128, 128, 126);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0.84)');
  shGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
  shGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shadowCtx.fillStyle = shGrad;
  shadowCtx.fillRect(0, 0, 256, 256);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);

  // 5. Pedestal Rune Discs (Blue & Crimson)
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
  const pedestalRuneCrimson = makeRuneTexture('rgba(255, 86, 40, 0.85)', '#ff3b10');

  return {
    armorBump,
    armorRoughness,
    blueSwordEnergy,
    crimsonSwordMagma,
    contactShadow,
    pedestalRuneBlue,
    pedestalRuneCrimson,
    dispose: () => {
      armorBump.dispose();
      armorRoughness.dispose();
      blueSwordEnergy.dispose();
      crimsonSwordMagma.dispose();
      contactShadow.dispose();
      pedestalRuneBlue.dispose();
      pedestalRuneCrimson.dispose();
    },
  };
}
