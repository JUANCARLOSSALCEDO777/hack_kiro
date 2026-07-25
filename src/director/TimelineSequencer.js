/**
 * TimelineSequencer — Secuenciador temporal del Experience Director.
 *
 * Programa eventos por tiempo absoluto, conteo de beats, o triggers compuestos.
 * Cada evento contiene un trigger (condición de disparo) y una acción a ejecutar
 * cuando la condición se cumple.
 *
 * Responsabilidades:
 * - Cargar listas de hasta 500 eventos
 * - Evaluar triggers en cada frame (absolute, beatCount, compound)
 * - Ejecutar acciones delegando al ExperienceDirector
 * - Soportar pausa/resume del reloj interno
 * - Filtrar eventos con acciones inválidas con console.warn
 */

// Límite máximo de eventos aceptados
const MAX_EVENTS = 500;

// Tipos de trigger válidos
const VALID_TRIGGER_TYPES = ['absolute', 'beatCount', 'compound'];

// Tipos de acción válidos
const VALID_ACTION_TYPES = ['activatePreset', 'toggleElement', 'startSequence', 'modifyBindings'];

export class TimelineSequencer {
  /**
   * @param {import('./ExperienceDirector.js').ExperienceDirector} director — Referencia al director para ejecutar acciones
   */
  constructor(director) {
    this._director = director;

    // Lista de eventos pendientes (no disparados)
    this._events = [];

    // Estado de pausa
    this._paused = false;

    // Tiempo musical actual en el momento de la carga (para filtrar eventos pasados)
    this._currentMusicTime = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API Pública
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Carga una lista de eventos reemplazando la lista anterior.
   * - Máximo 500 eventos (trunca y advierte si se excede)
   * - Filtra eventos con trigger 'absolute' cuyo time < musicTime actual
   * - Ordena por tiempo de trigger / beatCount
   *
   * @param {Array} events — Lista de TimelineEvent
   */
  loadEvents(events) {
    if (!Array.isArray(events)) {
      console.warn('TimelineSequencer.loadEvents: se esperaba un array de eventos.');
      this._events = [];
      return;
    }

    // Advertir y truncar si excede el máximo
    let eventList = events;
    if (eventList.length > MAX_EVENTS) {
      console.warn(
        `TimelineSequencer.loadEvents: se recibieron ${eventList.length} eventos, máximo permitido es ${MAX_EVENTS}. Truncando.`
      );
      eventList = eventList.slice(0, MAX_EVENTS);
    }

    // Procesar y filtrar eventos
    const processed = [];

    for (let i = 0; i < eventList.length; i++) {
      const event = eventList[i];

      // Validar estructura básica del evento
      if (!event || !event.trigger || !event.action) {
        console.warn(
          `TimelineSequencer.loadEvents: evento en índice ${i} tiene estructura inválida. Omitido.`
        );
        continue;
      }

      // Validar tipo de trigger
      if (!VALID_TRIGGER_TYPES.includes(event.trigger.type)) {
        console.warn(
          `TimelineSequencer.loadEvents: evento en índice ${i} tiene trigger.type '${event.trigger.type}' inválido. Omitido.`
        );
        continue;
      }

      // Validar tipo de acción
      if (!VALID_ACTION_TYPES.includes(event.action.type)) {
        console.warn(
          `TimelineSequencer.loadEvents: evento en índice ${i} tiene action.type '${event.action.type}' inválido. Omitido.`
        );
        continue;
      }

      // Filtrar eventos 'absolute' ya pasados
      if (event.trigger.type === 'absolute' && event.trigger.time < this._currentMusicTime) {
        continue;
      }

      // Filtrar eventos 'compound' ya pasados (por su componente temporal)
      if (event.trigger.type === 'compound' && event.trigger.time !== undefined) {
        const windowSec = (event.trigger.window || 500) / 1000;
        // Si ya pasó la ventana temporal, omitir
        if ((event.trigger.time + windowSec) < this._currentMusicTime) {
          continue;
        }
      }

      processed.push({
        ...event,
        _index: i,      // Índice original para mensajes de error
        _fired: false,  // Flag de disparo (no re-disparar)
      });
    }

    // Ordenar por tiempo de trigger (absolute/compound) o beatCount
    processed.sort((a, b) => {
      const timeA = this._getSortKey(a);
      const timeB = this._getSortKey(b);
      return timeA - timeB;
    });

    this._events = processed;
  }

  /**
   * Evalúa triggers y dispara eventos pendientes.
   * Si está pausado, no hace nada.
   *
   * @param {number} musicTime — Tiempo actual de la canción en segundos
   * @param {Object} beatCounts — Conteos acumulados { bass: N, mid: N, high: N }
   */
  update(musicTime, beatCounts) {
    // Si está pausado, no procesar
    if (this._paused) return;

    // Actualizar tiempo actual (para futuras cargas con loadEvents)
    this._currentMusicTime = musicTime;

    for (const event of this._events) {
      // Saltar eventos ya disparados
      if (event._fired) continue;

      // Evaluar condición de trigger
      const shouldFire = this._evaluateTrigger(event.trigger, musicTime, beatCounts);

      if (shouldFire) {
        event._fired = true;
        this._executeAction(event.action, event._index);
      }
    }
  }

  /**
   * Retorna una copia de la lista de eventos (incluyendo estado de disparo).
   * @returns {Array} Copia de los eventos
   */
  getEvents() {
    return this._events.map((e) => ({
      trigger: { ...e.trigger },
      action: { ...e.action, params: { ...e.action.params } },
      _fired: e._fired,
      _index: e._index,
    }));
  }

  /**
   * Pausa el sequencer — congela la evaluación de triggers.
   */
  pause() {
    this._paused = true;
  }

  /**
   * Reanuda el sequencer — retoma la evaluación de triggers.
   */
  resume() {
    this._paused = false;
  }

  /**
   * Retorna si el sequencer está pausado.
   * @returns {boolean}
   */
  isPaused() {
    return this._paused;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Métodos Privados
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Evalúa si la condición de trigger se cumple para el frame actual.
   *
   * @param {Object} trigger — Objeto trigger del evento
   * @param {number} musicTime — Tiempo actual en segundos
   * @param {Object} beatCounts — { bass, mid, high }
   * @returns {boolean} true si debe dispararse
   * @private
   */
  _evaluateTrigger(trigger, musicTime, beatCounts) {
    switch (trigger.type) {
      case 'absolute':
        // Disparar cuando musicTime >= trigger.time
        return musicTime >= trigger.time;

      case 'beatCount':
        // Disparar cuando beatCounts[beatType] >= trigger.beatCount
        return this._checkBeatCount(trigger, beatCounts);

      case 'compound':
        // Disparar cuando se cumple AMBAS condiciones:
        // 1. beatCounts[beatType] >= trigger.beatCount
        // 2. |musicTime - trigger.time| <= trigger.window / 1000
        return this._checkCompound(trigger, musicTime, beatCounts);

      default:
        return false;
    }
  }

  /**
   * Verifica condición de trigger por conteo de beats.
   *
   * @param {Object} trigger
   * @param {Object} beatCounts
   * @returns {boolean}
   * @private
   */
  _checkBeatCount(trigger, beatCounts) {
    const { beatType, beatCount } = trigger;
    if (!beatType || beatCount === undefined) return false;
    const currentCount = beatCounts[beatType];
    if (currentCount === undefined) return false;
    return currentCount >= beatCount;
  }

  /**
   * Verifica condición de trigger compuesto (beat + ventana temporal).
   *
   * @param {Object} trigger
   * @param {number} musicTime
   * @param {Object} beatCounts
   * @returns {boolean}
   * @private
   */
  _checkCompound(trigger, musicTime, beatCounts) {
    const { beatType, beatCount, time, window: windowMs } = trigger;

    // Verificar condición de beatCount
    if (!this._checkBeatCount(trigger, beatCounts)) return false;

    // Verificar ventana temporal
    if (time === undefined) return false;
    const windowSec = (windowMs || 500) / 1000;
    return Math.abs(musicTime - time) <= windowSec;
  }

  /**
   * Ejecuta la acción del evento delegando al director.
   * Si la acción es inválida o faltan parámetros, emite console.warn y omite.
   *
   * @param {Object} action — { type, params }
   * @param {number} eventIndex — Índice original del evento (para mensajes)
   * @private
   */
  _executeAction(action, eventIndex) {
    const { type, params } = action;

    if (!params) {
      console.warn(
        `TimelineSequencer: evento[${eventIndex}] — acción '${type}' sin parámetros. Omitido.`
      );
      return;
    }

    try {
      switch (type) {
        case 'activatePreset':
          this._doActivatePreset(params, eventIndex);
          break;

        case 'toggleElement':
          this._doToggleElement(params, eventIndex);
          break;

        case 'startSequence':
          this._doStartSequence(params, eventIndex);
          break;

        case 'modifyBindings':
          this._doModifyBindings(params, eventIndex);
          break;

        default:
          console.warn(
            `TimelineSequencer: evento[${eventIndex}] — action.type '${type}' no reconocido. Omitido.`
          );
      }
    } catch (err) {
      console.warn(
        `TimelineSequencer: evento[${eventIndex}] — error al ejecutar acción '${type}': ${err.message}`
      );
    }
  }

  /**
   * Acción: activar un Mood Preset via el director.
   * @private
   */
  _doActivatePreset(params, eventIndex) {
    const { presetName, transitionDuration } = params;
    if (!presetName) {
      console.warn(
        `TimelineSequencer: evento[${eventIndex}] — activatePreset sin 'presetName'. Omitido.`
      );
      return;
    }
    this._director.activatePreset(presetName, transitionDuration);
  }

  /**
   * Acción: activar/desactivar un Visual Element via el director.
   * @private
   */
  _doToggleElement(params, eventIndex) {
    const { elementName, active } = params;
    if (!elementName || active === undefined) {
      console.warn(
        `TimelineSequencer: evento[${eventIndex}] — toggleElement sin 'elementName' o 'active'. Omitido.`
      );
      return;
    }
    this._director.setElementActive(elementName, active);
  }

  /**
   * Acción: iniciar una Camera Sequence.
   * Placeholder — se conectará al CameraSystem cuando esté implementado.
   * @private
   */
  _doStartSequence(params, eventIndex) {
    // Placeholder: el CameraSystem se integrará en tareas posteriores
    console.log(
      `TimelineSequencer: evento[${eventIndex}] — startSequence con params:`,
      params
    );
  }

  /**
   * Acción: modificar bindings del BeatRouter.
   * @private
   */
  _doModifyBindings(params, eventIndex) {
    const { beatType, bindings } = params;
    if (!beatType || !Array.isArray(bindings)) {
      console.warn(
        `TimelineSequencer: evento[${eventIndex}] — modifyBindings sin 'beatType' o 'bindings'. Omitido.`
      );
      return;
    }
    this._director.getBeatRouter().replaceBindings(beatType, bindings);
  }

  /**
   * Retorna una clave numérica de ordenación para un evento.
   * Prioriza tiempo absoluto; para beatCount usa un valor alto + beatCount.
   *
   * @param {Object} event
   * @returns {number}
   * @private
   */
  _getSortKey(event) {
    const { trigger } = event;
    if (trigger.type === 'absolute') {
      return trigger.time || 0;
    }
    if (trigger.type === 'compound') {
      return trigger.time || 0;
    }
    // beatCount: usar beatCount como proxy (no tiene correlación directa con tiempo)
    return trigger.beatCount || 0;
  }
}
