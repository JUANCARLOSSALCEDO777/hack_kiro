/**
 * ExperienceDirector — Clase principal del módulo de dirección cinematográfica.
 *
 * Coordina todos los subsistemas del director (EventBus, TransitionEngine,
 * VisualElementRegistry, PhaseManager, BeatRouter) para orquestar la
 * experiencia visual sin modificar la lógica interna de los subsistemas existentes.
 *
 * Responsabilidades de esta clase:
 * - Registrar y gestionar Mood Presets (máximo 20)
 * - Activar presets delegando la interpolación al TransitionEngine
 * - Controlar activación/desactivación de Visual Elements
 * - Emitir eventos de cambio de estado via EventBus
 * - Coordinar PhaseManager y BeatRouter en el loop de animación
 */

import { EventBus } from './EventBus.js';
import { TransitionEngine } from './TransitionEngine.js';
import { VisualElementRegistry } from './VisualElementRegistry.js';
import { PhaseManager } from './PhaseManager.js';
import { BeatRouter } from './BeatRouter.js';
import { TimelineSequencer } from './TimelineSequencer.js';
import { CameraSystem } from './CameraSystem.js';

// Adaptadores de elementos visuales
import { StarsAdapter } from './adapters/StarsAdapter.js';
import { SpheresAdapter } from './adapters/SpheresAdapter.js';
import { SkyboxAdapter } from './adapters/SkyboxAdapter.js';
import { WebcamScreensAdapter } from './adapters/WebcamScreensAdapter.js';
import { PixelTextAdapter } from './adapters/PixelTextAdapter.js';

// Límites de validación
const MAX_PRESETS = 64;
const PRESET_NAME_MIN_LENGTH = 1;
const PRESET_NAME_MAX_LENGTH = 50;

// Presets predefinidos que preservan la configuración actual y ofrecen variantes
const BUILT_IN_PRESETS = {
  'default': {
    terrainMode: 'spectrum',
    lightPattern: 'radialPulse',
    bloom: { strength: 1.5, radius: 0.4, threshold: 0.4 },
    skybox: { hueRange: [0.6, 0.95], saturation: 0.8, baseLightness: 0.04, pulseIntensity: 0.12 },
    camera: { mode: 'first-person', params: { velocity: 150, altitude: 60, targetDistance: 150, fov: 30 } },
    beatThresholds: { bass: 150, mid: 100, high: 80 },
    textureMode: 'wireframe',
    elementVisibility: { stars: true, spheres: true, webcamScreens: true, pixelText: true, skybox: true },
    spectrum: { attack: 0.68, decay: 0.01, rotation: true, bands: [0.22, 0.23, 0.63, 0.09, 0.63, 0.09, 0.59, 0.56] },
    webcamPattern: 'rings',
    webcamLED: {
      screenRadius: 1000, screenWidth: 300, screenHeight: 170, screenAltitude: 140.9,
      gridWidth: 64, gridHeight: 36, dotRadiusRatio: 0.7417,
      frameInterval: 1017.5, vignetteIntensity: 0.3,
      cycleDuration: 8, assembleDuration: 2, pointSize: 41
    },
    textMode: {
      renderer: 'particles',
      particles: { particleCount: 2500, spreadRadius: 118.4, assembleDuration: 1.7476, planeScale: 1.0, pointSize: 12.0, turbulenceAmount: 1.52 }
    }
  },
  'energético': {
    terrainMode: 'spectrum',
    lightPattern: 'allFlash',
    bloom: { strength: 2.5, radius: 0.6, threshold: 0.2 },
    skybox: { hueRange: [0.0, 0.15], saturation: 1.0, baseLightness: 0.08, pulseIntensity: 0.25 },
    camera: { mode: 'first-person', params: { velocity: 300, altitude: 40, targetDistance: 100, fov: 60 } },
    beatThresholds: { bass: 100, mid: 70, high: 50 }
  },
  'contemplativo': {
    terrainMode: 'wave',
    lightPattern: 'radialPulse',
    bloom: { strength: 1.0, radius: 0.8, threshold: 0.6 },
    skybox: { hueRange: [0.55, 0.7], saturation: 0.5, baseLightness: 0.02, pulseIntensity: 0.05 },
    camera: { mode: 'first-person', params: { velocity: 80, altitude: 100, targetDistance: 250, fov: 25 } },
    beatThresholds: { bass: 200, mid: 150, high: 120 }
  },
  'caótico': {
    terrainMode: 'spring',
    lightPattern: 'snake',
    bloom: { strength: 3.0, radius: 1.0, threshold: 0.1 },
    skybox: { hueRange: [0.0, 1.0], saturation: 1.0, baseLightness: 0.1, pulseIntensity: 0.3 },
    camera: { mode: 'first-person', params: { velocity: 250, altitude: 35, targetDistance: 80, fov: 75 } },
    beatThresholds: { bass: 80, mid: 60, high: 40 }
  }
};

// Campos obligatorios en un MoodPresetConfig
const REQUIRED_PRESET_FIELDS = ['terrainMode', 'lightPattern', 'bloom', 'skybox', 'camera'];
// Sub-campos obligatorios de bloom
const REQUIRED_BLOOM_FIELDS = ['strength', 'radius', 'threshold'];
// Sub-campos obligatorios de skybox
const REQUIRED_SKYBOX_FIELDS = ['hueRange', 'saturation', 'baseLightness', 'pulseIntensity'];
// Sub-campos obligatorios de camera
const REQUIRED_CAMERA_FIELDS = ['mode', 'params'];

