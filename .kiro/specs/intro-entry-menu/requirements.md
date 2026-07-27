# Requirements Document

## Introduction

Pantalla de entrada (intro screen) para una experiencia de presentación en vivo rítmica construida con Angular + Three.js. La aplicación se conecta en tiempo real a un canal de Discord mediante un bot, recibe los mensajes de los espectadores (con filtro parental activo) y los renderiza como texto 3D en el entorno inmersivo. Este menú aparece antes de iniciar la experiencia, presenta información sobre el proyecto al usuario, permite conectar el bot al canal de Discord, y actúa como punto de interacción obligatorio para desbloquear el AudioContext del navegador y la pantalla completa.

## Constraints

- **No modificar el backend**: Todo el desarrollo de esta spec se limita exclusivamente al frontend (Angular). El backend es responsabilidad de otro miembro del equipo y no debe editarse en ninguna tarea derivada de estos requisitos. La lógica de filtrado de mensajes trigger ("CODIGOFACILITO") y el cambio de estado de conexión se implementan únicamente en el frontend al recibir los mensajes por WebSocket.
- **Mínima invasión al sistema 3D**: Las modificaciones derivadas de esta spec deben ser lo menos invasivas posible al sistema de la experiencia 3D y Three.js. No se debe alterar la lógica de renderizado, la escena, los shaders, los subsistemas (RenderManager, View, Player, Terrain, etc.) ni la arquitectura del loop de animación existente. Las únicas modificaciones permitidas al ExperienceManager son: agregar callbacks de notificación y filtrar mensajes en el callback del WebSocketClient. Cualquier nueva funcionalidad debe implementarse como componentes Angular independientes superpuestos al canvas, sin modificar el pipeline de Three.js.

## Glossary

- **Intro_Overlay**: Componente Angular que renderiza la pantalla de entrada como overlay HTML por encima del canvas Three.js
- **Experience_Manager**: Fachada de orquestación que centraliza la creación y el loop de la experiencia 3D
- **Entry_Button**: Botón interactivo que permite al usuario iniciar la experiencia 3D
- **Content_Section**: Bloque visual dentro del Intro_Overlay que muestra información descriptiva del proyecto
- **Fade_Transition**: Animación CSS de desvanecimiento aplicada al cerrar el Intro_Overlay
- **Audio_Context**: API Web Audio del navegador que requiere interacción del usuario para activarse
- **Discord_Bot_Avatar**: Imagen representativa del bot de Discord, mostrada en el Intro_Overlay con una animación sutil de estilo electrónica
- **Connection_Indicator**: Elemento UI persistente que muestra el servidor y canal de Discord al que el bot está conectado actualmente, visible tanto en el menú de entrada como durante la experiencia
- **Viewer_Counter**: Elemento UI minimalista y persistente que muestra la cantidad de espectadores/participantes conectados al canal, visible tanto en el menú de entrada como durante la experiencia
- **Trigger_Message**: Mensaje WebSocket con contenido exacto "CODIGOFACILITO" que actúa como señal para cambiar el estado del Connection_Indicator sin añadirse al array de textos 3D
- **PixelText_Array**: Colección de strings que alimenta el sistema de renderizado de texto 3D (PixelText) en la escena

## Requirements

### Requirement 1: Visualización del Overlay de Entrada

**User Story:** Como usuario, quiero ver una pantalla de entrada al cargar la aplicación, para entender de qué se trata el proyecto antes de experimentarlo.

#### Acceptance Criteria

1. WHEN la aplicación se carga en el navegador, THE Intro_Overlay SHALL renderizarse cubriendo el 100% del viewport con un fondo de color negro con opacidad de 0.7, posicionado con z-index superior al canvas 3D y al contenedor UI
2. WHILE el Intro_Overlay está visible, THE Intro_Overlay SHALL mostrar un título del proyecto con un tamaño mínimo de 1.5rem y un párrafo descriptivo de entre 20 y 200 caracteres que indique la naturaleza audiovisual e interactiva de la experiencia
3. WHILE el Intro_Overlay está visible, THE Experience_Manager SHALL estar instanciado y ejecutando el loop de renderizado, pero con el audio en estado pausado (sin llamar a play) y sin solicitar requestFullscreen al navegador
4. WHILE el Intro_Overlay está visible, THE Intro_Overlay SHALL interceptar todos los eventos de puntero (pointer-events: all) impidiendo que el usuario interactúe con los elementos 3D o UI situados debajo

