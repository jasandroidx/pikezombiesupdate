import { useEffect, useRef } from "react";
import { MinimapController, probeWorldSource } from "@/game/minimap";

/**
 * Batch 10 (Lane 2): corner minimap mount. The canvas is owned by a
 * MinimapController that reads the live engine through the existing
 * window.__controlsTest probe — no engine props needed.
 */
export function Minimap({ size = 136 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctl = new MinimapController(canvas, { size, source: probeWorldSource });
    ctl.start();
    const w = window as unknown as Record<string, unknown>;
    w.__minimapTest = {
      frame: () => ctl.debugInfo(),
      render: () => ctl.render(),
    };
    return () => {
      ctl.stop();
      if (w.__minimapTest) delete w.__minimapTest;
    };
  }, [size]);

  return (
    <canvas
      ref={ref}
      data-testid="minimap-canvas"
      className="pointer-events-none rounded border border-border/70"
      style={{ width: size, height: size }}
      aria-label="Minimap"
    />
  );
}
