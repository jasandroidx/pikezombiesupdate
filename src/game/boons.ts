import { INITIAL_WEAPONS, tagsMatch } from "./constants";

export type BoonId = "lead" | "trigger" | "hide" | "shells" | "beam" | "jug" | "leavings" | "stride" | "bone" | "ring" | "post" | "pipe" | "storm" | "salt" | "fork" | "ricochet" | "seeker" | "aura" | "wompus" | "nova" | "missiles" | "chainlightning" | "orbiter" | "tracer" | "saltcircle" | "cornliquor" | "brinebarrel";

export type BoonRarity = "common" | "uncommon" | "rare";

export interface BoonOffer {
  id: BoonId;
  name: string;
  blurb: string;
  rarity: BoonRarity;
  // Batch 4: hidden offers are never drafted (e.g. Konami-code secrets).
  hidden?: boolean;
  // Batch 8 (Lane D): affinity tags — a tagged boon is a support boon; its
  // bonus links to a weapon only when they share a tag (supportApplies below).
  // Untagged boons are not tag-gated and apply as they do today.
  tags?: string[];
}

export const RARITY_WEIGHT: Record<BoonRarity, number> = { common: 60, uncommon: 30, rare: 10 };
export const RARITY_COLOR: Record<BoonRarity, string> = { common: "#9aa3ad", uncommon: "#4cc3ff", rare: "#c77dff" };

export const BOON_CATALOG: BoonOffer[] = [
  { id: "lead", name: "Hand-loaded lead", blurb: "Everything you fire hits 8% harder. No ceiling.", rarity: "common", tags: ["precise"] },
  { id: "trigger", name: "Filed trigger", blurb: "Faster fire and a quicker reload. No ceiling.", rarity: "common", tags: ["rapid", "sidearm"] },
  { id: "hide", name: "County hide", blurb: "+16 grit. Heals what it adds.", rarity: "common" },
  { id: "shells", name: "Box off the bench", blurb: "A pocket of rounds for every gun you own.", rarity: "common", tags: ["tube-fed"] },
  { id: "beam", name: "Fresh cells", blurb: "The Maglite reaches farther. Stacks.", rarity: "uncommon" },
  { id: "jug", name: "Another jug", blurb: "One more mason jar of mash.", rarity: "common" },
  { id: "leavings", name: "Pocket the leavings", blurb: "45 scrap now, and the dead pay better. Stacks.", rarity: "common" },
  { id: "stride", name: "Longer stride", blurb: "You cover more ground between them. Stacks.", rarity: "uncommon" },
  { id: "bone", name: "Buck and bone", blurb: "When one drops, the burst is meaner and reaches farther. Stacks.", rarity: "uncommon" },
  { id: "ring", name: "Another round", blurb: "One more shell in the ring that swings whether you fire or not. Stacks.", rarity: "uncommon" },
  { id: "post", name: "Cedar post", blurb: "A fence post and a deer rifle. It watches a lane until the tube is empty.", rarity: "rare" },
  { id: "pipe", name: "Stovepipe", blurb: "Capped pipe, black powder, a percussion cap. Lay it down. They step on it.", rarity: "uncommon" },
  { id: "storm", name: "Storm jar", blurb: "Lightning hunts the dead on its own. Chains farther. Stacks.", rarity: "rare" },
  { id: "salt", name: "Salt line", blurb: "A burning ring around your boots. Wider and hotter. Stacks.", rarity: "rare" },
  { id: "fork", name: "Forking rounds", blurb: "On impact, rounds split into +1 spectral projectile per rank.", rarity: "rare", tags: ["scatter"] },
  { id: "ricochet", name: "Bank shots", blurb: "Rounds bounce to another dead man, losing 25% damage per bounce.", rarity: "uncommon", tags: ["precise"] },
  { id: "seeker", name: "Heatseeker node", blurb: "Your rounds hunt. Every trigger pull curves toward the dead.", rarity: "rare", tags: ["precise"] },
  { id: "aura", name: "Volatile aura", blurb: "A burning plasma field around your boots. Wider and hotter per rank. Locks out Orbiting Blades.", rarity: "rare" },
  // Batch 4: hidden — never offered in drafts. Granted by the Konami code only.
  { id: "wompus", name: "Wompus Howler", blurb: "The Winslow Wompus cat yowls through a bored-out carbine. Not offered. Earned.", rarity: "rare", hidden: true },
  { id: "nova", name: "Still-Yard Burst", blurb: "Every few seconds the still-yard answers: a radial burst of burning rounds.", rarity: "rare" },
  { id: "missiles", name: "Canary Rockets", blurb: "Slow, heavy rockets that hunt the dead and bloom on impact. Long reload.", rarity: "rare" },
  // Batch 7 (Lane B): special-weapon unlock boons. Taking one grants the
  // matching SPECIAL_WEAPON_DEFS row in constants.ts (engine lane wires it).
  { id: "chainlightning", name: "Patoka Arc", blurb: "Storm bottled from a leyden rig. Lightning leaps between the dead, 4 jumps deep.", rarity: "rare" },
  { id: "orbiter", name: "Still-Yard Blades", blurb: "Saw teeth on a chain, circling your boots till the chain runs out. They never stop walking.", rarity: "rare" },
  // Batch 10 (Lane 4): synergy picks.
  // tracer: weapon mod — links to precise + scatter families (ricochet/fork geometry builds).
  { id: "tracer", name: "Tracer Rounds", blurb: "Phosphor-lit rounds off a Petersburg bench: +1 pierce, +15% travel speed per rank.", rarity: "uncommon", tags: ["precise", "scatter"] },
  // saltcircle: defensive support — damage taken falls while you stand still.
  // Affinity-gated per the Batch 9 rule: links ONLY to tube-fed irons (shotgun, lever rifle).
  // NOTE: an older boon (id "salt", "Salt line") is the burning-ring aura; this is the
  // stand-still defensive stance. Names are close — coordinator may want a rename pass.
  { id: "saltcircle", name: "Salt Circle", blurb: "Plant your boots in the county salt circle: −8% damage taken per rank, only while you stand still.", rarity: "common", tags: ["tube-fed"] },
  // cornliquor: real tradeoff passive — faster trigger, slower boots.
  { id: "cornliquor", name: "Corn Liquor", blurb: "Petersburg white lightning: +12% fire rate, −6% move speed per rank. Courage has a gait.", rarity: "common" },
  // brinebarrel: explosive-build support — barrels, bombers, B-bomb, Silas's Mash Bomb.
  { id: "brinebarrel", name: "Brine Barrel", blurb: "Pickle-brine from the Winslow cellar: explosions hit +30% harder per rank and leave a burning brine patch.", rarity: "rare" },
];

