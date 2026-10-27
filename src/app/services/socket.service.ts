import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Subject } from 'rxjs';
import { GameService } from './game.service';
import { environment } from '../../enviroments/environment';

// Cuanto espera el cliente la respuesta del servidor a un rejoin antes de rendirse.
const REJOIN_TIMEOUT_MS = 20000;
type StateMode = 'full' | 'opponent' | 'rejoin';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket;
  // Identidad estable del jugador (la genera el cliente y el servidor la usa como id). No cambia al reconectar.
  private readonly playerId: string = SocketService.newPlayerId();
  public socketId: string = "non-multiplayer";
  private gameServerData: any
  private rivalRequestedRematch = false;

  startTurn$ = new Subject<void>();
  disconnect$ = new Subject<void>();
  internetConnectionLost$ = new Subject<void>();
  internetConnectionOn$ = new Subject<void>();
  rejoinFailed$ = new Subject<void>();
  opponentOffline$ = new BehaviorSubject<boolean>(false);
  private rejoinTimeout: any = null;

  public currentPlayerId$ = new BehaviorSubject<string>("non-multiplayer");
  public opponentName$ = new BehaviorSubject<string>("Oponente");
  public room$ = new BehaviorSubject<string>("");

  private gameStatus = new BehaviorSubject<string>("idle"); // idle | waiting | ready | full
  gameStatus$ = this.gameStatus.asObservable();
  private lastGameId = 'azes';

  constructor(private gameService: GameService, ) {
    this.socket = io(environment.apiUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: { playerId: this.playerId },
    });
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
      this.updateGameState(data.gameState, 'full');
    });
    this.socket.on("opponentPlayed", (data) => {
      this.updateGameState(data.gameState, 'opponent');
    });
    this.socket.on("displayOpponentName", (data) => {
      this.opponentName$.next(data.opponentName);
    });
    this.socket.on("newCurrentPlayer", (data) => {
      this.currentPlayerId$.next(data.newCurrentPlayer);
      if (this.gameServerData) {
        this.gameServerData.currentPlayerId = data.newCurrentPlayer;
        if (typeof data.turn === 'number') this.gameServerData.turn = data.turn;
      }
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
      this.updateGameState(data.gameState, 'full');
    });
    this.socket.on("requestRematch", (data) => {
      this.rivalRequestedRematch = true;
    });
    // Resincronizacion pedida (boton) o corregida por el servidor: manda el servidor.
    this.socket.on("stateSync", (data) => {
      this.updateGameState(data.gameState, 'full');
    });
    this.socket.on("rejoined", (data) => {
      this.clearRejoinTimeout();
      this.socketId = data.socketId;
      this.handleRejoined(data.gameState);
      this.internetConnectionOn$.next();
    });
    this.socket.on("rejoinFailed", () => {
      this.clearRejoinTimeout();
      this.rejoinFailed$.next();
    });
    this.socket.on("opponentOffline", () => {
      this.opponentOffline$.next(true);
    });
    this.socket.on("opponentOnline", () => {
      this.opponentOffline$.next(false);
    });
    this.socket.on('opponentLeft', (data) => {
      console.log("desconectado")
      this.opponentOffline$.next(false);
      this.disconnect$.next();
    });
    this.socket.on("connect", () => {
      console.log("Conectado al servidor:", this.socket.id);
      if (this.room$.getValue() && this.gameStatus.getValue() === 'ready') {
        // partida en curso: pedir volver a ella (el servidor nos reconoce por playerId)
        this.clearRejoinTimeout();
        this.socket.emit('rejoin', this.room$.getValue());
        this.rejoinTimeout = setTimeout(() => {
          this.rejoinTimeout = null;
          this.rejoinFailed$.next();
        }, REJOIN_TIMEOUT_MS);
      } else {
        if (this.gameStatus.getValue() === 'waiting') {
          // el servidor saca de la sala de espera a quien se cae; volvemos a pedir lugar
          this.socket.emit('joinRoom', this.lastGameId);
        }
        this.internetConnectionOn$.next();
      }
    });
    this.socket.on("disconnect", (reason) => {
      console.warn("Se desconectó:", reason);
      this.clearRejoinTimeout();
      // un disconnect() voluntario no es una caida de internet
      if (reason !== 'io client disconnect') {
        this.internetConnectionLost$.next();
      }
    });
    this.socket.on("connect_error", (err) => {
      console.error("Error de conexión:", err.message);
    });
    // Los celulares duermen las pestañas: al volver, reconectar sin esperar el backoff.
    if (typeof window !== 'undefined') {
      const wake = () => { if (!this.socket.connected && !this.socket.active) this.socket.connect(); };
      window.addEventListener('online', wake);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
    }
  }

  private static newPlayerId(): string {
    const c: any = typeof crypto !== 'undefined' ? crypto : null;
    if (c?.randomUUID) return c.randomUUID();
    return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  private clearRejoinTimeout() {
    if (this.rejoinTimeout) clearTimeout(this.rejoinTimeout);
    this.rejoinTimeout = null;
  }

  async joinRoom(gameId: string = 'azes') {
    this.lastGameId = gameId;
    this.socket.emit('joinRoom', gameId);
  }
  async playCard() {
    if (!this.gameServerData?.roomId) return;
    this.socket.emit('playCard', this.gameServerData);
  }
  async changePlayersOnline() {
    const opponentId = Object.keys(this.gameServerData.playerHands).find(id => id !== this.socketId);
    const fromTurn = this.gameServerData.turn ?? 0;
    this.currentPlayerId$.next(opponentId as string);
    this.gameServerData.currentPlayerId = opponentId as string;
    this.gameServerData.turn = fromTurn + 1;
    this.socket.emit('changePlayers', this.gameServerData.roomId, opponentId, fromTurn);
  }
  async disconnect() {
    this.socket.disconnect();
  }
  async leaveRoom() {
    this.socket.emit('leaveRoom', this.room$.getValue());
  }
  async updateReShufle() {
    if (!this.gameServerData?.roomId) return;
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

  // Tras reconectar: cada lado conserva lo que solo el puede haber cambiado.
  private handleRejoined(serverState: any) {
    const me = this.socketId;
    const prev = this.gameServerData;
    const sameMatch = !!prev && prev.matchId === serverState.matchId;
    const localTurn = typeof prev?.turn === 'number' ? prev.turn : 0;
    const serverTurn = typeof serverState.turn === 'number' ? serverState.turn : 0;
    const wasMyTurnLocal = this.currentPlayerId$.getValue() === me;
    // Mi cambio de turno se perdio en el aire: el servidor cree que sigo siendo yo.
    const turnChangeLost = sameMatch && localTurn > serverTurn && !wasMyTurnLocal && serverState.currentPlayerId === me;
    const keepShared = sameMatch && wasMyTurnLocal && serverState.currentPlayerId === me;

    this.updateGameState(serverState, sameMatch ? 'rejoin' : 'full', keepShared || turnChangeLost);
    if (!sameMatch) {
      this.currentPlayerId$.next(serverState.currentPlayerId);
      if (serverState.currentPlayerId === me) this.startTurn$.next();
      return;
    }
    // Reenviar mis zonas por si algun mensaje mio no llego, y luego el cambio de turno pendiente.
    this.socket.emit('playCard', this.gameServerData);
    if (turnChangeLost) {
      const opponentId = Object.keys(this.gameServerData.playerHands).find(id => id !== me);
      this.gameServerData.currentPlayerId = opponentId;
      this.gameServerData.turn = localTurn;
      this.socket.emit('changePlayers', this.gameServerData.roomId, opponentId, serverTurn);
      return;
    }
    this.gameServerData.turn = Math.max(localTurn, serverTurn);
    this.currentPlayerId$.next(serverState.currentPlayerId);
    this.gameServerData.currentPlayerId = serverState.currentPlayerId;
    // Si el turno cambio a mi mientras estaba offline lo arranco; si ya lo estaba jugando no lo reinicio.
    if (serverState.currentPlayerId === me && !wasMyTurnLocal) {
      this.startTurn$.next();
    }
  }

  // mode:
  //  full     -> el estado del servidor manda completo (inicio, revancha, resincronizacion)
  //  opponent -> mensaje del rival: conservo mis zonas (solo yo las modifico) y, si es mi turno, tambien las compartidas
  //  rejoin   -> como opponent pero la decision sobre las compartidas la toma el llamador
  private updateGameState(gameState: any, mode: StateMode = 'full', keepShared?: boolean) {
    const me = this.socketId as string;
    const prev = this.gameServerData;
    let next = gameState;
    if (mode !== 'full' && prev && prev.matchId === gameState.matchId && prev.playerHands?.[me]) {
      const keepSharedZones = keepShared ?? (this.currentPlayerId$.getValue() === me);
      next = {
        ...gameState,
        playerHands: { ...gameState.playerHands, [me]: prev.playerHands[me] },
        playerDecks: { ...gameState.playerDecks, [me]: prev.playerDecks[me] },
        playerPiles: { ...gameState.playerPiles, [me]: prev.playerPiles[me] },
        deck: keepSharedZones ? prev.deck : gameState.deck,
        stairs: keepSharedZones ? prev.stairs : gameState.stairs,
      };
      // el contador de turnos nunca retrocede por un mensaje atrasado
      if (typeof prev.turn === 'number' && prev.turn > (gameState.turn ?? 0)) next.turn = prev.turn;
      if (mode === 'opponent' && this.currentPlayerId$.getValue() === me) next.currentPlayerId = prev.currentPlayerId;
    }
    this.gameServerData = next;
    this.gameService.deck = next.deck;
    this.gameService.setStairs(next.stairs);

    this.gameService.playerDeck = next.playerDecks[me];
    this.gameService.playerHand = next.playerHands[me];
    this.gameService.playerPiles = next.playerPiles[me];

    const opponentId = Object.keys(next.playerHands).find(id => id !== me);
    this.gameService.opponentHand = next.playerHands[opponentId as string];
    this.gameService.opponentDeck = next.playerDecks[opponentId as string];
    this.gameService.opponentPiles = next.playerPiles[opponentId as string];
  }
  async resetValues() {
    this.socketId= "non-multiplayer";
    this.gameServerData = {};
    this.currentPlayerId$.next("non-multiplayer");
    this.opponentName$.next("Oponente");
    this.room$.next("");
    this.gameStatus.next("idle"); // idle | waiting | ready | full
    this.opponentOffline$.next(false);
  }
}
