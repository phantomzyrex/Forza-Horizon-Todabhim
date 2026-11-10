import {
  CHASSIS_SPECS,
  VehicleConfig,
  computeVehicleRatings,
} from './vehicleConfig';
import {
  WeatherCondition,
  getWeatherProfile,
} from './worldBuilder';
import {
  APEX_BEACONS,
  BuildingCollider,
  CITY_BUILDINGS,
  DistrictId,
  SPEED_TRAPS,
  WORLD_BOUNDS,
  getDistrictAt,
  groundHeightAt,
} from './worldData';

export interface VehicleInput {
  throttle: number; // 0 to 1
  brake: number; // 0 to 1
  steer: number; // -1 (right) to +1 (left)
  handbrake: boolean;
  nitro: boolean;
}

export interface VehiclePhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number; // radians, 0 = +Z, Math.PI = -Z (North)
  angularVelocity: number;
  speedMs: number;
  speedKmh: number;
  forwardSpeedMs: number;
  lateralSpeedMs: number;
  slipAngleDeg: number;
  isDrifting: boolean;
  isAirborne: boolean;
  gear: number; // -1 = Reverse, 1..6 = Forward gears
  rpm: number; // 900 to 8500
  turboPsi: number; // -0.5 to +2.0 bar
  nitroAmount: number; // 0 to 100
  tireHeat: number; // 0 to 100
  pitchAngle: number; // radians longitudinal weight transfer
  rollAngle: number; // radians lateral weight transfer
  groundPitch: number; // radians terrain/bridge slope pitch
  groundRoll: number; // radians terrain/bridge slope roll
  steerAngle: number; // radians average front wheel angle
  steerAngleFL: number; // radians Ackermann front-left wheel angle
  steerAngleFR: number; // radians Ackermann front-right wheel angle
  wheelRotation: number; // cumulative radians for wheel spin
  wheelCompression: [number, number, number, number]; // FL, FR, RL, RR vertical travel (m)
  wheelLoads: [number, number, number, number]; // Normalized tire load per corner
  frontAxleLoadRatio: number; // 0.30 to 0.70 dynamic longitudinal weight distribution
  downforceN: number; // Aerodynamic downforce in Newtons
  shiftTimer: number; // Active gear-shift torque cut / kick timer
  exhaustPopTimer: number; // Active exhaust backfire flame timer
  suspensionBounceVel: number; // Vertical chassis spring velocity
  weather: WeatherCondition; // Active weather condition ('clear' | 'light_rain' | 'heavy_storm')
  surfaceWetness: number; // 0.0 (dry) to 1.0 (soaked)
  surfaceTractionMultiplier: number; // 1.0 (dry), 0.78 (light rain), 0.58 (heavy storm)
  isNitroActive: boolean; // True when N2O boost is actively firing
  nitroWarpIntensity: number; // 0.0 to 1.0 screen-space radial warp & motion blur intensity
  // Gameplay & Telemetry Scoring
  driftScoreCurrent: number;
  driftMultiplier: number;
  driftComboTimer: number;
  totalScore: number;
  topSpeedRecordedKmh: number;
  distanceDrivenMeters: number;
  currentDistrict: DistrictId;
  collectedBeacons: string[];
  triggeredSpeedTraps: Record<string, number>;
  lastCollisionImpact: number;
  hitstopTimer: number;
}

const GEAR_RATIOS = [3.4, 2.25, 1.62, 1.24, 0.98, 0.78];
const IDLE_RPM = 950;
const REDLINE_RPM = 8200;

/**
 * Computes the target screen-space radial warp / motion-blur intensity in [0, 1].
 * Intensifies when nitro is active, scaling continuously with both remaining nitro
 * reserve (`nitroAmount`) and vehicle speed (`speedKmh`).
 */
