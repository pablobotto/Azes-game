import { test } from "node:test";
import assert from "node:assert/strict";
import { Card } from "../../card.model";
import { addPlayer, applyAction, ChinchonState, emptyState, startMatch } from "./actions";
import { checkInvariant, viewFor } from "./view";

const N: Record<string, number> = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, C: 0 };
let seq = 0;
const c = (s: string): Card => {
  if (s === "C") return { suit: "⚜", value: "C", numericValue: 0, id: `C#${++seq}`, faceUp: true };
  const suit = s.slice(-1) as Card["suit"], value = s.slice(0, -1);
  return { suit, value, numericValue: N[value], id: s, faceUp: true };
};
const hand = (...s: string[]) => s.map(c);
const noShuffle = (cards: Card[]) => cards;

function newMatch(): ChinchonState {
  const s = emptyState("r1");
  s.authoritative = true;
  addPlayer(s, "p1");
  addPlayer(s, "p2");
  startMatch(s, noShuffle);
  return s;
}

/** Partida armada a mano: p1 en turno con 7 cartas y p2 con 7, mazo y descarte chicos. */
function table(over: Partial<ChinchonState> = {}): ChinchonState {
  const s = emptyState("r1");
  addPlayer(s, "p1"); addPlayer(s, "p2");
  Object.assign(s, {
    currentPlayerId: "p1", phase: "drawing", round: 1, dealerId: "p2",
    deck: hand("9♣", "8♣"), discard: hand("K♣"),
    ...over,
  });
  s.hands.p1 = over.hands?.p1 ?? hand("3♠", "4♠", "5♠", "9♥", "9♦", "9♣", "A♣").map((x, i) => ({ ...x, id: `p1-${i}` }));
  s.hands.p2 = over.hands?.p2 ?? hand("2♥", "6♦", "J♠", "Q♣", "7♣", "8♦", "10♦").map((x, i) => ({ ...x, id: `p2-${i}` }));
  return s;
}

test("reparto: 7 cartas c/u, una en el descarte, 54 en total y empieza el que sigue al repartidor", () => {
  const s = newMatch();
  assert.equal(s.hands.p1.length, 7);
  assert.equal(s.hands.p2.length, 7);
  assert.equal(s.discard.length, 1);
  assert.equal(s.deck.length, 54 - 15);
  assert.ok(s.hands.p1.every(x => x.faceUp), "las cartas de la mano se ven");
  assert.equal(s.dealerId, "p1");
  assert.equal(s.currentPlayerId, "p2");
  assert.equal(s.phase, "drawing");
  assert.equal(checkInvariant(s), null);
});

test("rechaza acciones mal formadas y jugadores ajenos", () => {
  const s = table();
  for (const bad of [null, "x", {}, { type: "fly" }, { type: "draw" }, { type: "draw", from: "mano" }]) {
    assert.equal(applyAction(s, "p1", bad).error, "bad_action");
  }
  assert.equal(applyAction(s, "intruso", { type: "draw", from: "deck" }).error, "bad_action");
});

test("solo juega el de turno y en su paso", () => {
  const s = table();
  assert.equal(applyAction(s, "p2", { type: "draw", from: "deck" }).error, "not_your_turn");
  assert.equal(applyAction(s, "p1", { type: "discard", cardId: "p1-0" }).error, "wrong_step");
  assert.equal(applyAction(s, "p1", { type: "draw", from: "deck" }).error, undefined);
  assert.equal(applyAction(s, "p1", { type: "draw", from: "deck" }).error, "wrong_step");
});

test("robar del mazo o del descarte pasa a descartar con 8 cartas", () => {
  const a = table();
  applyAction(a, "p1", { type: "draw", from: "deck" });
  assert.equal(a.hands.p1.length, 8);
  assert.equal(a.hands.p1[7].id, "8♣");
  assert.equal(a.hands.p1[7].faceUp, true);
  assert.equal(a.phase, "discarding");
  const b = table();
  applyAction(b, "p1", { type: "draw", from: "discard" });
  assert.equal(b.hands.p1[7].id, "K♣");
  assert.equal(b.discard.length, 0);
});

test("descartar manda la carta al descarte y pasa el turno", () => {
  const s = table();
  applyAction(s, "p1", { type: "draw", from: "deck" });
  assert.equal(applyAction(s, "p1", { type: "discard", cardId: "p1-6" }).error, undefined);
  assert.equal(s.discard[s.discard.length - 1].id, "p1-6");
  assert.equal(s.currentPlayerId, "p2");
  assert.equal(s.phase, "drawing");
  assert.equal(s.turn, 1);
  assert.equal(applyAction(s, "p1", { type: "draw", from: "deck" }).error, "not_your_turn");
});

