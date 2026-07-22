/**
 * RenderManager.js — Inicialización del renderer WebGL
 * Equivalente a: js/lights/experience/RenderManager.js
 * 
 * Crea el renderer, lo dimensiona a pantalla completa,
 * y lo monta en el DOM.
 */

import * as THREE from 'three';

export class RenderManager {

    constructor() {

        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance'
        });

        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.autoClear = false;
        this.renderer.setClearColor(0x000000, 1);

        document.body.appendChild(this.renderer.domElement);

        window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
