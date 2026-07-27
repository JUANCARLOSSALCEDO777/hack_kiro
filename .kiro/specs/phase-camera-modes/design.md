# Technical Design Document

## Overview

Este diseño técnico describe cómo unificar el sistema de fases (PhaseManager) con el CameraSystem, permitiendo que cada Mood Preset defina opcionalmente un modo de cámara cinematográfico que se activa automáticamente cuando la fase asociada se activa. Se modifica el schema de presets, el flujo de `_onPhaseChange`, el `activatePreset`, la DebugGUI y el TransportGUI.

## Architecture

### Componentes afectados

```
┌─────────────────────────────────────────────────────────────────┐
│                     ExperienceDirector                           │
│                                                                 │
│  _onPhaseChange(phaseIndex)                                     │
│    ├─ Calcula Phase_Duration                                    │
│    ├─ stopSequence() si hay modo previo activo                  │
│    ├─ activatePreset(name, transitionDuration)                  │
│    └─ _activatePhaseCameraMode(presetConfig, phaseDuration)     │
│                                                                 │
│  activatePreset(name, duration)                                 │
│    ├─ TransitionEngine.startTransition (bloom, skybox, camera)  │
│    ├─ _applyDiscreteValues (terrainMode, lightPattern)          │
│    └─ (NO toca CameraSystem — eso lo hace _onPhaseChange)      │
│                                                                 │
│  _activatePhaseCameraMode(presetConfig, phaseDuration)  [NUEVO] │
│    ├─ Lee camera.cameraMode del preset                          │
│    ├─ Si null/first-person → stopSequence()                     │
│    └─ Si modo válido → CameraSystem.activateMode(mode, params,  │
│                                                    phaseDuration)│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       CameraSystem                              │
│                                                                 │
│  getCurrentParams()  [NUEVO]                                    │
│    └─ return _sequenceActive ? { ...this._params } : null       │
│                                                                 │
│  getRemainingDuration()  [NUEVO]                                │
│    └─ return _sequenceActive ?                                  │
│         Math.max(0, _duration - _elapsed) : 0                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         DebugGUI                                │
│                                                                 │
│  _buildCameraModeParamsFolder()  [NUEVO]                        │
│    ├─ Destruye sub-folder anterior si existe                    │
│    ├─ Lee modo seleccionado del dropdown                        │
│    ├─ Crea sub-folder con controles específicos del modo        │
│    └─ onChange → aplica a CameraSystem._params en tiempo real   │
│                                                                 │
│  _buildBloomFolder()  [NUEVO]                                   │
│    └─ Controles: strength, radius, threshold (number inputs)    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       TransportGUI                              │
│                                                                 │
│  _captureCurrentPhase()  [MODIFICADO]                           │
│    └─ Agrega camera.cameraMode leyendo de CameraSystem          │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo de datos: Cambio de fase con Camera Mode

```
MusicTime cruza trigger
       │
       ▼
PhaseManager.update() → detecta nuevo phaseIndex
       │
       ▼
_onPhaseChange(phaseIndex)
       │
       ├─ 1. Busca presetName en _phaseToPreset map
       │
       ├─ 2. Calcula phaseDuration:
       │      triggers = _phaseManager.getTriggers()
       │      currentTrigger = triggers.find(t => t.phaseIndex === phaseIndex)
       │      nextTrigger = triggers[indexOf(currentTrigger) + 1]
       │      phaseDuration = nextTrigger ? (nextTrigger.time - currentTrigger.time) : 60
       │
       ├─ 3. Si CameraSystem.isSequenceActive() → stopSequence()
       │
       ├─ 4. activatePreset(presetName, transitionDuration)
       │      └─ Interpola bloom, skybox, camera.params (first-person)
       │
       └─ 5. _activatePhaseCameraMode(presetConfig, phaseDuration)
              ├─ presetConfig.camera.cameraMode === null → stopSequence()
              └─ presetConfig.camera.cameraMode.mode === 'orbit' (etc.)
                    → CameraSystem.activateMode('orbit', params, phaseDuration)
