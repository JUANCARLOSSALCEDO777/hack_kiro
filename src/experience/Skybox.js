/**
 * Skybox.js — Cielo envolvente con color animado
 * 
 * Un cilindro invertido (caras hacia adentro) que sigue a la cámara.
 * El color cambia cíclicamente entre azul y magenta usando HSL.
 */

import * as THREE from 'three';

export class Skybox {

    constructor(view, player) {

        this.cameraPosition = player.camera.position;

        // Geometría: cilindro con tapa arriba, abierto abajo
        const geometry = new THREE.CylinderGeometry(1280, 1280, 1280, 16, 1, true);

        // Material
        const material = new THREE.MeshBasicMaterial({
            color: 0xFF0000,
            side: THREE.BackSide,
            fog: false  // Sin niebla para que sea visible como fondo
        });

        this.color = material.color;
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.name = 'skybox';
        this.mesh.renderOrder = -1;  // Renderizar antes que todo (fondo)
        this.mesh.visible = true;

        view.scene.add(this.mesh);
    }

    update(state) {

        // Seguir la cámara (el cielo siempre está centrado en el jugador)
        this.mesh.position.copy(this.cameraPosition);

        // Ciclo de color: oscila entre hue 0.6 (azul) y 0.95 (magenta)
        // Lightness base bajo + pulso por beat
        let colorPhase = (state.time * 0.3) % 2;
        if (colorPhase > 1) colorPhase = 1 - (colorPhase - 1);

        const baseLightness = 0.04;
        const pulse = state.skyboxPulse || 0;
        const lightness = baseLightness + pulse * 0.12;

        this.color.setHSL(0.6 + colorPhase * 0.35, 0.8, lightness);
    }
}
