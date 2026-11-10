import * as THREE from 'three';
import {
  getAutomotiveBodyPanelTexture,
  getBrakeRotorTexture,
  getCarPaintFlakeBump,
  getRadiatorGrilleTexture,
  getTireTextures,
} from './vehicleBuilder';
import { getIntersectionNodes, groundHeightAt } from './worldData';

export type TrafficVehicleArchetype =
  | 'executive_sedan'
  | 'metro_taxi'
  | 'cyber_suv'
  | 'cargo_van'
  | 'transit_shuttle';

export type TrafficSignalPhase = 'green' | 'yellow' | 'red';

export interface IntersectionSignalState {
  id: string;
  x: number;
  z: number;
  cycleOffsetSec: number;
  clockSec: number;
  nsPhase: TrafficSignalPhase;
  ewPhase: TrafficSignalPhase;
  phaseRemainingSec: number;
}

export interface RouteNode {
  x: number;
  z: number;
}

export interface TrafficRouteSpec {
  id: string;
  name: string;
  laneOffset: number; // +4.2m right-hand lane offset from road centerline
  waypoints: RouteNode[]; // Closed loop of centerline intersection coordinates
}

export interface ComputedSegment {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  length: number;
  heading: number;
  turnDirNext: -1 | 0 | 1; // -1 right turn, +1 left turn, 0 straight at end of segment
}

export interface ComputedTrafficRoute {
  id: string;
  name: string;
  segments: ComputedSegment[];
  totalLength: number;
}

export type TrafficDriverProfile = 'commuter' | 'cautious' | 'aggressive';

export type TrafficEvasionState =
  | 'none'
  | 'braking'
  | 'evading_left'
  | 'evading_right'
  | 'aggressive_surge'
  | 'stopped_at_light';

export interface NpcTrafficVehicleState {
  id: string;
  archetype: TrafficVehicleArchetype;
  driverProfile: TrafficDriverProfile;
  routeId: string;
  distanceAlongRoute: number;
  baseLaneOffset: number; // Default lateral offset relative to route lane (0m)
  currentLaneOffset: number; // Current lateral offset in meters (-2.6m left .. +2.4m right)
  targetLaneOffset: number; // Target lateral offset during lane change / evasion
  evasionState: TrafficEvasionState;
  evasionCooldown: number; // Remaining seconds to hold evasive / overtaking lane
  stoppedAtSignalId: string | null; // ID of intersection signal currently holding this vehicle
  cruiseSpeed: number; // m/s
  currentSpeed: number; // m/s
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  dynamicPitch: number;
  dynamicRoll: number;
  steerAngle: number;
  wheelRotation: number;
  isBraking: boolean;
  turnSignal: -1 | 0 | 1;
  halfWidth: number;
  halfLength: number;
  paintHex: number;
}

export interface BuiltNpcVehicleMesh {
  root: THREE.Group;
  bodyTiltGroup: THREE.Group;
  frontSteerGroups: [THREE.Group, THREE.Group];
  wheelMeshes: THREE.Object3D[];
  headlightMat: THREE.MeshStandardMaterial;
  taillightMat: THREE.MeshStandardMaterial;
  turnLeftMat: THREE.MeshStandardMaterial;
  turnRightMat: THREE.MeshStandardMaterial;
  beamPoolMesh: THREE.Mesh;
  roofSignMat?: THREE.MeshStandardMaterial;
}

/**
 * Predefined closed-loop urban traffic routes around the Metropolis road grid.
 * All node coordinates lie on valid road centerlines (`[-220, -150, -75, 0, 75, 150, 220]`),
 * and river crossings (`z: -75 <-> 75`) occur only on bridged avenues (`x = 0, ±150, ±220`).
 */
export const TRAFFIC_ROUTES: TrafficRouteSpec[] = [
  {
    id: 'route_central_bridge_cw',
    name: 'Central Bridge & East Financial Loop',
    laneOffset: 4.2,
    waypoints: [
      { x: 0, z: 150 },
      { x: 0, z: -150 }, // North across Central Suspension Bridge into Downtown
      { x: 150, z: -150 }, // East through Tech Quarter
      { x: 150, z: 150 }, // South across East River Crossing into Harbor Docks
    ],
  },
  {
    id: 'route_central_bridge_ccw',
    name: 'Westside Civic & Central Bridge Loop',
    laneOffset: 4.2,
    waypoints: [
      { x: 0, z: 75 },
      { x: -150, z: 75 }, // West through South Civic Plaza
      { x: -150, z: -75 }, // North across West River Crossing
      { x: 0, z: -75 }, // East toward Central Boulevard
    ],
  },
  {
    id: 'route_downtown_core',
    name: 'Downtown Financial & Tech Quarter Circuit',
    laneOffset: 4.2,
    waypoints: [
      { x: -75, z: -75 },
      { x: -75, z: -150 },
      { x: 75, z: -150 },
      { x: 75, z: -75 },
    ],
  },
  {
    id: 'route_harbor_south',
    name: 'Harbor Docks & South Boulevard Loop',
    laneOffset: 4.2,
    waypoints: [
      { x: -75, z: 75 },
      { x: 75, z: 75 },
      { x: 75, z: 150 },
      { x: -75, z: 150 },
    ],
  },
  {
    id: 'route_grand_inner_ring',
    name: 'Grand Metropolis Inner Ring',
    laneOffset: 4.2,
    waypoints: [
      { x: -150, z: 150 },
      { x: -150, z: -150 },
      { x: 150, z: -150 },
      { x: 150, z: 150 },
    ],
  },
  {
    id: 'route_outer_expressway',
    name: 'Outer Perimeter Expressway',
    laneOffset: 4.2,
    waypoints: [
      { x: -220, z: 220 },
      { x: 220, z: 220 },
      { x: 220, z: -220 },
      { x: -220, z: -220 },
    ],
  },
];

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function lerpAngle(a: number, b: number, t: number): number {
  const diff = wrapAngle(b - a);
  return wrapAngle(a + diff * t);
}

/**
 * Converts a centerline waypoint loop into right-hand offset lane segments
 * with precomputed headings, segment lengths, and upcoming turn directions.
 */
