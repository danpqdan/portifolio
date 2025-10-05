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

    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.serverUrl = WEBSOCKET_URL;
        this.connectionAttempts = 0;
        this.reconnectTimer = null;
        this.pendingData = [];


        // Iniciar envio periódico de dados (a cada 10 segundos)
        this._initPeriodicDataSend();

        // Configurar evento para enviar dados pendentes antes de fechar a página
        window.addEventListener('beforeunload', this._handleBeforeUnload);
    }

    private _initPeriodicDataSend(): void {
        // Limpar qualquer intervalo existente
        if (this.dataSendInterval) {
            clearInterval(this.dataSendInterval);
        }

        // Configurar intervalo para enviar dados pendentes
        this.dataSendInterval = setInterval(() => {
            this._sendPendingData();
        }, 10000); // A cada 10 segundos
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
                    this.isConnected = true;
                    this.connectionAttempts = 0; // Resetar contador de tentativas
                    clearTimeout(connectTimeout);

                    // Enviar dados pendentes imediatamente após conexão
                    this._sendPendingData();

                    resolve(true);
                });

                this.socket.on('disconnect', (reason: string) => {
                    this.isConnected = false;

                    // Tentar reconectar se não foi desconexão manual
                    if (reason !== 'io client disconnect') {
                        this.reconnectTimer = setTimeout(() => {
                            this.connect();
                        }, 2000);
                    }
                });

                this.socket.on('connect_error', (error: Error) => {
                    clearTimeout(connectTimeout);

                    // Tentar reconectar com backoff
                    const backoffDelay = Math.min(2000 * Math.pow(2, this.connectionAttempts), 10000);

                    this.reconnectTimer = setTimeout(() => {
                        this.connect();
                    }, backoffDelay);

                    // Não resolver com erro imediatamente, deixar o timeout resolver se necessário
                });

                // Resposta do servidor quando recebe dados de analytics
                this.socket.on('analytics_received', (data: any) => {
                });

                this.socket.on('analytics_error', (data: any) => {
                });

                this.socket.on('connection_response', (data: any) => {
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
}

// Exportar uma instância singleton
export default new WebSocketService();