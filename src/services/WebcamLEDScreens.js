/**
 * WebcamLEDScreens.js — Captura webcam + efecto LED dot-matrix + pantallas 3D
 *
 * Captura frames de la webcam a baja frecuencia, los procesa con un efecto
 * visual tipo pantalla LED de estadio (dot-matrix), y los muestra como
 * múltiples pantallas distribuidas alrededor de la escena 3D.
 */

import * as THREE from 'three';
import { Config } from '../Config.js';

export class WebcamLEDScreens {

    /**
     * @param {THREE.Scene} scene - Escena 3D donde se agregan las pantallas
     * @param {Object} player - Referencia al jugador para posicionamiento
     * @param {Object} config - Configuración de la sección webcam del Config
     */
    constructor(scene, player, config) {
        this._scene = scene;
        this._player = player;
        this._config = config;

        this._active = false;
        this._video = null;
        this._stream = null;

        // Canvas auxiliar para capturar frames del video
        this._captureCanvas = null;
        this._captureCtx = null;

        // Canvas LED para el efecto dot-matrix (reutilizado entre frames)
        this._ledCanvas = document.createElement('canvas');
        this._ledCanvas.width = 512;
        this._ledCanvas.height = 288;
        this._ledCtx = this._ledCanvas.getContext('2d');

        // Buffer circular de pantallas
        this._screens = [];
        this._bufferIndex = 0;
        this._lastCaptureTime = 0;

        // Beat reaction
        this._beatPaused = false;
    }

    // ─── Interfaz pública ────────────────────────────────────────────────────────

    /** Solicitar cámara y crear pantallas (placeholder — tarea 1.1/1.3/1.4) */
    async init() {
        // TODO: Implementado en tareas 1.1 y 1.3
    }

    /** Gestionar temporización de captura y beat (placeholder — tarea 1.4) */
    update(state) {
        // TODO: Implementado en tarea 1.4
    }

    /** Liberar cámara, canvas y meshes (placeholder — tarea 1.4) */
    dispose() {
        // TODO: Implementado en tarea 1.4
    }

    // ─── Captura (placeholder — tarea 1.1) ───────────────────────────────────────

    /** Capturar frame del video al canvas auxiliar */
    _captureFrame() {
        // TODO: Implementado en tarea 1.1
    }

    // ─── Procesador LED/dot-matrix ───────────────────────────────────────────────

    /**
     * Aplica el efecto dot-matrix al frame capturado.
     * Reduce el frame a un grid configurable y dibuja un punto circular
     * por cada celda, con el color promedio muestreado del source.
     *
     * @param {HTMLCanvasElement} sourceCanvas - Canvas con el frame capturado (320x240)
     * @returns {HTMLCanvasElement} El LED canvas con el efecto aplicado
     */
    _processLED(sourceCanvas) {
        const { gridWidth, gridHeight, dotRadiusRatio } = this._config;
        const ledCanvas = this._ledCanvas;
        const ledCtx = this._ledCtx;

        // Dimensiones del canvas LED de salida
        const ledW = ledCanvas.width;
        const ledH = ledCanvas.height;

        // Tamaño de cada celda en el canvas LED
        const cellWidth = ledW / gridWidth;
        const cellHeight = ledH / gridHeight;

        // Radio del punto LED en cada celda
        const radius = (cellWidth * dotRadiusRatio) / 2;

        // Fondo oscuro (simula espacio inter-LED)
        ledCtx.fillStyle = '#000000';
        ledCtx.fillRect(0, 0, ledW, ledH);

        // Obtener imageData del sourceCanvas completo (una sola vez por performance)
        const srcCtx = sourceCanvas.getContext('2d');
        const srcW = sourceCanvas.width;
        const srcH = sourceCanvas.height;
        const imageData = srcCtx.getImageData(0, 0, srcW, srcH);
        const pixels = imageData.data;

        // Tamaño de cada celda mapeada en el sourceCanvas
        const srcCellW = srcW / gridWidth;
        const srcCellH = srcH / gridHeight;

        // Recorrer cada celda del grid
        for (let row = 0; row < gridHeight; row++) {
            for (let col = 0; col < gridWidth; col++) {
                // Región correspondiente en el sourceCanvas
                const srcX = Math.floor(col * srcCellW);
                const srcY = Math.floor(row * srcCellH);
                const srcEndX = Math.floor((col + 1) * srcCellW);
                const srcEndY = Math.floor((row + 1) * srcCellH);

                // Promediar color RGB de los pixeles en esa región
                let r = 0, g = 0, b = 0;
                let count = 0;

                for (let y = srcY; y < srcEndY; y++) {
                    for (let x = srcX; x < srcEndX; x++) {
                        const idx = (y * srcW + x) * 4;
                        r += pixels[idx];
                        g += pixels[idx + 1];
                        b += pixels[idx + 2];
                        count++;
                    }
                }

                if (count > 0) {
                    r = Math.round(r / count);
                    g = Math.round(g / count);
                    b = Math.round(b / count);
                }

                // Posición del centro del punto en el LED canvas
                const cx = col * cellWidth + cellWidth / 2;
                const cy = row * cellHeight + cellHeight / 2;

                // Dibujar el punto circular con el color muestreado
                ledCtx.beginPath();
                ledCtx.arc(cx, cy, radius, 0, Math.PI * 2);
                ledCtx.fillStyle = `rgb(${r},${g},${b})`;
                ledCtx.fill();
            }
        }

        return ledCanvas;
    }

