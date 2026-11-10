export type TimePhase = 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT';

export interface DayNightAtmosphere {
  timeHours: number; // 0..24
  formattedTime: string; // e.g. "21:30"
  phase: TimePhase;
  sunElevation: number; // -1 (midnight) to +1 (noon)
  nightFactor: number; // 0.0 (full day) to 1.0 (full night)
  twilightFactor: number; // 0.0 to 1.0 (peaks at dawn/dusk horizon)
  streetLightsActive: boolean;
  windowLightsActive: boolean;
  headlightsActive: boolean;
  skyZenithHex: string;
  skyMidHex: string;
  skyHorizonHex: string;
  skyGroundHex: string;
  fogHex: string;
  dirLightHex: string;
  dirLightIntensity: number;
  hemiSkyHex: string;
  hemiGroundHex: string;
  hemiIntensity: number;
  toneMappingExposure: number;
  sunPosition: { x: number; y: number; z: number };
  moonPosition: { x: number; y: number; z: number };
}

export const TIME_PRESETS: Array<{ label: string; hours: number }> = [
  { label: 'Noon Day', hours: 12.5 },
  { label: 'Golden Dusk', hours: 18.25 },
  { label: 'Midnight', hours: 0.5 },
  { label: 'Crisp Dawn', hours: 6.15 },
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * clamp01(t));
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function lerpHexColor(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = parseHexRgb(hexA);
  const [r2, g2, b2] = parseHexRgb(hexB);
  const r = lerpChannel(r1, r2, t).toString(16).padStart(2, '0');
  const g = lerpChannel(g1, g2, t).toString(16).padStart(2, '0');
  const b = lerpChannel(b1, b2, t).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function formatTimeHours(hours: number): string {
  const norm = ((hours % 24) + 24) % 24;
  const h = Math.floor(norm);
  const m = Math.floor((norm - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Pure calculation of sky dome colors, directional/hemisphere intensities,
 * solar/lunar positions, and nocturnal illumination triggers for any hour (0..24).
 */
export function computeDayNightAtmosphere(rawHours: number): DayNightAtmosphere {
  const timeHours = ((rawHours % 24) + 24) % 24;
  // Angle where 06:00 -> 0 rad, 12:00 -> PI/2, 18:00 -> PI, 00:00 -> 3PI/2
  const solarAngle = ((timeHours - 6) / 24) * Math.PI * 2;
  const sunElevation = Math.sin(solarAngle);
  const sunHorizontal = Math.cos(solarAngle);

  // Night factor is 0 in bright day (sunElevation >= 0.22) and 1 at night (sunElevation <= -0.16)
  const nightFactor = 1 - smoothstep(-0.16, 0.22, sunElevation);

  // Twilight peaks when sunElevation is near 0 (-0.22 .. +0.28)
  const twilightFactor = Math.max(
    0,
    1 - Math.abs(sunElevation - 0.02) / 0.28
  );

  let phase: TimePhase = 'DAY';
  if (sunElevation <= -0.14) {
    phase = 'NIGHT';
  } else if (sunElevation < 0.24) {
    phase = timeHours < 12 ? 'DAWN' : 'DUSK';
  }

  // Palette Stops: Day -> Twilight -> Night
  const dayZenith = '#0284c7';
  const dayMid = '#38bdf8';
  const dayHorizon = '#bae6fd';
  const dayGround = '#1e293b';

  const duskZenith = '#0f172a';
  const duskMid = '#1e1b4b';
  const duskHorizon = '#f97316';
  const duskGround = '#0f172a';

  const nightZenith = '#02050e';
  const nightMid = '#070d1c';
  const nightHorizon = '#0c162c';
  const nightGround = '#050811';

  // First blend Day <-> Night based on nightFactor, then inject Twilight warmth
  let skyZenithHex = lerpHexColor(dayZenith, nightZenith, nightFactor);
  let skyMidHex = lerpHexColor(dayMid, nightMid, nightFactor);
  let skyHorizonHex = lerpHexColor(dayHorizon, nightHorizon, nightFactor);
  let skyGroundHex = lerpHexColor(dayGround, nightGround, nightFactor);

  if (twilightFactor > 0.01) {
    const tw = twilightFactor * 0.88;
    skyZenithHex = lerpHexColor(skyZenithHex, duskZenith, tw);
    skyMidHex = lerpHexColor(skyMidHex, duskMid, tw);
    skyHorizonHex = lerpHexColor(skyHorizonHex, duskHorizon, tw);
    skyGroundHex = lerpHexColor(skyGroundHex, duskGround, tw);
  }

  const fogHex = lerpHexColor(
    '#93c5fd',
    twilightFactor > 0.35 ? '#311b2c' : '#080e1c',
    clamp01(nightFactor * 0.9 + twilightFactor * 0.35)
  );

  // Directional Sun / Moon light
  const daySunHex = '#fffbeb';
  const duskSunHex = '#fb923c';
  const nightMoonHex = '#60a5fa';

  let dirLightHex = lerpHexColor(daySunHex, nightMoonHex, nightFactor);
  if (twilightFactor > 0.05) {
    dirLightHex = lerpHexColor(dirLightHex, duskSunHex, twilightFactor * 0.85);
  }

  // Intensity: bright 2.75 at noon, warm 1.75 at sunset, cool 0.65 moonlight at midnight
  const dirLightIntensity =
    2.75 * (1 - nightFactor) + 0.65 * nightFactor;

  const hemiSkyHex = lerpHexColor('#7dd3fc', '#1e293b', nightFactor);
  const hemiGroundHex = lerpHexColor('#334155', '#090d16', nightFactor);
  const hemiIntensity = 1.3 * (1 - nightFactor) + 0.52 * nightFactor;

  const toneMappingExposure = 1.18 * (1 - nightFactor) + 1.06 * nightFactor;

  // 3D Celestial coordinates on the 440m radius sky sphere
  const orbitR = 420;
  const sunPosition = {
    x: sunHorizontal * orbitR * 0.85,
    y: sunElevation * orbitR,
    z: -160,
  };
  const moonPosition = {
    x: -sunHorizontal * orbitR * 0.85,
    y: -sunElevation * orbitR,
    z: -160,
  };

  // Nocturnal lights activate during dusk/night/dawn when nightFactor >= 0.32
  const lightsOn = nightFactor >= 0.32;

  return {
    timeHours,
    formattedTime: formatTimeHours(timeHours),
    phase,
    sunElevation,
    nightFactor,
    twilightFactor,
    streetLightsActive: lightsOn,
    windowLightsActive: lightsOn,
    headlightsActive: lightsOn,
    skyZenithHex,
    skyMidHex,
    skyHorizonHex,
    skyGroundHex,
    fogHex,
    dirLightHex,
    dirLightIntensity,
    hemiSkyHex,
    hemiGroundHex,
    hemiIntensity,
    toneMappingExposure,
    sunPosition,
    moonPosition,
  };
}
