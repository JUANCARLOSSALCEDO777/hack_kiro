# Implementation Plan: Integración Three.js en Angular

## Overview

Integrar la experiencia 3D interactiva dentro del componente Angular `canvas-draw`, copiando los módulos JavaScript desde `modern/src/` a `src/` del proyecto Angular, creando una capa de orquestación (`ExperienceManager`) y adaptando los módulos para funcionar dentro del ciclo de vida de Angular sin convertir los archivos `.js` a TypeScript. La carpeta `modern/` se mantiene como referencia local (no trackeada en git).

## Tasks

- [x] 1. Configuración del proyecto y dependencias
  - [x] 1.1 Instalar Three.js y configurar tsconfig
    - Ejecutar `pnpm add three@^0.170.0`
    - Modificar `tsconfig.app.json`: añadir `"allowJs": true`, `"checkJs": false` en `compilerOptions`
    - Añadir `"src/**/*.js"` al array `include`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_

  - [x] 1.2 Copiar assets estáticos a public/
    - Copiar `modern/public/audio/music.mp3` a `public/audio/music.mp3`
    - Copiar `modern/public/fonts/pixel-font-atlas.fnt` a `public/fonts/pixel-font-atlas.fnt`
    - Copiar `modern/public/fonts/pixel-font-atlas.png` a `public/fonts/pixel-font-atlas.png`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 1.3 Copiar modulos JavaScript a src/
    - Copiar `modern/src/Config.js` a `src/Config.js`
    - Copiar `modern/src/experience/` a `src/experience/`
    - Copiar `modern/src/terrain/` a `src/terrain/`
    - Copiar `modern/src/events/` a `src/events/`
    - Copiar `modern/src/particles/` a `src/particles/`
    - Copiar `modern/src/ui/` a `src/ui/`
    - NO copiar `modern/src/main.js` (no se usa en Angular)
    - NO eliminar la carpeta `modern/` (se mantiene como referencia local, ignorada en git)
    - Actualizar imports relativos dentro de los archivos copiados si es necesario (e.g., `'../Config.js'` → ajustar según nueva jerarquía)
    - _Requirements: 2.1, 2.2_

- [x] 2. Adaptar RenderManager para montar en container
  - [x] 2.1 Modificar RenderManager.js para aceptar container como parámetro
    - Cambiar constructor para recibir `container` como argumento obligatorio
    - Reemplazar `document.body.appendChild(this.renderer.domElement)` por `container.appendChild(this.renderer.domElement)`
    - Usar `container.clientWidth` / `container.clientHeight` en lugar de `window.innerWidth` / `window.innerHeight`
    - Reemplazar `window.addEventListener('resize', ...)` por un `ResizeObserver` sobre el container
    - Añadir método `dispose()` que desconecte el `ResizeObserver` y llame `this.renderer.dispose()`
    - Almacenar referencia `this.container = container`
    - _Requirements: 4.1, 4.2, 4.3, 5.3_

  - [ ]* 2.2 Escribir property test para montaje de canvas en container
    - **Property 1: Canvas se monta en el container proporcionado**
    - **Validates: Requirements 4.1**

  - [x]* 2.3 Escribir property test para dimensiones del canvas
    - **Property 2: Canvas refleja dimensiones del container**
    - **Validates: Requirements 4.2, 4.3**

- [x] 3. Adaptar View.js para usar dimensiones del container
  - [x] 3.1 Modificar View.js para usar container en lugar de window dimensions
    - Recibir `renderManager` en constructor y extraer `this.container = renderManager.container`
    - Reemplazar `window.innerWidth/Height` por `this.container.clientWidth/clientHeight` en constructor (camera aspect, bloom pass resolution)
    - Modificar `onResize()` para leer dimensiones del container
    - Eliminar `window.addEventListener('resize', ...)` propio; el resize se dispara desde ExperienceManager al escuchar el ResizeObserver del RenderManager
    - _Requirements: 4.2, 4.3, 0.2_

- [x] 4. Adaptar Player.js con dispose de listeners
  - [x] 4.1 Modificar Player.js para almacenar referencias a handlers y añadir dispose()
    - En `setupInput()`, almacenar cada handler en propiedades: `this._onMouseMove`, `this._onMouseDown`, `this._onMouseUp`, `this._onTouchMove`, `this._onTouchStart`, `this._onTouchEnd`
    - Registrar los handlers almacenados con `window.addEventListener`
    - Añadir método `dispose()` que llame `window.removeEventListener` para cada handler registrado
    - _Requirements: 5.5_

  - [ ]* 4.2 Escribir property test para limpieza de event listeners
    - **Property 4: Dispose remueve todos los event listeners de window**
    - **Validates: Requirements 5.5**

- [x] 5. Adaptar MusicPlayer.js con dispose
  - [x] 5.1 Añadir método dispose() a MusicPlayer.js
    - Implementar `dispose()` que pause el audio (`this.audio.pause()`), limpie el src (`this.audio.src = ''`), establezca `this.playing = false`
    - Cerrar el AudioContext si su estado no es `'closed'` (`this.audioContext.close()`)
    - _Requirements: 5.4_

- [x] 6. Adaptar ModeSelector.js para montar en uiContainer
  - [x] 6.1 Modificar ModeSelector.js para aceptar uiContainer
    - Añadir cuarto parámetro `uiContainer` al constructor
    - Reemplazar todos los `document.body.appendChild(...)` por `uiContainer.appendChild(...)`
    - Añadir método `dispose()` que remueva los elementos DOM creados (container, patternContainer, textureContainer, bandPanel)
    - _Requirements: 0.5, 5.5_