export class ExperienceDirector {
  /**
   * @param {Object} dependencies — Subsistemas existentes inyectados
   * @param {Object} dependencies.player — Player existente
   * @param {Object} dependencies.beatEvents — BeatEvents existente
   * @param {Object} dependencies.terrain — Terrain existente
   * @param {Object} dependencies.skybox — Skybox existente
   * @param {Object} dependencies.stars — Stars existente
   * @param {Object} dependencies.spheres — LuminousSpheres existente
   * @param {Object} dependencies.webcamScreens — WebcamLEDScreens existente
   * @param {Object} dependencies.pixelText — PixelText existente
   * @param {Object} dependencies.view — View (para bloomPass)
   * @param {Object} dependencies.music — MusicPlayer (para musicTime)
   */
  constructor(dependencies) {
    // Guardar referencia a dependencias inyectadas
    this._deps = dependencies;

    // Instanciar subsistemas internos del director
    this._eventBus = new EventBus();
    this._transitionEngine = new TransitionEngine();
    this._elementRegistry = new VisualElementRegistry();

    // PhaseManager notifica cambios de fase al director
    this._phaseManager = new PhaseManager((phaseIndex) => {
      this._onPhaseChange(phaseIndex);
    });

    // BeatRouter necesita beatEvents y el registry
    this._beatRouter = new BeatRouter(dependencies.beatEvents, this._elementRegistry);

    // TimelineSequencer programa eventos declarativos por tiempo/beats
    this._timelineSequencer = new TimelineSequencer(this);

    // CameraSystem gestiona modos cinematográficos y secuencias
    this._cameraSystem = new CameraSystem(dependencies.player, dependencies.player.camera);

    // Contadores acumulados de beats por tipo
    this._beatCounts = { bass: 0, mid: 0, high: 0 };

    // Colección de Mood Presets: nombre → config
    this._presets = new Map();

    // Preset activo actualmente (nombre)
    this._activePreset = null;

    // Tabla de asociación phaseIndex → presetName
    this._phaseToPreset = new Map();

    // Registrar adaptadores de elementos visuales
    this._registerAdapters(dependencies);

    // Registrar presets predefinidos (después de crear subsistemas)
    this._registerBuiltInPresets();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Registro de Mood Presets
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Registra un Mood Preset con validación completa de campos obligatorios.
   *
   * Reglas:
   * - Nombre: string de 1 a 50 caracteres
   * - Config: debe tener TODOS los campos obligatorios
   * - Máximo 20 presets simultáneos
   * - Si el nombre ya existe → sobrescribe con console.warn
   *
   * @param {string} name — Nombre único del preset
   * @param {Object} config — MoodPresetConfig completa
   * @throws {Error} Si el nombre no es válido o la config está incompleta
   */
  registerPreset(name, config) {
    // Validar tipo y longitud del nombre
    if (typeof name !== 'string' || name.length < PRESET_NAME_MIN_LENGTH || name.length > PRESET_NAME_MAX_LENGTH) {
      throw new Error(
        `registerPreset: nombre inválido. Debe ser string de ${PRESET_NAME_MIN_LENGTH} a ${PRESET_NAME_MAX_LENGTH} caracteres. Recibido: '${name}'`
      );
    }

    // Validar campos obligatorios de la config
    const missingFields = this._validatePresetConfig(config);
    if (missingFields.length > 0) {
      throw new Error(
        `registerPreset: campos faltantes: [${missingFields.join(', ')}]`
      );
    }

    // Verificar límite máximo (solo si es un nombre nuevo)
    if (!this._presets.has(name) && this._presets.size >= MAX_PRESETS) {
      throw new Error(
        `registerPreset: máximo de ${MAX_PRESETS} presets alcanzado. Elimine uno antes de registrar otro.`
      );
    }

    // Sobrescribir con advertencia si ya existe
    if (this._presets.has(name)) {
      console.warn(
        `registerPreset: '${name}' ya existe. Sobrescribiendo configuración.`
      );
    }

    // Almacenar copia profunda para evitar mutación externa
    this._presets.set(name, structuredClone(config));
  }

  /**
   * Retorna los nombres de todos los presets registrados.
   * @returns {string[]}
   */
  getPresetNames() {
    return Array.from(this._presets.keys());
  }

  /**
   * Retorna la configuración de un preset por nombre (copia).
   * @param {string} name
   * @returns {Object|null} Config del preset o null si no existe
   */
  getPreset(name) {
    const config = this._presets.get(name);
    return config ? structuredClone(config) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Activación de presets — delega interpolación al TransitionEngine
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Activa un Mood Preset, delegando la interpolación al TransitionEngine.
   * Si el preset no existe, registra warning y no hace nada.
   *
   * Los valores discretos (terrainMode, lightPattern) se aplican inmediatamente.
   * Los valores numéricos (bloom, skybox, camera) se interpolan durante transitionDuration.
   *
   * @param {string} name — Nombre del preset a activar
   * @param {number} [transitionDuration=2.0] — Duración de la transición en segundos
   */
  activatePreset(name, transitionDuration = 2.0) {
    if (!this._presets.has(name)) {
      const available = this.getPresetNames().join(', ');
      console.warn(
        `activatePreset: '${name}' no existe. Disponibles: [${available}]`
      );
      return;
    }

    const presetConfig = this._presets.get(name);
    this._activePreset = name;

    // Construir valores "from" leyendo estado actual de subsistemas
    const fromValues = this._getCurrentConfig();

    // Construir valores "to" a partir del preset destino (aplanados para TransitionEngine)
    const toValues = {
      // Discretos (se aplican inmediatamente)
      terrainMode: presetConfig.terrainMode,
      lightPattern: presetConfig.lightPattern,
      // Bloom
      'bloom.strength': presetConfig.bloom.strength,
      'bloom.radius': presetConfig.bloom.radius,
      'bloom.threshold': presetConfig.bloom.threshold,
      // Skybox
      'skybox.baseLightness': presetConfig.skybox.baseLightness,
      'skybox.saturation': presetConfig.skybox.saturation,
      'skybox.pulseIntensity': presetConfig.skybox.pulseIntensity,
      // Camera
      'camera.velocity': presetConfig.camera.params.velocity ?? fromValues['camera.velocity'],
      'camera.altitude': presetConfig.camera.params.altitude ?? fromValues['camera.altitude'],
      'camera.targetDistance': presetConfig.camera.params.targetDistance ?? fromValues['camera.targetDistance'],
      'camera.fov': presetConfig.camera.params.fov ?? fromValues['camera.fov'],
    };

    // Claves no interpolables → se aplican de inmediato
    const immediateKeys = ['terrainMode', 'lightPattern'];

    // Configurar callback de finalización antes de iniciar transición
    this._transitionEngine.onComplete = () => {
      this._eventBus.emit('transitionEnd', {
        presetName: name,
        timestamp: Date.now(),
      });
    };

    // Iniciar transición en el TransitionEngine
    this._transitionEngine.startTransition({
      from: fromValues,
      to: toValues,
      duration: transitionDuration,
      easing: 'easeInOut',
      immediateKeys,
    });

    // Emitir evento de inicio de transición
    this._eventBus.emit('transitionStart', {
      fromPreset: this._activePreset,
      toPreset: name,
      duration: transitionDuration,
      timestamp: Date.now(),
    });

    // Aplicar valores discretos inmediatamente a los subsistemas
    this._applyDiscreteValues(presetConfig);
  }

  /**
   * Retorna el nombre del preset activo actualmente.
   * @returns {string|null}
   */
  getActivePreset() {
    return this._activePreset;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mapping de fases a presets (tabla phaseIndex → presetName)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Configura la asociación entre un índice de fase y un nombre de preset.
   * Cuando el PhaseManager notifica el cambio a ese índice, se activa el preset.
   *
   * @param {number} phaseIndex — Índice de la fase
   * @param {string} presetName — Nombre del preset a activar para esa fase
   */
  setPhasePresetMapping(phaseIndex, presetName) {
    this._phaseToPreset.set(phaseIndex, presetName);
  }

  /**
   * Retorna la tabla completa de mapeo phaseIndex → presetName.
   * @returns {Map<number, string>}
   */
  getPhasePresetMapping() {
    return new Map(this._phaseToPreset);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Control de Visual Elements (delega al VisualElementRegistry)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Activa o desactiva un Visual Element registrado.
   * @param {string} elementName — Nombre del elemento
   * @param {boolean} active — true para activar, false para desactivar
   */
  setElementActive(elementName, active) {
    this._elementRegistry.setActive(elementName, active);
  }

  /**
   * Consulta si un Visual Element está activo.
   * @param {string} elementName — Nombre del elemento
   * @returns {boolean}
   */
  getElementState(elementName) {
    return this._elementRegistry.isActive(elementName);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Loop de animación (placeholder — implementación completa en 9.x)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Método principal llamado por ExperienceManager en cada frame.
   * Coordina PhaseManager, BeatRouter, TimelineSequencer, TransitionEngine y CameraSystem.
   *
   * @param {Object} state — FrameState del loop de animación
   * @param {number} musicTime — Tiempo actual de la canción en segundos
   */
  update(state, musicTime) {
    // Normalizar musicTime en caso de que no haya música aún
    const time = musicTime || 0;

    // 1. PhaseManager — detectar cambios de fase por timestamps
    try {
      this._phaseManager.update(state, time);
    } catch (err) {
      console.warn('[ExperienceDirector] Error en PhaseManager.update:', err.message);
    }

    // 2. BeatRouter — leer flags de beat y delegar procesamiento
    const beatEvents = this._deps.beatEvents;
    if (beatEvents) {
      if (beatEvents.beatTriggered) {
        this._beatCounts.bass++;
        try {
          this._beatRouter.processBeat('bass');
        } catch (err) {
          console.warn('[ExperienceDirector] Error en BeatRouter.processBeat(bass):', err.message);
        }
      }
      if (beatEvents.midBeatTriggered) {
        this._beatCounts.mid++;
        try {
          this._beatRouter.processBeat('mid');
        } catch (err) {
          console.warn('[ExperienceDirector] Error en BeatRouter.processBeat(mid):', err.message);
        }
      }
      if (beatEvents.highBeatTriggered) {
        this._beatCounts.high++;
        try {
          this._beatRouter.processBeat('high');
        } catch (err) {
          console.warn('[ExperienceDirector] Error en BeatRouter.processBeat(high):', err.message);
        }
      }
    }

    // 3. TimelineSequencer — evaluar eventos programados
    try {
      this._timelineSequencer.update(time, this._beatCounts);
    } catch (err) {
      console.warn('[ExperienceDirector] Error en TimelineSequencer.update:', err.message);
    }

    // 4. TransitionEngine — avanzar interpolaciones activas
    try {
      this._transitionEngine.update(state.deltaTime);
    } catch (err) {
      console.warn('[ExperienceDirector] Error en TransitionEngine.update:', err.message);
    }

    // 5. Aplicar valores interpolados a los subsistemas
    this._applyTransitionValues();

    // 6. CameraSystem — actualizar modo de cámara activo
    try {
      this._cameraSystem.update(state);
    } catch (err) {
      console.warn('[ExperienceDirector] Error en CameraSystem.update:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Limpieza de recursos
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Libera recursos y listeners del director.
   */
  dispose() {
    // Limpiar CameraSystem (listeners de interrupción, etc.)
    try {
      if (this._cameraSystem && this._cameraSystem.dispose) {
        this._cameraSystem.dispose();
      }
    } catch (err) {
      console.warn('[ExperienceDirector] Error en CameraSystem.dispose:', err.message);
    }

    this._presets.clear();
    this._phaseToPreset.clear();
    this._beatCounts = { bass: 0, mid: 0, high: 0 };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Eventos (delega al EventBus)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Suscribe un handler a un evento del director.
   * @param {string} event — Nombre del evento
   * @param {Function} callback — Handler a ejecutar
   * @returns {Function} Función de unsubscribe
   */
  on(event, callback) {
    return this._eventBus.on(event, callback);
  }

  /**
   * Remueve un handler de un evento del director.
   * @param {string} event — Nombre del evento
   * @param {Function} callback — Handler a remover
   */
  off(event, callback) {
    this._eventBus.off(event, callback);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Serialización — exportConfig / importConfig
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Exporta la configuración completa del director como objeto JSON serializable.
   * Incluye presets, timeline, beatBindings y cameraSequences.
   * Retorna copia profunda para evitar mutación externa.
   *
   * @returns {Object} ExportedConfig con version, presets, timeline, beatBindings, cameraSequences
   */
  exportConfig() {
    // Convertir mapa de presets a objeto plano
    const presets = {};
    for (const [name, config] of this._presets) {
      presets[name] = structuredClone(config);
    }

    // Obtener eventos del timeline sin campos internos (_fired, _index)
    const rawEvents = this._timelineSequencer.getEvents();
    const timeline = rawEvents.map((e) => ({
      trigger: { ...e.trigger },
      action: { type: e.action.type, params: { ...e.action.params } },
    }));

    // Obtener bindings por cada tipo de beat
    const beatBindings = {
      bass: this._beatRouter.getBindings('bass'),
      mid: this._beatRouter.getBindings('mid'),
      high: this._beatRouter.getBindings('high'),
    };

    // Camera sequences: vacío por ahora (las secuencias son transitorias en runtime)
    const cameraSequences = {};

    return structuredClone({
      version: 1,
      presets,
      timeline,
      beatBindings,
      cameraSequences,
    });
  }

  /**
   * Importa una configuración completa validando ANTES de aplicar cambios.
   * Si la validación falla, NO modifica el estado actual y retorna errores.
   * Si es válida, reemplaza presets, timeline, beatBindings y activa el primer preset.
   *
   * @param {Object} json — ExportedConfig a importar
   * @returns {{ success: boolean, errors?: string[] }}
   */
  importConfig(json) {
    const errors = this._validateImportConfig(json);

    // Si hay errores de validación, rechazar sin modificar estado
    if (errors.length > 0) {
      return { success: false, errors };
    }

    // --- Validación pasó: aplicar configuración ---

    // 1. Reemplazar presets: limpiar todos y re-registrar desde el JSON
    this._presets.clear();
    for (const [name, config] of Object.entries(json.presets)) {
      this._presets.set(name, structuredClone(config));
    }

    // 2. Cargar timeline en el sequencer
    this._timelineSequencer.loadEvents(json.timeline);

    // 3. Reemplazar beat bindings por tipo
    this._beatRouter.replaceBindings('bass', json.beatBindings.bass);
    this._beatRouter.replaceBindings('mid', json.beatBindings.mid);
    this._beatRouter.replaceBindings('high', json.beatBindings.high);

    // 4. Activar el primer preset encontrado en el objeto de presets
    const presetNames = Object.keys(json.presets);
    if (presetNames.length > 0) {
      this.activatePreset(presetNames[0]);
    }

    return { success: true };
  }

  /**
   * Valida la estructura completa de un ExportedConfig antes de aplicar.
   * Retorna array de mensajes de error (vacío si todo es válido).
   *
   * @param {Object} json — Objeto candidato a importar
   * @returns {string[]} Lista de errores encontrados
   * @private
   */
  _validateImportConfig(json) {
    const errors = [];

    // Validar que sea un objeto
    if (!json || typeof json !== 'object') {
      errors.push('La configuración debe ser un objeto válido');
      return errors;
    }

    // Validar campos obligatorios de primer nivel
    if (json.version === undefined) {
      errors.push('Falta el campo "version"');
    }
    if (!json.presets || typeof json.presets !== 'object' || Array.isArray(json.presets)) {
      errors.push('Falta el campo "presets" o no es un objeto');
    }
    if (!Array.isArray(json.timeline)) {
      errors.push('Falta el campo "timeline" o no es un array');
    }
    if (!json.beatBindings || typeof json.beatBindings !== 'object') {
      errors.push('Falta el campo "beatBindings" o no es un objeto');
    }
    if (!json.cameraSequences || typeof json.cameraSequences !== 'object') {
      errors.push('Falta el campo "cameraSequences" o no es un objeto');
    }

    // Si faltan campos de primer nivel, no seguir validando sub-estructura
    if (errors.length > 0) return errors;

    // Validar que presets tenga al menos 1 entrada
    const presetEntries = Object.entries(json.presets);
    if (presetEntries.length === 0) {
      errors.push('El campo "presets" debe contener al menos 1 preset');
    }

    // Validar estructura de cada preset (campos obligatorios de MoodPresetConfig)
    const VALID_CINEMATIC_MODES = ['orbit', 'dolly', 'crane', 'tracking', 'flyby', 'static', 'shake'];

    for (const [name, config] of presetEntries) {
      const missing = this._validatePresetConfig(config);
      if (missing.length > 0) {
        errors.push(`Preset "${name}": campos faltantes: [${missing.join(', ')}]`);
      }

      // Validar camera.cameraMode si está presente
      if (config.camera && config.camera.cameraMode != null) {
        const cm = config.camera.cameraMode;
        if (cm.mode && !VALID_CINEMATIC_MODES.includes(cm.mode)) {
          errors.push(
            `Preset "${name}": camera.cameraMode.mode inválido: "${cm.mode}". Válidos: ${VALID_CINEMATIC_MODES.join(', ')}`
          );
        }
      }
    }

    // Validar beatBindings: debe tener bass, mid, high como arrays
    if (!Array.isArray(json.beatBindings.bass)) {
      errors.push('beatBindings.bass debe ser un array');
    }
    if (!Array.isArray(json.beatBindings.mid)) {
      errors.push('beatBindings.mid debe ser un array');
    }
    if (!Array.isArray(json.beatBindings.high)) {
      errors.push('beatBindings.high debe ser un array');
    }

    // Si ya hay errores de estructura base, no seguir con validación de referencias
    if (errors.length > 0) return errors;

    // Validar referencias en timeline: presetNames y elementNames deben existir
    const validPresetNames = new Set(Object.keys(json.presets));
    const validElementNames = new Set(this._elementRegistry.getNames());

    for (let i = 0; i < json.timeline.length; i++) {
      const event = json.timeline[i];
      if (!event || !event.action || !event.action.params) continue;

      const { type, params } = event.action;

      if (type === 'activatePreset' && params.presetName) {
        if (!validPresetNames.has(params.presetName)) {
          errors.push(
            `Timeline[${i}]: preset referenciado "${params.presetName}" no existe en la configuración`
          );
        }
      }

      if (type === 'toggleElement' && params.elementName) {
        if (!validElementNames.has(params.elementName)) {
          errors.push(
            `Timeline[${i}]: elemento referenciado "${params.elementName}" no está registrado`
          );
        }
      }
    }

    return errors;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Acceso a subsistemas internos (para integración y testing)
  // ═══════════════════════════════════════════════════════════════════════

  /** @returns {EventBus} */
  getEventBus() { return this._eventBus; }

  /** @returns {TransitionEngine} */
  getTransitionEngine() { return this._transitionEngine; }

  /** @returns {VisualElementRegistry} */
  getElementRegistry() { return this._elementRegistry; }

  /** @returns {PhaseManager} */
  getPhaseManager() { return this._phaseManager; }

  /** @returns {BeatRouter} */
  getBeatRouter() { return this._beatRouter; }

  /** @returns {import('./TimelineSequencer.js').TimelineSequencer} */
  getTimelineSequencer() { return this._timelineSequencer; }

  /** @returns {import('./CameraSystem.js').CameraSystem} */
  getCameraSystem() { return this._cameraSystem; }

  /**
   * Delega la previsualización de una secuencia de cámara al CameraSystem.
   * @param {Object} config — CameraSequenceConfig
   */
  previewSequence(config) {
    this._cameraSystem.previewSequence(config);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Métodos privados
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Registra los adaptadores de Visual Elements en el registry.
   * Cada adaptador envuelve un subsistema existente sin modificarlo.
   *
   * @param {Object} deps — Dependencias inyectadas
   * @private
   */
  _registerAdapters(deps) {
    // Solo registrar adaptadores si las dependencias existen
    if (deps.stars) {
      this._elementRegistry.register('stars', new StarsAdapter(deps.stars));
    }
    if (deps.spheres) {
      this._elementRegistry.register('spheres', new SpheresAdapter(deps.spheres));
    }
    if (deps.skybox) {
      this._elementRegistry.register('skybox', new SkyboxAdapter(deps.skybox));
    }
    if (deps.webcamScreens) {
      this._elementRegistry.register('webcamScreens', new WebcamScreensAdapter(deps.webcamScreens));
    }
    if (deps.pixelText) {
      this._elementRegistry.register('pixelText', new PixelTextAdapter(deps.pixelText));
    }
  }

  /**
   * Callback invocado por PhaseManager cuando detecta cambio de fase.
   * Busca el preset asociado al índice y lo activa con el flujo completo:
   * stop modo previo → activatePreset → activar modo cinematográfico de la fase.
   *
   * @param {number} phaseIndex — Índice de la nueva fase
   * @private
   */
  _onPhaseChange(phaseIndex) {
    const presetName = this._phaseToPreset.get(phaseIndex);

    // Emitir evento de cambio de fase independientemente del mapping
    this._eventBus.emit('phaseChange', {
      phaseIndex,
      presetName: presetName || null,
      timestamp: Date.now(),
    });

    if (!presetName) {
      console.warn(
        `ExperienceDirector: no hay preset mapeado para fase ${phaseIndex}`
      );
      return;
    }

    // Calcular duración de la fase
    const phaseDuration = this._calculatePhaseDuration(phaseIndex);

    // Detener modo cinematográfico previo si hay uno activo
    if (this._cameraSystem.isSequenceActive()) {
      this._cameraSystem.stopSequence();
    }

    // Activar preset (interpola bloom, skybox, camera params)
    this.activatePreset(presetName);

    // Activar modo cinematográfico si el preset lo define
    const presetConfig = this._presets.get(presetName);
    this._activatePhaseCameraMode(presetConfig, phaseDuration);
  }

  /**
   * Valida que un objeto de configuración tenga todos los campos obligatorios.
   * Retorna lista de campos faltantes (vacía si todo está correcto).
   *
   * @param {Object} config — Configuración candidata
   * @returns {string[]} Lista de campos faltantes
   * @private
   */
  _validatePresetConfig(config) {
    const missing = [];

    if (!config || typeof config !== 'object') {
      return [...REQUIRED_PRESET_FIELDS];
    }

    // Validar campos de primer nivel
    for (const field of REQUIRED_PRESET_FIELDS) {
      if (config[field] === undefined || config[field] === null) {
        missing.push(field);
      }
    }

    // Si faltan campos de primer nivel, no tiene sentido validar sub-campos
    if (missing.length > 0) return missing;

    // Validar sub-campos de bloom
    if (typeof config.bloom === 'object' && config.bloom !== null) {
      for (const field of REQUIRED_BLOOM_FIELDS) {
        if (config.bloom[field] === undefined || config.bloom[field] === null) {
          missing.push(`bloom.${field}`);
        }
      }
    } else {
      missing.push('bloom (debe ser objeto)');
    }

    // Validar sub-campos de skybox
    if (typeof config.skybox === 'object' && config.skybox !== null) {
      for (const field of REQUIRED_SKYBOX_FIELDS) {
        if (config.skybox[field] === undefined || config.skybox[field] === null) {
          missing.push(`skybox.${field}`);
        }
      }
    } else {
      missing.push('skybox (debe ser objeto)');
    }

    // Validar sub-campos de camera
    if (typeof config.camera === 'object' && config.camera !== null) {
      for (const field of REQUIRED_CAMERA_FIELDS) {
        if (config.camera[field] === undefined || config.camera[field] === null) {
          missing.push(`camera.${field}`);
        }
      }
    } else {
      missing.push('camera (debe ser objeto)');
    }

    // Validar camera.cameraMode si está presente (campo opcional)
    if (config.camera && config.camera.cameraMode != null) {
      const cm = config.camera.cameraMode;
      if (typeof cm !== 'object') {
        missing.push('camera.cameraMode (debe ser objeto o null)');
      } else if (cm.mode) {
        const VALID_CINEMATIC_MODES = ['orbit', 'dolly', 'crane', 'tracking', 'flyby', 'static', 'shake'];
        if (!VALID_CINEMATIC_MODES.includes(cm.mode)) {
          missing.push(`camera.cameraMode.mode inválido: "${cm.mode}". Válidos: ${VALID_CINEMATIC_MODES.join(', ')}`);
        }
      }
    }

    return missing;
  }

  /**
   * Lee el estado actual de los subsistemas para construir los valores "from"
   * de una transición. Maneja graciosamente subsistemas inexistentes.
   *
   * @returns {Record<string, number|string>} Valores aplanados actuales
   * @private
   */
  _getCurrentConfig() {
    const deps = this._deps;
    const values = {};

    // Bloom — leer desde view.bloomPass si existe
    if (deps.view && deps.view.bloomPass) {
      values['bloom.strength'] = deps.view.bloomPass.strength ?? 1.5;
      values['bloom.radius'] = deps.view.bloomPass.radius ?? 0.4;
      values['bloom.threshold'] = deps.view.bloomPass.threshold ?? 0.4;
    } else {
      // Valores por defecto si bloomPass no está disponible
      values['bloom.strength'] = 1.5;
      values['bloom.radius'] = 0.4;
      values['bloom.threshold'] = 0.4;
    }

    // Skybox — leer desde el SkyboxAdapter registrado en el registry
    const skyboxAdapter = this._getSkyboxAdapter();
    if (skyboxAdapter) {
      values['skybox.baseLightness'] = skyboxAdapter.getBaseLightness();
      values['skybox.saturation'] = skyboxAdapter.getSaturation();
      values['skybox.pulseIntensity'] = skyboxAdapter.getPulseIntensity();
    } else {
      values['skybox.baseLightness'] = 0.04;
      values['skybox.saturation'] = 0.8;
      values['skybox.pulseIntensity'] = 0.12;
    }

    // Camera — leer desde player
    if (deps.player) {
      values['camera.velocity'] = deps.player.velocity ?? 150;
      values['camera.altitude'] = deps.player.altitude ?? 60;
      values['camera.targetDistance'] = deps.player.targetDistance ?? 150;
      values['camera.fov'] = (deps.player.camera && deps.player.camera.fov) ?? 30;
    } else {
      values['camera.velocity'] = 150;
      values['camera.altitude'] = 60;
      values['camera.targetDistance'] = 150;
      values['camera.fov'] = 30;
    }

    return values;
  }

  /**
   * Aplica los valores interpolados del TransitionEngine a los subsistemas.
   * Debe ser llamado desde update() en cada frame mientras hay transición activa.
   *
   * @private
   */
  _applyTransitionValues() {
    if (!this._transitionEngine.isTransitioning()) return;

    const values = this._transitionEngine.getCurrentValues();
    const deps = this._deps;

    // Aplicar bloom
    if (deps.view && deps.view.bloomPass) {
      if (values['bloom.strength'] !== undefined) {
        deps.view.bloomPass.strength = values['bloom.strength'];
      }
      if (values['bloom.radius'] !== undefined) {
        deps.view.bloomPass.radius = values['bloom.radius'];
      }
      if (values['bloom.threshold'] !== undefined) {
        deps.view.bloomPass.threshold = values['bloom.threshold'];
      }
    }

    // Aplicar skybox
    const skyboxAdapter = this._getSkyboxAdapter();
    if (skyboxAdapter) {
      if (values['skybox.baseLightness'] !== undefined) {
        skyboxAdapter.setBaseLightness(values['skybox.baseLightness']);
      }
      if (values['skybox.saturation'] !== undefined) {
        skyboxAdapter.setSaturation(values['skybox.saturation']);
      }
      if (values['skybox.pulseIntensity'] !== undefined) {
        skyboxAdapter.setPulseIntensity(values['skybox.pulseIntensity']);
      }
    }

    // Aplicar camera
    if (deps.player) {
      if (values['camera.velocity'] !== undefined) {
        deps.player.velocity = values['camera.velocity'];
      }
      if (values['camera.altitude'] !== undefined) {
        deps.player.altitude = values['camera.altitude'];
      }
      if (values['camera.targetDistance'] !== undefined) {
        deps.player.targetDistance = values['camera.targetDistance'];
      }
      if (values['camera.fov'] !== undefined && deps.player.camera) {
        deps.player.camera.fov = values['camera.fov'];
        // Actualizar la matriz de proyección tras cambiar FOV
        if (deps.player.camera.updateProjectionMatrix) {
          deps.player.camera.updateProjectionMatrix();
        }
      }
    }
  }

  /**
   * Aplica los valores discretos (no interpolables) del preset a los subsistemas.
   * Se llama inmediatamente al activar un preset.
   *
   * @param {Object} presetConfig — Configuración del preset
   * @private
   */
  _applyDiscreteValues(presetConfig) {
    const deps = this._deps;

    // Aplicar terrainMode via beatEvents.setMode()
    if (deps.beatEvents && deps.beatEvents.setMode) {
      deps.beatEvents.setMode(presetConfig.terrainMode);
    }

    // Aplicar lightPattern via spheres adapter
    const spheresAdapter = this._getSpheresAdapter();
    if (spheresAdapter) {
      spheresAdapter.setPattern(presetConfig.lightPattern);
    }

    // Aplicar beatThresholds si están definidos en el preset (campo opcional)
    if (presetConfig.beatThresholds && deps.beatEvents) {
      if (presetConfig.beatThresholds.bass !== undefined) deps.beatEvents.beatThreshold = presetConfig.beatThresholds.bass;
      if (presetConfig.beatThresholds.mid !== undefined) deps.beatEvents.midBeatThreshold = presetConfig.beatThresholds.mid;
      if (presetConfig.beatThresholds.high !== undefined) deps.beatEvents.highBeatThreshold = presetConfig.beatThresholds.high;
    }

    // Aplicar visibilidad de elementos (si está definido en el preset)
    if (presetConfig.elementVisibility) {
      for (const [name, visible] of Object.entries(presetConfig.elementVisibility)) {
        try {
          this._elementRegistry.setActive(name, visible);
        } catch (_) { /* elemento puede no existir */ }
      }
    }

    // Aplicar textura del terreno
    if (presetConfig.textureMode && deps.beatEvents && deps.beatEvents.setTextureMode) {
      deps.beatEvents.setTextureMode(presetConfig.textureMode);
    }

    // Aplicar parámetros del spectrum
    if (presetConfig.spectrum && deps.terrain && deps.terrain.terrainPlane) {
      const tp = deps.terrain.terrainPlane;
      if (presetConfig.spectrum.attack !== undefined) tp._attackSpeed = presetConfig.spectrum.attack;
      if (presetConfig.spectrum.decay !== undefined) tp._decaySpeed = presetConfig.spectrum.decay;
      if (presetConfig.spectrum.rotation !== undefined) tp._rotationEnabled = presetConfig.spectrum.rotation;
      if (presetConfig.spectrum.bands && Array.isArray(presetConfig.spectrum.bands)) {
        tp._bandGains = [...presetConfig.spectrum.bands];
      }
    }

    // Aplicar patrón de webcam screens
    if (presetConfig.webcamPattern && deps.webcamScreens) {
      deps.webcamScreens.patternMode = presetConfig.webcamPattern;
    }

    // Aplicar parámetros de pantallas LED webcam
    if (presetConfig.webcamLED && deps.webcamScreens) {
      const wc = presetConfig.webcamLED;
      const screens = deps.webcamScreens;
      const wcConfig = screens._config;

      if (wc.screenRadius !== undefined && wcConfig) {
        wcConfig.screenRadius = wc.screenRadius;
        screens._screens.forEach((screen, i) => {
          const angle = (i / wcConfig.screenCount) * Math.PI * 2;
          screen.points.position.x = Math.cos(angle) * wc.screenRadius;
          screen.points.position.z = Math.sin(angle) * wc.screenRadius;
        });
      }
      if (wc.screenWidth !== undefined && wcConfig) wcConfig.screenWidth = wc.screenWidth;
      if (wc.screenHeight !== undefined && wcConfig) wcConfig.screenHeight = wc.screenHeight;
      if (wc.screenAltitude !== undefined && wcConfig) {
        wcConfig.screenAltitude = wc.screenAltitude;
        screens._screens.forEach((screen) => {
          screen.points.position.y = wc.screenAltitude;
          screen.points.lookAt(0, wc.screenAltitude, 0);
        });
      }
      if (wc.gridWidth !== undefined && wcConfig) wcConfig.gridWidth = wc.gridWidth;
      if (wc.gridHeight !== undefined && wcConfig) wcConfig.gridHeight = wc.gridHeight;
      if (wc.dotRadiusRatio !== undefined && wcConfig) wcConfig.dotRadiusRatio = wc.dotRadiusRatio;
      if (wc.frameInterval !== undefined && wcConfig) wcConfig.frameInterval = wc.frameInterval;
      if (wc.vignetteIntensity !== undefined && wcConfig) wcConfig.vignetteIntensity = wc.vignetteIntensity;
      if (wc.cycleDuration !== undefined) screens._cycleDuration = wc.cycleDuration;
      if (wc.assembleDuration !== undefined) screens._assembleDuration = wc.assembleDuration;
      if (wc.pointSize !== undefined) {
        screens._screens.forEach(s => { s.material.uniforms.uPointSize.value = wc.pointSize; });
      }
    }

    // Aplicar configuración de Text Mode (renderer + parámetros de particles)
    if (presetConfig.textMode && deps.pixelText) {
      const tm = presetConfig.textMode;
      if (tm.renderer && typeof deps.pixelText.setMode === 'function') {
        deps.pixelText.setMode(tm.renderer);
      }
      if (tm.particles && deps.pixelText._renderers && deps.pixelText._renderers.particles) {
        const pr = deps.pixelText._renderers.particles;
        if (tm.particles.particleCount !== undefined) pr.particleCount = tm.particles.particleCount;
        if (tm.particles.spreadRadius !== undefined) pr.spreadRadius = tm.particles.spreadRadius;
        if (tm.particles.assembleDuration !== undefined) pr.assembleDuration = tm.particles.assembleDuration;
        if (tm.particles.planeScale !== undefined) pr.planeScale = tm.particles.planeScale;
        if (tm.particles.pointSize !== undefined) pr.pointSize = tm.particles.pointSize;
        if (tm.particles.turbulenceAmount !== undefined) pr.turbulenceAmount = tm.particles.turbulenceAmount;
      }
    }
  }

  /**
   * Calcula la duración de una fase basándose en los triggers del PhaseManager.
   * Obtiene los triggers via getTriggers() y calcula la diferencia de tiempo
   * entre el trigger actual y el siguiente. Si es la última fase, retorna 60s.
   *
   * @param {number} phaseIndex — Índice de la fase actual
   * @returns {number} — Duración en segundos
   * @private
   */
  _calculatePhaseDuration(phaseIndex) {
    const triggers = this._phaseManager.getTriggers();
    const currentIdx = triggers.findIndex(t => t.phaseIndex === phaseIndex);

    // Si no se encuentra el trigger, usar duración por defecto
    if (currentIdx < 0) return 60;

    const nextTrigger = triggers[currentIdx + 1];
    // Última fase: no hay siguiente trigger, usar 60s por defecto
    if (!nextTrigger) return 60;

    return nextTrigger.time - triggers[currentIdx].time;
  }

  /**
   * Activa el modo de cámara cinematográfico definido en un preset.
   * Llamado desde _onPhaseChange después de activatePreset.
   *
   * Si el preset no tiene cameraMode o es 'first-person', se detiene
   * cualquier secuencia activa para volver a primera persona.
   * Si tiene un modo cinematográfico válido, se activa con la duración de la fase.
   *
   * @param {Object} presetConfig — Configuración del preset activo
   * @param {number} phaseDuration — Duración calculada de la fase en segundos
   * @private
   */
  _activatePhaseCameraMode(presetConfig, phaseDuration) {
    const cameraModeConfig = presetConfig.camera?.cameraMode;

    // Si no hay cameraMode definido o es first-person, volver a first-person
    if (!cameraModeConfig || cameraModeConfig.mode === 'first-person') {
      if (this._cameraSystem.isSequenceActive()) {
        this._cameraSystem.stopSequence();
      }
      return;
    }

    // Activar el modo cinematográfico — duración infinita para que solo se detenga
    // al cambiar de fase (stopSequence en _onPhaseChange), no por timeout
    this._cameraSystem.activateMode(
      cameraModeConfig.mode,
      cameraModeConfig.params || {},
      Infinity
    );
  }

  /**
   * Obtiene el SkyboxAdapter del registry (utilidad interna).
   * @returns {import('./adapters/SkyboxAdapter.js').SkyboxAdapter|null}
   * @private
   */
  _getSkyboxAdapter() {
    try {
      const entry = this._elementRegistry.getAll().get('skybox');
      return entry ? entry.adapter : null;
    } catch {
      return null;
    }
  }

  /**
   * Obtiene el SpheresAdapter del registry (utilidad interna).
   * @returns {import('./adapters/SpheresAdapter.js').SpheresAdapter|null}
   * @private
   */
  _getSpheresAdapter() {
    try {
      const entry = this._elementRegistry.getAll().get('spheres');
      return entry ? entry.adapter : null;
    } catch {
      return null;
    }
  }

  /**
   * Registra los presets predefinidos (built-in) en el mapa de presets.
   * Se invoca en el constructor después de crear los subsistemas.
   *
   * @private
   */
  _registerBuiltInPresets() {
    for (const [name, config] of Object.entries(BUILT_IN_PRESETS)) {
      this._presets.set(name, structuredClone(config));
    }
  }
}
