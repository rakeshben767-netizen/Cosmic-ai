import * as THREE from 'three';
import type { ProceduralTextureSet } from './proceduralTextures.ts';

export interface KnightRigHandle {
  root: THREE.Group;
  upperBody: THREE.Group;
  upperBodyBaseY: number;
  isSeated?: boolean;
  headGroup: THREE.Group;
  rightArmGroup: THREE.Group;
  leftArmGroup: THREE.Group;
  swordGroup: THREE.Group;
  capeFronds: THREE.Mesh[];
  haloRing?: THREE.Group;
  haloPortal?: THREE.Mesh;
  emissiveMaterials: THREE.MeshStandardMaterial[];
  auraLight: THREE.PointLight;
  dispose: () => void;
}

function normalizeUv01(geo: THREE.BufferGeometry): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const pos = geo.attributes.position;
  if (!bb || !pos) return;
  const sizeX = Math.max(0.0001, bb.max.x - bb.min.x);
  const sizeY = Math.max(0.0001, bb.max.y - bb.min.y);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - bb.min.x) / sizeX;
    uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / sizeY;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function createBeveledShapeMesh(
  points: Array<[number, number]>,
  depth: number,
  bevelSize: number,
  material: THREE.Material,
  castShadow: boolean,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevelSize,
    bevelSize,
    bevelSegments: 2,
    steps: 1,
  });
  geo.center();
  normalizeUv01(geo);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function buildLayeredPauldron(
  side: -1 | 1,
  armorMat: THREE.Material,
  trimMat: THREE.Material,
  glowMat: THREE.Material,
  castShadow: boolean,
  tierCount: number,
): THREE.Group {
  const group = new THREE.Group();

  // 3 stacked overlapping crescent armor tiers (replaces generic sphere)
  for (let t = 0; t < tierCount; t++) {
    const scale = 1 - t * 0.14;
    const plate = createBeveledShapeMesh(
      [
        [-0.14 * scale, 0.08 * scale],
        [0.06 * scale, 0.13 * scale],
        [0.18 * scale, 0.02 * scale],
        [0.14 * scale, -0.09 * scale],
        [-0.12 * scale, -0.06 * scale],
      ],
      0.22 * scale,
      0.016,
      t === 0 ? armorMat : trimMat,
      castShadow,
    );
    plate.position.set(side * (0.04 + t * 0.055), 0.06 - t * 0.068, 0);
    plate.rotation.z = side * -(0.35 + t * 0.24);
    if (side === -1) {
      plate.scale.x = -1;
    }
    group.add(plate);

    // Outward blade spike on each tier
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.028 * scale, 0.17 * scale, 4),
      trimMat,
    );
    spike.position.set(side * (0.16 + t * 0.03), 0.08 - t * 0.07, 0);
    spike.rotation.z = side * -(1.15 + t * 0.18);
    group.add(spike);
  }

  // Front glowing shoulder node
  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.046, 1), glowMat);
  orb.position.set(side * 0.06, 0.01, 0.125);
  group.add(orb);

  return group;
}

