# Implementation Plan: Experience Director

## Overview

Implementación incremental del Experience Director como módulo ES que orquesta los subsistemas visuales existentes. Se construye desde las dependencias core (TransitionEngine, EventBus, VisualElementRegistry) hacia las capas de control (PhaseManager, BeatRouter, CameraSystem) y finalmente la integración con GUI y serialización.

Todos los archivos fuente van en `src/director/`, los tests en `tests/`, y los generadores PBT en `tests/generators/`.

## Tasks

- [x] 1. Fundamentos del sistema — EventBus, TransitionEngine y VisualElementRegistry
  - [x] 1.1 Crear estructura de directorios y módulo EventBus
    - Crear `src/director/EventBus.js` con patrón pub/sub: `emit(event, data)`, `on(event, handler)` retornando unsubscribe, `off(event, handler)`
    - Cada evento emitido incluye timestamp automático
    - Crear `src/director/index.js` como barrel export del módulo
    - _Requirements: 10.3_

  - [x] 1.2 Implementar TransitionEngine con interpolación numérica y HSL
    - Crear `src/director/TransitionEngine.js`
    - Implementar `startTransition(config)` con from/to/duration/easing/immediateKeys
    - Interpolar valores numéricos con fórmula: `from + (to - from) × easing(progress)`
    - Interpolar colores en espacio HSL (descomponer hex → HSL, interpolar H/S/L, recomponer)
    - Soportar 4 funciones de easing: linear, easeInOut, easeIn, easeOut
    - Aplicar valores discretos (terrainMode, lightPattern) inmediatamente al inicio
    - Duración < 0.1s → aplicar todo inmediato sin interpolación
    - Interrupción: nueva transición parte desde valores interpolados actuales
    - Callback `onComplete` al finalizar
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 1.3 Write property tests for TransitionEngine
    - **Property 10: Interpolación numérica correcta con easing válido**
    - **Property 11: Interrupción de transición preserva valores actuales**
    - **Property 12: Interpolación de colores en espacio HSL**
    - **Property 13: Valores discretos se aplican inmediatamente**
    - Crear `tests/unit/transition-engine.spec.js`
    - Crear `tests/generators/preset-generators.js` con generadores de rangos numéricos válidos
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.5, 4.7, 4.8**

  - [x] 1.4 Implementar VisualElementRegistry
    - Crear `src/director/VisualElementRegistry.js`
    - Métodos: `register(name, adapter)`, `setActive(name, active)`, `isActive(name)`, `getAll()`, `getNames()`
    - Validar interfaz del adaptador al registrar (name, setVisible, update, getSceneObject)
    - Error descriptivo si nombre no existe en setActive/isActive
    - Error si nombre duplicado al registrar
    - Preservar estado interno del elemento al desactivar (no resetear)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 10.6, 10.7_

  - [ ]* 1.5 Write property tests for VisualElementRegistry
    - **Property 14: Toggle de Visual Elements preserva estado y es consistente**
    - **Property 15: Validación de nombres de Visual Elements**
    - Crear `tests/unit/visual-elements.spec.js`
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6**

  - [x] 1.6 Crear adaptadores para Stars y LuminousSpheres
    - Crear `src/director/adapters/StarsAdapter.js` — envuelve Stars (controla .points.visible, delega update/onBeat)
    - Crear `src/director/adapters/SpheresAdapter.js` — envuelve LuminousSpheres (controla .mesh.visible, setPattern, onBeat)
    - Cada adaptador implementa la interfaz VisualElementAdapter: `{ name, setVisible, update, onBeat, getSceneObject }`
    - Los adaptadores NO modifican lógica interna de los subsistemas
    - _Requirements: 5.1, 10.2, 10.5_

  - [x] 1.7 Crear adaptadores para Skybox, WebcamScreens y PixelText
    - Crear `src/director/adapters/SkyboxAdapter.js` — envuelve Skybox (controla hueRange, saturation, baseLightness, pulseIntensity)
    - Crear `src/director/adapters/WebcamScreensAdapter.js` — envuelve WebcamLEDScreens (controla visible, update)
    - Crear `src/director/adapters/PixelTextAdapter.js` — envuelve PixelText (controla visible, update)
    - Misma interfaz VisualElementAdapter que 1.6
    - _Requirements: 5.1, 10.2, 10.5_

