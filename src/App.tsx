/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CHASSIS_SPECS,
  DEFAULT_VEHICLE_CONFIG,
  VehicleConfig,
} from './game/vehicleConfig';
import {
  VehicleInput,
  VehiclePhysicsState,
  createInitialPhysicsState,
  stepVehiclePhysics,
} from './game/physics';
import {
  APEX_BEACONS,
  CITY_BUILDINGS,
  STREET_EVENTS,
  StreetEvent,
} from './game/worldData';
import {
  TIME_PRESETS,
  computeDayNightAtmosphere,
} from './game/dayNight';
import {
  MinimapZoomMode,
  computeMinimapSnapshot,
} from './game/minimapProjection';
import { resolvePlayerTrafficCollision } from './game/trafficSystem';
import { BuiltVehicleRig, buildProceduralVehicle } from './game/vehicleBuilder';
import {
  WEATHER_PROFILES,
  WeatherCondition,
  WorldSceneObjects,
  buildOpenWorldScene,
  getWeatherProfile,
} from './game/worldBuilder';
import { PooledParticleSystem } from './game/particlePool';
import { soundEngine } from './game/audio';
import {
  CameraMode,
  GameHud,
  GameState,
  HudTelemetrySnapshot,
  RunSummarySnapshot,
} from './components/GameHud';
import {
  MINIMAP_SIZE_PX,
  renderMinimapToCanvas,
} from './components/MinimapOverlay';
import {
  NitroWarpOverlay,
  renderNitroWarpToCanvas,
} from './components/NitroWarpOverlay';
import { GaragePanel } from './components/GaragePanel';

