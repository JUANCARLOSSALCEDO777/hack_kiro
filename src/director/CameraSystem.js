/**
 * CameraSystem — Sistema de cámara cinematográfica.
 *
 * Gestiona los modos de cámara y secuencias programadas.
 * Cuando un modo cinematográfico está activo, el Player se "duerme"
 * (su update() se salta) y el CameraSystem toma control de camera.matrix.
 *
 * Modos implementados en esta versión:
 * - first-person: delegación directa al Player (modo por defecto)
 * - static: fijar posición/lookAt sin movimiento durante duración especificada
 * - orbit: rotación alrededor de un punto focal con radio, velocidad angular y altitud
 * - dolly: desplazamiento lineal entre dos posiciones con lookAt fijo o interpolado
 * - crane: elevación/descenso con rotación horizontal opcional
 * - tracking: seguimiento de path CatmullRom spline
 * - flyby: sobrevuelo rápido a baja altitud siguiendo dirección del Player
 * - shake: overlay de vibración de alta frecuencia (se superpone sobre cualquier modo)
 *
 * LookAt dinámico: resolución de target (fixed, player, webcamCenter, interpolated)
 * utilizable por cualquier modo de cámara.
 */

import * as THREE from 'three';
import { Config } from '../Config.js';

// Modos válidos de cámara
const VALID_MODES = new Set([
  'first-person', 'orbit', 'dolly', 'crane',
  'tracking', 'flyby', 'shake', 'static',
]);

// Constantes para el modo shake
const SHAKE_MIN_AMPLITUDE = 0.1;
const SHAKE_MAX_AMPLITUDE = 20.0;
const SHAKE_DEFAULT_AMPLITUDE = 2.0;
const SHAKE_MIN_FREQUENCY = 1;
const SHAKE_MAX_FREQUENCY = 60;
const SHAKE_DEFAULT_FREQUENCY = 20;

// Rango de duración válido (segundos)
const MIN_DURATION = 0.1;
const MAX_DURATION = 300.0;

export class CameraSystem {

  /**
   * @param {object} player — instancia de Player existente
   * @param {THREE.PerspectiveCamera} camera — cámara de la escena
   */
  constructor(player, camera) {
    this._player = player;
    this._camera = camera;

    // Estado de la secuencia activa
    this._currentMode = 'first-person';
    this._sequenceActive = false;
    this._elapsed = 0;
    this._duration = 0;
    this._params = {};

    // Para la transición de retorno
    this._returning = false;
    this._returnDuration = 0;
    this._returnElapsed = 0;

    // Vectores auxiliares para el modo static (evitar GC)
    this._staticPosition = new THREE.Vector3();
    this._staticLookAt = new THREE.Vector3();
    this._upVector = new THREE.Vector3(0, 1, 0);

    // Estado del modo tracking
    this._trackingCurve = null;
    this._trackingLookAt = null;
    this._trackingPlayerPos = null;

    // Vectores auxiliares para el modo orbit (evitar GC)
    this._orbitPosition = new THREE.Vector3();
    this._orbitFocalPoint = new THREE.Vector3();

    // Vectores auxiliares para el modo dolly (evitar GC)
    this._dollyPosition = new THREE.Vector3();
    this._dollyStart = new THREE.Vector3();
    this._dollyEnd = new THREE.Vector3();
    this._dollyLookAt = new THREE.Vector3();

    // Vectores auxiliares para el modo crane (evitar GC)
    this._cranePosition = new THREE.Vector3();
    this._craneFocalPoint = new THREE.Vector3();

    // Estado del modo flyby
    this._flybyPosition = new THREE.Vector3();
    this._flybyDirection = new THREE.Vector3();
    this._flybyLookAt = new THREE.Vector3();
    this._flybyOriginalFov = null; // FOV original para restaurar al terminar

    // Interrupción por usuario
    this._userInterruptEnabled = false;
    this._interruptKey = null;
    this._onKeyHandler = null;
    this._onClickHandler = null;

    // Estado de playlist de secuencias encadenadas
    this._playlist = [];
    this._playlistIndex = 0;
    this._playlistActive = false;
    this._playlistOptions = {};
    // Timer para startDelay entre secuencias de la playlist
    this._playlistDelayActive = false;
    this._playlistDelayElapsed = 0;
    this._playlistDelayDuration = 0;

    // Estado del modo shake (overlay, no reemplaza el modo activo)
    this._shakeEnabled = false;
    this._shakeAmplitude = SHAKE_DEFAULT_AMPLITUDE;
    this._shakeFrequency = SHAKE_DEFAULT_FREQUENCY;
    this._shakeOffset = new THREE.Vector3();
    this._shakeTime = 0;

    // Vectores auxiliares para lookAt dinámico (evitar GC)
    this._dynamicLookAtTarget = new THREE.Vector3();
    this._dynamicLookAtFrom = new THREE.Vector3();
    this._dynamicLookAtTo = new THREE.Vector3();
  }

