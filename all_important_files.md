# File Tree

# File Contents


## client/game/constants.ts
```
export const GRID_SIZE = 20;
// We'll calculate TILE_SIZE dynamically in GameScene based on screen size
// GAME_WIDTH and GAME_HEIGHT will be set to window dimensions in the Phaser config
export const GAME_WIDTH = window.innerWidth;
export const GAME_HEIGHT = window.innerHeight;

export type TileType = 'GRASS' | 'WATER' | 'ORE';
export type UnitType = 'TANK' | 'INFANTRY' | 'HARVESTER';
export type BuildingType = 'BASE' | 'BARRACKS';
export type ColorType = TileType | UnitType | BuildingType | 'EXPLOSION';

export const COLORS: Record<ColorType, number> = {
    GRASS: 0x00ff00,
    WATER: 0x0000ff,
    ORE: 0xffff00,
    TANK: 0xff0000,
    INFANTRY: 0x0000ff,
    HARVESTER: 0xff00ff,
    BASE: 0x808080,
    BARRACKS: 0x8b4513,
    EXPLOSION: 0xffa500
};

interface UnitStats {
    health: number;
    damage?: number;
    range?: number;
    speed: number;
    capacity?: number;
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
    TANK: {
        health: 100,
        damage: 20,
        range: 3,
        speed: 100
    },
    INFANTRY: {
        health: 50,
        damage: 10,
        range: 2,
        speed: 80
    },
    HARVESTER: {
        health: 75,
        speed: 60,
        capacity: 100
    }
}; ```


