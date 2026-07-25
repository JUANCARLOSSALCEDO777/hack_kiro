/**
 * BeatEvents.js — Eventos sincronizados con la música
 * 
 * Detecta beats usando análisis de frecuencia en tiempo real.
 * Dispara deformaciones del terreno con dos modos de restauración:
 *   - "spring": los vértices regresan al heightmap original (terreno ondulado)
 *   - "flat": los vértices se aplanan hacia y=0 (terreno plano)
 * 
 * El modo cambia automáticamente para crear variedad en la experiencia.
 */

import { Config } from '../Config.js';

// Modos de restauración del terreno post-beat
export const RESTORE_MODE = {
    SPRING: 'spring',     // Regresa al heightmap original
    FLAT: 'flat',         // Se aplana a y=0
    SPECTRUM: 'spectrum', // Deformación continua por espectro de frecuencias
    STILL: 'still',       // Plano y quieto, sin deformación ni bumps
    STEPS: 'steps',       // Escalera por columnas (como la grilla de esferas)
    WAVE: 'wave'          // Ola sinusoidal que recorre el terreno
};

export class BeatEvents {

    constructor(terrain, tileManager, player, skybox) {
        this.terrain = terrain;
        this.tileManager = tileManager;
        this.player = player;
        this.skybox = skybox;

        this.lastBeatTime = 0;
        this.beatInterval = 0.5;   // Intervalo mínimo entre beats (seg)
        this.beatThreshold = 150;  // Umbral de energía en bajos
        this.beatCount = 0;

        // Modo de restauración activo
        this.restoreMode = RESTORE_MODE.SPECTRUM; // Arrancar con espectro para ver el efecto
        this.restoreSpeed = 2.0;  // Factor de velocidad de restauración

        // Amplitud del espectro (qué tanto se deforma el terreno con la música)
        this.spectrumAmplitude = 80;

        // Estado para el pulso del skybox
        this.skyboxPulse = 0;

        // Flag para notificar beats a otros sistemas
        this.beatTriggered = false;

        // Temporizador para cambiar de modo automáticamente
        this.modeTimer = 0;
        this.modeDuration = 15; // Cada 15 seg cambia de modo
        this.autoToggle = false; // Desactivado por defecto (se controla con UI)

        // ─── High Beat detector (hi-hats/brillo) ───
        this.lastHighBeatTime = 0;
        this.highBeatInterval = 0.2;   // Cooldown más corto
        this.highBeatThreshold = 80;
        this.highBeatTriggered = false;
        this.stepsToggle = false; // Alterna escalones pares/impares al highBeat

        // ─── Mid Beat detector (bins 8–20, snare/clap) ───
        this.lastMidBeatTime = 0;
        this.midBeatInterval = 0.3;
        this.midBeatThreshold = 100;
        this.midBeatTriggered = false;

        // ─── Modo de textura del terreno ───
        this.terrainTextureMode = 'wireframe';
    }

