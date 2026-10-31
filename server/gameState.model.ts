import { Card } from "./card.model";

export interface GameState {
  roomId: string;
  currentPlayerId?: string;
  // Contador de partidas de la sala (se incrementa en cada reparto). Lo mantiene el servidor.
  matchId?: number;
  // Contador de cambios de turno. Lo mantiene el servidor; permite que un cambio de turno reenviado sea idempotente.
  turn?: number;
  // Modo autoritativo (fase 2): el servidor aplica las acciones y difunde el estado; el cliente no manda snapshots.
  authoritative?: boolean;
  // Contador de cambios del estado en modo autoritativo; el cliente descarta estados con version menor a la que ya tiene.
  version?: number;
  // Paso del turno del jugador actual en modo autoritativo.
  phase?: "drawing" | "playing";
  deck: Card[];
  stairs: Card[][];
  playerHands: Record<string, Card[]>;
  playerDecks: Record<string, Card[]>;
  playerPiles: Record<string, Card[][]>;
}
