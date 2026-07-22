/**
 * TerrainPlane.js — Geometría del terreno generada desde un heightmap
 * 
 * PROCESO:
 * 1. Generar un heightmap procedural (Perlin noise simulado con canvas)
 * 2. Aplicar blur para suavizar
 * 3. Crear BufferGeometry con vértices elevados según el heightmap
 * 4. La geometría es tileable (los bordes coinciden)
 *
 * Notas:
 * - Usa BufferGeometry
 * - El heightmap se genera proceduralmente (no se lee de una imagen PNG)
 *   (pero la lógica es idéntica: leer píxeles de un canvas)
 */

import * as THREE from 'three';
import { Config } from '../Config.js';

const RAD180 = Math.PI;
const RAD90 = Math.PI / 2;

export class TerrainPlane {

    constructor() {

        const { mapResolution: resolution, tileSize: size, height, blurRadius } = Config.terrain;

        this.resolution = resolution;
        this.segmentSize = size / resolution;

        // Crear heightmap procedural
        const heightMap = this.createHeightMap(resolution, height, blurRadius);

        // Crear geometría
        this.geometry = this.buildGeometry(resolution, size, heightMap);

        // Almacenar datos para acceso directo
        this.heightGrid = heightMap;
        this.positionAttribute = this.geometry.getAttribute('position');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Generar heightmap procedural (reemplaza terrain66.png)
    // ═══════════════════════════════════════════════════════════════════════
    createHeightMap(resolution, height, blurRadius) {

        const canvas = document.createElement('canvas');
        canvas.width = resolution;
        canvas.height = resolution;
        const ctx = canvas.getContext('2d');

        // Generar ruido con múltiples capas (simula Perlin noise)
        this.generateNoise(ctx, resolution);

        // Leer píxeles
        const imageData = ctx.getImageData(0, 0, resolution, resolution).data;

        // Llenar heightmap desde los píxeles (canal Rojo)
        const heightMap = [];
        for (let x = 0; x <= resolution; x++) {
            heightMap[x] = [];
            const ix = (x < resolution) ? x : 0;  // Tileable: último = primero
            for (let y = 0; y <= resolution; y++) {
                const iy = (y < resolution) ? y : 0;
                heightMap[x][y] = imageData[(ix + iy * resolution) * 4];
            }
        }

        // Blur (box blur con wrapping para mantener tileable)
        const blurred = this.applyBlur(heightMap, resolution, blurRadius);

        // Escalar al rango [-height/2, +height/2]
        for (let x = 0; x <= resolution; x++) {
            for (let y = 0; y <= resolution; y++) {
                blurred[x][y] = height * ((blurred[x][y] - 128) / 255);
            }
        }

        return blurred;
    }

    generateNoise(ctx, size) {

        // Capa base: ruido grueso
        const layers = [
            { scale: 4, opacity: 0.5 },
            { scale: 8, opacity: 0.3 },
            { scale: 16, opacity: 0.2 }
        ];

        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, size, size);

        for (const layer of layers) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = layer.scale;
            tempCanvas.height = layer.scale;
            const tempCtx = tempCanvas.getContext('2d');

            // Ruido aleatorio a escala pequeña
            const imgData = tempCtx.createImageData(layer.scale, layer.scale);
            for (let i = 0; i < imgData.data.length; i += 4) {
                const v = Math.random() * 255;
                imgData.data[i] = v;
                imgData.data[i + 1] = v;
                imgData.data[i + 2] = v;
                imgData.data[i + 3] = 255;
            }
            tempCtx.putImageData(imgData, 0, 0);

            // Escalar al tamaño del terreno (interpolación = blur natural)
            ctx.globalAlpha = layer.opacity;
            ctx.drawImage(tempCanvas, 0, 0, size, size);
        }

