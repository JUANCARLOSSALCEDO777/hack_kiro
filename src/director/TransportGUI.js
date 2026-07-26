/**
 * TransportGUI — Panel de transporte de audio para coordinar la experiencia.
 *
 * Posicionado en la parte izquierda de la pantalla (separado del panel debug de la derecha).
 * Muestra el timelapse actual de la canción y permite configurar un loop
 * entre dos puntos temporales para repetir secciones durante el desarrollo.
 *
 * Se activa/desactiva con el DebugModeManager (tecla 'D').
 */

import GUI from 'lil-gui';

/**
 * Formatea segundos a string MM:SS.ms
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
}

export class TransportGUI {

  /**
   * @param {HTMLElement} container — Elemento DOM donde se monta el panel
   * @param {import('../events/MusicPlayer.js').MusicPlayer} music — Instancia del MusicPlayer
   * @param {import('./ExperienceDirector.js').ExperienceDirector} director — Director para recalcular fase en seek
   */
  constructor(container, music, director, baseConfig = null) {
    this._music = music;
    this._director = director;
    this._container = container;
    this._baseConfig = baseConfig;

    // Estado del loop
    this._loopEnabled = false;
    this._loopStart = 0;
    this._loopEnd = 60;

    // Estado reactivo para lil-gui
    this._state = {
      currentTime: '00:00.0',
      currentSeconds: 0,
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 60,
      seekTo: 0,
    };

    // Referencia al GUI y controllers
    this._gui = null;
    this._rafId = null;
    this._controllers = {};
    this._segmentsRendered = false;
    this._lastKnownDuration = 0;

    this._build();
    this._startUpdateLoop();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API pública — Compatible con DebugModeManager.registerPanel()
  // ═══════════════════════════════════════════════════════════════════════

  show() {
    if (this._gui) {
      this._gui.domElement.style.display = '';
    }
  }

  hide() {
    if (this._gui) {
      this._gui.domElement.style.display = 'none';
    }
  }

  dispose() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._gui) {
      this._gui.destroy();
      this._gui = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Construcción del panel
  // ═══════════════════════════════════════════════════════════════════════

  _build() {
    // Crear instancia de lil-gui posicionada a la izquierda
    this._gui = new GUI({ container: this._container, title: '🎵 Transport' });
    this._gui.domElement.style.position = 'absolute';
    this._gui.domElement.style.top = '16px';
    this._gui.domElement.style.left = '16px';
    this._gui.domElement.style.right = 'auto';
    this._gui.domElement.style.pointerEvents = 'auto';
    this._gui.domElement.style.width = '240px';

    // ─── Indicador de tiempo actual (solo lectura visual) ────────────────
    this._controllers.timeDisplay = this._gui
      .add(this._state, 'currentTime')
      .name('Tiempo')
      .disable();

    // ─── Botón Play/Pause ────────────────────────────────────────────────
    this._gui.add({ togglePlay: () => {
      const audio = this._music.audio;
      if (audio.paused || audio.ended) {
        this._music.play();
      } else {
        audio.pause();
      }
    }}, 'togglePlay').name('⏯ Play / Pause');

    // ─── Slider de seek (para saltar a un punto) ─────────────────────────
    this._controllers.seek = this._gui
      .add(this._state, 'seekTo', 0, 300, 0.1)
      .name('Seek (s)')
      .onChange((value) => {
        this._seekTo(value);
      });

    // ─── Controles de loop ───────────────────────────────────────────────
    const loopFolder = this._gui.addFolder('Loop');

    this._controllers.loopEnabled = loopFolder
      .add(this._state, 'loopEnabled')
      .name('Activar Loop')
      .onChange((enabled) => {
        this._loopEnabled = enabled;
      });

    this._controllers.loopStart = loopFolder
      .add(this._state, 'loopStart', 0, 300, 0.5)
      .name('Desde (s)')
      .onChange((value) => {
        this._loopStart = value;
        // Asegurar que loopEnd sea mayor que loopStart
        if (this._loopEnd <= this._loopStart) {
          this._loopEnd = this._loopStart + 5;
          this._state.loopEnd = this._loopEnd;
          this._controllers.loopEnd.updateDisplay();
        }
      });

    this._controllers.loopEnd = loopFolder
      .add(this._state, 'loopEnd', 0, 300, 0.5)
      .name('Hasta (s)')
      .onChange((value) => {
        this._loopEnd = value;
        // Asegurar que loopEnd sea mayor que loopStart
        if (this._loopEnd <= this._loopStart) {
          this._loopStart = Math.max(0, this._loopEnd - 5);
          this._state.loopStart = this._loopStart;
          this._controllers.loopStart.updateDisplay();
        }
      });

    // ─── Botón para marcar inicio/fin del loop desde la posición actual ──
    loopFolder.add({ markStart: () => {
      const t = this._music.audio.currentTime;
      this._loopStart = t;
      this._state.loopStart = t;
      this._controllers.loopStart.updateDisplay();
    }}, 'markStart').name('⏺ Marcar inicio');

    loopFolder.add({ markEnd: () => {
      const t = this._music.audio.currentTime;
      this._loopEnd = t;
      this._state.loopEnd = t;
      this._controllers.loopEnd.updateDisplay();
    }}, 'markEnd').name('⏺ Marcar fin');

    // ─── Selector de fase para editar ─────────────────────────────────────
    const editFolder = this._gui.addFolder('✏️ Editar Fase');
    // Hacer scrollable para soportar muchas fases
    editFolder.domElement.style.maxHeight = '200px';
    editFolder.domElement.style.overflowY = 'auto';
    this._phaseLoopState = { selectedPhase: '—' };
    this._selectedPhaseIndex = null;
    this._phaseLoopCtrl = editFolder
      .add(this._phaseLoopState, 'selectedPhase', ['—'])
      .name('Fase')
      .onChange((value) => {
        if (value === '—') {
          // Desactivar loop
          this._loopEnabled = false;
          this._state.loopEnabled = false;
          this._controllers.loopEnabled.updateDisplay();
          this._selectedPhaseIndex = null;
          return;
        }
        // Buscar los tiempos de la fase seleccionada
        const pm = this._director.getPhaseManager();
        const triggers = pm.getTriggers();
        const duration = this._music.audio.duration || 300;
        const idx = parseInt(value);
        const trigger = triggers.find(t => t.phaseIndex === idx);
        if (!trigger) return;

        // Calcular inicio y fin (fin = siguiente trigger o fin de canción)
        const triggerIdx = triggers.indexOf(trigger);
        const nextTime = (triggerIdx + 1 < triggers.length) ? triggers[triggerIdx + 1].time : duration;

        // Configurar loop con los bordes de la fase
        this._loopStart = trigger.time;
        this._loopEnd = nextTime;
        this._loopEnabled = true;
        this._state.loopStart = trigger.time;
        this._state.loopEnd = nextTime;
        this._state.loopEnabled = true;
        this._selectedPhaseIndex = idx;
        this._controllers.loopStart.updateDisplay();
        this._controllers.loopEnd.updateDisplay();
        this._controllers.loopEnabled.updateDisplay();

        // Hacer seek al inicio de la fase
        this._seekTo(trigger.time);
      });

    // Botón para sobrescribir la fase seleccionada con la config actual
    editFolder.add({ updatePhase: () => {
      this._updateSelectedPhase();
    }}, 'updatePhase').name('💾 Guardar cambios');

    editFolder.add({ deletePhase: () => {
      this._deleteSelectedPhase();
    }}, 'deletePhase').name('🗑 Eliminar fase');

    // ─── Botón para capturar una fase completa ───────────────────────────
    this._gui.add({ capturePhase: () => {
      this._captureCurrentPhase();
    }}, 'capturePhase').name('📸 Guardar Fase');

    // ─── Botón para volver a punto neutro ────────────────────────────────
    this._gui.add({ resetToDefault: () => {
      // Detener modo cinematográfico si hay uno activo
      const camSystem = this._director.getCameraSystem();
      if (camSystem.isSequenceActive()) {
        camSystem.stopSequence();
      }
      this._director.activatePreset('default', 0.5);
    }}, 'resetToDefault').name('🔄 Reset a Default');

    // ─── Persistencia — guardar/cargar configuración ─────────────────────
    const persistFolder = this._gui.addFolder('💾 Persistencia');
    persistFolder.add({ save: () => { this._saveToLocalStorage(); }}, 'save').name('📥 Guardar en navegador');
    persistFolder.add({ load: () => { this._loadFromLocalStorage(); }}, 'load').name('📤 Cargar guardado');
    persistFolder.add({ exportClip: () => { this._exportToClipboard(); }}, 'exportClip').name('📋 Copiar config (JSON)');
    persistFolder.add({ clear: () => {
      localStorage.removeItem('hack_kiro_phases');
      console.log('[TransportGUI] Configuración borrada del localStorage');
    }}, 'clear').name('🗑 Borrar guardado');

    // ─── Barra visual de fases (timeline gráfico) ────────────────────────
    this._buildPhaseTimeline();

    // Intentar cargar configuración guardada al iniciar
    this._loadFromLocalStorage();

    // Ocultar por defecto (se muestra con 'D')
    this._gui.domElement.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Timeline gráfico de fases
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Construye una barra HTML visual debajo del panel lil-gui que muestra
   * las fases distribuidas a lo largo de la canción con colores, nombres
   * de preset, y un indicador de posición actual.
   */
  _buildPhaseTimeline() {
    // Contenedor principal del timeline
    this._timelineEl = document.createElement('div');
    this._timelineEl.style.cssText = `
      position: relative;
      width: 220px;
      margin: 8px 10px;
      background: #1a1a2e;
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      user-select: none;
    `;

    // Barra de fases (contenedor de segmentos)
    this._phasesBar = document.createElement('div');
    this._phasesBar.style.cssText = `
      position: relative;
      width: 100%;
      height: 28px;
      display: flex;
    `;
    this._timelineEl.appendChild(this._phasesBar);

    // Indicador de posición actual (línea vertical roja)
    this._playhead = document.createElement('div');
    this._playhead.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 2px;
      height: 100%;
      background: #ff3333;
      pointer-events: none;
      z-index: 10;
      transition: left 0.05s linear;
    `;
    this._timelineEl.appendChild(this._playhead);

    // Etiqueta de fase activa
    this._phaseLabel = document.createElement('div');
    this._phaseLabel.style.cssText = `
      width: 100%;
      text-align: center;
      font-size: 10px;
      font-family: monospace;
      color: #ccc;
      padding: 3px 0;
      background: #111;
    `;
    this._phaseLabel.textContent = '—';
    this._timelineEl.appendChild(this._phaseLabel);

    // Click en la barra para hacer seek
    this._timelineEl.addEventListener('click', (e) => {
      const rect = this._phasesBar.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = x / rect.width;
      const duration = this._music.audio.duration || 300;
      this._seekTo(progress * duration);
    });

    // Insertar después del lil-gui DOM
    this._gui.domElement.appendChild(this._timelineEl);
  }

  /**
   * Renderiza los segmentos de fase en la barra visual.
   * Cada fase ocupa un bloque proporcional a su duración con color y nombre.
   */
  _renderPhaseSegments() {
    if (!this._director || !this._phasesBar) return;

    const pm = this._director.getPhaseManager();
    const triggers = pm.getTriggers();
    const mapping = this._director.getPhasePresetMapping();
    const duration = this._music.audio.duration || 300;

    // Limpiar segmentos anteriores
    this._phasesBar.innerHTML = '';

    if (triggers.length === 0) {
      this._phasesBar.innerHTML = '<span style="color:#666;font-size:9px;padding:6px">Sin fases configuradas</span>';
      return;
    }

    // Colores para las fases (ciclo)
    const colors = ['#e91e63', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#00bcd4', '#ff5722', '#795548'];

    // Espacio vacío antes del primer trigger (si no empieza en 0)
    const firstTriggerTime = triggers[0].time;
    if (firstTriggerTime > 0) {
      const emptyWidth = (firstTriggerTime / duration) * 100;
      const emptySegment = document.createElement('div');
      emptySegment.style.cssText = `
        width: ${emptyWidth}%;
        height: 100%;
        background: transparent;
      `;
      this._phasesBar.appendChild(emptySegment);
    }

    for (let i = 0; i < triggers.length; i++) {
      const trigger = triggers[i];
      const nextTime = (i + 1 < triggers.length) ? triggers[i + 1].time : duration;
      const width = ((nextTime - trigger.time) / duration) * 100;
      const presetName = mapping.get(trigger.phaseIndex) || `F${trigger.phaseIndex}`;
      const color = colors[i % colors.length];

      const segment = document.createElement('div');
      segment.style.cssText = `
        width: ${width}%;
        height: 100%;
        background: ${color}44;
        border-right: 1px solid ${color};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8px;
        font-family: monospace;
        color: ${color};
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding: 0 2px;
      `;
      segment.textContent = presetName;
      segment.title = `${presetName} (${formatTime(trigger.time)} → ${formatTime(nextTime)})`;
      this._phasesBar.appendChild(segment);
    }

    this._segmentsRendered = true;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Captura de fase — guarda el estado actual como nueva fase
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Captura todos los valores actuales de la experiencia y los registra
   * como una nueva fase con un preset, usando los valores de loop como
   * tiempo de inicio y fin de la fase.
   *
   * Flujo:
   * 1. Lee la configuración actual (bloom, skybox, terreno, luces, cámara)
   * 2. Genera un nombre de preset basado en el índice de fase
   * 3. Registra el preset en el director
   * 4. Agrega un trigger en el PhaseManager con loopStart como tiempo
   * 5. Mapea el índice de fase al preset
   * 6. Re-renderiza la barra visual de fases
   */
  _captureCurrentPhase() {
    if (!this._director) return;

    const deps = this._director._deps;
    const pm = this._director.getPhaseManager();
    const triggers = pm.getTriggers();

    // Determinar índice de la nueva fase
    const newPhaseIndex = triggers.length;

    // Usar el tiempo actual de la canción como trigger de inicio
    const startTime = this._music.audio.currentTime;
    const presetName = `fase_${newPhaseIndex}_${Math.floor(startTime)}s`;

    // Leer la configuración ACTUAL de los subsistemas
    const currentConfig = {
      // Terreno: modo activo en BeatEvents
      terrainMode: deps.beatEvents ? (deps.beatEvents.restoreMode || 'spectrum') : 'spectrum',

      // Patrón de esferas: leer del adaptador o subsistema directo
      lightPattern: deps.spheres ? (deps.spheres.pattern || 'radialPulse') : 'radialPulse',

      // Bloom: leer de view.bloomPass
      bloom: {
        strength: (deps.view && deps.view.bloomPass) ? deps.view.bloomPass.strength : 1.5,
        radius: (deps.view && deps.view.bloomPass) ? deps.view.bloomPass.radius : 0.4,
        threshold: (deps.view && deps.view.bloomPass) ? deps.view.bloomPass.threshold : 0.4,
      },

      // Skybox: leer del adaptador
      skybox: (() => {
        const adapter = this._director._getSkyboxAdapter();
        if (adapter) {
          return {
            hueRange: adapter.getHueRange(),
            saturation: adapter.getSaturation(),
            baseLightness: adapter.getBaseLightness(),
            pulseIntensity: adapter.getPulseIntensity(),
          };
        }
        return { hueRange: [0.6, 0.95], saturation: 0.8, baseLightness: 0.04, pulseIntensity: 0.12 };
      })(),

      // Cámara: leer del player + modo cinematográfico activo del CameraSystem
      camera: (() => {
        const camSystem = this._director.getCameraSystem();
        const currentMode = camSystem.getCurrentMode();
        const isFirstPerson = currentMode === 'first-person';

        return {
          mode: 'first-person',
          params: {
            velocity: deps.player ? deps.player.velocity : 150,
            altitude: deps.player ? deps.player.altitude : 60,
            targetDistance: deps.player ? deps.player.targetDistance : 150,
            fov: (deps.player && deps.player.camera) ? deps.player.camera.fov : 30,
          },
          // Si hay un modo cinematográfico activo, capturar su config; si no, null
          cameraMode: isFirstPerson ? null : {
            mode: currentMode,
            params: camSystem.getCurrentParams(),
          },
        };
      })(),

      // Beat thresholds: capturar sensibilidades actuales
      beatThresholds: {
        bass: deps.beatEvents ? deps.beatEvents.beatThreshold : 150,
        mid: deps.beatEvents ? deps.beatEvents.midBeatThreshold : 100,
        high: deps.beatEvents ? deps.beatEvents.highBeatThreshold : 80,
      },

      // Visibilidad de elementos
      elementVisibility: {
        stars: this._director.getElementState('stars'),
        spheres: this._director.getElementState('spheres'),
        webcamScreens: this._director.getElementState('webcamScreens'),
        pixelText: this._director.getElementState('pixelText'),
        skybox: this._director.getElementState('skybox'),
      },

      // Textura del terreno (wireframe/solid)
      textureMode: deps.beatEvents ? deps.beatEvents.terrainTextureMode : 'wireframe',

      // Parámetros del spectrum
      spectrum: {
        attack: (deps.terrain && deps.terrain.terrainPlane) ? deps.terrain.terrainPlane._attackSpeed : 0.68,
        decay: (deps.terrain && deps.terrain.terrainPlane) ? deps.terrain.terrainPlane._decaySpeed : 0.01,
        rotation: (deps.terrain && deps.terrain.terrainPlane) ? (deps.terrain.terrainPlane._rotationEnabled !== false) : true,
        bands: (deps.terrain && deps.terrain.terrainPlane && deps.terrain.terrainPlane._bandGains)
          ? [...deps.terrain.terrainPlane._bandGains]
          : [0.22, 0.23, 0.63, 0.09, 0.63, 0.09, 0.59, 0.56],
      },

      // Patrón de webcam screens
      webcamPattern: (deps.webcamScreens && deps.webcamScreens.patternMode) ? deps.webcamScreens.patternMode : 'rings',

      // Parámetros de pantallas LED webcam
      webcamLED: (() => {
        const screens = deps.webcamScreens;
        if (!screens) return {};
        const wcConfig = screens._config || {};
        return {
          screenRadius: wcConfig.screenRadius || 1000,
          screenWidth: wcConfig.screenWidth || 300,
          screenHeight: wcConfig.screenHeight || 170,
          screenAltitude: wcConfig.screenAltitude || 140.9,
          gridWidth: wcConfig.gridWidth || 64,
          gridHeight: wcConfig.gridHeight || 36,
          dotRadiusRatio: wcConfig.dotRadiusRatio || 0.7417,
          frameInterval: wcConfig.frameInterval || 1017.5,
          vignetteIntensity: wcConfig.vignetteIntensity || 0.3,
          cycleDuration: screens._cycleDuration || 8,
          assembleDuration: screens._assembleDuration || 2,
          pointSize: (screens._screens && screens._screens[0]) ? screens._screens[0].material.uniforms.uPointSize.value : 41,
        };
      })(),

      // Text Mode: renderer activo + config de particles
      textMode: (() => {
        const pt = deps.pixelText;
        if (!pt) return { renderer: 'particles', particles: {} };
        const pr = pt._renderers.particles;
        return {
          renderer: pt.mode || 'particles',
          particles: pr ? {
            particleCount: pr.particleCount,
            spreadRadius: pr.spreadRadius,
            assembleDuration: pr.assembleDuration,
            planeScale: pr.planeScale,
            pointSize: pr.pointSize,
            turbulenceAmount: pr.turbulenceAmount,
          } : {},
        };
      })(),
    };

    // Registrar el preset con la config capturada
    try {
      this._director.registerPreset(presetName, currentConfig);
    } catch (err) {
      console.warn('[TransportGUI] Error registrando preset capturado:', err.message);
      return;
    }

    // Agregar trigger en el PhaseManager (usando loopStart como tiempo de inicio)
    const added = pm.addTrigger(startTime, newPhaseIndex);
    if (!added) {
      console.warn(`[TransportGUI] No se pudo agregar trigger en t=${startTime}s`);
      return;
    }

    // Mapear el índice de fase al preset recién creado
    this._director.setPhasePresetMapping(newPhaseIndex, presetName);

    // Re-renderizar la barra visual
    this._segmentsRendered = false;

    // Actualizar dropdown de fases para loop
    this._refreshPhaseLoopOptions();

    // Feedback visual
    console.log(
      `[TransportGUI] 📸 Fase ${newPhaseIndex} capturada: "${presetName}" ` +
      `(inicio: ${formatTime(startTime)})\n`,
      currentConfig
    );

    // Auto-guardar en localStorage
    this._saveToLocalStorage();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Persistencia — localStorage
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Guarda toda la configuración de fases en localStorage.
   */
  _saveToLocalStorage() {
    if (!this._director) return;

    try {
      const config = this._director.exportConfig();

      // Agregar mapping de fases a presets
      const mapping = this._director.getPhasePresetMapping();
      config.phaseMapping = Object.fromEntries(mapping);

      localStorage.setItem('hack_kiro_phases', JSON.stringify(config));
      console.log('[TransportGUI] 📥 Configuración guardada en localStorage', config);
    } catch (err) {
      console.warn('[TransportGUI] Error guardando en localStorage:', err.message);
    }
  }

  /**
   * Copia la configuración completa al clipboard como JSON.
   * Para pegar en src/director/experience-config.json y hacer permanente.
   */
  _exportToClipboard() {
    if (!this._director) return;

    try {
      const config = this._director.exportConfig();
      const mapping = this._director.getPhasePresetMapping();
      config.phaseMapping = Object.fromEntries(mapping);

      const json = JSON.stringify(config, null, 2);
      navigator.clipboard.writeText(json).then(() => {
        console.log('[TransportGUI] 📋 Config copiada al clipboard — pégala en src/director/experience-config.json');
      });
    } catch (err) {
      console.warn('[TransportGUI] Error exportando:', err.message);
    }
  }

  /**
   * Carga la configuración de fases.
   * Prioridad: localStorage > archivo estático (experience-config.json)
   */
  _loadFromLocalStorage() {
    if (!this._director) return;

    try {
      // Prioridad 1: localStorage
      let raw = localStorage.getItem('hack_kiro_phases');

      // Prioridad 2: config base del proyecto (importada estáticamente)
      if (!raw && this._baseConfig) {
        this._applyConfig(this._baseConfig);
        return;
      }

      if (!raw) return;

      const config = JSON.parse(raw);
      this._applyConfig(config);
    } catch (err) {
      console.warn('[TransportGUI] Error cargando configuración:', err.message);
    }
  }

  /**
   * Aplica una configuración completa al director (desde cualquier fuente).
   */
  _applyConfig(config) {
    const result = this._director.importConfig(config);

    if (!result.success) {
      console.warn('[TransportGUI] Error importando config:', result.errors);
      return;
    }

    // Restaurar mapping de fases y triggers del PhaseManager
    if (config.phaseMapping) {
      const pm = this._director.getPhaseManager();
      for (const [phaseIndex, presetName] of Object.entries(config.phaseMapping)) {
        this._director.setPhasePresetMapping(Number(phaseIndex), presetName);
        // Extraer tiempo del nombre del preset (formato: fase_N_Xs)
        const match = presetName.match(/_(\d+)s$/);
        if (match) {
          pm.addTrigger(Number(match[1]), Number(phaseIndex));
        }
      }
    }

    // Re-renderizar timeline y dropdown
    this._segmentsRendered = false;
    this._refreshPhaseLoopOptions();

    // Forzar recálculo de fase para la posición actual del audio
    // (necesario para activar la fase t=0 al cargar)
    const pm = this._director.getPhaseManager();
    const currentTime = this._music?.audio?.currentTime || 0;
    pm.recalculatePhase(currentTime);

    console.log('[TransportGUI] ✅ Configuración aplicada');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Actualización del dropdown de fases para loop
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Sobrescribe el preset de la fase seleccionada con la configuración actual.
   * Reutiliza la lógica de captura pero actualiza el preset existente en vez de crear uno nuevo.
   */
  _updateSelectedPhase() {
    if (this._selectedPhaseIndex === null) {
      console.warn('[TransportGUI] No hay fase seleccionada para modificar');
      return;
    }

    const mapping = this._director.getPhasePresetMapping();
    const presetName = mapping.get(this._selectedPhaseIndex);
    if (!presetName) {
      console.warn(`[TransportGUI] No se encontró preset para fase ${this._selectedPhaseIndex}`);
      return;
    }

    const deps = this._director._deps;

    // Capturar configuración actual (misma lógica que _captureCurrentPhase)
    const currentConfig = {
      terrainMode: deps.beatEvents ? (deps.beatEvents.restoreMode || 'spectrum') : 'spectrum',
      lightPattern: deps.spheres ? (deps.spheres.pattern || 'radialPulse') : 'radialPulse',
      bloom: {
        strength: (deps.view && deps.view.bloomPass) ? deps.view.bloomPass.strength : 1.5,
        radius: (deps.view && deps.view.bloomPass) ? deps.view.bloomPass.radius : 0.4,
        threshold: (deps.view && deps.view.bloomPass) ? deps.view.bloomPass.threshold : 0.4,
      },
      skybox: (() => {
        const adapter = this._director._getSkyboxAdapter();
        if (adapter) {
          return {
            hueRange: adapter.getHueRange(),
            saturation: adapter.getSaturation(),
            baseLightness: adapter.getBaseLightness(),
            pulseIntensity: adapter.getPulseIntensity(),
          };
        }
        return { hueRange: [0.6, 0.95], saturation: 0.8, baseLightness: 0.04, pulseIntensity: 0.12 };
      })(),
      camera: (() => {
        const camSystem = this._director.getCameraSystem();
        const currentMode = camSystem.getCurrentMode();
        const isFirstPerson = currentMode === 'first-person';
        return {
          mode: 'first-person',
          params: {
            velocity: deps.player ? deps.player.velocity : 150,
            altitude: deps.player ? deps.player.altitude : 60,
            targetDistance: deps.player ? deps.player.targetDistance : 150,
            fov: (deps.player && deps.player.camera) ? deps.player.camera.fov : 30,
          },
          cameraMode: isFirstPerson ? null : {
            mode: currentMode,
            params: camSystem.getCurrentParams(),
          },
        };
      })(),
      beatThresholds: {
        bass: deps.beatEvents ? deps.beatEvents.beatThreshold : 150,
        mid: deps.beatEvents ? deps.beatEvents.midBeatThreshold : 100,
        high: deps.beatEvents ? deps.beatEvents.highBeatThreshold : 80,
      },
      elementVisibility: {
        stars: this._director.getElementState('stars'),
        spheres: this._director.getElementState('spheres'),
        webcamScreens: this._director.getElementState('webcamScreens'),
        pixelText: this._director.getElementState('pixelText'),
        skybox: this._director.getElementState('skybox'),
      },
      textureMode: deps.beatEvents ? deps.beatEvents.terrainTextureMode : 'wireframe',
      spectrum: {
        attack: (deps.terrain && deps.terrain.terrainPlane) ? deps.terrain.terrainPlane._attackSpeed : 0.68,
        decay: (deps.terrain && deps.terrain.terrainPlane) ? deps.terrain.terrainPlane._decaySpeed : 0.01,
        rotation: (deps.terrain && deps.terrain.terrainPlane) ? (deps.terrain.terrainPlane._rotationEnabled !== false) : true,
        bands: (deps.terrain && deps.terrain.terrainPlane && deps.terrain.terrainPlane._bandGains)
          ? [...deps.terrain.terrainPlane._bandGains]
          : [0.22, 0.23, 0.63, 0.09, 0.63, 0.09, 0.59, 0.56],
      },
      webcamPattern: (deps.webcamScreens && deps.webcamScreens.patternMode) ? deps.webcamScreens.patternMode : 'rings',

      // Parámetros de pantallas LED webcam
      webcamLED: (() => {
        const screens = deps.webcamScreens;
        if (!screens) return {};
        const wcConfig = screens._config || {};
        return {
          screenRadius: wcConfig.screenRadius || 1000,
          screenWidth: wcConfig.screenWidth || 300,
          screenHeight: wcConfig.screenHeight || 170,
          screenAltitude: wcConfig.screenAltitude || 140.9,
          gridWidth: wcConfig.gridWidth || 64,
          gridHeight: wcConfig.gridHeight || 36,
          dotRadiusRatio: wcConfig.dotRadiusRatio || 0.7417,
          frameInterval: wcConfig.frameInterval || 1017.5,
          vignetteIntensity: wcConfig.vignetteIntensity || 0.3,
          cycleDuration: screens._cycleDuration || 8,
          assembleDuration: screens._assembleDuration || 2,
          pointSize: (screens._screens && screens._screens[0]) ? screens._screens[0].material.uniforms.uPointSize.value : 41,
        };
      })(),

      // Text Mode: renderer activo + config de particles
      textMode: (() => {
        const pt = deps.pixelText;
        if (!pt) return { renderer: 'particles', particles: {} };
        const pr = pt._renderers.particles;
        return {
          renderer: pt.mode || 'particles',
          particles: pr ? {
            particleCount: pr.particleCount,
            spreadRadius: pr.spreadRadius,
            assembleDuration: pr.assembleDuration,
            planeScale: pr.planeScale,
            pointSize: pr.pointSize,
            turbulenceAmount: pr.turbulenceAmount,
          } : {},
        };
      })(),
    };

    // Sobrescribir el preset existente
    try {
      this._director.registerPreset(presetName, currentConfig);
    } catch (err) {
      console.warn('[TransportGUI] Error actualizando preset:', err.message);
      return;
    }

    console.log(`[TransportGUI] 💾 Fase ${this._selectedPhaseIndex} actualizada: "${presetName}"`, currentConfig);

    // Auto-guardar en localStorage
    this._saveToLocalStorage();
  }

  /**
   * Elimina la fase seleccionada: remueve trigger, preset y mapping.
   */
  _deleteSelectedPhase() {
    if (this._selectedPhaseIndex === null) {
      console.warn('[TransportGUI] No hay fase seleccionada para eliminar');
      return;
    }

    const pm = this._director.getPhaseManager();
    const mapping = this._director.getPhasePresetMapping();
    const presetName = mapping.get(this._selectedPhaseIndex);

    // Encontrar el trigger correspondiente para obtener su tiempo
    const triggers = pm.getTriggers();
    const trigger = triggers.find(t => t.phaseIndex === this._selectedPhaseIndex);

    if (trigger) {
      pm.removeTrigger(trigger.time);
    }

    // Remover mapping del mapa REAL del director
    this._director._phaseToPreset.delete(this._selectedPhaseIndex);

    // Remover preset del director (si existe)
    if (presetName && this._director._presets) {
      this._director._presets.delete(presetName);
    }

    console.log(`[TransportGUI] 🗑 Fase ${this._selectedPhaseIndex} eliminada: "${presetName}"`);

    // Limpiar selección
    this._selectedPhaseIndex = null;
    this._loopEnabled = false;
    this._state.loopEnabled = false;
    this._controllers.loopEnabled.updateDisplay();

    // Re-renderizar timeline y dropdown
    this._segmentsRendered = false;
    this._refreshPhaseLoopOptions();

    // Auto-guardar
    this._saveToLocalStorage();
  }

  /**
   * Reconstruye las opciones del dropdown "Editar Fase" con las fases actuales.
   */
  _refreshPhaseLoopOptions() {
    if (!this._phaseLoopCtrl || !this._director) return;

    const pm = this._director.getPhaseManager();
    const triggers = pm.getTriggers();
    const mapping = this._director.getPhasePresetMapping();

    // Construir opciones: '—' + cada fase con su nombre
    const options = { '—': '—' };
    for (const trigger of triggers) {
      const name = mapping.get(trigger.phaseIndex) || `Fase ${trigger.phaseIndex}`;
      const label = `${name} (${formatTime(trigger.time)})`;
      options[label] = String(trigger.phaseIndex);
    }

    // Destruir y recrear el controller con las nuevas opciones
    this._phaseLoopCtrl.destroy();
    this._phaseLoopState.selectedPhase = '—';
    this._selectedPhaseIndex = null;
    const editFolder = this._gui.folders.find(f => f._title === '✏️ Editar Fase');
    if (editFolder) {
      this._phaseLoopCtrl = editFolder
        .add(this._phaseLoopState, 'selectedPhase', options)
        .name('Fase')
        .onChange((value) => {
          if (value === '—') {
            this._loopEnabled = false;
            this._state.loopEnabled = false;
            this._controllers.loopEnabled.updateDisplay();
            this._selectedPhaseIndex = null;
            return;
          }
          const triggers = pm.getTriggers();
          const duration = this._music.audio.duration || 300;
          const idx = parseInt(value);
          const trigger = triggers.find(t => t.phaseIndex === idx);
          if (!trigger) return;

          const triggerIdx = triggers.indexOf(trigger);
          const nextTime = (triggerIdx + 1 < triggers.length) ? triggers[triggerIdx + 1].time : duration;

          this._loopStart = trigger.time;
          this._loopEnd = nextTime;
          this._loopEnabled = true;
          this._state.loopStart = trigger.time;
          this._state.loopEnd = nextTime;
          this._state.loopEnabled = true;
          this._selectedPhaseIndex = idx;
          this._controllers.loopStart.updateDisplay();
          this._controllers.loopEnd.updateDisplay();
          this._controllers.loopEnabled.updateDisplay();

          this._seekTo(trigger.time);
        });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Seek — saltar a un punto de la canción
  // ═══════════════════════════════════════════════════════════════════════

  _seekTo(seconds) {
    if (!this._music || !this._music.audio) return;

    const audio = this._music.audio;

    // Si el audio terminó (ended), reanudar reproducción al hacer seek
    const wasEnded = audio.ended;

    audio.currentTime = seconds;

    if (wasEnded) {
      this._music.play();
    }

    // Notificar al PhaseManager para que recalcule la fase activa
    if (this._director) {
      const pm = this._director.getPhaseManager();
      pm.recalculatePhase(seconds);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Loop de actualización — sincroniza display y ejecuta loop de audio
  // ═══════════════════════════════════════════════════════════════════════

  _startUpdateLoop() {
    const loop = () => {
      this._rafId = requestAnimationFrame(loop);
      this._update();
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _update() {
    if (!this._music || !this._music.audio || !this._gui) return;

    // Solo actualizar si el panel está visible
    if (this._gui.domElement.style.display === 'none') return;

    const audio = this._music.audio;
    const currentTime = audio.currentTime;
    const duration = audio.duration || 300;

    // Ajustar rango del slider de seek si la duración cambió (audio cargado)
    if (this._lastKnownDuration !== duration && duration > 0) {
      this._lastKnownDuration = duration;
      this._controllers.seek.max(duration);
    }

    // Actualizar display de tiempo
    this._state.currentTime = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    this._controllers.timeDisplay.updateDisplay();

    // Actualizar slider de seek sin disparar onChange
    this._state.seekTo = currentTime;
    this._controllers.seek.updateDisplay();

    // ─── Actualizar barra visual de fases ────────────────────────────────

    // Renderizar segmentos la primera vez o si aún no se han renderizado
    if (!this._segmentsRendered) {
      this._renderPhaseSegments();
    }

    // Mover playhead (indicador de posición)
    if (this._playhead) {
      const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
      this._playhead.style.left = `${progress}%`;
    }

    // Actualizar etiqueta de fase activa
    if (this._phaseLabel && this._director) {
      const pm = this._director.getPhaseManager();
      const activePreset = this._director.getActivePreset();
      const phase = pm._currentPhase;
      if (activePreset) {
        this._phaseLabel.textContent = `▶ Fase ${phase >= 0 ? phase : '—'}: ${activePreset}`;
      }
    }

    // ─── Lógica de loop ─────────────────────────────────────────────────
    if (this._loopEnabled && currentTime >= this._loopEnd) {
      // Saltar de vuelta al inicio del loop
      this._music.audio.currentTime = this._loopStart;

      // Recalcular fase para el nuevo tiempo
      if (this._director) {
        const pm = this._director.getPhaseManager();
        pm.recalculatePhase(this._loopStart);
      }
    }
  }
}
