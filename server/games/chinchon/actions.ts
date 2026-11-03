/*
 * Estado, reparto y acciones de Chinchon (modo autoritativo desde el principio: no hay camino viejo).
 *
 * Flujo de un turno: 'drawing' -> draw (del mazo o del tope del descarte) -> 'discarding' (8 cartas) ->
 *   discard (pasa el turno) | close (descarta y cierra si las sueltas restantes suman menos de 5).
 * Fin de ronda: 'roundEnd' con las manos a la vista; cuando todos mandan nextRound se reparte la siguiente.
 * Fin de partida: quien llega o pasa 100 pierde (gana el de menos puntos), o un chinchon gana al instante.
 */
import { Card } from "../../card.model";
import { RoomState } from "../../gameState.model";
import { ActionOutcome } from "../azes/actions";
import { defaultShuffle, Shuffler } from "../azes/rules";
import * as rules from "./rules";

export type ChinchonAction =
  | { type: "draw"; from: "deck" | "discard" }
  | { type: "discard"; cardId: string }
  | { type: "close"; cardId: string }
  | { type: "nextRound" };

export interface RoundSummary {
  closerId: string;
  chinchon: boolean;
  hands: Record<string, Card[]>;
  melds: Record<string, Card[][]>;
  loose: Record<string, number>;   // puntos sueltos de cada uno
  delta: Record<string, number>;   // lo que suma (o resta) cada uno a su puntaje
}

export interface ChinchonState extends RoomState {
  phase?: "drawing" | "discarding" | "roundEnd";
  deck: Card[];                    // se roba del final (tope = ultimo)
  discard: Card[];                 // tope = ultimo
  hands: Record<string, Card[]>;
  scores: Record<string, number>;
  round: number;
  dealerId?: string;
  ready: string[];                 // quienes ya vieron el fin de ronda
  last?: RoundSummary;
}

export function emptyState(roomId: string): ChinchonState {
  return { roomId, deck: [], discard: [], hands: {}, scores: {}, round: 0, ready: [] };
}

export function addPlayer(state: ChinchonState, playerId: string): void {
  state.hands = { ...state.hands, [playerId]: [] };
  state.scores = { ...state.scores, [playerId]: 0 };
}

const seats = (s: ChinchonState) => Object.keys(s.hands);
const nextSeat = (s: ChinchonState, id: string) => { const p = seats(s); return p[(p.indexOf(id) + 1) % p.length]; };

/** Reparte una ronda nueva: 7 cartas a cada uno y la primera del mazo al descarte. Empieza el que sigue al repartidor. */
function dealRound(state: ChinchonState, shuffle: Shuffler): void {
  const players = seats(state);
  const deck = rules.buildDeck();
  shuffle(deck);
  state.round += 1;
  state.dealerId = players[(state.round - 1) % players.length];
  for (const id of players) state.hands[id] = [];
  for (let i = 0; i < rules.HAND_SIZE; i++) players.forEach(id => state.hands[id].push({ ...deck.pop()!, faceUp: true }));
  const top = deck.pop()!;
  top.faceUp = true;
  state.deck = deck;
  state.discard = [top];
  state.currentPlayerId = nextSeat(state, state.dealerId);
  state.phase = "drawing";
  state.ready = [];
  state.last = undefined;
}

/** Inicio y revancha: puntajes en cero y primera ronda. */
export function startMatch(state: ChinchonState, shuffle: Shuffler = defaultShuffle): void {
  if (seats(state).length < 2) return;
  for (const id of seats(state)) state.scores[id] = 0;
  state.round = 0;
  dealRound(state, shuffle);
}

function takeFromHand(hand: Card[], cardId: unknown): number {
  return typeof cardId === "string" ? hand.findIndex(c => c.id === cardId) : -1;
}

