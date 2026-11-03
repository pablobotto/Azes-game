/*
 * Armado de una sala y reparto de Azes. Es el codigo que antes vivia en server.ts (createNewGame /
 * dealInitialHands), movido sin cambios de comportamiento.
 */
import { Card } from "../../card.model";
import { GameState } from "../../gameState.model";
import { defaultShuffle, drawCard, Shuffler } from "./rules";

export const INITIAL_HAND = 5;
export const INITIAL_PLAYER_DECK = 10;
const STAIR_COUNT = 8;

export function emptyState(roomId: string): GameState {
  return {
    roomId,
    stairs: Array.from({ length: STAIR_COUNT }, () => []),
    deck: [], playerHands: {}, playerDecks: {}, playerPiles: {},
  };
}

export function addPlayer(state: GameState, playerId: string): void {
  state.playerDecks = { ...state.playerDecks, [playerId]: [] };
  state.playerHands = { ...state.playerHands, [playerId]: [] };
  state.playerPiles = { ...state.playerPiles, [playerId]: [[], [], []] };
}

/** Los dos mazos de 52 mas 4 comodines, sin mezclar. */
export function buildDeck(): Card[] {
  const suits: ('♠' | '♥' | '♦' | '♣')[] = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const valueMap: Record<string, number> = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  const deck: Card[] = [];
  ["A", "B"].forEach(deckId => {
    suits.forEach(suit => {
      values.forEach(value => {
        deck.push({ suit, value, numericValue: valueMap[value], id: `${suit}${value}#${deckId}`, faceUp: false });
      });
    });
  });
  for (let i = 1; i <= 4; i++) {
    deck.push({ suit: '⚜', value: 'C', numericValue: 0, id: `C#${i}`, faceUp: false });
  }
  return deck;
}

/** Mezcla y reparte una partida nueva sobre el estado (con los jugadores que ya estan en la sala). */
export function startMatch(state: GameState, shuffle: Shuffler = defaultShuffle): void {
  const deck = buildDeck();
  state.deck = deck;
  shuffle(deck);
  state.phase = "playing";

  const players = Object.keys(state.playerHands);
  if (players.length < 2) return; // minimo de Azes; los jugadores salen del estado, sin tope fijo
  for (const id of players) {
    state.playerHands[id] = [];
    state.playerPiles[id] = [[], [], []];
    state.playerDecks[id] = [];
  }
  state.stairs = Array.from({ length: STAIR_COUNT }, () => []);

  for (let i = 0; i < INITIAL_HAND; i++) {
    players.forEach(id => { const c = drawCard(deck); if (c) state.playerHands[id].push(c); });
  }
  for (let i = 0; i < INITIAL_PLAYER_DECK; i++) {
    players.forEach(id => { const c = drawCard(deck); if (c) state.playerDecks[id].push(c); });
  }
}
