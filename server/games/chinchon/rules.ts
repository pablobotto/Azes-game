/*
 * Reglas de Chinchon (puras, sin estado de sala).
 *
 * Mazo de poker: 52 cartas + 2 comodines. Mano de 7. Combinaciones:
 *  - pierna: 3 o 4 cartas del mismo valor y palos distintos
 *  - escalera: 3 o mas cartas consecutivas del mismo palo (el As vale solo 1: A-2-3 si, Q-K-A no)
 * El comodin completa cualquier combinacion. Suelto vale 25.
 * Valor de las sueltas: As 1, 2 a 10 su numero, J/Q/K 10.
 */
import { Card } from "../../card.model";

export const HAND_SIZE = 7;
export const CLOSE_BELOW = 5;       // se cierra con menos de 5 puntos sueltos
export const JOKER_POINTS = 25;
export const CLOSE_BONUS = -10;     // cerrar sin ninguna carta suelta
export const TARGET_SCORE = 100;    // quien llega o pasa pierde
export const TOTAL_CARDS = 54;

export const isJoker = (c: Card) => c.value === "C";

export function cardPoints(c: Card): number {
  if (isJoker(c)) return JOKER_POINTS;
  return Math.min(c.numericValue, 10);
}

export function buildDeck(): Card[] {
  const suits: Card["suit"][] = ["♠", "♥", "♦", "♣"];
  const values = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck: Card[] = [];
  suits.forEach(suit => values.forEach((value, i) => {
    deck.push({ suit, value, numericValue: i + 1, id: `${suit}${value}`, faceUp: false });
  }));
  for (let i = 1; i <= 2; i++) deck.push({ suit: "⚜", value: "C", numericValue: 0, id: `C#${i}`, faceUp: false });
  return deck;
}

/** True si las cartas forman por si solas una combinacion valida (pierna o escalera, con comodines). */
export function isMeld(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const rest = cards.filter(c => !isJoker(c));
  if (rest.length === 0) return false;

  const sameValue = rest.every(c => c.numericValue === rest[0].numericValue);
  if (sameValue && cards.length <= 4 && new Set(rest.map(c => c.suit)).size === rest.length) return true;

  if (rest.every(c => c.suit === rest[0].suit)) {
    const values = rest.map(c => c.numericValue).sort((a, b) => a - b);
    if (new Set(values).size !== values.length) return false;
    const span = values[values.length - 1] - values[0] + 1;
    // los comodines rellenan los huecos y, si sobran, extienden la escalera dentro de 1..13
    return cards.length <= 13 && span <= cards.length;
  }
  return false;
}

/**
 * Ordena una combinacion valida para mostrarla: la escalera de menor a mayor con el comodin en el hueco que
 * rellena (4, comodin, 6), y los comodines sobrantes al final (o al principio si arriba no hay lugar); la pierna
 * con los comodines al final. Solo cambia el orden en que se muestra, no el calculo de puntos.
 */
export function arrangeMeld(cards: Card[]): Card[] {
  const jokers = cards.filter(isJoker);
  const rest = cards.filter(c => !isJoker(c));
  if (rest.length === 0) return [...cards];
  if (rest.length >= 2 && rest.every(c => c.numericValue === rest[0].numericValue)) return [...rest, ...jokers]; // pierna
  rest.sort((a, b) => a.numericValue - b.numericValue);
  const out: Card[] = [];
  let spare = [...jokers];
  rest.forEach((c, i) => {
    if (i > 0) {
      const gap = c.numericValue - rest[i - 1].numericValue - 1;
      out.push(...spare.splice(0, gap));
    }
    out.push(c);
  });
  const room = 13 - rest[rest.length - 1].numericValue; // lugar para extender hacia arriba (la K es el tope)
  out.push(...spare.splice(0, room));
  return [...spare, ...out];
}

export interface Split {
  loose: number;          // puntos de las cartas sueltas
  melds: Card[][];        // combinaciones elegidas
  looseCards: Card[];     // las que quedan sueltas
}

/** Mejor reparto de la mano: el que deja menos puntos sueltos. */
export function bestSplit(hand: Card[]): Split {
  const n = hand.length;
  const meldMasks: number[] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const picked = hand.filter((_, i) => mask & (1 << i));
    if (picked.length >= 3 && isMeld(picked)) meldMasks.push(mask);
  }
  const memo = new Map<number, { pts: number; chosen: number[] }>();
  const solve = (rem: number): { pts: number; chosen: number[] } => {
    if (rem === 0) return { pts: 0, chosen: [] };
    const hit = memo.get(rem);
    if (hit) return hit;
    const i = Math.log2(rem & -rem);
    const sub = solve(rem & ~(1 << i));
    let best = { pts: sub.pts + cardPoints(hand[i]), chosen: sub.chosen };
    for (const m of meldMasks) {
      if (!(m & (1 << i)) || (m & rem) !== m) continue;
      const r = solve(rem & ~m);
      if (r.pts < best.pts) best = { pts: r.pts, chosen: [...r.chosen, m] };
    }
    memo.set(rem, best);
    return best;
  };
  const full = (1 << n) - 1;
  const { pts, chosen } = solve(full);
  const used = chosen.reduce((a, m) => a | m, 0);
  return {
    loose: pts,
    melds: chosen.map(m => arrangeMeld(hand.filter((_, i) => m & (1 << i)))),
    looseCards: hand.filter((_, i) => !(used & (1 << i))),
  };
}

/** Chinchon: las 7 cartas son una sola escalera del mismo palo, sin comodines. */
export function isChinchon(hand: Card[]): boolean {
  if (hand.length !== HAND_SIZE || hand.some(isJoker)) return false;
  if (!hand.every(c => c.suit === hand[0].suit)) return false;
  const values = hand.map(c => c.numericValue).sort((a, b) => a - b);
  return values.every((v, i) => i === 0 || v === values[i - 1] + 1);
}
