import { GameModule } from "../types";
import { applyAction, addPlayer, ChinchonState, emptyState, startMatch } from "./actions";
import { checkInvariant, viewFor } from "./view";

export const chinchonGame: GameModule<ChinchonState> = {
  id: "chinchon",
  name: "Chinchón",
  minPlayers: 2,
  maxPlayers: 2, // la estructura (asientos, turno por orden) ya admite 3 o 4
  emptyState,
  addPlayer,
  startMatch: (state) => startMatch(state),
  applyAction: (state, playerId, action) => applyAction(state, playerId, action),
  viewFor,
  checkInvariant,
};
