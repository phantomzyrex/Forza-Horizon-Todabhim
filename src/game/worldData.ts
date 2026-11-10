export type BuildingPlanShape =
  | 'rectangular'
  | 'chamfered_octagon'
  | 'cruciform'
  | 'cylindrical_diagrid'
  | 'l_wing'
  | 'twin_linked'
  | 'tapered_obelisk'
  | 'stepped_ziggurat';

export type BuildingRoofType =
  | 'helipad'
  | 'spire_lattice'
  | 'sloped_shard'
  | 'observatory_dome'
  | 'crown_lantern'
  | 'twin_fins'
  | 'cooling_towers'
  | 'sky_garden';

export type BuildingFinPattern =
  | 'vertical_mullions'
  | 'horizontal_louvers'
  | 'exo_diagrid'
  | 'corner_buttress'
  | 'recessed_balconies';

export interface BuildingCollider {
  id: string;
  seed: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  district: DistrictId;
  style: 'glass_tower' | 'stepped_hq' | 'cyber_midrise' | 'harbor_warehouse' | 'civic_plaza';
  planShape: BuildingPlanShape;
  roofType: BuildingRoofType;
  finPattern: BuildingFinPattern;
  facadeVariant: number;
  tierCount: number;
  color: string;
  claddingTint: string;
  accentColor: string;
}

export interface RampCollider {
  id: string;
  x: number;
  z: number;
  width: number;
  length: number;
  maxHeight: number;
  direction: 'north' | 'south' | 'east' | 'west';
}

export interface SpeedTrap {
  id: string;
  name: string;
  x: number;
  z: number;
  targetSpeedKmh: number;
}

export interface ApexBeacon {
  id: string;
  name: string;
  x: number;
  z: number;
  district: DistrictId;
}

export interface StreetEvent {
  id: string;
  name: string;
  type: 'sprint' | 'drift' | 'circuit';
  description: string;
  targetTimeSec: number;
  targetScore: number;
  startX: number;
  startZ: number;
  startHeading: number;
  checkpoints: Array<{ x: number; z: number; radius: number }>;
}

export type DistrictId =
  | 'downtown'
  | 'bridge'
  | 'tech_quarter'
  | 'harbor_docks'
  | 'westside_plaza';

export const DISTRICT_INFO: Record<
  DistrictId,
  { name: string; subtitle: string; accent: string }
> = {
  downtown: {
    name: 'Downtown Financial Core',
    subtitle: 'High-Rise Corporate Towers & Wide Boulevards',
    accent: '#f59e0b',
  },
  bridge: {
    name: 'Bayfront Suspension Bridge',
    subtitle: 'Central Twin-Pylon Span Over Metropolis Channel',
    accent: '#38bdf8',
  },
  tech_quarter: {
    name: 'Neon Tech Quarter',
    subtitle: 'Research Pavilions & High-Speed Chicanes',
    accent: '#06b6d4',
  },
  harbor_docks: {
    name: 'Harbor Logistics Docks',
    subtitle: 'Wide Industrial Drift Yards & Crane Terminals',
    accent: '#ef4444',
  },
  westside_plaza: {
    name: 'Westside Civic Overlook',
    subtitle: 'Monumental Plazas & Perimeter Expressway',
    accent: '#10b981',
  },
};

export const WORLD_BOUNDS = 255;

export const ROAD_COORDS = [-220, -150, -75, 0, 75, 150, 220];
export const ROAD_WIDTH = 18;

export interface RoadSegmentSpec {
  id: string;
  axis: 'ns' | 'ew';
  fixedCoord: number; // x for 'ns', z for 'ew'
  start: number;
  end: number;
  length: number;
  center: number;
  isBridgeSpan: boolean;
}

export interface IntersectionNode {
  x: number;
  z: number;
  hasTrafficSignal: boolean;
}

/**
 * Computes all intersection nodes across the city road grid (excluding the river channel at z = 0).
 */
export function getIntersectionNodes(): IntersectionNode[] {
  const nodes: IntersectionNode[] = [];
  for (const rx of ROAD_COORDS) {
    for (const rz of ROAD_COORDS) {
      if (rz === 0) continue; // River channel has bridges, not 4-way surface intersections
      nodes.push({
        x: rx,
        z: rz,
        hasTrafficSignal: Math.abs(rx) <= 150 && Math.abs(rz) <= 150,
      });
    }
  }
  return nodes;
}

