/*
 * Registro de juegos del servidor. Para sumar un juego: crear su modulo (GameModule) en games/<id>/ y
 * agregarlo aca. Lo demas (salas, reconexion, revancha) ya lo da server.ts.
 */
import { azesGame } from "./azes";
import { chinchonGame } from "./chinchon";
import { GameModule } from "./types";

export const DEFAULT_GAME = "azes";

// Cada modulo tiene su propio tipo de estado de sala; para la infraestructura todos son RoomState.
export const GAMES: Record<string, GameModule<any>> = {
  [azesGame.id]: azesGame,
  [chinchonGame.id]: chinchonGame,
};

export const isKnownGame = (id: unknown): id is string => typeof id === "string" && Object.prototype.hasOwnProperty.call(GAMES, id);