// Pre-allocated math helpers at module scope (zero GC in render loop)
const _camTargetPos = new THREE.Vector3();
const _camLookAtPos = new THREE.Vector3();
const _curLookAtPos = new THREE.Vector3(0, 2, 0);

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nitroWarpCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Check ?autostart=1 and optional ?time=day|night|dusk and ?weather=clear|light_rain|heavy_storm on initial load
  const searchParams =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;
  const initialAutostart =
    searchParams?.get('autostart') === '1' ||
    searchParams?.get('skipTitle') === '1';
  const initialTimeParam = searchParams?.get('time');
  const initialTimeHours =
    initialTimeParam === 'day'
      ? 12.5
      : initialTimeParam === 'dusk'
      ? 18.25
      : initialTimeParam === 'dawn'
      ? 6.15
      : 21.5;
  const initialWeatherParam = searchParams?.get('weather');
  const initialWeather: WeatherCondition =
    initialWeatherParam === 'light_rain' || initialWeatherParam === 'rain'
      ? 'light_rain'
      : initialWeatherParam === 'heavy_storm' || initialWeatherParam === 'storm'
      ? 'heavy_storm'
      : 'clear';

  const [gameState, setGameState] = useState<GameState>(
    initialAutostart ? 'playing' : 'title'
  );
  const [vehicleConfig, setVehicleConfig] = useState<VehicleConfig>(
    DEFAULT_VEHICLE_CONFIG
  );
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [minimapZoomMode, setMinimapZoomMode] =
    useState<MinimapZoomMode>('tactical');
  const [isMuted, setIsMuted] = useState(false);
  const [isGarageOpen, setIsGarageOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState<StreetEvent | null>(null);
  const [eventCheckpointIdx, setEventCheckpointIdx] = useState(0);
  const [eventElapsedSec, setEventElapsedSec] = useState(0);
  const [bannerAlert, setBannerAlert] = useState<string | null>(null);
  const [runSummary, setRunSummary] = useState<RunSummarySnapshot | null>(null);

  const [telemetry, setTelemetry] = useState<HudTelemetrySnapshot>(() => {
    const init = createInitialPhysicsState();
    const atm = computeDayNightAtmosphere(initialTimeHours);
    const wProf = getWeatherProfile(initialWeather);
    return {
      speedKmh: 0,
      rpm: init.rpm,
      gear: 1,
      turboPsi: 0,
      nitroAmount: 100,
      tireHeat: 22,
      isDrifting: false,
      slipAngleDeg: 0,
      driftScoreCurrent: 0,
      driftMultiplier: 1,
      totalScore: 0,
      topSpeedRecordedKmh: 0,
      distanceDrivenMeters: 0,
      currentDistrict: init.currentDistrict,
      collectedBeacons: [],
      x: init.x,
      z: init.z,
      heading: init.heading,
      timeOfDayHours: atm.timeHours,
      formattedTime: atm.formattedTime,
      timePhase: atm.phase,
      lightsActive: atm.headlightsActive,
      weather: initialWeather,
      surfaceWetness: wProf.surfaceWetness,
      surfaceTractionMultiplier: wProf.tractionMultiplier,
      isNitroActive: false,
      nitroWarpIntensity: 0,
      nearbyBuildingsCount: 6,
      freeFlowCount: 18,
      moderateCount: 4,
      congestedCount: 2,
      avgFleetSpeedKmh: 48,
    };
  });

  // Mutable refs shared with 60Hz loop so React re-renders never tear down WebGL
  const gameStateRef = useRef<GameState>(initialAutostart ? 'playing' : 'title');
  const configRef = useRef<VehicleConfig>(DEFAULT_VEHICLE_CONFIG);
  const cameraModeRef = useRef<CameraMode>('chase');
  const minimapZoomRef = useRef<MinimapZoomMode>('tactical');
  const timeOfDayRef = useRef<number>(initialTimeHours);
  const presetIndexRef = useRef<number>(3);
  const weatherRef = useRef<WeatherCondition>(initialWeather);
  const isGarageOpenRef = useRef<boolean>(false);
  const activeEventRef = useRef<StreetEvent | null>(null);
  const eventCpIdxRef = useRef<number>(0);
  const eventTimerRef = useRef<number>(0);
  const sessionTimerRef = useRef<number>(0);
  const bestScoreRef = useRef<number>(0);
  const traumaRef = useRef<number>(0);
  const physicsRef = useRef<VehiclePhysicsState>(createInitialPhysicsState());
  const keysHeldRef = useRef<Set<string>>(new Set());

  // Scene & Vehicle rig references for live garage hot-swapping
  const sceneRef = useRef<THREE.Scene | null>(null);
  const vehicleRigRef = useRef<BuiltVehicleRig | null>(null);
  const isSoftwareGlRef = useRef<boolean>(false);
  const worldObjectsRef = useRef<WorldSceneObjects | null>(null);

  // Mirror state to document.body.dataset.state immediately
  const syncGameState = (next: GameState) => {
    gameStateRef.current = next;
    document.body.dataset.state = next;
    setGameState(next);
  };

  useEffect(() => {
    document.body.dataset.state = gameStateRef.current;
  }, []);

  const showTransientBanner = (msg: string) => {
    setBannerAlert(msg);
    window.setTimeout(() => {
      setBannerAlert((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Start or resume gameplay handshake
  const handleStartGame = () => {
    soundEngine.init();
    soundEngine.playChime('ui');
    keysHeldRef.current.clear();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsGarageOpen(false);
    isGarageOpenRef.current = false;
    syncGameState('playing');
  };

  const handleToggleGarage = () => {
    soundEngine.init();
    soundEngine.playChime('ui');
    setIsGarageOpen((prev) => {
      const next = !prev;
      isGarageOpenRef.current = next;
      return next;
    });
  };

  const handleCycleCamera = () => {
    soundEngine.playChime('ui');
    const order: CameraMode[] = ['chase', 'hood', 'orbit'];
    const next = order[(order.indexOf(cameraModeRef.current) + 1) % order.length];
    cameraModeRef.current = next;
    setCameraMode(next);
  };

  const handleToggleMinimapZoom = () => {
    soundEngine.playChime('ui');
    const next: MinimapZoomMode =
      minimapZoomRef.current === 'tactical' ? 'city' : 'tactical';
    minimapZoomRef.current = next;
    setMinimapZoomMode(next);
  };

  const handleCycleTimeOfDay = () => {
    soundEngine.init();
    soundEngine.playChime('ui');
    const nextIdx = (presetIndexRef.current + 1) % TIME_PRESETS.length;
    presetIndexRef.current = nextIdx;
    const preset = TIME_PRESETS[nextIdx];
    timeOfDayRef.current = preset.hours;
    const atm = computeDayNightAtmosphere(preset.hours);
    setTelemetry((prev) => ({
      ...prev,
      timeOfDayHours: atm.timeHours,
      formattedTime: atm.formattedTime,
      timePhase: atm.phase,
      lightsActive: atm.headlightsActive,
    }));
    showTransientBanner(
      `TIME OF DAY: ${preset.label.toUpperCase()} (${atm.formattedTime}) — ${
        atm.headlightsActive
          ? 'NIGHT ILLUMINATION ACTIVE'
          : 'DAYLIGHT MODE ACTIVE'
      }`
    );
  };

  const handleToggleWeather = () => {
    soundEngine.init();
    soundEngine.playChime('ui');
    const nextCondition: WeatherCondition = worldObjectsRef.current
      ? worldObjectsRef.current.toggleWeather().condition
      : weatherRef.current === 'clear'
      ? 'light_rain'
      : weatherRef.current === 'light_rain'
      ? 'heavy_storm'
      : 'clear';
    weatherRef.current = nextCondition;
    const wProf = WEATHER_PROFILES[nextCondition];
    physicsRef.current.weather = nextCondition;
    physicsRef.current.surfaceWetness = wProf.surfaceWetness;
    physicsRef.current.surfaceTractionMultiplier = wProf.tractionMultiplier;
    setTelemetry((prev) => ({
      ...prev,
      weather: nextCondition,
      surfaceWetness: wProf.surfaceWetness,
      surfaceTractionMultiplier: wProf.tractionMultiplier,
    }));
    showTransientBanner(
      `WEATHER: ${wProf.label.toUpperCase()} — SURFACE TRACTION ${Math.round(
        wProf.tractionMultiplier * 100
      )}%`
    );
  };

  const handleToggleMute = () => {
    const next = !soundEngine.getMuted();
    soundEngine.setMuted(next);
    setIsMuted(next);
  };

  const handleResetCar = () => {
    soundEngine.playChime('ui');
    const p = physicsRef.current;
    p.x = 0;
    p.z = 120;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.heading = Math.PI;
    p.angularVelocity = 0;
    showTransientBanner('VEHICLE REPOSITIONED TO CENTRAL BOULEVARD');
  };

  const handleTogglePause = () => {
    soundEngine.playChime('ui');
    if (gameStateRef.current === 'playing') {
      keysHeldRef.current.clear();
      soundEngine.silenceLoops();
      syncGameState('paused');
    } else if (gameStateRef.current === 'paused') {
      keysHeldRef.current.clear();
      syncGameState('playing');
    }
  };

  const handleReturnTitle = () => {
    soundEngine.silenceLoops();
    keysHeldRef.current.clear();
    activeEventRef.current = null;
    setActiveEvent(null);
    syncGameState('title');
  };

  const handleStartEvent = (ev: StreetEvent | null) => {
    soundEngine.init();
    soundEngine.playChime('checkpoint');
    activeEventRef.current = ev;
    setActiveEvent(ev);
    eventCpIdxRef.current = 0;
    setEventCheckpointIdx(0);
    eventTimerRef.current = 0;
    setEventElapsedSec(0);

    if (ev) {
      const p = physicsRef.current;
      p.x = ev.startX;
      p.z = ev.startZ;
      p.y = 0;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.heading = ev.startHeading;
      p.angularVelocity = 0;
      showTransientBanner(`EVENT STARTED: ${ev.name.toUpperCase()}`);
    } else if (worldObjectsRef.current) {
      worldObjectsRef.current.checkpointRingGroup.visible = false;
    }
  };

  const handleFinishRunSummary = (customTitle?: string) => {
    soundEngine.silenceLoops();
    soundEngine.playChime('victory');
    const p = physicsRef.current;
    const finalScore = Math.round(p.totalScore + p.driftScoreCurrent);
    if (finalScore > bestScoreRef.current) {
      bestScoreRef.current = finalScore;
    }
    setRunSummary({
      eventName: customTitle || (activeEventRef.current ? activeEventRef.current.name : 'Metropolis Free Roam Session'),
      clearTimeSec: activeEventRef.current ? eventTimerRef.current : Math.max(1, sessionTimerRef.current),
      score: finalScore,
      bestScore: bestScoreRef.current,
      topSpeedKmh: p.topSpeedRecordedKmh,
      beaconsFound: p.collectedBeacons.length,
    });
    activeEventRef.current = null;
    setActiveEvent(null);
    if (worldObjectsRef.current) {
      worldObjectsRef.current.checkpointRingGroup.visible = false;
    }
    syncGameState('gameover');
  };

  // Rebuild 3D vehicle mesh whenever customization config changes
  const handleConfigChange = (nextConfig: VehicleConfig) => {
    configRef.current = nextConfig;
    setVehicleConfig(nextConfig);
    if (sceneRef.current && vehicleRigRef.current) {
      const prevPos = vehicleRigRef.current.root.position.clone();
      sceneRef.current.remove(vehicleRigRef.current.root);

      const newRig = buildProceduralVehicle(
        nextConfig,
        isSoftwareGlRef.current
      );
      newRig.root.position.copy(prevPos);
      newRig.root.rotation.set(0, physicsRef.current.heading, 0);
      sceneRef.current.add(newRig.root);
      vehicleRigRef.current = newRig;
    }
  };

  // Main Three.js WebGL initialization (mounted once)
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    // 1. Software-WebGL detection from GPU renderer string
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();
    isSoftwareGlRef.current = isSoftwareGl;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const horizonColor = new THREE.Color(0x0b1324);
    scene.background = horizonColor;
    scene.fog = new THREE.FogExp2(0x0b1324, 0.0042);

    // 2. Studio PBR Environment Reflections via RoomEnvironment + PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.2,
      1200
    );
    camera.position.set(6, 3.2, 128);

    // 3. Balanced Warm/Cool Studio & Golden-Dusk Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.85);
    hemiLight.position.set(0, 80, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffedd5, 2.2);
    dirLight.position.set(45, 75, 60);
    if (!isSoftwareGl) {
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      const d = 55;
      dirLight.shadow.camera.left = -d;
      dirLight.shadow.camera.right = d;
      dirLight.shadow.camera.top = d;
      dirLight.shadow.camera.bottom = -d;
      dirLight.shadow.camera.near = 5;
      dirLight.shadow.camera.far = 180;
      dirLight.shadow.bias = -0.0005;
      dirLight.shadow.normalBias = 0.02;
    }
    scene.add(dirLight);
    scene.add(dirLight.target);

    // 4. Build Open World & Player Vehicle (with GlobalWeatherManager)
    const worldObjects = buildOpenWorldScene(scene, renderer, isSoftwareGl);
    if (weatherRef.current !== 'clear') {
      worldObjects.setWeather(weatherRef.current);
    }
    worldObjectsRef.current = worldObjects;

    const vehicleRig = buildProceduralVehicle(configRef.current, isSoftwareGl);
    vehicleRigRef.current = vehicleRig;
    scene.add(vehicleRig.root);

    const particles = new PooledParticleSystem(scene);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 5. Input Listeners (Keyboard + Focus Loss Hygiene)
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(
          code
        )
      ) {
        e.preventDefault();
      }

      if (!e.repeat) {
        if (
          gameStateRef.current === 'title' &&
          (code === 'Enter' || code === 'Space')
        ) {
          handleStartGame();
          return;
        }
        if (
          gameStateRef.current === 'gameover' &&
          (code === 'Enter' || code === 'Space')
        ) {
          handleStartGame();
          return;
        }
        if (code === 'Escape' || code === 'KeyP') {
          if (
            gameStateRef.current === 'playing' ||
            gameStateRef.current === 'paused'
          ) {
            handleTogglePause();
            return;
          }
        }
        if (code === 'KeyG') {
          handleToggleGarage();
          return;
        }
        if (code === 'KeyC' && gameStateRef.current === 'playing') {
          handleCycleCamera();
          return;
        }
        if (code === 'KeyZ' && gameStateRef.current === 'playing') {
          handleToggleMinimapZoom();
          return;
        }
        if (code === 'KeyT') {
          handleCycleTimeOfDay();
          return;
        }
        if (code === 'KeyV') {
          handleToggleWeather();
          return;
        }
        if (code === 'KeyM') {
          handleToggleMute();
          return;
        }
        if (code === 'KeyR' && gameStateRef.current === 'playing') {
          handleResetCar();
          return;
        }
      }

      keysHeldRef.current.add(code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.code);
    };

    const onBlur = () => {
      keysHeldRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // 6. Paced Simulation & Render Loop (with software-WebGL fenceSync support)
    let frameId = 0;
    let lastTimeMs = performance.now();
    let elapsedSec = 0;
    let lastHudSyncMs = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function stepSimulationBy(dt: number, nowMs: number, renderWebGl = true) {
      const currentState = gameStateRef.current;
      const pState = physicsRef.current;
      const rig = vehicleRigRef.current;

      if (currentState !== 'paused') {
        elapsedSec += dt;
        // Advance Day-Night cycle smoothly (1 full 24-hour cycle every 240 seconds)
        timeOfDayRef.current = (timeOfDayRef.current + dt * 0.1) % 24;
        worldObjects.updateWorldAnimations(
          elapsedSec,
          dt,
          pState.x,
          pState.z,
          pState.vx,
          pState.vz
        );
      }

      // Apply Day-Night & Weather Atmosphere to Sky, Lights, Streetlamps, Buildings & Vehicle Headlights
      const atm = worldObjects.applyDayNightCycle(timeOfDayRef.current);
      horizonColor.set(atm.fogHex);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(horizonColor);
      }
      dirLight.color.set(atm.dirLightHex);
      dirLight.intensity = atm.dirLightIntensity;
      hemiLight.color.set(atm.hemiSkyHex);
      hemiLight.groundColor.set(atm.hemiGroundHex);
      hemiLight.intensity = atm.hemiIntensity;
      renderer.toneMappingExposure = atm.toneMappingExposure;

      if (currentState === 'playing') {
        sessionTimerRef.current += dt;
        const held = keysHeldRef.current;
        const throttle =
          held.has('KeyW') || held.has('ArrowUp') ? 1 : 0;
        const brake =
          held.has('KeyS') || held.has('ArrowDown') ? 1 : 0;
        const left =
          held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0;
        const right =
          held.has('KeyD') || held.has('ArrowRight') ? 1 : 0;

        const input: VehicleInput = {
          throttle,
          brake,
          steer: left - right,
          handbrake: held.has('Space'),
          nitro: held.has('ShiftLeft') || held.has('ShiftRight'),
        };

        const stepRes = stepVehiclePhysics(
          pState,
          input,
          configRef.current,
          dt,
          CITY_BUILDINGS,
          weatherRef.current
        );

        const trafficHit = resolvePlayerTrafficCollision(
          pState,
          worldObjects.trafficFleet
        );

        soundEngine.updateTelemetry(
          pState.rpm,
          input.throttle,
          pState.isDrifting,
          pState.slipAngleDeg,
          true
        );

        // Collision feedback & camera trauma (Buildings or AI Traffic)
        const hitImpactKmh = Math.max(
          stepRes.collidedBuildingId ? stepRes.impactSpeedKmh : 0,
          trafficHit.collidedNpcId ? trafficHit.impactSpeedKmh : 0
        );
        if (hitImpactKmh > 0) {
          traumaRef.current = Math.min(
            1.0,
            traumaRef.current + hitImpactKmh / 140
          );
          soundEngine.playCollision(hitImpactKmh);
          particles.spawnBurst(
            pState.x,
            pState.y + 0.5,
            pState.z,
            16,
            0xf59e0b,
            9
          );
        }

        // Collectible Beacon feedback
        if (stepRes.newlyCollectedBeaconId) {
          soundEngine.playChime('beacon');
          const bMesh = worldObjects.beaconMeshes.get(
            stepRes.newlyCollectedBeaconId
          );
          if (bMesh) bMesh.visible = false;
          const bObj = APEX_BEACONS.find(
            (b) => b.id === stepRes.newlyCollectedBeaconId
          );
          showTransientBanner(
            `APEX BEACON COLLECTED: ${
              bObj ? bObj.name.toUpperCase() : 'TELEMETRY NODE'
            } (+500 PTS)`
          );
          particles.spawnBurst(pState.x, pState.y + 1, pState.z, 18, 0x06b6d4, 10);
        }

        // Speed Trap feedback
        if (stepRes.newlyTriggeredTrap) {
          soundEngine.playChime('checkpoint');
          showTransientBanner(
            `${stepRes.newlyTriggeredTrap.name.toUpperCase()}: ${
              stepRes.newlyTriggeredTrap.speedKmh
            } KM/H RECORDED!`
          );
        }

        // Tire drift smoke & Wet-Road Water Spray mist particles
        const sinH = Math.sin(pState.heading);
        const cosH = Math.cos(pState.heading);
        if (pState.isDrifting) {
          particles.spawn(
            pState.x - sinH * 1.6 + (Math.random() - 0.5) * 1.2,
            pState.y + 0.18,
            pState.z - cosH * 1.6 + (Math.random() - 0.5) * 1.2,
            (Math.random() - 0.5) * 1.8,
            0.8 + Math.random() * 0.8,
            (Math.random() - 0.5) * 1.8,
            pState.surfaceWetness > 0 ? 0xbae6fd : 0xcbd5e1,
            0.48,
            0.45,
            1.9
          );
        } else if (pState.surfaceWetness > 0 && pState.speedKmh > 25) {
          particles.spawn(
            pState.x - sinH * 1.7 + (Math.random() - 0.5) * 1.3,
            pState.y + 0.16,
            pState.z - cosH * 1.7 + (Math.random() - 0.5) * 1.3,
            (Math.random() - 0.5) * 1.4,
            0.45 + Math.random() * 0.55 * pState.surfaceWetness,
            (Math.random() - 0.5) * 1.4,
            0xbae6fd,
            0.32 * pState.surfaceWetness,
            0.35,
            1.4
          );
        }

        // Active Street Event progression
        const ev = activeEventRef.current;
        if (ev) {
          eventTimerRef.current += dt;
          const cp = ev.checkpoints[eventCpIdxRef.current];
          if (cp) {
            worldObjects.checkpointRingGroup.visible = true;
            worldObjects.checkpointRingGroup.position.set(cp.x, 0, cp.z);
            const distToCp = Math.hypot(pState.x - cp.x, pState.z - cp.z);
            if (distToCp <= cp.radius) {
              pState.totalScore += 400;
              const nextIdx = eventCpIdxRef.current + 1;
              if (nextIdx >= ev.checkpoints.length) {
                handleFinishRunSummary(`${ev.name} — Stage Clear!`);
              } else {
                soundEngine.playChime('checkpoint');
                eventCpIdxRef.current = nextIdx;
                setEventCheckpointIdx(nextIdx);
              }
            }
          }
        } else {
          worldObjects.checkpointRingGroup.visible = false;
        }

        particles.update(dt);
      } else {
        soundEngine.silenceLoops();
      }

      // Sync 3D Vehicle Rig Transforms, 4-Corner Suspension, Ackermann Steer & Night/Storm Headlight Activation
      if (rig) {
        const wheelRadius =
          CHASSIS_SPECS[configRef.current.chassis].dimensions.wheelRadius;
        rig.root.position.set(pState.x, pState.y, pState.z);
        rig.root.rotation.set(
          pState.groundPitch,
          pState.heading,
          pState.groundRoll,
          'YXZ'
        );
        rig.bodyTiltGroup.rotation.x = pState.pitchAngle;
        rig.bodyTiltGroup.rotation.z = pState.rollAngle;
        rig.steeringWheelGroup.rotation.z = -pState.steerAngle * 3.8;

        rig.wheelSteerGroups[0].rotation.y = pState.steerAngleFL;
        rig.wheelSteerGroups[1].rotation.y = pState.steerAngleFR;

        for (let w = 0; w < 4; w++) {
          rig.wheelSuspensionGroups[w].position.y =
            wheelRadius + pState.wheelCompression[w];
          rig.wheelSpinGroups[w].rotation.x = pState.wheelRotation;
        }

        // Activate vehicle headlights, DRL strips, volumetric beams, and SpotLight at night or in rain/storm
        const lightFactor = Math.max(atm.nightFactor, pState.surfaceWetness * 0.72);
        rig.headlightMat.emissiveIntensity = atm.headlightsActive
          ? 3.4 * lightFactor
          : 0.25;
        rig.drlMat.emissiveIntensity = atm.headlightsActive
          ? 2.2 * lightFactor
          : 1.1;
        rig.headlightBeamGroup.visible = atm.headlightsActive;
        rig.headlightSpotLight.visible = atm.headlightsActive;
        rig.headlightSpotLight.intensity = atm.headlightsActive
          ? 7.5 * lightFactor
          : 0;

        const isBraking =
          keysHeldRef.current.has('KeyS') ||
          keysHeldRef.current.has('ArrowDown') ||
          keysHeldRef.current.has('Space');
        rig.taillightMat.emissiveIntensity = isBraking
          ? 4.6
          : atm.headlightsActive
          ? 1.75
          : 0.45;
        rig.nitroFlameGroup.visible =
          currentState === 'playing' &&
          (keysHeldRef.current.has('ShiftLeft') ||
            keysHeldRef.current.has('ShiftRight')) &&
          pState.nitroAmount > 2 &&
          pState.speedKmh > 15;
        rig.exhaustPopGroup.visible =
          currentState === 'playing' && pState.exhaustPopTimer > 0;

        // Keep directional shadow frustum centered on player car
        dirLight.position.set(
          pState.x + atm.sunPosition.x * 0.14,
          Math.max(28, Math.abs(atm.sunPosition.y) * 0.22),
          pState.z + 55
        );
        dirLight.target.position.set(pState.x, pState.y, pState.z);
      }

      // Camera Choreography (Title Showcase vs Garage Inspection vs Chase/Hood/Orbit)
      traumaRef.current = Math.max(0, traumaRef.current - dt * 2.2);
      const shakeMag = traumaRef.current * traumaRef.current * 0.35;
      const shakeX = (Math.random() - 0.5) * shakeMag;
      const shakeY = (Math.random() - 0.5) * shakeMag;

      if (currentState === 'title' || isGarageOpenRef.current) {
        // Smooth turntable showcase around the vehicle with the Suspension Bridge in the background
        const orbitAngle = isGarageOpenRef.current
          ? pState.heading + 2.38 + elapsedSec * 0.25
          : elapsedSec * 0.32 + 0.35;
        const radius = isGarageOpenRef.current ? 5.1 : 6.4;
        const heightOffset = isGarageOpenRef.current ? 1.48 : 2.15;
        _camTargetPos.set(
          pState.x + Math.sin(orbitAngle) * radius,
          pState.y + heightOffset,
          pState.z + Math.cos(orbitAngle) * radius
        );
        _camLookAtPos.set(
          pState.x,
          pState.y + (isGarageOpenRef.current ? 0.12 : 1.05),
          pState.z - (isGarageOpenRef.current ? 0 : 1.5)
        );
        const dampAlpha = 1 - Math.exp(-(isGarageOpenRef.current ? 12 : 6) * dt);
        camera.position.lerp(_camTargetPos, dampAlpha);
        _curLookAtPos.lerp(_camLookAtPos, dampAlpha);
        camera.lookAt(_curLookAtPos);
      } else {
        const sinH = Math.sin(pState.heading);
        const cosH = Math.cos(pState.heading);
        const mode = cameraModeRef.current;

        // Dynamic FOV widening with speed & nitro radial warp intensity
        const targetFov =
          60 +
          Math.min(14, (pState.speedKmh / 320) * 12) +
          pState.nitroWarpIntensity * 14;
        if (Math.abs(camera.fov - targetFov) > 0.08) {
          camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-9 * dt));
          camera.updateProjectionMatrix();
        }

        if (mode === 'hood') {
          _camTargetPos.set(
            pState.x + sinH * 0.45 + shakeX,
            pState.y + 1.38 + shakeY,
            pState.z + cosH * 0.45
          );
          _camLookAtPos.set(
            pState.x + sinH * 24,
            pState.y + 1.2,
            pState.z + cosH * 24
          );
          camera.position.copy(_camTargetPos);
          camera.lookAt(_camLookAtPos);
        } else if (mode === 'orbit') {
          const sideAngle = pState.heading + 0.55;
          _camTargetPos.set(
            pState.x - Math.sin(sideAngle) * 7.5 + shakeX,
            pState.y + 2.8 + shakeY,
            pState.z - Math.cos(sideAngle) * 7.5
          );
          _camLookAtPos.set(pState.x, pState.y + 1.0, pState.z);
          const damp = 1 - Math.exp(-10 * dt);
          camera.position.lerp(_camTargetPos, damp);
          _curLookAtPos.lerp(_camLookAtPos, damp);
          camera.lookAt(_curLookAtPos);
        } else {
          // Chase camera with exponential damping & subtle drift swing
          const chaseDist = 6.6 + Math.min(1.2, pState.speedKmh / 240);
          const chaseHeight = 2.45;
          _camTargetPos.set(
            pState.x - sinH * chaseDist + shakeX,
            pState.y + chaseHeight + shakeY,
            pState.z - cosH * chaseDist
          );
          _camLookAtPos.set(
            pState.x + sinH * 4.5,
            pState.y + 1.05,
            pState.z + cosH * 4.5
          );
          const posDamp = 1 - Math.exp(-12 * dt);
          const lookDamp = 1 - Math.exp(-16 * dt);
          camera.position.lerp(_camTargetPos, posDamp);
          _curLookAtPos.lerp(_camLookAtPos, lookDamp);
          camera.lookAt(_curLookAtPos);
        }
      }

      if (renderWebGl) {
        // Compute 60Hz Real-Time Mini-Map Snapshot & Render directly to Mini-Map Canvas
        const minimapSnap = computeMinimapSnapshot({
          playerX: pState.x,
          playerZ: pState.z,
          playerHeading: pState.heading,
          playerSpeedKmh: pState.speedKmh,
          buildings: CITY_BUILDINGS,
          trafficFleet: worldObjects.trafficFleet,
          trafficSignals: worldObjects.trafficSignals,
          activeEvent: activeEventRef.current,
          eventCheckpointIdx: eventCpIdxRef.current,
          mapSizePx: MINIMAP_SIZE_PX,
          zoomMode: minimapZoomRef.current,
        });

        if (minimapCanvasRef.current) {
          renderMinimapToCanvas(
            minimapCanvasRef.current,
            minimapSnap,
            pState.collectedBeacons,
            elapsedSec
          );
        }

        if (nitroWarpCanvasRef.current) {
          renderNitroWarpToCanvas(nitroWarpCanvasRef.current, {
            warpIntensity:
              currentState === 'playing' ? pState.nitroWarpIntensity : 0,
            isNitroActive: pState.isNitroActive,
            speedKmh: pState.speedKmh,
            nitroAmount: pState.nitroAmount,
            steerAngle: pState.steerAngle,
            elapsedSec,
          });
        }

        // Throttle React HUD state updates to ~10Hz
        if (nowMs - lastHudSyncMs > 95) {
          lastHudSyncMs = nowMs;
          if (activeEventRef.current) {
            setEventElapsedSec(eventTimerRef.current);
          }
          setTelemetry({
            speedKmh: pState.speedKmh,
            rpm: pState.rpm,
            gear: pState.gear,
            turboPsi: pState.turboPsi,
            nitroAmount: pState.nitroAmount,
            tireHeat: pState.tireHeat,
            isDrifting: pState.isDrifting,
            slipAngleDeg: pState.slipAngleDeg,
            driftScoreCurrent: pState.driftScoreCurrent,
            driftMultiplier: pState.driftMultiplier,
            totalScore: pState.totalScore,
            topSpeedRecordedKmh: pState.topSpeedRecordedKmh,
            distanceDrivenMeters: pState.distanceDrivenMeters,
            currentDistrict: pState.currentDistrict,
            collectedBeacons: [...pState.collectedBeacons],
            x: pState.x,
            z: pState.z,
            heading: pState.heading,
            timeOfDayHours: atm.timeHours,
            formattedTime: atm.formattedTime,
            timePhase: atm.phase,
            lightsActive: atm.headlightsActive,
            weather: pState.weather,
            surfaceWetness: pState.surfaceWetness,
            surfaceTractionMultiplier: pState.surfaceTractionMultiplier,
            isNitroActive: pState.isNitroActive,
            nitroWarpIntensity: pState.nitroWarpIntensity,
            nearbyBuildingsCount: minimapSnap.nearbyBuildingsCount,
            freeFlowCount: minimapSnap.fleetSummary.freeFlowCount,
            moderateCount: minimapSnap.fleetSummary.moderateCount,
            congestedCount: minimapSnap.fleetSummary.congestedCount,
            avgFleetSpeedKmh: minimapSnap.fleetSummary.avgFleetSpeedKmh,
            gpsTargetLabel: minimapSnap.gpsRoute.targetLabel,
            gpsRouteDistanceMeters: minimapSnap.gpsRoute.totalDistanceMeters,
          });
        }

        renderer.render(scene, camera);
      }
    }

    function tick() {
      const nowMs = performance.now();
      const rawDt = (nowMs - lastTimeMs) / 1000;
      lastTimeMs = nowMs;
      const dt = Math.min(Math.max(rawDt, 0.004), 0.05);

      stepSimulationBy(dt, nowMs, true);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    // Deterministic test/verification hooks
    const win = window as unknown as Record<string, unknown>;
    win.advanceTime = (ms: number) => {
      const stepSec = 1 / 60;
      const steps = Math.max(1, Math.round(ms / 1000 / stepSec));
      for (let i = 0; i < steps; i++) {
        lastTimeMs += stepSec * 1000;
        stepSimulationBy(stepSec, lastTimeMs + 200, i === steps - 1);
      }
    };
    win.setTimeOfDay = (hours: number) => {
      timeOfDayRef.current = ((hours % 24) + 24) % 24;
      stepSimulationBy(1 / 60, performance.now() + 200);
    };
    win.setWeather = (condition: WeatherCondition) => {
      worldObjects.setWeather(condition);
      weatherRef.current = condition;
      const wProf = WEATHER_PROFILES[condition];
      physicsRef.current.weather = condition;
      physicsRef.current.surfaceWetness = wProf.surfaceWetness;
      physicsRef.current.surfaceTractionMultiplier = wProf.tractionMultiplier;
      stepSimulationBy(1 / 60, performance.now() + 200);
    };
    win.render_game_to_text = () => {
      const p = physicsRef.current;
      const snap = computeMinimapSnapshot({
        playerX: p.x,
        playerZ: p.z,
        playerHeading: p.heading,
        playerSpeedKmh: p.speedKmh,
        buildings: CITY_BUILDINGS,
        trafficFleet: worldObjects.trafficFleet,
        trafficSignals: worldObjects.trafficSignals,
        activeEvent: activeEventRef.current,
        eventCheckpointIdx: eventCpIdxRef.current,
        mapSizePx: MINIMAP_SIZE_PX,
        zoomMode: minimapZoomRef.current,
      });
      const aggressiveDriversCount = worldObjects.trafficFleet.filter(
        (v) => v.driverProfile === 'aggressive'
      ).length;
      const reactingTrafficCount = worldObjects.trafficFleet.filter(
        (v) => v.evasionState !== 'none' || Math.abs(v.currentLaneOffset) > 0.1
      ).length;
      const stoppedAtLightCount = worldObjects.trafficFleet.filter(
        (v) => v.evasionState === 'stopped_at_light'
      ).length;
      return JSON.stringify({
        state: gameStateRef.current,
        weather: {
          condition: weatherRef.current,
          surfaceWetness: p.surfaceWetness,
          tractionMultiplier: p.surfaceTractionMultiplier,
        },
        player: {
          x: Math.round(p.x * 10) / 10,
          z: Math.round(p.z * 10) / 10,
          speedKmh: Math.round(p.speedKmh),
          heading: Math.round(p.heading * 100) / 100,
          nitroAmount: Math.round(p.nitroAmount),
          isNitroActive: p.isNitroActive,
          nitroWarpIntensity: Math.round(p.nitroWarpIntensity * 100) / 100,
        },
        traffic: {
          aggressiveDriversCount,
          reactingTrafficCount,
          stoppedAtLightCount,
          totalSignals: worldObjects.trafficSignals.length,
        },
        minimap: {
          zoomMode: snap.zoomMode,
          nearbyBuildingsCount: snap.nearbyBuildingsCount,
          checkpointsCount: snap.checkpoints.length,
          gpsRoute: {
            targetId: snap.gpsRoute.targetId,
            targetLabel: snap.gpsRoute.targetLabel,
            targetType: snap.gpsRoute.targetType,
            waypointsCount: snap.gpsRoute.waypoints.length,
            totalDistanceMeters: Math.round(
              snap.gpsRoute.totalDistanceMeters
            ),
            nextTurnDirection: snap.gpsRoute.nextTurnDirection,
          },
          fleetSummary: snap.fleetSummary,
        },
      });
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      soundEngine.silenceLoops();
      renderer.dispose();
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#090d14]">
      {/* Isolated WebGL Canvas Mount (never re-rendered by React HUD updates) */}
      <div
        ref={canvasMountRef}
        data-testid="webgl-canvas-container"
        className="w-full h-full"
      />

      {/* 60Hz Screen-Space Nitro Radial Warp & High-Speed Motion Blur Overlay */}
      <NitroWarpOverlay canvasRef={nitroWarpCanvasRef} />

      {/* World-Matched HUD, Title Screen & Modals */}
      <GameHud
        gameState={gameState}
        telemetry={telemetry}
        vehicleConfig={vehicleConfig}
        cameraMode={cameraMode}
        minimapZoomMode={minimapZoomMode}
        minimapCanvasRef={minimapCanvasRef}
        isMuted={isMuted}
        isGarageOpen={isGarageOpen}
        activeEvent={activeEvent}
        eventCheckpointIdx={eventCheckpointIdx}
        eventElapsedSec={eventElapsedSec}
        bannerAlert={bannerAlert}
        runSummary={runSummary}
        onStartGame={handleStartGame}
        onToggleGarage={handleToggleGarage}
        onCycleCamera={handleCycleCamera}
        onToggleMinimapZoom={handleToggleMinimapZoom}
        onCycleTimeOfDay={handleCycleTimeOfDay}
        onToggleWeather={handleToggleWeather}
        onToggleMute={handleToggleMute}
        onResetCar={handleResetCar}
        onTogglePause={handleTogglePause}
        onReturnTitle={handleReturnTitle}
        onStartEvent={handleStartEvent}
        onFinishRunSummary={() => handleFinishRunSummary()}
      />

      {/* Collapsible Bottom Vehicle Customization Garage Dock */}
      {isGarageOpen &&
        (gameState === 'title' || gameState === 'playing') && (
          <GaragePanel
            config={vehicleConfig}
            onChange={handleConfigChange}
            onClose={() => {
              isGarageOpenRef.current = false;
              setIsGarageOpen(false);
            }}
          />
        )}
    </main>
  );
}
