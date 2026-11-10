import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VEHICLE_CONFIG,
  PRESET_CONFIGS,
  computeVehicleRatings,
} from './vehicleConfig';
import { createInitialPhysicsState, stepVehiclePhysics } from './physics';
import { groundHeightAt } from './worldData';

test('computeVehicleRatings updates performance metrics when tuning changes', () => {
  const baseRatings = computeVehicleRatings(DEFAULT_VEHICLE_CONFIG);
  assert.ok(baseRatings.powerHp > 500);
  assert.ok(baseRatings.topSpeedKmh > 250);

  // Higher turbo boost increases horsepower and top speed
  const highBoost = computeVehicleRatings({
    ...DEFAULT_VEHICLE_CONFIG,
    turboBoostBar: 2.0,
  });
  assert.ok(highBoost.powerHp > baseRatings.powerHp);
  assert.ok(highBoost.topSpeedKmh >= baseRatings.topSpeedKmh);

  // Drift preset has higher driftIndex than track preset
  const driftRatings = computeVehicleRatings(PRESET_CONFIGS.drift_king.config);
  const trackRatings = computeVehicleRatings(PRESET_CONFIGS.track_weapon.config);
  assert.ok(driftRatings.driftIndex > trackRatings.driftIndex);
  assert.ok(trackRatings.lateralG > driftRatings.lateralG);
});

test('stepVehiclePhysics accelerates forward and shifts gears under throttle', () => {
  const state = createInitialPhysicsState(0, 120, Math.PI);
  for (let i = 0; i < 60; i++) {
    stepVehiclePhysics(
      state,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
      DEFAULT_VEHICLE_CONFIG,
      1 / 30,
      []
    );
  }
  assert.ok(state.speedKmh > 60, `Expected speedKmh > 60, got ${state.speedKmh}`);
  assert.ok(state.gear >= 2, `Expected gear >= 2, got ${state.gear}`);
  assert.ok(state.z < 100, 'Expected vehicle to move North (-Z)');
});

test('stepVehiclePhysics initiates drift and awards drift score when turning with handbrake', () => {
  const state = createInitialPhysicsState(0, 120, Math.PI);
  const driftConfig = PRESET_CONFIGS.drift_king.config;

  // Accelerate to ~90 km/h first
  for (let i = 0; i < 40; i++) {
    stepVehiclePhysics(
      state,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
      driftConfig,
      1 / 30,
      []
    );
  }

  // Initiate powerslide with steer + handbrake
  let drifted = false;
  for (let i = 0; i < 25; i++) {
    stepVehiclePhysics(
      state,
      { throttle: 1, brake: 0, steer: 1, handbrake: i < 10, nitro: false },
      driftConfig,
      1 / 30,
      []
    );
    if (state.isDrifting) drifted = true;
  }

  assert.equal(drifted, true, 'Vehicle should enter drift state');
  assert.ok(state.driftScoreCurrent > 0, 'Drift score should accumulate');
});

test('groundHeightAt elevates cleanly across the central suspension bridge', () => {
  const flatRoad = groundHeightAt(0, 110);
  const bridgeApproach = groundHeightAt(0, 40);
  const bridgeCrown = groundHeightAt(0, 0);

  assert.equal(flatRoad, 0);
  assert.ok(bridgeApproach > 0 && bridgeApproach < bridgeCrown);
  assert.ok(bridgeCrown > 3.5);
});

