/**
 * LuminousSpheres.js — Esferas luminosas con patrones de luz via shader
 * 
 * Los patrones de brillo se calculan en el fragment shader (GPU).
 * La CPU solo actualiza uniforms (time, pattern, flash) y las matrices
 * de posición de las instancias.
 */

import * as THREE from 'three';
import { Config } from '../Config.js';

// Grilla por tile
const COLS = 20;
const ROWS = 20;
const SPHERES_PER_TILE = COLS * ROWS;
const MAX_VISIBLE_TILES = 13;
const MAX_INSTANCES = SPHERES_PER_TILE * MAX_VISIBLE_TILES;

const SPHERE_RADIUS = 3;
const ALTITUDE = 0;
const BEAT_PULSE_SCALE = 1.5;
const PULSE_DECAY_SPEED = 5.0;

// Patrones (como int para el shader)
export const LIGHT_PATTERNS = {
    WAVE_ROW: 'waveRow',
    DIAGONAL: 'diagonal',
    RADIAL_PULSE: 'radialPulse',
    ALL_FLASH: 'allFlash',
    SNAKE: 'snake',
    CHECKER: 'checker',
    OFF: 'off'
};

const PATTERN_IDS = {
    waveRow: 0,
    diagonal: 1,
    radialPulse: 2,
    allFlash: 3,
    snake: 4,
    off: 5,
    checker: 6
};

// ═══════════════════════════════════════════════════════════════════════
// Vertex Shader — pasa grid position al fragment
// ═══════════════════════════════════════════════════════════════════════
const vertexShader = `
    attribute vec2 aGridPos;   // row, col por instancia
    attribute vec3 aColor;     // color base por instancia

    varying vec2 vGridPos;
    varying vec3 vColor;

    void main() {
        vGridPos = aGridPos;
        vColor = aColor;
        
        // Posición estándar para InstancedMesh
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

// ═══════════════════════════════════════════════════════════════════════
// Fragment Shader — calcula brillo según patrón
// ═══════════════════════════════════════════════════════════════════════
const fragmentShader = `
    uniform float uTime;
    uniform int uPattern;
    uniform float uFlashBrightness;
    uniform float uRows;
    uniform float uCols;

    varying vec2 vGridPos;
    varying vec3 vColor;

    const float DIM = 0.0;
    const float SPEED = 3.0;
    const int COPIES = 4;

    float getBrightness() {
        float row = vGridPos.x;
        float col = vGridPos.y;

        // Pattern 0: Wave Row
        if (uPattern == 0) {
            for (int c = 0; c < 4; c++) {
                float activeRow = mod(floor(uTime * SPEED) + floor(float(c) * uRows / 4.0), uRows);
                if (abs(row - activeRow) < 0.5) return 1.0;
            }
            return DIM;
        }

        // Pattern 1: Diagonal
        if (uPattern == 1) {
            float totalDiags = uRows + uCols - 1.0;
            float diag = row + col;
            for (int c = 0; c < 4; c++) {
                float activeDiag = mod(floor(uTime * SPEED) + floor(float(c) * totalDiags / 4.0), totalDiags);
                if (abs(diag - activeDiag) < 0.5) return 1.0;
            }
            return DIM;
        }

        // Pattern 2: Radial Pulse
        if (uPattern == 2) {
            float centerRow = (uRows - 1.0) / 2.0;
            float centerCol = (uCols - 1.0) / 2.0;
            float maxR = sqrt(centerRow * centerRow + centerCol * centerCol);
            float dist = sqrt((row - centerRow) * (row - centerRow) + (col - centerCol) * (col - centerCol));
            float normalizedDist = dist / maxR;
            float wave = mod(uTime * 0.8, 1.0);
            float diff = abs(normalizedDist - wave);
            return diff < 0.08 ? 1.0 : DIM;
        }

        // Pattern 3: All Flash
        if (uPattern == 3) {
            return uFlashBrightness;
        }

        // Pattern 4: Snake
        if (uPattern == 4) {
            float totalCells = uRows * uCols;
            float snakeSpeed = 20.0;
            int snakeLen = 4;
            int iRow = int(row);
            int iCol = int(col);
            int zigzag;
            if (iRow - 2 * (iRow / 2) == 0) {
                zigzag = iRow * int(uCols) + iCol;
            } else {
                zigzag = iRow * int(uCols) + (int(uCols) - 1 - iCol);
            }
            for (int c = 0; c < 5; c++) {
                float headPos = mod(floor(uTime * snakeSpeed) + floor(float(c) * totalCells / 5.0), totalCells);
                float d = mod(headPos - float(zigzag) + totalCells, totalCells);
                if (d < float(snakeLen)) return 1.0;
            }
            return DIM;
        }

        // Pattern 5: Off
        if (uPattern == 5) {
            return 0.0;
        }

        // Pattern 6: Checker — ajedrez blanco/apagado, alterna al beat
        if (uPattern == 6) {
            float checker = mod(floor(row) + floor(col), 2.0);
            bool isOn = (checker < 0.5);
            if (uFlashBrightness > 0.5) isOn = !isOn;
            return isOn ? -0.41 : 0.0; // -0.41 señal de gris 41%, 0 apagado
        }

        return 1.0;
    }

    void main() {
        float brightness = getBrightness();
        if (brightness < -0.1) {
            float b = -brightness; // 0.5 para checker
            gl_FragColor = vec4(b, b, b, 1.0);
        } else {
            gl_FragColor = vec4(vColor * brightness, 1.0);
        }
    }
