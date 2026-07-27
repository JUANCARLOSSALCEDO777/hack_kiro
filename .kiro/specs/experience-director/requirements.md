# Requirements Document

## Introduction

El Experience Director es un sistema de dirección cinematográfica y visual para la experiencia Three.js audio-reactiva existente. Actúa como capa de orquestación que controla qué combinaciones de efectos visuales, modos de terreno, patrones de luz, movimientos de cámara y elementos escénicos están activos en cada momento. Se integra con el PhaseManager existente (actualmente desconectado) y el sistema de beats para crear una experiencia audiovisual coherente y programable.

El sistema se construye SOBRE la arquitectura actual sin eliminar ni reemplazar la configuración existente: el modo cinemático actual (oscilación de velocity/altitude/targetDistance/fov entre cinDefault y cinPreset), la paleta completa de 6 modos de terreno, los 7 patrones de luz de esferas, los parámetros de bloom, y toda la configuración de Config.js se preservan como base. El Experience Director añade una capa de orquestación por encima, pudiendo incorporar nuevos presets y efectos según se necesite.

## Glossary

- **Experience_Director**: Sistema central que coordina la activación/desactivación de modos visuales, asigna efectos a beats, y orquesta secuencias cinematográficas a lo largo del tiempo.
- **Phase_Manager**: Subsistema existente que define fases temporales de la experiencia, gatilladas por timestamps de la canción.
- **Beat_Router**: Componente que mapea tipos de beat (bass, mid, high) a respuestas visuales configurables en tiempo de ejecución.
- **Timeline_Sequencer**: Capa de secuenciación que programa eventos y transiciones por tiempo absoluto, conteo de beats, o triggers compuestos.
- **Mood_Preset**: Paquete de configuración coherente que combina modo de terreno, patrón de luz, bloom, skybox, y parámetros de cámara en una unidad semántica.
- **Camera_Sequence**: Secuencia programada de movimientos cinematográficos de cámara (órbita, dolly, grúa, tracking) con duración y easing definidos.
- **Visual_Element**: Cualquier componente visual activable/desactivable de la escena (Stars, LuminousSpheres, WebcamLEDScreens, PixelText, Skybox).
- **Transition_Engine**: Módulo responsable de interpolar suavemente entre configuraciones visuales, evitando cambios abruptos.
- **Camera_Mode**: Modo de control de cámara que determina cómo se mueve el punto de vista (first-person, orbit, dolly, crane, tracking, static).
- **Beat_Type**: Clasificación del pulso rítmico detectado por BeatEvents (bass, mid, high).
- **Effect_Binding**: Asociación configurable entre un Beat_Type y una respuesta visual específica.

## Requirements

### Requisito 1: Integración del Phase Manager con el Experience Manager

**User Story:** Como desarrollador, quiero que el PhaseManager esté conectado al ExperienceManager y al Experience_Director, para que las fases temporales dirijan automáticamente la experiencia visual.

#### Criterios de Aceptación

1. WHEN el ExperienceManager se inicializa, THE Experience_Director SHALL instanciar el Phase_Manager e invocar su método update(state, musicTime) en cada frame del loop de animación.
2. WHEN el tiempo de música alcanza o supera el timestamp (en segundos) de un trigger de fase pendiente, THE Phase_Manager SHALL notificar al Experience_Director del cambio de fase dentro del mismo frame en que se detectó el cruce.
3. WHEN el Experience_Director recibe una notificación de cambio de fase, THE Experience_Director SHALL aplicar el Mood_Preset mapeado al índice de la nueva fase mediante el Transition_Engine, utilizando la tabla de asociación fase-preset configurada en el Experience_Director.
4. THE Phase_Manager SHALL exponer una API para agregar, remover y reordenar triggers de fase en tiempo de ejecución, donde cada trigger es un objeto con tiempo en segundos (mayor o igual a 0) e índice de fase válido, soportando un máximo de 64 triggers simultáneos.
5. IF el Phase_Manager recibe un índice de fase fuera del rango de Mood_Presets registrados o un tiempo negativo, THEN THE Phase_Manager SHALL ignorar la solicitud y registrar una advertencia en consola.
6. IF el tiempo de música retrocede (seek hacia atrás), THEN THE Phase_Manager SHALL recalcular la fase activa correspondiente al nuevo tiempo y notificar al Experience_Director si la fase resultante difiere de la actual.
7. WHEN el Experience_Director recibe una notificación de cambio de fase y no existe un Mood_Preset asociado al índice de fase, THEN THE Experience_Director SHALL mantener el Mood_Preset actual sin cambios y registrar una advertencia en consola.

