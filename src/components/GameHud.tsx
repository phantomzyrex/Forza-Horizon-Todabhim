import React from 'react';
import {
  APEX_BEACONS,
  DISTRICT_INFO,
  DistrictId,
  STREET_EVENTS,
  StreetEvent,
} from '../game/worldData';
import { TimePhase } from '../game/dayNight';
import { MinimapZoomMode } from '../game/minimapProjection';
import { CHASSIS_SPECS, VehicleConfig } from '../game/vehicleConfig';
import { WEATHER_PROFILES, WeatherCondition } from '../game/worldBuilder';
import { MinimapOverlay } from './MinimapOverlay';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';
export type CameraMode = 'chase' | 'hood' | 'orbit';

export interface HudTelemetrySnapshot {
  speedKmh: number;
  rpm: number;
  gear: number;
  turboPsi: number;
  nitroAmount: number;
  tireHeat: number;
  isDrifting: boolean;
  slipAngleDeg: number;
  driftScoreCurrent: number;
  driftMultiplier: number;
  totalScore: number;
  topSpeedRecordedKmh: number;
  distanceDrivenMeters: number;
  currentDistrict: DistrictId;
  collectedBeacons: string[];
  x: number;
  z: number;
  heading: number;
  timeOfDayHours: number;
  formattedTime: string;
  timePhase: TimePhase;
  lightsActive: boolean;
  weather: WeatherCondition;
  surfaceWetness: number;
  surfaceTractionMultiplier: number;
  isNitroActive: boolean;
  nitroWarpIntensity: number;
  nearbyBuildingsCount: number;
  freeFlowCount: number;
  moderateCount: number;
  congestedCount: number;
  avgFleetSpeedKmh: number;
  gpsTargetLabel?: string;
  gpsRouteDistanceMeters?: number;
}

export interface RunSummarySnapshot {
  eventName: string;
  clearTimeSec: number;
  score: number;
  bestScore: number;
  topSpeedKmh: number;
  beaconsFound: number;
}

