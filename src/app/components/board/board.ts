import { AfterViewInit, ChangeDetectorRef, Component, NgZone} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../services/game.service';
import { GameRulesService } from '../../services/gameRules.service';
import { Card } from '../../models/card.model';
import { CardComponent } from '../card/card';
import { DeckComponent } from '../deck/deck';
import { CdkDrag, CdkDragDrop, CdkDropList, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { GameStepService } from '../../services/gameSteps.service';
import { Player } from '../../enum/player.enum';
import { GameStep } from '../../enum/game-step.enum';
import { combineLatest } from 'rxjs';

@Component({
  selector: 'app-board',
  templateUrl: './board.html',
  styleUrls: ['./board.scss'],
  imports: [CommonModule, CardComponent, DeckComponent, DragDropModule],
})
export class BoardComponent implements AfterViewInit {
  currentPlayer$: typeof this.gameSteps.currentPlayer$;
  currentStep$: typeof this.gameSteps.currentStep$;
  Player = Player;
  GameStep = GameStep;

  constructor(public game: GameService, public gameRules: GameRulesService, public gameSteps: GameStepService, private cd: ChangeDetectorRef) {
    this.currentPlayer$ = this.gameSteps.currentPlayer$;
    this.currentStep$ = this.gameSteps.currentStep$;
  }

  ngAfterViewInit(): void {}
  async ngOnInit() {
    combineLatest([this.gameSteps.currentStep$, this.gameSteps.currentPlayer$
    ]).subscribe(async ([step, player]) => {
      switch (step) {
        case GameStep.Drawing:
          console.log(`Step actual: ${step}, Jugador actual: ${player}`);          
          this.gameSteps.draw(player)
          this.cd.detectChanges();
          break;
        case GameStep.Playing:
          console.log(`Step actual: ${step}, Jugador actual: ${player}`);
          if (player === Player.Opponent) {
            await this.gameSteps.play(player);
          }
          this.cd.detectChanges();
          break;
        case GameStep.Discarding:
          console.log(`Step actual: ${step}, Jugador actual: ${player}`);
          if (player === Player.Opponent) {
            await this.gameSteps.discard(player);
          }
          this.cd.detectChanges();
          break;
        case GameStep.Ending:
          console.log(`Step actual: ${step}, Jugador actual: ${player}`);
          await this.gameSteps.endTurn();
          break;
        case GameStep.Finished:
          break;
      }
    });
  }

  async startGame() {
    this.game.newGame();
    this.gameSteps.resetGame();
  }
  async onDragEnd() {
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.game.playerPiles = [...this.game.playerPiles];
  }

  async drop(event: CdkDragDrop<Card[]>) {
    if (event.previousContainer === event.container) {} else {
      if (event.container.id.startsWith('stair')) {
        // Es una escalera, validamos
        var card: Card = event.previousContainer.data[event.previousIndex];
        if (this.gameRules.canPlaceOnStair(event.container.data, card)) {
          transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex );
          event.container.data.sort((a, b) => a.numericValue - b.numericValue);
        } 
        else{
          console.log('Movimiento no permitido' );}
      } else {
        // No es una escalera, movemos sin validar
        if (await this.gameSteps.discard(Player.Player)) {
            const card = event.previousContainer.data[event.previousIndex];
          // Sacamos manualmente del array origen
          event.previousContainer.data.splice(event.previousIndex, 1);
          // Agregamos SIEMPRE al final de la escalera
          event.container.data.push(card);
        }
      } 
    }
  }
}