### Requisito 2: Beat Routing Configurable

**User Story:** Como desarrollador, quiero configurar qué efectos visuales se disparan con cada tipo de beat, para poder crear combinaciones expresivas sin modificar código fuente.

#### Criterios de Aceptación

1. THE Beat_Router SHALL mantener un mapa de Effect_Bindings que asocia cada Beat_Type con una lista ordenada (por orden de inserción) de hasta 16 respuestas visuales.
2. WHEN BeatEvents detecta un beat de tipo bass, THE Beat_Router SHALL ejecutar todas las respuestas visuales asignadas al Beat_Type bass en orden de inserción.
3. WHEN BeatEvents detecta un beat de tipo mid, THE Beat_Router SHALL ejecutar todas las respuestas visuales asignadas al Beat_Type mid en orden de inserción.
4. WHEN BeatEvents detecta un beat de tipo high, THE Beat_Router SHALL ejecutar todas las respuestas visuales asignadas al Beat_Type high en orden de inserción.
5. THE Beat_Router SHALL permitir agregar, remover y reemplazar Effect_Bindings en tiempo de ejecución mediante métodos públicos (addBinding, removeBinding, replaceBindings).
6. WHEN el Beat_Router procesa un Beat_Type cuya lista de Effect_Bindings está vacía o todos sus bindings referencian Visual_Elements inactivos, THE Beat_Router SHALL omitir la ejecución sin generar error.
7. THE Beat_Router SHALL soportar bindings con parámetros de intensidad (0.0 a 1.0) que se aplican como factor multiplicador al parámetro principal de magnitud de cada respuesta visual.
8. IF un Effect_Binding se configura con un valor de intensidad fuera del rango 0.0 a 1.0, THEN THE Beat_Router SHALL restringir (clamp) el valor al límite más cercano del rango (0.0 o 1.0) y registrar una advertencia en consola.

### Requisito 3: Mood Presets

**User Story:** Como desarrollador, quiero definir presets de "mood" que combinen múltiples configuraciones visuales en paquetes coherentes, para poder cambiar la atmósfera completa de la experiencia con una sola instrucción, preservando los presets y efectos que ya tengo configurados.

#### Criterios de Aceptación

1. THE Experience_Director SHALL almacenar una colección de hasta 20 Mood_Presets registrados simultáneamente, cada uno con nombre único (cadena de 1 a 50 caracteres) como identificador.
2. WHEN se activa un Mood_Preset, THE Experience_Director SHALL delegar al Transition_Engine la interpolación hacia la nueva configuración, aplicando: modo de terreno, patrón de esferas luminosas, parámetros de bloom (strength, radius, threshold), color de skybox, y Camera_Mode con sus parámetros asociados.
3. THE Experience_Director SHALL incluir un Mood_Preset predefinido llamado "default" que represente la configuración actual del sistema (cinematic mode existente con cinDefault/cinPreset, terreno spectrum, patrón radialPulse, bloom strength 1.5/radius 0.4/threshold 0.4, skybox con ciclo HSL 0.6-0.95), preservando exactamente los valores que ya operan en el ExperienceManager.
4. THE Experience_Director SHALL incluir al menos 3 Mood_Presets adicionales predefinidos con los nombres: "energético", "contemplativo" y "caótico", cada uno configurando valores distintos para todos los campos definidos en el criterio 2.
5. THE Experience_Director SHALL preservar la paleta completa de efectos existentes (6 modos de terreno: spectrum, spring, flat, still, steps, wave; 7 patrones de luz: waveRow, diagonal, radialPulse, allFlash, snake, checker, off) como opciones disponibles para cualquier Mood_Preset, sin eliminar ni renombrar ninguno.
6. THE Experience_Director SHALL permitir registrar Mood_Presets personalizados en tiempo de ejecución proporcionando un objeto de configuración que contenga todos los campos obligatorios: modo de terreno, patrón de esferas luminosas, parámetros de bloom (strength, radius, threshold), color de skybox, y Camera_Mode con sus parámetros.
7. IF se solicita activar un Mood_Preset inexistente, THEN THE Experience_Director SHALL ignorar la solicitud y registrar una advertencia en consola indicando el nombre solicitado y la lista de presets disponibles.
8. IF se solicita registrar un Mood_Preset con un nombre ya existente, THEN THE Experience_Director SHALL sobrescribir la configuración anterior con la nueva y registrar una advertencia en consola.
9. IF se solicita registrar un Mood_Preset con un objeto de configuración al que le faltan campos obligatorios, THEN THE Experience_Director SHALL rechazar el registro y registrar un error en consola indicando los campos faltantes.

