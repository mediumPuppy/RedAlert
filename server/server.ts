import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Define interface for movement data
interface MoveUnitData {
  id: string;
  x: number;
  y: number;
  facing: number;
  duration: number;
  turnDuration: number;
}

// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Listen for unit movement from a client with enhanced data
  socket.on('moveUnit', (data: MoveUnitData) => {
    console.log(`Unit ${data.id} moved to (${data.x}, ${data.y}) facing ${data.facing || 'undefined'} (duration: ${data.duration}, turnDuration: ${data.turnDuration})`);
    // Broadcast the movement to all connected clients
    io.emit('unitMoved', data);
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
  });
});

// Start the server on port 3000
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 