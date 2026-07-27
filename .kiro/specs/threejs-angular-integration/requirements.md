# Requirements Document

## Introduction

Integración de la experiencia interactiva 3D "modern" (Three.js + Vite) dentro del proyecto Angular existente. El componente `canvas-draw` se transforma en el host de la experiencia Three.js, manteniendo los archivos JavaScript originales sin conversión a TypeScript. El objetivo es que la experiencia 3D completa (terreno generativo, partículas, skybox, post-procesado, audio sincronizado) se renderice dentro del ciclo de vida controlado por Angular.

## Glossary

- **Host_Component**: El componente Angular `canvas-draw` que actúa como contenedor DOM para el renderer WebGL de Three.js.
- **RenderManager**: Clase JavaScript existente en `src/experience/RenderManager.js` responsable de crear y configurar el `WebGLRenderer` de Three.js.
- **Experience**: El conjunto completo de la escena 3D interactiva (terreno, partículas, skybox, player, post-procesado, audio).
- **Angular_Build**: El sistema de compilación de Angular (`@angular/build:application`) que empaqueta el proyecto.
- **Container_Element**: El elemento DOM (`<div>`) dentro del Host_Component donde se monta el canvas WebGL generado por el RenderManager.
- **MusicPlayer**: Clase JavaScript existente en `src/events/MusicPlayer.js` que gestiona la reproducción de audio con Web Audio API.
- **Animation_Loop**: El ciclo de `requestAnimationFrame` que actualiza y renderiza la escena 3D cada frame.
- **Modern_Modules**: Los archivos JavaScript (`.js`) ubicados dentro del directorio `src/` del proyecto Angular (en subdirectorios como `src/experience/`, `src/terrain/`, `src/events/`, `src/particles/`, `src/ui/` y archivos raíz como `src/Config.js`, `src/ExperienceManager.js`) que componen la experiencia 3D.

## Requirements

### Requirement 0: Prioridad de rendimiento WebGL

**User Story:** Como desarrollador, quiero que el rendimiento del renderizado WebGL con Three.js sea siempre la máxima prioridad del sistema, para que la experiencia 3D mantenga un framerate estable sin degradación causada por el framework Angular.

#### Acceptance Criteria

1. THE Experience SHALL mantener un framerate mínimo de 60fps en hardware que soporta la experiencia standalone sin Angular.
2. THE Angular framework SHALL NO introducir overhead medible en el hilo principal durante la ejecución del Animation_Loop.
3. THE Host_Component SHALL NO utilizar bindings de Angular, pipes, directivas ni interpolaciones que se evalúen en cada frame del Animation_Loop.
4. IF existe un conflicto entre una convención de Angular y el rendimiento WebGL, THEN THE implementación SHALL priorizar el rendimiento WebGL sobre la convención de Angular.
5. THE Container_Element SHALL NO tener estilos CSS que fuercen composición de capas adicional (transforms, filters, opacity animada) que interfiera con el rendimiento del canvas WebGL.
6. THE Host_Component SHALL NO registrar observables, subscripciones reactivas ni timers de Angular que compitan por tiempo de CPU con el Animation_Loop.

### Requirement 1: Instalación de Three.js en el proyecto Angular

**User Story:** Como desarrollador, quiero que Three.js esté disponible como dependencia del proyecto Angular, para que los Modern_Modules puedan resolver sus imports de Three.js al compilar.

#### Acceptance Criteria

1. THE Angular_Build SHALL resolver imports de `three` y `three/addons/*` desde los Modern_Modules sin errores de compilación.
2. THE Angular_Build SHALL utilizar la versión ^0.170.0 de Three.js, consistente con los Modern_Modules.

### Requirement 2: Configuración de TypeScript para importar JavaScript

**User Story:** Como desarrollador, quiero que el compilador TypeScript de Angular permita importar archivos `.js` directamente, para que los Modern_Modules se usen sin conversión a TypeScript.

#### Acceptance Criteria

1. THE Angular_Build SHALL compilar el proyecto cuando el Host_Component importe Modern_Modules escritos en JavaScript.
2. THE Angular_Build SHALL incluir los archivos JavaScript del directorio `src/` (subdirectorios `experience/`, `terrain/`, `events/`, `particles/`, `ui/` y archivos raíz) en el ámbito de compilación.
3. IF un Modern_Module tiene errores de tipado implícito, THEN THE Angular_Build SHALL compilar sin fallar, tratando los archivos JavaScript con verificación de tipos deshabilitada.

### Requirement 3: Transformación del Host_Component

