import { useEffect, useRef, useCallback } from 'react';
import { HeatmapUtils } from '../utils/HeatmapUtils.tsx';
import WebSocketService from '../utils/WebSocketService.tsx';
import { DEBUG_ENABLED, IS_DEV } from '../config.js';

// Usando type ao invés de interface para evitar problemas com o ESLint
type UseHeatmapOptions = {
    autoSendInterval?: number | null; // Intervalo em ms para envio automático (null para desativar)
    sendOnUnmount?: boolean; // Enviar dados quando o componente for desmontado
    debug?: boolean; // Exibir logs de debug
};

export const useHeatmap = (
    paginaTipo: 'home' | 'about' | 'projects',
    hoverSelector: string | null = null,
    options: UseHeatmapOptions = {}
) => {
    const heatmapRef = useRef<HeatmapUtils | null>(null);
    const isActiveRef = useRef<boolean>(false);
    const autoSendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const defaultOptions: UseHeatmapOptions = {
        autoSendInterval: IS_DEV ? 30000 : 60000, // 30s em dev, 1min em prod
        sendOnUnmount: true,
        debug: DEBUG_ENABLED
    };

    const mergedOptions = { ...defaultOptions, ...options };

    // Conectar ao WebSocket quando o componente for montado
    useEffect(() => {
        const connectWebSocket = async () => {
            try {
                await WebSocketService.connect();
                if (mergedOptions.debug) {
                    console.log('🔌 WebSocket conectado para página', paginaTipo);
                }
            } catch (error) {
                if (mergedOptions.debug) {
                    console.error('❌ Erro ao conectar WebSocket:', error);
                }
            }
        };

        connectWebSocket();

        return () => {
            // Não desconectamos aqui para manter a conexão entre páginas
        };
    }, [paginaTipo, mergedOptions.debug]);

    // Inicializar e limpar o rastreamento do Heatmap
    useEffect(() => {
        // Inicializar HeatmapUtils
        const heatmap = new HeatmapUtils(document.body, hoverSelector, paginaTipo);
        heatmapRef.current = heatmap;

        // Iniciar rastreamento
        heatmap.iniciar();
        isActiveRef.current = true;

        // Configurar envio automático se habilitado
        if (mergedOptions.autoSendInterval) {
            autoSendIntervalRef.current = setInterval(() => {
                if (isActiveRef.current && heatmapRef.current) {
                    const dados = heatmapRef.current.getDados();
                    WebSocketService.sendAnalyticsData(dados);
                }
            }, mergedOptions.autoSendInterval);
        }

        // Função de limpeza quando componente desmontar
        return () => {
            // Limpar intervalo de envio automático
            if (autoSendIntervalRef.current) {
                clearInterval(autoSendIntervalRef.current);
                autoSendIntervalRef.current = null;
            }

            if (isActiveRef.current && heatmapRef.current) {
                // Parar o rastreamento
                heatmapRef.current.parar();

                // Enviar dados automaticamente quando a página for fechada
                if (mergedOptions.sendOnUnmount) {
                    const dados = heatmapRef.current.getDados();
                    WebSocketService.sendAnalyticsData(dados);
                }

                isActiveRef.current = false;
            }
        };
    }, [paginaTipo, hoverSelector, mergedOptions]);

    // Função para enviar dados manualmente (para teste/debug ou ações do usuário)
    const enviarDados = useCallback(async () => {
        if (heatmapRef.current) {
            const dados = heatmapRef.current.getDados();
            const resultado = await WebSocketService.sendAnalyticsData(dados);
            return resultado;
        }
        return false;
    }, [paginaTipo, mergedOptions.debug]);

    // Função para forçar pausa e envio de dados
    const pararEEnviarDados = useCallback(() => {
        if (isActiveRef.current && heatmapRef.current) {
            heatmapRef.current.parar();
            const dados = heatmapRef.current.getDados();
            WebSocketService.sendAnalyticsData(dados);
            isActiveRef.current = false;
            return true;
        }
        return false;
    }, [paginaTipo, mergedOptions.debug]);

    // Função para reiniciar o rastreamento
    const reiniciarRastreamento = useCallback(() => {
        if (!isActiveRef.current && heatmapRef.current) {
            heatmapRef.current.iniciar();
            isActiveRef.current = true;
            return true;
        }
        return false;
    }, [paginaTipo, mergedOptions.debug]);

    // Função para verificar o status do WebSocket
    const getWebSocketStatus = useCallback(() => {
        return WebSocketService.getConnectionStatus();
    }, []);

    return {
        enviarDados,
        pararEEnviarDados,
        reiniciarRastreamento,
        getWebSocketStatus,
        isActive: isActiveRef.current
    };
};