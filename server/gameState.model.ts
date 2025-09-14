import { Card } from "./card.model";

export interface GameState {
  roomId: string;
  currentPlayerId?: string;
  deck: Card[];
  stairs: Card[][];
  playerHands: Record<string, Card[]>;
  playerDecks: Record<string, Card[]>;
  playerPiles: Record<string, Card[][]>;
}