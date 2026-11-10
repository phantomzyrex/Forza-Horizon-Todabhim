import React from 'react';
import {
  MinimapBuildingFootprint,
  MinimapSnapshot,
  MinimapZoomMode,
  projectWorldToMinimap,
  scaleWorldLengthToMinimap,
} from '../game/minimapProjection';
import {
  APEX_BEACONS,
  ROAD_COORDS,
  ROAD_WIDTH,
  SPEED_TRAPS,
  WORLD_BOUNDS,
} from '../game/worldData';

export const MINIMAP_SIZE_PX = 188;

function traceBuildingShape(
  ctx: CanvasRenderingContext2D,
  b: MinimapBuildingFootprint
) {
  const { mx, mz, mw, md, planShape } = b;
  const hw = mw * 0.5;
  const hd = md * 0.5;

  ctx.beginPath();
  if (planShape === 'cylindrical_diagrid') {
    ctx.ellipse(mx, mz, hw, hd, 0, 0, Math.PI * 2);
  } else if (planShape === 'chamfered_octagon' || planShape === 'tapered_obelisk') {
    const cx = hw * 0.32;
    const cz = hd * 0.32;
    ctx.moveTo(mx - hw + cx, mz - hd);
    ctx.lineTo(mx + hw - cx, mz - hd);
    ctx.lineTo(mx + hw, mz - hd + cz);
    ctx.lineTo(mx + hw, mz + hd - cz);
    ctx.lineTo(mx + hw - cx, mz + hd);
    ctx.lineTo(mx - hw + cx, mz + hd);
    ctx.lineTo(mx - hw, mz + hd - cz);
    ctx.lineTo(mx - hw, mz - hd + cz);
    ctx.closePath();
  } else if (planShape === 'cruciform') {
    const ix = hw * 0.36;
    const iz = hd * 0.36;
    ctx.moveTo(mx - ix, mz - hd);
    ctx.lineTo(mx + ix, mz - hd);
    ctx.lineTo(mx + ix, mz - iz);
    ctx.lineTo(mx + hw, mz - iz);
    ctx.lineTo(mx + hw, mz + iz);
    ctx.lineTo(mx + ix, mz + iz);
    ctx.lineTo(mx + ix, mz + hd);
    ctx.lineTo(mx - ix, mz + hd);
    ctx.lineTo(mx - ix, mz + iz);
    ctx.lineTo(mx - hw, mz + iz);
    ctx.lineTo(mx - hw, mz - iz);
    ctx.lineTo(mx - ix, mz - iz);
    ctx.closePath();
  } else if (planShape === 'l_wing') {
    ctx.moveTo(mx - hw, mz - hd);
    ctx.lineTo(mx + hw * 0.18, mz - hd);
    ctx.lineTo(mx + hw * 0.18, mz - hd * 0.15);
    ctx.lineTo(mx + hw, mz - hd * 0.15);
    ctx.lineTo(mx + hw, mz + hd);
    ctx.lineTo(mx - hw, mz + hd);
    ctx.closePath();
  } else {
    ctx.rect(mx - hw, mz - hd, mw, md);
  }
}

function drawDirectionalChevron(
  ctx: CanvasRenderingContext2D,
  mx: number,
  mz: number,
  heading: number,
  tipLen: number,
  tailLen: number,
  halfWidth: number,
  notchLen: number
) {
  const dx = Math.sin(heading);
  const dz = Math.cos(heading);
  const px = -dz;
  const pz = dx;

  ctx.beginPath();
  ctx.moveTo(mx + dx * tipLen, mz + dz * tipLen);
  ctx.lineTo(
    mx - dx * tailLen + px * halfWidth,
    mz - dz * tailLen + pz * halfWidth
  );
  ctx.lineTo(mx - dx * notchLen, mz - dz * notchLen);
  ctx.lineTo(
    mx - dx * tailLen - px * halfWidth,
    mz - dz * tailLen - pz * halfWidth
  );
  ctx.closePath();
}

/**
 * Renders the complete real-time mini-map overlay onto a 2D canvas context at 60Hz,
 * directly synchronized with the vehicle physics state, nearby city buildings,
 * active event checkpoints, and AI traffic fleet flow & density.
 */
