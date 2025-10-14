import { io, Socket } from 'socket.io-client';
import { HeatmapDados } from './HeatmapUtils.tsx';
import { WEBSOCKET_URL, DEBUG_ENABLED, IS_DEV, NODE_ENV } from '../config.js';

class WebSocketService {
    private socket: Socket | null;
    private isConnected: boolean;
    private serverUrl: string;
    private connectionAttempts: number;
    private reconnectTimer: ReturnType<typeof setTimeout> | null;
    private pendingData: HeatmapDados[] = []; // Armazena dados pendentes de envio
    private dataSendInterval: ReturnType<typeof setInterval> | null = null; // Interval para envio periódico

    // Novos controles para envio temporal
    private realtimeInterval: ReturnType<typeof setInterval> | null = null;
    private realtimeCallback: ((dados: HeatmapDados) => void) | null = null;
    private realtimeIntervalMs: number = 5000; // 5 segundos por padrão

    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.serverUrl = WEBSOCKET_URL;
        this.connectionAttempts = 0;
        this.reconnectTimer = null;
        this.pendingData = [];

        // Iniciar envio periódico de dados (a cada 5 segundos para tempo real)
        this._initPeriodicDataSend();

        // Configurar evento para enviar dados pendentes antes de fechar a página
        window.addEventListener('beforeunload', this._handleBeforeUnload);
    }

    private _initPeriodicDataSend(): void {
        // Limpar qualquer intervalo existente
        if (this.dataSendInterval) {
            clearInterval(this.dataSendInterval);
        }

        // Configurar intervalo para enviar dados pendentes (mais frequente para tempo real)
        this.dataSendInterval = setInterval(() => {
            this._sendPendingData();
        }, this.realtimeIntervalMs); // Usar intervalo configurável
    }

    private _handleBeforeUnload = (): void => {
        // Enviar dados pendentes antes de fechar a página
        this._sendPendingData(true);
    }

    // Conectar ao servidor WebSocket
    connect(): Promise<boolean> {
        return new Promise((resolve) => {
            if (this.socket && this.isConnected) {
                resolve(true);
                return;
            }

            // Limpar qualquer timer existente
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }


            // Limitar tentativas de reconexão
            if (this.connectionAttempts > 5) {
                resolve(false);
                return;
            }

            this.connectionAttempts++;

            try {
                this.socket = io(this.serverUrl, {
                    transports: ['websocket', 'polling'],
                    timeout: 20000,
                    forceNew: false, // Alterado para false para evitar criar múltiplas conexões
                    reconnection: true,
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000
                });

                const connectTimeout = setTimeout(() => {
                    if (!this.isConnected) {
                        resolve(false);
                    }
                }, 10000); // Aumento para 10 segundos

                // Eventos de conexão
                this.socket.on('connect', () => {
                    console.log('✅ Conectado ao servidor WebSocket:', this.socket?.id);
                    this.isConnected = true;
                    this.connectionAttempts = 0; // Resetar contador de tentativas
                    clearTimeout(connectTimeout);

                    // Enviar dados pendentes imediatamente após conexão
                    this._sendPendingData();

                    resolve(true);
                });

                this.socket.on('disconnect', (reason: string) => {
                    console.log('🔌 Desconectado do servidor WebSocket. Motivo:', reason);
                    this.isConnected = false;

                    // Tentar reconectar se não foi desconexão manual
                    if (reason !== 'io client disconnect') {
                        this.reconnectTimer = setTimeout(() => {
                            console.log('⏳ Tentando reconectar...');
                            this.connect();
                        }, 2000);
                    }
                });

                this.socket.on('connect_error', (error: Error) => {
                    console.error('❌ Erro de conexão ao WebSocket:', error);
                    clearTimeout(connectTimeout);

                    const backoffDelay = Math.min(2000 * Math.pow(2, this.connectionAttempts), 10000);
                    console.log(`⏳ Tentativa de reconexão em ${backoffDelay}ms`);

                    this.reconnectTimer = setTimeout(() => {
                        this.connect();
                    }, backoffDelay);
                });

                // Resposta do servidor quando recebe dados de analytics
                this.socket.on('analytics_received', (data: any) => {
                    console.log('📤 Server confirmou recebimento dos dados:', data);
                });

                this.socket.on('analytics_error', (data: any) => {
                    console.error('⚠️ Server retornou erro ao enviar dados:', data);
                });

                this.socket.on('connection_response', (data: any) => {
                    console.log('ℹ️ Resposta de conexão do servidor:', data);
                });
            } catch (error) {
                resolve(false);
            }
        });
    }
    // Enviar dados de analytics via WebSocket
    async sendAnalyticsData(heatmapDados: HeatmapDados): Promise<boolean> {
        // Adicionar à lista de dados pendentes
        this.pendingData.push({ ...heatmapDados });

        // Tentar enviar imediatamente
        return this._sendPendingData();
    }

    // Enviar dados pendentes
    private async _sendPendingData(forceSynchronous: boolean = false): Promise<boolean> {
        if (this.pendingData.length === 0) {
            return true; // Não há dados para enviar
        }

        if (!this.socket || !this.isConnected) {
            const connected = forceSynchronous
                ? await this._connectAndWait()
                : await this.connect();

            if (!connected) {
                return false;
            }
        }

        let success = true;

        // Pegar até 5 itens da fila de cada vez para evitar sobrecarga
        const batchSize = 5;
        const itemsToSend = this.pendingData.splice(0, batchSize);

        for (const item of itemsToSend) {
            const sentOk = await this._emitAnalyticsData(item);
            if (!sentOk) {
                // Se algum envio falhar, coloque os itens restantes de volta na fila
                this.pendingData = [...itemsToSend.slice(itemsToSend.indexOf(item)), ...this.pendingData];
                success = false;
                break;
            }
        }

        return success;
    }

    // Conectar e aguardar de forma síncrona
    private _connectAndWait(): Promise<boolean> {
        return new Promise(resolve => {
            this.connect().then(resolve);
        });
    }

    private _emitAnalyticsData(heatmapDados: HeatmapDados): Promise<boolean> {
        return new Promise(resolve => {

            if (!this.socket) {
                resolve(false);
                return;
            }

            // Configurar timeout para resolver a promessa (caso falhe)
            const emitTimeout = setTimeout(() => {
                resolve(false);
            }, 5000);

            // Configurar handlers para resposta do servidor
            const onSuccess = (data: any) => {
                clearTimeout(emitTimeout);
                this.socket?.off('analytics_error', onError);
                resolve(true);
            };

            const onError = (error: any) => {
                clearTimeout(emitTimeout);
                this.socket?.off('analytics_received', onSuccess);
                resolve(false);
            };

            // Registrar handlers
            this.socket.once('analytics_received', onSuccess);
            this.socket.once('analytics_error', onError);

            // Enviar os dados
            this.socket.emit('analytics_data', heatmapDados);
        });
    }

    // Desconectar
    disconnect(): void {
        // Remover event listener
        window.removeEventListener('beforeunload', this._handleBeforeUnload);

        // Limpar intervalo de coleta em tempo real
        this.stopRealtimeCollection();

        // Limpar intervalo de envio periódico
        if (this.dataSendInterval) {
            clearInterval(this.dataSendInterval);
            this.dataSendInterval = null;
        }

        // Enviar qualquer dado pendente antes de desconectar
        this._sendPendingData(true).finally(() => {
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }

            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
                this.isConnected = false;
            }
        });
    }

    // Verificar status da conexão
    getConnectionStatus(): { isConnected: boolean; socketId: string | null; attempts: number; pendingData: number } {
        return {
            isConnected: this.isConnected,
            socketId: this.socket?.id || null,
            attempts: this.connectionAttempts,
            pendingData: this.pendingData.length
        };
    }

    /**
     * Configura coleta temporal automática via callback
     * @param callback Função a ser chamada a cada intervalo
     * @param intervalMs Intervalo em milissegundos (padrão: 5000)
     */
    configureRealtimeCollection(callback: (dados: HeatmapDados) => void, intervalMs: number = 5000): void {
        this.realtimeCallback = callback;
        this.realtimeIntervalMs = intervalMs;

        // Atualizar intervalo de envio
        this._initPeriodicDataSend();
    }

    /**
     * Inicia coleta temporal automática
     */
    startRealtimeCollection(): void {
        if (this.realtimeInterval) {
            clearInterval(this.realtimeInterval);
        }

        if (!this.realtimeCallback) {
            console.warn('[WebSocketService] Callback não configurado para coleta em tempo real');
            return;
        }

        this.realtimeInterval = setInterval(() => {
            if (this.realtimeCallback) {
                // O callback deve fornecer os dados atuais para envio
                // Este será implementado nas classes que usam o serviço
            }
        }, this.realtimeIntervalMs);
    }

    /**
     * Para coleta temporal automática
     */
    stopRealtimeCollection(): void {
        if (this.realtimeInterval) {
            clearInterval(this.realtimeInterval);
            this.realtimeInterval = null;
        }
    }

    /**
     * Envia dados imediatamente (bypass da fila)
     * @param heatmapDados Dados para enviar
     * @param priority Se true, envia imediatamente sem fila
     */
    async sendAnalyticsDataImmediate(heatmapDados: HeatmapDados, priority: boolean = false): Promise<boolean> {
        if (priority) {
            // Envio prioritário - tentar enviar diretamente
            if (!this.socket || !this.isConnected) {
                const connected = await this.connect();
                if (!connected) {
                    // Se não conseguir conectar, adicionar à fila normal
                    return this.sendAnalyticsData(heatmapDados);
                }
            }

            return this._emitAnalyticsData(heatmapDados);
        } else {
            // Usar método normal com fila
            return this.sendAnalyticsData(heatmapDados);
        }
    }

    /**
     * Configura intervalo de envio temporal
     * @param intervalMs Novo intervalo em milissegundos
     */
    setRealtimeInterval(intervalMs: number): void {
        this.realtimeIntervalMs = intervalMs;
        this._initPeriodicDataSend();
    }
}

// Exportar uma instância singleton
export default new WebSocketService();