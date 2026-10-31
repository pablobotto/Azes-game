import test from "node:test";
import assert from "node:assert/strict";
import { Card } from "../../card.model";
import * as rules from "./rules";

// ---------- Helpers ----------
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const NUM: Record<string, number> = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
let uid = 0;
const card = (value: string, numericValue?: number): Card => ({
  suit: value === 'C' ? '⚜' : '♠', value, numericValue: numericValue ?? (value === 'C' ? 0 : NUM[value]), id: `t${uid++}`, faceUp: true,
});
const seq = (...values: string[]): Card[] => values.map(v => card(v));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------- Oraculo: copia LITERAL del codigo original del cliente (git HEAD) ----------
// src/app/services/gameRules.service.ts, sin decoradores de Angular.
class OriginalRules {
  private order = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  private valueMap: Record<string, number> = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  async canPlaceOnStair(stair: Card[], card: Card): Promise<boolean> {
    if (stair.length === 0) return card.value === 'A';
    if (card.value === 'C' && await this.HasStairAlreadyJoker(stair)) return false;
    const lastCard = stair[stair.length - 1];
    if (lastCard.value === 'C'){
      const lastNumeric = lastCard.value === 'C' ? lastCard.numericValue : this.valueMap[lastCard.value];
      const cardNumeric = this.valueMap[card.value];
      return cardNumeric === lastNumeric + 1;
    }
    if ( await this.isNextInSequence(lastCard, card)) {
      if (card.value === "C") {
        card.numericValue = this.valueMap[lastCard.value] + 1
      }
      return true;
    } else {
      return false;
    }
  }
  async canDiscardToPile(hand: Card[]): Promise<boolean> { return !hand.some(card => card.value === 'A'); }
  async canGetMoreCardsInTheCurrentTurn(hand: Card[]): Promise<boolean> { return hand.length === 0; }
  private async isNextInSequence(prev: Card, next: Card): Promise<boolean> {
    if (next.value === 'C') { return true; }
    const prevIndex = this.order.indexOf(prev.value);
    const nextIndex = this.order.indexOf(next.value);
    return nextIndex === prevIndex + 1;
  }
  private async HasStairAlreadyJoker(stair: Card[]): Promise<boolean> {
    if (!stair || stair.length === 0) return false;
    return stair.some(card => card.value === 'C');
  }
}
// GameService.removeStairAndReShufle (original) con el mezclado inyectable, y GameStepService.draw (solo la parte de reglas).
function originalRemoveStair(deck: Card[], stairs: Card[][], stairIndex: number, shuffle: rules.Shuffler) {
  const cutIndex = Math.floor(deck.length / 2);
  const bottomHalf = deck.slice(0, cutIndex);
  const topHalf = deck.slice(cutIndex);
  let newBottom = bottomHalf.concat(stairs[stairIndex]);
  shuffle(newBottom);
  const updatedStairs = [...stairs];
  updatedStairs[stairIndex] = [];
  return { deck: topHalf.concat(newBottom), stairs: updatedStairs };
}
function originalDraw(deck: Card[], stairs: Card[][], hand: Card[], shuffle: rules.Shuffler) {
  let curDeck = deck, curStairs = stairs, tie = false;
  let handCount = hand.length;
  for (const [i, stair] of stairs.entries()) {
    if (stair.length === 13 && (stair[stair.length - 1].value === 'K' || stair[stair.length - 1].value === 'C')) {
      const r = originalRemoveStair(curDeck, curStairs, i, shuffle);
      curDeck = r.deck; curStairs = r.stairs;
    }
  }
  while (handCount < 5) {
    if (curDeck.length === 0) { tie = true; break; }
    const c = curDeck.pop()!; c.faceUp = true;
    hand.push(c);
    handCount++;
  }
  return { deck: curDeck, stairs: curStairs, hand, tie };
}

// PRNG con semilla para que las pruebas aleatorias sean reproducibles
function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- Casos fijos ----------
test("escalera vacia: solo entra un As", () => {
  assert.equal(rules.canPlaceOnStair([], card('A')), true);
  assert.equal(rules.canPlaceOnStair([], card('2')), false);
  assert.equal(rules.canPlaceOnStair([], card('C')), false);
});

test("escalera: la siguiente carta en orden A..K", () => {
  assert.equal(rules.canPlaceOnStair(seq('A'), card('2')), true);
  assert.equal(rules.canPlaceOnStair(seq('A'), card('3')), false);
  assert.equal(rules.canPlaceOnStair(seq('A'), card('A')), false);
  assert.equal(rules.canPlaceOnStair(seq('A', '2', '3', '4', '5', '6', '7', '8', '9'), card('10')), true);
  assert.equal(rules.canPlaceOnStair(seq('10'), card('J')), true);
  assert.equal(rules.canPlaceOnStair(seq('J'), card('Q')), true);
  assert.equal(rules.canPlaceOnStair(seq('Q'), card('K')), true);
  assert.equal(rules.canPlaceOnStair(seq('K'), card('A')), false);
});

