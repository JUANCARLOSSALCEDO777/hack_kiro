# Requirements Document

## Introducción

Unificación del sistema de fases (PhaseManager) con los modos de cámara cinematográfica del CameraSystem en el Experience Director. Actualmente, los Mood Presets solo definen parámetros de cámara en primera persona (velocity, altitude, targetDistance, fov), mientras que el CameraSystem tiene modos cinematográficos completos (orbit, dolly, crane, tracking, flyby, static, shake) que están completamente desconectados del sistema de fases. Esta feature permite que un Mood Preset defina un modo de cámara cinematográfico que se activa automáticamente cuando la fase asociada se activa, y que el TransportGUI capture también el modo de cámara activo al guardar una fase.

## Glosario

- **Mood_Preset**: Configuración completa de la experiencia visual que incluye parámetros de terreno, bloom, skybox, cámara, beat thresholds y visibilidad de elementos. Se almacena en el mapa `_presets` del ExperienceDirector.
- **CameraSystem**: Subsistema del Experience Director que gestiona modos de cámara cinematográfica (orbit, dolly, crane, tracking, flyby, static, shake) y controla la cámara cuando un modo está activo.
- **PhaseManager**: Subsistema que detecta cruces de timestamps en el tiempo de la música y notifica al ExperienceDirector mediante callback cuando ocurre un cambio de fase.
- **Camera_Mode**: Uno de los modos cinematográficos válidos del CameraSystem: first-person, orbit, dolly, crane, tracking, flyby, static, shake.
- **Camera_Mode_Config**: Objeto que define el Camera_Mode a usar (`mode`) y sus parámetros específicos (`params`). Ejemplo: `{ mode: 'orbit', params: { focalPoint: [0,0,0], radius: 200, angularSpeed: 0.5 } }`.
- **ExperienceDirector**: Clase principal del módulo de dirección cinematográfica que coordina PhaseManager, TransitionEngine, CameraSystem, BeatRouter y Visual Elements.
- **TransportGUI**: Panel de transporte de audio que muestra timeline, controles de loop y el botón "Guardar Fase" para capturar el estado actual como nueva fase.
- **Phase_Duration**: Tiempo transcurrido desde que una fase se activa hasta que la siguiente fase se activa (determinado por los triggers del PhaseManager).

## Requisitos

### Requisito 1: Extensión del schema de Mood Preset con Camera Mode Config

**User Story:** Como diseñador de experiencia, quiero definir un modo de cámara cinematográfico dentro de un Mood Preset, para que cada fase pueda tener su propia configuración de cámara cinematográfica además de los parámetros de primera persona.

#### Criterios de Aceptación

1. THE Mood_Preset SHALL support an optional `cameraMode` field within the `camera` object that specifies the Camera_Mode_Config to activate, where Camera_Mode_Config is an object with a `mode` string and a `params` object containing mode-specific parameters
2. WHEN a Mood_Preset defines `camera.cameraMode` with value `null` or with `mode` set to `"first-person"`, THE ExperienceDirector SHALL keep the Player in first-person mode using the defined first-person params (velocity, altitude, targetDistance, fov)
3. WHEN a Mood_Preset defines `camera.cameraMode` with a valid Camera_Mode name and parameters, THE ExperienceDirector SHALL store the Camera_Mode_Config as part of the preset without modifying the existing `camera.mode` and `camera.params` first-person fields
4. THE ExperienceDirector SHALL validate that `camera.cameraMode.mode` is one of the valid Camera_Mode values (orbit, dolly, crane, tracking, flyby, static, shake) during preset registration via `registerPreset()`
5. IF a Mood_Preset defines `camera.cameraMode.mode` with an invalid mode name, THEN THE ExperienceDirector SHALL throw an Error with a message that includes the invalid mode name and the list of valid modes
6. WHEN a Mood_Preset omits the `camera.cameraMode` field entirely, THE ExperienceDirector SHALL treat it as equivalent to `camera.cameraMode` being `null` (first-person behavior) and SHALL NOT reject the preset registration
7. THE first-person params (`camera.params`: velocity, altitude, targetDistance, fov) SHALL still be interpolated by the TransitionEngine even when a `camera.cameraMode` is defined, so that when the cinematic mode ends and the Player resumes first-person control, the Player already has the correct interpolated values

