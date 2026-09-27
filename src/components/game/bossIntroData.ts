// Batch 13 (Lane 2): boss presentation data + matchers (no JSX — this
// module is importable in node via jiti for pure tests; BossIntro.tsx
// renders it). The engine surfaces boss events to React through the
// EXISTING onRadio callback (the same path bossEntrance() uses for the
// Behemoth) — no new callback was invented. routes/index.tsx matches
// radio bodies here and feeds the components; everything degrades to
// hidden UI when the data is absent, never an error.

export interface BossIntroData {
  id: string;
  title: string;
  sub: string;
  call: string;
  body: string;
  key: number;
}

export interface AttackCallout {
  id: number;
  name: string;
}

// Zombie types that count as bosses for the generalized HP bar. The engine
// lane adds old_ben to the BOSSES table / pushZombie; until then the set is
// just a lookup — unknown types render nothing.
export const BOSS_ZOMBIE_TYPES: ReadonlySet<string> = new Set([`behemoth`, `old_ben`]);

const BOSS_TITLES: Record<string, string> = {
  behemoth: `THE BEHEMOTH`,
  old_ben: `OLD BEN WAKES`,
};

const BOSS_SUBS: Record<string, string> = {
  behemoth: `Something old is walking out of the treeline`,
  old_ben: `The bell of Pike County is ringing on its own`,
};

// Short display names for the HP bar. Kept separate from the intro titles
// ("OLD BEN WAKES" is the ceremony banner; the bar reads "OLD BEN").
const BOSS_NAMES: Record<string, string> = {
  behemoth: `THE BEHEMOTH`,
  old_ben: `OLD BEN`,
};

export function bossTitleFor(id: string): string {
  return BOSS_TITLES[id] ?? `${id.replace(/_/g, ` `).toUpperCase()} WAKES`;
}

export function bossSubFor(id: string): string {
  return BOSS_SUBS[id] ?? `Something big is on the Trace`;
}

export function bossNameFor(id: string): string {
  return BOSS_NAMES[id] ?? id.replace(/_/g, ` `).toUpperCase();
}

// Matches a radio callout against known boss-intro patterns. The Behemoth's
// exact intro body is registered; Old Ben matches on name (the engine
// lane's callout text is still landing, so we match defensively and
// case-insensitively rather than hardcoding an unknown string). Returns
// the boss id, or null when the radio is not a boss intro.
//
// NOTE: the live onRadio path only auto-triggers for Old Ben — the
// Behemoth keeps its existing in-canvas ceremony untouched. The component
// itself is generic: the __pzLane2 test hook can force any id through
// fireBossIntro.
export function bossIntroMatch(call: string, body: string): string | null {
  const b = `${body ?? ``}`;
  if (b === `Folks... we got a big one on the Trace. Get to high ground or get to cover.`) return `behemoth`;
  if (/old ben/i.test(b)) return `old_ben`;
  return null;
}

// Old Ben's attack patterns. The engine lane may surface these through
// radio/telegraph text; match case-insensitively so capitalization drift
// doesn't break the callouts.
export const OLD_BEN_ATTACKS = [`TREMOR SLAM`, `BRIAR CALL`, `BULL CHARGE`] as const;

export function attackNameFromRadio(body: string): string | null {
  const b = `${body ?? ``}`.toUpperCase();
  for (const name of OLD_BEN_ATTACKS) {
    if (b.includes(name)) return name;
  }
  return null;
}