    // ─── Buffer circular y pantallas 3D ─────────────────────────────────────────

    /**
     * Rotar buffer circular y actualizar texturas.
     * Avanza el índice del buffer, copia el LED canvas procesado
     * a la pantalla correspondiente, y marca solo esa textura como dirty.
     */
    _rotateBuffer() {
        // Avanzar al siguiente slot del buffer circular
        this._bufferIndex = (this._bufferIndex + 1) % this._screens.length;

        // Obtener la pantalla donde va el frame nuevo
        const screen = this._screens[this._bufferIndex];

        // Copiar el LED canvas procesado al canvas de esta pantalla
        screen.ctx.drawImage(this._ledCanvas, 0, 0);

        // Solo marcar needsUpdate en la textura del frame nuevo (performance)
        screen.texture.needsUpdate = true;
    }

    /**
     * Crear N planos (PlaneGeometry) distribuidos en círculo alrededor del jugador.
     * Cada plano tiene su propio canvas + CanvasTexture + MeshBasicMaterial.
     * Las pantallas se orientan hacia el centro y usan fog:false para brillar siempre.
     */
    _createScreens() {
        const { screenCount, screenRadius, screenWidth, screenHeight, screenAltitude } = this._config;

        for (let i = 0; i < screenCount; i++) {
            // Distribuir uniformemente en círculo completo
            const angle = (i / screenCount) * Math.PI * 2;

            // Canvas individual para esta pantalla (buffer de frame LED)
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 288;
            const ctx = canvas.getContext('2d');

            // Textura vinculada al canvas — Three.js la sube a GPU cuando needsUpdate=true
            const texture = new THREE.CanvasTexture(canvas);

            // Material con fog:false para que las pantallas brillen sin ser opacadas por la niebla
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide,
                fog: false,
                transparent: true,
                opacity: 0.9
            });

            const geometry = new THREE.PlaneGeometry(screenWidth, screenHeight);
            const mesh = new THREE.Mesh(geometry, material);

            // Posicionar en círculo a la altitud configurada
            mesh.position.set(
                Math.cos(angle) * screenRadius,
                screenAltitude,
                Math.sin(angle) * screenRadius
            );

            // Orientar el plano hacia el centro (siempre visible para el jugador)
            mesh.lookAt(0, screenAltitude, 0);

            // renderOrder alto evita z-fighting con el skybox (renderOrder 0)
            mesh.renderOrder = 10;

            this._scene.add(mesh);
            this._screens.push({ canvas, ctx, texture, mesh });
        }
    }
}
