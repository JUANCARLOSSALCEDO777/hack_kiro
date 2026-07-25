/**
 * ExperienceManager.js — Fachada de orquestación
 *
 * Centraliza la creación, actualización y destrucción de todos los
 * subsistemas de la experiencia 3D. Diseñado para ser instanciado
 * desde un componente Angular que proporciona los containers DOM.
 */

import * as THREE from 'three';
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
import { WebcamLEDScreens } from './services/WebcamLEDScreens.js';
import { ExperienceDirector } from './director/ExperienceDirector.js';
import { DebugGUI } from './director/DebugGUI.js';
import { TransportGUI } from './director/TransportGUI.js';
import experienceBaseConfig from './director/experience-config.json';
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

        // Webcam LED Screens — pantallas 3D con efecto dot-matrix
        this.webcamScreens = new WebcamLEDScreens(
            this.view.scene,
            this.player,
            Config.webcam
        );
        this.webcamScreens.init(); // Async — no bloquea la construcción

        // ─── Controles debug para calibración de pantallas webcam ────────────────
        this._setupWebcamDebugControls();

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

        // ─── Experience Director — orquestación cinematográfica ──────────────────
        this.director = new ExperienceDirector({
            player: this.player,
            beatEvents: this.beatEvents,
            terrain: this.terrain,
            skybox: this.skybox,
            stars: this.stars,
            spheres: this.spheres,
            webcamScreens: this.webcamScreens,
            pixelText: this.pixelText,
            view: this.view,
            music: this.music
        });

        // ─── Debug GUI del Experience Director ─────────────────────────────────
        this.directorDebugGUI = new DebugGUI(this.modeSelector.gui, this.director);
        this.debugModeManager.registerPanel(this.directorDebugGUI);

        // ─── Transport GUI (panel izquierdo) — timeline + loop de audio ─────────
        this.transportGUI = new TransportGUI(this.uiContainer, this.music, this.director, experienceBaseConfig);
        this.debugModeManager.registerPanel(this.transportGUI);

        // Propagar resize del container a View
        this._originalOnResize = this.renderManager.onResize.bind(this.renderManager);
        this.renderManager.onResize = () => {
            this._originalOnResize();
            this.view.onResize();
        };
    }

    /**
     * Configura el folder de lil-gui con controles de calibración para las pantallas webcam.
     * Los cambios de posición/tamaño se aplican inmediatamente a los meshes existentes.
     * Los parámetros de procesamiento (grid, dot, interval) se leen dinámicamente en cada frame.
     */
    _setupWebcamDebugControls() {
        const wcFolder = this.modeSelector.gui.addFolder('Webcam LED Screens');
        const wcConfig = Config.webcam;
        const wcScreens = this.webcamScreens;

        // ─── Geometría y posición de las pantallas ───────────────────────────────

        wcFolder.add(wcConfig, 'screenRadius', 200, 1000).name('Radio').onChange(v => {
            wcScreens._screens.forEach((screen, i) => {
                const angle = (i / wcConfig.screenCount) * Math.PI * 2;
                screen.points.position.x = Math.cos(angle) * v;
                screen.points.position.z = Math.sin(angle) * v;
                screen.points.lookAt(0, wcConfig.screenAltitude, 0);
            });
        });

        wcFolder.add(wcConfig, 'screenWidth', 100, 600).name('Ancho');
        wcFolder.add(wcConfig, 'screenHeight', 50, 400).name('Alto');

        wcFolder.add(wcConfig, 'screenAltitude', -100, 200).name('Altitud').onChange(v => {
            wcScreens._screens.forEach((screen) => {
                screen.points.position.y = v;
                screen.points.lookAt(0, v, 0);
            });
        });

        // ─── Parámetros de procesamiento LED (se leen en cada frame) ─────────────

        wcFolder.add(wcConfig, 'gridWidth', 16, 128).step(1).name('Grid cols');
        wcFolder.add(wcConfig, 'gridHeight', 9, 72).step(1).name('Grid rows');
        wcFolder.add(wcConfig, 'dotRadiusRatio', 0.3, 1.0).name('Dot radius');
        wcFolder.add(wcConfig, 'frameInterval', 500, 5000).name('Frame interval');
        wcFolder.add(wcConfig, 'vignetteIntensity', 0.0, 2.0).name('Viñeta intensidad');

        // Controles de partículas para debug
        wcFolder.add(wcScreens, '_cycleDuration', 3, 15).name('Ciclo (s)');
        wcFolder.add(wcScreens, '_assembleDuration', 0.5, 5).name('Ensamblaje (s)');
        const pointSizeCtrl = { value: 41.0 };
        wcFolder.add(pointSizeCtrl, 'value', 1, 80).name('Point size').onChange(v => {
            wcScreens._screens.forEach(s => { s.material.uniforms.uPointSize.value = v; });
        });

        // Patrón de animación de generación
        wcFolder.add(wcScreens, 'patternMode', ['rings', 'vortex', 'flower', 'helix', 'starburst', 'diamond', 'tunnel', 'galaxy', 'spiral', 'wave', 'explosion'])
            .name('Patrón anim.');

        // ─── Toggles de control ─────────────────────────────────────────────────

        wcFolder.add(wcScreens, '_beatPaused').name('Pausar beat');
        wcFolder.add(wcScreens, '_toggleWebcam').name('Toggle webcam');

        // ─── Controles de cámara del Player ─────────────────────────────────────

        const playerFolder = this.modeSelector.gui.addFolder('Player Camera');
        const player = this.player;

        const velCtrl = playerFolder.add(player, 'velocity', 50, 500).name('Velocidad');
        const altCtrl = playerFolder.add(player, 'altitude', 20, 300).name('Altitud');
        const tdCtrl = playerFolder.add(player, 'targetDistance', 50, 500).name('Target dist');
        const fovCtrl = playerFolder.add(player.camera, 'fov', 10, 120).name('FOV').onChange(() => {
            player.camera.updateProjectionMatrix();
        });

        // ─── Modo cinematográfico cíclico ────────────────────────────────────────

        // Valores entre los que oscila la cámara
        const cinDefault = { velocity: 150, altitude: 60, targetDistance: 150, fov: 30 };
        const cinPreset = { velocity: 107.15, altitude: 83.28, targetDistance: 157.1, fov: 63.24 };

        // Estado del modo cinematográfico
        this._cinematicMode = false;
        this._cinematicTime = 0;

        // Períodos diferentes por parámetro (más orgánico)
        const cinPeriods = { velocity: 12, altitude: 18, targetDistance: 15, fov: 10 };

        // Función de actualización cinematográfica (llamada desde animate)
        this._updateCinematic = (dt) => {
            if (!this._cinematicMode) return;
            this._cinematicTime += dt;

            const t = this._cinematicTime;

            // Cada parámetro oscila con su propio período usando sin suavizado
            const lerp = (a, b, factor) => a + (b - a) * factor;
            const smoothOsc = (period) => (Math.sin(t * Math.PI * 2 / period) + 1) * 0.5;

            player.velocity = lerp(cinDefault.velocity, cinPreset.velocity, smoothOsc(cinPeriods.velocity));
            player.altitude = lerp(cinDefault.altitude, cinPreset.altitude, smoothOsc(cinPeriods.altitude));
            player.targetDistance = lerp(cinDefault.targetDistance, cinPreset.targetDistance, smoothOsc(cinPeriods.targetDistance));
            player.camera.fov = lerp(cinDefault.fov, cinPreset.fov, smoothOsc(cinPeriods.fov));
            player.camera.updateProjectionMatrix();

            // Actualizar GUI sliders
            velCtrl.updateDisplay();
            altCtrl.updateDisplay();
            tdCtrl.updateDisplay();
            fovCtrl.updateDisplay();
        };

        // Toggle en la GUI
        playerFolder.add(this, '_cinematicMode').name('Modo cinemático');

        // Preset manual (aplica valores cinematic fijos)
        playerFolder.add({ apply: () => {
            player.velocity = cinPreset.velocity;
            player.altitude = cinPreset.altitude;
            player.targetDistance = cinPreset.targetDistance;
            player.camera.fov = cinPreset.fov;
            player.camera.updateProjectionMatrix();
            velCtrl.updateDisplay();
            altCtrl.updateDisplay();
            tdCtrl.updateDisplay();
            fovCtrl.updateDisplay();
        }}, 'apply').name('Preset cinematic');

        // ─── Controles de texto 3D ──────────────────────────────────────────────

        // ─── Controles de texto 3D ──────────────────────────────────────────────

        const textFolder = this.modeSelector.gui.addFolder('Text Mode');
        const textModes = { mode: this.pixelText.mode };

        // Sub-controles para el modo particles
        const particleRenderer = this.pixelText._renderers.particles;
        const pFolder = textFolder.addFolder('Particles Config');
        pFolder.add(particleRenderer, 'particleCount', 500, 5000).step(100).name('Partículas');
        pFolder.add(particleRenderer, 'spreadRadius', 50, 500).name('Dispersión');
        pFolder.add(particleRenderer, 'assembleDuration', 0.3, 5.0).name('T. ensamblaje');
        pFolder.add(particleRenderer, 'planeScale', 1.0, 6.0).name('Escala');
        pFolder.add(particleRenderer, 'pointSize', 1.0, 12.0).name('Tamaño punto');
        pFolder.add(particleRenderer, 'turbulenceAmount', 0.0, 10.0).name('Turbulencia');

        // Mostrar/ocultar sub-folder según el modo seleccionado
        const updatePFolderVisibility = (mode) => {
            pFolder.domElement.style.display = mode === 'particles' ? '' : 'none';
        };
        updatePFolderVisibility(textModes.mode);

        textFolder.add(textModes, 'mode', ['pixel', 'particles'])
            .name('Renderer')
            .onChange(v => {
                this.pixelText.setMode(v);
                updatePFolderVisibility(v);
            });

        // Cerrar todos los sub-folders agregados para que no aparezcan desplegados
        wcFolder.close();
        playerFolder.close();
        textFolder.close();
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

            // Webcam LED Screens — captura periódica y seguimiento de jugador
            this.webcamScreens.update(this.state);

            // Modo cinematográfico — oscila parámetros de cámara
            if (this._updateCinematic) this._updateCinematic(dt);

            // Experience Director — orquestación de fases, beats y secuencias
            try {
                this.director.update(this.state, this.music.time || 0);
            } catch (err) {
                console.warn('[ExperienceManager] Error en director.update:', err.message);
            }

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

        // Dispose del director antes que los subsistemas que utiliza
        if (this.director) {
            this.director.dispose();
        }

        // Dispose de la GUI del director (ya se llama via debugModeManager.dispose,
        // pero limpiamos la referencia igualmente)
        this.directorDebugGUI = null;

        // Dispose de subsistemas que tienen cleanup explícito
        this.webcamScreens.dispose();
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
        this.webcamScreens = null;
        this.wsClient = null;
        this.director = null;
    }
}
