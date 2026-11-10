import {
  DEFAULT_TRAFFIC_SIGNALS,
  IntersectionSignalState,
  NpcTrafficVehicleState,
  TrafficSignalPhase,
} from './trafficSystem';
import {
  BuildingCollider,
  ROAD_COORDS,
  ROAD_WIDTH,
  STREET_EVENTS,
  StreetEvent,
  WORLD_BOUNDS,
} from './worldData';

export type MinimapZoomMode = 'city' | 'tactical';

export type TrafficFlowStatus = 'free_flow' | 'moderate' | 'congested';

export type CorridorDensityLevel = 'clear' | 'low' | 'medium' | 'high';

export interface MinimapPoint {
  mx: number;
  mz: number;
  inBounds: boolean;
}

export interface MinimapBuildingFootprint {
  id: string;
  mx: number;
  mz: number;
  mw: number;
  md: number;
  distanceMeters: number;
  isNearby: boolean;
  proximityAlpha: number;
  planShape: BuildingCollider['planShape'];
  accentColor: string;
}

export interface MinimapTrafficArrow {
  id: string;
  x: number;
  z: number;
  mx: number;
  mz: number;
  heading: number;
  speedKmh: number;
  speedRatio: number;
  isBraking: boolean;
  nearbyTrafficCount: number;
  flowStatus: TrafficFlowStatus;
  colorHex: string;
  inBounds: boolean;
}

export interface MinimapCorridorDensity {
  id: string;
  axis: 'ns' | 'ew';
  coord: number;
  segStart: number;
  segEnd: number;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  vehicleCount: number;
  avgSpeedKmh: number;
  avgHeading: number;
  densityLevel: CorridorDensityLevel;
  colorHex: string;
}

export interface MinimapCheckpointMarker {
  index: number;
  x: number;
  z: number;
  mx: number;
  mz: number;
  radiusPx: number;
  isCurrent: boolean;
  isCompleted: boolean;
  distanceMeters: number;
}

export interface MinimapTrafficSignal {
  id: string;
  x: number;
  z: number;
  mx: number;
  mz: number;
  nsPhase: TrafficSignalPhase;
  ewPhase: TrafficSignalPhase;
  inBounds: boolean;
}

export interface GpsRouteWaypoint {
  x: number;
  z: number;
  mx: number;
  mz: number;
  inBounds: boolean;
}

export interface GpsOptimalRoute {
  targetId: string;
  targetLabel: string;
  targetType: 'event_checkpoint' | 'nearest_event' | 'waypoint';
  targetX: number;
  targetZ: number;
  targetMapPos: MinimapPoint;
  waypoints: GpsRouteWaypoint[];
  totalDistanceMeters: number;
  nextTurnDirection: 'straight' | 'left' | 'right' | 'arrive';
  nextTurnDistanceMeters: number;
}

export interface MinimapSnapshot {
  zoomMode: MinimapZoomMode;
  viewRadiusMeters: number;
  playerWorldX: number;
  playerWorldZ: number;
  playerMapPos: MinimapPoint;
  playerHeading: number;
  playerSpeedKmh: number;
  nearbyBuildingsCount: number;
  buildings: MinimapBuildingFootprint[];
  trafficArrows: MinimapTrafficArrow[];
  corridorDensities: MinimapCorridorDensity[];
  checkpoints: MinimapCheckpointMarker[];
  trafficSignals: MinimapTrafficSignal[];
  gpsRoute: GpsOptimalRoute;
  fleetSummary: {
    totalVehicles: number;
    freeFlowCount: number;
    moderateCount: number;
    congestedCount: number;
    avgFleetSpeedKmh: number;
    peakCorridorVehicles: number;
  };
}

export const NEARBY_BUILDING_RADIUS_METERS = 105;
export const TRAFFIC_CLUSTER_RADIUS_METERS = 46;

