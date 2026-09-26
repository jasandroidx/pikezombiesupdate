export type BoonId = "lead" | "trigger" | "hide" | "shells" | "beam" | "jug" | "leavings" | "stride";

export interface BoonOffer {
  id: BoonId;
  name: string;
  blurb: string;
}

export const BOON_CATALOG: BoonOffer[] = [
  { id: "lead", name: "Hand-loaded lead", blurb: "Everything you fire hits 8% harder. Stacks." },
  { id: "trigger", name: "Filed trigger", blurb: "Faster fire and a quicker reload. Stacks." },
  { id: "hide", name: "County hide", blurb: "+16 grit. Heals what it adds." },
  { id: "shells", name: "Box off the bench", blurb: "A pocket of rounds for every gun you own." },
  { id: "beam", name: "Fresh cells", blurb: "The Maglite reaches farther. Stacks." },
  { id: "jug", name: "Another jug", blurb: "One more mason jar of mash." },
  { id: "leavings", name: "Pocket the leavings", blurb: "45 scrap now, and the dead pay better. Stacks." },
  { id: "stride", name: "Longer stride", blurb: "You cover more ground between them. Stacks." },
];

export function rollBoons(stacks: Record<string, number>, molotovs: number, maxMolotovs: number): BoonOffer[] {
  const pool = BOON_CATALOG.filter((b) => {
    if ((stacks[b.id] ?? 0) >= 4) return false;
    if (b.id === "jug" && molotovs >= maxMolotovs) return false;
    return true;
  });
  const bag = pool.length >= 3 ? pool : BOON_CATALOG.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = bag[i];
    bag[i] = bag[j];
    bag[j] = tmp;
  }
  return bag.slice(0, 3);
}
