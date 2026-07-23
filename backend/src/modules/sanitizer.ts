/**
 * Sanitizador de texto para el pipeline Discord → PixelText.
 *
 * Garantiza que solo se transmitan caracteres renderizables por el bitmap font.
 * El pipeline es una función pura: toUpperCase → filtrar chars → trim → truncar.
 */

export interface SanitizerConfig {
  maxLength: number;
  supportedChars: Set<number>;
}

/**
 * Sanitiza un string de entrada para que sea renderizable por el bitmap font.
 *
 * Pipeline (el orden es crítico):
 * 1. toUpperCase() — el bitmap font es uppercase-only
 * 2. Filtrar caracteres no soportados (solo los que están en el .fnt)
 * 3. trim() — eliminar espacios al inicio/final
 * 4. Truncar a maxLength
 */
export function sanitize(input: string, config: SanitizerConfig): string {
  const uppercased = input.toUpperCase();

  // Solo conservar caracteres cuyo code point esté en el set del bitmap font
  let filtered = '';
  for (const char of uppercased) {
    const code = char.codePointAt(0);
    if (code !== undefined && config.supportedChars.has(code)) {
      filtered += char;
    }
  }

  const trimmed = filtered.trim();

  // Truncar al largo máximo configurado
  const truncated = trimmed.slice(0, config.maxLength);

  return truncated;
}

/**
 * Set de char codes soportados, extraído directamente del descriptor .fnt
 * del bitmap font (pixel-font-atlas.fnt).
 *
 * Esto evita transmitir caracteres que PixelText no puede renderizar.
 */
export const DEFAULT_SUPPORTED_CHARS: Set<number> = new Set([
  // Letras acentuadas uppercase y especiales
  221, 209, 195, 192, 193, 194, 210, 211, 212, 217, 218, 219,
  200, 201, 202, 197, 206, 204, 205, 196, 214, 220, 203, 199,
  207, 198, 208, 213, 216, 222,
  // Letras uppercase A-Z
  65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
  80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
  // Dígitos 0-9
  48, 49, 50, 51, 52, 53, 54, 55, 56, 57,
  // Letras lowercase a-z
  97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
  110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122,
  // Letras acentuadas lowercase
  224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235,
  236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 248,
  249, 250, 251, 252, 253, 254, 255,
  // Puntuación y símbolos
  32,   // espacio
  33,   // !
  34,   // "
  35,   // #
  36,   // $
  37,   // %
  38,   // &
  39,   // '
  40,   // (
  41,   // )
  42,   // *
  43,   // +
  44,   // ,
  45,   // -
  46,   // .
  47,   // /
  58,   // :
  59,   // ;
  60,   // <
  61,   // =
  62,   // >
  63,   // ?
  64,   // @
  91,   // [
  92,   // \
  93,   // ]
  94,   // ^
  95,   // _
  96,   // `
  123,  // {
  124,  // |
  125,  // }
  126,  // ~
  // Símbolos extendidos presentes en el .fnt
  161,  // ¡
  162,  // ¢
  163,  // £
  164,  // ¤
  165,  // ¥
  166,  // ¦
  167,  // §
  168,  // ¨
  169,  // ©
  170,  // ª
  171,  // «
  172,  // ¬
  173,  // soft hyphen
  174,  // ®
  175,  // ¯
  176,  // °
  177,  // ±
  178,  // ²
  179,  // ³
  180,  // ´
  181,  // µ
  182,  // ¶
  183,  // ·
  184,  // ¸
  185,  // ¹
  186,  // º
  187,  // »
  188,  // ¼
  189,  // ½
  190,  // ¾
  191,  // ¿
  215,  // ×
  223,  // ß
  247,  // ÷
]);
