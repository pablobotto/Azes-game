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
  socket.on("joinRoom", (roomId: string) => {
    console.log(`joinRoom pedido por ${socket.id} -> ${roomId}`);
    // crear room si no existe
    if (!rooms[roomId]) {
      roomDetail[roomId] = {roomId: roomId, stairs: [[], [], [], [], [], [], [], []], deck: [], playerHands: {}, playerDecks: {}, playerPiles: {} };
      rooms[roomId] = [];
    }
    // evitar duplicados (si reintenta unirse sin desconectar)
    if (rooms[roomId].includes(socket.id)) { 
      console.log(`En sala ${roomId} ya existe, rechazando ${socket.id}`);   
      return;
    }
    // sala llena
    if (rooms[roomId].length >= 2) {
      console.log(`Sala ${roomId} llena, rechazando ${socket.id}`);
      socket.emit("roomFull", { roomId });
      return;
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

httpServer.listen(3000, () => console.log("Servidor escuchando en :3000"));

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

  // Cartas específicas para test
  const player1Cards = ["♥A#A", "♦2#A", "♣3#A", "♠4#A", "♥5#A"];
  const player2Cards = ["♦6#A", "♣7#A", "♠8#A", "♥9#A", "♦10#A"];

  roomDetail[roomId].playerHands[player1Id] = [];
  roomDetail[roomId].playerHands[player2Id] = [];

  player1Cards.forEach(cardId => {
    const card = drawSpecificCard(deck, cardId);
    if (card) roomDetail[roomId].playerHands[player1Id].push(card);
  });

  player2Cards.forEach(cardId => {
    const card = drawSpecificCard(deck, cardId);
    if (card) roomDetail[roomId].playerHands[player2Id].push(card);
  });

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
function drawSpecificCard(deck: Card[], cardId: string): Card | null {
  const index = deck.findIndex(c => c.id === cardId);
  if (index === -1) return null;
  const card = deck.splice(index, 1)[0]; // la saco del mazo
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