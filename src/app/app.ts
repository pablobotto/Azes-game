import { Component, signal } from '@angular/core';
//import { RouterOutlet } from '@angular/router';
import { BoardComponent } from './components/board/board';

@Component({
  selector: 'app-root',
  imports: [BoardComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('Azes-game');
}
