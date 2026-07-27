# Implementation Plan: Phase Camera Modes

## Overview

Unificación del sistema de fases (PhaseManager) con los modos de cámara cinematográfica del CameraSystem. Se extiende el schema de Mood Preset, se modifica `_onPhaseChange`, se agregan métodos públicos al CameraSystem, se actualiza TransportGUI para capturar el modo activo, y se añaden controles dinámicos en la DebugGUI.

## Tasks

- [x] 1. Extensión del CameraSystem con métodos públicos
  - [x] 1.1 Implementar `getCurrentParams()` en CameraSystem
    - Agregar método público que retorne `{ ...this._params }` si `_sequenceActive === true`, o `null` si está en first-person
    - _Requisitos: 5.1, 5.2, 5.3_

  - [x] 1.2 Implementar `getRemainingDuration()` en CameraSystem
    - Agregar método público que retorne `Math.max(0, this._duration - this._elapsed)` si hay secuencia activa, o `0` si no
    - _Requisitos: 5.4_

- [x] 2. Extensión del schema de Mood Preset y validación
  - [x] 2.1 Agregar validación de `camera.cameraMode` en `_validatePresetConfig()`
    - Validar que `camera.cameraMode.mode` sea uno de: orbit, dolly, crane, tracking, flyby, static, shake
    - Si el valor es inválido, agregar error con el nombre inválido y la lista de modos válidos
    - Si `camera.cameraMode` es null o está ausente, no rechazar el registro
    - _Requisitos: 1.4, 1.5, 1.6_

  - [x] 2.2 Agregar validación de `camera.cameraMode` en `_validateImportConfig()`
    - Al importar, verificar que los presets con `camera.cameraMode` tengan un modo válido
    - Agregar error al array de errores identificando el preset y el modo inválido
    - _Requisitos: 10.3_

  - [ ]* 2.3 Escribir tests unitarios para validación del schema de cameraMode
    - Testear registro con modo válido, modo inválido, campo ausente, campo null
    - _Requisitos: 1.4, 1.5, 1.6, 10.3_

- [x] 3. Implementar lógica de activación de Camera Mode en fase
  - [x] 3.1 Implementar `_calculatePhaseDuration(phaseIndex)` en ExperienceDirector
    - Obtener triggers del PhaseManager via `getTriggers()`
    - Calcular diferencia entre trigger actual y siguiente
    - Retornar 60 segundos si es la última fase
    - _Requisitos: 2.4, 2.5_

  - [x] 3.2 Implementar `_activatePhaseCameraMode(presetConfig, phaseDuration)` en ExperienceDirector
    - Si `camera.cameraMode` es null, ausente o mode === 'first-person': llamar `stopSequence()` si hay secuencia activa
    - Si modo válido: llamar `CameraSystem.activateMode(mode, params, phaseDuration)`
    - _Requisitos: 2.1, 2.2, 2.3, 1.2, 1.3_

  - [x] 3.3 Modificar `_onPhaseChange(phaseIndex)` en ExperienceDirector
    - Agregar cálculo de phaseDuration con `_calculatePhaseDuration()`
    - Llamar `stopSequence()` antes de `activatePreset()` si hay modo previo activo
    - Llamar `_activatePhaseCameraMode()` después de `activatePreset()`
    - Mantener orden: stop → activatePreset → activatePhaseCameraMode
    - _Requisitos: 2.1, 2.2, 2.3, 2.6, 3.1_

  - [ ]* 3.4 Escribir tests unitarios para activación de Camera Mode en fase
    - Testear activación con modo cinematográfico, con null, con first-person, última fase (60s default)
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 4. Checkpoint - Verificar que la lógica core funciona
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 5. Captura de Camera Mode en TransportGUI
  - [x] 5.1 Modificar `_captureCurrentPhase()` en TransportGUI
    - Leer modo actual con `this._director.getCameraSystem().getCurrentMode()`
    - Leer params con `this._director.getCameraSystem().getCurrentParams()`
    - Si modo es 'first-person': setear `camera.cameraMode = null`
    - Si modo es cinematográfico: setear `camera.cameraMode = { mode, params }`
    - _Requisitos: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 5.2 Escribir tests unitarios para captura de Camera Mode
    - Testear captura con modo cinematográfico activo y en first-person
    - _Requisitos: 4.1, 4.2_

