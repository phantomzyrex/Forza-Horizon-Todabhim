import * as THREE from 'three';
import {
  buildUltraRealisticBuilding,
  createBuildingMaterialLibrary,
  updateBuildingNightLighting,
} from './buildingBuilder';
import {
  DayNightAtmosphere,
  computeDayNightAtmosphere,
  lerpHexColor,
} from './dayNight';
import {
  BuiltNpcVehicleMesh,
  IntersectionSignalState,
  NpcTrafficVehicleState,
  TrafficSignalPhase,
  buildTrafficVehicleMesh,
  createInitialTrafficFleet,
  createTrafficSignalStates,
  stepTrafficSystem,
} from './trafficSystem';
import {
  APEX_BEACONS,
  CITY_BUILDINGS,
  ROAD_COORDS,
  ROAD_WIDTH,
  SPEED_TRAPS,
  STUNT_RAMPS,
  WORLD_BOUNDS,
  getIntersectionNodes,
  getRoadSegments,
  groundHeightAt,
} from './worldData';

export type WeatherCondition = 'clear' | 'light_rain' | 'heavy_storm';

export interface WeatherProfile {
  condition: WeatherCondition;
  label: string;
  shortLabel: string;
  surfaceWetness: number; // 0.0 (dry) to 1.0 (soaked)
  tractionMultiplier: number; // 1.0 (clear), 0.78 (light_rain), 0.58 (heavy_storm)
  brakingEfficiency: number; // 1.0 (clear), 0.82 (light_rain), 0.66 (heavy_storm)
  hydroplaneSlipBoost: number; // 1.0 (clear), 1.24 (light_rain), 1.52 (heavy_storm)
  roadRoughness: number;
  roadMetalness: number;
  fogDensity: number;
  skyDarkenFactor: number;
  rainStreakCount: number;
  rainFallSpeed: number;
  windDriftX: number;
  splashActiveCount: number;
  forceLightsActive: boolean;
}

export const WEATHER_ORDER: WeatherCondition[] = [
  'clear',
  'light_rain',
  'heavy_storm',
];

export const WEATHER_PROFILES: Record<WeatherCondition, WeatherProfile> = {
  clear: {
    condition: 'clear',
    label: 'Clear Dry',
    shortLabel: 'CLEAR',
    surfaceWetness: 0.0,
    tractionMultiplier: 1.0,
    brakingEfficiency: 1.0,
    hydroplaneSlipBoost: 1.0,
    roadRoughness: 0.68,
    roadMetalness: 0.18,
    fogDensity: 0.0042,
    skyDarkenFactor: 0.0,
    rainStreakCount: 0,
    rainFallSpeed: 0,
    windDriftX: 0,
    splashActiveCount: 0,
    forceLightsActive: false,
  },
  light_rain: {
    condition: 'light_rain',
    label: 'Light Rain',
    shortLabel: 'RAIN',
    surfaceWetness: 0.55,
    tractionMultiplier: 0.78,
    brakingEfficiency: 0.82,
    hydroplaneSlipBoost: 1.24,
    roadRoughness: 0.22,
    roadMetalness: 0.54,
    fogDensity: 0.0064,
    skyDarkenFactor: 0.38,
    rainStreakCount: 750,
    rainFallSpeed: 34,
    windDriftX: 2.8,
    splashActiveCount: 56,
    forceLightsActive: true,
  },
  heavy_storm: {
    condition: 'heavy_storm',
    label: 'Heavy Storm',
    shortLabel: 'STORM',
    surfaceWetness: 1.0,
    tractionMultiplier: 0.58,
    brakingEfficiency: 0.66,
    hydroplaneSlipBoost: 1.52,
    roadRoughness: 0.1,
    roadMetalness: 0.78,
    fogDensity: 0.0092,
    skyDarkenFactor: 0.7,
    rainStreakCount: 1600,
    rainFallSpeed: 48,
    windDriftX: 9.5,
    splashActiveCount: 120,
    forceLightsActive: true,
  },
};

export function getWeatherProfile(
  condition: WeatherCondition = 'clear'
): WeatherProfile {
  return WEATHER_PROFILES[condition] ?? WEATHER_PROFILES.clear;
}

export class GlobalWeatherManager {
  private currentCondition: WeatherCondition;
  private onChangeCallback?: (profile: WeatherProfile) => void;

  constructor(
    initialCondition: WeatherCondition = 'clear',
    onChangeCallback?: (profile: WeatherProfile) => void
  ) {
    this.currentCondition = initialCondition;
    this.onChangeCallback = onChangeCallback;
  }

  public getCondition(): WeatherCondition {
    return this.currentCondition;
  }

  public getProfile(): WeatherProfile {
    return WEATHER_PROFILES[this.currentCondition];
  }

  public setWeather(condition: WeatherCondition): WeatherProfile {
    this.currentCondition = condition;
    const profile = WEATHER_PROFILES[this.currentCondition];
    if (this.onChangeCallback) {
      this.onChangeCallback(profile);
    }
    return profile;
  }

  public toggleWeather(): WeatherProfile {
    const idx = WEATHER_ORDER.indexOf(this.currentCondition);
    const next = WEATHER_ORDER[(idx + 1) % WEATHER_ORDER.length];
    return this.setWeather(next);
  }
}

export interface WorldSceneObjects {
  beaconMeshes: Map<string, THREE.Group>;
  checkpointRingGroup: THREE.Group;
  trafficFleet: NpcTrafficVehicleState[];
  trafficSignals: IntersectionSignalState[];
  weatherManager: GlobalWeatherManager;
  setWeather: (condition: WeatherCondition) => WeatherProfile;
  toggleWeather: () => WeatherProfile;
  getWeather: () => WeatherCondition;
  updateWorldAnimations: (
    elapsedSec: number,
    dt: number,
    playerX?: number,
    playerZ?: number,
    playerVx?: number,
    playerVz?: number
  ) => void;
  applyDayNightCycle: (timeHours: number) => DayNightAtmosphere;
}