/**
 * Projects a world coordinate (wx, wz) onto a square mini-map canvas of `mapSizePx`
 * either centered on the entire Metropolis (`zoomMode === 'city'`) or centered on
 * the player's live physics state (`zoomMode === 'tactical'`).
 */
export function projectWorldToMinimap(
  wx: number,
  wz: number,
  playerX: number,
  playerZ: number,
  mapSizePx: number,
  zoomMode: MinimapZoomMode,
  paddingPx = 10
): MinimapPoint {
  const usableSpan = Math.max(10, mapSizePx - paddingPx * 2);
  if (zoomMode === 'tactical') {
    const viewRadius = 165; // 330m x 330m tactical local window around player
    const relX = (wx - playerX) / (viewRadius * 2) + 0.5;
    const relZ = (wz - playerZ) / (viewRadius * 2) + 0.5;
    const mx = paddingPx + relX * usableSpan;
    const mz = paddingPx + relZ * usableSpan;
    const inBounds =
      mx >= paddingPx - 12 &&
      mx <= mapSizePx - paddingPx + 12 &&
      mz >= paddingPx - 12 &&
      mz <= mapSizePx - paddingPx + 12;
    return { mx, mz, inBounds };
  }

  const worldSpan = WORLD_BOUNDS * 2;
  const relX = (wx + WORLD_BOUNDS) / worldSpan;
  const relZ = (wz + WORLD_BOUNDS) / worldSpan;
  const mx = paddingPx + relX * usableSpan;
  const mz = paddingPx + relZ * usableSpan;
  const inBounds =
    mx >= 0 && mx <= mapSizePx && mz >= 0 && mz <= mapSizePx;
  return { mx, mz, inBounds };
}

/**
 * Converts a world distance in meters into mini-map pixels for the active zoom mode.
 */
export function scaleWorldLengthToMinimap(
  meters: number,
  mapSizePx: number,
  zoomMode: MinimapZoomMode,
  paddingPx = 10
): number {
  const usableSpan = Math.max(10, mapSizePx - paddingPx * 2);
  const worldDiameter = zoomMode === 'tactical' ? 330 : WORLD_BOUNDS * 2;
  return (meters / worldDiameter) * usableSpan;
}

/**
 * Projects city buildings onto the mini-map and flags nearby buildings around the player's
 * physics position so close structures are highlighted with architectural detail.
 */
export function computeNearbyMinimapBuildings(
  buildings: BuildingCollider[],
  playerX: number,
  playerZ: number,
  mapSizePx: number,
  zoomMode: MinimapZoomMode
): { footprints: MinimapBuildingFootprint[]; nearbyCount: number } {
  let nearbyCount = 0;
  const footprints: MinimapBuildingFootprint[] = [];

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const dist = Math.hypot(b.x - playerX, b.z - playerZ);
    const isNearby = dist <= NEARBY_BUILDING_RADIUS_METERS;
    if (isNearby) nearbyCount++;

    const pt = projectWorldToMinimap(
      b.x,
      b.z,
      playerX,
      playerZ,
      mapSizePx,
      zoomMode
    );
    if (!pt.inBounds) continue;

    const mw = Math.max(
      2.2,
      scaleWorldLengthToMinimap(b.width, mapSizePx, zoomMode)
    );
    const md = Math.max(
      2.2,
      scaleWorldLengthToMinimap(b.depth, mapSizePx, zoomMode)
    );
    const proximityAlpha = isNearby
      ? Math.min(1, Math.max(0.35, 1 - dist / NEARBY_BUILDING_RADIUS_METERS))
      : 0.18;

    footprints.push({
      id: b.id,
      mx: pt.mx,
      mz: pt.mz,
      mw,
      md,
      distanceMeters: dist,
      isNearby,
      proximityAlpha,
      planShape: b.planShape,
      accentColor: b.accentColor,
    });
  }

  return { footprints, nearbyCount };
}

