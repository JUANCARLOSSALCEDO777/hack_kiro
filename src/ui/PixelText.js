/**
 * PixelText.js — Sistema de textos 3D pixel art con BMFont
 * 
 * Carga un bitmap font (atlas PNG + descriptor .fnt), crea meshes de texto
 * que aparecen desde el fondo y se acercan a la cámara.
 * Los textos se leen de un array (futuro: llegan por WebSocket).
 */

import * as THREE from 'three';
import { NO_BLOOM_LAYER } from '../experience/View.js';

// Textos de prueba (futuro: llegan por WebSocket)
const TEST_TEXTS = ['KIRO', 'HACKATHON', 'DISCORD 3D'];

const TEXT_SPEED = 150;
const SPAWN_DISTANCE = 1200;
const DESPAWN_DISTANCE = -50;
const TEXT_SCALE = 8;
const SPAWN_INTERVAL = 4.0;

// Sombra neón
const SHADOW_OFFSET_Z = 5;       // Distancia detrás del texto principal (local Z)
const SHADOW_COLOR = 0x00FFFF;    // Color neón de la sombra (cyan)
const SHADOW_BOB_AMOUNT = 3;      // Amplitud de oscilación en Y
const SHADOW_BOB_SPEED = 2;       // Velocidad de oscilación

export class PixelText {

    constructor(scene, player) {
        this.scene = scene;
        this.player = player;
        this.texts = TEST_TEXTS;
        this.activeTexts = [];
        this.fontData = null;
        this.fontTexture = null;
        this.ready = false;
        this.nextTextIndex = 0;
        this.timeSinceLastSpawn = SPAWN_INTERVAL;
        this.loadFont();
    }

    async loadFont() {
        const textureLoader = new THREE.TextureLoader();
        const rawTexture = await new Promise((resolve) => {
            textureLoader.load('fonts/pixel-font-atlas.png', (tex) => {
                resolve(tex);
            });
        });

        // Procesar textura: convertir píxeles negros/oscuros en transparentes
        this.fontTexture = this.makeBlackTransparent(rawTexture);

        const response = await fetch('fonts/pixel-font-atlas.fnt');
        const text = await response.text();
        this.fontData = this.parseBMFont(text);
        this.ready = true;
    }

    /**
     * Toma una textura cargada y devuelve una nueva textura donde
     * los píxeles oscuros (cercanos a negro) tienen alpha = 0.
     */
    makeBlackTransparent(texture) {
        const image = texture.image;
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Umbral: cualquier píxel con brillo bajo se vuelve transparente
        const threshold = 30;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (r < threshold && g < threshold && b < threshold) {
                data[i + 3] = 0; // alpha = 0
            }
        }

        ctx.putImageData(imageData, 0, 0);

