/**
 * StarsAdapter — Adaptador ligero que envuelve el subsistema Stars
 * para integrarse con el VisualElementRegistry del Experience Director.
 *
 * Implementa la interfaz VisualElementAdapter:
 *   { name, setVisible, update, onBeat, getSceneObject }
 *
 * NO modifica la lógica interna de Stars; solo controla visibilidad
 * y delega las llamadas de update/onBeat al subsistema.
 */

export class StarsAdapter {

  /**
   * @param {import('../../particles/Stars.js').Stars} stars — instancia del subsistema Stars
   */
  constructor(stars) {
    this.name = 'stars';
    this._stars = stars;
  }

  /**
   * Controla la visibilidad del objeto THREE.Points del subsistema.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._stars.points.visible = visible;
  }

  /**
   * Delega la actualización al subsistema Stars.
   * Solo se invoca si el elemento está activo en el registry.
   * @param {Object} state — FrameState del loop de animación
   */
  update(state) {
    this._stars.update(state);
  }

  /**
   * Delega la reacción al beat al subsistema Stars.
   * @param {string} _beatType — tipo de beat (bass, mid, high)
   * @param {number} _intensity — intensidad del efecto [0, 1]
   */
  onBeat(_beatType, _intensity) {
    this._stars.onBeat();
  }

  /**
   * Retorna el objeto 3D principal del subsistema (THREE.Points).
   * @returns {THREE.Points}
   */
  getSceneObject() {
    return this._stars.points;
  }
}
