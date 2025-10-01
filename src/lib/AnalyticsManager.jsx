import React, { useEffect } from 'react';
import analyticsCache from './analyticsCache';
import { useAnalytics } from './analyticsContext';
import { INFLUX_URL, INFLUX_TOKEN } from './useAnalyticsSender';

// intervalo de envio (flush) em ms
const FLUSH_INTERVAL = 5000;

export default function AnalyticsManager({ children }) {
  let { sendBatch } = useAnalytics();

  useEffect(() => {
  let mounted = true;

  // snapshot inicial para evitar reenvio de valores persistidos
  let initial = analyticsCache.snapshot();
  let lastSentCounters = Object.assign({}, initial.counters || {});
  let lastSentEventsIndex = (initial.events && initial.events.length) || 0;

    let flush = async () => {
      try {
        let snap = analyticsCache.snapshot();
        let { counters, events, lastTimers } = snap;

        let lines = [];

        let nowSec = String(Math.floor(Date.now() / 1000));
        for (let [k, v] of Object.entries(counters)) {
          let last = lastSentCounters[k] || 0;
          let delta = v - last;
          if (delta > 0) {
            lines.push(`frontend_events,page=${k} count=${delta} ${nowSec}`);
            lastSentCounters[k] = v;
          }
        }

        if (events && events.length > lastSentEventsIndex) {
          let newEvents = events.slice(lastSentEventsIndex);
          for (let e of newEvents) {
            let name = e.name;
            let cnt = e.payload && typeof e.payload.count === 'number' ? e.payload.count : 1;
            let tsSec;
            if (e.ts) {
              if (e.ts > 1e12) tsSec = String(Math.floor(e.ts / 1000));
              else tsSec = String(Math.floor(e.ts));
            } else {
              tsSec = nowSec;
            }
            lines.push(`frontend_events,page=${name} count=${cnt} ${tsSec}`);
          }
          lastSentEventsIndex = events.length;
        }

        if (lastTimers) {
          for (let [p, sec] of Object.entries(lastTimers)) {
            // enviar apenas se for numérico
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

    let interval = setInterval(() => {
      if (!mounted) return;
      flush();
    }, FLUSH_INTERVAL);

    // também enviar ao descarregar a página
    let onBeforeUnload = () => {
      try {
        const snap = analyticsCache.snapshot();
        const { counters, events, lastTimers } = snap;
        const lines = [];
        let nowSec = String(Math.floor(Date.now() / 1000));
        // send current counters (best-effort: send full current values as delta by comparing to in-memory lastSentCounters)
        for (const [k, v] of Object.entries(counters)) {
          const last = lastSentCounters[k] || 0;
          const delta = v - last;
          if (delta > 0) lines.push(`frontend_events,page=${k} count=${delta} ${nowSec}`);
        }

        // events: send only new events since lastSentEventsIndex
        if (events && events.length > lastSentEventsIndex) {
          let newEvents = events.slice(lastSentEventsIndex);
          for (let e of newEvents) {
            let name = e.name;
            let cnt = e.payload && typeof e.payload.count === 'number' ? e.payload.count : 1;
            // normalizar ts conforme acima
            let tsSec;
            if (e.ts) {
              if (e.ts > 1e12) tsSec = String(Math.floor(e.ts / 1000));
              else tsSec = String(Math.floor(e.ts));
            } else {
              tsSec = nowSec;
            }
            lines.push(`frontend_events,page=${name} count=${cnt} ${tsSec}`);
          }
        }

        // incluir lastTimers como tentativa final
        if (lastTimers) {
          for (let [p, sec] of Object.entries(lastTimers)) {
            if (typeof sec === 'number') lines.push(`lastTimers,page=${p} seconds=${sec}`);
          }
        }

        if (!lines.length) return;
        const payload = lines.join('\n');
        // Best-effort: use fetch keepalive with Authorization header (use Token for v2 API)
        fetch(INFLUX_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'Authorization': `Token ${INFLUX_TOKEN}`
          },
          body: payload,
          keepalive: true
        }).catch(() => { });
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
