import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { GameService } from './game.service';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket;
  public gameStatus$ = new BehaviorSubject<string>("idle"); // idle | waiting | ready | full
  public socketId!: String;
  
  constructor(private gameService: GameService, ) {
    this.socket = io('http://localhost:3000');
    this.socket.on("identification", (data) => {
      this.socketId = data.socketId;
    });
    this.socket.on("waiting", (data) => {
      this.gameStatus$.next("waiting");
    });
    this.socket.on("ready", (data) => {
      this.gameStatus$.next("ready");
      console.log('Game ready:', data);
      this.gameService.deck = data.gameState.deck;
      this.gameService.playerDeck = data.gameState.playerDecks[this.socketId as string];
      this.gameService.setStairs(data.gameState.stairs);
      this.gameService.playerHand = data.gameState.playerHands[this.socketId as string];
      const opponentId = Object.keys(data.gameState.playerHands).find(id => id !== this.socketId);
      console.log('Opponent ID:', opponentId);
      this.gameService.opponentHand = data.gameState.playerHands[opponentId as string];
      this.gameService.opponentDeck = data.gameState.playerDecks[opponentId as string]

    });
    this.socket.on("full", () => {
      this.gameStatus$.next("full");
    });
  }

  async joinRoom(roomId: string) {
    this.socket.emit('joinRoom', roomId);
  }

  async playCard(roomId: string, card: any, stairIndex: number) {
    this.socket.emit('playCard', { roomId, card, stairIndex });
  }

  async disconnect() {
    this.socket.disconnect();
  }

  onJoined(): Observable<any> {
    return new Observable(sub => {
      this.socket.on('joined', (data) => sub.next(data));
    });
  }

  onStartGame(): Observable<any> {
    return new Observable(sub => {
      this.socket.on('startGame', (data) => sub.next(data));
    });
  }

  onOpponentPlayed(): Observable<any> {
    return new Observable(sub => {
      this.socket.on('opponentPlayed', (data) => sub.next(data));
    });
  }

  onRoomFull(): Observable<void> {
    return new Observable(sub => {
      this.socket.on('roomFull', () => sub.next());
    });
  }
  
}