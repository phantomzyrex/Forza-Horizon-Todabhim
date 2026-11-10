import React from 'react';

export interface NitroWarpRenderParams {
  warpIntensity: number; // 0.0 to 1.0
  isNitroActive: boolean;
  speedKmh: number;
  nitroAmount: number;
  steerAngle: number;
  elapsedSec: number;
}

const STREAK_COUNT = 72;
const STREAK_ANGLES = new Float32Array(STREAK_COUNT);
const STREAK_SEEDS = new Float32Array(STREAK_COUNT);
const STREAK_WIDTHS = new Float32Array(STREAK_COUNT);
const STREAK_PALETTE = [
  '#38bdf8', // Electric N2O Cyan
  '#e0f2fe', // Plasma Ice White
  '#818cf8', // Chromatic Indigo Shift
  '#f59e0b', // Afterburner Amber
];

for (let i = 0; i < STREAK_COUNT; i++) {
  const jitter = ((Math.sin(i * 19.31) * 43758.5453) % 1) * 0.08;
  STREAK_ANGLES[i] = (i / STREAK_COUNT) * Math.PI * 2 + jitter;
  STREAK_SEEDS[i] = Math.abs((Math.cos(i * 47.13) * 19283.41) % 1);
  STREAK_WIDTHS[i] = 1.2 + Math.abs((Math.sin(i * 91.7) * 12731.9) % 1) * 2.4;
}

/**
 * Renders the 60Hz screen-space radial warp and high-velocity motion blur overlay.
 * Scales continuously with `warpIntensity`, `speedKmh`, and `nitroAmount`, shifting
 * the radial vanishing point dynamically with `steerAngle`.
 */
export function renderNitroWarpToCanvas(
  canvas: HTMLCanvasElement,
  params: NitroWarpRenderParams
): void {
  const {
    warpIntensity,
    isNitroActive,
    speedKmh,
    nitroAmount,
    steerAngle,
    elapsedSec,
  } = params;

  const w = window.innerWidth || 1280;
  const h = window.innerHeight || 720;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);
  if (warpIntensity <= 0.01) return;

  const intensity = Math.min(1, Math.max(0, warpIntensity));
  const nitroRatio = Math.min(1, Math.max(0.15, nitroAmount / 100));
  const speedRatio = Math.min(1.25, Math.max(0.25, speedKmh / 200));

  // Shift vanishing point opposite to steering angle for dynamic cornering warp
  const cx = w * 0.5 - steerAngle * w * 0.16;
  const cy = h * 0.46;
  const maxRadius = Math.hypot(w, h) * 0.62;
  const safeInnerRadius = Math.min(w, h) * (0.34 - intensity * 0.11);

  ctx.save();

  // 1. Peripheral Radial Motion-Blur Tunnel & Chromatic Vignette
  const tunnelGrad = ctx.createRadialGradient(
    cx,
    cy,
    safeInnerRadius,
    cx,
    cy,
    maxRadius
  );
  tunnelGrad.addColorStop(0, 'rgba(6, 182, 212, 0.0)');
  tunnelGrad.addColorStop(
    0.48,
    `rgba(14, 165, 233, ${(intensity * 0.16).toFixed(3)})`
  );
  tunnelGrad.addColorStop(
    0.78,
    `rgba(37, 99, 235, ${(intensity * 0.28).toFixed(3)})`
  );
  tunnelGrad.addColorStop(
    1,
    `rgba(9, 13, 20, ${(intensity * 0.52).toFixed(3)})`
  );
  ctx.fillStyle = tunnelGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Expanding N2O Shockwave Warp Rings
  ctx.globalCompositeOperation = 'lighter';
  const ringCount = isNitroActive ? 3 : 1;
  for (let r = 0; r < ringCount; r++) {
    const phase =
      (elapsedSec * (1.6 + intensity * 2.4) + r / ringCount) % 1;
    const ringRadius =
      safeInnerRadius * 0.9 + phase * (maxRadius - safeInnerRadius * 0.8);
    const ringAlpha = (1 - phase) * phase * 4 * intensity * 0.26;
    ctx.strokeStyle =
      r % 2 === 0
        ? `rgba(56, 189, 248, ${ringAlpha.toFixed(3)})`
        : `rgba(129, 140, 248, ${ringAlpha.toFixed(3)})`;
    ctx.lineWidth = 1.5 + intensity * 3.5 * phase;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      ringRadius,
      ringRadius * 0.68,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  // 3. High-Velocity Radial Motion-Blur Streaks
  const activeStreaks = Math.round(
    STREAK_COUNT * (0.35 + 0.65 * intensity)
  );
  const flowRate = 1.8 + speedRatio * 3.4 + intensity * 2.8;

  for (let i = 0; i < activeStreaks; i++) {
    const angle = STREAK_ANGLES[i];
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Phase wraps 0..1 outward from central safe zone to screen perimeter
    const phase = (STREAK_SEEDS[i] + elapsedSec * flowRate) % 1;
    const rStart =
      safeInnerRadius + phase * (maxRadius - safeInnerRadius);
    const streakLen =
      (32 + phase * 145) * intensity * (0.45 + 0.55 * nitroRatio) * speedRatio;
    const rEnd = rStart + streakLen;

    const x1 = cx + cosA * rStart;
    const y1 = cy + sinA * rStart * 0.78;
    const x2 = cx + cosA * rEnd;
    const y2 = cy + sinA * rEnd * 0.78;

    const alpha =
      Math.min(0.85, (0.2 + phase * 0.65) * intensity * (0.5 + 0.5 * nitroRatio));
    const color = STREAK_PALETTE[i % STREAK_PALETTE.length];

    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = STREAK_WIDTHS[i] * (0.65 + intensity * 0.85);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
}

interface NitroWarpOverlayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export const NitroWarpOverlay: React.FC<NitroWarpOverlayProps> = ({
  canvasRef,
}) => {
  return (
    <canvas
      ref={canvasRef}
      data-testid="nitro-warp-canvas"
      aria-hidden="true"
      className="fixed inset-0 w-screen h-screen pointer-events-none z-10"
    />
  );
};
