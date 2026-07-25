/**
 * WebcamScreensAdapter — Adaptador ligero que envuelve el subsistema WebcamLEDScreens
 * para integrarse con el VisualElementRegistry del Experience Director.
 *
 * Implementa la interfaz VisualElementAdapter:
 *   { name, setVisible, update, onBeat, getSceneObject }
 *
 * Las pantallas webcam son un array de Points distribuidos en la escena.
 * setVisible itera todas las pantallas para controlar su visibilidad.
 * getSceneObject retorna el primer Points como referencia del subsistema.
 *
 * NO modifica la lógica interna de WebcamLEDScreens.
 */

export class WebcamScreensAdapter {

  /**
   * @param {import('../../services/WebcamLEDScreens.js').WebcamLEDScreens} webcamScreens — instancia del subsistema
   */
  constructor(webcamScreens) {
    this.name = 'webcamScreens';
    this._webcamScreens = webcamScreens;
  }

  /**
   * Controla la visibilidad de TODAS las pantallas del subsistema.
   * Itera el array interno _screens y setea .visible en cada Points.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._webcamScreens._enabled = visible;
    const screens = this._webcamScreens._screens;
    for (let i = 0; i < screens.length; i++) {
      screens[i].points.visible = visible;
    }
  }

  /**
   * Delega la actualización al subsistema WebcamLEDScreens.
   * Solo se invoca si el elemento está activo en el registry.
   * @param {Object} state — FrameState del loop de animación
   */
  update(state) {
    this._webcamScreens.update(state);
  }

  /**
   * onBeat es opcional para WebcamScreens — la reacción a beats
   * se maneja internamente vía state.skyboxPulse.
   * Se incluye como no-op para cumplir la interfaz.
   * @param {string} _beatType — tipo de beat (bass, mid, high)
   * @param {number} _intensity — intensidad del efecto [0, 1]
   */
  onBeat(_beatType, _intensity) {
    // No-op: la reacción a pulsos se maneja dentro de update() vía state.skyboxPulse
  }

  /**
   * Retorna el primer objeto Points como referencia del subsistema.
   * Si no hay pantallas creadas aún, retorna null.
   * @returns {THREE.Points|null}
   */
  getSceneObject() {
    const screens = this._webcamScreens._screens;
    return screens.length > 0 ? screens[0].points : null;
  }
}
