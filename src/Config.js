/**
 * Config.js — Configuración centralizada
 */

export const Config = {

    // _______________________________________________________________________________________ Music

    musicSrc: 'audio/music.mp3',

    // _______________________________________________________________________________________ Terrain

    terrain: {
        mapResolution: 66,
        tileSize: 480,
        height: 140,
        gridSize: 5,
        blurRadius: 2
    },

    // _______________________________________________________________________________________ Player

    player: {
        initialAltitude: 60,
        initialVelocity: 150,
        initialFov: 30,
        turboMultiplier: 2.5
    },

    // _______________________________________________________________________________________ View

    view: {
        fog: true,
        fogAmount: 0.002,
        postprocessing: true,
        blurAmount: 0.0015
    },

    // _______________________________________________________________________________________ Colors

    colors: [0xFF1561, 0xFFF014, 0x14FF9D, 0x14D4FF, 0xFF9D14],
    hues: [341 / 360, 56 / 360, 155 / 360, 191 / 360, 35 / 360],

    // _______________________________________________________________________________________ Webcam LED Screens

    webcam: {
        enabled: true,
        frameInterval: 1500,     // ms entre capturas
        gridWidth: 64,           // Columnas del dot-grid
        gridHeight: 36,          // Filas del dot-grid
        dotRadiusRatio: 0.8,     // Radio del punto relativo a celda (0-1)
        screenCount: 8,          // Número de pantallas alrededor
        screenRadius: 600,       // Distancia de las pantallas al centro
        screenWidth: 300,        // Ancho de cada pantalla (unidades 3D)
        screenHeight: 170,       // Alto de cada pantalla
        screenAltitude: 50       // Altura Y de las pantallas
    },

    // _______________________________________________________________________________________ WebSocket

    websocket: {
        // En desarrollo local (localhost) conecta al WS server del bot.
        // En producción usa el API Gateway WSS desplegado en AWS.
        endpoint: typeof window !== 'undefined' && window.location.hostname === 'localhost'
            ? 'ws://localhost:4201'
            : 'wss://t5pqx2pzec.execute-api.us-east-1.amazonaws.com/prod',
        reconnect: {
            initialDelay: 1000,
            maxDelay: 30000,
            multiplier: 2
        }
    }
};
