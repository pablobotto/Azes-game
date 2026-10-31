/*
 * Vista por jugador e invariante de cartas (fase 2, modo autoritativo).
 *
 * viewFor: lo que un jugador puede saber del estado. Su mano, su mazo y sus montones completos; del rival
 * solo la cantidad de cartas en mano, su mazo con la carta de arriba visible (como en la mesa real) y sus
 * montones (que estan boca arriba); del mazo central solo la cantidad. Las cartas ocultas son marcadores
 * sin valor, asi el cliente sigue dibujando la misma cantidad de cartas sin conocer cuales son.
 */
import { Card } from "../../card.model";
import { GameState } from "../../gameState.model";

export const TOTAL_CARDS = 108; // 2 mazos de 52 + 4 comodines

const hidden = (prefix: string, count: number): Card[] =>
  Array.from({ length: count }, (_, i) => ({ suit: "♠", value: "?", numericValue: 0, id: `${prefix}#${i}`, faceUp: false }));

export function viewFor(state: GameState, playerId: string): GameState {
  const playerHands: Record<string, Card[]> = {};
  const playerDecks: Record<string, Card[]> = {};
  for (const id of Object.keys(state.playerHands)) {
    if (id === playerId) {
      playerHands[id] = state.playerHands[id];
      playerDecks[id] = state.playerDecks[id];
    } else {
      const deck = state.playerDecks[id];
      playerHands[id] = hidden("hand", state.playerHands[id].length);
      playerDecks[id] = deck.length > 0 ? [...hidden("deck", deck.length - 1), deck[deck.length - 1]] : [];
    }
  }
  return { ...state, deck: hidden("central", state.deck.length), playerHands, playerDecks };
}

/** Devuelve un texto con el problema si el estado perdio, duplico o invento cartas; null si esta bien. */
export function checkInvariant(state: GameState): string | null {
  const ids: string[] = [];
  const add = (cards: Card[]) => cards.forEach(c => ids.push(c.id));
  add(state.deck);
  state.stairs.forEach(add);
  Object.values(state.playerHands).forEach(add);
  Object.values(state.playerDecks).forEach(add);
  Object.values(state.playerPiles).forEach(piles => piles.forEach(add));
  if (ids.length !== TOTAL_CARDS) return `hay ${ids.length} cartas en vez de ${TOTAL_CARDS}`;
  if (new Set(ids).size !== ids.length) return "hay cartas repetidas";
  return null;
}