## client/game/scenes/GameScene.ts
```
// client/game/scenes/GameScene.ts
import { Scene } from 'phaser';
import { GRID_SIZE, COLORS, UNIT_STATS, GAME_WIDTH, GAME_HEIGHT, TileType, UnitType } from '../constants';

export class GameScene extends Scene {
    private map: Phaser.GameObjects.Rectangle[][] = [];
    private units: Phaser.GameObjects.Rectangle[] = [];
    private selectedUnit: Phaser.GameObjects.Rectangle | null = null;
    private resources: number = 1000;
    private resourceText!: Phaser.GameObjects.Text;
    private tileSize: number; // Dynamic tile size

    constructor() {
        super({ key: 'GameScene' });
        // Calculate tile size based on smaller dimension to maintain square grid
        this.tileSize = Math.floor(Math.min(window.innerWidth, window.innerHeight) / GRID_SIZE);
    }

    create() {
        // Recalculate tileSize in case window was resized
        this.tileSize = Math.floor(Math.min(this.scale.width, this.scale.height) / GRID_SIZE);
        
        // Create 20x20 grid map
        for (let x = 0; x < GRID_SIZE; x++) {
            this.map[x] = [];
            for (let y = 0; y < GRID_SIZE; y++) {
                const tileType: TileType = Math.random() < 0.1 ? 'WATER' :
                               Math.random() < 0.15 ? 'ORE' : 'GRASS';
                
                const tile = this.add.rectangle(
                    x * this.tileSize + this.tileSize/2,
                    y * this.tileSize + this.tileSize/2,
                    this.tileSize,
                    this.tileSize,
                    COLORS[tileType]
                );
                tile.setStrokeStyle(1, 0x000000);
                tile.setData('type', tileType);
                tile.setData('x', x);
                tile.setData('y', y);
                tile.setInteractive();
                this.map[x][y] = tile;
            }
        }

        // Add initial units
        this.units.push(this.createUnit('TANK', 2, 2));
        this.units.push(this.createUnit('INFANTRY', 3, 3));
        this.units.push(this.createUnit('HARVESTER', 4, 4));

        // Resource display - scale font size based on tile size
        this.resourceText = this.add.text(10, 10, `Resources: ${this.resources}`, {
            fontSize: `${Math.max(16, this.tileSize / 2)}px`,
            color: '#ffffff'
        });

        // Handle unit selection
        this.input.on('gameobjectdown', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
            const unit = gameObject as Phaser.GameObjects.Rectangle;
            
            if (unit.getData('type') === 'UNIT') {
                if (this.selectedUnit) {
                    this.selectedUnit.setStrokeStyle(1, 0x000000);
                }
                this.selectedUnit = unit;
                unit.setStrokeStyle(2, 0xffff00);
            }
            
            // Combat logic - attack if clicking enemy unit
            if (this.selectedUnit && unit !== this.selectedUnit && unit.getData('type') === 'UNIT') {
                this.attack(this.selectedUnit, unit);
            }
        });

        // Handle movement and harvesting
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (!this.selectedUnit) return;

            const x = Math.floor(pointer.x / this.tileSize);
            const y = Math.floor(pointer.y / this.tileSize);

            if (this.isValidMove(x, y)) {
                const tile = this.map[x][y];
                
                // Handle harvesting
                if (this.selectedUnit.getData('unitType') === 'HARVESTER' && 
                    tile.getData('type') === 'ORE') {
                    this.harvest(this.selectedUnit, tile);
                } else {
                    this.moveUnit(this.selectedUnit, x, y);
                }
            }
        });
    }

    update() {
        // Update game state if needed
        this.units = this.units.filter(unit => unit.getData('health') > 0);
    }

    private createUnit(type: UnitType, gridX: number, gridY: number) {
        const size = type === 'INFANTRY' ? this.tileSize/2 : this.tileSize;
        const unit = this.add.rectangle(
            gridX * this.tileSize + this.tileSize/2,
            gridY * this.tileSize + this.tileSize/2,
            size,
            size,
            COLORS[type]
        );
        
        unit.setStrokeStyle(1, 0x000000);
        unit.setData('type', 'UNIT');
        unit.setData('unitType', type);
        unit.setData('health', UNIT_STATS[type].health);
        unit.setData('damage', UNIT_STATS[type].damage || 0);
        unit.setData('range', UNIT_STATS[type].range || 1);
        unit.setData('gridX', gridX);
        unit.setData('gridY', gridY);
        unit.setInteractive();
        
        return unit;
    }

    private isValidMove(x: number, y: number): boolean {
        if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
        if (this.map[x][y].getData('type') === 'WATER') return false;
        
        // Check if position is occupied by another unit
        const occupied = this.units.some(unit => 
            unit.getData('gridX') === x && 
            unit.getData('gridY') === y && 
            unit !== this.selectedUnit
        );
        
        return !occupied;
    }

    private moveUnit(unit: Phaser.GameObjects.Rectangle, x: number, y: number) {
        const unitType = unit.getData('unitType') as UnitType;
        const speed = UNIT_STATS[unitType].speed;
        
        this.tweens.add({
            targets: unit,
            x: x * this.tileSize + this.tileSize/2,
            y: y * this.tileSize + this.tileSize/2,
            duration: speed * 10,
            ease: 'Linear',
            onComplete: () => {
                unit.setData('gridX', x);
                unit.setData('gridY', y);
            }
        });
    }

    private attack(attacker: Phaser.GameObjects.Rectangle, target: Phaser.GameObjects.Rectangle) {
        const attackerX = attacker.getData('gridX');
        const attackerY = attacker.getData('gridY');
        const targetX = target.getData('gridX');
        const targetY = target.getData('gridY');
        const range = attacker.getData('range');
        const distance = Phaser.Math.Distance.Between(attackerX, attackerY, targetX, targetY);

        if (distance <= range) {
            let targetHealth = target.getData('health');
            const damage = attacker.getData('damage');
            targetHealth -= damage;
            target.setData('health', targetHealth);

            if (targetHealth <= 0) {
                target.destroy();
            }
            
            // Visual feedback
            const originalColor = target.fillColor;
            target.setFillStyle(0xff0000);
            this.time.delayedCall(100, () => target.setFillStyle(originalColor));
        }
    }

    private harvest(harvester: Phaser.GameObjects.Rectangle, oreTile: Phaser.GameObjects.Rectangle) {
        const harvestAmount = 50;
        this.resources += harvestAmount;
        this.resourceText.setText(`Resources: ${this.resources}`);
        
        // Visual feedback
        const originalColor = oreTile.fillColor;
        oreTile.setFillStyle(0xffffff);
        this.time.delayedCall(200, () => oreTile.setFillStyle(originalColor));
    }
}```


