import * as THREE from 'three';
import type { CosmicMode, CosmicState } from '../types/cosmic.ts';
import {
  createLightningBladeTexture,
  createPedestalRingTexture,
  createPortalVortexTexture,
} from './proceduralTextures.ts';

export interface KnightRig {
  mode: CosmicMode;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  torsoGroup: THREE.Group;
  rightArmGroup: THREE.Group;
  leftArmGroup: THREE.Group;
  swordGroup: THREE.Group;
  capeGroup: THREE.Group;
  portalDisc: THREE.Mesh | null;
  haloGroup: THREE.Group | null;
  emissiveMaterials: THREE.MeshStandardMaterial[];
  baseEmissiveIntensity: number;
}

function buildDiamondPlate(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;
  shape.moveTo(0, hh);
  shape.lineTo(hw, 0);
  shape.lineTo(0, -hh);
  shape.lineTo(-hw, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.25,
    bevelSize: depth * 0.22,
    bevelSegments: 1,
  });
  geo.center();
  return new THREE.Mesh(geo, material);
}

function buildPentagonKneePlate(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;
  shape.moveTo(0, hh);
  shape.lineTo(hw, hh * 0.25);
  shape.lineTo(hw * 0.68, -hh * 0.62);
  shape.lineTo(0, -hh);
  shape.lineTo(-hw * 0.68, -hh * 0.62);
  shape.lineTo(-hw, hh * 0.25);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  geo.center();
  return new THREE.Mesh(geo, material);
}

function buildChevronEmblem(material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-0.24, 0.14);
  shape.lineTo(0, 0.02);
  shape.lineTo(0.24, 0.14);
  shape.lineTo(0, -0.2);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
  });
  geo.center();
  return new THREE.Mesh(geo, material);
}

function buildCapeMesh(colorHex: string, emissiveHex: string): THREE.Group {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.48, 0.0);
  shape.lineTo(0.48, 0.0);
  shape.lineTo(0.98, -1.78);
  shape.lineTo(0.68, -1.58);
  shape.lineTo(0.44, -1.94);
  shape.lineTo(0.15, -1.68);
  shape.lineTo(0.0, -2.02);
  shape.lineTo(-0.18, -1.7);
  shape.lineTo(-0.48, -1.96);
  shape.lineTo(-0.7, -1.62);
  shape.lineTo(-0.98, -1.84);
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: emissiveHex,
    emissiveIntensity: 0.22,
    roughness: 0.7,
    metalness: 0.18,
    side: THREE.DoubleSide,
  });

  const capeMesh = new THREE.Mesh(geo, mat);
  capeMesh.rotation.x = 0.2;
  capeMesh.position.set(0, 0, -0.02);
  group.add(capeMesh);
  return group;
}

function buildPedestal(mode: CosmicMode): {
  group: THREE.Group;
  ringEmissive: THREE.MeshStandardMaterial;
} {
  const isBadmash = mode === 'badmash';
  const primaryHex = isBadmash ? '#a855f7' : '#38bdf8';
  const glowHex = isBadmash ? '#e879f9' : '#7dd3fc';

  const group = new THREE.Group();

  const outerMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? '#2b2438' : '#253142',
    metalness: 0.85,
    roughness: 0.28,
  });
  const baseGeo = new THREE.CylinderGeometry(1.76, 2.08, 0.24, 64);
  const baseMesh = new THREE.Mesh(baseGeo, outerMat);
  baseMesh.position.y = -0.14;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  const ringTex = createPedestalRingTexture(primaryHex, glowHex);
  const topMat = new THREE.MeshStandardMaterial({
    map: ringTex,
    emissiveMap: ringTex,
    emissive: new THREE.Color(primaryHex),
    emissiveIntensity: 0.78,
    metalness: 0.45,
    roughness: 0.4,
  });
  const topGeo = new THREE.CylinderGeometry(1.75, 1.75, 0.04, 64);
  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.position.y = -0.01;
  topMesh.receiveShadow = true;
  group.add(topMesh);

  const rimMat = new THREE.MeshStandardMaterial({
    color: glowHex,
    emissive: primaryHex,
    emissiveIntensity: 1.15,
    metalness: 0.5,
    roughness: 0.25,
  });
  const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(1.76, 0.014, 12, 72), rimMat);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.y = 0.01;
  group.add(rimMesh);

  return { group, ringEmissive: rimMat };
}

