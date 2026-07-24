/**
 * Rate Limiter — Token Bucket
 *
 * Controla la tasa de mensajes transmitidos al WebSocket Bridge
 * para mantenerse dentro del free tier y evitar spam/flood.
 */

export interface RateLimitConfig {
  maxTokens: number;   // Mensajes máximos por ventana
  refillRate: number;  // Tokens que se recargan por segundo
  windowMs: number;    // Ventana de tiempo en ms
}

export class RateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    // El bucket inicia lleno
    this.tokens = config.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Intenta consumir un token.
   * Retorna true si el mensaje es permitido, false si debe descartarse.
   */
  tryConsume(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    // Sin tokens disponibles — mensaje descartado
    console.log('[RateLimiter] Mensaje descartado por rate limit');
    return false;
  }

  /**
   * Reinicia el bucket a su estado inicial (lleno).
   */
  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Recarga tokens gradualmente según el tiempo transcurrido y el refillRate.
   * Nunca excede maxTokens.
   */
  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;

    // Calcular tokens a recargar basándose en el tiempo transcurrido
    const tokensToAdd = (elapsedMs / 1000) * this.config.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }
}
