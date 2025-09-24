import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Subject } from 'rxjs';
import { GameService } from './game.service';
import { environment } from '../../enviroments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket;
  public socketId: string = "non-multiplayer";
  private gameServerData: any
  private rivalRequestedRematch = false;

  startTurn$ = new Subject<void>();

  public currentPlayerId$ = new BehaviorSubject<string>("non-multiplayer");
  public opponentName$ = new BehaviorSubject<string>("Oponente");
  public room$ = new BehaviorSubject<string>("");

  private gameStatus = new BehaviorSubject<string>("idle"); // idle | waiting | ready | full
  gameStatus$ = this.gameStatus.asObservable();

  constructor(private gameService: GameService, ) {
    this.socket = io("https://azes-game.onrender.com", { transports: ["websocket"], reconnection: true,   reconnectionAttempts: Infinity, reconnectionDelay: 1000 });
    //this.socket = io("http://localhost:3000", { transports: ["websocket"], reconnection: true,   reconnectionAttempts: Infinity, reconnectionDelay: 1000 });
    this.socket.on("identification", (data) => {
      this.socketId = data.socketId;
    });
    this.socket.on("waiting", (data) => {
      this.gameStatus.next("waiting");
    });
    this.socket.on("ready", (data) => {
      this.room$.next(data.gameState.roomId);
      this.gameStatus.next("ready");
      this.currentPlayerId$.next(data.gameState.currentPlayerId);
      this.updateGameState(data.gameState);
    });
    this.socket.on("opponentPlayed", (data) => {
      this.updateGameState(data.gameState);
    });
    this.socket.on("displayOpponentName", (data) => {
      this.opponentName$.next(data.opponentName);
    });
    this.socket.on("newCurrentPlayer", (data) => {
      this.currentPlayerId$.next(data.newCurrentPlayer);
      this.gameServerData.currentPlayerId = data.newCurrentPlayer;
      this.startTurn$.next();
    });
    this.socket.on("lose", (data) => {
      this.gameService.gameResult$.next(this.opponentName$.getValue());
    });
    this.socket.on("tie", (data) => {
      this.gameService.gameResult$.next("empate");
    });
    this.socket.on("rematchAccepted", (data) => {
      this.gameService.gameResult$.next(null)
      this.updateGameState(data.gameState);
    });
    this.socket.on("requestRematch", (data) => {
      this.rivalRequestedRematch = true;
    });
    this.socket.on("checkUpdate", (data) => {
      this.updateGameState(data.gameState);
    });
    this.socket.on("getGameState", (data) => {
      console.log("Estado recibido del server:", this.room$.getValue());
      const me = Object.keys(data.gameState.playerHands).find(id => id === this.socketId);
      if (me === this.socketId){
        console.log("Estas en el room:",this.room$.getValue());
        this.socket.emit('rejoin', this.gameServerData.roomId);
        if (JSON.stringify(data.gameState.playerPiles[this.socketId]) !== JSON.stringify(this.gameService.playerPiles)) {
            //this.socket.emit('rejoin', this.gameServerData.roomId);
        }
      }
    });
  }

  async joinRoom() {
    this.socket.emit('joinRoom');
  }
  async playCard() {
    this.socket.emit('playCard', this.gameServerData);
  }
  async changePlayersOnline() {
    const opponentId = Object.keys(this.gameServerData.playerHands).find(id => id !== this.socketId);
    this.currentPlayerId$.next(opponentId as string);
    this.gameServerData.currentPlayerId = opponentId as string;
    this.socket.emit('changePlayers', this.gameServerData.roomId, opponentId);
  }
  async disconnect() {
    this.socket.disconnect();
  }
  async leaveRoom() {
    this.socket.emit('leaveRoom', this.room$.getValue());
  }
  async updateReShufle() {
    this.gameServerData.deck = this.gameService.deck;
    this.gameServerData.stairs = this.gameService.getStairs;
    this.socket.emit('playCard', this.gameServerData);
  }
  async sendDisplayOpponentName(playerName: string) {
    this.socket.emit('displayOpponentName', this.room$.getValue(), playerName);
  }
  async sendRematch(){
    if(this.rivalRequestedRematch){
      this.rivalRequestedRematch = false;
      this.socket.emit('rematchAccepted', this.room$.getValue());
    } else {
      this.socket.emit('requestRematch', this.room$.getValue());
    }
  }
  async sendWin() {
    this.socket.emit('win', this.gameServerData.roomId);
  }
  async sendTie() {
    this.socket.emit('tie', this.gameServerData.roomId);
  }
  async checkSync() {
    this.socket.emit('getGameState', this.gameServerData.roomId);
  }
  private updateGameState(gameState: any) {
    this.gameServerData = gameState;
    this.gameService.deck = gameState.deck;
    this.gameService.setStairs(gameState.stairs);

    this.gameService.playerDeck = gameState.playerDecks[this.socketId as string];
    this.gameService.playerHand = gameState.playerHands[this.socketId as string];
    this.gameService.playerPiles = gameState.playerPiles[this.socketId as string];

    const opponentId = Object.keys(gameState.playerHands).find(id => id !== this.socketId);
    this.gameService.opponentHand = gameState.playerHands[opponentId as string];
    this.gameService.opponentDeck = gameState.playerDecks[opponentId as string];
    this.gameService.opponentPiles = gameState.playerPiles[opponentId as string];
  }
  async resetValues() {
    this.socketId= "non-multiplayer";
    this.gameServerData = {};
    this.currentPlayerId$.next("non-multiplayer");
    this.opponentName$.next("Oponente");
    this.room$.next("");
    this.gameStatus.next("idle"); // idle | waiting | ready | full
  }
}