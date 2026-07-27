# Requirements Document

## Introduction

Esta feature permite capturar frames de la webcam del usuario en tiempo real, aplicarles un efecto visual tipo pantalla LED/dot-matrix (reduciendo resolución y dibujando puntos circulares en un grid que simula una pantalla de estadio), y usar el resultado como textura dinámica del skybox en la experiencia 3D existente construida con Three.js. La funcionalidad es completamente opcional: si el usuario no concede permisos de cámara, el skybox mantiene su comportamiento animado por color actual.

## Glossary

- **Webcam_Capture**: Subsistema responsable de solicitar acceso a la cámara del usuario mediante `navigator.mediaDevices.getUserMedia()` y capturar frames a intervalos regulares.
- **LED_Processor**: Subsistema que procesa un frame de video aplicando el efecto dot-matrix: reduce la resolución y dibuja puntos circulares sobre un canvas 2D simulando una pantalla LED de estadio.
- **Skybox_Manager**: El módulo existente (`Skybox.js`) que gestiona el fondo envolvente de la escena 3D y que será extendido para aceptar texturas dinámicas.
- **Experience_Manager**: Orquestador central de la experiencia 3D que coordina todos los subsistemas.
- **LED_Canvas**: Canvas 2D offscreen donde se renderiza el efecto dot-matrix antes de subirlo como textura.
- **Frame_Interval**: Período de tiempo entre capturas consecutivas de la webcam (1-2 segundos).
- **Dot_Grid**: Rejilla de puntos circulares que compone la visualización LED, donde cada punto corresponde a un píxel de la imagen reducida.

## Requirements

### Requirement 1: Solicitar acceso a la webcam

**User Story:** Como usuario, quiero que la experiencia 3D me solicite acceso a mi webcam, para poder alimentar el skybox con mi video en vivo.

#### Acceptance Criteria

1. WHEN el usuario activa la funcionalidad de webcam, THE Webcam_Capture SHALL solicitar acceso a la cámara mediante `navigator.mediaDevices.getUserMedia()` con resolución de video limitada a 640x480 o inferior.
2. WHEN el navegador no soporta `navigator.mediaDevices.getUserMedia()`, THE Webcam_Capture SHALL registrar un mensaje informativo en consola y mantener el skybox en su modo de color animado.
3. WHEN el usuario deniega el permiso de cámara, THE Webcam_Capture SHALL mantener el skybox en su modo de color animado sin mostrar mensajes de error intrusivos al usuario.
4. WHEN el usuario concede el permiso de cámara, THE Webcam_Capture SHALL iniciar la captura de frames en el intervalo configurado.

### Requirement 2: Captura periódica de frames

**User Story:** Como desarrollador, quiero que la captura de frames sea a baja frecuencia (1-2 segundos), para no impactar el rendimiento de la experiencia 3D.

#### Acceptance Criteria

1. WHILE la webcam está activa, THE Webcam_Capture SHALL capturar un frame del stream de video cada Frame_Interval configurable (valor por defecto: 1500ms).
2. WHILE la webcam está activa, THE Webcam_Capture SHALL utilizar un elemento `<video>` oculto como fuente para capturar frames mediante `drawImage` en un canvas auxiliar.
3. IF el stream de video se interrumpe inesperadamente, THEN THE Webcam_Capture SHALL detener la captura periódica y revertir el skybox al modo de color animado.
4. THE Webcam_Capture SHALL permitir detener y reanudar la captura sin necesidad de volver a solicitar permisos de cámara mientras el stream permanezca activo.

### Requirement 3: Procesamiento del efecto LED/dot-matrix

**User Story:** Como usuario, quiero que mi video se transforme en un efecto de pantalla LED de estadio, para que el fondo de la experiencia 3D tenga una estética inmersiva y artística.

#### Acceptance Criteria

1. WHEN un frame es capturado, THE LED_Processor SHALL reducir la resolución del frame a un grid de tamaño configurable (valor por defecto: 64x36 puntos).
2. WHEN un frame es capturado, THE LED_Processor SHALL muestrear el color promedio de cada celda del grid a partir del frame original.
3. THE LED_Processor SHALL dibujar en el LED_Canvas un punto circular por cada celda del Dot_Grid, usando el color muestreado como fill y un fondo oscuro entre los puntos.
4. THE LED_Processor SHALL aplicar un radio de punto configurable (valor por defecto: 80% del tamaño de celda) para simular el espacio inter-LED.
5. THE LED_Processor SHALL ejecutar todo el procesamiento en un canvas 2D offscreen sin bloquear el hilo principal de renderizado 3D por más de 5ms por frame procesado.

### Requirement 4: Distribución de pantallas LED en el skybox