## client/index.html
```
<!DOCTYPE html>
<html>
<head>
  <title>Red Alert Game</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden; /* Prevent scrollbars */
      background: #000;
    }
    #game-container {
      width: 100vw;
      height: 100vh;
    }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <script src="/socket.io/socket.io.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser.min.js"></script>
  <script type="module" src="/index.js"></script>
</body>
</html>```


## client/index.ts
```
// Instead of importing 'phaser', we'll use the global Phaser object from the CDN
import { GAME_WIDTH, GAME_HEIGHT, GRID_SIZE, COLORS, UNIT_STATS, UnitType, BuildingType, TileType } from './game/constants.js';

// Use the global io object from socket.io CDN
declare const io: any;

interface UnitMovedData {
    id: string;
    x: number;
    y: number;
}

const socket = io();

class MainMenu extends Phaser.Scene {
    private soundOn: boolean = true;
    private bgm!: Phaser.Sound.BaseSound;

    constructor() {
        super('MainMenu');
        console.log('MainMenu constructor called');
    }

    preload() {
        console.log('MainMenu preload started');
        this.load.audio('bgm', 'assets/bgm.mp3');
    }

    create() {
        console.log('MainMenu create started');
        
        // Add background color to make sure we can see the scene
        this.cameras.main.setBackgroundColor('#222222');

        // Center text
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        // Title with debug background
        this.add.text(centerX, centerY - 100, 'Red Alert Reborn', {
            fontSize: '48px',
            color: '#ffffff',
            fontFamily: 'Arial',
            backgroundColor: '#ff0000',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5);

        // Play button with visible styling
        const playButton = this.add.text(centerX, centerY, 'Play', {
            fontSize: '32px',
            color: '#ffffff',
            backgroundColor: '#006400',
            padding: { x: 20, y: 10 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

        // Make button interactive
        playButton.on('pointerover', () => playButton.setStyle({ backgroundColor: '#008000' }));
        playButton.on('pointerout', () => playButton.setStyle({ backgroundColor: '#006400' }));
        playButton.on('pointerdown', () => {
            console.log('Play button clicked');
            this.scene.start('GameScene');
        });

        // Sound button
        const soundButton = this.add.text(centerX, centerY + 100, 'Sound: On', {
            fontSize: '32px',
            color: '#ffffff',
            backgroundColor: '#000066',
            padding: { x: 20, y: 10 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

        // Debug text to confirm position
        this.add.text(10, 10, 'Debug: MainMenu Active', {
            fontSize: '16px',
            color: '#ffffff'
        });

        // Handle sound
        this.soundOn = true;
        this.bgm = this.sound.add('bgm', { loop: true });
        
        soundButton.on('pointerdown', () => {
            this.soundOn = !this.soundOn;
            soundButton.setText(`Sound: ${this.soundOn ? 'On' : 'Off'}`);
            if (this.bgm) {
                if (this.soundOn) {
                    this.bgm.play();
                } else {
                    this.bgm.stop();
                }
            }
        });
    }
}

class GameScene extends Phaser.Scene {
    private map: Phaser.GameObjects.Rectangle[][] = [];
    private selectedUnit: Phaser.GameObjects.Rectangle | null = null;
    private resources: number = 1000;
    private resourceText!: Phaser.GameObjects.Text;
    private tileSize: number; // Dynamic tile size

    constructor() {
        super('GameScene');
        // Calculate tile size based on smaller dimension
        this.tileSize = Math.floor(Math.min(window.innerWidth, window.innerHeight) / GRID_SIZE);
    }

    preload() {
        // Keep your existing asset loading
        this.load.image('grass', 'assets/grass.png');
        this.load.image('ore', 'assets/ore.png');
        this.load.image('tank', 'assets/tank.png');
    }

    create() {
        // Recalculate tileSize in case window was resized
        this.tileSize = Math.floor(Math.min(this.scale.width, this.scale.height) / GRID_SIZE);
        
        console.log('GameScene create started');
        // Create grid-based map with our new implementation
        for (let x = 0; x < GRID_SIZE; x++) {
            this.map[x] = [];
            for (let y = 0; y < GRID_SIZE; y++) {
                const tileType: TileType = Math.random() < 0.1 ? 'WATER' : 
                               Math.random() < 0.1 ? 'ORE' : 'GRASS';
                
                const tile = this.add.rectangle(
                    x * this.tileSize + this.tileSize/2,
                    y * this.tileSize + this.tileSize/2,
                    this.tileSize,
                    this.tileSize,
                    COLORS[tileType]
                );
                tile.setStrokeStyle(1, 0x000000);
                tile.setData('type', tileType);
                this.map[x][y] = tile;
            }
        }

        // Add units and buildings from our new implementation
        this.createUnit('TANK', 2, 2);
        this.createUnit('INFANTRY', 3, 2);
        this.createUnit('HARVESTER', 4, 2);
        this.createBuilding('BASE', 1, 1);

        // Keep your existing ore counter but use our resources system
        this.resourceText = this.add.text(10, 10, `Resources: ${this.resources}`, {
            fontSize: '20px',
            color: '#ffffff'
        });

        // Combine both click handlers
        this.input.on('gameobjectdown', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Rectangle) => {
            if (gameObject.getData('type') === 'UNIT') {
                if (this.selectedUnit) {
                    this.selectedUnit.setStrokeStyle(1, 0x000000);
                }
                this.selectedUnit = gameObject;
                gameObject.setStrokeStyle(2, 0xffff00);
                
                // Emit socket event for multiplayer
                socket.emit('selectUnit', { id: gameObject.getData('id') });
            }
        });

        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.selectedUnit) {
                const x = Math.floor(pointer.x / this.tileSize);
                const y = Math.floor(pointer.y / this.tileSize);
                
                if (this.isValidMove(x, y)) {
                    this.moveUnit(this.selectedUnit, x, y);
                    // Emit socket event for multiplayer
                    socket.emit('moveUnit', { 
                        id: this.selectedUnit.getData('id'), 
                        x: x * this.tileSize + this.tileSize/2, 
                        y: y * this.tileSize + this.tileSize/2 
                    });
                }
            }
        });

        // Keep your existing socket listeners
        socket.on('unitMoved', (data: UnitMovedData) => {
            const unit = this.children.getAll().find(
                (obj) => obj instanceof Phaser.GameObjects.Rectangle && obj.getData('id') === data.id
            ) as Phaser.GameObjects.Rectangle | undefined;
            
            if (unit) {
                this.tweens.add({
                    targets: unit,
                    x: data.x,
                    y: data.y,
                    duration: 500
                });
            }
        });
    }

    private isValidMove(x: number, y: number): boolean {
        // Basic checks for valid move
        if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
            return false;
        }
        
        // Check if the tile is walkable (not water)
        const targetTile = this.map[x][y];
        if (targetTile.getData('type') === 'WATER') {
            return false;
        }
        
        // Check if tile is occupied by another unit
        const occupiedByUnit = targetTile.getData('occupied') === true;
        if (occupiedByUnit) {
            return false;
        }
        
        return true;
    }

    private createUnit(type: UnitType, gridX: number, gridY: number) {
        const unit = this.add.rectangle(
            gridX * this.tileSize + this.tileSize/2,
            gridY * this.tileSize + this.tileSize/2,
            this.tileSize * 0.8,
            this.tileSize * 0.8,
            COLORS[type]
        );
        
        unit.setStrokeStyle(1, 0x000000);
        unit.setInteractive();
        unit.setData('type', 'UNIT');
        unit.setData('unitType', type);
        unit.setData('id', Date.now().toString());
        
        const stats = UNIT_STATS[type];
        unit.setData('health', stats.health);
        unit.setData('damage', stats.damage || 0);
        unit.setData('range', stats.range || 1);
        unit.setData('speed', stats.speed);
        
        // For harvesters, add capacity
        if (type === 'HARVESTER') {
            unit.setData('capacity', stats.capacity || 100);
        }
        
        // Mark the tile as occupied
        this.map[gridX][gridY].setData('occupied', true);
        
        return unit;
    }

    private createBuilding(type: BuildingType, gridX: number, gridY: number) {
        const building = this.add.rectangle(
            gridX * this.tileSize + this.tileSize/2,
            gridY * this.tileSize + this.tileSize/2,
            this.tileSize * 1.2,
            this.tileSize * 1.2,
            COLORS[type]
        );
        
        building.setStrokeStyle(1, 0x000000);
        building.setInteractive();
        building.setData('type', 'BUILDING');
        building.setData('buildingType', type);
        building.setData('id', 'building_' + Date.now().toString());
        building.setData('health', 200);
        
        // Mark the tile as occupied
        this.map[gridX][gridY].setData('occupied', true);
        
        return building;
    }

    private moveUnit(unit: Phaser.GameObjects.Rectangle, x: number, y: number) {
        // Get current grid position
        const currentX = Math.floor((unit.x - this.tileSize/2) / this.tileSize);
        const currentY = Math.floor((unit.y - this.tileSize/2) / this.tileSize);
        
        // Mark current position as unoccupied
        if (currentX >= 0 && currentX < GRID_SIZE && currentY >= 0 && currentY < GRID_SIZE) {
            this.map[currentX][currentY].setData('occupied', false);
        }
        
        // Move the unit
        this.tweens.add({
            targets: unit,
            x: x * this.tileSize + this.tileSize/2,
            y: y * this.tileSize + this.tileSize/2,
            duration: 500
        });
        
        // Mark new position as occupied
        this.map[x][y].setData('occupied', true);
    }
}

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,  // Full width
    height: window.innerHeight, // Full height
    scale: {
        mode: Phaser.Scale.FIT, // Scales game to fit while maintaining aspect ratio
        autoCenter: Phaser.Scale.CENTER_BOTH, // Centers game on screen
        parent: 'game-container'
    },
    backgroundColor: '#333333',
    scene: [MainMenu, GameScene],
    physics: {
        default: 'arcade',
        arcade: {
            debug: true
        }
    }
};

console.log('Creating Phaser game instance');
const game = new Phaser.Game(config);

// Handle window resize
window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
}); ```


