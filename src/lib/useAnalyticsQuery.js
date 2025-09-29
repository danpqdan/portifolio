export const INFLUX_QUERY_URL = 'http://dsplayground.com.br:8086/query?db=frontend_metrics';

/**
 * Query InfluxDB 1.x for SUM(count) grouped by page in the given range.
 * @param {string} rangeExpr - e.g. '24h' or '7d' (used as now() - rangeExpr)
 * @returns {Promise<Object>} map page=>count
 */
export async function querySums(rangeExpr = '24h') {
  const q = `SELECT SUM(count) FROM frontend_events WHERE time > now() - ${rangeExpr} GROUP BY page`;
  const url = `${INFLUX_QUERY_URL}&q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Influx query failed: ${res.status} ${res.statusText}`);
    const data = await res.json();

    const out = {};
    // data.results[].series[] -> each series has tags.page and values [[time, sum]]
    const results = data.results || [];
    for (const r of results) {
      const series = r.series || [];
      for (const s of series) {
        // values is array of arrays; we expect [[time, sum]] or [[null, sum]]
        const values = s.values || [];
        if (values.length) {
          const last = values[values.length - 1];
          // Influx returns [time, sum] where sum may be null
          const sum = last[1] == null ? 0 : Number(last[1]);
          // page tag is under s.tags.page; fallback to series name
          const pageTag = s.tags && s.tags.page ? s.tags.page : (s.name || 'unknown');
          out[pageTag] = sum;
        }
      }
    }

    return out;
  } catch (err) {
    console.error('Influx query error', err);
    throw err;
  }
}