// Batch 3: ability forks with lockout — some picks close off alternatives.
export const LOCKOUTS: Record<string, string[]> = {
  aura: ["ring"],
  ring: ["aura"],
};

// Batch 8 (Lane D): support-gem linking — pure helpers. A support boon (one
// carrying tags) applies its bonus to a weapon ONLY when they share at least
// one tag. Untagged boons are not tag-gated and apply as they do today.
// DATA ONLY for now: the coordinator wires these into the damage path
// (playerDamageMul/familyAffinity in engine.ts); nothing rebalances until then.
export function weaponTagsOf(weaponId: string): string[] {
  return INITIAL_WEAPONS.find((w) => w.id === weaponId)?.tags ?? [];
}

export function boonTagsOf(boonId: string): string[] {
  return BOON_CATALOG.find((b) => b.id === boonId)?.tags ?? [];
}

// True when boonId's bonus applies to weaponId: untagged boons always apply;
// tagged (support) boons apply only on a shared tag.
export function supportApplies(boonId: string, weaponId: string): boolean {
  const boonTags = boonTagsOf(boonId);
  if (boonTags.length === 0) return true;
  return tagsMatch(weaponTagsOf(weaponId), boonTags);
}

// The held support boons (from a boonStacks record) whose bonuses link to the
// given weapon — the per-weapon filter the damage path will iterate.
export function applicableSupportBoons(boonStacks: Record<string, number>, weaponId: string): string[] {
  return Object.keys(boonStacks).filter((boonId) => (boonStacks[boonId] ?? 0) > 0 && supportApplies(boonId, weaponId));
}

// Batch 10 (Lane 4): per-rank math for the four new synergy boons. DATA ONLY
// (Batch 8 style): the engine lane wires these into the projectile / fire-rate /
// damage-taken / explosion paths; nothing rebalances until then.