test("comodin sobre carta comun: entra siempre y toma el valor siguiente (muta numericValue)", () => {
  const joker = card('C');
  assert.equal(rules.canPlaceOnStair(seq('A', '2', '3'), joker), true);
  assert.equal(joker.numericValue, 4);
  const onK = card('C');
  assert.equal(rules.canPlaceOnStair(seq('K'), onK), true);
  assert.equal(onK.numericValue, 14); // quirk del original, se conserva
});

test("comodin: solo uno por escalera", () => {
  const stair = [card('A'), card('C', 2)];
  assert.equal(rules.canPlaceOnStair(stair, card('C')), false);
});

test("despues de un comodin sigue el valor que representa", () => {
  const stair = [card('A'), card('2'), card('C', 3)];
  assert.equal(rules.canPlaceOnStair(stair, card('4')), true);
  assert.equal(rules.canPlaceOnStair(stair, card('3')), false);
  assert.equal(rules.canPlaceOnStair(stair, card('5')), false);
});

test("rechazar no muta el comodin", () => {
  const joker = card('C');
  rules.canPlaceOnStair([], joker);
  assert.equal(joker.numericValue, 0);
});

test("descartar: prohibido con un As en la mano", () => {
  assert.equal(rules.canDiscardToPile(seq('2', 'A', '5')), false);
  assert.equal(rules.canDiscardToPile(seq('2', '5', 'C')), true);
  assert.equal(rules.canDiscardToPile([]), true);
});

test("mano vacia permite robar y seguir en el mismo turno", () => {
  assert.equal(rules.canGetMoreCardsInTheCurrentTurn([]), true);
  assert.equal(rules.canGetMoreCardsInTheCurrentTurn(seq('A')), false);
});

test("gana quien se queda sin mazo propio", () => {
  assert.equal(rules.hasWon([]), true);
  assert.equal(rules.hasWon(seq('A')), false);
});

test("escalera completa: 13 cartas terminadas en K o comodin", () => {
  const full = VALUES.map(v => card(v));
  assert.equal(rules.isStairComplete(full), true);
  const withJoker = [...full.slice(0, 12), card('C', 13)];
  assert.equal(rules.isStairComplete(withJoker), true);
  assert.equal(rules.isStairComplete(full.slice(0, 12)), false);
  assert.equal(rules.isStairComplete([...full.slice(0, 12), card('Q')]), false);
  assert.equal(rules.isStairComplete([]), false);
});

test("reshuffle: la escalera se mezcla en la mitad inferior del mazo y se vacia", () => {
  const deck = seq('2', '3', '4', '5', '6', '7');            // se roba desde el final
  const stairs: Card[][] = [seq('A', '2'), [], [], [], [], [], [], []];
  const noShuffle: rules.Shuffler = c => c;
  const r = rules.removeStairAndReShuffle(deck, stairs, 0, noShuffle);
  assert.deepEqual(r.deck.map(c => c.value), ['5', '6', '7', '2', '3', '4', 'A', '2']);
  assert.equal(r.stairs[0].length, 0);
  assert.equal(deck.length, 6, "no muta el mazo original");
  assert.equal(stairs[0].length, 2, "no muta las escaleras originales");
});

test("robo: completa la mano a 5", () => {
  const deck = seq('2', '3', '4', '5', '6', '7', '8');
  const hand = seq('A', 'A');
  const r = rules.drawStep(deck, [[], [], [], [], [], [], [], []], hand, c => c);
  assert.equal(r.tie, false);
  assert.equal(r.hand.length, 5);
  assert.deepEqual(r.hand.slice(2).map(c => c.value), ['8', '7', '6']);
  assert.equal(r.deck.length, 4);
});

test("robo: mano completa no roba", () => {
  const deck = seq('2', '3');
  const r = rules.drawStep(deck, [[], [], [], [], [], [], [], []], seq('A', 'A', 'A', 'A', 'A'), c => c);
  assert.equal(r.tie, false);
  assert.equal(r.deck.length, 2);
});

test("robo: si el mazo no alcanza para las 5 es empate y se conservan las robadas", () => {
  const deck = seq('2', '3');
  const hand = seq('A', 'A', 'A');
  const r = rules.drawStep(deck, [[], [], [], [], [], [], [], []], hand, c => c);
  assert.equal(r.tie, false, "el mazo alcanza justo: no es empate");
  assert.equal(r.hand.length, 5);
  assert.equal(r.deck.length, 0);
  const r2 = rules.drawStep(seq('2'), [[], [], [], [], [], [], [], []], seq('A'), c => c);
  assert.equal(r2.tie, true);
  assert.equal(r2.hand.length, 2);
});

