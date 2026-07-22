import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  NgZone,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { ExperienceManager } from '../../ExperienceManager.js';

@Component({
  selector: 'app-canvas-draw',
  imports: [],
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
    .play-prompt {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
      color: #ffffff;
      font-size: 1.5rem;
      cursor: pointer;
      z-index: 10;
    }
  `,
})
export class CanvasDraw implements AfterViewInit, OnDestroy {
  @ViewChild('threeContainer') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('uiContainer') uiContainerRef!: ElementRef<HTMLDivElement>;

  private experience: any = null;
  private ngZone = inject(NgZone);

  showPlayPrompt = true;

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      this.experience = new ExperienceManager(
        this.containerRef.nativeElement,
        this.uiContainerRef.nativeElement
      );
      this.experience.start();
    });
  }

  onUserInteraction() {
    // Activar pantalla completa
    const el = this.containerRef.nativeElement.parentElement;
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }

    this.experience?.resumeAudio();
    this.showPlayPrompt = false;
  }

  ngOnDestroy() {
    this.experience?.dispose();
    this.experience = null;
  }
}
