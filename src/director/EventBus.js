/**
 * EventBus — Sistema de eventos interno del Experience Director.
 *
 * Implementa patrón pub/sub para comunicación desacoplada entre
 * los subsistemas del director (PhaseManager, TransitionEngine,
 * CameraSystem, etc.).
 *
 * Cada evento emitido incluye timestamp automático en los datos.
 */
export class EventBus {
  constructor() {
    // Mapa de evento → Set de handlers registrados
    this._listeners = new Map();
  }

  /**
   * Emite un evento a todos los handlers suscritos.
   * Agrega timestamp automáticamente a los datos del evento.
   *
   * @param {string} event - Nombre del evento (ej: 'phaseChange', 'transitionStart')
   * @param {Object} data - Datos asociados al evento
   */
  emit(event, data = {}) {
    const eventData = {
      ...data,
      timestamp: Date.now(),
    };

    const handlers = this._listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    // Ejecutar cada handler capturando errores para no romper la cadena
    for (const handler of handlers) {
      try {
        handler(eventData);
      } catch (error) {
        console.warn(`[EventBus] Error en handler de '${event}':`, error);
      }
    }
  }

  /**
   * Suscribe un handler a un evento.
   * Retorna una función de unsubscribe para facilitar la limpieza.
   *
   * @param {string} event - Nombre del evento
   * @param {Function} handler - Función a ejecutar cuando se emita el evento
   * @returns {Function} Función para desuscribirse
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }

    this._listeners.get(event).add(handler);

    // Retornar función de unsubscribe
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Remueve un handler específico de un evento.
   *
   * @param {string} event - Nombre del evento
   * @param {Function} handler - Referencia al handler a remover
   */
  off(event, handler) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;

    handlers.delete(handler);

    // Limpiar el Set si queda vacío para liberar memoria
    if (handlers.size === 0) {
      this._listeners.delete(event);
    }
  }
}
