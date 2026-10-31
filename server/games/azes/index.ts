import { GameModule } from "../types";
import { applyAction } from "./actions";
import { addPlayer, emptyState, startMatch } from "./setup";
import { checkInvariant, viewFor } from "./view";

export const azesGame: GameModule = {
  id: "azes",
  name: "Azes",
  minPlayers: 2,
  maxPlayers: 2,
  emptyState,
  addPlayer,
  startMatch: (state) => startMatch(state),
  applyAction: (state, playerId, action) => applyAction(state, playerId, action),
  viewFor,
  checkInvariant,
};
