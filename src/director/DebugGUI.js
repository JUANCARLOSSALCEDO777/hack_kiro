/**
 * DebugGUI — Panel de debug del Experience Director integrado con lil-gui.
 *
 * Se activa/desactiva junto con el DebugModeManager (tecla 'D').
 * Proporciona controles en tiempo real para:
 * - Selección de Mood Preset activo
 * - Selección de Camera Mode
 * - Toggle de Visual Elements registrados
 * - Toggle de Shake overlay
 * - Sub-folder "Beat Router" con intensidades editables por binding
 *
 * Los cambios desde la GUI se aplican con TransitionEngine (0.5s transición).
 * Los valores se actualizan cada frame para reflejar cambios externos.
 */

// Modos de cámara disponibles en el CameraSystem
const CAMERA_MODES = [
  'first-person', 'orbit', 'dolly', 'crane',
  'tracking', 'flyby', 'static'
];

// Duración de transición para cambios desde la GUI
const GUI_TRANSITION_DURATION = 0.5;

export class DebugGUI {

  /**
   * @param {import('lil-gui').GUI} gui — Instancia de lil-gui del ModeSelector
   * @param {import('./ExperienceDirector.js').ExperienceDirector} director — Director principal
   */
  constructor(gui, director) {
    this._gui = gui;
    this._director = director;

    // Estado reactivo para los controles de lil-gui
    this._state = {
      preset: director.getActivePreset() || 'default',
      cameraMode: director.getCameraSystem().getCurrentMode(),
      shake: director.getCameraSystem().isShakeEnabled(),
    };

    // Estados de los toggles de elementos visuales
    this._elementStates = {};

    // Referencia al folder principal y sub-folders para dispose
    this._folder = null;
    this._beatFolder = null;
    this._controllers = [];
    this._beatControllers = [];
    this._elementControllers = [];
    this._rafId = null;

    // Sub-folder de parámetros del modo de cámara seleccionado
    this._camModeParamsFolder = null;
    this._camModeState = null;

    // Construir la GUI
    this._build();

    // Iniciar loop de actualización de valores
    this._startUpdateLoop();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API pública — Compatible con DebugModeManager.registerPanel()
  // ═══════════════════════════════════════════════════════════════════════

  /** Muestra el folder del Experience Director */
  show() {
    if (this._folder) {
      this._folder.show();
    }
  }

  /** Oculta el folder del Experience Director */
  hide() {
    if (this._folder) {
      this._folder.hide();
    }
  }

  /** Destruye el folder y limpia todos los listeners */
  dispose() {
    // Detener loop de actualización
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    // Destruir sub-folder de parámetros de modo de cámara
    if (this._camModeParamsFolder) {
      this._camModeParamsFolder.destroy();
      this._camModeParamsFolder = null;
    }
    this._camModeState = null;

    // Destruir folder de la GUI (lil-gui limpia sus controllers internamente)
    if (this._folder) {
      this._folder.destroy();
      this._folder = null;
    }

    // Limpiar referencias
    this._controllers = [];
    this._beatControllers = [];
    this._elementControllers = [];
    this._gui = null;
    this._director = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Construcción de la GUI
  // ═══════════════════════════════════════════════════════════════════════

  /** Construye el folder "Experience Director" con todos los controles */
  _build() {
    this._folder = this._gui.addFolder('Experience Director');

    // ─── Dropdown de Mood Preset ───────────────────────────────────────────
    const presetNames = this._director.getPresetNames();
    const presetCtrl = this._folder
      .add(this._state, 'preset', presetNames)
      .name('Mood Preset')
      .onChange((name) => {
        this._director.activatePreset(name, GUI_TRANSITION_DURATION);
      });
    this._controllers.push(presetCtrl);

    // ─── Dropdown de Camera Mode ───────────────────────────────────────────
    const camCtrl = this._folder
      .add(this._state, 'cameraMode', CAMERA_MODES)
      .name('Camera Mode')
      .onChange((mode) => {
        const camSystem = this._director.getCameraSystem();
        if (mode === 'first-person') {
          camSystem.stopSequence();
        } else {
          // Activar modo con duración razonable para debug
          camSystem.activateMode(mode, {}, 10);
        }
        // Reconstruir sub-folder de parámetros del modo seleccionado
        this._buildCameraModeParamsFolder(mode);
      });
    this._controllers.push(camCtrl);

    // ─── Toggle de Shake overlay ───────────────────────────────────────────
    const shakeCtrl = this._folder
      .add(this._state, 'shake')
      .name('Shake Overlay')
      .onChange((enabled) => {
        const camSystem = this._director.getCameraSystem();
        if (enabled) {
          camSystem.enableShake();
        } else {
          camSystem.disableShake();
        }
      });
    this._controllers.push(shakeCtrl);

    // ─── Toggles de Visual Elements ────────────────────────────────────────
    this._buildElementToggles();

    // ─── Sub-folder de controles de Bloom en tiempo real ───────────────────
    this._buildBloomFolder();

    // ─── Modo Editor de Cámara (posición libre mirando al centro) ──────────
    this._buildCameraEditorFolder();

    // ─── Sub-folder "Beat Router" con sliders de intensidad ────────────────
    this._buildBeatRouterFolder();

    // Cerrar todos los folders (incluido el principal) para no saturar la pantalla
    this._folder.foldersRecursive().forEach(f => f.close());
    this._folder.close();

    // Ocultar por defecto (el DebugModeManager sincroniza al registrar)
    this._folder.hide();
  }

  /** Crea un checkbox toggle por cada Visual Element registrado */
  _buildElementToggles() {
    const registry = this._director.getElementRegistry();
    const names = registry.getNames();

    for (const name of names) {
      // Inicializar estado basado en el registry actual
      this._elementStates[name] = registry.isActive(name);

      const ctrl = this._folder
        .add(this._elementStates, name)
        .name(`⬤ ${name}`)
        .onChange((active) => {
          this._director.setElementActive(name, active);
        });

      this._elementControllers.push(ctrl);
    }
  }

  /**
   * Construye sub-folder "Bloom" con controles numéricos editables en tiempo real.
   * Permite ajustar strength, radius y threshold directamente sobre el bloomPass.
   * (Req 8.4)
   */
  _buildBloomFolder() {
    const bloomFolder = this._folder.addFolder('🌟 Bloom');
    const bloomPass = this._director._deps.view?.bloomPass;
    if (!bloomPass) return;

    // Estado inicial sincronizado con el bloomPass actual
    this._bloomState = {
      strength: bloomPass.strength,
      radius: bloomPass.radius,
      threshold: bloomPass.threshold,
    };

    // Controles numéricos (number input con step, no sliders) — cada cambio se aplica al instante
    bloomFolder.add(this._bloomState, 'strength').name('Strength').step(0.1).onChange(v => { bloomPass.strength = v; });
    bloomFolder.add(this._bloomState, 'radius').name('Radius').step(0.1).onChange(v => { bloomPass.radius = v; });
    bloomFolder.add(this._bloomState, 'threshold').name('Threshold').step(0.01).onChange(v => { bloomPass.threshold = v; });
  }

  /**
   * Construye el sub-folder "Camera Editor" con modo de posición libre.
   * Al activar: el Player se detiene, la cámara mira al centro (0,0,0),
   * y se pueden ajustar X/Y/Z desde sliders.
   */
  _buildCameraEditorFolder() {
    const camEditorFolder = this._folder.addFolder('📐 Camera Editor');

    // Estado del editor
    this._camEditorState = {
      enabled: false,
      x: 0,
      y: 60,
      z: 200,
      lookAtX: 0,
      lookAtY: 0,
      lookAtZ: 0,
    };

    // Toggle para activar/desactivar el modo editor
    camEditorFolder.add(this._camEditorState, 'enabled')
      .name('Modo Editor')
      .onChange((active) => {
        const camSystem = this._director.getCameraSystem();
        if (active) {
          // Capturar posición actual de la cámara como punto de partida
          const cam = this._director._deps.player.camera;
          this._camEditorState.x = cam.position.x;
          this._camEditorState.y = cam.position.y;
          this._camEditorState.z = cam.position.z;

          // Activar modo static con duración larga (se mantiene hasta desactivar)
          camSystem.activateMode('static', {
            position: [this._camEditorState.x, this._camEditorState.y, this._camEditorState.z],
            lookAt: [this._camEditorState.lookAtX, this._camEditorState.lookAtY, this._camEditorState.lookAtZ],
          }, 9999);

          // Actualizar displays de los sliders
          this._camEditorCtrls.forEach(c => c.updateDisplay());
        } else {
          camSystem.stopSequence();
        }
      });

    // Sliders de posición (se aplican en tiempo real)
    const applyEditorPosition = () => {
      if (!this._camEditorState.enabled) return;
      const camSystem = this._director.getCameraSystem();
      // Reactivar static con la nueva posición
      camSystem.activateMode('static', {
        position: [this._camEditorState.x, this._camEditorState.y, this._camEditorState.z],
        lookAt: [this._camEditorState.lookAtX, this._camEditorState.lookAtY, this._camEditorState.lookAtZ],
      }, 9999);
    };

    this._camEditorCtrls = [];

    // Controles numéricos (sin slider) para precisión directa
    this._camEditorCtrls.push(
      camEditorFolder.add(this._camEditorState, 'x').name('Pos X').step(1).onChange(applyEditorPosition)
    );
    this._camEditorCtrls.push(
      camEditorFolder.add(this._camEditorState, 'y').name('Pos Y').step(1).onChange(applyEditorPosition)
    );
    this._camEditorCtrls.push(
      camEditorFolder.add(this._camEditorState, 'z').name('Pos Z').step(1).onChange(applyEditorPosition)
    );

    // Controles numéricos de lookAt (por defecto centro de la escena)
    camEditorFolder.add(this._camEditorState, 'lookAtX').name('LookAt X').step(1).onChange(applyEditorPosition);
    camEditorFolder.add(this._camEditorState, 'lookAtY').name('LookAt Y').step(1).onChange(applyEditorPosition);
    camEditorFolder.add(this._camEditorState, 'lookAtZ').name('LookAt Z').step(1).onChange(applyEditorPosition);
  }

  /**
   * Construye/reconstruye el sub-folder de parámetros según el modo de cámara seleccionado.
   * Se llama desde el onChange del dropdown de Camera Mode.
   *
   * - Destruye el folder anterior si existe
   * - No crea folder para first-person (Req 7.9)
   * - Crea controles numéricos lil-gui específicos del modo (Req 7.11)
   * - Cada onChange aplica cambios al CameraSystem._params en tiempo real (Req 7.10)
   *
   * @param {string} mode — Modo de cámara seleccionado
   * @private
   */
  _buildCameraModeParamsFolder(mode) {
    // Destruir sub-folder anterior si existe
    if (this._camModeParamsFolder) {
      this._camModeParamsFolder.destroy();
      this._camModeParamsFolder = null;
    }

    // No crear folder para first-person (Req 7.9)
    if (mode === 'first-person') return;

    this._camModeParamsFolder = this._folder.addFolder(`⚙️ ${mode} params`);

    // Estado reactivo para los controles del modo
    this._camModeState = this._getDefaultParamsForMode(mode);

    // Callback genérico: aplica cambios al CameraSystem en tiempo real (Req 7.10)
    const applyParams = () => {
      const camSystem = this._director.getCameraSystem();
      if (camSystem.isSequenceActive()) {
        Object.assign(camSystem._params, this._camModeState);
      }
    };

    // Construir controles específicos según el modo (Req 7.11 — number inputs)
    // Los cases se implementan en detalle en tareas 6.2, 6.3, 6.4
    switch (mode) {
      case 'orbit':
        // Controles de punto focal (X/Y/Z) para definir el centro de la órbita
        this._camModeParamsFolder.add(this._camModeState, 'focalPointX').name('Focal X').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'focalPointY').name('Focal Y').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'focalPointZ').name('Focal Z').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'angularSpeed').name('Vel. Angular').step(0.1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'radius').name('Radio').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'altitude').name('Altitud').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'direction', ['clockwise', 'counterclockwise']).name('Dirección').onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'startAngle').name('Ángulo inicial').step(0.1).onChange(applyParams);
        break;

      case 'dolly':
        // Posición inicial del dolly (X/Y/Z)
        this._camModeParamsFolder.add(this._camModeState, 'startX').name('Inicio X').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'startY').name('Inicio Y').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'startZ').name('Inicio Z').step(1).onChange(applyParams);
        // Posición final del dolly (X/Y/Z)
        this._camModeParamsFolder.add(this._camModeState, 'endX').name('Fin X').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'endY').name('Fin Y').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'endZ').name('Fin Z').step(1).onChange(applyParams);
        // Punto de mira durante el recorrido (X/Y/Z)
        this._camModeParamsFolder.add(this._camModeState, 'lookAtX').name('LookAt X').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'lookAtY').name('LookAt Y').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'lookAtZ').name('LookAt Z').step(1).onChange(applyParams);
        // Velocidad de desplazamiento
        this._camModeParamsFolder.add(this._camModeState, 'speed').name('Velocidad').step(1).onChange(applyParams);
        break;

      case 'crane':
        // Rango vertical de la grúa
        this._camModeParamsFolder.add(this._camModeState, 'startY').name('Inicio Y').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'endY').name('Fin Y').step(1).onChange(applyParams);
        // Posición horizontal de la base de la grúa
        this._camModeParamsFolder.add(this._camModeState, 'horizontalX').name('Horizontal X').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'horizontalZ').name('Horizontal Z').step(1).onChange(applyParams);
        // Parámetros de barrido angular
        this._camModeParamsFolder.add(this._camModeState, 'sweepAngle').name('Ángulo Barrido').step(0.1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'sweepRadius').name('Radio Barrido').step(1).onChange(applyParams);
        // Punto focal al que mira la cámara (X/Y/Z)
        this._camModeParamsFolder.add(this._camModeState, 'focalPointX').name('Focal X').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'focalPointY').name('Focal Y').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'focalPointZ').name('Focal Z').step(1).onChange(applyParams);
        // Velocidad del movimiento de grúa
        this._camModeParamsFolder.add(this._camModeState, 'speed').name('Velocidad').step(1).onChange(applyParams);
        break;

      case 'tracking':
        // Velocidad de recorrido por los puntos de la spline
        this._camModeParamsFolder.add(this._camModeState, 'speed').name('Velocidad').step(1).onChange(applyParams);
        // Tensión de la CatmullRom (0 = suave, 1 = rígida)
        this._camModeParamsFolder.add(this._camModeState, 'tension').name('Tensión').step(0.1).onChange(applyParams);
        // Tipo de lookAt: hacia dónde mira la cámara mientras se desplaza
        this._camModeParamsFolder.add(this._camModeState, 'lookAtType', ['path', 'fixed', 'player']).name('LookAt').onChange(applyParams);
        // Botón para capturar la posición actual de la cámara como punto de control
        this._camModeParamsFolder.add({
          addPoint: () => {
            const cam = this._director._deps.player.camera;
            if (!this._camModeState.points) this._camModeState.points = [];
            this._camModeState.points.push([cam.position.x, cam.position.y, cam.position.z]);
            console.log(`[DebugGUI] Punto ${this._camModeState.points.length} agregado`);
          }
        }, 'addPoint').name('➕ Agregar punto');
        break;

      case 'flyby':
        // Multiplicador de velocidad respecto al Player
        this._camModeParamsFolder.add(this._camModeState, 'speedMultiplier').name('Multiplicador').step(0.5).onChange(applyParams);
        // Offset de altitud sobre el terreno
        this._camModeParamsFolder.add(this._camModeState, 'altitudeOffset').name('Altitud Offset').step(1).onChange(applyParams);
        // FOV objetivo para efecto de velocidad
        this._camModeParamsFolder.add(this._camModeState, 'fovTarget').name('FOV Target').step(1).onChange(applyParams);
        break;

      case 'static':
        // Posición fija de la cámara (X/Y/Z)
        this._camModeParamsFolder.add(this._camModeState, 'posX').name('Pos X').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'posY').name('Pos Y').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'posZ').name('Pos Z').step(1).onChange(applyParams);
        // Punto de mira de la cámara estática (X/Y/Z)
        this._camModeParamsFolder.add(this._camModeState, 'lookAtX').name('LookAt X').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'lookAtY').name('LookAt Y').step(1).onChange(applyParams);
        this._camModeParamsFolder.add(this._camModeState, 'lookAtZ').name('LookAt Z').step(1).onChange(applyParams);
        break;

      case 'shake':
        // Amplitud del efecto de sacudida (en unidades de mundo)
        this._camModeParamsFolder.add(this._camModeState, 'amplitude').name('Amplitud').step(0.1).onChange(applyParams);
        // Frecuencia de oscilación en Hz
        this._camModeParamsFolder.add(this._camModeState, 'frequency').name('Frecuencia').step(1).onChange(applyParams);
        break;
    }

    // Cerrar por defecto para no saturar la interfaz
    this._camModeParamsFolder.close();
  }

  /**
   * Construye el sub-folder "Beat Routing" con indicadores de color por tipo de beat,
   * dropdowns para reasignar efectos y sliders de thresholds globales.
   */
  _buildBeatRouterFolder() {
    this._beatFolder = this._folder.addFolder('Beat Routing');
    const director = this._director;
    const beatRouter = director.getBeatRouter();
    const beatEvents = director._deps.beatEvents;

    // Colores de indicador por beat type (emoji + CSS hex)
    const BEAT_COLORS = { bass: '🔴', mid: '🟡', high: '🔵' };
    const BEAT_CSS_COLORS = { bass: '#e91e63', mid: '#ffeb3b', high: '#2196f3' };

    // ─── Thresholds globales editables ───
    const thresholdFolder = this._beatFolder.addFolder('Thresholds');
    const thresholds = {
      bass: beatEvents.beatThreshold,
      mid: beatEvents.midBeatThreshold,
      high: beatEvents.highBeatThreshold,
    };

    const bassCtrl = thresholdFolder.add(thresholds, 'bass', 20, 255, 1).name('🔴 Bass').onChange(v => { beatEvents.beatThreshold = v; });
    bassCtrl.domElement.style.borderLeft = `4px solid ${BEAT_CSS_COLORS.bass}`;
    const midCtrl = thresholdFolder.add(thresholds, 'mid', 20, 255, 1).name('🟡 Mid').onChange(v => { beatEvents.midBeatThreshold = v; });
    midCtrl.domElement.style.borderLeft = `4px solid ${BEAT_CSS_COLORS.mid}`;
    const highCtrl = thresholdFolder.add(thresholds, 'high', 20, 255, 1).name('🔵 High').onChange(v => { beatEvents.highBeatThreshold = v; });
    highCtrl.domElement.style.borderLeft = `4px solid ${BEAT_CSS_COLORS.high}`;

    // ─── Lista de efectos con asignación de beat ───
    // Recolectar todos los bindings actuales de cada tipo de beat
    const allBindings = [];
    for (const beatType of ['bass', 'mid', 'high']) {
      for (const binding of beatRouter.getBindings(beatType)) {
        allBindings.push({ ...binding, currentBeatType: beatType });
      }
    }

    // Crear un control por cada binding
    for (const binding of allBindings) {
      const label = `${BEAT_COLORS[binding.currentBeatType]} ${binding.elementName}`;
      const state = { beatType: binding.currentBeatType, intensity: binding.intensity };

      // Dropdown para cambiar asignación de beat
      const dropCtrl = this._beatFolder.add(state, 'beatType', ['bass', 'mid', 'high'])
        .name(label)
        .onChange((newType) => {
          // Remover del tipo anterior y agregar al nuevo
          beatRouter.removeBinding(binding.currentBeatType, binding.elementName);
          beatRouter.addBinding(newType, {
            elementName: binding.elementName,
            action: binding.action,
            intensity: state.intensity,
            params: binding.params,
          });
          binding.currentBeatType = newType;
          // Actualizar color del indicador visual
          dropCtrl.domElement.style.borderLeft = `4px solid ${BEAT_CSS_COLORS[newType]}`;
        });

      // Aplicar color inicial al borde izquierdo del controller
      dropCtrl.domElement.style.borderLeft = `4px solid ${BEAT_CSS_COLORS[binding.currentBeatType]}`;

      // Slider de intensidad
      const intCtrl = this._beatFolder.add(state, 'intensity', 0, 1, 0.01)
        .name(`  ↳ intensidad`)
        .onChange((value) => {
          // Actualizar intensidad en los bindings actuales
          const bindings = beatRouter.getBindings(binding.currentBeatType);
          const target = bindings.find(b => b.elementName === binding.elementName);
          if (target) {
            target.intensity = value;
            beatRouter.replaceBindings(binding.currentBeatType, bindings);
          }
        });

      this._beatControllers.push(
        { ctrl: dropCtrl, beatType: binding.currentBeatType, elementName: binding.elementName, wrapper: state },
        { ctrl: intCtrl, beatType: binding.currentBeatType, elementName: binding.elementName, wrapper: state }
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Helpers de Camera Mode — valores por defecto por modo cinematográfico
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Retorna un objeto con los valores por defecto de parámetros según el modo.
   * Estos defaults se usan para inicializar los controles de la GUI cuando
   * el usuario selecciona un modo cinematográfico desde el dropdown.
   *
   * @param {string} mode — Modo de cámara cinematográfico
   * @returns {Object} — Objeto con parámetros default del modo
   * @private
   */
  _getDefaultParamsForMode(mode) {
    switch (mode) {
      case 'orbit':
        return {
          focalPointX: 0, focalPointY: 0, focalPointZ: 0,
          angularSpeed: 0.5,
          radius: 200,
          altitude: 0,
          direction: 'counterclockwise',
          startAngle: 0,
        };
      case 'dolly':
        return {
          startX: 0, startY: 60, startZ: 200,
          endX: 0, endY: 60, endZ: -200,
          lookAtX: 0, lookAtY: 0, lookAtZ: 0,
          speed: 50,
        };
      case 'crane':
        return {
          startY: 50, endY: 200,
          horizontalX: 0, horizontalZ: 0,
          sweepAngle: 0, sweepRadius: 200,
          focalPointX: 0, focalPointY: 60, focalPointZ: -100,
          speed: 30,
        };
      case 'tracking':
        return {
          speed: 50,
          tension: 0.5,
          lookAtType: 'path',
          points: [],
        };
      case 'flyby':
        return {
          speedMultiplier: 3,
          altitudeOffset: 30,
          fovTarget: 90,
        };
      case 'static':
        return {
          posX: 0, posY: 60, posZ: 200,
          lookAtX: 0, lookAtY: 0, lookAtZ: 0,
        };
      case 'shake':
        return {
          amplitude: 2.0,
          frequency: 20,
        };
      default:
        return {};
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Loop de actualización — sincroniza la GUI con cambios externos
  // ═══════════════════════════════════════════════════════════════════════

  /** Inicia un loop de requestAnimationFrame para actualizar los displays de la GUI */
  _startUpdateLoop() {
    const loop = () => {
      this._rafId = requestAnimationFrame(loop);
      this._syncValues();
    };
    this._rafId = requestAnimationFrame(loop);
  }

  /** Sincroniza los valores de la GUI con el estado actual del director */
  _syncValues() {
    if (!this._director || !this._folder) return;

    // Solo actualizar si el folder está visible (optimización)
    if (this._folder.domElement.style.display === 'none') return;

    // Sincronizar preset activo
    const currentPreset = this._director.getActivePreset();
    if (currentPreset && currentPreset !== this._state.preset) {
      this._state.preset = currentPreset;
      this._controllers[0]?.updateDisplay();
    }

    // Sincronizar camera mode
    const currentMode = this._director.getCameraSystem().getCurrentMode();
    if (currentMode !== this._state.cameraMode) {
      this._state.cameraMode = currentMode;
      this._controllers[1]?.updateDisplay();
      // Reconstruir sub-folder de params si el modo cambió externamente
      this._buildCameraModeParamsFolder(currentMode);
    }

    // Sincronizar shake
    const shakeEnabled = this._director.getCameraSystem().isShakeEnabled();
    if (shakeEnabled !== this._state.shake) {
      this._state.shake = shakeEnabled;
      this._controllers[2]?.updateDisplay();
    }

    // Sincronizar element toggles
    const registry = this._director.getElementRegistry();
    for (let i = 0; i < this._elementControllers.length; i++) {
      const ctrl = this._elementControllers[i];
      const name = ctrl.property;
      try {
        const isActive = registry.isActive(name);
        if (isActive !== this._elementStates[name]) {
          this._elementStates[name] = isActive;
          ctrl.updateDisplay();
        }
      } catch (_) {
        // Elemento puede haber sido desregistrado
      }
    }

    // Sincronizar intensidades del Beat Router
    const beatRouter = this._director.getBeatRouter();
    for (const entry of this._beatControllers) {
      try {
        const bindings = beatRouter.getBindings(entry.beatType);
        const binding = bindings.find(b => b.elementName === entry.elementName);
        if (binding && binding.intensity !== entry.wrapper.intensity) {
          entry.wrapper.intensity = binding.intensity;
          entry.ctrl.updateDisplay();
        }
      } catch (_) {
        // Bindings pueden haber cambiado
      }
    }

    // Sincronizar valores de bloom (pueden cambiar por TransitionEngine)
    if (this._bloomState) {
      const bloomPass = this._director._deps.view?.bloomPass;
      if (bloomPass) {
        if (bloomPass.strength !== this._bloomState.strength) this._bloomState.strength = bloomPass.strength;
        if (bloomPass.radius !== this._bloomState.radius) this._bloomState.radius = bloomPass.radius;
        if (bloomPass.threshold !== this._bloomState.threshold) this._bloomState.threshold = bloomPass.threshold;
      }
    }
  }
}