function buildSword(
  mode: CosmicMode,
  trimMat: THREE.Material,
  gemMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const isBadmash = mode === 'badmash';
  const sword = new THREE.Group();

  const gripMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? '#1c1824' : '#334155',
    metalness: 0.72,
    roughness: 0.36,
  });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.46, 14), gripMat);
  grip.position.y = 0.22;
  sword.add(grip);

  // Pommel
  if (isBadmash) {
    const pommelWing = buildDiamondPlate(0.28, 0.14, 0.07, trimMat);
    pommelWing.position.y = 0.46;
    sword.add(pommelWing);
    const pommelGem = buildDiamondPlate(0.14, 0.16, 0.08, gemMat);
    pommelGem.position.set(0, 0.47, 0.02);
    sword.add(pommelGem);
  } else {
    const pommel = buildDiamondPlate(0.12, 0.18, 0.08, trimMat);
    pommel.position.y = 0.48;
    sword.add(pommel);
  }

  // Winged Crossguard
  const guardShape = new THREE.Shape();
  guardShape.moveTo(-0.56, 0.16);
  guardShape.lineTo(0, 0.03);
  guardShape.lineTo(0.56, 0.16);
  guardShape.lineTo(0.38, -0.08);
  guardShape.lineTo(0, -0.22);
  guardShape.lineTo(-0.38, -0.08);
  guardShape.closePath();

  const guardGeo = new THREE.ExtrudeGeometry(guardShape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  guardGeo.center();
  const guardMesh = new THREE.Mesh(guardGeo, trimMat);
  guardMesh.position.y = -0.02;
  sword.add(guardMesh);

  const guardGem = buildDiamondPlate(0.13, 0.2, 0.11, gemMat);
  guardGem.position.set(0, -0.02, 0.02);
  sword.add(guardGem);

  // Broadsword Blade with glowing procedural lightning texture
  const bladeTex = createLightningBladeTexture(isBadmash ? 'purple' : 'blue');
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.23, 0);
  bladeShape.lineTo(0.23, 0);
  bladeShape.lineTo(0.26, -1.28);
  bladeShape.lineTo(0, -1.64);
  bladeShape.lineTo(-0.26, -1.28);
  bladeShape.closePath();

  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
  });

  const posAttr = bladeGeo.attributes.position;
  const uvArr = new Float32Array(posAttr.count * 2);
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    uvArr[i * 2] = (x + 0.26) / 0.52;
    uvArr[i * 2 + 1] = 1 - Math.max(0, Math.min(1, -y / 1.64));
  }
  bladeGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

  const bladeMat = new THREE.MeshStandardMaterial({
    map: bladeTex,
    emissiveMap: bladeTex,
    emissive: new THREE.Color(isBadmash ? '#c084fc' : '#38bdf8'),
    emissiveIntensity: isBadmash ? 1.25 : 1.15,
    metalness: 0.3,
    roughness: 0.2,
    transparent: !isBadmash,
    opacity: isBadmash ? 1 : 0.94,
  });

  const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
  bladeMesh.position.set(0, -0.1, -0.025);
  sword.add(bladeMesh);

  return sword;
}