### Requisito 2: Activación automática de Camera Mode al cambiar de fase

**User Story:** Como diseñador de experiencia, quiero que cuando una fase se activa y su preset tiene un modo de cámara cinematográfico definido, el CameraSystem active ese modo automáticamente, para que la experiencia cinematográfica esté sincronizada con la música.

#### Criterios de Aceptación

1. WHEN a phase change triggers activation of a Mood_Preset that contains a Camera_Mode_Config with a cinematic mode, THE ExperienceDirector SHALL call CameraSystem.activateMode with the specified mode name, the Camera_Mode_Config params object, and the calculated Phase_Duration as the duration argument
2. WHEN a phase change triggers activation of a Mood_Preset that does not contain a Camera_Mode_Config (field is null or absent), THE ExperienceDirector SHALL call CameraSystem.stopSequence() to return to first-person mode
3. WHEN a phase change triggers activation of a Mood_Preset with `camera.cameraMode.mode` set to "first-person", THE ExperienceDirector SHALL call CameraSystem.stopSequence() to return to first-person mode
4. THE ExperienceDirector SHALL calculate the Phase_Duration by finding the time difference in seconds between the current phase trigger's `time` property and the next phase trigger's `time` property in the ordered PhaseManager trigger list obtained via getTriggers()
5. IF the current phase is the last phase in the trigger list (no subsequent trigger exists), THEN THE ExperienceDirector SHALL use a default duration of 60 seconds for the CameraSystem.activateMode duration argument
6. WHEN a phase change occurs while a previous cinematic Camera_Mode is still active, THE ExperienceDirector SHALL call CameraSystem.stopSequence() BEFORE activating the new phase's Camera_Mode_Config to ensure clean state transition (stop previous → apply new preset → activate new mode)

### Requisito 3: Duración del Camera Mode vinculada a la fase

**User Story:** Como diseñador de experiencia, quiero que el modo de cámara cinematográfico dure exactamente hasta que la siguiente fase se active, para que las transiciones entre fases sean coherentes sin solapamientos ni huecos.

#### Criterios de Aceptación

1. WHEN the CameraSystem has an active cinematic mode triggered by a phase and the next phase activates, THE ExperienceDirector SHALL stop the current Camera_Mode by calling stopSequence() before activating the new phase's preset
2. WHILE a cinematic Camera_Mode is active due to a phase activation, THE CameraSystem SHALL use the Phase_Duration as the duration parameter for that mode. If Phase_Duration exceeds the CameraSystem MAX_DURATION (300s), the mode will expire at 300s and return to first-person before the next phase triggers
3. IF a Camera_Mode reaches its configured duration before the next phase triggers, THEN THE CameraSystem SHALL return to first-person mode by executing its existing stopSequence() behavior
4. WHEN a user manually activates a Camera_Mode via DebugGUI while a phase-driven cinematic mode is active, THE CameraSystem SHALL override the phase-driven mode with the manually selected mode and the phase-driven duration SHALL no longer apply

### Requisito 4: Captura de Camera Mode en TransportGUI

**User Story:** Como diseñador de experiencia, quiero que al presionar "Guardar Fase" en el TransportGUI, se capture también el modo de cámara cinematográfico activo y sus parámetros, para poder reproducir la configuración exacta de cámara en fases futuras.

#### Criterios de Aceptación

1. WHEN the user presses "Guardar Fase" and a cinematic Camera_Mode is active (CameraSystem.getCurrentMode() returns a value other than "first-person"), THE TransportGUI SHALL include `{ mode, params }` in the captured preset under `camera.cameraMode`
2. WHEN the user presses "Guardar Fase" and the camera is in first-person mode, THE TransportGUI SHALL set `camera.cameraMode` to null in the captured preset
3. THE TransportGUI SHALL read the current Camera_Mode name by calling `this._director.getCameraSystem().getCurrentMode()`
4. THE TransportGUI SHALL read the current Camera_Mode parameters by calling `this._director.getCameraSystem().getCurrentParams()`

### Requisito 5: Exposición de parámetros del modo activo en CameraSystem

