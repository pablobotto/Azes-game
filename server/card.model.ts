export interface Card {
  suit: '♠' | '♥' | '♦' | '♣' | '⚜';
  value: string; // 'A' - 'K'
  numericValue: number; // 1 - 13
  id: string; // Unique identifier
  faceUp: boolean;
}