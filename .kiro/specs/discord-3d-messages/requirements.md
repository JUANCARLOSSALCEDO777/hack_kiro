# Requirements Document

## Introduction

Esta feature conecta un canal de Discord con la experiencia 3D existente (Three.js) de modo que los mensajes escritos por personas en un canal designado se lean en tiempo real, viajen por un puente serverless y se muestren como textos 3D flotantes dentro de la escena.

El flujo completo es:

```
Canal Discord → Bot discord.js (EC2) → API Gateway WebSocket → Frontend Angular (cliente WSS) → cola PixelText → texto 3D
                                              ↓ (hook opcional futuro)
                                       Filtrado IA (Bedrock/Comprehend)
```

Decisiones ya tomadas que enmarcan estos requisitos:

- El bot corre 24/7 en una instancia EC2 (free tier).
- El puente en tiempo real es AWS API Gateway WebSocket API (free tier, ~1M mensajes/mes).
- El frontend es estático en GitHub Pages (HTTPS), por lo que debe conectarse por WSS (WebSocket seguro).
- El filtrado con IA es OPCIONAL: en esta feature solo se diseña el punto de extensión (hook), no se implementa la IA.
- Prioridad en costos bajos: usar free tier siempre que sea posible y evitar consumo descontrolado.

Restricción técnica conocida: el bitmap font de PixelText (atlas BMFont cargado en `PixelText.js`) probablemente solo soporta un subconjunto de caracteres (ASCII, mayúsculas). Los caracteres no presentes en el descriptor `.fnt` se omiten al renderizar (`if (!charData) continue;`), por lo que la sanitización debe contemplar esta limitación.

## Glossary

- **Discord_Bot**: Proceso Node.js con discord.js que corre en EC2, escucha eventos de mensajes de Discord y reenvía el contenido relevante hacia el puente WebSocket. Corresponde al código en `backend/`.
- **Canal_Designado**: Canal de texto de Discord, identificado por un ID configurable, cuyos mensajes normales (no comandos) deben ser capturados y transmitidos.
- **WebSocket_Bridge**: AWS API Gateway WebSocket API que recibe mensajes del Discord_Bot y los difunde a los clientes frontend conectados.
- **Frontend_Client**: Módulo del frontend Angular que mantiene la conexión WSS con el WebSocket_Bridge, recibe mensajes y los entrega al sistema de textos 3D.
- **PixelText_Queue**: Cola de textos del sistema `PixelText.js` (array `this.texts`), alimentada mediante el método `addText(str)`. Cada texto encolado se instancia como texto 3D cada `SPAWN_INTERVAL` segundos.
- **Bitmap_Font**: Fuente pixel art BMFont (atlas PNG + descriptor `.fnt`) usada por PixelText para renderizar caracteres. Solo soporta los caracteres definidos en su descriptor.
- **Caracter_Soportado**: Caracter cuyo código existe en el mapa `chars` del Bitmap_Font y por lo tanto puede renderizarse como texto 3D.
- **Sanitizador**: Componente lógico que normaliza y filtra el contenido de un mensaje antes de encolarlo en PixelText_Queue (longitud máxima, caracteres no soportados, contenido vacío).
- **AI_Filter_Hook**: Punto de extensión (interfaz) definido en el pipeline de procesamiento de mensajes donde a futuro podrá conectarse un filtrado o transformación por IA (Bedrock/Comprehend), sin implementarse en esta feature.
- **Rate_Limiter**: Mecanismo que limita la tasa de mensajes procesados/transmitidos por unidad de tiempo para controlar costos y evitar spam/flood.
- **Message_Payload**: Estructura de datos serializada (JSON) que representa un mensaje transmitido por el WebSocket_Bridge, con al menos el contenido de texto y metadatos mínimos.
- **Entorno**: Configuración de despliegue (dev o prod) que determina, entre otras cosas, el endpoint WSS al que se conecta el Frontend_Client.

## Requirements

### Requirement 1: Captura de mensajes del canal designado

**User Story:** Como espectador de la experiencia, quiero que los mensajes que la gente escribe en un canal de Discord se capturen en tiempo real, para que aparezcan en la escena 3D.

#### Acceptance Criteria

