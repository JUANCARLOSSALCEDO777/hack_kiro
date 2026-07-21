import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';

@Component({
  selector: 'app-canvas-draw',
  imports: [],
  templateUrl: './canvas-draw.html',
  styles: `
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      border: 2px solid black;
      margin: 0;  
    }
  `,
})
export class CanvasDraw implements AfterViewInit {
  @ViewChild('miCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private dibujando = false;

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
  }

  iniciarDibujo(event: MouseEvent) {
    this.dibujando = true;
    this.ctx.beginPath();
    this.ctx.moveTo(event.offsetX, event.offsetY);
  }

  dibujar(event: MouseEvent) {
    if (!this.dibujando) return;
    this.ctx.lineTo(event.offsetX, event.offsetY);
    this.ctx.stroke();
  }

  detenerDibujo() {
    this.dibujando = false;
  }
}