export function computeNitroWarpIntensity(
  isNitroActive: boolean,
  nitroAmount: number,
  speedKmh: number
): number {
  const clampedNitro = Math.min(100, Math.max(0, nitroAmount));
  const clampedSpeed = Math.max(0, speedKmh);

  if (isNitroActive && clampedNitro > 1) {
    const nitroFactor = clampedNitro / 100; // 0.01 .. 1.0
    const speedFactor = Math.min(1, Math.max(0.18, clampedSpeed / 220));
    return Math.min(
      1.0,
      Math.max(0.12, speedFactor * (0.36 + 0.64 * nitroFactor))
    );
  }

  // Subtle aerodynamic high-speed slipstream above 195 km/h when nitro is off
  if (clampedSpeed > 195) {
    return Math.min(0.18, ((clampedSpeed - 195) / 160) * 0.18);
  }
  return 0;
}

export function createInitialPhysicsState(
  startX = 0,
  startZ = 120,
  startHeading = Math.PI
): VehiclePhysicsState {
  const groundY = groundHeightAt(startX, startZ);
  return {
    x: startX,
    y: groundY,
    z: startZ,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: startHeading,
    angularVelocity: 0,
    speedMs: 0,
    speedKmh: 0,
    forwardSpeedMs: 0,
    lateralSpeedMs: 0,
    slipAngleDeg: 0,
    isDrifting: false,
    isAirborne: false,
    gear: 1,
    rpm: IDLE_RPM,
    turboPsi: 0,
    nitroAmount: 100,
    tireHeat: 22,
    pitchAngle: 0,
    rollAngle: 0,
    groundPitch: 0,
    groundRoll: 0,
    steerAngle: 0,
    steerAngleFL: 0,
    steerAngleFR: 0,
    wheelRotation: 0,
    wheelCompression: [0, 0, 0, 0],
    wheelLoads: [0.25, 0.25, 0.25, 0.25],
    frontAxleLoadRatio: 0.5,
    downforceN: 0,
    shiftTimer: 0,
    exhaustPopTimer: 0,
    suspensionBounceVel: 0,
    weather: 'clear',
    surfaceWetness: 0,
    surfaceTractionMultiplier: 1.0,
    isNitroActive: false,
    nitroWarpIntensity: 0,
    driftScoreCurrent: 0,
    driftMultiplier: 1.0,
    driftComboTimer: 0,
    totalScore: 0,
    topSpeedRecordedKmh: 0,
    distanceDrivenMeters: 0,
    currentDistrict: getDistrictAt(startX, startZ),
    collectedBeacons: [],
    triggeredSpeedTraps: {},
    lastCollisionImpact: 0,
    hitstopTimer: 0,
  };
}

export interface StepPhysicsResult {
  collidedBuildingId: string | null;
  impactSpeedKmh: number;
  newlyCollectedBeaconId: string | null;
  newlyTriggeredTrap: { id: string; name: string; speedKmh: number } | null;
  landedJump: boolean;
}

/**
 * Pure, deterministic vehicle physics step function.
 * Models longitudinal acceleration, 6-speed gearbox with shift kick & rev-matching,
 * turbo spool, Ackermann steering geometry, dynamic 4-corner weight transfer,
 * speed-squared aerodynamic downforce, wet-weather surface traction & hydroplaning,
 * Pacejka-inspired lateral slip & counter-steer assist, 4-wheel suspension travel,
 * terrain/bridge slope alignment, and AABB building collisions.
 */
