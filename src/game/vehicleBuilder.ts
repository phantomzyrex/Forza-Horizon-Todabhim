import * as THREE from 'three';
import { CHASSIS_SPECS, VehicleConfig } from './vehicleConfig';

export interface BuiltVehicleRig {
  root: THREE.Group;
  bodyTiltGroup: THREE.Group;
  steeringWheelGroup: THREE.Group;
  wheelSuspensionGroups: [THREE.Group, THREE.Group, THREE.Group, THREE.Group]; // FL, FR, RL, RR vertical travel
  wheelSteerGroups: [THREE.Group, THREE.Group]; // Front Left, Front Right Ackermann steer
  wheelSpinGroups: [THREE.Group, THREE.Group, THREE.Group, THREE.Group]; // FL, FR, RL, RR spin
  headlightMat: THREE.MeshStandardMaterial;
  drlMat: THREE.MeshStandardMaterial;
  headlightBeamGroup: THREE.Group;
  headlightSpotLight: THREE.SpotLight;
  taillightMat: THREE.MeshStandardMaterial;
  nitroFlameGroup: THREE.Group;
  exhaustPopGroup: THREE.Group;
  underglowMesh: THREE.Mesh;
}

let cachedContactShadowTex: THREE.CanvasTexture | null = null;
function getContactShadowTexture(): THREE.CanvasTexture {
  if (cachedContactShadowTex) return cachedContactShadowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 128, 12, 64, 128, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.84)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  cachedContactShadowTex = new THREE.CanvasTexture(canvas);
  return cachedContactShadowTex;
}

let cachedHeadlightPoolTex: THREE.CanvasTexture | null = null;
export function getHeadlightPoolTexture(): THREE.CanvasTexture {
  if (cachedHeadlightPoolTex) return cachedHeadlightPoolTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 90, 8, 128, 240, 230);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
  grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.12)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);
  cachedHeadlightPoolTex = new THREE.CanvasTexture(canvas);
  return cachedHeadlightPoolTex;
}

let cachedCarbonTex: THREE.CanvasTexture | null = null;
let cachedCarbonBumpTex: THREE.CanvasTexture | null = null;
export function getCarbonTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  if (cachedCarbonTex && cachedCarbonBumpTex) {
    return { map: cachedCarbonTex, bumpMap: cachedCarbonBumpTex };
  }
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const bCtx = bCanvas.getContext('2d')!;

  ctx.fillStyle = '#111621';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#404040';
  bCtx.fillRect(0, 0, size, size);

  // Authentic 2x2 diagonal twill carbon fiber weave
  const step = 8;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const diag = ((x + y) / step) % 4;
      ctx.fillStyle =
        diag === 0
          ? '#2c384a'
          : diag === 1
          ? '#202938'
          : diag === 2
          ? '#161c28'
          : '#242f40';
      ctx.fillRect(x, y, step - 1, step - 1);

      bCtx.fillStyle = diag < 2 ? '#d0d0d0' : '#656565';
      bCtx.fillRect(x, y, step - 1, step - 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);

  const bump = new THREE.CanvasTexture(bCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(10, 10);

  cachedCarbonTex = tex;
  cachedCarbonBumpTex = bump;
  return { map: tex, bumpMap: bump };
}

let cachedMetallicFlakeBump: THREE.CanvasTexture | null = null;
export function getCarPaintFlakeBump(): THREE.CanvasTexture {
  if (cachedMetallicFlakeBump) return cachedMetallicFlakeBump;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  // Subtle metallic micro-flake + panel shutline relief
  for (let i = 0; i < 4500; i++) {
    const x = (Math.sin(i * 19.31) * 0.5 + 0.5) * size;
    const y = (Math.cos(i * 83.17) * 0.5 + 0.5) * size;
    ctx.fillStyle = i % 2 === 0 ? '#9c9c9c' : '#666666';
    ctx.fillRect(x, y, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  cachedMetallicFlakeBump = tex;
  return tex;
}

let cachedBodyPanelTex: THREE.CanvasTexture | null = null;
export function getAutomotiveBodyPanelTexture(): THREE.CanvasTexture {
  if (cachedBodyPanelTex) return cachedBodyPanelTex;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Multi-stop metallic clearcoat contour gradient (multiplies cleanly with any paint color)
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#e2e8f0');
  grad.addColorStop(0.25, '#ffffff');
  grad.addColorStop(0.5, '#cbd5e1');
  grad.addColorStop(0.78, '#ffffff');
  grad.addColorStop(1, '#bfc9d6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Fine metallic clearcoat micro-shimmer lines
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let y = 0; y < size; y += 8) {
    ctx.fillRect(0, y, size, 2);
  }

  // Crisp automotive panel shutlines (door seams, hood/trunk seams, aero creases)
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.42)';
  ctx.lineWidth = 2.5;
  for (const seam of [96, 224, 352, 448]) {
    ctx.beginPath();
    ctx.moveTo(seam, 0);
    ctx.lineTo(seam, size);
    ctx.stroke();

    // Adjacent specular edge highlight along each panel seam
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(seam + 3, 0);
    ctx.lineTo(seam + 3, size);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.lineWidth = 2.5;
  }

  // Horizontal character beltline creases
  for (const hSeam of [140, 310, 420]) {
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.32)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hSeam);
    ctx.lineTo(size, hSeam);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  cachedBodyPanelTex = tex;
  return tex;
}