function buildLegAssembly(
  side: -1 | 1,
  armorMat: THREE.MeshStandardMaterial,
  darkSuitMat: THREE.MeshStandardMaterial,
  trimMat: THREE.MeshStandardMaterial,
  glowMat: THREE.MeshStandardMaterial,
  castShadow: boolean,
): THREE.Group {
  const leg = new THREE.Group();
  const hipX = side * 0.19;
  leg.position.set(hipX, 1.12, 0);
  // Heroic wide A-stance: left leg (-1) angles to -X, right leg (+1) angles to +X
  leg.rotation.z = side * 0.15;

  // Thigh under-suit
  const thighCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.36, 6, 12), darkSuitMat);
  thighCore.position.set(0, -0.24, 0);
  thighCore.castShadow = castShadow;
  leg.add(thighCore);

  // Sculpted angled thigh armor cuisse
  const thighPlate = createBeveledShapeMesh(
    [
      [-0.115, 0.23],
      [0.115, 0.23],
      [0.095, -0.2],
      [0, -0.27],
      [-0.095, -0.2],
    ],
    0.13,
    0.018,
    armorMat,
    castShadow,
  );
  thighPlate.position.set(0, -0.23, 0.045);
  leg.add(thighPlate);

  // Angular Knee Poleyn + Glowing Chevron Trim
  const knee = createBeveledShapeMesh(
    [
      [0, 0.13],
      [0.095, 0.02],
      [0.065, -0.11],
      [0, -0.15],
      [-0.065, -0.11],
      [-0.095, 0.02],
    ],
    0.11,
    0.016,
    trimMat,
    castShadow,
  );
  knee.rotation.x = -0.18;
  knee.position.set(0, -0.52, 0.11);
  leg.add(knee);

  const kneeGlow = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.022, 0.04), glowMat);
  kneeGlow.position.set(0, -0.55, 0.155);
  leg.add(kneeGlow);

  // Shin Greave
  const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.075, 0.5, 8), armorMat);
  greave.position.set(0, -0.82, 0.01);
  greave.castShadow = castShadow;
  leg.add(greave);

  const shinRidge = createBeveledShapeMesh(
    [
      [-0.052, 0.24],
      [0.052, 0.24],
      [0.032, -0.24],
      [0, -0.28],
      [-0.032, -0.24],
    ],
    0.075,
    0.014,
    trimMat,
    castShadow,
  );
  shinRidge.position.set(0, -0.82, 0.075);
  leg.add(shinRidge);

  // Ankle spurs
  for (let s = 0; s < 2; s++) {
    const ankleSpike = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.13, 4), trimMat);
    ankleSpike.rotation.z = side * -(0.85 + s * 0.25);
    ankleSpike.position.set(side * 0.085, -0.95 - s * 0.05, -0.02);
    leg.add(ankleSpike);
  }

  // Sabaton (armored boot) flat on ground at y = 0
  const foot = createBeveledShapeMesh(
    [
      [-0.078, 0.09],
      [0.078, 0.09],
      [0.085, -0.09],
      [0, -0.18],
      [-0.085, -0.09],
    ],
    0.1,
    0.014,
    armorMat,
    castShadow,
  );
  foot.rotation.x = Math.PI / 2;
  foot.rotation.z = -side * 0.15;
  foot.position.set(-side * 0.02, -1.07, 0.11);
  leg.add(foot);

  const toeCap = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), trimMat);
  toeCap.rotation.x = Math.PI / 2;
  toeCap.position.set(-side * 0.02, -1.08, 0.26);
  leg.add(toeCap);

  return leg;
}

