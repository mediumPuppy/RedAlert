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
const ORE_PER_TILE = 500;
const ORE_HARVEST_RATE = 50;

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
  resources: number;
  power: number;
  powerUsed: number;
}

interface Unit {
  x: number;
  y: number;
  facing: number;
  type: string;
  owner: string;
  lastMove?: {
    x: number;
    y: number;
    facing: number;
    timestamp: number;
    duration: number;
    turnDuration: number;
  };
}

interface Building {
  x: number;
  y: number;
  type: string;
  owner: string;
  health: number;
  productionQueue?: {
    unitType: string;
    startTime: number;
    buildTime: number;
  }[];
}

interface MapTile {
  type: string;
  oreAmount?: number;
}

interface BotState {
  lastMoveTime: number;
  targetUnit?: string;
  targetResource?: { x: number; y: number };
}

interface Game {
  id: string;
  players: Player[];
  mapSize: number;
  state: 'LOBBY' | 'RUNNING' | 'ENDED';
  units: Record<string, Unit>;
  buildings: Record<string, Building>;
  map: MapTile[][];
  bots?: Record<string, BotState>;
}

interface MoveUnitData {
  id: string;
  x: number;
  y: number;
  facing: number;
  duration: number;
  turnDuration: number;
  timestamp?: number; // Add optional timestamp
}

// Game state storage
const games: Record<string, Game> = {};
const matchmakingQueue: string[] = [];
const rateLimit: Record<string, number> = {}; // Player ID -> last command timestamp
let matchmakingTimer: NodeJS.Timeout | null = null; // Track active timeout

// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Send map size to new clients
  socket.emit('mapSize', { width: MAP_SIZE, height: MAP_SIZE });

  // Check if player is reconnecting to an existing game
  const existingGameId = Object.keys(games).find(id => games[id].players.some(p => p.id === socket.id));
  if (existingGameId) {
    const game = games[existingGameId];
    socket.join(existingGameId);
    socket.emit('gameState', { 
      gameId: existingGameId, 
      players: game.players, 
      units: game.units 
    });
    if (game.state === 'RUNNING') {
      socket.emit('gameStart', { 
        gameId: existingGameId, 
        players: game.players, 
        units: game.units 
      });
    } else {
      socket.emit('gameCreated', { 
        gameId: existingGameId, 
        players: game.players 
      });
    }
    console.log(`Player ${socket.id} reconnected to game ${existingGameId}`);
  }

  // Allow clients to request current game state (for tab refocus sync)
  socket.on('requestGameState', (gameId: string) => {
    const game = games[gameId];
    if (game) {
      console.log(`Sending game state to ${socket.id} for game ${gameId}`);
      socket.emit('gameState', { 
        gameId, 
        players: game.players, 
        units: game.units 
      });
    } else {
      console.warn(`Game ${gameId} not found for ${socket.id}`);
      socket.emit('gameError', { message: 'Game not found' });
    }
  });

  // Join matchmaking queue
  socket.on('joinMatchmaking', (data = {}) => {
    matchmakingQueue.push(socket.id);
    socket.emit('matchmakingStarted');
    console.log(`Player ${socket.id} joined matchmaking queue (${matchmakingQueue.length} players)`);

    // Start game immediately if we reach MAX_PLAYERS_PER_GAME
    if (matchmakingQueue.length === MAX_PLAYERS_PER_GAME) {
      if (matchmakingTimer) {
        clearTimeout(matchmakingTimer);
        matchmakingTimer = null;
      }
      const gamePlayers = matchmakingQueue.splice(0, MAX_PLAYERS_PER_GAME);
      createGame(gamePlayers); // Multiplayer game with max players
    } 
    // Start timer if this is the first player or timer isn't running
    else if (!matchmakingTimer) {
      matchmakingTimer = setTimeout(() => {
        if (matchmakingQueue.length >= 2) {
          // Start multiplayer game with 2-5 players
          const gamePlayers = matchmakingQueue.splice(0, matchmakingQueue.length);
          createGame(gamePlayers);
        }
        matchmakingTimer = null;
      }, MATCHMAKING_TIMEOUT);
    }
  });

  // Helper function to create a game with the given players
  function createGame(gamePlayers: string[]) {
    const gameId = `game_${Date.now()}`;
    const initialUnits: Record<string, Unit> = {};
    const initialBuildings: Record<string, Building> = {};
    const map: MapTile[][] = [];

    // Generate map
    for (let x = 0; x < MAP_SIZE; x++) {
      map[x] = [];
      for (let y = 0; y < MAP_SIZE; y++) {
        const rand = Math.random();
        const tile: MapTile = {
          type: rand < 0.1 ? 'WATER' : rand < 0.25 ? 'ORE' : 'GRASS'
        };
        if (tile.type === 'ORE') {
          tile.oreAmount = ORE_PER_TILE;
        }
        map[x][y] = tile;
      }
    }

    // Define players with initial resources and power
    const players = gamePlayers.map(id => ({
      id,
      team: null,
      ready: false,
      resources: 1000,
      power: 0,
      powerUsed: 0
    }));

    games[gameId] = {
      id: gameId,
      players,
      mapSize: MAP_SIZE,
      state: 'LOBBY',
      units: initialUnits,
      buildings: initialBuildings,
      map,
      bots: {}
    };

    // Create initial units for human players
    gamePlayers.forEach((playerId, i) => {
      const startX = i * 5 + 2;
      initialUnits[`TANK_${playerId}`] = { x: startX, y: 2, facing: 0, type: 'TANK', owner: playerId };
      initialUnits[`INFANTRY_${playerId}`] = { x: startX + 1, y: 2, facing: 0, type: 'INFANTRY', owner: playerId };
      initialUnits[`HARVESTER_${playerId}`] = { x: startX + 2, y: 2, facing: 0, type: 'HARVESTER', owner: playerId };

      // Create initial Power Plant for each player
      const powerPlantId = `POWER_PLANT_${playerId}`;
      initialBuildings[powerPlantId] = {
        x: startX,
        y: 4,
        type: 'POWER_PLANT',
        owner: playerId,
        health: 200
      };

      const playerSocket = io.sockets.sockets.get(playerId);
      if (playerSocket) {
        playerSocket.join(gameId);
        console.log(`Player ${playerId} joined room ${gameId}`);
      }
    });

    io.to(gameId).emit('gameCreated', {
      gameId,
      players: games[gameId].players,
      mapData: map.flat().map((tile, i) => ({
        x: Math.floor(i / MAP_SIZE),
        y: i % MAP_SIZE,
        type: tile.type,
        oreAmount: tile.oreAmount
      }))
    });

    io.to(gameId).emit('gameState', {
      gameId,
      players: games[gameId].players,
      units: games[gameId].units,
      buildings: games[gameId].buildings
    });
    
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
        
        // Store last move before updating position
        unit.lastMove = {
          x: unit.x,
          y: unit.y,
          facing: unit.facing,
          timestamp: now,
          duration: data.duration,
          turnDuration: data.turnDuration
        };
        
        // Update unit position on server
        unit.x = data.x;
        unit.y = data.y;
        unit.facing = data.facing;
        
        // Broadcast movement to all players in the game with timestamp
        io.to(gameId).emit('unitMoved', { ...data, timestamp: now });
        console.log(`Server broadcasted movement for unit ${data.id} in game ${gameId}`);
      }
    }
  });

  // Handle building placement
  socket.on('placeBuilding', ({ gameId, type, x, y }: { gameId: string, type: string, x: number, y: number }) => {
    const game = games[gameId];
    if (!game || game.state !== 'RUNNING') return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    // Check if location is valid (not water, not occupied)
    let isValid = true;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        const checkX = x + dx;
        const checkY = y + dy;
        if (checkX < 0 || checkX >= MAP_SIZE || checkY < 0 || checkY >= MAP_SIZE ||
            game.map[checkX][checkY].type === 'WATER') {
          isValid = false;
          break;
        }
      }
      if (!isValid) break;
    }

    if (!isValid) {
      socket.emit('buildingError', { message: 'Invalid building location' });
      return;
    }

    const buildingId = `${type}_${Date.now()}_${socket.id}`;
    game.buildings[buildingId] = {
      x,
      y,
      type,
      owner: socket.id,
      health: 200 // Get from building stats
    };

    io.to(gameId).emit('buildingPlaced', {
      id: buildingId,
      type,
      x,
      y,
      owner: socket.id
    });
  });

  // Handle unit production
  socket.on('produceUnit', ({ gameId, buildingId, unitType }: { gameId: string, buildingId: string, unitType: string }) => {
    const game = games[gameId];
    if (!game || game.state !== 'RUNNING') return;

    const building = game.buildings[buildingId];
    const player = game.players.find(p => p.id === socket.id);
    if (!building || !player || building.owner !== socket.id) return;

    // Add to building's production queue
    if (!building.productionQueue) building.productionQueue = [];
    building.productionQueue.push({
      unitType,
      startTime: Date.now(),
      buildTime: 10000 // Get from unit stats
    });

    // Notify clients
    io.to(gameId).emit('productionStarted', {
      buildingId,
      unitType,
      startTime: Date.now()
    });
  });

  // Handle resource harvesting
  socket.on('harvest', ({ gameId, tileX, tileY, amount }: { gameId: string, tileX: number, tileY: number, amount: number }) => {
    const game = games[gameId];
    if (!game || game.state !== 'RUNNING') return;

    const tile = game.map[tileX]?.[tileY];
    if (!tile || tile.type !== 'ORE' || !tile.oreAmount) return;

    const harvestAmount = Math.min(amount, tile.oreAmount);
    tile.oreAmount -= harvestAmount;

    const player = game.players.find(p => p.id === socket.id);
    if (player) {
      player.resources += harvestAmount;
    }

    io.to(gameId).emit('resourceUpdate', {
      tileX,
      tileY,
      amount: tile.oreAmount
    });

    io.to(gameId).emit('gameState', {
      gameId,
      players: game.players,
      units: game.units,
      buildings: game.buildings
    });
  });

  // Handle power updates
  socket.on('updatePower', ({ gameId, power, powerUsed }: { gameId: string, power: number, powerUsed: number }) => {
    const game = games[gameId];
    if (!game || game.state !== 'RUNNING') return;

    const player = game.players.find(p => p.id === socket.id);
    if (player) {
      player.power = power;
      player.powerUsed = powerUsed;
      socket.emit('powerUpdate', { power, powerUsed });
    }
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    // Remove from matchmaking queue if present
    const queueIndex = matchmakingQueue.indexOf(socket.id);
    if (queueIndex !== -1) {
      matchmakingQueue.splice(queueIndex, 1);
      console.log(`Player ${socket.id} removed from matchmaking queue (${matchmakingQueue.length} players)`);
      
      // Clear timer if queue is empty
      if (matchmakingQueue.length === 0 && matchmakingTimer) {
        clearTimeout(matchmakingTimer);
        matchmakingTimer = null;
      }
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