### Requisito 4: Transiciones Suaves entre Configuraciones

**User Story:** Como desarrollador, quiero que los cambios entre configuraciones visuales se interpolen suavemente, para evitar saltos abruptos que rompan la inmersión.

#### Criterios de Aceptación

1. WHEN el Experience_Director cambia de un Mood_Preset a otro, THE Transition_Engine SHALL interpolar todos los parámetros numéricos (bloom, colores, parámetros de cámara numéricos) durante una duración configurable entre 0.1 y 10 segundos (por defecto 2 segundos).
2. THE Transition_Engine SHALL soportar funciones de easing configurables (linear, easeInOut, easeIn, easeOut) para cada transición, aplicando linear como easing por defecto si no se especifica uno.
3. WHILE una transición está en progreso, THE Transition_Engine SHALL actualizar los valores interpolados en cada frame del loop de animación.
4. IF se solicita una nueva transición mientras otra está en progreso, THEN THE Transition_Engine SHALL cancelar la transición anterior y comenzar la nueva desde los valores actuales interpolados.
5. THE Transition_Engine SHALL interpolar colores en espacio HSL para evitar tonos intermedios no deseados.
6. WHEN la transición completa, THE Transition_Engine SHALL notificar al Experience_Director mediante un callback de finalización.
7. WHEN un Mood_Preset contiene parámetros no interpolables (modo de terreno, patrón de esferas luminosas), THE Transition_Engine SHALL aplicar el valor del preset destino al inicio de la transición sin interpolación.
8. IF la duración de transición proporcionada es menor a 0.1 segundos o no es un número válido, THEN THE Transition_Engine SHALL aplicar los valores del preset destino de forma inmediata sin interpolación.

### Requisito 5: Activación y Desactivación de Elementos Visuales

**User Story:** Como desarrollador, quiero poder activar y desactivar elementos visuales individuales de la escena de forma programática, para componer la experiencia visual por capas.

#### Criterios de Aceptación

1. THE Experience_Director SHALL mantener un registro de todos los Visual_Elements disponibles (Stars, LuminousSpheres, WebcamLEDScreens, PixelText, Skybox), inicializados todos en estado activo al momento de la creación del Experience_Director.
2. WHEN se solicita desactivar un Visual_Element mediante setElementActive(elementName, false), THE Experience_Director SHALL ocultar el elemento de la escena (visible = false), detener su actualización en el loop de animación, y suprimir sus respuestas a onBeat, efectivo a partir del siguiente frame.
3. WHEN se solicita activar un Visual_Element previamente desactivado mediante setElementActive(elementName, true), THE Experience_Director SHALL restaurar su visibilidad (visible = true) y reanudar su actualización en el loop de animación desde su último estado interno preservado, efectivo a partir del siguiente frame.
4. THE Experience_Director SHALL exponer el método setElementActive(elementName, active) que acepta un string correspondiente a un nombre registrado y un booleano, y el método getElementState(elementName) que retorna un booleano indicando si el elemento está activo (true) o inactivo (false).
5. IF se invoca setElementActive o getElementState con un elementName que no corresponde a ningún Visual_Element registrado, THEN THE Experience_Director SHALL lanzar un Error cuyo mensaje incluya el nombre solicitado y la lista completa de nombres válidos registrados.
6. WHILE un Visual_Element está en estado inactivo, THE Experience_Director SHALL preservar el estado interno del elemento sin reiniciarlo, de modo que al reactivarse continúe desde donde quedó.

### Requisito 6: Sistema de Cámara Cinematográfica

