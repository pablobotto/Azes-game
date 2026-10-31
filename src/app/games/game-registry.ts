/*
 * Lista de juegos que muestra el desplegable de la barra superior.
 * Para sumar uno: agregarlo aca (con available: true cuando ya se pueda jugar) y registrarlo tambien en el
 * servidor (server/games/registry.ts). El id es el mismo en los dos lados.
 */
export interface GameInfo {
  id: string;
  /** Texto del desplegable: maximo 10 letras, la barra superior es angosta */
  name: string;
  /** false = aparece en la lista pero todavia no se puede elegir */
  available: boolean;
}

export const GAMES: GameInfo[] = [
  { id: 'azes', name: 'Azes', available: true },
];

export const DEFAULT_GAME_ID = 'azes';

export const isPlayableGame = (id: string): boolean => GAMES.some(g => g.id === id && g.available);