- [x] 2. Checkpoint — Verificar fundamentos
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. PhaseManager adaptado y BeatRouter
  - [x] 3.1 Refactorizar PhaseManager para notificar al director
    - Crear `src/director/PhaseManager.js` (nueva versión, no modificar el existente en src/events/)
    - Constructor recibe callback `onPhaseChange(phaseIndex)`
    - Método `update(state, musicTime)` — detecta cruce de timestamp y notifica
    - API de triggers: `addTrigger(time, phaseIndex)`, `removeTrigger(time)`, `reorderTriggers()`, `getTriggers()`
    - Máximo 64 triggers, rechazar tiempos negativos e índices inválidos con console.warn
    - `recalculatePhase(musicTime)` — soporte de seek hacia atrás
    - Triggers siempre ordenados por tiempo internamente
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6_

  - [ ]* 3.2 Write property tests for PhaseManager
    - **Property 1: Detección de cruce de fase en el frame exacto**
    - **Property 3: Invariantes de la API de triggers del PhaseManager**
    - **Property 4: Recálculo de fase activa en seek**
    - Crear `tests/unit/phase-manager.spec.js`
    - **Validates: Requirements 1.2, 1.4, 1.5, 1.6**

  - [x] 3.3 Implementar BeatRouter
    - Crear `src/director/BeatRouter.js`
    - Mapa de bindings por BeatType (bass, mid, high), orden de inserción
    - Métodos: `addBinding(beatType, binding)`, `removeBinding(beatType, elementName)`, `replaceBindings(beatType, bindings)`, `getBindings(beatType)`
    - `processBeat(beatType)` — ejecuta bindings en orden, salta elementos inactivos
    - Máximo 16 bindings por BeatType
    - Clamp de intensidad a [0, 1] con console.warn
    - No generar error en listas vacías
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 3.4 Write property tests for BeatRouter
    - **Property 5: CRUD de Effect Bindings preserva orden e invariantes**
    - **Property 6: Ejecución de bindings por beat en orden correcto**
    - **Property 7: Intensidad de bindings con clamp a [0, 1]**
    - Crear `tests/unit/beat-router.spec.js`
    - Crear `tests/generators/binding-generators.js`
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8**

- [x] 4. Mood Presets y ExperienceDirector Core
  - [x] 4.1 Crear ExperienceDirector con estructura base y registro de presets
    - Crear `src/director/ExperienceDirector.js` — clase principal
    - Constructor recibe dependencias, instancia EventBus, TransitionEngine, VisualElementRegistry, PhaseManager, BeatRouter
    - `registerPreset(name, config)` — validar campos obligatorios, máximo 20, nombres 1-50 chars
    - Sobrescribir presets existentes con console.warn
    - Error si config incompleta (indicar campos faltantes)
    - Warn si preset inexistente al activar
    - _Requirements: 3.1, 3.6, 3.7, 3.8, 3.9, 10.1_

  - [x] 4.2 Implementar activación de presets y presets predefinidos
    - `activatePreset(name, transitionDuration)` — delegar al TransitionEngine
    - Tabla de asociación `phaseIndex → presetName` para integración con PhaseManager
    - Incluir presets predefinidos: "default", "energético", "contemplativo", "caótico"
    - El preset "default" preserva exactamente los valores actuales del ExperienceManager (spectrum, radialPulse, bloom 1.5/0.4/0.4, skybox HSL 0.6-0.95, first-person con velocity 150/altitude 60/targetDistance 150/fov 30)
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 1.3, 1.7_

  - [ ]* 4.3 Write property tests for Mood Presets
    - **Property 8: Registro de Mood Presets con validación completa**
    - **Property 9: Activación de preset delega interpolación correcta al TransitionEngine**
    - **Property 2: Mapping de fase a preset con fallback seguro**
    - Crear `tests/unit/mood-presets.spec.js`
    - **Validates: Requirements 3.1, 3.6, 3.8, 3.9, 1.3, 1.7**

