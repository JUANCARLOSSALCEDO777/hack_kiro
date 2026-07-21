import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CanvasDraw } from './canvas-draw/canvas-draw';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CanvasDraw],
  templateUrl: './app.html'
})
export class App {
  protected readonly title = signal('hack_kiro_front');
}
