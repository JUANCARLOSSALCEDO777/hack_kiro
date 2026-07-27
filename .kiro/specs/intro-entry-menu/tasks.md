# Implementation Plan: Intro Entry Menu

## Overview

Implementación del overlay de entrada (Intro_Overlay) como componentes Angular standalone superpuestos al canvas Three.js, con mínima invasión al sistema 3D existente. Las únicas modificaciones al `ExperienceManager.js` son: +2 propiedades callback opcionales y filtrado condicional en el callback WS existente (~10 líneas). NO se toca el loop de animación, render, escena, shaders ni subsistemas de Three.js. NO se toca el backend.

## Tasks

- [x] 1. Crear componentes Angular standalone nuevos (UI sobre canvas)
  - [x] 1.1 Crear IntroOverlayComponent con template, estilos y lógica
    - Crear `src/app/intro-overlay/intro-overlay.ts` como componente standalone
    - Template HTML con: título del proyecto, descripción (max 400 chars), tecnologías (Angular, Three.js, WebSocket, audio reactivo, Discord Bot), instrucciones de interacción (max 250 chars), avatar del bot, y Entry_Button
    - Estilos CSS: fondo negro con opacidad 0.5–0.85, z-index >= 10, pointer-events: all, tipografía con contraste >= 4.5:1 WCAG AA, texto min 16px, encabezados min 24px, line-height >= 1.4
    - Entry_Button: texto con verbo de acción (min 2 palabras), hover con cambio visual en <=150ms (CSS transition), focus visible con contraste >= 3:1, aria-label descriptivo
    - Avatar del bot: imagen con animación CSS continua (ciclo 2–6s, pulso/glow/breathing), tamaño 64–200px, aspect-ratio 1:1, entorno visual electrónico (borde/glow)
    - Fade_Transition: CSS transition opacity 800ms ease-out, fallback setTimeout 1500ms para remoción forzada
    - Focus trap: al renderizar, foco automático en Entry_Button (<100ms), Tab circular dentro del overlay
    - Accesibilidad: role y aria-label/aria-labelledby en contenedor, atributo disabled en botón durante fade
    - Emitir eventos: `startExperience` al hacer click/Enter/Space, `fadeComplete` tras transitionend
    - Responsive: sin desbordamiento horizontal en viewports 320px–3840px
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 1.2 Crear ConnectionIndicatorComponent
    - Crear `src/app/connection-indicator/connection-indicator.ts` como componente standalone
    - Input signal requerido `connectionText` de tipo string
    - Template: dot de estado + texto de conexión, aria-live="polite"
    - Estilos: posición fija en esquina del viewport, z-index sobre canvas, tamaño mínimo 12px, diseño minimalista que no interfiera con la visualización 3D
    - _Requirements: 8.1, 8.2, 8.3, 8.6_

  - [x] 1.3 Crear ViewerCounterComponent
    - Crear `src/app/viewer-counter/viewer-counter.ts` como componente standalone
    - Input signal requerido `count` de tipo number
    - Template: icono + número, aria-live="polite", aria-atomic="true"
    - Estilos: posición fija, área máxima 120px × 40px, tipografía 12–16px, z-index sobre canvas, sin animaciones de transición en el valor
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 2. Modificar ExperienceManager.js (cambios quirúrgicos, ~10 líneas)
  - [x] 2.1 Agregar callbacks opcionales y filtrado en callback WS
    - Agregar 2 propiedades después de `this.running = false`: `this.onConnectionChange = null` y `this.onViewerCountChange = null`
    - Modificar el callback del WebSocketClient existente para: (1) filtrar mensajes con text === "CODIGOFACILITO" excluyéndolos del PixelText_Array e invocando `this.onConnectionChange`, (2) propagar `payload.viewerCount` si existe invocando `this.onViewerCountChange`
    - Los callbacks son opcionales (`if (this.onX)`): si no se asignan, el ExperienceManager funciona exactamente igual que antes — zero breaking change
    - **NO tocar**: `start()`, `animate()`, `resumeAudio()`, `dispose()`, `_setupWebcamDebugControls()`, ni ningún subsistema (RenderManager, View, Player, Terrain, Skybox, Stars, LuminousSpheres, PixelText, etc.)
    - _Requirements: 8.4, 8.5, 9.4_