- [x] 5. Checkpoint — Verificar core del director
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. CameraSystem con 8 modos
  - [x] 6.1 Implementar CameraSystem base y modos first-person + static
    - Crear `src/director/CameraSystem.js`
    - `activateMode(mode, params, duration)` — controla camera.matrix, duerme Player con `_directorOverride`
    - `stopSequence(transitionDuration)` — interpola de vuelta a posición natural del Player
    - Modo `first-person`: delegación directa al Player existente (modo por defecto)
    - Modo `static`: fijar posición/lookAt sin movimiento durante duración especificada
    - `getCurrentMode()`, `isSequenceActive()`
    - _Requirements: 6.1, 6.8, 6.13_

  - [x] 6.2 Implementar modos orbit y dolly
    - Modo `orbit`: rotación alrededor de punto focal con velocidad angular, radio, altitud, dirección configurable
    - Modo `dolly`: desplazamiento lineal entre posición inicio/fin con velocidad y lookAt fijo/interpolado
    - Validar rangos de parámetros según diseño
    - _Requirements: 6.2, 6.3_

  - [x] 6.3 Implementar modo crane con rotación opcional
    - Modo `crane`: elevación/descenso entre altitudes (startY, endY) con punto focal configurable
    - Velocidad (0.1-100.0 unidades/s, defecto 30.0)
    - Opcionalmente combinar rotación horizontal (0 a 2π radianes de barrido) durante el ascenso/descenso
    - _Requirements: 6.4_

  - [x] 6.4 Implementar modo tracking con CatmullRom spline
    - Modo `tracking`: seguir path definido por 2-50 puntos de control usando CatmullRom spline
    - Tensión de curva configurable (0.0-1.0, defecto 0.5)
    - Velocidad (0.1-200.0 unidades/s, defecto 50.0)
    - LookAt: punto fijo, siguiente punto del path, o posición del jugador
    - Finaliza al alcanzar último punto de control
    - _Requirements: 6.5_

  - [x] 6.5 Implementar modo flyby
    - Modo `flyby`: sobrevuelo rápido a baja altitud (10-100 unidades sobre terreno)
    - Velocidad multiplicada respecto al Player (2x-10x, defecto 3x)
    - FOV ampliado temporalmente (hasta 120°) para efecto de velocidad
    - Sigue la dirección actual del Player
    - _Requirements: 6.6_

  - [x] 6.6 Implementar modo shake y lookAt dinámico
    - Modo `shake`: desplazamiento aleatorio de alta frecuencia superpuesto sobre modo activo
    - Amplitud (0.1-20.0) y frecuencia (1-60 Hz) configurables
    - LookAt dinámico: fixed, player, webcamCenter, interpolated
    - _Requirements: 6.7, 6.10_

  - [x] 6.7 Implementar playlists de Camera Sequences y user interrupt
    - `playPlaylist(sequences, options)` — encadenar hasta 32 secuencias con tiempos relativos
    - Cada secuencia requiere duración obligatoria (0.1-300.0s)
    - `previewSequence(config)` — ejecutar secuencia sin afectar timeline
    - Interrupción por usuario (click/tecla configurable) → retorno a first-person con transición
    - `enableUserInterrupt(key)`, `disableUserInterrupt()`
    - Transición de retorno con easeInOut configurable (0.1-5.0s)
    - _Requirements: 6.9, 6.11, 6.12, 6.14, 6.15, 6.16, 6.17_

  - [ ]* 6.8 Write property tests for CameraSystem
    - **Property 16: Camera Modes producen transformaciones válidas**
    - **Property 17: LookAt dinámico apunta al target correcto**
    - **Property 18: Secuencias de cámara respetan invariantes de playlist**
    - Crear `tests/unit/camera-system.spec.js`
    - Crear `tests/generators/camera-generators.js`
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.10, 6.12, 6.13, 6.16**

- [x] 7. Checkpoint — Verificar CameraSystem
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. TimelineSequencer
  - [x] 8.1 Implementar TimelineSequencer con triggers absolutos y por beatCount
    - Crear `src/director/TimelineSequencer.js`
    - `loadEvents(events)` — reemplaza lista anterior, filtra eventos pasados, máximo 500
    - `update(musicTime, beatCounts)` — dispara eventos cuando condición de trigger se cumple
    - Triggers de tipo `absolute` (segundos), `beatCount` (N-ésimo beat de tipo específico), `compound` (beat + ventana temporal)
    - Acciones soportadas: activatePreset, toggleElement, startSequence, modifyBindings
    - `pause()` / `resume()` — congela reloj interno
    - Omitir eventos con acciones inválidas con console.warn
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 8.2 Write property tests for TimelineSequencer
    - **Property 19: Carga de timeline respeta límites y filtra eventos pasados**
    - **Property 20: Disparo de eventos del Timeline en el frame correcto**
    - **Property 21: Pausa congela el reloj del Timeline**
    - Crear `tests/unit/timeline-sequencer.spec.js`
    - Crear `tests/generators/timeline-generators.js`
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5, 7.7**