/**
 * Splits North-South and East-West avenues into clean segments between intersection boxes
 * so lane markings never overlap inside intersections.
 */
export function getRoadSegments(): RoadSegmentSpec[] {
  const segments: RoadSegmentSpec[] = [];
  const halfRoad = ROAD_WIDTH * 0.5;
  const minBound = -WORLD_BOUNDS - 12;
  const maxBound = WORLD_BOUNDS + 12;

  // East-West road segments along each z in ROAD_COORDS (except z = 0 river)
  const ewStops = [minBound, ...ROAD_COORDS, maxBound];
  for (const rz of ROAD_COORDS) {
    if (rz === 0) continue;
    for (let i = 0; i < ewStops.length - 1; i++) {
      const s = ewStops[i] + (i === 0 ? 0 : halfRoad);
      const e = ewStops[i + 1] - (i === ewStops.length - 2 ? 0 : halfRoad);
      if (e > s + 1) {
        segments.push({
          id: `ew_${rz}_${i}`,
          axis: 'ew',
          fixedCoord: rz,
          start: s,
          end: e,
          length: e - s,
          center: (s + e) * 0.5,
          isBridgeSpan: false,
        });
      }
    }
  }

  // North-South road segments along each x in ROAD_COORDS
  // Intersections exist at z = [-220, -150, -75, 75, 150, 220] (z = 0 is the river bridge span between -75 and +75)
  const nsIntersectionZ = [-220, -150, -75, 75, 150, 220];
  const nsStops = [minBound, ...nsIntersectionZ, maxBound];
  for (const rx of ROAD_COORDS) {
    const hasBridge = [0, -150, 150, -220, 220].includes(rx);
    for (let i = 0; i < nsStops.length - 1; i++) {
      const s = nsStops[i] + (i === 0 ? 0 : halfRoad);
      const e = nsStops[i + 1] - (i === nsStops.length - 2 ? 0 : halfRoad);
      const isRiverSpan = s < 0 && e > 0;
      if (isRiverSpan && !hasBridge) {
        // Split into two dead-end cul-de-sac approaches stopping short of the river seawall (|z| = 30)
        const northEnd = -30;
        if (northEnd > s + 2) {
          segments.push({
            id: `ns_${rx}_north_bank`,
            axis: 'ns',
            fixedCoord: rx,
            start: s,
            end: northEnd,
            length: northEnd - s,
            center: (s + northEnd) * 0.5,
            isBridgeSpan: false,
          });
        }
        const southStart = 30;
        if (e > southStart + 2) {
          segments.push({
            id: `ns_${rx}_south_bank`,
            axis: 'ns',
            fixedCoord: rx,
            start: southStart,
            end: e,
            length: e - southStart,
            center: (southStart + e) * 0.5,
            isBridgeSpan: false,
          });
        }
      } else if (e > s + 1) {
        segments.push({
          id: `ns_${rx}_${i}`,
          axis: 'ns',
          fixedCoord: rx,
          start: s,
          end: e,
          length: e - s,
          center: (s + e) * 0.5,
          isBridgeSpan: isRiverSpan && hasBridge,
        });
      }
    }
  }

  return segments;
}

export const STUNT_RAMPS: RampCollider[] = [
  {
    id: 'ramp_central_south',
    x: 6.2,
    z: 74,
    width: 4.2,
    length: 13,
    maxHeight: 2.2,
    direction: 'north',
  },
  {
    id: 'ramp_harbor_jump',
    x: 150,
    z: 105,
    width: 5.0,
    length: 16,
    maxHeight: 2.8,
    direction: 'north',
  },
  {
    id: 'ramp_tech_north',
    x: 75,
    z: -95,
    width: 4.5,
    length: 14,
    maxHeight: 2.3,
    direction: 'south',
  },
  {
    id: 'ramp_west_express',
    x: -150,
    z: -105,
    width: 5.0,
    length: 15,
    maxHeight: 2.5,
    direction: 'south',
  },
];

/**
 * Computes deterministic terrain/bridge/ramp height at any (x, z) world coordinate.
 * The central bay river runs along z in [-28, 28].
 * Bridges cross the river at x = -220, -150, 0, 150, 220.
 */
