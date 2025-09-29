import React, { useEffect } from 'react';
import analyticsCache from './analyticsCache';
import { useAnalytics } from './analyticsContext';
import { INFLUX_URL } from './useAnalyticsSender';

// flush interval in ms
const FLUSH_INTERVAL = 5000;

export default function AnalyticsManager({ children }) {
  const { sendBatch } = useAnalytics();

  useEffect(() => {
    let mounted = true;

  // keep last sent state in memory so we send only deltas and don't clear cache
  // Initialize from current snapshot so persisted values are not resent on first flush
  const initial = analyticsCache.snapshot();
  const lastSentCounters = Object.assign({}, initial.counters || {});
  // events: assume we've already 'sent' existing events up to current length
  let lastSentEventsIndex = (initial.events && initial.events.length) || 0;

    const flush = async () => {
      try {
        const snap = analyticsCache.snapshot();
  const { counters, events, lastTimers } = snap;

        const lines = [];

        // counters: send deltas (current - lastSent)
        for (const [k, v] of Object.entries(counters)) {
          const last = lastSentCounters[k] || 0;
          const delta = v - last;
          if (delta > 0) {
            lines.push(`frontend_events,page=${k} count=${delta}`);
            lastSentCounters[k] = v;
          }
        }

        // events: send only new events since lastSentEventsIndex
        if (events && events.length > lastSentEventsIndex) {
          const newEvents = events.slice(lastSentEventsIndex);
          for (const e of newEvents) {
            const name = e.name;
            const cnt = e.payload && typeof e.payload.count === 'number' ? e.payload.count : 1;
            lines.push(`frontend_events,page=${name} count=${cnt}`);
          }
          lastSentEventsIndex = events.length;
        }

        // include lastTimers (current elapsed seconds per page)
        if (lastTimers) {
          for (const [p, sec] of Object.entries(lastTimers)) {
            // only send if numeric
            if (typeof sec === 'number') lines.push(`lastTimers,page=${p} seconds=${sec}`);
          }
        }

        if (lines.length) {
          await sendBatch(lines.join('\n'));
        }
      } catch (err) {
        console.error('Erro ao enviar batch analytics', err);
      }
    };

    const interval = setInterval(() => {
      if (!mounted) return;
      flush();
    }, FLUSH_INTERVAL);

    // also flush on unload
    const onBeforeUnload = () => {
      try {
        const snap = analyticsCache.snapshot();
  const { counters, events, lastTimers } = snap;
        const lines = [];

        // send current counters (best-effort: send full current values as delta by comparing to in-memory lastSentCounters)
        for (const [k, v] of Object.entries(counters)) {
          const last = lastSentCounters[k] || 0;
          const delta = v - last;
          if (delta > 0) lines.push(`frontend_events,page=${k} count=${delta}`);
        }

        // events: send only new events since lastSentEventsIndex
        if (events && events.length > lastSentEventsIndex) {
          const newEvents = events.slice(lastSentEventsIndex);
          for (const e of newEvents) {
            const name = e.name;
            const cnt = e.payload && typeof e.payload.count === 'number' ? e.payload.count : 1;
            lines.push(`frontend_events,page=${name} count=${cnt}`);
          }
        }

        // include lastTimers as best-effort
        if (lastTimers) {
          for (const [p, sec] of Object.entries(lastTimers)) {
            if (typeof sec === 'number') lines.push(`lastTimers,page=${p} seconds=${sec}`);
          }
        }

        if (!lines.length) return;
        const payload = lines.join('\n');
        if (navigator.sendBeacon) {
          try {
            navigator.sendBeacon(INFLUX_URL, payload);
          } catch (e) {
            console.warn('navigator.sendBeacon failed, falling back to fetch keepalive', e);
            fetch(INFLUX_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: payload, keepalive: true }).catch(() => {});
          }
        } else {
          fetch(INFLUX_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: payload, keepalive: true }).catch(() => {});
        }
      } catch (err) {
        console.warn('beforeunload send failed', err);
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [sendBatch]);

  return <>{children}</>;
}
