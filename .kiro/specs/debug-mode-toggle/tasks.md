# Implementation Plan: Debug Mode Toggle

## Overview

Implementar un sistema de toggle entre modo principal (GUI oculto) y modo debug (GUI visible) mediante la tecla D. Se crea un módulo `DebugModeManager` independiente que controla la visibilidad del panel lil-gui existente sin destruirlo ni recrearlo.

## Tasks

- [x] 1. Crear DebugModeManager
  - [x] 1.1 Crear `src/ui/DebugModeManager.js` con la clase completa
    - Constructor recibe instancia de GUI, captura `_originalDisplay`, oculta con `display: none`
    - Registra listener `keydown` en `document` con handler bound
    - Handler verifica que `event.key === '\`'` y que el target no es INPUT, TEXTAREA, SELECT ni contentEditable
    - Métodos: `toggle()`, `show()`, `hide()`, `registerPanel(panel)`, `dispose()`
    - Validación en constructor: lanzar error si `gui` o `gui.domElement` es inválido
    - Guard clause en `toggle()` si ya se hizo dispose
    - `dispose()` idempotente: remueve listener, llama dispose en paneles registrados, limpia refs
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2_

- [x] 2. Integrar DebugModeManager en ExperienceManager
  - [x] 2.1 Modificar `src/ExperienceManager.js` para usar DebugModeManager
    - Añadir import de `DebugModeManager` desde `'./ui/DebugModeManager.js'`
    - Instanciar después de ModeSelector: `this.debugModeManager = new DebugModeManager(this.modeSelector.gui)`
    - En `dispose()`: llamar `this.debugModeManager.dispose()` antes de `this.modeSelector.dispose()`
    - Añadir `this.debugModeManager = null` en la sección de limpieza de referencias
    - _Requirements: 1.1, 4.2, 5.1, 5.2_

- [x] 3. Checkpoint - Verificar funcionamiento básico
  - Toggle con tecla D funciona. Panel se oculta/muestra correctamente. Build compila sin errores.

- [ ]* 4. Tests de propiedades para DebugModeManager
  - [ ]* 4.1 Write property test: Toggle alterna estado correctamente
    - **Property 1: Toggle alterna estado correctamente**
    - Generar N aleatorio en [0, 200], aplicar N toggles, verificar `_debugActive === (N % 2 === 1)`
    - **Validates: Requirements 3.1**

  - [ ]* 4.2 Write property test: Visibilidad consistente con modo activo
    - **Property 2: Visibilidad del panel es consistente con el modo activo**
    - Generar secuencia aleatoria de operaciones (toggle/show/hide), verificar display tras cada una
    - **Validates: Requirements 1.1, 1.2, 2.1, 3.2, 3.3**

  - [ ]* 4.3 Write property test: Toggle se ignora cuando un input tiene foco
    - **Property 3: Toggle se ignora cuando un input tiene foco**
    - Generar eventos con targets aleatorios (INPUT, TEXTAREA, SELECT, DIV), verificar que solo los no-input togglean
    - **Validates: Requirements 3.4**

  - [ ]* 4.4 Write property test: Referencia GUI preservada tras toggles
    - **Property 4: La referencia al GUI se preserva tras toggles**
    - Generar secuencia de N toggles, verificar `_gui === guiOriginal`
    - **Validates: Requirements 4.2**

  - [ ]* 4.5 Write property test: Dispose remueve listener
    - **Property 5: Dispose remueve el listener de keydown**
    - Instanciar, dispose, generar N keydowns, verificar estado inmutable
    - **Validates: Requirements 5.2**

  - [ ]* 4.6 Write property test: registerPanel integra paneles al ciclo
    - **Property 6: registerPanel integra paneles al ciclo de toggle**
    - Generar M paneles con spies, registrarlos, aplicar N toggles, verificar llamadas show/hide
    - **Validates: Requirements 6.2, 6.5**

- [x] 5. Checkpoint final
  - Feature completa. Toggle con tecla D, panel lil-gui oculto por defecto, push realizado.

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los property tests usan fast-check como biblioteca PBT
- El GUI de lil-gui nunca se destruye ni recrea — solo se oculta/muestra con CSS
- No se requiere conversión a TypeScript; todo se mantiene como archivos .js

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6"] }
  ]
}
```
