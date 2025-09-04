/*
-Contiene la lógica de validación:
  ¿Se puede poner un 2 sobre un A?
  ¿Se puede tirar esta carta en esta escalera?
  ¿Es el turno correcto del jugador?
-Nunca modifica estado, sólo responde con true/false o errores de validación.
*/
import { Injectable } from "@angular/core";
import { Card } from "../models/card.model";

@Injectable({ providedIn: 'root' })
export class GameRulesService {
  private order = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  constructor() {}

  // Devuelve true si la carta puede colocarse en esta escalera
  async canPlaceOnStair(stair: Card[], card: Card): Promise<boolean> {
    if (stair.length === 0) {
      return card.value === 'A'; // Solo A puede iniciar la escalera
    } else {
      const lastCard = stair[stair.length - 1];
      return await this.isNextInSequence(lastCard, card);
    }
  }
  private async isNextInSequence(prev: Card, next: Card): Promise<boolean> {
    const prevIndex = this.order.indexOf(prev.value);
    const nextIndex = this.order.indexOf(next.value);
    return nextIndex === prevIndex + 1;
  }
}