/**
 * Analyzes the AI traffic fleet to produce directional mini-map arrows and road-segment
 * flow/density indicators synchronized with the live simulation state.
 */
export function computeTrafficFlowAndDensity(
  trafficFleet: NpcTrafficVehicleState[],
  playerX: number,
  playerZ: number,
  mapSizePx: number,
  zoomMode: MinimapZoomMode
): {
  arrows: MinimapTrafficArrow[];
  corridors: MinimapCorridorDensity[];
  summary: MinimapSnapshot['fleetSummary'];
} {
  const arrows: MinimapTrafficArrow[] = [];
  let freeFlowCount = 0;
  let moderateCount = 0;
  let congestedCount = 0;
  let speedSumKmh = 0;

  // 1. Per-vehicle directional arrow, local cluster count, and flow classification
  for (let i = 0; i < trafficFleet.length; i++) {
    const v = trafficFleet[i];
    let nearbyTrafficCount = 0;
    for (let j = 0; j < trafficFleet.length; j++) {
      if (i === j) continue;
      const other = trafficFleet[j];
      const d = Math.hypot(v.x - other.x, v.z - other.z);
      if (d <= TRAFFIC_CLUSTER_RADIUS_METERS) {
        nearbyTrafficCount++;
      }
    }

    const speedKmh = v.currentSpeed * 3.6;
    speedSumKmh += speedKmh;
    const speedRatio =
      v.cruiseSpeed > 0.1 ? Math.min(1, v.currentSpeed / v.cruiseSpeed) : 0;

    let flowStatus: TrafficFlowStatus = 'free_flow';
    let colorHex = '#10b981'; // Emerald green: smooth free-flowing traffic

    if (v.isBraking || speedRatio < 0.48 || nearbyTrafficCount >= 3) {
      flowStatus = 'congested';
      colorHex = '#ef4444'; // Crimson red: braking queue / high local density
      congestedCount++;
    } else if (speedRatio < 0.82 || nearbyTrafficCount >= 1) {
      flowStatus = 'moderate';
      colorHex = '#f59e0b'; // Amber gold: moderate traffic cluster / intersection turn
      moderateCount++;
    } else {
      freeFlowCount++;
    }

    const pt = projectWorldToMinimap(
      v.x,
      v.z,
      playerX,
      playerZ,
      mapSizePx,
      zoomMode
    );

    arrows.push({
      id: v.id,
      x: v.x,
      z: v.z,
      mx: pt.mx,
      mz: pt.mz,
      heading: v.heading,
      speedKmh,
      speedRatio,
      isBraking: v.isBraking,
      nearbyTrafficCount,
      flowStatus,
      colorHex,
      inBounds: pt.inBounds,
    });
  }

  // 2. Road corridor segment density & flow aggregation
  const corridors: MinimapCorridorDensity[] = [];
  const halfRoad = ROAD_WIDTH * 0.85;
  let peakCorridorVehicles = 0;

  // Helper to evaluate a segment along N-S or E-W road centerline
  const evaluateSegment = (
    id: string,
    axis: 'ns' | 'ew',
    coord: number,
    segStart: number,
    segEnd: number
  ) => {
    let count = 0;
    let sumSpeedKmh = 0;
    let sumSin = 0;
    let sumCos = 0;

    for (let i = 0; i < trafficFleet.length; i++) {
      const v = trafficFleet[i];
      if (axis === 'ns') {
        if (
          Math.abs(v.x - coord) <= halfRoad &&
          v.z >= segStart &&
          v.z <= segEnd
        ) {
          count++;
          sumSpeedKmh += v.currentSpeed * 3.6;
          sumSin += Math.sin(v.heading);
          sumCos += Math.cos(v.heading);
        }
      } else {
        if (
          Math.abs(v.z - coord) <= halfRoad &&
          v.x >= segStart &&
          v.x <= segEnd
        ) {
          count++;
          sumSpeedKmh += v.currentSpeed * 3.6;
          sumSin += Math.sin(v.heading);
          sumCos += Math.cos(v.heading);
        }
      }
    }

    if (count > peakCorridorVehicles) {
      peakCorridorVehicles = count;
    }

    const avgSpeedKmh = count > 0 ? sumSpeedKmh / count : 0;
    const avgHeading = count > 0 ? Math.atan2(sumSin, sumCos) : 0;

    let densityLevel: CorridorDensityLevel = 'clear';
    let colorHex = '#334155';

    if (count >= 3 || (count >= 2 && avgSpeedKmh < 32)) {
      densityLevel = 'high';
      colorHex = '#ef4444'; // High density / slow traffic wave
    } else if (count === 2 || (count === 1 && avgSpeedKmh < 36)) {
      densityLevel = 'medium';
      colorHex = '#f59e0b'; // Moderate traffic density
    } else if (count === 1) {
      densityLevel = 'low';
      colorHex = '#10b981'; // Active free-flowing corridor
    }

    corridors.push({
      id,
      axis,
      coord,
      segStart,
      segEnd,
      x1: axis === 'ns' ? coord : segStart,
      z1: axis === 'ns' ? segStart : coord,
      x2: axis === 'ns' ? coord : segEnd,
      z2: axis === 'ns' ? segEnd : coord,
      vehicleCount: count,
      avgSpeedKmh,
      avgHeading,
      densityLevel,
      colorHex,
    });
  };

  // Evaluate segments between major intersections in ROAD_COORDS
  for (let r = 0; r < ROAD_COORDS.length; r++) {
    const coord = ROAD_COORDS[r];
    for (let s = 0; s < ROAD_COORDS.length - 1; s++) {
      const a = ROAD_COORDS[s];
      const b = ROAD_COORDS[s + 1];
      // N-S corridor segment
      evaluateSegment(`ns_${coord}_${s}`, 'ns', coord, a, b);
      // E-W corridor segment (skip river centerline z = 0)
      if (coord !== 0) {
        evaluateSegment(`ew_${coord}_${s}`, 'ew', coord, a, b);
      }
    }
  }

  return {
    arrows,
    corridors,
    summary: {
      totalVehicles: trafficFleet.length,
      freeFlowCount,
      moderateCount,
      congestedCount,
      avgFleetSpeedKmh:
        trafficFleet.length > 0 ? speedSumKmh / trafficFleet.length : 0,
      peakCorridorVehicles,
    },
  };
}

