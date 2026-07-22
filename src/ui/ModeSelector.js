/**
 * ModeSelector.js — UI superpuesta para seleccionar modo de deformación
 * 
 * Crea 3 botones flotantes en la esquina superior izquierda:
 *   [SPECTRUM] [SPRING] [FLAT]
 * 
 * El botón activo se resalta. Hacer clic cambia el modo del BeatEvents.
 */

import { RESTORE_MODE } from '../events/BeatEvents.js';
import { LIGHT_PATTERNS } from '../particles/LuminousSpheres.js';

export class ModeSelector {

    constructor(beatEvents, terrain, spheres) {

        this.beatEvents = beatEvents;
        this.terrain = terrain;
        this.spheres = spheres;

        // Contenedor
        this.container = document.createElement('div');
        this.container.style.cssText = `
            position: fixed;
            top: 16px;
            left: 16px;
            z-index: 1000;
            display: flex;
            gap: 8px;
            font-family: monospace;
            font-size: 12px;
        `;

        // Crear botones de modo
        this.buttons = {};
        this.createButton('SPECTRUM', RESTORE_MODE.SPECTRUM);
        this.createButton('SPRING', RESTORE_MODE.SPRING);
        this.createButton('FLAT', RESTORE_MODE.FLAT);
        this.createButton('STILL', RESTORE_MODE.STILL);
        this.createButton('STEPS', RESTORE_MODE.STEPS);
        this.createButton('WAVE', RESTORE_MODE.WAVE);

        // Botón de rotación (solo aplica a SPECTRUM)
        this.rotationEnabled = true;
        this.rotBtn = this.createToggleButton('ROTATION', true, (enabled) => {
            this.rotationEnabled = enabled;
            terrain.terrainPlane._rotationEnabled = enabled;
        });

        document.body.appendChild(this.container);

        // ─── Selector de patrones de luz ───
        this.patternContainer = document.createElement('div');
        this.patternContainer.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 1000;
            display: flex;
            gap: 6px;
            font-family: monospace;
            font-size: 11px;
        `;

        this.patternButtons = {};
        this.createPatternButton('ROW', LIGHT_PATTERNS.WAVE_ROW);
        this.createPatternButton('DIAG', LIGHT_PATTERNS.DIAGONAL);
        this.createPatternButton('RADIAL', LIGHT_PATTERNS.RADIAL_PULSE);
        this.createPatternButton('FLASH', LIGHT_PATTERNS.ALL_FLASH);
        this.createPatternButton('SNAKE', LIGHT_PATTERNS.SNAKE);
        this.createPatternButton('CHECK', LIGHT_PATTERNS.CHECKER);
        this.createPatternButton('OFF', LIGHT_PATTERNS.OFF);

        document.body.appendChild(this.patternContainer);
        this.updatePatternActive();

        // ─── Selector de textura del terreno ───
        this.textureContainer = document.createElement('div');
        this.textureContainer.style.cssText = `
            position: fixed;
            top: 46px;
            right: 16px;
            z-index: 1000;
            display: flex;
            gap: 6px;
            font-family: monospace;
            font-size: 11px;
        `;

        this.textureButtons = {};
        this.createTextureButton('SOLID', 'solid');
        this.createTextureButton('WIRE♪', 'wireframe');

        document.body.appendChild(this.textureContainer);
        this.updateTextureActive();

        // Panel de bandas (debajo de los botones)
        this.createBandPanel(terrain);

        // Resaltar el botón activo
        this.updateActive();
    }

    createButton(label, mode) {

        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            padding: 6px 12px;
            border: 1px solid #14FF9D;
            background: rgba(0, 0, 0, 0.7);
            color: #14FF9D;
            cursor: pointer;
            border-radius: 3px;
            transition: all 0.2s;
        `;

        btn.addEventListener('click', () => {
            this.beatEvents.setMode(mode);
            this.updateActive();
        });

        btn.addEventListener('mouseenter', () => {
            if (this.beatEvents.restoreMode !== mode) {
                btn.style.background = 'rgba(20, 255, 157, 0.1)';
            }
        });

        btn.addEventListener('mouseleave', () => {
            if (this.beatEvents.restoreMode !== mode) {
                btn.style.background = 'rgba(0, 0, 0, 0.7)';
            }
        });

        this.buttons[mode] = btn;
        this.container.appendChild(btn);
    }

    createToggleButton(label, initialState, callback) {

        const btn = document.createElement('button');
        let enabled = initialState;

        const updateStyle = () => {
            if (enabled) {
                btn.textContent = `${label}: ON`;
                btn.style.background = '#14FF9D';
                btn.style.color = '#000';
            } else {
                btn.textContent = `${label}: OFF`;
                btn.style.background = 'rgba(0, 0, 0, 0.7)';
                btn.style.color = '#14FF9D';
            }
        };

        btn.style.cssText = `
            padding: 6px 12px;
            border: 1px solid #14FF9D;
            cursor: pointer;
            border-radius: 3px;
            transition: all 0.2s;
        `;

        btn.addEventListener('click', () => {
            enabled = !enabled;
            updateStyle();
            callback(enabled);
        });

        updateStyle();
        this.container.appendChild(btn);
        return btn;
    }

