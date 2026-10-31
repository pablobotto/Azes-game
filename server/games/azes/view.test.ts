import { test } from "node:test";
import assert from "node:assert/strict";
import { Card } from "../../card.model";
import { GameState } from "../../gameState.model";
import { checkInvariant, TOTAL_CARDS, viewFor } from "./view";

const card = (id: string, value = "5"): Card => ({ suit: "♠", value, numericValue: 5, id, faceUp: true });
const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => card(`${prefix}${i}`));

/** Estado con exactamente 108 cartas repartidas por todas las zonas. */
function fullState(): GameState {
  return {
    roomId: "r1", authoritative: true, currentPlayerId: "p1", phase: "playing", turn: 0, version: 1,
    deck: many("c", 108 - 5 - 5 - 10 - 10 - 2 - 2 - 3),
    stairs: [many("s", 2), [], [], [], [], [], [], []],
    playerHands: { p1: many("h1_", 5), p2: many("h2_", 5) },
    playerDecks: { p1: many("d1_", 10), p2: many("d2_", 10) },
    playerPiles: { p1: [many("q1_", 2), [], []], p2: [many("q2_", 3), [], []] },
  };
}

test("el estado de prueba tiene las 108 cartas", () => {
  assert.equal(checkInvariant(fullState()), null);
  assert.equal(TOTAL_CARDS, 108);
});

test("invariante: detecta cartas perdidas, de mas y repetidas", () => {
  const lost = fullState(); lost.playerHands.p1.pop();
  assert.match(checkInvariant(lost)!, /107/);
  const extra = fullState(); extra.deck.push(card("nueva"));
  assert.match(checkInvariant(extra)!, /109/);
  const dup = fullState(); dup.playerHands.p1[0] = dup.playerHands.p2[0];
  assert.match(checkInvariant(dup)!, /repetidas/);
});

test("viewFor: el jugador ve lo suyo completo", () => {
  const s = fullState();
  const v = viewFor(s, "p1");
  assert.deepEqual(v.playerHands.p1, s.playerHands.p1);
  assert.deepEqual(v.playerDecks.p1, s.playerDecks.p1);
  assert.deepEqual(v.playerPiles, s.playerPiles);
  assert.deepEqual(v.stairs, s.stairs);
});

test("viewFor: del rival solo la cantidad de la mano y la carta de arriba del mazo", () => {
  const s = fullState();
  const v = viewFor(s, "p1");
  assert.equal(v.playerHands.p2.length, 5);
  assert.ok(v.playerHands.p2.every(c => c.value === "?" && !c.faceUp));
  assert.equal(v.playerDecks.p2.length, 10);
  assert.deepEqual(v.playerDecks.p2[9], s.playerDecks.p2[9]);
  assert.ok(v.playerDecks.p2.slice(0, 9).every(c => c.value === "?"));
  // los montones del rival estan boca arriba
  assert.deepEqual(v.playerPiles.p2, s.playerPiles.p2);
});

test("viewFor: el mazo central es solo una cantidad", () => {
  const s = fullState();
  const v = viewFor(s, "p2");
  assert.equal(v.deck.length, s.deck.length);
  assert.ok(v.deck.every(c => c.value === "?"));
});

test("viewFor: no filtra ningun id oculto y no muta el estado", () => {
  const s = fullState();
  const before = JSON.stringify(s);
  const secret = new Set<string>([...s.deck.map(c => c.id), ...s.playerHands.p2.map(c => c.id), ...s.playerDecks.p2.slice(0, 9).map(c => c.id)]);
  const text = JSON.stringify(viewFor(s, "p1"));
  secret.forEach(id => assert.ok(!text.includes(`"${id}"`), `se filtro ${id}`));
  assert.equal(JSON.stringify(s), before);
});

test("viewFor: mazo del rival vacio", () => {
  const s = fullState(); s.playerDecks.p2 = [];
  assert.deepEqual(viewFor(s, "p1").playerDecks.p2, []);
});
