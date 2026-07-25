/**
 * ModeSelector.js — Panel de control con lil-gui
 * 
 * Controla modos de terreno, patrones de luz y parámetros de espectro.
 * Los controles de espectro (attack, decay, bandas, rotación) solo
 * se muestran cuando el terreno está en modo Spectrum.
 */

import GUI from 'lil-gui';
import { RESTORE_MODE } from '../events/BeatEvents.js';
import { LIGHT_PATTERNS } from '../particles/LuminousSpheres.js';

export class ModeSelector {

    constructor(beatEvents, terrain, spheres, uiContainer) {

        this.beatEvents = beatEvents;
        this.terrain = terrain;
        this.spheres = spheres;
        this.uiContainer = uiContainer;

        // Estado reactivo para lil-gui
        this.params = {
            terrainMode: 'spectrum',
            lightPattern: 'radialPulse',
            textureMode: 'wireframe',
            rotation: true,
            attack: 0.68,
            decay: 0.01,
            bands: [0.22, 0.23, 0.63, 0.09, 0.63, 0.09, 0.59, 0.56]
        };

        // Inicializar gains del terreno
        terrain.terrainPlane._bandGains = this.params.bands.slice();
        terrain.terrainPlane._attackSpeed = this.params.attack;
        terrain.terrainPlane._decaySpeed = this.params.decay;

        this.setupGUI();
    }

    setupGUI() {

        this.gui = new GUI({ container: this.uiContainer, title: 'Controles' });
        this.gui.domElement.style.position = 'absolute';
        this.gui.domElement.style.top = '16px';
        this.gui.domElement.style.right = '16px';
        this.gui.domElement.style.pointerEvents = 'auto';
        this.gui.domElement.style.maxHeight = '85vh';
        this.gui.domElement.style.overflowY = 'auto';

        // ─── Modo de terreno ───
        const terrainFolder = this.gui.addFolder('Terreno');

        const modeOptions = {
            'Spectrum': 'spectrum',
            'Spring': 'spring',
            'Flat': 'flat',
            'Still': 'still',
            'Steps': 'steps',
            'Wave': 'wave'
        };

        terrainFolder.add(this.params, 'terrainMode', modeOptions)
            .name('Modo')
            .onChange((value) => {
                this.beatEvents.setMode(value);
                this.toggleSpectrumControls(value === 'spectrum');
            });

        const textureOptions = { 'Solid': 'solid', 'Wireframe': 'wireframe' };

        terrainFolder.add(this.params, 'textureMode', textureOptions)
            .name('Textura')
            .onChange((value) => {
                this.beatEvents.setTextureMode(value);
            });

        // ─── Controles de Spectrum (solo visibles en modo spectrum) ───
        this.spectrumFolder = this.gui.addFolder('Spectrum');

        this.spectrumFolder.add(this.params, 'rotation')
            .name('Rotación')
            .onChange((value) => {
                this.terrain.terrainPlane._rotationEnabled = value;
            });

        this.spectrumFolder.add(this.params, 'attack', 0.01, 1.0, 0.01)
            .name('Attack')
            .onChange((value) => {
                this.terrain.terrainPlane._attackSpeed = value;
            });

        this.spectrumFolder.add(this.params, 'decay', 0.001, 0.5, 0.001)
            .name('Decay')
            .onChange((value) => {
                this.terrain.terrainPlane._decaySpeed = value;
            });

        // Bandas de frecuencia
        const bandsFolder = this.spectrumFolder.addFolder('Bandas');
        for (let i = 0; i < 8; i++) {
            bandsFolder.add(this.params.bands, i, 0, 1, 0.01)
                .name(`B${i}`)
                .onChange((value) => {
                    this.terrain.terrainPlane._bandGains[i] = value;
                });
        }

        // ─── Patrones de luz ───
        const lightFolder = this.gui.addFolder('Luces');

        const patternOptions = {
            'Row': LIGHT_PATTERNS.WAVE_ROW,
            'Diagonal': LIGHT_PATTERNS.DIAGONAL,
            'Radial': LIGHT_PATTERNS.RADIAL_PULSE,
            'Flash': LIGHT_PATTERNS.ALL_FLASH,
            'Snake': LIGHT_PATTERNS.SNAKE,
            'Checker': LIGHT_PATTERNS.CHECKER,
            'Off': LIGHT_PATTERNS.OFF
        };

        lightFolder.add(this.params, 'lightPattern', patternOptions)
            .name('Patrón')
            .onChange((value) => {
                if (this.spheres) {
                    this.spheres.setPattern(value);
                }
            });

        // Cerrar sub-folders para que al abrir el panel no esté todo desplegado
        this.gui.foldersRecursive().forEach(f => f.close());

        // Cerrar el panel por defecto para no saturar la pantalla
        this.gui.close();
    }

    /** Muestra/oculta los controles de spectrum según el modo activo */
    toggleSpectrumControls(visible) {
        if (visible) {
            this.spectrumFolder.show();
        } else {
            this.spectrumFolder.hide();
        }
    }

    /** Remueve el panel GUI del DOM */
    dispose() {
        if (this.gui) {
            this.gui.destroy();
            this.gui = null;
        }
    }
}
