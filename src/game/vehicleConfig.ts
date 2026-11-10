export type ChassisId = 'apex_gtr' | 'valkyrie_v10' | 'raijin_drift' | 'titan_nomad';
export type PaintFinishId = 'metallic' | 'matte' | 'pearlescent' | 'carbon';
export type SpoilerId = 'none' | 'lip' | 'gt_wing' | 'swan_neck';
export type SplitterId = 'stock' | 'street' | 'track_carbon';
export type DiffuserId = 'stock' | 'twin_fin' | 'aggressive_gt';
export type RoofAccessoryId = 'none' | 'carbon_vent' | 'rally_lightbar';
export type RimStyleId = 'multi_spoke' | 'deep_dish' | 'aero_turbo' | 'forged_split';
export type UnderglowId = 'none' | 'amber' | 'cyan' | 'crimson' | 'emerald';

export interface ChassisSpec {
  id: ChassisId;
  name: string;
  tagline: string;
  drivetrain: 'AWD' | 'RWD' | '4WD';
  basePowerHp: number;
  baseWeightKg: number;
  baseTopSpeedKmh: number;
  baseGrip: number;
  baseDriftEase: number;
  dimensions: {
    length: number;
    width: number;
    cabinHeight: number;
    wheelRadius: number;
    wheelWidth: number;
    wheelbase: number;
    groundClearance: number;
  };
}

export interface VehicleConfig {
  chassis: ChassisId;
  paintColor: string;
  secondaryColor: string;
  paintFinish: PaintFinishId;
  spoiler: SpoilerId;
  splitter: SplitterId;
  diffuser: DiffuserId;
  roofAccessory: RoofAccessoryId;
  rimStyle: RimStyleId;
  rimColor: string;
  caliperColor: string;
  underglow: UnderglowId;
  headlightTint: 'warm_white' | 'xenon_cyan' | 'yellow_gt';
  // Mechanical & Suspension Tuning
  rideHeight: number; // -0.06 to +0.10 meters offset
  suspensionStiffness: number; // 0.6 to 1.6 multiplier
  camberAngle: number; // -8 to 0 degrees
  finalDriveRatio: number; // 0.75 (top speed) to 1.30 (acceleration)
  tireCompound: number; // 0.65 (drift) to 1.35 (track slick)
  turboBoostBar: number; // 0.5 to 2.0 bar
  brakeBalance: number; // 0.35 (rear bias) to 0.70 (front bias)
}

export interface VehicleRatings {
  powerHp: number;
  weightKg: number;
  topSpeedKmh: number;
  zeroToHundredSec: number;
  lateralG: number;
  driftIndex: number; // 0 - 100
  speedScore: number; // 0 - 100
  accelScore: number; // 0 - 100
  handlingScore: number; // 0 - 100
}

export const CHASSIS_SPECS: Record<ChassisId, ChassisSpec> = {
  apex_gtr: {
    id: 'apex_gtr',
    name: 'Apex GT-R Coupe',
    tagline: 'Twin-turbo AWD grand tourer with balanced torque vectoring',
    drivetrain: 'AWD',
    basePowerHp: 620,
    baseWeightKg: 1580,
    baseTopSpeedKmh: 315,
    baseGrip: 1.08,
    baseDriftEase: 0.78,
    dimensions: {
      length: 4.65,
      width: 2.02,
      cabinHeight: 1.24,
      wheelRadius: 0.37,
      wheelWidth: 0.29,
      wheelbase: 2.78,
      groundClearance: 0.16,
    },
  },
  valkyrie_v10: {
    id: 'valkyrie_v10',
    name: 'Valkyrie V10 Hyper',
    tagline: 'Mid-engine aerodynamic wedge engineered for high-downforce apex speed',
    drivetrain: 'AWD',
    basePowerHp: 780,
    baseWeightKg: 1360,
    baseTopSpeedKmh: 352,
    baseGrip: 1.26,
    baseDriftEase: 0.65,
    dimensions: {
      length: 4.58,
      width: 2.12,
      cabinHeight: 1.12,
      wheelRadius: 0.36,
      wheelWidth: 0.32,
      wheelbase: 2.72,
      groundClearance: 0.12,
    },
  },
  raijin_drift: {
    id: 'raijin_drift',
    name: 'Raijin S-Spec Tuner',
    tagline: 'Lightweight widebody RWD street legend tuned for deep slip angles',
    drivetrain: 'RWD',
    basePowerHp: 540,
    baseWeightKg: 1270,
    baseTopSpeedKmh: 288,
    baseGrip: 0.88,
    baseDriftEase: 1.25,
    dimensions: {
      length: 4.48,
      width: 1.98,
      cabinHeight: 1.22,
      wheelRadius: 0.35,
      wheelWidth: 0.28,
      wheelbase: 2.66,
      groundClearance: 0.14,
    },
  },
  titan_nomad: {
    id: 'titan_nomad',
    name: 'Titan Nomad 4x4',
    tagline: 'Heavy-duty urban raid brawler with long-travel coilover suspension',
    drivetrain: '4WD',
    basePowerHp: 680,
    baseWeightKg: 2150,
    baseTopSpeedKmh: 262,
    baseGrip: 0.98,
    baseDriftEase: 0.85,
    dimensions: {
      length: 4.85,
      width: 2.18,
      cabinHeight: 1.56,
      wheelRadius: 0.46,
      wheelWidth: 0.34,
      wheelbase: 2.95,
      groundClearance: 0.28,
    },
  },
};

