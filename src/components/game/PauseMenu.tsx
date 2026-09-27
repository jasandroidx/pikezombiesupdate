import { Play, Wrench, Home, Volume2, VolumeX, Keyboard } from "lucide-react";

interface PauseMenuProps {
  onResume: () => void;
  onWorkbench: () => void;
  onControls: () => void;
  onHome: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export function PauseMenu({ onResume, onWorkbench, onControls, onHome, isMuted, onToggleMute }: PauseMenuProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg/80 p-4">
      <div className="w-full max-w-sm rounded border border-border bg-surface p-5 shadow-2xl">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Pike County · held</div>
        <h2 className="mt-1 font-display text-3xl tracking-widest text-fg">PAUSED</h2>
        <p className="mt-2 font-lore text-sm text-muted">The dead keep. You do not have to.</p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="flex items-center justify-center gap-2 rounded border border-accent bg-surface-2 px-4 py-3 font-heading text-lg uppercase tracking-widest text-accent"
          >
            <Play className="h-5 w-5" />
            Back on the trace
          </button>
          <button
            type="button"
            onClick={onWorkbench}
            className="flex items-center justify-center gap-2 rounded border border-border bg-bg px-4 py-3 font-heading uppercase tracking-widest text-fg"
          >
            <Wrench className="h-5 w-5 text-accent" />
            Workbench
          </button>
          <button
            type="button"
            onClick={onControls}
            className="flex items-center justify-center gap-2 rounded border border-border bg-bg px-4 py-3 font-heading uppercase tracking-widest text-fg"
          >
            <Keyboard className="h-5 w-5 text-accent" />
            Controls
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="flex items-center justify-center gap-2 rounded border border-border bg-bg px-4 py-3 font-heading uppercase tracking-widest text-fg"
          >
            {isMuted ? <VolumeX className="h-5 w-5 text-primary" /> : <Volume2 className="h-5 w-5 text-accent" />}
            {isMuted ? "Sound off" : "Sound on"}
          </button>
          <button
            type="button"
            onClick={onHome}
            className="flex items-center justify-center gap-2 rounded border border-border px-4 py-3 font-heading uppercase tracking-widest text-muted"
          >
            <Home className="h-5 w-5" />
            County map
          </button>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted">Esc resumes · H controls · G throws a road flare</p>
      </div>
    </div>
  );
}