interface RoadPbrTextures {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

function createRoadAsphaltTextures(maxAnisotropy: number): RoadPbrTextures {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  // Base dark asphalt albedo & medium-high roughness base
  ctx.fillStyle = '#121822';
  ctx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#b8b8b8';
  rCtx.fillRect(0, 0, size, size);

  // Subtle polished tire wear tracks in the 4 lanes (x around 80, 190, 322, 432)
  const laneCenters = [82, 192, 320, 430];
  for (const lc of laneCenters) {
    const grad = ctx.createLinearGradient(lc - 36, 0, lc + 36, 0);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
    grad.addColorStop(0.3, 'rgba(30, 41, 59, 0.38)');
    grad.addColorStop(0.5, 'rgba(15, 23, 42, 0.1)');
    grad.addColorStop(0.7, 'rgba(30, 41, 59, 0.38)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(lc - 36, 0, 72, size);

    // Smoother (darker) roughness along polished tire tracks
    const rGrad = rCtx.createLinearGradient(lc - 34, 0, lc + 34, 0);
    rGrad.addColorStop(0, 'rgba(90,90,90,0)');
    rGrad.addColorStop(0.5, 'rgba(70,70,70,0.55)');
    rGrad.addColorStop(1, 'rgba(90,90,90,0)');
    rCtx.fillStyle = rGrad;
    rCtx.fillRect(lc - 34, 0, 68, size);
  }

  // Deterministic fine micro-grain (subtle 1x1px low-contrast variation so it never looks blocky up close)
  for (let i = 0; i < 6000; i++) {
    const gx = (Math.sin(i * 12.9898) * 0.5 + 0.5) * size;
    const gy = (Math.cos(i * 78.233) * 0.5 + 0.5) * size;
    ctx.fillStyle =
      i % 3 === 0 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.045)';
    ctx.fillRect(gx, gy, 1, 2);
    rCtx.fillStyle = i % 2 === 0 ? '#b2b2b2' : '#a4a4a4';
    rCtx.fillRect(gx, gy, 1, 2);
  }

  // Horizontal tar expansion seam every 256px
  ctx.fillStyle = 'rgba(9, 13, 20, 0.75)';
  ctx.fillRect(18, 126, size - 36, 3);
  ctx.fillRect(18, 382, size - 36, 3);

  // Outer concrete gutter & red/white motorsport shoulder rumble edge
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 18, size);
  ctx.fillRect(size - 18, 0, 18, size);
  for (let y = 0; y < size; y += 64) {
    ctx.fillStyle = (y / 64) % 2 === 0 ? '#dc2626' : '#e2e8f0';
    ctx.fillRect(4, y, 8, 64);
    ctx.fillRect(size - 12, y, 8, 64);
  }

  // Crisp thermoplastic solid white shoulder lines
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(22, 0, 6, size);
  ctx.fillRect(size - 28, 0, 6, size);

  // Double amber center divider with dark median channel
  ctx.fillStyle = '#090d14';
  ctx.fillRect(248, 0, 16, size);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(247, 0, 5, size);
  ctx.fillRect(260, 0, 5, size);

  // Reflective cat's-eye center studs
  for (let y = 32; y < size; y += 128) {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(253, y, 6, 10);
  }

  // Dashed white lane markers + reflective studs
  for (let y = 24; y < size; y += 128) {
    ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
    ctx.fillRect(134, y, 6, 56);
    ctx.fillRect(372, y, 6, 56);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(135, y + 84, 4, 8);
    ctx.fillRect(373, y + 84, 4, 8);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(roughCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap, roughnessMap: bumpMap };
}

function createIntersectionTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base dark asphalt
  ctx.fillStyle = '#121822';
  ctx.fillRect(0, 0, size, size);

  // Subtle asphalt grain
  for (let i = 0; i < 2500; i++) {
    const gx = (Math.sin(i * 41.1) * 0.5 + 0.5) * size;
    const gy = (Math.cos(i * 93.7) * 0.5 + 0.5) * size;
    ctx.fillStyle =
      i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(gx, gy, 2, 2);
  }

  // Central subtle amber box-junction frame
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(118, 118, size - 236, size - 236);

  // Diagonal box-junction hatch lines inside center
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let d = -200; d <= 200; d += 44) {
    ctx.moveTo(256 + d - 70, 186);
    ctx.lineTo(256 + d + 70, 326);
  }
  ctx.stroke();

  // Thick white stop bars on all 4 approaches
  ctx.fillStyle = '#f8fafc';
  // North & South stop bars
  ctx.fillRect(28, 86, 214, 10);
  ctx.fillRect(270, size - 96, 214, 10);
  // West & East stop bars
  ctx.fillRect(86, 270, 10, 214);
  ctx.fillRect(size - 96, 28, 10, 214);

  // 4-Way Zebra Crosswalk stripes
  ctx.fillStyle = 'rgba(241, 245, 249, 0.88)';
  for (let s = 38; s < size - 38; s += 34) {
    // North crosswalk
    ctx.fillRect(s, 20, 18, 54);
    // South crosswalk
    ctx.fillRect(s, size - 74, 18, 54);
    // West crosswalk
    ctx.fillRect(20, s, 54, 18);
    // East crosswalk
    ctx.fillRect(size - 74, s, 54, 18);
  }

  // Corner granite curb aprons
  ctx.fillStyle = '#334155';
  const cSize = 22;
  ctx.fillRect(0, 0, cSize, cSize);
  ctx.fillRect(size - cSize, 0, cSize, cSize);
  ctx.fillRect(0, size - cSize, cSize, cSize);
  ctx.fillRect(size - cSize, size - cSize, cSize, cSize);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSidewalkPaverTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 256);

  // Paver grid lines
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  // Outer light granite curb rim
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 248);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Populates the entire open-world metropolis scene:
 * - Extended outer terrain + Bay River water channel
 * - Segmented PBR road network + 4-way crosswalk intersections + raised block sidewalks
 * - Elevated Suspension Bridge with concrete parapet barriers, vertical suspenders & twin A-frame pylons
 * - Overhead traffic signal gantries at major intersections
 * - Composite multi-tier architectural skyscrapers & district landmarks
 * - InstancedMesh streetlamps & trees (> 120 instances with `computeBoundingSphere()`)
 * - Stunt Ramps, Speed Trap radar gantries, Collectible Apex Beacons, and AI Traffic
 */