**User Story:** Como desarrollador, quiero un sistema robusto de secuencias de cámara programadas con múltiples modos cinematográficos, para crear momentos visuales impactantes que muestren la escena desde ángulos diversos y enriquezcan la experiencia del espectador.

#### Criterios de Aceptación

1. THE Experience_Director SHALL soportar al menos 8 Camera_Modes: first-person (existente), orbit, dolly, crane, tracking, flyby, shake, y static.
2. WHEN se activa el Camera_Mode orbit, THE Camera_Sequence SHALL rotar la cámara alrededor de un punto focal con parámetros configurables: velocidad angular (0.1 a 10.0 radianes/segundo, por defecto 0.5), radio (10 a 2000 unidades, por defecto 200), altitud relativa al punto focal (-500 a 500, por defecto 0), y dirección de giro (clockwise/counterclockwise).
3. WHEN se activa el Camera_Mode dolly, THE Camera_Sequence SHALL desplazar la cámara linealmente entre una posición de inicio y una posición final (ambas como Vector3), con velocidad configurable (0.1 a 200.0 unidades/segundo, por defecto 50.0) y un lookAt target fijo o interpolado durante el recorrido.
4. WHEN se activa el Camera_Mode crane, THE Camera_Sequence SHALL elevar o descender la cámara entre dos altitudes (startY, endY) manteniendo un punto focal configurable, con velocidad (0.1 a 100.0 unidades/segundo, por defecto 30.0), opcionalmente combinando rotación horizontal durante el ascenso/descenso (0 a 2π radianes de barrido).
5. WHEN se activa el Camera_Mode tracking, THE Camera_Sequence SHALL seguir un path definido por un mínimo de 2 y un máximo de 50 puntos de control (CatmullRom spline), con velocidad (0.1 a 200.0 unidades/segundo, por defecto 50.0), tensión de la curva configurable (0.0 a 1.0, por defecto 0.5), y lookAt que puede ser un punto fijo, el siguiente punto del path, o un target dinámico (posición del jugador).
6. WHEN se activa el Camera_Mode flyby, THE Camera_Sequence SHALL ejecutar un sobrevuelo rápido a baja altitud (10 a 100 unidades sobre el terreno) siguiendo la dirección actual del Player pero con velocidad multiplicada (2x a 10x, por defecto 3x) y FOV ampliado temporalmente (hasta 120°), creando un efecto de velocidad cinematográfica.
7. WHEN se activa el Camera_Mode shake, THE Camera_Sequence SHALL aplicar un desplazamiento aleatorio de alta frecuencia a la posición y rotación de la cámara con amplitud (0.1 a 20.0 unidades, por defecto 2.0) y frecuencia (1 a 60 Hz, por defecto 20) configurables, superpuesto sobre el Camera_Mode que esté activo en ese momento.
8. WHEN se activa el Camera_Mode static, THE Camera_Sequence SHALL fijar la cámara en una posición y rotación específicas (posición Vector3, lookAt Vector3), sin movimiento, durante la duración especificada.
9. THE Experience_Director SHALL permitir que Camera_Sequences definan un parámetro beatSync (booleano) que, cuando está activo, sincroniza puntos clave del movimiento (inicio de órbita, cambio de dirección, pico de shake) con los beats detectados por BeatEvents.
10. THE Experience_Director SHALL soportar lookAt dinámico en cualquier Camera_Mode, donde el target de la cámara puede ser: un punto fijo (Vector3), la posición actual del Player, el centro de las WebcamLEDScreens, o un punto interpolado entre dos targets.
11. WHEN una Camera_Sequence finaliza, THE Experience_Director SHALL retornar al Camera_Mode anterior mediante una transición interpolada con easing easeInOut a través del Transition_Engine (duración configurable entre 0.1 y 5.0 segundos, por defecto 1 segundo).
12. THE Experience_Director SHALL permitir encadenar múltiples Camera_Sequences (máximo 32) en una playlist con tiempos de inicio relativos en segundos, donde cada entrada especifica el Camera_Mode, sus parámetros, y opcionalmente una función de transición al siguiente.
13. WHILE un Camera_Mode cinematográfico está activo (excepto shake que se superpone), THE Player SHALL desactivar el control de mouse e input del usuario sobre la cámara.
14. THE Experience_Director SHALL permitir interrumpir una Camera_Sequence en cualquier momento mediante input del usuario (click o tecla configurable), retornando al modo first-person con transición suave.
15. IF se solicita activar un Camera_Mode no registrado, THEN THE Experience_Director SHALL ignorar la solicitud y registrar una advertencia en consola indicando los Camera_Modes válidos disponibles.
16. THE Camera_Sequence SHALL requerir una duración en segundos (0.1 a 300.0) como parámetro obligatorio al momento de su creación, determinando cuándo la secuencia se considera finalizada.
17. THE Experience_Director SHALL exponer un método previewSequence(sequenceConfig) que ejecuta una Camera_Sequence de forma inmediata sin afectar el Timeline_Sequencer, para permitir previsualización durante el desarrollo desde la GUI.

