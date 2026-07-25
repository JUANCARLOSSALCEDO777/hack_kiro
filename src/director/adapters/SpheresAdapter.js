/**
 * SpheresAdapter — Adaptador ligero que envuelve el subsistema LuminousSpheres
 * para integrarse con el VisualElementRegistry del Experience Director.
 *
 * Implementa la interfaz VisualElementAdapter:
 *   { name, setVisible, update, onBeat, getSceneObject }
 *
 * Expone además setPattern() para que el director pueda cambiar
 * el patrón de luz sin acceder directamente al subsistema.
 *
 * NO modifica la lógica interna de LuminousSpheres.
 */

export class SpheresAdapter {

  /**
   * @param {import('../../particles/LuminousSpheres.js').LuminousSpheres} spheres — instancia del subsistema
   */
  constructor(spheres) {
    this.name = 'spheres';
    this._spheres = spheres;
  }

  /**
   * Controla la visibilidad del InstancedMesh del subsistema.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._spheres.mesh.visible = visible;
  }

  /**
   * Delega la actualización al subsistema LuminousSpheres.
   * Solo se invoca si el elemento está activo en el registry.
   * @param {Object} state — FrameState del loop de animación
   */
  update(state) {
    this._spheres.update(state);
  }

  /**
   * Delega la reacción al beat al subsistema LuminousSpheres.
   * @param {string} _beatType — tipo de beat (bass, mid, high)
   * @param {number} _intensity — intensidad del efecto [0, 1]
   */
  onBeat(_beatType, _intensity) {
    this._spheres.onBeat();
  }

  /**
   * Retorna el objeto 3D principal del subsistema (InstancedMesh).
   * @returns {THREE.InstancedMesh}
   */
  getSceneObject() {
    return this._spheres.mesh;
  }

  /**
   * Cambia el patrón de luz activo en las esferas.
   * Delegación directa a spheres.setPattern().
   * @param {string} pattern — clave de LIGHT_PATTERNS (ej: 'radialPulse', 'snake')
   */
  setPattern(pattern) {
    this._spheres.setPattern(pattern);
  }
}
