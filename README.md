# Herramienta de Entretenimiento Interactivo 3D

Experiencia 3D inmersiva construida con **Angular 22** y **Three.js**, diseñada para transmisiones en vivo. Los mensajes de un canal de Discord se renderizan como partículas 3D en tiempo real mientras navegas un entorno audiovisual reactivo.

🔗 **Demo en vivo:** [https://juancarlossalcedo777.github.io/hack_kiro/](https://juancarlossalcedo777.github.io/hack_kiro/)

---

## ✨ Características principales

- **Mensajes de Discord → Partículas 3D** — Un bot captura mensajes del canal y los proyecta como texto de partículas dentro de la escena.
- **Webcam → Pantallas LED 3D** — Tu cámara web se convierte en 8 pantallas dot-matrix 3D distribuidas alrededor del escenario.
- **Audio reactivo + Beat Detection** — El terreno, partículas y efectos visuales responden al espectro de frecuencias y beats de la música.
- **Terreno procedural** — Malla progresiva que se deforma en tiempo real según el audio (modos: spectrum, wave, spring).
- **Sistema de fases cinematográfico** — Director de experiencia con presets de mood, transiciones interpoladas, y modos de cámara (orbit, dolly, crane, tracking, flyby, static).
- **Post-processing** — Unreal Bloom, fog volumétrico y blur.
- **Debug GUI en tiempo real** — Panel lil-gui completo para calibrar la experiencia en vivo (tecla `D` tras finalizar la canción).
- **WebSocket en tiempo real** — Comunicación bidireccional vía AWS API Gateway WebSocket.
- **CI/CD** — Despliegue automático a GitHub Pages en cada push a `main`.

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Angular 22 + Three.js)          │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────┐   │
│  │ ExperienceManager │  MusicPlayer  │   │  ExperienceDirector│   │
│  │   (Fachada)  │   │ (Web Audio)  │   │  (Fases/Presets)  │   │
│  └──────┬───────┘   └──────┬───────┘   └────────┬──────────┘   │
│         │                   │                     │              │
│  ┌──────┴───────┐   ┌──────┴───────┐   ┌────────┴──────────┐   │
│  │ Player/View  │   │  BeatEvents  │   │  CameraSystem     │   │
│  │ Terrain/Sky  │   │  PhaseManager│   │  TransitionEngine │   │
│  │ Particles    │   │              │   │  BeatRouter       │   │
│  └──────────────┘   └──────────────┘   └───────────────────┘   │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐                            │
│  │ WebcamLED    │   │ WebSocketClient│                           │
│  │ Screens (8)  │   │ (Discord msgs)│                           │
│  └──────────────┘   └──────┬───────┘                            │
└─────────────────────────────┼───────────────────────────────────┘
                              │ WSS
┌─────────────────────────────┼───────────────────────────────────┐
│              AWS API Gateway (WebSocket)                          │
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                   BACKEND (Discord Bot)                           │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────┐   │
│  │ discord.js   │──▶│ discordToWs  │──▶│ AWS SDK (APIGW)   │   │
│  │ (Bot)        │   │ (Pipeline)   │   │ Management API    │   │
│  └──────────────┘   └──────────────┘   └───────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Angular 22, Three.js 0.170, GLSL Shaders, lil-gui |
| Audio | Web Audio API, FFT 128 bins, Beat Detection |
| Backend | Node.js, discord.js 14, TypeScript |
| Infraestructura | AWS Lambda, API Gateway (WebSocket), DynamoDB |
| CI/CD | GitHub Actions → GitHub Pages |
| Package Manager | pnpm 10 |
| Dev Tools | Kiro (Spec-Driven Development), Vitest, Prettier |

---

## 🚀 Inicio rápido

### Requisitos previos

- Node.js 22+
- pnpm (`npm install -g pnpm`)

### Frontend

```bash
# Instalar dependencias
pnpm install

# Servidor de desarrollo (http://localhost:4200)
pnpm start

# Build de producción
pnpm build
```

### Backend (Bot de Discord)

```bash
cd backend

# Instalar dependencias
pnpm install

# Crear archivo .env (ver sección de configuración)
cp .env.example .env

# Ejecutar en desarrollo
pnpm dev

# Servidor WebSocket local (para desarrollo sin AWS)
pnpm dev:ws
```

---

## ⚙️ Configuración

### Variables de entorno del backend (`backend/.env`)

```env
enviroment=DEV

# Bot Discord — Desarrollo
clientIDDEV=tu_client_id
tokenDEV=tu_token
serverIDDEV=tu_server_id

# Bot Discord — Producción
clientIDPROD=...
tokenPROD=...
serverIDPROD=...

# Pipeline WebSocket
WS_API_ENDPOINT=wss://tu-api-gateway.amazonaws.com/prod
WS_CHANNEL_ID=id_del_canal_discord

# Rate limiting
RATE_LIMIT_MAX=20
RATE_LIMIT_WINDOW_MS=60000
MAX_MESSAGE_LENGTH=50
```

