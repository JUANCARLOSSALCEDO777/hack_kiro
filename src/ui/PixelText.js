/**
 * PixelText.js — Orquestador de textos 3D con renderers intercambiables
 * 
 * Gestiona el ciclo de vida de los textos (spawn, movimiento, despawn)
 * y delega la creación visual a un renderer seleccionable.
 * 
 * Modos disponibles: pixel, particles
 */

import * as THREE from 'three';
import { PixelFontRenderer } from './text-renderers/PixelFontRenderer.js';
import { ParticleFontRenderer } from './text-renderers/ParticleFontRenderer.js';

// Textos de prueba (también llegan por WebSocket)
const TEST_TEXTS = ['KIRO', 'HACKATHON', 'DISCORD 3D'];

const TEXT_SPEED = 150;
const SPAWN_DISTANCE = 1200;
const TEXT_MAX_AGE = 10;
const SPAWN_INTERVAL = 4.0;

// Modos disponibles
const RENDERERS = {
    pixel: PixelFontRenderer,
    particles: ParticleFontRenderer
};

export class PixelText {

    constructor(scene, player) {
        this.scene = scene;
        this.player = player;
        this.texts = TEST_TEXTS;
        this.activeTexts = [];
        this.nextTextIndex = 0;
        this.timeSinceLastSpawn = SPAWN_INTERVAL;

        // Modo de renderizado actual
        this.mode = 'particles';
        this._renderers = {};
        this._enabled = true;

        // Instanciar todos los renderers (lazy: solo el activo se usa)
        for (const [key, RendererClass] of Object.entries(RENDERERS)) {
            this._renderers[key] = new RendererClass();
        }
    }

    /** Obtener el renderer activo */
    get renderer() {
        return this._renderers[this.mode];
    }

    /** Cambiar modo de renderizado en caliente */
    setMode(newMode) {
        if (RENDERERS[newMode]) {
            this.mode = newMode;
        }
    }

    /** Obtener la lista de modos disponibles */
    static get modes() {
        return Object.keys(RENDERERS);
    }

    spawn() {
        const renderer = this.renderer;
        if (!renderer || !renderer.ready) return;

        const str = this.texts[this.nextTextIndex % this.texts.length];
        this.nextTextIndex++;

        const group = renderer.createMesh(str);
        if (!group) return;

        const cam = this.player.camera;
        const angle = this.player.angle;
        const dir = new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle));

        // Posicionar delante de la cámara
        group.position.copy(cam.position);
        group.position.addScaledVector(dir, SPAWN_DISTANCE);

        // Offset vertical y lateral para variedad
        const right = new THREE.Vector3(
            -Math.sin(angle + Math.PI / 2), 0,
            -Math.cos(angle + Math.PI / 2)
        );
        group.position.y += 50 + Math.random() * 50;
        group.position.addScaledVector(right, (Math.random() - 0.5) * 200);
        group.lookAt(cam.position);

        this.scene.add(group);
        this.activeTexts.push({
            group,
            direction: dir.clone(),
            age: 0,
            rendererMode: this.mode
        });
    }

    /** Añadir texto a la cola (llamado desde WebSocket) */
    addText(str) {
        this.texts.push(str);
    }

    update(state) {
        if (!this._enabled) return;

        const dt = state.deltaTime;

        // Spawn periódico
        this.timeSinceLastSpawn += dt;
        if (this.timeSinceLastSpawn >= SPAWN_INTERVAL) {
            this.spawn();
            this.timeSinceLastSpawn = 0;
        }

        // Actualizar textos activos
        for (let i = this.activeTexts.length - 1; i >= 0; i--) {
            const entry = this.activeTexts[i];

            // Mover en su dirección fija
            entry.group.position.addScaledVector(entry.direction, -TEXT_SPEED * dt);
            entry.age += dt;

            // Delegar actualización visual al renderer que lo creó
            const renderer = this._renderers[entry.rendererMode];
            if (renderer && renderer.updateEntry) {
                renderer.updateEntry(entry, dt);
            }

            // Destruir por tiempo de vida máximo
            if (entry.age > TEXT_MAX_AGE) {
                this.scene.remove(entry.group);
                entry.group.traverse(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) c.material.dispose();
                });
                this.activeTexts.splice(i, 1);
            }
        }
    }
}