- [x] 7. Checkpoint - Verificar módulos adaptados
  - Todos los módulos adaptados y funcionando correctamente.

- [x] 8. Crear ExperienceManager.js
  - [x] 8.1 Crear archivo src/ExperienceManager.js con la fachada de orquestación
    - Constructor recibe `(container, uiContainer)` y crea todos los subsistemas en orden: RenderManager → View → Player → Terrain → TileManager → Skybox → MusicPlayer → BeatEvents → Stars → LuminousSpheres → PixelText → ModeSelector
    - Implementar método `start()` que inicie audio y el loop de animación
    - Implementar método `animate()` con `requestAnimationFrame`, calcular deltaTime (clampeado a máx 0.2s), actualizar todos los subsistemas en el orden exacto del main.js original: player → terrain → tileManager → beatEvents → stars → spheres → pixelText → verificar beatTriggered → skybox → view.render()
    - Implementar método `dispose()` que: cancele RAF pendiente, llame dispose en Player, MusicPlayer, RenderManager, ModeSelector, y limpie geometrías/materiales/texturas
    - Implementar método `resumeAudio()` para manejar la política de autoplay
    - Envolver el contenido de `animate()` en try/catch para evitar congelar la pantalla si hay errores
    - Almacenar `this.rafId` para poder cancelar el frame pendiente
    - Exponer callback `onResize` que propague a View
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 8.2, 8.3_

  - [ ]* 8.2 Escribir property test para cancelación del animation loop
    - **Property 3: Dispose cancela el Animation Loop**
    - **Validates: Requirements 5.2**

  - [ ]* 8.3 Escribir property test para clamping de deltaTime
    - **Property 5: DeltaTime nunca excede 0.2 segundos**
    - **Validates: Requirements 8.3**

- [x] 9. Transformar CanvasDrawComponent
  - [x] 9.1 Reescribir canvas-draw.ts como host de la experiencia Three.js
    - Eliminar toda la funcionalidad de dibujo 2D (propiedades `ctx`, `dibujando`, métodos `iniciarDibujo`, `dibujar`, `detenerDibujo`)
    - Añadir imports: `NgZone`, `inject`, `OnDestroy`, `ElementRef`, `ViewChild`, `AfterViewInit`
    - Declarar `@ViewChild('threeContainer')` para el container WebGL y `@ViewChild('uiContainer')` para los controles UI
    - Inyectar `NgZone` con `inject(NgZone)`
    - En `ngAfterViewInit()`: ejecutar dentro de `this.ngZone.runOutsideAngular(() => { ... })` la creación del ExperienceManager y su `start()`
    - Implementar `ngOnDestroy()` que llame `this.experience?.dispose()` y setee `null`
    - Añadir propiedad `showPlayPrompt` y método `onUserInteraction()` para manejar autoplay
    - No usar bindings, pipes ni interpolaciones que se evalúen cada frame
    - _Requirements: 0.1, 0.2, 0.3, 0.6, 3.1, 3.2, 3.3, 5.1, 5.2, 7.1, 7.2, 7.3, 8.1_

  - [x] 9.2 Reescribir canvas-draw.html con el template del host
    - Crear `<div #threeContainer class="three-container">` para el canvas WebGL
    - Crear `<div #uiContainer class="ui-container">` para los controles UI
    - Añadir overlay condicional con `@if (showPlayPrompt)` para solicitar interacción del usuario
    - Estilos: `:host` ocupa 100vw × 100vh, overflow hidden; `.three-container` ocupa 100% width/height; `.ui-container` es overlay absoluto con `pointer-events: none` y sus hijos con `pointer-events: auto`
    - No añadir CSS transforms, filters ni opacity animada al container
    - _Requirements: 3.1, 3.2, 0.5_

- [x] 10. Checkpoint - Verificar integración completa
  - Build compila, app funciona en localhost y en GitHub Pages.

- [ ]* 11. Escribir unit tests de integración
  - [~]* 11.1 Escribir tests unitarios para ExperienceManager
    - Verificar que `dispose()` invoca `renderer.dispose()`, `audio.pause()`, `audioContext.close()`
    - Verificar que el orden de update se mantiene correcto (spy en métodos)
    - Verificar que `resumeAudio()` intenta `audio.play()` y `audioContext.resume()`
    - _Requirements: 5.2, 5.3, 5.4, 8.2_

  - [ ]* 11.2 Escribir tests unitarios para CanvasDrawComponent
    - Verificar que RAF se registra dentro de `runOutsideAngular`
    - Verificar que `ngOnDestroy` invoca `dispose()` en la experience
    - Verificar que no hay subscripciones reactivas ni timers Angular activos durante el loop
    - _Requirements: 0.2, 0.6, 8.1_

- [x] 12. Checkpoint final - Compilación y validación
  - Build `ng build` compila sin errores. Deploy en GitHub Pages funcionando.
  - URL: https://juancarlossalcedo777.github.io/hack_kiro/

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requirements específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- Los property tests validan propiedades universales de corrección definidas en el diseño
- Los unit tests validan ejemplos específicos y edge cases
- Los archivos `.js` se copian desde `modern/src/` a `src/` (NO se convierten a TypeScript)
- La carpeta `modern/` se mantiene como referencia local, no trackeada en git
- El package manager del proyecto es `pnpm`
- El loop de animación DEBE correr fuera de NgZone (prioridad máxima de rendimiento)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "4.1", "5.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "4.2"] },
    { "id": 3, "tasks": ["8.1"] },
    { "id": 4, "tasks": ["8.2", "8.3", "9.1"] },
    { "id": 5, "tasks": ["9.2"] },
    { "id": 6, "tasks": ["11.1", "11.2"] }
  ]
}
```
