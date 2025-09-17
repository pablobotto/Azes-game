import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-game-result-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './result-modal.html',
  styleUrls: ['./result-modal.scss']
})
export class GameResultModalComponent {
  @Input() result: string | null = null;
  @Input() playerName: string = '';
  @Output() close = new EventEmitter<void>();
  rematchStarted = false;

  closeModal() {
    this.rematchStarted = false;
    this.close.emit();
  }
  startRematch() {
    this.rematchStarted = true;
    // acá podés iniciar la lógica de la revancha
  }
}