  /**
   * Actualización por frame — llamado desde ExperienceDirector.
   * Si no hay secuencia activa, no hace nada (Player maneja la cámara).
   *
   * @param {object} state — FrameState con deltaTime, time, etc.
   */
  update(state) {
    // Si no hay secuencia activa y no hay shake y no hay delay de playlist, el Player controla todo
    if (!this._sequenceActive && !this._shakeEnabled && !this._playlistDelayActive) return;

    const dt = state.deltaTime;

    // Si estamos en delay entre secuencias de playlist, contar tiempo
    if (this._playlistDelayActive) {
      this._playlistDelayElapsed += dt;
      if (this._playlistDelayElapsed >= this._playlistDelayDuration) {
        // Delay cumplido: activar la siguiente secuencia de la playlist
        this._playlistDelayActive = false;
        this._activatePlaylistEntry(this._playlistIndex);
      }
      return;
    }

    // Si hay shake pero no secuencia activa, solo aplicar shake sobre first-person
    if (!this._sequenceActive && this._shakeEnabled) {
      this._applyShakeOverlay(dt);
      return;
    }

    // Modo static: verificar si expiró la duración
    if (this._currentMode === 'static') {
      this._elapsed += dt;

      if (this._elapsed >= this._duration) {
        // La duración expiró, volver a first-person
        this.stopSequence();
      }
    }

    // Modo orbit: rotación alrededor de punto focal
    if (this._currentMode === 'orbit') {
      this._elapsed += dt;

      if (this._elapsed >= this._duration) {
        this.stopSequence();
        return;
      }

      this._updateOrbitMode();
    }

    // Modo dolly: desplazamiento lineal entre dos posiciones
    if (this._currentMode === 'dolly') {
      this._elapsed += dt;

      if (this._elapsed >= this._duration) {
        this.stopSequence();
        return;
      }

      this._updateDollyMode();
    }

    // Modo tracking: avanzar por la spline CatmullRom
    if (this._currentMode === 'tracking') {
      this._elapsed += dt;

      const progress = Math.min(this._elapsed / this._duration, 1.0);

      // Obtener posición en la curva
      const pos = this._trackingCurve.getPointAt(progress);
      this._camera.position.copy(pos);

      // Determinar lookAt según configuración
      const lookAtTarget = this._resolveTrackingLookAt(progress);

      // Construir matrix lookAt
      this._camera.matrix.lookAt(pos, lookAtTarget, this._upVector);
      this._camera.matrix.setPosition(pos);
      this._camera.matrixAutoUpdate = false;
      this._camera.matrixWorldNeedsUpdate = true;

      // Finalizar si alcanzó el final del path
      if (progress >= 1.0) {
        this.stopSequence();
      }
    }

    // Modo crane: elevación/descenso con rotación opcional
    if (this._currentMode === 'crane') {
      this._elapsed += dt;

      const progress = Math.min(this._elapsed / this._duration, 1.0);
      const p = this._params;

      // Interpolar altitud entre startY y endY
      const currentY = p.startY + (p.endY - p.startY) * progress;

      let camX, camZ;

      if (p.sweepAngle > 0) {
        // Posición orbital con barrido horizontal durante ascenso/descenso
        camX = p.horizontalX + Math.cos(p.sweepAngle * progress) * p.sweepRadius;
        camZ = p.horizontalZ + Math.sin(p.sweepAngle * progress) * p.sweepRadius;
      } else {
        // Sin barrido: posición horizontal fija
        camX = p.horizontalX;
        camZ = p.horizontalZ;
      }

      // Actualizar posición de la cámara
      this._cranePosition.set(camX, currentY, camZ);
      this._camera.position.copy(this._cranePosition);

      // LookAt hacia el punto focal configurado
      this._craneFocalPoint.set(p.focalPoint[0], p.focalPoint[1], p.focalPoint[2]);

      // Aplicar matrix como en el modo static (control directo de matrix)
      this._camera.matrix.lookAt(
        this._cranePosition,
        this._craneFocalPoint,
        this._upVector
      );
      this._camera.matrix.setPosition(this._cranePosition);
      this._camera.matrixAutoUpdate = false;
      this._camera.matrixWorldNeedsUpdate = true;

      // Si completó el recorrido, detener secuencia
      if (progress >= 1.0) {
        this.stopSequence();
      }
    }

    // Modo flyby: sobrevuelo rápido a baja altitud siguiendo dirección del Player
    if (this._currentMode === 'flyby') {
      this._elapsed += dt;

      if (this._elapsed >= this._duration) {
        this.stopSequence();
        return;
      }

      this._updateFlybyMode(dt);
    }

    // ─── Shake overlay: se aplica DESPUÉS de toda la lógica de modos ───────────
    // El shake es independiente del modo activo, se superpone como vibración
    if (this._shakeEnabled) {
      this._applyShakeOverlay(dt);
    }
  }

  /**
   * Activa un modo de cámara cinematográfico.
   * Duerme al Player seteando _directorOverride = true.
   *
   * @param {string} mode — nombre del modo de cámara
   * @param {object} params — parámetros específicos del modo
   * @param {number} duration — duración en segundos (0.1 a 300.0)
   */
  activateMode(mode, params = {}, duration = 10.0) {
    // Validar modo
    if (!VALID_MODES.has(mode)) {
      console.warn(
        `CameraSystem.activateMode: modo '${mode}' no válido. ` +
        `Modos disponibles: ${[...VALID_MODES].join(', ')}`
      );
      return;
    }

    // Si es first-person, simplemente volver al estado normal
    if (mode === 'first-person') {
      this.stopSequence();
      return;
    }

    // Shake es un overlay, no un modo regular — delegar a enableShake()
    if (mode === 'shake') {
      this.enableShake(params);
      return;
    }

    // Validar duración
    const clampedDuration = Math.max(MIN_DURATION, Math.min(MAX_DURATION, duration));
    if (duration !== clampedDuration) {
      console.warn(
        `CameraSystem.activateMode: duración ${duration}s fuera de rango, ` +
        `clampeada a ${clampedDuration}s`
      );
    }

    // Dormir al Player para que no controle la cámara
    this._player._directorOverride = true;

    // Configurar secuencia
    this._currentMode = mode;
    this._sequenceActive = true;
    this._elapsed = 0;
    this._duration = clampedDuration;
    this._params = { ...params };
    this._returning = false;

    // Aplicar modo según tipo
    if (mode === 'static') {
      this._applyStaticMode(params);
    } else if (mode === 'tracking') {
      this._applyTrackingMode(params);
    } else if (mode === 'orbit') {
      this._initOrbitMode(params);
    } else if (mode === 'dolly') {
      this._initDollyMode(params);
    } else if (mode === 'crane') {
      this._initCraneMode(params);
    } else if (mode === 'flyby') {
      this._initFlybyMode(params);
    }
  }

  /**
   * Detiene la secuencia actual y retorna a first-person.
   * Por ahora hace snap directo (sin interpolación suave).
   * La transición interpolada se integrará con TransitionEngine más adelante.
   *
   * @param {number} [transitionDuration=1.0] — duración de la transición de retorno (reservado para futuro)
   */
  stopSequence(transitionDuration = 1.0) {
    // Si ya estamos en first-person, no hacer nada
    if (!this._sequenceActive && this._currentMode === 'first-person') return;

    // Restaurar FOV original si estábamos en modo flyby
    if (this._flybyOriginalFov !== null) {
      this._camera.fov = this._flybyOriginalFov;
      this._camera.updateProjectionMatrix();
      this._flybyOriginalFov = null;
    }

    // Si hay playlist activa, intentar avanzar a la siguiente secuencia
    if (this._playlistActive) {
      const nextIndex = this._playlistIndex + 1;

      if (nextIndex < this._playlist.length) {
        // Hay siguiente entrada: avanzar
        this._playlistIndex = nextIndex;
        const nextEntry = this._playlist[nextIndex];
        const delay = nextEntry.startDelay || 0;

        if (delay > 0) {
          // Hay delay antes de la siguiente secuencia
          // Resetear la secuencia actual pero mantener player dormido
          this._currentMode = 'first-person';
          this._sequenceActive = false;
          this._elapsed = 0;
          this._duration = 0;
          this._params = {};
          this._returning = false;
          // No despertar al Player durante el delay
          this._playlistDelayActive = true;
          this._playlistDelayElapsed = 0;
          this._playlistDelayDuration = delay;
        } else {
          // Sin delay: activar inmediatamente
          this._activatePlaylistEntry(nextIndex);
        }
        return;
      }

      // Playlist completa: finalizar todo y volver a first-person
      this._resetPlaylistState();
    }

    // Despertar al Player
    this._player._directorOverride = false;

    // Resetear estado
    this._currentMode = 'first-person';
    this._sequenceActive = false;
    this._elapsed = 0;
    this._duration = 0;
    this._params = {};
    this._returning = false;
  }

