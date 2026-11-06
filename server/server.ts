import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { GameState, RoomState } from "./gameState.model";
import { GameResult } from "./games/types";
import { DEFAULT_GAME, GAMES, isKnownGame } from "./games/registry";

// Tiempo que se espera a un jugador desconectado antes de darlo por ido.
const GRACE_MS = 90_000;
// Interruptor de la fase 2: las salas nuevas se juegan con acciones validadas en el servidor.
// Para volver al modo de la fase 1 sin tocar el codigo: AUTHORITATIVE=0 en el entorno. Se lee al crear cada sala.
const isAuthoritative = () => process.env.AUTHORITATIVE !== "0";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
  // Detecta caidas de conexion mas rapido que el default (25s/20s).
  pingInterval: 5000,
  pingTimeout: 8000,
});

interface RoomMeta {
  gameId: string;
  started: boolean;
  result?: { type: "win" | "tie"; winnerId?: string };
  graceTimers: Record<string, NodeJS.Timeout>;
  // nombre que cada jugador dijo tener (solo para mostrarlo; lo escribe el cliente)
  names: Record<string, string>;
}

const roomDetail: Record<string, RoomState> = {};
const rooms: Record<string, string[]> = {};      // roomId -> playerIds
const roomMeta: Record<string, RoomMeta> = {};
const roomQueues: Record<string, RoomQueue> = {};
const playerSockets: Record<string, string> = {}; // playerId -> socket.id actual
let roomCounter = 0;

