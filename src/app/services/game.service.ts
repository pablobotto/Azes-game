/*
-Maneja el estado general del juego: jugadores, cartas en mano, mazos, escaleras, turnos, etc.
-Se encarga de persistir y actualizar el estado del juego.*/
import { Injectable } from '@angular/core';
import { Card } from '../models/card.model';
import { GameZone } from '../enum/game-zone.enum';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GameService {
  private stairs = new BehaviorSubject<Card[][]>([[], [], [], [], [], [], [], []]);
  stairs$ = this.stairs.asObservable();

  deck: Card[] = [];
  playerHand: Card[] = [];
  opponentHand: Card[] = [];
  playerPiles: Card[][] = [[], [], []];
  opponentPiles: Card[][] = [[], [], []];
  playerDeck: Card[] = [];     // las 10 cartas del jugador
  opponentDeck: Card[] = [];   // las 10 cartas del rival
  public gameResult$ = new BehaviorSubject<string | null>(null);

  constructor() {}

  get getStairs(): Card[][] {
    return this.stairs.getValue();
  }
  setStairs(newValue: Card[][]) {
    this.stairs.next(newValue);
  }
  async ResetValues() {
    this.deck = [];
    this.playerHand = [];
    this.opponentHand = [];
    this.playerPiles = [[], [], []];
    this.opponentPiles = [[], [], []];
    this.stairs.next([[], [], [], [], [], [], [], []]);
    this.playerDeck = [];
    this.opponentDeck = [];
  }
  async removeStairAndReShufle(stairIndex: number) {
    // Tomar el 50% de abajo del mazo actual
    const cutIndex = Math.floor(this.deck.length / 2);
    const bottomHalf = this.deck.slice(0 , cutIndex);
    const topHalf = this.deck.slice(cutIndex);
    // Insertar la escalera mezclada dentro del bottomHalf
    let newBottom = bottomHalf.concat(this.stairs.getValue()[stairIndex])
    newBottom.sort(() => Math.random() - 0.5);
    //Quitar todo de la escalera
    const stairs = this.stairs.getValue();
    const updatedStairs = [...stairs]; 
    updatedStairs[stairIndex] = []; 
    this.stairs.next(updatedStairs);
    // Reconstruir el mazo
    this.deck = topHalf.concat(newBottom);
  }
  // Roba una carta del mazo
  drawCard(): Card | null {
    if (this.deck.length === 0) return null;
      const card = this.deck.pop()!;
      card.faceUp = true;
      return card;
  }

  // Devuelve el número de cartas restantes
  getDeckCount(): number { return this.deck.length; }
  getHandPlCount(): number { return this.playerHand.length; }
  getHandOpCount(): number { return this.opponentHand.length; }
  // Mueve una carta entre zonas
  async pushCard(zone: GameZone, card: Card) {
    if (zone === GameZone.PlayerHand) this.playerHand.push(card);
    if (zone === GameZone.OpponentHand) this.opponentHand.push(card);
    if (zone === GameZone.PlayerDeck) this.playerDeck.push(card);
    if (zone === GameZone.OpponentDeck) this.opponentDeck.push(card);
  }
}