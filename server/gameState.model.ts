import { Card } from "./card.model";

export interface GameState {
  deck: Card[];
  stairs: Card[][];
  playerHands: Record<string, Card[]>; // clave: socketId
  playerDecks: Record<string, Card[]>;
}