export function buildComputedRoute(
  spec: TrafficRouteSpec
): ComputedTrafficRoute {
  const pts = spec.waypoints;
  const n = pts.length;

  // Compute unit direction and right-hand normal for each segment
  const rawDirs: Array<{ dx: number; dz: number; rx: number; rz: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len = Math.hypot(vx, vz) || 1;
    const dx = vx / len;
    const dz = vz / len;
    // In Three.js (X right, Z south): right-hand vector of forward (dx, dz) is (-dz, dx)
    rawDirs.push({ dx, dz, rx: -dz, rz: dx });
  }

  // Offset each corner vertex by combining the incoming and outgoing right-hand normals
  const offsetCorners: RouteNode[] = [];
  for (let i = 0; i < n; i++) {
    const prevDir = rawDirs[(i - 1 + n) % n];
    const curDir = rawDirs[i];
    const ox = (prevDir.rx + curDir.rx) * spec.laneOffset;
    const oz = (prevDir.rz + curDir.rz) * spec.laneOffset;
    offsetCorners.push({
      x: pts[i].x + ox,
      z: pts[i].z + oz,
    });
  }

  const segments: ComputedSegment[] = [];
  let totalLength = 0;

  for (let i = 0; i < n; i++) {
    const start = offsetCorners[i];
    const end = offsetCorners[(i + 1) % n];
    const vx = end.x - start.x;
    const vz = end.z - start.z;
    const length = Math.hypot(vx, vz) || 1;
    const heading = Math.atan2(vx, vz);

    const nextStart = offsetCorners[(i + 1) % n];
    const nextEnd = offsetCorners[(i + 2) % n];
    const nextHeading = Math.atan2(
      nextEnd.x - nextStart.x,
      nextEnd.z - nextStart.z
    );
    const deltaH = wrapAngle(nextHeading - heading);
    const turnDirNext: -1 | 0 | 1 =
      Math.abs(deltaH) < 0.2 ? 0 : deltaH > 0 ? 1 : -1;

    segments.push({
      startX: start.x,
      startZ: start.z,
      endX: end.x,
      endZ: end.z,
      length,
      heading,
      turnDirNext,
    });
    totalLength += length;
  }

  return {
    id: spec.id,
    name: spec.name,
    segments,
    totalLength,
  };
}

export const COMPUTED_TRAFFIC_ROUTES: Map<string, ComputedTrafficRoute> =
  new Map(TRAFFIC_ROUTES.map((r) => [r.id, buildComputedRoute(r)]));

/**
 * Evaluates a point, smoothed cornering heading, pitch, and turn-signal state
 * at any distance `dist` along a `ComputedTrafficRoute`.
 */
export function sampleRouteAtDistance(
  route: ComputedTrafficRoute,
  rawDist: number
): {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  turnSignal: -1 | 0 | 1;
  nearIntersection: boolean;
} {
  let d = ((rawDist % route.totalLength) + route.totalLength) % route.totalLength;
  const segs = route.segments;

  let segIdx = 0;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i].length || i === segs.length - 1) {
      segIdx = i;
      break;
    }
    d -= segs[i].length;
  }

  const seg = segs[segIdx];
  const nextSeg = segs[(segIdx + 1) % segs.length];
  const prevSeg = segs[(segIdx - 1 + segs.length) % segs.length];

  const t = Math.max(0, Math.min(1, d / seg.length));
  let x = seg.startX + (seg.endX - seg.startX) * t;
  let z = seg.startZ + (seg.endZ - seg.startZ) * t;

  // Smooth corner rounding within 7m of segment corners so vehicles carve natural intersection arcs
  const cornerBlendDist = 7.0;
  const distToEnd = seg.length - d;
  const distFromStart = d;

  let heading = seg.heading;
  if (distToEnd < cornerBlendDist) {
    const blend = 0.5 * (1 - distToEnd / cornerBlendDist);
    heading = lerpAngle(seg.heading, nextSeg.heading, blend);
    // Nudge position slightly inward along corner bisector for smooth arc
    const nextDirX = Math.sin(nextSeg.heading);
    const nextDirZ = Math.cos(nextSeg.heading);
    const arcPush = (1 - distToEnd / cornerBlendDist) * 1.4;
    x += nextDirX * arcPush;
    z += nextDirZ * arcPush;
  } else if (distFromStart < cornerBlendDist) {
    const blend = 0.5 * (1 - distFromStart / cornerBlendDist);
    heading = lerpAngle(seg.heading, prevSeg.heading, blend);
  }

  const y = groundHeightAt(x, z);
  const aheadX = x + Math.sin(heading) * 2.2;
  const aheadZ = z + Math.cos(heading) * 2.2;
  const yAhead = groundHeightAt(aheadX, aheadZ);
  const pitch = Math.atan2(y - yAhead, 2.2);

  const nearIntersection = distToEnd < 18 && seg.turnDirNext !== 0;
  const turnSignal: -1 | 0 | 1 = nearIntersection ? seg.turnDirNext : 0;

  return { x, y, z, heading, pitch, turnSignal, nearIntersection };
}

/**
 * Spawns the initial fleet of 24 diverse AI-controlled NPC vehicles distributed
 * across all 6 metropolitan routes, including occasional `'aggressive'` driver profiles.
 */
export function createInitialTrafficFleet(): NpcTrafficVehicleState[] {
  const archetypes: TrafficVehicleArchetype[] = [
    'executive_sedan',
    'metro_taxi',
    'cyber_suv',
    'cargo_van',
    'transit_shuttle',
  ];
  const sedanColors = [
    0x38bdf8, 0xe2e8f0, 0xf43f5e, 0xa855f7, 0x10b981, 0x60a5fa, 0xf97316,
  ];
  const aggressiveColors = [0xf43f5e, 0xa855f7, 0xf97316];

  const fleet: NpcTrafficVehicleState[] = [];
  let vehicleIdx = 0;

  TRAFFIC_ROUTES.forEach((routeSpec, rIdx) => {
    const compRoute = COMPUTED_TRAFFIC_ROUTES.get(routeSpec.id)!;
    const carsPerRoute = 4;

    for (let c = 0; c < carsPerRoute; c++) {
      vehicleIdx++;
      // Occasional aggressive drivers (~25% of the fleet: every 4th vehicle)
      const isAggressiveSlot = vehicleIdx % 4 === 0;
      const driverProfile: TrafficDriverProfile = isAggressiveSlot
        ? 'aggressive'
        : vehicleIdx % 4 === 2
        ? 'cautious'
        : 'commuter';

      const archetype: TrafficVehicleArchetype = isAggressiveSlot
        ? vehicleIdx % 8 === 0
          ? 'cyber_suv'
          : 'executive_sedan'
        : archetypes[vehicleIdx % archetypes.length];

      const frac = c / carsPerRoute;
      const routeOffset = rIdx === 0 ? 58 : rIdx * 37;
      const dist =
        (frac * compRoute.totalLength + routeOffset) % compRoute.totalLength;
      const sample = sampleRouteAtDistance(compRoute, dist);

      const rawBaseSpeed =
        archetype === 'transit_shuttle'
          ? 14.5
          : archetype === 'cargo_van'
          ? 16.5
          : archetype === 'metro_taxi'
          ? 20.5
          : 19.0 + (vehicleIdx % 4) * 1.4;

      const profileSpeedMult =
        driverProfile === 'aggressive'
          ? 1.26
          : driverProfile === 'cautious'
          ? 0.92
          : 1.0;
      const baseSpeed = rawBaseSpeed * profileSpeedMult;

      const dims =
        archetype === 'transit_shuttle'
          ? { hw: 1.25, hl: 3.8 }
          : archetype === 'cargo_van'
          ? { hw: 1.1, hl: 2.6 }
          : { hw: 0.98, hl: 2.2 };

      const paintHex =
        driverProfile === 'aggressive'
          ? aggressiveColors[(vehicleIdx / 4) % aggressiveColors.length | 0]
          : archetype === 'metro_taxi'
          ? 0xf59e0b
          : archetype === 'cargo_van'
          ? 0xf8fafc
          : archetype === 'transit_shuttle'
          ? 0x0284c7
          : sedanColors[vehicleIdx % sedanColors.length];

      fleet.push({
        id: `npc_${vehicleIdx}`,
        archetype,
        driverProfile,
        routeId: routeSpec.id,
        distanceAlongRoute: dist,
        baseLaneOffset: 0,
        currentLaneOffset: 0,
        targetLaneOffset: 0,
        evasionState: 'none',
        evasionCooldown: 0,
        stoppedAtSignalId: null,
        cruiseSpeed: baseSpeed,
        currentSpeed: baseSpeed,
        x: sample.x,
        y: sample.y,
        z: sample.z,
        heading: sample.heading,
        pitch: sample.pitch,
        dynamicPitch: 0,
        dynamicRoll: 0,
        steerAngle: 0,
        wheelRotation: 0,
        isBraking: false,
        turnSignal: sample.turnSignal,
        halfWidth: dims.hw,
        halfLength: dims.hl,
        paintHex,
      });
    }
  });

  return fleet;
}

