// Batch 16 (Lane 1): fixed-timestep simulation accumulator.
//
// The live render loop feeds variable frame dt here; this module decides how
// many whole FIXED_DT simulation steps to run and carries the leftover.
// Pure module — no imports, safe to unit-test via jiti.

export const FIXED_DT = 1 / 60;
export const MAX_STEPS = 6; // spiral-of-death guard: 6 steps cover the 0.1s frame cap

export function accumulateSteps(acc: number, frameDt: number): { steps: number; acc: number } {
	acc += frameDt;
	// Spiral-of-death guard: if the frame dt is huge (tab hitch, debug pause),
	// drop the excess instead of queueing more than MAX_STEPS steps.
	const cap = MAX_STEPS * FIXED_DT;
	if (acc > cap) acc = cap;
	// Tiny epsilon so exact multiples of FIXED_DT survive binary float error
	// (e.g. 1/30 / (1/60) can land at 1.9999999999999998).
	const steps = Math.min(Math.floor(acc / FIXED_DT + 1e-9), MAX_STEPS);
	acc -= steps * FIXED_DT;
	return { steps, acc };
}
