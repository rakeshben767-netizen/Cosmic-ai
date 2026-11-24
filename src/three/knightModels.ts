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

function buildCrimsonSpikedPauldron(
  side: -1 | 1,
  armorMat: THREE.Material,
  trimMat: THREE.Material,
  crimsonGlowMat: THREE.Material,
  castShadow: boolean,
): THREE.Group {
  const group = new THREE.Group();

  // 4 layered draconic shoulder plates sweeping outward and upward
  for (let t = 0; t < 4; t++) {
    const scale = 1 - t * 0.13;
    const plate = createBeveledShapeMesh(
      [
        [-0.14 * scale, 0.09 * scale],
        [0.08 * scale, 0.15 * scale],
        [0.21 * scale, 0.04 * scale],
        [0.14 * scale, -0.08 * scale],
        [-0.12 * scale, -0.05 * scale],
      ],
      0.21 * scale,
      0.014,
      t % 2 === 0 ? armorMat : trimMat,
      castShadow,
    );
    plate.position.set(side * (0.04 + t * 0.055), 0.08 - t * 0.065, 0);
    plate.rotation.z = side * -(0.28 + t * 0.24);
    if (side === -1) {
      plate.scale.x = -1;
    }
    group.add(plate);

    // Thin glowing crimson vein seam nestled under each armor tier
    const vein = new THREE.Mesh(
      new THREE.BoxGeometry(0.16 * scale, 0.012, 0.2 * scale),
      crimsonGlowMat,
    );
    vein.position.set(side * (0.05 + t * 0.055), 0.062 - t * 0.065, 0.01);
    vein.rotation.z = side * -(0.28 + t * 0.24);
    group.add(vein);

    // Swept jagged shoulder blade spikes
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.025 * scale, 0.21 * scale, 4),
      armorMat,
    );
    spike.position.set(side * (0.17 + t * 0.03), 0.13 - t * 0.068, -0.01);
    spike.rotation.z = side * -(1.05 + t * 0.22);
    group.add(spike);
  }

  // Upward shoulder blade horn rising near the collar
  const crestHorn = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.24, 4), armorMat);
  crestHorn.position.set(side * 0.03, 0.18, -0.02);
  crestHorn.rotation.z = side * -0.42;
  group.add(crestHorn);

  return group;
}