export function groundHeightAt(x: number, z: number): number {
  let baseHeight = 0;

  // Suspension Bridge & River Crossings at x = 0, ±150, ±220
  const bridgeCorridors = [0, -150, 150, -220, 220];
  for (const bx of bridgeCorridors) {
    const halfW = bx === 0 ? 12 : 10;
    if (Math.abs(x - bx) <= halfW && Math.abs(z) <= 56) {
      const peak = bx === 0 ? 3.8 : 2.2;
      const absZ = Math.abs(z);
      if (absZ <= 24) {
        baseHeight = Math.max(baseHeight, peak);
      } else {
        // Smooth cosine ramp between |z| = 24 and |z| = 56
        const t = (56 - absZ) / 32;
        const smooth = 0.5 - 0.5 * Math.cos(Math.PI * t);
        baseHeight = Math.max(baseHeight, peak * smooth);
      }
    }
  }

  // Check stunt ramps
  for (const r of STUNT_RAMPS) {
    const dx = x - r.x;
    const dz = z - r.z;
    if (Math.abs(dx) <= r.width * 0.5 && Math.abs(dz) <= r.length * 0.5) {
      let t = 0;
      if (r.direction === 'north') {
        // Rises as z goes from +length/2 to -length/2
        t = (r.length * 0.5 - dz) / r.length;
      } else if (r.direction === 'south') {
        t = (dz + r.length * 0.5) / r.length;
      } else if (r.direction === 'east') {
        t = (dx + r.length * 0.5) / r.length;
      } else {
        t = (r.length * 0.5 - dx) / r.length;
      }
      const clampedT = Math.max(0, Math.min(1, t));
      baseHeight = Math.max(baseHeight, clampedT * r.maxHeight);
    }
  }

  return baseHeight;
}

export function getDistrictAt(x: number, z: number): DistrictId {
  if (Math.abs(z) < 42) return 'bridge';
  if (z < -42 && x >= -40 && x <= 110) return 'downtown';
  if (z < -42 && x > 110) return 'tech_quarter';
  if (z >= 42 && x > 40) return 'harbor_docks';
  return 'westside_plaza';
}

/**
 * Generates deterministic city blocks between the road grid lines so roads stay 100% clear,
 * while guaranteeing that every single building has a unique architectural silhouette,
 * footprint, facade cladding tint, structural fin pattern, and rooftop crown.
 */