- [x] 6. Controles dinámicos de Camera Mode en DebugGUI
  - [x] 6.1 Implementar `_buildCameraModeParamsFolder(mode)` en DebugGUI
    - Destruir sub-folder anterior si existe
    - Si mode === 'first-person': no crear folder
    - Crear sub-folder con controles específicos del modo seleccionado usando lil-gui number inputs
    - onChange de cada control: aplicar a `CameraSystem._params` en tiempo real
    - _Requisitos: 7.1, 7.9, 7.10, 7.11_

  - [x] 6.2 Implementar controles para modo orbit
    - Controles: focalPoint (X/Y/Z), angularSpeed, radius, altitude, direction (dropdown), startAngle
    - _Requisitos: 7.2_

  - [x] 6.3 Implementar controles para modos dolly, crane y static
    - Dolly: startPosition (X/Y/Z), endPosition (X/Y/Z), lookAt (X/Y/Z), speed
    - Crane: startY, endY, horizontalX, horizontalZ, sweepAngle, sweepRadius, focalPoint (X/Y/Z), speed
    - Static: position (X/Y/Z), lookAt (X/Y/Z)
    - _Requisitos: 7.3, 7.4, 7.7_

  - [x] 6.4 Implementar controles para modos tracking, flyby y shake
    - Tracking: speed, tension, lookAt type (dropdown), botón "Agregar punto" que captura posición de cámara
    - Flyby: speedMultiplier, altitudeOffset, fovTarget
    - Shake: amplitude, frequency
    - _Requisitos: 7.5, 7.6, 7.8_

  - [x] 6.5 Implementar `_getDefaultParamsForMode(mode)` con valores por defecto
    - Retornar objeto con valores default según el modo (ver Requisito 6 para rangos y defaults)
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 6.6 Conectar dropdown de Camera Mode al rebuild del sub-folder
    - En onChange del dropdown existente, llamar `_buildCameraModeParamsFolder(mode)`
    - Sincronizar dropdown cuando una fase activa un modo programáticamente (en `_syncValues()`)
    - _Requisitos: 7.1, 7.9_

- [x] 7. Control de Bloom Threshold en DebugGUI
  - [x] 7.1 Implementar `_buildBloomFolder()` en DebugGUI
    - Crear sub-folder "Bloom" con controles: strength, radius, threshold (number inputs con step)
    - Cada onChange escribe directamente al `bloomPass` correspondiente
    - _Requisitos: 8.4_

- [x] 8. Checkpoint - Verificar DebugGUI y TransportGUI
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 9. Integración con exportConfig/importConfig
  - [x] 9.1 Verificar que exportConfig incluye `camera.cameraMode`
    - Confirmar que el structuredClone existente en exportConfig ya copia el campo cameraMode
    - Si no, agregar la lógica para incluirlo
    - _Requisitos: 10.1_

  - [x] 9.2 Verificar que importConfig restaura `camera.cameraMode`
    - Confirmar que structuredClone en importConfig restaura el campo
    - Integrar la validación de 2.2 en el flujo de importación
    - _Requisitos: 10.2, 10.3_

  - [ ]* 9.3 Escribir tests unitarios para export/import con cameraMode
    - Testear export de preset con cameraMode, import con modo válido e inválido
    - _Requisitos: 10.1, 10.2, 10.3_

- [x] 10. Seek/Loop con modo cinematográfico activo
  - [x] 10.1 Verificar flujo de seek/recalculatePhase con el nuevo _onPhaseChange
    - Confirmar que `TransportGUI._seekTo()` → `recalculatePhase()` → `_onPhaseChange()` ejecuta correctamente stop → activate → activatePhaseCameraMode
    - Verificar que el loop reset funciona igual
    - Si el seek cae en una fase sin cameraMode, confirmar que se llama `stopSequence()`
    - _Requisitos: 9.1, 9.2, 9.3_

  - [ ]* 10.2 Escribir tests unitarios para seek/loop con Camera Mode
    - Testear seek a fase con modo cinematográfico, seek a fase sin modo, loop reset
    - _Requisitos: 9.1, 9.2, 9.3_

- [x] 11. Interpolación de first-person params durante modo cinematográfico
  - [x] 11.1 Verificar que TransitionEngine interpola camera.params independientemente del cameraMode
    - Confirmar que los params de first-person (velocity, altitude, targetDistance, fov) se interpolan normalmente aunque haya un cameraMode activo
    - El Player debe tener valores correctos para cuando el modo cinematográfico termine
    - _Requisitos: 1.7, 3.3_

- [x] 12. Checkpoint final
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

## Notes

- Las tareas marcadas con `*` son opcionales y se pueden omitir para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- El diseño no incluye sección de Correctness Properties, por lo que no se incluyen property tests
- Los tests unitarios son complementarios y cubren edge cases

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.2"] },
    { "id": 1, "tasks": ["2.3", "3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3", "5.1"] },
    { "id": 3, "tasks": ["3.4", "5.2", "6.1", "6.5"] },
    { "id": 4, "tasks": ["6.2", "6.3", "6.4", "6.6", "7.1"] },
    { "id": 5, "tasks": ["9.1", "9.2", "10.1", "11.1"] },
    { "id": 6, "tasks": ["9.3", "10.2"] }
  ]
}
```