export const SIGNAL_CYCLE_DURATION_SEC = 24.0;

/**
 * Evaluates the N-S and E-W traffic signal phases ('green' | 'yellow' | 'red')
 * and remaining phase duration for a given cycle clock time in seconds.
 */
export function evaluateSignalPhaseAtTime(clockSec: number): {
  nsPhase: TrafficSignalPhase;
  ewPhase: TrafficSignalPhase;
  phaseRemainingSec: number;
} {
  const t =
    ((clockSec % SIGNAL_CYCLE_DURATION_SEC) + SIGNAL_CYCLE_DURATION_SEC) %
    SIGNAL_CYCLE_DURATION_SEC;

  if (t < 9.5) {
    return {
      nsPhase: 'green',
      ewPhase: 'red',
      phaseRemainingSec: 9.5 - t,
    };
  }
  if (t < 12.0) {
    return {
      nsPhase: 'yellow',
      ewPhase: 'red',
      phaseRemainingSec: 12.0 - t,
    };
  }
  if (t < 21.5) {
    return {
      nsPhase: 'red',
      ewPhase: 'green',
      phaseRemainingSec: 21.5 - t,
    };
  }
  return {
    nsPhase: 'red',
    ewPhase: 'yellow',
    phaseRemainingSec: SIGNAL_CYCLE_DURATION_SEC - t,
  };
}

/**
 * Creates the initial set of 20 functional intersection traffic signals across
 * all major 4-way urban intersections (`|x| <= 150, |z| <= 150, z != 0`).
 */
export function createTrafficSignalStates(): IntersectionSignalState[] {
  const signalNodes = getIntersectionNodes().filter((n) => n.hasTrafficSignal);
  return signalNodes.map((node) => {
    // Stagger cycle offsets across avenues so green, yellow, and red phases are active simultaneously
    const cycleOffsetSec =
      node.x === 0 || node.x === 150
        ? node.z === 75
          ? 1.0
          : 2.2
        : node.x === -75 || node.x === 75
        ? 13.0
        : 9.8;

    const evalState = evaluateSignalPhaseAtTime(cycleOffsetSec);
    return {
      id: `sig_${node.x}_${node.z}`,
      x: node.x,
      z: node.z,
      cycleOffsetSec,
      clockSec: cycleOffsetSec,
      nsPhase: evalState.nsPhase,
      ewPhase: evalState.ewPhase,
      phaseRemainingSec: evalState.phaseRemainingSec,
    };
  });
}

/**
 * Advances all intersection traffic signals by `dt` seconds, cycling through
 * green, yellow, and red states along both N-S and E-W axes.
 */
export function stepTrafficSignals(
  signals: IntersectionSignalState[],
  dt: number
): void {
  const safeDt = Math.max(0, dt);
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    s.clockSec = (s.clockSec + safeDt) % SIGNAL_CYCLE_DURATION_SEC;
    const next = evaluateSignalPhaseAtTime(s.clockSec);
    s.nsPhase = next.nsPhase;
    s.ewPhase = next.ewPhase;
    s.phaseRemainingSec = next.phaseRemainingSec;
  }
}

export const DEFAULT_TRAFFIC_SIGNALS: IntersectionSignalState[] =
  createTrafficSignalStates();

function chooseEvasiveLaneOffset(
  signedLateralThreat: number,
  currentOffset: number
): number {
  // Shift into the adjacent lane away from the approaching player's lateral offset
  if (Math.abs(signedLateralThreat) > 0.25) {
    return signedLateralThreat > 0 ? -2.35 : 2.25;
  }
  return currentOffset <= 0 ? 2.25 : -2.35;
}

/**
 * Steps all AI NPC vehicles along their predefined routes with:
 * - Functional traffic signals at major intersections (cycling green -> yellow -> red, forcing NPCs to stop and wait)
 * - High-speed player approach detection (evasive lane changes, emergency braking, or aggressive surges)
 * - Automatic braking/following distance and aggressive overtaking when approaching other NPCs
 * - Intersection cornering deceleration and turn-signal activation
 * - Terrain/Bridge elevation & pitch alignment
 * - Dynamic suspension pitch/roll and front-wheel steering articulation
 */
