import { AfterViewInit, ChangeDetectorRef, Component} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { GameService } from '../../services/game.service';
import { GameRulesService } from '../../services/gameRules.service';
import { Card } from '../../models/card.model';
import { CardComponent } from '../card/card';
import { DeckComponent } from '../deck/deck';
import { CdkDragDrop, DragDropModule, transferArrayItem } from '@angular/cdk/drag-drop';
import { GameStepService } from '../../services/gameSteps.service';
import { CurrentPlayerType } from '../../enum/player.enum';
import { GameStep } from '../../enum/game-step.enum';
import { combineLatest } from 'rxjs';
import { SocketService } from '../../services/socket.service';
import { NotificationComponent } from '../notification/notification';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-board',
  templateUrl: './board.html',
  styleUrls: ['./board.scss'],
  imports: [CommonModule, CardComponent, DeckComponent, NotificationComponent, DragDropModule, FormsModule],
})
export class BoardComponent implements AfterViewInit {
  currentPlayerType$: typeof this.gameSteps.currentPlayerType$;
  currentStep$: typeof this.gameSteps.currentStep$;
  stairs$: typeof this.game.stairs$;
  status$: typeof this.socketService.gameStatus$;
  currentPlayerId$: typeof this.socketService.currentPlayerId$;
  opponentName$: typeof this.socketService.opponentName$;

  roomId = 'room1';
  joined = false;
  gameStarted = false;
  playerName: string = '';
  OpponentInformationNameSent: boolean = false;

  Player = CurrentPlayerType;
  GameStep = GameStep;
  constructor(public socketService: SocketService, public game: GameService, public gameRules: GameRulesService, public gameSteps: GameStepService, public notificationService: NotificationService ,private cd: ChangeDetectorRef) {
    this.currentPlayerType$ = this.gameSteps.currentPlayerType$;
    this.currentStep$ = this.gameSteps.currentStep$;
    this.stairs$ = this.game.stairs$;
    this.status$ = this.socketService.gameStatus$;
    this.currentPlayerId$ = this.socketService.currentPlayerId$;
    this.opponentName$ = this.socketService.opponentName$;
  }

  ngAfterViewInit(): void {}

  async ngOnDestroy() {
    this.socketService.disconnect();
  }

  async ngOnInit() {
    combineLatest([this.gameSteps.currentStep$, this.gameSteps.currentPlayerType$
    ]).subscribe(async ([step, player]) => {
      switch (step) {
        case GameStep.Drawing:
          console.log(`Step actual: ${step}, Jugador actual: ${player}`);          
          this.gameSteps.draw(player, this.socketService.socketId);
          this.cd.detectChanges();
          break;
        case GameStep.Playing:
          if (this.socketService.socketId !== "non-multiplayer" && this.OpponentInformationNameSent === false) {
            await this.sendDisplayOpponentName();
            this.OpponentInformationNameSent = true;
          }
          console.log(`Step actual: ${step}, Jugador actual: ${player}`);
          if (player === CurrentPlayerType.Cpu) {
            await this.gameSteps.play(player);
          }
          this.cd.detectChanges();
          break;
        case GameStep.Discarding:
          console.log(`Step actual: ${step}, Jugador actual: ${player}`);
          if (player === CurrentPlayerType.Cpu) {
            await this.gameSteps.discard(player);
          }
          this.cd.detectChanges();
          break;
        case GameStep.Ending:
          console.log(`Step actual: ${step}, Jugador actual: ${player}`);
          await this.gameSteps.endTurn(this.socketService.socketId);
          break;
        case GameStep.Finished:
          if (this.socketService.socketId !== "non-multiplayer") {
            await this.changePlayersOnline();
          }
          break;
      }
    });
    this.socketService.gameStatus$.subscribe(status => {
      this.cd.detectChanges();
    });
    this.game.stairs$.subscribe(async stairs => {
      this.cd.detectChanges();
    });
    this.status$.subscribe(async status => {
      if (status === 'ready') {
        await this.gameSteps.resetGame();
      }
    });
    this.socketService.startTurn$.subscribe(async () => {
      await this.startNewMPTurn();
    });
  }

  async joinRoom() {
    await this.socketService.joinRoom(this.roomId);
    this.joined = true;
  }
  async playInStairMultiplayer() {
    await this.socketService.playCard();
  }
  async changePlayersOnline() {
    await this.socketService.changePlayersOnline();
  }
  async startNewMPTurn() {
    await this.gameSteps.setStep(GameStep.Drawing);
  }
  async sendDisplayOpponentName() {
    this.socketService.sendDisplayOpponentName(this.playerName);
  }
  async startNewSPGame() {
    this.game.newGame();
    this.gameSteps.resetGame();
  }
  async onDragEnd() {
    this.game.playerPiles = [...this.game.playerPiles];
  }

  async drop(event: CdkDragDrop<Card[]>) {
    if (event.previousContainer === event.container) {} else {
      if (event.container.id.startsWith('stair')) {
        if (await this.gameSteps.play(this.Player.Player, this.socketService.socketId)) { 
          var card: Card = event.previousContainer.data[event.previousIndex];
          if (await this.gameRules.canPlaceOnStair(event.container.data, card)) {
            transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex );
            event.container.data.sort((a, b) => a.numericValue - b.numericValue);
            await this.playInStairMultiplayer();
            if (await this.gameRules.canGetMoreCardsInTheCurrentTurn(this.game.playerHand)) {
              await this.startNewMPTurn();
            }
          }
          else { this.notificationService.show(`⚠ Movimiento No Permitido`); }
        }       
      } else {
        if (await this.gameRules.canDiscardToPile(this.game.playerHand)) {
          if (await this.gameSteps.discard(CurrentPlayerType.Player, this.socketService.socketId)) {
            const card = event.previousContainer.data[event.previousIndex];
            event.previousContainer.data.splice(event.previousIndex, 1);
            event.container.data.push(card);
            await this.playInStairMultiplayer();
          }
        } else { this.notificationService.show('⚠ Juega Primero el As'); }
      } 
    }
  }
  //Control BehaviorSubject
  isNameValid(): boolean {
    return this.playerName.trim().length >= 3;
  }
}