1. WHEN un mensaje es creado en el Canal_Designado, THE Discord_Bot SHALL capturar el contenido de texto del mensaje.
2. IF un mensaje es creado por una cuenta de bot, THEN THE Discord_Bot SHALL descartar el mensaje sin transmitirlo.
3. IF un mensaje es creado en un canal distinto al Canal_Designado, THEN THE Discord_Bot SHALL descartar el mensaje sin transmitirlo.
4. THE Discord_Bot SHALL capturar los mensajes normales del Canal_Designado independientemente de si comienzan con el prefijo de comandos.
5. IF el contenido de texto de un mensaje capturado está vacío tras eliminar espacios, THEN THE Discord_Bot SHALL descartar el mensaje sin transmitirlo.
6. WHERE la captura del Canal_Designado está activa, THE Discord_Bot SHALL continuar procesando los comandos con prefijo existentes.

### Requirement 2: Transmisión de mensajes vía WebSocket

**User Story:** Como desarrollador, quiero que el bot envíe cada mensaje capturado al puente WebSocket, para que el frontend pueda recibirlo en tiempo real.

#### Acceptance Criteria

1. WHEN el Discord_Bot captura un mensaje válido del Canal_Designado, THE Discord_Bot SHALL enviar un Message_Payload al WebSocket_Bridge.
2. THE Message_Payload SHALL estar serializado en formato JSON.
3. THE Message_Payload SHALL contener el contenido de texto del mensaje.
4. WHEN el WebSocket_Bridge recibe un Message_Payload del Discord_Bot, THE WebSocket_Bridge SHALL difundir el Message_Payload a todos los Frontend_Client conectados.
5. IF el envío de un Message_Payload al WebSocket_Bridge falla, THEN THE Discord_Bot SHALL registrar el error y continuar procesando los mensajes siguientes.

### Requirement 3: Conexión segura WSS desde el frontend

**User Story:** Como espectador, quiero que el frontend servido por GitHub Pages se conecte de forma segura al puente, para que reciba mensajes sin violar las políticas de contenido mixto del navegador.

#### Acceptance Criteria

1. WHEN el Frontend_Client se inicializa, THE Frontend_Client SHALL establecer una conexión al endpoint del WebSocket_Bridge usando el protocolo WSS.
2. THE Frontend_Client SHALL obtener el endpoint del WebSocket_Bridge desde la configuración del Entorno.
3. WHEN el Frontend_Client recibe un Message_Payload del WebSocket_Bridge, THE Frontend_Client SHALL deserializar el contenido de texto del Message_Payload.
4. IF un Message_Payload recibido no puede deserializarse como JSON válido, THEN THE Frontend_Client SHALL descartar el Message_Payload y registrar el error.

### Requirement 4: Reconexión automática del frontend

**User Story:** Como espectador, quiero que la conexión se restablezca sola si se cae, para que la experiencia siga recibiendo mensajes sin intervención manual.

#### Acceptance Criteria

1. WHEN la conexión WSS del Frontend_Client se cierra de forma inesperada, THE Frontend_Client SHALL intentar restablecer la conexión.
2. THE Frontend_Client SHALL aplicar un retardo creciente entre intentos de reconexión sucesivos hasta un tope máximo configurable.
3. WHEN el Frontend_Client restablece la conexión WSS, THE Frontend_Client SHALL reiniciar el retardo de reconexión a su valor inicial.
4. WHILE la conexión WSS está caída, THE Frontend_Client SHALL mantener la experiencia 3D en ejecución sin bloquearla.

### Requirement 5: Integración con la cola de PixelText

**User Story:** Como espectador, quiero que los mensajes recibidos se conviertan en textos 3D, para verlos aparecer en la escena.

#### Acceptance Criteria

1. WHEN el Frontend_Client obtiene el contenido de texto sanitizado de un mensaje, THE Frontend_Client SHALL encolarlo en la PixelText_Queue mediante el método `addText`.
2. WHEN un texto es encolado en la PixelText_Queue, THE PixelText_Queue SHALL instanciarlo como texto 3D según su intervalo de aparición existente.
3. IF el contenido de texto sanitizado queda vacío, THEN THE Frontend_Client SHALL descartarlo sin encolarlo en la PixelText_Queue.

### Requirement 6: Sanitización y límites del contenido

**User Story:** Como desarrollador, quiero que el contenido se limpie y limite antes de renderizarse, para que solo se muestren textos válidos y no se degrade la experiencia.