export function stepTrafficSystem(
  fleet: NpcTrafficVehicleState[],
  playerX: number,
  playerZ: number,
  dt: number,
  playerVx = 0,
  playerVz = 0,
  signals: IntersectionSignalState[] = DEFAULT_TRAFFIC_SIGNALS
): void {
  const safeDt = Math.max(0.001, dt);
  stepTrafficSignals(signals, safeDt);

  const playerSpeedMs = Math.hypot(playerVx, playerVz);
  const playerSpeedKmh = playerSpeedMs * 3.6;

  for (let i = 0; i < fleet.length; i++) {
    const v = fleet[i];
    const route = COMPUTED_TRAFFIC_ROUTES.get(v.routeId);
    if (!route) continue;

    // Ensure lane-change & signal fields exist even if state was partially constructed
    if (v.driverProfile === undefined) v.driverProfile = 'commuter';
    if (v.baseLaneOffset === undefined) v.baseLaneOffset = 0;
    if (v.currentLaneOffset === undefined) v.currentLaneOffset = 0;
    if (v.targetLaneOffset === undefined) v.targetLaneOffset = 0;
    if (v.evasionState === undefined) v.evasionState = 'none';
    if (v.evasionCooldown === undefined) v.evasionCooldown = 0;
    if (v.stoppedAtSignalId === undefined) v.stoppedAtSignalId = null;

    if (v.evasionCooldown > 0) {
      v.evasionCooldown = Math.max(0, v.evasionCooldown - safeDt);
      if (v.evasionCooldown <= 0) {
        v.targetLaneOffset = v.baseLaneOffset;
        v.evasionState = 'none';
      }
    }

    const preSample = sampleRouteAtDistance(route, v.distanceAlongRoute);
    let targetSpeed = preSample.nearIntersection
      ? v.cruiseSpeed * (v.driverProfile === 'aggressive' ? 0.84 : 0.72)
      : v.cruiseSpeed;
    let shouldBrake = preSample.nearIntersection;
    let activelyEvadingPlayer = false;

    const fwdX = Math.sin(v.heading);
    const fwdZ = Math.cos(v.heading);
    // Right-hand unit vector in Three.js (X right, Z south)
    const rightX = -fwdZ;
    const rightZ = fwdX;

    // 1. Evaluate player relative position and closing speed in NPC local frame
    const dxPlayer = playerX - v.x;
    const dzPlayer = playerZ - v.z;
    const forwardDistPlayer = dxPlayer * fwdX + dzPlayer * fwdZ;
    const signedLateralPlayer = dxPlayer * rightX + dzPlayer * rightZ;
    const lateralDistPlayer = Math.abs(signedLateralPlayer);
    const playerVelAlongNpc = playerVx * fwdX + playerVz * fwdZ;
    const rearClosingSpeed = playerVelAlongNpc - v.currentSpeed;
    const headOnClosingSpeed = v.currentSpeed - playerVelAlongNpc;

    // 1A. Player ahead in forward corridor
    if (
      forwardDistPlayer > 0 &&
      forwardDistPlayer < 28 &&
      lateralDistPlayer < 4.2
    ) {
      const highSpeedThreatAhead =
        playerSpeedKmh >= 60 || headOnClosingSpeed > 18;

      if (v.driverProfile === 'aggressive' && forwardDistPlayer > 9.5) {
        // Aggressive driver changes lanes to overtake/dodge and surges throttle
        const nextOffset = chooseEvasiveLaneOffset(
          signedLateralPlayer,
          v.currentLaneOffset
        );
        v.targetLaneOffset = nextOffset;
        v.evasionState = 'aggressive_surge';
        v.evasionCooldown = 2.6;
        targetSpeed = v.cruiseSpeed * 1.22;
        activelyEvadingPlayer = true;
      } else if (highSpeedThreatAhead) {
        // High-speed player ahead or cutting in: commuter/cautious NPC brakes & changes lanes evasively
        const nextOffset = chooseEvasiveLaneOffset(
          signedLateralPlayer,
          v.currentLaneOffset
        );
        v.targetLaneOffset = nextOffset;
        v.evasionState =
          nextOffset < v.currentLaneOffset ? 'evading_left' : 'evading_right';
        v.evasionCooldown = 2.8;
        targetSpeed = forwardDistPlayer < 12 ? 0 : v.cruiseSpeed * 0.32;
        shouldBrake = true;
        activelyEvadingPlayer = true;
      } else if (forwardDistPlayer < 19 && lateralDistPlayer < 3.6) {
        // Stationary or slow player directly ahead: brake safely
        targetSpeed = forwardDistPlayer < 9.5 ? 0 : v.cruiseSpeed * 0.3;
        shouldBrake = true;
        v.evasionState = 'braking';
        activelyEvadingPlayer = true;
      }
    }

    // 1B. Player approaching at high speed from behind in rear radar cone
    if (
      forwardDistPlayer <= 0 &&
      forwardDistPlayer > -38 &&
      lateralDistPlayer < 4.6 &&
      (playerSpeedKmh >= 60 || rearClosingSpeed > 10)
    ) {
      const nextOffset = chooseEvasiveLaneOffset(
        signedLateralPlayer,
        v.currentLaneOffset
      );
      v.targetLaneOffset = nextOffset;
      v.evasionCooldown = 2.8;
      activelyEvadingPlayer = true;

      if (v.driverProfile === 'aggressive') {
        // Aggressive driver weaves and surges throttle when challenged from behind
        v.evasionState = 'aggressive_surge';
        targetSpeed = Math.max(targetSpeed, v.cruiseSpeed * 1.25);
        shouldBrake = false;
      } else {
        // Commuter / Cautious driver yields lane and taps brakes so high-speed player can pass
        v.evasionState =
          nextOffset < v.currentLaneOffset ? 'evading_left' : 'evading_right';
        targetSpeed = Math.min(targetSpeed, v.cruiseSpeed * 0.52);
        shouldBrake = true;
      }
    }

    // 1C. Evaluate functional intersection traffic signals ahead (Red / Yellow stop enforcement)
    let holdingAtRedOrYellow = false;
    if (!activelyEvadingPlayer && signals.length > 0) {
      const isNorthSouth = Math.abs(fwdZ) >= Math.abs(fwdX);
      const stopLineOffset = 11.5; // Stop line 11.5m before intersection center

      for (let s = 0; s < signals.length; s++) {
        const sig = signals[s];
        const dxSig = sig.x - v.x;
        const dzSig = sig.z - v.z;
        const fwdDistCenter = dxSig * fwdX + dzSig * fwdZ;
        const latDistCenter = Math.abs(dxSig * rightX + dzSig * rightZ);
        const distToStopLine = fwdDistCenter - stopLineOffset;

        if (
          latDistCenter < 7.8 &&
          distToStopLine >= -1.8 &&
          distToStopLine < 28.0
        ) {
          const activePhase = isNorthSouth ? sig.nsPhase : sig.ewPhase;
          if (
            activePhase === 'red' ||
            (activePhase === 'yellow' && distToStopLine > 2.5)
          ) {
            holdingAtRedOrYellow = true;
            v.stoppedAtSignalId = sig.id;
            v.evasionState = 'stopped_at_light';
            shouldBrake = true;

            if (distToStopLine <= 2.4) {
              targetSpeed = 0;
              v.currentSpeed = 0;
            } else {
              const decelRatio = Math.max(
                0,
                Math.min(1, (distToStopLine - 2.0) / 22.0)
              );
              const phaseMult = activePhase === 'red' ? 0.5 : 0.62;
              targetSpeed = Math.min(
                targetSpeed,
                v.cruiseSpeed * decelRatio * phaseMult
              );
            }
          }
          break;
        }
      }
    }

    if (!holdingAtRedOrYellow) {
      v.stoppedAtSignalId = null;
      if (v.evasionState === 'stopped_at_light') {
        v.evasionState = 'none';
      }
    }

    // 2. Check distance to other NPC vehicles ahead in forward cone
    for (let j = 0; j < fleet.length; j++) {
      if (i === j) continue;
      const other = fleet[j];
      const dx = other.x - v.x;
      const dz = other.z - v.z;
      const fwdDist = dx * fwdX + dz * fwdZ;
      const latDist = Math.abs(dx * rightX + dz * rightZ);
      if (fwdDist > 0 && fwdDist < 16.5 && latDist < 2.6) {
        if (
          v.driverProfile === 'aggressive' &&
          fwdDist > 8.0 &&
          v.evasionCooldown <= 0 &&
          !holdingAtRedOrYellow &&
          other.evasionState !== 'stopped_at_light'
        ) {
          // Aggressive NPC initiates a lane change to overtake slower moving traffic
          v.targetLaneOffset = v.currentLaneOffset <= 0 ? 2.25 : -2.35;
          v.evasionState = 'aggressive_surge';
          v.evasionCooldown = 2.4;
          targetSpeed = Math.max(targetSpeed, v.cruiseSpeed * 1.18);
        } else {
          targetSpeed = Math.min(
            targetSpeed,
            fwdDist < 8.5 ? 0 : other.currentSpeed * 0.85
          );
          if (fwdDist < 7.5 && other.currentSpeed < 0.5) {
            v.currentSpeed = 0;
          }
          shouldBrake = true;
        }
      }
    }

    // Smoothly accelerate or brake toward targetSpeed
    const prevSpeed = v.currentSpeed;
    const accelRate =
      targetSpeed < v.currentSpeed
        ? 19.5
        : v.driverProfile === 'aggressive'
        ? 11.2
        : 7.5;
    v.currentSpeed +=
      Math.sign(targetSpeed - v.currentSpeed) *
      Math.min(Math.abs(targetSpeed - v.currentSpeed), accelRate * safeDt);
    if (holdingAtRedOrYellow && targetSpeed === 0) {
      v.currentSpeed = 0;
    } else {
      v.currentSpeed = Math.max(0, v.currentSpeed);
    }
    const longAccel = (v.currentSpeed - prevSpeed) / safeDt;

    // Smoothly interpolate lateral lane offset during evasive or overtaking maneuvers
    const laneDiff = v.targetLaneOffset - v.currentLaneOffset;
    const laneChangeRate = v.driverProfile === 'aggressive' ? 4.8 : 3.4;
    const laneStep =
      Math.sign(laneDiff) *
      Math.min(Math.abs(laneDiff), laneChangeRate * safeDt);
    v.currentLaneOffset += laneStep;
    const lateralSpeed = laneStep / safeDt;

    const prevHeading = v.heading;
    v.distanceAlongRoute =
      (v.distanceAlongRoute + v.currentSpeed * safeDt) % route.totalLength;

    const postSample = sampleRouteAtDistance(route, v.distanceAlongRoute);
    const postRightX = -Math.cos(postSample.heading);
    const postRightZ = Math.sin(postSample.heading);

    v.x = postSample.x + postRightX * v.currentLaneOffset;
    v.z = postSample.z + postRightZ * v.currentLaneOffset;
    v.y = groundHeightAt(v.x, v.z);

    // Add subtle yaw deflection while actively changing lanes
    const laneYawOffset =
      Math.atan2(-lateralSpeed, Math.max(4.5, v.currentSpeed)) * 0.65;
    v.heading = wrapAngle(postSample.heading + laneYawOffset);
    v.pitch = postSample.pitch;
    v.turnSignal =
      laneDiff < -0.2
        ? 1
        : laneDiff > 0.2
        ? -1
        : postSample.turnSignal;
    v.isBraking =
      shouldBrake ||
      holdingAtRedOrYellow ||
      v.currentSpeed < v.cruiseSpeed * 0.65;
    v.wheelRotation =
      (v.wheelRotation + (v.currentSpeed * safeDt) / 0.36) % (Math.PI * 2);

    // Compute yaw rate for front wheel steering & cornering body roll
    const yawRate = wrapAngle(v.heading - prevHeading) / safeDt;
    const damp = 1 - Math.exp(-10 * safeDt);
    const targetSteer = Math.max(-0.48, Math.min(0.48, yawRate * 0.28));
    v.steerAngle += (targetSteer - v.steerAngle) * damp;

    const targetDynPitch = Math.max(-0.045, Math.min(0.045, -longAccel * 0.0022));
    const targetDynRoll = Math.max(
      -0.06,
      Math.min(0.06, yawRate * v.currentSpeed * 0.0022)
    );
    v.dynamicPitch += (targetDynPitch - v.dynamicPitch) * damp;
    v.dynamicRoll += (targetDynRoll - v.dynamicRoll) * damp;
  }
}