let cachedTireTreadTex: THREE.CanvasTexture | null = null;
let cachedTireBumpTex: THREE.CanvasTexture | null = null;
export function getTireTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  if (cachedTireTreadTex && cachedTireBumpTex) {
    return { map: cachedTireTreadTex, bumpMap: cachedTireBumpTex };
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = 256;
  bCanvas.height = 256;
  const bCtx = bCanvas.getContext('2d')!;

  ctx.fillStyle = '#141821';
  ctx.fillRect(0, 0, 256, 256);
  bCtx.fillStyle = '#909090';
  bCtx.fillRect(0, 0, 256, 256);

  // Circumferential rain grooves
  ctx.fillStyle = '#090c10';
  bCtx.fillStyle = '#202020';
  for (const gx of [68, 112, 144, 188]) {
    ctx.fillRect(gx - 4, 0, 8, 256);
    bCtx.fillRect(gx - 4, 0, 8, 256);
  }

  // Directional V-sipes across the tire contact patch
  ctx.strokeStyle = '#0b0e14';
  ctx.lineWidth = 4;
  bCtx.strokeStyle = '#282828';
  bCtx.lineWidth = 4;
  for (let y = -16; y < 272; y += 20) {
    ctx.beginPath();
    ctx.moveTo(16, y + 12);
    ctx.lineTo(128, y);
    ctx.lineTo(240, y + 12);
    ctx.stroke();

    bCtx.beginPath();
    bCtx.moveTo(16, y + 12);
    bCtx.lineTo(128, y);
    bCtx.lineTo(240, y + 12);
    bCtx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 4);

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(1, 4);

  cachedTireTreadTex = map;
  cachedTireBumpTex = bumpMap;
  return { map, bumpMap };
}

