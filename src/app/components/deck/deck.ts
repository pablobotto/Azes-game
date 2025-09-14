import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../services/game.service';
import { GameStepService } from '../../services/gameSteps.service';
import { CurrentPlayerType } from '../../enum/player.enum';

@Component({
  selector: 'app-deck',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './deck.html',
  styleUrls: ['./deck.scss']
})
export class DeckComponent {
  constructor(public game: GameService, public gameSteps: GameStepService) {}
  Player = CurrentPlayerType;

  newCard(player: CurrentPlayerType) {
    this.gameSteps.draw(player);
  }

  get cardsLeft(): number {
    return this.game.getDeckCount();
  }
}