interface GameHudProps {
  gameState: GameState;
  telemetry: HudTelemetrySnapshot;
  vehicleConfig: VehicleConfig;
  cameraMode: CameraMode;
  minimapZoomMode: MinimapZoomMode;
  minimapCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  isMuted: boolean;
  isGarageOpen: boolean;
  activeEvent: StreetEvent | null;
  eventCheckpointIdx: number;
  eventElapsedSec: number;
  bannerAlert: string | null;
  runSummary: RunSummarySnapshot | null;
  onStartGame: () => void;
  onToggleGarage: () => void;
  onCycleCamera: () => void;
  onToggleMinimapZoom: () => void;
  onCycleTimeOfDay: () => void;
  onToggleWeather: () => void;
  onToggleMute: () => void;
  onResetCar: () => void;
  onTogglePause: () => void;
  onReturnTitle: () => void;
  onStartEvent: (ev: StreetEvent | null) => void;
  onFinishRunSummary: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  gameState,
  telemetry,
  vehicleConfig,
  cameraMode,
  minimapZoomMode,
  minimapCanvasRef,
  isMuted,
  isGarageOpen,
  activeEvent,
  eventCheckpointIdx,
  eventElapsedSec,
  bannerAlert,
  runSummary,
  onStartGame,
  onToggleGarage,
  onCycleCamera,
  onToggleMinimapZoom,
  onCycleTimeOfDay,
  onToggleWeather,
  onToggleMute,
  onResetCar,
  onTogglePause,
  onReturnTitle,
  onStartEvent,
  onFinishRunSummary,
}) => {
  const district = DISTRICT_INFO[telemetry.currentDistrict];
  const chassisSpec = CHASSIS_SPECS[vehicleConfig.chassis];
  const weatherProfile = WEATHER_PROFILES[telemetry.weather] ?? WEATHER_PROFILES.clear;

  const activeCheckpointDistanceMeters =
    activeEvent && activeEvent.checkpoints[eventCheckpointIdx]
      ? Math.hypot(
          activeEvent.checkpoints[eventCheckpointIdx].x - telemetry.x,
          activeEvent.checkpoints[eventCheckpointIdx].z - telemetry.z
        )
      : null;

  const rpmRatio = Math.min(1, Math.max(0, telemetry.rpm / 8200));

  return (
    <div className="fixed inset-0 pointer-events-none z-20 select-none overflow-hidden">
      {/* ==================== TITLE SCREEN ==================== */}
      {gameState === 'title' && (
        <div className="w-full h-full flex flex-col justify-between p-8 md:p-12 bg-gradient-to-r from-[#090d14]/80 via-[#090d14]/25 to-transparent">
          {/* Left-Third Asymmetric Negative Space Lockup */}
          <div className="max-w-xl pointer-events-auto">
            {/* Bespoke Inline SVG Title Emblem Lockup */}
            <svg
              viewBox="0 0 520 132"
              className="w-full max-w-[470px] h-auto mb-5 drop-shadow-[0_6px_18px_rgba(0,0,0,0.9)]"
              role="img"
              aria-label="Apex Horizon: Metropolis"
            >
              {/* Outer metallic tachometer crest frame */}
              <path
                d="M12 24 L48 8 L496 8 L508 28 L484 118 L24 118 L8 96 Z"
                fill="#090d14"
                fillOpacity="0.88"
                stroke="#334155"
                strokeWidth="2"
              />
              {/* Accent speed-stripe geometry */}
              <path
                d="M18 26 L50 12 L180 12 L166 26 Z"
                fill="#f59e0b"
              />
              <path
                d="M448 112 L480 112 L496 34 L484 34 Z"
                fill="#06b6d4"
              />
              {/* Stylized custom automotive crest icon */}
              <g transform="translate(28, 38)">
                <polygon
                  points="26,0 52,14 44,48 8,48 0,14"
                  fill="#1e293b"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                />
                <path
                  d="M12 36 L26 10 L40 36 L32 36 L26 22 L20 36 Z"
                  fill="#f59e0b"
                />
              </g>
              {/* Main Display Title Typography */}
              <text
                x="96"
                y="64"
                fill="#f8fafc"
                fontFamily="'Chakra Petch', sans-serif"
                fontWeight="700"
                fontStyle="italic"
                fontSize="42"
                letterSpacing="2"
              >
                APEX HORIZON
              </text>
              <text
                x="98"
                y="98"
                fill="#f59e0b"
                fontFamily="'Chakra Petch', sans-serif"
                fontWeight="600"
                fontSize="20"
                letterSpacing="7.5"
              >
                METROPOLIS OPEN WORLD
              </text>
            </svg>

            <p className="text-sm md:text-base text-slate-200 max-w-md mb-6 leading-relaxed hud-stroke">
              Explore five interconnected urban districts, tune suspension and
              forced-induction ratios in real time, and master high-angle
              powerslides across the Bayfront Suspension Bridge.
            </p>

            {/* Primary & Secondary Action CTAs (<= 3 actions total) */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-start="true"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onStartGame();
                }}
                className="px-7 py-3.5 text-base font-display font-bold tracking-wider uppercase bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow-xl transition-transform active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              >
                Enter Metropolis
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleGarage();
                }}
                className="px-5 py-3.5 text-sm font-display font-semibold tracking-wide uppercase bg-[#0f172a] hover:bg-slate-800 text-slate-100 border border-slate-600 rounded-lg shadow-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isGarageOpen ? 'Close Garage [G]' : 'Customize Vehicle [G]'}
              </button>
            </div>
          </div>

          {/* Single Flat Borderless Control Hint Line in Bottom Safe Margin */}
          {!isGarageOpen && (
            <div className="text-xs md:text-sm font-mono-tabular text-slate-300 tracking-wide hud-stroke">
              WASD / Arrows Drive · Space Handbrake · Shift Nitro · G Garage · Z
              Radar · V Weather · T Day/Night · C Camera
            </div>
          )}
        </div>
      )}

      {/* ==================== PLAYING HUD ==================== */}
      {gameState === 'playing' && (
        <>
          {/* Top-Left Perimeter Cluster: 60Hz Real-Time Radar Minimap + District & Event Selector */}
          <div className="fixed top-4 left-4 flex items-start gap-3 pointer-events-auto">
            <MinimapOverlay
              canvasRef={minimapCanvasRef}
              zoomMode={minimapZoomMode}
              onToggleZoomMode={onToggleMinimapZoom}
              nearbyBuildingsCount={telemetry.nearbyBuildingsCount}
              freeFlowCount={telemetry.freeFlowCount}
              moderateCount={telemetry.moderateCount}
              congestedCount={telemetry.congestedCount}
              avgFleetSpeedKmh={telemetry.avgFleetSpeedKmh}
              activeCheckpointDistanceMeters={activeCheckpointDistanceMeters}
              gpsTargetLabel={telemetry.gpsTargetLabel}
              gpsRouteDistanceMeters={telemetry.gpsRouteDistanceMeters}
            />

            {/* District & Event Selection Cluster */}
            <div className="bg-[#090d14]/92 border border-slate-700/80 rounded-xl px-3.5 py-2.5 shadow-xl max-w-[290px]">
              <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-amber-400">
                {district.name}
              </div>
              <div className="text-xs text-slate-300 truncate mb-2">
                {chassisSpec.name} · Beacons {telemetry.collectedBeacons.length}/
                {APEX_BEACONS.length}
              </div>

              {/* Street Event Quick-Launch Buttons */}
              <div className="flex flex-wrap gap-1">
                {STREET_EVENTS.map((ev) => {
                  const isActive = activeEvent?.id === ev.id;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onStartEvent(isActive ? null : ev);
                      }}
                      className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {ev.type === 'sprint'
                        ? 'Bridge Sprint'
                        : ev.type === 'drift'
                        ? 'Harbor Drift'
                        : 'Apex Circuit'}
                    </button>
                  );
                })}
              </div>

              {/* Active Event Gate & Timer Readout (Integrated cleanly inside top-left card) */}
              {activeEvent && (
                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[9px] font-mono-tabular uppercase tracking-wider text-amber-400">
                      {activeEvent.name}
                    </div>
                    <div className="text-xs font-display font-bold text-white tabular-nums">
                      GATE {eventCheckpointIdx + 1} /{' '}
                      {activeEvent.checkpoints.length} ·{' '}
                      {eventElapsedSec.toFixed(1)}s
                    </div>
                  </div>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onStartEvent(null);
                    }}
                    className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 cursor-pointer shrink-0"
                  >
                    Abort
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Top-Center Live Drift & Alert Banner (positioned at top-40 below top-left & top-right cards) */}
          {(telemetry.driftScoreCurrent > 10 || bannerAlert) && (
            <div className="fixed top-40 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
              {telemetry.driftScoreCurrent > 10 && (
                <div className="bg-[#090d14]/95 border border-cyan-400/80 rounded-lg px-4 py-1.5 shadow-xl text-center">
                  <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-cyan-300">
                    DRIFT COMBO · {Math.round(telemetry.slipAngleDeg)}° ANGLE
                  </div>
                  <div className="text-xl font-display font-bold text-white tabular-nums">
                    +{Math.round(telemetry.driftScoreCurrent)} PTS{' '}
                    <span className="text-amber-400">
                      ×{telemetry.driftMultiplier.toFixed(1)}
                    </span>
                  </div>
                </div>
              )}

              {bannerAlert && (
                <div className="bg-[#090d14]/95 border border-emerald-400/80 rounded-lg px-3.5 py-1 text-xs font-mono-tabular text-emerald-300 shadow-lg">
                  {bannerAlert}
                </div>
              )}
            </div>
          )}

          {/* Top-Right Perimeter Cluster: Score + Compact Utility SVG Controls */}
          <div className="fixed top-4 right-4 flex items-center gap-2 pointer-events-auto">
            <div className="bg-[#090d14]/92 border border-slate-700/80 rounded-xl px-3.5 py-1.5 text-right mr-1">
              <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-slate-400">
                REP SCORE
              </div>
              <div className="text-lg font-display font-bold text-amber-400 tabular-nums leading-tight">
                {Math.round(telemetry.totalScore)}
              </div>
            </div>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Customize Vehicle Garage"
              title="Garage [G]"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleGarage();
              }}
              className={`h-10 px-3 rounded-lg border flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isGarageOpen
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-[#090d14]/92 text-slate-200 border-slate-700 hover:border-slate-500'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
              </svg>
              <span>Garage [G]</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Toggle Weather Condition"
              title="Toggle Weather [V]"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleWeather();
              }}
              className={`h-10 px-2.5 rounded-lg border flex items-center gap-1.5 text-xs font-mono-tabular cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                telemetry.weather === 'heavy_storm'
                  ? 'bg-sky-950/95 text-sky-200 border-sky-400'
                  : telemetry.weather === 'light_rain'
                  ? 'bg-slate-900/95 text-cyan-300 border-cyan-500/80'
                  : 'bg-[#090d14]/92 hover:bg-slate-800 text-slate-200 border-slate-700'
              }`}
            >
              {telemetry.weather === 'heavy_storm' ? (
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 fill-amber-400 shrink-0"
                >
                  <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM11 22l1-4H9l4-6-1 4h3l-4 6z" />
                </svg>
              ) : telemetry.weather === 'light_rain' ? (
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 fill-cyan-400 shrink-0"
                >
                  <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM8 22l1.5-3h2L10 22H8zm5 0l1.5-3h2L15 22h-2z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 fill-emerald-400 shrink-0"
                >
                  <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                </svg>
              )}
              <span>{weatherProfile.shortLabel} [V]</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Cycle Time of Day"
              title="Cycle Day/Night [T]"
              onClick={(e) => {
                e.currentTarget.blur();
                onCycleTimeOfDay();
              }}
              className="h-10 px-2.5 rounded-lg bg-[#090d14]/92 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1.5 text-xs font-mono-tabular cursor-pointer whitespace-nowrap shrink-0"
            >
              {telemetry.lightsActive ? (
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 fill-amber-400 shrink-0"
                >
                  <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 fill-sky-400 shrink-0"
                >
                  <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z" />
                </svg>
              )}
              <span>
                {telemetry.formattedTime} {telemetry.timePhase} [T]
              </span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Cycle Camera View"
              title="Camera View [C]"
              onClick={(e) => {
                e.currentTarget.blur();
                onCycleCamera();
              }}
              className="h-10 px-2.5 rounded-lg bg-[#090d14]/92 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1 text-xs font-mono-tabular cursor-pointer whitespace-nowrap shrink-0"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M12 9a3 3 0 100 6 3 3 0 000-6zm0-4.5c5 0 9.27 3.11 11 7.5-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5z" />
              </svg>
              <span className="uppercase">{cameraMode} [C]</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Reset Vehicle Position"
              title="Reset Car [R]"
              onClick={(e) => {
                e.currentTarget.blur();
                onResetCar();
              }}
              className="w-10 h-10 rounded-lg bg-[#090d14]/92 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center cursor-pointer shrink-0"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              title="Mute [M]"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-10 h-10 rounded-lg bg-[#090d14]/92 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center cursor-pointer shrink-0"
            >
              {isMuted ? (
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-rose-400">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause Game"
              title="Pause [P / Esc]"
              onClick={(e) => {
                e.currentTarget.blur();
                onTogglePause();
              }}
              className="w-10 h-10 rounded-lg bg-[#090d14]/92 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center cursor-pointer shrink-0"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            </button>
          </div>

          {/* Bottom-Right Perimeter Cluster: Tachometer, Gear & Speedometer (hidden when Garage drawer is expanded) */}
          {!isGarageOpen && (
            <div className="fixed bottom-4 right-4 bg-[#090d14]/94 border-2 border-slate-700/90 rounded-2xl p-4 shadow-2xl w-[268px] pointer-events-auto">
              {/* SVG RPM Tachometer Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-[10px] font-mono-tabular text-slate-400 mb-1">
                  <span>RPM ×1000</span>
                  <span className="text-amber-400">
                    {telemetry.turboPsi >= 0
                      ? `+${telemetry.turboPsi.toFixed(1)} BAR`
                      : 'VAC'}
                  </span>
                </div>
                <svg viewBox="0 0 220 18" className="w-full h-4">
                  {Array.from({ length: 18 }).map((_, i) => {
                    const active = i / 18 <= rpmRatio;
                    const isRedline = i >= 14;
                    return (
                      <rect
                        key={i}
                        x={i * 12.2}
                        y={2}
                        width={9.5}
                        height={14}
                        rx={1.5}
                        fill={
                          active
                            ? isRedline
                              ? '#ef4444'
                              : '#f59e0b'
                            : '#1e293b'
                        }
                      />
                    );
                  })}
                </svg>
              </div>

              {/* Hero Speedometer & Gear Indicator (~3:1 Hero-to-Kicker scale) */}
              <div className="flex items-baseline justify-between border-y border-slate-800 py-2 my-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-lg bg-slate-900 border border-slate-700 flex flex-col items-center justify-center">
                    <span className="text-[9px] font-mono-tabular uppercase text-slate-400 leading-none">
                      GEAR
                    </span>
                    <span className="font-display font-bold text-xl text-amber-400 leading-tight">
                      {telemetry.gear === -1 ? 'R' : telemetry.gear}
                    </span>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono-tabular uppercase text-slate-400">
                      TIRE · GRIP
                    </div>
                    <div className="text-xs font-mono-tabular text-slate-200 flex items-center gap-1.5">
                      <span>{Math.round(telemetry.tireHeat)}°C</span>
                      <span
                        className={
                          telemetry.weather === 'heavy_storm'
                            ? 'text-sky-400 font-semibold'
                            : telemetry.weather === 'light_rain'
                            ? 'text-cyan-300 font-semibold'
                            : 'text-emerald-400'
                        }
                      >
                        {Math.round(telemetry.surfaceTractionMultiplier * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-display font-bold text-4xl text-white tabular-nums leading-none tracking-tight">
                    {Math.round(telemetry.speedKmh)}
                  </div>
                  <div className="text-[11px] font-mono-tabular uppercase tracking-widest text-slate-400 mt-0.5">
                    KM/H
                  </div>
                </div>
              </div>

              {/* Nitrous Oxide & Session Finish Action */}
              <div className="mt-2 space-y-2">
                <div>
                  <div className="flex justify-between items-center text-[10px] font-mono-tabular text-cyan-300 mb-1">
                    <span className="flex items-center gap-1.5">
                      <span>N2O BOOST [SHIFT]</span>
                      {telemetry.nitroWarpIntensity > 0.05 && (
                        <span className="px-1 py-0.2 rounded bg-cyan-500/25 border border-cyan-400/70 text-[9px] text-cyan-200 font-semibold">
                          WARP {Math.round(telemetry.nitroWarpIntensity * 100)}%
                        </span>
                      )}
                    </span>
                    <span>{Math.round(telemetry.nitroAmount)}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-all duration-75 ${
                        telemetry.isNitroActive
                          ? 'bg-gradient-to-r from-cyan-400 via-sky-300 to-amber-300'
                          : 'bg-cyan-400'
                      }`}
                      style={{ width: `${Math.round(telemetry.nitroAmount)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-mono-tabular text-slate-400">
                    TOP {Math.round(telemetry.topSpeedRecordedKmh)} KM/H
                  </span>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onFinishRunSummary();
                    }}
                    className="text-[11px] font-mono-tabular text-amber-400 hover:text-amber-300 underline cursor-pointer"
                  >
                    Run Telemetry Summary
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ==================== PAUSE MODAL ==================== */}
      {gameState === 'paused' && (
        <div className="w-full h-full bg-black/75 flex items-center justify-center p-4 pointer-events-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-modal-title"
            className="bg-[#0b111e] border-2 border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl"
          >
            <h2
              id="pause-modal-title"
              className="font-display font-bold text-2xl text-white tracking-wide mb-1"
            >
              SIMULATION PAUSED
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              {chassisSpec.name} · {district.name}
            </p>

            {/* 3 Tabular Stat Tiles */}
            <div className="grid grid-cols-3 gap-2.5 mb-6">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] font-mono-tabular uppercase text-slate-400">
                  REP SCORE
                </div>
                <div className="font-display font-bold text-lg text-amber-400 tabular-nums">
                  {Math.round(telemetry.totalScore)}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] font-mono-tabular uppercase text-slate-400">
                  TOP SPEED
                </div>
                <div className="font-display font-bold text-lg text-cyan-300 tabular-nums">
                  {Math.round(telemetry.topSpeedRecordedKmh)} KM/H
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] font-mono-tabular uppercase text-slate-400">
                  BEACONS
                </div>
                <div className="font-display font-bold text-lg text-emerald-300 tabular-nums">
                  {telemetry.collectedBeacons.length} / {APEX_BEACONS.length}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onTogglePause}
                className="w-full py-2.5 text-sm font-display font-bold uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg cursor-pointer"
              >
                Resume Driving [Esc]
              </button>
              <button
                type="button"
                onClick={() => {
                  onTogglePause();
                  onResetCar();
                }}
                className="w-full py-2.5 text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg border border-slate-700 cursor-pointer"
              >
                Reset Vehicle to Central Plaza
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="w-full py-2.5 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 cursor-pointer"
              >
                Return to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== RUN COMPLETE / VICTORY MODAL ==================== */}
      {gameState === 'gameover' && runSummary && (
        <div className="w-full h-full bg-black/80 flex items-center justify-center p-4 pointer-events-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gameover-modal-title"
            className="bg-[#0b111e] border-2 border-amber-500/80 rounded-2xl p-6 max-w-md w-full shadow-2xl"
          >
            <div className="text-xs font-mono-tabular uppercase tracking-widest text-amber-400 mb-1">
              METROPOLIS TELEMETRY REPORT
            </div>
            <h2
              id="gameover-modal-title"
              className="font-display font-bold text-2xl text-white tracking-wide mb-4"
            >
              {runSummary.eventName}
            </h2>

            <div className="grid grid-cols-3 gap-2.5 mb-6">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] font-mono-tabular uppercase text-slate-400">
                  SESSION TIME
                </div>
                <div className="font-display font-bold text-xl text-white tabular-nums">
                  {Math.round(runSummary.clearTimeSec)}s
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] font-mono-tabular uppercase text-slate-400">
                  SCORE / BEST
                </div>
                <div className="font-display font-bold text-xl text-amber-400 tabular-nums">
                  {Math.round(runSummary.score)}
                </div>
                <div className="text-[10px] font-mono-tabular text-slate-400">
                  Best {Math.round(runSummary.bestScore)}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] font-mono-tabular uppercase text-slate-400">
                  PEAK SPEED
                </div>
                <div className="font-display font-bold text-xl text-cyan-300 tabular-nums">
                  {Math.round(runSummary.topSpeedKmh)}
                </div>
                <div className="text-[10px] font-mono-tabular text-slate-400">
                  KM/H
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={onStartGame}
                className="w-full py-3 text-sm font-display font-bold uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg cursor-pointer"
              >
                Continue Driving [Enter]
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="w-full py-2.5 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 cursor-pointer"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