/**
 * Projects active street event checkpoints onto the mini-map with distance and gate progression state.
 */
export function computeEventMinimapCheckpoints(
  activeEvent: StreetEvent | null,
  currentCheckpointIdx: number,
  playerX: number,
  playerZ: number,
  mapSizePx: number,
  zoomMode: MinimapZoomMode
): MinimapCheckpointMarker[] {
  if (!activeEvent) return [];

  return activeEvent.checkpoints.map((cp, idx) => {
    const pt = projectWorldToMinimap(
      cp.x,
      cp.z,
      playerX,
      playerZ,
      mapSizePx,
      zoomMode
    );
    const radiusPx = Math.max(
      4.5,
      scaleWorldLengthToMinimap(cp.radius, mapSizePx, zoomMode)
    );
    const distanceMeters = Math.hypot(cp.x - playerX, cp.z - playerZ);
    return {
      index: idx,
      x: cp.x,
      z: cp.z,
      mx: pt.mx,
      mz: pt.mz,
      radiusPx,
      isCurrent: idx === currentCheckpointIdx,
      isCompleted: idx < currentCheckpointIdx,
      distanceMeters,
    };
  });
}

// ==================== METROPOLIS ROAD-GRAPH GPS PATHFINDER ====================

interface GraphNode {
  id: string;
  x: number;
  z: number;
}