  /**
   * Retorna el modo de cámara actual.
   * @returns {string}
   */
  getCurrentMode() {
    return this._currentMode;
  }

  /**
   * Indica si hay una secuencia cinematográfica activa.
   * @returns {boolean}
   */
  isSequenceActive() {
    return this._sequenceActive;
  }

  /**
   * Retorna una copia de los parámetros del modo cinematográfico activo.
   * @returns {Object|null} — Copia de _params o null si está en first-person
   */
  getCurrentParams() {
    if (!this._sequenceActive) return null;
    return { ...this._params };
  }

  /**
   * Retorna el tiempo restante de la secuencia cinematográfica activa.
   * @returns {number} — Segundos restantes, o 0 si no hay secuencia activa
   */
  getRemainingDuration() {
    if (!this._sequenceActive) return 0;
    return Math.max(0, this._duration - this._elapsed);
  }

  /**
   * Habilita la interrupción por usuario (click o tecla).
   * Al presionar, se invoca stopSequence().
   *
   * @param {string} [key] — tecla específica (ej: 'Escape'). Si no se pasa, cualquier click interrumpe.
   */
  enableUserInterrupt(key) {
    this._userInterruptEnabled = true;
    this._interruptKey = key || null;

    // Handler de tecla — detiene secuencia y playlist completa
    this._onKeyHandler = (e) => {
      if (!this._sequenceActive && !this._playlistDelayActive) return;
      if (this._interruptKey && e.key !== this._interruptKey) return;
      this._interruptPlaylistAndStop();
    };

    // Handler de click (siempre activo como alternativa)
    this._onClickHandler = () => {
      if (!this._sequenceActive && !this._playlistDelayActive) return;
      if (this._interruptKey) return; // Si hay tecla configurada, ignorar click
      this._interruptPlaylistAndStop();
    };

    // Verificar que estamos en entorno con window (navegador)
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyHandler);
      window.addEventListener('click', this._onClickHandler);
    }
  }

  /**
   * Deshabilita la interrupción por usuario.
   */
  disableUserInterrupt() {
    this._userInterruptEnabled = false;
    this._interruptKey = null;

    if (this._onKeyHandler) {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', this._onKeyHandler);
      }
      this._onKeyHandler = null;
    }
    if (this._onClickHandler) {
      if (typeof window !== 'undefined') {
        window.removeEventListener('click', this._onClickHandler);
      }
      this._onClickHandler = null;
    }
  }

  // ─── Playlist de Camera Sequences ──────────────────────────────────────

  /**
   * Reproduce una playlist de secuencias de cámara encadenadas.
   * Valida máximo 32 entradas, cada una con modo y duración obligatorios.
   *
   * @param {Array<{mode: string, params: object, duration: number, startDelay?: number}>} sequences
   * @param {object} [options={}] — opciones de reproducción
   * @param {number} [options.returnTransitionDuration=1.0] — duración de transición al volver a first-person (0.1-5.0s)
   */
  playPlaylist(sequences, options = {}) {
    // Validar que sea un array no vacío
    if (!Array.isArray(sequences) || sequences.length === 0) {
      console.warn('CameraSystem.playPlaylist: se requiere un array con al menos 1 secuencia');
      return;
    }

    // Máximo 32 secuencias
    if (sequences.length > 32) {
      console.warn(
        `CameraSystem.playPlaylist: máximo 32 secuencias permitidas, se recibieron ${sequences.length}. ` +
        `Se truncará a las primeras 32.`
      );
      sequences = sequences.slice(0, 32);
    }

    // Validar que cada entrada tenga modo válido y duración obligatoria
    for (let i = 0; i < sequences.length; i++) {
      const entry = sequences[i];

      if (!entry || typeof entry !== 'object') {
        console.warn(`CameraSystem.playPlaylist: entrada [${i}] no es un objeto válido`);
        return;
      }

      if (!entry.mode || !VALID_MODES.has(entry.mode)) {
        console.warn(
          `CameraSystem.playPlaylist: entrada [${i}] tiene modo inválido '${entry.mode}'. ` +
          `Modos válidos: ${[...VALID_MODES].join(', ')}`
        );
        return;
      }

      if (entry.duration == null || typeof entry.duration !== 'number') {
        console.warn(
          `CameraSystem.playPlaylist: entrada [${i}] requiere duración numérica obligatoria`
        );
        return;
      }

      // Validar rango de duración
      if (entry.duration < MIN_DURATION || entry.duration > MAX_DURATION) {
        console.warn(
          `CameraSystem.playPlaylist: entrada [${i}] duración ${entry.duration}s fuera de rango ` +
          `[${MIN_DURATION}, ${MAX_DURATION}]. Se clampeará.`
        );
      }
    }

    // Si ya hay una secuencia o playlist activa, detenerla primero
    if (this._sequenceActive || this._playlistActive) {
      this._resetPlaylistState();
      // Resetear secuencia sin avanzar playlist
      this._currentMode = 'first-person';
      this._sequenceActive = false;
      this._elapsed = 0;
      this._duration = 0;
      this._params = {};
    }

    // Almacenar playlist y opciones
    this._playlist = sequences;
    this._playlistIndex = 0;
    this._playlistActive = true;
    this._playlistOptions = { ...options };

    // Iniciar la primera secuencia
    const firstEntry = this._playlist[0];
    const delay = firstEntry.startDelay || 0;

    if (delay > 0) {
      // La primera secuencia tiene delay: dormir al Player y esperar
      this._player._directorOverride = true;
      this._playlistDelayActive = true;
      this._playlistDelayElapsed = 0;
      this._playlistDelayDuration = delay;
    } else {
      // Activar inmediatamente la primera entrada
      this._activatePlaylistEntry(0);
    }
  }

  /**
   * Ejecuta una secuencia de cámara en modo preview (sin afectar playlist activa).
   * Si hay una playlist activa, se detiene antes de ejecutar el preview.
   *
   * @param {object} config — configuración de la secuencia a previsualizar
   * @param {string} config.mode — nombre del Camera Mode
   * @param {object} [config.params={}] — parámetros del modo
   * @param {number} [config.duration=10.0] — duración en segundos
   */
  previewSequence(config) {
    if (!config || typeof config !== 'object') {
      console.warn('CameraSystem.previewSequence: se requiere un objeto de configuración');
      return;
    }

    const mode = config.mode;
    const params = config.params || {};
    const duration = config.duration || 10.0;

    // Si hay playlist activa, resetear su estado (preview no es parte de la playlist)
    if (this._playlistActive) {
      this._resetPlaylistState();
    }

    // Ejecutar la secuencia directamente — sin tocar estado de playlist
    this.activateMode(mode, params, duration);
  }

  /**
   * Indica si una playlist de secuencias está en ejecución.
   * @returns {boolean}
   */
  isPlaylistActive() {
    return this._playlistActive;
  }

  // ─── Métodos privados de playlist ──────────────────────────────────────

  /**
   * Interrupción por usuario: detiene la playlist COMPLETA y vuelve a first-person.
   * @private
   */
  _interruptPlaylistAndStop() {
    // Resetear playlist
    this._resetPlaylistState();

    // Restaurar FOV si estábamos en flyby
    if (this._flybyOriginalFov !== null) {
      this._camera.fov = this._flybyOriginalFov;
      this._camera.updateProjectionMatrix();
      this._flybyOriginalFov = null;
    }

    // Despertar al Player y resetear secuencia
    this._player._directorOverride = false;
    this._currentMode = 'first-person';
    this._sequenceActive = false;
    this._elapsed = 0;
    this._duration = 0;
    this._params = {};
    this._returning = false;
  }

  /**
   * Resetea el estado de la playlist sin afectar la secuencia actual.
   * @private
   */
  _resetPlaylistState() {
    this._playlist = [];
    this._playlistIndex = 0;
    this._playlistActive = false;
    this._playlistOptions = {};
    this._playlistDelayActive = false;
    this._playlistDelayElapsed = 0;
    this._playlistDelayDuration = 0;
  }

  /**
   * Activa una entrada específica de la playlist por su índice.
   * Llama a activateMode() con los parámetros de la entrada.
   *
   * @param {number} index — índice en this._playlist
   * @private
   */
  _activatePlaylistEntry(index) {
    const entry = this._playlist[index];
    if (!entry) return;

    const mode = entry.mode;
    const params = entry.params || {};
    const duration = Math.max(MIN_DURATION, Math.min(MAX_DURATION, entry.duration));

    // activateMode maneja la configuración y duerme al Player
    this.activateMode(mode, params, duration);
  }

  // ─── Métodos privados ─────────────────────────────────────────────────

  /**
   * Aplica el modo static: fijar cámara en posición y lookAt dados.
   * @param {object} params — { position: [x,y,z], lookAt: [x,y,z] }
   * @private
   */
  _applyStaticMode(params) {
    const { position, lookAt } = params;

    // Validar que tengamos posición y lookAt
    if (!position || !Array.isArray(position) || position.length < 3) {
      console.warn('CameraSystem: modo static requiere params.position como [x, y, z]');
      return;
    }
    if (!lookAt || !Array.isArray(lookAt) || lookAt.length < 3) {
      console.warn('CameraSystem: modo static requiere params.lookAt como [x, y, z]');
      return;
    }

    // Setear posición de la cámara
    this._staticPosition.set(position[0], position[1], position[2]);
    this._staticLookAt.set(lookAt[0], lookAt[1], lookAt[2]);

    this._camera.position.copy(this._staticPosition);

    // Construir matrix lookAt directamente (como hace el Player)
    this._camera.matrix.lookAt(
      this._staticPosition,
      this._staticLookAt,
      this._upVector
    );
    this._camera.matrix.setPosition(this._staticPosition);
    this._camera.matrixAutoUpdate = false;
    this._camera.matrixWorldNeedsUpdate = true;
  }

  /**
   * Aplica el modo tracking: configura la spline CatmullRom a partir de puntos de control.
   * Calcula la duración basada en la longitud de la curva y la velocidad configurada.
   * @param {object} params — { points: [[x,y,z],...], speed, tension, lookAt: { type, target } }
   * @private
   */
  _applyTrackingMode(params) {
    const { points, speed = 50.0, tension = 0.5, lookAt } = params;

    // Validar puntos de control (2-50 puntos, cada uno [x,y,z])
    if (!points || !Array.isArray(points) || points.length < 2 || points.length > 50) {
      console.warn(
        'CameraSystem: modo tracking requiere params.points como array de 2 a 50 puntos [x,y,z]'
      );
      this.stopSequence();
      return;
    }

    // Validar que cada punto sea un array de 3 números
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!Array.isArray(p) || p.length < 3 ||
          typeof p[0] !== 'number' || typeof p[1] !== 'number' || typeof p[2] !== 'number') {
        console.warn(
          `CameraSystem: modo tracking — punto de control [${i}] inválido, debe ser [x, y, z] numérico`
        );
        this.stopSequence();
        return;
      }
    }

    // Clampear velocidad al rango válido (0.1 - 200.0)
    const clampedSpeed = Math.max(0.1, Math.min(200.0, speed));

    // Clampear tensión al rango válido (0.0 - 1.0)
    const clampedTension = Math.max(0.0, Math.min(1.0, tension));

    // Crear la curva CatmullRom a partir de los puntos de control
    const curvePoints = points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    this._trackingCurve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', clampedTension);

    // Calcular duración basada en longitud de la curva / velocidad
    const curveLength = this._trackingCurve.getLength();
    this._duration = curveLength / clampedSpeed;

    // Guardar configuración de lookAt
    this._trackingLookAt = lookAt || { type: 'path' };

    // Guardar posición actual del jugador (para lookAt type 'player')
    // El jugador estará dormido durante la secuencia, así que capturamos su posición ahora
    this._trackingPlayerPos = new THREE.Vector3(
      this._player.camera.position.x,
      this._player.camera.position.y,
      this._player.camera.position.z
    );

    // Posicionar la cámara en el inicio de la curva
    const startPos = this._trackingCurve.getPointAt(0);
    this._camera.position.copy(startPos);

    // Aplicar lookAt inicial
    const initialLookAt = this._resolveTrackingLookAt(0);
    this._camera.matrix.lookAt(startPos, initialLookAt, this._upVector);
    this._camera.matrix.setPosition(startPos);
    this._camera.matrixAutoUpdate = false;
    this._camera.matrixWorldNeedsUpdate = true;
  }

  /**
   * Resuelve el target de lookAt para el modo tracking según la configuración.
   * @param {number} progress — progreso actual en la curva (0.0 - 1.0)
   * @returns {THREE.Vector3}
   * @private
   */
  _resolveTrackingLookAt(progress) {
    const lookAtConfig = this._trackingLookAt || { type: 'path' };

    switch (lookAtConfig.type) {
      case 'fixed': {
        // Mirar a un punto fijo definido en target
        const t = lookAtConfig.target;
        if (t && Array.isArray(t) && t.length >= 3) {
          return new THREE.Vector3(t[0], t[1], t[2]);
        }
        // Fallback: mirar hacia adelante en el path
        return this._trackingCurve.getPointAt(Math.min(progress + 0.01, 1.0));
      }

      case 'player': {
        // Mirar hacia la posición del jugador capturada al inicio
        return this._trackingPlayerPos.clone();
      }

      case 'path':
      default: {
        // Mirar hacia el siguiente punto del path
        return this._trackingCurve.getPointAt(Math.min(progress + 0.01, 1.0));
      }
    }
  }

  /**
   * Inicializa el modo orbit: valida parámetros y aplica defaults.
   * Calcula la duración basada en la velocidad angular si no se proporcionó explícitamente.
   *
   * @param {object} params — configuración del modo orbit
   * @param {number[]} [params.focalPoint=[0,0,0]] — punto alrededor del cual orbita
   * @param {number} [params.angularSpeed=0.5] — radianes/segundo (0.1 a 10.0)
   * @param {number} [params.radius=200] — distancia al punto focal (10 a 2000)
   * @param {number} [params.altitude=0] — altura relativa al punto focal (-500 a 500)
   * @param {string} [params.direction='counterclockwise'] — 'clockwise' | 'counterclockwise'
   * @param {number} [params.startAngle=0] — ángulo inicial en radianes
   * @private
   */
  _initOrbitMode(params) {
    // Clampear velocidad angular al rango [0.1, 10.0], default 0.5
    const rawAngularSpeed = params.angularSpeed != null ? params.angularSpeed : 0.5;
    const angularSpeed = Math.max(0.1, Math.min(10.0, rawAngularSpeed));

    // Clampear radio al rango [10, 2000], default 200
    const rawRadius = params.radius != null ? params.radius : 200;
    const radius = Math.max(10, Math.min(2000, rawRadius));

    // Clampear altitud al rango [-500, 500], default 0
    const rawAltitude = params.altitude != null ? params.altitude : 0;
    const altitude = Math.max(-500, Math.min(500, rawAltitude));

    // Dirección: clockwise o counterclockwise (default)
    const direction = params.direction === 'clockwise' ? 'clockwise' : 'counterclockwise';

    // Ángulo inicial en radianes (default 0)
    const startAngle = params.startAngle != null ? params.startAngle : 0;

    // Punto focal (default [0, 0, 0])
    const focalPoint = (Array.isArray(params.focalPoint) && params.focalPoint.length >= 3)
      ? params.focalPoint
      : [0, 0, 0];

    // Guardar parámetros normalizados
    this._params = {
      focalPoint,
      angularSpeed,
      radius,
      altitude,
      direction,
      startAngle,
    };

    // Posicionar cámara en el ángulo inicial
    this._orbitFocalPoint.set(focalPoint[0], focalPoint[1], focalPoint[2]);

    const initAngle = startAngle;
    const camX = focalPoint[0] + Math.cos(initAngle) * radius;
    const camY = focalPoint[1] + altitude;
    const camZ = focalPoint[2] + Math.sin(initAngle) * radius;

    this._orbitPosition.set(camX, camY, camZ);
    this._camera.position.copy(this._orbitPosition);

    // LookAt hacia el punto focal
    this._camera.matrix.lookAt(
      this._orbitPosition,
      this._orbitFocalPoint,
      this._upVector
    );
    this._camera.matrix.setPosition(this._orbitPosition);
    this._camera.matrixAutoUpdate = false;
    this._camera.matrixWorldNeedsUpdate = true;
  }

  /**
   * Actualiza la posición de la cámara en modo orbit cada frame.
   * Calcula el ángulo actual basado en el tiempo transcurrido.
   * @private
   */
  _updateOrbitMode() {
    const p = this._params;

    // Calcular dirección de giro: counterclockwise = +1, clockwise = -1
    const dirMultiplier = p.direction === 'clockwise' ? -1 : 1;

    // Calcular ángulo actual
    const currentAngle = p.startAngle + p.angularSpeed * this._elapsed * dirMultiplier;

    // Calcular posición orbital
    const camX = p.focalPoint[0] + Math.cos(currentAngle) * p.radius;
    const camY = p.focalPoint[1] + p.altitude;
    const camZ = p.focalPoint[2] + Math.sin(currentAngle) * p.radius;

    this._orbitPosition.set(camX, camY, camZ);
    this._camera.position.copy(this._orbitPosition);

    // LookAt hacia el punto focal
    this._orbitFocalPoint.set(p.focalPoint[0], p.focalPoint[1], p.focalPoint[2]);
    this._camera.matrix.lookAt(
      this._orbitPosition,
      this._orbitFocalPoint,
      this._upVector
    );
    this._camera.matrix.setPosition(this._orbitPosition);
    this._camera.matrixAutoUpdate = false;
    this._camera.matrixWorldNeedsUpdate = true;
  }

  /**
   * Inicializa el modo dolly: valida parámetros y aplica defaults.
   * Calcula la duración basada en la distancia entre start/end y la velocidad.
   *
   * @param {object} params — configuración del modo dolly
   * @param {number[]} params.startPosition — posición de inicio [x, y, z] (obligatorio)
   * @param {number[]} params.endPosition — posición de fin [x, y, z] (obligatorio)
   * @param {number} [params.speed=50.0] — unidades/segundo (0.1 a 200.0)
   * @param {number[]} [params.lookAt] — punto fijo al que mira durante el recorrido
   * @param {boolean} [params.lookAtInterpolated=false] — si true, interpola lookAt entre start y end
   * @private
   */
  _initDollyMode(params) {
    // Validar posiciones obligatorias
    if (!params.startPosition || !Array.isArray(params.startPosition) || params.startPosition.length < 3) {
      console.warn('CameraSystem: modo dolly requiere params.startPosition como [x, y, z]');
      this.stopSequence();
      return;
    }
    if (!params.endPosition || !Array.isArray(params.endPosition) || params.endPosition.length < 3) {
      console.warn('CameraSystem: modo dolly requiere params.endPosition como [x, y, z]');
      this.stopSequence();
      return;
    }

    // Clampear velocidad al rango [0.1, 200.0], default 50.0
    const rawSpeed = params.speed != null ? params.speed : 50.0;
    const speed = Math.max(0.1, Math.min(200.0, rawSpeed));

    // Calcular distancia entre start y end
    this._dollyStart.set(params.startPosition[0], params.startPosition[1], params.startPosition[2]);
    this._dollyEnd.set(params.endPosition[0], params.endPosition[1], params.endPosition[2]);
    const distance = this._dollyStart.distanceTo(this._dollyEnd);

    // Calcular duración basada en distancia/velocidad
    const calculatedDuration = distance > 0 ? distance / speed : MIN_DURATION;
    this._duration = Math.max(MIN_DURATION, Math.min(MAX_DURATION, calculatedDuration));

    // Guardar parámetros normalizados
    this._params = {
      startPosition: params.startPosition,
      endPosition: params.endPosition,
      speed,
      lookAt: (Array.isArray(params.lookAt) && params.lookAt.length >= 3) ? params.lookAt : null,
      lookAtInterpolated: !!params.lookAtInterpolated,
    };

    // Posicionar cámara en el punto de inicio
    this._dollyPosition.copy(this._dollyStart);
    this._camera.position.copy(this._dollyPosition);

    // Aplicar lookAt inicial
    const lookAtTarget = this._resolveDollyLookAt(0);
    this._camera.matrix.lookAt(this._dollyPosition, lookAtTarget, this._upVector);
    this._camera.matrix.setPosition(this._dollyPosition);
    this._camera.matrixAutoUpdate = false;
    this._camera.matrixWorldNeedsUpdate = true;
  }

  /**
   * Actualiza la posición de la cámara en modo dolly cada frame.
   * Interpola linealmente entre startPosition y endPosition según el progreso.
   * @private
   */
  _updateDollyMode() {
    const p = this._params;

    // Calcular progreso (0.0 a 1.0) basado en elapsed/duration
    const progress = Math.min(this._elapsed / this._duration, 1.0);

    // Interpolar posición linealmente (lerp)
    this._dollyStart.set(p.startPosition[0], p.startPosition[1], p.startPosition[2]);
    this._dollyEnd.set(p.endPosition[0], p.endPosition[1], p.endPosition[2]);
    this._dollyPosition.lerpVectors(this._dollyStart, this._dollyEnd, progress);

    this._camera.position.copy(this._dollyPosition);

    // Resolver lookAt según configuración
    const lookAtTarget = this._resolveDollyLookAt(progress);

    // Aplicar matrix lookAt
    this._camera.matrix.lookAt(this._dollyPosition, lookAtTarget, this._upVector);
    this._camera.matrix.setPosition(this._dollyPosition);
    this._camera.matrixAutoUpdate = false;
    this._camera.matrixWorldNeedsUpdate = true;
  }

  /**
   * Resuelve el target de lookAt para el modo dolly según la configuración.
   * - Si lookAt está definido: punto fijo
   * - Si lookAtInterpolated: interpola entre startPosition y endPosition
   * - Default: mira hacia endPosition
   *
   * @param {number} progress — progreso actual (0.0 a 1.0)
   * @returns {THREE.Vector3}
   * @private
   */
  _resolveDollyLookAt(progress) {
    const p = this._params;

    if (p.lookAt) {
      // Punto fijo de lookAt
      this._dollyLookAt.set(p.lookAt[0], p.lookAt[1], p.lookAt[2]);
      return this._dollyLookAt;
    }

    if (p.lookAtInterpolated) {
      // Interpolar lookAt entre start y end
      const startLookAt = new THREE.Vector3(p.startPosition[0], p.startPosition[1], p.startPosition[2]);
      const endLookAt = new THREE.Vector3(p.endPosition[0], p.endPosition[1], p.endPosition[2]);
      this._dollyLookAt.lerpVectors(startLookAt, endLookAt, progress);
      return this._dollyLookAt;
    }

    // Default: mirar hacia la posición final
    this._dollyLookAt.set(p.endPosition[0], p.endPosition[1], p.endPosition[2]);
    return this._dollyLookAt;
  }

  /**
   * Inicializa el modo crane: valida parámetros y aplica defaults.
   * Guarda los parámetros normalizados en this._params.
   *
   * @param {object} params — configuración del modo crane
   * @param {number} params.startY — altitud de inicio (obligatorio)
   * @param {number} params.endY — altitud final (obligatorio)
   * @param {number} [params.speed=30.0] — velocidad en unidades/segundo (0.1 a 100.0)
   * @param {number[]} [params.focalPoint=[0,60,-100]] — punto al que mira la cámara
   * @param {number} [params.horizontalX=0] — posición X fija del crane
   * @param {number} [params.horizontalZ=0] — posición Z fija del crane
   * @param {number} [params.sweepAngle=0] — radianes de barrido horizontal (0 a 2π)
   * @param {number} [params.sweepRadius=200] — radio del barrido si sweepAngle > 0
   * @private
   */
  _initCraneMode(params) {
    // Validar parámetros obligatorios
    if (params.startY == null || params.endY == null) {
      console.warn('CameraSystem: modo crane requiere params.startY y params.endY');
      this.stopSequence();
      return;
    }

    if (!Array.isArray(params.focalPoint) && params.focalPoint != null) {
      console.warn('CameraSystem: modo crane focalPoint debe ser [x, y, z]');
      this.stopSequence();
      return;
    }

    // Velocidad con clamp a [0.1, 100.0] y default 30.0
    const rawSpeed = params.speed != null ? params.speed : 30.0;
    const speed = Math.max(0.1, Math.min(100.0, rawSpeed));

    // Calcular duración basada en la distancia vertical y la velocidad
    const distance = Math.abs(params.endY - params.startY);
    // Evitar duración 0 si startY === endY (usar un mínimo razonable)
    const calculatedDuration = distance > 0 ? distance / speed : MIN_DURATION;
    this._duration = Math.max(MIN_DURATION, Math.min(MAX_DURATION, calculatedDuration));

    // Aplicar defaults y guardar parámetros normalizados
    const sweepAngle = params.sweepAngle != null ? params.sweepAngle : 0;

    this._params = {
      startY: params.startY,
      endY: params.endY,
      speed: speed,
      focalPoint: params.focalPoint || [0, 60, -100],
      horizontalX: params.horizontalX != null ? params.horizontalX : 0,
      horizontalZ: params.horizontalZ != null ? params.horizontalZ : 0,
      sweepAngle: Math.max(0, Math.min(Math.PI * 2, sweepAngle)),
      sweepRadius: params.sweepRadius != null ? params.sweepRadius : 200,
    };

    // Posicionar cámara en el punto inicial
    const initX = this._params.sweepAngle > 0
      ? this._params.horizontalX + Math.cos(0) * this._params.sweepRadius
      : this._params.horizontalX;
    const initZ = this._params.sweepAngle > 0
      ? this._params.horizontalZ + Math.sin(0) * this._params.sweepRadius
      : this._params.horizontalZ;

    this._cranePosition.set(initX, this._params.startY, initZ);
    this._camera.position.copy(this._cranePosition);

    // Aplicar lookAt inicial
    this._craneFocalPoint.set(
      this._params.focalPoint[0],
      this._params.focalPoint[1],
      this._params.focalPoint[2]
    );

    this._camera.matrix.lookAt(
      this._cranePosition,
      this._craneFocalPoint,
      this._upVector
    );
    this._camera.matrix.setPosition(this._cranePosition);
    this._camera.matrixAutoUpdate = false;
    this._camera.matrixWorldNeedsUpdate = true;
  }

  /**
   * Inicializa el modo flyby: sobrevuelo rápido a baja altitud siguiendo dirección del Player.
   * Captura la dirección actual, calcula velocidad aumentada, y aplica FOV ampliado.
   *
   * @param {object} params — configuración del modo flyby
   * @param {number} [params.altitudeOffset=30] — altura sobre el terreno (10 a 100)
   * @param {number} [params.speedMultiplier=3.0] — multiplicador de velocidad del Player (2 a 10)
   * @param {number} [params.fovTarget=90] — FOV durante el flyby (hasta 120°)
   * @private
   */
  _initFlybyMode(params) {
    // Clampear altitudeOffset al rango [10, 100], default 30
    const rawAltitude = params.altitudeOffset != null ? params.altitudeOffset : 30;
    const altitudeOffset = Math.max(10, Math.min(100, rawAltitude));

    // Clampear speedMultiplier al rango [2, 10], default 3.0
    const rawMultiplier = params.speedMultiplier != null ? params.speedMultiplier : 3.0;
    const speedMultiplier = Math.max(2, Math.min(10, rawMultiplier));

    // Clampear fovTarget al rango [30, 120], default 90
    const rawFov = params.fovTarget != null ? params.fovTarget : 90;
    const fovTarget = Math.max(30, Math.min(120, rawFov));

    // Capturar dirección actual del Player (ángulo de movimiento)
    // El Player usa camera.matrix para moverse, extraemos la dirección forward
    const playerPos = this._camera.position.clone();
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this._camera.quaternion);
    forward.y = 0; // Proyectar en plano horizontal
    forward.normalize();

    // Si el vector forward es cero (mirando recto arriba/abajo), usar -Z por defecto
    if (forward.lengthSq() < 0.001) {
      forward.set(0, 0, -1);
    }

    // Calcular velocidad base del Player (usar velocity si está disponible, sino default)
    const playerVelocity = this._player.velocity != null ? this._player.velocity : 150;
    const enhancedSpeed = playerVelocity * speedMultiplier;

    // Guardar parámetros normalizados
    this._params = {
      altitudeOffset,
      speedMultiplier,
      fovTarget,
      enhancedSpeed,
    };

    // Guardar dirección de vuelo (constante durante toda la secuencia)
    this._flybyDirection.copy(forward);

    // Posicionar cámara en la posición actual del Player a baja altitud
    this._flybyPosition.set(playerPos.x, altitudeOffset, playerPos.z);
    this._camera.position.copy(this._flybyPosition);

    // Guardar FOV original y aplicar FOV ampliado para efecto de velocidad
    this._flybyOriginalFov = this._camera.fov;
    this._camera.fov = fovTarget;
    this._camera.updateProjectionMatrix();

    // Calcular punto lookAt hacia adelante en la dirección de vuelo
    this._flybyLookAt.copy(this._flybyPosition).addScaledVector(this._flybyDirection, 100);
    this._flybyLookAt.y = altitudeOffset; // Mantener mirada a nivel de vuelo

    // Aplicar matrix lookAt
    this._camera.matrix.lookAt(
      this._flybyPosition,
      this._flybyLookAt,
      this._upVector
    );
    this._camera.matrix.setPosition(this._flybyPosition);
    this._camera.matrixAutoUpdate = false;
    this._camera.matrixWorldNeedsUpdate = true;
  }

  /**
   * Actualiza la posición de la cámara en modo flyby cada frame.
   * Avanza en la dirección capturada con velocidad aumentada, mantiene altitud baja.
   *
   * @param {number} dt — delta time del frame
   * @private
   */
  _updateFlybyMode(dt) {
    const p = this._params;

    // Avanzar posición en la dirección de vuelo con velocidad aumentada
    const displacement = p.enhancedSpeed * dt;
    this._flybyPosition.addScaledVector(this._flybyDirection, displacement);

    // Mantener la altitud fija (baja altitud sobre terreno)
    this._flybyPosition.y = p.altitudeOffset;

    // Actualizar posición de la cámara
    this._camera.position.copy(this._flybyPosition);

    // LookAt hacia adelante en la dirección de movimiento
    this._flybyLookAt.copy(this._flybyPosition).addScaledVector(this._flybyDirection, 100);
    this._flybyLookAt.y = p.altitudeOffset;

    // Aplicar matrix lookAt
    this._camera.matrix.lookAt(
      this._flybyPosition,
      this._flybyLookAt,
      this._upVector
    );
    this._camera.matrix.setPosition(this._flybyPosition);
    this._camera.matrixAutoUpdate = false;
    this._camera.matrixWorldNeedsUpdate = true;
  }

  // ─── Shake Overlay ──────────────────────────────────────────────────────

  /**
   * Habilita el modo shake como overlay sobre el modo de cámara activo.
   * El shake NO reemplaza el modo actual — se superpone como vibración de alta frecuencia.
   *
   * @param {object} [params={}] — parámetros del shake
   * @param {number} [params.amplitude=2.0] — desplazamiento máximo en unidades (0.1-20.0)
   * @param {number} [params.frequency=20] — Hz de vibración (1-60)
   */
  enableShake(params = {}) {
    this._shakeEnabled = true;
    this._shakeTime = 0;

    // Clampear amplitud al rango válido
    const rawAmplitude = params.amplitude != null ? params.amplitude : SHAKE_DEFAULT_AMPLITUDE;
    this._shakeAmplitude = Math.max(SHAKE_MIN_AMPLITUDE, Math.min(SHAKE_MAX_AMPLITUDE, rawAmplitude));

    // Clampear frecuencia al rango válido
    const rawFrequency = params.frequency != null ? params.frequency : SHAKE_DEFAULT_FREQUENCY;
    this._shakeFrequency = Math.max(SHAKE_MIN_FREQUENCY, Math.min(SHAKE_MAX_FREQUENCY, rawFrequency));

    // Resetear offset acumulado
    this._shakeOffset.set(0, 0, 0);
  }

  /**
   * Deshabilita el shake overlay y remueve cualquier offset residual.
   * La cámara vuelve a su posición natural del modo activo.
   */
  disableShake() {
    if (!this._shakeEnabled) return;

    // Remover el offset aplicado en el último frame para restaurar posición limpia
    this._camera.position.sub(this._shakeOffset);

    // Recalcular matrix sin shake
    this._camera.matrix.setPosition(this._camera.position);
    this._camera.matrixWorldNeedsUpdate = true;

    // Resetear estado
    this._shakeEnabled = false;
    this._shakeOffset.set(0, 0, 0);
    this._shakeTime = 0;
  }

  /**
   * Indica si el shake overlay está activo.
   * @returns {boolean}
   */
  isShakeEnabled() {
    return this._shakeEnabled;
  }

  /**
   * Aplica el desplazamiento de shake sobre la posición actual de la cámara.
   * Usa funciones seno con fases distintas por eje para generar vibración pseudo-aleatoria.
   * Se llama DESPUÉS de que el modo activo haya posicionado la cámara.
   *
   * @param {number} dt — delta time del frame
   * @private
   */
  _applyShakeOverlay(dt) {
    // Avanzar el reloj del shake
    this._shakeTime += dt;

    const t = this._shakeTime;
    const freq = this._shakeFrequency;
    const amp = this._shakeAmplitude;

    // Desfases de fase por eje para que no se muevan igual (efecto más orgánico)
    // Cada eje usa una frecuencia ligeramente diferente y fase distinta
    const phaseX = 0.0;
    const phaseY = 2.094;    // ~2π/3, desfase de 120°
    const phaseZ = 4.189;    // ~4π/3, desfase de 240°

    // Calcular desplazamiento por eje usando sin() con armónicos para mayor naturalidad
    const twoPiFreq = Math.PI * 2 * freq;
    const offsetX = amp * (
      Math.sin(twoPiFreq * t + phaseX) * 0.6 +
      Math.sin(twoPiFreq * 1.7 * t + 1.3) * 0.4  // armónico para ruido
    );
    const offsetY = amp * (
      Math.sin(twoPiFreq * t + phaseY) * 0.5 +
      Math.sin(twoPiFreq * 2.3 * t + 0.7) * 0.3  // armónico
    ) * 0.7; // Eje Y atenuado para que el shake sea más horizontal
    const offsetZ = amp * (
      Math.sin(twoPiFreq * t + phaseZ) * 0.6 +
      Math.sin(twoPiFreq * 1.4 * t + 3.1) * 0.4  // armónico
    );

    // Guardar nuevo offset
    this._shakeOffset.set(offsetX, offsetY, offsetZ);

    // Aplicar desplazamiento sobre la posición actual de la cámara
    this._camera.position.add(this._shakeOffset);

    // Actualizar la posición en la matrix para mantener consistencia
    this._camera.matrix.setPosition(this._camera.position);
    this._camera.matrixWorldNeedsUpdate = true;
  }

  // ─── LookAt Dinámico ────────────────────────────────────────────────────

  /**
   * Resuelve un target de lookAt dinámico, utilizable por cualquier modo de cámara.
   * Generaliza el concepto de _resolveTrackingLookAt para orbit, dolly, crane, etc.
   *
   * Tipos de lookAt soportados:
   * - 'fixed': usa lookAtConfig.target como Vector3 [x,y,z]
   * - 'player': usa la posición del player capturada al inicio de la secuencia
   * - 'webcamCenter': calcula el centro del círculo de webcam screens (Config.webcam.screenRadius)
   * - 'interpolated': lerp entre lookAtConfig.from y lookAtConfig.to basado en progress
   *
   * @param {object} lookAtConfig — configuración del lookAt dinámico
   * @param {string} lookAtConfig.type — 'fixed' | 'player' | 'webcamCenter' | 'interpolated'
   * @param {number[]} [lookAtConfig.target] — punto fijo [x,y,z] para type='fixed'
   * @param {number[]} [lookAtConfig.from] — punto de inicio [x,y,z] para type='interpolated'
   * @param {number[]} [lookAtConfig.to] — punto final [x,y,z] para type='interpolated'
   * @param {number} progress — progreso actual de la secuencia (0.0 - 1.0)
   * @returns {THREE.Vector3} — vector de posición hacia el cual la cámara debe mirar
   */
  _resolveDynamicLookAt(lookAtConfig, progress) {
    if (!lookAtConfig || !lookAtConfig.type) {
      // Fallback: mirar al origen si no hay configuración
      this._dynamicLookAtTarget.set(0, 0, 0);
      return this._dynamicLookAtTarget;
    }

    switch (lookAtConfig.type) {
      case 'fixed': {
        // Punto fijo definido en target [x, y, z]
        const t = lookAtConfig.target;
        if (t && Array.isArray(t) && t.length >= 3) {
          this._dynamicLookAtTarget.set(t[0], t[1], t[2]);
        } else {
          // Fallback si target no es válido
          console.warn('CameraSystem._resolveDynamicLookAt: type "fixed" requiere target como [x,y,z]');
          this._dynamicLookAtTarget.set(0, 0, 0);
        }
        return this._dynamicLookAtTarget;
      }

      case 'player': {
        // Usar la posición actual de la cámara del player (capturada al inicio de secuencia)
        if (this._trackingPlayerPos) {
          this._dynamicLookAtTarget.copy(this._trackingPlayerPos);
        } else {
          // Si no se capturó la posición, usar la posición actual del player
          this._dynamicLookAtTarget.set(
            this._player.camera.position.x,
            this._player.camera.position.y,
            this._player.camera.position.z
          );
        }
        return this._dynamicLookAtTarget;
      }

      case 'webcamCenter': {
        // Centro del círculo de webcam screens: (0, screenAltitude, 0) relativo al player
        // Las pantallas orbitan alrededor del player a screenRadius, así que el centro
        // del círculo es la posición del player a la altitud de las pantallas
        const webcamConfig = Config.webcam;
        const screenAltitude = webcamConfig ? (webcamConfig.screenAltitude || 100) : 100;

        // El centro del círculo de webcam screens está en la posición del player
        // a la altitud configurada
        const playerPos = this._player.camera.position;
        this._dynamicLookAtTarget.set(playerPos.x, screenAltitude, playerPos.z);
        return this._dynamicLookAtTarget;
      }

      case 'interpolated': {
        // Interpolar linealmente entre 'from' y 'to' según progress
        const from = lookAtConfig.from;
        const to = lookAtConfig.to;

        if (!from || !Array.isArray(from) || from.length < 3) {
          console.warn('CameraSystem._resolveDynamicLookAt: type "interpolated" requiere from como [x,y,z]');
          this._dynamicLookAtTarget.set(0, 0, 0);
          return this._dynamicLookAtTarget;
        }
        if (!to || !Array.isArray(to) || to.length < 3) {
          console.warn('CameraSystem._resolveDynamicLookAt: type "interpolated" requiere to como [x,y,z]');
          this._dynamicLookAtTarget.set(0, 0, 0);
          return this._dynamicLookAtTarget;
        }

        this._dynamicLookAtFrom.set(from[0], from[1], from[2]);
        this._dynamicLookAtTo.set(to[0], to[1], to[2]);
        this._dynamicLookAtTarget.lerpVectors(this._dynamicLookAtFrom, this._dynamicLookAtTo, progress);
        return this._dynamicLookAtTarget;
      }

      default: {
        console.warn(
          `CameraSystem._resolveDynamicLookAt: tipo '${lookAtConfig.type}' no soportado. ` +
          `Tipos válidos: fixed, player, webcamCenter, interpolated`
        );
        this._dynamicLookAtTarget.set(0, 0, 0);
        return this._dynamicLookAtTarget;
      }
    }
  }
}
