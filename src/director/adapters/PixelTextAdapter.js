/**
 * PixelTextAdapter — Adaptador ligero que envuelve el subsistema PixelText
 * para integrarse con el VisualElementRegistry del Experience Director.
 *
 * Implementa la interfaz VisualElementAdapter:
 *   { name, setVisible, update, onBeat, getSceneObject }
 *
 * PixelText no tiene un grupo 3D contenedor único — los textos activos
 * se agregan directamente a la escena. Para controlar visibilidad,
 * iteramos los textos activos y los futuros spawns se inhiben cuando
 * no está visible.
 *
 * NO modifica la lógica interna de PixelText.
 */

import * as THREE from 'three';

export class PixelTextAdapter {

  /**
   * @param {import('../../ui/PixelText.js').PixelText} pixelText — instancia del subsistema
   */
  constructor(pixelText) {
    this.name = 'pixelText';
    this._pixelText = pixelText;
    this._visible = true;

    // Crear un grupo contenedor virtual para referencia de getSceneObject
    // Si PixelText no expone un grupo, usamos un Group vacío como referencia
    this._group = new THREE.Group();
    this._group.name = 'pixelText-adapter-group';
  }

  /**
   * Controla la visibilidad de todos los textos activos del subsistema.
   * Los textos se agregan directamente a la escena, así que iteramos
   * el array activeTexts para controlar cada grupo individual.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._visible = visible;
    this._pixelText._enabled = visible;

    // Ocultar/mostrar textos actualmente renderizados
    const activeTexts = this._pixelText.activeTexts;
    for (let i = 0; i < activeTexts.length; i++) {
      activeTexts[i].group.visible = visible;
    }
  }

  /**
   * Delega la actualización al subsistema PixelText.
   * Solo se invoca si el elemento está activo en el registry.
   * @param {Object} state — FrameState del loop de animación
   */
  update(state) {
    this._pixelText.update(state);

    // Si no es visible, asegurar que los nuevos spawns tampoco lo sean
    if (!this._visible) {
      const activeTexts = this._pixelText.activeTexts;
      for (let i = 0; i < activeTexts.length; i++) {
        activeTexts[i].group.visible = false;
      }
    }
  }

  /**
   * onBeat es opcional para PixelText — no tiene reacción directa a beats.
   * Se incluye como no-op para cumplir la interfaz.
   * @param {string} _beatType — tipo de beat (bass, mid, high)
   * @param {number} _intensity — intensidad del efecto [0, 1]
   */
  onBeat(_beatType, _intensity) {
    // No-op: PixelText no reacciona directamente a beats
  }

  /**
   * Retorna un Group de referencia para el subsistema.
   * PixelText no tiene un único objeto raíz en la escena,
   * así que retornamos un grupo auxiliar como referencia.
   * @returns {THREE.Group}
   */
  getSceneObject() {
    return this._group;
  }
}