export function createBlueKnightRig(
  textures: ProceduralTextureSet,
  castShadow: boolean,
): KnightRigHandle {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const blackArmorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x161a28,
      metalness: 0.88,
      roughness: 0.28,
      bumpMap: textures.armorBump,
      bumpScale: 0.015,
      roughnessMap: textures.armorRoughness,
    }),
  );

  const gunmetalTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x38435e,
      metalness: 0.92,
      roughness: 0.22,
    }),
  );

  const darkSuitMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0e1018,
      metalness: 0.18,
      roughness: 0.72,
    }),
  );

  const hairMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0c0e15,
      metalness: 0.22,
      roughness: 0.68,
    }),
  );

  const cyanGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x00c8ff,
      emissiveIntensity: 1.05,
      metalness: 0.2,
      roughness: 0.18,
    }),
  );

  const subtleBlueAccentMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      emissive: 0x1e40af,
      emissiveIntensity: 1.1,
      metalness: 0.3,
      roughness: 0.25,
    }),
  );

  const capeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x141825,
      emissive: 0x09223a,
      emissiveIntensity: 0.38,
      metalness: 0.14,
      roughness: 0.78,
      side: THREE.DoubleSide,
    }),
  );

  const swordBladeCoreMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.blueSwordEnergy,
      emissive: 0x0ea5e9,
      emissiveMap: textures.blueSwordEnergy,
      emissiveIntensity: 1.35,
      metalness: 0.35,
      roughness: 0.2,
    }),
  );

  const swordEdgeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x8be9ff,
      emissive: 0x0284c7,
      emissiveIntensity: 0.7,
      metalness: 0.88,
      roughness: 0.16,
    }),
  );

  // Grounded Wide-Stance Legs
  root.add(buildLegAssembly(-1, blackArmorMat, darkSuitMat, gunmetalTrimMat, cyanGlowMat, castShadow));
  root.add(buildLegAssembly(1, blackArmorMat, darkSuitMat, gunmetalTrimMat, cyanGlowMat, castShadow));

  // Upper Body
  const upperBody = new THREE.Group();
  upperBody.position.set(0, 1.15, 0);
  root.add(upperBody);

  // Armored Belt & Tassets
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.1, 8), gunmetalTrimMat);
  belt.position.set(0, 0.04, 0);
  upperBody.add(belt);

  const frontTasset = createBeveledShapeMesh(
    [
      [-0.09, 0.22],
      [0.09, 0.22],
      [0.065, -0.22],
      [0, -0.34],
      [-0.065, -0.22],
    ],
    0.045,
    0.014,
    blackArmorMat,
    castShadow,
  );
  frontTasset.rotation.x = -0.2;
  frontTasset.position.set(0, -0.22, 0.19);
  upperBody.add(frontTasset);

  for (const side of [-1, 1] as const) {
    const hipTasset = createBeveledShapeMesh(
      [
        [-0.075, 0.22],
        [0.075, 0.22],
        [0.125, -0.22],
        [-0.09, -0.17],
      ],
      0.035,
      0.01,
      blackArmorMat,
      castShadow,
    );
    hipTasset.rotation.z = side * 0.42;
    hipTasset.rotation.y = side * 0.35;
    hipTasset.position.set(side * 0.24, -0.14, 0.04);
    upperBody.add(hipTasset);
  }

  // Sculpted V-Tapered Abdomen & Cuirass
  const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.175, 0.34, 8), darkSuitMat);
  abdomen.position.set(0, 0.25, 0);
  upperBody.add(abdomen);

  for (let i = 0; i < 3; i++) {
    const seg = createBeveledShapeMesh(
      [
        [-0.14 + i * 0.01, 0.028],
        [0.14 - i * 0.01, 0.028],
        [0.12 - i * 0.01, -0.028],
        [-0.12 + i * 0.01, -0.028],
      ],
      0.16,
      0.01,
      blackArmorMat,
      castShadow,
    );
    seg.position.set(0, 0.18 + i * 0.07, 0.04);
    upperBody.add(seg);

    const ribSlit = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.03), subtleBlueAccentMat);
    ribSlit.position.set(0, 0.18 + i * 0.07, 0.13);
    upperBody.add(ribSlit);
  }

  // Sculpted V-tapered Breastplate
  const chestPlate = createBeveledShapeMesh(
    [
      [-0.29, 0.22],
      [0.29, 0.22],
      [0.26, 0.02],
      [0.19, -0.19],
      [0, -0.25],
      [-0.19, -0.19],
      [-0.26, 0.02],
    ],
    0.24,
    0.028,
    blackArmorMat,
    castShadow,
  );
  chestPlate.position.set(0, 0.56, 0.03);
  upperBody.add(chestPlate);

  // Glowing Cyan V-shaped Chest Emblem
  const chestCore = createBeveledShapeMesh(
    [
      [-0.11, 0.07],
      [0, 0.005],
      [0.11, 0.07],
      [0, -0.09],
    ],
    0.04,
    0.008,
    cyanGlowMat,
    false,
  );
  chestCore.position.set(0, 0.58, 0.18);
  upperBody.add(chestCore);

  // Armored Collar
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.17, 0.13, 8, 1, true, Math.PI * 0.25, Math.PI * 1.5),
    gunmetalTrimMat,
  );
  collar.rotation.y = Math.PI;
  collar.position.set(0, 0.78, -0.01);
  upperBody.add(collar);

  // Head + Sleek Dark Faceplate + Cyan Visor + Full Spiky Black Hair
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.96, 0.02);
  upperBody.add(headGroup);

  const helmBase = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 14), darkSuitMat);
  helmBase.scale.set(0.9, 1.05, 1.0);
  headGroup.add(helmBase);

  const faceplate = createBeveledShapeMesh(
    [
      [-0.095, 0.055],
      [0.095, 0.055],
      [0.068, -0.11],
      [0, -0.145],
      [-0.068, -0.11],
    ],
    0.085,
    0.014,
    blackArmorMat,
    castShadow,
  );
  faceplate.position.set(0, -0.03, 0.095);
  headGroup.add(faceplate);

  // Sharp glowing V-visor
  const visorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.028), cyanGlowMat);
  visorLeft.position.set(-0.038, 0.015, 0.15);
  visorLeft.rotation.z = -0.22;
  headGroup.add(visorLeft);

  const visorRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.028), cyanGlowMat);
  visorRight.position.set(0.038, 0.015, 0.15);
  visorRight.rotation.z = 0.22;
  headGroup.add(visorRight);

  // Sculpted Full Spiky Black Hair Crown & Bangs
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.148, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairMat,
  );
  hairCap.position.set(0, 0.02, -0.01);
  headGroup.add(hairCap);

  const hairSpikes: Array<[number, number, number, number, number, number, number]> = [
    // Front bangs draping over visor edge
    [-0.065, 0.095, 0.12, 1.25, 0, 0.25, 0.15],
    [-0.02, 0.105, 0.135, 1.35, 0, 0.08, 0.16],
    [0.03, 0.105, 0.13, 1.32, 0, -0.12, 0.16],
    [0.075, 0.09, 0.115, 1.2, 0, -0.32, 0.14],
    // Crown spikes
    [0, 0.165, 0.01, -0.15, 0, 0.08, 0.19],
    [-0.08, 0.15, 0.03, 0.1, 0, 0.52, 0.18],
    [0.08, 0.15, 0.03, 0.1, 0, -0.52, 0.18],
    [-0.12, 0.11, -0.02, -0.15, 0, 0.85, 0.17],
    [0.12, 0.11, -0.02, -0.15, 0, -0.85, 0.17],
    // Back spikes
    [0, 0.14, -0.11, -0.78, 0, 0, 0.19],
    [-0.075, 0.11, -0.11, -0.68, 0, 0.45, 0.17],
    [0.075, 0.11, -0.11, -0.68, 0, -0.45, 0.17],
    [-0.11, 0.05, -0.09, -0.95, 0, 0.72, 0.15],
    [0.11, 0.05, -0.09, -0.95, 0, -0.72, 0.15],
  ];
  for (const [hx, hy, hz, rx, ry, rz, len] of hairSpikes) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.048, len, 5), hairMat);
    spike.position.set(hx, hy, hz);
    spike.rotation.set(rx, ry, rz);
    headGroup.add(spike);
  }

  // Right Arm + Layered Pauldron + Giant Blue Energy Greatsword
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(-0.34, 0.69, 0.02);
  upperBody.add(rightArmGroup);

  rightArmGroup.add(buildLayeredPauldron(-1, blackArmorMat, gunmetalTrimMat, cyanGlowMat, castShadow, 3));

  const rUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.24, 5, 10), darkSuitMat);
  rUpperArm.position.set(-0.12, -0.16, 0.02);
  rUpperArm.rotation.z = -0.42;
  rightArmGroup.add(rUpperArm);

  const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.068, 0.28, 8), blackArmorMat);
  rForearm.position.set(-0.24, -0.25, 0.15);
  rForearm.rotation.set(-0.65, 0, -0.95);
  rightArmGroup.add(rForearm);

  const rGauntlet = new THREE.Mesh(new THREE.SphereGeometry(0.064, 10, 8), blackArmorMat);
  rGauntlet.position.set(-0.29, -0.21, 0.25);
  rightArmGroup.add(rGauntlet);

  // Giant Blue Energy Greatsword (scaled cleanly so tip sits just above pedestal at y ~ 0.06)
  const swordGroup = new THREE.Group();
  swordGroup.position.set(-0.31, -0.21, 0.27);
  swordGroup.rotation.set(0.03, 0.1, -0.04);
  rightArmGroup.add(swordGroup);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.027, 0.5, 8), darkSuitMat);
  grip.position.set(0, 0.08, 0);
  swordGroup.add(grip);

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.062, 0), gunmetalTrimMat);
  pommel.scale.set(0.88, 1.35, 0.7);
  pommel.position.set(0, 0.36, 0);
  swordGroup.add(pommel);

  const crossguard = createBeveledShapeMesh(
    [
      [-0.35, 0.09],
      [-0.12, 0.05],
      [0, 0.13],
      [0.12, 0.05],
      [0.35, 0.09],
      [0.18, -0.07],
      [0, -0.14],
      [-0.18, -0.07],
    ],
    0.07,
    0.014,
    gunmetalTrimMat,
    castShadow,
  );
  crossguard.position.set(0, -0.18, 0);
  swordGroup.add(crossguard);

  const hiltGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.066, 0), cyanGlowMat);
  hiltGem.scale.set(0.75, 1.45, 0.55);
  hiltGem.position.set(0, -0.2, 0.042);
  swordGroup.add(hiltGem);

  const bladeCore = createBeveledShapeMesh(
    [
      [-0.135, 0.62],
      [0.135, 0.62],
      [0.115, -0.52],
      [0, -0.71],
      [-0.115, -0.52],
    ],
    0.03,
    0.009,
    swordBladeCoreMat,
    castShadow,
  );
  bladeCore.position.set(0, -0.84, 0);
  swordGroup.add(bladeCore);

  const bladeEdgeFrame = createBeveledShapeMesh(
    [
      [-0.17, 0.64],
      [0.17, 0.64],
      [0.145, -0.53],
      [0, -0.75],
      [-0.145, -0.53],
    ],
    0.016,
    0.007,
    swordEdgeMat,
    false,
  );
  bladeEdgeFrame.position.set(0, -0.84, -0.002);
  swordGroup.add(bladeEdgeFrame);

  // Left Arm + Multi-Tiered Spiked Pauldron
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(0.34, 0.69, 0.02);
  upperBody.add(leftArmGroup);

  leftArmGroup.add(buildLayeredPauldron(1, blackArmorMat, gunmetalTrimMat, cyanGlowMat, castShadow, 4));

  const lUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.24, 5, 10), darkSuitMat);
  lUpperArm.position.set(0.1, -0.18, 0);
  lUpperArm.rotation.z = 0.26;
  leftArmGroup.add(lUpperArm);

  const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.068, 0.29, 8), blackArmorMat);
  lForearm.position.set(0.17, -0.41, 0.08);
  lForearm.rotation.set(-0.35, 0, 0.2);
  leftArmGroup.add(lForearm);

  const lWristOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 1), cyanGlowMat);
  lWristOrb.position.set(0.21, -0.39, 0.16);
  leftArmGroup.add(lWristOrb);

  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), blackArmorMat);
  lHand.position.set(0.15, -0.56, 0.14);
  leftArmGroup.add(lHand);

  // Flowing Tattered Cape Fronds
  const capeFronds: THREE.Mesh[] = [];
  const frondAngles = [-0.52, -0.26, 0, 0.26, 0.52];
  for (let i = 0; i < frondAngles.length; i++) {
    const frond = createBeveledShapeMesh(
      [
        [-0.15, 0.62],
        [0.15, 0.62],
        [0.24, -0.56],
        [0.06, -0.76],
        [-0.08, -0.6],
        [-0.22, -0.73],
      ],
      0.012,
      0.004,
      capeMat,
      castShadow,
    );
    frond.position.set(frondAngles[i] * 0.92, 0.06, -0.25 - Math.abs(frondAngles[i]) * 0.12);
    frond.rotation.set(0.24, frondAngles[i] * 0.35, frondAngles[i] * 0.58);
    upperBody.add(frond);
    capeFronds.push(frond);
  }

  const auraLight = new THREE.PointLight(0x22d3ee, 2.4, 5.5, 1.6);
  auraLight.position.set(0, 1.55, 0.7);
  root.add(auraLight);

  return {
    root,
    upperBody,
    upperBodyBaseY: 1.155,
    isSeated: false,
    headGroup,
    rightArmGroup,
    leftArmGroup,
    swordGroup,
    capeFronds,
    emissiveMaterials: [cyanGlowMat, swordBladeCoreMat, swordEdgeMat],
    auraLight,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
        }
      });
    },
  };
}

