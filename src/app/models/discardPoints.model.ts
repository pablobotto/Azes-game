import { Card } from "./card.model";

export interface DiscardPoints {
  card: Card;
  idPile: number;
  points: number;
}