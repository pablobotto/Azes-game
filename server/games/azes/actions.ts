/*
 * Acciones de Azes aplicadas en el servidor (fase 2, modo autoritativo).
 *
 * El cliente ya no manda su estado: manda intenciones (draw / play / discard) y el servidor valida turno,
 * paso, posesion de la carta y reglas (rules.ts), aplica el cambio y difunde el estado resultante.
 *
 * Reproduce el flujo del cliente original sin cambiar reglas:
 *  - el jugador que empieza tiene la mano repartida y arranca en 'playing'
 *  - 'drawing' -> draw (completa la mano a 5, devuelve escaleras completas al mazo) -> 'playing'
 *  - 'playing' -> play (carta de la mano, tope del mazo propio o tope de un monton a una escalera)
 *  - si la mano queda vacia el mismo jugador vuelve a 'drawing' (sigue su turno)
 *  - si el mazo propio queda vacio despues de jugar, gana
 *  - 'playing' -> discard (carta de la mano a un monton propio, no si hay un As en la mano) y pasa el turno
 */
import { Card } from "../../card.model";
import { GameState } from "../../gameState.model";
import * as rules from "./rules";

export type AzesAction =
  | { type: "draw" }
  | { type: "play"; cardId: string; stairIdx: number }
  | { type: "discard"; cardId: string; pileIdx: number };

export type ActionError = "bad_action" | "not_your_turn" | "wrong_step" | "illegal_move" | "ace_first";

export interface GameResult {
  type: "win" | "tie";
  winnerId?: string;
}

export interface ActionOutcome {
  error?: ActionError;
  result?: GameResult;
}

const PILE_COUNT = 3;

/** Aplica la accion sobre el estado (lo muta solo si la accion es valida). */
export function applyAction(
  state: GameState, playerId: string, raw: unknown, shuffle: rules.Shuffler = rules.defaultShuffle
): ActionOutcome {
  const action = parseAction(raw, state);
  if (!action) return { error: "bad_action" };
  if (!state.playerHands[playerId]) return { error: "bad_action" };
  if (state.currentPlayerId !== playerId) return { error: "not_your_turn" };

  switch (action.type) {
    case "draw": return draw(state, playerId, shuffle);
    case "play": return play(state, playerId, action.cardId, action.stairIdx);
    case "discard": return discard(state, playerId, action.cardId, action.pileIdx);
  }
}

function draw(state: GameState, playerId: string, shuffle: rules.Shuffler): ActionOutcome {
  if (state.phase !== "drawing") return { error: "wrong_step" };
  const r = rules.drawStep(state.deck, state.stairs, state.playerHands[playerId], shuffle);
  state.deck = r.deck;
  state.stairs = r.stairs;
  if (r.tie) return { result: { type: "tie" } };
  state.phase = "playing";
  return {};
}

function play(state: GameState, playerId: string, cardId: string, stairIdx: number): ActionOutcome {
  if (state.phase !== "playing") return { error: "wrong_step" };
  const source = findPlayableCard(state, playerId, cardId);
  if (!source) return { error: "illegal_move" };
  const stair = state.stairs[stairIdx];
  if (!rules.canPlaceOnStair(stair, source.card)) return { error: "illegal_move" };

  source.zone.splice(source.index, 1);
  stair.push(source.card);
  stair.sort((a, b) => a.numericValue - b.numericValue);

  if (rules.hasWon(state.playerDecks[playerId])) return { result: { type: "win", winnerId: playerId } };
  if (rules.canGetMoreCardsInTheCurrentTurn(state.playerHands[playerId])) state.phase = "drawing";
  return {};
}

function discard(state: GameState, playerId: string, cardId: string, pileIdx: number): ActionOutcome {
  if (state.phase !== "playing") return { error: "wrong_step" };
  const hand = state.playerHands[playerId];
  if (!rules.canDiscardToPile(hand)) return { error: "ace_first" };
  const index = hand.findIndex(c => c.id === cardId);
  if (index === -1) return { error: "illegal_move" };
  const opponentId = Object.keys(state.playerHands).find(id => id !== playerId);
  if (!opponentId) return { error: "bad_action" };

  const [card] = hand.splice(index, 1);
  state.playerPiles[playerId][pileIdx].push(card);
  state.currentPlayerId = opponentId;
  state.turn = (state.turn ?? 0) + 1;
  state.phase = "drawing";
  return {};
}

/**
 * Cartas que se pueden jugar a una escalera: cualquiera de la mano, o la ultima (la visible) del mazo
 * propio o de un monton propio.
 */
function findPlayableCard(state: GameState, playerId: string, cardId: string): { card: Card; zone: Card[]; index: number } | null {
  const hand = state.playerHands[playerId];
  const handIndex = hand.findIndex(c => c.id === cardId);
  if (handIndex !== -1) return { card: hand[handIndex], zone: hand, index: handIndex };

  const zones = [state.playerDecks[playerId], ...state.playerPiles[playerId]];
  for (const zone of zones) {
    if (zone.length > 0 && zone[zone.length - 1].id === cardId) {
      return { card: zone[zone.length - 1], zone, index: zone.length - 1 };
    }
  }
  return null;
}

function parseAction(raw: any, state: GameState): AzesAction | null {
  if (!raw || typeof raw !== "object") return null;
  switch (raw.type) {
    case "draw":
      return { type: "draw" };
    case "play":
      if (typeof raw.cardId !== "string" || !isIndex(raw.stairIdx, state.stairs.length)) return null;
      return { type: "play", cardId: raw.cardId, stairIdx: raw.stairIdx };
    case "discard":
      if (typeof raw.cardId !== "string" || !isIndex(raw.pileIdx, PILE_COUNT)) return null;
      return { type: "discard", cardId: raw.cardId, pileIdx: raw.pileIdx };
    default:
      return null;
  }
}

function isIndex(value: unknown, length: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;
}