test('road network generates non-overlapping segments and 4-way intersections', async () => {
  const { getIntersectionNodes, getRoadSegments, ROAD_WIDTH } = await import('./worldData');
  const nodes = getIntersectionNodes();
  const segments = getRoadSegments();

  assert.equal(nodes.length, 42, 'Should have 7 x 6 = 42 surface intersections');
  assert.ok(segments.length > 60, 'Should generate segmented avenues between intersections');

  // Verify no segment intrudes inside an intersection square
  const halfW = ROAD_WIDTH * 0.5 - 0.01;
  for (const node of nodes) {
    for (const seg of segments) {
      if (seg.axis === 'ew' && seg.fixedCoord === node.z) {
        assert.ok(
          seg.end <= node.x - halfW || seg.start >= node.x + halfW,
          `EW segment ${seg.id} overlaps intersection (${node.x}, ${node.z})`
        );
      }
      if (seg.axis === 'ns' && seg.fixedCoord === node.x) {
        assert.ok(
          seg.end <= node.z - halfW || seg.start >= node.z + halfW,
          `NS segment ${seg.id} overlaps intersection (${node.x}, ${node.z})`
        );
      }
    }
  }
});

test('city buildings span all 5 architectural archetypes and respect road setbacks', async () => {
  const { CITY_BUILDINGS, ROAD_COORDS, ROAD_WIDTH } = await import('./worldData');
  assert.ok(CITY_BUILDINGS.length >= 60, 'Should populate urban blocks with buildings');

  const styles = new Set(CITY_BUILDINGS.map((b) => b.style));
  for (const expectedStyle of [
    'glass_tower',
    'stepped_hq',
    'cyber_midrise',
    'harbor_warehouse',
    'civic_plaza',
  ] as const) {
    assert.ok(
      styles.has(expectedStyle),
      `Expected CITY_BUILDINGS to include style ${expectedStyle}`
    );
  }

  // Ensure no building footprint encroaches onto an avenue roadway
  const roadHalf = ROAD_WIDTH * 0.5;
  for (const b of CITY_BUILDINGS) {
    for (const rx of ROAD_COORDS) {
      assert.ok(
        Math.abs(b.x - rx) >= b.width * 0.5 + roadHalf - 0.5,
        `Building at (${b.x}, ${b.z}) encroaches NS road x=${rx}`
      );
    }
  }

  // Verify every single building has a unique architectural combination and all 8 planShapes & 8 roofTypes appear
  const planShapes = new Set(CITY_BUILDINGS.map((b) => b.planShape));
  const roofTypes = new Set(CITY_BUILDINGS.map((b) => b.roofType));
  assert.equal(planShapes.size, 8, 'All 8 3D structural planShapes should be represented');
  assert.equal(roofTypes.size, 8, 'All 8 rooftop crown archetypes should be represented');

  const signatures = new Set(
    CITY_BUILDINGS.map(
      (b) =>
        `${b.planShape}|${b.roofType}|${b.finPattern}|${b.facadeVariant}|${b.claddingTint}|${b.height}`
    )
  );
  assert.equal(
    signatures.size,
    CITY_BUILDINGS.length,
    'Every building in CITY_BUILDINGS must have a unique architectural signature'
  );
});

test('computeDayNightAtmosphere activates street lights, building windows, and headlights at night and disables them by day', async () => {
  const { computeDayNightAtmosphere } = await import('./dayNight');

  const noon = computeDayNightAtmosphere(12.5);
  assert.equal(noon.phase, 'DAY');
  assert.equal(noon.nightFactor, 0);
  assert.equal(noon.streetLightsActive, false);
  assert.equal(noon.windowLightsActive, false);
  assert.equal(noon.headlightsActive, false);
  assert.ok(noon.sunPosition.y > 300, 'Sun should be high overhead at noon');

  const dusk = computeDayNightAtmosphere(18.15);
  assert.equal(dusk.phase, 'DUSK');
  assert.ok(dusk.twilightFactor > 0.5, 'Dusk should have high warm twilight factor');

  const midnight = computeDayNightAtmosphere(0.5);
  assert.equal(midnight.phase, 'NIGHT');
  assert.equal(midnight.nightFactor, 1);
  assert.equal(midnight.streetLightsActive, true);
  assert.equal(midnight.windowLightsActive, true);
  assert.equal(midnight.headlightsActive, true);
  assert.ok(midnight.moonPosition.y > 300, 'Moon should be high overhead at midnight');
});

