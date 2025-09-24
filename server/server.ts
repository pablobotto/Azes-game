import { createServer } from "http";
import { Server } from "socket.io";
import { Card } from "./card.model";
import { GameState } from "./gameState.model";

const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });
let roomDetail: Record<string, GameState> = {};
let rooms: Record<string, string[]> = {};
const roomQueues: Record<string, RoomQueue> = {};

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);
  socket.on("joinRoom", () => {
    console.log(`joinRoom pedido por ${socket.id}`);
    // crear room si no existe
    let roomId = Object.keys(rooms).find(r => rooms[r].length < 2);
    if (!roomId) {
      roomId = `room${Object.keys(rooms).length + 1}`;
      rooms[roomId] = [];
      roomDetail[roomId] = { roomId, stairs: [[], [], [], [], [], [], [], []], deck: [], playerHands: {}, playerDecks: {}, playerPiles: {}};
    }
    // agregar y unirse
    rooms[roomId].push(socket.id);
    roomDetail[roomId].playerDecks = { ...roomDetail[roomId].playerDecks, [socket.id]: [] };
    roomDetail[roomId].playerHands = { ...roomDetail[roomId].playerHands, [socket.id]: [] };
    roomDetail[roomId].playerPiles = { ...roomDetail[roomId].playerPiles, [socket.id]: [[],[],[]]};
    socket.join(roomId);
    console.log(`Sala ${roomId} ahora tiene:`, rooms[roomId], "con detalle", roomDetail[roomId]);

    if (rooms[roomId].length === 1) {
      roomDetail[roomId].currentPlayerId = socket.id;
      socket.emit("identification", { socketId: socket.id});
      io.to(roomId).emit("waiting", { roomId, socketId: socket.id,  });
    } 
    if (rooms[roomId].length === 2) {
      socket.emit("identification", { socketId: socket.id});
      createNewGame(roomId);
      io.to(roomId).emit("ready", { roomId, socketId: socket.id, gameState: roomDetail[roomId] });
    }
  });

  socket.on("playCard", ( gameState : GameState ) => {
    enqueue(gameState.roomId, async () => {
      roomDetail[gameState.roomId] = gameState;
      socket.to(gameState.roomId).emit("opponentPlayed", { gameState });
    });
  });
  
  socket.on("changePlayers", ( roomId: string , newCurrentPlayer: string) => {
    enqueue(roomId, async () => {
      console.log(`Cambiando jugadores en ${roomId}. Nuevo jugador:`, newCurrentPlayer);
      roomDetail[roomId].currentPlayerId = newCurrentPlayer;
      socket.to(roomId).emit("newCurrentPlayer", { newCurrentPlayer });
    });
  });

  socket.on("displayOpponentName", ( roomId: string , opponentName: string) => {
    enqueue(roomId, async () => {
      socket.to(roomId).emit("displayOpponentName", { opponentName: opponentName });
    });
  });

  socket.on("win", ( roomId: string ) => {
    console.log(`Win recibido en ${roomId} por ${socket.id}`);
    enqueue(roomId, async () => {
      socket.to(roomId).emit("lose");
    });
  });
  socket.on("tie", ( roomId: string ) => {
    console.log(`Tie recibido en ${roomId} por ${socket.id}`);
    enqueue(roomId, async () => {
      socket.to(roomId).emit("tie");
    });
  });

  socket.on("rematchAccepted", ( roomId: string ) => {
    console.log(`rematch accepted and rematch sent`);
    enqueue(roomId, async () => {
      createNewGame(roomId);
      io.to(roomId).emit("rematchAccepted", {gameState: roomDetail[roomId]});
    });
  });
  socket.on("requestRematch", ( roomId: string ) => {
    console.log(`requestRematch`);
    enqueue(roomId, async () => {
      socket.to(roomId).emit("requestRematch");
    });
  });
  socket.on("getGameState", ( roomId: string ) => {
    console.log(`getGameState`);
    enqueue(roomId, async () => {
      socket.emit("getGameState", {gameState: roomDetail[roomId]});
    });
  });
  socket.on("rejoin", ( roomId: string, socketId: string ) => {
    console.log(`rejoin recibido en ${roomId} por ${socket.id} identificadonse con ${socketId}`);
    if (socket.id === socketId) {
      console.log(`el socket ${socket.id} es el mismo`);
    } else {
      rooms[roomId] = rooms[roomId].filter(id => id !== socketId);
      rooms[roomId].push(socket.id);
      replacePlayerIdKey(roomDetail[roomId].playerHands, socketId, socket.id);
      replacePlayerIdKey(roomDetail[roomId].playerDecks, socketId, socket.id);
      replacePlayerIdKey(roomDetail[roomId].playerPiles, socketId, socket.id);
      socket.join(roomId);
    }
  });

  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
    // limpiar de rooms
    for (const r in rooms) {
      const idx = rooms[r].indexOf(socket.id);
      if (idx !== -1) {
        rooms[r].splice(idx, 1);
        console.log(`Removido ${socket.id} de ${r}. Quedan:`, rooms[r]);
        // si la sala queda vacía podés borrarla
        if (rooms[r].length === 0) delete rooms[r];
        else {
          // avisar al otro jugador que el rival se desconectó
          io.to(r).emit("opponentLeft", { roomId: r });
        }
      }
    }
  });

  socket.on("leaveRoom", (roomId) => {
    if (!rooms[roomId]) return;
    const idx = rooms[roomId].indexOf(socket.id);
    if (idx !== -1) {
      rooms[roomId].splice(idx, 1);
      console.log(`Removido ${socket.id} de ${roomId}. Quedan:`, rooms[roomId]);
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      } else {
        socket.to(roomId).emit("opponentLeft", { roomId });
      }
    }
    roomDetail[roomId] = {roomId: roomId, stairs: [[], [], [], [], [], [], [], []], deck: [], playerHands: {}, playerDecks: {}, playerPiles: {} };
    socket.leave(roomId); // 🔑 muy importante: también lo sacás del "room" de Socket.IO
  });
});

