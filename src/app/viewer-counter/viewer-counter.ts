import { Component, input } from '@angular/core';

/**
 * Componente persistente que muestra el conteo de viewers/participantes.
 * Se superpone al canvas con posición fija — no modifica Three.js.
 */
@Component({
  selector: 'app-viewer-counter',
  standalone: true,
  template: `
    <div class="viewer-counter" aria-live="polite" aria-atomic="true">
      <span class="viewer-icon" aria-hidden="true">👁</span>
      <span class="viewer-count">{{ count() }}</span>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      bottom: 4px;
      right: 4px;
      z-index: 11;
      pointer-events: none;
    }

    .viewer-counter {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 120px;
      max-height: 40px;
      padding: 4px 10px;
      background: rgba(0, 0, 0, 0.6);
      border-radius: 4px;
      color: #e0e0e0;
      font-size: 14px;
      font-family: system-ui, sans-serif;
      line-height: 1.4;
      white-space: nowrap;
    }

    .viewer-icon {
      font-size: 14px;
      flex-shrink: 0;
    }

    .viewer-count {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class ViewerCounterComponent {
  // Señal de entrada requerida — el padre proporciona el conteo actual
  count = input.required<number>();
}
