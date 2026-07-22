/**
 * View.js — Cámara, escena, niebla y post-procesado
 * Equivalente a: js/lights/experience/View.js
 * 
 * Pipeline de render:
 * 1. Renderizar escena principal (layer 0) a textura
 * 2. Bloom sobre layer 0
 * 3. Viñeta
 * 4. Renderizar layer 1 (textos) encima sin bloom
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Config } from '../Config.js';

// Layer para objetos que no pasan por bloom (textos)
export const NO_BLOOM_LAYER = 1;

// Shader de viñeta (oscurece los bordes de la pantalla)
const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.3 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float intensity;
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec2 coords = (vUv - 0.5) * 2.0;
            float vignette = 1.0 - dot(coords, coords) * intensity;
            gl_FragColor = texel * vignette;
        }
    `
};

export class View {

    constructor(renderManager) {

        this.renderer = renderManager.renderer;
        this.container = renderManager.container;

        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        // Camera — ve layers 0 y 1
        this.camera = new THREE.PerspectiveCamera(
            Config.player.initialFov,
            w / h,
            1, 1600
        );
        this.camera.layers.enable(NO_BLOOM_LAYER);

        // Scene
        this.scene = new THREE.Scene();
        this.scene.name = 'mainScene';

        if (Config.view.fog) {
            this.scene.fog = new THREE.FogExp2(0x000000, Config.view.fogAmount);
        }

        // Post-processing
        this.setupPostprocessing();
    }

    setupPostprocessing() {

        const { renderer, scene, camera } = this;

        this.composer = new EffectComposer(renderer);

        // Pasada 1: Renderizar escena (solo layer 0 — bloom no ve los textos)
        const renderPass = new RenderPass(scene, camera);
        this.composer.addPass(renderPass);

        // Pasada 2: Bloom (equivalente al blur aditivo del original)
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(w, h),
            1.5,    // strength — intensidad del glow
            0.4,    // radius — dispersión del glow
            0.4     // threshold — bajo para que esferas y partículas brillen
        );
        this.composer.addPass(bloomPass);
        this.bloomPass = bloomPass;

        // Pasada 3: Viñeta
        const vignettePass = new ShaderPass(VignetteShader);
        this.composer.addPass(vignettePass);
    }

    render() {
        // Paso 1: Renderizar escena con bloom (excluye layer 1)
        this.camera.layers.disable(NO_BLOOM_LAYER);
        this.camera.layers.enable(0);
        this.composer.render();

        // Paso 2: Renderizar layer 1 (textos) directamente encima, sin bloom
        this.camera.layers.disable(0);
        this.camera.layers.enable(NO_BLOOM_LAYER);

        this.renderer.autoClear = false;
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.camera);
        this.renderer.autoClear = true;

        // Restaurar cámara a ver ambos layers
        this.camera.layers.enable(0);
    }

    onResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.composer.setSize(w, h);
    }
}