    update(state, music) {

        const dt = state.deltaTime;

        // Reset del flag de beat cada frame
        this.beatTriggered = false;

        // ─── Actualizar pulso del skybox (decay suave) ───
        if (this.skyboxPulse > 0) {
            this.skyboxPulse -= dt * 3.0;
            if (this.skyboxPulse < 0) this.skyboxPulse = 0;
        }

        // ─── Restauración continua del terreno (cada frame) ───
        this.updateTerrainRestore(dt, state);

        // ─── Texturas dinámicas (gradient, pulse, heatmap) ───
        this._updateDynamicTexture(state);

        // ─── Wireframe auto-off ───
        if (this.terrainTextureMode === 'wireframe' && this._wireframeOffTime && state.time > this._wireframeOffTime) {
            this.terrain.material.wireframe = false;
            this.terrain.material.color.setHex(0x111122);
            this.terrain.material.emissive.setHex(0x000000);
            this.terrain.material.emissiveIntensity = 1.0;
            this._wireframeOffTime = null;
        }

        // ─── Espectro continuo (si está en modo SPECTRUM) ───
        this.updateSpectrum(music);

        // ─── Cambio automático de modo ───
        if (this.autoToggle) {
            this.modeTimer += dt;
            if (this.modeTimer > this.modeDuration) {
                this.modeTimer = 0;
                this.toggleMode();
            }
        }

        // ─── Detección de beat ───
        if (!music.playing) return;

        const freq = music.getFrequencyData();
        if (!freq) return;

        if (state.time - this.lastBeatTime > this.beatInterval) {

            const bass = (freq[0] + freq[1] + freq[2] + freq[3]) / 4;

            if (bass > this.beatThreshold) {
                this.beat(state);
                this.lastBeatTime = state.time;
            }
        }

        // ─── High Beat detector (bins 30–50, hi-hats) ───
        this.highBeatTriggered = false;
        if (state.time - this.lastHighBeatTime > this.highBeatInterval) {

            let highSum = 0;
            for (let i = 30; i < 50; i++) highSum += freq[i];
            const highAvg = highSum / 20;

            if (highAvg > this.highBeatThreshold) {
                this.highBeatTriggered = true;
                this.lastHighBeatTime = state.time;

                // En modo STEPS: alternar escalones al highBeat
                if (this.restoreMode === RESTORE_MODE.STEPS) {
                    this.stepsToggle = !this.stepsToggle;
                }
            }
        }

        // ─── Mid Beat detector (bins 8–20, snare/clap) ───
        this.midBeatTriggered = false;
        if (state.time - this.lastMidBeatTime > this.midBeatInterval) {

            let midSum = 0;
            for (let i = 8; i < 20; i++) midSum += freq[i];
            const midAvg = midSum / 12;

            if (midAvg > this.midBeatThreshold) {
                this.midBeatTriggered = true;
                this.lastMidBeatTime = state.time;

                // Modo wireframe: encender al midBeat, se apaga solo después de 0.4s
                if (this.terrainTextureMode === 'wireframe') {
                    this.terrain.material.wireframe = true;
                    this.terrain.material.color.setHex(0x000000);
                    this.terrain.material.emissive.setHex(0x14FF9D);
                    this.terrain.material.emissiveIntensity = 0.8;
                    this._wireframeOffTime = state.time + 0.1;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Beat — se dispara cuando se detecta un golpe rítmico
    // ═══════════════════════════════════════════════════════════════════════
    beat(state) {

        this.beatCount++;
        this.beatTriggered = true;

        // 1. Pulso del skybox (flash de luminosidad)
        this.skyboxPulse = 1.0;

        // 2. Bump en el terreno cerca de la cámara (solo en SPRING y FLAT)
        if (this.restoreMode === RESTORE_MODE.SPRING || this.restoreMode === RESTORE_MODE.FLAT) {
            this.createTerrainBump();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Crear un bump radial en el terreno
    // ═══════════════════════════════════════════════════════════════════════
    createTerrainBump() {

        const terrainPlane = this.terrain.terrainPlane;
        const resolution = terrainPlane.resolution;

        // Posición aleatoria en la cuadrícula (margen del 10% para evitar costuras)
        const margin = Math.ceil(resolution * 0.1);
        const x = margin + Math.floor(Math.random() * (resolution - margin * 2));
        const y = margin + Math.floor(Math.random() * (resolution - margin * 2));

        // Altura del bump: solo positiva (hacia arriba)
        const height = 20 + Math.random() * 30;
        const radius = 5 + Math.floor(Math.random() * 8);

        terrainPlane.displaceVertex(x, y, radius, height);

        // Emitir posición mundo + normal para efectos de partículas
        if (this.onBumpCreated) {
            const segmentSize = terrainPlane.segmentSize;
            const tileSize = this.terrain.tileSize;
            const sizeHalf = tileSize / 2;

            const localX = x * segmentSize - sizeHalf;
            const localZ = y * segmentSize - sizeHalf;

            const cameraTileX = this.terrain.cameraTileX + this.terrain.gridRadius * tileSize;
            const cameraTileZ = this.terrain.cameraTileY + this.terrain.gridRadius * tileSize;

            const worldX = cameraTileX + localX;
            const worldZ = cameraTileZ + localZ;
            const worldY = this.terrain.getWorldHeightAt(worldX, worldZ);

            // Normal del vértice en ese punto
            const resolution1 = terrainPlane.resolution + 1;
            const normalAttr = terrainPlane.geometry.getAttribute('normal');
            const vertexIndex = x * resolution1 + y;
            const normalX = normalAttr.getX(vertexIndex);
            const normalY = normalAttr.getY(vertexIndex);
            const normalZ = normalAttr.getZ(vertexIndex);

            this.onBumpCreated(worldX, worldY, worldZ, normalX, normalY, normalZ);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Restauración/deformación continua — se ejecuta cada frame
    // ═══════════════════════════════════════════════════════════════════════
    updateTerrainRestore(dt, state) {

        const terrainPlane = this.terrain.terrainPlane;
        const factor = dt * this.restoreSpeed;

        switch (this.restoreMode) {

            case RESTORE_MODE.SPRING:
                // Los vértices regresan gradualmente al heightmap original
                terrainPlane.restoreToHeightmap(factor);
                break;

            case RESTORE_MODE.FLAT:
                // Los vértices se aplanan gradualmente hacia y=0
                terrainPlane.flattenToZero(factor);
                break;

            case RESTORE_MODE.STILL:
                // Mantener plano — aplana agresivamente y no hace bumps
                terrainPlane.flattenToZero(factor * 2);
                break;

            case RESTORE_MODE.STEPS:
                // Escalera por columnas — intercala arriba/abajo al highBeat
                terrainPlane.applySteps(factor, this.stepsToggle);
                break;

            case RESTORE_MODE.WAVE:
                // Ola sinusoidal que viaja por el terreno
                terrainPlane.applyWave(state.time);
                break;

            case RESTORE_MODE.SPECTRUM:
                // Deformación continua basada en el espectro completo
                // (se maneja en updateSpectrum, no aquí)
                break;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Spectrum — deformación continua por frecuencias (cada frame)
    // ═══════════════════════════════════════════════════════════════════════
    updateSpectrum(music) {

        if (this.restoreMode !== RESTORE_MODE.SPECTRUM) return;
        if (!music || !music.playing) return;

        const freq = music.getFrequencyData();
        if (!freq) return;

        this.terrain.terrainPlane.applySpectrum(freq, this.spectrumAmplitude);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Cambiar de modo
    // ═══════════════════════════════════════════════════════════════════════
    toggleMode() {
        if (this.restoreMode === RESTORE_MODE.SPRING) {
            this.restoreMode = RESTORE_MODE.FLAT;
        } else if (this.restoreMode === RESTORE_MODE.FLAT) {
            this.restoreMode = RESTORE_MODE.SPECTRUM;
        } else {
            this.restoreMode = RESTORE_MODE.SPRING;
        }
    }

    // Setter para cambiar modo desde fuera
    setMode(mode) {
        this.restoreMode = mode;
    }

    setTextureMode(mode) {
        this.terrainTextureMode = mode;
        this._wireframeOffTime = null;

        const mat = this.terrain.material;

        switch (mode) {
            case 'solid':
                mat.wireframe = false;
                mat.color.setHex(0x000000);
                mat.emissive.setHex(0x000000);
                mat.emissiveIntensity = 1.0;
                mat.vertexColors = false;
                mat.needsUpdate = true;
                break;

            case 'wireframe':
                mat.wireframe = true;
                mat.color.setHex(0x14FF9D);
                mat.emissive.setHex(0x000000);
                mat.vertexColors = false;
                mat.needsUpdate = true;
                break;

            case 'grid':
                // Neon grid — wireframe magenta brillante sobre fondo negro
                mat.wireframe = true;
                mat.color.setHex(0x000000);
                mat.emissive.setHex(0xff00ff);
                mat.emissiveIntensity = 0.7;
                mat.vertexColors = false;
                mat.needsUpdate = true;
                break;

            case 'gradient':
                // Aurora — superficie sólida con emissive cyan/verde brillante
                mat.wireframe = false;
                mat.color.setHex(0x001111);
                mat.emissive.setHex(0x00ffaa);
                mat.emissiveIntensity = 0.6;
                mat.vertexColors = false;
                mat.needsUpdate = true;
                break;

            case 'pulse':
                // Lava — superficie sólida rojo/naranja intenso
                mat.wireframe = false;
                mat.color.setHex(0x110000);
                mat.emissive.setHex(0xff2200);
                mat.emissiveIntensity = 0.8;
                mat.vertexColors = false;
                mat.needsUpdate = true;
                break;

            case 'heatmap':
                // Plasma — wireframe dorado/amarillo eléctrico
                mat.wireframe = true;
                mat.color.setHex(0x000000);
                mat.emissive.setHex(0xffcc00);
                mat.emissiveIntensity = 0.9;
                mat.vertexColors = false;
                mat.needsUpdate = true;
                break;

            case 'ice':
                // Hielo — superficie sólida azul/blanco brillante, estática
                mat.wireframe = false;
                mat.color.setHex(0x001a33);
                mat.emissive.setHex(0x44ccff);
                mat.emissiveIntensity = 0.7;
                mat.vertexColors = false;
                mat.needsUpdate = true;
                break;

            case 'toxic':
                // Tóxico — wireframe verde ácido intenso, estático
                mat.wireframe = true;
                mat.color.setHex(0x000000);
                mat.emissive.setHex(0x33ff00);
                mat.emissiveIntensity = 0.8;
                mat.vertexColors = false;
                mat.needsUpdate = true;
                break;

            case 'ultraviolet':
                // Ultravioleta — superficie sólida violeta profundo, estática
                mat.wireframe = false;
                mat.color.setHex(0x0a0020);
                mat.emissive.setHex(0x7700ff);
                mat.emissiveIntensity = 0.8;
                mat.vertexColors = false;
                mat.needsUpdate = true;
                break;

            case 'ember':
                // Brasas — wireframe naranja/rojo fijo, sin pulso
                mat.wireframe = true;
                mat.color.setHex(0x000000);
                mat.emissive.setHex(0xff4400);
                mat.emissiveIntensity = 0.7;
                mat.vertexColors = false;
                mat.needsUpdate = true;
                break;

            case 'cycle':
                // Cycle — alterna entre las texturas estáticas luminosas
                mat.wireframe = true;
                mat.color.setHex(0x000000);
                mat.emissive.setHex(0xff00ff);
                mat.emissiveIntensity = 0.7;
                mat.vertexColors = false;
                mat.needsUpdate = true;
                this._cycleTextureIndex = 0;
                this._cycleTextureTimer = 0;
                break;
        }
    }

    /**
     * Actualización por frame de texturas dinámicas.
     * Cada modo tiene una animación luminosa distinta.
     */
    _updateDynamicTexture(state) {
        const mat = this.terrain.material;
        const mode = this.terrainTextureMode;

        if (mode === 'gradient') {
            // Aurora — oscila entre cyan y verde brillante
            const t = Math.sin(state.time * 0.5) * 0.5 + 0.5;
            mat.emissive.setRGB(0, 0.6 + t * 0.4, 0.4 + (1 - t) * 0.4);
            mat.emissiveIntensity = 0.5 + t * 0.4;
        }

        else if (mode === 'pulse') {
            // Lava — pulsa con los beats, brilla más al golpe
            const pulse = this.skyboxPulse || 0;
            const base = 0.4;
            const intensity = base + pulse * 0.6;
            mat.emissive.setRGB(1.0, 0.1 + pulse * 0.3, 0);
            mat.emissiveIntensity = intensity;
        }

        else if (mode === 'heatmap') {
            // Plasma — parpadeo rápido entre dorado y blanco
            const t = Math.sin(state.time * 2.0) * 0.5 + 0.5;
            mat.emissive.setRGB(1.0, 0.7 + t * 0.3, t * 0.3);
            mat.emissiveIntensity = 0.7 + t * 0.3;
        }

        else if (mode === 'grid') {
            // Grid neón — alterna entre magenta y cyan
            const t = Math.sin(state.time * 0.8) * 0.5 + 0.5;
            mat.emissive.setRGB(0.6 + t * 0.4, t * 0.2, 1.0 - t * 0.3);
            mat.emissiveIntensity = 0.6 + t * 0.2;
        }

        else if (mode === 'cycle') {
            // Alterna entre las texturas estáticas luminosas cada 2 segundos
            const CYCLE_PRESETS = [
                { wireframe: true, color: 0x000000, emissive: 0xff00ff, intensity: 0.7 },   // neon grid (magenta)
                { wireframe: true, color: 0x000000, emissive: 0x33ff00, intensity: 0.8 },    // toxic (verde ácido)
                { wireframe: true, color: 0x000000, emissive: 0xff4400, intensity: 0.7 },    // ember (naranja)
                { wireframe: true, color: 0x000000, emissive: 0xffcc00, intensity: 0.9 },    // plasma (dorado)
                { wireframe: true, color: 0x000000, emissive: 0x44ccff, intensity: 0.8 },    // ice wire (cyan)
                { wireframe: true, color: 0x000000, emissive: 0x7700ff, intensity: 0.8 },    // ultraviolet wire
            ];

            this._cycleTextureTimer = (this._cycleTextureTimer || 0) + state.deltaTime;
            if (this._cycleTextureTimer >= 2.0) {
                this._cycleTextureTimer = 0;
                this._cycleTextureIndex = ((this._cycleTextureIndex || 0) + 1) % CYCLE_PRESETS.length;
                const preset = CYCLE_PRESETS[this._cycleTextureIndex];
                mat.wireframe = preset.wireframe;
                mat.color.setHex(preset.color);
                mat.emissive.setHex(preset.emissive);
                mat.emissiveIntensity = preset.intensity;
            }
        }
    }

    getSkyboxPulse() {
        return this.skyboxPulse;
    }
}