test('AI traffic system follows predefined routes, brakes for obstacles ahead, and resolves player collisions', async () => {
  const {
    createInitialTrafficFleet,
    stepTrafficSystem,
    resolvePlayerTrafficCollision,
  } = await import('./trafficSystem');

  const fleet = createInitialTrafficFleet();
  assert.equal(fleet.length, 24, 'Should spawn 24 AI traffic vehicles across 6 routes');

  const archetypes = new Set(fleet.map((v) => v.archetype));
  assert.equal(archetypes.size, 5, 'All 5 NPC vehicle archetypes should be present');

  const firstCar = fleet[0];
  const initialDist = firstCar.distanceAlongRoute;

  // Step forward with player far away -> car advances along route
  stepTrafficSystem(fleet, 999, 999, 0.5);
  assert.ok(
    firstCar.distanceAlongRoute !== initialDist,
    'NPC vehicle should advance along its predefined route'
  );

  // Place player directly 6m ahead of firstCar in its lane -> firstCar should brake
  const obstacleX = firstCar.x + Math.sin(firstCar.heading) * 6.0;
  const obstacleZ = firstCar.z + Math.cos(firstCar.heading) * 6.0;
  const speedBeforeBrake = firstCar.currentSpeed;
  stepTrafficSystem(fleet, obstacleX, obstacleZ, 0.25);
  assert.equal(firstCar.isBraking, true, 'NPC vehicle should brake when player is directly ahead');
  assert.ok(
    firstCar.currentSpeed < speedBeforeBrake,
    'NPC vehicle speed should decrease when braking for obstacle'
  );

  // Test player collision resolution against firstCar
  const dummyPlayer = {
    x: firstCar.x + Math.sin(firstCar.heading) * 1.5,
    y: firstCar.y,
    z: firstCar.z + Math.cos(firstCar.heading) * 1.5,
    vx: -Math.sin(firstCar.heading) * 20,
    vz: -Math.cos(firstCar.heading) * 20,
  };
  const hit = resolvePlayerTrafficCollision(dummyPlayer, fleet);
  assert.equal(hit.collidedNpcId, firstCar.id);
  assert.ok(hit.impactSpeedKmh > 40);
});

test('upgraded car mechanics model Ackermann steering, dynamic weight transfer, aero downforce, and 4-wheel suspension', () => {
  const state = createInitialPhysicsState(0, 120, Math.PI);

  // 1. Accelerate hard and verify rearward weight transfer (frontAxleLoadRatio < 0.5) & aero downforce
  let sawShiftKick = false;
  for (let i = 0; i < 45; i++) {
    stepVehiclePhysics(
      state,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
      DEFAULT_VEHICLE_CONFIG,
      1 / 30,
      []
    );
    if (state.shiftTimer > 0) {
      sawShiftKick = true;
    }
  }
  assert.ok(
    state.frontAxleLoadRatio < 0.5,
    `Expected rearward weight transfer under acceleration (< 0.5), got ${state.frontAxleLoadRatio}`
  );
  assert.ok(
    state.downforceN > 100,
    `Expected aerodynamic downforce > 100N at speed, got ${state.downforceN}`
  );
  assert.equal(sawShiftKick, true, 'Expected gear-shift kick timer to trigger on upshift');

  // 2. Steer left (+1) and verify Ackermann inner wheel (FL) turns sharper than outer wheel (FR)
  for (let i = 0; i < 10; i++) {
    stepVehiclePhysics(
      state,
      { throttle: 0.7, brake: 0, steer: 1, handbrake: false, nitro: false },
      DEFAULT_VEHICLE_CONFIG,
      1 / 30,
      []
    );
  }
  assert.ok(
    state.steerAngleFL > state.steerAngleFR && state.steerAngleFR > 0,
    `Expected Ackermann inner FL (${state.steerAngleFL}) > outer FR (${state.steerAngleFR})`
  );

  // 3. Apply heavy braking and verify forward weight transfer (frontAxleLoadRatio > 0.52)
  stepVehiclePhysics(
    state,
    { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false },
    DEFAULT_VEHICLE_CONFIG,
    1 / 30,
    []
  );
  assert.ok(
    state.frontAxleLoadRatio > 0.52,
    `Expected forward weight transfer under braking (> 0.52), got ${state.frontAxleLoadRatio}`
  );
  assert.equal(state.wheelCompression.length, 4, 'Should compute 4-wheel suspension travel');
});

