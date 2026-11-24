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

function buildSkullArmrest(
  boneMat: THREE.Material,
  darkHollowMat: THREE.Material,
  castShadow: boolean,
): THREE.Group {
  const skull = new THREE.Group();

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), boneMat);
  cranium.scale.set(0.95, 1.05, 1.15);
  cranium.castShadow = castShadow;
  skull.add(cranium);

  const cheekLeft = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.085), boneMat);
  cheekLeft.position.set(-0.065, -0.055, 0.055);
  skull.add(cheekLeft);

  const cheekRight = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.085), boneMat);
  cheekRight.position.set(0.065, -0.055, 0.055);
  skull.add(cheekRight);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.065, 0.095), boneMat);
  jaw.position.set(0, -0.105, 0.05);
  skull.add(jaw);

  for (const sx of [-0.042, 0.042]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.029, 8, 8), darkHollowMat);
    socket.scale.set(1.1, 0.85, 0.6);
    socket.position.set(sx, -0.005, 0.105);
    skull.add(socket);
  }

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.036, 3), darkHollowMat);
  nose.position.set(0, -0.045, 0.116);
  skull.add(nose);

  return skull;
}

export function createCrimsonOverlordRig(
  textures: ProceduralTextureSet,
  castShadow: boolean,
): KnightRigHandle {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const obsidianChromeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x15161b,
      metalness: 0.94,
      roughness: 0.19,
      bumpMap: textures.armorBump,
      bumpScale: 0.018,
      roughnessMap: textures.armorRoughness,
    }),
  );

  const darkIronTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x353844,
      metalness: 0.95,
      roughness: 0.18,
    }),
  );

  const darkSuitMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0b0b0f,
      metalness: 0.2,
      roughness: 0.78,
    }),
  );

  const basaltStoneMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x222024,
      metalness: 0.18,
      roughness: 0.86,
      bumpMap: textures.armorBump,
      bumpScale: 0.025,
    }),
  );

  const skullBoneMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x5c534c,
      metalness: 0.14,
      roughness: 0.72,
    }),
  );

  const infernoEmberMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xff5a1f,
      emissive: 0xff2f00,
      emissiveIntensity: 1.55,
      metalness: 0.2,
      roughness: 0.22,
    }),
  );

  const crimsonSwordMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.crimsonSwordMagma,
      emissive: 0xff3b10,
      emissiveMap: textures.crimsonSwordMagma,
      emissiveIntensity: 1.5,
      metalness: 0.55,
      roughness: 0.22,
    }),
  );

  const capeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x160b0c,
      emissive: 0x450a0a,
      emissiveIntensity: 0.45,
      metalness: 0.15,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
  );

  // ============================================================================
  // 1. JAGGED OBSIDIAN & SKULL THRONE (Grounded flush on pedestal at y = 0)
  // ============================================================================
  const throneGroup = new THREE.Group();
  root.add(throneGroup);

  const daisBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.06, 1.18, 0.12, 8),
    basaltStoneMat,
  );
  daisBase.position.set(0, 0.06, -0.05);
  daisBase.receiveShadow = true;
  throneGroup.add(daisBase);

  const seatBlock = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.58, 0.66), basaltStoneMat);
  seatBlock.position.set(0, 0.38, -0.14);
  seatBlock.castShadow = castShadow;
  seatBlock.receiveShadow = true;
  throneGroup.add(seatBlock);

  const seatSlab = createBeveledShapeMesh(
    [
      [-0.5, 0.34],
      [0.5, 0.34],
      [0.44, -0.34],
      [-0.44, -0.34],
    ],
    0.1,
    0.02,
    darkIronTrimMat,
    castShadow,
  );
  seatSlab.rotation.x = Math.PI / 2;
  seatSlab.position.set(0, 0.68, -0.12);
  throneGroup.add(seatSlab);

  // Towering jagged stone spires behind the knight
  const backSpireSpecs: Array<[number, number, number, number, number, number]> = [
    [0, 1.56, -0.46, 0.34, 1.95, 0],
    [-0.28, 1.48, -0.44, 0.28, 1.75, 0.1],
    [0.28, 1.48, -0.44, 0.28, 1.75, -0.1],
    [-0.54, 1.32, -0.38, 0.24, 1.45, 0.22],
    [0.54, 1.32, -0.38, 0.24, 1.45, -0.22],
    [-0.72, 1.05, -0.28, 0.2, 1.05, 0.34],
    [0.72, 1.05, -0.28, 0.2, 1.05, -0.34],
  ];
  for (const [sx, sy, sz, sw, sh, rz] of backSpireSpecs) {
    const spire = createBeveledShapeMesh(
      [
        [0, sh * 0.55],
        [sw * 0.55, -sh * 0.45],
        [0, -sh * 0.55],
        [-sw * 0.55, -sh * 0.45],
      ],
      0.16,
      0.02,
      basaltStoneMat,
      castShadow,
    );
    spire.position.set(sx, sy, sz);
    spire.rotation.z = rz;
    spire.rotation.x = -0.06;
    throneGroup.add(spire);
  }

  // Bone pillars & skull armrests flanking both sides
  for (const side of [-1, 1] as const) {
    const armWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.72, 0.62),
      basaltStoneMat,
    );
    armWall.position.set(side * 0.55, 0.44, -0.08);
    armWall.castShadow = castShadow;
    armWall.receiveShadow = true;
    throneGroup.add(armWall);

    const skull = buildSkullArmrest(skullBoneMat, darkSuitMat, castShadow);
    skull.position.set(side * 0.56, 0.83, 0.14);
    skull.rotation.y = side * -0.18;
    throneGroup.add(skull);

    // Bone support column beneath skull
    const boneColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.085, 0.68, 7),
      skullBoneMat,
    );
    boneColumn.position.set(side * 0.56, 0.42, 0.16);
    boneColumn.castShadow = castShadow;
    throneGroup.add(boneColumn);
  }

  // ============================================================================
  // 2. SEATED ARMORED LEGS (Planted firmly on the dais floor)
  // ============================================================================
  for (const side of [-1, 1] as const) {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * 0.21, 0.74, -0.08);
    root.add(legGroup);

    // Thigh extending forward on throne
    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.108, 0.34, 6, 10),
      obsidianChromeMat,
    );
    thigh.rotation.x = Math.PI / 2 - 0.16;
    thigh.rotation.z = -side * 0.16;
    thigh.position.set(side * 0.06, -0.04, 0.22);
    thigh.castShadow = castShadow;
    legGroup.add(thigh);

    // Sculpted Angular Knee Poleyn
    const knee = createBeveledShapeMesh(
      [
        [0, 0.13],
        [0.09, 0.02],
        [0.06, -0.11],
        [0, -0.15],
        [-0.06, -0.11],
        [-0.09, 0.02],
      ],
      0.1,
      0.015,
      darkIronTrimMat,
      castShadow,
    );
    knee.position.set(side * 0.1, -0.09, 0.46);
    knee.rotation.x = -0.35;
    knee.rotation.y = side * 0.14;
    legGroup.add(knee);

    // Greave angling down to dais top (y ~ 0.12)
    const greave = new THREE.Mesh(
      new THREE.CylinderGeometry(0.098, 0.075, 0.54, 8),
      obsidianChromeMat,
    );
    greave.position.set(side * 0.11, -0.36, 0.49);
    greave.rotation.x = 0.12;
    greave.castShadow = castShadow;
    legGroup.add(greave);

    const shinRidge = createBeveledShapeMesh(
      [
        [-0.048, 0.23],
        [0.048, 0.23],
        [0.03, -0.23],
        [0, -0.27],
        [-0.03, -0.23],
      ],
      0.065,
      0.012,
      darkIronTrimMat,
      castShadow,
    );
    shinRidge.position.set(side * 0.11, -0.36, 0.56);
    shinRidge.rotation.x = 0.12;
    legGroup.add(shinRidge);

    // Armored Sabaton planted on dais top
    const sabaton = createBeveledShapeMesh(
      [
        [-0.075, 0.08],
        [0.075, 0.08],
        [0.08, -0.09],
        [0, -0.18],
        [-0.08, -0.09],
      ],
      0.09,
      0.014,
      obsidianChromeMat,
      castShadow,
    );
    sabaton.rotation.x = Math.PI / 2;
    sabaton.rotation.z = -side * 0.14;
    sabaton.position.set(side * 0.11, -0.58, 0.59);
    legGroup.add(sabaton);
  }

  // ============================================================================
  // 3. UPPER BODY — MOLTEN CRIMSON RIBCAGE CUIRASS + SPIKED WING PAULDRONS
  // ============================================================================
  const upperBodyBaseY = 0.78;
  const upperBody = new THREE.Group();
  upperBody.position.set(0, upperBodyBaseY, -0.12);
  root.add(upperBody);

  // Waist belt & crimson core clasp
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.21, 0.11, 8),
    darkIronTrimMat,
  );
  belt.position.set(0, 0.04, 0.02);
  upperBody.add(belt);

  const beltRuby = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), infernoEmberMat);
  beltRuby.position.set(0, 0.04, 0.22);
  upperBody.add(beltRuby);

  // Glowing inner magma torso core + 6 pairs of fiery molten ribs
  const magmaCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.15, 0.44, 10),
    infernoEmberMat,
  );
  magmaCore.position.set(0, 0.36, 0.03);
  upperBody.add(magmaCore);

  for (let i = 0; i < 4; i++) {
    const ribGlow = new THREE.Mesh(
      new THREE.TorusGeometry(0.175 + i * 0.014, 0.017, 6, 16, Math.PI * 0.85),
      infernoEmberMat,
    );
    ribGlow.rotation.x = Math.PI / 2 + 0.15;
    ribGlow.rotation.z = -Math.PI * 0.92;
    ribGlow.position.set(0, 0.2 + i * 0.085, 0.06);
    upperBody.add(ribGlow);

    // Outer dark chrome rib bars framing the glowing embers
    for (const side of [-1, 1] as const) {
      const ribBar = new THREE.Mesh(
        new THREE.BoxGeometry(0.12 + i * 0.016, 0.024, 0.05),
        obsidianChromeMat,
      );
      ribBar.position.set(side * (0.1 + i * 0.012), 0.2 + i * 0.085, 0.175);
      ribBar.rotation.z = side * 0.24;
      ribBar.rotation.y = side * -0.25;
      upperBody.add(ribBar);
    }
  }

  // Heavy Obsidian Upper Chestplate + Jagged Collar Gorget
  const chestPlate = createBeveledShapeMesh(
    [
      [-0.3, 0.2],
      [0.3, 0.2],
      [0.24, 0.02],
      [0.09, -0.1],
      [0, -0.05],
      [-0.09, -0.1],
      [-0.24, 0.02],
    ],
    0.24,
    0.026,
    obsidianChromeMat,
    castShadow,
  );
  chestPlate.position.set(0, 0.61, 0.03);
  upperBody.add(chestPlate);

  const chestMagmaHeart = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.052, 0),
    infernoEmberMat,
  );
  chestMagmaHeart.scale.set(0.85, 1.25, 0.55);
  chestMagmaHeart.position.set(0, 0.44, 0.195);
  upperBody.add(chestMagmaHeart);

  // ============================================================================
  // 4. HORNED VERTICAL-SLATTED HELMET + GLOWING CRIMSON EYES
  // ============================================================================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.92, 0.04);
  upperBody.add(headGroup);

  const helmBase = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 14), obsidianChromeMat);
  helmBase.scale.set(0.92, 1.08, 1.04);
  helmBase.castShadow = castShadow;
  headGroup.add(helmBase);

  const faceplate = createBeveledShapeMesh(
    [
      [-0.09, 0.075],
      [0.09, 0.075],
      [0.068, -0.115],
      [0, -0.15],
      [-0.068, -0.115],
    ],
    0.09,
    0.013,
    obsidianChromeMat,
    castShadow,
  );
  faceplate.position.set(0, -0.02, 0.088);
  headGroup.add(faceplate);

  // Fierce crimson glowing slit eyes
  for (const side of [-1, 1] as const) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.018, 0.026), infernoEmberMat);
    eye.position.set(side * 0.042, 0.022, 0.148);
    eye.rotation.z = side * 0.24;
    headGroup.add(eye);
  }

  // Vertical visor grille bars
  for (let b = -3; b <= 3; b++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.125, 0.022),
      darkIronTrimMat,
    );
    bar.position.set(b * 0.021, -0.05, 0.148);
    headGroup.add(bar);
  }

  // Swept-back Jagged Horned Helmet Crown
  const crownHorns: Array<[number, number, number, number, number, number, number]> = [
    [0, 0.16, 0.02, -0.2, 0, 0, 0.2],
    [-0.085, 0.15, 0.01, -0.12, 0, 0.42, 0.22],
    [0.085, 0.15, 0.01, -0.12, 0, -0.42, 0.22],
    [-0.135, 0.11, -0.03, -0.35, 0, 0.72, 0.24],
    [0.135, 0.11, -0.03, -0.35, 0, -0.72, 0.24],
  ];
  for (const [hx, hy, hz, rx, ry, rz, hLen] of crownHorns) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.028, hLen, 4), darkIronTrimMat);
    horn.position.set(hx, hy, hz);
    horn.rotation.set(rx, ry, rz);
    headGroup.add(horn);
  }

  // ============================================================================
  // 5. RIGHT ARM RESTING ON SKULL ARMREST (With Molten Forearm Cracks)
  // ============================================================================
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(-0.36, 0.67, 0.01);
  upperBody.add(rightArmGroup);

  rightArmGroup.add(
    buildLayeredPauldron(-1, obsidianChromeMat, darkIronTrimMat, infernoEmberMat, castShadow, 4),
  );

  const rUpperArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.075, 0.26, 5, 10),
    darkSuitMat,
  );
  rUpperArm.position.set(-0.14, -0.18, 0.02);
  rUpperArm.rotation.z = -0.38;
  rightArmGroup.add(rUpperArm);

  const rForearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.082, 0.068, 0.3, 8),
    obsidianChromeMat,
  );
  rForearm.position.set(-0.2, -0.4, 0.16);
  rForearm.rotation.set(1.05, 0, -0.15);
  rForearm.castShadow = castShadow;
  rightArmGroup.add(rForearm);

  // Glowing ember cracks on right bracer
  const rBracerEmber = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.15, 0.035), infernoEmberMat);
  rBracerEmber.position.set(-0.22, -0.38, 0.21);
  rBracerEmber.rotation.set(1.05, 0, -0.15);
  rightArmGroup.add(rBracerEmber);

  const rGauntlet = new THREE.Mesh(
    new THREE.SphereGeometry(0.068, 10, 8),
    obsidianChromeMat,
  );
  rGauntlet.position.set(-0.2, -0.49, 0.29);
  rightArmGroup.add(rGauntlet);

  // ============================================================================
  // 6. LEFT ARM HOLDING ENORMOUS CRIMSON RUNED GREATSWORD
  // ============================================================================
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(0.36, 0.67, 0.02);
  upperBody.add(leftArmGroup);

  leftArmGroup.add(
    buildLayeredPauldron(1, obsidianChromeMat, darkIronTrimMat, infernoEmberMat, castShadow, 4),
  );

  const lUpperArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.075, 0.26, 5, 10),
    darkSuitMat,
  );
  lUpperArm.position.set(0.16, -0.14, 0.06);
  lUpperArm.rotation.z = 0.58;
  lUpperArm.rotation.x = -0.28;
  leftArmGroup.add(lUpperArm);

  const lForearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.084, 0.07, 0.28, 8),
    obsidianChromeMat,
  );
  lForearm.position.set(0.28, -0.13, 0.24);
  lForearm.rotation.set(-0.85, 0, 0.45);
  lForearm.castShadow = castShadow;
  leftArmGroup.add(lForearm);

  const lGauntlet = new THREE.Mesh(
    new THREE.SphereGeometry(0.068, 10, 8),
    obsidianChromeMat,
  );
  lGauntlet.position.set(0.31, -0.05, 0.34);
  leftArmGroup.add(lGauntlet);

  // Giant Crimson Magma Runed Greatsword resting tip-down to floor
  const swordGroup = new THREE.Group();
  swordGroup.position.set(0.32, -0.04, 0.36);
  swordGroup.rotation.set(-0.08, -0.14, -0.18);
  leftArmGroup.add(swordGroup);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.42, 8), darkSuitMat);
  grip.position.set(0, 0.08, 0);
  swordGroup.add(grip);

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.062, 0), darkIronTrimMat);
  pommel.scale.set(0.9, 1.4, 0.72);
  pommel.position.set(0, 0.31, 0);
  swordGroup.add(pommel);

  const crossguard = createBeveledShapeMesh(
    [
      [-0.36, 0.14],
      [-0.14, 0.05],
      [0, 0.14],
      [0.14, 0.05],
      [0.36, 0.14],
      [0.2, -0.1],
      [0, -0.18],
      [-0.2, -0.1],
    ],
    0.075,
    0.015,
    obsidianChromeMat,
    castShadow,
  );
  crossguard.position.set(0, -0.16, 0);
  swordGroup.add(crossguard);

  const guardRuby = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), infernoEmberMat);
  guardRuby.scale.set(0.8, 1.35, 0.6);
  guardRuby.position.set(0, -0.18, 0.048);
  swordGroup.add(guardRuby);

  const blade = createBeveledShapeMesh(
    [
      [-0.165, 0.68],
      [0.165, 0.68],
      [0.15, -0.58],
      [0, -0.82],
      [-0.15, -0.58],
    ],
    0.036,
    0.011,
    crimsonSwordMat,
    castShadow,
  );
  blade.position.set(0, -0.94, 0);
  swordGroup.add(blade);

  // Dark Flowing Tattered Mantle draping over Throne
  const capeFronds: THREE.Mesh[] = [];
  const frondAngles = [-0.45, -0.16, 0.16, 0.45];
  for (let i = 0; i < frondAngles.length; i++) {
    const frond = createBeveledShapeMesh(
      [
        [-0.16, 0.55],
        [0.16, 0.55],
        [0.22, -0.45],
        [0, -0.64],
        [-0.22, -0.45],
      ],
      0.012,
      0.004,
      capeMat,
      castShadow,
    );
    frond.position.set(frondAngles[i] * 0.72, 0.1, -0.2 - Math.abs(frondAngles[i]) * 0.08);
    frond.rotation.set(0.18, frondAngles[i] * 0.25, frondAngles[i] * 0.35);
    upperBody.add(frond);
    capeFronds.push(frond);
  }

  const auraLight = new THREE.PointLight(0xff3b10, 3.3, 6.2, 1.5);
  auraLight.position.set(0.08, 1.35, 0.85);
  root.add(auraLight);

  return {
    root,
    upperBody,
    upperBodyBaseY,
    isSeated: true,
    headGroup,
    rightArmGroup,
    leftArmGroup,
    swordGroup,
    capeFronds,
    emissiveMaterials: [infernoEmberMat, crimsonSwordMat, capeMat],
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
