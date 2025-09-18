/*
-Contiene la lógica de validación:
  ¿Se puede poner un 2 sobre un A?
  ¿Se puede tirar esta carta en esta escalera?
  ¿Es el turno correcto del jugador?
-Nunca modifica estado, sólo responde con true/false o errores de validación.
*/
import { Injectable } from "@angular/core";
import { Card } from "../models/card.model";
import { GameService } from "./game.service";

@Injectable({ providedIn: 'root' })
export class GameRulesService {
  private order = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  private valueMap: Record<string, number> = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  private reversedValueMap: Record<number, string> = Object.fromEntries(
    Object.entries(this.valueMap).map(([key, value]) => [value, key])
  ) as Record<number, string>;

  constructor() {}

  // Devuelve true si la carta puede colocarse en esta escalera
  async canPlaceOnStair(stair: Card[], card: Card): Promise<boolean> {
    if (stair.length === 0) return card.value === 'A';
    if (card.value === 'C' && await this.HasStairAlreadyJoker(stair)) return false;

    const lastCard = stair[stair.length - 1];
    if (lastCard.value === 'C'){
      const lastNumeric = lastCard.value === 'C' ? lastCard.numericValue : this.valueMap[lastCard.value];
      const cardNumeric = this.valueMap[card.value];
      return cardNumeric === lastNumeric + 1;
    }
    if ( await this.isNextInSequence(lastCard, card)) {
      if (card.value === "C") {
        card.numericValue = this.valueMap[lastCard.value] + 1
      }
      return true;
    } else {
      return false;
    }
  }
  async canDiscardToPile(hand: Card[]): Promise<boolean> {
    return !hand.some(card => card.value === 'A');
  }
  async canGetMoreCardsInTheCurrentTurn(hand: Card[]): Promise<boolean> {
    return hand.length === 0;
  }
  
  private async isNextInSequence(prev: Card, next: Card): Promise<boolean> {
    if (next.value === 'C') {
      return true;
    }
    const prevIndex = this.order.indexOf(prev.value);
    const nextIndex = this.order.indexOf(next.value);
    return nextIndex === prevIndex + 1;
  }
  private async HasStairAlreadyJoker(stair: Card[]): Promise<boolean> {
    if (!stair || stair.length === 0) return false;
    return stair.some(card => card.value === 'C');
  }
}