interface GraphEdge {
  u: string;
  v: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  length: number;
}

const ROAD_GRAPH: {
  nodes: Map<string, GraphNode>;
  adj: Map<string, Array<{ to: string; weight: number }>>;
  edges: GraphEdge[];
} = (() => {
  const nodes = new Map<string, GraphNode>();
  const adj = new Map<string, Array<{ to: string; weight: number }>>();
  const edges: GraphEdge[] = [];

  const addNode = (x: number, z: number): string => {
    const id = `n_${x}_${z}`;
    if (!nodes.has(id)) {
      nodes.set(id, { id, x, z });
      adj.set(id, []);
    }
    return id;
  };

  const addUndirectedEdge = (
    x1: number,
    z1: number,
    x2: number,
    z2: number
  ) => {
    const u = addNode(x1, z1);
    const v = addNode(x2, z2);
    const length = Math.hypot(x2 - x1, z2 - z1);
    adj.get(u)!.push({ to: v, weight: length });
    adj.get(v)!.push({ to: u, weight: length });
    edges.push({ u, v, x1, z1, x2, z2, length });
  };

  const surfaceZ = [-220, -150, -75, 75, 150, 220];
  const bridgedX = new Set([-220, -150, 0, 150, 220]);

  // 1. East-West avenue segments
  for (const rz of surfaceZ) {
    for (let i = 0; i < ROAD_COORDS.length - 1; i++) {
      addUndirectedEdge(ROAD_COORDS[i], rz, ROAD_COORDS[i + 1], rz);
    }
  }

  // 2. North-South avenue segments & river bridges
  for (const rx of ROAD_COORDS) {
    addUndirectedEdge(rx, -220, rx, -150);
    addUndirectedEdge(rx, -150, rx, -75);
    addUndirectedEdge(rx, 75, rx, 150);
    addUndirectedEdge(rx, 150, rx, 220);
    if (bridgedX.has(rx)) {
      addUndirectedEdge(rx, -75, rx, 0);
      addUndirectedEdge(rx, 0, rx, 75);
    }
  }

  return { nodes, adj, edges };
})();

function projectPointToRoadGraph(wx: number, wz: number): {
  edgeIdx: number;
  edge: GraphEdge;
  px: number;
  pz: number;
  distToEdge: number;
  distToU: number;
  distToV: number;
} {
  let bestIdx = 0;
  let bestDist = Infinity;
  let bestPx = wx;
  let bestPz = wz;

  for (let i = 0; i < ROAD_GRAPH.edges.length; i++) {
    const e = ROAD_GRAPH.edges[i];
    const vx = e.x2 - e.x1;
    const vz = e.z2 - e.z1;
    const lenSq = vx * vx + vz * vz || 1;
    const t = Math.max(
      0,
      Math.min(1, ((wx - e.x1) * vx + (wz - e.z1) * vz) / lenSq)
    );
    const px = e.x1 + vx * t;
    const pz = e.z1 + vz * t;
    const d = Math.hypot(wx - px, wz - pz);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
      bestPx = px;
      bestPz = pz;
    }
  }

  const edge = ROAD_GRAPH.edges[bestIdx];
  return {
    edgeIdx: bestIdx,
    edge,
    px: bestPx,
    pz: bestPz,
    distToEdge: bestDist,
    distToU: Math.hypot(bestPx - edge.x1, bestPz - edge.z1),
    distToV: Math.hypot(bestPx - edge.x2, bestPz - edge.z2),
  };
}

