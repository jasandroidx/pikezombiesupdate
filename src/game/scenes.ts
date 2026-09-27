// ---------------------------------------------------------------------------
// Batch 11 — Lane 3 (data/content): data-driven scene files.
//
// Every map's layout lives here as pure data keyed by location id:
//   SCENES: Record<locationId, { holes, barrels, barricades, loreNotes, props }>
//
// The numbers were transcribed verbatim from GAME_LOCATIONS in
// src/game/constants.ts (the rows the engine's init*() functions read today).
// buildMapFeatures() rebuilds EXACTLY what those init functions produce:
//   - initBarricades      (engine.ts ~L389)  — id bar_${i}, health by type
//   - initLoreNotes       (engine.ts ~L985)  — spread copy, fresh content[], collected:false
//   - initHoles           (engine.ts ~L1043) — id hole_${i}, radius by kind
//   - initExplosiveBarrels(engine.ts ~L1179) — id barrel_${i}_${Date.now()}, r18/hp45
// plus the Batch-9 stage rules knobs (holeCountMult / barrelMult) with the
// same jittered-copy algorithm as applyStageTerrain (engine.ts ~L1995).
//
// ENGINE REWIRE (coordinator): see the Lane-3 rewire spec in the batch report.
// The loader owns all layout logic; engine.ts keeps only the call sites.
// ---------------------------------------------------------------------------

export interface SceneHoleDef {
  x: number;
  y: number;
  kind: string;
}

export interface SceneBarrelDef {
  x: number;
  y: number;
}

export interface SceneBarricadeDef {
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
}

export interface SceneLoreNoteDef {
  id: string;
  locationId: string;
  title: string;
  author: string;
  date: string;
  content: string[];
  x: number;
  y: number;
  radius: number;
}

/** Per-map prop scatter that is data, not geometry: the mounted-gun name from
 *  placeClues(), the powerup the second lore note drops (interactLoreNote),
 *  and the map dims the storm-jar anchor formula needs. */
export interface SceneProps {
  mapWidth: number;
  mapHeight: number;
  /** placeClues(): name of the mounted gun ("Spring gun", "Ford gun", ...). */
  mountedGunName: string;
  /** interactLoreNote(): powerup id dropped when the second note is read. */
  noteGift: string;
}

export interface SceneDef {
  holes: SceneHoleDef[];
  barrels: SceneBarrelDef[];
  barricades: SceneBarricadeDef[];
  loreNotes: SceneLoreNoteDef[];
  props: SceneProps;
}

// --- Runtime shapes (what the engine's init*() functions produce) ------------

export interface BuiltBarricade {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  type: string;
}

export interface BuiltHole {
  id: string;
  x: number;
  y: number;
  radius: number;
  boarded: boolean;
  boardHealth: number;
  maxBoardHealth: number;
  kind: string;
}

export interface BuiltBarrel {
  id: string;
  x: number;
  y: number;
  radius: number;
  health: number;
  maxHealth: number;
}

export interface BuiltLoreNote extends SceneLoreNoteDef {
  collected: boolean;
}

export interface MapFeatures {
  barricades: BuiltBarricade[];
  holes: BuiltHole[];
  barrels: BuiltBarrel[];
  loreNotes: BuiltLoreNote[];
  props: SceneProps;
}

/** Batch-9 stage rules knobs that touch layout. Passed through from
 *  stageDef(selectedStageId()).rules — structural type so scenes.ts never
 *  imports roster.ts. */
export interface StageTerrainRules {
  holeCountMult?: number;
  barrelMult?: number;
}

// ---------------------------------------------------------------------------
// SCENES — transcribed verbatim from GAME_LOCATIONS (constants.ts).
// ---------------------------------------------------------------------------

