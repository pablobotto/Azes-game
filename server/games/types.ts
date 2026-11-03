/*
 * Contrato de un juego en el servidor (fase 3).
 *
 * La infraestructura (salas, cola por sala, gracia y reconexion, playerId, versiones, resultado, revancha)
 * vive en server.ts y es comun a todos los juegos. Cada juego solo aporta lo de abajo: como se arma su
 * estado, que acciones acepta, que ve cada jugador y como se comprueba que el estado esta sano.
 *
 * El estado de sala es generico: cada juego define el suyo extendiendo RoomState (sobre comun). Quedan
 * propios de Azes, hasta retirar el modo viejo (paso (e) de la fase 2), los manejadores legacy de server.ts,
 * y ActionOutcome/MoveEffect, que Chinchon generalizara cuando necesite efectos propios.
 */
import { GameState, RoomState } from "../gameState.model";
import { ActionOutcome } from "./azes/actions";

export type { ActionOutcome, GameResult, MoveEffect } from "./azes/actions";
export type { RoomState } from "../gameState.model";

/** S es el estado de sala propio del juego (extiende el sobre comun RoomState). */
export interface GameModule<S extends RoomState = GameState> {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;

  /** Estado vacio de una sala nueva (sin jugadores). */
  emptyState(roomId: string): S;
  /** Prepara el lugar de un jugador que entra a la sala. */
  addPlayer(state: S, playerId: string): void;
  /** Reparte / reinicia la partida en el mismo estado (inicio y revancha). */
  startMatch(state: S): void;

  /** Aplica una accion del jugador. Solo muta el estado si es valida. */
  applyAction(state: S, playerId: string, action: unknown): ActionOutcome;
  /** Lo que ese jugador puede saber del estado (oculta lo privado). */
  viewFor(state: S, playerId: string): S;
  /** Texto con el problema si el estado esta roto; null si esta bien. */
  checkInvariant(state: S): string | null;
}
