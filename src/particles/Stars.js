/**
 * Stars.js — Partículas flotantes tipo luciérnaga sobre el terreno
 * 
 * Pool de 24 partículas posicionadas sobre vértices visibles del terreno.
 * Cada partícula tiene un ciclo: spawn → fadeIn → hold → fadeOut → respawn.
 * Usa THREE.Points con PointsMaterial aditivo y textura circular procedural.
 */

import * as THREE from 'three';
import { Config } from '../Config.js';

const PARTICLE_COUNT = 64;
const MIN_SIZE = 6;
const MAX_SIZE = 10;
const MIN_HEIGHT_OFFSET = 50;
const MAX_HEIGHT_OFFSET = 200;
const BEAT_BUMP_SCALE = 2.0;
const BEAT_DECAY_SPEED = 4.0;

export class Stars {

    constructor(scene, terrain) {

        this.scene = scene;
        this.terrain = terrain;
        this.colors = Config.colors;

        // Estado interno de cada partícula
        this.particleData = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            this.particleData.push({
                life: 0,
                lifeTime: 0,
                fadeIn: 0,       // Tiempo donde termina el fade-in
                fadeOut: 0,      // Tiempo donde empieza el fade-out
                fadeOutDuration: 0,
                baseColor: new THREE.Color(0x000000),
                active: false
            });
        }

        // Geometría con posiciones y colores por vértice
        this.geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors = new Float32Array(PARTICLE_COUNT * 3);

        // Posicionar fuera de vista inicialmente
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            positions[i * 3] = 999999;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 999999;
            colors[i * 3] = 0;
            colors[i * 3 + 1] = 0;
            colors[i * 3 + 2] = 0;
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Material con textura circular procedural y blending aditivo
        const baseSize = MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE);
        this.material = new THREE.PointsMaterial({
            vertexColors: true,
            size: baseSize,
            map: this.createCircleTexture(32),
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            sizeAttenuation: true
        });

        // Objeto Points
        this.points = new THREE.Points(this.geometry, this.material);
        this.points.name = 'stars_particles';
        this.points.frustumCulled = false;
        this.scene.add(this.points);

        // Beat bump state
        this.beatScale = 1.0;
        this.baseSize = baseSize;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Textura circular procedural (canvas 32x32 con gradiente radial)
    // ═══════════════════════════════════════════════════════════════════════
    createCircleTexture(size) {

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const half = size / 2;
        const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Update — ciclo de vida de cada partícula
    // ═══════════════════════════════════════════════════════════════════════
    update(state) {

        const dt = state.deltaTime;
        const positions = this.geometry.attributes.position.array;
        const colors = this.geometry.attributes.color.array;

        // Decay del beat bump
        if (this.beatScale > 1.0) {
            this.beatScale -= dt * BEAT_DECAY_SPEED;
            if (this.beatScale < 1.0) this.beatScale = 1.0;
            this.material.size = this.baseSize * this.beatScale;
        }

        for (let i = 0; i < PARTICLE_COUNT; i++) {

            const data = this.particleData[i];
            data.life += dt;

            // Calcular opacidad según fase del ciclo de vida
            let opacity = 1.0;

            if (data.life < data.fadeIn) {
                // Fade-in: 0 → 1
                opacity = data.life / data.fadeIn;
            } else if (data.life > data.fadeOut) {
                // Fade-out: 1 → 0
                opacity = 1.0 - ((data.life - data.fadeOut) / data.fadeOutDuration);
                if (opacity < 0) opacity = 0;
            }

            // Aplicar opacidad al color (multiplicar color base por opacidad)
            colors[i * 3] = data.baseColor.r * opacity;
            colors[i * 3 + 1] = data.baseColor.g * opacity;
            colors[i * 3 + 2] = data.baseColor.b * opacity;

            // Respawn si el lifetime expiró o la posición ya no es visible
            const posX = positions[i * 3];
            const posZ = positions[i * 3 + 2];

            if (data.life > data.lifeTime || !this.terrain.isVisible(posX, posZ)) {
                this.spawnParticle(i, positions, colors);
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Spawn — posicionar partícula en un vértice visible aleatorio
    // ═══════════════════════════════════════════════════════════════════════
    spawnParticle(index, positions, colors) {

        const data = this.particleData[index];
        const pos = this.getRandomVisibleVertex();

        if (pos) {
            positions[index * 3] = pos.x;
            positions[index * 3 + 1] = pos.y + MIN_HEIGHT_OFFSET + Math.random() * (MAX_HEIGHT_OFFSET - MIN_HEIGHT_OFFSET);
            positions[index * 3 + 2] = pos.z;
        }

        // Color aleatorio de la paleta
        const colorHex = this.colors[Math.floor(Math.random() * this.colors.length)];
        data.baseColor.setHex(colorHex);

        // Reset del ciclo de vida con color negro (fade-in comienza en 0)
        colors[index * 3] = 0;
        colors[index * 3 + 1] = 0;
        colors[index * 3 + 2] = 0;

        // Tiempos del ciclo de vida
        data.life = 0;
        data.lifeTime = 3 + Math.random() * 4; // 3 a 7 segundos
        // fadeIn: entre 30% y 50% del lifetime
        data.fadeIn = (0.3 + Math.random() * 0.2) * data.lifeTime;
        // fadeOut: comienza entre 50% y 70% después del fadeIn
        data.fadeOut = data.fadeIn + (0.5 + Math.random() * 0.2) * (data.lifeTime - data.fadeIn);
        data.fadeOutDuration = data.lifeTime - data.fadeOut;
        data.active = true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Obtener un vértice aleatorio de un tile visible del terreno
    // ═══════════════════════════════════════════════════════════════════════
    getRandomVisibleVertex() {

        const tiles = this.terrain.tiles;
        const gridSize = this.terrain.gridSize;
        const positionAttr = this.terrain.terrainPlane.positionAttribute;
        const vertexCount = positionAttr.count;

        // Recopilar tiles visibles
        const visibleTiles = [];
        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                if (tiles[x][y].visible) {
                    visibleTiles.push(tiles[x][y]);
                }
            }
        }

        if (visibleTiles.length === 0) return null;

        // Seleccionar tile aleatorio
        const tile = visibleTiles[Math.floor(Math.random() * visibleTiles.length)];

        // Seleccionar vértice aleatorio de la geometría
        const vertexIndex = Math.floor(Math.random() * vertexCount);

        const localX = positionAttr.getX(vertexIndex);
        const localY = positionAttr.getY(vertexIndex);
        const localZ = positionAttr.getZ(vertexIndex);

        // Convertir a posición mundo (offset del tile)
        return {
            x: tile.mesh.position.x + localX,
            y: localY,
            z: tile.mesh.position.z + localZ
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // onBeat — size bump temporal 2x que decae
    // ═══════════════════════════════════════════════════════════════════════
    onBeat() {
        this.beatScale = BEAT_BUMP_SCALE;
        this.material.size = this.baseSize * this.beatScale;
    }
}