export function createPurpleKnightRig(
  textures: ProceduralTextureSet,
  castShadow: boolean,
): KnightRigHandle {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const obsidianArmorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x171422,
      metalness: 0.9,
      roughness: 0.24,
      bumpMap: textures.armorBump,
      bumpScale: 0.017,
      roughnessMap: textures.armorRoughness,
    }),
  );

  const gunmetalTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x453b59,
      metalness: 0.92,
      roughness: 0.2,
    }),
  );

  const darkSuitMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0d0b14,
      metalness: 0.18,
      roughness: 0.74,
    }),
  );

  const violetGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xc084fc,
      emissive: 0x9333ea,
      emissiveIntensity: 1.45,
      metalness: 0.24,
      roughness: 0.18,
    }),
  );

  const capeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x161124,
      emissive: 0x4c1d95,
      emissiveIntensity: 0.5,
      metalness: 0.16,
      roughness: 0.78,
      side: THREE.DoubleSide,
    }),
  );

  const swordCoreMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.purpleSwordLightning,
      emissive: 0xa855f7,
      emissiveMap: textures.purpleSwordLightning,
      emissiveIntensity: 1.45,
      metalness: 0.35,
      roughness: 0.2,
    }),
  );

  const swordFrameMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3b334f,
      emissive: 0x6b21a8,
      emissiveIntensity: 0.45,
      metalness: 0.9,
      roughness: 0.2,
    }),
  );

  const portalDiscMat = track(
    new THREE.MeshBasicMaterial({
      map: textures.cosmicPortal,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  // Grounded Wide-Stance Legs
  root.add(
    buildLegAssembly(-1, obsidianArmorMat, darkSuitMat, gunmetalTrimMat, violetGlowMat, castShadow),
  );
  root.add(
    buildLegAssembly(1, obsidianArmorMat, darkSuitMat, gunmetalTrimMat, violetGlowMat, castShadow),
  );

  // Upper Body
  const upperBodyBaseY = 1.155;
  const upperBody = new THREE.Group();
  upperBody.position.set(0, upperBodyBaseY, 0);
  root.add(upperBody);

  // Floating Cosmic Portal Halo Ring behind Shoulders
  const haloGroup = new THREE.Group();
  haloGroup.position.set(0, 0.62, -0.34);
  upperBody.add(haloGroup);

  const haloPortal = new THREE.Mesh(new THREE.CircleGeometry(0.95, 48), portalDiscMat);
  haloGroup.add(haloPortal);

  const haloRing = new THREE.Group();
  haloGroup.add(haloRing);

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.96, 0.045, 10, 48),
    gunmetalTrimMat,
  );
  haloRing.add(outerRing);

  const innerVioletRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.91, 0.016, 8, 48),
    violetGlowMat,
  );
  haloRing.add(innerVioletRing);

  for (let s = 0; s < 8; s++) {
    const angle = (s * Math.PI * 2) / 8;
    const starSpikeGroup = new THREE.Group();
    starSpikeGroup.position.set(Math.cos(angle) * 0.98, Math.sin(angle) * 0.98, 0);
    starSpikeGroup.rotation.z = angle - Math.PI / 2;

    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.24, 4), gunmetalTrimMat);
    spike.position.set(0, 0.1, 0);
    starSpikeGroup.add(spike);

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), violetGlowMat);
    gem.position.set(0, 0.01, 0.032);
    starSpikeGroup.add(gem);

    haloRing.add(starSpikeGroup);
  }

  // Sculpted Armored Belt & Violet Crystal Clasp
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.1, 8), gunmetalTrimMat);
  belt.position.set(0, 0.04, 0);
  upperBody.add(belt);

  const beltCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.056, 0), violetGlowMat);
  beltCrystal.scale.set(0.85, 1.15, 0.55);
  beltCrystal.position.set(0, 0.045, 0.205);
  upperBody.add(beltCrystal);

  // Long Ornate Loincloth Banner with Central Violet Chevron Vein
  const frontBanner = createBeveledShapeMesh(
    [
      [-0.095, 0.26],
      [0.095, 0.26],
      [0.075, -0.34],
      [0, -0.46],
      [-0.075, -0.34],
    ],
    0.04,
    0.012,
    obsidianArmorMat,
    castShadow,
  );
  frontBanner.rotation.x = -0.14;
  frontBanner.position.set(0, -0.27, 0.19);
  upperBody.add(frontBanner);

  const bannerVein = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.5, 0.025), violetGlowMat);
  bannerVein.rotation.x = -0.14;
  bannerVein.position.set(0, -0.25, 0.215);
  upperBody.add(bannerVein);

  for (const side of [-1, 1] as const) {
    const hipTasset = createBeveledShapeMesh(
      [
        [-0.085, 0.25],
        [0.085, 0.25],
        [0.14, -0.26],
        [-0.1, -0.2],
      ],
      0.036,
      0.012,
      obsidianArmorMat,
      castShadow,
    );
    hipTasset.rotation.z = side * 0.44;
    hipTasset.rotation.y = side * 0.34;
    hipTasset.position.set(side * 0.24, -0.14, 0.05);
    upperBody.add(hipTasset);
  }

  // Segmented Abdomen & Breastplate with Violet Crystal Crest
  const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.175, 0.34, 8), darkSuitMat);
  abdomen.position.set(0, 0.25, 0);
  upperBody.add(abdomen);

  for (let i = 0; i < 3; i++) {
    const seg = createBeveledShapeMesh(
      [
        [-0.14 + i * 0.01, 0.028],
        [0.14 - i * 0.01, 0.028],
        [0.12 - i * 0.01, -0.028],
        [-0.12 + i * 0.01, -0.028],
      ],
      0.16,
      0.01,
      obsidianArmorMat,
      castShadow,
    );
    seg.position.set(0, 0.18 + i * 0.07, 0.04);
    upperBody.add(seg);

    const ribSlit = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.028), violetGlowMat);
    ribSlit.position.set(0, 0.18 + i * 0.07, 0.13);
    upperBody.add(ribSlit);
  }

  const chestPlate = createBeveledShapeMesh(
    [
      [-0.3, 0.22],
      [0.3, 0.22],
      [0.26, 0.02],
      [0.19, -0.19],
      [0, -0.25],
      [-0.19, -0.19],
      [-0.26, 0.02],
    ],
    0.24,
    0.028,
    obsidianArmorMat,
    castShadow,
  );
  chestPlate.position.set(0, 0.56, 0.03);
  upperBody.add(chestPlate);

  const chestGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.072, 0), violetGlowMat);
  chestGem.scale.set(0.85, 1.35, 0.55);
  chestGem.position.set(0, 0.56, 0.185);
  upperBody.add(chestGem);

  // Armored Collar
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.17, 0.13, 8, 1, true, Math.PI * 0.25, Math.PI * 1.5),
    gunmetalTrimMat,
  );
  collar.rotation.y = Math.PI;
  collar.position.set(0, 0.78, -0.01);
  upperBody.add(collar);

  // Head + Sleek Dark Faceplate + Violet Visor + Towering 7-Spike Crown
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.96, 0.02);
  upperBody.add(headGroup);

  const helmBase = new THREE.Mesh(new THREE.SphereGeometry(0.136, 16, 14), obsidianArmorMat);
  helmBase.scale.set(0.9, 1.06, 1.02);
  helmBase.castShadow = castShadow;
  headGroup.add(helmBase);

  const faceplate = createBeveledShapeMesh(
    [
      [-0.092, 0.06],
      [0.092, 0.06],
      [0.068, -0.115],
      [0, -0.15],
      [-0.068, -0.115],
    ],
    0.088,
    0.013,
    obsidianArmorMat,
    castShadow,
  );
  faceplate.position.set(0, -0.025, 0.092);
  headGroup.add(faceplate);

  // Piercing Violet V-Visor Slits
  const visorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.018, 0.028), violetGlowMat);
  visorLeft.position.set(-0.036, 0.018, 0.15);
  visorLeft.rotation.z = -0.26;
  headGroup.add(visorLeft);

  const visorRight = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.018, 0.028), violetGlowMat);
  visorRight.position.set(0.036, 0.018, 0.15);
  visorRight.rotation.z = 0.26;
  headGroup.add(visorRight);

  // 7-Spike Royal Shadow Crown
  const crownSpecs: Array<[number, number, number, number, number, number]> = [
    [0, 0.2, 0.03, 0, 0, 0.26],
    [-0.055, 0.18, 0.035, 0.12, 0.18, 0.22],
    [0.055, 0.18, 0.035, 0.12, -0.18, 0.22],
    [-0.105, 0.16, 0.02, 0.05, 0.38, 0.22],
    [0.105, 0.16, 0.02, 0.05, -0.38, 0.22],
    [-0.13, 0.12, -0.03, -0.18, 0.56, 0.18],
    [0.13, 0.12, -0.03, -0.18, -0.56, 0.18],
  ];
  for (const [cx, cy, cz, rx, rz, len] of crownSpecs) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.026, len, 4), gunmetalTrimMat);
    spike.position.set(cx, cy, cz);
    spike.rotation.set(rx, 0, rz);
    headGroup.add(spike);
  }

  // Right Arm (Viewer's Left) + Enormous Vertical Lightning Purple Greatsword
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(-0.34, 0.69, 0.02);
  upperBody.add(rightArmGroup);

  rightArmGroup.add(
    buildLayeredPauldron(-1, obsidianArmorMat, gunmetalTrimMat, violetGlowMat, castShadow, 4),
  );

  const rUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.24, 5, 10), darkSuitMat);
  rUpperArm.position.set(-0.14, -0.15, 0.02);
  rUpperArm.rotation.z = -0.48;
  rightArmGroup.add(rUpperArm);

  const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.068, 0.28, 8), obsidianArmorMat);
  rForearm.position.set(-0.27, -0.18, 0.16);
  rForearm.rotation.set(-0.78, 0, -1.05);
  rForearm.castShadow = castShadow;
  rightArmGroup.add(rForearm);

  const rGauntlet = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), obsidianArmorMat);
  rGauntlet.position.set(-0.33, -0.14, 0.26);
  rightArmGroup.add(rGauntlet);

  // Towering Vertical Purple Lightning Greatsword (Grounded just above pedestal)
  const swordGroup = new THREE.Group();
  swordGroup.position.set(-0.35, -0.14, 0.28);
  swordGroup.rotation.set(0.02, 0.08, -0.02);
  rightArmGroup.add(swordGroup);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.48, 8), darkSuitMat);
  grip.position.set(0, 0.08, 0);
  swordGroup.add(grip);

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.068, 0), gunmetalTrimMat);
  pommel.scale.set(1.2, 1.1, 0.7);
  pommel.position.set(0, 0.34, 0);
  swordGroup.add(pommel);

  const pommelGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.036, 0), violetGlowMat);
  pommelGem.position.set(0, 0.34, 0.04);
  swordGroup.add(pommelGem);

  const crossguard = createBeveledShapeMesh(
    [
      [-0.36, 0.13],
      [-0.13, 0.06],
      [0, 0.14],
      [0.13, 0.06],
      [0.36, 0.13],
      [0.19, -0.08],
      [0, -0.16],
      [-0.19, -0.08],
    ],
    0.072,
    0.015,
    gunmetalTrimMat,
    castShadow,
  );
  crossguard.position.set(0, -0.18, 0);
  swordGroup.add(crossguard);

  const guardCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), violetGlowMat);
  guardCrystal.scale.set(0.8, 1.35, 0.58);
  guardCrystal.position.set(0, -0.19, 0.045);
  swordGroup.add(guardCrystal);

  const bladeCore = createBeveledShapeMesh(
    [
      [-0.155, 0.68],
      [0.155, 0.68],
      [0.135, -0.56],
      [0, -0.78],
      [-0.135, -0.56],
    ],
    0.034,
    0.01,
    swordCoreMat,
    castShadow,
  );
  bladeCore.position.set(0, -0.92, 0);
  swordGroup.add(bladeCore);

  const bladeFrame = createBeveledShapeMesh(
    [
      [-0.19, 0.7],
      [0.19, 0.7],
      [0.165, -0.57],
      [0, -0.82],
      [-0.165, -0.57],
    ],
    0.018,
    0.008,
    swordFrameMat,
    false,
  );
  bladeFrame.position.set(0, -0.92, -0.002);
  swordGroup.add(bladeFrame);

  // Left Arm (Viewer's Right) + Spiked Pauldron
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(0.34, 0.69, 0.02);
  upperBody.add(leftArmGroup);

  leftArmGroup.add(
    buildLayeredPauldron(1, obsidianArmorMat, gunmetalTrimMat, violetGlowMat, castShadow, 4),
  );

  const lUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.24, 5, 10), darkSuitMat);
  lUpperArm.position.set(0.11, -0.18, 0);
  lUpperArm.rotation.z = 0.28;
  leftArmGroup.add(lUpperArm);

  const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.068, 0.29, 8), obsidianArmorMat);
  lForearm.position.set(0.18, -0.41, 0.08);
  lForearm.rotation.set(-0.34, 0, 0.18);
  lForearm.castShadow = castShadow;
  leftArmGroup.add(lForearm);

  const lWristCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), violetGlowMat);
  lWristCrystal.position.set(0.22, -0.39, 0.16);
  leftArmGroup.add(lWristCrystal);

  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.064, 10, 8), obsidianArmorMat);
  lHand.position.set(0.16, -0.56, 0.14);
  leftArmGroup.add(lHand);

  // Tattered Shadow-Violet Cape Fronds
  const capeFronds: THREE.Mesh[] = [];
  const frondAngles = [-0.58, -0.3, 0, 0.3, 0.58];
  for (let i = 0; i < frondAngles.length; i++) {
    const frond = createBeveledShapeMesh(
      [
        [-0.16, 0.64],
        [0.16, 0.64],
        [0.25, -0.62],
        [0.08, -0.84],
        [-0.08, -0.64],
        [-0.24, -0.8],
      ],
      0.012,
      0.004,
      capeMat,
      castShadow,
    );
    frond.position.set(frondAngles[i] * 0.94, 0.04, -0.24 - Math.abs(frondAngles[i]) * 0.12);
    frond.rotation.set(0.24, frondAngles[i] * 0.36, frondAngles[i] * 0.54);
    upperBody.add(frond);
    capeFronds.push(frond);
  }

  const auraLight = new THREE.PointLight(0xa855f7, 3.0, 6.0, 1.5);
  auraLight.position.set(0, 1.55, 0.78);
  root.add(auraLight);

  return {
    root,
    upperBody,
    upperBodyBaseY,
    isSeated: false,
    headGroup,
    rightArmGroup,
    leftArmGroup,
    swordGroup,
    capeFronds,
    haloRing,
    haloPortal,
    emissiveMaterials: [violetGlowMat, swordCoreMat, capeMat],
    auraLight,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
        }
      });
    },
  };
}