**User Story:** Como desarrollador, quiero que el CameraSystem exponga los parámetros del modo cinematográfico activo, para que otros subsistemas (TransportGUI, DebugGUI, exportConfig) puedan leerlos.

#### Criterios de Aceptación

1. THE CameraSystem SHALL provide a public method `getCurrentParams()` that returns a shallow copy (via object spread `{ ...this._params }`) of the parameters object of the currently active Camera_Mode
2. WHEN the CameraSystem is in first-person mode (`_currentMode === 'first-person'` and `_sequenceActive === false`), THE `getCurrentParams()` method SHALL return null
3. WHEN the CameraSystem has an active cinematic mode (`_sequenceActive === true`), THE `getCurrentParams()` method SHALL return a copy of the parameters stored in `this._params` for the current sequence
4. THE CameraSystem SHALL provide a public method `getRemainingDuration()` that returns `Math.max(0, this._duration - this._elapsed)` for the current cinematic sequence, or 0 if no sequence is active

### Requisito 6: Configuración completa de parámetros por Camera Mode en el preset

**User Story:** Como diseñador de experiencia, quiero poder configurar todos los parámetros específicos de cada modo de cámara dentro del preset, para tener control total sobre el comportamiento cinematográfico de cada fase.

#### Criterios de Aceptación

1. WHEN `camera.cameraMode.mode` is "orbit", THE params SHALL accept: focalPoint ([x,y,z], default [0,0,0]), angularSpeed (0.1-10.0 rad/s, default 0.5), radius (10-2000, default 200), altitude (-500 to 500, default 0), direction ("clockwise"/"counterclockwise", default "counterclockwise"), startAngle (radians, default 0)
2. WHEN `camera.cameraMode.mode` is "dolly", THE params SHALL accept: startPosition ([x,y,z]), endPosition ([x,y,z]), lookAt ([x,y,z] optional), speed (0.1-200, default 50)
3. WHEN `camera.cameraMode.mode` is "crane", THE params SHALL accept: startY, endY, horizontalX (default 0), horizontalZ (default 0), sweepAngle (0 to 2π, default 0), sweepRadius (default 200), focalPoint ([x,y,z], default [0,60,-100]), speed (0.1-100, default 30)
4. WHEN `camera.cameraMode.mode` is "tracking", THE params SHALL accept: points (array of 2-50 [x,y,z] arrays), speed (0.1-200, default 50), tension (0-1, default 0.5), lookAt ({ type: "path"|"fixed"|"player", target?: [x,y,z] })
5. WHEN `camera.cameraMode.mode` is "flyby", THE params SHALL accept: altitudeOffset (10-100, default 30), speedMultiplier (2-10, default 3), fovTarget (30-120, default 90)
6. WHEN `camera.cameraMode.mode` is "static", THE params SHALL accept: position ([x,y,z]), lookAt ([x,y,z])
7. WHEN `camera.cameraMode.mode` is "shake", THE params SHALL accept: amplitude (0.1-20.0, default 2.0), frequency (1-60 Hz, default 20)

### Requisito 7: Controles de parámetros de Camera Mode en la DebugGUI

**User Story:** Como diseñador de experiencia, quiero que la DebugGUI muestre los controles de parámetros específicos del modo de cámara seleccionado, mostrando solo los campos relevantes al modo activo, para poder configurar cada modo cinematográfico en tiempo real sin saturar la interfaz.

#### Criterios de Aceptación

1. WHEN the user selects a Camera_Mode in the DebugGUI dropdown, THE GUI SHALL destroy the previous mode parameter sub-folder (if any) and create a new sub-folder displaying only the parameter controls relevant to the newly selected mode
2. WHEN the user selects "orbit", THE GUI SHALL show: focalPoint (X/Y/Z), angularSpeed, radius, altitude, direction (dropdown), startAngle
3. WHEN the user selects "dolly", THE GUI SHALL show: startPosition (X/Y/Z), endPosition (X/Y/Z), lookAt (X/Y/Z), speed
4. WHEN the user selects "crane", THE GUI SHALL show: startY, endY, horizontalX, horizontalZ, sweepAngle, sweepRadius, focalPoint (X/Y/Z), speed
5. WHEN the user selects "tracking", THE GUI SHALL show: speed, tension, lookAt type (dropdown: path/fixed/player), and a button "Agregar punto" that captures the current camera position and appends it to the points array
6. WHEN the user selects "flyby", THE GUI SHALL show: speedMultiplier, altitudeOffset, fovTarget
7. WHEN the user selects "static", THE GUI SHALL show: position (X/Y/Z), lookAt (X/Y/Z)
8. WHEN the user selects "shake", THE GUI SHALL show: amplitude, frequency
9. WHEN the user selects "first-person", THE GUI SHALL hide the Camera_Mode parameter sub-folder entirely
10. WHEN the user changes any parameter in the GUI while a cinematic sequence is active, THE change SHALL be applied immediately to the CameraSystem's internal `_params` object so it takes effect on the next frame
11. ALL numeric Camera_Mode controls SHALL use lil-gui number input fields (not sliders) for precision entry