export const PAINT_SWATCHES = [
  { name: 'Solar Amber', hex: '#f59e0b' },
  { name: 'Monza Crimson', hex: '#ef4444' },
  { name: 'Estoril Cobalt', hex: '#2563eb' },
  { name: 'Cyber Cyan', hex: '#06b6d4' },
  { name: 'British Racing Green', hex: '#059669' },
  { name: 'Acid Track Lime', hex: '#84cc16' },
  { name: 'Pearl Glacier', hex: '#f8fafc' },
  { name: 'Titanium Silver', hex: '#94a3b8' },
  { name: 'Gunmetal Slate', hex: '#334155' },
  { name: 'Obsidian Pitch', hex: '#0f172a' },
];

export const RIM_SWATCHES = [
  { name: 'Machined Silver', hex: '#e2e8f0' },
  { name: 'Forged Bronze', hex: '#b45309' },
  { name: 'Motorsport Gold', hex: '#eab308' },
  { name: 'Satin Carbon', hex: '#1e293b' },
  { name: 'Gunmetal', hex: '#64748b' },
];

export const CALIPER_SWATCHES = [
  { name: 'Brembo Red', hex: '#ef4444' },
  { name: 'Ceramic Gold', hex: '#f59e0b' },
  { name: 'Electric Cyan', hex: '#06b6d4' },
  { name: 'Acid Green', hex: '#84cc16' },
];

export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
  chassis: 'apex_gtr',
  paintColor: '#f59e0b',
  secondaryColor: '#0f172a',
  paintFinish: 'metallic',
  spoiler: 'gt_wing',
  splitter: 'track_carbon',
  diffuser: 'twin_fin',
  roofAccessory: 'carbon_vent',
  rimStyle: 'multi_spoke',
  rimColor: '#e2e8f0',
  caliperColor: '#ef4444',
  underglow: 'amber',
  headlightTint: 'xenon_cyan',
  rideHeight: 0.0,
  suspensionStiffness: 1.1,
  camberAngle: -2.5,
  finalDriveRatio: 1.0,
  tireCompound: 1.0,
  turboBoostBar: 1.2,
  brakeBalance: 0.54,
};

export const PRESET_CONFIGS: Record<string, { label: string; config: VehicleConfig }> = {
  street_gt: {
    label: 'Apex Street GT',
    config: { ...DEFAULT_VEHICLE_CONFIG },
  },
  track_weapon: {
    label: 'Valkyrie Time Attack',
    config: {
      chassis: 'valkyrie_v10',
      paintColor: '#ef4444',
      secondaryColor: '#090d14',
      paintFinish: 'pearlescent',
      spoiler: 'swan_neck',
      splitter: 'track_carbon',
      diffuser: 'aggressive_gt',
      roofAccessory: 'carbon_vent',
      rimStyle: 'aero_turbo',
      rimColor: '#eab308',
      caliperColor: '#f59e0b',
      underglow: 'crimson',
      headlightTint: 'yellow_gt',
      rideHeight: -0.03,
      suspensionStiffness: 1.45,
      camberAngle: -3.5,
      finalDriveRatio: 0.88,
      tireCompound: 1.3,
      turboBoostBar: 1.6,
      brakeBalance: 0.62,
    },
  },
  drift_king: {
    label: 'Raijin Touge Drift',
    config: {
      chassis: 'raijin_drift',
      paintColor: '#06b6d4',
      secondaryColor: '#0f172a',
      paintFinish: 'metallic',
      spoiler: 'gt_wing',
      splitter: 'street',
      diffuser: 'twin_fin',
      roofAccessory: 'none',
      rimStyle: 'deep_dish',
      rimColor: '#e2e8f0',
      caliperColor: '#06b6d4',
      underglow: 'cyan',
      headlightTint: 'xenon_cyan',
      rideHeight: -0.04,
      suspensionStiffness: 1.25,
      camberAngle: -6.0,
      finalDriveRatio: 1.18,
      tireCompound: 0.72,
      turboBoostBar: 1.5,
      brakeBalance: 0.42,
    },
  },
  urban_brawler: {
    label: 'Titan Raid 4x4',
    config: {
      chassis: 'titan_nomad',
      paintColor: '#059669',
      secondaryColor: '#1e293b',
      paintFinish: 'matte',
      spoiler: 'lip',
      splitter: 'street',
      diffuser: 'stock',
      roofAccessory: 'rally_lightbar',
      rimStyle: 'forged_split',
      rimColor: '#b45309',
      caliperColor: '#f59e0b',
      underglow: 'emerald',
      headlightTint: 'warm_white',
      rideHeight: 0.06,
      suspensionStiffness: 0.85,
      camberAngle: -1.0,
      finalDriveRatio: 1.22,
      tireCompound: 0.95,
      turboBoostBar: 1.4,
      brakeBalance: 0.5,
    },
  },
};

