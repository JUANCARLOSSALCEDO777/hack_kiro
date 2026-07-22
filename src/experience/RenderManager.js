/**
 * RenderManager.js — Inicialización del renderer WebGL
 *
 * Crea el renderer, lo dimensiona al container proporcionado,
 * y lo monta dentro de ese container.
 * Usa ResizeObserver para responder a cambios de tamaño del container.
 */

import * as THREE from 'three';

export class RenderManager {

    /**
     * @param {HTMLElement} container - Elemento DOM donde se monta el canvas WebGL
     */
    constructor(container) {
        this.container = container;

        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance'
        });

        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.autoClear = false;
        this.renderer.setClearColor(0x000000, 1);

        container.appendChild(this.renderer.domElement);

        // Observar cambios de tamaño del container en lugar de window resize
        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(container);
    }

    onResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.renderer.setSize(w, h);
    }

    /**
     * Libera recursos: desconecta el observer y dispone el renderer WebGL
     */
    dispose() {
        this.resizeObserver.disconnect();
        this.renderer.dispose();
    }
}
