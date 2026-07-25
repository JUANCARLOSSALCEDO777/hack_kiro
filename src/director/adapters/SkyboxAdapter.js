/**
 * SkyboxAdapter — Adaptador ligero que envuelve el subsistema Skybox
 * para integrarse con el VisualElementRegistry del Experience Director.
 *
 * Implementa la interfaz VisualElementAdapter:
 *   { name, setVisible, update, onBeat, getSceneObject }
 *
 * Expone setters para hueRange, saturation, baseLightness y pulseIntensity
 * que el TransitionEngine puede interpolar entre Mood Presets.
 *
 * NO modifica la lógica interna de Skybox; el ciclo de color HSL
 * sigue manejándose dentro de skybox.update(state).
 */

export class SkyboxAdapter {

  /**
   * @param {import('../../experience/Skybox.js').Skybox} skybox — instancia del subsistema Skybox
   */
  constructor(skybox) {
    this.name = 'skybox';
    this._skybox = skybox;

    // Parámetros controlables por el TransitionEngine
    // Valores por defecto tomados del preset 'default'
    this._hueRange = [0.6, 0.95];
    this._saturation = 0.8;
    this._baseLightness = 0.04;
    this._pulseIntensity = 0.12;
  }

  /**
   * Controla la visibilidad del mesh cilíndrico del skybox.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._skybox.mesh.visible = visible;
  }

  /**
   * Delega la actualización al subsistema Skybox.
   * Solo se invoca si el elemento está activo en el registry.
   * @param {Object} state — FrameState del loop de animación
   */
  update(state) {
    this._skybox.update(state);
  }

  /**
   * onBeat es opcional para Skybox — el skybox reacciona a pulsos
   * vía state.skyboxPulse, no directamente a beats.
   * Se incluye como no-op para cumplir la interfaz.
   * @param {string} _beatType — tipo de beat (bass, mid, high)
   * @param {number} _intensity — intensidad del efecto [0, 1]
   */
  onBeat(_beatType, _intensity) {
    // No-op: el skybox reacciona indirectamente vía state.skyboxPulse
  }

  /**
   * Retorna el objeto 3D principal del subsistema (THREE.Mesh cilindro).
   * @returns {THREE.Mesh}
   */
  getSceneObject() {
    return this._skybox.mesh;
  }

  // ─── Setters para parámetros interpolables por el TransitionEngine ──────────

  /**
   * Establece el rango de hue del ciclo de color.
   * @param {number[]} range — [hueMin, hueMax], valores en [0, 1]
   */
  setHueRange(range) {
    this._hueRange = range;
  }

  /**
   * Establece la saturación del color HSL.
   * @param {number} value — valor en [0, 1]
   */
  setSaturation(value) {
    this._saturation = value;
  }

  /**
   * Establece la luminosidad base del skybox.
   * @param {number} value — valor típico entre 0.01 y 0.2
   */
  setBaseLightness(value) {
    this._baseLightness = value;
  }

  /**
   * Establece la intensidad del pulso de luminosidad en beats.
   * @param {number} value — valor típico entre 0.0 y 0.5
   */
  setPulseIntensity(value) {
    this._pulseIntensity = value;
  }

  // ─── Getters (lectura de parámetros actuales) ───────────────────────────────

  /** @returns {number[]} */
  getHueRange() { return this._hueRange; }

  /** @returns {number} */
  getSaturation() { return this._saturation; }

  /** @returns {number} */
  getBaseLightness() { return this._baseLightness; }

  /** @returns {number} */
  getPulseIntensity() { return this._pulseIntensity; }
}
