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

// Game types
type TileType = 'GRASS' | 'WATER' | 'ORE';

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins in development
        methods: ["GET", "POST"]
    }
});

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
  spawnPoint?: { x: number; y: number }; // Add spawn point information
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

interface Game {
  id: string;
  players: Player[];
  mapSize: number;
  state: 'LOBBY' | 'RUNNING' | 'ENDED';
  units: Record<string, Unit>;
  mapData?: TileType[][];  // Store the map data on the server
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

// Generate a random map with a consistent seed
function generateMap(mapSize: number, seed?: number): TileType[][] {
  // Use a seed for consistent random generation
  const mapSeed = seed || Date.now();
  console.log(`Generating map with seed: ${mapSeed}`);
  
  // Simple seeded random function
  const seededRandom = (() => {
    let s = mapSeed;
    return () => {
      s = Math.sin(s) * 10000;
      return s - Math.floor(s);
    };
  })();
  
  const map: TileType[][] = [];
  
  // Create the map grid
  for (let x = 0; x < mapSize; x++) {
    map[x] = [];
    for (let y = 0; y < mapSize; y++) {
      // Use seeded random to determine tile type
      const rand = seededRandom();
      
      // Determine tile type based on random value
      // Water: 10%, Ore: 15%, Grass: 75%
      const tileType: TileType = rand < 0.1 ? 'WATER' : 
                     rand < 0.25 ? 'ORE' : 'GRASS';
      
      map[x][y] = tileType;
    }
  }
  
  // Ensure spawn points are valid (not water)
  const spawnPoints = [
    { x: 10, y: 10 },                      // Top left
    { x: mapSize - 10, y: 10 },            // Top right
    { x: 10, y: mapSize - 10 },            // Bottom left
    { x: mapSize - 10, y: mapSize - 10 },  // Bottom right
    { x: mapSize / 2, y: 10 },             // Top center
    { x: mapSize / 2, y: mapSize - 10 }    // Bottom center
  ];
  
  // Ensure spawn areas are playable (change water to grass)
  spawnPoints.forEach(point => {
    const buffer = 3; // Make a 3x3 area around spawn points safe
    for (let dx = -buffer; dx <= buffer; dx++) {
      for (let dy = -buffer; dy <= buffer; dy++) {
        const x = point.x + dx;
        const y = point.y + dy;
        
        // Make sure coordinates are valid
        if (x >= 0 && x < mapSize && y >= 0 && y < mapSize) {
          // Replace water with grass at spawn points
          if (map[x][y] === 'WATER') {
            map[x][y] = 'GRASS';
          }
        }
      }
    }
  });
  
  return map;
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
      units: game.units,
      mapData: game.mapData
    });
    if (game.state === 'RUNNING') {
      socket.emit('gameStart', { 
        gameId: existingGameId, 
        players: game.players, 
        units: game.units,
        mapData: game.mapData
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
        units: game.units,
        mapData: game.mapData
      });
    } else {
      console.warn(`Game ${gameId} not found for ${socket.id}`);
      socket.emit('gameError', { message: 'Game not found' });
    }
  });

  // Join matchmaking queue
  socket.on('joinMatchmaking', () => {
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
          // Start multiplayer game with 2+ players
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
    const initialUnits: Record<string, any> = {};

    // Generate a map for this game
    const mapData = generateMap(MAP_SIZE);
    
    games[gameId] = {
      id: gameId,
      players: gamePlayers.map(id => ({ id, team: null, ready: false })),
      mapSize: MAP_SIZE,
      state: 'LOBBY',
      units: initialUnits,
      mapData: mapData
    };

    // Define spawn points for up to MAX_PLAYERS_PER_GAME players
    const spawnPoints = [
      { x: 10, y: 10, facing: 135 },       // Top left (facing southeast)
      { x: MAP_SIZE - 10, y: 10, facing: 225 },    // Top right (facing southwest)
      { x: 10, y: MAP_SIZE - 10, facing: 45 },    // Bottom left (facing northeast)
      { x: MAP_SIZE - 10, y: MAP_SIZE - 10, facing: 315 },  // Bottom right (facing northwest)
      { x: MAP_SIZE / 2, y: 10, facing: 180 },    // Top center (facing south)
      { x: MAP_SIZE / 2, y: MAP_SIZE - 10, facing: 0 }     // Bottom center (facing north)
    ];

    // Create initial units for each player
    gamePlayers.forEach((playerId, i) => {
      // Get spawn point (use modulo to handle if we somehow have more than MAX_PLAYERS_PER_GAME)
      const spawn = spawnPoints[i % spawnPoints.length];
      
      // Store spawn point with player data
      const playerIndex = games[gameId].players.findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
        games[gameId].players[playerIndex].spawnPoint = { x: spawn.x, y: spawn.y };
      }
      
      // Create units in a small formation around the spawn point
      initialUnits[`TANK_${playerId}`] = { x: spawn.x, y: spawn.y, facing: spawn.facing, type: 'TANK', owner: playerId };
      initialUnits[`INFANTRY_${playerId}`] = { x: spawn.x + 1, y: spawn.y, facing: spawn.facing, type: 'INFANTRY', owner: playerId };
      initialUnits[`HARVESTER_${playerId}`] = { x: spawn.x, y: spawn.y + 1, facing: spawn.facing, type: 'HARVESTER', owner: playerId };
      const playerSocket = io.sockets.sockets.get(playerId);
      if (playerSocket) {
        playerSocket.join(gameId);
        console.log(`Player ${playerId} joined room ${gameId}`);
      } else {
        console.warn(`Socket for player ${playerId} not found`);
      }
    });

    console.log(`Emitting gameCreated to ${gameId} with ${gamePlayers.length} players`);
    io.to(gameId).emit('gameCreated', { gameId, players: games[gameId].players });
    console.log(`Emitting gameState to ${gameId}`);
    io.to(gameId).emit('gameState', { 
      gameId, 
      players: games[gameId].players, 
      units: games[gameId].units,
      mapData: games[gameId].mapData
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
          io.to(gameId).emit('gameStart', { gameId, players: game.players, units: game.units, mapData: game.mapData });
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