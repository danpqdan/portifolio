export const INFLUX_QUERY_URL = 'http://dsplayground.com.br:8086/query?db=frontend_metrics';

/**
 * Query InfluxDB 1.x for SUM(count) grouped by page in the given range.
 * @param {string} rangeExpr - e.g. '24h' or '7d' (used as now() - rangeExpr)
 * @returns {Promise<Object>} map page=>count
 */
export async function querySums(rangeExpr = '24h') {
  // First query events SUM(count)
  const qEvents = `SELECT SUM(count) FROM frontend_events WHERE time > now() - ${rangeExpr} GROUP BY page`;
  const urlEvents = `${INFLUX_QUERY_URL}&q=${encodeURIComponent(qEvents)}`;

  // Second query timers LAST(seconds)
  const qTimers = `SELECT LAST(seconds) FROM lastTimers WHERE time > now() - ${rangeExpr} GROUP BY page`;
  const urlTimers = `${INFLUX_QUERY_URL}&q=${encodeURIComponent(qTimers)}`;

  try {
    const [resEvents, resTimers] = await Promise.all([fetch(urlEvents), fetch(urlTimers)]);
    if (!resEvents.ok) throw new Error(`Influx events query failed: ${resEvents.status} ${resEvents.statusText}`);
    if (!resTimers.ok) throw new Error(`Influx timers query failed: ${resTimers.status} ${resTimers.statusText}`);

    const [dataEvents, dataTimers] = await Promise.all([resEvents.json(), resTimers.json()]);

    const outEvents = {};
    const resultsE = dataEvents.results || [];
    for (const r of resultsE) {
      const series = r.series || [];
      for (const s of series) {
        const values = s.values || [];
        if (values.length) {
          const last = values[values.length - 1];
          const sum = last[1] == null ? 0 : Number(last[1]);
          const pageTag = s.tags && s.tags.page ? s.tags.page : (s.name || 'unknown');
          outEvents[pageTag] = sum;
        }
      }
    }

    const outTimers = {};
    const resultsT = dataTimers.results || [];
    for (const r of resultsT) {
      const series = r.series || [];
      for (const s of series) {
        const values = s.values || [];
        if (values.length) {
          const last = values[values.length - 1];
          const val = last[1] == null ? 0 : Number(last[1]);
          const pageTag = s.tags && s.tags.page ? s.tags.page : (s.name || 'unknown');
          outTimers[pageTag] = val;
        }
      }
    }

    return { events: outEvents, timers: outTimers };
  } catch (err) {
    console.error('Influx query error', err);
    throw err;
  }
}
