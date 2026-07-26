import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  NgZone,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { ExperienceManager } from '../../ExperienceManager.js';
import { IntroOverlayComponent } from '../intro-overlay/intro-overlay';
import { ConnectionIndicatorComponent } from '../connection-indicator/connection-indicator';
import { ViewerCounterComponent } from '../viewer-counter/viewer-counter';

@Component({
  selector: 'app-canvas-draw',
  imports: [IntroOverlayComponent, ConnectionIndicatorComponent, ViewerCounterComponent],
  templateUrl: './canvas-draw.html',
  encapsulation: ViewEncapsulation.None,
  styles: `
    app-canvas-draw {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      position: relative;
    }
    .three-container {
      width: 100%;
      height: 100%;
    }
    .ui-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    }
  `,
})
export class CanvasDraw implements AfterViewInit, OnDestroy {
  @ViewChild('threeContainer') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('uiContainer') uiContainerRef!: ElementRef<HTMLDivElement>;

  private experience: any = null;
  private ngZone = inject(NgZone);

  // Estado del overlay — controla si se muestra o se remueve del DOM
  showOverlay = true;

  // Señales reactivas alimentadas desde callbacks del ExperienceManager
  connectionText = signal('Testing Server • #general');
  viewerCount = signal(0);
  audioUnavailable = signal(false);

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      this.experience = new ExperienceManager(
        this.containerRef.nativeElement,
        this.uiContainerRef.nativeElement
      );

      // Asignar callbacks de notificación — única comunicación entre ExperienceManager y Angular
      this.experience.onConnectionChange = (text: string) => {
        this.ngZone.run(() => this.connectionText.set(text));
      };
      this.experience.onViewerCountChange = (count: number) => {
        this.ngZone.run(() => this.viewerCount.set(count));
      };

      this.experience.start();
    });
  }

  /**
   * Maneja la acción de iniciar la experiencia desde el overlay.
   * Solicita pantalla completa (fallo silencioso) y reanuda el audio.
   */
  onStartExperience(): void {
    // Solicitar pantalla completa — catch silencioso si el navegador lo rechaza
    const el = this.containerRef.nativeElement.parentElement;
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }

    // Resetear la canción al inicio y forzar que el director re-evalúe la fase 0
    if (this.experience?.music?.audio) {
      this.experience.music.audio.pause();
      this.experience.music.audio.currentTime = 0;
    }
    if (this.experience?.director) {
      const pm = this.experience.director.getPhaseManager();
      pm.recalculatePhase(0);
    }
    this.experience?.resumeAudio();

    // Detectar si el AudioContext quedó suspendido tras la interacción
    if (this.experience?.music?.audioContext?.state === 'suspended') {
      this.audioUnavailable.set(true);
    }
  }

  /**
   * Callback cuando la transición de fade del overlay termina.
   * Remueve el overlay del DOM para no interferir con el rendimiento del canvas.
   */
  onFadeComplete(): void {
    this.showOverlay = false;
  }

  /**
   * Método legacy — redirige al nuevo handler de inicio de experiencia.
   * Mantiene compatibilidad con cualquier referencia existente.
   */
  onUserInteraction(): void {
    this.onStartExperience();
  }

  ngOnDestroy() {
    this.experience?.dispose();
    this.experience = null;
  }
}