### Requirement 2: Contenido Informativo del Proyecto

**User Story:** Como usuario, quiero leer información clara sobre el proyecto en la pantalla de entrada, para saber qué voy a experimentar y cómo funciona la conexión con Discord.

#### Acceptance Criteria

1. WHILE el Intro_Overlay es visible y la experiencia 3D no ha sido iniciada, THE Intro_Overlay SHALL mostrar un título principal del proyecto con un tamaño de fuente mínimo de 24px y una relación de contraste mínima de 4.5:1 respecto al fondo
2. WHILE el Intro_Overlay es visible, THE Intro_Overlay SHALL mostrar una descripción del proyecto que identifique la aplicación como una presentación en vivo rítmica conectada a Discord con filtro parental, con una extensión máxima de 400 caracteres
3. THE Intro_Overlay SHALL mostrar información sobre las tecnologías utilizadas en el proyecto (Angular, Three.js, WebSocket, audio reactivo, Discord Bot)
4. THE Intro_Overlay SHALL mostrar instrucciones de interacción que incluyan como mínimo: la acción para conectar el bot al canal de Discord y la acción para iniciar la experiencia (click), con una extensión máxima de 250 caracteres
5. WHEN el usuario hace click para iniciar la experiencia, THE Intro_Overlay SHALL ocultarse completamente sin obstruir la visualización del entorno 3D

### Requirement 3: Botón de Entrada a la Experiencia

**User Story:** Como usuario, quiero un botón claro y accesible para iniciar la experiencia, para sentir control sobre cuándo comienza el contenido inmersivo.

#### Acceptance Criteria

1. THE Intro_Overlay SHALL mostrar un Entry_Button con un texto de al menos 2 palabras que contenga un verbo de acción relacionado con iniciar la experiencia (por ejemplo: "Entrar", "Iniciar experiencia", "Comenzar")
2. WHEN el usuario hace click en el Entry_Button, THE Intro_Overlay SHALL iniciar la Fade_Transition de salida
3. WHEN el usuario hace click en el Entry_Button, THE Experience_Manager SHALL reanudar el Audio_Context y comenzar la reproducción de audio
4. WHEN el usuario hace click en el Entry_Button, THE Intro_Overlay SHALL solicitar modo pantalla completa al navegador
5. IF el navegador rechaza la solicitud de pantalla completa, THEN THE Experience_Manager SHALL continuar la experiencia en modo ventana sin interrumpir la reproducción de audio ni la animación 3D
6. IF el Audio_Context no puede reanudarse tras la interacción del usuario, THEN THE Experience_Manager SHALL continuar la experiencia visual sin audio y mostrar un indicador informando al usuario que el audio no está disponible

### Requirement 4: Transición de Salida Animada

**User Story:** Como usuario, quiero que la pantalla de entrada desaparezca con una transición suave, para que el paso hacia la experiencia 3D se sienta fluido y no abrupto.

#### Acceptance Criteria

1. WHEN la Fade_Transition se inicia, THE Intro_Overlay SHALL reducir su opacidad de 1 a 0 en un período entre 600ms y 1200ms
2. WHEN la Fade_Transition finaliza (evento transitionend o fin del tiempo de animación configurado), THE Intro_Overlay SHALL removerse completamente del DOM en un máximo de 100ms tras la finalización, para no interferir con el rendimiento del canvas Three.js
3. WHILE la Fade_Transition está en progreso, THE Entry_Button SHALL ignorar toda interacción del usuario (click, tecla Enter y tecla Espacio) y presentar el atributo disabled para evitar múltiples activaciones
4. IF la Fade_Transition no completa dentro de 1500ms desde su inicio, THEN THE Intro_Overlay SHALL removerse del DOM como fallback para garantizar que el usuario acceda a la experiencia 3D

