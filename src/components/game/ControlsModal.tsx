import { X, Keyboard } from "lucide-react";

interface ControlsModalProps {
  onClose: () => void;
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block min-w-[1.9rem] rounded border border-border bg-bg px-1.5 py-0.5 text-center font-mono text-[11px] text-fg">
      {children}
    </kbd>
  );
}

function Row({ keys, action }: { keys: React.ReactNode; action: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="font-lore text-sm text-muted">{action}</span>
      <span className="flex items-center gap-1">{keys}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">{title}</div>
      <div className="divide-y divide-border/40">{children}</div>
    </div>
  );
}

export function ControlsModal({ onClose }: ControlsModalProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg/80 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded border border-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-accent" />
            <h2 className="font-display text-2xl tracking-widest text-fg">CONTROLS</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border bg-bg p-1.5 text-muted hover:text-fg"
            aria-label="Close controls"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <Section title="Move">
            <Row keys={<><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key><span className="font-mono text-[10px] text-muted">/</span><Key>←↑↓→</Key></>} action="Move" />
            <Row keys={<><Key>Shift</Key></>} action="Sprint (drains stamina)" />
            <Row keys={<><Key>Space</Key></>} action="Dodge roll (brief invulnerability)" />
            <Row keys={<><Key>Ctrl</Key></>} action="Sneak (quieter, slower)" />
          </Section>

          <Section title="Combat">
            <Row keys={<span className="font-mono text-[11px] text-accent">auto</span>} action="Gun fires on its own at nearest target" />
            <Row keys={<><Key>Mouse</Key></>} action="Hold left button to aim & fire manually" />
            <Row keys={<><Key>Right-click</Key><span className="font-mono text-[10px] text-muted">/</span><Key>F</Key></>} action="Bash (knockback)" />
            <Row keys={<><Key>R</Key></>} action="Reload" />
            <Row keys={<><Key>1</Key>–<Key>6</Key></>} action="Swap weapon" />
          </Section>

          <Section title="Gear">
            <Row keys={<><Key>Q</Key></>} action="Throw molotov" />
            <Row keys={<><Key>G</Key></>} action="Throw road flare" />
            <Row keys={<><Key>C</Key></>} action="Plant cedar-post rifle (turret)" />
            <Row keys={<><Key>X</Key></>} action="Lay stovepipe mine" />
          </Section>

          <Section title="Interact">
            <Row keys={<><Key>E</Key></>} action="Board holes · attune shrines · ring bell · read notes · workbench · extract" />
            <Row keys={<><Key>Tab</Key></>} action="Workbench (upgrades & supplies)" />
          </Section>

          <Section title="Menu">
            <Row keys={<><Key>1</Key>–<Key>3</Key></>} action="Pick draft card" />
            <Row keys={<><Key>H</Key></>} action="This window" />
            <Row keys={<><Key>M</Key></>} action="Mute" />
            <Row keys={<><Key>Esc</Key></>} action="Pause" />
          </Section>
        </div>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted">
          Boarding a hole costs 25 scrap · the dead chew through boards — keep them nailed
        </p>
      </div>
    </div>
  );
}
