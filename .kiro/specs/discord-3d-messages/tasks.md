# Implementation Plan: Discord 3D Messages

## Overview

Conectar un canal de Discord con la experiencia 3D existente para que los mensajes escritos por personas aparezcan como textos 3D flotantes en tiempo real. El pipeline es: Canal Discord → Bot (EC2) → API Gateway WebSocket → Frontend (WSS) → PixelText queue → texto 3D.

Lenguajes: TypeScript (backend), JavaScript (frontend), Node.js (Lambda).

## Tasks

- [x] 1. Backend — Módulos del pipeline de mensajes
  - [x] 1.1 Crear `backend/src/modules/sanitizer.ts` — función pura de sanitización
    - Implementar `sanitize(input, config)` con el pipeline: toUpperCase → filtrar chars no soportados → trim → truncar a maxLength
    - Exportar `SanitizerConfig` interface con `maxLength` y `supportedChars: Set<number>`
    - Definir el set de caracteres soportados basándose en los char codes del archivo `.fnt`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 1.2 Crear `backend/src/modules/rateLimiter.ts` — token bucket
    - Implementar clase `RateLimiter` con `tryConsume(): boolean` y `reset(): void`
    - Configuración via `RateLimitConfig`: `maxTokens`, `refillRate`, `windowMs`
    - Los tokens se recargan gradualmente según `refillRate`
    - _Requirements: 8.1, 8.3, 8.4_

  - [x] 1.3 Crear `backend/src/modules/aiFilterHook.ts` — pass-through hook
    - Exportar tipo `AiFilterHook = (text: string) => Promise<string>`
    - Exportar `passthroughFilter` como implementación por defecto que retorna el input sin cambios
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 1.4 Crear `backend/src/modules/wsSender.ts` — broadcast vía API Gateway Management API
    - Implementar clase `WsSender` con método `broadcast(payload: MessagePayload): Promise<void>`
    - Usar `ApiGatewayManagementApiClient` de `@aws-sdk/client-apigatewaymanagementapi`
    - Obtener connection IDs invocando la ruta `getConnections` del Lambda, o iterar sobre IDs conocidos
    - Manejar 410 Gone (connection stale) eliminando el ID sin romper el broadcast
    - _Requirements: 2.1, 2.4, 2.5, 10.1_

  - [x] 1.5 Crear `backend/src/modules/discordToWs.ts` — orquestador del pipeline
    - Escuchar `MessageCreate` en el canal designado (sin interferir con el `messageHandler` existente)
    - Pipeline: validar canal → validar no bot → validar contenido no vacío → sanitizar → descartar si vacío post-sanitización → rate limit → AI hook → broadcast
    - Usar las dependencias creadas en 1.1–1.4
    - Definir interface `MessagePayload { type: 'message', text: string, username: string, timestamp: number }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3_

  - [x] 1.6 Modificar `backend/config.ts` — añadir configuración WS
    - Añadir variables: `WS_API_ENDPOINT`, `WS_CHANNEL_ID`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `MAX_MESSAGE_LENGTH`
    - Leerlas desde `process.env` en el objeto config
    - Validar que las variables requeridas existen al arranque (lanzar error descriptivo si faltan)
    - Actualizar `backend/.env` con placeholders
    - _Requirements: 9.1, 9.3, 9.4, 9.5_

  - [x] 1.7 Modificar `backend/index.ts` — integrar el pipeline
    - Importar `discordToWs` y ejecutarlo tras `messageHandler` en el evento `ClientReady`
    - Pasar `client`, config de WS, rate limit y AI hook
    - _Requirements: 1.6, 2.1_

  - [ ]* 1.8 Escribir tests unitarios para sanitizer y rateLimiter
    - Crear `backend/tests/unit/sanitizer.test.ts` con casos: emojis, strings vacíos, strings largos, caracteres especiales
    - Crear `backend/tests/unit/rateLimiter.test.ts`: permite N mensajes, bloquea N+1
    - Instalar vitest como dev dependency con pnpm
    - _Requirements: 6.1–6.5, 8.1, 8.3_

  - [ ]* 1.9 Escribir property test para el sanitizador (Property 1)
    - **Property 1: Invariante del sanitizador**
    - Crear `backend/tests/property/sanitizer.property.ts` usando fast-check
    - Generador: `fc.string()` (Unicode completo)
    - Verificar: resultado es uppercase, solo chars soportados, longitud ≤ maxLength, sin whitespace al inicio/final
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

  - [ ]* 1.10 Escribir property test para rate limiter (Property 6)
    - **Property 6: Rate limiter respeta la ventana**
    - Crear `backend/tests/property/rateLimiter.property.ts` usando fast-check
    - Generador: `fc.nat({ max: 100 })` para cantidad de mensajes
    - Verificar: como máximo `maxTokens` mensajes permitidos por ventana
    - **Validates: Requirements 8.1, 8.3**

- [x] 2. Checkpoint — Verificar backend compila y tests pasan
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Infraestructura — AWS SAM (API Gateway WS + Lambda)
  - [x] 3.1 Crear `infra/template.yaml` — plantilla SAM
    - Definir API Gateway WebSocket API con routes: `$connect`, `$disconnect`, `getConnections`
    - Definir Lambda function (Node.js 20.x, 128MB RAM)
    - IAM role mínimo: solo `execute-api:ManageConnections`
    - Output del WebSocket endpoint para usar en config
    - _Requirements: 2.4, 9.1_

  - [x] 3.2 Crear `infra/lambda/connect.js` — handler de conexiones
    - Variable global `const connections = new Set()` para almacenar connection IDs en memoria
    - Manejar rutas: `$connect` (add), `$disconnect` (delete), `getConnections` (retornar lista)
    - Retornar `{ statusCode: 200 }` en todos los casos
    - _Requirements: 2.4, 4.1_

- [x] 4. Frontend — Cliente WebSocket e integración con PixelText
  - [x] 4.1 Crear `src/services/WebSocketClient.js` — cliente WSS con reconexión
    - Implementar clase con `connect()`, `disconnect()`, callback `onMessage`
    - Reconexión automática con exponential backoff: `min(initialDelay × 2^(N-1), maxDelay)`
    - Parsear JSON del mensaje, descartar si inválido (log warning, no cerrar conexión)
    - Resetear backoff delay cuando la conexión se establece exitosamente
    - _Requirements: 3.1, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 10.2, 10.4_

  - [x] 4.2 Modificar `src/Config.js` — añadir sección websocket
    - Agregar bloque `websocket: { endpoint, reconnect: { initialDelay, maxDelay, multiplier } }`
    - Endpoint por defecto apuntando al API Gateway WSS
    - _Requirements: 3.2, 9.2_

  - [x] 4.3 Modificar `src/ExperienceManager.js` — conectar WebSocket a PixelText
    - Instanciar `WebSocketClient` con el endpoint de Config
    - En el callback `onMessage`: extraer `payload.text`, descartar si vacío, llamar `this.pixelText.addText(text)`
    - Llamar `connect()` en el constructor y `disconnect()` en `dispose()`
    - _Requirements: 5.1, 5.2, 5.3, 10.4_

  - [ ]* 4.4 Escribir property test para exponential backoff (Property 9)
    - **Property 9: Exponential backoff del frontend**
    - Crear `src/tests/property/backoff.property.js` usando fast-check
    - Generador: `fc.nat({ min: 1, max: 20 })` para cantidad de reintentos
    - Verificar: delay = `min(initialDelay × 2^(N-1), maxDelay)`
    - **Validates: Requirements 4.2**

- [x] 5. Checkpoint — Verificar integración local completa
  - Probar el flujo completo localmente: bot captura mensaje → sanitiza → broadcast → frontend recibe → addText()
  - Para testing local sin AWS, usar un WS server simple (e.g., `ws` package) que simule el API Gateway
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Integración final — Wiring y validación
  - [x] 6.1 Instalar dependencia `@aws-sdk/client-apigatewaymanagementapi` en backend
    - `pnpm add @aws-sdk/client-apigatewaymanagementapi` en `backend/`
    - Verificar que el build de TypeScript compila sin errores
    - _Requirements: 2.1, 2.4_

  - [ ]* 6.2 Escribir property test para serialización round-trip (Property 2)
    - **Property 2: Serialización round-trip del payload**
    - Crear `backend/tests/property/payload.property.ts` usando fast-check
    - Generador: `fc.record({ text: fc.string(), username: fc.string(), timestamp: fc.nat() })`
    - Verificar: `JSON.parse(JSON.stringify(payload))` produce objeto equivalente
    - **Validates: Requirements 2.2, 2.3, 3.3**

  - [ ]* 6.3 Escribir property test para filtrado de bots (Property 3)
    - **Property 3: Filtrado de mensajes de bot**
    - Crear `backend/tests/property/pipeline.property.ts` usando fast-check
    - Generador: `fc.record({ bot: fc.constant(true), content: fc.string() })`
    - Verificar: ningún payload se transmite cuando `author.bot === true`
    - **Validates: Requirements 1.2, 8.2**

- [x] 7. Checkpoint final — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada task referencia requirements específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- Property tests validan propiedades universales de corrección definidas en el diseño
- Para testing local del flujo completo (checkpoint 5), levantar un servidor WS simple con el paquete `ws` que simule el API Gateway — no se necesita desplegar infraestructura AWS
- El backend usa pnpm como package manager (en `backend/`)
- El frontend usa pnpm como package manager (raíz del proyecto)
- Los connection IDs se almacenan en memoria del Lambda (sin DynamoDB)
- El bot existente (`messageHandler.ts`) sigue funcionando — `discordToWs` es un listener adicional

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "1.6"] },
    { "id": 2, "tasks": ["1.5", "1.8", "1.9", "1.10"] },
    { "id": 3, "tasks": ["1.7"] },
    { "id": 4, "tasks": ["3.1", "3.2", "4.1", "4.2"] },
    { "id": 5, "tasks": ["4.3", "4.4"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3"] }
  ]
}
```
