import * as THREE from 'three';
import { BuildingCollider } from './worldData';

interface FacadePbrSet {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export interface DynamicEmissiveEntry {
  mat: THREE.MeshStandardMaterial;
  nightIntensity: number;
  dayIntensity: number;
}

export interface BuildingMaterialLibrary {
  facadeVariants: FacadePbrSet[];
  lobbySet: FacadePbrSet;
  helipadTex: THREE.CanvasTexture;
  graniteMat: THREE.MeshStandardMaterial;
  limestoneMat: THREE.MeshStandardMaterial;
  terracottaMat: THREE.MeshStandardMaterial;
  darkSteelMat: THREE.MeshStandardMaterial;
  brushedAluminumMat: THREE.MeshStandardMaterial;
  bronzeAnodizedMat: THREE.MeshStandardMaterial;
  concreteMat: THREE.MeshStandardMaterial;
  beaconRedMat: THREE.MeshStandardMaterial;
  warmUplightMat: THREE.MeshStandardMaterial;
  dynamicEmissiveList: DynamicEmissiveEntry[];
}

const ACCENT_PALETTE = [
  '#f59e0b',
  '#06b6d4',
  '#38bdf8',
  '#ef4444',
  '#10b981',
  '#a855f7',
  '#ec4899',
  '#f97316',
  '#eab308',
  '#14b8a6',
  '#6366f1',
  '#f43f5e',
];

/**
 * Generates a 512x512 multi-channel PBR texture set:
 * - `map` (Albedo): Crisp daytime architectural curtain glass, spandrel slabs, mullions & interior blinds
 *   so during the daytime (when emissiveIntensity = 0) windows look like sunlit reflective architectural glass.
 * - `emissiveMap`: Illuminated interior office rooms, ceiling light fixtures, and accent suites that
 *   glow vividly at night when `emissiveIntensity` ramps up.
 * - `roughnessMap`: Mirror-smooth glass panes (~0.08) contrasted against matte stone/metal mullions (~0.72).
 */
function createFacadePbrSet(
  variantIdx: number,
  accentHex: string,
  maxAnisotropy: number
): FacadePbrSet {
  const width = 512;
  const height = 512;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = width;
  emissiveCanvas.height = height;
  const eCtx = emissiveCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rCtx = roughCanvas.getContext('2d')!;

  // Vary structural frame color & window grid density across the 12 variants
  const frameColors = [
    '#162032',
    '#273244',
    '#1c2638',
    '#292524',
    '#1e293b',
    '#111827',
    '#1f2937',
    '#2d3748',
    '#182234',
    '#222b3a',
    '#192436',
    '#2c3444',
  ];
  ctx.fillStyle = frameColors[variantIdx % frameColors.length];
  ctx.fillRect(0, 0, width, height);

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#bcbcbc';
  rCtx.fillRect(0, 0, width, height);

  const colOptions = [6, 8, 10, 5, 8, 7, 9, 6, 8, 10, 7, 8];
  const rowOptions = [8, 8, 10, 6, 9, 7, 8, 6, 10, 8, 9, 7];
  const cols = colOptions[variantIdx % colOptions.length];
  const rows = rowOptions[variantIdx % rowOptions.length];

  const cellW = width / cols;
  const cellH = height / rows;

  const mullionX = 4 + (variantIdx % 4);
  const spandrelY = 10 + (variantIdx % 5) * 2;

  for (let r = 0; r < rows; r++) {
    const slabY = r * cellH;
    // Horizontal floor slab spandrel band
    ctx.fillStyle = variantIdx % 3 === 0 ? '#334155' : '#1e293b';
    ctx.fillRect(0, slabY, width, spandrelY);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, slabY + spandrelY - 2, width, 2);

    rCtx.fillStyle = '#d4d4d4';
    rCtx.fillRect(0, slabY, width, spandrelY);

    for (let c = 0; c < cols; c++) {
      const wx = c * cellW + mullionX;
      const wy = slabY + spandrelY;
      const ww = cellW - mullionX * 2;
      const wh = cellH - spandrelY - 3;

      // Mirror-smooth glass pane in roughnessMap
      rCtx.fillStyle = '#151515';
      rCtx.fillRect(wx, wy, ww, wh);

      // Daytime reflective architectural glass base on Albedo (`map`)
      const dayGlassGrad = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
      if (variantIdx % 4 === 0) {
        dayGlassGrad.addColorStop(0, '#1e3a5f');
        dayGlassGrad.addColorStop(0.5, '#2b4c7e');
        dayGlassGrad.addColorStop(1, '#0f172a');
      } else if (variantIdx % 4 === 1) {
        dayGlassGrad.addColorStop(0, '#1f3a3d');
        dayGlassGrad.addColorStop(0.5, '#285256');
        dayGlassGrad.addColorStop(1, '#0f1e22');
      } else if (variantIdx % 4 === 2) {
        dayGlassGrad.addColorStop(0, '#33302a');
        dayGlassGrad.addColorStop(0.5, '#4a4337');
        dayGlassGrad.addColorStop(1, '#1c1917');
      } else {
        dayGlassGrad.addColorStop(0, '#1e293b');
        dayGlassGrad.addColorStop(0.5, '#334155');
        dayGlassGrad.addColorStop(1, '#0f172a');
      }
      ctx.fillStyle = dayGlassGrad;
      ctx.fillRect(wx, wy, ww, wh);

      // Subtle daytime interior blind/curtain detail on Albedo
      const hash =
        Math.sin(r * 37.3 + c * 23.1 + variantIdx * 19.7) * 0.5 + 0.5;
      if (hash > 0.55) {
        ctx.fillStyle = 'rgba(203, 213, 225, 0.14)';
        ctx.fillRect(wx + 2, wy + 2, ww - 4, wh * (0.25 + (hash - 0.5) * 0.6));
      }

      // Nocturnal Room Illumination on Emissive (`emissiveMap`) + subtle warm interior hint
      if (hash > 0.42) {
        const emGrad = eCtx.createLinearGradient(wx, wy, wx, wy + wh);
        if (hash > 0.85) {
          emGrad.addColorStop(0, '#ffffff');
          emGrad.addColorStop(0.45, accentHex);
          emGrad.addColorStop(1, '#111827');
        } else if (hash > 0.62) {
          emGrad.addColorStop(0, '#fef08a');
          emGrad.addColorStop(0.6, '#f59e0b');
          emGrad.addColorStop(1, '#292524');
        } else {
          emGrad.addColorStop(0, '#e0f2fe');
          emGrad.addColorStop(0.6, '#38bdf8');
          emGrad.addColorStop(1, '#0c4a6e');
        }
        eCtx.fillStyle = emGrad;
        eCtx.fillRect(wx, wy, ww, wh);

        // Venetian blind slats on emissive map
        if (hash > 0.7) {
          eCtx.fillStyle = 'rgba(0, 0, 0, 0.42)';
          for (let by = wy + 4; by < wy + wh * 0.45; by += 5) {
            eCtx.fillRect(wx, by, ww, 2);
          }
        }
        // Bottom desk silhouette blocking lower window glow
        eCtx.fillStyle = '#000000';
        eCtx.fillRect(wx + 3, wy + wh - 7, ww * 0.65, 7);
      }

      // Internal vertical casement mullion divider
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(wx + ww * 0.5 - 1, wy, 2, wh);
      eCtx.fillStyle = '#000000';
      eCtx.fillRect(wx + ww * 0.5 - 1, wy, 2, wh);
      rCtx.fillStyle = '#9ca3af';
      rCtx.fillRect(wx + ww * 0.5 - 1, wy, 2, wh);
    }
  }

