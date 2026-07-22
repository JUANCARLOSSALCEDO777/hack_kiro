/**
 * PhaseManager.js — Manager de fases de interacción visual
 * 
 * Controla qué sistemas visuales están activos según el tiempo de la canción.
 * Cada fase define una configuración: qué se muestra, qué modo de terreno, etc.
 * Se gatilla automáticamente por timestamps o manualmente.
 */

import { Config } from '../Config.js';

// Timestamps (en segundos) donde cambia cada fase
// TODO: ajustar a los tiempos reales de la canción
const PHASE_TRIGGERS = [
    { time: 0,   phase: 0 },
    { time: 30,  phase: 1 },
    { time: 60,  phase: 2 },
    { time: 120, phase: 3 }
];

// Configuración de cada fase
// Cada propiedad indica si el sistema está activo y con qué parámetros
const PHASES = [
    // Fase 0
    {
        stars: true,
        spheres: true,
        spherePattern: 'waveRow',
        terrainMode: 'spectrum',
        skyboxPulse: true,
        beatBumps: true
    },
    // Fase 1
    {
        stars: true,
        spheres: true,
        spherePattern: 'diagonal',
        terrainMode: 'spectrum',
        skyboxPulse: true,
        beatBumps: true
    },
    // Fase 2
    {
        stars: true,
        spheres: true,
        spherePattern: 'radialPulse',
        terrainMode: 'flat',
        skyboxPulse: true,
        beatBumps: true
    },
    // Fase 3
    {
        stars: true,
        spheres: true,
        spherePattern: 'allFlash',
        terrainMode: 'spring',
        skyboxPulse: true,
        beatBumps: true
    }
];

export class PhaseManager {

    constructor(systems) {

        // Referencias a los sistemas que controla
        this.systems = systems; // { stars, spheres, beatEvents, terrain, skybox }
        this.currentPhase = -1;
        this.phaseConfig = null;
        this.triggers = [...PHASE_TRIGGERS];
        this.nextTriggerIndex = 0;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Update — verificar si es hora de cambiar de fase
    // ═══════════════════════════════════════════════════════════════════════
    update(state, musicTime) {

        // Verificar siguiente trigger
        if (this.nextTriggerIndex < this.triggers.length) {
            const next = this.triggers[this.nextTriggerIndex];
            if (musicTime >= next.time) {
                this.setPhase(next.phase);
                this.nextTriggerIndex++;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // setPhase — cambiar a una fase específica
    // ═══════════════════════════════════════════════════════════════════════
    setPhase(phaseIndex) {

        if (phaseIndex === this.currentPhase) return;
        if (phaseIndex < 0 || phaseIndex >= PHASES.length) return;

        this.currentPhase = phaseIndex;
        this.phaseConfig = PHASES[phaseIndex];

        console.log(`[PhaseManager] Fase ${phaseIndex} activada`);

        this.applyConfig();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // applyConfig — aplicar la configuración de la fase actual a los sistemas
    // ═══════════════════════════════════════════════════════════════════════
    applyConfig() {

        const config = this.phaseConfig;
        const { stars, spheres, beatEvents, terrain } = this.systems;

        // Stars visibilidad
        if (stars && stars.points) {
            stars.points.visible = config.stars;
        }

        // Spheres visibilidad + patrón de luz
        if (spheres && spheres.mesh) {
            spheres.mesh.visible = config.spheres;
            if (config.spherePattern) {
                spheres.setPattern(config.spherePattern);
            }
        }

        // Modo de terreno
        if (beatEvents && config.terrainMode) {
            beatEvents.setRestoreMode(config.terrainMode);
        }

        // Beat bumps
        if (beatEvents) {
            beatEvents.bumpsEnabled = config.beatBumps;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Getters para que otros sistemas consulten la fase actual
    // ═══════════════════════════════════════════════════════════════════════
    get phase() {
        return this.currentPhase;
    }

    get config() {
        return this.phaseConfig;
    }
}