#### Acceptance Criteria

1. WHEN el Sanitizador procesa el contenido de texto de un mensaje, THE Sanitizador SHALL eliminar los caracteres que no sean Caracter_Soportado por el Bitmap_Font.
2. IF el contenido de texto de un mensaje excede la longitud máxima configurada, THEN THE Sanitizador SHALL truncar el contenido a la longitud máxima configurada.
3. THE Sanitizador SHALL convertir el contenido de texto a mayúsculas antes de encolarlo.
4. WHEN el Sanitizador termina de procesar un mensaje, THE Sanitizador SHALL eliminar los espacios en blanco al inicio y al final del contenido resultante.
5. FOR ALL contenidos de texto sanitizados, THE Sanitizador SHALL producir una cadena compuesta únicamente por instancias de Caracter_Soportado con longitud menor o igual a la longitud máxima configurada.

### Requirement 7: Punto de extensión para filtrado por IA

**User Story:** Como desarrollador, quiero un punto de extensión claro para moderación por IA, para poder conectar Bedrock o Comprehend en el futuro sin reescribir el pipeline.

#### Acceptance Criteria

1. THE AI_Filter_Hook SHALL exponer una interfaz que reciba el contenido de texto de un mensaje y devuelva el contenido de texto a transmitir.
2. WHERE ningún filtro de IA está configurado, THE AI_Filter_Hook SHALL devolver el contenido de texto de entrada sin modificarlo.
3. THE pipeline de procesamiento de mensajes SHALL invocar el AI_Filter_Hook antes de transmitir el contenido de texto hacia el frontend.
4. WHERE un filtro de IA está configurado, THE AI_Filter_Hook SHALL devolver el contenido de texto resultante del filtro para su transmisión.

### Requirement 8: Gestión de costos y control de tasa

**User Story:** Como responsable del proyecto, quiero que el sistema controle la tasa de mensajes y evite bucles, para mantenerme dentro del free tier y sin costos sorpresa.

#### Acceptance Criteria

1. WHEN la tasa de mensajes capturados supera el límite configurado del Rate_Limiter, THE Discord_Bot SHALL descartar los mensajes excedentes sin transmitirlos.
2. IF un mensaje proviene de una cuenta de bot, THEN THE Discord_Bot SHALL descartarlo para evitar bucles de retroalimentación de mensajes.
3. THE Rate_Limiter SHALL aplicar un límite de mensajes transmitidos por ventana de tiempo configurable.
4. WHEN un mensaje es descartado por el Rate_Limiter, THE Discord_Bot SHALL registrar el descarte para observabilidad.

### Requirement 9: Configuración de entorno y gestión de secretos

**User Story:** Como desarrollador, quiero que los endpoints y credenciales sean configurables por entorno y no estén incrustados en el código, para desplegar de forma segura en dev y prod.

#### Acceptance Criteria

1. THE Discord_Bot SHALL obtener el token de Discord y el endpoint del WebSocket_Bridge desde variables de entorno.
2. THE Frontend_Client SHALL obtener el endpoint WSS desde la configuración del Entorno correspondiente (dev o prod).
3. IF una variable de configuración requerida no está definida al iniciar, THEN THE Discord_Bot SHALL registrar un error descriptivo y detener el arranque.
4. THE sistema SHALL excluir del control de versiones los archivos que contienen secretos.
5. THE sistema SHALL evitar incrustar el token de Discord y otros secretos directamente en el código fuente.

### Requirement 10: Manejo de errores y resiliencia

**User Story:** Como espectador, quiero que los fallos puntuales no rompan la experiencia, para seguir viéndola aunque haya errores de red o mensajes inválidos.

#### Acceptance Criteria

1. IF el procesamiento de un mensaje individual lanza un error, THEN THE Discord_Bot SHALL registrar el error y continuar escuchando mensajes nuevos.
2. IF el Frontend_Client recibe un Message_Payload con formato inválido, THEN THE Frontend_Client SHALL descartar el Message_Payload y mantener la conexión abierta.
3. WHEN la conexión WSS del Discord_Bot con el WebSocket_Bridge se pierde, THE Discord_Bot SHALL intentar restablecer la conexión con retardo creciente.
4. WHILE el WebSocket_Bridge no está disponible, THE Frontend_Client SHALL mantener la experiencia 3D en ejecución y reintentar la conexión.
