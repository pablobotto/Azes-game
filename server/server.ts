import { createServer } from "http";
import { Server } from "socket.io";
import { Card } from "./card.model";
import { GameState } from "./gameState.model";

const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });
let roomDetail: Record<string, GameState> = {};
let rooms: Record<string, string[]> = {};

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);
  socket.on("joinRoom", (roomId: string) => {
    console.log(`joinRoom pedido por ${socket.id} -> ${roomId}`);
    // crear room si no existe
    if (!rooms[roomId]) {
      roomDetail[roomId] = {stairs: [[], [], [], [], [], [], [], []], deck: [], playerHands: {}, playerDecks: {}};
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
    socket.join(roomId);
    console.log(`Sala ${roomId} ahora tiene:`, rooms[roomId], "con detalle", roomDetail[roomId]);

    if (rooms[roomId].length === 1) {
      socket.emit("identification", { socketId: socket.id});
      io.to(roomId).emit("waiting", { roomId, socketId: socket.id,  });
    } 
    if (rooms[roomId].length === 2) {
      socket.emit("identification", { socketId: socket.id});
      createNewGame(roomId);
      io.to(roomId).emit("ready", { roomId, socketId: socket.id, gameState: roomDetail[roomId] });
    }
  });

  socket.on("playCard", ({ roomId, card, stairIndex }) => {
    console.log(`${socket.id} playCard in ${roomId}:`, card?.id, "->", stairIndex);
    // reenviar a los otros en la room
    socket.to(roomId).emit("opponentPlayed", { card, stairIndex });
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
});

httpServer.listen(3000, () => console.log("Servidor escuchando en :3000"));

function createNewGame(roomId: string) {
  const suits: ('♠' | '♥' | '♦' | '♣')[] = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const valueMap: Record<string, number> = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  const decks = ["A", "B"];
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
  roomDetail[roomId].playerDecks.deck = deck
  deck.sort(() => Math.random() - 0.5);
  dealInitialHands(roomId, deck);
}

function dealInitialHands(roomId: string, deck: Card[], initialPlayerHand = 5, initialPlayerDeck = 10) {
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