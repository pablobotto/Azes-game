import { test } from "node:test";
import assert from "node:assert/strict";
import { Card } from "../../card.model";
import { GameState } from "../../gameState.model";
import { applyAction } from "./actions";

const valueMap: Record<string, number> = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, C: 0 };
const card = (value: string, id = `${value}#${Math.random()}`): Card => ({
  suit: value === "C" ? "⚜" : "♠", value, numericValue: valueMap[value], id, faceUp: true,
});
const noShuffle = (cards: Card[]) => cards;

function newState(over: Partial<GameState> = {}): GameState {
  return {
    roomId: "r1", authoritative: true, currentPlayerId: "p1", phase: "playing", turn: 0, version: 1,
    deck: [], stairs: [[], [], [], [], [], [], [], []],
    playerHands: { p1: [card("A", "a1"), card("5", "h5")], p2: [card("7", "o7")] },
    playerDecks: { p1: [card("9", "d9"), card("2", "d2")], p2: [card("4")] },
    playerPiles: { p1: [[], [], []], p2: [[], [], []] },
    ...over,
  };
}

test("rechaza acciones mal formadas", () => {
  const s = newState();
  for (const bad of [null, "x", {}, { type: "fly" }, { type: "play", cardId: 3, stairIdx: 0 },
    { type: "play", cardId: "a1", stairIdx: 8 }, { type: "play", cardId: "a1", stairIdx: -1 },
    { type: "play", cardId: "a1", stairIdx: 1.5 }, { type: "discard", cardId: "h5", pileIdx: 3 }]) {
    assert.equal(applyAction(s, "p1", bad).error, "bad_action");
  }
});

test("solo juega el jugador de turno", () => {
  const s = newState();
  assert.equal(applyAction(s, "p2", { type: "play", cardId: "o7", stairIdx: 0 }).error, "not_your_turn");
  assert.equal(applyAction(s, "intruso", { type: "draw" }).error, "bad_action");
});

test("play: un As abre una escalera y sale de la mano", () => {
  const s = newState();
  const out = applyAction(s, "p1", { type: "play", cardId: "a1", stairIdx: 2 });
  assert.deepEqual(out, {});
  assert.deepEqual(s.stairs[2].map(c => c.id), ["a1"]);
  assert.deepEqual(s.playerHands.p1.map(c => c.id), ["h5"]);
  assert.equal(s.phase, "playing");
});

test("play: jugada ilegal no cambia nada", () => {
  const s = newState();
  const before = JSON.stringify(s);
  assert.equal(applyAction(s, "p1", { type: "play", cardId: "h5", stairIdx: 0 }).error, "illegal_move");
  assert.equal(JSON.stringify(s), before);
});

test("play: carta que no es del jugador o no esta en el tope es ilegal", () => {
  const s = newState();
  assert.equal(applyAction(s, "p1", { type: "play", cardId: "o7", stairIdx: 0 }).error, "illegal_move");
  // d9 esta tapada por d2 en el mazo propio
  s.stairs[0] = [card("A"), card("2"), card("3"), card("4"), card("5"), card("6"), card("7"), card("8")];
  assert.equal(applyAction(s, "p1", { type: "play", cardId: "d9", stairIdx: 0 }).error, "illegal_move");
});

test("play: se puede jugar el tope del mazo propio y de un monton", () => {
  const s = newState();
  s.stairs[0] = [card("A")];
  assert.deepEqual(applyAction(s, "p1", { type: "play", cardId: "d2", stairIdx: 0 }), {});
  assert.deepEqual(s.playerDecks.p1.map(c => c.id), ["d9"]);
  s.playerPiles.p1[1] = [card("K"), card("3", "p3")];
  assert.deepEqual(applyAction(s, "p1", { type: "play", cardId: "p3", stairIdx: 0 }), {});
  assert.equal(s.playerPiles.p1[1].length, 1);
});