test("effect: robar, descartar y cerrar describen el movimiento sin revelar cartas ocultas", () => {
  const s = table();
  const fromDeck = applyAction(s, "p1", { type: "draw", from: "deck" });
  assert.deepEqual(fromDeck.effect, { kind: "draw", playerId: "p1", from: "deck", reshuffled: false });
  assert.equal(JSON.stringify(fromDeck.effect).includes("8♣"), false, "el mazo no se revela");
  const disc = applyAction(s, "p1", { type: "discard", cardId: "p1-0" });
  assert.equal((disc.effect as any).kind, "discard");
  assert.equal((disc.effect as any).card.id, "p1-0");
  const t = table();
  const fromDiscard = applyAction(t, "p1", { type: "draw", from: "discard" });
  assert.equal((fromDiscard.effect as any).from, "discard");
  assert.equal((fromDiscard.effect as any).card.id, "K♣");
  assert.equal(applyAction(table(), "p2", { type: "draw", from: "deck" }).effect, undefined, "rechazada: sin efecto");
});

test("descartar una carta que no es tuya es ilegal", () => {
  const s = table();
  applyAction(s, "p1", { type: "draw", from: "deck" });
  assert.equal(applyAction(s, "p1", { type: "discard", cardId: "p2-0" }).error, "illegal_move");
});

test("mazo vacio: se mezcla el descarte menos su tope", () => {
  const s = table({ deck: [], discard: hand("2♦", "3♦", "4♦", "5♦") });
  s.hands.p1 = hand("3♠", "4♠", "5♠", "9♥", "9♦", "9♣", "A♣");
  s.hands.p2 = hand("2♥", "6♦", "J♠", "Q♣", "7♣", "8♦", "10♦");
  s.deck = []; // 14 en mano + 4 = 18, para esta prueba no importa el total
  assert.equal(applyAction(s, "p1", { type: "draw", from: "deck" }, noShuffle).error, undefined);
  assert.equal(s.hands.p1.length, 8);
  assert.deepEqual(s.discard.map(x => x.id), ["5♦"]);
  assert.equal(s.deck.length, 2);
});

test("mazo y descarte sin cartas: no se puede robar", () => {
  const s = table({ deck: [], discard: hand("2♦") });
  assert.equal(applyAction(s, "p1", { type: "draw", from: "deck" }).error, "deck_empty");
});

test("cerrar con 5 o mas puntos sueltos no se puede", () => {
  const s = table({ discard: hand("K♣") });
  s.hands.p1 = hand("3♠", "4♠", "5♠", "9♥", "9♦", "9♣", "6♣").map((x, i) => ({ ...x, id: `p1-${i}` }));
  applyAction(s, "p1", { type: "draw", from: "deck" }); // llega 8♣
  // sin 8♣ y sin 6♣ sueltas: 6 + 8 = 14 puntos, o descartando una: >= 5
  assert.equal(applyAction(s, "p1", { type: "close", cardId: "p1-6" }).error, "cannot_close");
  assert.equal(s.phase, "discarding");
  assert.equal(s.hands.p1.length, 8);
});

test("cerrar con menos de 5 suma las sueltas al que cierra y a los rivales", () => {
  const s = table({ deck: hand("2♣", "A♣") });
  s.hands.p1 = hand("3♠", "4♠", "5♠", "9♥", "9♦", "9♣", "2♦").map((x, i) => ({ ...x, id: `p1-${i}` }));
  applyAction(s, "p1", { type: "draw", from: "deck" }); // roba A♣: 3 sueltas?  A♣ y 2♦
  // sueltas A♣(1)... descarto 2♦ -> queda A♣ = 1 punto
  const out = applyAction(s, "p1", { type: "close", cardId: "p1-6" });
  assert.equal(out.result, undefined);
  assert.equal(s.phase, "roundEnd");
  assert.equal(s.last!.closerId, "p1");
  assert.equal(s.last!.loose.p1, 1);
  assert.equal(s.scores.p1, 1);
  assert.equal(s.scores.p2, s.last!.loose.p2);
  assert.ok(s.scores.p2 > 0);
});

test("cerrar sin ninguna suelta resta 10", () => {
  const s = table({ deck: hand("K♥") });
  s.hands.p1 = hand("3♠", "4♠", "5♠", "9♥", "9♦", "9♣", "9♠").map((x, i) => ({ ...x, id: `p1-${i}` }));
  applyAction(s, "p1", { type: "draw", from: "deck" }); // llega K♥
  const out = applyAction(s, "p1", { type: "close", cardId: "K♥" });
  assert.equal(out.result, undefined);
  assert.equal(s.last!.loose.p1, 0);
  assert.equal(s.scores.p1, -10);
});

