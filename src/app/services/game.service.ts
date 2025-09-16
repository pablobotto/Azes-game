/*
-Maneja el estado general del juego: jugadores, cartas en mano, mazos, escaleras, turnos, etc.
-Se encarga de persistir y actualizar el estado del juego.*/
import { Injectable } from '@angular/core';
import { Card } from '../models/card.model';
import { GameZone } from '../enum/game-zone.enum';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GameService {
  private suits: ('♠' | '♥' | '♦' | '♣')[] = ['♠', '♥', '♦', '♣'];
  private values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  private valueMap: Record<string, number> = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  private stairs = new BehaviorSubject<Card[][]>([[], [], [], [], [], [], [], []]);
  stairs$ = this.stairs.asObservable();
  private decks = ["A", "B"];

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
  addCardToStair(stairIndex: number, card: Card) {
    const current = this.getStairs.map(s => [...s]); // copia defensiva
    current[stairIndex].push(card);
    this.setStairs(current); // 🔔 dispara el next → UI se refresca
  }

  // Inicia un nuevo juego
  async newGame() {
    this.deck = [];
    this.playerHand = [];
    this.opponentHand = [];
    this.playerPiles = [[], [], []];
    this.opponentPiles = [[], [], []];
    this.stairs.next([[], [], [], [], [], [], [], []]);
    this.playerDeck = [];
    this.opponentDeck = [];

    this.decks.forEach(deckId => {
      this.suits.forEach(suit => {
        this.values.forEach(value => {
          this.deck.push({
            suit,
            value,
            numericValue: this.valueMap[value],
            id: `${suit}${value}#${deckId}`,
            faceUp: false,
          });
        });
      });
    });

    this.shuffle();
    this.dealInitialHands();
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
  // Mezcla el mazo
  async shuffle() {
    this.deck.sort(() => Math.random() - 0.5);
  }

  async removeStairAndReShufle(stairIndex: number) {
    // Tomar el 50% de abajo del mazo actual
    const cutIndex = Math.floor(this.deck.length / 2);
    const bottomHalf = this.deck.slice(cutIndex);
    const topHalf = this.deck.slice(0, cutIndex);
    // Insertar la escalera mezclada dentro del bottomHalf
    const newBottom = bottomHalf.concat(this.stairs.getValue()[stairIndex])
    const stairs = this.stairs.getValue();
    const updatedStairs = [...stairs]; 
    updatedStairs[stairIndex] = []; 
    this.stairs.next(updatedStairs);
    // Reconstruir el mazo
    this.deck = topHalf.concat(newBottom);
  }
  // Reparte cartas iniciales
  async dealInitialHands(initialPlayerHand = 5, initialPlayerDeck = 10) {
    for (let i = 0; i < initialPlayerHand; i++) {
      const playerCard = this.drawCard();
      const opponentCard = this.drawCard();
      if (playerCard) this.playerHand.push(playerCard);
      if (opponentCard) this.opponentHand.push(opponentCard);
    }
    for (let i = 0; i < initialPlayerDeck; i++) {
      const playerCard = this.drawCard();
      const opponentCard = this.drawCard();
      if (playerCard) this.playerDeck.push(playerCard);
      if (opponentCard) this.opponentDeck.push(opponentCard);
    }
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