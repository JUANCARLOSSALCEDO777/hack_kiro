/**
 * PixelFontRenderer.js — Renderer de texto con bitmap font (pixel art)
 * 
 * Renderiza textos como meshes individuales por letra usando un atlas BMFont.
 * Estilo retro 8-bit con sombra cyan detrás.
 */

import * as THREE from 'three';
import { NO_BLOOM_LAYER } from '../../experience/View.js';

const TEXT_SCALE = 8;
const SHADOW_OFFSET_Z = 5;
const SHADOW_COLOR = 0x00FFFF;

export class PixelFontRenderer {

    constructor() {
        this.fontData = null;
        this.fontTexture = null;
        this.ready = false;
        this._loadFont();
    }

    async _loadFont() {
        const textureLoader = new THREE.TextureLoader();
        const rawTexture = await new Promise((resolve) => {
            textureLoader.load('/fonts/pixel-font-atlas.png', resolve);
        });

        this.fontTexture = this._makeBlackTransparent(rawTexture);

        const response = await fetch('/fonts/pixel-font-atlas.fnt');
        const text = await response.text();
        this.fontData = this._parseBMFont(text);
        this.ready = true;
    }

    /** Convierte píxeles oscuros en transparentes */
    _makeBlackTransparent(texture) {
        const image = texture.image;
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const threshold = 30;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i] < threshold && data[i + 1] < threshold && data[i + 2] < threshold) {
                data[i + 3] = 0;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        const newTexture = new THREE.CanvasTexture(canvas);
        newTexture.magFilter = THREE.NearestFilter;
        newTexture.minFilter = THREE.NearestFilter;
        newTexture.needsUpdate = true;
        return newTexture;
    }

    _parseBMFont(text) {
        const chars = {};
        let scaleW = 128, scaleH = 128, lineHeight = 11;

        for (const line of text.split('\n')) {
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

    /**
     * @param {string} str - Texto a renderizar
     * @returns {THREE.Group} Grupo con los meshes del texto
     */
    createMesh(str) {
        if (!this.ready) return new THREE.Group();

        const { chars, scaleW, scaleH } = this.fontData;
        const group = new THREE.Group();
        const shadowGroup = new THREE.Group();
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

            // Mesh principal (blanco)
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

            // Sombra cyan detrás
            const shadowMat = new THREE.MeshBasicMaterial({
                map: this.fontTexture,
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide,
                color: SHADOW_COLOR,
                fog: false
            });

            const shadowMesh = new THREE.Mesh(geo.clone(), shadowMat);
            shadowMesh.layers.set(NO_BLOOM_LAYER);
            shadowMesh.position.x = mesh.position.x;
            shadowMesh.position.y = mesh.position.y;
            shadowMesh.position.z = SHADOW_OFFSET_Z;
            shadowGroup.add(shadowMesh);

            cursorX += xa;
        }

        const totalWidth = cursorX * TEXT_SCALE;
        group.children.forEach(c => { c.position.x -= totalWidth / 2; });
        shadowGroup.children.forEach(c => { c.position.x -= totalWidth / 2; });

        const container = new THREE.Group();
        container.add(shadowGroup);
        container.add(group);
        container.userData.shadowGroup = shadowGroup;
        return container;
    }

    /** Actualización por frame (oscilación de sombra) */
    updateEntry(entry, dt) {
        const shadow = entry.group.userData.shadowGroup;
        if (shadow) {
            shadow.position.y = Math.sin(entry.age * 2) * 3;
        }
    }
}