**User Story:** Como desarrollador, quiero que el componente `canvas-draw` se transforme en el host de la experiencia Three.js, para que el canvas WebGL se renderice dentro de su template.

#### Acceptance Criteria

1. THE Host_Component SHALL contener un Container_Element referenciable mediante `ViewChild`.
2. THE Host_Component SHALL ocupar el 100% del viewport (ancho y alto) sin barras de scroll.
3. THE Host_Component SHALL eliminar la funcionalidad previa de dibujo 2D en canvas.

### Requirement 4: Adaptación del RenderManager para montar en el componente

**User Story:** Como desarrollador, quiero que el RenderManager monte el canvas WebGL dentro del Container_Element del Host_Component, para que Angular controle dónde se renderiza la escena.

#### Acceptance Criteria

1. WHEN el Host_Component proporciona un Container_Element, THE RenderManager SHALL anexar el canvas WebGL como hijo de ese Container_Element en lugar de `document.body`.
2. THE RenderManager SHALL dimensionar el canvas al tamaño del Container_Element.
3. WHEN el Container_Element cambia de tamaño, THE RenderManager SHALL redimensionar el canvas para ajustarse al nuevo tamaño del Container_Element.

### Requirement 5: Ciclo de vida Angular para inicialización y limpieza

**User Story:** Como desarrollador, quiero que la Experience se inicialice y se destruya siguiendo el ciclo de vida de Angular, para evitar fugas de memoria y comportamiento indefinido.

#### Acceptance Criteria

1. WHEN el Host_Component ejecuta `ngAfterViewInit`, THE Host_Component SHALL inicializar la Experience completa (RenderManager, View, Player, Terrain, Skybox, MusicPlayer, partículas, post-procesado).
2. WHEN el Host_Component ejecuta `ngOnDestroy`, THE Host_Component SHALL detener el Animation_Loop cancelando el `requestAnimationFrame` pendiente.
3. WHEN el Host_Component ejecuta `ngOnDestroy`, THE Host_Component SHALL invocar `dispose()` en el renderer WebGL para liberar recursos GPU.
4. WHEN el Host_Component ejecuta `ngOnDestroy`, THE Host_Component SHALL detener la reproducción de audio y cerrar el AudioContext del MusicPlayer.
5. WHEN el Host_Component ejecuta `ngOnDestroy`, THE Host_Component SHALL remover los event listeners registrados en `window` (resize, mousemove, mousedown, mouseup, touch events).

### Requirement 6: Gestión de assets estáticos

**User Story:** Como desarrollador, quiero que los assets de la experiencia (audio, fuentes bitmap) estén disponibles en el directorio público de Angular, para que las rutas relativas de los Modern_Modules resuelvan correctamente en runtime.

#### Acceptance Criteria

1. THE Angular_Build SHALL servir los archivos de audio desde la ruta `audio/music.mp3` relativa a la raíz pública.
2. THE Angular_Build SHALL servir los archivos de fuente bitmap desde las rutas `fonts/pixel-font-atlas.fnt` y `fonts/pixel-font-atlas.png` relativas a la raíz pública.
3. THE Angular_Build SHALL incluir los assets de audio y fuentes en el bundle de producción.

### Requirement 7: Gestión de autoplay de audio

**User Story:** Como usuario, quiero que la experiencia musical comience tras mi primera interacción con la página, para cumplir con las políticas de autoplay de los navegadores modernos.

#### Acceptance Criteria

1. WHEN el navegador bloquea la reproducción automática de audio, THE Host_Component SHALL mostrar un indicador visual solicitando interacción del usuario.
2. WHEN el usuario realiza un click o tap en el Host_Component, THE MusicPlayer SHALL iniciar la reproducción de audio y reanudar el AudioContext.
3. WHEN el AudioContext se reanuda exitosamente, THE Host_Component SHALL ocultar el indicador visual de solicitud de interacción.

### Requirement 8: Integración del Animation Loop con Angular

**User Story:** Como desarrollador, quiero que el ciclo de animación funcione fuera de la detección de cambios de Angular, para mantener un rendimiento de 60fps sin disparar ciclos innecesarios de change detection.

#### Acceptance Criteria

1. THE Animation_Loop SHALL ejecutarse fuera de la zona de Angular (NgZone) para evitar disparar change detection en cada frame.
2. THE Animation_Loop SHALL mantener la misma secuencia de actualización que el main.js original: Player → Terrain → TileManager → BeatEvents → Stars → Spheres → PixelText → Skybox → View.render().
3. WHEN el Animation_Loop se ejecuta, THE Experience SHALL calcular deltaTime con un máximo de 0.2 segundos para evitar saltos grandes tras pérdida de foco.
