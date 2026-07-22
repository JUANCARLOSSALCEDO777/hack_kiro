/**
 * Player.js — Control de cámara en primera persona
 * Equivalente a: js/lights/experience/Player.js
 * 
 * La cámara avanza automáticamente sobre el terreno.
 * El mouse controla dirección (izq/der) e inclinación (arriba/abajo).
 * Click = turbo (acelerar).
 * Se aplica roll (inclinación lateral) al girar.
 */

import * as THREE from 'three';
import { Config } from '../Config.js';

const RAD90 = Math.PI / 2;
const RAD180 = Math.PI;

export class Player {

    constructor(view) {

        this.camera = view.camera;

        // Movimiento
        this.angle = 0;
        this.forward = new THREE.Vector2(0, -1);
        this.right = new THREE.Vector2(1, 0);
        this.velocity = Config.player.initialVelocity;
        this.altitude = Config.player.initialAltitude;
        this.turbo = 1;

        // Cámara
        this.roll = 0;
        this.tilt = 0;
        this.targetDistance = 150;

        // Helpers
        this.cameraUp = new THREE.Vector3();
        this.rollAxis = new THREE.Vector3();
        this.auxMatrix = new THREE.Matrix4();
        this.targetPosition = new THREE.Vector3(0, 60, -100);

        // Posición inicial
        this.camera.position.set(0, this.altitude, 0);

        // Input
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseDown = false;

        this.setupInput();
    }

    setupInput() {

        const halfW = () => window.innerWidth / 2;
        const halfH = () => window.innerHeight / 2;

        // Almacenar referencias para poder removerlos en dispose()
        this._onMouseMove = (e) => {
            // Normalizado: -1 a +1 desde el centro
            this.mouseX = (e.clientX - halfW()) / halfW();
            this.mouseY = (e.clientY - halfH()) / halfH();
        };

        this._onMouseDown = () => { this.mouseDown = true; };
        this._onMouseUp = () => { this.mouseDown = false; };

        // Touch
        this._onTouchMove = (e) => {
            const touch = e.touches[0];
            this.mouseX = (touch.clientX - halfW()) / halfW();
            this.mouseY = (touch.clientY - halfH()) / halfH();
        };

        this._onTouchStart = () => { this.mouseDown = true; };
        this._onTouchEnd = () => { this.mouseDown = false; };

        // Registrar handlers
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
        window.addEventListener('touchmove', this._onTouchMove);
        window.addEventListener('touchstart', this._onTouchStart);
        window.addEventListener('touchend', this._onTouchEnd);
    }

    dispose() {
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
        window.removeEventListener('touchmove', this._onTouchMove);
        window.removeEventListener('touchstart', this._onTouchStart);
        window.removeEventListener('touchend', this._onTouchEnd);
    }

    update(state) {

        const dt = state.deltaTime;

        // Turbo (click para acelerar)
        if (this.mouseDown) {
            this.turbo -= (this.turbo - Config.player.turboMultiplier) * dt * 4;
        } else {
            this.turbo -= (this.turbo - 1) * dt * 2;
        }

        // Girar
        this.angle -= this.mouseX * this.turbo * dt * this.velocity * 0.001;

        // Avanzar
        const move = dt * this.velocity * this.turbo;
        this.camera.position.x += this.forward.x * move;
        this.camera.position.y = this.altitude;
        this.camera.position.z += this.forward.y * move;

        // Target (hacia dónde mira la cámara)
        this.targetPosition.x = this.camera.position.x - Math.sin(this.angle) * this.targetDistance;
        this.targetPosition.y = this.camera.position.y;
        this.targetPosition.z = this.camera.position.z - Math.cos(this.angle) * this.targetDistance;

        // Roll (inclinación lateral al girar)
        this.roll -= (this.roll - (this.mouseX * this.velocity * 0.001)) * dt * 0.3 * this.turbo;
        this.rollAxis.subVectors(this.camera.position, this.targetPosition).normalize();
        this.cameraUp.set(0, 1, 0);
        this.auxMatrix.makeRotationAxis(this.rollAxis, -this.roll);
        this.cameraUp.applyMatrix4(this.auxMatrix);

        // LookAt con roll
        this.camera.matrix.lookAt(this.camera.position, this.targetPosition, this.cameraUp);

        // Tilt (inclinación vertical con el mouse Y)
        this.tilt -= (this.tilt + this.mouseY * this.velocity * 0.0005) * dt * 2;
        this.auxMatrix.makeRotationX(this.tilt);
        this.camera.matrix.multiply(this.auxMatrix);

        // Aplicar posición a la matrix
        this.camera.matrix.setPosition(this.camera.position);
        this.camera.matrixAutoUpdate = false;
        this.camera.matrixWorldNeedsUpdate = true;

        // Actualizar vectores de dirección
        this.forward.x = -Math.sin(this.angle);
        this.forward.y = -Math.cos(this.angle);

        this.right.x = -Math.sin(this.angle + RAD90);
        this.right.y = -Math.cos(this.angle + RAD90);
    }
}
