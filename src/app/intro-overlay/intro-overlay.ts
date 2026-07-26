import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  Output,
  EventEmitter,
} from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Componente del overlay de entrada.
 * Se superpone al canvas Three.js como HTML/CSS puro.
 * Presenta información del proyecto, avatar del bot y botón de entrada.
 * Implementa focus trap y Fade_Transition con fallback.
 */
@Component({
  selector: 'app-intro-overlay',
  standalone: true,
  templateUrl: './intro-overlay.html',
  styleUrl: './intro-overlay.css',
})
export class IntroOverlayComponent implements AfterViewInit, OnDestroy {
  @ViewChild('entryButton') entryButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('overlayContainer') overlayContainer!: ElementRef<HTMLElement>;

  /** Emitido cuando el usuario activa el botón de entrada */
  @Output() startExperience = new EventEmitter<void>();

  /** Emitido cuando la transición de fade finaliza (o el fallback expira) */
  @Output() fadeComplete = new EventEmitter<void>();

  /** Indica si la transición de desvanecimiento está en progreso */
  isFading = false;

  /** URL de invitación del bot de Discord (configurable desde environment) */
  discordInviteUrl = environment.discordBotInviteUrl;

  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  ngAfterViewInit(): void {
    // Foco automático en el botón dentro de 100ms tras renderizado
    setTimeout(() => this.entryButton?.nativeElement.focus(), 0);
  }

  /**
   * Maneja la activación del botón (click, Enter o Space).
   * Ignora interacciones si ya está en proceso de fade.
   */
  onEntryClick(): void {
    if (this.isFading) return;
    this.isFading = true;
    this.startExperience.emit();

    // Fallback: si transitionend no se dispara en 1500ms, forzar remoción
    this.fallbackTimer = setTimeout(() => this.completeFade(), 1500);
  }

  /**
   * Filtra transitionend para reaccionar SOLO a la opacity del contenedor.
   * Evita que transiciones de hijos (avatar, botón hover) disparen la remoción.
   */
  onTransitionEnd(event: TransitionEvent): void {
    // Solo reaccionar si es la transición de opacity del contenedor principal
    if (event.propertyName !== 'opacity') return;
    if (!this.isFading) return;
    this.completeFade();
  }

  /**
   * Limpia el timer de fallback y emite fadeComplete.
   */
  private completeFade(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    this.fadeComplete.emit();
  }

  /**
   * Focus trap: intercepta Tab para mantener el foco dentro del overlay.
   * Implementa navegación circular entre elementos interactivos.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;

    const container = this.overlayContainer?.nativeElement;
    if (!container) return;

    // Obtener todos los elementos enfocables dentro del overlay
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift+Tab: si estamos en el primer elemento, ir al último
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: si estamos en el último elemento, ir al primero
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }
}
