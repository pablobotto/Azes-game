import { Card } from './card.model';

/**
 * Movimiento confirmado por el servidor, para animarlo en la pantalla del rival.
 * Solo trae cartas que quedan boca arriba en la mesa; al robar, unicamente la cantidad.
 */
export type MoveEffect =
  | { kind: 'play'; playerId: string; card: Card; from: 'hand' | 'deck' | 'pile'; pileIdx?: number; stairIdx: number }
  | { kind: 'discard'; playerId: string; card: Card; pileIdx: number }
  | { kind: 'draw'; playerId: string; count: number; reshuffled: number[] };
