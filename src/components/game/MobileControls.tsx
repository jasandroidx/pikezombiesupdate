import { useRef, useState, useEffect, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronsRight, Hammer, Flame, Footprints, FileText, Repeat, Box, CircleDot } from "lucide-react";

interface MobileControlsProps {
  onMoveChange: (vec: { x: number; y: number }) => void;
  onAimChange: (vec: { x: number; y: number }) => void;
  onReload: () => void;
  onThrowMolotov: () => void;
  onThrowFlare?: () => void;
  onPrevWeapon: () => void;
  onNextWeapon: () => void;
  onInteract?: () => void;
  onInteractHold?: (held: boolean) => void;
  onSneakToggle?: (on: boolean) => void;
  onDodge?: () => void;
  onDash?: () => void;
  onBash?: () => void;
  onPlantPost?: () => void;
  onDropPipe?: () => void;
  onDetonateBomb?: () => void;
  bombCharges?: number;
  molotovs?: number;
  flares?: number;
  posts?: number;
  pipes?: number;
}

function useStick(onChange: (vec: { x: number; y: number }) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const live = useRef(false);

  const apply = (e: ReactPointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const max = rect.width * 0.42;
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(dist, max);
    const ux = dx / dist;
    const uy = dy / dist;
    setKnob({ x: ux * clamped, y: uy * clamped });
    const mag = clamped / max;
    if (mag < 0.22) onChange({ x: 0, y: 0 });
    else {
      const s = (mag - 0.22) / 0.78;
      onChange({ x: ux * s, y: uy * s });
    }
  };

  const down = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    live.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    apply(e);
  };
  const move = (e: ReactPointerEvent) => {
    if (!live.current) return;
    e.preventDefault();
    apply(e);
  };
  const up = (e: ReactPointerEvent) => {
    if (!live.current) return;
    live.current = false;
    setKnob({ x: 0, y: 0 });
    onChange({ x: 0, y: 0 });
  };

  return { ref, knob, down, move, up };
}

function Act({
  label,
  onPress,
  onRelease,
  children,
  hot = false,
}: {
  label: string;
  onPress: () => void;
  onRelease?: () => void;
  children: ReactNode;
  hot?: boolean;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }}
      onPointerUp={() => onRelease?.()}
      onPointerCancel={() => onRelease?.()}
      className={`flex h-11 w-11 flex-col items-center justify-center rounded-full border text-[8px] font-mono uppercase tracking-wide ${
        hot ? "border-accent bg-surface-2 text-accent" : "border-border bg-surface/85 text-fg"
      }`}
    >
      {children}
      <span className="mt-0.5 leading-none">{label}</span>
    </button>
  );
}

export function MobileControls({
  onMoveChange,
  onAimChange,
  onReload,
  onThrowMolotov,
  onInteract,
  onInteractHold,
  onSneakToggle,
  onDodge,
  onDash,
  onBash,
  onPlantPost,
  onDropPipe,
  onDetonateBomb,
  bombCharges = 0,
  onNextWeapon,
  molotovs = 0,
  posts = 0,
  pipes = 0,
}: MobileControlsProps) {
  const [show, setShow] = useState(false);
  const [sneaking, setSneaking] = useState(false);
  const move = useStick(onMoveChange);
  const aim = useStick(onAimChange);

  useEffect(() => {
    const touch = navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.matchMedia("(max-width: 800px)").matches;
    setShow(touch || narrow);
  }, []);

  if (!show) return null;

  return (
    <>
      <div className="absolute inset-0 z-[15] touch-none" />
      <div
        className="pointer-events-none absolute inset-0 z-30 touch-none select-none"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
      >
        <div
          ref={move.ref}
          onPointerDown={move.down}
          onPointerMove={move.move}
          onPointerUp={move.up}
          onPointerCancel={move.up}
          className="land-move pointer-events-auto absolute bottom-3 left-3 flex h-32 w-32 items-center justify-center rounded-full border-2 border-white/25 bg-black/35"
        >
          <div
            className="h-12 w-12 rounded-full border border-accent bg-accent/90 shadow"
            style={{ transform: `translate(${move.knob.x}px, ${move.knob.y}px)` }}
          />
          <span className="pointer-events-none absolute bottom-3 font-mono text-[10px] uppercase text-white/80">Move</span>
        </div>

        <div
          ref={aim.ref}
          onPointerDown={aim.down}
          onPointerMove={aim.move}
          onPointerUp={aim.up}
          onPointerCancel={aim.up}
          className="land-aim pointer-events-auto absolute bottom-3 right-3 flex h-32 w-32 items-center justify-center rounded-full border-2 border-primary/70 bg-black/35"
        >
          <div
            className="h-12 w-12 rounded-full border border-primary bg-primary/90 shadow"
            style={{ transform: `translate(${aim.knob.x}px, ${aim.knob.y}px)` }}
          />
          <span className="pointer-events-none absolute bottom-3 font-mono text-[10px] uppercase text-primary">
            {aim.knob.x === 0 && aim.knob.y === 0 ? "Auto" : "Aim"}
          </span>
        </div>

        <div className="land-actions pointer-events-auto absolute bottom-4 left-1/2 grid -translate-x-1/2 grid-cols-2 gap-2">
          {onDodge && (
            <Act label="Roll" hot onPress={onDodge}>
              <ChevronsRight className="h-4 w-4" />
            </Act>
          )}
          {onDash && (
            <Act label="Dash" hot onPress={onDash}>
              <ChevronsRight className="h-4 w-4" />
            </Act>
          )}
          {onBash && (
            <Act label="Bash" onPress={onBash}>
              <Hammer className="h-4 w-4" />
            </Act>
          )}
          {onDetonateBomb && (
            <Act label={`Bomb ${bombCharges}`} hot onPress={onDetonateBomb}>
              <Flame className="h-4 w-4" />
            </Act>
          )}
          <Act label={`Mash ${molotovs}`} hot onPress={onThrowMolotov}>
            <Flame className="h-4 w-4" />
          </Act>
          <Act label={`Post ${posts}`} onPress={() => onPlantPost?.()}>
            <Box className="h-4 w-4" />
          </Act>
          <Act label={`Pipe ${pipes}`} hot onPress={() => onDropPipe?.()}>
            <CircleDot className="h-4 w-4" />
          </Act>
          {onInteract && (
            <Act
              label="Use"
              hot
              onPress={() => {
                onInteractHold?.(true);
                onInteract();
              }}
              onRelease={() => onInteractHold?.(false)}
            >
              <FileText className="h-4 w-4" />
            </Act>
          )}
          {onSneakToggle && (
            <Act
              label={sneaking ? "Quiet" : "Loud"}
              hot={sneaking}
              onPress={() => {
                const next = !sneaking;
                setSneaking(next);
                onSneakToggle(next);
              }}
            >
              <Footprints className="h-4 w-4" />
            </Act>
          )}
          <Act label="Gun" onPress={onNextWeapon}>
            <Repeat className="h-4 w-4" />
          </Act>
        </div>
      </div>
    </>
  );
}
