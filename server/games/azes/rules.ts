/*
 * Reglas de Azes en el servidor.
 *
 * Es el mismo comportamiento que hoy tienen en el cliente GameRulesService, GameStepService.draw y
 * GameService.removeStairAndReShufle, pasado a funciones puras. NO se cambia ninguna regla: cualquier
 * diferencia con el cliente es un bug (rules.test.ts compara contra una copia literal del codigo original).
 *
 * Cosas del comportamiento original que se conservan a proposito:
 *  - canPlaceOnStair MUTA card.numericValue cuando se juega un comodin sobre una carta comun.
 *  - Si el mazo central no alcanza para completar la mano de 5 es empate (aunque ya se hayan robado algunas).
 */
import { Card } from "../../card.model";

export const HAND_SIZE = 5;
export const STAIR_LENGTH = 13;

const order = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const valueMap: Record<string, number> = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };

// ---- Validaciones (GameRulesService) ----

/** Devuelve true si la carta puede colocarse en esta escalera. Muta card.numericValue si es un comodin. */
export function canPlaceOnStair(stair: Card[], card: Card): boolean {
  if (stair.length === 0) return card.value === 'A';
  if (card.value === 'C' && hasStairAlreadyJoker(stair)) return false;

  const lastCard = stair[stair.length - 1];
  if (lastCard.value === 'C') {
    const lastNumeric = lastCard.value === 'C' ? lastCard.numericValue : valueMap[lastCard.value];
    const cardNumeric = valueMap[card.value];
    return cardNumeric === lastNumeric + 1;
  }
  if (isNextInSequence(lastCard, card)) {
    if (card.value === "C") {
      card.numericValue = valueMap[lastCard.value] + 1;
    }
    return true;
  }
  return false;
}

/** No se puede descartar mientras haya un As en la mano. */
export function canDiscardToPile(hand: Card[]): boolean {
  return !hand.some(card => card.value === 'A');
}

/** Con la mano vacia el jugador roba y sigue jugando en el mismo turno. */
export function canGetMoreCardsInTheCurrentTurn(hand: Card[]): boolean {
  return hand.length === 0;
}

function isNextInSequence(prev: Card, next: Card): boolean {
  if (next.value === 'C') {
    return true;
  }
  const prevIndex = order.indexOf(prev.value);
  const nextIndex = order.indexOf(next.value);
  return nextIndex === prevIndex + 1;
}

function hasStairAlreadyJoker(stair: Card[]): boolean {
  if (!stair || stair.length === 0) return false;
  return stair.some(card => card.value === 'C');
}

// ---- Fin de partida ----

/** Gana quien se queda sin cartas en su mazo propio despues de jugar. */
export function hasWon(playerDeck: Card[]): boolean {
  return playerDeck.length === 0;
}

// ---- Robo y reshuffle (GameStepService.draw / GameService.removeStairAndReShufle) ----

/** Una escalera completa (13 cartas terminada en K o comodin) vuelve al mazo al robar. */
export function isStairComplete(stair: Card[]): boolean {
  return stair.length === STAIR_LENGTH && (stair[stair.length - 1].value === 'K' || stair[stair.length - 1].value === 'C');
}

export type Shuffler = (cards: Card[]) => Card[];

/** Mismo mezclado que el original (sort con comparador aleatorio). Muta y devuelve el arreglo recibido. */
export const defaultShuffle: Shuffler = (cards) => cards.sort(() => Math.random() - 0.5);

/**
 * Saca la escalera indicada, la mezcla dentro de la mitad inferior del mazo y devuelve el mazo nuevo.
 * El mazo se roba desde el final (pop), asi que "topHalf" es lo que se roba primero.
 * No muta el mazo ni las escaleras recibidos.
 */
export function removeStairAndReShuffle(
  deck: Card[], stairs: Card[][], stairIndex: number, shuffle: Shuffler = defaultShuffle
): { deck: Card[]; stairs: Card[][] } {
  const cutIndex = Math.floor(deck.length / 2);
  const bottomHalf = deck.slice(0, cutIndex);
  const topHalf = deck.slice(cutIndex);
  const newBottom = shuffle(bottomHalf.concat(stairs[stairIndex]));
  const updatedStairs = [...stairs];
  updatedStairs[stairIndex] = [];
  return { deck: topHalf.concat(newBottom), stairs: updatedStairs };
}

/** Roba una carta del final del mazo y la deja boca arriba (muta el mazo). */
export function drawCard(deck: Card[]): Card | null {
  if (deck.length === 0) return null;
  const card = deck.pop()!;
  card.faceUp = true;
  return card;
}

export interface DrawResult {
  deck: Card[];
  stairs: Card[][];
  hand: Card[];
  /** true si el mazo se quedo sin cartas antes de completar la mano: la partida es empate. */
  tie: boolean;
  /** indices de escaleras que volvieron al mazo, en orden */
  reshuffled: number[];
}

/**
 * Paso de robo de un turno: primero devuelve al mazo las escaleras completas (en orden de indice) y
 * despues roba hasta tener HAND_SIZE cartas. Si el mazo se acaba antes, es empate y las cartas ya
 * robadas se conservan en la mano. Muta mazo y mano recibidos y devuelve el estado resultante.
 */
export function drawStep(deck: Card[], stairs: Card[][], hand: Card[], shuffle: Shuffler = defaultShuffle): DrawResult {
  let currentDeck = deck;
  let currentStairs = stairs;
  const reshuffled: number[] = [];
  for (let i = 0; i < stairs.length; i++) {
    if (isStairComplete(stairs[i])) {
      const result = removeStairAndReShuffle(currentDeck, currentStairs, i, shuffle);
      currentDeck = result.deck;
      currentStairs = result.stairs;
      reshuffled.push(i);
    }
  }
  while (hand.length < HAND_SIZE) {
    const card = drawCard(currentDeck);
    if (!card) {
      return { deck: currentDeck, stairs: currentStairs, hand, tie: true, reshuffled };
    }
    hand.push(card);
  }
  return { deck: currentDeck, stairs: currentStairs, hand, tie: false, reshuffled };
}