test("chinchon gana la partida al instante", () => {
  const s = table({ deck: hand("K♥") });
  s.hands.p1 = hand("3♥", "4♥", "5♥", "6♥", "7♥", "8♥", "9♥").map((x, i) => ({ ...x, id: `p1-${i}` }));
  applyAction(s, "p1", { type: "draw", from: "deck" });
  const out = applyAction(s, "p1", { type: "close", cardId: "K♥" });
  assert.deepEqual(out.result, { type: "win", winnerId: "p1" });
  assert.equal(s.last!.chinchon, true);
});

test("llegar a 100 pierde: gana el de menos puntos", () => {
  const s = table({ deck: hand("2♣", "A♣") });
  s.scores.p2 = 95;
  s.hands.p1 = hand("3♠", "4♠", "5♠", "9♥", "9♦", "9♣", "2♦").map((x, i) => ({ ...x, id: `p1-${i}` }));
  applyAction(s, "p1", { type: "draw", from: "deck" });
  const out = applyAction(s, "p1", { type: "close", cardId: "p1-6" });
  assert.deepEqual(out.result, { type: "win", winnerId: "p1" });
  assert.ok(s.scores.p2 >= 100);
});

test("fin de ronda: cuando los dos confirman se reparte la siguiente con otro repartidor", () => {
  const s = table({ deck: hand("2♣", "A♣") });
  s.hands.p1 = hand("3♠", "4♠", "5♠", "9♥", "9♦", "9♣", "2♦").map((x, i) => ({ ...x, id: `p1-${i}` }));
  applyAction(s, "p1", { type: "draw", from: "deck" });
  applyAction(s, "p1", { type: "close", cardId: "p1-6" });
  assert.equal(applyAction(s, "p1", { type: "draw", from: "deck" }).error, "wrong_step");
  applyAction(s, "p1", { type: "nextRound" });
  assert.equal(s.phase, "roundEnd");
  applyAction(s, "p1", { type: "nextRound" });
  assert.equal(s.ready.length, 1, "confirmar dos veces no cuenta doble");
  const before = { ...s.scores };
  applyAction(s, "p2", { type: "nextRound" });
  assert.equal(s.phase, "drawing");
  assert.equal(s.round, 2);
  assert.equal(s.dealerId, "p2");
  assert.equal(s.currentPlayerId, "p1");
  assert.deepEqual(s.scores, before);
  assert.equal(s.last, undefined);
  assert.equal(checkInvariant(s), null);
});

test("nextRound solo al terminar la ronda", () => {
  assert.equal(applyAction(table(), "p1", { type: "nextRound" }).error, "wrong_step");
});

test("revancha: startMatch pone los puntajes en cero", () => {
  const s = newMatch();
  s.scores.p1 = 80; s.scores.p2 = 120;
  startMatch(s, noShuffle);
  assert.deepEqual(s.scores, { p1: 0, p2: 0 });
  assert.equal(s.round, 1);
});

test("tres jugadores: el turno rota por asiento", () => {
  const s = emptyState("r3");
  ["a", "b", "c"].forEach(id => addPlayer(s, id));
  startMatch(s, noShuffle);
  assert.equal(s.deck.length, 54 - 22);
  assert.equal(s.currentPlayerId, "b");
  applyAction(s, "b", { type: "draw", from: "deck" });
  applyAction(s, "b", { type: "discard", cardId: s.hands.b[0].id });
  assert.equal(s.currentPlayerId, "c");
});

test("vista: oculta la mano rival y el mazo, y la muestra al terminar la ronda", () => {
  const s = newMatch();
  const v = viewFor(s, "p1");
  assert.deepEqual(v.hands.p1, s.hands.p1);
  assert.ok(v.hands.p2.every(x => x.value === "?"));
  assert.equal(v.hands.p2.length, 7);
  assert.ok(v.deck.every(x => x.value === "?"));
  assert.equal(v.deck.length, s.deck.length);
  assert.deepEqual(v.discard, s.discard);
  assert.equal(JSON.stringify(v).includes(s.hands.p2[0].id), false);
  s.phase = "roundEnd";
  assert.deepEqual(viewFor(s, "p1").hands.p2, s.hands.p2);
});

test("invariante: detecta cartas perdidas y repetidas", () => {
  const s = newMatch();
  assert.equal(checkInvariant(s), null);
  s.deck.pop();
  assert.match(checkInvariant(s)!, /53/);
  const t = newMatch();
  t.deck[0] = { ...t.hands.p1[0] };
  assert.match(checkInvariant(t)!, /repetidas/);
});
