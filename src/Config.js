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

    // _______________________________________________________________________________________ WebSocket

    websocket: {
        endpoint: 'wss://xxxxxx.execute-api.us-east-1.amazonaws.com/prod',
        reconnect: {
            initialDelay: 1000,
            maxDelay: 30000,
            multiplier: 2
        }
    }
};