### Requisito 7: Timeline Sequencer

**User Story:** Como desarrollador, quiero una capa de secuenciación temporal que programe qué ocurre y cuándo, para poder componer la experiencia como una línea de tiempo editando datos declarativos.

#### Criterios de Aceptación

1. THE Timeline_Sequencer SHALL aceptar una lista de hasta 500 eventos ordenados, cada uno con: tiempo de disparo (valor decimal en segundos con precisión de milisegundos), acción a ejecutar, y parámetros de la acción.
2. WHEN el tiempo de la experiencia alcanza el tiempo de disparo de un evento (con tolerancia igual a la duración de un frame del loop de animación), THE Timeline_Sequencer SHALL ejecutar la acción asociada en ese mismo frame.
3. THE Timeline_Sequencer SHALL soportar tres tipos de trigger: tiempo absoluto (segundos decimales), conteo de beats por Beat_Type específico (N-ésimo beat de tipo bass, mid, o high), y triggers compuestos que requieren que el conteo de beats se alcance dentro de una ventana de 500ms respecto al tiempo absoluto indicado.
4. THE Timeline_Sequencer SHALL soportar acciones de tipo: activar Mood_Preset, activar/desactivar Visual_Element, iniciar Camera_Sequence, y modificar Beat_Router bindings.
5. WHEN se carga una nueva lista de eventos en tiempo de ejecución, THE Timeline_Sequencer SHALL reemplazar la lista actual, omitir los eventos cuyo tiempo de disparo ya haya transcurrido, y continuar la ejecución desde el siguiente evento futuro sin reiniciar la experiencia.
6. IF un evento del timeline referencia una acción con parámetros inválidos, THEN THE Timeline_Sequencer SHALL omitir el evento y registrar una advertencia en consola con el índice y descripción del error.
7. WHILE la experiencia está en pausa, THE Timeline_Sequencer SHALL congelar el avance de su reloj interno y reanudar el conteo desde el mismo punto cuando la experiencia se reanude.

### Requisito 8: Integración con GUI de Debug

**User Story:** Como desarrollador, quiero controlar el Experience Director desde el panel lil-gui existente, para poder experimentar con configuraciones en tiempo real durante el desarrollo.

#### Criterios de Aceptación

1. WHEN el DebugModeManager activa el modo debug, THE Experience_Director SHALL crear un folder "Experience Director" en la instancia GUI existente con controles para: un dropdown de selección de Mood_Preset activo (listando todos los presets registrados), un dropdown de selección de Camera_Mode (listando todos los modos registrados), y un toggle por cada Visual_Element registrado.
2. WHEN el DebugModeManager activa el modo debug, THE Experience_Director SHALL agregar un sub-folder "Beat Router" dentro de su folder GUI que muestre los Effect_Bindings actuales de cada Beat_Type y permita modificar el binding de intensidad (0.0 a 1.0) de cada uno.
3. WHEN el usuario modifica un parámetro del Experience_Director desde la GUI, THE Experience_Director SHALL iniciar la aplicación del cambio en el siguiente frame de animación, utilizando el Transition_Engine con una duración de 0.5 segundos.
4. WHILE el modo debug está activo, THE Experience_Director SHALL actualizar los valores mostrados en la GUI en cada frame del loop de animación para reflejar cambios de estado originados por el Phase_Manager, Timeline_Sequencer u otras fuentes externas.
5. WHEN el DebugModeManager desactiva el modo debug, THE Experience_Director SHALL destruir el folder GUI creado y liberar los listeners asociados a sus controles.
6. IF el Experience_Director no tiene Mood_Presets o Camera_Modes registrados al momento de crear la GUI debug, THEN THE Experience_Director SHALL mostrar el folder con los dropdowns vacíos y actualizarlos cuando se registren nuevos presets o modos.

