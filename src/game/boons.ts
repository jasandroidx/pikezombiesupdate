export type BoonId = "lead" | "trigger" | "hide" | "shells" | "beam" | "jug" | "leavings" | "stride" | "bone" | "ring" | "post" | "pipe" | "storm" | "salt" | "fork" | "ricochet" | "seeker" | "aura" | "wompus" | "nova" | "missiles";

export type BoonRarity = "common" | "uncommon" | "rare";

export interface BoonOffer {
  id: BoonId;
  name: string;
  blurb: string;
  rarity: BoonRarity;
  // Batch 4: hidden offers are never drafted (e.g. Konami-code secrets).
  hidden?: boolean;
}

export const RARITY_WEIGHT: Record<BoonRarity, number> = { common: 60, uncommon: 30, rare: 10 };
export const RARITY_COLOR: Record<BoonRarity, string> = { common: "#9aa3ad", uncommon: "#4cc3ff", rare: "#c77dff" };

export const BOON_CATALOG: BoonOffer[] = [
  { id: "lead", name: "Hand-loaded lead", blurb: "Everything you fire hits 8% harder. No ceiling.", rarity: "common" },
  { id: "trigger", name: "Filed trigger", blurb: "Faster fire and a quicker reload. No ceiling.", rarity: "common" },
  { id: "hide", name: "County hide", blurb: "+16 grit. Heals what it adds.", rarity: "common" },
  { id: "shells", name: "Box off the bench", blurb: "A pocket of rounds for every gun you own.", rarity: "common" },
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
  { id: "fork", name: "Forking rounds", blurb: "On impact, rounds split into +1 spectral projectile per rank.", rarity: "rare" },
  { id: "ricochet", name: "Bank shots", blurb: "Rounds bounce to another dead man, losing 25% damage per bounce.", rarity: "uncommon" },
  { id: "seeker", name: "Heatseeker node", blurb: "Your rounds hunt. Every trigger pull curves toward the dead.", rarity: "rare" },
  { id: "aura", name: "Volatile aura", blurb: "A burning plasma field around your boots. Wider and hotter per rank. Locks out Orbiting Blades.", rarity: "rare" },
  // Batch 4: hidden — never offered in drafts. Granted by the Konami code only.
  { id: "wompus", name: "Wompus Howler", blurb: "The Winslow Wompus cat yowls through a bored-out carbine. Not offered. Earned.", rarity: "rare", hidden: true },
  { id: "nova", name: "Still-Yard Burst", blurb: "Every few seconds the still-yard answers: a radial burst of burning rounds.", rarity: "rare" },
  { id: "missiles", name: "Canary Rockets", blurb: "Slow, heavy rockets that hunt the dead and bloom on impact. Long reload.", rarity: "rare" },
];

// Batch 3: ability forks with lockout — some picks close off alternatives.
export const LOCKOUTS: Record<string, string[]> = {
  aura: ["ring"],
  ring: ["aura"],
};

export function rollBoons(stacks: Record<string, number>, molotovs: number, maxMolotovs: number, posts = 0, pipes = 0, banished: Set<string> = new Set()): BoonOffer[] {
  const pool = BOON_CATALOG.filter((b) => {
    if (b.hidden) return false; // Batch 4: secrets are never drafted.
    if (banished.has(b.id)) return false;
    if ((stacks[b.id] ?? 0) >= (b.id === "hide" ? 8 : b.id === "storm" || b.id === "salt" ? 6 : b.id === "fork" ? 3 : b.id === "seeker" ? 2 : b.id === "ricochet" ? 4 : b.id === "aura" ? 6 : 99)) return false;
    if (b.id === "jug" && molotovs >= maxMolotovs) return false;
    if (b.id === "post" && posts >= 3) return false;
    if (b.id === "pipe" && pipes >= 4) return false;
    return true;
  });
  const bag = pool.length >= 3 ? pool : BOON_CATALOG.filter((b) => !b.hidden && !banished.has(b.id));
  // Rarity-weighted pick: 60/30/10 common/uncommon/rare, without replacement.
  const picks: BoonOffer[] = [];
  const remaining = bag.slice();
  while (picks.length < 3 && remaining.length > 0) {
    const tiers: BoonRarity[] = ["common", "uncommon", "rare"];
    const avail = tiers.filter((t) => remaining.some((b) => b.rarity === t));
    const weights = avail.map((t) => RARITY_WEIGHT[t]);
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total, tier: BoonRarity = avail[0];
    for (let i = 0; i < avail.length; i++) { roll -= weights[i]; if (roll <= 0) { tier = avail[i]; break; } }
    const idx = remaining.findIndex((b) => b.rarity === tier);
    picks.push(remaining.splice(idx, 1)[0]);
  }
  return picks;
}
