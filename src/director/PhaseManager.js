/**
 * PhaseManager.js — Versión adaptada para el Experience Director.
 *
 * Detecta cruces de timestamps en el tiempo de la música y notifica
 * al director mediante un callback. NO conoce Mood Presets; solo
 * reporta índices de fase.
 *
 * El PhaseManager original en src/events/PhaseManager.js permanece
 * intacto — esta es una implementación nueva e independiente.
 */

// Límite máximo de triggers simultáneos
const MAX_TRIGGERS = 64;

export class PhaseManager {
  /**
   * @param {(phaseIndex: number) => void} onPhaseChange - Callback invocado al detectar cambio de fase
   */
  constructor(onPhaseChange) {
    // Callback de notificación al director
    this._onPhaseChange = onPhaseChange;

    // Lista de triggers ordenados por tiempo
    this._triggers = [];

    // Índice de la fase actualmente activa (-1 = ninguna)
    this._currentPhase = -1;

    // Índice del siguiente trigger pendiente por evaluar
    this._nextTriggerIndex = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // update — Detecta cruce de timestamp y notifica en el mismo frame
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Llamado cada frame por el ExperienceDirector.
   * Evalúa si el musicTime cruzó algún trigger pendiente.
   *
   * @param {Object} state - Estado del frame (no usado directamente aquí)
   * @param {number} musicTime - Tiempo actual de la canción en segundos
   */
  update(state, musicTime) {
    // Recorrer todos los triggers pendientes cuyo tiempo ya se alcanzó
    while (this._nextTriggerIndex < this._triggers.length) {
      const trigger = this._triggers[this._nextTriggerIndex];

      if (musicTime >= trigger.time) {
        // Solo notificar si la fase cambia realmente
        if (trigger.phaseIndex !== this._currentPhase) {
          this._currentPhase = trigger.phaseIndex;
          this._onPhaseChange(this._currentPhase);
        }
        this._nextTriggerIndex++;
      } else {
        // Los triggers están ordenados, no hay más por evaluar en este frame
        break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API de triggers — agregar, remover, reordenar, consultar
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Agrega un trigger de fase. Rechaza tiempos negativos, índices inválidos
   * y exceso del límite de 64 triggers.
   *
   * @param {number} time - Tiempo en segundos (>= 0)
   * @param {number} phaseIndex - Índice de la fase (0 a 63)
   * @returns {boolean} true si se agregó, false si fue rechazado
   */
  addTrigger(time, phaseIndex) {
    // Validar tiempo negativo
    if (time < 0) {
      console.warn(`[PhaseManager] addTrigger rechazado: tiempo negativo (${time})`);
      return false;
    }

    // Validar índice de fase inválido
    if (phaseIndex < 0 || !Number.isFinite(phaseIndex) || Math.floor(phaseIndex) !== phaseIndex) {
      console.warn(`[PhaseManager] addTrigger rechazado: índice de fase inválido (${phaseIndex})`);
      return false;
    }

    // Validar límite máximo de triggers
    if (this._triggers.length >= MAX_TRIGGERS) {
      console.warn(`[PhaseManager] addTrigger rechazado: máximo de ${MAX_TRIGGERS} triggers alcanzado`);
      return false;
    }

    this._triggers.push({ time, phaseIndex });
    this._sortTriggers();

    // Recalcular el índice del siguiente trigger pendiente
    this._recalculateNextIndex();

    return true;
  }

  /**
   * Remueve el trigger con el tiempo especificado.
   *
   * @param {number} time - Tiempo del trigger a remover
   * @returns {boolean} true si se removió, false si no existía
   */
  removeTrigger(time) {
    const index = this._triggers.findIndex(t => t.time === time);
    if (index === -1) return false;

    this._triggers.splice(index, 1);

    // Recalcular el índice del siguiente trigger pendiente
    this._recalculateNextIndex();

    return true;
  }

  /**
   * Fuerza reordenamiento de triggers por tiempo.
   * Útil si se modificaron triggers externamente.
   */
  reorderTriggers() {
    this._sortTriggers();
    this._recalculateNextIndex();
  }

  /**
   * Retorna una copia de la lista de triggers actual (ordenada por tiempo).
   *
   * @returns {Array<{time: number, phaseIndex: number}>}
   */
  getTriggers() {
    return this._triggers.map(t => ({ ...t }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // recalculatePhase — Soporte de seek (retroceso en el tiempo)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Recalcula la fase activa para un tiempo dado (incluye seek hacia atrás).
   * Encuentra el último trigger cuyo time <= musicTime.
   * Si la fase resultante difiere de la actual, notifica al director.
   *
   * @param {number} musicTime - Tiempo actual tras el seek
   */
  recalculatePhase(musicTime) {
    // Encontrar el último trigger cuyo tiempo <= musicTime
    let newPhase = -1;
    let newNextIndex = 0;

    for (let i = 0; i < this._triggers.length; i++) {
      if (this._triggers[i].time <= musicTime) {
        newPhase = this._triggers[i].phaseIndex;
        newNextIndex = i + 1;
      } else {
        break;
      }
    }

    // Actualizar el índice del siguiente trigger pendiente
    this._nextTriggerIndex = newNextIndex;

    // Solo notificar si la fase cambió
    if (newPhase !== this._currentPhase) {
      this._currentPhase = newPhase;
      // Solo notificar si hay una fase válida (no -1)
      if (newPhase >= 0) {
        this._onPhaseChange(this._currentPhase);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Métodos internos
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Ordena los triggers por tiempo ascendente.
   */
  _sortTriggers() {
    this._triggers.sort((a, b) => a.time - b.time);
  }

  /**
   * Recalcula _nextTriggerIndex basándose en la fase actual y los triggers.
   * Busca el primer trigger que aún no se ha procesado respecto a _currentPhase.
   */
  _recalculateNextIndex() {
    // Encontrar el primer trigger cuya fase aún no se ha "pasado"
    // Basado en la fase actual, el siguiente es el que viene después del último procesado
    this._nextTriggerIndex = 0;
    for (let i = 0; i < this._triggers.length; i++) {
      if (this._triggers[i].time <= this._getLastProcessedTime()) {
        this._nextTriggerIndex = i + 1;
      } else {
        break;
      }
    }
  }

  /**
   * Obtiene el tiempo del último trigger procesado (para recalcular índice).
   * Si la fase actual coincide con algún trigger, retorna su tiempo.
   */
  _getLastProcessedTime() {
    // Buscar el último trigger cuyo phaseIndex coincide con la fase actual
    // y que estaría antes del próximo trigger a evaluar
    if (this._currentPhase < 0) return -1;

    for (let i = this._triggers.length - 1; i >= 0; i--) {
      if (this._triggers[i].phaseIndex === this._currentPhase) {
        return this._triggers[i].time;
      }
    }
    return -1;
  }
}
