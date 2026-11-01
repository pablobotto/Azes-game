import { AfterViewInit, ChangeDetectorRef, Component} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { GameService } from '../../services/game.service';
import { GameRulesService } from '../../services/gameRules.service';
import { Card } from '../../models/card.model';
import { CardComponent } from '../card/card';
import { DeckComponent } from '../deck/deck';
import { GameResultModalComponent } from '../result-modal/result-modal';
import { CdkDragDrop, DragDropModule, transferArrayItem } from '@angular/cdk/drag-drop';
import { GameStepService } from '../../services/gameSteps.service';
import { CurrentPlayerType } from '../../enum/player.enum';
import { GameStep } from '../../enum/game-step.enum';
import { BehaviorSubject, combineLatest, Observable, take, timer } from 'rxjs';
import { SocketService } from '../../services/socket.service';
import { NotificationComponent } from '../notification/notification';
import { NotificationService } from '../../services/notification.service';
import { FakeCardComponent } from '../fake-card/fake-card';
import { OpponentLeftModalComponent } from '../opponent-left-modal/opponent-left-modal';
import { ReconnectModalComponent } from '../internet-connection/internet-connection';
import pkg from '../../../../package.json';
import { DEFAULT_GAME_ID, GAMES, isPlayableGame } from '../../games/game-registry';
import { MoveEffect } from '../../models/effect.model';

/** Carta que vuela por encima del tablero mientras se anima un movimiento del rival. */
interface FlyingCard { card: Card; faceDown: boolean; x0: number; y0: number; x1: number; y1: number; delay: number; moving: boolean; }
const CARD_W = 60;
const CARD_H = 90;
const FLY_MS = 500;
const BACK: Card = { suit: '♠', value: '?', numericValue: 0, id: 'fx-back', faceUp: false };

@Component({
  selector: 'app-board',
  templateUrl: './board.html',
  styleUrls: ['./board.scss'],
  imports: [CommonModule, CardComponent, DeckComponent, FakeCardComponent, NotificationComponent, OpponentLeftModalComponent, ReconnectModalComponent ,GameResultModalComponent, DragDropModule, FormsModule],
})
export class BoardComponent implements AfterViewInit {
  currentPlayerType$: typeof this.gameSteps.currentPlayerType$;
  currentStep$: typeof this.gameSteps.currentStep$;
  stairs$: typeof this.game.stairs$;
  status$: typeof this.socketService.gameStatus$;
  currentPlayerId$: typeof this.socketService.currentPlayerId$;
  opponentName$: typeof this.socketService.opponentName$;
  gameResult$: Observable<string | null>;

  readonly version: string = pkg.version;
  readonly games = GAMES;
  // cartas que ya estan en su lugar pero se ocultan hasta que termina de llegar la que vuela
  fxHidden = new Set<string>();
  flying: FlyingCard[] = [];
  selectedGame: string = DEFAULT_GAME_ID;
  joined = false;
  gameStarted = false;
  playerName: string = '';
  hoverRoom = false;

  gameResult: string | null = null;
  private syncBlock$ = new BehaviorSubject<boolean>(false);
  isSyncButtonBlocked$ = this.syncBlock$.asObservable();

  Player = CurrentPlayerType;
  GameStep = GameStep;

  showOpponentLeftModal: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  isDisconnected: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private order = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  constructor(public socketService: SocketService, public game: GameService, public gameRules: GameRulesService, public gameSteps: GameStepService, public notificationService: NotificationService ,private cd: ChangeDetectorRef) {
    this.currentPlayerType$ = this.gameSteps.currentPlayerType$;
    this.currentStep$ = this.gameSteps.currentStep$;
    this.stairs$ = this.game.stairs$;
    this.status$ = this.socketService.gameStatus$;
    this.currentPlayerId$ = this.socketService.currentPlayerId$;
    this.opponentName$ = this.socketService.opponentName$;
    this.gameResult$ = this.game.gameResult$
  }

  ngAfterViewInit(): void {}

  async ngOnDestroy() {
    this.socketService.disconnect();
  }

