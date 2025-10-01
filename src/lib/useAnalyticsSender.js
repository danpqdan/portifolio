import { useCallback } from 'react';

// Endpoint InfluxDB line-protocol write
// Use a relative path during development so Vite can proxy requests and avoid CORS.
// Use the v2 write endpoint (matches your curl example). Adjust org/bucket as needed.
export const INFLUX_URL = import.meta.env.DEV
    ? "/influx/api/v2/write?org=zen&bucket=frontend_pageTimes&precision=s"
    : "http://dsplayground.com.br:8086/api/v2/write?org=zen&bucket=frontend_pageTimes&precision=s";
const INFLUX_MAX_BATCH_SIZE = 5000; // max bytes per batch
const INFLUX_MAX_LINES = 500; // max lines per batch
// Prefer token coming from Vite env (VITE_INFLUX_TOKEN). Keep fallback for now but
// DON'T commit production tokens. Use .env.local to set VITE_INFLUX_TOKEN during dev.
export const INFLUX_TOKEN = "***REMOVED***";

/**
 * Send a batch of line-protocol lines to InfluxDB.
 * @param {string} lines - Newline-separated line protocol
 */
export async function sendBatch(lines) {
    try {
        const response = await fetch(INFLUX_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                // Influx v2 expects 'Authorization: Token <token>' (your curl used this)
                'Authorization': `Token ${INFLUX_TOKEN}`
            },
            body: lines,
        });
        if (!response.ok) {
            console.error('Erro ao enviar batch para InfluxDB', response.statusText);
            return false;
        }
        return true;
    } catch (error) {
        console.error('Erro ao enviar batch para InfluxDB', error);
        return false;
    }
}

// Helper for best-effort background send (keepalive) — used by AnalyticsManager on beforeunload
export function sendBatchKeepalive(lines) {
    // navigator.sendBeacon can't set headers; prefer fetch keepalive which preserves headers in modern browsers
    try {
        if (typeof fetch === 'function') {
            fetch(INFLUX_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                    'Authorization': `Token ${INFLUX_TOKEN}`
                },
                body: lines,
                keepalive: true,
            }).catch(() => {});
            return true;
        }
    } catch {
        console.warn('sendBatchKeepalive failed');
    }
    // fallback to navigator.sendBeacon without Authorization (may be rejected by server)
    try {
        if (navigator && typeof navigator.sendBeacon === 'function') {
            const url = import.meta.env.DEV ? '/influx/write?db=frontend_metrics' : 'http://dsplayground.com.br:8086/write?db=frontend_metrics';
            return navigator.sendBeacon(url, lines);
        }
    } catch {
        // swallow
    }
    return false;
}
/**
 * Hook para enviar eventos analíticos para a API interna.
 * @returns {Function} Função para enviar um único evento (usa sendBatch internamente).
 */
export default function useAnalyticsSender() {
    const sendEvent = useCallback(async (eventName, count) => {
        const line = `frontend_events,page=${eventName} count=${count}`;
        await sendBatch(line);
    }, []);

    return sendEvent;
}