function solveShortestRoadPath(
  startX: number,
  startZ: number,
  targetX: number,
  targetZ: number
): { points: Array<{ x: number; z: number }>; totalDistanceMeters: number } {
  const sProj = projectPointToRoadGraph(startX, startZ);
  const tProj = projectPointToRoadGraph(targetX, targetZ);

  const START_ID = '__start__';
  const TARGET_ID = '__target__';

  const nodeCoords = new Map<string, { x: number; z: number }>();
  ROAD_GRAPH.nodes.forEach((n, id) => nodeCoords.set(id, { x: n.x, z: n.z }));
  nodeCoords.set(START_ID, { x: sProj.px, z: sProj.pz });
  nodeCoords.set(TARGET_ID, { x: tProj.px, z: tProj.pz });

  const tempAdj = new Map<string, Array<{ to: string; weight: number }>>();
  ROAD_GRAPH.adj.forEach((list, id) => tempAdj.set(id, [...list]));
  tempAdj.set(START_ID, [
    { to: sProj.edge.u, weight: sProj.distToU },
    { to: sProj.edge.v, weight: sProj.distToV },
  ]);
  tempAdj.set(TARGET_ID, []);
  tempAdj.get(tProj.edge.u)!.push({ to: TARGET_ID, weight: tProj.distToU });
  tempAdj.get(tProj.edge.v)!.push({ to: TARGET_ID, weight: tProj.distToV });

  if (sProj.edgeIdx === tProj.edgeIdx) {
    const directW = Math.hypot(tProj.px - sProj.px, tProj.pz - sProj.pz);
    tempAdj.get(START_ID)!.push({ to: TARGET_ID, weight: directW });
  }

  // Dijkstra + Euclidean A* heuristic over road graph
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();

  nodeCoords.forEach((_, id) => {
    dist.set(id, Infinity);
    prev.set(id, null);
  });
  dist.set(START_ID, 0);

  while (visited.size < nodeCoords.size) {
    let u: string | null = null;
    let bestScore = Infinity;
    dist.forEach((d, id) => {
      if (!visited.has(id) && d < bestScore) {
        bestScore = d;
        u = id;
      }
    });

    if (!u || u === TARGET_ID) break;
    visited.add(u);

    const neighbors = tempAdj.get(u) || [];
    for (let i = 0; i < neighbors.length; i++) {
      const { to, weight } = neighbors[i];
      if (visited.has(to)) continue;
      const alt = (dist.get(u) ?? Infinity) + weight;
      if (alt < (dist.get(to) ?? Infinity)) {
        dist.set(to, alt);
        prev.set(to, u);
      }
    }
  }

  const rawPoints: Array<{ x: number; z: number }> = [];
  let curr: string | null = TARGET_ID;
  while (curr) {
    const pt = nodeCoords.get(curr);
    if (pt) rawPoints.push(pt);
    curr = prev.get(curr) ?? null;
  }
  rawPoints.reverse();

  // Prepend exact player coordinates and append exact target coordinates, deduplicating close vertices
  const fullSeq = [
    { x: startX, z: startZ },
    ...rawPoints,
    { x: targetX, z: targetZ },
  ];
  const deduped: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < fullSeq.length; i++) {
    const pt = fullSeq[i];
    if (
      deduped.length === 0 ||
      Math.hypot(
        pt.x - deduped[deduped.length - 1].x,
        pt.z - deduped[deduped.length - 1].z
      ) > 1.2
    ) {
      deduped.push(pt);
    }
  }

  let totalDistanceMeters = 0;
  for (let i = 0; i < deduped.length - 1; i++) {
    totalDistanceMeters += Math.hypot(
      deduped[i + 1].x - deduped[i].x,
      deduped[i + 1].z - deduped[i].z
    );
  }

  return { points: deduped, totalDistanceMeters };
}

/**
 * Computes the optimal GPS route along the Metropolis road network from `(playerX, playerZ)`
 * toward the active street event checkpoint, a custom waypoint, or the nearest street event start.
 */
