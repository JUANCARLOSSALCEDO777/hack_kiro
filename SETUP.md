# Setup — Desarrollo Local vs Producción

## Desarrollo Local

El modo local permite probar el flujo completo de mensajes Discord → texto 3D **sin necesidad de infraestructura AWS desplegada**.

### Opción A — Solo frontend (sin bot de Discord)

Útil para probar la visualización 3D de mensajes sin conectar el bot.

```bash
# Terminal 1: WS server de prueba (envía mensajes automáticos cada 10s)
cd backend
npx tsx dev-ws-server.ts

# Terminal 2: Frontend Angular
ng serve
```

El `dev-ws-server.ts` acepta mensajes escritos por consola y los envía al frontend. También envía mensajes de prueba automáticos para verificar que el flujo funciona.

### Opción B — Flujo completo con bot de Discord

El bot se conecta a Discord, captura mensajes del canal designado, los sanitiza y los envía al frontend via WebSocket local.

```bash
# Terminal 1: Bot con WS server local integrado (puerto 4201)
cd backend
npx tsx index.ts

# Terminal 2: Frontend Angular
ng serve
```

**Requisito**: configurar `WS_CHANNEL_ID` en `backend/.env` con el ID real del canal de Discord que quieras monitorear.

### Cómo funciona el switch automático

| Componente | Condición | Comportamiento |
|------------|-----------|----------------|
| Backend | `enviroment=DEV` en `.env` | Usa `LocalWsSender` (WS server en puerto 4201) |
| Frontend | `window.location.hostname === 'localhost'` | Conecta a `ws://localhost:4201` |

No necesitas cambiar código para alternar entre modos.

---

## Producción

Para conectar con la infraestructura AWS real (API Gateway WebSocket + Lambda).

### 1. Desplegar infraestructura

```bash
cd infra
sam build
sam deploy --guided
```

Esto crea el API Gateway WebSocket API y el Lambda. Al final del deploy obtienes los outputs:
- `WebSocketEndpoint` — URL WSS para el frontend (ej: `wss://abc123.execute-api.us-east-1.amazonaws.com/prod`)
- `WebSocketManagementEndpoint` — URL HTTPS para el bot (ej: `https://abc123.execute-api.us-east-1.amazonaws.com/prod`)

### 2. Configurar el backend

En `backend/.env`:

```env
enviroment=PROD
WS_API_ENDPOINT=https://abc123.execute-api.us-east-1.amazonaws.com/prod
WS_CHANNEL_ID=123456789012345678
```

### 3. Configurar el frontend

En `src/Config.js`, reemplazar el placeholder del endpoint:

```javascript
websocket: {
    endpoint: typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'ws://localhost:4201'
        : 'wss://abc123.execute-api.us-east-1.amazonaws.com/prod',
    // ...
}
```

### 4. Ejecutar en producción

```bash
cd backend
npx tsx index.ts   # o: node dist/index.js si compilaste con tsc
```

### Cómo funciona el switch automático

| Componente | Condición | Comportamiento |
|------------|-----------|----------------|
| Backend | `enviroment=PROD` en `.env` | Usa `WsSender` (API Gateway Management API) |
| Frontend | hostname ≠ `localhost` (ej: GitHub Pages) | Conecta al endpoint WSS de AWS |

---

## Resumen de archivos de configuración

| Archivo | Qué controla |
|---------|-------------|
| `backend/.env` | `enviroment` (DEV/PROD), `WS_API_ENDPOINT`, `WS_CHANNEL_ID`, rate limit |
| `src/Config.js` | Endpoint WSS del frontend (auto-detecta localhost vs producción) |
| `infra/template.yaml` | Infraestructura AWS (API Gateway + Lambda) |

## Puertos usados en desarrollo

| Puerto | Servicio |
|--------|----------|
| 4200 | Angular dev server (`ng serve`) |
| 4201 | WebSocket server local (backend → frontend) |