**User Story:** Como usuario, quiero ver múltiples pantallas LED distribuidas alrededor del skybox mostrando frames secuenciales de mi webcam, para sentir una experiencia envolvente tipo estadio con varias pantallas gigantes.

#### Acceptance Criteria

1. THE Skybox_Manager SHALL renderizar múltiples planos (pantallas) distribuidos alrededor de la escena en un arreglo circular o cilíndrico, cada uno mostrando un frame procesado diferente.
2. THE Skybox_Manager SHALL mantener un buffer circular de los últimos N frames procesados (N configurable, valor por defecto: 8 pantallas).
3. WHEN un nuevo frame es procesado, THE Skybox_Manager SHALL asignarlo a la pantalla más reciente y desplazar los frames anteriores a las pantallas siguientes en orden secuencial (la pantalla más alejada muestra el frame más antiguo).
4. THE Skybox_Manager SHALL posicionar las pantallas equidistantes alrededor del jugador, orientadas hacia el centro de la escena.
5. WHEN la webcam se desactiva o el stream se pierde, THE Skybox_Manager SHALL remover todas las pantallas y restaurar el modo de color animado original.
6. THE Skybox_Manager SHALL crear las pantallas como planos con `MeshBasicMaterial` usando `CanvasTexture` para cada frame, actualizando solo la textura del frame más reciente en cada ciclo.

### Requirement 5: Rendimiento y ciclo de vida

**User Story:** Como usuario, quiero que la funcionalidad de webcam no degrade los FPS de la experiencia 3D, para mantener una navegación fluida.

#### Acceptance Criteria

1. THE Webcam_Capture SHALL mantener el framerate de la experiencia 3D por encima de 30 FPS durante la captura y procesamiento de frames de webcam.
2. WHEN el Experience_Manager ejecuta su método `dispose()`, THE Webcam_Capture SHALL detener el stream de video, liberar las pistas de la cámara (`track.stop()`), y limpiar los canvas auxiliares.
3. THE LED_Processor SHALL reutilizar el mismo LED_Canvas entre frames consecutivos en lugar de crear nuevos elementos canvas por cada procesamiento.
4. WHILE la pestaña del navegador no es visible (document.hidden === true), THE Webcam_Capture SHALL pausar la captura de frames para ahorrar recursos.

### Requirement 5b: Reacción al beat y bloom

**User Story:** Como usuario, quiero que las pantallas LED reaccionen a la música pulsando con el beat, para que se sientan integradas con la experiencia audiovisual.

#### Acceptance Criteria

1. WHEN un beat es detectado por el sistema de audio, THE pantallas LED SHALL pulsar brevemente (escalar al 105% y volver al 100%) sincronizado con el beat.
2. THE pantallas LED SHALL usar colores lo suficientemente brillantes para que el pipeline de bloom (UnrealBloomPass) existente las haga irradiar un glow natural tipo pantalla LED real.
3. WHEN el modo debug está activo y el beat está pausado, THE pantallas LED SHALL mantener su escala base sin pulsar.

### Requirement 7: Controles de calibración en modo debug

**User Story:** Como desarrollador, quiero poder ajustar los parámetros de las pantallas LED en tiempo real desde el panel debug, para calibrar la visualización sin recargar la página.

#### Acceptance Criteria

1. WHEN el modo debug está activo, THE DebugModeManager SHALL exponer controles para ajustar en tiempo real: radio de las pantallas, tamaño de pantalla, altitud, cantidad de puntos del grid, radio de los dots, opacidad, y frame interval.
2. THE DebugModeManager SHALL exponer un botón/toggle para pausar/reanudar el beat de la música.
3. THE DebugModeManager SHALL exponer un botón/toggle para activar/desactivar la webcam.
4. WHEN un parámetro de calibración se modifica en debug, THE WebcamLEDScreens SHALL aplicar el cambio inmediatamente sin necesidad de reiniciar la captura.

### Requirement 6: Integración con el sistema existente

**User Story:** Como desarrollador, quiero que la feature se integre limpiamente con la arquitectura existente del Experience_Manager, para mantener la cohesión del código.

#### Acceptance Criteria

1. THE Experience_Manager SHALL instanciar el Webcam_Capture como un subsistema adicional durante su construcción, siguiendo el patrón de inyección de dependencias existente.
2. THE Webcam_Capture SHALL exponer un método `update(state)` que el loop de animación del Experience_Manager invoque en cada frame para gestionar la temporización de captura.
3. THE Webcam_Capture SHALL exponer un método `dispose()` que libere todos los recursos de cámara y canvas.
4. THE Config SHALL incluir una sección `webcam` con las propiedades configurables: `frameInterval`, `gridWidth`, `gridHeight`, `dotRadiusRatio`, y `enabled`.
