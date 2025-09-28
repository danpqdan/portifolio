// Simple in-memory analytics cache with localStorage persistence
const STORAGE_KEY = 'analytics_cache_v1';

let cache = {
  counters: {},
  events: [],
  pageTimes: {},
  lastTimers: {}
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      cache = Object.assign(cache, parsed);
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
  cache.events.push({ name, payload, ts: Date.now() });
  schedulePersist();
}

function startPageTimer(page) {
  if (!page) return;
  if (!cache.lastTimers[page]) {
    cache.lastTimers[page] = Date.now();
    schedulePersist();
  }
}

function stopPageTimer(page) {
  if (!page) return;
  const start = cache.lastTimers[page];
  if (!start) return;
  const delta = Date.now() - start;
  cache.pageTimes[page] = (cache.pageTimes[page] || 0) + delta;
  delete cache.lastTimers[page];
  schedulePersist();
}

function snapshot() {
  // return a deep copy
  return JSON.parse(JSON.stringify(cache));
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
  clear
};
