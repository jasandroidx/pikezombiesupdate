/**
 * Procedural Web Audio Sound Engine for Pike County Zombies
 * Synthesizes all weapon gunfire, zombie groans, environmental audio,
 * and atmospheric Appalachian dark ambient music with zero external audio assets.
 */

// Batch 6 [S9]: weapon-kind taxonomy for playShotFor — the chainsaw's
// chain kind must never sound like the crossbow's thrust kind.
export type ShotKind = 'blunt' | 'axe' | 'thrust' | 'heavy-blade' | 'firearm' | 'chain';

// Batch 7: 4-bus SFX routing — effort (player exertion/dash/bash),
// weapon (gunshots, reloads), impact (hits, kills, explosions),
// beast (growls, howls, boss).
export type SfxBusName = 'effort' | 'weapon' | 'impact' | 'beast';

// Batch 9 (Lane 3): pure helpers — frequency tables, pitch formula, surge
// sanitization/smoothing. No AudioContext access: testable in node via jiti
// (see tests/batch9c.mjs).
export interface MotifSpec {
  freqs: number[];
  noteMs: number;
  wave: OscillatorType;
  bus: SfxBusName;
}
// Boss warning motif: three-note descending square alert, 120ms per note.
export const BOSS_MOTIF: MotifSpec = { freqs: [480, 360, 240], noteMs: 120, wave: 'square', bus: 'beast' };
// County Record quest unlock: rising triangle arpeggio A5 D6 G6, 90ms per note.
export const QUEST_ARP_SPEC: MotifSpec = { freqs: [880, 1174.66, 1567.98], noteMs: 90, wave: 'triangle', bus: 'impact' };
// Combo-pitched kill sound: base 300Hz + min(combo,20)*30 Hz. Non-finite or
// negative combos are treated as 0.
export function killPitchHz(combo: number): number {
  const c = Number.isFinite(combo) ? Math.max(0, Math.min(20, Math.floor(combo))) : 0;
  return 300 + c * 30;
}
// Engine-driven surge input is 0..1; sanitize NaN/negative/>1 to the range.
export function sanitizeSurge(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}
// One smooth-step of the internal surge toward target (fraction of the gap
// per call; factor 0 = hold, 1 = snap). Per-frame/kill calls converge
// without zippering.
export function smoothSurge(current: number, target: number, factor = 0.35): number {
  const t = sanitizeSurge(target);
  const c = sanitizeSurge(current);
  return c + (t - c) * Math.max(0, Math.min(1, factor));
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  // Batch 7: 4-bus SFX routing. Every SFX routes through exactly one bus
  // (unity gain, so no level change); the buses feed sfxGain -> masterGain ->
  // compressor -> destination. musicGain stays separate from the 4 buses.
  private buses: Record<SfxBusName, GainNode> | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private isMuted: boolean = false;
  private musicPlaying: boolean = false;
  private musicInterval: number | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private heat = 0;
  private gritAt = 0;
  private gritStep = 0;
  private droneFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;
  private pulseGain: GainNode | null = null;
  private intensity = 0;
  // Batch 4: adaptive music intensity layers (arp shimmer, low bass, drums).
  private arpGain: GainNode | null = null;
  private bassGain: GainNode | null = null;
  private drumGain: GainNode | null = null;
  // Batch 4: long-tail echo bus for the screen-clear bomb.
  private echoIn: GainNode | null = null;
  // Batch 5: unmuted master level — mute() zeroes the master gain,
  // unmute restores exactly this without touching sfx/music gains.
  private masterLevel = 0.8;
  // Batch 5: central 24ms SFX throttle — one shared gate for every one-shot SFX.
  private lastSfxAt = 0;
  private sfxFiredCount = 0;
  private sfxDroppedCount = 0;
  // Batch 5: kill surge + beast growl layer.
  private surge = 0;
  private surgeTimer: number | null = null;
  private beastDamage = 0;
  private beastStreak = 0;
  private growlGain: GainNode | null = null;
  // Batch 5: low-HP heartbeat.
  private hbTimer: number | null = null;
  // Batch 5: combo-pitched kill sound probe.
  private lastKillPitch = 0;
  // Batch 9 (Lane 3): engine-driven kill-surge target (0..1, sanitized) and
  // last motif/arp descriptor for probes.
  private surgeTarget = 0;
  private lastMotifDesc: { name: string; freqs: number[]; wave: OscillatorType; noteMs: number } | null = null;
  // Batch 6: deterministic LCG noise (seed 7777, ~0.4s) + weapon-kind shots
  // + minor-arp step sequencer state.
  private lastShotKind: ShotKind | '' = '';
  private lastShotLayers: string[] = [];
  private seqTimer: number | null = null;
  private seqStep = 0;
  private seqGain: GainNode | null = null;
  private seqDense = false;
  private seqLast: { step: number; kind: string; freq: number }[] = [];
  // Batch 6: i–VI–III–VII in A minor — Pike County porch-dark.
  private static readonly NOISE_SEED = 7777;
  private static readonly NOISE_LEN_S = 0.4;
  private static readonly SEQ_STEP_MS = 180;
  private static readonly SEQ_STEPS_PER_CHORD = 12;
  private static readonly SEQ_CHORDS = ['Am', 'F', 'C', 'G'];
  private static readonly SEQ_ROOTS = [110.0, 87.31, 130.81, 98.0]; // A2 F2 C3 G2
  private static readonly SEQ_ARP = [0, 3, 7, 12, 7, 3]; // semitone offsets: root m3 5 8ve

  // Batch 5: deterministic probe surface for tests (coordinator can also
  // wire engine-level probes if needed; engine.ts is untouched).
  public __test = {
    surge: () => this.surge,
    growlMix: () => this.currentGrowlMix(),
    throttleState: () => ({ fired: this.sfxFiredCount, dropped: this.sfxDroppedCount }),
    heartbeatOn: () => this.hbTimer !== null,
    lastKillPitch: () => this.lastKillPitch,
    gains: () => ({
      master: this.masterGain?.gain.value ?? -1,
      sfx: this.sfxGain?.gain.value ?? -1,
      music: this.musicGain?.gain.value ?? -1,
    }),
    // Batch 6: deterministic noise probes.
    noiseBuffer: () => this.noiseBuffer,
    noiseSeed: () => SoundEngine.NOISE_SEED,
    noiseDuration: () => this.noiseBuffer?.duration ?? -1,
    regenNoise: () => (this.ctx ? this.buildNoiseBuffer() : null),
    sampleRate: () => this.ctx?.sampleRate ?? 0,
    // Batch 6: weapon-kind shot probes.
    shotKind: (soundType: string) => this.kindForWeapon({ soundType }),
    shotKindForName: (name: string) => this.kindForWeapon({ name }),
    lastShot: () => ({ kind: this.lastShotKind, layers: [...this.lastShotLayers] }),
    // Batch 6: step-sequencer probes.
    seqState: () => ({
      running: this.seqTimer !== null,
      step: this.seqStep,
      chord: Math.floor(this.seqStep / SoundEngine.SEQ_STEPS_PER_CHORD) % SoundEngine.SEQ_CHORDS.length,
      stepMs: SoundEngine.SEQ_STEP_MS,
      dense: this.seqDense,
      intensity: this.intensity,
    }),
    seqAdvance: () => this.seqTick(),
    seqNotes: () => [...this.seqLast],
    // Batch 9: motif/surge probes.
    lastMotif: () => this.lastMotif(),
    surgeTarget: () => this.surgeTarget,
    killPitch: (combo: number) => killPitchHz(combo),
    // Batch 7: 4-bus + compressor topology probe.
    audioGraph: () => this.audioGraph(),
  };

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public init() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterLevel;

      // Batch 7: compressor master — masterGain feeds the compressor, the
      // compressor feeds the destination. Threshold -13dB, ratio 7:1,
      // 3ms attack, 140ms release.
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -13;
      this.compressor.ratio.value = 7;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.14;
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.35;
      // Music stays separate from the 4 SFX buses, but still feeds the
      // compressor (via masterGain) — mute zeroes masterGain and silences
      // both paths without touching individual volumes.
      this.musicGain.connect(this.masterGain);

      // Batch 7: 4-bus SFX routing — one bus per category, unity gain.
      this.buses = {
        effort: this.ctx.createGain(),
        weapon: this.ctx.createGain(),
        impact: this.ctx.createGain(),
        beast: this.ctx.createGain(),
      };
      for (const b of Object.values(this.buses)) {
        b.connect(this.sfxGain);
      }

      this.generateNoiseBuffer();
    }

    // Batch 7: expose audio probes on window.__controlsTest
    // (same assignment pattern as engine.ts probe registration).
    const w = window as unknown as { __controlsTest?: Record<string, unknown> };
    if (w.__controlsTest && !w.__controlsTest.audioGraph) {
      w.__controlsTest.audioGraph = () => this.audioGraph();
      // Batch 7: mute/volume probes — verify the clean-mute contract
      // (mute zeroes master only; sfx/music volumes are preserved).
      w.__controlsTest.audioMute = (on: boolean) => this.setMuted(on);
      w.__controlsTest.audioMuted = () => this.getMuted();
      w.__controlsTest.audioGains = () => this.__test.gains();
      // Batch 7: last-shot probe — verify playShotFor routed through the
      // weapon bus with the right kind/layers.
      w.__controlsTest.audioLastShot = () => this.__test.lastShot();
      // Batch 9: motif/surge probes — motif trigger + last-played descriptor,
      // kill sound entry point, engine-driven surge setter.
      w.__controlsTest.audioBossMotif = () => this.bossMotif();
      w.__controlsTest.audioQuestArp = () => this.questArp();
      w.__controlsTest.audioKillSound = (combo: number) => this.killSound(combo);
      w.__controlsTest.audioSetKillSurge = (x: number) => this.setKillSurge(x);
      w.__controlsTest.audioLastMotif = () => this.lastMotif();
      w.__controlsTest.audioSurgeTarget = () => this.surgeTarget;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public resume() {
    this.init();
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  // Batch 7: bus accessor. Buses are always created alongside sfxGain in
  // init(), so every call site guarded by a sfxGain null-check is safe.
  private bus(name: SfxBusName): GainNode {
    return this.buses![name];
  }

  // Batch 7: audio topology probe. Buses are fixed category names;
  // compressor/musicSeparate reflect the built graph.
  public audioGraph() {
    return {
      buses: ['effort', 'weapon', 'impact', 'beast'] as SfxBusName[],
      compressor: this.compressor !== null,
      musicSeparate: true, // musicGain feeds master directly, never an SFX bus
    };
  }

  // Batch 6 [S5][S9]: deterministic noise — one ~0.4s buffer from an LCG
  // seeded 7777, generated once at init. Identical texture every session;
  // every noise-based SFX routes through this buffer (no per-play allocation).
  private generateNoiseBuffer() {
    if (!this.ctx) return;
    this.noiseBuffer = this.buildNoiseBuffer();
  }

  private buildNoiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * SoundEngine.NOISE_LEN_S);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const out = buf.getChannelData(0);
    let state = SoundEngine.NOISE_SEED >>> 0;
    for (let i = 0; i < len; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      out[i] = (state / 4294967296) * 2 - 1;
    }
    return buf;
  }

  // Group 1: one-shot SFX constructors with ±10% pitch variation.
  // Music paths (drone/pulse/banjo) keep calling ctx directly — never use these.
  private sfxOsc(): OscillatorNode {
    const osc = this.ctx!.createOscillator();
    const j = 0.9 + Math.random() * 0.2;
    const param: any = osc.frequency;
    const setV = param.setValueAtTime.bind(param);
    const expR = param.exponentialRampToValueAtTime.bind(param);
    const linR = param.linearRampToValueAtTime.bind(param);
    param.setValueAtTime = (v: number, t: number) => setV(v * j, t);
    param.exponentialRampToValueAtTime = (v: number, t: number) => expR(v * j, t);
    param.linearRampToValueAtTime = (v: number, t: number) => linR(v * j, t);
    return osc;
  }
  private sfxNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.playbackRate.setValueAtTime(0.9 + Math.random() * 0.2, this.ctx!.currentTime);
    return src;
  }
  // VS-3: generic procedural tone. f -> f2 pitch slide, triangle/sine/square/sawtooth,
  // short attack + exp decay envelope, optional start delay, optional lowpass.
  public tone(o: { f?: number; f2?: number; type?: OscillatorType; dur?: number; vol?: number; delay?: number; lp?: number }) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + (o.delay || 0);
    const osc = this.sfxOsc();
    const g = this.ctx.createGain();
    osc.type = o.type || 'sine';
    const f = o.f || 440;
    osc.frequency.setValueAtTime(Math.max(20, f), t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.dur || 0.15));
    const v = o.vol || 0.2;
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + (o.dur || 0.15));
    osc.connect(g);
    let tail: AudioNode = g;
    if (o.lp) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(o.lp, t);
      g.connect(lp);
      tail = lp;
    }
    tail.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + (o.dur || 0.15) + 0.05);
  }
  // Batch 5: central 24ms throttle. One shared timestamp across all one-shot
  // SFX so a dense horde can't white-noise the mix. Player-hurt sounds
  // (kind 'hurt') always pass — they're survival-critical.
  private sfxGate(kind: string): boolean {
    if (kind === 'hurt') {
      this.sfxFiredCount++;
      return true;
    }
    const now = performance.now();
    if (now - this.lastSfxAt < 24) {
      this.sfxDroppedCount++;
      return false;
    }
    this.lastSfxAt = now;
    this.sfxFiredCount++;
    return true;
  }

  // VS-1: layered impact — pitched meat-thump + crack + grit, throttled to 24ms.
  public playImpact() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    if (!this.sfxGate('impact')) return;
    const t = this.ctx.currentTime;
    // Meat thump: pitched-down triangle.
    const osc = this.sfxOsc();
    const og = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    og.gain.setValueAtTime(0.28, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(og);
    og.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 0.12);
    // Crack: short noise burst.
    const noise = this.sfxNoise();
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.setValueAtTime(2400, t);
    nf.Q.value = 1.2;
    ng.gain.setValueAtTime(0.16, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    noise.buffer = this.noiseBuffer;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(this.bus('impact'));
    noise.start(t);
    noise.stop(t + 0.07);
    // Grit: faint high click.
    const click = this.sfxOsc();
    const cg = this.ctx.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(3200, t);
    cg.gain.setValueAtTime(0.05, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    click.connect(cg);
    cg.connect(this.bus('impact'));
    click.start(t);
    click.stop(t + 0.04);
  }

  // VS-1: 42Hz kill sub-boom — a low sine that you feel more than hear.
  public playKillSub() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('killsub')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.sfxOsc();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(42, t);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g);
    g.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Batch 5 [S7]: combo-pitched kill sound — pitch rises with the Harvest
  // Streak combo: base 300Hz + min(combo,20)*30 Hz. Raw oscillator so the
  // combo pitch stays exact (no Group-1 ±10% jitter on this one).
  public playKillPitched(combo: number) {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('kill')) return;
    if (!this.ctx || !this.sfxGain) return;
    const f = killPitchHz(combo); // Batch 9: pure formula (NaN-safe, clamped).
    this.lastKillPitch = f;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // Batch 9: kill-sound entry point — combo comes from the Harvest Streak
  // system (engine passes its streak count). Defaults to 0 so existing
  // call sites keep working unchanged.
  public killSound(combo = 0) {
    this.playKillPitched(combo);
  }

  // VS-1: banish — a rising whistle that runs out of town.
  public playBanish() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('banish')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.sfxOsc();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.22);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(f);
    f.connect(g);
    g.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 0.3);
  }
  // Batch 5: clean mute — zeroes the master gain without overwriting the
  // individual sfx/music volumes, so unmute restores exactly.
  public setMuted(on: boolean) {
    this.isMuted = on;
    if (this.masterGain) {
      // Direct assignment (not setValueAtTime) so the mute state is exact
      // and readable back; individual sfx/music volumes are never touched.
      this.masterGain.gain.value = on ? 0 : this.masterLevel;
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  // Batch 5: music/SFX split — individual bus volumes. Mute never touches these.
  public setSfxVolume(v: number) {
    this.init();
    if (this.sfxGain) this.sfxGain.gain.value = Math.max(0, Math.min(1, v));
  }
  public setMusicVolume(v: number) {
    this.init();
    if (this.musicGain) this.musicGain.gain.value = Math.max(0, Math.min(1, v));
  }
  public getSfxVolume(): number {
    return this.sfxGain ? this.sfxGain.gain.value : 0;
  }
  public getMusicVolume(): number {
    return this.musicGain ? this.musicGain.gain.value : 0;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // --- WEAPON SOUND EFFECTS ---

  public playGunshot(type: 'magnum' | 'shotgun' | 'rifle' | 'carbine' | 'crossbow' | 'chainsaw' | 'molotov') {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('gunshot')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    this.gunLayers(type, this.ctx.currentTime);
  }

  // Batch 6: firearm layer recipes extracted into one dispatch so
  // playShotFor('firearm') shares them with playGunshot — the recipe lives
  // in exactly one place. t = ctx.currentTime captured by the caller.
  private gunLayers(type: 'magnum' | 'shotgun' | 'rifle' | 'carbine' | 'crossbow' | 'chainsaw' | 'molotov', t: number) {
    switch (type) {
      case 'shotgun': this.shotgunLayers(t); break;
      case 'rifle': this.rifleLayers(t); break;
      case 'magnum': this.magnumLayers(t); break;
      case 'carbine': this.carbineLayers(t); break;
      case 'crossbow': this.crossbowLayers(t); break;
      case 'chainsaw': this.chainsawLayers(t); break;
      case 'molotov': this.playBottleShatter(); break;
    }
  }

  private shotgunLayers(t: number) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    // Heavy bass punch + wide noise blast + mechanical rack
    const osc = this.sfxOsc();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.25);
    oscGain.gain.setValueAtTime(1.0, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(oscGain);
    oscGain.connect(this.bus('weapon'));
    osc.start(t);
    osc.stop(t + 0.35);

    // Noise body
    const noise = this.sfxNoise();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.bus('weapon'));
    noise.start(t);
    noise.stop(t + 0.45);

    // Mechanical pump sound after 0.25s
    setTimeout(() => {
      this.playClick(0.3, 800, 'weapon');
      setTimeout(() => this.playClick(0.25, 1200, 'weapon'), 80);
    }, 220);
  }

  private rifleLayers(t: number) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    // High-velocity crack + mountain echo
    const osc = this.sfxOsc();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.2);
    oscGain.gain.setValueAtTime(0.8, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(oscGain);
    oscGain.connect(this.bus('weapon'));
    osc.start(t);
    osc.stop(t + 0.28);

    const noise = this.sfxNoise();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2800, t);
    filter.Q.setValueAtTime(2, t);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.85, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.bus('weapon'));
    noise.start(t);
    noise.stop(t + 0.35);
  }

  private magnumLayers(t: number) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    // Punchy revolver thud
    const osc = this.sfxOsc();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.22);
    oscGain.gain.setValueAtTime(0.9, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(oscGain);
    oscGain.connect(this.bus('weapon'));
    osc.start(t);
    osc.stop(t + 0.28);

    const noise = this.sfxNoise();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, t);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.bus('weapon'));
    noise.start(t);
    noise.stop(t + 0.25);
  }

  private carbineLayers(t: number) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    // Rapid snap
    const osc = this.sfxOsc();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    oscGain.gain.setValueAtTime(0.65, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(oscGain);
    oscGain.connect(this.bus('weapon'));
    osc.start(t);
    osc.stop(t + 0.12);

    const noise = this.sfxNoise();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, t);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.bus('weapon'));
    noise.start(t);
    noise.stop(t + 0.14);
  }

  private crossbowLayers(t: number) {
    if (!this.ctx || !this.sfxGain) return;
    // String twang and whoosh
    const osc = this.sfxOsc();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.18);
    oscGain.gain.setValueAtTime(0.7, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(oscGain);
    oscGain.connect(this.bus('weapon'));
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private chainsawLayers(t: number) {
    if (!this.ctx || !this.sfxGain) return;
    // Throaty motor rip
    const osc = this.sfxOsc();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110 + Math.random() * 20, t);
    osc.frequency.linearRampToValueAtTime(160 + Math.random() * 30, t + 0.15);
    oscGain.gain.setValueAtTime(0.5, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(oscGain);
    oscGain.connect(this.bus('weapon'));
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // Batch 6 [S9]: weapon-kind-aware shots. kindForWeapon resolves a weapon's
  // soundType/name to a ShotKind; playShotFor layers the shot so a chainsaw
  // rips and rattles while a crossbow twangs and whooshes — never the same.
  // Engine integration point: replace engine.ts's
  // `soundEngine.playGunshot(e.soundType)` with
  // `soundEngine.playShotFor(soundEngine.kindForWeapon(e))`.
  public kindForWeapon(w: { soundType?: string; name?: string }): ShotKind {
    const st = (w.soundType || '').toLowerCase();
    if (st === 'chainsaw') return 'chain';
    if (st === 'crossbow' || st === 'molotov') return 'thrust';
    if (st === 'magnum' || st === 'shotgun' || st === 'rifle' || st === 'carbine') return 'firearm';
    const n = (w.name || '').toLowerCase();
    if (/saw|chain/.test(n)) return 'chain';
    if (/bow|bolt|spear|pike|javelin/.test(n)) return 'thrust';
    if (/axe|hatchet/.test(n)) return 'axe';
    if (/sword|blade|machete|katana/.test(n)) return 'heavy-blade';
    if (/bat|club|hammer|mace|wrench|pipe|shovel|crowbar/.test(n)) return 'blunt';
    return 'firearm';
  }

  public playShotFor(kind: ShotKind, opts?: { soundType?: 'magnum' | 'shotgun' | 'rifle' | 'carbine'; power?: number }) {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('shot')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const power = Math.max(0.2, Math.min(2, opts?.power ?? 1));
    this.lastShotKind = kind;
    switch (kind) {
      case 'firearm':
        this.gunLayers(opts?.soundType || 'carbine', t);
        this.lastShotLayers = ['firearm', opts?.soundType || 'carbine'];
        break;
      case 'chain': this.chainLayers(t, power); break;
      case 'thrust': this.thrustLayers(t, power); break;
      case 'blunt': this.bluntLayers(t, power); break;
      case 'axe': this.axeLayers(t, power); break;
      case 'heavy-blade': this.heavyBladeLayers(t, power); break;
    }
  }

  private chainLayers(t: number, power: number) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    this.lastShotLayers = ['chain:rip', 'chain:rattle', 'chain:putter'];
    // Motor rip: throaty sawtooth climb.
    const osc = this.sfxOsc();
    const og = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(105, t);
    osc.frequency.linearRampToValueAtTime(165, t + 0.16);
    og.gain.setValueAtTime(0.42 * power, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(og);
    og.connect(this.bus('weapon'));
    osc.start(t);
    osc.stop(t + 0.24);
    // Chain rattle: three bandpassed noise ticks.
    for (let i = 0; i < 3; i++) {
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2900 + i * 500;
      bp.Q.value = 3;
      const ng = this.ctx.createGain();
      const st = t + i * 0.055;
      ng.gain.setValueAtTime(0.3 * power, st);
      ng.gain.exponentialRampToValueAtTime(0.001, st + 0.05);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(this.bus('weapon'));
      n.start(st);
      n.stop(st + 0.06);
    }
    // Two-stroke putter underneath.
    const p = this.ctx.createOscillator();
    const plp = this.ctx.createBiquadFilter();
    plp.type = 'lowpass';
    plp.frequency.value = 300;
    const pg = this.ctx.createGain();
    p.type = 'square';
    p.frequency.setValueAtTime(58, t);
    pg.gain.setValueAtTime(0.12 * power, t);
    pg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    p.connect(plp);
    plp.connect(pg);
    pg.connect(this.bus('weapon'));
    p.start(t);
    p.stop(t + 0.22);
  }

  private thrustLayers(t: number, power: number) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    this.lastShotLayers = ['thrust:twang', 'thrust:whoosh'];
    this.crossbowLayers(t); // string twang
    // Airy whoosh: bandpass sweep up as the bolt leaves.
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.22 * power, t + 0.06);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(this.bus('weapon'));
    n.start(t);
    n.stop(t + 0.28);
  }

  private bluntLayers(t: number, power: number) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    this.lastShotLayers = ['blunt:thud', 'blunt:knock'];
    // Low wood thud.
    const o = this.sfxOsc();
    const og = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.16);
    og.gain.setValueAtTime(0.6 * power, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(og);
    og.connect(this.bus('weapon'));
    o.start(t);
    o.stop(t + 0.22);
    // Wood knock: lowpassed noise burst.
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 750;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.4 * power, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(lp);
    lp.connect(ng);
    ng.connect(this.bus('weapon'));
    n.start(t);
    n.stop(t + 0.1);
  }

  private axeLayers(t: number, power: number) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    this.lastShotLayers = ['axe:chop', 'axe:thump', 'axe:ping'];
    // Chop: sharp bandpassed noise bite.
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1250;
    bp.Q.value = 1.1;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.5 * power, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(this.bus('weapon'));
    n.start(t);
    n.stop(t + 0.1);
    // Meat thump.
    const o = this.sfxOsc();
    const og = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    og.gain.setValueAtTime(0.4 * power, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(og);
    og.connect(this.bus('weapon'));
    o.start(t);
    o.stop(t + 0.16);
    // Steel ping.
    const p = this.sfxOsc();
    const pg = this.ctx.createGain();
    p.type = 'sine';
    p.frequency.setValueAtTime(2900, t);
    pg.gain.setValueAtTime(0.12 * power, t);
    pg.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    p.connect(pg);
    pg.connect(this.bus('weapon'));
    p.start(t);
    p.stop(t + 0.18);
  }

  private heavyBladeLayers(t: number, power: number) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    this.lastShotLayers = ['heavy-blade:whoosh', 'heavy-blade:ring'];
    // Swing whoosh: highpassed noise swell.
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1100;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.3 * power, t + 0.09);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(this.bus('weapon'));
    n.start(t);
    n.stop(t + 0.26);
    // Deep metallic ring: detuned pair.
    [196, 392.5].forEach((f) => {
      const o = this.sfxOsc();
      const og = this.ctx!.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t + 0.1);
      og.gain.setValueAtTime(0.14 * power, t + 0.1);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(og);
      og.connect(this.bus('weapon'));
      o.start(t + 0.1);
      o.stop(t + 0.72);
    });
  }

  public playBottleShatter() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('shatter')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;

    // High pitch clink
    for (let i = 0; i < 3; i++) {
      const osc = this.sfxOsc();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800 + i * 900 + Math.random() * 400, t + i * 0.03);
      oscGain.gain.setValueAtTime(0.4, t + i * 0.03);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15 + i * 0.03);
      osc.connect(oscGain);
      oscGain.connect(this.bus('weapon'));
      osc.start(t + i * 0.03);
      osc.stop(t + 0.2 + i * 0.03);
    }

    // Fire whoosh
    const noise = this.sfxNoise();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.bus('weapon'));
    noise.start(t);
    noise.stop(t + 0.8);
  }

  public playZombieHit(isHeadshot: boolean = false) {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('hit')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Meat impact crunch
    const osc = this.sfxOsc();
    const oscGain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(isHeadshot ? 280 : 160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + (isHeadshot ? 0.15 : 0.08));
    oscGain.gain.setValueAtTime(isHeadshot ? 0.6 : 0.35, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + (isHeadshot ? 0.18 : 0.1));
    osc.connect(oscGain);
    oscGain.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 0.2);

    if (isHeadshot) {
      // High ding satisfaction
      const bell = this.sfxOsc();
      const bellGain = this.ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(1400, t);
      bellGain.gain.setValueAtTime(0.4, t);
      bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      bell.connect(bellGain);
      bellGain.connect(this.bus('impact'));
      bell.start(t);
      bell.stop(t + 0.25);
    }
  }

  public playZombieGroan(type: 'shambler' | 'sprinter' | 'miner_brute' | 'bloater_spitter' | 'behemoth') {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('groan')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.sfxOsc();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    if (type === 'sprinter') {
      // High pitch feral screech
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(450, t);
      osc.frequency.linearRampToValueAtTime(320, t + 0.35);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, t);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bus('beast'));
      osc.start(t);
      osc.stop(t + 0.4);
    } else if (type === 'bloater_spitter') {
      // Gurgling wet sound
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.linearRampToValueAtTime(240, t + 0.25);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, t);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bus('beast'));
      osc.start(t);
      osc.stop(t + 0.4);
    } else if (type === 'behemoth') {
      // Sub-bass monstrous roar
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(75, t);
      osc.frequency.linearRampToValueAtTime(45, t + 0.8);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(350, t);
      gain.gain.setValueAtTime(0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bus('beast'));
      osc.start(t);
      osc.stop(t + 0.9);
    } else {
      // Standard deep guttural moan
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(type === 'miner_brute' ? 85 : 120, t);
      osc.frequency.linearRampToValueAtTime(type === 'miner_brute' ? 65 : 95, t + 0.45);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(type === 'miner_brute' ? 300 : 450, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bus('beast'));
      osc.start(t);
      osc.stop(t + 0.5);
    }
  }

  public playReload() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('reload')) return;
    this.playClick(0.35, 900);
    setTimeout(() => this.playClick(0.4, 600), 200);
    setTimeout(() => this.playClick(0.45, 1100), 450);
  }

  public playPickup() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('pickup')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.sfxOsc();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(1040, t + 0.12);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 0.15);
  }

  public playPowerup() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('powerup')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Harmonious triumphant chime chord (C - E - G - C)
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.sfxOsc();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.06);
      gain.gain.setValueAtTime(0.25, t + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 0.4);
      osc.connect(gain);
      gain.connect(this.bus('impact'));
      osc.start(t + idx * 0.06);
      osc.stop(t + idx * 0.06 + 0.45);
    });
  }

  public playLoreNote() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('lorenote')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Rustling paper crinkle followed by an eerie harmonic resonance
    const osc = this.sfxOsc();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, t); // E4
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.25); // A4
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain);
    gain.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 0.5);

    // Subtle paper shuffle
    this.playClick(0.35, 1200, 'impact');
    setTimeout(() => this.playClick(0.25, 850, 'impact'), 60);
  }

  public playBarrelExplosion() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('explosion')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;

    // Heavy low punch
    const osc = this.sfxOsc();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.5);
    oscGain.gain.setValueAtTime(0.9, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(oscGain);
    oscGain.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 0.6);

    // Roaring noise explosion blast
    const noise = this.sfxNoise();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.8);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.95, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.bus('impact'));
    noise.start(t);
    noise.stop(t + 0.9);
  }

  public playNuke() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('nuke')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;

    // Ultra deep rumble
    const osc = this.sfxOsc();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(18, t + 1.2);
    oscGain.gain.setValueAtTime(1.0, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    osc.connect(oscGain);
    oscGain.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 1.4);

    // Huge shockwave white noise
    const noise = this.sfxNoise();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2500, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 1.5);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.bus('impact'));
    noise.start(t);
    noise.stop(t + 1.6);

    // Batch 4: long-tail echo — taps of the blast feed the feedback delay bus.
    this.ensureEchoBus();
    if (this.echoIn) {
      const tap1 = this.ctx.createGain();
      tap1.gain.value = 0.5;
      oscGain.connect(tap1);
      tap1.connect(this.echoIn);
      const tap2 = this.ctx.createGain();
      tap2.gain.value = 0.65;
      noiseGain.connect(tap2);
      tap2.connect(this.echoIn);
    }
  }

  // Batch 4: lazily-built feedback delay (0.34s, lowpassed, ~44% feedback)
  // that gives the screen-clear bomb its long canyon tail.
  private ensureEchoBus() {
    if (this.echoIn || !this.ctx || !this.sfxGain) return;
    const delay = this.ctx.createDelay(2.0);
    delay.delayTime.value = 0.34;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 850;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.44;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.55;
    this.echoIn = this.ctx.createGain();
    this.echoIn.gain.value = 1;
    this.echoIn.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.bus('impact'));
  }

  // Batch 4: screen-clear bomb treatment — ground-zero thump + shockwave noise
  // straight into the long-tail echo bus. Biggest button, biggest sound.
  public playBombEcho() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('bombecho')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    this.ensureEchoBus();
    const t = this.ctx.currentTime;

    // Ground-zero thump: pitched-down sine.
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(24, t + 0.7);
    og.gain.setValueAtTime(1.0, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.connect(og);
    og.connect(this.bus('impact'));
    if (this.echoIn) {
      const tap = this.ctx.createGain();
      tap.gain.value = 0.6;
      og.connect(tap);
      tap.connect(this.echoIn);
    }
    osc.start(t);
    osc.stop(t + 0.95);

    // Shockwave noise with a long tail that feeds the echo.
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.setValueAtTime(1600, t);
    nf.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.85, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(this.bus('impact'));
    if (this.echoIn) {
      const tap = this.ctx.createGain();
      tap.gain.value = 0.7;
      ng.connect(tap);
      tap.connect(this.echoIn);
    }
    noise.start(t);
    noise.stop(t + 1.55);
  }

  // Batch 9 (Lane 3): boss warning motif — three-note descending square
  // alert (480→360→240Hz, 120ms each) played as the boss banner lead-in.
  // Routed through the beast bus; raw oscillators so the pitches stay exact.
  // INTENDED ENGINE CALL SITE: engine.ts bossEntrance() — Lane 1 should
  // replace/extend the existing
  //   soundEngine.tone({ f: 480, f2: 360, type: `sawtooth`, dur: .5, vol: .3 });
  // line there with `soundEngine.bossMotif();`.
  public bossMotif() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('bossmotif')) return;
    if (!this.ctx || !this.sfxGain) return;
    this.lastMotifDesc = { name: 'bossMotif', freqs: [...BOSS_MOTIF.freqs], wave: BOSS_MOTIF.wave, noteMs: BOSS_MOTIF.noteMs };
    this.playMotif(BOSS_MOTIF);
  }

  // Batch 9 (Lane 3): achievement arpeggio — rising triangle arpeggio
  // (880→1174.66→1567.98Hz, 90ms each) for County Record quest unlock.
  // This upgrades the old Batch 4 playAchievement() sound (same pitches,
  // single entry point now — no doubling). All existing engine call sites
  // keep working unchanged.
  public questArp() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('achievement')) return;
    if (!this.ctx || !this.sfxGain) return;
    this.lastMotifDesc = { name: 'questArp', freqs: [...QUEST_ARP_SPEC.freqs], wave: QUEST_ARP_SPEC.wave, noteMs: QUEST_ARP_SPEC.noteMs };
    this.playMotif(QUEST_ARP_SPEC);
  }

  // Batch 9: legacy quest-unlock name — now just delegates to questArp().
  public playAchievement() {
    this.questArp();
  }

  // Shared motif player: raw oscillators (not sfxOsc) so intervals stay
  // pitch-true; each note staggered by spec.noteMs with a short tail.
  private playMotif(spec: MotifSpec) {
    const t = this.ctx!.currentTime;
    const step = spec.noteMs / 1000;
    spec.freqs.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      const st = t + i * step;
      osc.type = spec.wave;
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(spec.wave === 'square' ? 0.2 : 0.26, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + step * 2.8);
      osc.connect(g);
      g.connect(this.bus(spec.bus));
      osc.start(st);
      osc.stop(st + step * 3);
    });
  }

  // Last motif/arp descriptor played (null before the first one) —
  // deterministic probe surface for tests (see __test.lastMotif).
  public lastMotif() {
    return this.lastMotifDesc;
  }

  public playPlayerHurt() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('hurt')) return; // hurt always passes the gate
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.sfxOsc();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain);
    gain.connect(this.bus('effort'));
    osc.start(t);
    osc.stop(t + 0.25);
  }

  public playDodge() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('dodge')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.sfxOsc();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.16);
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(this.bus('effort'));
    osc.start(t);
    osc.stop(t + 0.18);
  }

  public playBash() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('bash')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.sfxOsc();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(this.bus('effort'));
    osc.start(t);
    osc.stop(t + 0.14);
  }

  public playWaveHorn() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('horn')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc1 = this.sfxOsc();
    const osc2 = this.sfxOsc();
    const gain = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(110, t);
    osc2.frequency.setValueAtTime(165, t);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.bus('beast'));
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 1.2);
    osc2.stop(t + 1.2);
  }

  // Batch 12 (Lane 3): run-event stingers + Batch 12 weapon fire sounds.
  // Named methods so the engine lane can call them directly (tests call
  // them without an engine). The React event-banner path in
  // routes/index.tsx plays the two event stingers when their banners
  // fire. All follow the standard mute/init/gate guard pattern; nothing
  // here touches engine state.
  public playPowerupShower() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('powershower')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    // Bright rising arp: C6 E6 G6 C7 E7, triangle, 70ms stagger.
    const freqs = [1046.5, 1318.51, 1567.98, 2093.0, 2637.02];
    freqs.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      const st = t + i * 0.07;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.22, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
      osc.connect(g);
      g.connect(this.bus('impact'));
      osc.start(st);
      osc.stop(st + 0.55);
    });
  }

  public playEliteHunt() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('elitehunt')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    // Low war-drum pulse: three membrane thumps, 70Hz -> 38Hz pitch drop,
    // 240ms apart, beast bus.
    for (let i = 0; i < 3; i++) {
      const st = t + i * 0.24;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(70, st);
      osc.frequency.exponentialRampToValueAtTime(38, st + 0.18);
      g.gain.setValueAtTime(0.5, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
      osc.connect(g);
      g.connect(this.bus('beast'));
      osc.start(st);
      osc.stop(st + 0.25);
    }
  }

  public playFlamethrowerWhoosh() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('flamewhoosh')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    // Flamethrower whoosh: looped deterministic noise through a bandpass
    // sweeping 400 -> 2400Hz, swelling then dying over 0.55s, weapon bus.
    const noise = this.sfxNoise();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(1.1, t);
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.45);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    noise.connect(bp);
    bp.connect(g);
    g.connect(this.bus('weapon'));
    noise.start(t);
    noise.stop(t + 0.6);
  }

  public playRailgunCharge() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('railcharge')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    // Railgun charge: saw whine rising 180Hz -> 2200Hz over 0.65s,
    // weapon bus.
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(2200, t + 0.65);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.1);
    g.gain.setValueAtTime(0.16, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(g);
    g.connect(this.bus('weapon'));
    osc.start(t);
    osc.stop(t + 0.75);
  }

  public playRailgunZap() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('railzap')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    // Railgun discharge: piercing square crack + noise snap, impact bus.
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.16);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g);
    g.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 0.22);
    const noise = this.sfxNoise();
    noise.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(3000, t);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    noise.connect(hp);
    hp.connect(ng);
    ng.connect(this.bus('impact'));
    noise.start(t);
    noise.stop(t + 0.15);
  }

  public playBell() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('bell')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    for (const [freq, delay, vol] of [
      [220, 0, 0.7],
      [330, 0.05, 0.45],
      [165, 0.8, 0.4],
      [110, 1.6, 0.25],
    ] as const) {
      const osc = this.sfxOsc();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t + delay);
      gain.gain.setValueAtTime(vol, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 2.2);
      osc.connect(gain);
      gain.connect(this.bus('impact'));
      osc.start(t + delay);
      osc.stop(t + delay + 2.3);
    }
  }

  public playLantern() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('lantern')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.sfxOsc();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(480, t);
    osc.frequency.exponentialRampToValueAtTime(240, t + 0.2);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 0.35);
  }

  public playSnuff() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('snuff')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const noise = this.sfxNoise();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bus('impact'));
    noise.start(t);
    noise.stop(t + 0.4);
  }

  public playBoard() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('board')) return;
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.sfxOsc();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(this.bus('impact'));
    osc.start(t);
    osc.stop(t + 0.18);
  }

  public playBoardBreak() {
    this.playSnuff();
  }

  // Batch 7: playClick routes through a named SFX bus — weapon by default
  // (gun-mechanical clicks); callers with other contexts pass their bus.
  private playClick(volume: number, freq: number, bus: SfxBusName = 'weapon') {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.sfxOsc();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.bus(bus));
    osc.start(t);
    osc.stop(t + 0.05);
  }

  public playGrit() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('grit')) return;
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (now - this.gritAt > 0.16) this.gritStep = 0;
    else this.gritStep = Math.min(12, this.gritStep + 1);
    this.gritAt = now;
    const freq = 640 * Math.pow(1.059, this.gritStep);
    const osc = this.sfxOsc();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.45, now + 0.045);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.bus('impact'));
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playLevel() {
    if (this.isMuted) return;
    this.init();
    if (!this.sfxGate('level')) return;
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const t = now + i * 0.07;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.bus('impact'));
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public setHeat(amount: number) {
    const next = Math.max(0, Math.min(1, amount));
    if (Math.abs(next - this.heat) < 0.04) return;
    this.heat = next;
    // Batch 4: engine-facing state update — heat drives music intensity.
    this.setIntensity(next);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneFilter?.frequency.linearRampToValueAtTime(150 + this.heat * 520, t + 0.45);
    this.droneGain?.gain.linearRampToValueAtTime(0.1 + this.heat * 0.06, t + 0.45);
    this.pulseGain?.gain.linearRampToValueAtTime(this.heat * 0.075, t + 0.45);
    this.musicGain?.gain.linearRampToValueAtTime(0.3 + this.heat * 0.22, t + 0.45);
  }

  // Batch 4: adaptive music intensity (0..1). Layers fade in with the run:
  // subtle arp shimmer + low bass at low intensity, driving drums on top at high.
  public setIntensity(x: number) {
    const next = Math.max(0, Math.min(1, x));
    if (Math.abs(next - this.intensity) < 0.02) return;
    this.intensity = next;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.arpGain?.gain.linearRampToValueAtTime(next * 0.16, t + 0.6);
    this.bassGain?.gain.linearRampToValueAtTime(next * 0.14, t + 0.6);
    // Drums stay quiet until it matters — quadratic fade keeps them driving at high intensity.
    this.drumGain?.gain.linearRampToValueAtTime(next * next * 0.18, t + 0.6);
    // Batch 6: the minor-arp sequencer bus follows the same intensity path —
    // sparse and quiet at low intensity, full and present at high.
    this.seqGain?.gain.linearRampToValueAtTime(0.05 + next * 0.12, t + 0.6);
    this.seqDense = next > 0.5;
  }

  public getIntensity(): number {
    return this.intensity;
  }

  public startAtmosphericMusic() {
    if (this.musicPlaying) return;
    this.init();
    this.musicPlaying = true;

    // Pluck notes (D minor pentatonic: D3, F3, G3, A3, C4, D4)
    const banjoNotes = [146.83, 174.61, 196.00, 220.00, 261.63, 293.66];
    let noteIdx = 0;

    // Start background eerie drone
    this.playDroneNote();
    this.playPulse();
    this.playBassNote(); // Batch 4: low D2 pulse that scales with intensity.
    this.startSequencer(); // Batch 6: minor-arp step sequencer rides along.

    this.musicInterval = window.setInterval(() => {
      if (!this.musicPlaying || this.isMuted || !this.ctx || !this.musicGain) return;
      const chance = 0.22 + this.heat * 0.72;
      if (Math.random() > chance) return;
      const note = banjoNotes[noteIdx % banjoNotes.length];
      noteIdx = (noteIdx + Math.floor(Math.random() * 3) + 1) % banjoNotes.length;
      this.playBanjoPluck(this.heat > 0.45 && Math.random() < this.heat ? note * 2 : note);
      // Batch 4: intensity layers — arp shimmer and drums fade in with the run.
      if (this.intensity > 0.12 && Math.random() < this.intensity * 0.6) {
        const arp = [587.33, 698.46, 880.0, 1046.5]; // D5 F5 A5 C6
        this.playArpPluck(arp[(noteIdx * 2 + ((Math.random() * 4) | 0)) % arp.length]);
      }
      if (Math.random() < this.intensity * this.intensity * 0.8) this.playDrum();
    }, 260);
  }

  private playDroneNote() {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const drone = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    drone.type = 'sawtooth';
    drone.frequency.setValueAtTime(55, t); // A1 low drone

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, t);

    gain.gain.setValueAtTime(0.12, t);

    drone.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    this.droneFilter = filter;
    this.droneGain = gain;

    drone.start(t);
  }

  private playPulse() {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(110, t);
    gain.gain.setValueAtTime(0.0001, t);
    osc.connect(gain);
    gain.connect(this.musicGain);
    this.pulseGain = gain;
    osc.start(t);
  }

  private playBanjoPluck(freq: number) {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;

    // Plucked string with fast decay and metallic harmonic
    const osc = this.ctx.createOscillator();
    const harmonic = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    harmonic.type = 'sawtooth';
    harmonic.frequency.setValueAtTime(freq * 2, t);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);

    osc.connect(gain);
    harmonic.connect(gain);
    gain.connect(this.musicGain);

    osc.start(t);
    harmonic.start(t);
    osc.stop(t + 0.7);
    harmonic.stop(t + 0.7);
  }

  // Batch 4: adaptive music intensity layers. Buses initialize at the
  // current intensity so late starts don't sit silent until the next setIntensity.
  private ensureArpBus(): GainNode {
    if (!this.arpGain) {
      this.arpGain = this.ctx!.createGain();
      this.arpGain.gain.value = this.intensity * 0.16;
      this.arpGain.connect(this.musicGain!);
    }
    return this.arpGain;
  }

  private ensureDrumBus(): GainNode {
    if (!this.drumGain) {
      this.drumGain = this.ctx!.createGain();
      this.drumGain.gain.value = this.intensity * this.intensity * 0.18;
      this.drumGain.connect(this.musicGain!);
    }
    return this.drumGain;
  }

  private playBassNote() {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(73.42, t); // D2 — Pike County low end
    gain.gain.value = this.intensity * 0.14;
    osc.connect(gain);
    gain.connect(this.musicGain);
    this.bassGain = gain;
    osc.start(t);
  }

  private playArpPluck(freq: number) {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g);
    g.connect(this.ensureArpBus());
    osc.start(t);
    osc.stop(t + 0.35);
  }

  private playDrum() {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const bus = this.ensureDrumBus();
    // Kick: sine drop 90 -> 32 Hz.
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.12);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(og);
    og.connect(bus);
    osc.start(t);
    osc.stop(t + 0.18);
    // Shaker tick on some hits.
    if (Math.random() < 0.6) {
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.12, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      n.connect(hp);
      hp.connect(ng);
      ng.connect(bus);
      n.start(t);
      n.stop(t + 0.06);
    }
  }

  // Batch 5 [S7]: low-HP heartbeat — quiet 50Hz double-thump on a timer
  // while player HP is critical (<30%). Non-blocking (timer-driven), quiet,
  // and stoppable. While muted the beat stays scheduled but stays silent.
  public setHeartbeat(on: boolean) {
    if (on && this.hbTimer === null) {
      this.init();
      this.hbTimer = window.setInterval(() => {
        if (this.isMuted) return;
        this.hbThump();
        window.setTimeout(() => {
          if (!this.isMuted) this.hbThump();
        }, 170);
      }, 850);
    } else if (!on && this.hbTimer !== null) {
      window.clearInterval(this.hbTimer);
      this.hbTimer = null;
    }
  }

  // Engine integration point: call once per frame with player HP fraction.
  public updateHeartbeat(hpFrac: number) {
    this.setHeartbeat(hpFrac < 0.3);
  }

  private hbThump() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); // raw — exact 50Hz thump
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(50, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(g);
    g.connect(this.bus('effort'));
    osc.start(t);
    osc.stop(t + 0.13);
  }

  // Batch 5 [S9]: kill surge — rises +0.18 per kill, decays over time.
  // Engine integration point: call bumpSurge() on every kill.
  public bumpSurge() {
    this.surge = Math.min(1, this.surge + 0.18);
    this.ensureSurgeLoop();
    this.updateGrowlGain();
  }

  public getSurge(): number {
    return this.surge;
  }

  // Batch 9 (Lane 3): engine-driven kill surge — x in 0..1 scales the
  // beast/growl layer intensity (0 = silent, 1 = full). Idempotent: the
  // internal surge smooth-steps toward the sanitized target each call, so
  // per-frame/per-kill calls converge without zippering. The existing surge
  // loop + updateGrowlGain() apply it to the growl gain (which is itself
  // smoothed via setTargetAtTime, and which decays toward 0 when the engine
  // stops driving it). No-ops safely when muted or when audio is
  // uninitialized. Negative, >1, and NaN inputs are clamped to 0..1.
  public setKillSurge(x: number) {
    if (this.isMuted) return;
    this.surgeTarget = sanitizeSurge(x);
    this.surge = smoothSurge(this.surge, this.surgeTarget);
    if (this.ctx) {
      this.ensureSurgeLoop();
      this.updateGrowlGain();
    }
  }

  // Engine integration point: feed recent damage + streak so the growl
  // layer scales with surge + damage + streaks.
  public setBeastMix(damage: number, streak: number) {
    this.beastDamage = Math.max(0, Math.min(1, damage));
    this.beastStreak = Math.max(0, streak);
    this.ensureSurgeLoop();
    this.updateGrowlGain();
  }

  private ensureSurgeLoop() {
    this.init();
    if (this.surgeTimer !== null) return;
    this.surgeTimer = window.setInterval(() => {
      if (this.surge > 0) {
        this.surge = Math.max(0, this.surge - 0.15 / 10); // 0.15/sec decay
        this.updateGrowlGain();
      }
    }, 100);
  }

  private currentGrowlMix(): number {
    return Math.min(
      1,
      this.surge * 0.7 + this.beastDamage * 0.2 + (Math.min(this.beastStreak, 10) / 10) * 0.1
    );
  }

  // Batch 5 [S9]: beast/growl layer — detuned low saws through a lowpass
  // with a slow amplitude wobble, dog/lion-ish. Gain scales with the mix.
  private ensureGrowl() {
    if (this.growlGain || !this.ctx || !this.sfxGain) return;
    const o1 = this.ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 47;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = 53;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 210;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4.5;
    const lfoDepth = this.ctx.createGain();
    lfoDepth.gain.value = 0.02;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(this.bus('beast'));
    lfo.connect(lfoDepth);
    lfoDepth.connect(g.gain);
    o1.start();
    o2.start();
    lfo.start();
    this.growlGain = g;
  }

  private updateGrowlGain() {
    if (!this.ctx) return;
    this.ensureGrowl();
    if (!this.growlGain) return;
    this.growlGain.gain.setTargetAtTime(this.currentGrowlMix() * 0.09, this.ctx.currentTime, 0.15);
  }

  public stopAtmosphericMusic() {
    this.musicPlaying = false;
    this.stopSequencer(); // Batch 6: sequencer stops with the music.
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  // Batch 6 [S5]: procedural minor-arp step sequencer. i–VI–III–VII
  // (Am F C G), 6-note arpeggio (root m3 5 8ve 5 m3), bass pedal on the root
  // every 4 steps, ~180ms steps, zero audio files. Intensity drives density:
  // low intensity plays a sparse even-step arp at low gain (kept musical,
  // never annoying); high intensity plays every step plus octave shimmer.
  public startSequencer() {
    if (this.seqTimer !== null) return;
    this.init();
    if (!this.ctx || !this.musicGain) return;
    this.ensureSeqBus();
    this.seqTimer = window.setInterval(() => this.seqTick(), SoundEngine.SEQ_STEP_MS);
  }

  public stopSequencer() {
    if (this.seqTimer !== null) {
      window.clearInterval(this.seqTimer);
      this.seqTimer = null;
    }
  }

  private ensureSeqBus(): GainNode {
    if (!this.seqGain) {
      this.seqGain = this.ctx!.createGain();
      // Initialize at the current intensity so late starts are never silent.
      this.seqGain.gain.value = 0.05 + this.intensity * 0.12;
      this.seqGain.connect(this.musicGain!);
    }
    return this.seqGain;
  }

  private seqTick() {
    if (this.isMuted || !this.ctx || !this.seqGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const step = this.seqStep;
    const chordIdx = Math.floor(step / SoundEngine.SEQ_STEPS_PER_CHORD) % SoundEngine.SEQ_CHORDS.length;
    const root = SoundEngine.SEQ_ROOTS[chordIdx];
    const arpPos = step % 6;
    // Sparse at low intensity (even steps only), full + octave shimmer at high.
    if (this.seqDense || arpPos % 2 === 0) {
      const f = root * Math.pow(2, SoundEngine.SEQ_ARP[arpPos] / 12);
      this.seqPluck(f, t, 0.16);
      this.seqNote(step, 'arp', f);
      if (this.intensity > 0.65) {
        this.seqPluck(f * 2, t, 0.07);
        this.seqNote(step, 'arp8', f * 2);
      }
    }
    if (step % 4 === 0) {
      // Bass pedal: the chord root an octave down, every 4 steps.
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(root / 2, t);
      const v = 0.14 + this.intensity * 0.1;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g);
      g.connect(this.seqGain);
      o.start(t);
      o.stop(t + 0.34);
      this.seqNote(step, 'bass', root / 2);
    }
    this.seqStep++;
  }

  private seqPluck(f: number, t: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g);
    g.connect(this.seqGain!);
    o.start(t);
    o.stop(t + 0.3);
  }

  private seqNote(step: number, kind: string, freq: number) {
    this.seqLast.push({ step, kind, freq });
    if (this.seqLast.length > 32) this.seqLast.shift();
  }
}

export const soundEngine = new SoundEngine();
