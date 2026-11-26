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

export function createLightningBladeTexture(variant: 'blue' | 'purple'): THREE.CanvasTexture {
  const width = 256;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    if (variant === 'blue') {
      grad.addColorStop(0, '#7dd3fc');
      grad.addColorStop(0.14, '#2563eb');
      grad.addColorStop(0.5, '#0c4a9e');
      grad.addColorStop(0.86, '#2563eb');
      grad.addColorStop(1, '#7dd3fc');
    } else {
      grad.addColorStop(0, '#d8b4fe');
      grad.addColorStop(0.1, '#6b21a8');
      grad.addColorStop(0.32, '#1e083b');
      grad.addColorStop(0.5, '#4c1d95');
      grad.addColorStop(0.68, '#1e083b');
      grad.addColorStop(0.9, '#6b21a8');
      grad.addColorStop(1, '#d8b4fe');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const coreGrad = ctx.createLinearGradient(0, 0, width, 0);
    if (variant === 'blue') {
      coreGrad.addColorStop(0.18, 'rgba(56, 189, 248, 0)');
      coreGrad.addColorStop(0.5, 'rgba(125, 211, 252, 0.55)');
      coreGrad.addColorStop(0.82, 'rgba(56, 189, 248, 0)');
    } else {
      coreGrad.addColorStop(0.15, 'rgba(168, 85, 247, 0)');
      coreGrad.addColorStop(0.5, 'rgba(216, 180, 254, 0.58)');
      coreGrad.addColorStop(0.85, 'rgba(168, 85, 247, 0)');
    }
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, width, height);

    const drawBolt = (
      xOffset: number,
      seedPhase: number,
      strokeColor: string,
      glowColor: string,
      lineWidth: number,
    ) => {
      ctx.save();
      ctx.beginPath();
      let x = width * 0.5 + xOffset;
      ctx.moveTo(x, 10);
      const steps = 30;
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 1; i <= steps; i++) {
        const y = 10 + ((height - 20) * i) / steps;
        const jitter =
          Math.sin(i * 2.1 + seedPhase) * 20 + Math.cos(i * 4.2 + seedPhase * 1.3) * 12;
        x = Math.max(32, Math.min(width - 32, width * 0.5 + xOffset + jitter));
        ctx.lineTo(x, y);
        pts.push({ x, y });
      }
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'miter';
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 18;
      ctx.stroke();

      ctx.lineWidth = Math.max(1.4, lineWidth * 0.45);
      for (let i = 3; i < pts.length - 3; i += 4) {
        const p = pts[i];
        const dir = i % 2 === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + dir * 22, p.y + 16);
        ctx.stroke();
      }
      ctx.restore();
    };

    if (variant === 'blue') {
      drawBolt(-16, 0.7, '#bae6fd', '#38bdf8', 4.4);
      drawBolt(16, 2.3, '#e0f2fe', '#60a5fa', 3.6);
      drawBolt(0, 4.1, '#ffffff', '#7dd3fc', 2.4);
    } else {
      drawBolt(0, 1.3, '#e9d5ff', '#c084fc', 5.2);
      drawBolt(-6, 3.1, '#fae8ff', '#e879f9', 3.0);
      drawBolt(8, 4.9, '#ffffff', '#d8b4fe', 2.0);
    }

    ctx.save();
    ctx.fillStyle = variant === 'blue' ? '#bae6fd' : '#e9d5ff';
    ctx.fillRect(0, 0, 8, height);
    ctx.fillRect(width - 8, 0, 8, height);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createPortalVortexTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;

    const bg = ctx.createRadialGradient(cx, cy, 24, cx, cy, 256);
    bg.addColorStop(0, '#1e0836');
    bg.addColorStop(0.38, '#4c1d95');
    bg.addColorStop(0.72, '#7e22ce');
    bg.addColorStop(0.91, '#c084fc');
    bg.addColorStop(0.98, '#e9d5ff');
    bg.addColorStop(1, 'rgba(192, 132, 252, 0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    for (let arm = 0; arm < 6; arm++) {
      const baseAngle = (arm * Math.PI * 2) / 6;
      ctx.save();
      ctx.beginPath();
      for (let t = 0; t <= 44; t++) {
        const frac = t / 44;
        const r = 34 + frac * 204;
        const ang = baseAngle + frac * 2.4;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (t === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = arm % 2 === 0 ? 'rgba(216, 180, 254, 0.36)' : 'rgba(240, 171, 252, 0.28)';
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 24;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 232, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(233, 213, 255, 0.85)';
    ctx.lineWidth = 10;
    ctx.shadowColor = '#d8b4fe';
    ctx.shadowBlur = 28;
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < 80; i++) {
      const ang = (i * 2.39996) % (Math.PI * 2);
      const r = 24 + ((i * 37) % 204);
      const px = cx + Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      const rad = i % 6 === 0 ? 2.6 : 1.3;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(250, 232, 255, 0.92)' : 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