### Requirement 5: Diseño Visual Coherente

**User Story:** Como usuario, quiero que la pantalla de entrada tenga un diseño visual atractivo y coherente con la estética de la experiencia 3D, para percibir una presentación profesional.

#### Acceptance Criteria

1. THE Intro_Overlay SHALL utilizar un fondo con lightness máxima de 20% y texto con lightness mínima de 80%, garantizando un ratio de contraste mínimo de 4.5:1 entre texto y fondo conforme a WCAG AA
2. THE Intro_Overlay SHALL renderizar todo su contenido sin desbordamiento horizontal ni truncamiento de texto en viewports con ancho entre 320px y 3840px
3. WHEN el usuario posiciona el cursor sobre el Entry_Button, THE Entry_Button SHALL mostrar un cambio observable en al menos una propiedad visual (background-color, border, box-shadow, o transform) dentro de los 150ms siguientes
4. WHEN el Entry_Button recibe foco mediante teclado, THE Entry_Button SHALL mostrar un indicador de foco visible con un contraste mínimo de 3:1 respecto al fondo circundante
5. THE Intro_Overlay SHALL usar un tamaño mínimo de 16px para el cuerpo del texto y un tamaño mínimo de 24px para los encabezados, con un line-height mínimo de 1.4 en ambos casos

### Requirement 6: Accesibilidad del Overlay

**User Story:** Como usuario con diversidad funcional, quiero poder navegar e interactuar con la pantalla de entrada usando teclado, para acceder a la experiencia sin depender exclusivamente del mouse.

#### Acceptance Criteria

1. WHILE el Entry_Button tiene foco, WHEN el usuario presiona la tecla Enter o Espacio, THE Entry_Button SHALL disparar la misma acción que un click (iniciar Fade_Transition, reanudar Audio_Context y solicitar pantalla completa)
2. WHEN el Intro_Overlay se renderiza en pantalla, THE Intro_Overlay SHALL colocar el foco del teclado en el Entry_Button dentro de los primeros 100ms tras el renderizado
3. THE Intro_Overlay SHALL incluir un atributo role y aria-label o aria-labelledby en el contenedor principal, y aria-label en el Entry_Button que describa su propósito para lectores de pantalla
4. WHILE el Intro_Overlay está visible, THE Intro_Overlay SHALL atrapar el foco dentro de sus límites, de modo que al presionar Tab desde el último elemento interactivo el foco retorne al primer elemento interactivo del overlay

### Requirement 7: Compatibilidad con el Flujo Existente

**User Story:** Como desarrollador, quiero que el intro overlay se integre con el componente CanvasDraw existente, para no romper la arquitectura actual de la aplicación.

#### Acceptance Criteria

1. THE Intro_Overlay SHALL reemplazar el elemento `.play-prompt` actual del componente CanvasDraw, ocupando la misma posición en el DOM (hijo directo del host component), con z-index igual o superior a 10, y delegando al método `onUserInteraction()` existente cuando el usuario interactúa para descartarlo
2. WHILE el Intro_Overlay está visible, THE Experience_Manager SHALL continuar ejecutando el loop de animación (requestAnimationFrame activo) renderizando la escena 3D de fondo, visible a través del fondo semitransparente del overlay (opacidad del fondo entre 0.5 y 0.85)
3. WHEN el usuario interactúa con el Intro_Overlay para descartarlo, THE Experience_Manager SHALL mantener el loop de animación sin cancelar el requestAnimationFrame activo y sin re-instanciar ningún subsistema (RenderManager, View, Player, Terrain, etc.), continuando desde el mismo frame en que se encontraba
4. WHEN el usuario interactúa con el Intro_Overlay para descartarlo, THE Experience_Manager SHALL reanudar el AudioContext y reproducir el audio (invocando resumeAudio()) para cumplir con la política de autoplay del navegador, tal como lo hace el flujo actual con el .play-prompt
5. IF el Intro_Overlay no se remueve del DOM tras la interacción del usuario (por un error de renderizado del framework), THEN THE Experience_Manager SHALL continuar operando el loop de animación sin degradación, y el overlay no SHALL bloquear la interacción con la escena 3D subyacente