export function buildCosmicKnightRig(mode: CosmicMode): KnightRig {
  const isBadmash = mode === 'badmash';
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const emissiveMaterials: THREE.MeshStandardMaterial[] = [];

  const pedestal = buildPedestal(mode);
  root.add(pedestal.group);
  emissiveMaterials.push(pedestal.ringEmissive);

  const armorDarkMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? '#090710' : '#091122',
    metalness: 0.88,
    roughness: 0.24,
  });

  const armorSlateMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? '#2b233b' : '#2d3b52',
    metalness: 0.78,
    roughness: 0.32,
  });

  const armorTrimMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? '#4b3d63' : '#4a5d7c',
    metalness: 0.85,
    roughness: 0.26,
  });

  const shinAccentMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? '#e2d9f3' : '#dbeafe',
    metalness: 0.55,
    roughness: 0.25,
  });

  const coreGlowMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? '#f3e8ff' : '#e0f2fe',
    emissive: isBadmash ? '#c084fc' : '#38bdf8',
    emissiveIntensity: 1.45,
    metalness: 0.15,
    roughness: 0.15,
  });
  emissiveMaterials.push(coreGlowMat);

  const orbGlowMat = new THREE.MeshStandardMaterial({
    color: isBadmash ? '#ede9fe' : '#cffafe',
    emissive: isBadmash ? '#a855f7' : '#22d3ee',
    emissiveIntensity: 1.3,
    metalness: 0.2,
    roughness: 0.2,
  });
  emissiveMaterials.push(orbGlowMat);

  // =====================================
  // LEGS & BOOTS
  // =====================================
  const buildLeg = (side: -1 | 1) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.32, 0.02, 0);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.34), armorDarkMat);
    boot.position.set(0, 0.08, 0.05);
    boot.castShadow = true;
    leg.add(boot);

    const toeGem = buildDiamondPlate(0.08, 0.09, 0.04, armorTrimMat);
    toeGem.position.set(0, 0.08, 0.22);
    leg.add(toeGem);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.095, 0.68, 8), armorDarkMat);
    shin.position.set(0, 0.48, 0);
    shin.castShadow = true;
    leg.add(shin);

    const shinBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.58, 0.12),
      armorTrimMat,
    );
    shinBar.position.set(side * 0.095, 0.48, 0.02);
    leg.add(shinBar);

    for (let s = 0; s < 2; s++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 5), armorTrimMat);
      spike.rotation.z = -side * (1.15 - s * 0.2);
      spike.position.set(side * 0.13, 0.22 + s * 0.07, 0);
      leg.add(spike);
    }

    const knee = buildPentagonKneePlate(0.24, 0.32, 0.07, shinAccentMat);
    knee.position.set(0, 0.85, 0.11);
    knee.castShadow = true;
    leg.add(knee);

    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.12, 0.56, 8), armorDarkMat);
    thigh.position.set(0, 1.15, 0);
    thigh.castShadow = true;
    leg.add(thigh);

    return leg;
  };

  bodyGroup.add(buildLeg(-1));
  bodyGroup.add(buildLeg(1));

  // =====================================
  // PELVIS, HIP TASSETS & FRONT TABARD
  // =====================================
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.22, 0.42), armorDarkMat);
  pelvis.position.set(0, 1.4, 0);
  bodyGroup.add(pelvis);

  for (const side of [-1, 1] as const) {
    const hipArmor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.44, 0.38), armorDarkMat);
    hipArmor.position.set(side * 0.34, 1.24, 0.02);
    hipArmor.rotation.z = side * 0.12;
    bodyGroup.add(hipArmor);
  }

  const tabardShape = new THREE.Shape();
  tabardShape.moveTo(-0.13, 0.34);
  tabardShape.lineTo(0, 0.27);
  tabardShape.lineTo(0.13, 0.34);
  tabardShape.lineTo(0.12, -0.43);
  tabardShape.lineTo(0, -0.64);
  tabardShape.lineTo(-0.12, -0.43);
  tabardShape.closePath();

  const tabardGeo = new THREE.ExtrudeGeometry(tabardShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
  });
  tabardGeo.center();

  if (isBadmash) {
    const tabardOuter = new THREE.Mesh(tabardGeo, shinAccentMat);
    tabardOuter.position.set(0, 1.07, 0.22);
    bodyGroup.add(tabardOuter);

    const innerStrip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.72, 0.06), armorSlateMat);
    innerStrip.position.set(0, 1.06, 0.235);
    bodyGroup.add(innerStrip);

    const beltDiamond = buildDiamondPlate(0.13, 0.17, 0.07, coreGlowMat);
    beltDiamond.position.set(0, 1.4, 0.26);
    bodyGroup.add(beltDiamond);
  } else {
    const tabardMesh = new THREE.Mesh(tabardGeo, shinAccentMat);
    tabardMesh.position.set(0, 1.08, 0.23);
    bodyGroup.add(tabardMesh);
  }

  // =====================================
  // TORSO, CHESTPLATE & CAPE
  // =====================================
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.5, 0);
  bodyGroup.add(torsoGroup);

  const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.56, 12), armorSlateMat);
  abdomen.position.y = 0.25;
  torsoGroup.add(abdomen);

  const chestShape = new THREE.Shape();
  chestShape.moveTo(-0.56, 0.36);
  chestShape.lineTo(0.56, 0.36);
  chestShape.lineTo(0.46, -0.2);
  chestShape.lineTo(0.24, -0.3);
  chestShape.lineTo(0.16, -0.22);
  chestShape.lineTo(-0.16, -0.22);
  chestShape.lineTo(-0.24, -0.3);
  chestShape.lineTo(-0.46, -0.2);
  chestShape.closePath();

  const chestGeo = new THREE.ExtrudeGeometry(chestShape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  chestGeo.center();
  const chestMesh = new THREE.Mesh(chestGeo, armorDarkMat);
  chestMesh.position.set(0, 0.66, 0.04);
  chestMesh.castShadow = true;
  torsoGroup.add(chestMesh);

  if (isBadmash) {
    const chestDiamond = buildDiamondPlate(0.24, 0.34, 0.06, coreGlowMat);
    chestDiamond.position.set(0, 0.67, 0.29);
    torsoGroup.add(chestDiamond);
  } else {
    const chestChevron = buildChevronEmblem(coreGlowMat);
    chestChevron.position.set(0, 0.68, 0.29);
    torsoGroup.add(chestChevron);
  }

  const capeGroup = buildCapeMesh(
    isBadmash ? '#5b32a3' : '#2d3b52',
    isBadmash ? '#4c1d95' : '#0f172a',
  );
  capeGroup.position.set(0, 0.92, -0.22);
  torsoGroup.add(capeGroup);

  // =====================================
  // SHOULDERS & ARMS
  // =====================================
  const buildShoulderPauldron = (side: -1 | 1): THREE.Group => {
    const pauldron = new THREE.Group();

    const mainCap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.48), armorDarkMat);
    mainCap.rotation.z = -side * 0.22;
    mainCap.castShadow = true;
    pauldron.add(mainCap);

    for (let i = 0; i < 3; i++) {
      const layer = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.42), armorTrimMat);
      layer.position.set(side * (0.08 + i * 0.04), -0.18 - i * 0.08, 0);
      layer.rotation.z = -side * (0.35 + i * 0.12);
      pauldron.add(layer);
    }

    for (let s = 0; s < 3; s++) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.032, 0.16, 5),
        armorTrimMat,
      );
      spike.rotation.z = -side * (1.25 - s * 0.22);
      spike.position.set(side * (0.25 + s * 0.02), 0.1 - s * 0.1, 0.02);
      pauldron.add(spike);
    }

    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.088, 16, 16), orbGlowMat);
    orb.position.set(side * 0.05, -0.02, 0.23);
    pauldron.add(orb);

    return pauldron;
  };

  // Right arm (viewer left: -x) holding sword
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(-0.68, 0.84, 0.02);
  torsoGroup.add(rightArmGroup);
  rightArmGroup.add(buildShoulderPauldron(-1));

  const rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.095, 0.44, 10), armorSlateMat);
  rightUpperArm.position.set(-0.08, -0.3, 0.02);
  rightUpperArm.rotation.z = -0.25;
  rightArmGroup.add(rightUpperArm);

  const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.46, 10), armorDarkMat);
  rightForearm.position.set(-0.18, -0.58, 0.16);
  rightForearm.rotation.set(0.45, 0, 0.55);
  rightArmGroup.add(rightForearm);

  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 14), armorDarkMat);
  rightHand.position.set(-0.34, -0.7, 0.28);
  rightArmGroup.add(rightHand);

  const swordGroup = buildSword(mode, armorTrimMat, coreGlowMat);
  swordGroup.position.set(-0.36, -0.68, 0.34);
  swordGroup.rotation.set(0.04, 0.12, -0.02);
  rightArmGroup.add(swordGroup);

  // Left arm (viewer right: +x)
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(0.68, 0.84, 0.02);
  torsoGroup.add(leftArmGroup);
  leftArmGroup.add(buildShoulderPauldron(1));

  const leftUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.095, 0.46, 10), armorSlateMat);
  leftUpperArm.position.set(0.09, -0.32, 0);
  leftUpperArm.rotation.z = 0.18;
  leftArmGroup.add(leftUpperArm);

  const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.095, 0.48, 10), armorDarkMat);
  leftForearm.position.set(0.16, -0.68, 0.08);
  leftForearm.rotation.set(0.28, 0, -0.06);
  leftArmGroup.add(leftForearm);

  if (isBadmash) {
    const forearmDiamond = buildDiamondPlate(0.12, 0.14, 0.05, orbGlowMat);
    forearmDiamond.position.set(0.18, -0.75, 0.19);
    leftArmGroup.add(forearmDiamond);
  } else {
    const forearmOrb = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 14), orbGlowMat);
    forearmOrb.position.set(0.18, -0.76, 0.18);
    leftArmGroup.add(forearmOrb);
  }

  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 14), armorDarkMat);
  leftHand.position.set(0.17, -0.95, 0.14);
  leftArmGroup.add(leftHand);

  // =====================================
  // HEAD, VISOR / EYES & CREST CROWN
  // =====================================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.06, 0.03);
  torsoGroup.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 10), armorSlateMat);
  neck.position.y = 0.04;
  headGroup.add(neck);

  const helmSkull = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.34, 8), armorDarkMat);
  helmSkull.position.y = 0.24;
  helmSkull.castShadow = true;
  headGroup.add(helmSkull);

  const faceplateShape = new THREE.Shape();
  faceplateShape.moveTo(-0.15, 0.15);
  faceplateShape.lineTo(0.15, 0.15);
  faceplateShape.lineTo(0.12, -0.11);
  faceplateShape.lineTo(0, -0.19);
  faceplateShape.lineTo(-0.12, -0.11);
  faceplateShape.closePath();

  const faceplateGeo = new THREE.ExtrudeGeometry(faceplateShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
  });
  faceplateGeo.center();
  const faceplate = new THREE.Mesh(faceplateGeo, armorDarkMat);
  faceplate.position.set(0, 0.24, 0.15);
  headGroup.add(faceplate);

  if (isBadmash) {
    for (const side of [-1, 1] as const) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.026, 0.04), coreGlowMat);
      eye.position.set(side * 0.062, 0.28, 0.19);
      eye.rotation.z = side * 0.14;
      headGroup.add(eye);
    }
    const helmCrest = buildDiamondPlate(0.11, 0.13, 0.06, shinAccentMat);
    helmCrest.position.set(0, 0.44, 0.16);
    headGroup.add(helmCrest);

    for (const side of [-1, 1] as const) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.22), armorSlateMat);
      wing.position.set(side * 0.16, 0.39, 0.02);
      wing.rotation.z = -side * 0.22;
      headGroup.add(wing);
    }
  } else {
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.032, 0.04), coreGlowMat);
    visor.position.set(0, 0.28, 0.19);
    headGroup.add(visor);

    const foreheadMark = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.04), shinAccentMat);
    foreheadMark.position.set(0, 0.38, 0.17);
    headGroup.add(foreheadMark);

    for (let r = 0; r < 3; r++) {
      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.34 - r * 0.05, 0.075, 0.26 - r * 0.04),
        armorSlateMat,
      );
      ridge.position.set(0, 0.42 + r * 0.045, -0.02 - r * 0.03);
      ridge.rotation.x = -0.25;
      headGroup.add(ridge);
    }
  }

  // =====================================
  // PURPLE KNIGHT LARGE HALO RING & PORTAL
  // =====================================
  let portalDisc: THREE.Mesh | null = null;
  let haloGroup: THREE.Group | null = null;

  if (isBadmash) {
    haloGroup = new THREE.Group();
    haloGroup.position.set(0, 2.02, -0.36);
    bodyGroup.add(haloGroup);

    const haloRingMat = new THREE.MeshStandardMaterial({
      color: '#413556',
      metalness: 0.86,
      roughness: 0.25,
    });
    const haloInnerGlowMat = new THREE.MeshStandardMaterial({
      color: '#e9d5ff',
      emissive: '#a855f7',
      emissiveIntensity: 1.35,
      metalness: 0.3,
      roughness: 0.2,
    });
    emissiveMaterials.push(haloInnerGlowMat);

    const outerTorus = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.048, 16, 72), haloRingMat);
    haloGroup.add(outerTorus);

    const innerTorus = new THREE.Mesh(new THREE.TorusGeometry(1.44, 0.022, 12, 72), haloInnerGlowMat);
    haloGroup.add(innerTorus);

    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI * 2) / 8 + Math.PI / 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6), haloRingMat);
      spike.position.set(Math.cos(ang) * 1.62, Math.sin(ang) * 1.62, 0);
      spike.rotation.z = ang - Math.PI / 2;
      haloGroup.add(spike);
    }

    const portalTex = createPortalVortexTexture();
    const portalMat = new THREE.MeshBasicMaterial({
      map: portalTex,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    portalDisc = new THREE.Mesh(new THREE.CircleGeometry(1.42, 64), portalMat);
    portalDisc.position.z = -0.02;
    haloGroup.add(portalDisc);
  }

  return {
    mode,
    root,
    bodyGroup,
    headGroup,
    torsoGroup,
    rightArmGroup,
    leftArmGroup,
    swordGroup,
    capeGroup,
    portalDisc,
    haloGroup,
    emissiveMaterials,
    baseEmissiveIntensity: isBadmash ? 1.3 : 1.18,
  };
}

