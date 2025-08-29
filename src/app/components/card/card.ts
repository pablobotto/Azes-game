import { Component, Input } from '@angular/core';
import { Card } from '../../models/card.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-card',
  imports: [CommonModule],
  templateUrl: './card.html',
  styleUrl: './card.scss'
})
export class CardComponent {
   @Input() card!: Card;
   @Input() faceDown = false; 
}


