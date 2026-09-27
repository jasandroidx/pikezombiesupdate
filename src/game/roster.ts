// Batch 9 — Lane 4: character + stage roster data.
//
// Pure data + lookup helpers. No DOM, no localStorage here: persistence lives
// in meta.ts (selectedCharacterId / selectedStageId), which reads this file.
// The engine lane (Lane 1) reads characterDef()/stageDef() at run start and
// applies the starting weapon + passive mods / stage rule flags.
//
// Flavor constraint: Pike County, INDIANA only. No out-of-county place names
// anywhere in this file — batch9d.mjs asserts it.

import { INITIAL_WEAPONS, GAME_LOCATIONS } from "./constants";

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

/** Signature-passive tuning knobs. Lane 1 multiplies these into base stats at
 *  run start. Keep them small — roster passives are flavor, not builds. */
export interface CharacterPassiveMods {
  /** Multiplies all damage (e.g. 1.10 = +10%). */
  damageMul?: number;
  /** Multiplies headshot damage only. */
  headshotMul?: number;
  /** Multiplies fire rate (e.g. 1.12 = +12%). */
  fireRateMul?: number;
  /** Flat max-HP addition. */
  maxHpAdd?: number;
  /** Multiplies move speed. */
  speedMul?: number;
  /** Multiplies grit pickup radius. */
  pickupRadiusMul?: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  /** County-flavored role line, e.g. "Whiteoak hunter". */
  title: string;
  blurb: string;
  /** INITIAL_WEAPONS id — every character must point at a real weapon id. */
  weaponId: string;
  passiveName: string;
  passiveDesc: string;
  mods: CharacterPassiveMods;
  // Batch 10 (Lane 1): signature special — the active ability. The UI lane
  // renders the HUD button/key against special.name; the engine lane's
  // triggerSignature() reads special.cooldownSec for the cooldown and
  // dispatches the effect by character id.
  special: CharacterSpecial;
}

/** One active ability per survivor. name/desc/cooldown are data; the effect
 *  itself is implemented in the engine (Lane 1) — see SIGNATURE_TUNING. */
export interface CharacterSpecial {
  name: string;
  desc: string;
  /** Cooldown between activations, in seconds. */
  cooldownSec: number;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "otis_hale",
    name: "Otis Hale",
    title: "Petersburg deputy",
    blurb:
      "Last badge on the square. Kept his .357 Trail Magnum oiled through the whole quarantine and his draw hand quicker than gossip.",
    weaponId: "revolver",
    passiveName: "Quickdraw",
    passiveDesc: "+12% fire rate — the county's fastest holster, and he knows it.",
    mods: { fireRateMul: 1.12 },
    special: { name: "Deadeye Draw", desc: "2s of +150% fire rate — the fastest holster in Pike County, let loose.", cooldownSec: 20 },
  },
  {
    id: "eula_stillwell",
    name: "Eula Stillwell",
    title: "Whiteoak hunter",
    blurb:
      "Took her first buck at eleven on the Washington Township line and hasn't missed a clean shot since. The lever rifle is practically furniture in her hands.",
    weaponId: "lever_rifle",
    passiveName: "Still Hunter",
    passiveDesc: "+25% headshot damage — waits for the shot, then ends it.",
    mods: { headshotMul: 1.25 },
    special: { name: "Still Heart", desc: "5s of 0.35× slow-mo and guaranteed crits — she waits for the shot.", cooldownSec: 30 },
  },
  {
    id: "silas_mccord",
    name: "Silas McCord",
    title: "Winslow stillhand",
    blurb:
      "Ran the mash at the Winslow still till the revenuers of the dead showed up. His 12-gauge speaks barn-door diplomacy at arm's length.",
    weaponId: "shotgun",
    passiveName: "Mash Fire",
    passiveDesc: "+10% damage — everything he touches comes out stronger.",
    mods: { damageMul: 1.1 },
    special: { name: "Mash Bomb", desc: "Lobs a still-charge at the densest nearby cluster — delayed AoE blast.", cooldownSec: 25 },
  },
  {
    id: "thea_kettler",
    name: "Thea Kettler",
    title: "Stendal pit boss",
    blurb:
      "Worked the Stendal dragline till the highwall went quiet. Drags a chainsaw like a lunch pail and bruises like sandstone.",
    weaponId: "chainsaw",
    passiveName: "Dragline",
    passiveDesc: "+25 max HP — pit-boss hide, scarred and unbothered.",
    mods: { maxHpAdd: 25 },
    special: { name: "Dragline Sweep", desc: "A 360° chainsaw sweep that chews everything in reach.", cooldownSec: 20 },
  },
];

