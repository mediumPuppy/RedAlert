// Instead of importing 'phaser', we'll use the global Phaser object from the CDN
import { TILE_SIZE, GAME_WIDTH, GAME_HEIGHT, GRID_SIZE, COLORS, UNIT_STATS, UnitType, BuildingType, TileType, FacingDirection, TERRAIN_SPEED_MODIFIERS } from './game/constants.js';

// Use the global io object from socket.io CDN
declare const io: any;

interface UnitMovedData {
    id: string;
    x: number;
    y: number;
    facing: number;
    duration: number;
    turnDuration: number;
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
    private units: Phaser.GameObjects.Rectangle[] = [];
    private selectedUnit: Phaser.GameObjects.Rectangle | null = null;
    private resources: number = 1000;
    private resourceText!: Phaser.GameObjects.Text;

    constructor() {
        super('GameScene');
    }

    preload() {
        // Keep your existing asset loading
        this.load.image('grass', 'assets/grass.png');
        this.load.image('ore', 'assets/ore.png');
        this.load.image('tank', 'assets/tank.png');
    }

    create() {
        console.log('GameScene create started');
        // Create grid-based map with our new implementation
        for (let x = 0; x < GRID_SIZE; x++) {
            this.map[x] = [];
            for (let y = 0; y < GRID_SIZE; y++) {
                const tileType: TileType = Math.random() < 0.1 ? 'WATER' : 
                               Math.random() < 0.1 ? 'ORE' : 'GRASS';
                
                const tile = this.add.rectangle(
                    x * TILE_SIZE + TILE_SIZE/2,
                    y * TILE_SIZE + TILE_SIZE/2,
                    TILE_SIZE,
                    TILE_SIZE,
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
        }).setDepth(1);

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
                const x = Math.floor(pointer.x / TILE_SIZE);
                const y = Math.floor(pointer.y / TILE_SIZE);
                
                if (this.isValidMove(x, y)) {
                    this.moveUnit(this.selectedUnit, x, y);
                    // Emit socket event for multiplayer
                    socket.emit('moveUnit', { 
                        id: this.selectedUnit.getData('id'), 
                        x: x, 
                        y: y,
                        facing: this.selectedUnit.getData('facing'),
                        duration: 0, // Will be calculated in moveUnit
                        turnDuration: 0 // Will be calculated in moveUnit
                    });
                }
            }
        });

        // Keep your existing socket listeners but update for enhanced movement
        socket.on('unitMoved', (data: UnitMovedData) => {
            console.log(`Received unitMoved event for ID: ${data.id}`);
            
            // Debug: list all unit IDs in the scene
            console.log(`Available units: ${this.units.length}`);
            this.units.forEach((u: any) => {
                console.log(`- Unit: ${u.getData('unitType')} with ID: ${u.getData('id')} and color: ${u.fillColor.toString(16)}`);
            });
            
            // First try to find the unit in our tracked units array
            let unit = this.units.find(u => u.getData('id') === data.id);
            
            // If not found, fall back to searching all game objects
            if (!unit) {
                unit = this.children.getAll().find(
                    (obj) => obj instanceof Phaser.GameObjects.Rectangle && obj.getData('id') === data.id
                ) as Phaser.GameObjects.Rectangle | undefined;
                
                if (unit) {
                    // If found in children but not in units array, add it to the array for future lookups
                    this.units.push(unit as Phaser.GameObjects.Rectangle);
                    console.log(`Added previously untracked unit ${data.id} to units array`);
                }
            }
            
            if (unit) {
                const unitType = unit.getData('unitType') as UnitType;
                const currentX = unit.getData('gridX');
                const currentY = unit.getData('gridY');
                
                // Get the original color from data or use current fillColor as fallback
                const originalColor = unit.getData('originalColor') || unit.fillColor;
                console.log(`unitMoved: Unit ${data.id} (${unitType}) original color: ${originalColor.toString(16)}`);
                
                // Ensure unit has the right color before starting movement
                unit.setFillStyle(originalColor);
                
                // Clear current position
                if (currentX >= 0 && currentX < GRID_SIZE && currentY >= 0 && currentY < GRID_SIZE) {
                    this.map[currentX][currentY].setData('occupied', false);
                }
                
                // Calculate the actual pixel positions
                const targetX = data.x * TILE_SIZE + TILE_SIZE/2;
                const targetY = data.y * TILE_SIZE + TILE_SIZE/2;
                
                // Handle turning and movement based on unit type
                if (unitType !== 'INFANTRY' && data.turnDuration > 0) {
                    // Log that we're starting a turn
                    console.log(`unitMoved: Unit ${data.id} starting turn, duration: ${data.turnDuration}ms`);
                    unit.setVisible(true); // Ensure unit is visible
                    
                    this.tweens.add({
                        targets: unit,
                        angle: data.facing,
                        duration: data.turnDuration || 250, // Use default if missing
                        ease: 'Linear',
                        onComplete: () => {
                            unit.setData('facing', data.facing);
                            unit.setFillStyle(originalColor); // Restore color after rotation
                            console.log(`unitMoved: Unit ${data.id} completed turn, starting movement`);
                            unit.setVisible(true); // Ensure unit is visible after turn
                            
                            this.tweens.add({
                                targets: unit,
                                x: targetX,
                                y: targetY,
                                duration: data.duration || 500, // Use default if missing
                                ease: 'Linear',
                                onStart: () => {
                                    // Make sure color is correct at tween start
                                    unit.setFillStyle(originalColor);
                                    unit.setVisible(true); // Ensure unit is visible at start of movement
                                },
                                onComplete: () => {
                                    // Update unit position data
                                    unit.setData('gridX', data.x);
                                    unit.setData('gridY', data.y);
                                    unit.setFillStyle(originalColor); // Restore color
                                    unit.setVisible(true); // Ensure unit is visible after movement
                                    console.log(`unitMoved: Unit ${data.id} completed movement to (${data.x},${data.y})`);
                                    
                                    if (data.x >= 0 && data.x < GRID_SIZE && data.y >= 0 && data.y < GRID_SIZE) {
                                        this.map[data.x][data.y].setData('occupied', true);
                                    }
                                }
                            });
                        }
                    });
                } else {
                    // Infantry or no turning needed
                    unit.setAngle(data.facing);
                    unit.setData('facing', data.facing);
                    unit.setFillStyle(originalColor); // Ensure color is correct
                    unit.setVisible(true); // Ensure unit is visible
                    console.log(`unitMoved: Unit ${data.id} starting direct movement, duration: ${data.duration}ms`);
                    
                    this.tweens.add({
                        targets: unit,
                        x: targetX,
                        y: targetY,
                        duration: data.duration || 500, // Use default if missing
                        ease: 'Linear',
                        onStart: () => {
                            // Make sure color is correct at tween start
                            unit.setFillStyle(originalColor);
                            unit.setVisible(true); // Ensure unit is visible at start of movement
                        },
                        onComplete: () => {
                            // Update unit position data
                            unit.setData('gridX', data.x);
                            unit.setData('gridY', data.y);
                            unit.setFillStyle(originalColor); // Restore color
                            unit.setVisible(true); // Ensure unit is visible after movement
                            console.log(`unitMoved: Unit ${data.id} completed direct movement to (${data.x},${data.y})`);
                            
                            if (data.x >= 0 && data.x < GRID_SIZE && data.y >= 0 && data.y < GRID_SIZE) {
                                this.map[data.x][data.y].setData('occupied', true);
                            }
                        }
                    });
                }
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
            gridX * TILE_SIZE + TILE_SIZE/2,
            gridY * TILE_SIZE + TILE_SIZE/2,
            TILE_SIZE * 0.8,
            TILE_SIZE * 0.8,
            COLORS[type]
        );
        
        // Generate a truly unique ID with type prefix and timestamp
        const uniqueId = `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        
        unit.setStrokeStyle(1, 0x000000);
        unit.setInteractive();
        unit.setData('type', 'UNIT');
        unit.setData('unitType', type);
        unit.setData('id', uniqueId);
        unit.setData('originalColor', COLORS[type]); // Store original color in data
        unit.setData('facing', FacingDirection.NORTH); // Set initial facing
        unit.setAngle(FacingDirection.NORTH); // Set initial angle
        unit.setData('gridX', gridX); // Set initial grid position
        unit.setData('gridY', gridY); // Set initial grid position
        
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
        
        // Add unit to tracking array
        this.units.push(unit);
        
        console.log(`Client: Created unit ${type} with ID ${uniqueId} and color ${COLORS[type].toString(16)}`); // Debug
        return unit;
    }

    private createBuilding(type: BuildingType, gridX: number, gridY: number) {
        const building = this.add.rectangle(
            gridX * TILE_SIZE + TILE_SIZE/2,
            gridY * TILE_SIZE + TILE_SIZE/2,
            TILE_SIZE * 1.2,
            TILE_SIZE * 1.2,
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
        const unitType = unit.getData('unitType') as UnitType;
        const currentX = unit.getData('gridX');
        const currentY = unit.getData('gridY');
        const targetTile = this.map[x][y];
        const terrainType = targetTile.getData('type') as TileType;
        const terrainModifier = TERRAIN_SPEED_MODIFIERS[terrainType];
        const baseSpeed = UNIT_STATS[unitType].speed;
        const turnSpeed = UNIT_STATS[unitType].turnSpeed || 180;
        
        // Get the original color
        const originalColor = unit.getData('originalColor') || unit.fillColor;
        console.log(`Client moveUnit: Unit ${unit.getData('id')} (${unitType}) color: ${originalColor.toString(16)}`);
        
        // Calculate distance and duration
        const distance = Phaser.Math.Distance.Between(currentX, currentY, x, y) * TILE_SIZE;
        let duration = (distance / (baseSpeed * terrainModifier)) * 1000; // Convert to ms
        
        // Ensure minimum duration to prevent teleporting
        const MIN_DURATION = 250; // ms
        if (duration < MIN_DURATION) {
            duration = MIN_DURATION;
            console.log(`Client moveUnit: Adjusted duration to minimum ${MIN_DURATION}ms`);
        }
        
        // Calculate new facing direction
        const targetFacing = this.calculateFacing(currentX, currentY, x, y);
        const currentFacing = unit.getData('facing') as FacingDirection;
        
        // Calculate turn duration (if needed)
        const angleDiff = Phaser.Math.Angle.ShortestBetween(currentFacing, targetFacing);
        let turnDuration = Math.abs(angleDiff) / turnSpeed * 1000;
        
        // Ensure minimum turn duration
        if (turnDuration > 0 && turnDuration < MIN_DURATION) {
            turnDuration = MIN_DURATION;
        }
        
        // Only unset occupied if current position is valid
        if (currentX >= 0 && currentX < GRID_SIZE && currentY >= 0 && currentY < GRID_SIZE) {
            this.map[currentX][currentY].setData('occupied', false);
        }
        
        // Only set occupied if target is valid and not already occupied by another unit
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
            const alreadyOccupied = this.units.some(u => 
                u !== unit && u.getData('gridX') === x && u.getData('gridY') === y
            );
            if (!alreadyOccupied) {
                this.map[x][y].setData('occupied', true);
            }
        }
        
        // Emit move event for multiplayer
        socket.emit('moveUnit', {
            id: unit.getData('id'),
            x: x,
            y: y,
            facing: targetFacing,
            duration: duration,
            turnDuration: turnDuration
        });
        
        // Turn first (for vehicles), then move
        if (unitType !== 'INFANTRY' && Math.abs(angleDiff) > 5) {
            this.tweens.add({
                targets: unit,
                angle: targetFacing,
                duration: turnDuration,
                ease: 'Linear',
                onComplete: () => {
                    unit.setData('facing', targetFacing);
                    unit.setFillStyle(originalColor); // Restore color after rotation
                    this.performMove(unit, x, y, duration);
                }
            });
        } else {
            // Infantry turns instantly
            unit.setAngle(targetFacing);
            unit.setData('facing', targetFacing);
            unit.setFillStyle(originalColor); // Ensure color is correct
            this.performMove(unit, x, y, duration);
        }
    }

    private performMove(unit: Phaser.GameObjects.Rectangle, x: number, y: number, duration: number) {
        const targetX = x * TILE_SIZE + TILE_SIZE/2;
        const targetY = y * TILE_SIZE + TILE_SIZE/2;
        
        // Get the original color
        const originalColor = unit.getData('originalColor') || unit.fillColor;
        console.log(`performMove: Unit ${unit.getData('id')} original color: ${originalColor.toString(16)} moving to (${x},${y})`);
        
        // Ensure unit has the right color before starting movement
        unit.setFillStyle(originalColor);
        
        this.tweens.add({
            targets: unit,
            x: targetX,
            y: targetY,
            duration: duration,
            ease: 'Linear', // Linear for constant speed movement
            onStart: () => {
                // Make sure color is correct at tween start
                unit.setFillStyle(originalColor);
                console.log(`performMove onStart: Unit ${unit.getData('id')} color: ${originalColor.toString(16)}`);
            },
            onComplete: () => {
                // Update unit's internal position data
                unit.setData('gridX', x);
                unit.setData('gridY', y);
                
                // Restore original color
                unit.setFillStyle(originalColor);
                
                // Make unit visible if it somehow became invisible
                unit.setVisible(true);
                
                console.log(`Client performMove complete: Unit ${unit.getData('id')} at (${x},${y}) color: ${originalColor.toString(16)}`);
            }
        });
    }

    private calculateFacing(currentX: number, currentY: number, targetX: number, targetY: number): FacingDirection {
        const angle = Phaser.Math.Angle.Between(currentX, currentY, targetX, targetY);
        const degrees = Phaser.Math.RadToDeg(angle);
        
        // Convert to 0-360 range
        const normalizedDegrees = (degrees + 360) % 360;
        
        // Map to 8 cardinal directions
        if (normalizedDegrees >= 337.5 || normalizedDegrees < 22.5) {
            return FacingDirection.EAST;
        } else if (normalizedDegrees >= 22.5 && normalizedDegrees < 67.5) {
            return FacingDirection.SOUTHEAST;
        } else if (normalizedDegrees >= 67.5 && normalizedDegrees < 112.5) {
            return FacingDirection.SOUTH;
        } else if (normalizedDegrees >= 112.5 && normalizedDegrees < 157.5) {
            return FacingDirection.SOUTHWEST;
        } else if (normalizedDegrees >= 157.5 && normalizedDegrees < 202.5) {
            return FacingDirection.WEST;
        } else if (normalizedDegrees >= 202.5 && normalizedDegrees < 247.5) {
            return FacingDirection.NORTHWEST;
        } else if (normalizedDegrees >= 247.5 && normalizedDegrees < 292.5) {
            return FacingDirection.NORTH;
        } else {
            return FacingDirection.NORTHEAST;
        }
    }

    handleResize() {
        // Implement the logic to handle resizing the game scene
        console.log('GameScene handleResize called');
    }

    update() {
        // Filter out destroyed or dead units
        this.units = this.units.filter(unit => {
            const health = unit.getData('health');
            return unit.active && health !== undefined && health > 0;
        });
    }
}

const config = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,  // 640px
    height: GAME_HEIGHT, // 640px
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        parent: 'game-container',
        expandParent: true
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
    const gameScene = game.scene.getScene('GameScene') as GameScene;
    if (gameScene && gameScene.scene.isActive()) {
        gameScene.handleResize();
    }
}); 