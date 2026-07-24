/**
 * ExperienceManager.js — Fachada de orquestación
 *
 * Centraliza la creación, actualización y destrucción de todos los
 * subsistemas de la experiencia 3D. Diseñado para ser instanciado
 * desde un componente Angular que proporciona los containers DOM.
 */

import { RenderManager } from './experience/RenderManager.js';
import { View } from './experience/View.js';
import { Player } from './experience/Player.js';
import { Terrain } from './terrain/Terrain.js';
import { Skybox } from './experience/Skybox.js';
import { MusicPlayer } from './events/MusicPlayer.js';
import { BeatEvents } from './events/BeatEvents.js';
import { Stars } from './particles/Stars.js';
import { LuminousSpheres } from './particles/LuminousSpheres.js';
import { PixelText } from './ui/PixelText.js';
import { ModeSelector } from './ui/ModeSelector.js';
import { DebugModeManager } from './ui/DebugModeManager.js';
import { WebSocketClient } from './services/WebSocketClient.js';
import { Config } from './Config.js';

export class ExperienceManager {

    /**
     * @param {HTMLElement} container - Elemento DOM donde se monta el canvas WebGL
     * @param {HTMLElement} uiContainer - Elemento DOM donde se montan los controles UI
     */
    constructor(container, uiContainer) {

        this.container = container;
        this.uiContainer = uiContainer;
        this.rafId = null;
        this.lastTime = 0;
        this.running = false;

        // Estado compartido entre subsistemas
        this.state = {
            time: 0,
            deltaTime: 0,
            colors: Config.colors,
            skyboxPulse: 0
        };

        // Crear subsistemas en el orden exacto de dependencias
        this.renderManager = new RenderManager(container);
        this.view = new View(this.renderManager);
        this.player = new Player(this.view);
        this.terrain = new Terrain(this.view.scene, this.player);
        this.skybox = new Skybox(this.view, this.player);
        this.music = new MusicPlayer(Config.musicSrc);
        this.beatEvents = new BeatEvents(this.terrain, null, this.player, this.skybox);
        this.stars = new Stars(this.view.scene, this.terrain);
        this.spheres = new LuminousSpheres(this.view.scene, this.terrain);
        this.pixelText = new PixelText(this.view.scene, this.player);
        this.modeSelector = new ModeSelector(this.beatEvents, this.terrain, this.spheres, this.uiContainer);
        this.debugModeManager = new DebugModeManager(this.modeSelector.gui);

        // Conectar WebSocket para recibir mensajes de Discord en tiempo real
        this.wsClient = new WebSocketClient(
            Config.websocket.endpoint,
            (payload) => {
                try {
                    const text = payload?.text;
                    if (!text) return;
                    this.pixelText.addText(text);
                } catch (error) {
                    console.error('[ExperienceManager] Error procesando mensaje WebSocket:', error);
                }
            },
            Config.websocket.reconnect
        );
        this.wsClient.connect();

        // Propagar resize del container a View
        this._originalOnResize = this.renderManager.onResize.bind(this.renderManager);
        this.renderManager.onResize = () => {
            this._originalOnResize();
            this.view.onResize();
        };
    }

    /** Inicia la reproducción de audio y el loop de animación */
    start() {
        this.music.play();
        this.lastTime = performance.now();
        this.running = true;
        this.animate();
    }

    /**
     * Loop de animación — llamado internamente via requestAnimationFrame.
     * El contenido se envuelve en try/catch para evitar congelar la pantalla
     * si algún subsistema lanza un error.
     */
    animate() {

        this.rafId = requestAnimationFrame(() => this.animate());

        try {
            const now = performance.now();
            const dt = Math.min((now - this.lastTime) / 1000, 0.2);
            this.lastTime = now;

            this.state.deltaTime = dt;
            this.state.time += dt;

            // Actualizar subsistemas en el orden exacto del main.js original
            this.player.update(this.state);
            this.terrain.update();
            this.beatEvents.update(this.state, this.music);
            this.stars.update(this.state);
            this.spheres.update(this.state);
            this.pixelText.update(this.state);

            // Propagar beat a partículas
            if (this.beatEvents.beatTriggered) {
                this.stars.onBeat();
                this.spheres.onBeat();
            }

            // Pulso del skybox
            this.state.skyboxPulse = this.beatEvents.getSkyboxPulse();
            this.skybox.update(this.state);

            // Render
            this.view.render();

        } catch (error) {
            console.error('[ExperienceManager] Error en el loop de animación:', error);
        }
    }

    /**
     * Manejo de la política de autoplay de navegadores.
     * Intenta reanudar el AudioContext y reproducir el audio.
     */
    resumeAudio() {
        if (this.music && this.music.audioContext) {
            this.music.audioContext.resume();
            this.music.audio.play().catch(() => {
                // Silenciar el error — el usuario necesita interactuar primero
            });
        }
    }

    /**
     * Detiene el loop, libera todos los recursos y limpia referencias.
     * Llamar desde ngOnDestroy del componente Angular.
     */
    dispose() {

        this.running = false;

        // Desconectar WebSocket antes de destruir subsistemas
        if (this.wsClient) {
            this.wsClient.disconnect();
        }

        // Cancelar frame pendiente
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        // Dispose de subsistemas que tienen cleanup explícito
        this.player.dispose();
        this.music.dispose();
        this.debugModeManager.dispose();
        this.modeSelector.dispose();
        this.renderManager.dispose();

        // Limpiar referencias
        this.renderManager = null;
        this.view = null;
        this.player = null;
        this.terrain = null;
        this.skybox = null;
        this.music = null;
        this.beatEvents = null;
        this.stars = null;
        this.spheres = null;
        this.pixelText = null;
        this.modeSelector = null;
        this.debugModeManager = null;
        this.wsClient = null;
    }
}
