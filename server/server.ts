import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Game constants
const MAP_SIZE = 128;
const MAX_PLAYERS_PER_GAME = 6;
const MATCHMAKING_TIMEOUT = 10000; // 10 seconds timeout for matchmaking

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Set proper MIME types
app.use((req, res, next) => {
  if (req.url.endsWith('.js')) {
    res.type('application/javascript');
  }
  next();
});

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '../client')));
// Also serve files from the client/dist directory
app.use(express.static(path.join(__dirname, '../client/dist')));

// Add route for the /play path
app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Catch-all route to handle client-side routing (default route is home)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Define interfaces for game data
interface Player {
  id: string;
  team: string | null;
  ready: boolean;
}

interface Game {
  id: string;
  players: Player[];
  mapSize: number;
  state: 'LOBBY' | 'RUNNING' | 'ENDED';
  units: Record<string, { x: number; y: number; facing: number; type: string; owner: string }>;
}

interface MoveUnitData {
  id: string;
  x: number;
  y: number;
  facing: number;
  duration: number;
  turnDuration: number;
}

// Game state storage
const games: Record<string, Game> = {};
const matchmakingQueue: string[] = [];
const rateLimit: Record<string, number> = {}; // Player ID -> last command timestamp

// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Send map size to new clients
  socket.emit('mapSize', { width: MAP_SIZE, height: MAP_SIZE });

  // Join matchmaking queue
  socket.on('joinMatchmaking', () => {
    matchmakingQueue.push(socket.id);
    socket.emit('matchmakingStarted');
    console.log(`Player ${socket.id} joined matchmaking queue (${matchmakingQueue.length} players)`);

    // Attempt to create a game when enough players are queued
    if (matchmakingQueue.length >= MAX_PLAYERS_PER_GAME) {
      const gamePlayers = matchmakingQueue.splice(0, MAX_PLAYERS_PER_GAME);
      createGame(gamePlayers);
    } else {
      // Start a timeout to create a game with fewer players if needed
      setTimeout(() => {
        if (matchmakingQueue.length > 0 && matchmakingQueue.length < MAX_PLAYERS_PER_GAME) {
          const gamePlayers = matchmakingQueue.splice(0, matchmakingQueue.length);
          createGame(gamePlayers);
        }
      }, MATCHMAKING_TIMEOUT);
    }
  });

  // Helper function to create a game with the given players
  function createGame(gamePlayers: string[]) {
    const gameId = `game_${Date.now()}`;
    const initialUnits: Record<string, any> = {};

    games[gameId] = {
      id: gameId,
      players: gamePlayers.map(id => ({ id, team: null, ready: false })),
      mapSize: MAP_SIZE,
      state: 'LOBBY',
      units: initialUnits
    };

    // Create initial units for each player
    gamePlayers.forEach((playerId, i) => {
      const startX = i * 5 + 2; // Spread players out
      initialUnits[`TANK_${playerId}`] = { x: startX, y: 2, facing: 0, type: 'TANK', owner: playerId };
      initialUnits[`INFANTRY_${playerId}`] = { x: startX + 1, y: 2, facing: 0, type: 'INFANTRY', owner: playerId };
      initialUnits[`HARVESTER_${playerId}`] = { x: startX + 2, y: 2, facing: 0, type: 'HARVESTER', owner: playerId };
      
      // Add player to game room
      const playerSocket = io.sockets.sockets.get(playerId);
      if (playerSocket) {
        playerSocket.join(gameId);
      }
    });

    io.to(gameId).emit('gameCreated', { gameId, players: games[gameId].players });
    console.log(`Game ${gameId} created with ${gamePlayers.length} players`);
  }

  // Set team
  socket.on('setTeam', ({ gameId, team }: { gameId: string, team: string }) => {
    const game = games[gameId];
    if (game && game.state === 'LOBBY') {
      const player = game.players.find(p => p.id === socket.id);
      if (player && (team === 'ALLIES' || team === 'SOVIETS')) {
        player.team = team;
        io.to(gameId).emit('lobbyUpdate', { players: game.players });
      }
    }
  });

  // Set ready status and start game
  socket.on('setReady', (gameId: string) => {
    const game = games[gameId];
    if (game && game.state === 'LOBBY') {
      const player = game.players.find(p => p.id === socket.id);
      if (player) {
        player.ready = true;
        io.to(gameId).emit('lobbyUpdate', { players: game.players });
        
        // Check if all players are ready
        if (game.players.every(p => p.ready)) {
          game.state = 'RUNNING';
          io.to(gameId).emit('gameStart', { gameId, players: game.players, units: game.units });
          console.log(`Game ${gameId} started`);
        }
      }
    }
  });

  // Handle unit movement
  socket.on('moveUnit', (data: MoveUnitData) => {
    const now = Date.now();
    if (rateLimit[socket.id] && now - rateLimit[socket.id] < 100) {
      return; // Rate limit: 100ms between commands
    }
    rateLimit[socket.id] = now;

    // Find which game this player is in
    const gameId = Object.keys(games).find(id => games[id].players.some(p => p.id === socket.id));
    if (gameId && games[gameId].state === 'RUNNING') {
      const unit = games[gameId].units[data.id];
      
      // Validate that this player owns the unit and the move is within bounds
      if (unit && unit.owner === socket.id && 
          data.x >= 0 && data.x < MAP_SIZE && 
          data.y >= 0 && data.y < MAP_SIZE) {
        
        // Check if the target tile is occupied by another unit
        const isOccupied = Object.values(games[gameId].units).some(u => 
          u.x === data.x && u.y === data.y && data.id !== u.owner
        );
        
        if (isOccupied) {
          return; // Skip move if target is occupied
        }
        
        // Update unit position on server
        unit.x = data.x;
        unit.y = data.y;
        unit.facing = data.facing;
        
        // Broadcast movement to all players in the game
        io.to(gameId).emit('unitMoved', data);
        console.log(`Server broadcasted movement for unit ${data.id} in game ${gameId}`);
      }
    }
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    // Remove from matchmaking queue if present
    const queueIndex = matchmakingQueue.indexOf(socket.id);
    if (queueIndex !== -1) {
      matchmakingQueue.splice(queueIndex, 1);
    }
    
    // Handle disconnection from a game
    const gameId = Object.keys(games).find(id => games[id].players.some(p => p.id === socket.id));
    if (gameId) {
      games[gameId].players = games[gameId].players.filter(p => p.id !== socket.id);
      
      // If no players left, remove the game
      if (games[gameId].players.length === 0) {
        delete games[gameId];
        console.log(`Game ${gameId} ended (no players)`);
      } else {
        // Otherwise, notify remaining players
        io.to(gameId).emit('lobbyUpdate', { players: games[gameId].players });
      }
    }
    
    console.log(`Player disconnected: ${socket.id}`);
  });
});

// Start the server on port 3000
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 