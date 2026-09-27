import { Crosshair, Sparkles, Zap } from "lucide-react";
import { eventLabelFor, trackerText, type EventTrackerData } from "./eventMeta";

// Batch 12 (Lane 3): React banners for run events. The engine surfaces
// events to React through the existing onRadio callback (engine.ts
// fireEvent -> onRadio("WJPS Petersburg", ev.radio)); routes/index.tsx
// matches the radio body against RUN_EVENTS and feeds the banner here.
// No engine event / no tracker probe -> nothing renders: every path here
// degrades to hidden UI, never an error.

export interface EventBannerData {
  id: string;
  title: string;
  body: string;
  key: number;
}

interface EventStyle {
  titleClass: string;
  borderClass: string;
  glowClass: string;
  Icon: typeof Sparkles;
}

const EVENT_STYLES: Record<string, EventStyle> = {
  powerup_shower: {
    titleClass: "text-amber-300",
    borderClass: "border-amber-400/70",
    glowClass: "drop-shadow-[0_0_22px_rgba(251,191,36,0.5)]",
    Icon: Sparkles,
  },
  elite_hunt: {
    titleClass: "text-red-400",
    borderClass: "border-red-500/70",
    glowClass: "drop-shadow-[0_0_22px_rgba(239,68,68,0.5)]",
    Icon: Crosshair,
  },
};

const GENERIC_STYLE: EventStyle = {
  titleClass: "text-accent",
  borderClass: "border-accent/60",
  glowClass: "drop-shadow-[0_0_18px_rgba(0,0,0,0.6)]",
  Icon: Zap,
};

function eventStyleFor(id: string): EventStyle {
  return EVENT_STYLES[id] ?? GENERIC_STYLE;
}

export function EventBanners({
  banner,
  tracker,
}: {
  banner: EventBannerData | null;
  tracker: EventTrackerData | null;
}) {
  const style = banner ? eventStyleFor(banner.id) : null;
  const BannerIcon = style?.Icon ?? Zap;
  return (
    <>
      {tracker && (
        <div
          data-testid="event-tracker"
          data-event-id={tracker.id}
          className="rounded border border-border bg-black/70 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-fg"
        >
          <Crosshair className="mr-1 inline h-3 w-3 text-primary" />
          {trackerText(tracker)}
        </div>
      )}
      {banner && style && (
        <div
          key={banner.key}
          data-testid="event-banner"
          data-event-id={banner.id}
          className={`animate-pulse rounded border ${style.borderClass} bg-black/80 px-8 py-4 text-center backdrop-blur-[2px] ${style.glowClass}`}
        >
          <div
            className={`flex items-center justify-center gap-2 font-display text-3xl font-bold tracking-[0.2em] ${style.titleClass}`}
          >
            <BannerIcon className="h-6 w-6" />
            {banner.title}
          </div>
          <div className="mx-auto mt-1 max-w-md font-lore text-sm text-fg/80">{banner.body}</div>
        </div>
      )}
    </>
  );
}