export function buildOpenWorldScene(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean
): WorldSceneObjects {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const roadPbr = createRoadAsphaltTextures(maxAniso);
  const intersectionTex = createIntersectionTexture(maxAniso);
  const sidewalkTex = createSidewalkPaverTexture(maxAniso);

  // 1. Dynamic Day-Night Sky Dome + Celestial Sun/Moon + Extended Ground Plane
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 64;
  skyCanvas.height = 256;
  const sCtx = skyCanvas.getContext('2d')!;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyGeo = new THREE.SphereGeometry(490, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    fog: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);

  // Celestial Solar Disc & Lunar Disc
  const sunGeo = new THREE.SphereGeometry(18, 16, 16);
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    fog: false,
  });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  scene.add(sunMesh);

  const moonGeo = new THREE.SphereGeometry(13, 16, 16);
  const moonMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    fog: false,
  });
  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  scene.add(moonMesh);

  const groundGeo = new THREE.PlaneGeometry(1400, 1400);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0b111d,
    roughness: 0.92,
    metalness: 0.08,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.position.y = -0.02;
  groundMesh.receiveShadow = !isSoftwareGl;
  scene.add(groundMesh);

  // 2. Central Bay River Channel (z in [-28, 28])
  const waterGeo = new THREE.PlaneGeometry(1400, 56);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0369a1,
    roughness: 0.14,
    metalness: 0.65,
    clearcoat: 1.0,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(0, 0.04, 0);
  scene.add(waterMesh);

  // River seawall embankments & waterfront promenade railings
  const wallGeo = new THREE.BoxGeometry(640, 0.95, 2.2);
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.78,
    metalness: 0.12,
  });
  for (const wz of [-28.9, 28.9]) {
    const seawall = new THREE.Mesh(wallGeo, concreteMat);
    seawall.position.set(0, 0.42, wz);
    scene.add(seawall);
  }

  // 3. Raised Sidewalks & Granite Curbs around Every City Block
  const sidewalkGeo = new THREE.BoxGeometry(54, 0.18, 54);
  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: sidewalkTex,
    roughness: 0.8,
    metalness: 0.1,
  });
  const blockCentersX = [-185, -112.5, -37.5, 37.5, 112.5, 185];
  const blockCentersZ = [-185, -112.5, 112.5, 185];
  const sidewalkInst = new THREE.InstancedMesh(
    sidewalkGeo,
    sidewalkMat,
    blockCentersX.length * blockCentersZ.length
  );
  const swDummy = new THREE.Object3D();
  let swIdx = 0;
  for (const cx of blockCentersX) {
    for (const cz of blockCentersZ) {
      // Scale sidewalk to fit the exact city block between road edges
      const spanX = Math.abs(cx) > 150 ? 50 : 55;
      const spanZ = Math.abs(cz) > 150 ? 50 : 55;
      swDummy.position.set(cx, 0.08, cz);
      swDummy.scale.set(spanX / 54, 1, spanZ / 54);
      swDummy.updateMatrix();
      sidewalkInst.setMatrixAt(swIdx++, swDummy.matrix);
    }
  }
  sidewalkInst.instanceMatrix.needsUpdate = true;
  sidewalkInst.computeBoundingSphere();
  sidewalkInst.receiveShadow = !isSoftwareGl;
  scene.add(sidewalkInst);

  // 4. Dedicated 4-Way Urban Intersections with Zebra Crosswalks & Traffic Signals
  const intersectionNodes = getIntersectionNodes();
  const interGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH);
  interGeo.rotateX(-Math.PI / 2);
  const interMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: intersectionTex,
    bumpMap: roadPbr.bumpMap,
    bumpScale: 0.015,
    roughness: 0.68,
    metalness: 0.15,
  });
  const interInst = new THREE.InstancedMesh(
    interGeo,
    interMat,
    intersectionNodes.length
  );
  intersectionNodes.forEach((node, i) => {
    swDummy.position.set(node.x, 0.032, node.z);
    swDummy.rotation.set(0, 0, 0);
    swDummy.scale.setScalar(1);
    swDummy.updateMatrix();
    interInst.setMatrixAt(i, swDummy.matrix);
  });
  interInst.instanceMatrix.needsUpdate = true;
  interInst.computeBoundingSphere();
  interInst.receiveShadow = !isSoftwareGl;
  scene.add(interInst);

  // Overhead Cantilever Traffic Signal Gantries at Major Intersections (Cycling Red / Yellow / Green)
  const trafficSignals = createTrafficSignalStates();
  const sigPoleGeo = new THREE.CylinderGeometry(0.14, 0.18, 6.2, 8);
  sigPoleGeo.translate(0, 3.1, 0);
  const sigArmGeo = new THREE.BoxGeometry(5.6, 0.16, 0.18);
  sigArmGeo.translate(-2.6, 5.9, 0);
  const sigHousingGeo = new THREE.BoxGeometry(1.1, 0.42, 0.24);
  sigHousingGeo.translate(-3.8, 5.85, 0);
  const sigLensGeo = new THREE.BoxGeometry(0.96, 0.28, 0.3);
  sigLensGeo.translate(-3.8, 5.85, 0);

  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.8,
    roughness: 0.3,
  });
  const signalLensMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });

  const totalSignalGantries = trafficSignals.length * 4;
  const sigPoleInst = new THREE.InstancedMesh(
    sigPoleGeo,
    darkSteelMat,
    totalSignalGantries
  );
  const sigArmInst = new THREE.InstancedMesh(
    sigArmGeo,
    darkSteelMat,
    totalSignalGantries
  );
  const sigHousingInst = new THREE.InstancedMesh(
    sigHousingGeo,
    darkSteelMat,
    totalSignalGantries
  );
  const sigHeadInst = new THREE.InstancedMesh(
    sigLensGeo,
    signalLensMat,
    totalSignalGantries
  );

  const sigColorGreen = new THREE.Color(0x10b981);
  const sigColorYellow = new THREE.Color(0xf59e0b);
  const sigColorRed = new THREE.Color(0xef4444);
  const getPhaseColor = (phase: TrafficSignalPhase) =>
    phase === 'green'
      ? sigColorGreen
      : phase === 'yellow'
      ? sigColorYellow
      : sigColorRed;

  let sigIdx = 0;
  for (let i = 0; i < trafficSignals.length; i++) {
    const node = trafficSignals[i];
    const cornerOffset = ROAD_WIDTH * 0.5 + 0.85;
    const nsCol = getPhaseColor(node.nsPhase);
    const ewCol = getPhaseColor(node.ewPhase);

    // 1. NE corner overhanging N-S (Southbound)
    swDummy.position.set(node.x + cornerOffset, 0, node.z - cornerOffset);
    swDummy.rotation.set(0, 0, 0);
    swDummy.scale.setScalar(1);
    swDummy.updateMatrix();
    sigPoleInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigArmInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHousingInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHeadInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHeadInst.setColorAt(sigIdx, nsCol);
    sigIdx++;

    // 2. SW corner overhanging N-S (Northbound)
    swDummy.position.set(node.x - cornerOffset, 0, node.z + cornerOffset);
    swDummy.rotation.set(0, Math.PI, 0);
    swDummy.updateMatrix();
    sigPoleInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigArmInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHousingInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHeadInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHeadInst.setColorAt(sigIdx, nsCol);
    sigIdx++;

    // 3. NW corner overhanging E-W (Westbound)
    swDummy.position.set(node.x - cornerOffset, 0, node.z - cornerOffset);
    swDummy.rotation.set(0, Math.PI * 0.5, 0);
    swDummy.updateMatrix();
    sigPoleInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigArmInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHousingInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHeadInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHeadInst.setColorAt(sigIdx, ewCol);
    sigIdx++;

    // 4. SE corner overhanging E-W (Eastbound)
    swDummy.position.set(node.x + cornerOffset, 0, node.z + cornerOffset);
    swDummy.rotation.set(0, -Math.PI * 0.5, 0);
    swDummy.updateMatrix();
    sigPoleInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigArmInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHousingInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHeadInst.setMatrixAt(sigIdx, swDummy.matrix);
    sigHeadInst.setColorAt(sigIdx, ewCol);
    sigIdx++;
  }
  sigPoleInst.instanceMatrix.needsUpdate = true;
  sigArmInst.instanceMatrix.needsUpdate = true;
  sigHousingInst.instanceMatrix.needsUpdate = true;
  sigHeadInst.instanceMatrix.needsUpdate = true;
  if (sigHeadInst.instanceColor) sigHeadInst.instanceColor.needsUpdate = true;
  sigPoleInst.computeBoundingSphere();
  sigArmInst.computeBoundingSphere();
  sigHousingInst.computeBoundingSphere();
  sigHeadInst.computeBoundingSphere();
  scene.add(sigPoleInst);
  scene.add(sigArmInst);
  scene.add(sigHousingInst);
  scene.add(sigHeadInst);

  // 5. Segmented North-South & East-West Avenues + Elevated Bridge Decks & Parapet Barriers
  const roadSegments = getRoadSegments();
  const roadSegmentMaterials: THREE.MeshStandardMaterial[] = [];
  const barrierWallMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.65,
    metalness: 0.25,
  });
  const barrierReflectorMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.5,
  });

  for (const seg of roadSegments) {
    const segTex = roadPbr.map.clone();
    segTex.needsUpdate = true;
    segTex.repeat.set(1, Math.max(1, Math.round(seg.length / 18)));

    const segBump = roadPbr.bumpMap.clone();
    segBump.needsUpdate = true;
    segBump.repeat.copy(segTex.repeat);

    const segMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: segTex,
      bumpMap: segBump,
      bumpScale: 0.004,
      roughnessMap: segBump,
      roughness: 0.68,
      metalness: 0.18,
    });
    roadSegmentMaterials.push(segMat);

    if (seg.axis === 'ew') {
      // PlaneGeometry(ROAD_WIDTH, seg.length) rotated by -PI/2 around X and +PI/2 around Y
      // so width (U=1) spans Z (ROAD_WIDTH) and height (V=repeat.y) spans X (seg.length)!
      const ewGeo = new THREE.PlaneGeometry(ROAD_WIDTH, seg.length);
      ewGeo.rotateX(-Math.PI / 2);
      ewGeo.rotateY(Math.PI / 2);
      const ewMesh = new THREE.Mesh(ewGeo, segMat);
      ewMesh.position.set(seg.center, 0.03, seg.fixedCoord);
      ewMesh.receiveShadow = !isSoftwareGl;
      scene.add(ewMesh);
    } else if (!seg.isBridgeSpan) {
      // Flat North-South avenue segment between intersections
      const nsGeo = new THREE.PlaneGeometry(ROAD_WIDTH, seg.length);
      nsGeo.rotateX(-Math.PI / 2);
      const nsMesh = new THREE.Mesh(nsGeo, segMat);
      nsMesh.position.set(seg.fixedCoord, 0.03, seg.center);
      nsMesh.receiveShadow = !isSoftwareGl;
      scene.add(nsMesh);
    } else {
      // Elevated Bridge Span across z in [seg.start, seg.end] (typically -66 to +66)
      const bridgeSubdivs = 48;
      const roadW = seg.fixedCoord === 0 ? ROAD_WIDTH + 2 : ROAD_WIDTH;
      const nsGeo = new THREE.PlaneGeometry(
        roadW,
        seg.length,
        1,
        bridgeSubdivs
      );
      nsGeo.rotateX(-Math.PI / 2);
      const posAttr = nsGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const localZ = posAttr.getZ(i);
        const worldZ = seg.center + localZ;
        const h = groundHeightAt(seg.fixedCoord, worldZ);
        posAttr.setY(i, h + 0.035);
      }
      nsGeo.computeVertexNormals();

      const nsMesh = new THREE.Mesh(nsGeo, segMat);
      nsMesh.position.set(seg.fixedCoord, 0, seg.center);
      nsMesh.receiveShadow = !isSoftwareGl;
      scene.add(nsMesh);

      // Profiled Left & Right Concrete Bridge Parapet Barriers & Amber Guardrails
      for (const side of [-1, 1]) {
        const barrierGeo = new THREE.BoxGeometry(
          0.65,
          0.75,
          seg.length,
          1,
          1,
          bridgeSubdivs
        );
        const bPos = barrierGeo.attributes.position;
        for (let i = 0; i < bPos.count; i++) {
          const localZ = bPos.getZ(i);
          const worldZ = seg.center + localZ;
          const h = groundHeightAt(seg.fixedCoord, worldZ);
          bPos.setY(i, bPos.getY(i) + h + 0.35);
        }
        barrierGeo.computeVertexNormals();
        const barrierMesh = new THREE.Mesh(barrierGeo, barrierWallMat);
        barrierMesh.position.set(
          seg.fixedCoord + side * (roadW * 0.5 + 0.32),
          0,
          seg.center
        );
        scene.add(barrierMesh);

        // Top glowing safety rail along the bridge parapet
        const railGeo = new THREE.BoxGeometry(
          0.22,
          0.1,
          seg.length,
          1,
          1,
          bridgeSubdivs
        );
        const rPos = railGeo.attributes.position;
        for (let i = 0; i < rPos.count; i++) {
          const localZ = rPos.getZ(i);
          const worldZ = seg.center + localZ;
          const h = groundHeightAt(seg.fixedCoord, worldZ);
          rPos.setY(i, rPos.getY(i) + h + 0.76);
        }
        railGeo.computeVertexNormals();
        const railMesh = new THREE.Mesh(railGeo, barrierReflectorMat);
        railMesh.position.set(
          seg.fixedCoord + side * (roadW * 0.5 + 0.32),
          0,
          seg.center
        );
        scene.add(railMesh);
      }
    }
  }

  // 6. Landmark Centerpiece: Twin-Pylon Bayfront Suspension Bridge at (x = 0, z = ±24)
  const bridgeGroup = new THREE.Group();
  const pylonSteelMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.78,
    roughness: 0.28,
  });
  const cableAccentMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.65,
    metalness: 0.6,
    roughness: 0.3,
  });

  for (const pz of [-24, 24]) {
    const pylonH = 44;
    const legGeo = new THREE.BoxGeometry(2.2, pylonH, 2.6);
    for (const side of [-11.5, 11.5]) {
      const leg = new THREE.Mesh(legGeo, pylonSteelMat);
      leg.position.set(side, pylonH * 0.5, pz);
      leg.castShadow = !isSoftwareGl;
      bridgeGroup.add(leg);
    }
    // Crossbeams
    for (const cy of [16, 30, 41]) {
      const beamGeo = new THREE.BoxGeometry(25.2, 2.0, 2.4);
      const beam = new THREE.Mesh(
        beamGeo,
        cy === 41 ? cableAccentMat : pylonSteelMat
      );
      beam.position.set(0, cy, pz);
      bridgeGroup.add(beam);
    }
  }

  // Main suspension cables & vertical suspender rods along both sides of the bridge
  for (const side of [-11.2, 11.2]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side, 4.0, -54),
      new THREE.Vector3(side, 41.0, -24),
      new THREE.Vector3(side, 14.5, 0),
      new THREE.Vector3(side, 41.0, 24),
      new THREE.Vector3(side, 4.0, 54),
    ]);
    const cableGeo = new THREE.TubeGeometry(curve, 36, 0.22, 8, false);
    const cableMesh = new THREE.Mesh(cableGeo, cableAccentMat);
    bridgeGroup.add(cableMesh);

    // Vertical steel suspender cables dropping from main catenary to bridge deck
    for (let sz = -48; sz <= 48; sz += 8) {
      if (Math.abs(Math.abs(sz) - 24) < 3) continue;
      const t = (sz + 54) / 108;
      const pt = curve.getPoint(Math.max(0, Math.min(1, t)));
      const deckY = groundHeightAt(0, sz) + 0.5;
      const rodH = Math.max(1, pt.y - deckY);
      const rodGeo = new THREE.CylinderGeometry(0.05, 0.05, rodH, 6);
      const rod = new THREE.Mesh(rodGeo, pylonSteelMat);
      rod.position.set(side, deckY + rodH * 0.5, sz);
      bridgeGroup.add(rod);
    }
  }
  scene.add(bridgeGroup);

  // 5. Ultra-Realistic Multi-Part City Skyscrapers & Architectural Landmarks
  const buildingLib = createBuildingMaterialLibrary(maxAniso);
  CITY_BUILDINGS.forEach((b, idx) => {
    const bGroup = buildUltraRealisticBuilding(
      b,
      idx,
      buildingLib,
      isSoftwareGl
    );
    scene.add(bGroup);
  });

  // 6. InstancedMesh Streetlamps with Night-Activated Volumetric Cones & Road Light Pools
  const lampLocations: Array<{ x: number; z: number; rotY: number }> = [];
  for (const rx of [-150, -75, 0, 75, 150]) {
    for (let z = -200; z <= 200; z += 40) {
      if (Math.abs(z) < 35) continue;
      lampLocations.push({ x: rx + ROAD_WIDTH * 0.58, z, rotY: Math.PI });
      lampLocations.push({ x: rx - ROAD_WIDTH * 0.58, z, rotY: 0 });
    }
  }

  const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 6.8, 8);
  poleGeo.translate(0, 3.4, 0);
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.75,
    roughness: 0.35,
  });
  const bulbGeo = new THREE.BoxGeometry(1.4, 0.22, 0.45);
  bulbGeo.translate(0.55, 6.75, 0);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xf59e0b,
    emissiveIntensity: 2.4,
  });

  // Downward volumetric light cone from each streetlamp luminaire
  const lampConeGeo = new THREE.ConeGeometry(3.4, 6.6, 12, 1, true);
  lampConeGeo.translate(0.65, 3.35, 0);
  const lampConeMat = new THREE.MeshBasicMaterial({
    color: 0xfde68a,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  // Projected radial amber light pool on the road/sidewalk under each streetlamp
  const poolCanvas = document.createElement('canvas');
  poolCanvas.width = 128;
  poolCanvas.height = 128;
  const pCtx = poolCanvas.getContext('2d')!;
  const pGrad = pCtx.createRadialGradient(64, 64, 4, 64, 64, 60);
  pGrad.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
  pGrad.addColorStop(0.45, 'rgba(245, 158, 11, 0.42)');
  pGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
  pCtx.fillStyle = pGrad;
  pCtx.fillRect(0, 0, 128, 128);
  const lampPoolTex = new THREE.CanvasTexture(poolCanvas);

  const lampPoolGeo = new THREE.PlaneGeometry(11.5, 11.5);
  lampPoolGeo.rotateX(-Math.PI / 2);
  lampPoolGeo.translate(1.2, 0.045, 0);
  const lampPoolMat = new THREE.MeshBasicMaterial({
    map: lampPoolTex,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const poleInstanced = new THREE.InstancedMesh(
    poleGeo,
    poleMat,
    lampLocations.length
  );
  const bulbInstanced = new THREE.InstancedMesh(
    bulbGeo,
    bulbMat,
    lampLocations.length
  );
  const lampConeInstanced = new THREE.InstancedMesh(
    lampConeGeo,
    lampConeMat,
    lampLocations.length
  );
  const lampPoolInstanced = new THREE.InstancedMesh(
    lampPoolGeo,
    lampPoolMat,
    lampLocations.length
  );

  const dummy = new THREE.Object3D();
  lampLocations.forEach((loc, idx) => {
    const gy = groundHeightAt(loc.x, loc.z);
    dummy.position.set(loc.x, gy, loc.z);
    dummy.rotation.set(0, loc.rotY, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    poleInstanced.setMatrixAt(idx, dummy.matrix);
    bulbInstanced.setMatrixAt(idx, dummy.matrix);
    lampConeInstanced.setMatrixAt(idx, dummy.matrix);
    lampPoolInstanced.setMatrixAt(idx, dummy.matrix);
  });
  poleInstanced.instanceMatrix.needsUpdate = true;
  bulbInstanced.instanceMatrix.needsUpdate = true;
  lampConeInstanced.instanceMatrix.needsUpdate = true;
  lampPoolInstanced.instanceMatrix.needsUpdate = true;
  poleInstanced.computeBoundingSphere();
  bulbInstanced.computeBoundingSphere();
  lampConeInstanced.computeBoundingSphere();
  lampPoolInstanced.computeBoundingSphere();
  scene.add(poleInstanced);
  scene.add(bulbInstanced);
  scene.add(lampConeInstanced);
  scene.add(lampPoolInstanced);

  // Instanced Urban Trees along plazas & waterfront
  const treeLocations: Array<{ x: number; z: number; scale: number }> = [];
  for (let x = -210; x <= 210; x += 28) {
    if (ROAD_COORDS.some((rc) => Math.abs(x - rc) < 14)) continue;
    treeLocations.push({ x, z: -34, scale: 0.85 + (Math.abs(x) % 5) * 0.08 });
    treeLocations.push({ x, z: 34, scale: 0.85 + (Math.abs(x) % 4) * 0.09 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 7);
  trunkGeo.translate(0, 1.2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x451a03,
    roughness: 0.9,
  });
  const crownFoliageGeo = new THREE.ConeGeometry(1.9, 4.6, 8);
  crownFoliageGeo.translate(0, 4.1, 0);
  const crownFoliageMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.78,
  });

  const trunkInst = new THREE.InstancedMesh(
    trunkGeo,
    trunkMat,
    treeLocations.length
  );
  const foliageInst = new THREE.InstancedMesh(
    crownFoliageGeo,
    crownFoliageMat,
    treeLocations.length
  );
  const tintColor = new THREE.Color();
  treeLocations.forEach((t, i) => {
    dummy.position.set(t.x, 0, t.z);
    dummy.rotation.set(0, i * 1.1, 0);
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    foliageInst.setMatrixAt(i, dummy.matrix);
    tintColor.setHSL(0.36 + (i % 4) * 0.015, 0.65, 0.26 + (i % 3) * 0.04);
    foliageInst.setColorAt(i, tintColor);
  });
  trunkInst.instanceMatrix.needsUpdate = true;
  foliageInst.instanceMatrix.needsUpdate = true;
  if (foliageInst.instanceColor) foliageInst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  foliageInst.computeBoundingSphere();
  scene.add(trunkInst);
  scene.add(foliageInst);

  // 7. Composite Stunt Ramps with Chevron Surface & Side Guardrails
  const rampCanvas = document.createElement('canvas');
  rampCanvas.width = 128;
  rampCanvas.height = 128;
  const rCtx = rampCanvas.getContext('2d')!;
  rCtx.fillStyle = '#1e293b';
  rCtx.fillRect(0, 0, 128, 128);
  rCtx.fillStyle = '#f59e0b';
  for (let y = 0; y < 128; y += 32) {
    rCtx.fillRect(8, y, 112, 10);
  }
  const rampTex = new THREE.CanvasTexture(rampCanvas);
  rampTex.colorSpace = THREE.SRGBColorSpace;
  rampTex.wrapS = THREE.RepeatWrapping;
  rampTex.wrapT = THREE.RepeatWrapping;

  const rampMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: rampTex,
    roughness: 0.48,
    metalness: 0.35,
  });
  for (const r of STUNT_RAMPS) {
    const rGroup = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-r.length * 0.5, 0);
    shape.lineTo(r.length * 0.5, 0);
    shape.lineTo(r.length * 0.5, r.maxHeight);
    shape.closePath();

    const rGeo = new THREE.ExtrudeGeometry(shape, {
      depth: r.width,
      bevelEnabled: false,
    });
    rGeo.center();
    const rMesh = new THREE.Mesh(rGeo, rampMat);
    rGroup.add(rMesh);

    // Side safety rails
    const railGeo = new THREE.BoxGeometry(r.length, 0.22, 0.16);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, cableAccentMat);
      rail.position.set(0, r.maxHeight * 0.15, s * (r.width * 0.5 + 0.08));
      rail.rotation.z = Math.atan2(r.maxHeight, r.length);
      rGroup.add(rail);
    }

    rGroup.position.set(r.x, r.maxHeight * 0.5, r.z);
    if (r.direction === 'north') {
      rGroup.rotation.y = Math.PI / 2;
    } else if (r.direction === 'south') {
      rGroup.rotation.y = -Math.PI / 2;
    }
    scene.add(rGroup);
  }

  // 8. Speed Trap Gantries
  const trapMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 1.5,
  });
  for (const trap of SPEED_TRAPS) {
    const gy = groundHeightAt(trap.x, trap.z);
    const gGroup = new THREE.Group();
    gGroup.position.set(trap.x, gy, trap.z);

    const archGeo = new THREE.BoxGeometry(ROAD_WIDTH + 1.5, 0.45, 0.45);
    const archTop = new THREE.Mesh(archGeo, trapMat);
    archTop.position.y = 6.2;
    gGroup.add(archTop);

    const postGeo = new THREE.BoxGeometry(0.45, 6.2, 0.45);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, pylonSteelMat);
      post.position.set(s * (ROAD_WIDTH * 0.5 + 0.5), 3.1, 0);
      gGroup.add(post);
    }
    scene.add(gGroup);
  }

  // 9. Collectible Apex Beacons
  const beaconMeshes = new Map<string, THREE.Group>();
  const ringGeo = new THREE.TorusGeometry(2.2, 0.22, 12, 28);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  for (const b of APEX_BEACONS) {
    const bGroup = new THREE.Group();
    const gy = groundHeightAt(b.x, b.z);
    bGroup.position.set(b.x, gy + 2.5, b.z);
    const ring = new THREE.Mesh(ringGeo, beaconMat);
    bGroup.add(ring);
    scene.add(bGroup);
    beaconMeshes.set(b.id, bGroup);
  }

  // 10. Active Event Checkpoint Ring Indicator
  const checkpointRingGroup = new THREE.Group();
  const cpGeo = new THREE.TorusGeometry(6.5, 0.38, 12, 36);
  const cpMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 2.2,
  });
  const cpMesh = new THREE.Mesh(cpGeo, cpMat);
  cpMesh.position.y = 3.2;
  checkpointRingGroup.add(cpMesh);
  checkpointRingGroup.visible = false;
  scene.add(checkpointRingGroup);

  // 11. Path-Following AI Traffic System (24 Multi-Part NPC Vehicles across 6 Closed-Loop Routes)
  const trafficFleet = createInitialTrafficFleet();
  const npcMeshes: BuiltNpcVehicleMesh[] = [];

  for (let i = 0; i < trafficFleet.length; i++) {
    const state = trafficFleet[i];
    const built = buildTrafficVehicleMesh(state, lampPoolTex, isSoftwareGl);
    built.root.position.set(state.x, state.y, state.z);
    built.root.rotation.set(state.pitch, state.heading, 0, 'YXZ');
    scene.add(built.root);
    npcMeshes.push(built);
  }

  // 12. Global Weather Manager 3D Systems: Falling Rain Streaks & Wet Road Puddle Splash Rings
  const maxRainStreaks = WEATHER_PROFILES.heavy_storm.rainStreakCount;
  const rainPositions = new Float32Array(maxRainStreaks * 6);
  const rainSeedsX = new Float32Array(maxRainStreaks);
  const rainSeedsY = new Float32Array(maxRainStreaks);
  const rainSeedsZ = new Float32Array(maxRainStreaks);

  for (let i = 0; i < maxRainStreaks; i++) {
    rainSeedsX[i] = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 90 - 45;
    rainSeedsY[i] = Math.abs((Math.cos(i * 78.233) * 23421.631) % 1) * 38;
    rainSeedsZ[i] = ((Math.sin(i * 39.346) * 19283.471) % 1) * 90 - 45;
  }

  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(rainPositions, 3)
  );
  rainGeo.setDrawRange(0, 0);

  const rainMat = new THREE.LineBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  rainLines.visible = false;
  scene.add(rainLines);

  // Expanding Raindrop Splash Rings on Wet Roads around the Player
  const maxSplashRings = WEATHER_PROFILES.heavy_storm.splashActiveCount;
  const splashGeo = new THREE.RingGeometry(0.12, 0.25, 12);
  splashGeo.rotateX(-Math.PI / 2);
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const splashInst = new THREE.InstancedMesh(
    splashGeo,
    splashMat,
    maxSplashRings
  );
  splashInst.frustumCulled = false;
  splashInst.visible = false;
  splashInst.count = 0;
  scene.add(splashInst);

  let lastSkyRedrawHours = -999;
  let lastSkyWeather: WeatherCondition = 'clear';
  let lastTimeHours = 20.5;
  let currentNightFactor = 1.0;
  let currentHeadlightsActive = true;
  let lightningFlash = 0;

  const weatherManager = new GlobalWeatherManager('clear', (profile) => {
    // 1. Update all road, intersection, and sidewalk PBR materials for wet surface gloss
    const wetTintHex =
      profile.surfaceWetness > 0.7
        ? 0xcbd5e1
        : profile.surfaceWetness > 0.2
        ? 0xe2e8f0
        : 0xffffff;
    for (let i = 0; i < roadSegmentMaterials.length; i++) {
      const m = roadSegmentMaterials[i];
      m.roughness = profile.roadRoughness;
      m.metalness = profile.roadMetalness;
      m.color.setHex(wetTintHex);
    }
    interMat.roughness = profile.roadRoughness;
    interMat.metalness = profile.roadMetalness;
    interMat.color.setHex(wetTintHex);

    sidewalkMat.roughness = Math.max(0.28, 0.8 - profile.surfaceWetness * 0.48);
    sidewalkMat.metalness = 0.1 + profile.surfaceWetness * 0.35;
    groundMat.roughness = Math.max(0.32, 0.92 - profile.surfaceWetness * 0.52);

    // 2. Configure 3D Rain Streak and Road Splash Ring counts
    if (profile.rainStreakCount > 0) {
      rainLines.visible = true;
      rainGeo.setDrawRange(0, profile.rainStreakCount * 2);
      rainMat.opacity = profile.condition === 'heavy_storm' ? 0.76 : 0.52;
      splashInst.visible = true;
      splashInst.count = profile.splashActiveCount;
    } else {
      rainLines.visible = false;
      rainGeo.setDrawRange(0, 0);
      splashInst.visible = false;
      splashInst.count = 0;
    }

    // 3. Re-apply atmosphere immediately so overcast sky, fog density, and rain headlights update
    applyDayNightCycle(lastTimeHours);
  });

  const applyDayNightCycle = (timeHours: number): DayNightAtmosphere => {
    lastTimeHours = timeHours;
    const rawAtm = computeDayNightAtmosphere(timeHours);
    const wProfile = weatherManager.getProfile();
    const darkF = wProfile.skyDarkenFactor;

    // Blend sky & fog colors toward storm-slate overcast during Light Rain & Heavy Storm
    const skyZenithHex =
      darkF > 0
        ? lerpHexColor(rawAtm.skyZenithHex, '#0b1322', darkF)
        : rawAtm.skyZenithHex;
    const skyMidHex =
      darkF > 0
        ? lerpHexColor(rawAtm.skyMidHex, '#131f33', darkF)
        : rawAtm.skyMidHex;
    const skyHorizonHex =
      darkF > 0
        ? lerpHexColor(rawAtm.skyHorizonHex, '#1e293b', darkF)
        : rawAtm.skyHorizonHex;
    const fogHex =
      lightningFlash > 0.15
        ? lerpHexColor(skyHorizonHex, '#e0f2fe', lightningFlash * 0.55)
        : darkF > 0
        ? lerpHexColor(rawAtm.fogHex, '#111a2b', darkF)
        : rawAtm.fogHex;

    // Effective illumination factor: rain/storm overcast triggers streetlamps & headlights
    const effectiveNightFactor = Math.max(
      rawAtm.nightFactor,
      wProfile.forceLightsActive ? 0.55 + darkF * 0.35 : 0
    );
    const lightsActive =
      rawAtm.headlightsActive || wProfile.forceLightsActive;
    const streetLightsOn =
      rawAtm.streetLightsActive || wProfile.forceLightsActive;
    const windowsOn =
      rawAtm.windowLightsActive || wProfile.forceLightsActive;

    currentNightFactor = effectiveNightFactor;
    currentHeadlightsActive = lightsActive;

    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.density = wProfile.fogDensity;
    }

    // 1. Redraw Sky Dome Canvas when time or weather changes
    if (
      Math.abs(timeHours - lastSkyRedrawHours) > 0.015 ||
      lastSkyWeather !== wProfile.condition
    ) {
      lastSkyRedrawHours = timeHours;
      lastSkyWeather = wProfile.condition;
      const skyGrad = sCtx.createLinearGradient(0, 0, 0, 256);
      skyGrad.addColorStop(0, skyZenithHex);
      skyGrad.addColorStop(0.42, skyMidHex);
      skyGrad.addColorStop(0.54, skyHorizonHex);
      skyGrad.addColorStop(0.64, rawAtm.skyGroundHex);
      skyGrad.addColorStop(1, rawAtm.skyGroundHex);
      sCtx.fillStyle = skyGrad;
      sCtx.fillRect(0, 0, 64, 256);
      skyTex.needsUpdate = true;
    }

    // 2. Position Celestial Sun & Moon (obscured by heavy storm clouds)
    sunMesh.position.set(
      rawAtm.sunPosition.x,
      rawAtm.sunPosition.y,
      rawAtm.sunPosition.z
    );
    sunMesh.visible =
      rawAtm.sunElevation > -0.12 && wProfile.condition === 'clear';
    sunMat.color.set(
      rawAtm.twilightFactor > 0.25 ? '#fb923c' : '#fef08a'
    );

    moonMesh.position.set(
      rawAtm.moonPosition.x,
      rawAtm.moonPosition.y,
      rawAtm.moonPosition.z
    );
    moonMesh.visible =
      rawAtm.sunElevation < 0.15 && wProfile.condition !== 'heavy_storm';

    // 3. Water & Ground Day/Night + Storm Tint
    waterMat.color.set(
      lerpHexColor('#0284c7', '#072a47', effectiveNightFactor)
    );
    waterMat.roughness =
      wProfile.condition === 'heavy_storm'
        ? 0.28
        : wProfile.condition === 'light_rain'
        ? 0.2
        : 0.14;
    groundMat.color.set(
      lerpHexColor('#1e293b', '#090d16', effectiveNightFactor)
    );

    // 4. Street Lights Activation at Night or Rain/Storm Overcast
    bulbMat.emissiveIntensity = streetLightsOn
      ? 2.8 * effectiveNightFactor
      : 0.0;
    bulbMat.color.setHex(streetLightsOn ? 0xfef3c7 : 0x64748b);
    lampConeInstanced.visible = streetLightsOn;
    lampConeMat.opacity = 0.055 * effectiveNightFactor;
    lampPoolInstanced.visible = streetLightsOn;
    lampPoolMat.opacity =
      (0.55 + wProfile.surfaceWetness * 0.28) * effectiveNightFactor;

    // Bridge & Road Safety Reflectors glow brighter at night and reflect off wet asphalt
    cableAccentMat.emissiveIntensity = 0.12 + 0.85 * effectiveNightFactor;
    barrierReflectorMat.emissiveIntensity = 0.15 + 1.65 * effectiveNightFactor;

    // 5. Building Window & Atrium Lobby Lights Activation
    updateBuildingNightLighting(
      buildingLib,
      windowsOn ? effectiveNightFactor : 0
    );

    // 6. AI Traffic Headlights & Road Beams Activation
    for (let i = 0; i < npcMeshes.length; i++) {
      const m = npcMeshes[i];
      m.headlightMat.emissiveIntensity = lightsActive
        ? 2.8 * effectiveNightFactor
        : 0.12;
      m.beamPoolMesh.visible = lightsActive;
      const beamMat = m.beamPoolMesh.material as THREE.MeshBasicMaterial;
      beamMat.opacity = lightsActive
        ? (0.44 + wProfile.surfaceWetness * 0.22) * effectiveNightFactor
        : 0;
      if (m.roofSignMat) {
        m.roofSignMat.emissiveIntensity = lightsActive
          ? 2.4 * effectiveNightFactor
          : 0.35;
      }
    }

    return {
      ...rawAtm,
      fogHex,
      dirLightIntensity:
        rawAtm.dirLightIntensity * (1 - darkF * 0.55) + lightningFlash * 2.6,
      hemiIntensity:
        rawAtm.hemiIntensity * (1 - darkF * 0.35) + lightningFlash * 1.1,
      headlightsActive: lightsActive,
      streetLightsActive: streetLightsOn,
      windowLightsActive: windowsOn,
      nightFactor: effectiveNightFactor,
    };
  };

  // Initialize atmosphere at Golden Dusk / Evening
  applyDayNightCycle(20.5);

  const updateWorldAnimations = (
    elapsedSec: number,
    dt: number,
    playerX = 0,
    playerZ = 120,
    playerVx = 0,
    playerVz = 0
  ) => {
    // Rotate collectible beacons
    beaconMeshes.forEach((grp) => {
      if (grp.visible) {
        grp.rotation.y = elapsedSec * 1.8;
        grp.position.y =
          groundHeightAt(grp.position.x, grp.position.z) +
          2.4 +
          Math.sin(elapsedSec * 3) * 0.25;
      }
    });

    if (checkpointRingGroup.visible) {
      checkpointRingGroup.rotation.y = elapsedSec * 1.5;
    }

    // Update 3D Rain Streaks, Wet Road Puddle Splashes & Storm Lightning
    const wProfile = weatherManager.getProfile();
    if (wProfile.rainStreakCount > 0) {
      const count = wProfile.rainStreakCount;
      const fallSpeed = wProfile.rainFallSpeed;
      const windX = wProfile.windDriftX;
      const streakLenY = wProfile.condition === 'heavy_storm' ? 2.6 : 1.75;
      const streakDx = (windX / fallSpeed) * streakLenY;

      for (let i = 0; i < count; i++) {
        const idx6 = i * 6;
        // Deterministic falling y in [0, 36] wrapping continuously
        const yTop =
          36 - (((rainSeedsY[i] + elapsedSec * fallSpeed) % 36 + 36) % 36);
        const xOff =
          ((rainSeedsX[i] + elapsedSec * windX) % 45);
        const zOff = rainSeedsZ[i];

        const wx = playerX + xOff;
        const wz = playerZ + zOff;

        rainPositions[idx6] = wx;
        rainPositions[idx6 + 1] = yTop;
        rainPositions[idx6 + 2] = wz;

        rainPositions[idx6 + 3] = wx + streakDx;
        rainPositions[idx6 + 4] = Math.max(0.05, yTop - streakLenY);
        rainPositions[idx6 + 5] = wz - 0.15;
      }
      rainGeo.attributes.position.needsUpdate = true;

      // Animate expanding raindrop splash rings on the road surface around the player
      const splashCount = wProfile.splashActiveCount;
      for (let s = 0; s < splashCount; s++) {
        const phase = (elapsedSec * 3.4 + s * 0.37) % 1;
        const sx = playerX + rainSeedsX[s * 5] * 0.65;
        const sz = playerZ + rainSeedsZ[s * 5] * 0.65;
        const gy = groundHeightAt(sx, sz) + 0.055;
        dummy.position.set(sx, gy, sz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.35 + phase * 1.65);
        dummy.updateMatrix();
        splashInst.setMatrixAt(s, dummy.matrix);
      }
      splashInst.instanceMatrix.needsUpdate = true;

      // Periodic storm lightning flashes in Heavy Storm mode
      if (wProfile.condition === 'heavy_storm') {
        const cycle = elapsedSec % 7.5;
        if (
          (cycle > 6.8 && cycle < 6.92) ||
          (cycle > 7.02 && cycle < 7.18)
        ) {
          lightningFlash = 0.85;
        } else {
          lightningFlash = Math.max(0, lightningFlash - dt * 5.5);
        }
      } else {
        lightningFlash = 0;
      }
    } else {
      lightningFlash = 0;
    }

    // Advance AI Traffic System & Intersection Traffic Signals along predefined closed-loop urban routes
    stepTrafficSystem(
      trafficFleet,
      playerX,
      playerZ,
      dt,
      playerVx,
      playerVz,
      trafficSignals
    );

    // Sync 3D overhead traffic signal lens colors with cycling Red / Yellow / Green phases
    for (let s = 0; s < trafficSignals.length; s++) {
      const sig = trafficSignals[s];
      const baseIdx = s * 4;
      const nsCol = getPhaseColor(sig.nsPhase);
      const ewCol = getPhaseColor(sig.ewPhase);
      sigHeadInst.setColorAt(baseIdx, nsCol);
      sigHeadInst.setColorAt(baseIdx + 1, nsCol);
      sigHeadInst.setColorAt(baseIdx + 2, ewCol);
      sigHeadInst.setColorAt(baseIdx + 3, ewCol);
    }
    if (sigHeadInst.instanceColor) {
      sigHeadInst.instanceColor.needsUpdate = true;
    }

    const blinkerOn = Math.sin(elapsedSec * 14) > 0;
    for (let i = 0; i < trafficFleet.length; i++) {
      const v = trafficFleet[i];
      const m = npcMeshes[i];
      m.root.position.set(v.x, v.y, v.z);
      m.root.rotation.set(v.pitch, v.heading, 0, 'YXZ');
      m.bodyTiltGroup.rotation.set(v.dynamicPitch, 0, v.dynamicRoll);

      m.frontSteerGroups[0].rotation.y = v.steerAngle;
      m.frontSteerGroups[1].rotation.y = v.steerAngle;

      for (let w = 0; w < m.wheelMeshes.length; w++) {
        m.wheelMeshes[w].rotation.x = v.wheelRotation;
      }

      // Dynamic brake light flare when slowing for intersections, traffic signals, or player
      m.taillightMat.emissiveIntensity = v.isBraking
        ? 4.2
        : currentHeadlightsActive
        ? 1.6 * currentNightFactor
        : 0.35;

      // Blinking amber turn signals when approaching a 90° intersection turn or changing lanes
      m.turnLeftMat.emissiveIntensity =
        v.turnSignal === 1 && blinkerOn ? 3.2 : 0.0;
      m.turnRightMat.emissiveIntensity =
        v.turnSignal === -1 && blinkerOn ? 3.2 : 0.0;
    }
  };

  return {
    beaconMeshes,
    checkpointRingGroup,
    trafficFleet,
    trafficSignals,
    weatherManager,
    setWeather: (condition: WeatherCondition) =>
      weatherManager.setWeather(condition),
    toggleWeather: () => weatherManager.toggleWeather(),
    getWeather: () => weatherManager.getCondition(),
    updateWorldAnimations,
    applyDayNightCycle,
  };
}
