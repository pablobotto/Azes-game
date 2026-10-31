/*
 * Registro de juegos del servidor. Para sumar un juego: crear su modulo (GameModule) en games/<id>/ y
 * agregarlo aca. Lo demas (salas, reconexion, revancha) ya lo da server.ts.
 */
import { azesGame } from "./azes";
import { GameModule } from "./types";

export const DEFAULT_GAME = "azes";

export const GAMES: Record<string, GameModule> = {
  [azesGame.id]: azesGame,
};

export const isKnownGame = (id: unknown): id is string => typeof id === "string" && Object.prototype.hasOwnProperty.call(GAMES, id);