export function computeOptimalGpsRoute(params: {
  playerX: number;
  playerZ: number;
  activeEvent: StreetEvent | null;
  eventCheckpointIdx: number;
  mapSizePx: number;
  zoomMode: MinimapZoomMode;
  customTarget?: { x: number; z: number; id?: string; label?: string };
}): GpsOptimalRoute {
  const {
    playerX,
    playerZ,
    activeEvent,
    eventCheckpointIdx,
    mapSizePx,
    zoomMode,
    customTarget,
  } = params;

  let targetId = 'event_bridge_sprint';
  let targetLabel = 'Metropolis Bridge Sprint';
  let targetType: GpsOptimalRoute['targetType'] = 'nearest_event';
  let targetX = 0;
  let targetZ = 120;

  if (customTarget) {
    targetId = customTarget.id ?? 'waypoint_custom';
    targetLabel = customTarget.label ?? 'Mission Waypoint';
    targetType = 'waypoint';
    targetX = customTarget.x;
    targetZ = customTarget.z;
  } else if (activeEvent && activeEvent.checkpoints[eventCheckpointIdx]) {
    const cp = activeEvent.checkpoints[eventCheckpointIdx];
    targetId = `${activeEvent.id}_cp_${eventCheckpointIdx}`;
    targetLabel = `${activeEvent.name} · G${eventCheckpointIdx + 1}/${
      activeEvent.checkpoints.length
    }`;
    targetType = 'event_checkpoint';
    targetX = cp.x;
    targetZ = cp.z;
  } else {
    // Select the nearest street event start line by road-network distance (preferring events > 22m away if standing at a start line)
    let bestEv = STREET_EVENTS[0];
    let bestDist = Infinity;

    for (let i = 0; i < STREET_EVENTS.length; i++) {
      const ev = STREET_EVENTS[i];
      const directDist = Math.hypot(ev.startX - playerX, ev.startZ - playerZ);
      const pathRes = solveShortestRoadPath(
        playerX,
        playerZ,
        ev.startX,
        ev.startZ
      );
      // If player is sitting directly on top of an event start (< 18m), route to its first checkpoint or next closest event so route is visible
      const effectiveCost =
        directDist < 18
          ? pathRes.totalDistanceMeters + 9999
          : pathRes.totalDistanceMeters;
      if (effectiveCost < bestDist) {
        bestDist = effectiveCost;
        bestEv = ev;
      }
    }

    targetId = bestEv.id;
    targetLabel = bestEv.name;
    targetType = 'nearest_event';
    targetX = bestEv.startX;
    targetZ = bestEv.startZ;
  }

  const solved = solveShortestRoadPath(playerX, playerZ, targetX, targetZ);
  const waypoints: GpsRouteWaypoint[] = solved.points.map((pt) => {
    const m = projectWorldToMinimap(
      pt.x,
      pt.z,
      playerX,
      playerZ,
      mapSizePx,
      zoomMode
    );
    return {
      x: pt.x,
      z: pt.z,
      mx: m.mx,
      mz: m.mz,
      inBounds: m.inBounds,
    };
  });

  // Determine next turn direction & distance along the optimal route
  let nextTurnDirection: GpsOptimalRoute['nextTurnDirection'] =
    solved.totalDistanceMeters < 18 ? 'arrive' : 'straight';
  let nextTurnDistanceMeters = solved.totalDistanceMeters;

  if (solved.points.length >= 3) {
    let accum = 0;
    for (let i = 0; i < solved.points.length - 2; i++) {
      const a = solved.points[i];
      const b = solved.points[i + 1];
      const c = solved.points[i + 2];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      accum += segLen;
      const h1 = Math.atan2(b.x - a.x, b.z - a.z);
      const h2 = Math.atan2(c.x - b.x, c.z - b.z);
      let dH = h2 - h1;
      while (dH > Math.PI) dH -= Math.PI * 2;
      while (dH < -Math.PI) dH += Math.PI * 2;
      if (Math.abs(dH) > 0.35) {
        nextTurnDirection = dH > 0 ? 'left' : 'right';
        nextTurnDistanceMeters = accum;
        break;
      }
    }
  }

  const targetMapPos = projectWorldToMinimap(
    targetX,
    targetZ,
    playerX,
    playerZ,
    mapSizePx,
    zoomMode
  );

  return {
    targetId,
    targetLabel,
    targetType,
    targetX,
    targetZ,
    targetMapPos,
    waypoints,
    totalDistanceMeters: solved.totalDistanceMeters,
    nextTurnDirection,
    nextTurnDistanceMeters,
  };
}