// Tracer Rounds (uncommon weapon mod): +1 pierce per rank, +15% projectile
// speed per rank. Tag-gated to precise + scatter weapons (ricochet/fork builds).
export function tracerPierceBonus(rank: number): number { return Math.max(0, Math.floor(rank)); }
export function tracerSpeedMul(rank: number): number { return 1 + 0.15 * rank; }

// Salt Circle (common defensive support): −8% damage taken per rank, but ONLY
// while the player is standing still. Affinity-gated per the Batch 9 rule —
// the boon links only to tube-fed weapons (shotgun, lever rifle) via
// supportApplies; the engine also checks the player hasn't moved recently
// before applying saltCircleDefenseMul. saltCircleApplies covers the tag half.
export function saltCircleDefenseMul(rank: number): number { return Math.max(0, 1 - 0.08 * rank); }
export function saltCircleApplies(boonStacks: Record<string, number>, weaponId: string): boolean {
  return (boonStacks["saltcircle"] ?? 0) > 0 && supportApplies("saltcircle", weaponId);
}

// Corn Liquor (common tradeoff passive): +12% fire rate, −6% move speed per
// rank. Untagged — a global passive, applies as today.
export function cornLiquorFireRateMul(rank: number): number { return 1 + 0.12 * rank; }
export function cornLiquorMoveMul(rank: number): number { return Math.max(0.5, 1 - 0.06 * rank); }

// Brine Barrel (rare explosive support): barrels, bombers, the B-bomb, and
// Silas's Mash Bomb deal +30% per rank and leave a brine burn patch whose
// radius and duration scale with rank (dps per rank). Untagged — explosions
// are not weapons, so there is no tag family to gate on; applies globally.
export function brineExplosionMul(rank: number): number { return 1 + 0.30 * rank; }
export function brinePatch(rank: number): { radius: number; durationMs: number; dps: number } {
  return { radius: 46 + 6 * rank, durationMs: 1500 + 500 * rank, dps: 10 * rank };
}

export function rollBoons(stacks: Record<string, number>, molotovs: number, maxMolotovs: number, posts = 0, pipes = 0, banished: Set<string> = new Set()): BoonOffer[] {
  const pool = BOON_CATALOG.filter((b) => {
    if (b.hidden) return false; // Batch 4: secrets are never drafted.
    if (banished.has(b.id)) return false;
    if ((stacks[b.id] ?? 0) >= (b.id === "hide" ? 8 : b.id === "storm" || b.id === "salt" || b.id === "saltcircle" ? 6 : b.id === "fork" ? 3 : b.id === "seeker" ? 2 : b.id === "ricochet" ? 4 : b.id === "aura" ? 6 : b.id === "tracer" || b.id === "cornliquor" || b.id === "brinebarrel" ? 5 : 99)) return false;
    if (b.id === "jug" && molotovs >= maxMolotovs) return false;
    if (b.id === "post" && posts >= 3) return false;
    if (b.id === "pipe" && pipes >= 4) return false;
    return true;
  });
  const bag = pool.length >= 3 ? pool : BOON_CATALOG.filter((b) => !b.hidden && !banished.has(b.id));
  // Rarity-weighted pick: 60/30/10 common/uncommon/rare, without replacement.
  // Batch 10 (Lane 4): pick UNIFORMLY within the rolled tier. The old code took
  // the first remaining entry of the tier (findIndex), so in real drafts only
  // the first ~3 entries of each tier could ever be offered — every later
  // catalog entry (shells, fork, ricochet, chainlightning, orbiter, and all
  // four Batch 10 boons) was dead content. No boon definition is touched.
  const picks: BoonOffer[] = [];
  const remaining = bag.slice();
  while (picks.length < 3 && remaining.length > 0) {
    const tiers: BoonRarity[] = ["common", "uncommon", "rare"];
    const avail = tiers.filter((t) => remaining.some((b) => b.rarity === t));
    const weights = avail.map((t) => RARITY_WEIGHT[t]);
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total, tier: BoonRarity = avail[0];
    for (let i = 0; i < avail.length; i++) { roll -= weights[i]; if (roll <= 0) { tier = avail[i]; break; } }
    const idxs = remaining.map((b, i) => (b.rarity === tier ? i : -1)).filter((i) => i >= 0);
    const idx = idxs[Math.floor(Math.random() * idxs.length)];
    picks.push(remaining.splice(idx, 1)[0]);
  }
  return picks;
}
