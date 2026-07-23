// Punto de extensión para filtrado por IA (Bedrock/Comprehend).
// Por ahora es pass-through; a futuro se reemplaza con una implementación
// que invoque un servicio de moderación sin modificar el pipeline.

export type AiFilterHook = (text: string) => Promise<string>;

export const passthroughFilter: AiFilterHook = async (text) => text;