export function renderMinimapToCanvas(
  canvas: HTMLCanvasElement,
  snapshot: MinimapSnapshot,
  collectedBeacons: string[],
  elapsedSec: number
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.round(MINIMAP_SIZE_PX * dpr);
  const targetH = Math.round(MINIMAP_SIZE_PX * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr, dpr);

  const size = MINIMAP_SIZE_PX;
  const { zoomMode, playerMapPos, playerHeading, playerSpeedKmh } = snapshot;

  // 1. Deep Radar Slate Background
  ctx.fillStyle = '#060a12';
  ctx.fillRect(0, 0, size, size);

  // Subtle radar range rings & crosshairs centered on player
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.28)';
  ctx.lineWidth = 0.8;
  const ringRadiiMeters = zoomMode === 'tactical' ? [45, 95, 140] : [80, 160, 240];
  for (const rMeters of ringRadiiMeters) {
    const rPx = scaleWorldLengthToMinimap(rMeters, size, zoomMode);
    ctx.beginPath();
    ctx.arc(playerMapPos.mx, playerMapPos.mz, rPx, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Subtle Nearby Building Proximity Scan Ring (105m radius)
  const scanRadiusPx = scaleWorldLengthToMinimap(105, size, zoomMode);
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.22)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(playerMapPos.mx, playerMapPos.mz, scanRadiusPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Metropolis Central Bay River Channel (z in [-28, 28])
  const pwx = snapshot.playerWorldX;
  const pwz = snapshot.playerWorldZ;
  const pNorthWest = projectWorldToMinimap(
    -WORLD_BOUNDS,
    -28,
    pwx,
    pwz,
    size,
    zoomMode
  );
  const pSouthEast = projectWorldToMinimap(
    WORLD_BOUNDS,
    28,
    pwx,
    pwz,
    size,
    zoomMode
  );
  const riverY = Math.min(pNorthWest.mz, pSouthEast.mz);
  const riverH = Math.max(4, Math.abs(pSouthEast.mz - pNorthWest.mz));
  ctx.fillStyle = 'rgba(3, 105, 161, 0.42)';
  ctx.fillRect(0, riverY, size, riverH);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, riverY);
  ctx.lineTo(size, riverY);
  ctx.moveTo(0, riverY + riverH);
  ctx.lineTo(size, riverY + riverH);
  ctx.stroke();

  // 3. Base Road Network Grid
  const roadWidthPx = Math.max(
    2.4,
    scaleWorldLengthToMinimap(ROAD_WIDTH, size, zoomMode)
  );
  for (const rc of ROAD_COORDS) {
    // N-S Avenue
    const nsStart = projectWorldToMinimap(rc, -WORLD_BOUNDS, pwx, pwz, size, zoomMode);
    const nsEnd = projectWorldToMinimap(rc, WORLD_BOUNDS, pwx, pwz, size, zoomMode);
    ctx.strokeStyle = rc === 0 ? '#334155' : '#1e293b';
    ctx.lineWidth = rc === 0 ? roadWidthPx * 1.15 : roadWidthPx;
    ctx.beginPath();
    ctx.moveTo(nsStart.mx, nsStart.mz);
    ctx.lineTo(nsEnd.mx, nsEnd.mz);
    ctx.stroke();

    // E-W Avenue (except z = 0 river channel)
    if (rc !== 0) {
      const ewStart = projectWorldToMinimap(-WORLD_BOUNDS, rc, pwx, pwz, size, zoomMode);
      const ewEnd = projectWorldToMinimap(WORLD_BOUNDS, rc, pwx, pwz, size, zoomMode);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = roadWidthPx;
      ctx.beginPath();
      ctx.moveTo(ewStart.mx, ewStart.mz);
      ctx.lineTo(ewEnd.mx, ewEnd.mz);
      ctx.stroke();
    }
  }

  // 4. Live Road Corridor Traffic Density Heat & Flow Overlays
  for (let i = 0; i < snapshot.corridorDensities.length; i++) {
    const seg = snapshot.corridorDensities[i];
    if (seg.densityLevel === 'clear') continue;

    const p1 = projectWorldToMinimap(seg.x1, seg.z1, pwx, pwz, size, zoomMode);
    const p2 = projectWorldToMinimap(seg.x2, seg.z2, pwx, pwz, size, zoomMode);
    if (!p1.inBounds && !p2.inBounds) continue;

    ctx.save();
    ctx.strokeStyle = seg.colorHex;
    ctx.globalAlpha =
      seg.densityLevel === 'high'
        ? 0.62
        : seg.densityLevel === 'medium'
        ? 0.45
        : 0.28;
    ctx.lineWidth =
      seg.densityLevel === 'high'
        ? roadWidthPx * 1.15
        : roadWidthPx * 0.85;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p1.mx, p1.mz);
    ctx.lineTo(p2.mx, p2.mz);
    ctx.stroke();

    // Small animated flow-direction pulse along active traffic corridors
    const pulseT = (elapsedSec * 0.65 + (i % 5) * 0.2) % 1;
    const fx = p1.mx + (p2.mx - p1.mx) * pulseT;
    const fz = p1.mz + (p2.mz - p1.mz) * pulseT;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = seg.colorHex;
    drawDirectionalChevron(ctx, fx, fz, seg.avgHeading, 3.0, 2.0, 2.0, 0.8);
    ctx.fill();
    ctx.restore();
  }

  // 5. Nearby & Background City Buildings (Synchronized with Player Physics Position)
  for (let i = 0; i < snapshot.buildings.length; i++) {
    const b = snapshot.buildings[i];
    ctx.save();
    traceBuildingShape(ctx, b);
    if (b.isNearby) {
      ctx.fillStyle = `rgba(30, 58, 95, ${(0.42 + b.proximityAlpha * 0.42).toFixed(2)})`;
      ctx.fill();
      ctx.strokeStyle =
        b.proximityAlpha > 0.68
          ? '#38bdf8'
          : 'rgba(125, 211, 252, 0.68)';
      ctx.lineWidth = b.proximityAlpha > 0.68 ? 1.25 : 0.9;
      ctx.stroke();

      // Inner architectural roof core outline on nearby buildings
      if (b.mw >= 5 && b.md >= 5) {
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.24)';
        ctx.lineWidth = 0.6;
        ctx.strokeRect(
          b.mx - b.mw * 0.26,
          b.mz - b.md * 0.26,
          b.mw * 0.52,
          b.md * 0.52
        );
      }
    } else {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6. Uncollected Apex Beacons & Speed Traps
  for (let i = 0; i < APEX_BEACONS.length; i++) {
    const beacon = APEX_BEACONS[i];
    if (collectedBeacons.includes(beacon.id)) continue;
    const bp = projectWorldToMinimap(beacon.x, beacon.z, pwx, pwz, size, zoomMode);
    if (!bp.inBounds) continue;
    ctx.save();
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(bp.mx, bp.mz, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (let i = 0; i < SPEED_TRAPS.length; i++) {
    const trap = SPEED_TRAPS[i];
    const tp = projectWorldToMinimap(trap.x, trap.z, pwx, pwz, size, zoomMode);
    if (!tp.inBounds) continue;
    ctx.save();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1.1;
    ctx.strokeRect(tp.mx - 2, tp.mz - 2, 4, 4);
    ctx.restore();
  }

  // 6B. Intersection Traffic Signal Phase Indicators (Red / Yellow / Green)
  if (snapshot.trafficSignals && snapshot.trafficSignals.length > 0) {
    const phaseHex = (p: 'green' | 'yellow' | 'red') =>
      p === 'green' ? '#10b981' : p === 'yellow' ? '#f59e0b' : '#ef4444';

    for (let i = 0; i < snapshot.trafficSignals.length; i++) {
      const sig = snapshot.trafficSignals[i];
      if (!sig.inBounds) continue;
      ctx.save();
      // N-S phase pip (top/bottom of intersection)
      ctx.fillStyle = phaseHex(sig.nsPhase);
      ctx.beginPath();
      ctx.arc(sig.mx, sig.mz - 2.3, 1.35, 0, Math.PI * 2);
      ctx.fill();
      // E-W phase pip (left/right of intersection)
      ctx.fillStyle = phaseHex(sig.ewPhase);
      ctx.beginPath();
      ctx.arc(sig.mx + 2.3, sig.mz, 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 7. Dynamic Road-Network GPS Optimal Route Highlight
  if (snapshot.gpsRoute && snapshot.gpsRoute.waypoints.length >= 2) {
    const gps = snapshot.gpsRoute;
    const isEventCp = gps.targetType === 'event_checkpoint';
    const routeGlowColor = isEventCp
      ? 'rgba(245, 158, 11, 0.36)'
      : 'rgba(6, 182, 212, 0.36)';
    const routeCoreColor = isEventCp ? '#fbbf24' : '#22d3ee';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outer glowing road-width GPS route casing
    ctx.strokeStyle = routeGlowColor;
    ctx.lineWidth = Math.max(4.5, roadWidthPx * 1.15);
    ctx.beginPath();
    ctx.moveTo(gps.waypoints[0].mx, gps.waypoints[0].mz);
    for (let i = 1; i < gps.waypoints.length; i++) {
      ctx.lineTo(gps.waypoints[i].mx, gps.waypoints[i].mz);
    }
    ctx.stroke();

    // Inner high-contrast optimal GPS path line
    ctx.strokeStyle = routeCoreColor;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(gps.waypoints[0].mx, gps.waypoints[0].mz);
    for (let i = 1; i < gps.waypoints.length; i++) {
      ctx.lineTo(gps.waypoints[i].mx, gps.waypoints[i].mz);
    }
    ctx.stroke();

    // Animated directional chevrons marching along the optimal GPS route segments
    for (let i = 0; i < gps.waypoints.length - 1; i++) {
      const a = gps.waypoints[i];
      const b = gps.waypoints[i + 1];
      const segPx = Math.hypot(b.mx - a.mx, b.mz - a.mz);
      if (segPx < 10) continue;
      const segHeading = Math.atan2(b.mx - a.mx, b.mz - a.mz);
      const t = (elapsedSec * 0.9 + i * 0.25) % 1;
      const cx = a.mx + (b.mx - a.mx) * t;
      const cz = a.mz + (b.mz - a.mz) * t;
      ctx.fillStyle = '#ffffff';
      drawDirectionalChevron(ctx, cx, cz, segHeading, 3.2, 2.0, 2.1, 0.8);
      ctx.fill();
    }

    // Pulsing GPS Destination Waypoint Ring
    const dest = gps.targetMapPos;
    if (dest.inBounds) {
      const pulse = 1 + Math.sin(elapsedSec * 6.5) * 0.2;
      ctx.strokeStyle = routeCoreColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(dest.mx, dest.mz, 4.8 * pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = routeCoreColor;
      ctx.beginPath();
      ctx.arc(dest.mx, dest.mz, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Edge indicator chevron when GPS target is outside tactical bounds
      const margin = 10;
      const clampedX = Math.max(margin, Math.min(size - margin, dest.mx));
      const clampedZ = Math.max(margin, Math.min(size - margin, dest.mz));
      const angleToDest = Math.atan2(
        dest.mx - playerMapPos.mx,
        dest.mz - playerMapPos.mz
      );
      ctx.fillStyle = routeCoreColor;
      drawDirectionalChevron(
        ctx,
        clampedX,
        clampedZ,
        angleToDest,
        4.8,
        3.2,
        3.2,
        1.2
      );
      ctx.fill();
    }
    ctx.restore();
  }

  // 7B. Active Event Checkpoints
  if (snapshot.checkpoints.length > 0) {
    // Individual checkpoint gates
    for (let i = 0; i < snapshot.checkpoints.length; i++) {
      const cp = snapshot.checkpoints[i];
      if (cp.isCompleted) continue;

      ctx.save();
      if (cp.isCurrent) {
        const pulse = 1 + Math.sin(elapsedSec * 7) * 0.22;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(cp.mx, cp.mz, cp.radiusPx * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
        ctx.beginPath();
        ctx.arc(cp.mx, cp.mz, cp.radiusPx * 0.75, 0, Math.PI * 2);
        ctx.fill();

        // Gate index label
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`G${cp.index + 1}`, cp.mx, cp.mz - cp.radiusPx - 5);
      } else {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cp.mx, cp.mz, Math.max(3.2, cp.radiusPx * 0.65), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 8. Traffic Fleet Directional Arrows & Density Halos
  for (let i = 0; i < snapshot.trafficArrows.length; i++) {
    const t = snapshot.trafficArrows[i];
    if (!t.inBounds) continue;

    ctx.save();
    const dx = Math.sin(t.heading);
    const dz = Math.cos(t.heading);

    // Subtle density halo for clustered or congested vehicles
    if (t.flowStatus !== 'free_flow') {
      ctx.fillStyle =
        t.flowStatus === 'congested'
          ? 'rgba(239, 68, 68, 0.24)'
          : 'rgba(245, 158, 11, 0.20)';
      ctx.beginPath();
      ctx.arc(
        t.mx,
        t.mz,
        t.flowStatus === 'congested' ? 5.6 : 4.6,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Speed-proportional motion trail behind arrow
    const trailLen = Math.min(6.5, (t.speedKmh / 65) * 5.2);
    if (trailLen > 1.0) {
      ctx.strokeStyle = t.colorHex;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(t.mx, t.mz);
      ctx.lineTo(t.mx - dx * trailLen, t.mz - dz * trailLen);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Oriented traffic directional arrow
    ctx.fillStyle = t.colorHex;
    ctx.strokeStyle = '#060a12';
    ctx.lineWidth = 0.85;
    drawDirectionalChevron(ctx, t.mx, t.mz, t.heading, 4.2, 2.8, 2.7, 1.1);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 9. Player Forward FOV Cone, Velocity Vector & Directional Chevron
  ctx.save();
  const pDx = Math.sin(playerHeading);
  const pDz = Math.cos(playerHeading);

  // Forward radar cone
  const coneLen = zoomMode === 'tactical' ? 28 : 20;
  const coneHalfAngle = 0.42;
  const leftAngle = playerHeading + coneHalfAngle;
  const rightAngle = playerHeading - coneHalfAngle;
  const coneGrad = ctx.createRadialGradient(
    playerMapPos.mx,
    playerMapPos.mz,
    2,
    playerMapPos.mx,
    playerMapPos.mz,
    coneLen
  );
  coneGrad.addColorStop(0, 'rgba(245, 158, 11, 0.34)');
  coneGrad.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
  ctx.fillStyle = coneGrad;
  ctx.beginPath();
  ctx.moveTo(playerMapPos.mx, playerMapPos.mz);
  ctx.lineTo(
    playerMapPos.mx + Math.sin(leftAngle) * coneLen,
    playerMapPos.mz + Math.cos(leftAngle) * coneLen
  );
  ctx.lineTo(
    playerMapPos.mx + Math.sin(rightAngle) * coneLen,
    playerMapPos.mz + Math.cos(rightAngle) * coneLen
  );
  ctx.closePath();
  ctx.fill();

  // Live velocity vector line
  const velLinePx = Math.min(26, (playerSpeedKmh / 240) * 24);
  if (velLinePx > 2) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(playerMapPos.mx, playerMapPos.mz);
    ctx.lineTo(
      playerMapPos.mx + pDx * velLinePx,
      playerMapPos.mz + pDz * velLinePx
    );
    ctx.stroke();
  }

  // Player primary arrow
  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#090d14';
  ctx.lineWidth = 1.5;
  drawDirectionalChevron(
    ctx,
    playerMapPos.mx,
    playerMapPos.mz,
    playerHeading,
    6.8,
    4.6,
    4.5,
    1.8
  );
  ctx.fill();
  ctx.stroke();

  // Crisp white center core dot on player position
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(playerMapPos.mx, playerMapPos.mz, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

interface MinimapOverlayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  zoomMode: MinimapZoomMode;
  onToggleZoomMode: () => void;
  nearbyBuildingsCount: number;
  freeFlowCount: number;
  moderateCount: number;
  congestedCount: number;
  avgFleetSpeedKmh: number;
  activeCheckpointDistanceMeters: number | null;
  gpsTargetLabel?: string;
  gpsRouteDistanceMeters?: number;
}

export const MinimapOverlay: React.FC<MinimapOverlayProps> = ({
  canvasRef,
  zoomMode,
  onToggleZoomMode,
  nearbyBuildingsCount,
  freeFlowCount,
  moderateCount,
  congestedCount,
  avgFleetSpeedKmh,
  activeCheckpointDistanceMeters,
  gpsTargetLabel,
  gpsRouteDistanceMeters,
}) => {
  const displayRouteDist =
    gpsRouteDistanceMeters !== undefined
      ? Math.round(gpsRouteDistanceMeters)
      : activeCheckpointDistanceMeters !== null
      ? Math.round(activeCheckpointDistanceMeters)
      : null;

  return (
    <div
      data-testid="minimap-overlay"
      className="w-[200px] bg-[#090d14]/94 border-2 border-slate-700/90 rounded-xl p-1.5 shadow-2xl shrink-0 select-none"
    >
      {/* Mini-Map Header Bar: Mode Indicator & Zoom Toggle */}
      <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-mono-tabular">
        <span className="text-slate-300 font-semibold tracking-wider uppercase">
          {zoomMode === 'tactical' ? 'LOCAL RADAR' : 'CITY GRID'}
        </span>
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleZoomMode();
          }}
          title="Toggle Radar Zoom [Z]"
          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-600 cursor-pointer transition-colors"
        >
          {zoomMode === 'tactical' ? '165M [Z]' : '255M [Z]'}
        </button>
      </div>

      {/* 60Hz Synchronized Canvas Viewport */}
      <div className="relative w-[188px] h-[188px] rounded-lg overflow-hidden border border-slate-800 bg-[#060a12]">
        <canvas
          ref={canvasRef}
          width={MINIMAP_SIZE_PX}
          height={MINIMAP_SIZE_PX}
          aria-label="Metropolis Real-Time Tactical Mini-Map"
          className="w-full h-full block"
        />

        {/* Compass & Nearby Building Badge Overlay */}
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#090d14]/85 border border-slate-700/80 text-[9px] font-mono-tabular text-sky-300">
          BLDG {nearbyBuildingsCount}
        </div>
        {displayRouteDist !== null && (
          <div
            data-testid="minimap-gps-badge"
            className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#090d14]/90 border border-cyan-500/80 text-[9px] font-mono-tabular text-cyan-300 font-semibold"
          >
            GPS {displayRouteDist}M
          </div>
        )}
        <div className="absolute bottom-1 right-1.5 px-1 rounded bg-[#090d14]/80 text-[9px] font-mono-tabular text-slate-300">
          N ▲
        </div>
      </div>

      {/* GPS Active Target & Traffic Fleet Flow Indicator Strip */}
      <div className="mt-1.5 px-1 pt-1 border-t border-slate-800/90">
        {gpsTargetLabel && (
          <div className="flex items-center justify-between text-[9px] font-mono-tabular text-cyan-300 mb-1 truncate">
            <span className="truncate" title={gpsTargetLabel}>
              ▸ {gpsTargetLabel}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-[9px] font-mono-tabular text-slate-400 mb-0.5">
          <span>TRAFFIC FLOW</span>
          <span className="text-slate-300">
            AVG {Math.round(avgFleetSpeedKmh)} KM/H
          </span>
        </div>
        <div className="flex items-center justify-between text-[9px] font-mono-tabular">
          <span
            className="flex items-center gap-1 text-emerald-400"
            title="Free-flowing traffic arrows"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            FREE {freeFlowCount}
          </span>
          <span
            className="flex items-center gap-1 text-amber-400"
            title="Moderate traffic cluster arrows"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
            MOD {moderateCount}
          </span>
          <span
            className="flex items-center gap-1 text-rose-400"
            title="High-density or braking queue arrows"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />
            DENSE {congestedCount}
          </span>
        </div>
      </div>
    </div>
  );
};
