/*
 * Vista por jugador e invariante de cartas de Chinchon.
 *
 * viewFor: cada uno ve su mano y el descarte (que esta boca arriba); de los rivales solo la cantidad de
 * cartas, y del mazo solo cuantas quedan. Al terminar la ronda las manos se muestran.
 */
import { Card } from "../../card.model";
import { ChinchonState } from "./actions";
import { HAND_SIZE, TOTAL_CARDS } from "./rules";

const hidden = (prefix: string, count: number): Card[] =>
  Array.from({ length: count }, (_, i) => ({ suit: "♠", value: "?", numericValue: 0, id: `${prefix}#${i}`, faceUp: false }));

export function viewFor(state: ChinchonState, playerId: string): ChinchonState {
  const reveal = state.phase === "roundEnd";
  const hands: Record<string, Card[]> = {};
  for (const id of Object.keys(state.hands)) {
    hands[id] = reveal || id === playerId ? state.hands[id] : hidden(`hand-${id}`, state.hands[id].length);
  }
  return { ...state, deck: hidden("central", state.deck.length), hands };
}

/** Devuelve un texto con el problema si el estado perdio, duplico o invento cartas; null si esta bien. */
export function checkInvariant(state: ChinchonState): string | null {
  const ids: string[] = [];
  const add = (cards: Card[]) => cards.forEach(c => ids.push(c.id));
  add(state.deck);
  add(state.discard);
  Object.values(state.hands).forEach(add);
  if (ids.length !== TOTAL_CARDS) return `hay ${ids.length} cartas en vez de ${TOTAL_CARDS}`;
  if (new Set(ids).size !== ids.length) return "hay cartas repetidas";
  for (const [id, hand] of Object.entries(state.hands)) {
    const extra = state.phase === "discarding" && id === state.currentPlayerId ? 1 : 0;
    if (hand.length !== HAND_SIZE + extra) return `la mano de ${id} tiene ${hand.length} cartas`;
  }
  return null;
}