- [x] 9. Integración con ExperienceManager y wiring completo
  - [x] 9.1 Wiring del PhaseManager, BeatRouter y VisualElementRegistry en ExperienceDirector
    - Conectar PhaseManager → ExperienceDirector (tabla phaseIndex → presetName)
    - Conectar BeatRouter: leer flags beatTriggered/midBeatTriggered/highBeatTriggered cada frame y delegar processBeat()
    - Conectar VisualElementRegistry: condicionar llamadas a update() según estado activo
    - `setElementActive(name, active)` y `getElementState(name)` como API pública
    - Patrón defensivo try/catch por subsistema en el loop
    - _Requirements: 1.1, 1.3, 2.2, 2.3, 2.4, 5.4_

  - [x] 9.2 Wiring del TimelineSequencer, CameraSystem y EventBus
    - Conectar TimelineSequencer con update(musicTime, beatCounts)
    - Conectar CameraSystem con update(state)
    - Emisión de eventos via EventBus: phaseChange, transitionStart, transitionEnd, sequenceStart, sequenceEnd, elementToggle
    - Implementar método `update(state, musicTime)` que coordina todo en el orden correcto
    - _Requirements: 10.3, 10.4_

  - [x] 9.3 Integrar ExperienceDirector en ExperienceManager
    - Modificar `src/ExperienceManager.js` mínimamente:
      - Importar ExperienceDirector
      - Instanciar con dependencias después de crear subsistemas
      - Llamar `director.update(state, music.currentTime)` en animate() después de actualizar subsistemas base
      - Llamar `director.dispose()` en dispose()
    - Añadir flag `_directorOverride` al Player para que el CameraSystem pueda dormirlo
    - _Requirements: 1.1, 10.4, 10.5_

  - [ ]* 9.4 Write property test for EventBus emission
    - **Property 25: Emisión de eventos para cambios de estado**
    - Crear `tests/unit/registry.spec.js`
    - **Validates: Requirements 10.3**

- [x] 10. Serialización y validación de importConfig
  - [x] 10.1 Implementar exportConfig e importConfig
    - `exportConfig()` — retorna JSON con: presets, timeline, beatBindings, cameraSequences, version
    - `importConfig(json)` — validación completa ANTES de aplicar: estructura, nombres referenciados, al menos 1 preset
    - Si válido → cargar configuración, aplicar primer preset del timeline
    - Si inválido → rechazar, mantener config anterior, retornar `{ success: false, errors: [...] }`
    - Garantizar round trip: export → import → export produce JSON con igualdad profunda
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 10.2 Write property tests for serialization
    - **Property 22: Round trip de serialización (export → import → export)**
    - **Property 23: Validación de importConfig rechaza JSON inválido sin modificar estado**
    - **Property 24: Registro de tipos con validación de interfaz y unicidad**
    - Crear `tests/unit/serialization.spec.js`
    - **Validates: Requirements 9.3, 9.4, 9.5, 9.6, 10.1, 10.6, 10.7**

- [x] 11. Checkpoint — Verificar integración y serialización
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Integración con GUI de Debug
  - [x] 12.1 Implementar folder GUI del Experience Director
    - Crear `src/director/DebugGUI.js` — módulo que se activa/desactiva con el DebugModeManager
    - Crear folder "Experience Director" en la GUI existente con:
      - Dropdown de Mood_Preset activo
      - Dropdown de Camera_Mode
      - Toggle por cada Visual_Element registrado
    - Sub-folder "Beat Router" con intensidades editables por binding
    - Cambios desde GUI → aplicar con TransitionEngine (0.5s)
    - Actualizar valores en GUI cada frame para reflejar cambios externos
    - Destruir folder y listeners al desactivar debug
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 13. Final checkpoint — Verificar sistema completo
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tasks marcadas con `*` son opcionales y pueden saltarse para un MVP más rápido
- Cada task referencia requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- Los property tests validan propiedades universales de correctitud (25 propiedades del diseño)
- Los unit tests validan ejemplos específicos y edge cases
- Todos los comentarios de código en español, nombres de variables en inglés
- Los subsistemas existentes NO se modifican internamente — solo se orquestan
- El PhaseManager existente en `src/events/PhaseManager.js` se preserva; se crea uno nuevo en `src/director/`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["1.3", "1.5", "1.6", "1.7"] },
    { "id": 3, "tasks": ["3.1", "3.3"] },
    { "id": 4, "tasks": ["3.2", "3.4", "4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3"] },
    { "id": 6, "tasks": ["6.1", "8.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "6.4", "8.2"] },
    { "id": 8, "tasks": ["6.5", "6.6"] },
    { "id": 9, "tasks": ["6.7", "6.8"] },
    { "id": 10, "tasks": ["9.1"] },
    { "id": 11, "tasks": ["9.2"] },
    { "id": 12, "tasks": ["9.3", "9.4"] },
    { "id": 13, "tasks": ["10.1"] },
    { "id": 14, "tasks": ["10.2"] },
    { "id": 15, "tasks": ["12.1"] }
  ]
}
```