  // Diagrid structural cross-bracing on every 3rd variant
  if (variantIdx % 3 === 2) {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    eCtx.strokeStyle = '#000000';
    eCtx.lineWidth = 6;
    rCtx.strokeStyle = '#d4d4d4';
    rCtx.lineWidth = 6;

    for (const drawCtx of [ctx, eCtx, rCtx]) {
      drawCtx.beginPath();
      drawCtx.moveTo(0, 0);
      drawCtx.lineTo(width, height);
      drawCtx.moveTo(width, 0);
      drawCtx.lineTo(0, height);
      drawCtx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  return { map, emissiveMap, roughnessMap };
}

function createLobbyPbrSet(maxAnisotropy: number): FacadePbrSet {
  const width = 512;
  const height = 256;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = width;
  emissiveCanvas.height = height;
  const eCtx = emissiveCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rCtx = roughCanvas.getContext('2d')!;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, width, height);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, width, height);
  rCtx.fillStyle = '#b0b0b0';
  rCtx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, width, 28);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, 28, width, 4);
  eCtx.fillStyle = '#f59e0b';
  eCtx.fillRect(0, 28, width, 4);

  const bays = 4;
  const bayW = width / bays;
  for (let b = 0; b < bays; b++) {
    const bx = b * bayW + 14;
    const bw = bayW - 28;
    const by = 42;
    const bh = height - 54;

    // Daytime architectural glass lobby albedo
    const lobbyDayGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
    lobbyDayGrad.addColorStop(0, '#334155');
    lobbyDayGrad.addColorStop(0.5, '#1e3a5f');
    lobbyDayGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = lobbyDayGrad;
    ctx.fillRect(bx, by, bw, bh);

    // Nighttime warm atrium glow in emissiveMap
    const emGrad = eCtx.createLinearGradient(bx, by, bx, by + bh);
    emGrad.addColorStop(0, '#fef08a');
    emGrad.addColorStop(0.55, '#f59e0b');
    emGrad.addColorStop(1, '#451a03');
    eCtx.fillStyle = emGrad;
    eCtx.fillRect(bx, by, bw, bh);

    rCtx.fillStyle = '#141414';
    rCtx.fillRect(bx, by, bw, bh);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(bx, by + 58, bw, 6);
    ctx.fillRect(bx + bw * 0.33, by, 3, bh);
    ctx.fillRect(bx + bw * 0.66, by, 3, bh);

    eCtx.fillStyle = '#000000';
    eCtx.fillRect(bx, by + 58, bw, 6);
    eCtx.fillRect(bx + bw * 0.33, by, 3, bh);
    eCtx.fillRect(bx + bw * 0.66, by, 3, bh);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  return { map, emissiveMap, roughnessMap };
}

function createHelipadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 12]);
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(88, 76, 16, 104);
  ctx.fillRect(152, 76, 16, 104);
  ctx.fillRect(104, 120, 48, 16);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createBuildingMaterialLibrary(
  maxAnisotropy: number
): BuildingMaterialLibrary {
  const dynamicEmissiveList: DynamicEmissiveEntry[] = [];

  const facadeVariants: FacadePbrSet[] = [];
  for (let i = 0; i < 12; i++) {
    facadeVariants.push(
      createFacadePbrSet(i, ACCENT_PALETTE[i % ACCENT_PALETTE.length], maxAnisotropy)
    );
  }

  const beaconRedMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 3.0,
  });
  dynamicEmissiveList.push({
    mat: beaconRedMat,
    nightIntensity: 3.2,
    dayIntensity: 0.4,
  });

  const warmUplightMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.8,
  });
  dynamicEmissiveList.push({
    mat: warmUplightMat,
    nightIntensity: 2.1,
    dayIntensity: 0.0,
  });

  return {
    facadeVariants,
    lobbySet: createLobbyPbrSet(maxAnisotropy),
    helipadTex: createHelipadTexture(maxAnisotropy),
    graniteMat: new THREE.MeshStandardMaterial({
      color: 0x263244,
      roughness: 0.62,
      metalness: 0.22,
    }),
    limestoneMat: new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.68,
      metalness: 0.15,
    }),
    terracottaMat: new THREE.MeshStandardMaterial({
      color: 0x573b2e,
      roughness: 0.72,
      metalness: 0.18,
    }),
    darkSteelMat: new THREE.MeshStandardMaterial({
      color: 0x161f2e,
      roughness: 0.35,
      metalness: 0.82,
    }),
    brushedAluminumMat: new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.26,
      metalness: 0.88,
    }),
    bronzeAnodizedMat: new THREE.MeshStandardMaterial({
      color: 0x785c3c,
      roughness: 0.3,
      metalness: 0.84,
    }),
    concreteMat: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.78,
      metalness: 0.14,
    }),
    beaconRedMat,
    warmUplightMat,
    dynamicEmissiveList,
  };
}

/**
 * Updates all registered building window facades, ground-floor lobbies, terrace uplights,
 * and rooftop neon crowns according to the current `nightFactor` (0 = day, 1 = night).
 */
export function updateBuildingNightLighting(
  lib: BuildingMaterialLibrary,
  nightFactor: number
): void {
  for (let i = 0; i < lib.dynamicEmissiveList.length; i++) {
    const entry = lib.dynamicEmissiveList[i];
    entry.mat.emissiveIntensity =
      entry.dayIntensity +
      (entry.nightIntensity - entry.dayIntensity) * nightFactor;
  }
}

function makeScaledFacadeMaterial(
  lib: BuildingMaterialLibrary,
  pbr: FacadePbrSet,
  widthMeters: number,
  heightMeters: number,
  claddingTintHex: string,
  seedOffset: number,
  nightEmissiveStrength = 1.35
): THREE.MeshStandardMaterial {
  const repX = Math.max(1, Math.round(widthMeters / 13));
  const repY = Math.max(1, Math.round(heightMeters / 16));
  const offX = ((seedOffset * 0.17) % 1);
  const offY = ((seedOffset * 0.31) % 1);

  const map = pbr.map.clone();
  map.needsUpdate = true;
  map.repeat.set(repX, repY);
  map.offset.set(offX, offY);

  const emissiveMap = pbr.emissiveMap.clone();
  emissiveMap.needsUpdate = true;
  emissiveMap.repeat.set(repX, repY);
  emissiveMap.offset.set(offX, offY);

  const roughnessMap = pbr.roughnessMap.clone();
  roughnessMap.needsUpdate = true;
  roughnessMap.repeat.set(repX, repY);
  roughnessMap.offset.set(offX, offY);

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(claddingTintHex),
    map,
    emissive: new THREE.Color(0xffffff),
    emissiveMap,
    emissiveIntensity: nightEmissiveStrength,
    roughnessMap,
    bumpMap: roughnessMap,
    bumpScale: 0.018,
    roughness: 0.82,
    metalness: 0.72,
  });

  lib.dynamicEmissiveList.push({
    mat,
    nightIntensity: nightEmissiveStrength,
    dayIntensity: 0.0,
  });

  return mat;
}

function createRegularOctagonShape(w: number, d: number): THREE.Shape {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const cx = hw * 0.28;
  const cz = hd * 0.28;
  const shape = new THREE.Shape();
  shape.moveTo(-hw + cx, -hd);
  shape.lineTo(hw - cx, -hd);
  shape.lineTo(hw, -hd + cz);
  shape.lineTo(hw, hd - cz);
  shape.lineTo(hw - cx, hd);
  shape.lineTo(-hw + cx, hd);
  shape.lineTo(-hw, hd - cz);
  shape.lineTo(-hw, -hd + cz);
  shape.closePath();
  return shape;
}

/**
 * Builds a unique, multi-part, architecturally realistic 3D building (`THREE.Group`)
 * combining:
 * - Unique structural stone/metal material palette (`granite`, `limestone`, `terracotta`, `bronze`, `steel`)
 * - Street-level double-height illuminated lobby atrium + colonnade piers + marquee canopy
 * - 8 distinct 3D structural tower silhouettes (`b.planShape`)
 * - 5 exterior structural facade articulations (`b.finPattern`)
 * - 8 distinct rooftop architectural crowns (`b.roofType`)
 */
