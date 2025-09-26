import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-opponent-left-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './opponent-left-modal.html',
  styleUrls: ['./opponent-left-modal.scss']
})
export class OpponentLeftModalComponent {
  @Input() playerName: string | null = null;
  @Output() close = new EventEmitter<void>();

  closeModal() {
    this.close.emit();
  }
}