test("robo: la escalera completa vuelve al mazo antes de robar y evita el empate", () => {
  const full = VALUES.map(v => card(v));
  const stairs: Card[][] = [full, [], [], [], [], [], [], []];
  const r = rules.drawStep([], stairs, seq('A', 'A', 'A', 'A'), c => c);
  assert.deepEqual(r.reshuffled, [0]);
  assert.equal(r.tie, false);
  assert.equal(r.hand.length, 5);
  assert.equal(r.stairs[0].length, 0);
  assert.equal(r.deck.length, 12);
});

test("robo: las cartas robadas quedan boca arriba", () => {
  const deck = [card('2'), card('3')]; deck.forEach(c => c.faceUp = false);
  const r = rules.drawStep(deck, [[], [], [], [], [], [], [], []], seq('A', 'A', 'A', 'A'), c => c);
  assert.equal(r.hand[4].faceUp, true);
});

// ---------- Comparacion aleatoria contra el codigo original ----------
function randomCard(rand: () => number): Card {
  if (rand() < 0.12) return card('C', Math.floor(rand() * 15));
  return card(VALUES[Math.floor(rand() * VALUES.length)]);
}
function randomStair(rand: () => number): Card[] {
  const len = Math.floor(rand() * 14);
  const stair: Card[] = [];
  let hasJoker = false;
  for (let i = 0; i < len; i++) {
    if (!hasJoker && i > 0 && rand() < 0.15) { stair.push(card('C', i + 1)); hasJoker = true; }
    else stair.push(card(VALUES[Math.min(i, 12)]));
    if (rand() < 0.05 && stair.length > 1) stair[stair.length - 1] = randomCard(rand); // ruido
  }
  return stair;
}

test("canPlaceOnStair coincide con el original en 20000 casos (resultado y mutacion del comodin)", async () => {
  const rand = mulberry32(12345);
  const original = new OriginalRules();
  for (let n = 0; n < 20000; n++) {
    const stair = randomStair(rand);
    const c = randomCard(rand);
    const stairA = clone(stair), stairB = clone(stair), cA = clone(c), cB = clone(c);
    const expected = await original.canPlaceOnStair(stairA, cA);
    const actual = rules.canPlaceOnStair(stairB, cB);
    assert.equal(actual, expected, `caso ${n}: ${JSON.stringify({ stair, c })}`);
    assert.deepEqual(cB, cA, `caso ${n}: mutacion distinta`);
    assert.deepEqual(stairB, stairA);
  }
});

test("descartar / mano vacia coinciden con el original", async () => {
  const rand = mulberry32(777);
  const original = new OriginalRules();
  for (let n = 0; n < 2000; n++) {
    const hand = Array.from({ length: Math.floor(rand() * 7) }, () => randomCard(rand));
    assert.equal(rules.canDiscardToPile(hand), await original.canDiscardToPile(hand));
    assert.equal(rules.canGetMoreCardsInTheCurrentTurn(hand), await original.canGetMoreCardsInTheCurrentTurn(hand));
  }
});

test("paso de robo coincide con el original en 3000 casos (mazo, escaleras, mano y empate)", () => {
  const rand = mulberry32(2024);
  // mezclado determinista y reproducible: rota el arreglo segun un contador (igual en ambos lados)
  const makeShuffle = (seed: number): rules.Shuffler => {
    const r = mulberry32(seed);
    return (cards) => { for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; } return cards; };
  };
  for (let n = 0; n < 3000; n++) {
    const deck = Array.from({ length: Math.floor(rand() * 30) }, () => { const c = randomCard(rand); c.faceUp = false; return c; });
    const stairs: Card[][] = Array.from({ length: 8 }, () => {
      if (rand() < 0.3) { // escalera completa (a veces terminada en comodin, a veces en otra cosa)
        const s = VALUES.map(v => card(v));
        const k = rand();
        if (k < 0.3) s[12] = card('C', 13); else if (k < 0.4) s.pop();
        return s;
      }
      return randomStair(rand);
    });
    const hand = Array.from({ length: Math.floor(rand() * 6) }, () => randomCard(rand));
    const seed = Math.floor(rand() * 1e9);
    const exp = originalDraw(clone(deck), clone(stairs), clone(hand), makeShuffle(seed));
    const act = rules.drawStep(clone(deck), clone(stairs), clone(hand), makeShuffle(seed));
    assert.deepEqual(act.deck, exp.deck, `caso ${n}: mazo`);
    assert.deepEqual(act.stairs, exp.stairs, `caso ${n}: escaleras`);
    assert.deepEqual(act.hand, exp.hand, `caso ${n}: mano`);
    assert.equal(act.tie, exp.tie, `caso ${n}: empate`);
  }
});
