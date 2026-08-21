// The only place a Module is read and turned into numbers for the scene.
//
// Everything below the scene — strips, contacts, materials — is built from
// plain specs, so the schema is resolved exactly once, here. That is what lets
// the 3D objects be sized and reasoned about without knowing the module format
// or the status table.
//
// Deliberately free of any `three` import. This module is reachable from the
// dialog shell, which is in the eagerly-loaded bundle; pulling three in here
// would put the whole library there with it and defeat the lazy boundary around
// the canvas. Hence the hex parser below instead of THREE.Color — the schema
// has already validated the string, and THREE.Color's sRGB round trip returns
// the same integer anyway.

import { STATUS } from '../data/status';
import { bandText } from '../data/schema';
import type { StripSpec } from '../objects/Strip';
import type { Module } from '../data/schema';

/** Per-module state that has to outlive the meshes. Anything derived when a
 *  strip is built — its spin phase, its scanner lane — lives here or it
 *  silently resets the next time that strip is rebuilt. */
export interface Runtime {
  phase: number;
  lane: number;
}

/** How many rings of the scanner deck contacts are spread across. */
export const LANES = 5;

const FALLBACK_STATUS = { color: 0xffffff, gain: 1 };

function statusOf(m: Module) {
  return STATUS[m.status] ?? FALLBACK_STATUS;
}

/** `#RGB` or `#RRGGBB`, already validated and upper-cased by the schema. */
function hexToInt(hex: string): number {
  const s = hex.slice(1);
  if (s.length === 3) {
    return parseInt(s[0] + s[0] + s[1] + s[1] + s[2] + s[2], 16);
  }
  return parseInt(s, 16);
}

/** A module's colour: its own override, else its status colour. */
export function colorOf(m: Module): number {
  return m.appearance.color != null ? hexToInt(m.appearance.color) : statusOf(m).color;
}

/** Emissive scaling for the band. Running is the common case and reads too hot
 *  at full strength with a dozen of them on screen. */
export function gainOf(m: Module): number {
  return statusOf(m).gain ?? 1;
}

export function stripSpec(m: Module, rt: Runtime): StripSpec {
  return {
    id: m.id,
    radius: m.geometry.radius,
    y: m.geometry.y,
    arcDeg: m.geometry.arc,
    band: m.geometry.band,
    visible: m.layout.visible,
    glow: m.appearance.glow,
    halo: m.appearance.halo,
    trail: m.appearance.trail,
    label: m.appearance.labelVisible ? bandText(m) : null,
    labelScale: m.appearance.labelScale,
    speed: m.motion.speed,
    tone: m.audio.hz,
    toneLevel: m.audio.level,
    lane: rt.lane,
    selectable: m.layout.selectable,
  };
}

/** A module's starting angle and lane, honouring pinned values. A pinned phase
 *  means a saved arrangement reloads exactly as it was left; null means pick
 *  one, so a fresh stack does not start with every strip aligned. */
export function newRuntime(m: Module, laneSeq: number): Runtime {
  return {
    phase: m.motion.phase != null ? m.motion.phase : Math.random() * Math.PI * 2,
    lane: m.motion.lane != null ? m.motion.lane : laneSeq % LANES,
  };
}
