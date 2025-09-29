// Simple in-memory analytics cache with localStorage persistence

const STORAGE_KEY = 'analytics_cache_v1';

let cache = {
  counters: {},
  events: [],
  // pageTimes stored in seconds (integer)
  pageTimes: {},
  // lastTimers stored as elapsed seconds (small integers)
  // represents how many seconds have elapsed since the timer started when persisted
  lastTimers: {}
};

// runtime map to store absolute start times (unix seconds) for timers started in this session
const runtimeTimerStarts = {};

// normalize page/key strings to stable identifiers: strip query/hash, leading slash, use last segment, map empty -> 'home'
function normalizeKey(k) {
  if (!k || typeof k !== 'string') return String(k);
  let s = k.split(/[?#]/)[0];
  if (s.startsWith('/')) s = s.slice(1);
  if (!s) return 'home';
  const parts = s.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'home';
}

// We compute lastTimers dynamically in snapshot() to avoid race conditions and double-counting.

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // shallow merge, then normalize timings to seconds
      cache = Object.assign(cache, parsed);

      // normalize pageTimes: if values look like ms (>= 1e9), convert to seconds
      if (cache.pageTimes) {
        const remapped = {};
        for (const [p, t] of Object.entries(cache.pageTimes)) {
          let key = normalizeKey(p);
          if (typeof t === 'number') {
            let val;
            if (t > 1e10) val = Math.round(t / 1000);
            else if (t > 1e9) val = Math.round(t / 1000);
            else val = Math.round(t);
            remapped[key] = (remapped[key] || 0) + val;
          }
        }
        cache.pageTimes = remapped;
      }

      // normalize lastTimers: remap keys and convert epoch to elapsed seconds when needed
      if (cache.lastTimers) {
        const nowSec = Math.floor(Date.now() / 1000);
        const remapped = {};
        for (const [p, val] of Object.entries(cache.lastTimers)) {
          const key = normalizeKey(p);
          if (typeof val === 'number') {
            if (val > 1e9) {
              const elapsed = nowSec - Math.floor(val);
              remapped[key] = Math.max(0, elapsed);
            } else {
              remapped[key] = Math.max(0, Math.floor(val));
            }
          }
        }
        // merge with existing remapped (if any duplicates), prefer larger elapsed
        for (const [k, v] of Object.entries(remapped)) {
          cache.lastTimers[k] = Math.max(cache.lastTimers[k] || 0, v);
        }
        // remove any old keys that have slashes
        const cleaned = {};
        for (const [k, v] of Object.entries(cache.lastTimers)) cleaned[normalizeKey(k)] = Math.max(cleaned[normalizeKey(k)] || 0, v);
        cache.lastTimers = cleaned;
      }

      // normalize events timestamps to seconds
      if (Array.isArray(cache.events)) {
        for (const ev of cache.events) {
          if (ev && typeof ev.ts === 'number') {
            if (ev.ts > 1e10) ev.ts = Math.floor(ev.ts / 1000);
            else ev.ts = Math.floor(ev.ts);
          }
        }
      }
    }
  } catch {
    // ignore
  }
}

function persistSync() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

let persistTimer = null;
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistSync();
    persistTimer = null;
  }, 400);
}

function increment(key, amount = 1) {
  cache.counters[key] = (cache.counters[key] || 0) + amount;
  schedulePersist();
}

function recordEvent(name, payload = {}) {
  // store event timestamp in seconds
  cache.events.push({ name, payload, ts: Math.floor(Date.now() / 1000) });
  schedulePersist();
}

function startPageTimer(page) {
  if (!page) return;
  const nowSec = Math.floor(Date.now() / 1000);
  // stop any other running runtime timers so only one page timer runs at a time
  let finalized = false;
  for (const other of Object.keys(runtimeTimerStarts)) {
    if (other !== page) {
      try {
        // finalize other timers into pageTimes
        const delta = nowSec - runtimeTimerStarts[other];
        cache.pageTimes[other] = (cache.pageTimes[other] || 0) + delta;
        finalized = true;
      } catch (err) { console.debug('finalizing other timer failed', err); }
      delete runtimeTimerStarts[other];
      // do not write cache.lastTimers here to avoid writing derived/ephemeral values
    }
  }
  // if we finalized any other timers, persist the updated pageTimes
  if (finalized) schedulePersist();
  // record runtime absolute start for requested page (not persisted)
  runtimeTimerStarts[page] = nowSec;
}

function stopPageTimer(page) {
  if (!page) return;
  const nowSec = Math.floor(Date.now() / 1000);

  // Prefer runtime absolute start if present
  if (runtimeTimerStarts[page]) {
    const delta = nowSec - runtimeTimerStarts[page];
    cache.pageTimes[page] = (cache.pageTimes[page] || 0) + delta;
    // remove runtime start
    delete runtimeTimerStarts[page];
    // persist total accumulated time for the page
    // persist pageTimes as the canonical accumulator; store a snapshot in lastTimers for convenience
    cache.lastTimers[page] = cache.pageTimes[page] || 0;
    schedulePersist();
    return;
  }

  // Fallback: if persisted lastTimers holds elapsed seconds, treat that as start elapsed and
  // increment pageTimes by elapsed since persisted start (we don't have absolute start time),
  // so we can't compute a new delta — in that case just do nothing.
  // If we don't have a runtime start, nothing to compute — keep persisted totals as-is
  // (do not clear lastTimers; it represents the last known total)
}

function snapshot() {
  // compute derived lastTimers from pageTimes + runtime elapsed (do not persist this)
  const nowSec = Math.floor(Date.now() / 1000);
  const computedLast = {};
  // start from stored pageTimes
  for (const [p, t] of Object.entries(cache.pageTimes || {})) {
    computedLast[p] = Math.floor(t || 0);
  }
  // add elapsed for currently running timers
  for (const [p, startSec] of Object.entries(runtimeTimerStarts)) {
    const elapsed = Math.max(0, nowSec - Math.floor(startSec || nowSec));
    computedLast[p] = Math.max(computedLast[p] || 0, 0) + elapsed;
  }

  // produce a deep copy of cache but with computed lastTimers
  const copy = JSON.parse(JSON.stringify(cache));
  copy.lastTimers = computedLast;
  return copy;
}

/**
 * Atomically retrieve and clear counters and events for batching.
 * Returns an object { counters, events } where counters is a map and events is an array.
 */
function drain() {
  const out = {
    counters: { ...cache.counters },
    events: cache.events.slice(),
  };
  return out;
}

function clear() {
  cache = { counters: {}, events: [], pageTimes: {}, lastTimers: {} };
  persistSync();
}

// initialize from storage
load();

export default {
  increment,
  recordEvent,
  startPageTimer,
  stopPageTimer,
  snapshot,
  drain,
  clear
};