    createSliderRow(panel, label, defaultPercent, defaultVal, callback) {

        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 6px;';

        const lbl = document.createElement('span');
        lbl.textContent = label;
        lbl.style.width = '24px';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '1';
        slider.max = '100';
        slider.value = String(defaultPercent);
        slider.style.cssText = 'width: 80px; accent-color: #14FF9D;';

        const valueLabel = document.createElement('span');
        valueLabel.textContent = defaultVal.toFixed(2);
        valueLabel.style.width = '32px';

        slider.addEventListener('input', () => {
            const val = parseInt(slider.value) / 100;
            callback(val);
            valueLabel.textContent = val.toFixed(2);
        });

        row.appendChild(lbl);
        row.appendChild(slider);
        row.appendChild(valueLabel);
        panel.appendChild(row);
    }

    createBandPanel(terrain) {

        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed;
            top: 50px;
            left: 16px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-family: monospace;
            font-size: 11px;
            color: #14FF9D;
        `;

        // Inicializar gains por defecto
        const defaultGains = [0.22, 0.23, 0.63, 0.09, 0.63, 0.09, 0.59, 0.56];
        terrain.terrainPlane._bandGains = defaultGains.slice();

        // Sliders de Attack y Decay
        this.createSliderRow(panel, 'ATK', 68, 0.68, (val) => {
            terrain.terrainPlane._attackSpeed = val;
        });
        this.createSliderRow(panel, 'DCY', 1, 0.01, (val) => {
            terrain.terrainPlane._decaySpeed = val;
        });

        // Separador
        const sep = document.createElement('div');
        sep.style.cssText = 'height: 1px; background: #14FF9D33; margin: 4px 0;';
        panel.appendChild(sep);

        for (let i = 0; i < 8; i++) {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; gap: 6px;';

            const label = document.createElement('span');
            label.textContent = `B${i}`;
            label.style.width = '20px';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = '100';
            slider.value = String(defaultGains[i] * 100);
            slider.style.cssText = 'width: 80px; accent-color: #14FF9D;';

            const valueLabel = document.createElement('span');
            valueLabel.textContent = defaultGains[i].toFixed(2);
            valueLabel.style.width = '32px';

            const bandIndex = i;
            slider.addEventListener('input', () => {
                const val = parseInt(slider.value) / 100;
                terrain.terrainPlane._bandGains[bandIndex] = val;
                valueLabel.textContent = val.toFixed(2);
            });

            row.appendChild(label);
            row.appendChild(slider);
            row.appendChild(valueLabel);
            panel.appendChild(row);
        }

        document.body.appendChild(panel);
    }

    updateActive() {

        const activeMode = this.beatEvents.restoreMode;

        for (const [mode, btn] of Object.entries(this.buttons)) {
            if (mode === activeMode) {
                btn.style.background = '#14FF9D';
                btn.style.color = '#000';
                btn.style.borderColor = '#14FF9D';
            } else {
                btn.style.background = 'rgba(0, 0, 0, 0.7)';
                btn.style.color = '#14FF9D';
                btn.style.borderColor = '#14FF9D';
            }
        }
    }

    createPatternButton(label, pattern) {

        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            padding: 5px 10px;
            border: 1px solid #FF9D14;
            background: rgba(0, 0, 0, 0.7);
            color: #FF9D14;
            cursor: pointer;
            border-radius: 3px;
            transition: all 0.2s;
        `;

        btn.addEventListener('click', () => {
            if (this.spheres) {
                this.spheres.setPattern(pattern);
                this.updatePatternActive();
            }
        });

        this.patternButtons[pattern] = btn;
        this.patternContainer.appendChild(btn);
    }

    updatePatternActive() {

        if (!this.spheres) return;
        const activePattern = this.spheres.pattern;

        for (const [pattern, btn] of Object.entries(this.patternButtons)) {
            if (pattern === activePattern) {
                btn.style.background = '#FF9D14';
                btn.style.color = '#000';
            } else {
                btn.style.background = 'rgba(0, 0, 0, 0.7)';
                btn.style.color = '#FF9D14';
            }
        }
    }

    createTextureButton(label, mode) {

        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            padding: 5px 10px;
            border: 1px solid #14D4FF;
            background: rgba(0, 0, 0, 0.7);
            color: #14D4FF;
            cursor: pointer;
            border-radius: 3px;
            transition: all 0.2s;
        `;

        btn.addEventListener('click', () => {
            this.beatEvents.setTextureMode(mode);
            this.updateTextureActive();
        });

        this.textureButtons[mode] = btn;
        this.textureContainer.appendChild(btn);
    }

    updateTextureActive() {

        const activeMode = this.beatEvents.terrainTextureMode;

        for (const [mode, btn] of Object.entries(this.textureButtons)) {
            if (mode === activeMode) {
                btn.style.background = '#14D4FF';
                btn.style.color = '#000';
            } else {
                btn.style.background = 'rgba(0, 0, 0, 0.7)';
                btn.style.color = '#14D4FF';
            }
        }
    }
}
