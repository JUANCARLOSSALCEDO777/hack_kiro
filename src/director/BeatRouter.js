/**
 * BeatRouter — Mapea tipos de beat a respuestas visuales configurables.
 *
 * Mantiene un mapa de EffectBindings por BeatType (bass, mid, high),
 * respetando orden de inserción y un máximo de 16 bindings por tipo.
 * Ejecuta los bindings en orden cuando se procesa un beat,
 * saltando elementos inactivos según el VisualElementRegistry.
 */

// Tipos de beat válidos
const VALID_BEAT_TYPES = ['bass', 'mid', 'high'];

// Máximo de bindings por BeatType
const MAX_BINDINGS_PER_TYPE = 16;

export class BeatRouter {
  /**
   * @param {Object} beatEvents - Instancia de BeatEvents (se usa para leer flags de beat)
   * @param {Object} elementRegistry - Instancia de VisualElementRegistry
   */
  constructor(beatEvents, elementRegistry) {
    this._beatEvents = beatEvents;
    this._elementRegistry = elementRegistry;

    // Mapa: BeatType → EffectBinding[] (orden de inserción)
    this._bindings = new Map();
    for (const type of VALID_BEAT_TYPES) {
      this._bindings.set(type, []);
    }
  }

  /**
   * Agrega un binding a la lista del BeatType indicado.
   * Valida límite de 16 bindings y clampea intensidad a [0, 1].
   *
   * @param {string} beatType - 'bass', 'mid', o 'high'
   * @param {Object} binding - EffectBinding con elementName, action, intensity, params
   */
  addBinding(beatType, binding) {
    this._assertValidBeatType(beatType);

    const list = this._bindings.get(beatType);

    // Rechazar si se excede el máximo
    if (list.length >= MAX_BINDINGS_PER_TYPE) {
      console.warn(
        `BeatRouter: máximo de ${MAX_BINDINGS_PER_TYPE} bindings alcanzado para '${beatType}'. Binding ignorado.`
      );
      return;
    }

    // Clonar binding y clampear intensidad
    const normalized = this._normalizeBinding(binding);
    list.push(normalized);
  }

  /**
   * Remueve el binding asociado al elementName del BeatType indicado.
   *
   * @param {string} beatType - 'bass', 'mid', o 'high'
   * @param {string} elementName - Nombre del elemento a remover
   */
  removeBinding(beatType, elementName) {
    this._assertValidBeatType(beatType);

    const list = this._bindings.get(beatType);
    const index = list.findIndex((b) => b.elementName === elementName);

    if (index !== -1) {
      list.splice(index, 1);
    }
  }

  /**
   * Reemplaza todos los bindings de un BeatType por una nueva lista.
   * Valida cada binding y respeta el límite de 16.
   *
   * @param {string} beatType - 'bass', 'mid', o 'high'
   * @param {Array} bindings - Array de EffectBinding
   */
  replaceBindings(beatType, bindings) {
    this._assertValidBeatType(beatType);

    // Validar y normalizar cada binding, respetar límite
    const normalized = [];
    for (let i = 0; i < bindings.length; i++) {
      if (normalized.length >= MAX_BINDINGS_PER_TYPE) {
        console.warn(
          `BeatRouter: replaceBindings truncado a ${MAX_BINDINGS_PER_TYPE} bindings para '${beatType}'.`
        );
        break;
      }
      normalized.push(this._normalizeBinding(bindings[i]));
    }

    this._bindings.set(beatType, normalized);
  }

  /**
   * Retorna una copia de los bindings del BeatType indicado.
   *
   * @param {string} beatType - 'bass', 'mid', o 'high'
   * @returns {Array} Copia del array de EffectBinding
   */
  getBindings(beatType) {
    this._assertValidBeatType(beatType);
    // Retornar copia para evitar mutación externa
    return [...this._bindings.get(beatType)];
  }

  /**
   * Ejecuta los bindings del BeatType en orden de inserción.
   * Salta elementos inactivos según el registry.
   * No genera error si la lista está vacía.
   *
   * @param {string} beatType - 'bass', 'mid', o 'high'
   */
  processBeat(beatType) {
    this._assertValidBeatType(beatType);

    const list = this._bindings.get(beatType);

    // Lista vacía: no hacer nada, sin error
    if (list.length === 0) return;

    for (const binding of list) {
      // Verificar si el elemento está activo en el registry
      try {
        if (!this._elementRegistry.isActive(binding.elementName)) {
          continue; // Saltar elementos inactivos
        }
      } catch {
        // Si el elemento no está registrado, saltar sin romper el loop
        continue;
      }

      // Obtener el adaptador del elemento
      const entry = this._elementRegistry.getAll().get(binding.elementName);
      if (!entry || !entry.adapter) continue;

      const adapter = entry.adapter;

      // Ejecutar la acción si el adaptador la soporta
      if (typeof adapter[binding.action] === 'function') {
        try {
          adapter[binding.action](beatType, binding.intensity);
        } catch (err) {
          // No romper el loop si un adaptador falla
          console.warn(
            `BeatRouter: error al ejecutar '${binding.action}' en '${binding.elementName}':`,
            err.message
          );
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Métodos privados
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Valida que el beatType sea uno de los tipos permitidos.
   * @param {string} beatType
   * @private
   */
  _assertValidBeatType(beatType) {
    if (!VALID_BEAT_TYPES.includes(beatType)) {
      throw new Error(
        `BeatRouter: beatType '${beatType}' inválido. Válidos: [${VALID_BEAT_TYPES.join(', ')}]`
      );
    }
  }

  /**
   * Normaliza un binding: clampea intensidad a [0, 1] con warning.
   * Retorna un objeto nuevo (no muta el original).
   *
   * @param {Object} binding - EffectBinding original
   * @returns {Object} Binding normalizado
   * @private
   */
  _normalizeBinding(binding) {
    let intensity = binding.intensity ?? 1.0;

    // Clamp con advertencia si está fuera de rango
    if (typeof intensity === 'number' && (intensity < 0 || intensity > 1)) {
      console.warn(
        `BeatRouter: intensidad ${intensity} fuera de rango [0, 1]. Clampeado a ${Math.min(1, Math.max(0, intensity))}.`
      );
      intensity = Math.min(1, Math.max(0, intensity));
    }

    return {
      elementName: binding.elementName,
      action: binding.action || 'onBeat',
      intensity,
      params: binding.params || {},
    };
  }
}