test("play: el comodin toma el valor siguiente (igual que el cliente)", () => {
  const s = newState();
  s.playerHands.p1 = [card("C", "j1"), card("5", "h5")];
  s.stairs[0] = [card("A")];
  assert.deepEqual(applyAction(s, "p1", { type: "play", cardId: "j1", stairIdx: 0 }), {});
  assert.equal(s.stairs[0][1].numericValue, 2);
  assert.deepEqual(applyAction(s, "p1", { type: "play", cardId: "h5", stairIdx: 0 }).error, "illegal_move");
});

test("play: mano vacia vuelve al paso de robar", () => {
  const s = newState();
  s.playerHands.p1 = [card("A", "a1")];
  assert.deepEqual(applyAction(s, "p1", { type: "play", cardId: "a1", stairIdx: 0 }), {});
  assert.equal(s.phase, "drawing");
  assert.equal(s.currentPlayerId, "p1");
});

test("play: quedarse sin mazo propio es ganar", () => {
  const s = newState();
  s.playerDecks.p1 = [card("A", "d1")];
  const out = applyAction(s, "p1", { type: "play", cardId: "d1", stairIdx: 0 });
  assert.deepEqual(out, { result: { type: "win", winnerId: "p1" } });
});

test("play: no se juega en el paso de robar", () => {
  const s = newState({ phase: "drawing" });
  assert.equal(applyAction(s, "p1", { type: "play", cardId: "a1", stairIdx: 0 }).error, "wrong_step");
});

test("discard: no se puede con un As en la mano", () => {
  const s = newState();
  assert.equal(applyAction(s, "p1", { type: "discard", cardId: "h5", pileIdx: 0 }).error, "ace_first");
});

test("discard: manda la carta al monton y pasa el turno", () => {
  const s = newState();
  s.playerHands.p1 = [card("5", "h5"), card("6", "h6")];
  assert.deepEqual(applyAction(s, "p1", { type: "discard", cardId: "h6", pileIdx: 1 }), {});
  assert.deepEqual(s.playerPiles.p1[1].map(c => c.id), ["h6"]);
  assert.deepEqual(s.playerHands.p1.map(c => c.id), ["h5"]);
  assert.equal(s.currentPlayerId, "p2");
  assert.equal(s.turn, 1);
  assert.equal(s.phase, "drawing");
  // el turno ya no es de p1
  assert.equal(applyAction(s, "p1", { type: "discard", cardId: "h5", pileIdx: 0 }).error, "not_your_turn");
});

test("discard: solo cartas de la mano", () => {
  const s = newState();
  s.playerHands.p1 = [card("5", "h5")];
  assert.equal(applyAction(s, "p1", { type: "discard", cardId: "d2", pileIdx: 0 }).error, "illegal_move");
});

test("draw: completa la mano a 5 y pasa a jugar", () => {
  const deck = ["x1", "x2", "x3", "x4", "x5", "x6"].map(id => card("9", id));
  const s = newState({ phase: "drawing", deck });
  s.playerHands.p1 = [card("5", "h5"), card("6", "h6")];
  assert.deepEqual(applyAction(s, "p1", { type: "draw" }, noShuffle), {});
  assert.deepEqual(s.playerHands.p1.map(c => c.id), ["h5", "h6", "x6", "x5", "x4"]);
  assert.equal(s.deck.length, 3);
  assert.equal(s.phase, "playing");
  assert.equal(applyAction(s, "p1", { type: "draw" }, noShuffle).error, "wrong_step");
});

test("draw: si el mazo no alcanza es empate", () => {
  const s = newState({ phase: "drawing", deck: [card("9", "x1")] });
  s.playerHands.p1 = [card("5", "h5")];
  assert.deepEqual(applyAction(s, "p1", { type: "draw" }, noShuffle), { result: { type: "tie" } });
});

test("draw: una escalera completa vuelve al mazo antes de robar", () => {
  const full = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((v, i) => card(v, `s${i}`));
  const s = newState({ phase: "drawing", deck: [card("9", "x1"), card("9", "x2")] });
  s.stairs[3] = full;
  s.playerHands.p1 = [card("5"), card("6"), card("7"), card("8"), card("9")];
  assert.deepEqual(applyAction(s, "p1", { type: "draw" }, noShuffle), {});
  assert.equal(s.stairs[3].length, 0);
  assert.equal(s.deck.length, 2 + 13);
});
