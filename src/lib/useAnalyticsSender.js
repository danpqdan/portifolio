import { useCallback } from 'react';

// Endpoint InfluxDB line-protocol write
export const INFLUX_URL = "http://dsplayground.com.br:8086/write?db=frontend_metrics";

/**
 * Send a batch of line-protocol lines to InfluxDB.
 * @param {string} lines - Newline-separated line protocol
 */
export async function sendBatch(lines) {
    try {
        const response = await fetch(INFLUX_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
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