export function animateKnightRig(
  rig: KnightRig,
  params: {
    elapsed: number;
    state: CosmicState;
    audioLevel: number;
  },
): void {
  const { elapsed, state, audioLevel } = params;
  const isSpeaking = state === 'SPEAKING';
  const isListening = state === 'LISTENING';
  const isConnecting = state === 'CONNECTING' || state === 'RECONNECTING';
  const isError = state === 'ERROR';

  const breath = Math.sin(elapsed * (isSpeaking ? 3.2 : 1.8));
  rig.torsoGroup.position.y = 1.5 + breath * (isSpeaking ? 0.022 : 0.01);
  rig.headGroup.rotation.y = Math.sin(elapsed * 0.7) * (isListening ? 0.07 : 0.035);
  rig.headGroup.rotation.x = isListening
    ? -0.04 + Math.sin(elapsed * 2.1) * 0.025
    : isSpeaking
      ? Math.sin(elapsed * 5.2) * (0.03 + audioLevel * 0.06)
      : Math.sin(elapsed * 1.1) * 0.015;

  const speakLift = isSpeaking ? 0.03 + audioLevel * 0.14 : 0;
  rig.rightArmGroup.rotation.x = -speakLift * 0.55 + Math.sin(elapsed * 1.6) * 0.02;
  rig.leftArmGroup.rotation.x =
    (isSpeaking ? -0.08 - audioLevel * 0.18 : 0) + Math.cos(elapsed * 1.4) * 0.025;
  rig.leftArmGroup.rotation.z = isSpeaking ? 0.06 + audioLevel * 0.08 : 0;

  rig.capeGroup.rotation.x = 0.04 + Math.sin(elapsed * 2.1) * (isSpeaking ? 0.05 : 0.025);

  if (rig.portalDisc) {
    rig.portalDisc.rotation.z = elapsed * (isSpeaking ? 0.55 : 0.22);
  }
  if (rig.haloGroup) {
    rig.haloGroup.position.y = 2.02 + breath * 0.02;
  }

  let intensity = rig.baseEmissiveIntensity;
  if (isSpeaking) {
    intensity = rig.baseEmissiveIntensity + 0.5 + audioLevel * 1.9;
  } else if (isListening) {
    intensity = rig.baseEmissiveIntensity + 0.25 + Math.sin(elapsed * 4.5) * 0.2;
  } else if (isConnecting) {
    intensity = rig.baseEmissiveIntensity * (0.65 + 0.5 * Math.abs(Math.sin(elapsed * 3.8)));
  } else if (isError) {
    intensity = 0.45 + 0.35 * Math.abs(Math.sin(elapsed * 7));
  }

  for (const mat of rig.emissiveMaterials) {
    mat.emissiveIntensity = intensity;
  }
}

export function disposeObjectTree(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      geometries.add(mesh.geometry);
    }
    const matOrArr = mesh.material;
    if (Array.isArray(matOrArr)) {
      matOrArr.forEach((m) => materials.add(m));
    } else if (matOrArr) {
      materials.add(matOrArr);
    }
  });

  materials.forEach((mat) => {
    const m = mat as THREE.MeshStandardMaterial;
    if (m.map) textures.add(m.map);
    if (m.emissiveMap) textures.add(m.emissiveMap);
    mat.dispose();
  });

  textures.forEach((tex) => tex.dispose());
  geometries.forEach((geo) => geo.dispose());
}