---

## 🎮 Controles

| Acción | Control |
|--------|---------|
| Navegar | Mover el mouse |
| Turbo | Click sostenido |
| Modo Desarrollador | Tecla `D` (disponible al finalizar la canción) |

---

## 📁 Estructura del proyecto

```
hack_kiro/
├── src/                        # Código fuente del frontend
│   ├── app/                    # Componentes Angular
│   │   ├── canvas-draw/        # Componente principal (monta Three.js)
│   │   ├── intro-overlay/      # Pantalla de entrada
│   │   ├── connection-indicator/
│   │   └── viewer-counter/
│   ├── director/               # Sistema de dirección cinematográfica
│   │   ├── ExperienceDirector.js
│   │   ├── PhaseManager.js
│   │   ├── CameraSystem.js
│   │   ├── TransitionEngine.js
│   │   ├── BeatRouter.js
│   │   └── TimelineSequencer.js
│   ├── events/                 # Audio y detección de beats
│   ├── experience/             # Core Three.js (Player, View, Skybox)
│   ├── particles/              # Estrellas y esferas luminosas
│   ├── services/               # WebSocket, Webcam LED Screens
│   ├── terrain/                # Terreno procedural reactivo
│   ├── ui/                     # Debug GUI, PixelText, ModeSelector
│   ├── Config.js               # Configuración centralizada
│   └── ExperienceManager.js    # Fachada principal de orquestación
├── backend/                    # Bot de Discord + pipeline WebSocket
├── public/                     # Assets estáticos (audio, fuentes, imágenes)
├── .kiro/                      # Specs de desarrollo (Kiro)
│   ├── specs/                  # Especificaciones por feature
│   └── steering/               # Reglas de contexto
└── .github/workflows/          # CI/CD (deploy a GitHub Pages)
```

---

## 🎬 Sistema de fases

La experiencia se divide en fases temporales sincronizadas con la canción. Cada fase activa un **Mood Preset** que define:

- Modo del terreno (spectrum, wave, spring)
- Patrón de iluminación
- Parámetros de Bloom
- Configuración del Skybox
- Modo de cámara cinematográfico
- Sensibilidad de beats

Las fases se configuran desde el **Transport GUI** (panel izquierdo en modo desarrollador) y se persisten en `localStorage` o se exportan como JSON.

---

## 🤖 Bot de Discord — Kirito Reporter

El bot escucha mensajes en un canal designado y los reenvía al frontend 3D a través de AWS API Gateway WebSocket. Incluye:

- Sanitización de caracteres (solo ASCII renderizable)
- Rate limiting configurable
- Truncado de mensajes largos
- Soporte para ambientes DEV/PROD con tokens separados

---

## 📦 Despliegue

El frontend se despliega automáticamente a **GitHub Pages** con cada push a `main` mediante GitHub Actions.

El backend (bot de Discord) corre en una **Raspberry Pi 5** como proceso persistente, ejecutado con `tsx` y orquestado mediante **PM2** para garantizar disponibilidad continua y reinicio automático ante fallos.

---

## 🧪 Desarrollo con Kiro

Este proyecto fue desarrollado utilizando **Kiro** con metodología Spec-Driven Development. Las especificaciones (requirements → design → tasks) están en `.kiro/specs/`:

- `threejs-angular-integration` — Integración base Three.js + Angular
- `experience-director` — Sistema de dirección cinematográfica
- `phase-camera-modes` — Modos de cámara por fase
- `discord-3d-messages` — Pipeline Discord → partículas 3D
- `webcam-led-skybox` — Pantallas LED webcam + Skybox reactivo
- `debug-mode-toggle` — Toggle de modo debug
- `intro-entry-menu` — Menú de entrada

---

## 📄 Licencia

Proyecto desarrollado para el Hackathon de Kiro by CódigoFacilito y AWS 2026.

### 🎵 Créditos musicales

Música utilizada: **"Time Lapse"** por TheFatRat — https://soundcloud.com/thefatrat/thefatrat-time-lapse-1
Uso libre con crédito al autor, según los términos del artista.

---

## 👥 Autores

| Nombre | GitHub |
|--------|--------|
| Juan Carlos Salcedo Licea | [JUANCARLOSSALCEDO777](https://github.com/JUANCARLOSSALCEDO777) |
| Angel Yair Ochoa Gordillo | [AngelOchoaDev](https://github.com/AngelOchoaDev) |
| Kiro | Asistente de desarrollo IA |