```

## Data Models

### Camera_Mode_Config (campo opcional en preset.camera)

```javascript
// Estructura del campo camera.cameraMode dentro de un Mood Preset
{
  mode: 'orbit' | 'dolly' | 'crane' | 'tracking' | 'flyby' | 'static' | 'shake',
  params: {
    // Específicos por modo — ver Req 6
  }
}

// Ejemplo completo de un preset con cameraMode:
{
  terrainMode: 'spectrum',
  lightPattern: 'radialPulse',
  bloom: { strength: 2.0, radius: 0.5, threshold: 0.3 },
  skybox: { hueRange: [0.6, 0.95], saturation: 0.8, baseLightness: 0.04, pulseIntensity: 0.12 },
  camera: {
    mode: 'first-person',
    params: { velocity: 150, altitude: 60, targetDistance: 150, fov: 30 },
    cameraMode: {
      mode: 'orbit',
      params: {
        focalPoint: [0, 0, 0],
        angularSpeed: 0.5,
        radius: 200,
        altitude: 80,
        direction: 'counterclockwise',
        startAngle: 0
      }
    }
  },
  beatThresholds: { bass: 150, mid: 100, high: 80 }
}

// Preset sin modo cinematográfico (first-person puro):
{
  // ...
  camera: {
    mode: 'first-person',
    params: { velocity: 80, altitude: 100, targetDistance: 250, fov: 25 },
    cameraMode: null  // o simplemente omitido
  }
}
```

### Parámetros por modo (referencia rápida)

```javascript
// orbit
{ focalPoint: [x,y,z], angularSpeed: Number, radius: Number, altitude: Number, direction: String, startAngle: Number }

// dolly
{ startPosition: [x,y,z], endPosition: [x,y,z], lookAt: [x,y,z]|null, speed: Number }

// crane
{ startY: Number, endY: Number, horizontalX: Number, horizontalZ: Number, sweepAngle: Number, sweepRadius: Number, focalPoint: [x,y,z], speed: Number }

// tracking
{ points: [[x,y,z], ...], speed: Number, tension: Number, lookAt: { type: 'path'|'fixed'|'player', target?: [x,y,z] } }

// flyby
{ altitudeOffset: Number, speedMultiplier: Number, fovTarget: Number }

// static
{ position: [x,y,z], lookAt: [x,y,z] }

// shake
{ amplitude: Number, frequency: Number }
```

## Interface Definitions

### CameraSystem — Nuevos métodos públicos

```javascript
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
```

### ExperienceDirector — Nuevo método privado

```javascript
/**
 * Activa el modo de cámara cinematográfico definido en un preset.
 * Llamado desde _onPhaseChange después de activatePreset.
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

  // Activar el modo cinematográfico con la duración de la fase
  this._cameraSystem.activateMode(
    cameraModeConfig.mode,
    cameraModeConfig.params || {},
    phaseDuration
  );
}
```

### ExperienceDirector — Modificación de _onPhaseChange

```javascript
_onPhaseChange(phaseIndex) {
  const presetName = this._phaseToPreset.get(phaseIndex);

  this._eventBus.emit('phaseChange', {
    phaseIndex,
    presetName: presetName || null,
    timestamp: Date.now(),
  });

  if (!presetName) {
    console.warn(`ExperienceDirector: no hay preset mapeado para fase ${phaseIndex}`);
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
 * Calcula la duración de una fase basándose en los triggers del PhaseManager.
 * @param {number} phaseIndex — Índice de la fase actual
 * @returns {number} — Duración en segundos
 * @private
 */
