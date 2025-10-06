import { useEffect, useRef, useCallback } from 'react';
import { HeatmapUtils } from '../utils/HeatmapUtils.tsx';
import WebSocketService from '../utils/WebSocketService.tsx';
import { DEBUG_ENABLED, IS_DEV } from '../config.js';

// Usando type ao invés de interface para evitar problemas com o ESLint
type UseHeatmapOptions = {
    autoSendInterval?: number | null; // Intervalo em ms para envio automático (null para desativar)
    sendOnUnmount?: boolean; // Enviar dados quando o componente for desmontado
    debug?: boolean; // Exibir logs de debug
    realtimeCollection?: boolean; // Habilitar coleta temporal em tempo real
    realtimeInterval?: number; // Intervalo para coleta em tempo real em ms
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
        autoSendInterval: IS_DEV ? 15000 : 30000, // 15s em dev, 30s em prod
        sendOnUnmount: true,
        debug: DEBUG_ENABLED,
        realtimeCollection: true, // Habilitar coleta em tempo real por padrão
        realtimeInterval: 5000 // 5 segundos para tempo real
    };

    const mergedOptions = { ...defaultOptions, ...options };

    // Conectar ao WebSocket quando o componente for montado
    useEffect(() => {
        const connectWebSocket = async () => {
            try {
                await WebSocketService.connect();
                
                // Configurar coleta em tempo real no WebSocket se habilitada
                if (mergedOptions.realtimeCollection && mergedOptions.realtimeInterval) {
                    WebSocketService.setRealtimeInterval(mergedOptions.realtimeInterval);
                }
                
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
    }, [paginaTipo, mergedOptions.debug, mergedOptions.realtimeCollection, mergedOptions.realtimeInterval]);

    // Inicializar e limpar o rastreamento do Heatmap
    useEffect(() => {
        // Inicializar HeatmapUtils
        const heatmap = new HeatmapUtils(document.body, hoverSelector, paginaTipo);
        heatmapRef.current = heatmap;

        // Configurar coleta temporal em tempo real se habilitada
        if (mergedOptions.realtimeCollection && mergedOptions.realtimeInterval) {
            heatmap.configurarColecaoTempoReal(
                (dados) => {
                    // Enviar dados em tempo real via WebSocket
                    WebSocketService.sendAnalyticsDataImmediate(dados, false);
                    
                    if (mergedOptions.debug) {
                        console.log(`📊 Dados temporais enviados para ${paginaTipo}:`, {
                            timestamp: new Date().toISOString(),
                            tempoPermanciaSegundos: heatmap.getTempoPermanciaSegundos(),
                            totalVisualizacoes: dados.get_total_visualizacoes ? dados.get_total_visualizacoes() : 0
                        });
                    }
                },
                mergedOptions.realtimeInterval
            );
            
            // Iniciar coleta temporal
            heatmap.iniciarColecaoTempoReal();
        }

        // Iniciar rastreamento
        heatmap.iniciar();
        isActiveRef.current = true;

        // Configurar envio automático se habilitado (além da coleta temporal)
        if (mergedOptions.autoSendInterval) {
            autoSendIntervalRef.current = setInterval(() => {
                if (isActiveRef.current && heatmapRef.current) {
                    const dados = heatmapRef.current.getDados();
                    WebSocketService.sendAnalyticsData(dados);
                    
                    if (mergedOptions.debug) {
                        console.log(`📤 Envio automático para ${paginaTipo}`);
                    }
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
                    WebSocketService.sendAnalyticsDataImmediate(dados, true); // Envio prioritário no unmount
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

    // Função para obter tempo de permanência atual
    const getTempoPermancia = useCallback(() => {
        if (heatmapRef.current) {
            return heatmapRef.current.getTempoPermanciaSegundos();
        }
        return 0;
    }, []);

    // Função para configurar intervalo de coleta temporal
    const setRealtimeInterval = useCallback((intervalMs: number) => {
        WebSocketService.setRealtimeInterval(intervalMs);
        
        if (mergedOptions.debug) {
            console.log(`⏱️ Intervalo de coleta temporal alterado para ${intervalMs}ms`);
        }
    }, [mergedOptions.debug]);

    return {
        enviarDados,
        pararEEnviarDados,
        reiniciarRastreamento,
        getWebSocketStatus,
        getTempoPermancia,
        setRealtimeInterval,
        isActive: isActiveRef.current
    };
};