test('real-time mini-map snapshot synchronizes player physics, nearby buildings, active checkpoints, and traffic flow/density', async () => {
  const { computeMinimapSnapshot } = await import('./minimapProjection');
  const { createInitialTrafficFleet } = await import('./trafficSystem');
  const { CITY_BUILDINGS, STREET_EVENTS } = await import('./worldData');

  const fleet = createInitialTrafficFleet();
  const sprintEvent = STREET_EVENTS[0];

  // Force one vehicle to brake and cluster two others nearby to test all 3 flow states (free_flow, moderate, congested)
  fleet[0].isBraking = true;
  fleet[0].currentSpeed = 2.0;
  fleet[1].x = fleet[2].x + 12;
  fleet[1].z = fleet[2].z + 12;

  const snapTactical = computeMinimapSnapshot({
    playerX: 0,
    playerZ: 120,
    playerHeading: Math.PI,
    playerSpeedKmh: 118,
    buildings: CITY_BUILDINGS,
    trafficFleet: fleet,
    activeEvent: sprintEvent,
    eventCheckpointIdx: 1,
    mapSizePx: 188,
    zoomMode: 'tactical',
  });

  // In tactical mode, player is centered on the mini-map (94, 94)
  assert.equal(Math.round(snapTactical.playerMapPos.mx), 94);
  assert.equal(Math.round(snapTactical.playerMapPos.mz), 94);
  assert.ok(
    snapTactical.nearbyBuildingsCount > 0,
    'Should detect nearby buildings around player at (0, 120)'
  );
  assert.equal(
    snapTactical.checkpoints.length,
    sprintEvent.checkpoints.length,
    'Should project all active event checkpoints'
  );
  assert.equal(snapTactical.checkpoints[0].isCompleted, true);
  assert.equal(snapTactical.checkpoints[1].isCurrent, true);

  // Verify traffic flow arrows & corridor density counts
  assert.equal(snapTactical.trafficArrows.length, 24);
  assert.equal(
    snapTactical.fleetSummary.freeFlowCount +
      snapTactical.fleetSummary.moderateCount +
      snapTactical.fleetSummary.congestedCount,
    24,
    'Traffic flow categories must sum to total fleet size'
  );
  assert.ok(
    snapTactical.fleetSummary.congestedCount >= 1,
    'Braking vehicle must be flagged as congested (#ef4444)'
  );
  assert.ok(
    snapTactical.corridorDensities.some((c) => c.densityLevel !== 'clear'),
    'Road corridors with active traffic must report non-clear density levels'
  );
});