### Requirement 8: Indicador de Estado de Conexión

**User Story:** Como presentador, quiero ver siempre a qué servidor y canal de Discord está conectado el bot, para tener certeza del estado de la conexión durante toda la presentación en vivo.

#### Acceptance Criteria

1. THE Connection_Indicator SHALL estar visible de forma permanente tanto mientras el Intro_Overlay está activo como durante la reproducción de la experiencia 3D, con un z-index superior al canvas Three.js
2. THE Connection_Indicator SHALL mostrar el nombre del servidor y el nombre del canal de Discord al que el bot está conectado, en un formato legible con tamaño mínimo de 12px
3. WHEN la aplicación se carga inicialmente, THE Connection_Indicator SHALL mostrar el estado de conexión al servidor de pruebas (cuyo ID está configurado en el backend) como valor por defecto
4. WHEN el frontend recibe un mensaje WebSocket con contenido exacto "CODIGOFACILITO", THE Connection_Indicator SHALL cambiar su texto para indicar la conexión al servidor "HACKATHON KIRO"
5. WHEN el frontend recibe un mensaje WebSocket con contenido exacto "CODIGOFACILITO", THE Experience_Manager SHALL interceptar el mensaje y excluirlo del PixelText_Array, de modo que no se renderice como texto 3D en la escena
6. WHILE la experiencia 3D está en reproducción, THE Connection_Indicator SHALL permanecer visible sin interferir con la visualización del contenido 3D, utilizando un posicionamiento fijo en una esquina del viewport

### Requirement 9: Contador de Viewers/Participantes

**User Story:** Como presentador, quiero ver cuántos espectadores están participando en tiempo real, para medir el engagement de la audiencia durante la presentación.

#### Acceptance Criteria

1. THE Viewer_Counter SHALL estar visible de forma permanente tanto mientras el Intro_Overlay está activo como durante la reproducción de la experiencia 3D, con un z-index superior al canvas Three.js
2. THE Viewer_Counter SHALL mostrar la cantidad de espectadores/participantes conectados con un diseño minimalista que ocupe un área máxima de 120px por 40px
3. WHILE la experiencia 3D está en reproducción, THE Viewer_Counter SHALL permanecer visible sin interferir con la visualización del contenido 3D, utilizando un posicionamiento fijo y tipografía con tamaño entre 12px y 16px
4. WHEN la cantidad de participantes cambia, THE Viewer_Counter SHALL actualizar su valor de forma inmediata sin animaciones que distraigan de la experiencia principal

### Requirement 10: Animación del Avatar del Bot de Discord

**User Story:** Como usuario, quiero ver una representación animada del bot de Discord en la pantalla de entrada, para tener una referencia visual atractiva del agente que conecta la experiencia con el chat.

#### Acceptance Criteria

1. WHILE el Intro_Overlay está visible, THE Discord_Bot_Avatar SHALL mostrarse como una imagen del avatar del bot con una animación sutil y continua de estilo electrónica
2. THE Discord_Bot_Avatar SHALL tener un diseño con estética cute (no afeminada) y elementos visuales que reflejen el estilo de música electrónica (partículas, glow, pulso rítmico o similar)
3. THE Discord_Bot_Avatar SHALL tener una animación con un ciclo de repetición entre 2 y 6 segundos, que incluya al menos un efecto de los siguientes: pulso de escala, glow pulsante, partículas orbitales o breathing effect
4. THE Discord_Bot_Avatar SHALL renderizarse con un tamaño mínimo de 64px y máximo de 200px, manteniendo una proporción de aspecto cuadrada (1:1), centrado o alineado de forma coherente con el layout del Intro_Overlay
5. WHILE el Intro_Overlay está visible, THE Discord_Bot_Avatar SHALL estar rodeado por un entorno visual (borde, fondo, o efecto circundante) que refuerce la estética de electrónica sin dominar visualmente el contenido informativo del overlay
