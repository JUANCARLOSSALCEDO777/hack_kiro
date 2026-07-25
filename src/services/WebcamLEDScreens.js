/**
 * WebcamLEDScreens.js — Captura webcam + pantallas LED de partículas 3D
 *
 * Captura frames de la webcam a baja frecuencia, muestrea colores en un grid,
 * y los muestra como nubes de dots (Points) distribuidas alrededor de la escena.
 * Cada 7 segundos los dots se dispersan y reensamblan (animación cíclica).
 */

import * as THREE from 'three';

// ─── Shaders ─────────────────────────────────────────────────────────────────

const vertexShader = `
    attribute vec3 targetPosition;
    attribute vec3 startPosition;
    attribute vec3 dotColor;
    attribute float delay;
    attribute float vignetteAlpha;

    uniform float uProgress;
    uniform float uTime;
    uniform float uPointSize;

    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        vColor = dotColor;

        // Progreso individual: cada dot tiene un delay fuerte (0 a 0.85)
        // El dot no empieza a moverse hasta que uProgress supera su delay
        // Luego tarda un 15% del tiempo total en llegar (transición rápida)
        float dotStart = delay * 0.85; // Rango de delay: 0 a 0.85
        float dotDuration = 0.15;      // Cada dot se mueve rápido una vez que arranca
        float p = clamp((uProgress - dotStart) / dotDuration, 0.0, 1.0);

        // Easing: ease-out cúbico para llegada suave
        p = 1.0 - pow(1.0 - p, 3.0);

        // Interpolar entre posición dispersa y posición target en el grid
        vec3 pos = mix(startPosition, targetPosition, p);

        // Turbulencia sutil cuando está ensamblado
        if (p > 0.95) {
            float turb = (p - 0.95) * 20.0;
            pos.x += sin(uTime * 1.5 + targetPosition.y * 0.05) * 1.5 * turb;
            pos.y += cos(uTime * 1.2 + targetPosition.x * 0.05) * 1.0 * turb;
        }

        // Alpha: invisible hasta que empieza, fade in rápido
        vAlpha = smoothstep(0.0, 0.3, p) * vignetteAlpha;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uPointSize * (300.0 / -mvPosition.z);
    }
`;

const fragmentShader = `
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        // Punto circular
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        if (dist > 0.5) discard;

        // Glow suave en el centro
        float glow = 1.0 - dist * 2.0;
        glow = pow(glow, 1.3);

        gl_FragColor = vec4(vColor * glow * 1.3, vAlpha * glow);
    }
`;

// ─── Clase principal ─────────────────────────────────────────────────────────

export class WebcamLEDScreens {

    constructor(scene, player, config) {
        this._scene = scene;
        this._player = player;
        this._config = config;

        this._active = false;
        this._video = null;
        this._stream = null;

        // Canvas auxiliar para capturar frames del video
        this._captureCanvas = null;
        this._captureCtx = null;

        // Buffer circular de pantallas (ahora son Points, no planos)
        this._screens = [];
        this._bufferIndex = 0;
        this._lastCaptureTime = 0;

        // Animación cíclica de dispersión/ensamblaje
        this._cycleTime = 0;
        this._cycleDuration = 7; // Segundos por ciclo completo
        this._assembleDuration = 4.0; // Segundos para ensamblarse (largo para ver la secuencia)

        // Beat reaction — activado por defecto
        this._beatPaused = false;
        this._enabled = true;

        // Pausa por visibilidad del tab
        this._paused = false;
        this._visibilityHandler = null;
    }

    // ─── Interfaz pública ────────────────────────────────────────────────────────

