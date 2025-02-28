// Instead of importing 'phaser', we'll use the global Phaser object from the CDN
import { GRID_SIZE, COLORS, UNIT_STATS } from './game/constants.js';
const socket = io();
class MainMenu extends Phaser.Scene {
    constructor() {
        super('MainMenu');
        this.soundOn = true;
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
                }
                else {
                    this.bgm.stop();
                }
            }
        });
    }
}
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.map = [];
        this.selectedUnit = null;
        this.resources = 1000;
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
                const tileType = Math.random() < 0.1 ? 'WATER' :
                    Math.random() < 0.1 ? 'ORE' : 'GRASS';
                const tile = this.add.rectangle(x * this.tileSize + this.tileSize / 2, y * this.tileSize + this.tileSize / 2, this.tileSize, this.tileSize, COLORS[tileType]);
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
        this.input.on('gameobjectdown', (pointer, gameObject) => {
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
        this.input.on('pointerdown', (pointer) => {
            if (this.selectedUnit) {
                const x = Math.floor(pointer.x / this.tileSize);
                const y = Math.floor(pointer.y / this.tileSize);
                if (this.isValidMove(x, y)) {
                    this.moveUnit(this.selectedUnit, x, y);
                    // Emit socket event for multiplayer
                    socket.emit('moveUnit', {
                        id: this.selectedUnit.getData('id'),
                        x: x * this.tileSize + this.tileSize / 2,
                        y: y * this.tileSize + this.tileSize / 2
                    });
                }
            }
        });
        // Keep your existing socket listeners
        socket.on('unitMoved', (data) => {
            const unit = this.children.getAll().find((obj) => obj instanceof Phaser.GameObjects.Rectangle && obj.getData('id') === data.id);
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
    isValidMove(x, y) {
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
    createUnit(type, gridX, gridY) {
        const unit = this.add.rectangle(gridX * this.tileSize + this.tileSize / 2, gridY * this.tileSize + this.tileSize / 2, this.tileSize * 0.8, this.tileSize * 0.8, COLORS[type]);
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
    createBuilding(type, gridX, gridY) {
        const building = this.add.rectangle(gridX * this.tileSize + this.tileSize / 2, gridY * this.tileSize + this.tileSize / 2, this.tileSize * 1.2, this.tileSize * 1.2, COLORS[type]);
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
    moveUnit(unit, x, y) {
        // Get current grid position
        const currentX = Math.floor((unit.x - this.tileSize / 2) / this.tileSize);
        const currentY = Math.floor((unit.y - this.tileSize / 2) / this.tileSize);
        // Mark current position as unoccupied
        if (currentX >= 0 && currentX < GRID_SIZE && currentY >= 0 && currentY < GRID_SIZE) {
            this.map[currentX][currentY].setData('occupied', false);
        }
        // Move the unit
        this.tweens.add({
            targets: unit,
            x: x * this.tileSize + this.tileSize / 2,
            y: y * this.tileSize + this.tileSize / 2,
            duration: 500
        });
        // Mark new position as occupied
        this.map[x][y].setData('occupied', true);
    }
}
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth, // Full width
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
});