/**
 * Resolves dynamic collision between the player vehicle and any AI traffic vehicle.
 * Returns the ID and impact speed (km/h) if a collision occurred.
 */
export function resolvePlayerTrafficCollision(
  player: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vz: number;
  },
  fleet: NpcTrafficVehicleState[]
): { collidedNpcId: string | null; impactSpeedKmh: number } {
  const playerRadius = 1.65;

  for (let i = 0; i < fleet.length; i++) {
    const npc = fleet[i];
    if (Math.abs(player.y - npc.y) > 2.2) continue;

    // Transform player position into NPC local frame
    const dx = player.x - npc.x;
    const dz = player.z - npc.z;
    const sinH = Math.sin(npc.heading);
    const cosH = Math.cos(npc.heading);

    // Local X (right) and Local Z (forward)
    const localX = dx * cosH - dz * sinH;
    const localZ = dx * sinH + dz * cosH;

    const clampedX = Math.max(-npc.halfWidth, Math.min(npc.halfWidth, localX));
    const clampedZ = Math.max(-npc.halfLength, Math.min(npc.halfLength, localZ));

    const diffLocalX = localX - clampedX;
    const diffLocalZ = localZ - clampedZ;
    const distSq = diffLocalX * diffLocalX + diffLocalZ * diffLocalZ;

    if (distSq < playerRadius * playerRadius) {
      let nLocalX = 0;
      let nLocalZ = 0;
      let overlap = 0;

      if (distSq > 1e-5) {
        const dist = Math.sqrt(distSq);
        overlap = playerRadius - dist;
        nLocalX = diffLocalX / dist;
        nLocalZ = diffLocalZ / dist;
      } else {
        // Player center is inside the NPC bounding box -> push out along nearest face
        const penX = npc.halfWidth - Math.abs(localX);
        const penZ = npc.halfLength - Math.abs(localZ);
        if (penX < penZ) {
          nLocalX = localX >= 0 ? 1 : -1;
          overlap = penX + playerRadius;
        } else {
          nLocalZ = localZ >= 0 ? 1 : -1;
          overlap = penZ + playerRadius;
        }
      }

      // Rotate normal back to world space
      const nx = nLocalX * cosH + nLocalZ * sinH;
      const nz = -nLocalX * sinH + nLocalZ * cosH;

      player.x += nx * overlap;
      player.z += nz * overlap;

      const npcVx = sinH * npc.currentSpeed;
      const npcVz = cosH * npc.currentSpeed;
      const relVx = player.vx - npcVx;
      const relVz = player.vz - npcVz;
      const vn = relVx * nx + relVz * nz;

      if (vn < 0) {
        const impactKmh = Math.abs(vn) * 3.6;
        player.vx -= (1 + 0.45) * vn * nx;
        player.vz -= (1 + 0.45) * vn * nz;
        player.vx *= 0.84;
        player.vz *= 0.84;
        npc.currentSpeed *= 0.35;
        npc.isBraking = true;
        return { collidedNpcId: npc.id, impactSpeedKmh: impactKmh };
      }
    }
  }

  return { collidedNpcId: null, impactSpeedKmh: 0 };
}