    async init() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.info('[WebcamLED] getUserMedia no soportado, pantallas desactivadas');
            return;
        }

        try {
            this._stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 320 }, height: { ideal: 240 } }
            });

            this._video = document.createElement('video');
            this._video.srcObject = this._stream;
            this._video.muted = true;
            this._video.playsInline = true;
            await this._video.play();

            this._captureCanvas = document.createElement('canvas');
            this._captureCanvas.width = 320;
            this._captureCanvas.height = 240;
            this._captureCtx = this._captureCanvas.getContext('2d');

            this._createScreens();
            this._active = true;

            this._visibilityHandler = () => { this._paused = document.hidden; };
            document.addEventListener('visibilitychange', this._visibilityHandler);

        } catch (err) {
            console.info('[WebcamLED] Permiso de cámara denegado o error:', err.message);
            this._active = false;
        }
    }

    update(state) {
        if (!this._active || this._paused || !this._enabled) return;

        const dt = state.deltaTime;
        const now = performance.now();

        // Captura periódica de frames
        if (now - this._lastCaptureTime >= this._config.frameInterval) {
            this._lastCaptureTime = now;
            const frame = this._captureFrame();
            if (frame) {
                this._updateColors(frame);
            }
        }

        // Animación cíclica de dispersión/ensamblaje
        this._cycleTime += dt;
        const cycleProgress = this._cycleTime % this._cycleDuration;

        // Fase de ensamblaje: primeros _assembleDuration segundos del ciclo
        // Fase estable: el resto del ciclo
        let progress;
        if (cycleProgress < this._assembleDuration) {
            progress = cycleProgress / this._assembleDuration; // 0→1
        } else {
            progress = 1.0; // Ensamblado, estable
        }

        // Actualizar uniforms de todas las pantallas
        for (const screen of this._screens) {
            screen.material.uniforms.uProgress.value = progress;
            screen.material.uniforms.uTime.value = this._cycleTime;
        }

        // Regenerar posiciones de dispersión al inicio de cada ciclo
        if (cycleProgress < dt * 2) {
            this._regenerateStartPositions();
        }

        // Seguir la posición del jugador
        if (this._player && this._player.camera) {
            const px = this._player.camera.position.x;
            const pz = this._player.camera.position.z;
            const { screenCount, screenRadius, screenAltitude } = this._config;

            for (let i = 0; i < this._screens.length; i++) {
                const angle = (i / screenCount) * Math.PI * 2;
                const points = this._screens[i].points;
                points.position.x = px + Math.cos(angle) * screenRadius;
                points.position.z = pz + Math.sin(angle) * screenRadius;
                points.lookAt(px, screenAltitude, pz);
            }
        }

        // Beat reaction
        for (const screen of this._screens) {
            if (state.skyboxPulse > 0 && !this._beatPaused) {
                const scale = 1 + state.skyboxPulse * 0.05;
                screen.points.scale.setScalar(scale);
            } else {
                screen.points.scale.setScalar(1);
            }
        }
    }

    _toggleWebcam() {
        if (this._active) {
            this.dispose();
        } else {
            this.init();
        }
    }

    dispose() {
        if (this._stream) {
            this._stream.getTracks().forEach(track => track.stop());
            this._stream = null;
        }

        if (this._video) {
            this._video.srcObject = null;
            this._video = null;
        }

        for (const screen of this._screens) {
            this._scene.remove(screen.points);
            screen.geometry.dispose();
            screen.material.dispose();
        }
        this._screens = [];

        this._captureCanvas = null;
        this._captureCtx = null;

        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }

        this._active = false;
    }

    // ─── Captura ─────────────────────────────────────────────────────────────────

    _captureFrame() {
        if (!this._video || this._video.readyState < 2) return null;
        this._captureCtx.drawImage(this._video, 0, 0, 320, 240);
        return this._captureCanvas;
    }

    // ─── Actualizar colores de los dots con el frame actual ──────────────────────

    _updateColors(sourceCanvas) {
        const { gridWidth, gridHeight, vignetteIntensity } = this._config;
        const srcCtx = sourceCanvas.getContext('2d');
        const srcW = sourceCanvas.width;
        const srcH = sourceCanvas.height;
        const imageData = srcCtx.getImageData(0, 0, srcW, srcH);
        const pixels = imageData.data;

        const srcCellW = srcW / gridWidth;
        const srcCellH = srcH / gridHeight;

        // Rotar buffer — actualizar la siguiente pantalla
        this._bufferIndex = (this._bufferIndex + 1) % this._screens.length;
        const screen = this._screens[this._bufferIndex];
        const colorAttr = screen.geometry.getAttribute('dotColor');
        const colors = colorAttr.array;

        let idx = 0;
        for (let row = 0; row < gridHeight; row++) {
            for (let col = 0; col < gridWidth; col++) {
                // Viñeta elíptica — saltar dots fuera de la elipse
                const nx = (col / (gridWidth - 1)) * 2 - 1;
                const ny = (row / (gridHeight - 1)) * 2 - 1;
                const ellipseDist = nx * nx + ny * ny;
                const alpha = Math.max(0, 1 - ellipseDist * vignetteIntensity);

                if (alpha <= 0) {
                    idx++;
                    continue;
                }

                // Muestrear color promedio de la celda
                const srcX = Math.floor(col * srcCellW);
                const srcY = Math.floor(row * srcCellH);
                const srcEndX = Math.floor((col + 1) * srcCellW);
                const srcEndY = Math.floor((row + 1) * srcCellH);

                let r = 0, g = 0, b = 0, count = 0;
                for (let y = srcY; y < srcEndY; y++) {
                    for (let x = srcX; x < srcEndX; x++) {
                        const pi = (y * srcW + x) * 4;
                        r += pixels[pi];
                        g += pixels[pi + 1];
                        b += pixels[pi + 2];
                        count++;
                    }
                }

                if (count > 0) {
                    colors[idx * 3] = (r / count) / 255;
                    colors[idx * 3 + 1] = (g / count) / 255;
                    colors[idx * 3 + 2] = (b / count) / 255;
                }

                idx++;
            }
        }

        colorAttr.needsUpdate = true;
    }

    // ─── Regenerar posiciones de dispersión (al inicio de cada ciclo) ────────────

    /** Modo de patrón actual para la animación de generación */
    get patternMode() { return this._patternMode || 'rings'; }
    set patternMode(v) { this._patternMode = v; }

    _regenerateStartPositions() {
        const { screenWidth, screenHeight, gridWidth, gridHeight } = this._config;
        const ringRadius = Math.max(screenWidth, screenHeight) * 2.5;

        for (const screen of this._screens) {
            const startAttr = screen.geometry.getAttribute('startPosition');
            const delayAttr = screen.geometry.getAttribute('delay');
            const arr = startAttr.array;
            const delayArr = delayAttr.array;
            const dotCount = arr.length / 3;

            for (let i = 0; i < dotCount; i++) {
                const row = Math.floor(i / gridWidth);
                const col = i % gridWidth;
                const normalizedIdx = i / dotCount;
                const pos = this._getPatternPosition(normalizedIdx, row, col, gridWidth, gridHeight, ringRadius);
                arr[i * 3] = pos[0];
                arr[i * 3 + 1] = pos[1];
                arr[i * 3 + 2] = pos[2];

                // Delay coherente con el patrón
                delayArr[i] = this._getPatternDelay(row, col, gridWidth, gridHeight);
            }

            startAttr.needsUpdate = true;
            delayAttr.needsUpdate = true;
        }
    }

    /**
     * Calcula el delay de cada dot según el patrón activo.
     * Controla el orden en que los dots llegan a su posición final.
     * Valor entre 0 y ~0.7 (0 = llega primero, 0.7 = llega último).
     */
    _getPatternDelay(row, col, gridWidth, gridHeight) {
        const nx = col / (gridWidth - 1);  // 0 a 1
        const ny = row / (gridHeight - 1); // 0 a 1

        switch (this._patternMode || 'rings') {

            case 'rings':
                // Desde afuera hacia adentro (filas externas primero)
                return Math.abs(ny - 0.5) * 1.2;

            case 'vortex':
                // Angular: se arma girando en sentido horario
                return ((nx + ny * 0.3) % 1.0) * 0.65;

            case 'flower':
                // Pétalos se llenan desde las puntas hacia el centro
                return (1 - Math.abs(ny - 0.5) * 2) * 0.6;

            case 'helix':
                // Alternando filas pares/impares
                return (row % 2 === 0 ? nx : (1 - nx)) * 0.6;

            case 'starburst':
                // Desde el centro hacia las puntas de los rayos
                const distCenter = Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2);
                return distCenter * 1.2;

            case 'diamond':
                // Distancia Manhattan desde el centro (rombo)
                return (Math.abs(nx - 0.5) + Math.abs(ny - 0.5)) * 0.7;

            case 'tunnel':
                // Desde el frente (fila central) hacia atrás
                return ny * 0.65;

            case 'galaxy':
                // Brazos se llenan desde el centro hacia afuera
                const galDist = Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2);
                return galDist * 1.1;

            case 'spiral':
                // Secuencial siguiendo la espiral
                return (col * gridHeight + row) / (gridWidth * gridHeight) * 0.65;

            case 'wave':
                // Ola de izquierda a derecha
                return nx * 0.65;

            case 'explosion':
                // Todo a la vez pero con variación por distancia
                const expDist = Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2);
                return expDist * 0.5;

            default:
                return 0;
        }
    }
    /**
     * Calcula la posición de dispersión según el patrón seleccionado.
     * Todos los patrones son determinísticos (no random) para verse ordenados.
     */
    _getPatternPosition(normalizedIdx, row, col, gridWidth, gridHeight, radius) {
        switch (this._patternMode || 'rings') {

            case 'rings': {
                // Anillos concéntricos: cada fila del grid es un anillo
                const ringAngle = (col / gridWidth) * Math.PI * 2;
                const ringR = radius * (0.4 + (row / gridHeight) * 0.6);
                return [
                    Math.cos(ringAngle) * ringR,
                    Math.sin(ringAngle) * ringR * 0.5,
                    (row / gridHeight - 0.5) * radius * 0.3
                ];
            }

            case 'vortex': {
                // Vórtice: anillos con desfase angular progresivo (tornado plano)
                const vortexAngle = (col / gridWidth) * Math.PI * 2 + (row / gridHeight) * Math.PI * 3;
                const vortexR = radius * 0.9;
                return [
                    Math.cos(vortexAngle) * vortexR,
                    Math.sin(vortexAngle) * vortexR * 0.6,
                    (row / gridHeight - 0.5) * radius * 0.15
                ];
            }

            case 'flower': {
                // Flor/pétalos: rosa polar con 5 lóbulos concéntricos
                const petalAngle = (col / gridWidth) * Math.PI * 2;
                const petals = 5;
                const petalR = radius * (0.5 + 0.5 * Math.abs(Math.cos(petalAngle * petals / 2)));
                const layerOffset = (row / gridHeight) * 0.4;
                return [
                    Math.cos(petalAngle) * petalR * (0.6 + layerOffset),
                    Math.sin(petalAngle) * petalR * (0.6 + layerOffset) * 0.6,
                    (row / gridHeight - 0.5) * radius * 0.2
                ];
            }

            case 'helix': {
                // Hélice doble: dos espirales entrelazadas
                const helixAngle = (col / gridWidth) * Math.PI * 2;
                const strand = row % 2 === 0 ? 1 : -1;
                const helixR = radius * (0.5 + (row / gridHeight) * 0.4);
                const zSpread = (row / gridHeight - 0.5) * radius * 0.6;
                return [
                    Math.cos(helixAngle + zSpread * 0.008 * strand) * helixR,
                    Math.sin(helixAngle + zSpread * 0.008 * strand) * helixR * 0.5,
                    zSpread * strand * 0.3
                ];
            }

            case 'starburst': {
                // Estrella/sol: rayos rectos desde el centro
                const numRays = 12;
                const rayIdx = col % numRays;
                const rayAngle = (rayIdx / numRays) * Math.PI * 2;
                const rayDist = radius * (0.2 + normalizedIdx * 1.2);
                const spread = (col / gridWidth - 0.5) * 0.15;
                return [
                    Math.cos(rayAngle + spread) * rayDist,
                    Math.sin(rayAngle + spread) * rayDist * 0.55,
                    (row / gridHeight - 0.5) * radius * 0.1
                ];
            }

            case 'diamond': {
                // Diamante: rombo concéntrico (distancia Manhattan)
                const dx = (col / gridWidth - 0.5) * 2;
                const dy = (row / gridHeight - 0.5) * 2;
                const diamondDist = (Math.abs(dx) + Math.abs(dy));
                const diamondAngle = Math.atan2(dy, dx);
                const diamondR = radius * diamondDist * 0.9;
                return [
                    Math.cos(diamondAngle) * diamondR,
                    Math.sin(diamondAngle) * diamondR * 0.6,
                    (diamondDist - 1) * radius * 0.2
                ];
            }

            case 'tunnel': {
                // Túnel cilíndrico que colapsa hacia un plano
                const tunnelAngle = (col / gridWidth) * Math.PI * 2;
                const tunnelR = radius * 0.7;
                const depth = (row / gridHeight - 0.5) * radius * 2;
                return [
                    Math.cos(tunnelAngle) * tunnelR,
                    Math.sin(tunnelAngle) * tunnelR * 0.5,
                    depth
                ];
            }

            case 'galaxy': {
                // Galaxia: brazos espirales con twist progresivo
                const arms = 3;
                const armAngle = (col / gridWidth) * Math.PI * 2;
                const armOffset = Math.floor(col * arms / gridWidth) * (Math.PI * 2 / arms);
                const galaxyR = radius * (0.2 + normalizedIdx * 0.9);
                const twist = galaxyR * 0.005;
                return [
                    Math.cos(armAngle + armOffset + twist) * galaxyR,
                    Math.sin(armAngle + armOffset + twist) * galaxyR * 0.5,
                    (row / gridHeight - 0.5) * radius * 0.1
                ];
            }

            case 'spiral': {
                // Espiral uniforme
                const angle = normalizedIdx * Math.PI * 6 + row * 0.1;
                const r = radius * (0.7 + normalizedIdx * 0.3);
                return [
                    Math.cos(angle) * r,
                    Math.sin(angle) * r * 0.5,
                    (normalizedIdx - 0.5) * radius * 0.4
                ];
            }

            case 'wave': {
                // Onda sinusoidal 3D
                const x = (col / gridWidth - 0.5) * radius * 2;
                const wavePhase = normalizedIdx * Math.PI * 4;
                const y = Math.sin(wavePhase) * radius * 0.8;
                const z = Math.cos(wavePhase) * radius * 0.4;
                return [x, y, z];
            }

            case 'explosion': {
                // Explosión radial desde el centro
                const angle = normalizedIdx * Math.PI * 2 * 7;
                const dist = radius * (1.0 + normalizedIdx * 1.5);
                const elevation = (row / gridHeight - 0.5) * radius;
                return [
                    Math.cos(angle) * dist * 0.8,
                    elevation,
                    Math.sin(angle) * dist * 0.3
                ];
            }

            default:
                return [0, 0, 0];
        }
    }

    // ─── Crear pantallas como sistemas de Points ─────────────────────────────────

    _createScreens() {
        const {
            screenCount, screenRadius, screenWidth, screenHeight,
            screenAltitude, gridWidth, gridHeight, vignetteIntensity
        } = this._config;

        const dotCount = gridWidth * gridHeight;

        for (let i = 0; i < screenCount; i++) {
            const angle = (i / screenCount) * Math.PI * 2;

            // Crear arrays de atributos
            const targetPositions = new Float32Array(dotCount * 3);
            const startPositions = new Float32Array(dotCount * 3);
            const colors = new Float32Array(dotCount * 3);
            const delays = new Float32Array(dotCount);
            const vignetteAlphas = new Float32Array(dotCount);

            const cellW = screenWidth / gridWidth;
            const cellH = screenHeight / gridHeight;
            const ringRadius = Math.max(screenWidth, screenHeight) * 2.5;

            let idx = 0;
            for (let row = 0; row < gridHeight; row++) {
                for (let col = 0; col < gridWidth; col++) {
                    // Posición target: grid centrado en el origen local del Points
                    const tx = (col - gridWidth / 2) * cellW + cellW / 2;
                    const ty = -(row - gridHeight / 2) * cellH - cellH / 2;
                    const tz = 0;

                    targetPositions[idx * 3] = tx;
                    targetPositions[idx * 3 + 1] = ty;
                    targetPositions[idx * 3 + 2] = tz;

                    // Posición inicial: espiral ordenada desde un anillo grande
                    const normalizedIdx = idx / dotCount;
                    const spiralAngle = normalizedIdx * Math.PI * 6 + row * 0.1;
                    const radiusVariation = ringRadius * (0.7 + normalizedIdx * 0.3);

                    startPositions[idx * 3] = Math.cos(spiralAngle) * radiusVariation;
                    startPositions[idx * 3 + 1] = Math.sin(spiralAngle) * radiusVariation * 0.5;
                    startPositions[idx * 3 + 2] = (normalizedIdx - 0.5) * ringRadius * 0.4;

                    // Color inicial gris oscuro
                    colors[idx * 3] = 0.1;
                    colors[idx * 3 + 1] = 0.1;
                    colors[idx * 3 + 2] = 0.1;

                    // Delay coherente con el patrón (se arma por zonas)
                    delays[idx] = this._getPatternDelay(row, col, gridWidth, gridHeight);

                    // Viñeta elíptica
                    const nx = (col / (gridWidth - 1)) * 2 - 1;
                    const ny = (row / (gridHeight - 1)) * 2 - 1;
                    const ellipseDist = nx * nx + ny * ny;
                    vignetteAlphas[idx] = Math.max(0, 1 - ellipseDist * vignetteIntensity);

                    idx++;
                }
            }

            // Geometría
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(targetPositions.slice(), 3));
            geometry.setAttribute('targetPosition', new THREE.BufferAttribute(targetPositions, 3));
            geometry.setAttribute('startPosition', new THREE.BufferAttribute(startPositions, 3));
            geometry.setAttribute('dotColor', new THREE.BufferAttribute(colors, 3));
            geometry.setAttribute('delay', new THREE.BufferAttribute(delays, 1));
            geometry.setAttribute('vignetteAlpha', new THREE.BufferAttribute(vignetteAlphas, 1));

            // Material con shaders
            const material = new THREE.ShaderMaterial({
                vertexShader,
                fragmentShader,
                uniforms: {
                    uProgress: { value: 0.0 },
                    uTime: { value: 0.0 },
                    uPointSize: { value: 41.0 }
                },
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                fog: false
            });

            const points = new THREE.Points(geometry, material);
            points.position.set(
                Math.cos(angle) * screenRadius,
                screenAltitude,
                Math.sin(angle) * screenRadius
            );
            points.lookAt(0, screenAltitude, 0);
            points.renderOrder = 10;
            points.frustumCulled = false;

            this._scene.add(points);
            this._screens.push({ points, geometry, material });
        }
    }
}