### Requisito 8: Bloom threshold como parámetro interpolable entre fases

**User Story:** Como diseñador de experiencia, quiero que el bloom threshold se interpole suavemente entre fases junto con el resto de parámetros de bloom, para controlar la intensidad del efecto glow de manera continua durante las transiciones.

#### Criterios de Aceptación

1. THE Mood_Preset bloom object SHALL include `threshold` as required numeric parameter (ya existe en REQUIRED_BLOOM_FIELDS y se interpola en el sistema actual)
2. WHEN a phase transition occurs via activatePreset(), THE TransitionEngine SHALL interpolate `bloom.threshold` alongside `bloom.strength` and `bloom.radius` using the configured easing function (esto ya funciona en el código actual)
3. WHEN _applyTransitionValues() applies interpolated values each frame, THE `bloom.threshold` value SHALL be written to `deps.view.bloomPass.threshold` (esto ya funciona en el código actual)
4. THE DebugGUI SHALL expose a numeric control (lil-gui number input, not slider) for bloom threshold that reads from and writes to `deps.view.bloomPass.threshold` in real-time
5. WHEN the user presses "Guardar Fase" in TransportGUI, THE captured preset SHALL include the current `bloom.threshold` value (esto ya funciona en _captureCurrentPhase)

> **Nota:** Los criterios 1-3 y 5 ya están implementados. Este requisito formaliza la necesidad de exponer el control en la DebugGUI (criterio 4) que actualmente no existe.

### Requisito 9: Seek/Loop con modo cinematográfico activo

**User Story:** Como diseñador de experiencia, quiero que al hacer seek o activarse el loop en el TransportGUI, el sistema recalcule correctamente la fase y active/desactive el modo cinematográfico correspondiente, para que la edición temporal no deje la cámara en un estado inconsistente.

#### Criterios de Aceptación

1. WHEN the user performs a seek via TransportGUI while a phase-driven cinematic Camera_Mode is active, THE PhaseManager.recalculatePhase() SHALL be called, which triggers _onPhaseChange() in the ExperienceDirector, which SHALL stop the current Camera_Mode and activate the Camera_Mode corresponding to the recalculated phase
2. WHEN the loop resets playback to loopStart while a cinematic mode is active, THE same recalculatePhase → _onPhaseChange flow SHALL execute, stopping the current mode and activating the correct one for the looped-back time position
3. IF a seek lands on a time position that belongs to a phase with no Camera_Mode_Config, THE ExperienceDirector SHALL call stopSequence() to ensure the camera returns to first-person mode

### Requisito 10: Integración con exportConfig/importConfig

**User Story:** Como diseñador de experiencia, quiero que la configuración de Camera Mode en los presets se preserve al exportar e importar configuraciones, para no perder el trabajo de diseño cinematográfico.

#### Criterios de Aceptación

1. WHEN the ExperienceDirector exports configuration via exportConfig(), THE exported presets SHALL include the `camera.cameraMode` field exactly as stored in the preset (either the Camera_Mode_Config object or null)
2. WHEN the ExperienceDirector imports configuration via importConfig(), THE imported presets SHALL restore the `camera.cameraMode` field via structuredClone
3. IF an imported preset contains `camera.cameraMode` with a `mode` value that is not one of (orbit, dolly, crane, tracking, flyby, static, shake, null), THEN THE _validateImportConfig() SHALL add an error string to the validation errors array identifying the preset name and the invalid mode value