httpServer.listen(process.env.PORT || 3000, () => {
  console.log("Servidor escuchando en puerto:", process.env.PORT || 3000);
});

function createNewGame(roomId: string) {
  const suits: ('♠' | '♥' | '♦' | '♣')[] = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const valueMap: Record<string, number> = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  const decks = ["A", "B"];
  //const decks = ["A"];
  let deck: Card[] = [];

  decks.forEach(deckId => {
    suits.forEach(suit => {
      values.forEach(value => {
        deck.push({
          suit,
          value,
          numericValue: valueMap[value],
          id: `${suit}${value}#${deckId}`,
          faceUp: false,
        });
      });
    });
  });
  deck.push({ suit: '⚜', value: 'C', numericValue: 0, id: 'C#1', faceUp: false});
  deck.push({ suit: '⚜', value: 'C', numericValue: 0, id: 'C#2', faceUp: false});
  deck.push({ suit: '⚜', value: 'C', numericValue: 0, id: 'C#3', faceUp: false});
  deck.push({ suit: '⚜', value: 'C', numericValue: 0, id: 'C#4', faceUp: false});
  roomDetail[roomId].deck = deck
  deck.sort(() => Math.random() - 0.5);
  dealInitialHands(roomId, deck);
}

function dealInitialHands(roomId: string, deck: Card[], initialPlayerHand = 5, initialPlayerDeck = 10) {
  const players = Object.keys(roomDetail[roomId].playerHands);
  console.log(players);
  if (players.length < 2) return;

  const player1Id = players[0];
  const player2Id = players[1];

  roomDetail[roomId].playerHands[player1Id] = [];
  roomDetail[roomId].playerHands[player2Id] = [];
  roomDetail[roomId].playerPiles[player1Id] = [[],[],[]];
  roomDetail[roomId].playerPiles[player2Id] = [[],[],[]];
  roomDetail[roomId].playerDecks[player1Id] = [];
  roomDetail[roomId].playerDecks[player2Id] = [];
  roomDetail[roomId].stairs = [[], [], [], [], [], [], [], []];

  for (let i = 0; i < initialPlayerHand; i++) {
    Object.keys(roomDetail[roomId].playerHands).forEach((playerId) => {
      const playerCard = drawCard(deck);
      if (playerCard) roomDetail[roomId].playerHands[playerId].push(playerCard);
    });
  }
  for (let i = 0; i < initialPlayerDeck; i++) {
    Object.keys(roomDetail[roomId].playerDecks).forEach((playerId) => {
      const playerCard = drawCard(deck);
      if (playerCard) roomDetail[roomId].playerDecks[playerId].push(playerCard);
    });
  }
}

// Roba una carta del mazo
function drawCard(deck: Card[]): Card | null {
  if (deck.length === 0) return null;
    const card = deck.pop()!;
    card.faceUp = true;
    return card;
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
function replacePlayerIdKey<T>(obj: Record<string, T>, oldId: string, newId: string ): void {
  if (obj[oldId]) {
    obj[newId] = obj[oldId]; // copia los datos
    delete obj[oldId];       // elimina la key vieja
  }
}