export function stepVehiclePhysics(
  state: VehiclePhysicsState,
  input: VehicleInput,
  config: VehicleConfig,
  rawDt: number,
  buildings: BuildingCollider[] = CITY_BUILDINGS,
  weather?: WeatherCondition
): StepPhysicsResult {
  const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
  const activeWeather = weather ?? state.weather ?? 'clear';
  const weatherProfile = getWeatherProfile(activeWeather);
  state.weather = weatherProfile.condition;
  state.surfaceWetness = weatherProfile.surfaceWetness;
  state.surfaceTractionMultiplier = weatherProfile.tractionMultiplier;

  const result: StepPhysicsResult = {
    collidedBuildingId: null,
    impactSpeedKmh: 0,
    newlyCollectedBeaconId: null,
    newlyTriggeredTrap: null,
    landedJump: false,
  };

  state.lastCollisionImpact = 0;

  // Handle brief simulation hitstop on heavy collision
  if (state.hitstopTimer > 0) {
    state.hitstopTimer = Math.max(0, state.hitstopTimer - dt);
    return result;
  }

  const spec = CHASSIS_SPECS[config.chassis];
  const ratings = computeVehicleRatings(config);
  const topSpeedMs = ratings.topSpeedKmh / 3.6;

  // Forward unit vector: heading = 0 => (0, +1), heading = Math.PI => (0, -1)
  const sinH = Math.sin(state.heading);
  const cosH = Math.cos(state.heading);
  // Right unit vector
  const rightX = cosH;
  const rightZ = -sinH;

  // Project world velocity onto car local axes
  const forwardVel = state.vx * sinH + state.vz * cosH;
  const lateralVel = state.vx * rightX + state.vz * rightZ;

  // Smooth steering angle with speed-sensitive reduction + counter-steer drift stabilization
  const speedRatio = Math.min(1, Math.abs(forwardVel) / 65);
  const maxSteerRad = 0.62 * (1 - speedRatio * 0.52);

  // Self-aligning torque (counter-steer assist) when sliding sideways
  let counterSteerAssist = 0;
  if (!state.isAirborne && Math.abs(forwardVel) > 6 && Math.abs(lateralVel) > 1.8) {
    const slipRad = Math.atan2(lateralVel, Math.abs(forwardVel));
    counterSteerAssist = Math.max(-0.24, Math.min(0.24, -slipRad * 0.36));
  }

  const targetSteer = Math.max(
    -maxSteerRad,
    Math.min(maxSteerRad, input.steer * maxSteerRad + counterSteerAssist * (1 - Math.abs(input.steer) * 0.65))
  );
  const steerDamp = 1 - Math.exp(-15 * dt);
  state.steerAngle += (targetSteer - state.steerAngle) * steerDamp;

  // Ackermann front wheel steering geometry: inside wheel turns sharper than outside wheel
  const wb = spec.dimensions.wheelbase;
  const trackHalf = spec.dimensions.width * 0.44;
  if (Math.abs(state.steerAngle) > 0.004) {
    const turnRadius = wb / Math.tan(Math.abs(state.steerAngle));
    const innerAngle = Math.atan(wb / Math.max(1.2, turnRadius - trackHalf));
    const outerAngle = Math.atan(wb / (turnRadius + trackHalf));
    if (state.steerAngle > 0) {
      // Turning left (+steerAngle): FL is inner, FR is outer
      state.steerAngleFL = innerAngle;
      state.steerAngleFR = outerAngle;
    } else {
      // Turning right (-steerAngle): FR is inner, FL is outer
      state.steerAngleFL = -outerAngle;
      state.steerAngleFR = -innerAngle;
    }
  } else {
    state.steerAngleFL = state.steerAngle;
    state.steerAngleFR = state.steerAngle;
  }

  // Gearbox, Shift Kick & Exhaust Backfire Pop calculation
  const prevGear = state.gear;
  const absForwardKmh = Math.abs(forwardVel) * 3.6;
  if (forwardVel < -1.2 && input.brake > 0.1 && input.throttle < 0.1) {
    state.gear = -1;
  } else {
    // Automatic shift thresholds scaled by finalDriveRatio
    const shiftSpeeds = [48, 88, 134, 185, 242].map(
      (s) => s / config.finalDriveRatio
    );
    let nextGear = 1;
    for (let i = 0; i < shiftSpeeds.length; i++) {
      if (absForwardKmh > shiftSpeeds[i]) {
        nextGear = i + 2;
      }
    }
    state.gear = nextGear;
  }

  // Trigger shift kick & exhaust pop on high-RPM upshift or aggressive downshift
  if (state.gear !== prevGear && state.gear > 0 && prevGear > 0) {
    state.shiftTimer = 0.09;
    if (state.rpm > 4800 || state.gear < prevGear) {
      state.exhaustPopTimer = 0.18;
    }
  }
  if (input.throttle < 0.05 && state.rpm > 5600 && state.exhaustPopTimer <= 0) {
    state.exhaustPopTimer = 0.12;
  }
  state.shiftTimer = Math.max(0, state.shiftTimer - dt);
  state.exhaustPopTimer = Math.max(0, state.exhaustPopTimer - dt);

  const currentGearRatio =
    state.gear === -1 ? 3.2 : GEAR_RATIOS[Math.max(0, state.gear - 1)];
  const wheelRpm =
    (Math.abs(forwardVel) / (2 * Math.PI * spec.dimensions.wheelRadius)) * 60;
  const targetRpm = Math.min(
    REDLINE_RPM,
    Math.max(
      IDLE_RPM + input.throttle * 1800,
      wheelRpm * currentGearRatio * config.finalDriveRatio * 3.1
    )
  );
  state.rpm += (targetRpm - state.rpm) * (1 - Math.exp(-12 * dt));

  // Turbo spool dynamics (with blow-off flutter on shift/throttle lift)
  const targetTurbo =
    input.throttle > 0.25 && state.shiftTimer <= 0.02
      ? config.turboBoostBar *
        Math.min(1, (state.rpm - 2200) / 4500) *
        input.throttle
      : -0.25;
  state.turboPsi += (targetTurbo - state.turboPsi) * (1 - Math.exp(-7 * dt));

  // Nitrous oxide management
  let nitroMultiplier = 1.0;
  const nitroEngaged = Boolean(
    input.nitro && state.nitroAmount > 1 && input.throttle > 0.1
  );
  state.isNitroActive = nitroEngaged;
  if (nitroEngaged) {
    nitroMultiplier = 1.48;
    state.nitroAmount = Math.max(0, state.nitroAmount - 26 * dt);
  } else {
    const regenRate = state.isDrifting ? 14 : 4.5;
    state.nitroAmount = Math.min(100, state.nitroAmount + regenRate * dt);
  }

  // Aerodynamic Downforce (N): scales with speed^2 and aero package
  const aeroCoeff =
    1.15 +
    (config.spoiler === 'swan_neck' ? 0.55 : config.spoiler === 'gt_wing' ? 0.42 : config.spoiler === 'lip' ? 0.18 : 0) +
    (config.splitter === 'track_carbon' ? 0.32 : config.splitter === 'street' ? 0.16 : 0) +
    (config.diffuser === 'aggressive_gt' ? 0.3 : config.diffuser === 'twin_fin' ? 0.15 : 0);
  state.downforceN = state.isAirborne
    ? 0
    : Math.round(0.5 * 1.225 * aeroCoeff * forwardVel * forwardVel);
  const aeroGripBonus = 1 + Math.min(0.28, state.downforceN / (ratings.weightKg * 9.81));

  // Torque curve peaks around 5500 RPM; brief torque modulation during gear shift
  const rpmNorm = state.rpm / REDLINE_RPM;
  const torqueCurve = 0.72 + 0.38 * Math.sin(Math.min(1, rpmNorm) * Math.PI * 0.85);
  const shiftMod = state.shiftTimer > 0 ? 0.78 : 1.0;

  // Base longitudinal acceleration (m/s^2) scaled by wet-surface drive traction
  const wetDriveTraction =
    spec.drivetrain === 'AWD' || spec.drivetrain === '4WD'
      ? 0.72 + 0.28 * weatherProfile.tractionMultiplier
      : 0.56 + 0.44 * weatherProfile.tractionMultiplier;
  const powerToWeight = ratings.powerHp / ratings.weightKg; // ~0.35 - 0.58
  const baseDriveAccel =
    powerToWeight *
    34.5 *
    torqueCurve *
    shiftMod *
    (0.85 + config.finalDriveRatio * 0.22) *
    nitroMultiplier *
    wetDriveTraction;

  let longAccel = 0;
  if (input.throttle > 0 && forwardVel >= -2.5) {
    // tapers off near top speed
    const topSpeedFactor = Math.max(
      0,
      1 - Math.pow(Math.max(0, forwardVel) / (topSpeedMs * (input.nitro ? 1.12 : 1)), 2.2)
    );
    longAccel += input.throttle * baseDriveAccel * topSpeedFactor;
  }

  if (input.brake > 0) {
    if (forwardVel > 1.2) {
      // Braking force enhanced by aerodynamic downforce and tire compound, reduced on wet surfaces
      const brakeDecel =
        26.5 *
        (0.85 + config.tireCompound * 0.2) *
        aeroGripBonus *
        weatherProfile.brakingEfficiency;
      longAccel -= input.brake * brakeDecel;
    } else {
      // Reverse propulsion
      const reverseMaxMs = 18;
      if (forwardVel > -reverseMaxMs) {
        longAccel -= input.brake * 13.5 * weatherProfile.brakingEfficiency;
      }
    }
  }

  // Handbrake drag
  if (input.handbrake && Math.abs(forwardVel) > 0.5) {
    longAccel -= Math.sign(forwardVel) * 11.5 * weatherProfile.brakingEfficiency;
  }

  // Aerodynamic drag & rolling resistance
  const aeroDrag = 0.0042 * forwardVel * Math.abs(forwardVel);
  const rollingRes = 0.45 * forwardVel;
  longAccel -= aeroDrag + rollingRes;

  // Update forward velocity
  let newForwardVel = forwardVel + longAccel * dt;
  if (
    input.throttle === 0 &&
    input.brake === 0 &&
    Math.abs(newForwardVel) < 0.18
  ) {
    newForwardVel = 0;
  }

  // Dynamic Longitudinal & Lateral Weight Transfer
  const cgHeight = 0.46 + config.rideHeight;
  const longLoadShift = Math.max(
    -0.2,
    Math.min(0.2, (-longAccel / 9.81) * (cgHeight / wb) * 1.15)
  );
  state.frontAxleLoadRatio = Math.max(
    0.3,
    Math.min(0.7, 0.5 + longLoadShift)
  );
  const rearAxleLoadRatio = 1 - state.frontAxleLoadRatio;

  // Lateral grip & drift dynamics (Pacejka-inspired + aero downforce + wet surface traction reduction)
  const handbrakeFactor = input.handbrake ? 0.28 : 1.0;
  const drivetrainDriftFactor =
    spec.drivetrain === 'RWD' ? 0.76 : spec.drivetrain === 'AWD' ? 0.92 : 0.88;
  // Trail-braking oversteer: when braking into a corner, front axle has extra bite and rear axle is lighter
  const trailBrakeFactor =
    input.brake > 0.2 && Math.abs(input.steer) > 0.25 && forwardVel > 10
      ? 0.86
      : 1.0;
  const lateralGripCoeff =
    14.5 *
    spec.baseGrip *
    config.tireCompound *
    aeroGripBonus *
    weatherProfile.tractionMultiplier *
    handbrakeFactor *
    trailBrakeFactor *
    (input.throttle > 0.6 && Math.abs(input.steer) > 0.35
      ? drivetrainDriftFactor
      : 1.0);

  // Damping lateral velocity according to grip (airborne = minimal lateral damping)
  const effectiveLatDamp = state.isAirborne
    ? 0.5
    : Math.min(22, lateralGripCoeff);
  let newLateralVel = lateralVel * Math.exp(-effectiveLatDamp * dt);

  // Induce controlled lateral slip when turning hard at speed or pulling handbrake (amplified on wet roads)
  const speedForTurn = Math.abs(newForwardVel);
  if (!state.isAirborne && speedForTurn > 3.5) {
    const turnSign = newForwardVel >= 0 ? 1 : -1;
    // Angular turn rate enhanced by front axle normal load (trail-braking bite)
    const turnAbility = Math.min(1, speedForTurn / 7.5);
    const driftYawBoost = input.handbrake ? 1.42 : 1.0;
    const frontBiteBonus = 0.9 + state.frontAxleLoadRatio * 0.24;
    const camberTurnBonus = 1 + Math.abs(config.camberAngle) * 0.018;
    const targetYawRate =
      state.steerAngle *
      turnSign *
      turnAbility *
      3.4 *
      driftYawBoost *
      frontBiteBonus *
      camberTurnBonus;

    state.angularVelocity +=
      (targetYawRate - state.angularVelocity) * (1 - Math.exp(-11 * dt));

    // Centrifugal lateral slip transfer when drifting / cornering hard (amplified by hydroplaneSlipBoost on wet asphalt)
    const slipKick =
      -state.angularVelocity *
      speedForTurn *
      weatherProfile.hydroplaneSlipBoost *
      (input.handbrake ? 0.28 : (1.42 - Math.min(1.25, config.tireCompound)) * 0.22);
    newLateralVel += slipKick * dt * 4.2;
  } else {
    state.angularVelocity *= Math.exp(-10 * dt);
  }

  // Clamp lateral velocity to realistic bounds
  newLateralVel = Math.max(-24, Math.min(24, newLateralVel));

  // Integrate heading
  state.heading += state.angularVelocity * dt;

  // Reconstruct world velocity from updated forward + lateral velocity
  const newSinH = Math.sin(state.heading);
  const newCosH = Math.cos(state.heading);
  const newRightX = newCosH;
  const newRightZ = -newSinH;

  state.vx = newForwardVel * newSinH + newLateralVel * newRightX;
  state.vz = newForwardVel * newCosH + newLateralVel * newRightZ;

  // Tentative horizontal position
  const prevGroundY = groundHeightAt(state.x, state.z);
  const nextX = state.x + state.vx * dt;
  const nextZ = state.z + state.vz * dt;
  const nextGroundY = groundHeightAt(nextX, nextZ);

  // Vertical / Ramp / Airborne physics
  const slopeVy = (nextGroundY - prevGroundY) / dt;
  if (!state.isAirborne) {
    // Check if launching off a ramp lip where ground drops sharply while moving fast
    if (prevGroundY > nextGroundY + 0.35 && Math.abs(newForwardVel) > 12) {
      state.isAirborne = true;
      state.vy = Math.max(4.5, Math.abs(newForwardVel) * 0.24);
    } else {
      state.y = nextGroundY;
      state.vy = Math.max(0, slopeVy);
    }
  }

  if (state.isAirborne) {
    state.vy -= 22.0 * dt; // Gravity
    state.y += state.vy * dt;
    if (state.y <= nextGroundY) {
      const impactVy = Math.abs(state.vy);
      state.y = nextGroundY;
      state.vy = 0;
      state.isAirborne = false;
      result.landedJump = true;
      state.totalScore += 250;
      // Compress suspension springs on landing impact
      state.suspensionBounceVel = -Math.min(1.8, impactVy * 0.12);
    }
  }

  state.x = nextX;
  state.z = nextZ;

  // Sample terrain slope pitch & roll from bridge/ramp surface
  const frontSampleY = groundHeightAt(
    state.x + newSinH * (wb * 0.5),
    state.z + newCosH * (wb * 0.5)
  );
  const rearSampleY = groundHeightAt(
    state.x - newSinH * (wb * 0.5),
    state.z - newCosH * (wb * 0.5)
  );
  const targetGroundPitch = state.isAirborne
    ? Math.max(-0.22, Math.min(0.22, -state.vy * 0.015))
    : Math.atan2(rearSampleY - frontSampleY, wb);
  state.groundPitch +=
    (targetGroundPitch - state.groundPitch) * (1 - Math.exp(-14 * dt));
  state.groundRoll *= Math.exp(-12 * dt);

  // World perimeter boundary clamp with smooth bounce
  if (Math.abs(state.x) > WORLD_BOUNDS) {
    state.x = Math.sign(state.x) * WORLD_BOUNDS;
    state.vx *= -0.45;
  }
  if (Math.abs(state.z) > WORLD_BOUNDS) {
    state.z = Math.sign(state.z) * WORLD_BOUNDS;
    state.vz *= -0.45;
  }

  // Building AABB Collisions (only when below building height)
  const carRadius = 1.15;
  for (const b of buildings) {
    const halfW = b.width * 0.5 + carRadius;
    const halfD = b.depth * 0.5 + carRadius;
    const dx = state.x - b.x;
    const dz = state.z - b.z;
    if (Math.abs(dx) < halfW && Math.abs(dz) < halfD && state.y < b.height) {
      const overlapX = halfW - Math.abs(dx);
      const overlapZ = halfD - Math.abs(dz);
      const impactSpeed = Math.hypot(state.vx, state.vz) * 3.6;

      if (overlapX < overlapZ) {
        state.x += Math.sign(dx || 1) * overlapX;
        state.vx *= -0.35;
        state.vz *= 0.78;
      } else {
        state.z += Math.sign(dz || 1) * overlapZ;
        state.vz *= -0.35;
        state.vx *= 0.78;
      }

      if (impactSpeed > 18) {
        result.collidedBuildingId = b.id;
        result.impactSpeedKmh = impactSpeed;
        state.lastCollisionImpact = impactSpeed;
        state.driftScoreCurrent = 0;
        state.driftMultiplier = 1.0;
        if (impactSpeed > 95) {
          state.hitstopTimer = 0.04;
        }
      }
      break;
    }
  }

  // Recompute telemetry readouts
  state.forwardSpeedMs = state.vx * newSinH + state.vz * newCosH;
  state.lateralSpeedMs = state.vx * newRightX + state.vz * newRightZ;
  state.speedMs = Math.hypot(state.vx, state.vz);
  state.speedKmh = state.speedMs * 3.6;
  state.distanceDrivenMeters += state.speedMs * dt;
  state.wheelRotation +=
    (state.forwardSpeedMs / spec.dimensions.wheelRadius) * dt;

  // Smoothly update screen-space nitro radial warp & motion blur intensity
  const targetWarp = computeNitroWarpIntensity(
    state.isNitroActive,
    state.nitroAmount,
    state.speedKmh
  );
  const warpAttack = targetWarp > state.nitroWarpIntensity ? 11.0 : 5.5;
  state.nitroWarpIntensity +=
    (targetWarp - state.nitroWarpIntensity) * (1 - Math.exp(-warpAttack * dt));
  if (state.nitroWarpIntensity < 0.004) {
    state.nitroWarpIntensity = 0;
  }

  if (state.speedKmh > state.topSpeedRecordedKmh) {
    state.topSpeedRecordedKmh = Math.round(state.speedKmh);
  }

  // Slip angle & Drift state (wet surfaces initiate drift at lower slip angles)
  if (state.speedMs > 4.0) {
    const rawSlipRad = Math.atan2(
      Math.abs(state.lateralSpeedMs),
      Math.max(1.0, Math.abs(state.forwardSpeedMs))
    );
    state.slipAngleDeg = (rawSlipRad * 180) / Math.PI;
  } else {
    state.slipAngleDeg = 0;
  }

  const driftSlipThreshold = 11 - weatherProfile.surfaceWetness * 2.8;
  state.isDrifting =
    !state.isAirborne &&
    state.speedKmh > 25 &&
    (state.slipAngleDeg > driftSlipThreshold ||
      (input.handbrake && state.speedKmh > 32));

  // Tire heat simulation (standing water cools tires slightly)
  const wetCooling = weatherProfile.surfaceWetness * 10;
  const heatTarget = Math.max(
    14,
    (state.isDrifting
      ? Math.min(98, 55 + state.slipAngleDeg * 1.1)
      : 22 + (state.speedKmh / 320) * 28) - wetCooling
  );
  state.tireHeat += (heatTarget - state.tireHeat) * (1 - Math.exp(-2.5 * dt));

  // Drift Scoring & Multiplier
  if (state.isDrifting) {
    state.driftComboTimer = 1.6;
    const pointsPerSec = (state.speedKmh * 0.8 + state.slipAngleDeg * 3.5) * state.driftMultiplier;
    state.driftScoreCurrent += pointsPerSec * dt;
    state.driftMultiplier = Math.min(
      5.0,
      Math.round((state.driftMultiplier + dt * 0.35) * 10) / 10
    );
  } else if (state.driftComboTimer > 0) {
    state.driftComboTimer -= dt;
    if (state.driftComboTimer <= 0 && state.driftScoreCurrent > 0) {
      state.totalScore += Math.round(state.driftScoreCurrent);
      state.driftScoreCurrent = 0;
      state.driftMultiplier = 1.0;
    }
  }

  // Body pitch and roll (suspension weight transfer + gear-shift kick)
  const stiffnessFactor = 1 / Math.max(0.5, config.suspensionStiffness);
  const shiftPitchKick = state.shiftTimer > 0 ? -0.014 : 0;
  const targetPitch = Math.max(
    -0.065,
    Math.min(0.065, -longAccel * 0.0022 * stiffnessFactor + shiftPitchKick)
  );
  const targetRoll = Math.max(
    -0.095,
    Math.min(
      0.095,
      state.angularVelocity * (state.speedMs * 0.0028) * stiffnessFactor
    )
  );
  state.pitchAngle += (targetPitch - state.pitchAngle) * (1 - Math.exp(-11 * dt));
  state.rollAngle += (targetRoll - state.rollAngle) * (1 - Math.exp(-11 * dt));

  // 4-Corner Wheel Loads & Suspension Travel (FL, FR, RL, RR)
  state.suspensionBounceVel *= Math.exp(-9 * dt);
  const latShift = Math.max(
    -0.18,
    Math.min(0.18, state.angularVelocity * state.speedMs * 0.012)
  );
  const flLoad = Math.max(0.05, state.frontAxleLoadRatio * 0.5 - latShift * 0.5);
  const frLoad = Math.max(0.05, state.frontAxleLoadRatio * 0.5 + latShift * 0.5);
  const rlLoad = Math.max(0.05, rearAxleLoadRatio * 0.5 - latShift * 0.5);
  const rrLoad = Math.max(0.05, rearAxleLoadRatio * 0.5 + latShift * 0.5);
  state.wheelLoads = [flLoad, frLoad, rlLoad, rrLoad];

  // Road micro-ripple + corner load compression
  const roadRipple = state.isAirborne
    ? -0.045
    : Math.sin(state.distanceDrivenMeters * 1.4) *
      0.005 *
      Math.min(1, state.speedKmh / 90);
  const bounceOffset = state.suspensionBounceVel * 0.035;
  state.wheelCompression = [
    Math.max(-0.06, Math.min(0.06, (flLoad - 0.25) * 0.14 * stiffnessFactor + roadRipple + bounceOffset)),
    Math.max(-0.06, Math.min(0.06, (frLoad - 0.25) * 0.14 * stiffnessFactor - roadRipple + bounceOffset)),
    Math.max(-0.06, Math.min(0.06, (rlLoad - 0.25) * 0.14 * stiffnessFactor - roadRipple + bounceOffset)),
    Math.max(-0.06, Math.min(0.06, (rrLoad - 0.25) * 0.14 * stiffnessFactor + roadRipple + bounceOffset)),
  ];

  // Update District
  state.currentDistrict = getDistrictAt(state.x, state.z);

  // Check Collectible Apex Beacons
  for (const beacon of APEX_BEACONS) {
    if (!state.collectedBeacons.includes(beacon.id)) {
      const dist = Math.hypot(state.x - beacon.x, state.z - beacon.z);
      if (dist < 7.5) {
        state.collectedBeacons.push(beacon.id);
        state.totalScore += 500;
        state.nitroAmount = 100;
        result.newlyCollectedBeaconId = beacon.id;
      }
    }
  }

  // Check Speed Traps
  for (const trap of SPEED_TRAPS) {
    const dist = Math.hypot(state.x - trap.x, state.z - trap.z);
    if (dist < 10.5 && state.speedKmh > 60) {
      const rounded = Math.round(state.speedKmh);
      const prevBest = state.triggeredSpeedTraps[trap.id] || 0;
      if (rounded > prevBest + 5) {
        state.triggeredSpeedTraps[trap.id] = rounded;
        state.totalScore += rounded >= trap.targetSpeedKmh ? 600 : 200;
        result.newlyTriggeredTrap = {
          id: trap.id,
          name: trap.name,
          speedKmh: rounded,
        };
      }
    }
  }

  return result;
}