export const SCENES: Record<string, SceneDef> = {
  white_oak_springs: {
    holes: [
      { x: 840, y: 1140, kind: "cellar" },
      { x: 1180, y: 1140, kind: "cellar" },
      { x: 640, y: 720, kind: "cellar" },
    ],
    barrels: [
      { x: 730, y: 980 },
    ],
    barricades: [
      { x: 840, y: 900, width: 90, height: 18, type: "wood_fence" },
      { x: 1140, y: 900, width: 90, height: 18, type: "wood_fence" },
    ],
    loreNotes: [
      {
        id: "note_springs_journal",
        locationId: "white_oak_springs",
        title: "Henry Stillwell's Camp Book",
        author: "Henry Stillwell",
        date: "October 12, 1983",
        content: [
          "Lincoln camped here on the road to Vincennes. So did I, a hundred and fifty years later, because the spring never froze.",
          "Three weeks back the water went to iron and sulfur. Doc Vance said typhoid. Typhoid don't make a man's eyes milk over while he still walks.",
          "I boarded the cellar. If you find this: they come out of the holes. Don't go down.",
        ],
        x: 1020,
        y: 840,
        radius: 26,
      },
      {
        id: "note_hargrove_deed",
        locationId: "white_oak_springs",
        title: "Water-Stained Township Deed",
        author: "Col. Hargrove's line",
        date: "November 1, 1983",
        content: [
          "White Oak Springs was the first. Petersburg was the seat. The dead do not care which.",
          "Lantern in the east window means the Hargrove place is still held. If the lantern's out, burn the cabin and keep walking the Trace.",
        ],
        x: 1280,
        y: 900,
        radius: 26,
      },
    ],
    props: {
      mapWidth: 2000,
      mapHeight: 1800,
      mountedGunName: "Spring gun",
      noteGift: "speed_boost",
    },
  },
  mccords_ford: {
    holes: [],
    barrels: [
      { x: 820, y: 780 },
      { x: 1180, y: 820 },
      { x: 1480, y: 900 },
      { x: 700, y: 1040 },
    ],
    barricades: [
      { x: 860, y: 820, width: 110, height: 16, type: "wood_fence" },
      { x: 1080, y: 820, width: 110, height: 16, type: "wood_fence" },
      { x: 980, y: 1080, width: 80, height: 16, type: "sandbags" },
    ],
    loreNotes: [
      {
        id: "note_lincoln_trace",
        locationId: "mccords_ford",
        title: "Pencil on a Feed Sack",
        author: "Unknown",
        date: "Unknown",
        content: [
          "East Trace and West Trace come together here. So did the Lincolns, going north in 1830.",
          "There is no boat. The water is full of floaters that bite if you try to swim.",
          "If you have mash or gasoline, mix it with rags. Fire is the only thing that makes them hesitate.",
        ],
        x: 1000,
        y: 900,
        radius: 26,
      },
      {
        id: "note_horseshoe",
        locationId: "mccords_ford",
        title: "Conservancy Notice",
        author: "Upper Patoka River Conservancy",
        date: "September 8, 1983",
        content: [
          "Horseshoe Bend was straightened in the 1920s. The old channel is still down there under the silt.",
          "Air monitors at the dredge spoil read clean. The crew did not. They stood back up.",
          "Do not wade. Do not drag. Burn what comes out of the cut.",
          "Jackson Corn's entry, southwest quarter of Section 16, Township 2 South, Range 7 West, holds a sandstone bridge thirty feet long. Do not shelter under it.",
        ],
        x: 1440,
        y: 760,
        radius: 26,
      },
    ],
    props: {
      mapWidth: 2200,
      mapHeight: 1800,
      mountedGunName: "Ford gun",
      noteGift: "infinite_ammo",
    },
  },
  stendal_backbone: {
    holes: [
      { x: 1100, y: 920, kind: "pit" },
      { x: 1260, y: 900, kind: "pit" },
      { x: 940, y: 910, kind: "pit" },
    ],
    barrels: [
      { x: 930, y: 760 },
      { x: 1280, y: 760 },
      { x: 670, y: 940 },
      { x: 1460, y: 1060 },
    ],
    barricades: [
      { x: 900, y: 920, width: 120, height: 20, type: "coal_cart" },
      { x: 1180, y: 920, width: 120, height: 20, type: "coal_cart" },
    ],
    loreNotes: [
      {
        id: "note_mine_incident",
        locationId: "stendal_backbone",
        title: "Sealed Shift Report",
        author: "Foreman Grady McCoy",
        date: "September 19, 1983",
        content: [
          "The highwall let go on the night shift. Not a slide — a breath. The pit exhaled.",
          "Zero methane. The crew went to convulsions anyway. Rescue found them standing.",
          "We locked the bulkhead from the surface. Fifty-two men are down there, and they know the latch.",
        ],
        x: 1100,
        y: 800,
        radius: 26,
      },
      {
        id: "note_dragline",
        locationId: "stendal_backbone",
        title: "Peabody Equipment Log",
        author: "Night oiler",
        date: "October 3, 1983",
        content: [
          "Dragline walked itself twenty yards toward Stendal. Cab empty. Lights on.",
          "Helmet lamps in the pit are not ours. They don't bob like a man walking. They hunt.",
          "If the Behemoth comes over the wall, you do not hold the ridge. You run the Trace.",
        ],
        x: 760,
        y: 1000,
        radius: 26,
      },
    ],
    props: {
      mapWidth: 2200,
      mapHeight: 1900,
      mountedGunName: "Highwall gun",
      noteGift: "insta_kill",
    },
  },
  petersburg_square: {
    holes: [],
    barrels: [
      { x: 800, y: 780 },
      { x: 1010, y: 820 },
      { x: 1480, y: 780 },
      { x: 760, y: 1080 },
    ],
    barricades: [
      { x: 1020, y: 900, width: 130, height: 18, type: "sandbags" },
      { x: 1220, y: 900, width: 130, height: 18, type: "sandbags" },
      { x: 900, y: 1040, width: 90, height: 16, type: "wood_fence" },
    ],
    loreNotes: [
      {
        id: "note_square_orders",
        locationId: "petersburg_square",
        title: "National Guard Standing Orders",
        author: "Capt. R. Sterling, Indiana Guard",
        date: "November 12, 1983",
        content: [
          "Quarantine holds at the county line. No one from Pike crosses into Dubois. Huntingburg is not a refuge.",
          "Infection rides saliva and the fog. Keep the searchlight on the square. If the courthouse falls, burn the records and fall back to the Trace.",
        ],
        x: 1180,
        y: 720,
        radius: 26,
      },
      {
        id: "note_sheriff",
        locationId: "petersburg_square",
        title: "Water-Stained Dispatch",
        author: "Deputy C. Miller, Pike Co. Sheriff",
        date: "November 2, 1983",
        content: [
          "Code 99 at the springs. Road blocked by timber trucks that nobody parked.",
          "Shot one three times with issue .38. It kept crawling with half a collarbone.",
          "If the bell rings at dawn, we held. If it doesn't, don't come looking.",
        ],
        x: 900,
        y: 880,
        radius: 26,
      },
    ],
    props: {
      mapWidth: 2400,
      mapHeight: 1800,
      mountedGunName: "Searchlight gun",
      noteGift: "double_points",
    },
  },
  winslow_still: {
    holes: [],
    barrels: [
      { x: 860, y: 800 },
      { x: 1180, y: 790 },
      { x: 730, y: 980 },
      { x: 1400, y: 680 },
    ],
    barricades: [
      { x: 860, y: 880, width: 100, height: 16, type: "wood_fence" },
      { x: 1080, y: 880, width: 100, height: 16, type: "wood_fence" },
      { x: 900, y: 1080, width: 90, height: 16, type: "sandbags" },
    ],
    loreNotes: [
      {
        id: "note_silas",
        locationId: "winslow_still",
        title: "Silas Boyd's Last Journal",
        author: "Silas Boyd, moonshiner",
        date: "October 24, 1983",
        content: [
          "Boyds have been on this township roll since the first entries. I will not leave the still to them.",
          "The well went to sulfur three weeks before the dead clawed the loam.",
          "Don't aim for the chest. Ribs are brittle. The jaw don't stop till the skull splits clean open.",
        ],
        x: 1020,
        y: 800,
        radius: 26,
      },
      {
        id: "note_augusta_road",
        locationId: "winslow_still",
        title: "Note on the Stendal Road",
        author: "Unknown survivor",
        date: "Unknown",
        content: [
          "Old Winslow–Stendal Road still follows the Indian trace along the ridge. Augusta is dark.",
          "If you have high-proof mash, you have a weapon. If you have dawn, you have a county.",
          "Ring the bell if you live. Tell them a Boyd held the yard.",
        ],
        x: 1320,
        y: 900,
        radius: 26,
      },
    ],
    props: {
      mapWidth: 2100,
      mapHeight: 1800,
      mountedGunName: "Still gun",
      noteGift: "molotov_pickup",
    },
  },
  honey_springs: {
    holes: [
      { x: 680, y: 1120, kind: "cellar" },
      { x: 1240, y: 1160, kind: "pit" },
    ],
    barrels: [
      { x: 820, y: 760 },
      { x: 1100, y: 720 },
      { x: 1280, y: 900 },
      { x: 760, y: 1040 },
    ],
    barricades: [
      { x: 820, y: 780, width: 90, height: 16, type: "wood_fence" },
      { x: 1080, y: 780, width: 90, height: 16, type: "wood_fence" },
    ],
    loreNotes: [
      {
        id: "note_harrison_riders",
        locationId: "honey_springs",
        title: "Patrol Roll, Yellow Banks",
        author: "A rider under General Harrison",
        date: "copied, undated",
        content: [
          "Thirty mounted men were sent to keep the traces and the fords. The south bank of the Patoka was already full of stories older than the county.",
          "We watered at Honey Springs and did not stay the night. The horses would not drink the second time.",
          "If the spring tastes of honey and then of iron, leave the store. Do not go into the cellar.",
        ],
        x: 980,
        y: 760,
        radius: 26,
      },
      {
        id: "note_1817_commission",
        locationId: "honey_springs",
        title: "Seat of Justice, Unfinished",
        author: "Clerk's copy",
        date: "February 1817",
        content: [
          "On the fifteenth, Col. Hargrove and the commissioners fixed the seat at Petersburg. Weather turned them back before they could walk this side of the river.",
          "Spurgeon grew up later around the springs. The ground they skipped is the ground that is walking now.",
          "Board the holes. The commission never looked down them.",
        ],
        x: 1260,
        y: 860,
        radius: 26,
      },
    ],
    props: {
      mapWidth: 1900,
      mapHeight: 1700,
      mountedGunName: "Store gun",
      noteGift: "moonshine_med",
    },
  },
};

