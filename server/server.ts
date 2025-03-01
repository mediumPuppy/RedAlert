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
    const mode = data.mode || 'multiplayer';
    const isSinglePlayer = mode === 'singleplayer';

    if (isSinglePlayer) {
      console.log(`Player ${socket.id} requested single-player game`);
      createGame([socket.id], true); // Immediate single-player game
    } else {
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
        createGame(gamePlayers, false); // Multiplayer game with max players
      } 
      // Start timer if this is the first player or timer isn't running
      else if (!matchmakingTimer) {
        matchmakingTimer = setTimeout(() => {
          if (matchmakingQueue.length >= 2) {
            // Start multiplayer game with 2-5 players
            const gamePlayers = matchmakingQueue.splice(0, matchmakingQueue.length);
            createGame(gamePlayers, false);
          } else if (matchmakingQueue.length === 1) {
            // Start single-player game with bot if only one player
            const gamePlayers = matchmakingQueue.splice(0, 1);
            createGame(gamePlayers, true);
          }
          matchmakingTimer = null;
        }, MATCHMAKING_TIMEOUT);
      }
    }
  });

  // Helper function to create a game with the given players
  function createGame(gamePlayers: string[], singlePlayer: boolean) {
    const gameId = `game_${Date.now()}`;
    const initialUnits: Record<string, Unit> = {};

    // Define players, adding bot for single-player
    const players = singlePlayer
      ? [...gamePlayers.map(id => ({ id, team: 'ALLIES', ready: true })), { id: 'BOT_1', team: 'SOVIETS', ready: true }]
      : gamePlayers.map(id => ({ id, team: null, ready: false }));

    games[gameId] = {
      id: gameId,
      players,
      mapSize: MAP_SIZE,
      state: singlePlayer ? 'RUNNING' : 'LOBBY',
      units: initialUnits,
      bots: {} // Initialize bots object
    };

    // Create initial units for human players
    gamePlayers.forEach((playerId, i) => {
      const startX = i * 5 + 2;
      initialUnits[`TANK_${playerId}`] = { x: startX, y: 2, facing: 0, type: 'TANK', owner: playerId };
      initialUnits[`INFANTRY_${playerId}`] = { x: startX + 1, y: 2, facing: 0, type: 'INFANTRY', owner: playerId };
      initialUnits[`HARVESTER_${playerId}`] = { x: startX + 2, y: 2, facing: 0, type: 'HARVESTER', owner: playerId };
      const playerSocket = io.sockets.sockets.get(playerId);
      if (playerSocket) {
        playerSocket.join(gameId);
        console.log(`Player ${playerId} joined room ${gameId}`);
      }
    });

    // Add bot units for single-player
    if (singlePlayer) {
      const botId = 'BOT_1';
      const botStartX = MAP_SIZE - 10; // Opposite side of map
      initialUnits[`TANK_${botId}`] = { x: botStartX, y: MAP_SIZE - 3, facing: 180, type: 'TANK', owner: botId };
      initialUnits[`INFANTRY_${botId}`] = { x: botStartX + 1, y: MAP_SIZE - 3, facing: 180, type: 'INFANTRY', owner: botId };
      initialUnits[`HARVESTER_${botId}`] = { x: botStartX + 2, y: MAP_SIZE - 3, facing: 180, type: 'HARVESTER', owner: botId };
    }

    io.to(gameId).emit('gameCreated', { gameId, players: games[gameId].players });
    io.to(gameId).emit('gameState', { gameId, players: games[gameId].players, units: games[gameId].units });
    
    if (singlePlayer) {
      io.to(gameId).emit('gameStart', { gameId, players: games[gameId].players, units: games[gameId].units });
      startBot(gameId, 'BOT_1'); // Start bot behavior
    }

    console.log(`Game ${gameId} created with ${gamePlayers.length} players (${singlePlayer ? 'Single-player' : 'Multiplayer'})`);
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

// Add bot-related functions
function startBot(gameId: string, botId: string) {
  console.log(`Starting bot ${botId} in game ${gameId}`);
  
  const game = games[gameId];
  if (!game) {
    console.error(`Game ${gameId} not found`);
    return;
  }

  // Initialize bot state
  if (!game.bots) {
    game.bots = {};
  }
  game.bots[botId] = {
    lastMoveTime: Date.now(),
  };

  // Run bot logic every 3 seconds
  const botInterval = setInterval(() => {
    const game = games[gameId];
    if (!game || game.state !== 'RUNNING' || !game.bots) {
      clearInterval(botInterval);
      return;
    }

    const now = Date.now();
    const botState = game.bots[botId];
    if (now - botState.lastMoveTime < 3000) {
      return; // Wait for cooldown
    }

    const botUnits = Object.entries(game.units).filter(([_, unit]) => unit.owner === botId);
    const playerUnits = Object.entries(game.units).filter(([_, unit]) => unit.owner !== botId);

    botUnits.forEach(([unitId, unit]) => {
      // Skip if unit is already moving
      if (unit.lastMove && (now - unit.lastMove.timestamp) < (unit.lastMove.duration + unit.lastMove.turnDuration)) {
        return;
      }

      let targetX: number, targetY: number;
      const MIN_DISTANCE = 3; // Don't move if too close to target

      if (unit.type === 'HARVESTER') {
        // Harvesters prioritize finding ore
        // For now, just move randomly as we don't have ore positions
        targetX = Math.max(0, Math.min(MAP_SIZE - 1, unit.x + (Math.random() > 0.5 ? 2 : -2)));
        targetY = Math.max(0, Math.min(MAP_SIZE - 1, unit.y + (Math.random() > 0.5 ? 2 : -2)));
      } else {
        // Combat units move toward nearest player unit
        if (playerUnits.length > 0) {
          const nearestPlayerUnit = playerUnits.reduce((prev, curr) => {
            const [_, prevUnit] = prev;
            const [__, currUnit] = curr;
            const prevDist = Math.hypot(prevUnit.x - unit.x, prevUnit.y - unit.y);
            const currDist = Math.hypot(currUnit.x - unit.x, currUnit.y - unit.y);
            return prevDist < currDist ? prev : curr;
          });

          const [_, targetUnit] = nearestPlayerUnit;
          const distance = Math.hypot(targetUnit.x - unit.x, targetUnit.y - unit.y);

          if (distance > MIN_DISTANCE) {
            // Move toward player unit with some randomness
            const dx = targetUnit.x - unit.x;
            const dy = targetUnit.y - unit.y;
            const angle = Math.atan2(dy, dx);
            const moveDistance = 2;
            targetX = Math.max(0, Math.min(MAP_SIZE - 1, 
              unit.x + Math.round(Math.cos(angle) * moveDistance + (Math.random() - 0.5))));
            targetY = Math.max(0, Math.min(MAP_SIZE - 1, 
              unit.y + Math.round(Math.sin(angle) * moveDistance + (Math.random() - 0.5))));
          } else {
            // Too close to target, move randomly
            targetX = Math.max(0, Math.min(MAP_SIZE - 1, unit.x + (Math.random() > 0.5 ? 2 : -2)));
            targetY = Math.max(0, Math.min(MAP_SIZE - 1, unit.y + (Math.random() > 0.5 ? 2 : -2)));
          }
        } else {
          // No player units visible, move randomly
          targetX = Math.max(0, Math.min(MAP_SIZE - 1, unit.x + (Math.random() > 0.5 ? 2 : -2)));
          targetY = Math.max(0, Math.min(MAP_SIZE - 1, unit.y + (Math.random() > 0.5 ? 2 : -2)));
        }
      }

      // Validate move (avoid occupied tiles)
      if (!Object.values(game.units).some(u => u.x === targetX && u.y === targetY)) {
        const facing = Math.atan2(targetY - unit.y, targetX - unit.x) * 180 / Math.PI;
        
        // Store last move
        unit.lastMove = {
          x: unit.x,
          y: unit.y,
          facing: unit.facing,
          timestamp: now,
          duration: 1000, // Fixed duration for bot moves
          turnDuration: 500
        };

        // Update position
        unit.x = targetX;
        unit.y = targetY;
        unit.facing = facing;

        // Emit move event
        io.to(gameId).emit('unitMoved', {
          id: unitId,
          x: targetX,
          y: targetY,
          facing,
          duration: 1000,
          turnDuration: 500,
          timestamp: now
        });

        botState.lastMoveTime = now;
      }
    });
  }, 1000); // Check every second, but only move every 3 seconds
}

// Start the server on port 3000
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 