test('GlobalWeatherManager toggles between clear, light_rain, and heavy_storm and reduces vehicle traction on wet surfaces', async () => {
  const { GlobalWeatherManager, getWeatherProfile } = await import('./worldBuilder');

  const manager = new GlobalWeatherManager('clear');
  assert.equal(manager.getCondition(), 'clear');
  assert.equal(manager.getProfile().tractionMultiplier, 1.0);

  assert.equal(manager.toggleWeather().condition, 'light_rain');
  assert.equal(manager.getCondition(), 'light_rain');
  assert.ok(manager.getProfile().tractionMultiplier < 1.0);

  assert.equal(manager.toggleWeather().condition, 'heavy_storm');
  assert.equal(manager.getCondition(), 'heavy_storm');
  assert.ok(
    manager.getProfile().tractionMultiplier <
      getWeatherProfile('light_rain').tractionMultiplier
  );

  assert.equal(manager.toggleWeather().condition, 'clear');
  assert.equal(manager.getCondition(), 'clear');

  // Compare cornering slip and longitudinal acceleration across clear, light_rain, and heavy_storm
  const runCorneringSimulation = (weather: 'clear' | 'light_rain' | 'heavy_storm') => {
    const state = createInitialPhysicsState(0, 120, Math.PI);
    // Accelerate straight first
    for (let i = 0; i < 35; i++) {
      stepVehiclePhysics(
        state,
        { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
        DEFAULT_VEHICLE_CONFIG,
        1 / 30,
        [],
        weather
      );
    }
    const straightSpeed = state.speedKmh;
    // Turn hard left under throttle
    for (let i = 0; i < 18; i++) {
      stepVehiclePhysics(
        state,
        { throttle: 0.9, brake: 0, steer: 1, handbrake: false, nitro: false },
        DEFAULT_VEHICLE_CONFIG,
        1 / 30,
        [],
        weather
      );
    }
    return {
      straightSpeed,
      slipAngleDeg: state.slipAngleDeg,
      tractionMultiplier: state.surfaceTractionMultiplier,
      wetness: state.surfaceWetness,
    };
  };

  const clearRun = runCorneringSimulation('clear');
  const rainRun = runCorneringSimulation('light_rain');
  const stormRun = runCorneringSimulation('heavy_storm');

  // Wet surfaces reduce drive traction (lower straight-line launch speed)
  assert.ok(
    clearRun.straightSpeed > rainRun.straightSpeed &&
      rainRun.straightSpeed > stormRun.straightSpeed,
    `Expected launch speed clear (${clearRun.straightSpeed}) > light_rain (${rainRun.straightSpeed}) > heavy_storm (${stormRun.straightSpeed})`
  );

  // Wet surfaces reduce lateral cornering grip (increasing slip angle in turns)
  assert.ok(
    stormRun.slipAngleDeg > rainRun.slipAngleDeg &&
      rainRun.slipAngleDeg > clearRun.slipAngleDeg,
    `Expected cornering slip angle storm (${stormRun.slipAngleDeg}) > light_rain (${rainRun.slipAngleDeg}) > clear (${clearRun.slipAngleDeg})`
  );
  assert.equal(clearRun.tractionMultiplier, 1.0);
  assert.equal(rainRun.tractionMultiplier, 0.78);
  assert.equal(stormRun.tractionMultiplier, 0.58);
});

test('Nitro radial warp scales with nitroAmount & speedKmh, and trafficSystem reacts to high-speed player approaches with braking, lane changes, and aggressive driver profiles', async () => {
  const { computeNitroWarpIntensity } = await import('./physics');
  const { createInitialTrafficFleet, stepTrafficSystem } = await import('./trafficSystem');

  // 1. Verify computeNitroWarpIntensity intensifies when nitro is active and scales with nitroAmount & speedKmh
  assert.equal(computeNitroWarpIntensity(false, 100, 150), 0);
  assert.equal(computeNitroWarpIntensity(true, 0, 150), 0);

  const inactiveHighSpeedWarp = computeNitroWarpIntensity(false, 100, 220);
  const lowSpeedWarp = computeNitroWarpIntensity(true, 100, 40);
  const highSpeedWarp = computeNitroWarpIntensity(true, 100, 220);
  const lowTankWarp = computeNitroWarpIntensity(true, 15, 220);

  assert.ok(highSpeedWarp > inactiveHighSpeedWarp * 10, 'Warp intensity must strongly intensify when nitro is active');
  assert.ok(highSpeedWarp > lowSpeedWarp, 'Warp intensity must increase with vehicle speed');
  assert.ok(highSpeedWarp > lowTankWarp, 'Warp intensity must scale with remaining nitro amount');

  // Verify stepVehiclePhysics ramps nitroWarpIntensity when nitro is active and decays on release
  const pState = createInitialPhysicsState(0, 120, Math.PI);
  for (let i = 0; i < 30; i++) {
    stepVehiclePhysics(
      pState,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: true },
      DEFAULT_VEHICLE_CONFIG,
      1 / 30,
      []
    );
  }
  assert.equal(pState.isNitroActive, true);
  assert.ok(pState.nitroWarpIntensity > 0.2, `Expected active nitroWarpIntensity > 0.2, got ${pState.nitroWarpIntensity}`);

  const peakWarp = pState.nitroWarpIntensity;
  for (let i = 0; i < 20; i++) {
    stepVehiclePhysics(
      pState,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
      DEFAULT_VEHICLE_CONFIG,
      1 / 30,
      []
    );
  }
  assert.equal(pState.isNitroActive, false);
  assert.ok(pState.nitroWarpIntensity < peakWarp, 'Warp intensity must decay smoothly when nitro is released');

  // 2. Verify traffic fleet includes commuter, cautious, and aggressive driver profiles
  const fleet = createInitialTrafficFleet();
  const aggressiveList = fleet.filter((v) => v.driverProfile === 'aggressive');
  const commuterList = fleet.filter((v) => v.driverProfile === 'commuter');
  assert.equal(aggressiveList.length, 6, 'Expected 6 aggressive drivers across the 24-vehicle fleet');
  assert.ok(commuterList.length > 0, 'Expected commuter drivers in the fleet');

  // 3. High-speed player approaching a commuter NPC from behind triggers evasive lane change + braking
  const commuterNpc = { ...commuterList[0] };
  const cSin = Math.sin(commuterNpc.heading);
  const cCos = Math.cos(commuterNpc.heading);
  // Place player 18m behind the commuter NPC and slightly to the left (-0.5m lateral), hurtling forward at 38 m/s (~137 km/h)
  const rightX = cCos;
  const rightZ = -cSin;
  const playerBehindX = commuterNpc.x - cSin * 18 - rightX * 0.5;
  const playerBehindZ = commuterNpc.z - cCos * 18 - rightZ * 0.5;
  const playerFastVx = cSin * 38;
  const playerFastVz = cCos * 38;

  const singleCommuterFleet = [commuterNpc];
  stepTrafficSystem(
    singleCommuterFleet,
    playerBehindX,
    playerBehindZ,
    0.25,
    playerFastVx,
    playerFastVz
  );

  assert.equal(commuterNpc.isBraking, true, 'Commuter NPC should brake when high-speed player approaches rapidly');
  assert.ok(
    commuterNpc.evasionState === 'evading_left' || commuterNpc.evasionState === 'evading_right',
    `Expected commuter NPC evasionState to be evading_left or evading_right, got ${commuterNpc.evasionState}`
  );
  assert.ok(
    Math.abs(commuterNpc.currentLaneOffset) > 0.1,
    `Expected commuter NPC to shift lateral lane offset, got ${commuterNpc.currentLaneOffset}`
  );

  // 4. High-speed player approaching an aggressive NPC from behind triggers lane weave + speed surge
  const aggressiveNpc = { ...aggressiveList[0] };
  const aSin = Math.sin(aggressiveNpc.heading);
  const aCos = Math.cos(aggressiveNpc.heading);
  const aRightX = aCos;
  const aRightZ = -aSin;
  const playerBehindAggX = aggressiveNpc.x - aSin * 20 - aRightX * 0.4;
  const playerBehindAggZ = aggressiveNpc.z - aCos * 20 - aRightZ * 0.4;
  const playerAggVx = aSin * 40;
  const playerAggVz = aCos * 40;

  const singleAggressiveFleet = [aggressiveNpc];
  stepTrafficSystem(
    singleAggressiveFleet,
    playerBehindAggX,
    playerBehindAggZ,
    0.25,
    playerAggVx,
    playerAggVz
  );

  assert.equal(
    aggressiveNpc.evasionState,
    'aggressive_surge',
    `Expected aggressive NPC evasionState to be aggressive_surge, got ${aggressiveNpc.evasionState}`
  );
  assert.ok(
    aggressiveNpc.currentSpeed > aggressiveNpc.cruiseSpeed,
    `Expected aggressive NPC to surge above cruiseSpeed (${aggressiveNpc.cruiseSpeed}), got ${aggressiveNpc.currentSpeed}`
  );
  assert.ok(
    Math.abs(aggressiveNpc.currentLaneOffset) > 0.1,
    `Expected aggressive NPC to weave lanes when challenged, got ${aggressiveNpc.currentLaneOffset}`
  );
});