## client/package.json
```
{
  "name": "redalert-client",
  "version": "1.0.0",
  "description": "Client for RedAlert game",
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "dev": "tsc -w"
  },
  "dependencies": {
    "phaser": "^3.55.2",
    "socket.io-client": "^4.7.4"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/node": "^20.11.19",
    "@types/socket.io-client": "^1.4.36",
    "phaser": "^3.88.2",
    "ts-loader": "^9.5.2",
    "webpack": "^5.98.0",
    "webpack-cli": "^6.0.1",
    "webpack-dev-server": "^5.2.0"
  }
}
```


## client/tsconfig.json
```
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "types": ["phaser"],
    "allowJs": true
  },
  "include": ["./**/*"],
  "exclude": ["node_modules", "dist"]
} ```


## server/package.json
```
{
  "name": "redalert-server",
  "version": "1.0.0",
  "description": "Server for RedAlert game",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "ts-node server.ts"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.4"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.19",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```


## server/server.ts
```
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

// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Listen for unit movement from a client
  socket.on('moveUnit', (data: { id: string; x: number; y: number }) => {
    console.log(`Unit ${data.id} moved to (${data.x}, ${data.y})`);
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
}); ```


## server/tsconfig.json
```
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node"
  },
  "include": ["./**/*"],
  "exclude": ["node_modules"]
} ```