/** Cierra la ronda: puntua, y devuelve el resultado de la partida si termino. */
function endRound(state: ChinchonState, closerId: string): ActionOutcome {
  const players = seats(state);
  const summary: RoundSummary = { closerId, chinchon: rules.isChinchon(state.hands[closerId]), hands: {}, melds: {}, loose: {}, delta: {} };
  for (const id of players) {
    const split = rules.bestSplit(state.hands[id]);
    summary.hands[id] = state.hands[id].map(c => ({ ...c, faceUp: true }));
    summary.melds[id] = split.melds;
    summary.loose[id] = split.loose;
    summary.delta[id] = id === closerId && split.loose === 0 ? rules.CLOSE_BONUS : split.loose;
  }
  for (const id of players) state.scores[id] += summary.delta[id];
  state.last = summary;
  state.phase = "roundEnd";
  state.ready = [];

  if (summary.chinchon) return { result: { type: "win", winnerId: closerId } };
  if (players.some(id => state.scores[id] >= rules.TARGET_SCORE)) {
    const lowest = Math.min(...players.map(id => state.scores[id]));
    const winners = players.filter(id => state.scores[id] === lowest);
    return winners.length === 1 ? { result: { type: "win", winnerId: winners[0] } } : { result: { type: "tie" } };
  }
  return {};
}

/** Aplica la accion sobre el estado (lo muta solo si la accion es valida). */
export function applyAction(
  state: ChinchonState, playerId: string, raw: unknown, shuffle: Shuffler = defaultShuffle,
): ActionOutcome {
  const a = raw as ChinchonAction | null;
  if (!a || typeof a !== "object" || !state.hands[playerId]) return { error: "bad_action" };

  if (a.type === "nextRound") {
    if (state.phase !== "roundEnd") return { error: "wrong_step" };
    if (!state.ready.includes(playerId)) state.ready.push(playerId);
    if (state.ready.length === seats(state).length) dealRound(state, shuffle);
    return {};
  }

  if (state.currentPlayerId !== playerId) return { error: "not_your_turn" };
  const hand = state.hands[playerId];

  if (a.type === "draw") {
    if (state.phase !== "drawing") return { error: "wrong_step" };
    if (a.from !== "deck" && a.from !== "discard") return { error: "bad_action" };
    let effect: ActionOutcome["effect"];
    if (a.from === "discard") {
      if (state.discard.length === 0) return { error: "illegal_move" };
      const taken = { ...state.discard.pop()!, faceUp: true };
      hand.push(taken);
      effect = { kind: "draw", playerId, from: "discard", card: taken }; // el descarte es publico
    } else {
      let reshuffled = false;
      if (state.deck.length === 0) {
        reshuffled = true;
        // se mezcla el descarte menos su tope y se sigue
        if (state.discard.length < 2) return { error: "deck_empty" };
        const top = state.discard.pop()!;
        state.deck = state.discard.map(c => ({ ...c, faceUp: false }));
        shuffle(state.deck);
        state.discard = [top];
      }
      hand.push({ ...state.deck.pop()!, faceUp: true });
      effect = { kind: "draw", playerId, from: "deck", reshuffled }; // no se dice cual carta es
    }
    state.phase = "discarding";
    return { effect };
  }

  if (a.type === "discard" || a.type === "close") {
    if (state.phase !== "discarding") return { error: "wrong_step" };
    const index = takeFromHand(hand, a.cardId);
    if (index === -1) return { error: "illegal_move" };
    if (a.type === "close" && rules.bestSplit(hand.filter((_, i) => i !== index)).loose >= rules.CLOSE_BELOW) {
      return { error: "cannot_close" };
    }
    const [card] = hand.splice(index, 1);
    card.faceUp = true;
    state.discard.push(card);
    if (a.type === "discard") {
      state.currentPlayerId = nextSeat(state, playerId);
      state.turn = (state.turn ?? 0) + 1;
      state.phase = "drawing";
      return { effect: { kind: "discard", playerId, card } };
    }
    return { ...endRound(state, playerId), effect: { kind: "discard", playerId, card, close: true } };
  }

  return { error: "bad_action" };
}
