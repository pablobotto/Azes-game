import { test } from "node:test";
import assert from "node:assert/strict";
import { Card } from "../../card.model";
import { arrangeMeld, bestSplit, buildDeck, cardPoints, isChinchon, isMeld } from "./rules";

const N: Record<string, number> = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, C: 0 };
let seq = 0;
/** "5♠" -> carta; "C" -> comodin */
const c = (s: string): Card => {
  if (s === "C") return { suit: "⚜", value: "C", numericValue: 0, id: `C#${++seq}`, faceUp: true };
  const suit = s.slice(-1) as Card["suit"], value = s.slice(0, -1);
  return { suit, value, numericValue: N[value], id: `${s}#${++seq}`, faceUp: true };
};
const hand = (...s: string[]) => s.map(c);

test("el mazo tiene 54 cartas unicas: 52 y 2 comodines", () => {
  const d = buildDeck();
  assert.equal(d.length, 54);
  assert.equal(new Set(d.map(x => x.id)).size, 54);
  assert.equal(d.filter(x => x.value === "C").length, 2);
});

test("puntos: As 1, numeros su valor, figuras 10, comodin 25", () => {
  assert.deepEqual(hand("A♠", "7♥", "9♦", "10♣", "J♠", "Q♠", "K♠", "C").map(cardPoints), [1, 7, 9, 10, 10, 10, 10, 25]);
});

test("pierna: 3 o 4 del mismo valor con palos distintos", () => {
  assert.ok(isMeld(hand("5♠", "5♥", "5♦")));
  assert.ok(isMeld(hand("5♠", "5♥", "5♦", "5♣")));
  assert.ok(!isMeld(hand("5♠", "5♥", "5♠")), "palo repetido");
  assert.ok(!isMeld(hand("5♠", "5♥")), "muy corta");
  assert.ok(!isMeld(hand("5♠", "5♥", "5♦", "5♣", "C")), "mas de 4");
});

test("escalera: consecutivas del mismo palo, el As solo vale 1", () => {
  assert.ok(isMeld(hand("A♠", "2♠", "3♠")));
  assert.ok(isMeld(hand("9♥", "10♥", "J♥", "Q♥", "K♥")));
  assert.ok(!isMeld(hand("Q♠", "K♠", "A♠")), "el As no cierra la escalera");
  assert.ok(!isMeld(hand("4♠", "5♥", "6♠")), "palos mezclados");
  assert.ok(!isMeld(hand("4♠", "5♠", "7♠")), "con hueco");
});

test("comodin: rellena huecos, extiende los extremos y completa piernas", () => {
  assert.ok(isMeld(hand("4♠", "C", "6♠")));
  assert.ok(isMeld(hand("4♠", "5♠", "C")));
  assert.ok(isMeld(hand("K♠", "Q♠", "C")), "extiende hacia abajo");
  assert.ok(isMeld(hand("7♠", "7♥", "C")));
  assert.ok(isMeld(hand("4♠", "C", "C")));
  assert.ok(!isMeld(hand("C", "C", "C")));
  assert.ok(!isMeld(hand("2♠", "C", "9♠")), "el hueco no cabe");
});

test("bestSplit: elige el reparto que deja menos puntos", () => {
  // pierna de 5 deja 6+7+K+2 = 25; escalera 5-6-7 de picas deja 5+5+K+2 = 22
  const s = bestSplit(hand("5♠", "5♥", "5♦", "6♠", "7♠", "K♦", "2♣"));
  assert.equal(s.loose, 22);
  assert.equal(s.melds.length, 1);
});

test("bestSplit: dos combinaciones, una suelta; el comodin deja 0", () => {
  const s = bestSplit(hand("3♠", "4♠", "5♠", "9♥", "9♦", "9♣", "K♦"));
  assert.equal(s.loose, 10);
  assert.equal(s.melds.length, 2);
  assert.deepEqual(s.looseCards.map(x => x.value), ["K"]);
  assert.equal(bestSplit(hand("3♠", "4♠", "5♠", "9♥", "9♦", "9♣", "C")).loose, 0);
});

test("bestSplit: 8 cartas, no repite cartas entre combinaciones", () => {
  // escalera A-2-3 de picas deja 3+3+9+10+10 = 35; pierna de 3 deja A+2+9+10+10 = 32
  const s = bestSplit(hand("A♠", "2♠", "3♠", "3♥", "3♦", "9♣", "J♥", "Q♥"));
  const used = s.melds.flat().map(x => x.id);
  assert.equal(new Set(used).size, used.length);
  assert.equal(s.loose, 32);
});

const show = (cards: Card[]) => cards.map(x => x.value + (x.value === "C" ? "" : x.suit)).join(" ");

test("arrangeMeld: el comodin va en el hueco de la escalera, no al final", () => {
  assert.equal(show(arrangeMeld(hand("4♣", "6♣", "C"))), "4♣ C 6♣");
  assert.equal(show(arrangeMeld(hand("C", "9♥", "C", "5♥", "6♥"))), "5♥ 6♥ C C 9♥"); // dos comodines rellenan el 7 y el 8
});

test("arrangeMeld: sobrantes al final, o al principio si arriba no hay lugar; pierna con comodin al final", () => {
  assert.equal(show(arrangeMeld(hand("C", "4♣", "5♣"))), "4♣ 5♣ C");
  assert.equal(show(arrangeMeld(hand("C", "Q♠", "K♠"))), "C Q♠ K♠");
  assert.equal(show(arrangeMeld(hand("C", "7♠", "7♥"))), "7♠ 7♥ C");
  assert.equal(show(arrangeMeld(hand("5♦", "C", "C"))), "5♦ C C");
});

test("bestSplit: la combinacion con comodin sale ordenada (3 doses + 4, comodin, 6)", () => {
  const s = bestSplit(hand("6♣", "2♠", "C", "2♥", "4♣", "2♣", "9♦"));
  assert.equal(s.loose, 9);
  assert.deepEqual(s.melds.map(show).sort(), ["2♠ 2♥ 2♣", "4♣ C 6♣"]);
  const all = bestSplit(hand("6♣", "2♠", "C", "2♥", "4♣", "2♣", "3♣"));
  assert.equal(all.loose, 0, "3♣ pegado a la escalera 3-4-5(comodin)-6 o suelto: la mejor opcion deja 0");
});

test("chinchon: 7 consecutivas del mismo palo, sin comodines", () => {
  assert.ok(isChinchon(hand("3♥", "4♥", "5♥", "6♥", "7♥", "8♥", "9♥")));
  assert.ok(!isChinchon(hand("3♥", "4♥", "5♥", "6♥", "7♥", "8♥", "C")));
  assert.ok(!isChinchon(hand("3♥", "4♥", "5♥", "6♥", "7♥", "8♥", "10♥")));
  assert.ok(!isChinchon(hand("3♥", "4♥", "5♥", "6♥", "7♥", "8♥", "9♠")));
});
