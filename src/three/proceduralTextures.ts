import * as THREE from 'three';

export function createPedestalRingTexture(
  primaryHex: string,
  glowHex: string,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;

    const baseGrad = ctx.createRadialGradient(cx, cy, 18, cx, cy, 250);
    baseGrad.addColorStop(0, '#2a3242');
    baseGrad.addColorStop(0.55, '#1d2432');
    baseGrad.addColorStop(0.88, '#171c28');
    baseGrad.addColorStop(1, '#10141f');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, size, size);

    const glowGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 240);
    glowGrad.addColorStop(0, `${glowHex}38`);
    glowGrad.addColorStop(0.55, `${primaryHex}1c`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.strokeStyle = `${primaryHex}45`;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 74, cy + Math.sin(ang) * 74);
      ctx.lineTo(cx + Math.cos(ang) * 232, cy + Math.sin(ang) * 232);
      ctx.stroke();
    }
    ctx.restore();

    const rings = [
      { r: 74, width: 2.4, alpha: 'cc', dash: [] as number[] },
      { r: 122, width: 2.0, alpha: '99', dash: [24, 10] },
      { r: 162, width: 3.0, alpha: 'dd', dash: [] as number[] },
      { r: 196, width: 1.8, alpha: '88', dash: [14, 12] },
      { r: 228, width: 3.2, alpha: 'ee', dash: [] as number[] },
    ];

    for (const ring of rings) {
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash(ring.dash);
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = `${primaryHex}${ring.alpha}`;
      ctx.lineWidth = ring.width;
      ctx.shadowColor = glowHex;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = `${glowHex}bb`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 36; i++) {
      const ang = (i * Math.PI * 2) / 36;
      const inner = i % 3 === 0 ? 214 : 220;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
      ctx.lineTo(cx + Math.cos(ang) * 228, cy + Math.sin(ang) * 228);
      ctx.stroke();
    }
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 124);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.28)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