        const newTexture = new THREE.CanvasTexture(canvas);
        newTexture.magFilter = THREE.NearestFilter;
        newTexture.minFilter = THREE.NearestFilter;
        newTexture.needsUpdate = true;
        return newTexture;
    }

    parseBMFont(text) {
        const chars = {};
        let scaleW = 128, scaleH = 128, lineHeight = 11;

        const lines = text.split('\n');
        for (const line of lines) {
            if (line.startsWith('common ')) {
                const sw = line.match(/scaleW=(\d+)/);
                const sh = line.match(/scaleH=(\d+)/);
                const lh = line.match(/lineHeight=(\d+)/);
                if (sw) scaleW = parseInt(sw[1]);
                if (sh) scaleH = parseInt(sh[1]);
                if (lh) lineHeight = parseInt(lh[1]);
            }
            if (line.startsWith('char ')) {
                const id = parseInt(line.match(/id=(\d+)/)[1]);
                const x = parseInt(line.match(/\bx=(\d+)/)[1]);
                const y = parseInt(line.match(/\by=(\d+)/)[1]);
                const w = parseInt(line.match(/width=(\d+)/)[1]);
                const h = parseInt(line.match(/height=(\d+)/)[1]);
                const xo = parseInt(line.match(/xoffset=(-?\d+)/)[1]);
                const yo = parseInt(line.match(/yoffset=(-?\d+)/)[1]);
                const xa = parseInt(line.match(/xadvance=(\d+)/)[1]);
                chars[id] = { x, y, w, h, xo, yo, xa };
            }
        }
        return { chars, scaleW, scaleH, lineHeight };
    }

    createTextMesh(str) {
        const { chars, scaleW, scaleH } = this.fontData;
        const group = new THREE.Group();
        group.name = `pixeltext_${str}`;
        const shadowGroup = new THREE.Group();
        shadowGroup.name = `pixeltext_shadow_${str}`;
        let cursorX = 0;

        for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i);
            const charData = chars[charCode];
            if (!charData) continue;

            const { x, y, w, h, xo, yo, xa } = charData;
            if (w === 0 || h === 0) { cursorX += xa; continue; }

            const geo = new THREE.PlaneGeometry(w * TEXT_SCALE, h * TEXT_SCALE);

            const u0 = x / scaleW;
            const v0 = 1 - y / scaleH;
            const u1 = (x + w) / scaleW;
            const v1 = 1 - (y + h) / scaleH;

            const uvAttr = geo.getAttribute('uv');
            uvAttr.setXY(0, u0, v0);
            uvAttr.setXY(1, u1, v0);
            uvAttr.setXY(2, u0, v1);
            uvAttr.setXY(3, u1, v1);
            uvAttr.needsUpdate = true;

            // Mesh principal (blanco, al frente)
            const mat = new THREE.MeshBasicMaterial({
                map: this.fontTexture,
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide,
                color: 0xFFFFFF,
                fog: false
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.layers.set(NO_BLOOM_LAYER);
            mesh.position.x = (cursorX + xo) * TEXT_SCALE + (w * TEXT_SCALE) / 2;
            mesh.position.y = -yo * TEXT_SCALE - (h * TEXT_SCALE) / 2;
            group.add(mesh);

            // Mesh sombra (cyan, detrás)
            const shadowGeo = geo.clone();
            const shadowMat = new THREE.MeshBasicMaterial({
                map: this.fontTexture,
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide,
                color: SHADOW_COLOR,
                fog: false
            });

            const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
            shadowMesh.layers.set(NO_BLOOM_LAYER); // Sin bloom
            shadowMesh.position.x = mesh.position.x;
            shadowMesh.position.y = mesh.position.y;
            shadowMesh.position.z = SHADOW_OFFSET_Z;
            shadowGroup.add(shadowMesh);

            cursorX += xa;
        }

        const totalWidth = cursorX * TEXT_SCALE;
        group.children.forEach(child => { child.position.x -= totalWidth / 2; });
        shadowGroup.children.forEach(child => { child.position.x -= totalWidth / 2; });

        // Contenedor que agrupa texto + sombra
        const container = new THREE.Group();
        container.name = `pixeltext_container_${str}`;
        container.add(shadowGroup);
        container.add(group);
        container.userData.shadowGroup = shadowGroup;

        return container;
    }

    spawn() {
        if (!this.ready) return;

        const str = this.texts[this.nextTextIndex % this.texts.length];
        this.nextTextIndex++;

        const group = this.createTextMesh(str);
        const cam = this.player.camera;
        
        // Usar el ángulo real del player para la dirección forward
        const angle = this.player.angle;
        const dir = new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle));

        group.position.copy(cam.position);
        group.position.addScaledVector(dir, SPAWN_DISTANCE);

        // Offset vertical y lateral
        const right = new THREE.Vector3(-Math.sin(angle + Math.PI / 2), 0, -Math.cos(angle + Math.PI / 2));
        group.position.y += 50 + Math.random() * 50;
        group.position.addScaledVector(right, (Math.random() - 0.5) * 200);
        group.lookAt(cam.position);

        this.scene.add(group);
        this.activeTexts.push({ group, direction: dir.clone(), age: 0 });
    }

    addText(str) {
        this.texts.push(str);
    }

    update(state) {
        if (!this.ready) return;

        const dt = state.deltaTime;
        const cam = this.player.camera;

        this.timeSinceLastSpawn += dt;
        if (this.timeSinceLastSpawn >= SPAWN_INTERVAL) {
            this.spawn();
            this.timeSinceLastSpawn = 0;
        }

        for (let i = this.activeTexts.length - 1; i >= 0; i--) {
            const entry = this.activeTexts[i];

            // Mover en dirección fija (la que tenía al nacer)
            entry.group.position.addScaledVector(entry.direction, -TEXT_SPEED * dt);
            entry.age += dt;

            // Oscilación de la sombra neón en Y
            const shadow = entry.group.userData.shadowGroup;
            if (shadow) {
                shadow.position.y = Math.sin(entry.age * SHADOW_BOB_SPEED) * SHADOW_BOB_AMOUNT;
            }

            // Destruir por tiempo de vida (máx 10 segundos)
            if (entry.age > 10) {
                this.scene.remove(entry.group);
                entry.group.traverse(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) c.material.dispose();
                });
                this.activeTexts.splice(i, 1);
            }
        }
    }
}
