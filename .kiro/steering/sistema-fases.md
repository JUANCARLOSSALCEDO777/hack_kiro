---
inclusion: auto
---

# Sistema de Fases — Checklist de Dependencias

Cuando se agrega o modifica una propiedad/funcionalidad que afecta al sistema de fases, se DEBEN actualizar TODOS los servicios dependientes. Usar este checklist como referencia obligatoria.

## Servicios que dependen del schema de fase (Mood Preset Config)

Cuando agregas un **nuevo campo** al Mood Preset o modificas uno existente:

1. **ExperienceDirector — `_applyDiscreteValues()`** → Aplicar el campo al subsistema correspondiente al activar un preset
2. **ExperienceDirector — `activatePreset()`** → Si es interpolable (numérico), agregarlo a `toValues` del TransitionEngine
3. **ExperienceDirector — `_validatePresetConfig()`** → Agregar validación si el campo es obligatorio o tiene restricciones
4. **ExperienceDirector — `_validateImportConfig()`** → Validar el campo en presets importados
5. **ExperienceDirector — BUILT_IN_PRESETS** → Actualizar el preset 'default' con el valor inicial correcto
6. **TransportGUI — `_captureCurrentPhase()`** → Capturar el valor actual del nuevo campo desde el subsistema
7. **TransportGUI — `_updateSelectedPhase()`** → Igual que el anterior (misma estructura de captura)
8. **DebugGUI** → Agregar control para editar el campo en tiempo real (si aplica)
9. **experience-config.json** → Se actualizará automáticamente al re-exportar

## Servicios que dependen del PhaseManager (triggers/timing)

Cuando se modifica la lógica de triggers o el flujo de cambio de fase:

1. **ExperienceDirector — `_onPhaseChange()`** → Orquesta stop → activatePreset → activatePhaseCameraMode
2. **ExperienceDirector — `_calculatePhaseDuration()`** → Calcula duración entre triggers consecutivos
3. **TransportGUI — `_seekTo()`** → Llama `recalculatePhase()` al hacer seek
4. **TransportGUI — `_update()` (loop logic)** → Llama `recalculatePhase()` al hacer loop reset
5. **TransportGUI — `_renderPhaseSegments()`** → Renderiza la barra visual con los triggers

## Servicios que dependen de la persistencia

Cuando se modifica el formato de exportación/importación:

1. **ExperienceDirector — `exportConfig()`** → Serializa presets, timeline, beatBindings
2. **ExperienceDirector — `importConfig()`** → Restaura estado desde JSON
3. **TransportGUI — `_saveToLocalStorage()`** → Incluye phaseMapping
4. **TransportGUI — `_loadFromLocalStorage()`** → Restaura triggers + mapping
5. **TransportGUI — `_applyConfig()`** → Lógica compartida de aplicar config
6. **experience-config.json** → Config base del proyecto (para visitantes sin localStorage)

## Servicios que dependen de CameraSystem (modos cinematográficos)

1. **ExperienceDirector — `_activatePhaseCameraMode()`** → Activa/desactiva modo al cambiar de fase
2. **TransportGUI — captura** → Lee `getCurrentMode()` + `getCurrentParams()`
3. **DebugGUI — `_buildCameraModeParamsFolder()`** → Controles dinámicos por modo
4. **DebugGUI — `_syncValues()`** → Sincroniza dropdown si el modo cambia externamente

## Archivos clave del sistema

```
src/director/ExperienceDirector.js  — Orquestador principal
src/director/PhaseManager.js        — Triggers y detección de cambio de fase
src/director/TransitionEngine.js    — Interpolación suave entre presets
src/director/CameraSystem.js        — Modos cinematográficos
src/director/TransportGUI.js        — UI de timeline, captura, loop, persistencia
src/director/DebugGUI.js            — Controles de debug en tiempo real
src/director/experience-config.json — Config base precargada para visitantes
src/ExperienceManager.js            — Conecta director con subsistemas
```

## Ejemplo: agregar un nuevo parámetro "particleSize" al preset

1. ✅ `BUILT_IN_PRESETS.default` → agregar `particleSize: 5`
2. ✅ `_applyDiscreteValues()` → aplicar `presetConfig.particleSize` al subsistema de partículas
3. ✅ `_captureCurrentPhase()` → leer el valor actual del subsistema
4. ✅ `_updateSelectedPhase()` → leer el valor actual del subsistema
5. ✅ DebugGUI → agregar slider/input para editarlo en tiempo real
6. ✅ Validación → decidir si es obligatorio o opcional
7. ✅ Tests → verificar que se interpola/aplica correctamente