export const CITY_BUILDINGS: BuildingCollider[] = (() => {
  const buildings: BuildingCollider[] = [];
  // City blocks sit between road centers: [-220, -150, -75, 0, 75, 150, 220]
  // Note: z in [-38, 38] is the Central Bay River & Waterfront Esplanade, so no buildings there!
  const blockCentersX = [-185, -112.5, -37.5, 37.5, 112.5, 185];
  const blockCentersZ = [-185, -112.5, 112.5, 185];

  const planShapes: BuildingPlanShape[] = [
    'rectangular',
    'chamfered_octagon',
    'cruciform',
    'cylindrical_diagrid',
    'l_wing',
    'twin_linked',
    'tapered_obelisk',
    'stepped_ziggurat',
  ];

  const roofTypes: BuildingRoofType[] = [
    'helipad',
    'spire_lattice',
    'sloped_shard',
    'observatory_dome',
    'crown_lantern',
    'twin_fins',
    'cooling_towers',
    'sky_garden',
  ];

  const finPatterns: BuildingFinPattern[] = [
    'vertical_mullions',
    'horizontal_louvers',
    'exo_diagrid',
    'corner_buttress',
    'recessed_balconies',
  ];

  const claddingTints = [
    '#e0f2fe', // Crisp sky-sapphire curtain glass
    '#fef3c7', // Warm champagne gold-bronze glass
    '#d1fae5', // Emerald-teal architectural glazing
    '#e2e8f0', // Platinum titanium mirror glass
    '#f3e8ff', // Amethyst-indigo twilight glazing
    '#ffedd5', // Terracotta-copper anodized facade
    '#cffafe', // Arctic cyan structural glass
    '#f1f5f9', // Limestone-silver corporate stone
    '#fae8ff', // Rose-quartz executive curtain wall
    '#dcfce7', // Jade-mint bioclimatic tower glass
    '#dbeafe', // Cobalt-steel reflective facade
    '#fef9c3', // Solar-brass heritage stone & glass
  ];

  const accentPalette = [
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

  // 4 distinct urban parcel layouts per block (all strictly within |ox| + w/2 <= 24.5)
  const blockParcelLayouts = [
    [
      { ox: -13.5, oz: -12.5, w: 18, d: 18 },
      { ox: 13.5, oz: -12.5, w: 17, d: 19 },
      { ox: 0, oz: 13.5, w: 36, d: 16 },
    ],
    [
      { ox: 0, oz: -13, w: 34, d: 17 },
      { ox: -13, oz: 13, w: 19, d: 18 },
      { ox: 13.5, oz: 13, w: 17, d: 17 },
    ],
    [
      { ox: -13, oz: 0, w: 17, d: 34 },
      { ox: 12.5, oz: -12.5, w: 19, d: 18 },
      { ox: 12.5, oz: 12.5, w: 18, d: 18 },
    ],
    [
      { ox: -13, oz: -13, w: 19, d: 17 },
      { ox: 13, oz: 0, w: 17, d: 35 },
      { ox: -13, oz: 13, w: 18, d: 18 },
    ],
  ];

  let idx = 0;
  let blockIdx = 0;
  for (const cx of blockCentersX) {
    for (const cz of blockCentersZ) {
      const district = getDistrictAt(cx, cz);
      const parcels = blockParcelLayouts[blockIdx % blockParcelLayouts.length];
      blockIdx++;

      for (let p = 0; p < parcels.length; p++) {
        idx++;
        const sub = parcels[p];
        const bx = cx + sub.ox;
        const bz = cz + sub.oz;

        const hash1 = Math.abs(Math.sin(idx * 12.9898 + cx * 0.13 + cz * 0.27));
        const hash2 = Math.abs(Math.cos(idx * 78.233 + cx * 0.31 - cz * 0.19));

        // Slightly vary width and depth per building while never exceeding parcel envelope
        const w = Math.max(14, Math.round((sub.w - (hash1 * 2.4)) * 10) / 10);
        const d = Math.max(14, Math.round((sub.d - (hash2 * 2.4)) * 10) / 10);

        let height = 24 + Math.round(hash1 * 42) + (idx % 7);
        let style: BuildingCollider['style'] = 'glass_tower';
        let color = '#1e293b';

        if (district === 'downtown') {
          height = 46 + Math.round(hash1 * 68) + (idx % 9);
          style = idx % 2 === 0 ? 'glass_tower' : 'stepped_hq';
          color = idx % 3 === 0 ? '#0f172a' : '#1e293b';
        } else if (district === 'tech_quarter') {
          height = 30 + Math.round(hash1 * 46) + (idx % 6);
          style = idx % 3 === 0 ? 'glass_tower' : 'cyber_midrise';
          color = '#0f172a';
        } else if (district === 'harbor_docks') {
          height = 14 + Math.round(hash1 * 22) + (idx % 5);
          style = idx % 4 === 0 ? 'civic_plaza' : 'harbor_warehouse';
          color = '#334155';
        } else {
          height = 22 + Math.round(hash1 * 38) + (idx % 8);
          style =
            idx % 3 === 0
              ? 'stepped_hq'
              : idx % 3 === 1
              ? 'civic_plaza'
              : 'glass_tower';
          color = '#1e293b';
        }

        // Coprime permutation guarantees all 8 planShapes, 8 roofTypes, 5 finPatterns, and 12 facadeVariants appear and every building is unique
        const planShape = planShapes[idx % planShapes.length];
        const roofType =
          roofTypes[(idx * 3 + Math.floor(idx / 8)) % roofTypes.length];
        const finPattern = finPatterns[(idx * 2 + p) % finPatterns.length];
        const facadeVariant = (idx * 5 + Math.floor(idx / 12)) % 12;
        const tierCount = 2 + (idx % 4);
        const claddingTint =
          claddingTints[(idx * 7 + Math.floor(idx / 6)) % claddingTints.length];
        const accentColor =
          accentPalette[(idx * 5 + blockIdx) % accentPalette.length];

        buildings.push({
          id: `bldg_${idx}`,
          seed: idx,
          x: bx,
          z: bz,
          width: w,
          depth: d,
          height,
          district,
          style,
          planShape,
          roofType,
          finPattern,
          facadeVariant,
          tierCount,
          color,
          claddingTint,
          accentColor,
        });
      }
    }
  }
  return buildings;
})();

export const SPEED_TRAPS: SpeedTrap[] = [
  {
    id: 'trap_bridge_apex',
    name: 'Suspension Bridge Apex Radar',
    x: 0,
    z: 0,
    targetSpeedKmh: 210,
  },
  {
    id: 'trap_downtown_blvd',
    name: 'Financial Core Sprint Camera',
    x: 0,
    z: -135,
    targetSpeedKmh: 230,
  },
  {
    id: 'trap_harbor_straight',
    name: 'Harbor Terminal Speed Gate',
    x: 150,
    z: 75,
    targetSpeedKmh: 200,
  },
  {
    id: 'trap_west_ring',
    name: 'Westside Expressway Radar',
    x: -220,
    z: -75,
    targetSpeedKmh: 250,
  },
];

export const APEX_BEACONS: ApexBeacon[] = [
  { id: 'beacon_1', name: 'South Boulevard Gateway', x: 0, z: 80, district: 'westside_plaza' },
  { id: 'beacon_2', name: 'Suspension Bridge Crown', x: 0, z: -10, district: 'bridge' },
  { id: 'beacon_3', name: 'Financial Tower Plaza', x: 0, z: -110, district: 'downtown' },
  { id: 'beacon_4', name: 'North Central Overlook', x: 0, z: -195, district: 'downtown' },
  { id: 'beacon_5', name: 'Tech Quarter Spine', x: 75, z: -150, district: 'tech_quarter' },
  { id: 'beacon_6', name: 'East River Crossing', x: 150, z: 0, district: 'bridge' },
  { id: 'beacon_7', name: 'Harbor Drift Yard', x: 150, z: 150, district: 'harbor_docks' },
  { id: 'beacon_8', name: 'Container Dock Corner', x: 75, z: 150, district: 'harbor_docks' },
  { id: 'beacon_9', name: 'Westside Civic Arch', x: -75, z: 150, district: 'westside_plaza' },
  { id: 'beacon_10', name: 'West River Span', x: -150, z: 0, district: 'bridge' },
  { id: 'beacon_11', name: 'Northwest Perimeter', x: -150, z: -150, district: 'westside_plaza' },
  { id: 'beacon_12', name: 'East Perimeter Loop', x: 220, z: -75, district: 'tech_quarter' },
];

export const STREET_EVENTS: StreetEvent[] = [
  {
    id: 'event_bridge_sprint',
    name: 'Metropolis Bridge Sprint',
    type: 'sprint',
    description: 'High-speed run across the Twin-Pylon Suspension Bridge into Downtown Financial Core.',
    targetTimeSec: 45,
    targetScore: 2500,
    startX: 0,
    startZ: 120,
    startHeading: Math.PI, // Facing North (-Z)
    checkpoints: [
      { x: 0, z: 60, radius: 14 },
      { x: 0, z: 0, radius: 14 },
      { x: 0, z: -65, radius: 14 },
      { x: 0, z: -150, radius: 14 },
      { x: 75, z: -150, radius: 14 },
      { x: 75, z: -75, radius: 15 },
    ],
  },
  {
    id: 'event_harbor_drift',
    name: 'Harbor Dockyard Drift Trial',
    type: 'drift',
    description: 'Link technical 90-degree powerslides through the Harbor Logistics Docks and East Crossing.',
    targetTimeSec: 55,
    targetScore: 4000,
    startX: 75,
    startZ: 150,
    startHeading: Math.PI * 0.5, // Facing East (+X)
    checkpoints: [
      { x: 150, z: 150, radius: 15 },
      { x: 150, z: 75, radius: 15 },
      { x: 220, z: 75, radius: 15 },
      { x: 220, z: 0, radius: 15 },
      { x: 150, z: 0, radius: 15 },
      { x: 150, z: -75, radius: 15 },
    ],
  },
  {
    id: 'event_hyper_circuit',
    name: 'Downtown Apex Circuit',
    type: 'circuit',
    description: 'Full-throttle urban loop connecting Central Boulevard, Tech Quarter, and the Bayfront.',
    targetTimeSec: 65,
    targetScore: 5000,
    startX: 0,
    startZ: -75,
    startHeading: Math.PI, // Facing North (-Z)
    checkpoints: [
      { x: 0, z: -150, radius: 15 },
      { x: 75, z: -150, radius: 15 },
      { x: 150, z: -150, radius: 15 },
      { x: 150, z: -75, radius: 15 },
      { x: 75, z: -75, radius: 15 },
      { x: 0, z: -75, radius: 16 },
    ],
  },
];