/** The survivor every existing run used: the Petersburg deputy with the
 *  revolver. selectedCharacterId() defaults here so old flows are unchanged. */
export const DEFAULT_CHARACTER_ID = "otis_hale";

export function characterExists(id: string): boolean {
  return CHARACTERS.some((c) => c.id === id);
}

/** Look up a character def. Unknown ids fall back to the default survivor —
 *  never throws, so a stale save can't break run start. */
export function characterDef(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS.find((c) => c.id === DEFAULT_CHARACTER_ID)!;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/** One distinct rules twist per map, surfaced on the select card. Lane 1
 *  reads stageDef(selectedStageId()).rules at run start and multiplies the
 *  named knobs into the sim. Knobs are advisory data — unknown keys are
 *  ignored by consumers. */
export interface StageDef {
  /** GAME_LOCATIONS id — every stage must map to a real location id. */
  id: string;
  /** Short twist label shown on the select card. */
  twist: string;
  /** One or two sentences of county flavor explaining the twist. */
  twistDesc: string;
  rules: Record<string, number>;
}

export const STAGES: StageDef[] = [
  {
    id: "white_oak_springs",
    twist: "Deep Woods, Long Night",
    twistDesc:
      "Denser timber than anywhere in the county, and the night drags a third longer. The lantern is your lifeline out here.",
    rules: { nightLengthMult: 1.3, treeDensityMult: 1.5 },
  },
  {
    id: "mccords_ford",
    twist: "Soft Bottom Ground",
    twistDesc:
      "The flooded ford keeps its cellar holes yawning open — nearly twice as many to board before the dead pour out.",
    rules: { holeCountMult: 1.6 },
  },
  {
    id: "stendal_backbone",
    twist: "Rich Seam, Hard Shift",
    twistDesc:
      "Richer grit under the highwall — but the dead walk this ground faster than anywhere else. Take the pay, keep moving.",
    rules: { gritMult: 1.25, zombieSpeedMult: 1.06 },
  },
  {
    id: "petersburg_square",
    twist: "Main Street Rally",
    twistDesc:
      "The square packs them shoulder to shoulder. Bigger packs, tighter streets, nowhere to breathe.",
    rules: { spawnPackMult: 1.3 },
  },
  {
    id: "winslow_still",
    twist: "Keg Alley",
    twistDesc:
      "Moonshine barrels stacked everywhere Silas ever ran a load. Chain the splash and let the still do the talking.",
    rules: { barrelMult: 2.0 },
  },
  {
    id: "honey_springs",
    twist: "Veterans of the Springs",
    twistDesc:
      "The oldest dead in the county walk the Spurgeon ground. Elites come out of the mist sooner here — bring your loudest gun.",
    rules: { eliteIntervalMult: 0.7 },
  },
];

export const DEFAULT_STAGE_ID = "white_oak_springs";

export function stageExists(id: string): boolean {
  return STAGES.some((s) => s.id === id);
}

/** Look up a stage def. Unknown ids fall back to White Oak Springs — never
 *  throws, so a stale save can't break run start. */
export function stageDef(id: string): StageDef {
  return STAGES.find((s) => s.id === id) ?? STAGES.find((s) => s.id === DEFAULT_STAGE_ID)!;
}

// ---------------------------------------------------------------------------
// Roster self-check (also asserted in tests/batch9d.mjs)
// ---------------------------------------------------------------------------

/** Every character points at a real INITIAL_WEAPONS id. */
export function rosterWeaponsValid(): boolean {
  const ids = new Set<string>(INITIAL_WEAPONS.map((w) => w.id));
  return CHARACTERS.every((c) => ids.has(c.weaponId));
}

/** Every stage points at a real GAME_LOCATIONS id. */
export function rosterStagesValid(): boolean {
  const ids = new Set<string>(GAME_LOCATIONS.map((l) => l.id));
  return STAGES.every((s) => ids.has(s.id));
}