// Registro de conectividad: una linea por evento, con claves fijas para filtrar en los logs de Render
// (por ejemplo: "[net] event=disconnect"). Del playerId solo se muestran los primeros 8 caracteres.
const tag = (id: string) => id.slice(0, 8);
const net = (event: string, fields: Record<string, string | number | boolean | undefined> = {}) => {
  const rest = Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${typeof v === "string" && /\s/.test(v) ? JSON.stringify(v) : v}`);
  console.log(["[net]", `event=${event}`, ...rest].join(" "));
};
// cuando se cayo cada jugador (solo de partidas en curso), para saber cuanto tardo en volver
const offlineSince: Record<string, number> = {};
const offlineFor = (playerId: string) => (offlineSince[playerId] ? Date.now() - offlineSince[playerId] : undefined);

process.on("uncaughtException", (err) => console.error("uncaughtException:", err));
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));

io.on("connection", (socket) => {
  // El playerId lo genera el cliente y sobrevive a las reconexiones (el socket.id no).
  const auth = socket.handshake.auth as { playerId?: unknown } | undefined;
  const playerId: string =
    typeof auth?.playerId === "string" && auth.playerId.length > 0 && auth.playerId.length <= 64
      ? auth.playerId
      : socket.id;
  console.log("Cliente conectado:", socket.id, "player:", playerId);

  const previousSocketId = playerSockets[playerId];
  net("connect", {
    player: tag(playerId), transport: socket.conn.transport.name, room: findRoomOf(playerId),
    replaced: !!previousSocketId && previousSocketId !== socket.id, // el servidor aun no habia notado la caida anterior
    offlineMs: offlineFor(playerId),
  });
  playerSockets[playerId] = socket.id;
  if (previousSocketId && previousSocketId !== socket.id) {
    // socket "zombie" de una conexion que el servidor aun no detecto como caida
    io.sockets.sockets.get(previousSocketId)?.disconnect(true);
  }

  const on = (event: string, handler: (...args: any[]) => void) => {
    socket.on(event, (...args: any[]) => {
      try {
        handler(...args);
      } catch (err) {
        console.error(`Error en handler "${event}":`, err);
      }
    });
  };

  on("joinRoom", (gameId?: string) => {
    const game = isKnownGame(gameId) ? gameId : DEFAULT_GAME;
    console.log(`joinRoom pedido por ${playerId} (${game})`);
    // revisar si ya está en una sala
    const currentRoom = findRoomOf(playerId);
    if (currentRoom) {
      console.log(`El jugador ${playerId} ya está en la sala ${currentRoom}`);
      return;
    }
    // buscar una sala del mismo juego que todavia no empezo
    let roomId = Object.keys(rooms).find(r =>
      roomMeta[r].gameId === game && !roomMeta[r].started && rooms[r].length < GAMES[game].maxPlayers
    );
    if (!roomId) {
      roomId = `room${++roomCounter}`;
      rooms[roomId] = [];
      roomMeta[roomId] = { gameId: game, started: false, graceTimers: {}, names: {} };
      // solo Azes tiene todavia el camino viejo (flag AUTHORITATIVE); los juegos nuevos son siempre autoritativos
      roomDetail[roomId] = { ...GAMES[game].emptyState(roomId), gameId: game, authoritative: game === DEFAULT_GAME ? isAuthoritative() : true };
    }
    // agregar y unirse
    rooms[roomId].push(playerId);
    GAMES[game].addPlayer(roomDetail[roomId], playerId);
    socket.join(roomId);
    console.log(`Sala ${roomId} ahora tiene:`, rooms[roomId]);

    if (rooms[roomId].length === 1) {
      roomDetail[roomId].currentPlayerId = playerId;
      socket.emit("identification", { socketId: playerId });
      io.to(roomId).emit("waiting", { roomId, socketId: playerId });
    }
    // Hoy la partida arranca al llenarse la sala. Para juegos con rango (2 a 4) se sumara un arranque
    // explicito una vez alcanzado minPlayers; con min == max (Azes) es lo mismo que antes.
    if (rooms[roomId].length === GAMES[game].maxPlayers) {
      roomMeta[roomId].started = true;
      socket.emit("identification", { socketId: playerId });
      createNewGame(roomId);
      sendToRoom(roomId, "ready", { roomId, socketId: playerId });
    }
  });

  // El cliente manda su snapshot, pero el servidor solo toma lo que ese jugador puede modificar:
  //  - sus propias zonas (mano, mazo, pilas): siempre
  //  - zonas compartidas (mazo central, escaleras): solo si es el jugador de turno
  // Asi un mensaje atrasado nunca pisa las cartas del rival.
  on("playCard", (snapshot: GameState) => {
    const roomId = snapshot?.roomId;
    if (!isMember(roomId, playerId) || roomDetail[roomId]?.authoritative) return;
    enqueue(roomId, async () => {
      const cur = roomDetail[roomId] as GameState | undefined; // modo viejo: solo existe para Azes
      if (!cur) return;
      if (snapshot.matchId !== undefined && snapshot.matchId !== cur.matchId) {
        console.log(`playCard de partida vieja en ${roomId}, resincronizando a ${playerId}`);
        sendSync(socket, roomId);
        return;
      }
      if (Array.isArray(snapshot.playerHands?.[playerId])) cur.playerHands[playerId] = snapshot.playerHands[playerId];
      if (Array.isArray(snapshot.playerDecks?.[playerId])) cur.playerDecks[playerId] = snapshot.playerDecks[playerId];
      const piles = snapshot.playerPiles?.[playerId];
      if (Array.isArray(piles) && piles.every(Array.isArray)) cur.playerPiles[playerId] = piles;

      if (cur.currentPlayerId === playerId) {
        if (Array.isArray(snapshot.deck)) cur.deck = snapshot.deck;
        if (Array.isArray(snapshot.stairs)) cur.stairs = snapshot.stairs;
      } else if (JSON.stringify(snapshot.stairs) !== JSON.stringify(cur.stairs)) {
        console.log(`${playerId} intento escribir zonas compartidas fuera de turno en ${roomId}`);
        sendSync(socket, roomId);
      }
      socket.to(roomId).emit("opponentPlayed", { gameState: cur });
    });
  });

  // Modo autoritativo: el cliente manda una intencion (draw / play / discard), el servidor la valida con las
  // reglas, la aplica y difunde el estado nuevo a los dos. Responde por ack { ok } o { error }.
  on("action", (payload: any, ack?: (res: { ok?: boolean; error?: string }) => void) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const roomId = payload?.roomId;
    if (!isMember(roomId, playerId)) { reply({ error: "bad_action" }); return; }
    enqueue(roomId, async () => {
      const cur = roomDetail[roomId];
      const meta = roomMeta[roomId];
      if (!cur || !meta || !cur.authoritative) { reply({ error: "bad_action" }); return; }
      if (payload.matchId !== undefined && payload.matchId !== cur.matchId) {
        console.log(`action de partida vieja en ${roomId}, resincronizando a ${playerId}`);
        net("action_stale", { player: tag(playerId), room: roomId, game: roomMeta[roomId]?.gameId, matchId: payload.matchId, current: cur.matchId });
        sendSync(socket, roomId);
        reply({ error: "stale" });
        return;
      }
      if (meta.result) { reply({ error: "game_over" }); return; }
      // copia para deshacer la accion si dejara el estado sin las 108 cartas
      const backup = JSON.parse(JSON.stringify(cur));
      const game = gameOf(roomId);
      const outcome = game.applyAction(cur, playerId, payload);
      const broken = outcome.error ? null : game.checkInvariant(cur);
      if (broken) {
        console.error(`INVARIANTE ROTO en ${roomId} tras ${JSON.stringify(payload)}: ${broken}. Accion deshecha.`);
        Object.assign(cur, backup);
        sendSync(socket, roomId);
        reply({ error: "invariant" });
        return;
      }
      if (outcome.error) {
        console.log(`action rechazada en ${roomId} de ${playerId}: ${outcome.error}`);
        net("action_rejected", { player: tag(playerId), room: roomId, game: meta.gameId, type: payload?.type, error: outcome.error, version: cur.version, offlineMs: offlineFor(playerId) });
        sendSync(socket, roomId);
        reply({ error: outcome.error });
        return;
      }
      cur.version = (cur.version ?? 0) + 1;
      // el efecto va con el estado: el rival lo usa para animar el movimiento recien confirmado
      sendToRoom(roomId, "state", { effect: outcome.effect });
      reply({ ok: true });
      if (outcome.result) finishGame(roomId, socket, outcome.result);
    });
  });

  // fromTurn hace idempotente el cambio de turno: un reenvio tras una reconexion no se aplica dos veces.
  on("changePlayers", (roomId: string, newCurrentPlayer: string, fromTurn?: number) => {
    if (!isMember(roomId, playerId) || roomDetail[roomId]?.authoritative) return;
    enqueue(roomId, async () => {
      const cur = roomDetail[roomId];
      if (!cur) return;
      if (fromTurn !== undefined && cur.turn !== undefined && fromTurn < cur.turn) {
        console.log(`changePlayers duplicado en ${roomId} (turn ${fromTurn} < ${cur.turn}), ignorado`);
        return;
      }
      if (cur.currentPlayerId !== playerId || !isMember(roomId, newCurrentPlayer) || newCurrentPlayer === playerId) {
        console.log(`changePlayers invalido en ${roomId} de ${playerId}`);
        sendSync(socket, roomId);
        return;
      }
      console.log(`Cambiando jugadores en ${roomId}. Nuevo jugador:`, newCurrentPlayer);
      cur.currentPlayerId = newCurrentPlayer;
      cur.turn = (cur.turn ?? 0) + 1;
      socket.to(roomId).emit("newCurrentPlayer", { newCurrentPlayer, turn: cur.turn });
    });
  });

  on("displayOpponentName", (roomId: string, opponentName: string) => {
    if (!isMember(roomId, playerId) || typeof opponentName !== "string") return;
    opponentName = opponentName.trim().slice(0, 30);
    enqueue(roomId, async () => {
      if (roomMeta[roomId]) roomMeta[roomId].names[playerId] = opponentName;
      socket.to(roomId).emit("displayOpponentName", { opponentName: opponentName });
    });
  });

  on("win", (roomId: string) => {
    if (!isMember(roomId, playerId) || roomDetail[roomId]?.authoritative) return;
    console.log(`Win recibido en ${roomId} por ${playerId}`);
    enqueue(roomId, async () => {
      if (roomMeta[roomId]) roomMeta[roomId].result = { type: "win", winnerId: playerId };
      socket.to(roomId).emit("lose");
    });
  });
  on("tie", (roomId: string) => {
    if (!isMember(roomId, playerId) || roomDetail[roomId]?.authoritative) return;
    console.log(`Tie recibido en ${roomId} por ${playerId}`);
    enqueue(roomId, async () => {
      if (roomMeta[roomId]) roomMeta[roomId].result = { type: "tie" };
      socket.to(roomId).emit("tie");
    });
  });

  on("rematchAccepted", (roomId: string) => {
    if (!isMember(roomId, playerId)) return;
    console.log(`rematch accepted and rematch sent`);
    enqueue(roomId, async () => {
      if (!roomDetail[roomId]) return;
      createNewGame(roomId);
      if (roomMeta[roomId]) roomMeta[roomId].result = undefined;
      sendToRoom(roomId, "rematchAccepted");
    });
  });
  on("requestRematch", (roomId: string) => {
    if (!isMember(roomId, playerId)) return;
    console.log(`requestRematch`);
    enqueue(roomId, async () => {
      socket.to(roomId).emit("requestRematch");
    });
  });
  on("getGameState", (roomId: string) => {
    if (!isMember(roomId, playerId)) return;
    enqueue(roomId, async () => {
      sendSync(socket, roomId);
    });
  });

  // Reconexion: el servidor identifica al jugador por su playerId (auth), no por lo que diga el cliente.
  on("rejoin", (roomId: string) => {
    console.log(`rejoin recibido en ${roomId} de ${playerId} (socket ${socket.id})`);
    if (typeof roomId !== "string" || !isMember(roomId, playerId)) {
      console.log(`rejoin rechazado: ${playerId} no pertenece a ${roomId}`);
      net("rejoin_failed", { player: tag(playerId), room: typeof roomId === "string" ? roomId : undefined, why: "not_member", offlineMs: offlineFor(playerId) });
      socket.emit("rejoinFailed");
      return;
    }
    enqueue(roomId, async () => {
      const cur = roomDetail[roomId];
      const meta = roomMeta[roomId];
      if (!cur || !meta || !rooms[roomId]?.includes(playerId)) {
        net("rejoin_failed", { player: tag(playerId), room: roomId, why: "room_gone", offlineMs: offlineFor(playerId) });
        socket.emit("rejoinFailed");
        return;
      }
      net("rejoin_ok", { player: tag(playerId), room: roomId, game: meta.gameId, offlineMs: offlineFor(playerId), version: cur.version });
      delete offlineSince[playerId];
      clearGrace(roomId, playerId);
      socket.join(roomId);
      socket.emit("rejoined", { gameState: stateFor(roomId, playerId), socketId: playerId });
      if (meta.result) {
        if (meta.result.type === "tie") socket.emit("tie");
        else if (meta.result.winnerId !== playerId) socket.emit("lose");
        else if (cur.authoritative) socket.emit("youWon");
      }
      // tras un refresh el cliente no recuerda el nombre del rival: se lo devolvemos
      const rivalId = rooms[roomId].find(id => id !== playerId);
      const rivalName = rivalId && meta.names[rivalId];
      if (rivalName) socket.emit("displayOpponentName", { opponentName: rivalName });
      socket.to(roomId).emit("opponentOnline");
    });
  });

  on("disconnect", (reason?: string) => {
    console.log("Cliente desconectado:", socket.id, "player:", playerId);
    {
      const rid = findRoomOf(playerId);
      net("disconnect", {
        player: tag(playerId), reason, room: rid, game: rid ? roomMeta[rid]?.gameId : undefined,
        phase: rid ? (roomMeta[rid]?.started ? "playing" : "waiting") : "none",
        stale: playerSockets[playerId] !== socket.id, // true: ya volvio con otro socket
      });
    }
    // si el jugador ya se reconecto con otro socket, este es un residuo
    if (playerSockets[playerId] !== socket.id) return;
    delete playerSockets[playerId];
    const roomId = findRoomOf(playerId);
    if (!roomId) return;
    enqueue(roomId, async () => {
      const meta = roomMeta[roomId];
      if (!meta || !rooms[roomId]?.includes(playerId)) return;
      if (playerSockets[playerId]) return; // volvio mientras esperaba en la cola
      if (!meta.started) {
        // sala de espera: no hay nada que recuperar
        removePlayer(roomId, playerId, false);
        return;
      }
      // partida en curso: damos un margen para reconectar antes de darlo por ido
      offlineSince[playerId] = Date.now();
      io.to(roomId).emit("opponentOffline");
      clearGrace(roomId, playerId);
      meta.graceTimers[playerId] = setTimeout(() => {
        enqueue(roomId, async () => {
          if (!roomMeta[roomId]) return;
          delete roomMeta[roomId].graceTimers[playerId];
          if (playerSockets[playerId]) return;
          console.log(`Gracia vencida para ${playerId} en ${roomId}`);
          net("grace_expired", { player: tag(playerId), room: roomId, game: roomMeta[roomId]?.gameId, offlineMs: offlineFor(playerId) });
          delete offlineSince[playerId];
          removePlayer(roomId, playerId, true);
        });
      }, GRACE_MS);
    });
  });

  // En la sala de espera el cliente todavia no conoce el id de la sala: se la busca por jugador.
  on("leaveRoom", (requested?: string) => {
    const roomId = isMember(requested, playerId) ? requested : findRoomOf(playerId);
    if (!roomId) return;
    socket.leave(roomId);
    enqueue(roomId, async () => {
      removePlayer(roomId, playerId, true);
    });
  });
});

httpServer.listen(process.env.PORT || 3000, () => {
  console.log("Servidor escuchando en puerto:", process.env.PORT || 3000);
});

function findRoomOf(playerId: string): string | undefined {
  return Object.keys(rooms).find(r => rooms[r].includes(playerId));
}
function isMember(roomId: unknown, playerId: string): roomId is string {
  return typeof roomId === "string" && !!rooms[roomId] && rooms[roomId].includes(playerId);
}
// Fin de partida en modo autoritativo: gana quien jugo (youWon) y el rival pierde (lose); el empate le llega a los dos.
function finishGame(roomId: string, actor: Socket, result: GameResult) {
  roomMeta[roomId].result = result;
  if (result.type === "tie") {
    io.to(roomId).emit("tie");
    return;
  }
  actor.emit("youWon");
  actor.to(roomId).emit("lose");
}
function gameOf(roomId: string) {
  return GAMES[roomMeta[roomId]?.gameId ?? DEFAULT_GAME];
}
// En modo autoritativo cada jugador recibe su vista (sin la mano del rival ni el mazo central).
function stateFor(roomId: string, forPlayerId: string): RoomState {
  const state = roomDetail[roomId];
  return state.authoritative ? gameOf(roomId).viewFor(state, forPlayerId) : state;
}
function sendToRoom(roomId: string, event: string, extra: object = {}) {
  for (const pid of rooms[roomId] ?? []) {
    const sid = playerSockets[pid];
    if (sid) io.to(sid).emit(event, { ...extra, gameState: stateFor(roomId, pid) });
  }
}
function sendSync(socket: Socket, roomId: string) {
  if (!roomDetail[roomId]) return;
  net("sync_sent", { room: roomId, game: roomMeta[roomId]?.gameId, version: roomDetail[roomId].version });
  const forPlayer = Object.keys(playerSockets).find(pid => playerSockets[pid] === socket.id);
  socket.emit("stateSync", { gameState: forPlayer ? stateFor(roomId, forPlayer) : roomDetail[roomId] });
}
function clearGrace(roomId: string, playerId: string) {
  const timers = roomMeta[roomId]?.graceTimers;
  if (timers && timers[playerId]) {
    clearTimeout(timers[playerId]);
    delete timers[playerId];
  }
}
function removePlayer(roomId: string, playerId: string, notifyOpponent: boolean) {
  const members = rooms[roomId];
  if (!members) return;
  const idx = members.indexOf(playerId);
  if (idx === -1) return;
  members.splice(idx, 1);
  clearGrace(roomId, playerId);
  console.log(`Removido ${playerId} de ${roomId}. Quedan:`, members);
  if (members.length === 0) {
    destroyRoom(roomId);
  } else if (notifyOpponent) {
    io.to(roomId).emit("opponentLeft", { roomId });
  }
}
function destroyRoom(roomId: string) {
  Object.keys(roomMeta[roomId]?.graceTimers ?? {}).forEach(pid => clearGrace(roomId, pid));
  delete rooms[roomId];
  delete roomDetail[roomId];
  delete roomMeta[roomId];
  delete roomQueues[roomId];
}

// Inicio y revancha: el juego reparte; la infraestructura lleva la cuenta de partidas, turnos y versiones.
function createNewGame(roomId: string) {
  const state = roomDetail[roomId];
  gameOf(roomId).startMatch(state);
  state.matchId = (state.matchId ?? 0) + 1;
  state.turn = 0;
  state.version = (state.version ?? 0) + 1;
}

//Queeueing system to process socket events sequentially per room
interface RoomQueue {
  queue: (() => Promise<void>)[];
  processing: boolean;
}
function enqueue(roomId: string, task: () => Promise<void>) {
  if (!roomQueues[roomId]) {
    roomQueues[roomId] = { queue: [], processing: false };
  }
  roomQueues[roomId].queue.push(task);
  processQueue(roomId);
}
async function processQueue(roomId: string) {
  const room = roomQueues[roomId];
  if (!room || room.processing) return;
  room.processing = true;
  while (room.queue.length > 0) {
    const task = room.queue.shift();
    if (task) {
      try {
        await task();
      } catch (err) {
        console.error('Error en tarea del socket:', err);
      }
    }
  }
  room.processing = false;
}
