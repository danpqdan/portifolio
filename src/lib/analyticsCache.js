// Simple in-memory analytics cache with localStorage persistence

const STORAGE_KEY = 'analytics_cache_v1';

let cache = {
  counters: {},
  events: [],
  pageTimes: {},
  lastTimers: {}
};

const runtimeTimerStarts = {};

function normalizeKey(k) {
  if (!k || typeof k !== 'string') return String(k);
  let s = k.split(/[?#]/)[0];
  if (s.startsWith('/')) s = s.slice(1);
  if (!s) return 'home';
  const parts = s.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'home';
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      cache = Object.assign(cache, parsed);
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
        for (const [k, v] of Object.entries(remapped)) {
          cache.lastTimers[k] = Math.max(cache.lastTimers[k] || 0, v);
        }
        const cleaned = {};
        for (const [k, v] of Object.entries(cache.lastTimers)) cleaned[normalizeKey(k)] = Math.max(cleaned[normalizeKey(k)] || 0, v);
        cache.lastTimers = cleaned;
      }

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
  cache.events.push({ name, payload, ts: Math.floor(Date.now() / 1000) });
  schedulePersist();
}

function startPageTimer(page) {
  if (!page) return;
  const nowSec = Math.floor(Date.now() / 1000);
  let finalized = false;
  for (const other of Object.keys(runtimeTimerStarts)) {
    if (other !== page) {
      try {
        const delta = nowSec - runtimeTimerStarts[other];
        cache.pageTimes[other] = (cache.pageTimes[other] || 0) + delta;
        finalized = true;
      } catch (err) { console.debug('finalizing other timer failed', err); }
      delete runtimeTimerStarts[other];
    }
  }
  if (finalized) schedulePersist();
  runtimeTimerStarts[page] = nowSec;
}

function stopPageTimer(page) {
  if (!page) return;
  const nowSec = Math.floor(Date.now() / 1000);

  if (runtimeTimerStarts[page]) {
    const delta = nowSec - runtimeTimerStarts[page];
    cache.pageTimes[page] = (cache.pageTimes[page] || 0) + delta;
    delete runtimeTimerStarts[page];
    cache.lastTimers[page] = cache.pageTimes[page] || 0;
    schedulePersist();
    return;
  }
}

function snapshot() {
  const nowSec = Math.floor(Date.now() / 1000);
  const computedLast = {};
  for (const [p, t] of Object.entries(cache.pageTimes || {})) {
    computedLast[p] = Math.floor(t || 0);
  }
  for (const [p, startSec] of Object.entries(runtimeTimerStarts)) {
    const elapsed = Math.max(0, nowSec - Math.floor(startSec || nowSec));
    computedLast[p] = Math.max(computedLast[p] || 0, 0) + elapsed;
  }

  const copy = JSON.parse(JSON.stringify(cache));
  copy.lastTimers = computedLast;
  return copy;
}

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