`;

export class LuminousSpheres {

    constructor(scene, terrain) {

        this.scene = scene;
        this.terrain = terrain;
        this.colors = Config.colors;
        this.pulseScale = 1.0;
        this.pattern = LIGHT_PATTERNS.WAVE_ROW;
        this.flashBrightness = 0.08;

        const tileSize = Config.terrain.tileSize;

        // Precalcular posiciones locales
        this.localPositions = [];
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const localX = (row / (ROWS - 1) - 0.5) * tileSize * 1.0;
                const localZ = (col / (COLS - 1) - 0.5) * tileSize * 1.0;
                this.localPositions.push({ x: localX, z: localZ });
            }
        }

        // Geometría con atributos instanciados
        const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 8, 8);

        // Atributo instanciado: gridPos (row, col)
        const gridPosArray = new Float32Array(MAX_INSTANCES * 2);
        const colorArray = new Float32Array(MAX_INSTANCES * 3);

        for (let i = 0; i < MAX_INSTANCES; i++) {
            const inTile = i % SPHERES_PER_TILE;
            const row = Math.floor(inTile / COLS);
            const col = inTile % COLS;
            gridPosArray[i * 2] = row;
            gridPosArray[i * 2 + 1] = col;

            const colorHex = this.colors[(row + col) % this.colors.length];
            colorArray[i * 3] = ((colorHex >> 16) & 0xFF) / 255;
            colorArray[i * 3 + 1] = ((colorHex >> 8) & 0xFF) / 255;
            colorArray[i * 3 + 2] = (colorHex & 0xFF) / 255;
        }

        geometry.setAttribute('aGridPos', new THREE.InstancedBufferAttribute(gridPosArray, 2));
        geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colorArray, 3));

        // Uniforms
        this.uniforms = {
            uTime: { value: 0 },
            uPattern: { value: 0 },
            uFlashBrightness: { value: 0.08 },
            uRows: { value: ROWS },
            uCols: { value: COLS }
        };

        // ShaderMaterial custom
        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: this.uniforms
        });

        // InstancedMesh
        this.mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
        this.mesh.name = 'luminous_spheres_instanced';
        this.mesh.frustumCulled = false;

        // Ocultar todas inicialmente
        const dummy = new THREE.Object3D();
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        for (let i = 0; i < MAX_INSTANCES; i++) {
            this.mesh.setMatrixAt(i, dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;

        scene.add(this.mesh);

        this.dummy = new THREE.Object3D();
        this.activeCount = 0;
    }

    // ═══════════════════════════════════════════════════════════════════════
    setPattern(pattern) {
        this.pattern = pattern;
        this.uniforms.uPattern.value = PATTERN_IDS[pattern] ?? 0;
    }

    // ═══════════════════════════════════════════════════════════════════════
    update(state) {

        const dt = state.deltaTime;

        // Decay del pulse
        if (this.pulseScale > 1.0) {
            this.pulseScale -= dt * PULSE_DECAY_SPEED;
            if (this.pulseScale < 1.0) this.pulseScale = 1.0;
        }

        // Decay del flash
        if (this.flashBrightness > 0.08) {
            this.flashBrightness -= dt * 3.0;
            if (this.flashBrightness < 0.08) this.flashBrightness = 0.08;
        }

        // Actualizar uniforms (costo: ~0)
        this.uniforms.uTime.value = state.time;
        this.uniforms.uFlashBrightness.value = this.flashBrightness;

        // ─── Posicionar instancias (aún en CPU, necesario para seguir terreno) ───
        const gridSize = this.terrain.gridSize;
        const tiles = this.terrain.tiles;
        const scale = this.pulseScale;
        const dummy = this.dummy;
        let instanceIndex = 0;

        for (let tx = 0; tx < gridSize; tx++) {
            for (let ty = 0; ty < gridSize; ty++) {

                const tile = tiles[tx][ty];
                if (!tile.visible) continue;

                const tileX = tile.mesh.position.x;
                const tileZ = tile.mesh.position.z;

                for (let i = 0; i < SPHERES_PER_TILE; i++) {
                    if (instanceIndex >= MAX_INSTANCES) break;

                    const local = this.localPositions[i];
                    const worldX = tileX + local.x;
                    const worldZ = tileZ + local.z;
                    const terrainY = this.terrain.getWorldHeightAt(worldX, worldZ);

                    dummy.position.set(worldX, terrainY + ALTITUDE, worldZ);
                    dummy.scale.set(scale, scale, scale);
                    dummy.updateMatrix();
                    this.mesh.setMatrixAt(instanceIndex, dummy.matrix);
                    instanceIndex++;
                }
            }
        }

        // Ocultar sobrantes
        if (instanceIndex < this.activeCount) {
            dummy.scale.set(0, 0, 0);
            dummy.updateMatrix();
            for (let i = instanceIndex; i < this.activeCount; i++) {
                this.mesh.setMatrixAt(i, dummy.matrix);
            }
        }

        this.activeCount = instanceIndex;
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.count = instanceIndex;
    }

    // ═══════════════════════════════════════════════════════════════════════
    onBeat() {
        this.pulseScale = BEAT_PULSE_SCALE;
        if (this.pattern === LIGHT_PATTERNS.ALL_FLASH) {
            this.flashBrightness = 1.0;
        }
        if (this.pattern === LIGHT_PATTERNS.CHECKER) {
            // Toggle: alterna entre >0.5 y <0.5 para invertir el patrón en el shader
            this.flashBrightness = this.flashBrightness > 0.5 ? 0.0 : 1.0;
        }
    }
}