- [x] 3. Integrar componentes en CanvasDrawComponent (wiring)
  - [x] 3.1 Modificar template y clase de CanvasDrawComponent
    - Reemplazar `.play-prompt` del template por `<app-intro-overlay>` con binding de eventos `(startExperience)` y `(fadeComplete)`
    - Agregar `<app-connection-indicator [connectionText]="connectionText()">` persistente (fuera del @if del overlay)
    - Agregar `<app-viewer-counter [count]="viewerCount()">` persistente (fuera del @if del overlay)
    - Agregar imports de los 3 nuevos componentes en el decorador @Component
    - Agregar signals reactivos: `connectionText = signal('Testing Server • #general')`, `viewerCount = signal(0)`, `audioUnavailable = signal(false)`
    - En `ngAfterViewInit`: asignar callbacks al ExperienceManager — `this.experience.onConnectionChange = (text) => ngZone.run(() => connectionText.set(text))` y `this.experience.onViewerCountChange = (count) => ngZone.run(() => viewerCount.set(count))`
    - Handler `onStartExperience()`: requestFullscreen con catch silencioso + resumeAudio() + detectar AudioContext suspended para activar `audioUnavailable`
    - Handler `onFadeComplete()`: setear `showOverlay = false` para remover overlay del DOM
    - Eliminar estilos de `.play-prompt` que ya no se usan
    - _Requirements: 1.3, 3.3, 3.4, 3.5, 3.6, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 4. Checkpoint - Verificar integración completa
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 5. Tests de propiedades (property-based tests con fast-check)
  - [ ]* 5.1 Property test: Entry_Button ignora interacciones durante Fade_Transition
    - **Property 1: Entry_Button ignora interacciones durante Fade_Transition**
    - Generar eventos aleatorios (click, Enter, Space) mientras `isFading === true`, verificar que ninguno dispara `startExperience` y el botón tiene `disabled`
    - **Validates: Requirements 4.3**

  - [ ]* 5.2 Property test: Activación por teclado equivalente a click
    - **Property 2: Activación por teclado equivalente a click**
    - Para cada método de activación (click, Enter, Space), verificar que las mismas funciones son invocadas en el mismo orden
    - **Validates: Requirements 6.1**

  - [ ]* 5.3 Property test: Focus trap dentro del overlay
    - **Property 3: Focus trap dentro del overlay**
    - Generar secuencias de N pulsaciones de Tab/Shift+Tab, verificar que activeElement siempre está dentro del overlay
    - **Validates: Requirements 6.4**

  - [ ]* 5.4 Property test: Mensajes trigger se excluyen del PixelText_Array
    - **Property 4: Mensajes trigger se excluyen del PixelText_Array**
    - Generar secuencias aleatorias de mensajes (algunos "CODIGOFACILITO", otros texto aleatorio), verificar que PixelText_Array contiene solo los no-trigger
    - **Validates: Requirements 8.5**

  - [ ]* 5.5 Property test: Viewer counter refleja último valor inmediatamente
    - **Property 5: Viewer counter refleja último valor inmediatamente**
    - Generar secuencias de N valores numéricos (≥ 0), aplicarlos secuencialmente al signal, verificar que el valor mostrado siempre es el último
    - **Validates: Requirements 9.4**

- [ ]* 6. Unit tests e integration tests
  - [ ]* 6.1 Unit tests para IntroOverlayComponent
    - Test renderizado: presencia de título, descripción, tecnologías, instrucciones, botón
    - Test contenido: título font-size >= 24px, descripción <= 400 chars, instrucciones <= 250 chars
    - Test Entry_Button: texto >= 2 palabras con verbo de acción
    - Test Fade_Transition: CSS transition-duration entre 600–1200ms
    - Test remoción DOM: overlay se remueve dentro de 100ms tras transitionend
    - Test fallback: overlay se remueve a los 1500ms si transitionend no dispara
    - Test accesibilidad: role, aria-label, aria-labelledby presentes; foco automático <100ms
    - Test avatar: animation-duration 2–6s, tamaño 64–200px, aspect-ratio 1:1
    - Test hover: cambio visual en <=150ms (CSS transition)
    - Test focus visible: indicador de foco con contraste >= 3:1
    - _Requirements: 1.1, 1.2, 2.1–2.5, 3.1, 4.1–4.4, 5.1–5.5, 6.1–6.4, 10.1–10.5_

  - [ ]* 6.2 Unit tests para ConnectionIndicatorComponent y ViewerCounterComponent
    - Test estado inicial: muestra "Testing Server • #general"
    - Test cambio: cambia a "HACKATHON KIRO • #live" al actualizar signal
    - Test viewer counter: actualiza valor inmediatamente sin animación
    - Test dimensiones: viewer counter dentro de 120px × 40px
    - _Requirements: 8.1–8.4, 9.1–9.4_

  - [ ]* 6.3 Integration tests para CanvasDrawComponent + ExperienceManager
    - Test reemplazo play-prompt: `.play-prompt` no existe, `app-intro-overlay` presente con z-index >= 10
    - Test loop activo con overlay: ExperienceManager.rafId no es null mientras overlay visible
    - Test transición sin re-instanciación: al descartar overlay, no se invoca constructor de subsistemas
    - Test fullscreen rechazado: experiencia continúa sin error
    - Test AudioContext falla: se activa signal `audioUnavailable`
    - Test mínima invasión: ExperienceManager.animate() no fue modificado (solo callbacks + filtrado WS)
    - _Requirements: 3.3–3.6, 7.1–7.5_

- [x] 7. Final checkpoint - Verificar todo funciona end-to-end
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- **Restricción fundamental**: NO se toca el loop de animación (`animate()`), `start()`, `dispose()`, shaders, escena, ni ningún subsistema de Three.js
- **Restricción fundamental**: NO se toca el backend
- Las únicas modificaciones a `ExperienceManager.js` son: +2 propiedades callback opcionales (null por defecto) y ~10 líneas de filtrado condicional en el callback WS existente
- Todo lo nuevo son componentes Angular 22 standalone superpuestos al canvas (HTML/CSS puro)
- Property tests validan propiedades de corrección universales definidas en el design
- Unit tests validan ejemplos específicos y edge cases

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3"] }
  ]
}
```
