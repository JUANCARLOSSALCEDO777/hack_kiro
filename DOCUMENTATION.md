# 🎵 Hack Kiro — Experiencia Audiovisual 3D Interactiva en Tiempo Real

## Resumen Ejecutivo

**Hack Kiro** es una experiencia audiovisual 3D inmersiva conectada en tiempo real a Discord. Los espectadores escriben mensajes en un canal de Discord, estos viajan a través de un pipeline serverless de AWS y aparecen como textos 3D flotantes dentro de una escena interactiva de Three.js — todo sincronizado al ritmo de la música.

El proyecto demuestra integración profunda entre **AWS serverless** (API Gateway WebSocket, Lambda, DynamoDB), un bot de Discord y un frontend de alto rendimiento (Angular 22 + Three.js), todo orquestado por un sistema de dirección cinematográfica que programa efectos visuales por fases temporales.

**Demo en vivo:** [https://juan-.github.io/hack_kiro/](https://juan-.github.io/hack_kiro/)

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FLUJO DE DATOS                                      │
│                                                                                  │
│  Discord Channel  ──►  Bot (discord.js)  ──►  AWS API Gateway WSS              │
│                         │ EC2 free tier         │                                │
│                         │                       ▼                                │
│                         │              Lambda (Node.js 20)                       │
│                         │                       │                                │
│                         │              DynamoDB (Connections)                    │
│                         │                       │                                │
│                         │              Broadcast a N clientes                   │
│                         │                       │                                │
│                         │                       ▼                                │
│                         │              Frontend (Angular + Three.js)             │
│                         │              ──► Texto 3D flotante                     │
│                         │              ──► Terreno procedural reactivo           │
│                         │              ──► Webcam LED con shaders GPU            │
│                         │              ──► Partículas y bloom                    │
│                         │                                                        │
│                         ▼                                                        │
│              Filtro de contenido:                                                │
│              • ProfanityFilter (diccionario + normalización leetspeak)           │
│              • RegexFilter (patrones)                                            │
│              • Sanitizador (charset bitmap font)                                │
│              • Rate Limiter (anti-spam)                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Tecnologías AWS Implementadas

### 1. Amazon API Gateway — WebSocket API

**Uso:** Canal de comunicación bidireccional en tiempo real entre el bot de Discord y todos los clientes frontend conectados.

| Aspecto | Detalle |
|---------|---------|
| Protocolo | WSS (WebSocket Secure) |
| Rutas | `$connect`, `$disconnect`, `sendMessage` |
| Stage | `prod` con AutoDeploy |
| Escalabilidad | Maneja N clientes simultáneos sin configuración adicional |
| Costo | Dentro del free tier (~1M mensajes/mes) |

**Implementación:** Definido en `infra/template.yaml` usando AWS SAM. El Route Selection Expression (`$request.body.action`) permite routing de mensajes por tipo.

### 2. AWS Lambda

**Uso:** Handler único que gestiona conexiones WebSocket y broadcast de mensajes a todos los clientes conectados.

| Aspecto | Detalle |
|---------|---------|
| Runtime | Node.js 20.x |
| Memoria | 128 MB |
| Timeout | 10 segundos |
| Handler | `connect.handler` |
| Patrón | Single function, multi-route |

**Lógica del Lambda:**
- `$connect` → Almacena connectionId en DynamoDB
- `$disconnect` → Elimina connectionId de DynamoDB
- `sendMessage` → Scan de todas las conexiones + broadcast individual + limpieza de conexiones stale (410 Gone)

### 3. Amazon DynamoDB

**Uso:** Almacenamiento persistente de connection IDs para broadcast confiable entre instancias Lambda.

| Aspecto | Detalle |
|---------|---------|
| Tabla | `Discord3DMessages-Connections` |
| Billing | PAY_PER_REQUEST (on-demand) |
| Key Schema | `connectionId` (HASH) |
| Operaciones | PutItem, DeleteItem, Scan |

**Decisión de diseño:** Se usa Scan para el broadcast porque la cantidad de conexiones simultáneas en una presentación en vivo es baja (<100), y Scan es la operación más simple y directa para este caso de uso dentro del free tier.

### 4. AWS SAM (Serverless Application Model)

**Uso:** Infraestructura como código para todo el stack serverless.

```yaml
# Recursos desplegados (infra/template.yaml):
- AWS::DynamoDB::Table (ConnectionsTable)
- AWS::ApiGatewayV2::Api (WebSocket)
- AWS::ApiGatewayV2::Route × 3
- AWS::ApiGatewayV2::Integration × 3
- AWS::ApiGatewayV2::Stage (prod, AutoDeploy)
- AWS::Serverless::Function (Lambda)
- AWS::Lambda::Permission
```

### 5. AWS SDK v3

**Uso en el bot (backend):** `@aws-sdk/client-apigatewaymanagementapi` para enviar mensajes a clientes WebSocket conectados vía la Management API de API Gateway.

**Uso en Lambda:** `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` para operaciones DynamoDB con DocumentClient.

### 6. GitHub Pages + CloudFront (CDN implícito)

**Uso:** Hosting del frontend estático con HTTPS automático, requisito para conexión WSS (sin contenido mixto).

---

## Stack Tecnológico Completo

### Frontend

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Angular | 22.0 | Framework SPA, standalone components, signals |
| Three.js | 0.170 | Motor 3D WebGL, escena completa |
| Custom GLSL Shaders | — | Vertex/Fragment shaders para pantallas LED |
| Web Audio API | — | Análisis de frecuencia en tiempo real |
| WebSocket (nativo) | — | Conexión WSS al API Gateway |
| lil-gui | 0.21 | Paneles debug para calibración en vivo |
| Vitest | 4.0 | Testing framework |
| TypeScript | 6.0 | Tipado del framework Angular |
| pnpm | 10.33 | Package manager |

### Backend (Bot de Discord)

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| discord.js | 14.27 | Conexión al API de Discord |
| TypeScript | 7.0 | Tipado del bot |
| @aws-sdk/client-apigatewaymanagementapi | 3.x | Broadcast a clientes WSS |
| dotenv | 17.4 | Gestión de secretos |
| tsx | 4.23 | Ejecución directa de TypeScript |

### Infraestructura AWS

| Servicio | Uso |
|----------|-----|
| API Gateway WebSocket | Canal bidireccional en tiempo real |
| Lambda | Gestión de conexiones y broadcast |
| DynamoDB | Almacenamiento de connection IDs |
| SAM/CloudFormation | Infraestructura como código |
| EC2 (free tier) | Hosting del bot 24/7 |

### CI/CD

| Herramienta | Propósito |
|-------------|-----------|
| GitHub Actions | Build + deploy automático |
| pnpm action-setup | Setup del package manager |
| actions/deploy-pages | Deploy a GitHub Pages |

---

## Features Principales

### 1. Pipeline Discord → 3D en Tiempo Real

El sistema captura mensajes de un canal de Discord designado y los muestra como textos 3D flotantes en la escena:

- **Captura selectiva:** Solo mensajes del canal configurado, descarta bots y comandos
- **Filtro de contenido multi-capa:**
  - ProfanityFilter con diccionario + normalización anti-bypass (leetspeak: `p1to` → `pito`, repetición: `veeeerga` → `verga`, separación: `p.a.l.a.b.r.a`)
  - RegexFilter para patrones específicos
  - Sanitizador de charset (solo caracteres del bitmap font)
  - Rate Limiter configurable (anti-spam)
- **Transmisión serverless:** Bot → API Gateway WSS → Lambda → DynamoDB broadcast
- **Reconexión automática:** Exponential backoff con jitter, tolerancia a cierres de 2h de API Gateway

### 2. Escena 3D Audio-Reactiva

Motor visual completo con 15+ subsistemas coordinados:

- **Terreno procedural** — 6 modos generativos (spectrum, spring, flat, still, steps, wave) + 6 texturas (wireframe, toxic, cycle, solid, ultraviolet, ice)
- **Detección de beats** — Análisis de frecuencia en tiempo real (bass, mid, high) usando Web Audio API
- **Post-processing** — UnrealBloomPass + blur shader + compositing
- **Partículas** — Stars y LuminousSpheres con 7 patrones de luz (waveRow, diagonal, radialPulse, allFlash, snake, checker, off)
- **Skybox animado** — Colores HSL reactivos al pulso de audio
- **Fog volumétrico** — Profundidad atmosférica configurable

### 3. Webcam LED Screens (Shaders GPU)

Pantallas 3D que muestran la webcam del usuario con efecto dot-matrix:

- **Captura a baja frecuencia** (configurable) para no impactar rendimiento
- **Procesamiento en GPU** — Custom vertex/fragment shaders con:
  - Animación de dispersión/ensamblaje cíclica
  - 11 patrones de generación (rings, vortex, flower, helix, starburst, diamond, tunnel, galaxy, spiral, wave, explosion)
  - Viñeta elíptica por shader
  - Delay por dot para secuencia visual coherente
  - Blending aditivo para efecto glow
- **8 pantallas distribuidas** en círculo alrededor del jugador
- **Beat reaction** — Escala con el pulso del audio

### 4. Experience Director — Dirección Cinematográfica

Sistema completo de orquestación temporal con configuración declarativa JSON:

- **PhaseManager** — 13+ fases temporales sincronizadas con la canción
- **MoodPresets** — Paquetes de configuración visual (default, energético, contemplativo, caótico + fases custom)
- **TransitionEngine** — Interpolación suave entre configuraciones (HSL, easing configurable)
- **BeatRouter** — Mapeo configurable beat → respuesta visual con intensidad
- **CameraSystem** — 8 modos cinematográficos (first-person, orbit, dolly, crane, tracking, flyby, shake, static)
- **TimelineSequencer** — Eventos programados por tiempo absoluto o conteo de beats
- **Serialización** — Export/Import de configuraciones como JSON

### 5. Intro Overlay Accesible

Pantalla de entrada HTML/CSS superpuesta al canvas 3D:

- Focus trap para navegación por teclado
- Avatar animado del bot con estética electrónica
- Fade transition con fallback (garantía de acceso a la experiencia)
- Desbloqueo de AudioContext + Fullscreen
- Indicador de conexión (servidor/canal Discord activo)
- Contador de viewers en tiempo real
- Cumple WCAG AA (contraste 4.5:1, tamaños mínimos, aria-labels)

---

## Decisiones de Arquitectura

### ¿Por qué WebSocket API Gateway vs. AppSync o IoT?

- **Costo:** Free tier de API Gateway cubre ~1M mensajes/mes, suficiente para hackathon
- **Simplicidad:** Una sola Lambda para todas las rutas
- **Latencia:** Conexión persistente WSS, sin polling
- **Escalabilidad:** Sin gestión de estado en el servidor

### ¿Por qué DynamoDB para connections?

- **Consistencia:** Todas las instancias Lambda leen el mismo estado
- **Limpieza automática:** Detección de conexiones stale (410 Gone)
- **PAY_PER_REQUEST:** Sin costos fijos, paga solo por uso

### ¿Por qué Angular + JavaScript plano para Three.js?

- **NgZone.runOutsideAngular:** El loop a 60fps NO dispara change detection de Angular (~60 ciclos/seg evitados)
- **allowJs: true:** Los módulos Three.js existentes se integran sin reescritura
- **ExperienceManager como fachada:** Un solo punto de contacto entre Angular y el motor 3D
- **dispose() completo:** Cleanup de todos los recursos al destruir el componente (cero memory leaks en SPA)

### ¿Por qué shaders custom para webcam LED?

- **Rendimiento:** 64×36 = 2,304 dots × 8 pantallas = 18,432 puntos animados en GPU, sin carga en CPU
- **Flexibilidad:** Patrones de animación modificables sin tocar geometría
- **Calidad visual:** Blending aditivo + glow = efecto bloom natural que se integra con el post-processing existente

---

## Uso de Kiro en el Desarrollo

El proyecto fue desarrollado utilizando **Kiro** como entorno de desarrollo AI-powered:

### Specs Creados con Kiro

| Feature | Documentos |
|---------|------------|
| Three.js + Angular Integration | requirements.md, design.md, tasks.md |
| Webcam LED Skybox | requirements.md, design.md, tasks.md |
| Discord 3D Messages | requirements.md, design.md, tasks.md |
| Intro Entry Menu | requirements.md, design.md, tasks.md |
| Experience Director | requirements.md, design.md, tasks.md |
| Phase Camera Modes | requirements.md, design.md, tasks.md |
| Debug Mode Toggle | requirements.md, design.md, tasks.md |

### Beneficios Observados

- **Spec-driven development:** Cada feature se diseñó formalmente antes de implementarse (requirements → design → tasks)
- **Propiedades de correctitud:** Definición formal de invariantes verificables por PBT
- **Trazabilidad:** Cada criterio de aceptación mapea a código específico
- **Iteración rápida:** El sistema de tareas permitió implementar features complejas de forma incremental con checkpoints de verificación

---

## Estructura del Proyecto

```
hack_kiro/
├── src/                          # Frontend Angular + Three.js
│   ├── app/                      # Componentes Angular
│   │   ├── canvas-draw/          # Host principal de la experiencia 3D
│   │   ├── intro-overlay/        # Pantalla de entrada accesible
│   │   ├── connection-indicator/ # Indicador de estado Discord
│   │   └── viewer-counter/       # Contador de participantes
│   ├── director/                 # Sistema de dirección cinematográfica
│   │   ├── ExperienceDirector.js # Clase principal del director
│   │   ├── PhaseManager.js       # Fases temporales
│   │   ├── BeatRouter.js         # Routing de beats
│   │   ├── TransitionEngine.js   # Interpolación suave
│   │   ├── CameraSystem.js       # 8 modos de cámara
│   │   ├── TimelineSequencer.js  # Secuenciación temporal
│   │   ├── TransportGUI.js       # Timeline visual
│   │   └── adapters/             # Adaptadores de subsistemas
│   ├── experience/               # Core del motor 3D
│   │   ├── RenderManager.js      # WebGL + ResizeObserver
│   │   ├── View.js               # Cámara + post-processing
│   │   ├── Player.js             # Control first-person
│   │   └── Skybox.js             # Cielo animado HSL
│   ├── terrain/                  # Terreno procedural
│   ├── events/                   # Audio analysis + beats
│   ├── particles/                # Stars + LuminousSpheres
│   ├── services/                 # WebSocket + Webcam LED
│   ├── ui/                       # ModeSelector + PixelText + Debug
│   ├── ExperienceManager.js      # Fachada de orquestación
│   └── Config.js                 # Configuración centralizada
├── backend/                      # Bot de Discord (TypeScript)
│   ├── index.ts                  # Entry point del bot
│   ├── config.ts                 # Variables de entorno
│   └── src/modules/
│       ├── discordToWs.ts        # Pipeline Discord → WebSocket
│       ├── sanitizer.ts          # Sanitizador de charset
│       ├── ProfanityFilter.ts    # Filtro anti-obscenidad
│       ├── RegexFilter.ts        # Filtro por patrones
│       ├── wsSender.ts           # Broadcast vía AWS SDK
│       └── logWriter.ts          # Logging
├── infra/                        # Infraestructura AWS
│   ├── template.yaml             # SAM CloudFormation template
│   └── lambda/
│       └── connect.js            # Lambda handler (connect/disconnect/broadcast)
├── .github/workflows/
│   └── deploy.yml                # CI/CD → GitHub Pages
└── .kiro/specs/                  # 7 specs formales del proyecto
```

---

## Seguridad y Resiliencia

| Aspecto | Implementación |
|---------|---------------|
| Secretos | Variables de entorno, excluidos del repo via `.git/info/exclude` |
| Contenido | Filtro multi-capa (profanity + regex + sanitizer + rate limit) |
| Anti-bypass | Normalización leetspeak, colapso de repeticiones, strip de separadores |
| Reconexión | Exponential backoff con cap en 30s |
| Errores | try/catch por subsistema, el loop nunca se congela |
| Cleanup | dispose() completo en todos los subsistemas |
| HTTPS | Frontend en GitHub Pages (TLS obligatorio para WSS) |
| IAM | Least-privilege policies en Lambda (solo DynamoDB y execute-api) |

---

## Rendimiento

| Métrica | Valor |
|---------|-------|
| FPS target | 60fps estable |
| Dots GPU | 18,432 partículas animadas por shader |
| Change detection | Aislada del loop 3D (NgZone.runOutsideAngular) |
| deltaTime clamp | Máximo 0.2s (evita saltos tras pérdida de foco) |
| Webcam capture | Configurable (1s por defecto), no bloquea render |
| WebSocket reconnect | Automático, no impacta la experiencia visual |
| Bundle | Tree-shaking Angular + Vite, assets en `/public` |

---

## Cómo Ejecutar

### Frontend (desarrollo local)
```bash
pnpm install
pnpm start          # Angular dev server en localhost:4200
```

### Backend (bot Discord)
```bash
cd backend
pnpm install
pnpm dev            # Ejecuta con tsx (dev con WS local)
```

### Infraestructura (deploy AWS)
```bash
cd infra
sam build
sam deploy --guided  # Despliega Lambda + API Gateway + DynamoDB
```

### Deploy frontend (automático)
```bash
git push origin main  # GitHub Actions → build → GitHub Pages
```

---

## Equipo y Contacto

Proyecto desarrollado para el **Hackathon Kiro AWS** — demostrando integración de servicios AWS serverless con una experiencia audiovisual inmersiva en tiempo real, desarrollada de forma estructurada usando Kiro spec-driven development.