  async ngOnInit() {
    // recarga de pestaña con una partida abierta: volver a mostrar el nombre y esperar que el servidor devuelva la partida
    if (this.socketService.restoring) {
      this.playerName = this.socketService.savedName;
      if (isPlayableGame(this.socketService.savedGameId)) this.selectedGame = this.socketService.savedGameId;
      this.joined = true;
    }
    combineLatest([this.gameSteps.currentStep$, this.gameSteps.currentPlayerType$
    ]).subscribe(async ([step, player]) => {
      switch (step) {
        case GameStep.Drawing:
          console.log(`Step actual: ${step}, Jugador actual: ${player}`);          
          this.gameSteps.draw(player, this.socketService.socketId);
          this.cd.detectChanges();
          break;
        case GameStep.Playing:
          if (this.socketService.socketId !== "non-multiplayer") {
            await this.sendDisplayOpponentName();
          }
          console.log(`Step actual: ${step}, Jugador actual: ${player}`);
          this.cd.detectChanges();
          break;
        case GameStep.Discarding:
          console.log(`Step actual: ${step}, Jugador actual: ${player}`);
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
    // movimiento del rival recien confirmado: la carta se oculta ya (antes de dibujar el estado nuevo) y vuela hasta su lugar
    this.socketService.opponentMove$.subscribe(effect => {
      if (effect.kind !== 'draw') this.fxHidden.add(effect.card.id);
      setTimeout(() => this.animateMove(effect), 0);
    });
    this.socketService.startTurn$.subscribe(async () => {
      await this.startNewMPTurn();
    });
    // modo autoritativo: el servidor avisa que gane (el rival recibe "lose" como siempre)
    this.socketService.won$.subscribe(() => {
      this.game.gameResult$.next(this.playerName);
    });
    this.socketService.disconnect$.subscribe(async () => {
      this.showOpponentLeftModal.next(true)
      this.cd.detectChanges();
    });
    this.socketService.room$.subscribe(async () => {
      this.cd.detectChanges();
    });
    this.game.gameResult$.subscribe(result => {
      this.gameResult = result;
      this.cd.detectChanges();
    });
    this.gameSteps.tie$.subscribe(() => {
      this.game.gameResult$.next("empate"); 
      if (this.socketService.socketId !== "non-multiplayer") {
        this.socketService.sendTie();
      }
    });
    this.socketService.internetConnectionLost$.subscribe(() => {
      this.isDisconnected.next(true);
    });
    this.socketService.internetConnectionOn$.subscribe(() => {
      this.isDisconnected.next(false);
    });
    this.socketService.rejoinFailed$.subscribe(async () => {
      this.isDisconnected.next(false);
      this.notificationService.show('No se pudo recuperar la partida. ¡Buscá una nueva!');
      await this.closeMpGame();
      this.cd.detectChanges();
    });
  }

  async joinRoom() {
    this.socketService.setPlayerName(this.playerName);
    await this.socketService.joinRoom(this.selectedGame);
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
  async win() {
    this.game.gameResult$.next(this.playerName); 
    if (this.socketService.socketId !== "non-multiplayer") {
      this.socketService.sendWin();
    }
  }
  async closeMpGame() {
    await this.socketService.leaveRoom();
    await this.resetValues();
    await this.game.ResetValues();
    await this.gameSteps.resetValues();
    await this.socketService.resetValues();
    this.cd.detectChanges();
  }

  async onDragEnd(event: any, i: number, j: number) {
    const element = event.source.element.nativeElement; element.style.position = 'absolute'; this.cd.detectChanges();
    setTimeout(() => this.cd.detectChanges(), 0);
  }

  private static readonly actionErrors: Record<string, string> = {
    not_your_turn: '⚠ No es tu Turno',
    wrong_step: '⚠ Paso incorrecto.',
    illegal_move: '⚠ Movimiento No Permitido',
    ace_first: '⚠ Juega Primero el As',
    offline: '⚠ Sin conexión, intentá de nuevo',
    timeout: '⚠ El servidor no respondió, intentá de nuevo',
  };

  // ---- Efecto de vuelo para los movimientos del rival ----
  private centerOf(el: Element | null): { x: number; y: number } | null {
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }
  private cardEl(id: string): HTMLElement | null {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-card-id]')).find(el => el.dataset['cardId'] === id) ?? null;
  }
  private ghost(card: Card, faceDown: boolean, from: { x: number; y: number }, to: { x: number; y: number }, delay = 0): FlyingCard {
    return { card, faceDown, x0: from.x - CARD_W / 2, y0: from.y - CARD_H / 2, x1: to.x - CARD_W / 2, y1: to.y - CARD_H / 2, delay, moving: false };
  }
  private async animateMove(e: MoveEffect) {
    const ghosts: FlyingCard[] = [];
    try {
      this.cd.detectChanges(); // el estado nuevo ya llego: dibujarlo para medir donde quedo la carta
      const handPos = this.centerOf(document.querySelector('.opponent-cards'));
      const deckArea = this.centerOf(document.querySelector('.deck-area'));
      if (e.kind === 'draw') {
        if (handPos && deckArea) {
          for (let i = 0; i < Math.min(e.count, 5); i++) ghosts.push(this.ghost(BACK, true, deckArea, handPos, i * 120));
          for (const idx of e.reshuffled) {
            const from = this.centerOf(document.getElementById('stair' + (idx + 1)));
            if (from) ghosts.push(this.ghost(BACK, true, from, deckArea));
          }
        }
      } else {
        const target = this.centerOf(this.cardEl(e.card.id));
        let source = handPos;
        if (e.kind === 'play' && e.from === 'deck') {
          const r = document.querySelector('.opponent-deck')?.getBoundingClientRect();
          source = r ? { x: r.left + CARD_W / 2, y: r.top + CARD_H / 2 } : handPos;
        } else if (e.kind === 'play' && e.from === 'pile') {
          source = this.centerOf(document.querySelectorAll('.opponent-piles .pile-slot')[e.pileIdx ?? 0] ?? null) ?? handPos;
        }
        if (source && target) ghosts.push(this.ghost(e.card, false, source, target));
      }
      if (ghosts.length === 0) return;
      this.flying = [...this.flying, ...ghosts];
      this.cd.detectChanges();
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      ghosts.forEach(g => g.moving = true);
      this.cd.detectChanges();
      await new Promise(r => setTimeout(r, FLY_MS + Math.max(...ghosts.map(g => g.delay)) + 40));
    } catch (err) {
      console.warn('No se pudo animar el movimiento', err);
    } finally {
      // pase lo que pase la carta tiene que quedar visible
      if (e.kind !== 'draw') this.fxHidden.delete(e.card.id);
      this.flying = this.flying.filter(f => !ghosts.includes(f));
      this.cd.detectChanges();
    }
  }

  // Modo autoritativo: no se mueve nada localmente. Se pide la accion y el estado vuelve del servidor.
  private async dropAuthoritative(event: CdkDragDrop<Card[]>) {
    const card: Card = event.previousContainer.data[event.previousIndex];
    const targetId = event.container.id;
    let res;
    if (targetId.startsWith('stair')) {
      if (!await this.gameSteps.play(this.Player.Player, this.socketService.socketId)) return;
      res = await this.socketService.sendAction({ type: 'play', cardId: card.id, stairIdx: Number(targetId.slice('stair'.length)) - 1 });
    } else {
      if (!this.gameSteps.canDiscard(CurrentPlayerType.Player, this.socketService.socketId)) return;
      res = await this.socketService.sendAction({ type: 'discard', cardId: card.id, pileIdx: Number(targetId.slice('pile'.length)) });
    }
    if (res.error) this.notificationService.show(BoardComponent.actionErrors[res.error] ?? '⚠ Movimiento No Permitido');
  }

  async drop(event: CdkDragDrop<Card[]>) {
    if (event.previousContainer !== event.container && this.socketService.authoritative) {
      await this.dropAuthoritative(event);
      this.cd.detectChanges();
      return;
    }
    if (event.previousContainer === event.container) {this.cd.detectChanges();} else {
      if (event.container.id.startsWith('stair')) {
        if (await this.gameSteps.play(this.Player.Player, this.socketService.socketId)) { 
          var card: Card = event.previousContainer.data[event.previousIndex];
          if (await this.gameRules.canPlaceOnStair(event.container.data, card)) {
            transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex );
            event.container.data.sort((a, b) => a.numericValue - b.numericValue);
            await this.playInStairMultiplayer();
            if (this.game.playerDeck.length === 0) {
              this.win();
            } else {
            if (await this.gameRules.canGetMoreCardsInTheCurrentTurn(this.game.playerHand)) {
              await this.startNewMPTurn();
            }}
          }
          else { this.notificationService.show(`⚠ Movimiento No Permitido`); }
        }       
      } else {
        if (await this.gameRules.canDiscardToPile(this.game.playerHand)) {
          if (this.gameSteps.canDiscard(CurrentPlayerType.Player, this.socketService.socketId)) {
            const card = event.previousContainer.data[event.previousIndex];
            event.previousContainer.data.splice(event.previousIndex, 1);
            event.container.data.push(card);
            // primero se envia el descarte y recien despues discard() pasa el turno
            await this.playInStairMultiplayer();
            await this.gameSteps.discard(CurrentPlayerType.Player, this.socketService.socketId);
          }
        } else { this.notificationService.show('⚠ Juega Primero el As'); }
      } 
    }
    await new Promise(resolve => setTimeout(resolve, 20));
    this.cd.detectChanges();
  }
  
  //Control BehaviorSubject
  isNameValid(): boolean {
    return this.playerName.trim().length >= 3;
  }
  closeModal() {
    this.game.gameResult$.next(null);
    this.closeMpGame();
  }
  async resetValues() {
    this.hoverRoom = false;
    this.joined = false;
    this.gameStarted = false;
    this.playerName = '';
    this.gameResult = null;
  }
  hasComodin(stair: Card[] | undefined): boolean {
    return !!stair?.some(c => c.value === 'C');
  }
  getCardDisplayValue(numericValue: number): string {
    return this.order[numericValue-1] || '?';
  }
  syncGame() {
    if (this.syncBlock$.value) return;
    this.syncBlock$.next(true);
    this.socketService.checkSync();
    timer(2500)
      .pipe(take(1))
      .subscribe(() => this.syncBlock$.next(false));
  }
}