let cachedTaxiCheckerTex: THREE.CanvasTexture | null = null;
function getTaxiCheckerTexture(): THREE.CanvasTexture {
  if (cachedTaxiCheckerTex) return cachedTaxiCheckerTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 0, 256, 64);

  // Classic two-row black & white taxi checkerboard band
  const sq = 16;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 16; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#0f172a' : '#f8fafc';
      ctx.fillRect(c * sq, 16 + r * sq, sq, sq);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  cachedTaxiCheckerTex = tex;
  return tex;
}

let cachedCargoVanTex: THREE.CanvasTexture | null = null;
function getCargoLogisticsTexture(): THREE.CanvasTexture {
  if (cachedCargoVanTex) return cachedCargoVanTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 128);

  // Subtle corrugated cargo panel ribs
  ctx.fillStyle = '#e2e8f0';
  for (let y = 12; y < 116; y += 14) {
    ctx.fillRect(0, y, 256, 4);
  }

  // Bold crimson & slate logistics branding stripe
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(16, 46, 224, 24);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(16, 74, 180, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedCargoVanTex = tex;
  return tex;
}

let cachedShuttleWindowTex: THREE.CanvasTexture | null = null;
function getShuttleWindowTexture(): THREE.CanvasTexture {
  if (cachedShuttleWindowTex) return cachedShuttleWindowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, 512, 128);

  // Panoramic passenger windows with warm interior lighting & pillar mullions
  for (let x = 18; x < 490; x += 68) {
    const grad = ctx.createLinearGradient(0, 14, 0, 114);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(0.35, '#38bdf8');
    grad.addColorStop(0.75, '#fef3c7');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 14, 54, 100);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedShuttleWindowTex = tex;
  return tex;
}

/**
 * Builds an ultra-realistic multi-part 3D mesh (`BuiltNpcVehicleMesh`) for an AI traffic vehicle
 * based on its archetype (`executive_sedan`, `metro_taxi`, `cyber_suv`, `cargo_van`, `transit_shuttle`).
 * Uses beveled `ExtrudeGeometry` silhouettes, PBR clearcoat materials, procedural grilles/decals,
 * side wing mirrors, wheel arch flares, 5-spoke alloy rims, cross-drilled brake rotors, and treaded tires.
 */
