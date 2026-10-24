import { Card } from "./card.model";

export interface GameState {
  roomId: string;
  currentPlayerId?: string;
  // Contador de partidas de la sala (se incrementa en cada reparto). Lo mantiene el servidor.
  matchId?: number;
  // Contador de cambios de turno. Lo mantiene el servidor; permite que un cambio de turno reenviado sea idempotente.
  turn?: number;
  deck: Card[];
  stairs: Card[][];
  playerHands: Record<string, Card[]>;
  playerDecks: Record<string, Card[]>;
  playerPiles: Record<string, Card[][]>;
}