test('Intersection traffic signals cycle through green, yellow, and red states forcing NPCs to stop, and GPS pathfinder highlights optimal route to nearest street event or checkpoint', async () => {
  const {
    createInitialTrafficFleet,
    createTrafficSignalStates,
    evaluateSignalPhaseAtTime,
    stepTrafficSignals,
    stepTrafficSystem,
  } = await import('./trafficSystem');
  const { computeOptimalGpsRoute, computeMinimapSnapshot } = await import('./minimapProjection');
  const { CITY_BUILDINGS, STREET_EVENTS } = await import('./worldData');

  // 1. Verify traffic signals cycle through green -> yellow -> red -> green
  assert.equal(evaluateSignalPhaseAtTime(2.0).nsPhase, 'green');
  assert.equal(evaluateSignalPhaseAtTime(2.0).ewPhase, 'red');
  assert.equal(evaluateSignalPhaseAtTime(10.5).nsPhase, 'yellow');
  assert.equal(evaluateSignalPhaseAtTime(10.5).ewPhase, 'red');
  assert.equal(evaluateSignalPhaseAtTime(15.0).nsPhase, 'red');
  assert.equal(evaluateSignalPhaseAtTime(15.0).ewPhase, 'green');
  assert.equal(evaluateSignalPhaseAtTime(22.5).nsPhase, 'red');
  assert.equal(evaluateSignalPhaseAtTime(22.5).ewPhase, 'yellow');

  const signals = createTrafficSignalStates();
  assert.equal(signals.length, 20, 'Expected 20 signalized major intersections');

  const sampleSig = { ...signals[0], clockSec: 1.0 };
  const testSigArr = [sampleSig];
  stepTrafficSignals(testSigArr, 9.2); // clockSec = 10.2 -> N-S yellow
  assert.equal(testSigArr[0].nsPhase, 'yellow');
  stepTrafficSignals(testSigArr, 4.0); // clockSec = 14.2 -> N-S red
  assert.equal(testSigArr[0].nsPhase, 'red');
  stepTrafficSignals(testSigArr, 11.0); // clockSec = 25.2 % 24 = 1.2 -> N-S green
  assert.equal(testSigArr[0].nsPhase, 'green');

  // 2. Verify an NPC approaching a RED traffic signal decelerates, stops before the stop line, and waits
  const fleet = createInitialTrafficFleet();
  const testNpc = { ...fleet[0] }; // On route_central_bridge_cw at x=4.2, z=96.2 heading North (heading = PI) toward intersection (0, 75)
  const redSignals = createTrafficSignalStates().map((s) => ({
    ...s,
    clockSec: 13.5, // N-S is 'red' for the next 8 seconds
    nsPhase: 'red' as 'red' | 'yellow' | 'green',
    ewPhase: 'green' as 'red' | 'yellow' | 'green',
    phaseRemainingSec: 8.0,
  }));

  const singleNpcFleet = [testNpc];
  for (let step = 0; step < 35; step++) {
    stepTrafficSystem(singleNpcFleet, 999, 999, 0.1, 0, 0, redSignals);
  }

  assert.equal(
    testNpc.evasionState,
    'stopped_at_light',
    `Expected NPC approaching red light to enter stopped_at_light state, got ${testNpc.evasionState}`
  );
  assert.equal(testNpc.isBraking, true, 'NPC at red light must have brake lights active');
  assert.equal(testNpc.currentSpeed, 0, `Expected NPC to come to a full stop (0 m/s) at red light stop line, got ${testNpc.currentSpeed}`);
  assert.ok(testNpc.z > 84, `Expected NPC to stop before intersection box (z > 84), got z=${testNpc.z}`);

  // Advance signal to GREEN and verify the NPC releases brake hold and resumes moving
  for (let s = 0; s < redSignals.length; s++) {
    redSignals[s].clockSec = 0.5;
    redSignals[s].nsPhase = 'green';
    redSignals[s].ewPhase = 'red';
  }
  for (let step = 0; step < 15; step++) {
    stepTrafficSystem(singleNpcFleet, 999, 999, 0.1, 0, 0, redSignals);
  }
  assert.equal(testNpc.stoppedAtSignalId, null);
  assert.ok(testNpc.currentSpeed > 3.0, `Expected NPC to accelerate once signal turns green, got ${testNpc.currentSpeed}`);

  // 3. Verify Dynamic GPS Pathfinding calculates optimal route across road network & river bridges
  // Case A: Free-roam GPS route from Westside (-75, 110) selects nearest street event and routes along road network
  const freeRoamGps = computeOptimalGpsRoute({
    playerX: -75,
    playerZ: 110,
    activeEvent: null,
    eventCheckpointIdx: 0,
    mapSizePx: 188,
    zoomMode: 'city',
  });
  assert.equal(freeRoamGps.targetType, 'nearest_event');
  assert.ok(freeRoamGps.waypoints.length >= 3, 'Expected multi-node road-graph GPS path');
  assert.ok(freeRoamGps.totalDistanceMeters > 80, 'Expected positive road-network distance');

  // Case B: Active street event checkpoint routing
  const sprintEv = STREET_EVENTS[0];
  const eventGps = computeOptimalGpsRoute({
    playerX: 0,
    playerZ: 120,
    activeEvent: sprintEv,
    eventCheckpointIdx: 4, // Checkpoint at (75, -150) across the Suspension Bridge + right turn
    mapSizePx: 188,
    zoomMode: 'tactical',
  });
  assert.equal(eventGps.targetType, 'event_checkpoint');
  assert.equal(eventGps.targetX, 75);
  assert.equal(eventGps.targetZ, -150);
  assert.ok(eventGps.waypoints.length >= 4, 'Route from (0,120) to (75,-150) should traverse bridge & downtown intersection');
  assert.equal(eventGps.nextTurnDirection, 'right', `Expected right turn at (0, -150) toward (75, -150), got ${eventGps.nextTurnDirection}`);

  // Case C: Cross-river routing from unbridged avenue x = -75 South (z = 100) to x = -75 North (z = -100) must detour via a bridge (x = 0 or x = -150)
  const crossRiverGps = computeOptimalGpsRoute({
    playerX: -75,
    playerZ: 100,
    activeEvent: null,
    eventCheckpointIdx: 0,
    mapSizePx: 188,
    zoomMode: 'city',
    customTarget: { x: -75, z: -100, label: 'North Bank Waypoint' },
  });
  const crossesBridge = crossRiverGps.waypoints.some(
    (wp) => Math.abs(wp.z) < 10 && (Math.abs(wp.x - 0) < 1 || Math.abs(wp.x - -150) < 1)
  );
  assert.ok(crossesBridge, 'GPS route across river from unbridged x=-75 must route over a valid bridge (x=0 or x=-150)');

  // Verify computeMinimapSnapshot includes both trafficSignals and gpsRoute
  const snap = computeMinimapSnapshot({
    playerX: 0,
    playerZ: 120,
    playerHeading: Math.PI,
    playerSpeedKmh: 65,
    buildings: CITY_BUILDINGS,
    trafficFleet: fleet,
    trafficSignals: redSignals,
    activeEvent: null,
    eventCheckpointIdx: 0,
    mapSizePx: 188,
    zoomMode: 'tactical',
  });
  assert.equal(snap.trafficSignals.length, 20);
  assert.ok(snap.gpsRoute.waypoints.length >= 2);
});