// ---------------------------------------------------------------------------
// Loader — replaces the engine init*() bodies. Pure except Date.now() in
// barrel ids (matches initExplosiveBarrels today).
// ---------------------------------------------------------------------------

/** The Batch-9 numeric guard from applyStageTerrain: finite numbers only. */
const num = (v: unknown, d: number): number =>
  typeof v === "number" && isFinite(v) ? v : d;

export function sceneDef(locationId: string): SceneDef {
  const s = SCENES[locationId];
  if (!s) throw new Error(`scenes.ts: unknown location id "${locationId}"`);
  return s;
}

/** initBarricades (engine.ts ~L389): id bar_${i}; coal_cart 220, sandbags 160, else 90. */
export function buildBarricades(locationId: string): BuiltBarricade[] {
  const defs = sceneDef(locationId).barricades;
  return defs.map((e, t) => ({
    id: `bar_${t}`,
    x: e.x,
    y: e.y,
    width: e.width,
    height: e.height,
    health: e.type === "coal_cart" ? 220 : e.type === "sandbags" ? 160 : 90,
    maxHealth: e.type === "coal_cart" ? 220 : e.type === "sandbags" ? 160 : 90,
    type: e.type,
  }));
}

/** initHoles (engine.ts ~L1043) + the applyStageTerrain holeCountMult top-up.
 *  The jittered-copy loop is byte-for-byte the engine's: source index drawn
 *  from the GROWING array, ±110 jitter, ids hole_x${k}. */
