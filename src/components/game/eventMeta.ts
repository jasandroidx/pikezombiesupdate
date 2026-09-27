// Batch 12 (Lane 3): pure, JSX-free event/mutator metadata shared by the
// React banners/chips and the unit tests. No DOM, no audio, no engine.

// --- Mutators -----------------------------------------------------------
// The title screen's daily-run panel and the in-run HUD both render from
// the same mutator source the title screen already uses: the selected
// `mutators` list threaded through onStartGame -> bootEngine ->
// engine.mutators. Unknown ids are dropped; empty / absent -> no labels.
export const MUTATOR_LABELS: Record<string, string> = {
  rich: "Rich ground",
  dry: "Dry county",
  fog: "Bottom fog",
};

export function mutatorLabel(id: unknown): string | null {
  return typeof id === "string" ? (MUTATOR_LABELS[id] ?? null) : null;
}

export function mutatorLabelsFor(mutators: readonly unknown[] | null | undefined): string[] {
  const out: string[] = [];
  if (Array.isArray(mutators)) {
    for (const m of mutators) {
      const l = mutatorLabel(m);
      if (l !== null && !out.includes(l)) out.push(l);
    }
  }
  return out;
}

// --- Run events ----------------------------------------------------------
// Fallback metadata for the two Batch 12 events, used only when the
// engine's RUN_EVENTS does not (yet) define the id. RUN_EVENTS always
// wins when present. Pike County, Indiana flavor only.
export const KNOWN_EVENT_META: Record<string, { title: string; body: string }> = {
  powerup_shower: {
    title: "POWERUP SHOWER",
    body: "The county's coughing up supplies — powerups raining all over the Trace.",
  },
  elite_hunt: {
    title: "ELITE HUNT",
    body: "Big ones on the move. Drop every last one before the horn fades.",
  },
};

const EVENT_LABELS: Record<string, string> = {
  powerup_shower: "Powerup Shower",
  elite_hunt: "Elite Hunt",
};

export function eventLabelFor(id: unknown): string {
  if (typeof id !== "string" || id.length === 0) return "Event";
  return EVENT_LABELS[id] ?? id.replace(/_/g, " ");
}

export interface EventTrackerData {
  id: string;
  total: number;
  remaining: number;
}

/** "Elite Hunt: 3/5 remaining". */
export function trackerText(t: EventTrackerData): string {
  return `${eventLabelFor(t.id)}: ${t.remaining}/${t.total} remaining`;
}