### Requisito 9: Serialización y Carga de Configuraciones

**User Story:** Como desarrollador, quiero poder exportar e importar configuraciones del Experience Director como objetos JSON, para guardar y reutilizar composiciones.

#### Criterios de Aceptación

1. THE Experience_Director SHALL exponer un método exportConfig() que retorne un objeto JSON con: todos los Mood_Presets, la lista del Timeline_Sequencer, los Effect_Bindings del Beat_Router, y las Camera_Sequences definidas.
2. WHEN se invoca importConfig(json) con un objeto JSON válido que contiene al menos un Mood_Preset en el timeline, THE Experience_Director SHALL cargar la configuración y aplicar el primer Mood_Preset del timeline mediante el Transition_Engine.
3. THE Experience_Director SHALL garantizar que para cualquier configuración válida, invocar exportConfig() y luego importConfig() con el resultado produzca un JSON de exportación idéntico al original (igualdad profunda de propiedades y valores).
4. IF el JSON proporcionado a importConfig tiene estructura inválida o le faltan secciones requeridas (Mood_Presets, Timeline, Effect_Bindings, Camera_Sequences), THEN THE Experience_Director SHALL rechazar la carga completa, mantener la configuración anterior, y retornar un objeto de error describiendo los campos inválidos o faltantes.
5. IF el JSON proporcionado a importConfig referencia nombres de Mood_Presets, Visual_Elements, o Camera_Modes que no están registrados en el sistema, THEN THE Experience_Director SHALL rechazar la carga completa, mantener la configuración anterior, y retornar un objeto de error listando los nombres no reconocidos.
6. IF el JSON proporcionado a importConfig contiene un timeline sin Mood_Presets definidos, THEN THE Experience_Director SHALL rechazar la carga y retornar un objeto de error indicando que se requiere al menos un Mood_Preset.

### Requisito 10: Arquitectura y Extensibilidad

**User Story:** Como desarrollador, quiero que el Experience Director sea extensible y desacoplado, para poder agregar nuevos modos de cámara, presets y elementos visuales sin modificar el núcleo del sistema ni perder los efectos ya existentes.

#### Criterios de Aceptación

1. THE Experience_Director SHALL seguir un patrón de registro donde los Camera_Modes, Visual_Elements, y Mood_Presets se registran mediante métodos públicos (registerCameraMode, registerElement, registerPreset), cada uno requiriendo un objeto que implemente las propiedades definidas en el Glosario para su tipo correspondiente.
2. THE Experience_Director SHALL comunicarse con los subsistemas existentes (BeatEvents, Player, Skybox, LuminousSpheres, Stars, WebcamLEDScreens) únicamente a través de interfaces públicas documentadas, sin acceder a propiedades internas.
3. THE Experience_Director SHALL emitir eventos (patrón observer) para cambios de fase, inicio/fin de transiciones, y activación de Camera_Sequences, incluyendo en cada evento el nombre del evento, el timestamp, y los datos relevantes al cambio (nombre de fase, preset, o secuencia involucrada).
4. THE Experience_Director SHALL funcionar como módulo ES independiente importable por el ExperienceManager sin crear dependencias circulares.
5. THE Experience_Director SHALL preservar intacto el comportamiento actual de todos los subsistemas existentes (BeatEvents con sus 3 detectores y 6 modos de terreno, LuminousSpheres con sus 7 patrones, Skybox con su ciclo HSL, Player con su modo cinemático), limitándose a orquestarlos sin modificar su lógica interna.
6. IF se invoca un método de registro (registerCameraMode, registerElement, registerPreset) con un objeto que no implementa las propiedades requeridas para su tipo, THEN THE Experience_Director SHALL rechazar el registro y lanzar un error descriptivo indicando las propiedades faltantes.
7. IF se invoca un método de registro con un nombre ya registrado para el mismo tipo, THEN THE Experience_Director SHALL rechazar el registro y lanzar un error indicando que el nombre ya existe en el registro de ese tipo.