export function buildTrafficVehicleMesh(
  state: NpcTrafficVehicleState,
  poolTex: THREE.Texture,
  isSoftwareGl: boolean
): BuiltNpcVehicleMesh {
  const root = new THREE.Group();
  const bodyTiltGroup = new THREE.Group();
  root.add(bodyTiltGroup);

  const w = state.halfWidth * 2;
  const l = state.halfLength * 2;
  const halfL = l * 0.5;
  const flakeBump = getCarPaintFlakeBump();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: state.paintHex,
    map: getAutomotiveBodyPanelTexture(),
    bumpMap: flakeBump,
    bumpScale: 0.0022,
    metalness: state.archetype === 'cargo_van' ? 0.32 : 0.78,
    roughness: state.archetype === 'cargo_van' ? 0.34 : 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });

  const cabinGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1322,
    metalness: 0.25,
    roughness: 0.08,
    clearcoat: 1.0,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.5,
    roughness: 0.45,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.92,
    roughness: 0.15,
  });

  const grilleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: getRadiatorGrilleTexture(),
    metalness: 0.6,
    roughness: 0.48,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef9c3,
    emissiveIntensity: 2.8,
  });

  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 1.8,
  });

  const turnLeftMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.0,
  });

  const turnRightMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.0,
  });

  // 1. Archetype-Specific Sculpted Beveled `ExtrudeGeometry` Body Hull & Greenhouse
  let roofSignMat: THREE.MeshStandardMaterial | undefined;

  if (
    state.archetype === 'executive_sedan' ||
    state.archetype === 'metro_taxi'
  ) {
    // Sleek 3-Box Aerodynamic Fastback Sedan Profile
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-halfL, 0.06);
    hullShape.lineTo(halfL, 0.04);
    hullShape.lineTo(halfL * 0.96, 0.42);
    hullShape.lineTo(halfL * 0.42, 0.56);
    hullShape.lineTo(-halfL * 0.68, 0.6);
    hullShape.lineTo(-halfL * 0.96, 0.54);
    hullShape.lineTo(-halfL, 0.36);
    hullShape.closePath();

    const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
      depth: w * 0.86,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.06,
      bevelSegments: 2,
    });
    hullGeo.rotateY(-Math.PI / 2);
    hullGeo.center();
    const hullMesh = new THREE.Mesh(hullGeo, bodyMat);
    hullMesh.position.set(0, 0.56, 0);
    hullMesh.castShadow = !isSoftwareGl;
    hullMesh.receiveShadow = !isSoftwareGl;
    bodyTiltGroup.add(hullMesh);

    // Sculpted Sedan Greenhouse
    const cabShape = new THREE.Shape();
    const cabL = l * 0.54;
    const cabH = 0.52;
    cabShape.moveTo(-cabL * 0.5, 0);
    cabShape.lineTo(cabL * 0.48, 0);
    cabShape.lineTo(cabL * 0.18, cabH);
    cabShape.lineTo(-cabL * 0.28, cabH);
    cabShape.closePath();

    const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
      depth: w * 0.74,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 2,
    });
    cabGeo.rotateY(-Math.PI / 2);
    cabGeo.center();
    const cabMesh = new THREE.Mesh(cabGeo, cabinGlassMat);
    cabMesh.position.set(0, 1.06, -0.14);
    bodyTiltGroup.add(cabMesh);

    const roofTopGeo = new THREE.BoxGeometry(w * 0.7, 0.05, cabL * 0.48);
    const roofTop = new THREE.Mesh(roofTopGeo, bodyMat);
    roofTop.position.set(0, 1.33, -0.18);
    bodyTiltGroup.add(roofTop);

    // Metro Taxi Checkerboard Side Trim & Illuminated Rooftop TAXI Beacon
    if (state.archetype === 'metro_taxi') {
      const checkerMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: getTaxiCheckerTexture(),
        roughness: 0.3,
      });
      const stripGeo = new THREE.BoxGeometry(w * 0.99, 0.14, l * 0.62);
      const strip = new THREE.Mesh(stripGeo, checkerMat);
      strip.position.set(0, 0.62, -0.05);
      bodyTiltGroup.add(strip);

      roofSignMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: 2.5,
      });
      const signBaseGeo = new THREE.BoxGeometry(0.76, 0.04, 0.3);
      const signBase = new THREE.Mesh(signBaseGeo, trimMat);
      signBase.position.set(0, 1.37, -0.14);
      bodyTiltGroup.add(signBase);

      const signGeo = new THREE.BoxGeometry(0.66, 0.2, 0.24);
      const signMesh = new THREE.Mesh(signGeo, roofSignMat);
      signMesh.position.set(0, 1.48, -0.14);
      bodyTiltGroup.add(signMesh);
    } else {
      // Executive Sedan Chrome Window Sill & Shark-Fin Roof Antenna
      const finGeo = new THREE.BoxGeometry(0.05, 0.11, 0.18);
      const fin = new THREE.Mesh(finGeo, bodyMat);
      fin.position.set(0, 1.38, -0.62);
      bodyTiltGroup.add(fin);
    }
  } else if (state.archetype === 'cyber_suv') {
    // Muscular Faceted Luxury SUV Profile
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-halfL, 0.1);
    hullShape.lineTo(halfL, 0.08);
    hullShape.lineTo(halfL * 0.95, 0.62);
    hullShape.lineTo(halfL * 0.38, 0.72);
    hullShape.lineTo(-halfL * 0.92, 0.76);
    hullShape.lineTo(-halfL, 0.45);
    hullShape.closePath();

    const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
      depth: w * 0.88,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.06,
      bevelSegments: 2,
    });
    hullGeo.rotateY(-Math.PI / 2);
    hullGeo.center();
    const hullMesh = new THREE.Mesh(hullGeo, bodyMat);
    hullMesh.position.set(0, 0.64, 0);
    hullMesh.castShadow = !isSoftwareGl;
    hullMesh.receiveShadow = !isSoftwareGl;
    bodyTiltGroup.add(hullMesh);

    const cabShape = new THREE.Shape();
    const cabL = l * 0.66;
    const cabH = 0.56;
    cabShape.moveTo(-cabL * 0.5, 0);
    cabShape.lineTo(cabL * 0.48, 0);
    cabShape.lineTo(cabL * 0.22, cabH);
    cabShape.lineTo(-cabL * 0.44, cabH);
    cabShape.closePath();

    const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
      depth: w * 0.78,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 2,
    });
    cabGeo.rotateY(-Math.PI / 2);
    cabGeo.center();
    const cabMesh = new THREE.Mesh(cabGeo, cabinGlassMat);
    cabMesh.position.set(0, 1.24, -0.18);
    bodyTiltGroup.add(cabMesh);

    // Twin Satin Roof Rails
    const railGeo = new THREE.BoxGeometry(0.06, 0.07, cabL * 0.68);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, chromeMat);
      rail.position.set(side * (w * 0.32), 1.56, -0.22);
      bodyTiltGroup.add(rail);
    }
  } else if (state.archetype === 'cargo_van') {
    // Aerodynamic High-Roof European Sprinter / Logistics Van Profile
    const vanShape = new THREE.Shape();
    vanShape.moveTo(-halfL, 0.08);
    vanShape.lineTo(halfL, 0.08);
    vanShape.lineTo(halfL * 0.96, 0.68);
    vanShape.lineTo(halfL * 0.52, 1.58);
    vanShape.lineTo(-halfL * 0.96, 1.62);
    vanShape.lineTo(-halfL, 1.48);
    vanShape.closePath();

    const vanGeo = new THREE.ExtrudeGeometry(vanShape, {
      depth: w * 0.9,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 2,
    });
    vanGeo.rotateY(-Math.PI / 2);
    vanGeo.center();
    const vanMesh = new THREE.Mesh(vanGeo, bodyMat);
    vanMesh.position.set(0, 1.06, 0);
    vanMesh.castShadow = !isSoftwareGl;
    vanMesh.receiveShadow = !isSoftwareGl;
    bodyTiltGroup.add(vanMesh);

    // Sloped Cab Windshield
    const wsGeo = new THREE.BoxGeometry(w * 0.88, 0.62, 0.85);
    const wsMesh = new THREE.Mesh(wsGeo, cabinGlassMat);
    wsMesh.position.set(0, 1.32, halfL * 0.56);
    wsMesh.rotation.x = -0.35;
    bodyTiltGroup.add(wsMesh);

    // Corrugated Logistics Panel & Branding Decal
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: getCargoLogisticsTexture(),
      roughness: 0.38,
      metalness: 0.25,
    });
    const panelGeo = new THREE.BoxGeometry(w * 0.98, 1.05, l * 0.62);
    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    panelMesh.position.set(0, 1.24, -l * 0.12);
    bodyTiltGroup.add(panelMesh);
  } else {
    // Modern Aerodynamic Metropolitan Electric Transit Shuttle Bus
    const busShape = new THREE.Shape();
    busShape.moveTo(-halfL, 0.08);
    busShape.lineTo(halfL, 0.08);
    busShape.lineTo(halfL * 0.98, 0.92);
    busShape.lineTo(halfL * 0.88, 1.92);
    busShape.lineTo(-halfL * 0.94, 1.92);
    busShape.lineTo(-halfL, 1.65);
    busShape.closePath();

    const busGeo = new THREE.ExtrudeGeometry(busShape, {
      depth: w * 0.92,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.06,
      bevelSegments: 2,
    });
    busGeo.rotateY(-Math.PI / 2);
    busGeo.center();
    const busMesh = new THREE.Mesh(busGeo, bodyMat);
    busMesh.position.set(0, 1.18, 0);
    busMesh.castShadow = !isSoftwareGl;
    busMesh.receiveShadow = !isSoftwareGl;
    bodyTiltGroup.add(busMesh);

    // Illuminated Panoramic Passenger Window Band
    const shuttleWinMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: getShuttleWindowTexture(),
      emissive: 0x38bdf8,
      emissiveMap: getShuttleWindowTexture(),
      emissiveIntensity: 0.55,
      roughness: 0.14,
      metalness: 0.5,
    });
    const winBandGeo = new THREE.BoxGeometry(w * 0.99, 0.76, l * 0.84);
    const winBand = new THREE.Mesh(winBandGeo, shuttleWinMat);
    winBand.position.set(0, 1.48, -0.08);
    bodyTiltGroup.add(winBand);

    // Front Panoramic Driver Windshield & Glowing Amber Route Destination Matrix
    const frontWsGeo = new THREE.BoxGeometry(w * 0.88, 0.85, 0.16);
    const frontWs = new THREE.Mesh(frontWsGeo, cabinGlassMat);
    frontWs.position.set(0, 1.38, halfL - 0.08);
    frontWs.rotation.x = -0.14;
    bodyTiltGroup.add(frontWs);

    const destMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.2,
    });
    const destGeo = new THREE.BoxGeometry(w * 0.68, 0.18, 0.08);
    const destSign = new THREE.Mesh(destGeo, destMat);
    destSign.position.set(0, 1.92, halfL - 0.12);
    bodyTiltGroup.add(destSign);

    // Rooftop Battery & HVAC Pods
    const roofPodGeo = new THREE.BoxGeometry(w * 0.64, 0.22, l * 0.52);
    const roofPod = new THREE.Mesh(roofPodGeo, trimMat);
    roofPod.position.set(0, 2.24, -0.2);
    bodyTiltGroup.add(roofPod);
  }

  // 2. Front Honeycomb Radiator Grille, Bumpers, Wheel Arch Flares & Side Wing Mirrors
  const bumperGeo = new THREE.BoxGeometry(w * 0.98, 0.22, 0.2);
  const frontBumper = new THREE.Mesh(bumperGeo, trimMat);
  frontBumper.position.set(0, 0.36, halfL - 0.02);
  const rearBumper = new THREE.Mesh(bumperGeo, trimMat);
  rearBumper.position.set(0, 0.36, -halfL + 0.02);
  bodyTiltGroup.add(frontBumper, rearBumper);

  const grilleGeo = new THREE.BoxGeometry(w * 0.56, 0.24, 0.08);
  const grilleMesh = new THREE.Mesh(grilleGeo, grilleMat);
  grilleMesh.position.set(0, 0.56, halfL + 0.01);
  bodyTiltGroup.add(grilleMesh);

  // Side Wing Mirrors
  const mirrorGeo = new THREE.BoxGeometry(0.2, 0.1, 0.14);
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(mirrorGeo, bodyMat);
    mirror.position.set(
      side * (w * 0.52),
      state.archetype === 'transit_shuttle' ? 1.45 : 0.96,
      halfL * 0.38
    );
    bodyTiltGroup.add(mirror);
  }

  // 3. Multi-Element LED Headlights, Full-Width Taillight Bar & Blinking Turn Signals
  const frontFaceZ = halfL + 0.075;
  const rearFaceZ = -halfL - 0.075;
  const hlGeo = new THREE.BoxGeometry(0.36, 0.12, 0.09);
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(side * (w * 0.34), 0.64, frontFaceZ);
    bodyTiltGroup.add(hl);

    // Front & Rear Amber Turn Signal Indicators
    const sigGeo = new THREE.BoxGeometry(0.15, 0.1, 0.09);
    const sigMat = side === 1 ? turnLeftMat : turnRightMat;
    const frontSig = new THREE.Mesh(sigGeo, sigMat);
    frontSig.position.set(side * (w * 0.45), 0.64, frontFaceZ);
    const rearSig = new THREE.Mesh(sigGeo, sigMat);
    rearSig.position.set(side * (w * 0.45), 0.68, rearFaceZ);
    bodyTiltGroup.add(frontSig, rearSig);
  }

  const tlGeo = new THREE.BoxGeometry(w * 0.78, 0.13, 0.09);
  const tl = new THREE.Mesh(tlGeo, taillightMat);
  tl.position.set(0, 0.68, rearFaceZ);
  bodyTiltGroup.add(tl);

  // 4. Projected Forward Headlight Road Pool
  const beamGeo = new THREE.PlaneGeometry(w * 2.8, 12.5);
  beamGeo.rotateX(-Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    map: poolTex,
    color: 0xfef9c3,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beamPoolMesh = new THREE.Mesh(beamGeo, beamMat);
  beamPoolMesh.position.set(0, 0.045, halfL + 6.2);
  root.add(beamPoolMesh);

  // 5. Four Articulated Multi-Part Wheels (Treaded Tire + Alloy Rim + Brake Rotor + 5 Spokes)
  const wheelR = state.archetype === 'transit_shuttle' ? 0.42 : 0.36;
  const wheelW = 0.26;
  const tireTextures = getTireTextures();
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tireTextures.map,
    bumpMap: tireTextures.bumpMap,
    bumpScale: 0.01,
    roughness: 0.82,
    metalness: 0.08,
  });
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: getBrakeRotorTexture(),
    metalness: 0.8,
    roughness: 0.3,
  });

  const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(
    wheelR * 0.7,
    wheelR * 0.7,
    wheelW * 1.03,
    16
  );
  rimGeo.rotateZ(Math.PI / 2);
  const rotorGeo = new THREE.CylinderGeometry(
    wheelR * 0.54,
    wheelR * 0.54,
    0.04,
    14
  );
  rotorGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(
    wheelW * 1.06,
    wheelR * 1.32,
    0.048
  );

  const wheelMeshes: THREE.Object3D[] = [];
  const frontSteerGroups: THREE.Group[] = [];
  const wheelZ = l * 0.32;

  for (const sz of [1, -1]) {
    for (const sx of [1, -1]) {
      const steerGrp = new THREE.Group();
      steerGrp.position.set(sx * (w * 0.46), wheelR, sz * wheelZ);

      const spinGrp = new THREE.Group();
      const tireMesh = new THREE.Mesh(tireGeo, tireMat);
      const rimMesh = new THREE.Mesh(rimGeo, chromeMat);
      const rotorMesh = new THREE.Mesh(rotorGeo, rotorMat);
      spinGrp.add(tireMesh, rimMesh, rotorMesh);

      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(spokeGeo, chromeMat);
        spoke.rotation.x = (s * Math.PI) / 5;
        spinGrp.add(spoke);
      }

      steerGrp.add(spinGrp);
      root.add(steerGrp);
      wheelMeshes.push(spinGrp);
      if (sz === 1) {
        frontSteerGroups.push(steerGrp);
      }
    }
  }

  return {
    root,
    bodyTiltGroup,
    frontSteerGroups: [frontSteerGroups[0], frontSteerGroups[1]],
    wheelMeshes,
    headlightMat,
    taillightMat,
    turnLeftMat,
    turnRightMat,
    beamPoolMesh,
    roofSignMat,
  };
}

