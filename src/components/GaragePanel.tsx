import React, { useState } from 'react';
import {
  CALIPER_SWATCHES,
  CHASSIS_SPECS,
  ChassisId,
  DiffuserId,
  PAINT_SWATCHES,
  PRESET_CONFIGS,
  PaintFinishId,
  RIM_SWATCHES,
  RimStyleId,
  RoofAccessoryId,
  SpoilerId,
  SplitterId,
  UnderglowId,
  VehicleConfig,
  computeVehicleRatings,
} from '../game/vehicleConfig';
import { soundEngine } from '../game/audio';

interface GaragePanelProps {
  config: VehicleConfig;
  onChange: (next: VehicleConfig) => void;
  onClose: () => void;
}

type GarageTab = 'chassis' | 'paint' | 'aero' | 'wheels' | 'tuning';

export const GaragePanel: React.FC<GaragePanelProps> = ({
  config,
  onChange,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<GarageTab>('chassis');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const ratings = computeVehicleRatings(config);
  const spec = CHASSIS_SPECS[config.chassis];

  const updateField = <K extends keyof VehicleConfig>(
    key: K,
    val: VehicleConfig[K]
  ) => {
    soundEngine.playChime('ui');
    onChange({ ...config, [key]: val });
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(940px,95vw)] pointer-events-auto transition-transform duration-200"
      aria-label="Vehicle Customization Garage"
    >
      {/* Top Collapse / Zen Mode Drawer Handle + Live Performance Telemetry Strip */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#0b111e] border border-slate-700/80 rounded-t-xl shadow-2xl">
        <div className="flex items-center gap-3 overflow-x-auto">
          <span className="font-display font-bold text-sm tracking-wide text-amber-400 whitespace-nowrap shrink-0">
            APEX CUSTOMS GARAGE
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono-tabular text-slate-200 whitespace-nowrap shrink-0">
            {spec.name} ({spec.drivetrain})
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono-tabular text-amber-300 whitespace-nowrap shrink-0">
            {ratings.powerHp} HP
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono-tabular text-cyan-300 whitespace-nowrap shrink-0">
            TOP {ratings.topSpeedKmh} KM/H
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono-tabular text-emerald-300 whitespace-nowrap shrink-0">
            0-100 {ratings.zeroToHundredSec}s
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono-tabular text-slate-300 whitespace-nowrap shrink-0">
            GRIP {ratings.lateralG}G · DRIFT {ratings.driftIndex}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsCollapsed((v) => !v)}
            className="px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800/90 hover:bg-slate-700 rounded border border-slate-600/70 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isCollapsed ? '▴ Show Controls' : '▾ Hide Controls'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded whitespace-nowrap shrink-0 cursor-pointer"
          >
            Exit Garage [G]
          </button>
        </div>
      </div>

      {/* Main Dock Content */}
      {!isCollapsed && (
        <div className="bg-[#090e1a] border-x border-b border-slate-700/80 rounded-b-xl p-4 shadow-2xl">
          {/* Category Tabs + Quick Presets */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
              {(
                [
                  { id: 'chassis', label: '1. Chassis' },
                  { id: 'paint', label: '2. Paint & Finish' },
                  { id: 'aero', label: '3. Aero & Bodykit' },
                  { id: 'wheels', label: '4. Rims & Stance' },
                  { id: 'tuning', label: '5. Dyno & Gear Tuning' },
                ] as Array<{ id: GarageTab; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playChime('ui');
                    setActiveTab(tab.id);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Factory Build Presets */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 mr-1 whitespace-nowrap">
                Builds:
              </span>
              {Object.entries(PRESET_CONFIGS).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    soundEngine.playChime('ui');
                    onChange({ ...item.config });
                  }}
                  className="px-2.5 py-1 text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab 1: Chassis Selection */}
          {activeTab === 'chassis' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(Object.keys(CHASSIS_SPECS) as ChassisId[]).map((cid) => {
                const cSpec = CHASSIS_SPECS[cid];
                const isSelected = config.chassis === cid;
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => updateField('chassis', cid)}
                    className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800/95 border-amber-500'
                        : 'bg-slate-900/90 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-display font-bold text-sm text-white">
                        {cSpec.name}
                      </span>
                      <span className="text-xs font-mono-tabular text-amber-400">
                        {cSpec.drivetrain}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                      {cSpec.tagline}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono-tabular text-slate-300 whitespace-nowrap overflow-hidden">
                      <span className="whitespace-nowrap shrink-0">{cSpec.basePowerHp} HP</span>
                      <span aria-hidden="true">·</span>
                      <span className="whitespace-nowrap shrink-0">{cSpec.baseWeightKg} KG</span>
                      <span aria-hidden="true">·</span>
                      <span className="whitespace-nowrap shrink-0">{cSpec.baseTopSpeedKmh} KM/H</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Tab 2: Paint, Finish & Underglow */}
          {activeTab === 'paint' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-medium text-slate-300 mb-2">
                  Primary Body Color
                </div>
                <div className="flex flex-wrap gap-2">
                  {PAINT_SWATCHES.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      aria-label={`Paint ${sw.name}`}
                      title={sw.name}
                      onClick={() => updateField('paintColor', sw.hex)}
                      className={`w-7 h-7 rounded-md border-2 cursor-pointer transition-transform ${
                        config.paintColor === sw.hex
                          ? 'border-white scale-110'
                          : 'border-slate-700 hover:scale-105'
                      }`}
                      style={{ backgroundColor: sw.hex }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-300 mb-2">
                  Surface Clearcoat Finish
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'metallic', label: 'Metallic Flake' },
                      { id: 'pearlescent', label: 'Pearlescent' },
                      { id: 'matte', label: 'Stealth Matte' },
                      { id: 'carbon', label: 'Exposed Carbon' },
                    ] as Array<{ id: PaintFinishId; label: string }>
                  ).map((fin) => (
                    <button
                      key={fin.id}
                      type="button"
                      onClick={() => updateField('paintFinish', fin.id)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded border whitespace-nowrap cursor-pointer ${
                        config.paintFinish === fin.id
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {fin.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-300 mb-2">
                  Chassis Underglow & Headlights
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(
                    ['none', 'amber', 'cyan', 'crimson', 'emerald'] as UnderglowId[]
                  ).map((ug) => (
                    <button
                      key={ug}
                      type="button"
                      onClick={() => updateField('underglow', ug)}
                      className={`px-2.5 py-1 text-xs font-medium rounded border capitalize whitespace-nowrap cursor-pointer ${
                        config.underglow === ug
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {ug}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Aero & Bodykit */}
          {activeTab === 'aero' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <div className="text-xs font-medium text-slate-300 mb-1.5">
                  Rear Wing / Spoiler
                </div>
                <div className="flex flex-col gap-1">
                  {(
                    [
                      { id: 'none', label: 'Clean Decklid' },
                      { id: 'lip', label: 'Carbon Ducktail Lip' },
                      { id: 'gt_wing', label: 'Motorsport GT Wing' },
                      { id: 'swan_neck', label: 'Time-Attack Swan Neck' },
                    ] as Array<{ id: SpoilerId; label: string }>
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateField('spoiler', item.id)}
                      className={`px-2.5 py-1.5 text-xs text-left rounded border whitespace-nowrap cursor-pointer ${
                        config.spoiler === item.id
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-300 mb-1.5">
                  Front Aero Splitter
                </div>
                <div className="flex flex-col gap-1">
                  {(
                    [
                      { id: 'stock', label: 'Factory Valance' },
                      { id: 'street', label: 'Street Spec Lip' },
                      { id: 'track_carbon', label: 'Track Pro Canards' },
                    ] as Array<{ id: SplitterId; label: string }>
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateField('splitter', item.id)}
                      className={`px-2.5 py-1.5 text-xs text-left rounded border whitespace-nowrap cursor-pointer ${
                        config.splitter === item.id
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-300 mb-1.5">
                  Rear Venturi Diffuser
                </div>
                <div className="flex flex-col gap-1">
                  {(
                    [
                      { id: 'stock', label: 'OEM Rear Bumper' },
                      { id: 'twin_fin', label: 'Twin-Fin Street' },
                      { id: 'aggressive_gt', label: '5-Blade GT Diffuser' },
                    ] as Array<{ id: DiffuserId; label: string }>
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateField('diffuser', item.id)}
                      className={`px-2.5 py-1.5 text-xs text-left rounded border whitespace-nowrap cursor-pointer ${
                        config.diffuser === item.id
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-300 mb-1.5">
                  Roof & Auxiliary Rig
                </div>
                <div className="flex flex-col gap-1">
                  {(
                    [
                      { id: 'none', label: 'Slick Roofline' },
                      { id: 'carbon_vent', label: 'F1 Airbox Scoop' },
                      { id: 'rally_lightbar', label: 'Raid Quad LED Pod' },
                    ] as Array<{ id: RoofAccessoryId; label: string }>
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateField('roofAccessory', item.id)}
                      className={`px-2.5 py-1.5 text-xs text-left rounded border whitespace-nowrap cursor-pointer ${
                        config.roofAccessory === item.id
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Rims, Brake Calipers & Stance */}
          {activeTab === 'wheels' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-medium text-slate-300 mb-1.5">
                  Forged Wheel Rim Architecture
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'multi_spoke', label: '6-Spoke GT' },
                      { id: 'deep_dish', label: 'Tuner Deep Dish' },
                      { id: 'aero_turbo', label: 'Aero Turbofan' },
                      { id: 'forged_split', label: 'Forged 5-Split' },
                    ] as Array<{ id: RimStyleId; label: string }>
                  ).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => updateField('rimStyle', r.id)}
                      className={`px-2.5 py-1.5 text-xs rounded border whitespace-nowrap cursor-pointer ${
                        config.rimStyle === r.id
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-slate-900 text-slate-300 border-slate-800'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-300 mb-1.5">
                  Rim Alloy & Brake Caliper Finish
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-slate-400 w-14">Alloy:</span>
                  {RIM_SWATCHES.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      title={sw.name}
                      aria-label={`Rim ${sw.name}`}
                      onClick={() => updateField('rimColor', sw.hex)}
                      className={`w-6 h-6 rounded border-2 cursor-pointer ${
                        config.rimColor === sw.hex
                          ? 'border-amber-400 scale-110'
                          : 'border-slate-700'
                      }`}
                      style={{ backgroundColor: sw.hex }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-14">Caliper:</span>
                  {CALIPER_SWATCHES.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      title={sw.name}
                      aria-label={`Caliper ${sw.name}`}
                      onClick={() => updateField('caliperColor', sw.hex)}
                      className={`w-6 h-6 rounded border-2 cursor-pointer ${
                        config.caliperColor === sw.hex
                          ? 'border-white scale-110'
                          : 'border-slate-700'
                      }`}
                      style={{ backgroundColor: sw.hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block">
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Ride Height Offset</span>
                    <span className="font-mono-tabular text-amber-400">
                      {(config.rideHeight * 1000).toFixed(0)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-0.05}
                    max={0.08}
                    step={0.01}
                    value={config.rideHeight}
                    onChange={(e) =>
                      updateField('rideHeight', parseFloat(e.target.value))
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </label>
                <label className="block">
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Wheel Camber Angle</span>
                    <span className="font-mono-tabular text-amber-400">
                      {config.camberAngle.toFixed(1)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-8.0}
                    max={0.0}
                    step={0.5}
                    value={config.camberAngle}
                    onChange={(e) =>
                      updateField('camberAngle', parseFloat(e.target.value))
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Tab 5: Mechanical Dyno & Drivetrain Tuning */}
          {activeTab === 'tuning' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="block bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <div className="flex justify-between text-xs text-slate-200 mb-1">
                  <span>Turbo Boost Pressure</span>
                  <span className="font-mono-tabular text-amber-400">
                    {config.turboBoostBar.toFixed(1)} BAR
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={config.turboBoostBar}
                  onChange={(e) =>
                    updateField('turboBoostBar', parseFloat(e.target.value))
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Scales peak horsepower ({ratings.powerHp} HP)
                </div>
              </label>

              <label className="block bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <div className="flex justify-between text-xs text-slate-200 mb-1">
                  <span>Tire Compound (Drift / Grip)</span>
                  <span className="font-mono-tabular text-cyan-400">
                    {config.tireCompound < 0.85
                      ? 'Drift Hard'
                      : config.tireCompound > 1.15
                      ? 'Semi-Slick'
                      : 'Street Sport'}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.65}
                  max={1.35}
                  step={0.05}
                  value={config.tireCompound}
                  onChange={(e) =>
                    updateField('tireCompound', parseFloat(e.target.value))
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Left = Easy Powerslides · Right = Maximum Cornering G
                </div>
              </label>

              <label className="block bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <div className="flex justify-between text-xs text-slate-200 mb-1">
                  <span>Final Drive Gear Ratio</span>
                  <span className="font-mono-tabular text-emerald-400">
                    {config.finalDriveRatio.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.3}
                  step={0.05}
                  value={config.finalDriveRatio}
                  onChange={(e) =>
                    updateField('finalDriveRatio', parseFloat(e.target.value))
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Left = Higher Top Speed · Right = Faster 0-100 Launch
                </div>
              </label>

              <label className="block bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <div className="flex justify-between text-xs text-slate-200 mb-1">
                  <span>Coilover Stiffness</span>
                  <span className="font-mono-tabular text-amber-400">
                    {Math.round(config.suspensionStiffness * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={config.suspensionStiffness}
                  onChange={(e) =>
                    updateField(
                      'suspensionStiffness',
                      parseFloat(e.target.value)
                    )
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Controls chassis roll & pitch response
                </div>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
