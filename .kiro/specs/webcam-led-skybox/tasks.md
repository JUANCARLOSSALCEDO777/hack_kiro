# Implementation Plan: Webcam LED Skybox

## Overview

Capturar frames de la webcam del usuario, procesarlos con efecto LED/dot-matrix, y mostrarlos como múltiples pantallas 3D distribuidas alrededor de la escena. Cada pantalla muestra un frame diferente en orden secuencial (timeline visual envolvente).

Lenguaje: JavaScript (frontend).

## Tasks

- [x] 1. Crear `src/services/WebcamLEDScreens.js` — módulo principal
  - [x] 1.1 Implementar solicitud de webcam y captura periódica
    - Solicitar cámara con `getUserMedia({ video: { width: 320, height: 240 } })`
    - Crear `<video>` oculto y canvas auxiliar de captura
    - Método `_captureFrame()` que dibuja el video al canvas auxiliar
    - Manejar rechazo de permisos y navegadores sin soporte (log info, no crear pantallas)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3_

  - [x] 1.2 Implementar procesador LED/dot-matrix
    - Método `_processLED(sourceCanvas)` que genera el efecto dot-matrix
    - Crear canvas LED de 512x288 (potencia de 2 para textura)
    - Reducir frame a grid configurable (64x36 por defecto)
    - Muestrear color promedio de cada celda y dibujar círculo con ese color
    - Fondo oscuro entre puntos para simular espacio inter-LED
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.3 Implementar buffer circular y pantallas 3D
    - Crear N planos (PlaneGeometry) distribuidos en círculo alrededor del jugador
    - Cada plano tiene su propio canvas + CanvasTexture + MeshBasicMaterial
    - Material con `fog: false` para que la niebla no opaque las pantallas (emiten luz propia)
    - Asignar `renderOrder` apropiado para evitar z-fighting con el skybox
    - Método `_rotateBuffer()` que asigna el frame nuevo a la pantalla más reciente y desplaza los anteriores
    - Solo marcar `needsUpdate = true` en la textura del frame nuevo
    - Orientar planos hacia el centro con `lookAt`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

  - [x] 1.4 Implementar métodos públicos (`init`, `update`, `dispose`) + beat reaction
    - `async init()`: solicitar cámara, crear video/canvas, crear pantallas
    - `update(state)`: controlar temporización de captura según frameInterval, seguir posición del jugador
    - En `update()`: si hay beat (state.skyboxPulse > 0) y beat no está pausado, escalar pantallas al 105%
    - `dispose()`: detener stream (track.stop()), remover meshes de la escena, limpiar canvas
    - Pausar captura cuando `document.hidden === true`
    - Colores del dot-matrix lo suficientemente brillantes para activar el bloom existente
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5b.1, 5b.2, 5b.3, 6.3_

- [x] 2. Modificar `src/Config.js` — añadir sección webcam
  - Agregar bloque `webcam: { enabled, frameInterval, gridWidth, gridHeight, dotRadiusRatio, screenCount, screenRadius, screenWidth, screenHeight, screenAltitude }`
  - Valores por defecto razonables para la experiencia
  - _Requirements: 6.4_

- [x] 3. Modificar `src/ExperienceManager.js` — integrar WebcamLEDScreens
  - Importar WebcamLEDScreens
  - Instanciar en el constructor con Config.webcam
  - Llamar `init()` después de crear los subsistemas
  - Llamar `update(state)` en el loop de animación
  - Llamar `dispose()` en el método dispose
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 4. Añadir controles debug para calibración de pantallas
  - En `DebugModeManager` o en un folder nuevo de lil-gui, exponer controles:
    - Radio, ancho, alto, altitud de las pantallas
    - Grid cols, grid rows, dot radius ratio, frame interval
    - Toggle pausar/reanudar beat de la música
    - Toggle activar/desactivar webcam
  - Los cambios se aplican inmediatamente sin reiniciar la captura
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 5. Checkpoint — Verificar integración y rendimiento
  - Verificar que el frontend compila sin errores
  - Probar localmente que la webcam se activa y las pantallas aparecen
  - Verificar que los FPS se mantienen por encima de 30
  - Verificar que el bloom hace glow en las pantallas
  - Verificar que el beat pulse funciona

## Notes

- Todo es frontend JavaScript — no hay cambios en backend ni AWS
- La feature es completamente opcional: sin permiso de cámara, todo sigue igual
- Los planos de pantalla se agregan a la escena como objetos independientes, no modifican el Skybox existente
- El skybox original sigue funcionando con su color animado detrás de las pantallas

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["3"] },
    { "id": 4, "tasks": ["4"] },
    { "id": 5, "tasks": ["5"] }
  ]
}
```