_calculatePhaseDuration(phaseIndex) {
  const triggers = this._phaseManager.getTriggers();
  const currentIdx = triggers.findIndex(t => t.phaseIndex === phaseIndex);

  if (currentIdx < 0) return 60;

  const nextTrigger = triggers[currentIdx + 1];
  if (!nextTrigger) return 60; // Última fase: 60s default

  return nextTrigger.time - triggers[currentIdx].time;
}
```

### ExperienceDirector — Validación extendida en registerPreset

```javascript
// Agregar al final de _validatePresetConfig:
_validatePresetConfig(config) {
  // ... validación existente ...

  // Validar camera.cameraMode si está presente
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
```

### TransportGUI — Modificación de _captureCurrentPhase

```javascript
// Dentro de _captureCurrentPhase(), reemplazar el bloque de camera:
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
```

### DebugGUI — Controles dinámicos de Camera Mode

```javascript
/**
 * Construye/reconstruye el sub-folder de parámetros según el modo seleccionado.
 * Se llama desde el onChange del dropdown de Camera Mode.
 *
 * @param {string} mode — Modo seleccionado
 * @private
 */
_buildCameraModeParamsFolder(mode) {
  // Destruir folder anterior si existe
  if (this._camModeParamsFolder) {
    this._camModeParamsFolder.destroy();
    this._camModeParamsFolder = null;
  }

  // No crear folder para first-person
  if (mode === 'first-person') return;

  this._camModeParamsFolder = this._folder.addFolder(`⚙️ ${mode} params`);

  // Estado reactivo para los controles del modo
  this._camModeState = this._getDefaultParamsForMode(mode);

  // Callback genérico: aplica cambios al CameraSystem en tiempo real
  const applyParams = () => {
    const camSystem = this._director.getCameraSystem();
    if (camSystem.isSequenceActive()) {
      Object.assign(camSystem._params, this._camModeState);
    }
  };

  // Construir controles específicos según el modo
  switch (mode) {
    case 'orbit':
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
      // startPosition X/Y/Z, endPosition X/Y/Z, lookAt X/Y/Z, speed
      // ... similar pattern ...
      break;

    case 'crane':
      // startY, endY, horizontalX, horizontalZ, sweepAngle, sweepRadius, focalPoint, speed
      break;

    case 'tracking':
      // speed, tension, lookAt type dropdown, botón "Agregar punto"
      this._camModeParamsFolder.add(this._camModeState, 'speed').name('Velocidad').step(1).onChange(applyParams);
      this._camModeParamsFolder.add(this._camModeState, 'tension').name('Tensión').step(0.1).onChange(applyParams);
      this._camModeParamsFolder.add(this._camModeState, 'lookAtType', ['path', 'fixed', 'player']).name('LookAt').onChange(applyParams);
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
      this._camModeParamsFolder.add(this._camModeState, 'speedMultiplier').name('Multiplicador').step(0.5).onChange(applyParams);
      this._camModeParamsFolder.add(this._camModeState, 'altitudeOffset').name('Altitud Offset').step(1).onChange(applyParams);
      this._camModeParamsFolder.add(this._camModeState, 'fovTarget').name('FOV Target').step(1).onChange(applyParams);
      break;

    case 'static':
      // position X/Y/Z, lookAt X/Y/Z
      break;

    case 'shake':
      this._camModeParamsFolder.add(this._camModeState, 'amplitude').name('Amplitud').step(0.1).onChange(applyParams);
      this._camModeParamsFolder.add(this._camModeState, 'frequency').name('Frecuencia').step(1).onChange(applyParams);
      break;
  }

  // Cerrar por defecto para no ocupar espacio
  this._camModeParamsFolder.close();
}

/**
 * Retorna los valores default de parámetros según el modo.
 */
_getDefaultParamsForMode(mode) {
  switch (mode) {
    case 'orbit': return { focalPointX: 0, focalPointY: 0, focalPointZ: 0, angularSpeed: 0.5, radius: 200, altitude: 0, direction: 'counterclockwise', startAngle: 0 };
    case 'dolly': return { startX: 0, startY: 60, startZ: 200, endX: 0, endY: 60, endZ: -200, lookAtX: 0, lookAtY: 0, lookAtZ: 0, speed: 50 };
    case 'crane': return { startY: 50, endY: 200, horizontalX: 0, horizontalZ: 0, sweepAngle: 0, sweepRadius: 200, focalPointX: 0, focalPointY: 60, focalPointZ: -100, speed: 30 };
    case 'tracking': return { speed: 50, tension: 0.5, lookAtType: 'path', points: [] };
    case 'flyby': return { speedMultiplier: 3, altitudeOffset: 30, fovTarget: 90 };
    case 'static': return { posX: 0, posY: 60, posZ: 200, lookAtX: 0, lookAtY: 0, lookAtZ: 0 };
    case 'shake': return { amplitude: 2.0, frequency: 20 };
    default: return {};
  }
}
```

### DebugGUI — Control de Bloom Threshold

```javascript
// Agregar en _build(), después de los toggles de Visual Elements:
this._buildBloomFolder();

/**
 * Construye sub-folder con controles de bloom editables en tiempo real.
 */
_buildBloomFolder() {
  const bloomFolder = this._folder.addFolder('🌟 Bloom');
  const bloomPass = this._director._deps.view?.bloomPass;
  if (!bloomPass) return;

  this._bloomState = {
    strength: bloomPass.strength,
    radius: bloomPass.radius,
    threshold: bloomPass.threshold,
  };

  bloomFolder.add(this._bloomState, 'strength').name('Strength').step(0.1).onChange(v => { bloomPass.strength = v; });
  bloomFolder.add(this._bloomState, 'radius').name('Radius').step(0.1).onChange(v => { bloomPass.radius = v; });
  bloomFolder.add(this._bloomState, 'threshold').name('Threshold').step(0.01).onChange(v => { bloomPass.threshold = v; });
}
```

## Implementation Notes

### Orden de operaciones en _onPhaseChange

Es crítico que el flujo sea:
1. `stopSequence()` (limpiar modo previo)
2. `activatePreset()` (interpolar params de first-person + bloom + skybox)
3. `_activatePhaseCameraMode()` (activar nuevo modo cinematográfico)

Si se invierte 2 y 3, el TransitionEngine podría interferir con los parámetros del Player mientras el CameraSystem tiene control.

### Compatibilidad hacia atrás

Los BUILT_IN_PRESETS existentes no tienen `camera.cameraMode`, así que se tratan como `null` (first-person). No se rompe nada existente.

### Phase_Duration vs MAX_DURATION

Si una fase dura más de 300s, el CameraSystem clampeará a 300s. Esto es aceptable — el modo expira y vuelve a first-person, y cuando la siguiente fase se active, se activará el nuevo modo. No hay impacto negativo real excepto un gap de first-person entre t=300s y el trigger de la siguiente fase.

### Tracking mode: puntos capturados

El botón "Agregar punto" en la GUI captura `camera.position` del Player en el momento del click. Los puntos se acumulan en un array y se usan como control points de la CatmullRom. Se necesitan mínimo 2 puntos para activar el modo.

### Seek / recalculatePhase

El flujo existente ya funciona:
- `TransportGUI._seekTo()` → `PhaseManager.recalculatePhase()` → callback `_onPhaseChange()`
- El nuevo `_onPhaseChange()` ahora hace `stopSequence()` + `activatePreset()` + `_activatePhaseCameraMode()`
- No se necesita modificar TransportGUI ni PhaseManager para el seek

### DebugGUI: Sincronización de dropdown con estado externo

Cuando una fase activa un modo cinematográfico programáticamente, el dropdown de la DebugGUI debe actualizarse. El loop de `_syncValues()` ya sincroniza `cameraMode` — solo hay que agregar la lógica de reconstruir el sub-folder de params si el modo cambió externamente.