        ctx.globalAlpha = 1;
    }

    applyBlur(heightMap, resolution, radius) {

        const blurred = [];
        for (let x = 0; x <= resolution; x++) {
            blurred[x] = heightMap[x].slice(0);
        }

        for (let x = 0; x <= resolution; x++) {
            for (let y = 0; y <= resolution; y++) {

                let acc = 0;
                for (let by = -radius; by <= radius; by++) {
                    for (let bx = -radius; bx <= radius; bx++) {

                        let ix = x + bx;
                        let iy = y + by;

                        // Wrapping (tileable)
                        if (ix < 0) ix += resolution;
                        else if (ix > resolution) ix -= resolution;
                        if (iy < 0) iy += resolution;
                        else if (iy > resolution) iy -= resolution;

                        acc += heightMap[ix][iy];
                    }
                }

                blurred[x][y] = acc / ((radius * 2 + 1) * (radius * 2 + 1));
            }
        }

        return blurred;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Construir BufferGeometry desde el heightmap
    // ═══════════════════════════════════════════════════════════════════════
    buildGeometry(resolution, size, heightMap) {

        const sizeHalf = size / 2;
        const segmentSize = this.segmentSize;
        const resolution1 = resolution + 1;
        const vertexCount = resolution1 * resolution1;
        const faceCount = resolution * resolution * 2; // 2 triángulos por celda

        // Buffers
        const positions = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        const uvs = new Float32Array(vertexCount * 2);
        const indices = new Uint32Array(faceCount * 3);

        // Vértices
        let vi = 0, ui = 0;
        for (let ix = 0; ix <= resolution; ix++) {
            for (let iy = 0; iy <= resolution; iy++) {

                const x = ix * segmentSize - sizeHalf;
                const y = heightMap[ix][iy];
                const z = iy * segmentSize - sizeHalf;

                positions[vi * 3] = x;
                positions[vi * 3 + 1] = y;
                positions[vi * 3 + 2] = z;

                uvs[ui] = ix / resolution;
                uvs[ui + 1] = iy / resolution;

                vi++;
                ui += 2;
            }
        }

        // Índices (2 triángulos por celda)
        let ii = 0;
        for (let ix = 0; ix < resolution; ix++) {
            for (let iy = 0; iy < resolution; iy++) {

                const a = ix * resolution1 + iy;
                const b = (ix + 1) * resolution1 + iy;
                const c = (ix + 1) * resolution1 + (iy + 1);
                const d = ix * resolution1 + (iy + 1);

                // Triángulo 1: a, d, b (CCW visto desde arriba = normales hacia +Y)
                indices[ii++] = a;
                indices[ii++] = d;
                indices[ii++] = b;

                // Triángulo 2: b, d, c
                indices[ii++] = b;
                indices[ii++] = d;
                indices[ii++] = c;
            }
        }

        // Construir geometría
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        return geometry;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Deformar un vértice
    // ═══════════════════════════════════════════════════════════════════════
    displaceVertex(x, y, radius, height) {

        const resolution = this.resolution;
        const resolution1 = resolution + 1;
        const positions = this.positionAttribute.array;
        const radius2 = radius * radius;
        const diameter = radius * 2;

        for (let ix = 0; ix < diameter; ix++) {
            const dx2 = (ix - radius) * (ix - radius);
            const gx = (resolution + x + ix - radius) % resolution;

            for (let iy = 0; iy < diameter; iy++) {
                const dy2 = (iy - radius) * (iy - radius);
                const gy = (resolution + y + iy - radius) % resolution;

                const h = Math.max(0, 1 - ((dx2 + dy2) / radius2));

                if (h > 0) {
                    const index = gx * resolution1 + gy;
                    positions[index * 3 + 1] += height * (Math.sin(RAD180 * h - RAD90) + 1) * 0.5;
                }
            }
        }

        this.positionAttribute.needsUpdate = true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Deformación por espectro de frecuencias (modo "spectrum")
    // Cada vértice se eleva según su distancia al centro del tile
    // y el valor del bin de frecuencia correspondiente a esa distancia.
    // Resultado: ondas concéntricas que pulsan con la música.
    // ═══════════════════════════════════════════════════════════════════════
    applySpectrum(frequencyData, amplitude) {

        const resolution = this.resolution;
        const resolution1 = resolution + 1;
        const positions = this.positionAttribute.array;
        const halfRes = resolution / 2;
        const binCount = frequencyData.length; // 64 bins

        // Agrupar bins para hacer ondas más anchas y suaves
        // 64 bins → 8 bandas (cada banda promedia 8 bins)
        const bandCount = 8;
        const binsPerBand = Math.floor(binCount / bandCount);
        const bands = new Float32Array(bandCount);

        for (let b = 0; b < bandCount; b++) {
            let sum = 0;
            for (let i = 0; i < binsPerBand; i++) {
                sum += frequencyData[b * binsPerBand + i];
            }
            bands[b] = sum / binsPerBand;
        }

        // Aplicar gains por banda (controlados desde la UI)
        for (let b = 0; b < bandCount; b++) {
            bands[b] *= this._bandGains[b];
        }

        // ─── Attack/Decay envelope por banda ───
        // Inicializar smoothed bands y offset si no existen
        if (!this._smoothBands) {
            this._smoothBands = new Float32Array(bandCount);
            this._spectrumOffset = 0;
            if (!this._bandGains) this._bandGains = [1, 1, 1, 1, 1, 1, 1, 1];
            if (!this._attackSpeed) this._attackSpeed = 0.68;
            if (!this._decaySpeed) this._decaySpeed = 0.01;
        }

        // Rotación: el offset avanza con el tiempo, las ondas viajan desde el centro hacia afuera
        if (this._rotationEnabled !== false) {
            this._spectrumOffset = (this._spectrumOffset - 0.015 + 1) % 1;
        }

        const attackSpeed = this._attackSpeed;
        const decaySpeed = this._decaySpeed;

        for (let b = 0; b < bandCount; b++) {
            const target = bands[b];
            const current = this._smoothBands[b];

            if (target > current) {
                this._smoothBands[b] += (target - current) * attackSpeed;
            } else {
                this._smoothBands[b] += (target - current) * decaySpeed;
            }
        }

        // ─── Aplicar al terreno con offset rotativo ───
        for (let ix = 0; ix <= resolution; ix++) {

            const dx = ix - halfRes;
            const dx2 = dx * dx;

            for (let iy = 0; iy <= resolution; iy++) {

                const dy = iy - halfRes;
                const dy2 = dy * dy;

                // Distancia al centro → índice de banda + offset rotativo
                const dist = Math.sqrt(dx2 + dy2);
                const maxDist = halfRes * 0.9; // Radio al 90% del área del tile
                const index = ix * resolution1 + iy;

                // Fuera del radio → plano
                if (dist > maxDist) {
                    positions[index * 3 + 1] = 0;
                    continue;
                }

                // Mapear distancia a banda: 0..maxDist → 0..bandCount uniformemente
                const normalizedDist = dist / maxDist; // 0 en centro, 1 en borde
                const rawIndex = normalizedDist * bandCount + this._spectrumOffset * bandCount;
                const bandIndex = Math.floor(rawIndex) % bandCount;

                // Interpolar entre bandas vecinas para suavizar transiciones
                const frac = rawIndex - Math.floor(rawIndex);
                const nextIndex = (bandIndex + 1) % bandCount;
                const value = this._smoothBands[bandIndex] * (1 - frac) + this._smoothBands[nextIndex] * frac;

                // Altura = deformación por frecuencia (base plana y=0)
                const freqValue = (value / 255) * amplitude;
                // Lerp: suavizar la transición hacia el target
                const currentY = positions[index * 3 + 1];
                positions[index * 3 + 1] += (freqValue - currentY) * 0.15;
            }
        }

        // Forzar bordes tileable y marcar como actualizado
        this.tileBorders();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // tileBorders — igualar bordes para que los tiles se conecten sin costuras
    // ═══════════════════════════════════════════════════════════════════════
    tileBorders() {

        const resolution = this.resolution;
        const resolution1 = resolution + 1;
        const positions = this.positionAttribute.array;

        // Borde derecho (ix=resolution) = borde izquierdo (ix=0)
        for (let iy = 0; iy <= resolution; iy++) {
            const srcIndex = 0 * resolution1 + iy;
            const dstIndex = resolution * resolution1 + iy;
            positions[dstIndex * 3 + 1] = positions[srcIndex * 3 + 1];
        }

        // Borde inferior (iy=resolution) = borde superior (iy=0)
        for (let ix = 0; ix <= resolution; ix++) {
            const srcIndex = ix * resolution1 + 0;
            const dstIndex = ix * resolution1 + resolution;
            positions[dstIndex * 3 + 1] = positions[srcIndex * 3 + 1];
        }

        this.positionAttribute.needsUpdate = true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Restaurar hacia el heightmap original (modo "spring")
    // Cada frame, los vértices se acercan a su altura original con amortiguación
    // ═══════════════════════════════════════════════════════════════════════
    restoreToHeightmap(factor) {

        const resolution = this.resolution;
        const resolution1 = resolution + 1;
        const positions = this.positionAttribute.array;
        const heightGrid = this.heightGrid;

        for (let ix = 0; ix <= resolution; ix++) {
            for (let iy = 0; iy <= resolution; iy++) {

                const index = ix * resolution1 + iy;
                const currentY = positions[index * 3 + 1];
                const targetY = heightGrid[ix][iy];

                // Interpolar hacia la altura original
                positions[index * 3 + 1] += (targetY - currentY) * factor;
            }
        }

        this.positionAttribute.needsUpdate = true;
        this.geometry.computeVertexNormals();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Deformación en escalera por columnas (modo "steps")
    // Divide el terreno en bandas en dirección X (mismas que la grilla de esferas)
    // Cada banda tiene una altura diferente, creando peldaños.
    // ═══════════════════════════════════════════════════════════════════════
    applySteps(factor, toggle) {

        const resolution = this.resolution;
        const resolution1 = resolution + 1;
        const positions = this.positionAttribute.array;
        const segmentSize = this.segmentSize;
        const tileSize = resolution * segmentSize;
        const sizeHalf = tileSize / 2;

        // 20 columnas alineadas con las esferas (90% del tile, centradas)
        const numSteps = 20;
        const usableWidth = tileSize * 1.0;
        const startX = -usableWidth / 2;
        const colWidth = usableWidth / (numSteps - 1);
        const maxHeight = 20;

        for (let ix = 0; ix <= resolution; ix++) {

            // Posición X de este vértice en coordenadas locales
            const localX = ix * segmentSize - sizeHalf;

            // ¿En qué columna cae?
            const normalized = (localX - startX) / colWidth;
            const step = Math.max(0, Math.min(numSteps - 1, Math.round(normalized)));

            // Intercalado: pares arriba/impares abajo (o al revés según toggle)
            const isEven = (step % 2 === 0);
            const isUp = toggle ? isEven : !isEven;
            const targetY = isUp ? maxHeight : 0;

            for (let iy = 0; iy <= resolution; iy++) {
                const index = ix * resolution1 + iy;
                const currentY = positions[index * 3 + 1];
                positions[index * 3 + 1] += (targetY - currentY) * factor;
            }
        }

        this.tileBorders();
        this.positionAttribute.needsUpdate = true;
        this.geometry.computeVertexNormals();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Deformación por ola sinusoidal (modo "wave")
    // Una onda viaja en dirección X, las columnas suben y bajan como una ola.
    // ═══════════════════════════════════════════════════════════════════════
    applyWave(time) {

        const resolution = this.resolution;
        const resolution1 = resolution + 1;
        const positions = this.positionAttribute.array;
        const segmentSize = this.segmentSize;
        const tileSize = resolution * segmentSize;
        const sizeHalf = tileSize / 2;

        const amplitude = 20;
        const frequency = 0.015;  // Frecuencia espacial (ondas por unidad)
        const speed = 3.0;        // Velocidad de la ola

        for (let ix = 0; ix <= resolution; ix++) {

            const localX = ix * segmentSize - sizeHalf;
            const targetY = Math.sin(localX * frequency + time * speed) * amplitude;

            for (let iy = 0; iy <= resolution; iy++) {
                const index = ix * resolution1 + iy;
                const currentY = positions[index * 3 + 1];
                // Lerp suave
                positions[index * 3 + 1] += (targetY - currentY) * 0.1;
            }
        }

        this.tileBorders();
        this.positionAttribute.needsUpdate = true;
        this.geometry.computeVertexNormals();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // getHeightAt — obtener la altura actual del terreno en coordenadas locales
    // Interpola bilinearmente entre los 4 vértices más cercanos.
    // Funciona con cualquier modo (spectrum, flat, spring) porque lee
    // directamente del positionAttribute ya deformado.
    // ═══════════════════════════════════════════════════════════════════════
    getHeightAt(localX, localZ) {

        const resolution = this.resolution;
        const resolution1 = resolution + 1;
        const positions = this.positionAttribute.array;
        const segmentSize = this.segmentSize;
        const sizeHalf = (resolution * segmentSize) / 2;

        // Convertir coordenadas locales a índices de grilla (float)
        const gx = (localX + sizeHalf) / segmentSize;
        const gz = (localZ + sizeHalf) / segmentSize;

        // Clampear a rango válido
        const gxClamped = Math.max(0, Math.min(resolution - 1, gx));
        const gzClamped = Math.max(0, Math.min(resolution - 1, gz));

        // Índices enteros y fracción
        const ix = Math.floor(gxClamped);
        const iy = Math.floor(gzClamped);
        const fx = gxClamped - ix;
        const fy = gzClamped - iy;

        // 4 vértices vecinos
        const i00 = ix * resolution1 + iy;
        const i10 = (ix + 1) * resolution1 + iy;
        const i01 = ix * resolution1 + (iy + 1);
        const i11 = (ix + 1) * resolution1 + (iy + 1);

        // Alturas actuales (Y)
        const h00 = positions[i00 * 3 + 1];
        const h10 = positions[i10 * 3 + 1];
        const h01 = positions[i01 * 3 + 1];
        const h11 = positions[i11 * 3 + 1];

        // Interpolación bilinear
        const h0 = h00 * (1 - fx) + h10 * fx;
        const h1 = h01 * (1 - fx) + h11 * fx;

        return h0 * (1 - fy) + h1 * fy;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Aplanar hacia y=0 (modo "flat")
    // Cada frame, los vértices se acercan a altura cero
    // ═══════════════════════════════════════════════════════════════════════
    flattenToZero(factor) {

        const resolution = this.resolution;
        const resolution1 = resolution + 1;
        const positions = this.positionAttribute.array;

        for (let ix = 0; ix <= resolution; ix++) {
            for (let iy = 0; iy <= resolution; iy++) {

                const index = ix * resolution1 + iy;
                const currentY = positions[index * 3 + 1];

                // Interpolar hacia cero
                positions[index * 3 + 1] += (0 - currentY) * factor;
            }
        }

        this.positionAttribute.needsUpdate = true;
        this.geometry.computeVertexNormals();
    }
}