let cachedBrakeRotorTex: THREE.CanvasTexture | null = null;
export function getBrakeRotorTexture(): THREE.CanvasTexture {
  if (cachedBrakeRotorTex) return cachedBrakeRotorTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  // Radial brushed steel/carbon-ceramic disc face
  const grad = ctx.createRadialGradient(cx, cy, 32, cx, cy, 120);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.28, '#334155');
  grad.addColorStop(0.32, '#94a3b8');
  grad.addColorStop(0.65, '#cbd5e1');
  grad.addColorStop(0.94, '#94a3b8');
  grad.addColorStop(1.0, '#1e293b');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 122, 0, Math.PI * 2);
  ctx.fill();

  // Concentric machining grooves
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
  ctx.lineWidth = 1.5;
  for (let r = 46; r <= 114; r += 8) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Cross-drilled ventilation holes & cooling slots in spiral pattern
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2.5;
  for (let arm = 0; arm < 12; arm++) {
    const baseAngle = (arm / 12) * Math.PI * 2;
    // Cooling slot
    ctx.beginPath();
    ctx.moveTo(
      cx + Math.cos(baseAngle) * 50,
      cy + Math.sin(baseAngle) * 50
    );
    ctx.lineTo(
      cx + Math.cos(baseAngle + 0.18) * 110,
      cy + Math.sin(baseAngle + 0.18) * 110
    );
    ctx.stroke();

    // Drilled holes between slots
    for (let h = 0; h < 3; h++) {
      const r = 58 + h * 22;
      const a = baseAngle + 0.26 + h * 0.07;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedBrakeRotorTex = tex;
  return tex;
}

let cachedGrilleTex: THREE.CanvasTexture | null = null;
export function getRadiatorGrilleTexture(): THREE.CanvasTexture {
  if (cachedGrilleTex) return cachedGrilleTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#070a10';
  ctx.fillRect(0, 0, size, size);

  // Honeycomb hexagonal radiator mesh
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  const hexR = 8;
  for (let y = 0; y < size + hexR; y += hexR * 1.5) {
    for (let x = 0; x < size + hexR; x += hexR * 1.732) {
      const ox = Math.round(y / (hexR * 1.5)) % 2 === 0 ? 0 : hexR * 0.866;
      ctx.beginPath();
      for (let s = 0; s < 6; s++) {
        const ang = (s * Math.PI) / 3;
        const px = x + ox + Math.cos(ang) * (hexR - 1);
        const py = y + Math.sin(ang) * (hexR - 1);
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  cachedGrilleTex = tex;
  return tex;
}

/**
 * Builds an ultra-realistic composite 18+ part procedural 3D vehicle (`THREE.Group`) with:
 * - Multi-stage beveled `ExtrudeGeometry` body hull, widebody fenders, hood power-dome, and side air intakes
 * - PBR automotive clearcoat paint with metallic flake normal/bump map and 2x2 twill carbon fiber weave
 * - Optical glass greenhouse with A/B/C pillars and detailed interior cockpit (bucket seats, dash, digital cluster, rotating steering wheel)
 * - Wing mirrors on twin stalks with LED turn repeaters
 * - Front honeycomb radiator grille, twin-turbo aluminum intercooler, multi-element LED projector headlights & DRL tubes
 * - Rear aero diffuser, full-width 3D taillight blade, titanium exhausts with nitrous & shift backfire flames
 * - 4 independent suspension coilover assemblies, Ackermann steering knuckles, cross-drilled ceramic brake rotors, painted calipers, and forged multi-piece rims wrapped in treaded performance tires
 */
export function buildProceduralVehicle(
  config: VehicleConfig,
  isSoftwareGl: boolean
): BuiltVehicleRig {
  const spec = CHASSIS_SPECS[config.chassis];
  const { length, width, cabinHeight, wheelRadius, wheelWidth, wheelbase } =
    spec.dimensions;

  const root = new THREE.Group();
  const bodyTiltGroup = new THREE.Group();
  root.add(bodyTiltGroup);

  // Soft radial contact shadow flush with ground (y = 0.015)
  const shadowGeo = new THREE.PlaneGeometry(width * 1.4, length * 1.25);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.015;
  root.add(shadowMesh);

  // Underglow Neon Plane
  const underglowColors: Record<string, number> = {
    none: 0x000000,
    amber: 0xf59e0b,
    cyan: 0x06b6d4,
    crimson: 0xef4444,
    emerald: 0x10b981,
  };
  const underglowGeo = new THREE.PlaneGeometry(width * 1.06, length * 0.9);
  underglowGeo.rotateX(-Math.PI / 2);
  const underglowMat = new THREE.MeshBasicMaterial({
    color: underglowColors[config.underglow] || 0x000000,
    transparent: true,
    opacity: config.underglow === 'none' ? 0 : 0.44,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const underglowMesh = new THREE.Mesh(underglowGeo, underglowMat);
  underglowMesh.position.y = 0.025;
  root.add(underglowMesh);

  // Automotive PBR Materials
  const carbonTextures = getCarbonTextures();
  const flakeBump = getCarPaintFlakeBump();
  const isCarbon = config.paintFinish === 'carbon';

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: isCarbon ? 0xffffff : new THREE.Color(config.paintColor),
    map: isCarbon ? carbonTextures.map : getAutomotiveBodyPanelTexture(),
    bumpMap: isCarbon ? carbonTextures.bumpMap : flakeBump,
    bumpScale: isCarbon ? 0.008 : 0.0025,
    metalness:
      config.paintFinish === 'metallic'
        ? 0.84
        : config.paintFinish === 'pearlescent'
        ? 0.72
        : config.paintFinish === 'carbon'
        ? 0.38
        : 0.18,
    roughness:
      config.paintFinish === 'matte'
        ? 0.56
        : config.paintFinish === 'carbon'
        ? 0.28
        : 0.14,
    clearcoat: config.paintFinish === 'matte' ? 0.08 : 1.0,
    clearcoatRoughness: 0.05,
    iridescence: config.paintFinish === 'pearlescent' ? 0.75 : 0.0,
    iridescenceIOR: 1.4,
    reflectivity: 0.95,
  });

  const secondaryTrimMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(config.secondaryColor),
    metalness: 0.55,
    roughness: 0.35,
    clearcoat: 0.65,
  });

  const darkCarbonMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: carbonTextures.map,
    bumpMap: carbonTextures.bumpMap,
    bumpScale: 0.006,
    roughness: 0.3,
    metalness: 0.38,
    clearcoat: 0.85,
  });

  const grilleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: getRadiatorGrilleTexture(),
    roughness: 0.5,
    metalness: 0.6,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.95,
    roughness: 0.12,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1322,
    metalness: 0.15,
    roughness: 0.06,
    transmission: isSoftwareGl ? 0 : 0.62,
    transparent: true,
    opacity: isSoftwareGl ? 0.78 : 1.0,
    clearcoat: 1.0,
  });

  const rideOffset =
    spec.dimensions.groundClearance + config.rideHeight + wheelRadius * 0.55;
  const halfL = length * 0.5;

  // 1. Primary Silhouette: Multi-Contour Sculpted Central Monocoque Hull
  const hullShape = new THREE.Shape();
  if (config.chassis === 'valkyrie_v10') {
    // Low mid-engine hypercar aerodynamic wedge profile
    hullShape.moveTo(-halfL, 0.05);
    hullShape.lineTo(halfL, 0.02);
    hullShape.lineTo(halfL * 0.96, 0.24);
    hullShape.lineTo(halfL * 0.62, 0.44);
    hullShape.lineTo(halfL * 0.28, 0.53);
    hullShape.lineTo(-halfL * 0.45, 0.6);
    hullShape.lineTo(-halfL * 0.88, 0.54);
    hullShape.lineTo(-halfL * 0.98, 0.42);
    hullShape.closePath();
  } else if (config.chassis === 'titan_nomad') {
    // Muscular armored 4x4 performance SUV silhouette
    hullShape.moveTo(-halfL * 0.96, 0.12);
    hullShape.lineTo(halfL * 0.96, 0.12);
    hullShape.lineTo(halfL, 0.34);
    hullShape.lineTo(halfL * 0.92, 0.68);
    hullShape.lineTo(halfL * 0.38, 0.75);
    hullShape.lineTo(-halfL * 0.92, 0.77);
    hullShape.lineTo(-halfL, 0.46);
    hullShape.closePath();
  } else if (config.chassis === 'raijin_drift') {
    // Aggressive JDM widebody fastback drift coupe
    hullShape.moveTo(-halfL, 0.05);
    hullShape.lineTo(halfL, 0.03);
    hullShape.lineTo(halfL * 0.96, 0.38);
    hullShape.lineTo(halfL * 0.42, 0.54);
    hullShape.lineTo(-halfL * 0.55, 0.58);
    hullShape.lineTo(-halfL * 0.94, 0.54);
    hullShape.lineTo(-halfL, 0.36);
    hullShape.closePath();
  } else {
    // Apex GT-R grand tourer fastback profile
    hullShape.moveTo(-halfL, 0.06);
    hullShape.lineTo(halfL, 0.04);
    hullShape.lineTo(halfL * 0.96, 0.42);
    hullShape.lineTo(halfL * 0.44, 0.56);
    hullShape.lineTo(-halfL * 0.65, 0.6);
    hullShape.lineTo(-halfL * 0.96, 0.52);
    hullShape.lineTo(-halfL, 0.38);
    hullShape.closePath();
  }

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: width * 0.84,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.075,
    bevelSegments: 3,
  });
  hullGeo.rotateY(-Math.PI / 2);
  hullGeo.center();
  const hullMesh = new THREE.Mesh(hullGeo, bodyMat);
  hullMesh.position.set(0, rideOffset + 0.24, 0);
  hullMesh.castShadow = !isSoftwareGl;
  hullMesh.receiveShadow = !isSoftwareGl;
  bodyTiltGroup.add(hullMesh);

  // 2. Sculpted Widebody Front & Rear Muscular Haunches / Quarter Panels
  const haunchShape = new THREE.Shape();
  const haunchL = length * 0.92;
  haunchShape.moveTo(-haunchL * 0.5, 0.02);
  haunchShape.lineTo(haunchL * 0.5, 0.01);
  haunchShape.lineTo(haunchL * 0.46, 0.36);
  haunchShape.lineTo(haunchL * 0.16, 0.44);
  haunchShape.lineTo(-haunchL * 0.14, 0.42);
  haunchShape.lineTo(-haunchL * 0.44, 0.48);
  haunchShape.lineTo(-haunchL * 0.5, 0.32);
  haunchShape.closePath();

  const haunchGeo = new THREE.ExtrudeGeometry(haunchShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  haunchGeo.rotateY(-Math.PI / 2);
  haunchGeo.center();
  for (const side of [-1, 1]) {
    const haunch = new THREE.Mesh(haunchGeo, bodyMat);
    haunch.position.set(side * (width * 0.44), rideOffset + 0.18, 0);
    haunch.castShadow = !isSoftwareGl;
    bodyTiltGroup.add(haunch);
  }

  // Sculpted Hood Power-Dome & Aero Extractor Vents
  const hoodBulgeGeo = new THREE.BoxGeometry(width * 0.46, 0.055, length * 0.26);
  const hoodBulge = new THREE.Mesh(
    hoodBulgeGeo,
    config.paintFinish === 'carbon' ? darkCarbonMat : bodyMat
  );
  hoodBulge.position.set(
    0,
    rideOffset + (config.chassis === 'titan_nomad' ? 0.62 : 0.45),
    halfL * 0.52
  );
  hoodBulge.rotation.x = 0.09;
  bodyTiltGroup.add(hoodBulge);

  // Twin recessed carbon hood extractor louvers
  const louverGeo = new THREE.BoxGeometry(0.16, 0.03, 0.36);
  for (const side of [-1, 1]) {
    const louver = new THREE.Mesh(louverGeo, darkCarbonMat);
    louver.position.set(
      side * (width * 0.24),
      hoodBulge.position.y + 0.01,
      halfL * 0.54
    );
    louver.rotation.x = 0.09;
    bodyTiltGroup.add(louver);
  }

  // 3. Sculpted Greenhouse / Cabin Canopy + Structural A/B/C Pillars
  const cabinShape = new THREE.Shape();
  const cabL = config.chassis === 'titan_nomad' ? length * 0.62 : length * 0.52;
  const cabH = cabinHeight * 0.44;
  cabinShape.moveTo(-cabL * 0.52, 0);
  cabinShape.lineTo(cabL * 0.48, 0);
  cabinShape.lineTo(cabL * 0.18, cabH);
  cabinShape.lineTo(
    config.chassis === 'titan_nomad' ? -cabL * 0.46 : -cabL * 0.28,
    cabH
  );
  cabinShape.closePath();

  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: width * 0.72,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  cabinGeo.rotateY(-Math.PI / 2);
  cabinGeo.center();
  const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
  const cabinY =
    rideOffset + (config.chassis === 'titan_nomad' ? 0.74 : 0.56);
  const cabinZ = config.chassis === 'valkyrie_v10' ? 0.1 : -0.14;
  cabinMesh.position.set(0, cabinY, cabinZ);
  bodyTiltGroup.add(cabinMesh);

  // Roof painted/carbon panel on top of greenhouse
  const roofPanelGeo = new THREE.BoxGeometry(
    width * 0.68,
    0.05,
    cabL * (config.chassis === 'titan_nomad' ? 0.68 : 0.48)
  );
  const roofPanel = new THREE.Mesh(
    roofPanelGeo,
    config.paintFinish === 'carbon' ? darkCarbonMat : bodyMat
  );
  roofPanel.position.set(0, cabinY + cabH * 0.5 + 0.015, cabinZ - 0.05);
  bodyTiltGroup.add(roofPanel);

  // Structural B-Pillars & Window Frame Trim
  const bPillarGeo = new THREE.BoxGeometry(width * 0.75, cabH * 0.92, 0.07);
  const bPillar = new THREE.Mesh(bPillarGeo, darkCarbonMat);
  bPillar.position.set(0, cabinY, cabinZ - 0.06);
  bodyTiltGroup.add(bPillar);

  // 4. Detailed Interior Cockpit (Bucket Seats, Dashboard, Digital Cluster & Steering Wheel)
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.68,
    metalness: 0.15,
  });
  const seatBackGeo = new THREE.BoxGeometry(0.36, 0.46, 0.09);
  const seatHeadGeo = new THREE.BoxGeometry(0.22, 0.18, 0.08);
  for (const sx of [-0.34, 0.34]) {
    const seatBack = new THREE.Mesh(seatBackGeo, seatMat);
    seatBack.position.set(sx, cabinY - 0.04, cabinZ - 0.18);
    seatBack.rotation.x = -0.22;
    bodyTiltGroup.add(seatBack);

    const headrest = new THREE.Mesh(seatHeadGeo, secondaryTrimMat);
    headrest.position.set(sx, cabinY + 0.22, cabinZ - 0.23);
    bodyTiltGroup.add(headrest);
  }

  // Dashboard Binnacle & Illuminated Digital Telemetry Screen
  const dashGeo = new THREE.BoxGeometry(width * 0.66, 0.18, 0.32);
  const dashMesh = new THREE.Mesh(dashGeo, seatMat);
  dashMesh.position.set(0, cabinY - 0.08, cabinZ + cabL * 0.24);
  bodyTiltGroup.add(dashMesh);

  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.8,
  });
  const screenGeo = new THREE.BoxGeometry(0.28, 0.09, 0.02);
  const screenMesh = new THREE.Mesh(screenGeo, screenMat);
  screenMesh.position.set(0.32, cabinY + 0.02, cabinZ + cabL * 0.16);
  bodyTiltGroup.add(screenMesh);

  // Articulated Steering Wheel inside Left-Hand Driver Cockpit (+X in car local frame where +Z is forward and +X is left)
  const steeringWheelGroup = new THREE.Group();
  steeringWheelGroup.position.set(0.34, cabinY - 0.01, cabinZ + cabL * 0.1);
  const swRimGeo = new THREE.TorusGeometry(0.13, 0.022, 8, 18);
  const swRim = new THREE.Mesh(swRimGeo, darkCarbonMat);
  const swSpokeGeo = new THREE.BoxGeometry(0.24, 0.025, 0.02);
  const swSpoke = new THREE.Mesh(swSpokeGeo, chromeMat);
  steeringWheelGroup.add(swRim, swSpoke);
  bodyTiltGroup.add(steeringWheelGroup);

  // 5. Aerodynamic Wing Mirrors on Twin Stalks with Amber LED Turn Repeaters
  const mirrorCapGeo = new THREE.BoxGeometry(0.22, 0.09, 0.14);
  const mirrorStalkGeo = new THREE.BoxGeometry(0.14, 0.04, 0.06);
  const repeaterMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
  });
  const repeaterGeo = new THREE.BoxGeometry(0.18, 0.02, 0.02);
  for (const side of [-1, 1]) {
    const mx = side * (width * 0.45);
    const my = cabinY - 0.02;
    const mz = cabinZ + cabL * 0.2;

    const stalk = new THREE.Mesh(mirrorStalkGeo, darkCarbonMat);
    stalk.position.set(mx - side * 0.05, my - 0.02, mz);
    bodyTiltGroup.add(stalk);

    const cap = new THREE.Mesh(mirrorCapGeo, bodyMat);
    cap.position.set(mx, my, mz);
    cap.rotation.y = side * -0.18;
    bodyTiltGroup.add(cap);

    const rep = new THREE.Mesh(repeaterGeo, repeaterMat);
    rep.position.set(mx, my, mz + 0.072);
    rep.rotation.y = side * -0.18;
    bodyTiltGroup.add(rep);
  }

  // 6. Sculpted Wheel Arch Flares & Side Air Intakes
  const archGeo = new THREE.BoxGeometry(0.16, 0.28, wheelRadius * 2.28);
  const archZOffsets = [wheelbase * 0.5, -wheelbase * 0.5];
  for (const az of archZOffsets) {
    for (const side of [-1, 1]) {
      const arch = new THREE.Mesh(archGeo, bodyMat);
      arch.position.set(side * (width * 0.46), rideOffset + 0.15, az);
      bodyTiltGroup.add(arch);
    }
  }

  // Side Skirts & Mid-Body Sidepod Air Intakes
  const skirtGeo = new THREE.BoxGeometry(width * 0.99, 0.095, wheelbase * 0.78);
  const skirtMesh = new THREE.Mesh(skirtGeo, darkCarbonMat);
  skirtMesh.position.set(0, rideOffset - 0.02, 0);
  bodyTiltGroup.add(skirtMesh);

  const sideIntakeGeo = new THREE.BoxGeometry(width * 0.96, 0.22, 0.52);
  const sideIntake = new THREE.Mesh(sideIntakeGeo, grilleMat);
  sideIntake.position.set(0, rideOffset + 0.18, -wheelbase * 0.16);
  bodyTiltGroup.add(sideIntake);

  // Flush Carbon Door Handles & Front Fender Air-Extractor Gills
  const doorHandleGeo = new THREE.BoxGeometry(0.04, 0.032, 0.18);
  const fenderGillGeo = new THREE.BoxGeometry(0.04, 0.22, 0.12);
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(doorHandleGeo, darkCarbonMat);
    handle.position.set(side * (width * 0.49), rideOffset + 0.38, -0.22);
    bodyTiltGroup.add(handle);

    const gill = new THREE.Mesh(fenderGillGeo, grilleMat);
    gill.position.set(
      side * (width * 0.49),
      rideOffset + 0.22,
      wheelbase * 0.28
    );
    gill.rotation.x = 0.18;
    bodyTiltGroup.add(gill);
  }

  // 7. Front Fascia: Honeycomb Radiator Grille, Twin-Turbo Intercooler & Aero Splitter
  const frontGrilleGeo = new THREE.BoxGeometry(width * 0.64, 0.22, 0.08);
  const frontGrille = new THREE.Mesh(frontGrilleGeo, grilleMat);
  frontGrille.position.set(0, rideOffset + 0.12, halfL - 0.01);
  bodyTiltGroup.add(frontGrille);

  // Visible Brushed Aluminum Front-Mount Intercooler (FMIC) behind lower grille
  const intercoolerGeo = new THREE.BoxGeometry(width * 0.48, 0.14, 0.06);
  const intercooler = new THREE.Mesh(intercoolerGeo, chromeMat);
  intercooler.position.set(0, rideOffset + 0.08, halfL + 0.01);
  bodyTiltGroup.add(intercooler);

  // Front Aero Splitter & Corner Dive Planes / Canards
  const splitterDepth =
    config.splitter === 'track_carbon'
      ? 0.36
      : config.splitter === 'street'
      ? 0.24
      : 0.14;
  const splitterGeo = new THREE.BoxGeometry(
    width * (config.splitter === 'track_carbon' ? 1.05 : 0.97),
    0.045,
    splitterDepth
  );
  const splitterMesh = new THREE.Mesh(splitterGeo, darkCarbonMat);
  splitterMesh.position.set(0, rideOffset - 0.04, halfL + splitterDepth * 0.35);
  bodyTiltGroup.add(splitterMesh);

  if (config.splitter !== 'stock') {
    const canardGeo = new THREE.BoxGeometry(0.14, 0.025, 0.22);
    for (const side of [-1, 1]) {
      const canard = new THREE.Mesh(canardGeo, darkCarbonMat);
      canard.position.set(
        side * (width * 0.48),
        rideOffset + 0.09,
        halfL - 0.08
      );
      canard.rotation.z = side * 0.28;
      canard.rotation.x = 0.22;
      bodyTiltGroup.add(canard);
    }
  }

  // 8. Rear Aero Diffuser, Twin/Quad Exhausts, Nitrous Flames & Shift Backfire Pops
  const diffuserGeo = new THREE.BoxGeometry(width * 0.88, 0.15, 0.26);
  const diffuserMesh = new THREE.Mesh(diffuserGeo, darkCarbonMat);
  diffuserMesh.position.set(0, rideOffset + 0.02, -halfL - 0.04);
  bodyTiltGroup.add(diffuserMesh);

  if (config.diffuser !== 'stock') {
    const finCount = config.diffuser === 'aggressive_gt' ? 5 : 3;
    const finGeo = new THREE.BoxGeometry(0.028, 0.19, 0.3);
    for (let i = 0; i < finCount; i++) {
      const fx = (i / (finCount - 1) - 0.5) * (width * 0.6);
      const fin = new THREE.Mesh(finGeo, secondaryTrimMat);
      fin.position.set(fx, rideOffset + 0.01, -halfL - 0.06);
      bodyTiltGroup.add(fin);
    }
  }

  // Quad Titanium Exhaust Tips + Nitrous Flame Cones + Shift Backfire Pop Cones
  const exhaustGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.26, 14);
  exhaustGeo.rotateX(Math.PI / 2);

  const nitroFlameGroup = new THREE.Group();
  const flameGeo = new THREE.ConeGeometry(0.09, 0.72, 10);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
  });

  const exhaustPopGroup = new THREE.Group();
  const popGeo = new THREE.ConeGeometry(0.08, 0.42, 8);
  popGeo.rotateX(-Math.PI / 2);
  const popMat = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    transparent: true,
    opacity: 0.92,
  });

  for (const exSide of [-0.52, -0.39, 0.39, 0.52]) {
    const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
    pipe.position.set(exSide, rideOffset + 0.03, -halfL - 0.08);
    bodyTiltGroup.add(pipe);
  }
  for (const exSide of [-0.455, 0.455]) {
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(exSide, rideOffset + 0.03, -halfL - 0.44);
    nitroFlameGroup.add(flame);

    const pop = new THREE.Mesh(popGeo, popMat);
    pop.position.set(exSide, rideOffset + 0.03, -halfL - 0.3);
    exhaustPopGroup.add(pop);
  }
  nitroFlameGroup.visible = false;
  exhaustPopGroup.visible = false;
  bodyTiltGroup.add(nitroFlameGroup);
  bodyTiltGroup.add(exhaustPopGroup);

  // 9. Rear Spoiler / Wing Assembly
  if (config.spoiler !== 'none') {
    const rearDeckY =
      rideOffset + (config.chassis === 'titan_nomad' ? 0.92 : 0.56);
    const rearDeckZ = -halfL + 0.24;

    if (config.spoiler === 'lip') {
      const lipGeo = new THREE.BoxGeometry(width * 0.88, 0.08, 0.22);
      const lipMesh = new THREE.Mesh(lipGeo, darkCarbonMat);
      lipMesh.position.set(0, rearDeckY + 0.04, rearDeckZ);
      lipMesh.rotation.x = 0.22;
      bodyTiltGroup.add(lipMesh);
    } else {
      const wingHeight = config.spoiler === 'swan_neck' ? 0.38 : 0.29;
      const strutGeo = new THREE.BoxGeometry(0.038, wingHeight, 0.24);
      const strutOffset = config.spoiler === 'swan_neck' ? 0.28 : 0.52;
      for (const side of [-1, 1]) {
        const strut = new THREE.Mesh(strutGeo, darkCarbonMat);
        strut.position.set(
          side * strutOffset,
          rearDeckY + wingHeight * 0.5,
          rearDeckZ
        );
        strut.rotation.x = -0.18;
        bodyTiltGroup.add(strut);
      }

      const bladeGeo = new THREE.BoxGeometry(width * 1.04, 0.042, 0.34);
      const blade = new THREE.Mesh(
        bladeGeo,
        config.spoiler === 'swan_neck' ? darkCarbonMat : bodyMat
      );
      blade.position.set(0, rearDeckY + wingHeight, rearDeckZ - 0.04);
      blade.rotation.x = 0.14;
      bodyTiltGroup.add(blade);

      const plateGeo = new THREE.BoxGeometry(0.03, 0.2, 0.4);
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(plateGeo, secondaryTrimMat);
        plate.position.set(
          side * (width * 0.52),
          rearDeckY + wingHeight,
          rearDeckZ - 0.04
        );
        bodyTiltGroup.add(plate);
      }
    }
  }

  // 10. Roof Accessory (Carbon Scoop or Rally LED Lightbar)
  if (config.roofAccessory !== 'none') {
    const roofY = cabinY + cabH * 0.5 + 0.05;
    if (config.roofAccessory === 'carbon_vent') {
      const scoopGeo = new THREE.BoxGeometry(0.4, 0.09, 0.68);
      const scoop = new THREE.Mesh(scoopGeo, darkCarbonMat);
      scoop.position.set(0, roofY, cabinZ + 0.1);
      bodyTiltGroup.add(scoop);
    } else if (config.roofAccessory === 'rally_lightbar') {
      const barGeo = new THREE.BoxGeometry(width * 0.62, 0.1, 0.14);
      const bar = new THREE.Mesh(barGeo, darkCarbonMat);
      bar.position.set(0, roofY + 0.03, cabinZ + 0.42);
      bodyTiltGroup.add(bar);

      const ledMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xfef08a,
        emissiveIntensity: 2.6,
      });
      const ledGeo = new THREE.BoxGeometry(width * 0.56, 0.06, 0.04);
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(0, roofY + 0.03, cabinZ + 0.49);
      bodyTiltGroup.add(led);
    }
  }

  // 11. Multi-Element LED Projector Headlights, DRL Light-Tubes, Volumetric Night Beams & Taillight Blade
  const headlightColors = {
    warm_white: 0xfef9c3,
    xenon_cyan: 0xbae6fd,
    yellow_gt: 0xfde047,
  };
  const beamColorHex = headlightColors[config.headlightTint];
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: beamColorHex,
    emissiveIntensity: 3.2,
    roughness: 0.08,
  });
  const drlMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: beamColorHex,
    emissiveIntensity: 1.8,
  });

  const headHousingGeo = new THREE.BoxGeometry(0.4, 0.12, 0.16);
  const projectorLensGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.06, 12);
  projectorLensGeo.rotateX(Math.PI / 2);
  const drlStripGeo = new THREE.BoxGeometry(0.38, 0.022, 0.04);

  const headlightBeamGroup = new THREE.Group();
  const coneLen = 11.5;
  const coneGeo = new THREE.ConeGeometry(2.1, coneLen, 16, 1, true);
  coneGeo.translate(0, -coneLen * 0.5, 0);
  coneGeo.rotateX(-Math.PI / 2);
  const coneMat = new THREE.MeshBasicMaterial({
    color: beamColorHex,
    transparent: true,
    opacity: 0.055,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  for (const side of [-1, 1]) {
    const hx = side * (width * 0.34);
    const hy = rideOffset + 0.25;
    const hz = halfL - 0.03;

    const housing = new THREE.Mesh(headHousingGeo, darkCarbonMat);
    housing.position.set(hx, hy, hz - 0.02);
    bodyTiltGroup.add(housing);

    // Twin projector lenses inside each headlight housing
    for (const pOffset of [-0.08, 0.08]) {
      const lens = new THREE.Mesh(projectorLensGeo, headMat);
      lens.position.set(hx + pOffset, hy + 0.01, hz + 0.04);
      bodyTiltGroup.add(lens);
    }

    // Signature angled LED DRL strip underneath projector lenses
    const drl = new THREE.Mesh(drlStripGeo, drlMat);
    drl.position.set(hx, hy - 0.04, hz + 0.05);
    drl.rotation.z = side * -0.08;
    bodyTiltGroup.add(drl);

    const beamCone = new THREE.Mesh(coneGeo, coneMat);
    beamCone.position.set(hx, hy - 0.01, halfL + 0.05);
    beamCone.rotation.x = 0.04;
    headlightBeamGroup.add(beamCone);
  }

  // Projected Road Headlight Illumination Pool ahead of front bumper
  const poolGeo = new THREE.PlaneGeometry(width * 4.4, 24);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    color: beamColorHex,
    map: getHeadlightPoolTexture(),
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const poolMesh = new THREE.Mesh(poolGeo, poolMat);
  poolMesh.position.set(0, 0.042, halfL + 11.5);
  headlightBeamGroup.add(poolMesh);

  const headlightSpotLight = new THREE.SpotLight(
    beamColorHex,
    6.5,
    58,
    Math.PI * 0.26,
    0.55,
    1.2
  );
  headlightSpotLight.position.set(0, rideOffset + 0.45, halfL);
  headlightSpotLight.target.position.set(0, 0.1, halfL + 26);
  root.add(headlightSpotLight);
  root.add(headlightSpotLight.target);
  root.add(headlightBeamGroup);

  // Full-Width Sculpted 3D LED Taillight Lightbar + Quad Afterburner Rings + Rear Radiator Vents + License Plate
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 1.8,
    roughness: 0.14,
  });
  const rearZ = -halfL - 0.082;
  const tailHousingGeo = new THREE.BoxGeometry(width * 0.9, 0.16, 0.06);
  const tailHousing = new THREE.Mesh(tailHousingGeo, darkCarbonMat);
  tailHousing.position.set(0, rideOffset + 0.36, rearZ);
  bodyTiltGroup.add(tailHousing);

  const tailBladeGeo = new THREE.BoxGeometry(width * 0.84, 0.042, 0.07);
  const tailBar = new THREE.Mesh(tailBladeGeo, taillightMat);
  tailBar.position.set(0, rideOffset + 0.39, rearZ - 0.01);
  bodyTiltGroup.add(tailBar);

  // Quad Circular LED Afterburner Taillight Rings
  const ringTailGeo = new THREE.TorusGeometry(0.052, 0.016, 10, 20);
  for (const rx of [-0.68, -0.52, 0.52, 0.68]) {
    const ringTail = new THREE.Mesh(ringTailGeo, taillightMat);
    ringTail.position.set(rx, rideOffset + 0.34, rearZ - 0.032);
    bodyTiltGroup.add(ringTail);
  }

  // Rear Twin Honeycomb Heat-Extractor Vents & Recessed License Plate
  const rearVentGeo = new THREE.BoxGeometry(0.38, 0.11, 0.05);
  for (const side of [-1, 1]) {
    const rVent = new THREE.Mesh(rearVentGeo, grilleMat);
    rVent.position.set(side * (width * 0.28), rideOffset + 0.2, rearZ);
    bodyTiltGroup.add(rVent);
  }

  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.35,
    roughness: 0.3,
  });
  const plateGeo = new THREE.BoxGeometry(0.38, 0.11, 0.055);
  const plateMesh = new THREE.Mesh(plateGeo, plateMat);
  plateMesh.position.set(0, rideOffset + 0.2, rearZ - 0.005);
  bodyTiltGroup.add(plateMesh);

  // 12. Four Articulated Wheel, Suspension, Brake Rotor & Multi-Piece Forged Rim Assemblies
  const tireTextures = getTireTextures();
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tireTextures.map,
    bumpMap: tireTextures.bumpMap,
    bumpScale: 0.012,
    roughness: 0.82,
    metalness: 0.08,
  });

  const rimMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(config.rimColor),
    metalness: 0.9,
    roughness: 0.18,
    clearcoat: 0.85,
  });

  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: getBrakeRotorTexture(),
    metalness: 0.82,
    roughness: 0.28,
  });

  const caliperMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(config.caliperColor),
    metalness: 0.55,
    roughness: 0.25,
    clearcoat: 0.9,
  });

  const tireGeo = new THREE.CylinderGeometry(
    wheelRadius,
    wheelRadius,
    wheelWidth,
    28
  );
  tireGeo.rotateZ(Math.PI / 2);

  // Recessed stepped alloy barrel
  const rimOuterGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.73,
    wheelRadius * 0.73,
    wheelWidth * 1.02,
    24
  );
  rimOuterGeo.rotateZ(Math.PI / 2);

  // Cross-drilled ventilated brake rotor disc inside the wheel barrel
  const rotorGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.58,
    wheelRadius * 0.58,
    0.04,
    24
  );
  rotorGeo.rotateZ(Math.PI / 2);

  // Center lock lug hub cap
  const centerCapGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.16,
    wheelRadius * 0.16,
    wheelWidth * 1.07,
    12
  );
  centerCapGeo.rotateZ(Math.PI / 2);

  // Brembo-style 6-piston brake caliper
  const caliperGeo = new THREE.BoxGeometry(
    wheelWidth * 0.48,
    wheelRadius * 0.46,
    wheelRadius * 0.28
  );

  // Visible coilover suspension spring inside wheel well
  const strutGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.34, 10);

  const wheelPositions: Array<{ x: number; z: number; isFront: boolean }> = [
    { x: width * 0.46, z: wheelbase * 0.5, isFront: true }, // FL
    { x: -width * 0.46, z: wheelbase * 0.5, isFront: true }, // FR
    { x: width * 0.46, z: -wheelbase * 0.5, isFront: false }, // RL
    { x: -width * 0.46, z: -wheelbase * 0.5, isFront: false }, // RR
  ];

  const wheelSuspensionGroups: THREE.Group[] = [];
  const wheelSteerGroups: THREE.Group[] = [];
  const wheelSpinGroups: THREE.Group[] = [];
  const camberRad = (config.camberAngle * Math.PI) / 180;

  wheelPositions.forEach((wp) => {
    const suspensionGroup = new THREE.Group();
    suspensionGroup.position.set(wp.x, wheelRadius, wp.z);

    // Visible coilover strut connecting wheel carrier to upper wheel well
    const strut = new THREE.Mesh(strutGeo, caliperMat);
    strut.position.set(wp.x > 0 ? -0.12 : 0.12, 0.16, 0);
    suspensionGroup.add(strut);

    const steerGroup = new THREE.Group();
    steerGroup.rotation.z = wp.x > 0 ? -camberRad : camberRad;

    // Non-spinning brake caliper attached to steering knuckle
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(
      wp.x > 0 ? 0.04 : -0.04,
      0.04,
      wp.isFront ? -wheelRadius * 0.36 : wheelRadius * 0.36
    );
    steerGroup.add(caliper);

    const spinGroup = new THREE.Group();
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    const rimMesh = new THREE.Mesh(rimOuterGeo, rimMat);
    const rotorMesh = new THREE.Mesh(rotorGeo, rotorMat);
    rotorMesh.position.x = wp.x > 0 ? -0.02 : 0.02;
    const capMesh = new THREE.Mesh(centerCapGeo, caliperMat);
    spinGroup.add(tireMesh, rimMesh, rotorMesh, capMesh);

    // Sculpted 3D Spokes based on rimStyle
    const spokeCount =
      config.rimStyle === 'multi_spoke'
        ? 7
        : config.rimStyle === 'forged_split'
        ? 5
        : config.rimStyle === 'deep_dish'
        ? 6
        : 4;
    const spokeGeo = new THREE.BoxGeometry(
      wheelWidth * 1.05,
      wheelRadius * 1.36,
      config.rimStyle === 'aero_turbo' ? wheelRadius * 0.42 : 0.048
    );
    for (let s = 0; s < spokeCount; s++) {
      const spoke = new THREE.Mesh(spokeGeo, rimMat);
      spoke.rotation.x = (s * Math.PI) / spokeCount;
      spinGroup.add(spoke);
    }

    steerGroup.add(spinGroup);
    suspensionGroup.add(steerGroup);
    root.add(suspensionGroup);

    wheelSuspensionGroups.push(suspensionGroup);
    if (wp.isFront) {
      wheelSteerGroups.push(steerGroup);
    }
    wheelSpinGroups.push(spinGroup);
  });

  return {
    root,
    bodyTiltGroup,
    steeringWheelGroup,
    wheelSuspensionGroups: [
      wheelSuspensionGroups[0],
      wheelSuspensionGroups[1],
      wheelSuspensionGroups[2],
      wheelSuspensionGroups[3],
    ],
    wheelSteerGroups: [wheelSteerGroups[0], wheelSteerGroups[1]],
    wheelSpinGroups: [
      wheelSpinGroups[0],
      wheelSpinGroups[1],
      wheelSpinGroups[2],
      wheelSpinGroups[3],
    ],
    headlightMat: headMat,
    drlMat,
    headlightBeamGroup,
    headlightSpotLight,
    taillightMat,
    nitroFlameGroup,
    exhaustPopGroup,
    underglowMesh,
  };
}