export function computeVehicleRatings(config: VehicleConfig): VehicleRatings {
  const base = CHASSIS_SPECS[config.chassis];

  // Power scales with turboBoostBar
  const boostFactor = 0.82 + config.turboBoostBar * 0.22;
  const aeroDragMod =
    (config.spoiler === 'swan_neck' ? -0.03 : config.spoiler === 'gt_wing' ? -0.02 : 0) +
    (config.splitter === 'track_carbon' ? -0.01 : 0);

  const aeroDownforceMod =
    (config.spoiler === 'swan_neck' ? 0.14 : config.spoiler === 'gt_wing' ? 0.1 : config.spoiler === 'lip' ? 0.04 : 0) +
    (config.splitter === 'track_carbon' ? 0.08 : config.splitter === 'street' ? 0.04 : 0) +
    (config.diffuser === 'aggressive_gt' ? 0.08 : config.diffuser === 'twin_fin' ? 0.04 : 0);

  const weightMod =
    (config.paintFinish === 'carbon' ? -35 : 0) +
    (config.rimStyle === 'forged_split' ? -15 : 0) +
    (config.roofAccessory === 'rally_lightbar' ? 22 : 0);

  const powerHp = Math.round(base.basePowerHp * boostFactor);
  const weightKg = Math.max(1050, Math.round(base.baseWeightKg + weightMod));

  // Top speed depends on base top speed, turbo power, aero drag, and finalDriveRatio (lower ratio = taller gears = higher top speed)
  const gearTopSpeedFactor = 1.0 + (1.0 - config.finalDriveRatio) * 0.32;
  const topSpeedKmh = Math.round(
    base.baseTopSpeedKmh * Math.pow(boostFactor, 0.35) * (1 + aeroDragMod) * gearTopSpeedFactor
  );

  // 0-100 sec depends on power-to-weight, drivetrain traction, tire compound, and finalDriveRatio
  const pwRatio = powerHp / weightKg; // ~0.3 to 0.7
  const tractionBonus = base.drivetrain === 'AWD' ? 0.88 : base.drivetrain === '4WD' ? 0.92 : 1.04;
  const rawZeroToHundred =
    (1.45 / Math.max(0.22, pwRatio)) *
    tractionBonus *
    (1.12 - config.finalDriveRatio * 0.16) *
    (1.1 - Math.min(1.2, config.tireCompound) * 0.1);
  const zeroToHundredSec = Math.round(Math.max(1.9, Math.min(6.5, rawZeroToHundred)) * 10) / 10;

  // Lateral G depends on baseGrip, tireCompound, aeroDownforceMod, stiffness, camber, and ride height
  const camberBonus = Math.abs(config.camberAngle) * 0.012;
  const heightBonus = -config.rideHeight * 0.45;
  const lateralG =
    Math.round(
      Math.max(
        0.75,
        Math.min(
          1.95,
          base.baseGrip * config.tireCompound +
            aeroDownforceMod +
            (config.suspensionStiffness - 1.0) * 0.08 +
            camberBonus +
            heightBonus
        )
      ) * 100
    ) / 100;

  // Drift Index (0 - 100): higher when tire compound is lower, RWD, negative camber, rear brake bias, high turbo
  const rawDrift =
    base.baseDriftEase * 48 +
    (1.35 - config.tireCompound) * 38 +
    Math.abs(config.camberAngle) * 2.2 +
    (0.65 - config.brakeBalance) * 25 +
    config.turboBoostBar * 6;
  const driftIndex = Math.round(Math.max(15, Math.min(99, rawDrift)));

  const speedScore = Math.round(Math.max(20, Math.min(99, ((topSpeedKmh - 210) / 170) * 100)));
  const accelScore = Math.round(Math.max(20, Math.min(99, ((5.8 - zeroToHundredSec) / 3.8) * 100)));
  const handlingScore = Math.round(Math.max(20, Math.min(99, ((lateralG - 0.7) / 1.1) * 100)));

  return {
    powerHp,
    weightKg,
    topSpeedKmh,
    zeroToHundredSec,
    lateralG,
    driftIndex,
    speedScore,
    accelScore,
    handlingScore,
  };
}
