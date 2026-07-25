/**
 * TransitionEngine — Motor de interpolación suave entre configuraciones.
 *
 * Se encarga de interpolar valores numéricos y colores (en espacio HSL)
 * durante transiciones entre Mood Presets, evitando cambios abruptos.
 *
 * Soporta 4 funciones de easing: linear, easeInOut, easeIn, easeOut.
 * Los valores discretos (terrainMode, lightPattern) se aplican inmediatamente.
 */

// --- Funciones de Easing ---

/**
 * Funciones de easing normalizadas: reciben t ∈ [0,1], retornan valor ∈ [0,1].
 */
const EASING_FUNCTIONS = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};

// --- Utilidades de Color HSL ---

/**
 * Convierte un string hexadecimal (#RRGGBB o #RGB) a componentes HSL.
 * @param {string} hex - Color en formato hex
 * @returns {{ h: number, s: number, l: number }} Componentes HSL [0-1]
 */
function hexToHsl(hex) {
  // Normalizar formato
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
  }

  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Acromático
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return { h, s, l };
}

/**
 * Convierte componentes HSL a string hexadecimal (#RRGGBB).
 * @param {{ h: number, s: number, l: number }} hsl - Componentes HSL [0-1]
 * @returns {string} Color en formato hex
 */
function hslToHex({ h, s, l }) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (c) => {
    const hex = Math.round(c * 255).toString(16).padStart(2, '0');
    return hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Determina si un valor es un color hexadecimal.
 * @param {*} value - Valor a evaluar
 * @returns {boolean}
 */
function isHexColor(value) {
  if (typeof value !== 'string') return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}

// --- TransitionEngine ---

export class TransitionEngine {
  constructor() {
    // Estado de transición activa
    this._active = false;
    this._elapsed = 0;
    this._duration = 0;
    this._easingFn = EASING_FUNCTIONS.linear;

    // Valores de origen y destino para interpolación
    this._fromValues = {};
    this._toValues = {};

    // Valores actuales interpolados
    this._currentValues = {};

    // Claves que son colores (para interpolar en HSL)
    this._colorKeys = new Set();

    // Callback de finalización
    this.onComplete = null;
  }

  /**
   * Inicia una nueva transición entre dos configuraciones.
   *
   * Si hay una transición en curso, la cancela y parte desde los valores
   * interpolados actuales (interrupción suave).
   *
   * @param {object} config - Configuración de la transición
   * @param {Record<string, number|string>} config.from - Valores de origen
   * @param {Record<string, number|string>} config.to - Valores de destino
   * @param {number} config.duration - Duración en segundos (0.1 a 10)
   * @param {string} config.easing - Función de easing a usar
   * @param {string[]} [config.immediateKeys] - Claves a aplicar de forma inmediata
   */
  startTransition(config) {
    const { from, to, duration, easing = 'linear', immediateKeys = [] } = config;

    // Si la duración es menor a 0.1s o no es un número válido, aplicar todo inmediato
    if (!Number.isFinite(duration) || duration < 0.1) {
      this._applyImmediate(to);
      this._active = false;
      this._elapsed = 0;
      // Notificar completado
      if (this.onComplete) {
        this.onComplete();
      }
      return;
    }

    // Seleccionar función de easing
    this._easingFn = EASING_FUNCTIONS[easing] || EASING_FUNCTIONS.linear;
    this._duration = duration;
    this._elapsed = 0;

    // Resolver valores de origen: si hay transición activa, partir de los valores actuales
    const resolvedFrom = {};
    for (const key of Object.keys(to)) {
      if (this._active && this._currentValues[key] !== undefined) {
        // Interrupción: partir desde el valor interpolado actual
        resolvedFrom[key] = this._currentValues[key];
      } else if (from[key] !== undefined) {
        resolvedFrom[key] = from[key];
      } else {
        resolvedFrom[key] = to[key];
      }
    }

    // Aplicar claves inmediatas (valores discretos como terrainMode, lightPattern)
    const immediateSet = new Set(immediateKeys);
    for (const key of immediateSet) {
      if (to[key] !== undefined) {
        this._currentValues[key] = to[key];
      }
    }

    // Separar claves interpolables de las inmediatas
    this._fromValues = {};
    this._toValues = {};
    this._colorKeys = new Set();

    for (const key of Object.keys(to)) {
      if (immediateSet.has(key)) continue; // Ya aplicada

      const fromVal = resolvedFrom[key];
      const toVal = to[key];

      // Detectar si es color
      if (isHexColor(fromVal) && isHexColor(toVal)) {
        this._colorKeys.add(key);
        this._fromValues[key] = fromVal;
        this._toValues[key] = toVal;
        this._currentValues[key] = fromVal;
      } else if (typeof fromVal === 'number' && typeof toVal === 'number') {
        // Interpolación numérica
        this._fromValues[key] = fromVal;
        this._toValues[key] = toVal;
        this._currentValues[key] = fromVal;
      } else {
        // Tipo no interpolable → aplicar inmediato
        this._currentValues[key] = toVal;
      }
    }

    this._active = true;
  }

  /**
   * Actualiza la transición con el tiempo transcurrido.
   * Debe llamarse en cada frame del loop de animación.
   *
   * @param {number} deltaTime - Tiempo transcurrido desde el último frame (segundos)
   */
  update(deltaTime) {
    if (!this._active) return;

    this._elapsed += deltaTime;
    const rawProgress = Math.min(this._elapsed / this._duration, 1.0);
    const easedProgress = this._easingFn(rawProgress);

    // Interpolar valores numéricos
    for (const key of Object.keys(this._fromValues)) {
      if (this._colorKeys.has(key)) continue; // Colores se manejan aparte

      const from = this._fromValues[key];
      const to = this._toValues[key];
      this._currentValues[key] = from + (to - from) * easedProgress;
    }

    // Interpolar colores en espacio HSL
    for (const key of this._colorKeys) {
      const fromHsl = hexToHsl(this._fromValues[key]);
      const toHsl = hexToHsl(this._toValues[key]);

      const h = fromHsl.h + (toHsl.h - fromHsl.h) * easedProgress;
      const s = fromHsl.s + (toHsl.s - fromHsl.s) * easedProgress;
      const l = fromHsl.l + (toHsl.l - fromHsl.l) * easedProgress;

      this._currentValues[key] = hslToHex({ h, s, l });
    }

    // Verificar si la transición terminó
    if (rawProgress >= 1.0) {
      this._active = false;
      if (this.onComplete) {
        this.onComplete();
      }
    }
  }

  /**
   * Indica si hay una transición en progreso.
   * @returns {boolean}
   */
  isTransitioning() {
    return this._active;
  }

  /**
   * Retorna los valores actuales (interpolados o finales).
   * @returns {Record<string, number|string>}
   */
  getCurrentValues() {
    return { ...this._currentValues };
  }

  /**
   * Aplica todos los valores de destino inmediatamente sin interpolación.
   * @param {Record<string, number|string>} values - Valores a aplicar
   * @private
   */
  _applyImmediate(values) {
    for (const [key, value] of Object.entries(values)) {
      this._currentValues[key] = value;
    }
  }
}

// Exportar utilidades para testing
export { hexToHsl, hslToHex, isHexColor, EASING_FUNCTIONS };
