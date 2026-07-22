/**
 * Terrain.js — Sistema de tiles infinito con culling
 * Equivalente a: js/lights/terrain/Terrain.js
 * 
 * Gestiona una cuadrícula 5×5 de tiles que se reposiciona
 * constantemente alrededor de la cámara. Los tiles detrás
 * del jugador se ocultan (frustum culling por ángulo).
 */

import * as THREE from 'three';
import { TerrainPlane } from './TerrainPlane.js';
import { Config } from '../Config.js';

export class Terrain {

    constructor(scene, player) {

        this.scene = scene;
        this.player = player;
        this.camera = player.camera;

        const { tileSize, gridSize } = Config.terrain;
        this.tileSize = tileSize;
        this.gridSize = gridSize;
        this.gridRadius = Math.floor(gridSize / 2);

        // Geometría compartida por todos los tiles
        this.terrainPlane = new TerrainPlane();

        // Material del terreno — superficie sólida oscura
        this.material = new THREE.MeshStandardMaterial({
            color: 0x111122,
            wireframe: false,
            metalness: 0.3,
            roughness: 0.7
        });

        // Crear cuadrícula de tiles
        this.tiles = [];
        this.tileIdSet = {};
        this.cameraTileX = 0;
        this.cameraTileY = 0;

        for (let x = 0; x < gridSize; x++) {
            this.tiles[x] = [];
            for (let y = 0; y < gridSize; y++) {
                const tile = {
                    mesh: new THREE.Mesh(this.terrainPlane.geometry, this.material),
                    visible: false,
                    tileId: null,
                    justOn: false,
                    justOff: false,
                    justMoved: false
                };
                tile.mesh.name = `terrain_tile_${x}_${y}`;
                tile.mesh.visible = false;
                this.tiles[x][y] = tile;
            }
        }

        // Luz ambiental + direccional para iluminar el terreno
        const ambientLight = new THREE.AmbientLight(0x445566, 1.0);
        ambientLight.name = 'ambientLight';
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0x8899bb, 0.8);
        dirLight.name = 'directionalLight';
        dirLight.position.set(0, 300, -200);
        scene.add(dirLight);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Update: reposicionar tiles y aplicar culling
    // ═══════════════════════════════════════════════════════════════════════
    update() {

        const cameraX = this.camera.position.x;
        const cameraZ = this.camera.position.z;
        const sin = Math.sin(this.player.angle);
        const cos = Math.cos(this.player.angle);

        this.cameraTileX = (Math.round(cameraX / this.tileSize) - this.gridRadius) * this.tileSize;
        this.cameraTileY = (Math.round(cameraZ / this.tileSize) - this.gridRadius) * this.tileSize;

        // Limpiar set de IDs
        for (const id in this.tileIdSet) delete this.tileIdSet[id];

        // Actualizar cada tile de la cuadrícula
        for (let x = 0; x < this.gridSize; x++) {
            for (let y = 0; y < this.gridSize; y++) {

                const tileX = this.cameraTileX + this.tileSize * x;
                const tileY = this.cameraTileY + this.tileSize * y;
                const deltaX = tileX - cameraX;
                const deltaY = tileY - cameraZ;
                const angle = Math.atan2(deltaX, deltaY);

                const r = Math.floor(Math.max(
                    Math.abs(x - this.gridRadius),
                    Math.abs(y - this.gridRadius)
                ));

                // Culling por ángulo (misma lógica que el original)
                let tileVisible;
                if (r > 1)
                    tileVisible = (cos * Math.cos(angle) + sin * Math.sin(angle)) < -0.5;
                else if (r === 1)
                    tileVisible = (cos * Math.cos(angle) + sin * Math.sin(angle)) < 0.5;
                else
                    tileVisible = true;

                const tile = this.tiles[x][y];

                if (tileVisible) {
                    tile.justOff = false;
                    tile.justOn = !tile.visible;

                    if (tile.justOn) {
                        tile.mesh.name = `terrain_tile_${x}_${y}`;
                        this.scene.add(tile.mesh);
                        tile.mesh.visible = true;
                        tile.visible = true;
                    }

                    const tileId = tileX + '/' + tileY;
                    this.tileIdSet[tileId] = true;
                    tile.justMoved = (tile.tileId !== tileId);

                    if (tile.justMoved) {
                        tile.mesh.position.x = tileX;
                        tile.mesh.position.z = tileY;
                        tile.tileId = tileId;
                    }
                } else {
                    tile.justOff = tile.visible;
                    tile.justOn = false;

                    if (tile.justOff) {
                        this.scene.remove(tile.mesh);
                        tile.mesh.visible = false;
                        tile.visible = false;
                    }
                }
            }
        }
    }

    // Verificar si una posición está en un tile visible
    isVisible(posX, posZ) {
        const posTileX = (Math.round(posX / this.tileSize) - this.gridRadius) * this.tileSize;
        const posTileZ = (Math.round(posZ / this.tileSize) - this.gridRadius) * this.tileSize;
        const x = (posTileX - this.cameraTileX) / this.tileSize + this.gridRadius;
        const y = (posTileZ - this.cameraTileY) / this.tileSize + this.gridRadius;

        if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return false;
        return this.tiles[Math.floor(x)][Math.floor(y)].visible;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // getWorldHeightAt — obtener la altura actual del terreno en coords mundo
    // Convierte la posición mundo a coordenadas locales del tile y delega
    // a TerrainPlane.getHeightAt(). Funciona con cualquier modo de deformación.
    // ═══════════════════════════════════════════════════════════════════════
    getWorldHeightAt(worldX, worldZ) {

        // Encontrar en qué tile cae esta posición
        const tileX = Math.round(worldX / this.tileSize) * this.tileSize;
        const tileZ = Math.round(worldZ / this.tileSize) * this.tileSize;

        // Convertir a coordenadas locales del tile
        const localX = worldX - tileX;
        const localZ = worldZ - tileZ;

        return this.terrainPlane.getHeightAt(localX, localZ);
    }
}