function buildCrimsonLegAssembly(
  side: -1 | 1,
  armorMat: THREE.MeshStandardMaterial,
  darkSuitMat: THREE.MeshStandardMaterial,
  trimMat: THREE.MeshStandardMaterial,
  crimsonGlowMat: THREE.MeshStandardMaterial,
  castShadow: boolean,
): THREE.Group {
  const leg = new THREE.Group();
  const hipX = side * 0.185;
  leg.position.set(hipX, 1.12, 0);
  // Heroic wide warrior stance matching the standing Crimson Knight artwork
  leg.rotation.z = side * 0.145;
  leg.rotation.x = side === -1 ? -0.04 : 0.04;

  const thighCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.36, 6, 12), darkSuitMat);
  thighCore.position.set(0, -0.24, 0);
  thighCore.castShadow = castShadow;
  leg.add(thighCore);

  // Sculpted dark obsidian thigh plate
  const thighPlate = createBeveledShapeMesh(
    [
      [-0.115, 0.23],
      [0.115, 0.23],
      [0.095, -0.2],
      [0, -0.27],
      [-0.095, -0.2],
    ],
    0.13,
    0.017,
    armorMat,
    castShadow,
  );
  thighPlate.position.set(0, -0.23, 0.045);
  leg.add(thighPlate);

  // Diagonal crimson vein etched across the thigh armor
  const thighVein = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.015, 0.032), crimsonGlowMat);
  thighVein.position.set(0, -0.19, 0.112);
  thighVein.rotation.z = side * 0.42;
  leg.add(thighVein);

  // Sharp spiked knee poleyn + glowing crimson slit
  const knee = createBeveledShapeMesh(
    [
      [0, 0.145],
      [0.092, 0.02],
      [0.062, -0.11],
      [0, -0.155],
      [-0.062, -0.11],
      [-0.092, 0.02],
    ],
    0.11,
    0.015,
    trimMat,
    castShadow,
  );
  knee.rotation.x = -0.18;
  knee.position.set(0, -0.52, 0.115);
  leg.add(knee);

  const kneeVein = new THREE.Mesh(new THREE.OctahedronGeometry(0.024, 0), crimsonGlowMat);
  kneeVein.scale.set(0.6, 1.8, 0.6);
  kneeVein.position.set(0, -0.52, 0.175);
  leg.add(kneeVein);

  // Razor-ribbed Obsidian Shin Greave + Crimson Seam Vein
  const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.074, 0.5, 8), armorMat);
  greave.position.set(0, -0.82, 0.01);
  greave.castShadow = castShadow;
  leg.add(greave);

  const shinRidge = createBeveledShapeMesh(
    [
      [-0.05, 0.24],
      [0.05, 0.24],
      [0.03, -0.24],
      [0, -0.28],
      [-0.03, -0.24],
    ],
    0.075,
    0.013,
    trimMat,
    castShadow,
  );
  shinRidge.position.set(0, -0.82, 0.075);
  leg.add(shinRidge);

  const shinVein = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.36, 0.028), crimsonGlowMat);
  shinVein.position.set(side * 0.042, -0.81, 0.095);
  shinVein.rotation.z = side * -0.06;
  leg.add(shinVein);

  // Sabaton grounded flush on pedestal at y = 0
  const foot = createBeveledShapeMesh(
    [
      [-0.076, 0.09],
      [0.076, 0.09],
      [0.082, -0.09],
      [0, -0.18],
      [-0.082, -0.09],
    ],
    0.098,
    0.014,
    armorMat,
    castShadow,
  );
  foot.rotation.x = Math.PI / 2;
  foot.rotation.z = -side * 0.14;
  foot.position.set(-side * 0.02, -1.07, 0.11);
  leg.add(foot);

  const toeCap = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.14, 4), trimMat);
  toeCap.rotation.x = Math.PI / 2;
  toeCap.position.set(-side * 0.02, -1.08, 0.26);
  leg.add(toeCap);

  return leg;
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

  const obsidianArmorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x14151c,
      metalness: 0.92,
      roughness: 0.22,
      bumpMap: textures.armorBump,
      bumpScale: 0.018,
      roughnessMap: textures.armorRoughness,
    }),
  );

  const gunmetalTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x2d303d,
      metalness: 0.94,
      roughness: 0.19,
    }),
  );

  const darkSuitMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0b0b10,
      metalness: 0.2,
      roughness: 0.76,
    }),
  );

  const crimsonGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xff1e2d,
      emissive: 0xe11d48,
      emissiveIntensity: 1.55,
      metalness: 0.22,
      roughness: 0.18,
    }),
  );

  const crimsonCapeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x16090c,
      emissive: 0x7f0c18,
      emissiveIntensity: 0.62,
      metalness: 0.16,
      roughness: 0.78,
      side: THREE.DoubleSide,
    }),
  );

  const crimsonSwordMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.crimsonSwordMagma,
      emissive: 0xff1e2d,
      emissiveMap: textures.crimsonSwordMagma,
      emissiveIntensity: 1.45,
      metalness: 0.48,
      roughness: 0.2,
    }),
  );

  const swordSpineMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1a1c24,
      emissive: 0x991b1b,
      emissiveIntensity: 0.35,
      metalness: 0.92,
      roughness: 0.18,
    }),
  );

  // ============================================================================
  // 1. STANDING WARRIOR LEGS WITH CRIMSON VEIN ETCHINGS (Grounded at y = 0)
  // ============================================================================
  root.add(
    buildCrimsonLegAssembly(-1, obsidianArmorMat, darkSuitMat, gunmetalTrimMat, crimsonGlowMat, castShadow),
  );
  root.add(
    buildCrimsonLegAssembly(1, obsidianArmorMat, darkSuitMat, gunmetalTrimMat, crimsonGlowMat, castShadow),
  );

  // ============================================================================
  // 2. UPPER BODY — LEAN OBSIDIAN TORSO + BLAZING CRIMSON CHEST FISSURE
  // ============================================================================
  const upperBodyBaseY = 1.155;
  const upperBody = new THREE.Group();
  upperBody.position.set(0, upperBodyBaseY, 0);
  root.add(upperBody);

  // Belt & Crimson Diamond Buckle
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.205, 0.185, 0.095, 8),
    gunmetalTrimMat,
  );
  belt.position.set(0, 0.04, 0);
  upperBody.add(belt);

  const beltRuby = new THREE.Mesh(new THREE.OctahedronGeometry(0.044, 0), crimsonGlowMat);
  beltRuby.scale.set(0.75, 1.3, 0.55);
  beltRuby.position.set(0, 0.045, 0.2);
  upperBody.add(beltRuby);

  // Center Loincloth Tasset + Flared Crimson-Trimmmed Side Skirts
  const frontLoincloth = createBeveledShapeMesh(
    [
      [-0.085, 0.24],
      [0.085, 0.24],
      [0.06, -0.28],
      [0, -0.38],
      [-0.06, -0.28],
    ],
    0.032,
    0.01,
    darkSuitMat,
    castShadow,
  );
  frontLoincloth.rotation.x = -0.14;
  frontLoincloth.position.set(0, -0.24, 0.185);
  upperBody.add(frontLoincloth);

  for (const side of [-1, 1] as const) {
    const skirtFlap = createBeveledShapeMesh(
      [
        [-0.09, 0.28],
        [0.09, 0.28],
        [0.16, -0.44],
        [-0.12, -0.34],
      ],
      0.025,
      0.008,
      obsidianArmorMat,
      castShadow,
    );
    skirtFlap.rotation.z = side * 0.34;
    skirtFlap.rotation.y = side * 0.28;
    skirtFlap.position.set(side * 0.22, -0.26, 0.05);
    upperBody.add(skirtFlap);

    // Crimson glowing inner slit along hip tasset
    const skirtVein = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.42, 0.02), crimsonGlowMat);
    skirtVein.position.set(side * 0.22, -0.22, 0.13);
    skirtVein.rotation.z = side * 0.32;
    upperBody.add(skirtVein);
  }

  // Segmented Sculpted Abs + Glowing Crimson Side Seams
  const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.17, 0.35, 8), darkSuitMat);
  abdomen.position.set(0, 0.25, 0);
  upperBody.add(abdomen);

  for (let i = 0; i < 4; i++) {
    const abPlate = createBeveledShapeMesh(
      [
        [-0.135 + i * 0.008, 0.026],
        [0.135 - i * 0.008, 0.026],
        [0.115 - i * 0.008, -0.026],
        [-0.115 + i * 0.008, -0.026],
      ],
      0.16,
      0.01,
      obsidianArmorMat,
      castShadow,
    );
    abPlate.position.set(0, 0.16 + i * 0.065, 0.04);
    upperBody.add(abPlate);

    const abVein = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.01, 0.025), crimsonGlowMat);
    abVein.position.set(0, 0.192 + i * 0.065, 0.126);
    upperBody.add(abVein);
  }

  // Sculpted V-Tapered Breastplate + Glowing Vertical Crimson Heart Core
  const chestPlate = createBeveledShapeMesh(
    [
      [-0.295, 0.22],
      [0.295, 0.22],
      [0.255, 0.01],
      [0.185, -0.19],
      [0, -0.25],
      [-0.185, -0.19],
      [-0.255, 0.01],
    ],
    0.24,
    0.026,
    obsidianArmorMat,
    castShadow,
  );
  chestPlate.position.set(0, 0.56, 0.03);
  upperBody.add(chestPlate);

  // Blazing vertical crimson flame/fissure emblem on chest center
  const chestFlameCore = createBeveledShapeMesh(
    [
      [0, 0.13],
      [0.052, 0.02],
      [0.024, -0.03],
      [0.042, -0.12],
      [0, -0.18],
      [-0.042, -0.12],
      [-0.024, -0.03],
      [-0.052, 0.02],
    ],
    0.04,
    0.006,
    crimsonGlowMat,
    false,
  );
  chestFlameCore.position.set(0, 0.57, 0.175);
  upperBody.add(chestFlameCore);

  // Diagonal crimson ribs flanking the chest core
  for (const side of [-1, 1] as const) {
    const chestCrack = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.014, 0.03), crimsonGlowMat);
    chestCrack.position.set(side * 0.13, 0.64, 0.165);
    chestCrack.rotation.z = side * 0.35;
    upperBody.add(chestCrack);
  }

  // High-Spiked Armored Crimson Collar / Gorget
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.145, 0.18, 0.15, 8, 1, true, Math.PI * 0.22, Math.PI * 1.56),
    gunmetalTrimMat,
  );
  collar.rotation.y = Math.PI;
  collar.position.set(0, 0.79, -0.01);
  upperBody.add(collar);

  for (const side of [-1, 1] as const) {
    const collarEdge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.03), crimsonGlowMat);
    collarEdge.position.set(side * 0.145, 0.8, 0.04);
    collarEdge.rotation.z = side * -0.18;
    upperBody.add(collarEdge);
  }

  // ============================================================================
  // 3. TALL HORNED GOTHIC HELMET + SHARP CRIMSON V-VISOR EYES
  // ============================================================================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.96, 0.02);
  upperBody.add(headGroup);

  const helmBase = new THREE.Mesh(new THREE.SphereGeometry(0.132, 16, 14), obsidianArmorMat);
  helmBase.scale.set(0.88, 1.08, 1.02);
  helmBase.castShadow = castShadow;
  headGroup.add(helmBase);

  const faceplate = createBeveledShapeMesh(
    [
      [-0.088, 0.068],
      [0.088, 0.068],
      [0.064, -0.115],
      [0, -0.155],
      [-0.064, -0.115],
    ],
    0.086,
    0.012,
    obsidianArmorMat,
    castShadow,
  );
  faceplate.position.set(0, -0.025, 0.09);
  headGroup.add(faceplate);

  // Fierce sharp crimson V-visor eyes
  for (const side of [-1, 1] as const) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.016, 0.028), crimsonGlowMat);
    eye.position.set(side * 0.036, 0.018, 0.148);
    eye.rotation.z = side * 0.26;
    headGroup.add(eye);
  }

  // Twin Tall Gothic Ear-Horns + Inner Crown Spikes (matching IMG_20261124_194857_497901a7.jpg)
  const hornSpecs: Array<[number, number, number, number, number, number, number, number]> = [
    // Tall outer crown ear-blades
    [-0.072, 0.19, 0.01, -0.08, 0, 0.16, 0.032, 0.29],
    [0.072, 0.19, 0.01, -0.08, 0, -0.16, 0.032, 0.29],
    // Inner crown center blades
    [-0.032, 0.16, 0.03, 0.05, 0, 0.08, 0.022, 0.17],
    [0.032, 0.16, 0.03, 0.05, 0, -0.08, 0.022, 0.17],
    // Back/temple ridges
    [-0.112, 0.11, -0.03, -0.25, 0, 0.35, 0.024, 0.18],
    [0.112, 0.11, -0.03, -0.25, 0, -0.35, 0.024, 0.18],
  ];
  for (const [hx, hy, hz, rx, ry, rz, radius, hLen] of hornSpecs) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(radius, hLen, 4), gunmetalTrimMat);
    horn.position.set(hx, hy, hz);
    horn.rotation.set(rx, ry, rz);
    headGroup.add(horn);
  }

  // ============================================================================
  // 4. RIGHT ARM HOLDING CRIMSON-EDGE OBSIDIAN GREATSWORD (Viewer's Left)
  // ============================================================================
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(-0.34, 0.69, 0.02);
  upperBody.add(rightArmGroup);

  rightArmGroup.add(
    buildCrimsonSpikedPauldron(-1, obsidianArmorMat, gunmetalTrimMat, crimsonGlowMat, castShadow),
  );

  const rUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.24, 5, 10), darkSuitMat);
  rUpperArm.position.set(-0.11, -0.17, 0.02);
  rUpperArm.rotation.z = -0.36;
  rightArmGroup.add(rUpperArm);

  const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.066, 0.29, 8), obsidianArmorMat);
  rForearm.position.set(-0.21, -0.38, 0.12);
  rForearm.rotation.set(-0.42, 0, -0.32);
  rForearm.castShadow = castShadow;
  rightArmGroup.add(rForearm);

  // Spiked crimson-veined right gauntlet bracer
  for (let s = 0; s < 2; s++) {
    const rSpike = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.11, 4), gunmetalTrimMat);
    rSpike.position.set(-0.27 - s * 0.015, -0.32 - s * 0.08, 0.1);
    rSpike.rotation.z = 0.85;
    rightArmGroup.add(rSpike);
  }
  const rBracerVein = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.18, 0.024), crimsonGlowMat);
  rBracerVein.position.set(-0.25, -0.37, 0.16);
  rBracerVein.rotation.set(-0.42, 0, -0.32);
  rightArmGroup.add(rBracerVein);

  const rGauntlet = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), obsidianArmorMat);
  rGauntlet.position.set(-0.24, -0.5, 0.21);
  rightArmGroup.add(rGauntlet);

  // Giant Crimson-Edged Obsidian Greatsword pointing downward-inward like the artwork
  const swordGroup = new THREE.Group();
  swordGroup.position.set(-0.24, -0.5, 0.23);
  swordGroup.rotation.set(0.08, 0.12, 0.18);
  rightArmGroup.add(swordGroup);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.36, 8), darkSuitMat);
  grip.position.set(0, 0.06, 0);
  swordGroup.add(grip);

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.052, 0), gunmetalTrimMat);
  pommel.scale.set(0.85, 1.35, 0.65);
  pommel.position.set(0, 0.26, 0);
  swordGroup.add(pommel);

  const crossguard = createBeveledShapeMesh(
    [
      [-0.28, 0.09],
      [-0.1, 0.04],
      [0, 0.12],
      [0.1, 0.04],
      [0.28, 0.09],
      [0.14, -0.06],
      [0, -0.14],
      [-0.14, -0.06],
    ],
    0.055,
    0.012,
    obsidianArmorMat,
    castShadow,
  );
  crossguard.position.set(0, -0.14, 0);
  swordGroup.add(crossguard);

  const guardRuby = new THREE.Mesh(new THREE.OctahedronGeometry(0.056, 0), crimsonGlowMat);
  guardRuby.scale.set(0.7, 1.4, 0.55);
  guardRuby.position.set(0, -0.16, 0.036);
  swordGroup.add(guardRuby);

  const bladeCore = createBeveledShapeMesh(
    [
      [-0.105, 0.56],
      [0.105, 0.56],
      [0.082, -0.44],
      [0, -0.68],
      [-0.082, -0.44],
    ],
    0.026,
    0.008,
    crimsonSwordMat,
    castShadow,
  );
  bladeCore.position.set(0, -0.76, 0);
  swordGroup.add(bladeCore);

  // Dark obsidian fuller spine down middle of sword
  const bladeSpine = createBeveledShapeMesh(
    [
      [-0.035, 0.52],
      [0.035, 0.52],
      [0.02, -0.4],
      [0, -0.58],
      [-0.02, -0.4],
    ],
    0.032,
    0.005,
    swordSpineMat,
    false,
  );
  bladeSpine.position.set(0, -0.74, 0.002);
  swordGroup.add(bladeSpine);

  // ============================================================================
  // 5. LEFT ARM IN CLENCHED BATTLE STANCE WITH SPIKED GAUNTLET (Viewer's Right)
  // ============================================================================
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(0.34, 0.69, 0.02);
  upperBody.add(leftArmGroup);

  leftArmGroup.add(
    buildCrimsonSpikedPauldron(1, obsidianArmorMat, gunmetalTrimMat, crimsonGlowMat, castShadow),
  );

  const lUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.24, 5, 10), darkSuitMat);
  lUpperArm.position.set(0.11, -0.18, 0);
  lUpperArm.rotation.z = 0.28;
  leftArmGroup.add(lUpperArm);

  const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.066, 0.29, 8), obsidianArmorMat);
  lForearm.position.set(0.18, -0.42, 0.08);
  lForearm.rotation.set(-0.32, 0, 0.16);
  lForearm.castShadow = castShadow;
  leftArmGroup.add(lForearm);

  for (let s = 0; s < 2; s++) {
    const lSpike = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.11, 4), gunmetalTrimMat);
    lSpike.position.set(0.24 + s * 0.015, -0.36 - s * 0.08, 0.06);
    lSpike.rotation.z = -0.85;
    leftArmGroup.add(lSpike);
  }

  const lBracerVein = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.18, 0.024), crimsonGlowMat);
  lBracerVein.position.set(0.21, -0.42, 0.135);
  lBracerVein.rotation.set(-0.32, 0, 0.16);
  leftArmGroup.add(lBracerVein);

  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), obsidianArmorMat);
  lHand.position.set(0.16, -0.57, 0.14);
  leftArmGroup.add(lHand);

  // ============================================================================
  // 6. DRAMATIC TATTERED CRIMSON-UNDERLIT WAR CAPE
  // ============================================================================
  const capeFronds: THREE.Mesh[] = [];
  const frondAngles = [-0.62, -0.38, -0.14, 0.14, 0.38, 0.62];
  for (let i = 0; i < frondAngles.length; i++) {
    const frond = createBeveledShapeMesh(
      [
        [-0.16, 0.68],
        [0.16, 0.68],
        [0.25, -0.68],
        [0.08, -0.92],
        [-0.06, -0.72],
        [-0.23, -0.88],
      ],
      0.012,
      0.004,
      crimsonCapeMat,
      castShadow,
    );
    frond.position.set(frondAngles[i] * 0.96, -0.04, -0.24 - Math.abs(frondAngles[i]) * 0.14);
    frond.rotation.set(0.24, frondAngles[i] * 0.38, frondAngles[i] * 0.52);
    upperBody.add(frond);
    capeFronds.push(frond);
  }

  const auraLight = new THREE.PointLight(0xff1e2d, 3.0, 5.8, 1.5);
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
    emissiveMaterials: [crimsonGlowMat, crimsonSwordMat, crimsonCapeMat],
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