export function buildHoles(
  locationId: string,
  rules?: StageTerrainRules,
  rng: () => number = Math.random
): BuiltHole[] {
  const holes: BuiltHole[] = sceneDef(locationId).holes.map((e, t) => ({
    id: `hole_${t}`,
    x: e.x,
    y: e.y,
    radius: e.kind === "pit" ? 28 : 22,
    boarded: false,
    boardHealth: 90,
    maxBoardHealth: 90,
    kind: e.kind,
  }));
  const holeMult = num(rules?.holeCountMult, 1);
  const wantHoles = Math.round(holes.length * holeMult);
  for (let k = holes.length; k < wantHoles; k++) {
    const src = holes[(rng() * holes.length) | 0];
    if (!src) break;
    holes.push({
      id: `hole_x${k}`,
      x: Math.round(src.x + (rng() * 220 - 110)),
      y: Math.round(src.y + (rng() * 220 - 110)),
      radius: src.radius,
      boarded: false,
      boardHealth: 90,
      maxBoardHealth: 90,
      kind: src.kind,
    });
  }
  return holes;
}

/** initExplosiveBarrels (engine.ts ~L1179) + the applyStageTerrain barrelMult
 *  top-up. Re-inits from base data first (idempotent across repeated starts),
 *  then tops up: source index drawn from the BASE array only, ±80 jitter,
 *  ids barrel_x${k}. */
export function buildBarrels(
  locationId: string,
  rules?: StageTerrainRules,
  rng: () => number = Math.random
): BuiltBarrel[] {
  const now = Date.now();
  const barrels: BuiltBarrel[] = sceneDef(locationId).barrels.map((e, t) => ({
    id: `barrel_${t}_${now}`,
    x: e.x,
    y: e.y,
    radius: 18,
    health: 45,
    maxHealth: 45,
  }));
  const barrelMult = num(rules?.barrelMult, 1);
  const baseBarrels = barrels.length;
  const wantBarrels = Math.round(baseBarrels * barrelMult);
  for (let k = baseBarrels; k < wantBarrels; k++) {
    const src = barrels[(rng() * baseBarrels) | 0];
    if (!src) break;
    barrels.push({
      id: `barrel_x${k}`,
      x: Math.round(src.x + (rng() * 160 - 80)),
      y: Math.round(src.y + (rng() * 160 - 80)),
      radius: 18,
      health: 45,
      maxHealth: 45,
    });
  }
  return barrels;
}

