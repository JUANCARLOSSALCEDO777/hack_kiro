/**
 * WebSocketClient.js — Cliente WSS con reconexión automática
 *
 * Mantiene una conexión WebSocket segura con el API Gateway y
 * reconecta automáticamente con exponential backoff ante desconexiones.
 * Parsea JSON de cada mensaje recibido y entrega el payload al callback.
 */

export class WebSocketClient {

    /**
     * @param {string} endpoint - URL WSS del API Gateway WebSocket
     * @param {Function} onMessage - Callback invocado con el payload parseado de cada mensaje
     * @param {Object} [reconnectConfig] - Configuración de reconexión
     * @param {number} [reconnectConfig.initialDelay=1000] - Delay inicial en ms
     * @param {number} [reconnectConfig.maxDelay=30000] - Delay máximo en ms
     * @param {number} [reconnectConfig.multiplier=2] - Multiplicador del backoff
     */
    constructor(endpoint, onMessage, reconnectConfig = {}) {
        this._endpoint = endpoint;
        this._onMessageCallback = onMessage;
        this._initialDelay = reconnectConfig.initialDelay ?? 1000;
        this._maxDelay = reconnectConfig.maxDelay ?? 30000;
        this._multiplier = reconnectConfig.multiplier ?? 2;

        this._ws = null;
        this._attemptCount = 0;
        this._reconnectTimer = null;
        this._intentionalClose = false;
    }

    /**
     * Establece la conexión WSS con el endpoint configurado.
     * Si ya hay una conexión activa, no hace nada.
     */
    connect() {
        if (this._ws && (this._ws.readyState === WebSocket.CONNECTING || this._ws.readyState === WebSocket.OPEN)) {
            return;
        }

        this._intentionalClose = false;
        this._createConnection();
    }

    /**
     * Cierra la conexión de forma intencional.
     * No se reconectará tras un cierre intencional.
     */
    disconnect() {
        this._intentionalClose = true;
        this._clearReconnectTimer();

        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
    }

    /**
     * Calcula el delay de reconexión para el intento N (1-based).
     * Fórmula: min(initialDelay × multiplier^(N-1), maxDelay)
     * @param {number} attempt - Número de intento (1-based)
     * @returns {number} Delay en milisegundos
     */
    getReconnectDelay(attempt) {
        const delay = this._initialDelay * Math.pow(this._multiplier, attempt - 1);
        return Math.min(delay, this._maxDelay);
    }

    // ─── Métodos privados ────────────────────────────────────────────────────────

    /** Crea la instancia WebSocket y enlaza los event handlers */
    _createConnection() {
        try {
            this._ws = new WebSocket(this._endpoint);
        } catch (error) {
            console.warn('[WebSocketClient] Error al crear WebSocket:', error.message);
            this._scheduleReconnect();
            return;
        }

        this._ws.onopen = () => {
            // Conexión exitosa — resetear contador de intentos
            this._attemptCount = 0;
        };

        this._ws.onmessage = (event) => {
            this._handleMessage(event);
        };

        this._ws.onclose = (event) => {
            this._handleClose(event);
        };

        this._ws.onerror = (error) => {
            // Los errores en WebSocket siempre van seguidos de un close,
            // así que solo logueamos aquí sin reconectar
            console.warn('[WebSocketClient] Error en la conexión:', error);
        };
    }

    /**
     * Parsea el JSON del mensaje recibido. Si es inválido,
     * loguea un warning y descarta sin cerrar la conexión.
     */
    _handleMessage(event) {
        let payload;

        try {
            payload = JSON.parse(event.data);
        } catch (error) {
            console.warn('[WebSocketClient] Mensaje descartado — JSON inválido:', event.data);
            return;
        }

        // Entregar el payload parseado al callback
        this._onMessageCallback(payload);
    }

    /**
     * Maneja el cierre de la conexión.
     * Si fue intencional (disconnect()), no reconecta.
     * Si fue por timeout de API Gateway (código 1001, ~2h), reconecta inmediatamente.
     * Si fue inesperado, reconecta con exponential backoff.
     */
    _handleClose(event) {
        this._ws = null;

        if (this._intentionalClose) {
            return;
        }

        // Código 1001 = "Going Away" — típico del timeout de 2h de API Gateway
        if (event.code === 1001) {
            // Reconexión inmediata para cierres esperados por timeout
            this._attemptCount = 0;
            this._createConnection();
            return;
        }

        // Cierre inesperado — reconectar con backoff
        this._scheduleReconnect();
    }

    /** Programa el siguiente intento de reconexión con exponential backoff */
    _scheduleReconnect() {
        this._clearReconnectTimer();
        this._attemptCount++;

        const delay = this.getReconnectDelay(this._attemptCount);

        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this._createConnection();
        }, delay);
    }

    /** Limpia el timer de reconexión pendiente */
    _clearReconnectTimer() {
        if (this._reconnectTimer !== null) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }
}
