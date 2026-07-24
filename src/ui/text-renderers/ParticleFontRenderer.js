/**
 * ParticleFontRenderer.js — Renderer de texto volumétrico con partículas
 * 
 * Cada letra se descompone en cientos de partículas luminosas que:
 * 1. Se ensamblan desde posiciones random hacia la forma del texto
 * 2. Flotan con turbulencia sutil mientras son legibles
 * 3. Se disuelven cuando el texto se destruye
 * 
 * Un solo draw call (Points) con miles de partículas — muy eficiente.
 */

import * as THREE from 'three';

const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 64;
const FONT_SIZE = 48;
const SPREAD_RADIUS = 200;
const ASSEMBLE_DURATION = 1.5;  // Segundos para ensamblarse
const PLANE_SCALE = 2.5;       // Escala del grupo final

// Colores de partículas (brillantes para activar bloom)
const PARTICLE_COLORS = [
    new THREE.Color(0xFF1561),
    new THREE.Color(0x14FF9D),
    new THREE.Color(0x14D4FF),
    new THREE.Color(0xFFF014),
    new THREE.Color(0xFF9D14),
];

// Shader de vértice — interpola entre posición random y posición target
const vertexShader = `
    attribute vec3 startPosition;
    attribute vec3 targetPosition;
    attribute float delay;
    attribute vec3 particleColor;
    
    uniform float uProgress;
    uniform float uTime;
    uniform float uPointSize;
    uniform float uTurbulence;
    
    varying vec3 vColor;
    varying float vAlpha;
    
    void main() {
        vColor = particleColor;
        
        // Progreso individual (con delay por partícula)
        float p = clamp((uProgress - delay) / (1.0 - delay), 0.0, 1.0);
        
        // Easing: smoothstep para entrada suave
        p = p * p * (3.0 - 2.0 * p);
        
        // Interpolar posición
        vec3 pos = mix(startPosition, targetPosition, p);
        
        // Turbulencia cuando ya está ensamblado
        if (p > 0.9) {
            float turb = (p - 0.9) * 10.0; // 0→1 en el último 10%
            pos.x += sin(uTime * 2.0 + targetPosition.y * 0.1) * uTurbulence * turb;
            pos.y += cos(uTime * 1.5 + targetPosition.x * 0.1) * uTurbulence * 0.75 * turb;
        }
        
        // Alpha: fade in durante ensamblaje
        vAlpha = smoothstep(0.0, 0.3, p);
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        // Tamaño de punto basado en distancia
        gl_PointSize = uPointSize * (300.0 / -mvPosition.z);
    }
`;

// Shader de fragmento — puntos circulares con glow
const fragmentShader = `
    varying vec3 vColor;
    varying float vAlpha;
    
    void main() {
        // Punto circular suave
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        if (dist > 0.5) discard;
        
        // Glow: más brillante en el centro
        float glow = 1.0 - dist * 2.0;
        glow = pow(glow, 1.5);
        
        gl_FragColor = vec4(vColor * glow * 1.5, vAlpha * glow);
    }
`;

export class ParticleFontRenderer {

    constructor() {
        this.ready = true;
        this._canvas = document.createElement('canvas');
        this._canvas.width = CANVAS_WIDTH;
        this._canvas.height = CANVAS_HEIGHT;
        this._ctx = this._canvas.getContext('2d');
        this._colorIndex = 0;

        // Parámetros expuestos para GUI debug
        this.particleCount = 1500;
        this.spreadRadius = SPREAD_RADIUS;
        this.assembleDuration = ASSEMBLE_DURATION;
        this.planeScale = PLANE_SCALE;
        this.pointSize = 4.0;
        this.turbulenceAmount = 2.0;
    }

    /**
     * @param {string} str - Texto a renderizar
     * @returns {THREE.Group} Grupo con el sistema de partículas
     */
    createMesh(str) {
        // Paso 1: Renderizar texto en canvas para muestrear posiciones
        const ctx = this._ctx;
        const canvas = this._canvas;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = `bold ${FONT_SIZE}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(str, canvas.width / 2, canvas.height / 2);

        // Paso 2: Muestrear posiciones de píxeles blancos
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const positions = [];

        for (let y = 0; y < canvas.height; y += 2) {
            for (let x = 0; x < canvas.width; x += 2) {
                const idx = (y * canvas.width + x) * 4;
                if (pixels[idx + 3] > 128) {
                    // Centrar coordenadas
                    positions.push(
                        (x - canvas.width / 2) * this.planeScale,
                        -(y - canvas.height / 2) * this.planeScale,
                        0
                    );
                }
            }
        }

        // Paso 3: Seleccionar N posiciones target al azar
        const targetCount = Math.min(this.particleCount, positions.length / 3);
        const selectedTargets = [];
        const indices = [...Array(positions.length / 3).keys()];

        // Shuffle y tomar las primeras N
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        for (let i = 0; i < targetCount; i++) {
            const idx = indices[i] * 3;
            selectedTargets.push(positions[idx], positions[idx + 1], positions[idx + 2]);
        }

        // Paso 4: Crear geometría de partículas
        const geometry = new THREE.BufferGeometry();
        const startPositions = new Float32Array(targetCount * 3);
        const targetPositions = new Float32Array(selectedTargets);
        const delays = new Float32Array(targetCount);
        const colors = new Float32Array(targetCount * 3);

        const baseColor = PARTICLE_COLORS[this._colorIndex % PARTICLE_COLORS.length];
        this._colorIndex++;

        for (let i = 0; i < targetCount; i++) {
            // Posición inicial: dispersa alrededor del centro
            startPositions[i * 3] = (Math.random() - 0.5) * this.spreadRadius;
            startPositions[i * 3 + 1] = (Math.random() - 0.5) * this.spreadRadius;
            startPositions[i * 3 + 2] = (Math.random() - 0.5) * this.spreadRadius * 0.5;

            // Delay: cada partícula empieza en un momento diferente
            delays[i] = Math.random() * 0.6;

            // Color con variación
            const variation = 0.7 + Math.random() * 0.3;
            colors[i * 3] = baseColor.r * variation;
            colors[i * 3 + 1] = baseColor.g * variation;
            colors[i * 3 + 2] = baseColor.b * variation;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(targetPositions, 3));
        geometry.setAttribute('startPosition', new THREE.BufferAttribute(startPositions, 3));
        geometry.setAttribute('targetPosition', new THREE.BufferAttribute(targetPositions, 3));
        geometry.setAttribute('delay', new THREE.BufferAttribute(delays, 1));
        geometry.setAttribute('particleColor', new THREE.BufferAttribute(colors, 3));

        // Paso 5: Material con shaders custom
        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uProgress: { value: 0.0 },
                uTime: { value: 0.0 },
                uPointSize: { value: this.pointSize },
                uTurbulence: { value: this.turbulenceAmount }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const points = new THREE.Points(geometry, material);
        // Layer 0 — pasa por bloom para glow real

        const container = new THREE.Group();
        container.add(points);
        container.userData.particleMaterial = material;
        container.userData.assembleDuration = this.assembleDuration;
        return container;
    }

    /** Actualización por frame (progreso de ensamblaje + turbulencia) */
    updateEntry(entry, dt) {
        const material = entry.group.userData.particleMaterial;
        if (!material) return;

        const assembleDuration = entry.group.userData.assembleDuration;

        // Progreso de ensamblaje (0→1 en los primeros N segundos)
        const progress = Math.min(entry.age / assembleDuration, 1.0);
        material.uniforms.uProgress.value = progress;
        material.uniforms.uTime.value = entry.age;
    }
}
