# Requirements Document

## Introducción

Esta feature implementa un sistema de dos modos de visualización para la experiencia 3D: un **modo principal** limpio sin controles visibles (por defecto) y un **modo debug** que expone el panel lil-gui para ajustar la experiencia en tiempo real. El usuario alterna entre ambos modos mediante una tecla del teclado. El toggle no afecta el rendimiento WebGL y el panel se oculta/muestra sin destruirse ni recrearse.

## Glosario

- **Experience**: La aplicación 3D renderizada con Three.js dentro del componente Angular `canvas-draw`
- **Debug_Panel**: El panel de controles lil-gui instanciado por `ModeSelector.js`, que contiene carpetas de terreno, luces y spectrum
- **Toggle_Key**: La tecla del teclado asignada para alternar entre modos (tecla backtick `` ` ``)
- **Main_Mode**: Estado de visualización por defecto donde la experiencia 3D se muestra sin controles de GUI visibles
- **Debug_Mode**: Estado de visualización donde el Debug_Panel es visible para permitir ajustes en tiempo real
- **DebugModeManager**: Módulo responsable de gestionar el estado del modo activo y coordinar la visibilidad del Debug_Panel

## Requisitos

### Requisito 1: Modo principal por defecto

**User Story:** Como usuario, quiero que la experiencia 3D se muestre limpia al cargar la página, para disfrutar del contenido visual sin distracciones.

#### Criterios de Aceptación

1. WHEN la Experience se inicializa, THE DebugModeManager SHALL establecer Main_Mode como el modo activo
2. WHILE Main_Mode está activo, THE Debug_Panel SHALL permanecer oculto mediante CSS `display: none`
3. WHILE Main_Mode está activo, THE Experience SHALL continuar renderizando el loop de animación sin alteraciones

### Requisito 2: Modo debug con panel de controles

**User Story:** Como desarrollador, quiero acceder a los controles de lil-gui para ajustar terreno, luces y spectrum en tiempo real, para iterar rápidamente sobre la experiencia visual.

#### Criterios de Aceptación

1. WHEN Debug_Mode se activa, THE Debug_Panel SHALL mostrarse mediante CSS `display: block` (o el valor original del elemento)
2. WHILE Debug_Mode está activo, THE Debug_Panel SHALL responder a interacciones del usuario con los controles de terreno, luces y spectrum
3. WHILE Debug_Mode está activo, THE Experience SHALL continuar renderizando el loop de animación sin alteraciones

### Requisito 3: Toggle mediante tecla del teclado

**User Story:** Como usuario, quiero alternar entre el modo principal y el modo debug presionando una tecla, para acceder a los controles de forma rápida sin buscar un botón en la interfaz.

#### Criterios de Aceptación

1. WHEN el usuario presiona la Toggle_Key (tecla backtick `` ` ``), THE DebugModeManager SHALL alternar entre Main_Mode y Debug_Mode
2. WHEN el DebugModeManager alterna de Main_Mode a Debug_Mode, THE Debug_Panel SHALL hacerse visible de forma inmediata
3. WHEN el DebugModeManager alterna de Debug_Mode a Main_Mode, THE Debug_Panel SHALL ocultarse de forma inmediata
4. IF el usuario presiona la Toggle_Key mientras un campo de texto del Debug_Panel tiene foco, THEN THE DebugModeManager SHALL ignorar la pulsación para evitar conflictos con la entrada de texto

### Requisito 4: Sin impacto en rendimiento WebGL

**User Story:** Como usuario, quiero que el toggle entre modos no cause drops de frames ni interrupciones visuales, para que la experiencia se sienta fluida.

#### Criterios de Aceptación

1. THE DebugModeManager SHALL ocultar y mostrar el Debug_Panel modificando únicamente la propiedad CSS `display` del elemento DOM raíz del panel
2. THE DebugModeManager SHALL preservar la instancia del panel lil-gui durante toda la vida de la Experience sin destruirla ni recrearla
3. WHILE el modo cambia, THE Experience SHALL mantener el loop de animación `requestAnimationFrame` sin interrupciones ni reinicializaciones

### Requisito 5: Registro del listener de teclado

**User Story:** Como desarrollador, quiero que el listener del teclado se registre y desregistre correctamente, para evitar memory leaks o comportamiento inesperado al destruir el componente.

#### Criterios de Aceptación

1. WHEN la Experience se inicializa, THE DebugModeManager SHALL registrar un listener de evento `keydown` en el objeto `document`
2. WHEN la Experience se destruye (dispose), THE DebugModeManager SHALL remover el listener de evento `keydown` de `document`
3. THE DebugModeManager SHALL registrar el listener fuera de la zona de Angular (NgZone) para evitar ciclos de detección de cambios innecesarios

### Requisito 6: Escalabilidad y legibilidad del código

**User Story:** Como desarrollador, quiero que el sistema de debug esté diseñado para escalar con nuevas funcionalidades a futuro, para no tener que refactorizar la arquitectura al añadir más herramientas de debug.

#### Criterios de Aceptación

1. THE DebugModeManager SHALL implementarse como un módulo independiente con una interfaz clara (init, toggle, dispose) que no dependa de la implementación interna del Debug_Panel
2. THE DebugModeManager SHALL permitir registrar nuevos paneles o secciones de debug sin modificar el código existente del manager
3. THE Debug_Panel SHALL organizar sus controles en carpetas lil-gui semánticas (por dominio: terreno, luces, spectrum) para facilitar la adición de nuevos controles
4. THE código del DebugModeManager SHALL usar nombres descriptivos, comentarios en español que expliquen el "por qué", y separación clara de responsabilidades entre gestión de estado y manipulación del DOM
5. IF se añade una nueva funcionalidad de debug en el futuro, THEN THE estructura del DebugModeManager SHALL permitir integrarla sin modificar los requisitos 1-5 existentes