/**
 * Projects intersection traffic signals onto the mini-map.
 */
export function computeMinimapTrafficSignals(
  signals: IntersectionSignalState[],
  playerX: number,
  playerZ: number,
  mapSizePx: number,
  zoomMode: MinimapZoomMode
): MinimapTrafficSignal[] {
  return signals.map((s) => {
    const pt = projectWorldToMinimap(
      s.x,
      s.z,
      playerX,
      playerZ,
      mapSizePx,
      zoomMode
    );
    return {
      id: s.id,
      x: s.x,
      z: s.z,
      mx: pt.mx,
      mz: pt.mz,
      nsPhase: s.nsPhase,
      ewPhase: s.ewPhase,
      inBounds: pt.inBounds,
    };
  });
}

/**
 * Computes a complete real-time mini-map snapshot synchronized with the vehicle physics state,
 * city building colliders, AI traffic fleet, intersection traffic signals, active street event checkpoints,
 * and the dynamic GPS pathfinding route.
 */
export function computeMinimapSnapshot(params: {
  playerX: number;
  playerZ: number;
  playerHeading: number;
  playerSpeedKmh: number;
  buildings: BuildingCollider[];
  trafficFleet: NpcTrafficVehicleState[];
  trafficSignals?: IntersectionSignalState[];
  activeEvent: StreetEvent | null;
  eventCheckpointIdx: number;
  mapSizePx: number;
  zoomMode: MinimapZoomMode;
}): MinimapSnapshot {
  const {
    playerX,
    playerZ,
    playerHeading,
    playerSpeedKmh,
    buildings,
    trafficFleet,
    trafficSignals = DEFAULT_TRAFFIC_SIGNALS,
    activeEvent,
    eventCheckpointIdx,
    mapSizePx,
    zoomMode,
  } = params;

  const playerMapPos = projectWorldToMinimap(
    playerX,
    playerZ,
    playerX,
    playerZ,
    mapSizePx,
    zoomMode
  );

  const bldgRes = computeNearbyMinimapBuildings(
    buildings,
    playerX,
    playerZ,
    mapSizePx,
    zoomMode
  );

  const trafficRes = computeTrafficFlowAndDensity(
    trafficFleet,
    playerX,
    playerZ,
    mapSizePx,
    zoomMode
  );

  const checkpoints = computeEventMinimapCheckpoints(
    activeEvent,
    eventCheckpointIdx,
    playerX,
    playerZ,
    mapSizePx,
    zoomMode
  );

  const projectedSignals = computeMinimapTrafficSignals(
    trafficSignals,
    playerX,
    playerZ,
    mapSizePx,
    zoomMode
  );

  const gpsRoute = computeOptimalGpsRoute({
    playerX,
    playerZ,
    activeEvent,
    eventCheckpointIdx,
    mapSizePx,
    zoomMode,
  });

  return {
    zoomMode,
    viewRadiusMeters: zoomMode === 'tactical' ? 165 : WORLD_BOUNDS,
    playerWorldX: playerX,
    playerWorldZ: playerZ,
    playerMapPos,
    playerHeading,
    playerSpeedKmh,
    nearbyBuildingsCount: bldgRes.nearbyCount,
    buildings: bldgRes.footprints,
    trafficArrows: trafficRes.arrows,
    corridorDensities: trafficRes.corridors,
    checkpoints,
    trafficSignals: projectedSignals,
    gpsRoute,
    fleetSummary: trafficRes.summary,
  };
}