/** initLoreNotes (engine.ts ~L985): spread copy, fresh content[], collected:false.
 *  (placeClues() repositioning via freeSpot stays engine-side — geometry, not data.) */
export function buildLoreNotes(locationId: string): BuiltLoreNote[] {
  const defs = sceneDef(locationId).loreNotes;
  return defs.map((e) => ({
    ...e,
    content: [...(e.content || [])],
    collected: false,
  }));
}

/** Full scene build — what loadMapFeatures() hands the engine. */
export function buildMapFeatures(
  locationId: string,
  opts?: { rules?: StageTerrainRules; rng?: () => number }
): MapFeatures {
  const rng = opts?.rng ?? Math.random;
  return {
    barricades: buildBarricades(locationId),
    holes: buildHoles(locationId, opts?.rules, rng),
    barrels: buildBarrels(locationId, opts?.rules, rng),
    loreNotes: buildLoreNotes(locationId),
    props: sceneDef(locationId).props,
  };
}

/** Base (pre-stage-rule) feature counts — feeds the roster9 probe's
 *  holesBase/barrelsBase bookkeeping (_holesBase9 / _barrelsBase9). */
export function sceneBaseCounts(locationId: string): {
  holes: number;
  barrels: number;
  barricades: number;
  loreNotes: number;
} {
  const s = sceneDef(locationId);
  return {
    holes: s.holes.length,
    barrels: s.barrels.length,
    barricades: s.barricades.length,
    loreNotes: s.loreNotes.length,
  };
}

/** initJars() (engine.ts ~L1034): the 5 storm-jar anchors. The formula is the
 *  engine's; only the dims come from data now. freeSpot() placement stays
 *  engine-side (needs obstacle/workbench geometry). */
export function buildJarAnchors(locationId: string): Array<{ x: number; y: number }> {
  const { mapWidth: w, mapHeight: h } = sceneDef(locationId).props;
  return [
    { x: 360, y: 340 },
    { x: w - 360, y: 340 },
    { x: 360, y: h - 340 },
    { x: w - 360, y: h - 360 },
    { x: w * 0.5, y: 300 },
  ];
}

// ---------------------------------------------------------------------------
// Per-map data currently inlined in engine methods (moved here as data so the
// coordinator can swap the inline maps for imports).
// ---------------------------------------------------------------------------

/** placeClues() (engine.ts ~L1017): mounted-gun name per location. */
export const MOUNTED_GUN_NAMES: Record<string, string> = {
  white_oak_springs: "Spring gun",
  mccords_ford: "Ford gun",
  stendal_backbone: "Highwall gun",
  petersburg_square: "Searchlight gun",
  winslow_still: "Still gun",
  honey_springs: "Store gun",
};

/** interactLoreNote() (engine.ts ~L1164): powerup dropped by the second note. */
export const NOTE_GIFTS: Record<string, string> = {
  white_oak_springs: "speed_boost",
  mccords_ford: "infinite_ammo",
  stendal_backbone: "insta_kill",
  petersburg_square: "double_points",
  winslow_still: "molotov_pickup",
  honey_springs: "moonshine_med",
};

/** Self-check: every location id the game knows must have a complete scene.
 *  Pass GAME_LOCATIONS ids from the caller (scenes.ts never imports constants). */
export function validateScenes(locationIds: string[]): { ok: boolean; missing: string[]; invalid: string[] } {
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const id of locationIds) {
    const s = SCENES[id];
    if (!s) {
      missing.push(id);
      continue;
    }
    const bad: string[] = [];
    if (!Array.isArray(s.holes)) bad.push("holes");
    if (!Array.isArray(s.barrels) || s.barrels.length === 0) bad.push("barrels");
    if (!Array.isArray(s.barricades)) bad.push("barricades");
    if (!Array.isArray(s.loreNotes) || s.loreNotes.length === 0) bad.push("loreNotes");
    if (!s.props || typeof s.props.mapWidth !== "number" || typeof s.props.mapHeight !== "number") bad.push("props.dims");
    if (!s.props || typeof s.props.mountedGunName !== "string" || !s.props.mountedGunName) bad.push("props.mountedGunName");
    if (!s.props || typeof s.props.noteGift !== "string" || !s.props.noteGift) bad.push("props.noteGift");
    for (const n of s.loreNotes || []) {
      if (n.locationId !== id || !n.id || !Array.isArray(n.content)) { bad.push(`loreNote:${n.id || "?"}`); break; }
    }
    if (bad.length) invalid.push(`${id} (${bad.join(",")})`);
  }
  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}
