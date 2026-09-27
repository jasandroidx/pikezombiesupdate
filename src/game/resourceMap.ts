// Batch 14 (Lane B): async reference-counted resource map.
//
// A tiny generic loader cache for async assets (images, audio, JSON):
//  - acquire(key, loader) deduplicates concurrent loads: one loader run per
//    key, every acquirer shares the same promise, refcount goes up.
//  - release(key) decrements; at zero the entry is disposed (optional
//    disposer) and removed from the map.
//  - prefetch(keys, loader) is fire-and-forget warm-up: one reference per
//    key is pinned until release(key) is called.
//  - stats() exposes keys / refcounts / per-key load counts for tests and
//    the __pzArt probe.
//  - Loader failures never poison the map: a failed load is evicted so a
//    later acquire retries, and every acquirer of the failed load gets the
//    rejection.
//
// Determinism: no timers, no randomness; Map iteration order (insertion
// order) drives stats(). Safe to use from node-level tests via jiti.

export type ResourceLoader<T> = () => Promise<T> | T;
export type ResourceKeyLoader<T> = (key: string) => Promise<T> | T;
export type ResourceDisposer<T> = (key: string, value: T) => void | Promise<void>;

interface Entry<T> {
  status: "loading" | "ready";
  promise: Promise<T>;
  value: T | undefined;
  refcount: number;
  loads: number; // loader runs during this entry's lifetime
  disposer?: ResourceDisposer<T>;
}

export interface ResourceMapStats {
  keys: string[];
  refcounts: Record<string, number>;
  loads: Record<string, number>;
  totalLoads: number;
  inFlight: number;
}

export class ResourceMap<T> {
  private entries = new Map<string, Entry<T>>();
  private totalLoads = 0;
  private readonly disposer?: ResourceDisposer<T>;

  constructor(disposer?: ResourceDisposer<T>) {
    this.disposer = disposer;
  }

  /** Get the loaded value synchronously, or undefined while loading/missing. */
  get(key: string): T | undefined {
    const e = this.entries.get(key);
    return e && e.status === "ready" ? e.value : undefined;
  }

  /** The in-flight (or resolved) promise for a key; undefined if absent. */
  whenReady(key: string): Promise<T> | undefined {
    return this.entries.get(key)?.promise;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  acquire(key: string, loader: ResourceLoader<T>, disposer?: ResourceDisposer<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing) {
      // Joins the in-flight load or the ready value; same promise either way.
      existing.refcount += 1;
      if (disposer) existing.disposer = disposer;
      return existing.promise;
    }
    // Insert the entry synchronously so concurrent acquires in the same
    // tick dedupe onto this single load.
    const entry: Entry<T> = {
      status: "loading",
      promise: undefined as unknown as Promise<T>,
      value: undefined,
      refcount: 1,
      loads: 1,
    };
    if (disposer) entry.disposer = disposer;
    this.entries.set(key, entry);
    this.totalLoads += 1;
    let raw: Promise<T>;
    try {
      raw = Promise.resolve(loader());
    } catch (err) {
      // Synchronous loader throw: never poison the map.
      if (this.entries.get(key) === entry) this.entries.delete(key);
      entry.promise = Promise.reject(err);
      return entry.promise;
    }
    entry.promise = raw.then(
      (value) => {
        // A release-while-loading keeps the entry until settle so later
        // acquires still dedupe; the refcount check decides disposal.
        entry.status = "ready";
        entry.value = value;
        if (entry.refcount <= 0) {
          this.evict(key, entry);
        }
        return value;
      },
      (err) => {
        // Failed loads don't poison: evict so a later acquire retries.
        // Every acquirer of this load shares the rejection via the promise.
        if (this.entries.get(key) === entry) this.entries.delete(key);
        throw err;
      },
    );
    return entry.promise;
  }

  /**
   * Decrement the refcount. At zero the entry is disposed (optional
   * disposer) and removed. Releasing while a load is in flight keeps the
   * entry until the load settles so concurrent acquires still dedupe.
   * Releasing an unknown key is a no-op returning false.
   */
  release(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (entry.refcount <= 0) return false;
    entry.refcount -= 1;
    if (entry.refcount <= 0 && entry.status === "ready") {
      this.evict(key, entry);
    }
    return true;
  }

  /** Fire-and-forget warm-up: loads each key and pins one reference. */
  prefetch(keys: Iterable<string>, loader: ResourceKeyLoader<T>, disposer?: ResourceDisposer<T>): void {
    for (const key of keys) {
      // Failures are deliberately silent here: prefetch never rejects, and
      // a later acquire() retries the load.
      this.acquire(key, () => loader(key), disposer).then(
        () => undefined,
        () => undefined,
      );
    }
  }

  /** Await the loaded value (or the in-flight load) for several keys. */
  async readyAll(keys: Iterable<string>): Promise<Array<T | undefined>> {
    const out: Array<T | undefined> = [];
    for (const key of keys) {
      const p = this.whenReady(key);
      out.push(p === undefined ? undefined : await p.catch(() => undefined));
    }
    return out;
  }

  stats(): ResourceMapStats {
    const keys: string[] = [];
    const refcounts: Record<string, number> = {};
    const loads: Record<string, number> = {};
    let inFlight = 0;
    for (const [key, e] of this.entries) {
      keys.push(key);
      refcounts[key] = e.refcount;
      loads[key] = e.loads;
      if (e.status === "loading") inFlight += 1;
    }
    return { keys, refcounts, loads, totalLoads: this.totalLoads, inFlight };
  }

  private evict(key: string, entry: Entry<T>): void {
    if (this.entries.get(key) === entry) this.entries.delete(key);
    const dispose = entry.disposer ?? this.disposer;
    if (dispose && entry.value !== undefined) {
      try {
        void dispose(key, entry.value);
      } catch {
        // Disposers must never break release().
      }
    }
  }
}
