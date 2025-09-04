/*
-Maneja el estado general del juego: jugadores, cartas en mano, mazos, escaleras, turnos, etc.
-Se encarga de persistir y actualizar el estado del juego.
*/
import { Injectable } from '@angular/core';
import { Card } from '../models/card.model';
import { GameZone } from '../enum/game-zone.enum';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GameService {
  private suits: ('♠' | '♥' | '♦' | '♣')[] = ['♠', '♥', '♦', '♣'];
  private values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  private valueMap: Record<string, number> = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  //private stairs = new BehaviorSubject<Card[][]>([[], [], [], [], [], [], [], []]);
  //stairs$ = this.stairs.asObservable();


  deck: Card[] = [];
  table: Card[] = []; // podríamos renombrar esto después si es para “centro”
  playerHand: Card[] = [];
  opponentHand: Card[] = [];
  playerPiles: Card[][] = [[], [], []];
  opponentPiles: Card[][] = [[], [], []];
  stairs: Card[][] = [[], [], [], [], [], [], [], []]; // zona central donde arrancan las escaleras
  playerDeck: Card[] = [];     // las 10 cartas del jugador
  opponentDeck: Card[] = [];   // las 10 cartas del rival

  constructor() {}
  // Inicia un nuevo juego
  async newGame() {
    this.deck = [];
    this.playerHand = [];
    this.opponentHand = [];
    this.playerPiles = [[], [], []];
    this.opponentPiles = [[], [], []];
    this.stairs = [[], [], [], [], [], [], [], []];
    this.table = [];
    this.playerDeck = [];
    this.opponentDeck = [];

    // Aregar mazo Uno
    this.suits.forEach(suit => {
      this.values.forEach(value => {
        this.deck.push({
          suit,
          value,
          numericValue: this.valueMap[value],
          id: `${suit}${value}#A`,
          faceUp: false,
        });
      });
    });

    // Aregar mazo Dos
    this.suits.forEach(suit => {
      this.values.forEach(value => {
        this.deck.push({
          suit,
          value,
          numericValue: this.valueMap[value],
          id: `${suit}${value}#B`,
          faceUp: false,
        });
      });
    });

    this.shuffle();
    this.dealInitialHands();
  }
  // Mezcla el mazo
  async shuffle() {
    this.deck.sort(() => Math.random() - 0.5);
  }
  // Reparte cartas iniciales
  /*async dealInitialHands(initialPlayerHand = 5, initialPlayerDeck = 10) {
    for (let i = 0; i < initialPlayerHand; i++) {
      const playerCard = this.drawCard();
      if (playerCard) this.playerHand.push(playerCard);

      const opponentCard = this.drawCard();
      if (opponentCard) this.opponentHand.push(opponentCard);
    }
    for (let i = 0; i < initialPlayerDeck; i++) {
      const playerCard = this.drawCard();
      if (playerCard) this.playerDeck.push(playerCard);

      const opponentCard = this.drawCard();
      if (opponentCard) this.opponentDeck.push(opponentCard);
    }
  }*/
  async dealInitialHands(initialPlayerHand = 4, initialPlayerDeck = 4) {
    var opponentCard = this.drawSpecificCard("♥2#A");
    if (opponentCard) this.opponentHand.push(opponentCard);
    var opponentCard = this.drawSpecificCard("♥3#A");
    if (opponentCard) this.opponentHand.push(opponentCard);
    var opponentCard = this.drawSpecificCard("♥4#A");
    if (opponentCard) this.opponentHand.push(opponentCard);
    var opponentCard = this.drawSpecificCard("♥5#A");
    if (opponentCard) this.opponentHand.push(opponentCard);
    var opponentCard = this.drawSpecificCard("♥9#B");
    if (opponentCard) this.opponentHand.push(opponentCard);
    var opponentCard = this.drawSpecificCard("♥A#A");
    if (opponentCard) this.playerHand.push(opponentCard);
    for (let i = 0; i < initialPlayerHand; i++) {
      const playerCard = this.drawCard();
      if (playerCard) this.playerHand.push(playerCard);
    }
    for (let i = 0; i < initialPlayerDeck; i++) {
      const playerCard = this.drawCard();
      if (playerCard) this.playerDeck.push(playerCard);

      const opponentCard = this.drawCard();
      if (opponentCard) this.opponentDeck.push(opponentCard);
    }
    var opponentCard = this.drawSpecificCard("♥7#B");
    if (opponentCard) this.playerDeck.push(opponentCard);
        var opponentCard = this.drawSpecificCard("♥A#B");
    if (opponentCard) this.opponentDeck.push(opponentCard);
        var opponentCard = this.drawSpecificCard("♣J#B");
    if (opponentCard) this.opponentDeck.push(opponentCard);
  }
  // Roba una carta del mazo
  drawCard(): Card | null {
    if (this.deck.length === 0) return null;
      const card = this.deck.pop()!;
      card.faceUp = true;
      return card;
  }
  drawSpecificCard(cardId: string): Card | null {
    const index = this.deck.findIndex(c => c.id === cardId);
    if (index === -1) return null;
    const card = this.deck.splice(index, 1)[0]; // la saco del mazo
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