export function buildUltraRealisticBuilding(
  b: BuildingCollider,
  idx: number,
  lib: BuildingMaterialLibrary,
  isSoftwareGl: boolean
): THREE.Group {
  const bGroup = new THREE.Group();
  bGroup.position.set(b.x, 0, b.z);

  const accentColor = new THREE.Color(b.accentColor);
  const neonTrimMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 1.9,
    roughness: 0.2,
  });
  lib.dynamicEmissiveList.push({
    mat: neonTrimMat,
    nightIntensity: 2.1,
    dayIntensity: 0.08,
  });

  const pbrSet =
    lib.facadeVariants[b.facadeVariant % lib.facadeVariants.length];

  // Select structural stone & trim materials per building seed so every building's frame differs
  const stoneMats = [
    lib.graniteMat,
    lib.limestoneMat,
    lib.terracottaMat,
    lib.concreteMat,
  ];
  const stoneMat = stoneMats[b.seed % stoneMats.length];

  const metalMats = [
    lib.brushedAluminumMat,
    lib.bronzeAnodizedMat,
    lib.darkSteelMat,
  ];
  const trimMetalMat = metalMats[(b.seed * 3) % metalMats.length];

  // =========================================================================
  // 1. STREET-LEVEL ARCHITECTURAL PODIUM, ILLUMINATED ATRIUM & COLONNADE PIERS
  // =========================================================================
  const podiumH = Math.min(6.4, Math.max(4.5, b.height * 0.14));
  const lobbyRepX = Math.max(1, Math.round(b.width / 15));
  const lobbyMat = makeScaledFacadeMaterial(
    lib,
    lib.lobbySet,
    lobbyRepX * 13,
    16,
    b.claddingTint,
    b.seed,
    1.45
  );

  const lobbyCoreGeo = new THREE.BoxGeometry(
    b.width * 0.94,
    podiumH,
    b.depth * 0.94
  );
  const lobbyCore = new THREE.Mesh(lobbyCoreGeo, lobbyMat);
  lobbyCore.position.y = podiumH * 0.5;
  bGroup.add(lobbyCore);

  // Perimeter structural stone colonnade piers
  const pierW = 0.95 + (b.seed % 3) * 0.15;
  const pierGeo = new THREE.BoxGeometry(pierW, podiumH + 0.3, pierW);
  const halfW = b.width * 0.5 - pierW * 0.45;
  const halfD = b.depth * 0.5 - pierW * 0.45;
  for (const px of [-halfW, 0, halfW]) {
    for (const pz of [-halfD, 0, halfD]) {
      if (px === 0 && pz === 0) continue;
      const pier = new THREE.Mesh(pierGeo, stoneMat);
      pier.position.set(px, (podiumH + 0.3) * 0.5, pz);
      bGroup.add(pier);
    }
  }

  // Cantilevered Podium Cornice Ledge & Warm Downlight Marquee Canopy
  const corniceGeo = new THREE.BoxGeometry(
    b.width * 1.03,
    0.55,
    b.depth * 1.03
  );
  const cornice = new THREE.Mesh(corniceGeo, stoneMat);
  cornice.position.set(0, podiumH + 0.25, 0);
  bGroup.add(cornice);

  const canopyLitStripGeo = new THREE.BoxGeometry(
    b.width * 1.04,
    0.12,
    b.depth * 1.04
  );
  const canopyLit = new THREE.Mesh(canopyLitStripGeo, lib.warmUplightMat);
  canopyLit.position.set(0, 3.6, 0);
  bGroup.add(canopyLit);

  // =========================================================================
  // 2. MAIN ARCHITECTURAL TOWER SHAFT BY UNIQUE `planShape` (8 ARCHETYPES)
  // =========================================================================
  const towerTotalH = b.height - podiumH;
  const mainMat = makeScaledFacadeMaterial(
    lib,
    pbrSet,
    b.width * 0.88,
    towerTotalH,
    b.claddingTint,
    b.seed,
    1.35
  );

  let topCrownWidth = b.width * 0.68;
  let topCrownDepth = b.depth * 0.68;
  let topCrownBaseY = b.height;

  if (b.planShape === 'cylindrical_diagrid') {
    // Shape 1: Curved Cylindrical / Elliptical Diagrid Skyscraper with Cantilevered Sky-Rings
    const radiusBottom = Math.min(b.width, b.depth) * 0.45;
    const radiusTop = radiusBottom * (0.76 + (b.seed % 3) * 0.06);
    const radialSegs = 16;
    const cylGeo = new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      towerTotalH,
      radialSegs
    );
    const cylMesh = new THREE.Mesh(cylGeo, mainMat);
    cylMesh.position.y = podiumH + towerTotalH * 0.5;
    // Scale slightly if width != depth for elliptical footprint
    cylMesh.scale.set(
      b.width / Math.min(b.width, b.depth) * 0.92,
      1,
      b.depth / Math.min(b.width, b.depth) * 0.92
    );
    cylMesh.castShadow = !isSoftwareGl;
    cylMesh.receiveShadow = !isSoftwareGl;
    bGroup.add(cylMesh);

    // Horizontal brushed-metal exoskeletal rings every ~14m
    const ringCount = Math.max(2, Math.floor(towerTotalH / 14));
    for (let r = 1; r <= ringCount; r++) {
      const frac = r / (ringCount + 1);
      const ry = podiumH + towerTotalH * frac;
      const rad = radiusBottom + (radiusTop - radiusBottom) * frac;
      const ringGeo = new THREE.CylinderGeometry(
        rad * 1.05,
        rad * 1.05,
        0.55,
        radialSegs
      );
      const ring = new THREE.Mesh(ringGeo, trimMetalMat);
      ring.position.y = ry;
      ring.scale.copy(cylMesh.scale);
      bGroup.add(ring);
    }

    topCrownWidth = radiusTop * 1.5;
    topCrownDepth = radiusTop * 1.5;
  } else if (b.planShape === 'tapered_obelisk') {
    // Shape 2: 4-Stage Tapered Obelisk / Shard Tower narrowing smoothly upward
    const stages = 4;
    let curY = podiumH;
    for (let s = 0; s < stages; s++) {
      const sh = towerTotalH / stages;
      const scaleBot = 0.92 - s * 0.11;
      const tw = b.width * scaleBot;
      const td = b.depth * scaleBot;
      const sGeo = new THREE.BoxGeometry(tw, sh, td);
      const sMesh = new THREE.Mesh(sGeo, mainMat);
      sMesh.position.y = curY + sh * 0.5;
      sMesh.castShadow = !isSoftwareGl;
      sMesh.receiveShadow = !isSoftwareGl;
      bGroup.add(sMesh);

      // Glowing setback seam between obelisk stages
      const seamGeo = new THREE.BoxGeometry(tw * 1.03, 0.35, td * 1.03);
      const seam = new THREE.Mesh(
        seamGeo,
        s % 2 === 0 ? trimMetalMat : neonTrimMat
      );
      seam.position.y = curY + sh;
      bGroup.add(seam);

      curY += sh;
      topCrownWidth = tw * 0.85;
      topCrownDepth = td * 0.85;
    }
  } else if (b.planShape === 'chamfered_octagon') {
    // Shape 3: Extruded Chamfered Octagonal Core with Recessed Corner Channels
    const octW = b.width * 0.88;
    const octD = b.depth * 0.88;
    const octShape = createRegularOctagonShape(octW, octD);
    const octGeo = new THREE.ExtrudeGeometry(octShape, {
      depth: towerTotalH,
      bevelEnabled: false,
    });
    octGeo.rotateX(-Math.PI / 2);
    const octMesh = new THREE.Mesh(octGeo, mainMat);
    octMesh.position.y = podiumH;
    octMesh.castShadow = !isSoftwareGl;
    octMesh.receiveShadow = !isSoftwareGl;
    bGroup.add(octMesh);

    // 4 Vertical illuminated strips along the chamfered faces
    const stripGeo = new THREE.BoxGeometry(0.35, towerTotalH * 0.96, 0.35);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const strip = new THREE.Mesh(stripGeo, neonTrimMat);
        strip.position.set(
          sx * octW * 0.36,
          podiumH + towerTotalH * 0.5,
          sz * octD * 0.36
        );
        bGroup.add(strip);
      }
    }
    topCrownWidth = octW * 0.65;
    topCrownDepth = octD * 0.65;
  } else if (b.planShape === 'cruciform') {
    // Shape 4: Cross-Shaped (+) Interlocking Corporate Skyscraper with Corner Sky-Terraces
    const barW1 = b.width * 0.92;
    const barD1 = b.depth * 0.48;
    const barW2 = b.width * 0.48;
    const barD2 = b.depth * 0.92;

    const geo1 = new THREE.BoxGeometry(barW1, towerTotalH, barD1);
    const mesh1 = new THREE.Mesh(geo1, mainMat);
    mesh1.position.y = podiumH + towerTotalH * 0.5;
    mesh1.castShadow = !isSoftwareGl;
    mesh1.receiveShadow = !isSoftwareGl;
    bGroup.add(mesh1);

    const geo2 = new THREE.BoxGeometry(barW2, towerTotalH * 0.94, barD2);
    const mesh2 = new THREE.Mesh(geo2, mainMat);
    mesh2.position.y = podiumH + towerTotalH * 0.47;
    mesh2.castShadow = !isSoftwareGl;
    bGroup.add(mesh2);

    // Corner lower setback wings filling the 4 quadrants up to 55% height
    const quadH = towerTotalH * 0.52;
    const quadGeo = new THREE.BoxGeometry(b.width * 0.78, quadH, b.depth * 0.78);
    const quadMesh = new THREE.Mesh(quadGeo, mainMat);
    quadMesh.position.y = podiumH + quadH * 0.5;
    bGroup.add(quadMesh);

    const terraceTrimGeo = new THREE.BoxGeometry(
      b.width * 0.8,
      0.35,
      b.depth * 0.8
    );
    const terraceTrim = new THREE.Mesh(terraceTrimGeo, lib.warmUplightMat);
    terraceTrim.position.y = podiumH + quadH + 0.18;
    bGroup.add(terraceTrim);

    topCrownWidth = barW2 * 0.9;
    topCrownDepth = barD1 * 0.9;
  } else if (b.planShape === 'l_wing') {
    // Shape 5: Asymmetric L-Wing Corner Tower + Mid-Rise Courtyard Pavilion
    const wing1W = b.width * 0.46;
    const wing1D = b.depth * 0.9;
    const wing1Geo = new THREE.BoxGeometry(wing1W, towerTotalH, wing1D);
    const wing1 = new THREE.Mesh(wing1Geo, mainMat);
    wing1.position.set(-b.width * 0.21, podiumH + towerTotalH * 0.5, 0);
    wing1.castShadow = !isSoftwareGl;
    wing1.receiveShadow = !isSoftwareGl;
    bGroup.add(wing1);

    const wing2H = towerTotalH * 0.68;
    const wing2W = b.width * 0.88;
    const wing2D = b.depth * 0.44;
    const wing2Geo = new THREE.BoxGeometry(wing2W, wing2H, wing2D);
    const wing2 = new THREE.Mesh(wing2Geo, mainMat);
    wing2.position.set(0, podiumH + wing2H * 0.5, -b.depth * 0.22);
    wing2.castShadow = !isSoftwareGl;
    bGroup.add(wing2);

    // Illuminated rooftop terrace on the lower L-wing
    const lTerraceGeo = new THREE.BoxGeometry(
      wing2W * 1.02,
      0.32,
      wing2D * 1.02
    );
    const lTerrace = new THREE.Mesh(lTerraceGeo, neonTrimMat);
    lTerrace.position.set(0, podiumH + wing2H + 0.16, -b.depth * 0.22);
    bGroup.add(lTerrace);

    topCrownWidth = wing1W * 0.8;
    topCrownDepth = wing1D * 0.65;
  } else if (b.planShape === 'twin_linked') {
    // Shape 6: Asymmetric Twin Cores Linked by Elevated Glazed Skybridges
    const wingW = b.width * 0.37;
    const wingD = b.depth * 0.86;
    const wing1H = towerTotalH;
    const wing2H = towerTotalH * (0.78 + (b.seed % 3) * 0.06);

    const wing1Geo = new THREE.BoxGeometry(wingW, wing1H, wingD);
    const wing1 = new THREE.Mesh(wing1Geo, mainMat);
    wing1.position.set(-b.width * 0.24, podiumH + wing1H * 0.5, 0);
    wing1.castShadow = !isSoftwareGl;
    bGroup.add(wing1);

    const wing2Geo = new THREE.BoxGeometry(wingW, wing2H, wingD);
    const wing2 = new THREE.Mesh(wing2Geo, mainMat);
    wing2.position.set(b.width * 0.24, podiumH + wing2H * 0.5, 0);
    wing2.castShadow = !isSoftwareGl;
    bGroup.add(wing2);

    // 1 or 2 Glazed Skybridges depending on height
    const bridgeFracs = towerTotalH > 42 ? [0.42, 0.74] : [0.64];
    for (const bf of bridgeFracs) {
      const bridgeY = podiumH + wing2H * bf;
      const skybridgeGeo = new THREE.BoxGeometry(
        b.width * 0.52,
        3.4,
        wingD * 0.46
      );
      const skybridge = new THREE.Mesh(skybridgeGeo, mainMat);
      skybridge.position.set(0, bridgeY, 0);
      bGroup.add(skybridge);

      const bridgeTrimGeo = new THREE.BoxGeometry(
        b.width * 0.54,
        0.28,
        wingD * 0.5
      );
      const bTrim = new THREE.Mesh(bridgeTrimGeo, neonTrimMat);
      bTrim.position.set(0, bridgeY - 1.7, 0);
      bGroup.add(bTrim);
    }

    topCrownWidth = wingW * 0.78;
    topCrownDepth = wingD * 0.68;
  } else if (b.planShape === 'stepped_ziggurat') {
    // Shape 7: Multi-Tier Setback Ziggurat with Fluted Stone Corner Buttresses
    const numTiers = b.tierCount; // 2..5
    let curY = podiumH;
    for (let t = 0; t < numTiers; t++) {
      const th = towerTotalH / numTiers;
      const scale = 0.9 - t * (0.36 / Math.max(1, numTiers - 1));
      const tw = b.width * scale;
      const td = b.depth * scale;

      const tGeo = new THREE.BoxGeometry(tw, th, td);
      const tMesh = new THREE.Mesh(tGeo, mainMat);
      tMesh.position.y = curY + th * 0.5;
      tMesh.castShadow = !isSoftwareGl;
      tMesh.receiveShadow = !isSoftwareGl;
      bGroup.add(tMesh);

      const ledgeGeo = new THREE.BoxGeometry(tw * 1.04, 0.42, td * 1.04);
      const ledge = new THREE.Mesh(ledgeGeo, stoneMat);
      ledge.position.y = curY + th;
      bGroup.add(ledge);

      const uplightGeo = new THREE.BoxGeometry(tw * 0.96, 0.2, td * 0.96);
      const uplight = new THREE.Mesh(uplightGeo, lib.warmUplightMat);
      uplight.position.y = curY + th + 0.28;
      bGroup.add(uplight);

      curY += th;
      topCrownWidth = tw * 0.75;
      topCrownDepth = td * 0.75;
    }
  } else {
    // Shape 8 ('rectangular'): Curtain-Wall Tower with Recessed Mechanical Outrigger Floor
    const lowerFrac = 0.55 + (b.seed % 3) * 0.08;
    const lowerH = towerTotalH * lowerFrac;
    const trussH = 2.4;
    const upperH = Math.max(4, towerTotalH - lowerH - trussH);

    const lowerW = b.width * 0.88;
    const lowerD = b.depth * 0.88;
    const lowerGeo = new THREE.BoxGeometry(lowerW, lowerH, lowerD);
    const lowerShaft = new THREE.Mesh(lowerGeo, mainMat);
    lowerShaft.position.y = podiumH + lowerH * 0.5;
    lowerShaft.castShadow = !isSoftwareGl;
    lowerShaft.receiveShadow = !isSoftwareGl;
    bGroup.add(lowerShaft);

    const trussY = podiumH + lowerH + trussH * 0.5;
    const trussCoreGeo = new THREE.BoxGeometry(
      lowerW * 0.8,
      trussH,
      lowerD * 0.8
    );
    const trussCore = new THREE.Mesh(trussCoreGeo, lib.darkSteelMat);
    trussCore.position.y = trussY;
    bGroup.add(trussCore);

    const trussGlowGeo = new THREE.BoxGeometry(
      lowerW * 0.85,
      0.28,
      lowerD * 0.85
    );
    const trussGlow = new THREE.Mesh(trussGlowGeo, neonTrimMat);
    trussGlow.position.y = trussY;
    bGroup.add(trussGlow);

    const upperW = lowerW * (0.78 + (b.seed % 2) * 0.08);
    const upperD = lowerD * (0.78 + (b.seed % 2) * 0.08);
    const upperGeo = new THREE.BoxGeometry(upperW, upperH, upperD);
    const upperShaft = new THREE.Mesh(upperGeo, mainMat);
    upperShaft.position.y = podiumH + lowerH + trussH + upperH * 0.5;
    upperShaft.castShadow = !isSoftwareGl;
    bGroup.add(upperShaft);

    topCrownWidth = upperW * 0.76;
    topCrownDepth = upperD * 0.76;
    topCrownBaseY = podiumH + lowerH + trussH + upperH;
  }

  // =========================================================================
  // 3. EXTERIOR FACADE ARTICULATION BY `finPattern`
  // =========================================================================
  const bodySpanW = b.width * 0.86;
  const bodySpanD = b.depth * 0.86;

  if (
    b.finPattern === 'vertical_mullions' &&
    b.planShape !== 'cylindrical_diagrid'
  ) {
    const finH = towerTotalH * 0.94;
    const finGeo = new THREE.BoxGeometry(0.24, finH, 0.42);
    const finY = podiumH + finH * 0.5;
    for (const frac of [-0.3, 0, 0.3]) {
      for (const side of [-1, 1]) {
        const finNS = new THREE.Mesh(finGeo, trimMetalMat);
        finNS.position.set(
          frac * topCrownWidth,
          finY,
          side * (topCrownDepth * 0.5 + 0.15)
        );
        bGroup.add(finNS);
      }
    }
  } else if (b.finPattern === 'horizontal_louvers') {
    const stepMeters = 9 + (b.seed % 4) * 2;
    const beltGeo = new THREE.BoxGeometry(
      topCrownWidth * 1.18,
      0.38,
      topCrownDepth * 1.18
    );
    for (let by = podiumH + stepMeters; by < b.height - 4; by += stepMeters) {
      const belt = new THREE.Mesh(beltGeo, trimMetalMat);
      belt.position.y = by;
      bGroup.add(belt);
    }
  } else if (b.finPattern === 'corner_buttress') {
    const buttressH = towerTotalH * 0.85;
    const buttressGeo = new THREE.BoxGeometry(1.15, buttressH, 1.15);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const col = new THREE.Mesh(buttressGeo, stoneMat);
        col.position.set(
          sx * (topCrownWidth * 0.55),
          podiumH + buttressH * 0.5,
          sz * (topCrownDepth * 0.55)
        );
        bGroup.add(col);
      }
    }
  } else if (b.finPattern === 'recessed_balconies') {
    const balcStep = 8;
    const balcGeo = new THREE.BoxGeometry(
      bodySpanW * 0.32,
      0.42,
      bodySpanD * 0.96
    );
    for (let by = podiumH + 7; by < b.height - 6; by += balcStep) {
      const side = (Math.round(by) + b.seed) % 2 === 0 ? 1 : -1;
      const balc = new THREE.Mesh(balcGeo, stoneMat);
      balc.position.set(side * (topCrownWidth * 0.42), by, 0);
      bGroup.add(balc);
    }
  }

  // =========================================================================
  // 4. UNIQUE ROOFTOP ARCHITECTURAL CROWN BY `roofType` (8 STYLES)
  // =========================================================================
  const roofBaseY = topCrownBaseY;

  // Perimeter glowing crown horizon band
  const horizonBandGeo = new THREE.BoxGeometry(
    topCrownWidth * 1.06,
    0.42,
    topCrownDepth * 1.06
  );
  const horizonBand = new THREE.Mesh(horizonBandGeo, neonTrimMat);
  horizonBand.position.y = roofBaseY - 0.2;
  bGroup.add(horizonBand);

  if (b.roofType === 'sloped_shard') {
    // Roof 1: Dramatic Sloped Diagonal Wedge / Shard Crown
    const wedgeH = Math.max(5.5, b.height * 0.14);
    const shape = new THREE.Shape();
    shape.moveTo(-topCrownWidth * 0.5, 0);
    shape.lineTo(topCrownWidth * 0.5, 0);
    shape.lineTo(topCrownWidth * 0.5, wedgeH);
    shape.lineTo(-topCrownWidth * 0.5, wedgeH * 0.18);
    shape.closePath();

    const wedgeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: topCrownDepth * 0.88,
      bevelEnabled: false,
    });
    wedgeGeo.center();
    const wedge = new THREE.Mesh(wedgeGeo, mainMat);
    wedge.position.y = roofBaseY + wedgeH * 0.48;
    if (b.seed % 2 === 1) wedge.rotation.y = Math.PI / 2;
    bGroup.add(wedge);
  } else if (b.roofType === 'observatory_dome') {
    // Roof 2: Illuminated Geodesic Observatory Dome + Observation Ring
    const drumR = Math.min(topCrownWidth, topCrownDepth) * 0.44;
    const drumGeo = new THREE.CylinderGeometry(drumR, drumR * 1.06, 2.8, 16);
    const drum = new THREE.Mesh(drumGeo, stoneMat);
    drum.position.y = roofBaseY + 1.4;
    bGroup.add(drum);

    const domeGeo = new THREE.SphereGeometry(
      drumR * 0.88,
      16,
      12,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.5
    );
    const dome = new THREE.Mesh(domeGeo, neonTrimMat);
    dome.position.y = roofBaseY + 2.7;
    bGroup.add(dome);
  } else if (b.roofType === 'helipad') {
    // Roof 3: Elevated Penthouse & Helipad Deck with Aviation Beacons
    const crownH = 3.6;
    const crownGeo = new THREE.BoxGeometry(
      topCrownWidth * 0.76,
      crownH,
      topCrownDepth * 0.76
    );
    const crownMesh = new THREE.Mesh(crownGeo, lib.darkSteelMat);
    crownMesh.position.y = roofBaseY + crownH * 0.5;
    bGroup.add(crownMesh);

    const padSize = Math.min(topCrownWidth, topCrownDepth) * 0.68;
    const padGeo = new THREE.PlaneGeometry(padSize, padSize);
    padGeo.rotateX(-Math.PI / 2);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: lib.helipadTex,
      roughness: 0.5,
    });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.y = roofBaseY + crownH + 0.05;
    bGroup.add(padMesh);
  } else if (b.roofType === 'spire_lattice') {
    // Roof 4: Stepped Ziggurat Lantern + Tall Tapered Communications Spire & Red Aviation Beacon
    const lanternH = 4.8;
    const lanternGeo = new THREE.BoxGeometry(
      topCrownWidth * 0.52,
      lanternH,
      topCrownDepth * 0.52
    );
    const lantern = new THREE.Mesh(lanternGeo, neonTrimMat);
    lantern.position.y = roofBaseY + lanternH * 0.5;
    bGroup.add(lantern);

    const spireH = 11 + (b.seed % 6) * 1.8;
    const spireGeo = new THREE.CylinderGeometry(0.1, 0.45, spireH, 8);
    const spire = new THREE.Mesh(spireGeo, trimMetalMat);
    spire.position.y = roofBaseY + lanternH + spireH * 0.5;
    bGroup.add(spire);

    const beaconGeo = new THREE.SphereGeometry(0.32, 8, 8);
    const beacon = new THREE.Mesh(beaconGeo, lib.beaconRedMat);
    beacon.position.y = roofBaseY + lanternH + spireH + 0.2;
    bGroup.add(beacon);
  } else if (b.roofType === 'twin_fins') {
    // Roof 5: Twin Parallel Architectural Blade Fins + Twin Masts
    const bladeH = 5.2;
    const bladeGeo = new THREE.BoxGeometry(
      0.55,
      bladeH,
      topCrownDepth * 0.88
    );
    for (const side of [-1, 1]) {
      const blade = new THREE.Mesh(bladeGeo, trimMetalMat);
      blade.position.set(
        side * (topCrownWidth * 0.34),
        roofBaseY + bladeH * 0.5,
        0
      );
      bGroup.add(blade);

      const bladeGlowGeo = new THREE.BoxGeometry(
        0.62,
        0.35,
        topCrownDepth * 0.9
      );
      const bladeGlow = new THREE.Mesh(bladeGlowGeo, neonTrimMat);
      bladeGlow.position.set(
        side * (topCrownWidth * 0.34),
        roofBaseY + bladeH + 0.15,
        0
      );
      bGroup.add(bladeGlow);
    }
  } else if (b.roofType === 'cooling_towers') {
    // Roof 6: Mechanical Penthouse + Twin Cylindrical HVAC Cooling Drums
    const mechGeo = new THREE.BoxGeometry(
      topCrownWidth * 0.7,
      2.6,
      topCrownDepth * 0.45
    );
    const mech = new THREE.Mesh(mechGeo, lib.concreteMat);
    mech.position.set(0, roofBaseY + 1.3, -topCrownDepth * 0.15);
    bGroup.add(mech);

    const drumGeo = new THREE.CylinderGeometry(1.4, 1.5, 2.4, 12);
    for (const sx of [-1, 1]) {
      const drum = new THREE.Mesh(drumGeo, trimMetalMat);
      drum.position.set(
        sx * (topCrownWidth * 0.22),
        roofBaseY + 1.2,
        topCrownDepth * 0.22
      );
      bGroup.add(drum);
    }
  } else if (b.roofType === 'sky_garden') {
    // Roof 7: Cantilevered Sky-Garden Pergola Frame + Warm Terrace Lighting
    const colH = 3.8;
    const frameGeo = new THREE.BoxGeometry(
      topCrownWidth * 0.88,
      0.45,
      topCrownDepth * 0.88
    );
    const frameTop = new THREE.Mesh(frameGeo, stoneMat);
    frameTop.position.y = roofBaseY + colH;
    bGroup.add(frameTop);

    const glowCeilingGeo = new THREE.BoxGeometry(
      topCrownWidth * 0.78,
      0.2,
      topCrownDepth * 0.78
    );
    const glowCeiling = new THREE.Mesh(glowCeilingGeo, lib.warmUplightMat);
    glowCeiling.position.y = roofBaseY + colH - 0.25;
    bGroup.add(glowCeiling);

    const postGeo = new THREE.BoxGeometry(0.55, colH, 0.55);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, stoneMat);
        post.position.set(
          sx * (topCrownWidth * 0.4),
          roofBaseY + colH * 0.5,
          sz * (topCrownDepth * 0.4)
        );
        bGroup.add(post);
      }
    }
  } else {
    // Roof 8 ('crown_lantern'): Multi-Tiered Glowing Architectural Glass Lantern Box
    const l1H = 3.4;
    const l1Geo = new THREE.BoxGeometry(
      topCrownWidth * 0.72,
      l1H,
      topCrownDepth * 0.72
    );
    const l1 = new THREE.Mesh(l1Geo, neonTrimMat);
    l1.position.y = roofBaseY + l1H * 0.5;
    bGroup.add(l1);

    const capGeo = new THREE.BoxGeometry(
      topCrownWidth * 0.78,
      0.5,
      topCrownDepth * 0.78
    );
    const cap = new THREE.Mesh(capGeo, trimMetalMat);
    cap.position.y = roofBaseY + l1H + 0.25;
    bGroup.add(cap);
  }

  return bGroup;
}
