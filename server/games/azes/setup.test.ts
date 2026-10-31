import { test } from "node:test";
import assert from "node:assert/strict";
import { azesGame } from "./index";
import { DEFAULT_GAME, GAMES, isKnownGame } from "../registry";
import { buildDeck } from "./setup";

function room() {
  const s = azesGame.emptyState("r1");
  azesGame.addPlayer(s, "p1");
  azesGame.addPlayer(s, "p2");
  return s;
}

test("registro: azes es el juego por defecto y los desconocidos se rechazan", () => {
  assert.equal(GAMES[DEFAULT_GAME], azesGame);
  assert.ok(isKnownGame("azes"));
  for (const bad of ["", "poker", "__proto__", "constructor", undefined, null, 3]) assert.ok(!isKnownGame(bad));
});

test("mazo: 108 cartas con ids unicos y 4 comodines", () => {
  const deck = buildDeck();
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck.map(c => c.id)).size, 108);
  assert.equal(deck.filter(c => c.value === "C").length, 4);
});

test("startMatch: reparte 5 a la mano y 10 al mazo de cada uno, escaleras vacias", () => {
  const s = room();
  azesGame.startMatch(s);
  for (const id of ["p1", "p2"]) {
    assert.equal(s.playerHands[id].length, 5);
    assert.equal(s.playerDecks[id].length, 10);
    assert.deepEqual(s.playerPiles[id], [[], [], []]);
    assert.ok(s.playerHands[id].every(c => c.faceUp) && s.playerDecks[id].every(c => c.faceUp));
  }
  assert.equal(s.stairs.length, 8);
  assert.ok(s.stairs.every(st => st.length === 0));
  assert.equal(s.deck.length, 108 - 30);
  assert.equal(s.phase, "playing");
  assert.equal(azesGame.checkInvariant(s), null);
});

test("startMatch: la revancha limpia lo jugado y vuelve a repartir 108 cartas", () => {
  const s = room();
  azesGame.startMatch(s);
  s.stairs[0].push(s.playerHands.p1.pop()!);
  s.playerPiles.p2[1].push(s.playerHands.p2.pop()!);
  s.phase = "drawing";
  azesGame.startMatch(s);
  assert.ok(s.stairs.every(st => st.length === 0));
  assert.deepEqual(s.playerPiles.p2, [[], [], []]);
  assert.equal(s.playerHands.p1.length, 5);
  assert.equal(s.phase, "playing");
  assert.equal(azesGame.checkInvariant(s), null);
});

test("startMatch: con un solo jugador no reparte", () => {
  const s = azesGame.emptyState("r1");
  azesGame.addPlayer(s, "p1");
  azesGame.startMatch(s);
  assert.equal(s.playerHands.p1.length, 0);
  assert.equal(s.deck.length, 108);
});
