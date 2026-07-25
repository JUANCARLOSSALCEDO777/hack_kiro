/**
 * VisualElementRegistry — Registro y control de activación/desactivación
 * de elementos visuales de la escena.
 *
 * Cada elemento se registra con un adaptador que implementa la interfaz
 * VisualElementAdapter (name, setVisible, update, getSceneObject).
 * El registry controla el estado activo/inactivo sin resetear el estado
 * interno del elemento al desactivar.
 */

// Propiedades obligatorias que debe implementar un adaptador válido
const REQUIRED_ADAPTER_PROPS = ['name', 'setVisible', 'update', 'getSceneObject'];

export class VisualElementRegistry {
  constructor() {
    // Mapa: nombre → { adapter, active }
    this._elements = new Map();
  }

  /**
   * Registra un nuevo elemento visual con su adaptador.
   * Valida que el adaptador implemente la interfaz requerida.
   * Todos los elementos inician como activos.
   *
   * @param {string} name - Nombre único del elemento
   * @param {Object} adapter - Adaptador que implementa VisualElementAdapter
   * @throws {Error} Si faltan propiedades requeridas en el adaptador
   * @throws {Error} Si el nombre ya está registrado
   */
  register(name, adapter) {
    // Validar interfaz del adaptador
    const missing = REQUIRED_ADAPTER_PROPS.filter((prop) => {
      if (prop === 'name') return typeof adapter[prop] !== 'string';
      return typeof adapter[prop] !== 'function';
    });

    if (missing.length > 0) {
      throw new Error(
        `registerElement: propiedades faltantes: [${missing.join(', ')}]`
      );
    }

    // Validar nombre duplicado
    if (this._elements.has(name)) {
      throw new Error(`registerElement: '${name}' ya existe`);
    }

    // Registrar con estado activo por defecto
    this._elements.set(name, { adapter, active: true });
  }

  /**
   * Activa o desactiva un elemento visual.
   * Al desactivar: llama setVisible(false) pero preserva estado interno.
   * Al activar: llama setVisible(true), el elemento continúa donde quedó.
   *
   * @param {string} name - Nombre del elemento registrado
   * @param {boolean} active - true para activar, false para desactivar
   * @throws {Error} Si el nombre no existe en el registro
   */
  setActive(name, active) {
    this._assertExists(name);

    const entry = this._elements.get(name);
    entry.active = active;

    // Controlar visibilidad sin resetear estado interno
    entry.adapter.setVisible(active);
  }

  /**
   * Consulta si un elemento está activo.
   *
   * @param {string} name - Nombre del elemento registrado
   * @returns {boolean} true si está activo
   * @throws {Error} Si el nombre no existe en el registro
   */
  isActive(name) {
    this._assertExists(name);
    return this._elements.get(name).active;
  }

  /**
   * Retorna todos los elementos registrados con su estado.
   *
   * @returns {Map<string, { adapter: Object, active: boolean }>}
   */
  getAll() {
    return this._elements;
  }

  /**
   * Retorna la lista de nombres de elementos registrados.
   *
   * @returns {string[]}
   */
  getNames() {
    return Array.from(this._elements.keys());
  }

  /**
   * Valida que un nombre exista en el registro.
   * Lanza error descriptivo con la lista de nombres válidos si no existe.
   *
   * @param {string} name - Nombre a validar
   * @throws {Error} Si el nombre no está registrado
   * @private
   */
  _assertExists(name) {
    if (!this._elements.has(name)) {
      const validNames = this.getNames().join(', ');
      throw new Error(
        `setElementActive: '${name}' no existe. Válidos: [${validNames}]`
      );
    }
  }
}
