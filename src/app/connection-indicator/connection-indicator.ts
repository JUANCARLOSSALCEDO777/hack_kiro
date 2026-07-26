import { Component, input } from '@angular/core';

/**
 * Indicador persistente del estado de conexión del bot de Discord.
 * Se posiciona fijo en la esquina inferior izquierda del viewport,
 * por encima del canvas Three.js, sin interferir con la experiencia 3D.
 */
@Component({
  selector: 'app-connection-indicator',
  standalone: true,
  template: `
    <div class="connection-indicator" aria-live="polite">
      <span class="status-dot"></span>
      <span class="connection-text">{{ connectionText() }}</span>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      bottom: 4px;
      left: 8px;
      z-index: 11;
      pointer-events: none;
    }

    .connection-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: rgba(0, 0, 0, 0.6);
      border-radius: 4px;
      font-family: system-ui, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      color: #b0ffb0;
      white-space: nowrap;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      min-width: 8px;
      border-radius: 50%;
      background: #44ff44;
      box-shadow: 0 0 4px #44ff44;
    }

    .connection-text {
      font-size: 12px;
    }
  `,
})
export class ConnectionIndicatorComponent {
  // Input signal requerido — el texto de conexión se recibe del componente padre
  connectionText = input.required<string>();
}
