/*
 * Contrato de un juego en el servidor (fase 3).
 *
 * La infraestructura (salas, cola por sala, gracia y reconexion, playerId, versiones, resultado, revancha)
 * vive en server.ts y es comun a todos los juegos. Cada juego solo aporta lo de abajo: como se arma su
 * estado, que acciones acepta, que ve cada jugador y como se comprueba que el estado esta sano.
 *
 * Por ahora el estado de sala sigue siendo GameState (el de Azes). Se generaliza cuando se retire el modo
 * viejo (paso (e) de la fase 2), que es lo unico que todavia depende de los campos propios de Azes.
 */
import { GameState } from "../gameState.model";
import { ActionOutcome } from "./azes/actions";

export type { ActionOutcome, GameResult } from "./azes/actions";

export interface GameModule {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;

  /** Estado vacio de una sala nueva (sin jugadores). */
  emptyState(roomId: string): GameState;
  /** Prepara el lugar de un jugador que entra a la sala. */
  addPlayer(state: GameState, playerId: string): void;
  /** Reparte / reinicia la partida en el mismo estado (inicio y revancha). */
  startMatch(state: GameState): void;

  /** Aplica una accion del jugador. Solo muta el estado si es valida. */
  applyAction(state: GameState, playerId: string, action: unknown): ActionOutcome;
  /** Lo que ese jugador puede saber del estado (oculta lo privado). */
  viewFor(state: GameState, playerId: string): GameState;
  /** Texto con el problema si el estado esta roto; null si esta bien. */
  checkInvariant(state: GameState): string | null;
}
