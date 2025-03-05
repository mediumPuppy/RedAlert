// Instead of importing 'phaser', we'll use the global Phaser object from the CDN
import { TILE_SIZE, GAME_WIDTH, GAME_HEIGHT, GRID_SIZE, COLORS, UNIT_STATS, UnitType, BuildingType, TileType, FacingDirection, TERRAIN_SPEED_MODIFIERS, MAP_SIZE, MAP_WIDTH, MAP_HEIGHT, SCROLL_SPEED, MAX_PLAYERS_PER_GAME } from './game/constants';

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

interface GameStateData {
    gameId: string;
    players: { id: string; team: string | null; ready: boolean; spawnPoint?: { x: number; y: number; } }[];
    units: Record<string, { 
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
    }>;
    mapData?: TileType[][];
}

const socket = io('http://localhost:3000');

class MainMenu extends Phaser.Scene {
    private soundOn: boolean = true;
    private bgm!: Phaser.Sound.BaseSound;
    private findingGameText!: Phaser.GameObjects.Text;

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
        this.cameras.main.setBackgroundColor('#222222');
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        this.add.text(centerX, centerY - 100, 'Red Alert 25', {
            fontSize: '48px', color: '#ffffff', fontFamily: '"Press Start 2P", cursive',
            backgroundColor: '#ff0000', padding: { x: 20, y: 10 }
        }).setOrigin(0.5);

        const playButton = this.add.text(centerX, centerY, 'Play Multiplayer', {
            fontSize: '32px', color: '#ffffff', backgroundColor: '#006400',
            padding: { x: 20, y: 10 }, fontFamily: '"Press Start 2P", cursive'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        playButton.on('pointerover', () => playButton.setStyle({ backgroundColor: '#008000' }));
        playButton.on('pointerout', () => playButton.setStyle({ backgroundColor: '#006400' }));
        playButton.on('pointerdown', () => {
            console.log('Joining matchmaking');
            socket.emit('joinMatchmaking');
            playButton.setVisible(false);
            this.findingGameText = this.add.text(centerX, centerY, 'Finding Players...', {
                fontSize: '24px', color: '#ffffff', backgroundColor: '#000066',
                padding: { x: 20, y: 10 }, fontFamily: '"Press Start 2P", cursive'
            }).setOrigin(0.5);
        });

        const soundButton = this.add.text(centerX, centerY + 100, 'Sound: On', {
            fontSize: '32px', color: '#ffffff', backgroundColor: '#000066',
            padding: { x: 20, y: 10 }, fontFamily: '"Press Start 2P", cursive'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        this.add.text(10, 10, 'Debug: MainMenu Active', { fontSize: '16px', color: '#ffffff' });

        this.soundOn = true;
        this.bgm = this.sound.add('bgm', { loop: true });
        soundButton.on('pointerdown', () => {
            this.soundOn = !this.soundOn;
            soundButton.setText(`Sound: ${this.soundOn ? 'On' : 'Off'}`);
            if (this.bgm) {
                if (this.soundOn) this.bgm.play();
                else this.bgm.stop();
            }
        });

        socket.on('matchmakingStarted', () => console.log('Matchmaking started'));
        socket.on('matchmakingUpdate', ({ message }: { message: string }) => {
            console.log(`Matchmaking update: ${message}`);
            if (this.findingGameText) this.findingGameText.setText(`Finding Game...\n${message}`);
        });

        socket.on('gameCreated', ({ gameId, players }: { gameId: string, players: { id: string, team: string | null, ready: boolean }[] }) => {
            console.log(`Game created: ${gameId} with ${players.length} players`);
                    this.scene.start('GameScene', { gameId, players });
        });
    }
}

class GameScene extends Phaser.Scene {
    private map: Phaser.GameObjects.Rectangle[][] = [];
    private units: Phaser.GameObjects.Rectangle[] = [];
    private selectedUnit: Phaser.GameObjects.Rectangle | null = null;
    private resources: number = 1000;
    private resourceText!: Phaser.GameObjects.Text;
    private minimapCanvas: HTMLCanvasElement | null = null;
    private minimapContext: CanvasRenderingContext2D | null = null;
    private minimapContainer: HTMLElement | null = null;
    private resourceDisplay: HTMLElement | null = null;
    private controlPanel: HTMLElement | null = null;
    private buildButton: HTMLElement | null = null;
    private attackButton: HTMLElement | null = null;
    private harvestButton: HTMLElement | null = null;
    private currentMode: 'normal' | 'build' | 'attack' | 'harvest' = 'normal';
    private gameId: string | null = null;
    private inLobby: boolean = true;
    private pendingGameCreated: { gameId: string, players: { id: string, team: string | null, ready: boolean }[] } | null = null;
    private pendingLobbyUpdate: any = null;
    private pendingGameStart: any = null;
    private initialized: boolean = false;
    private mode: string | null = null;
    private lastStateUpdate: number = 0; // Track last state update time
    private readonly STATE_UPDATE_DEBOUNCE = 250; // Debounce state updates (ms)
    private lastSynced: number = 0; // Track last state sync timestamp

    constructor() {
        super('GameScene');
    }

    init(data: { gameId?: string, players?: { id: string, team: string | null, ready: boolean }[] }) {
        if (data) {
            this.gameId = data.gameId || null;
            if (data.players) this.pendingGameCreated = { gameId: data.gameId!, players: data.players };
        }
    }

    preload() {
        // Keep your existing asset loading
        this.load.image('grass', 'assets/grass.png');
        this.load.image('ore', 'assets/ore.png');
        this.load.image('tank', 'assets/tank.png');
    }

    create() {
        console.log('GameScene create started', { mode: this.mode });
        this.inLobby = true;
        this.initialized = true;

        this.cameras.main.setBackgroundColor('#222222');
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        const waitingText = this.add.text(centerX, centerY - 50, 'Waiting for Players...', {
            fontSize: '24px', color: '#ffffff', fontFamily: '"Press Start 2P", cursive',
            backgroundColor: '#000066', padding: { x: 20, y: 10 }
        }).setOrigin(0.5);

        const gameIdText = this.add.text(centerX, centerY, this.gameId ? `Game ID: ${this.gameId}` : 'Connecting...', {
            fontSize: '16px', color: '#ffffff', fontFamily: '"Press Start 2P", cursive'
        }).setOrigin(0.5);

        socket.on('gameCreated', ({ gameId, players }: { gameId: string, players: { id: string, team: string | null, ready: boolean }[] }) => {
            console.log(`Received gameCreated for ${gameId} with ${players.length} players`);
            this.gameId = gameId;
            if (this.initialized) {
                this.showLobbyUI(players);
                gameIdText.setText(`Game ID: ${gameId}`);
                waitingText.destroy();
            } else {
                this.pendingGameCreated = { gameId, players };
            }
        });

        socket.on('lobbyUpdate', (data: { players: { id: string, team: string | null, ready: boolean }[] }) => {
            console.log('Received lobbyUpdate event', data);
            if (this.initialized && this.inLobby) {
                this.showLobbyUI(data.players);
            } else {
                this.pendingLobbyUpdate = data;
            }
        });

        socket.on('gameStart', (data: GameStateData) => {
            console.log('Received gameStart event', data);
            if (this.initialized) {
                this.inLobby = false;
                this.startGame(data);
                waitingText.destroy();
            } else {
                this.pendingGameStart = data;
            }
        });

        socket.on('unitMoved', (data: UnitMovedData & { timestamp?: number }) => {
            if (!this.inLobby && this.initialized) {
                // Skip stale movement events
                if (data.timestamp && data.timestamp <= this.lastSynced) {
                    console.log(`Skipping outdated unitMoved for ${data.id} (timestamp ${data.timestamp} <= lastSynced ${this.lastSynced})`);
                    return;
                }
                // Only process movement if tab is active
                if (!document.hidden) {
                    console.log(`Unit moved: ${data.id} to (${data.x}, ${data.y})`);
                    this.handleRemoteUnitMovement(data);
                }
            }
        });

        socket.on('gameState', (data: GameStateData) => {
            console.log('Received gameState event', data);
            if (this.initialized) {
                this.gameId = data.gameId;
                const now = Date.now();
                if (now - this.lastStateUpdate >= this.STATE_UPDATE_DEBOUNCE) {
                    // Pass document.hidden as isRefocus to handleGameState
                    this.handleGameState(data, document.hidden);
                    this.lastStateUpdate = now;
                    this.lastSynced = now; // Update sync timestamp
                }
                if (!this.inLobby) {
                    this.updateGameIdText(data.gameId);
                }
            } else {
                this.pendingGameStart = data;
            }
        });

        socket.on('gameError', ({ message }: { message: string }) => {
            console.log(`Game error: ${message}`);
            this.scene.start('MainMenu');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            if (this.inLobby) {
                this.scene.start('MainMenu');
            } else {
                this.add.text(centerX, centerY, 'Disconnected from Server', {
                    fontSize: '24px', color: '#ffffff', fontFamily: '"Press Start 2P", cursive',
                    backgroundColor: '#ff0000', padding: { x: 20, y: 10 }
                }).setOrigin(0.5);
                this.time.delayedCall(2000, () => this.scene.start('MainMenu'));
            }
        });

        // Handle tab focus to sync state
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.gameId && !this.inLobby) {
                console.log(`Tab refocused, requesting game state for ${this.gameId}`);
                this.tweens.killAll(); // Clear all queued tweens
                socket.emit('requestGameState', this.gameId);
            }
        });

        // Process pending events
        if (this.pendingGameCreated) {
            console.log('Processing pending gameCreated', this.pendingGameCreated);
            this.gameId = this.pendingGameCreated.gameId;
            this.showLobbyUI(this.pendingGameCreated.players);
            gameIdText.setText(`Game ID: ${this.gameId}`);
            waitingText.destroy();
            this.pendingGameCreated = null;
        }

        if (this.pendingLobbyUpdate) {
            console.log('Processing pending lobbyUpdate', this.pendingLobbyUpdate);
            this.showLobbyUI(this.pendingLobbyUpdate.players);
            this.pendingLobbyUpdate = null;
        }

        if (this.pendingGameStart) {
            console.log('Processing pending gameStart', this.pendingGameStart);
            this.inLobby = false;
            this.startGame(this.pendingGameStart);
            waitingText.destroy();
            this.pendingGameStart = null;
        }

    }

    private showLobbyUI(players: { id: string, team: string | null, ready: boolean }[]) {
        if (!this.inLobby) return;
        
        // Clear existing UI
        this.children.removeAll();

        // Safety check for cameras.main - if it's not initialized yet, use default values
        const centerX = this.cameras.main ? this.cameras.main.width / 2 : GAME_WIDTH / 2;
        const centerY = this.cameras.main ? this.cameras.main.height / 2 : GAME_HEIGHT / 2;

        // Add game title
        this.add.text(centerX, 50, 'Red Alert 25 - Game Lobby', {
            fontSize: '24px',
            color: '#ffffff',
            fontFamily: '"Press Start 2P", cursive',
            backgroundColor: '#ff0000',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5);

        // Add game ID
        this.add.text(centerX, 100, `Game ID: ${this.gameId}`, {
            fontSize: '16px',
            color: '#ffffff',
            fontFamily: '"Press Start 2P", cursive'
        }).setOrigin(0.5);
        
        // Add player count
        this.add.text(centerX, 130, `Players: ${players.length}/${MAX_PLAYERS_PER_GAME}`, {
            fontSize: '16px',
            color: '#ffffff',
            fontFamily: '"Press Start 2P", cursive'
        }).setOrigin(0.5);

        // Add player list title
        this.add.text(centerX, 150, 'Players:', {
            fontSize: '20px',
            color: '#ffffff',
            fontFamily: '"Press Start 2P", cursive'
        }).setOrigin(0.5);

        // Add player list
        players.forEach((player, i) => {
            const isCurrentPlayer = player.id === socket.id;
            const playerText = this.add.text(
                centerX, 
                190 + i * 30, 
                `${isCurrentPlayer ? '→ ' : ''}${player.id.substring(0, 6)} - ${player.team || 'No Team'} ${player.ready ? '(Ready)' : ''}`, 
                {
                    fontSize: '16px',
                    color: isCurrentPlayer ? '#ffff00' : '#ffffff',
                    fontFamily: '"Press Start 2P", cursive'
                }
            ).setOrigin(0.5);
        });

        // Add team selection buttons
        const alliesButton = this.add.text(centerX - 100, centerY + 100, 'Join Allies', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#0000ff',
            padding: { x: 10, y: 5 },
            fontFamily: '"Press Start 2P", cursive'
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

        const sovietsButton = this.add.text(centerX + 100, centerY + 100, 'Join Soviets', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#ff0000',
            padding: { x: 10, y: 5 },
            fontFamily: '"Press Start 2P", cursive'
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

        // Add ready button
        const readyButton = this.add.text(centerX, centerY + 150, 'Ready', {
            fontSize: '20px',
            color: '#ffffff',
            backgroundColor: '#006400',
            padding: { x: 20, y: 10 },
            fontFamily: '"Press Start 2P", cursive'
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

        // Add button event handlers
        alliesButton.on('pointerdown', () => {
            if (this.gameId) {
                socket.emit('setTeam', { gameId: this.gameId, team: 'ALLIES' });
            }
        });

        sovietsButton.on('pointerdown', () => {
            if (this.gameId) {
                socket.emit('setTeam', { gameId: this.gameId, team: 'SOVIETS' });
            }
        });

        readyButton.on('pointerdown', () => {
            if (this.gameId) {
                socket.emit('setReady', this.gameId);
                readyButton.setStyle({ backgroundColor: '#004400' });
                readyButton.setText('Waiting...');
                readyButton.disableInteractive();
            }
        });
    }

    private startGame(data: GameStateData) {
        // Clear the lobby UI
        this.children.removeAll();
        
        // Create the game map using server-provided map data
        this.createMap(data.mapData);
        
        // Use handleGameState to ensure latest state is applied
        this.handleGameState(data);
        
        // Set up the game UI
        this.setupHtmlMinimap();
        this.updateMinimap();
        
        // Set up resource display
        this.resourceDisplay = document.getElementById('resource-display');
        if (this.resourceDisplay) {
            this.updateResourceDisplay();
        } else {
            // Fallback to Phaser text if HTML element not found
            this.resourceText = this.add.text(10, 10, `Resources: ${this.resources}`, {
                fontSize: '20px',
                color: '#ffffff'
            }).setDepth(1);
        }
        
        // Set up control panel
        this.setupControlPanel();
        
        // Set up camera for large map
        this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
        this.cameras.main.setViewport(0, 0, GAME_WIDTH, GAME_HEIGHT);
        
        // Find player's spawn point or units to center camera on
        this.centerCameraOnPlayerUnits();
        
        // Set up input handlers
        this.setupInput();
    }

    private handleRemoteUnitMovement(data: UnitMovedData) {
        // Only process unit movements if the tab is active
        if (document.hidden) {
            console.log(`Tab is hidden, skipping animation for unit ${data.id}`);
            return;
        }

        // Find the unit by ID
        const unit = this.units.find(u => u.getData('id') === data.id);
        
        if (unit) {
            const unitType = unit.getData('unitType') as UnitType;
            const currentX = unit.getData('gridX');
            const currentY = unit.getData('gridY');
            
            // Skip processing if duration is zero or negative
            if (data.duration <= 0) {
                console.log(`Skipping instant movement for unit ${data.id} (duration: ${data.duration})`);
                return;
            }
            
            // Get the original color
            const originalColor = unit.getData('originalColor') || unit.fillColor;
            
            // Clear current position
            if (currentX >= 0 && currentX < MAP_SIZE && currentY >= 0 && currentY < MAP_SIZE) {
                this.map[currentX][currentY].setData('occupied', false);
            }
            
            // Calculate the actual pixel positions
            const targetX = data.x * TILE_SIZE + TILE_SIZE/2;
            const targetY = data.y * TILE_SIZE + TILE_SIZE/2;
            
            // Kill any existing tweens for this unit
            this.tweens.killTweensOf(unit);
            
            // Handle turning and movement based on unit type
            if (unitType !== 'INFANTRY' && data.turnDuration > 0) {
                // Turn first, then move
                this.tweens.add({
                    targets: unit,
                    angle: data.facing,
                    duration: data.turnDuration,
                    ease: 'Linear',
                    onComplete: () => {
                        unit.setData('facing', data.facing);
                        unit.setFillStyle(originalColor);
                        
                        this.tweens.add({
                            targets: unit,
                            x: targetX,
                            y: targetY,
                            duration: data.duration,
                            ease: 'Linear',
                            onStart: () => {
                                unit.setFillStyle(originalColor);
                                unit.setVisible(true);
                            },
                            onComplete: () => {
                                unit.setData('gridX', data.x);
                                unit.setData('gridY', data.y);
                                unit.setFillStyle(originalColor);
                                unit.setVisible(true);
                                
                                if (data.x >= 0 && data.x < MAP_SIZE && data.y >= 0 && data.y < MAP_SIZE) {
                                    this.map[data.x][data.y].setData('occupied', true);
                                }
                            }
                        });
                    }
                });
            } else {
                // Infantry or no turning needed
                this.tweens.add({
                    targets: unit,
                    x: targetX,
                    y: targetY,
                    angle: data.facing,
                    duration: data.duration,
                    ease: 'Linear',
                    onStart: () => {
                        unit.setAngle(data.facing);
                        unit.setData('facing', data.facing);
                        unit.setFillStyle(originalColor);
                        unit.setVisible(true);
                    },
                    onComplete: () => {
                        unit.setData('gridX', data.x);
                        unit.setData('gridY', data.y);
                        unit.setFillStyle(originalColor);
                        unit.setVisible(true);
                        
                        if (data.x >= 0 && data.x < MAP_SIZE && data.y >= 0 && data.y < MAP_SIZE) {
                            this.map[data.x][data.y].setData('occupied', true);
                        }
                    }
                });
            }
        }
    }

    private isValidMove(x: number, y: number): boolean {
        // Basic checks for valid move
        if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) {
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
        
        // Calculate distance and duration
        const distance = Phaser.Math.Distance.Between(currentX, currentY, x, y) * TILE_SIZE;
        let duration = (distance / (baseSpeed * terrainModifier)) * 1000; // Convert to ms
        
        // Ensure minimum duration to prevent teleporting
        const MIN_DURATION = 250; // ms
        if (duration < MIN_DURATION) {
            duration = MIN_DURATION;
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
        if (currentX >= 0 && currentX < MAP_SIZE && currentY >= 0 && currentY < MAP_SIZE) {
            this.map[currentX][currentY].setData('occupied', false);
        }
        
        // Only set occupied if target is valid and not already occupied by another unit
        if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) {
            const alreadyOccupied = this.units.some(u => 
                u !== unit && u.getData('gridX') === x && u.getData('gridY') === y
            );
            if (!alreadyOccupied) {
                this.map[x][y].setData('occupied', true);
            }
        }
        
        // Create the movement command
        const command = {
            id: unit.getData('id'),
            x: x,
            y: y,
            facing: targetFacing,
            duration: duration,
            turnDuration: turnDuration
        };
        
        // Send the command to the server
        socket.emit('moveUnit', command);
        
        // Add a small latency buffer before starting local movement
        this.time.delayedCall(100, () => {
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
        });
    }

    private performMove(unit: Phaser.GameObjects.Rectangle, x: number, y: number, duration: number) {
        const targetX = x * TILE_SIZE + TILE_SIZE/2;
        const targetY = y * TILE_SIZE + TILE_SIZE/2;
        
        // Get the original color
        const originalColor = unit.getData('originalColor') || unit.fillColor;
        console.log(`performMove: Unit ${unit.getData('id')} original color: ${originalColor.toString(16)}`);
        
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
        if (this.units) {
            this.units = this.units.filter(unit => {
                const health = unit.getData('health');
                return unit.active && health !== undefined && health > 0;
            });
        }
        
        // Safety check for camera
        if (!this.cameras || !this.cameras.main) return;
        
        // Scroll based on mouse position (inspired by SCROLL.CPP)
        const pointer = this.input.activePointer;
        const cam = this.cameras.main;
        const edgeSize = 50; // Pixels from edge to trigger scrolling

        if (pointer.isDown || pointer.active) {
            if (pointer.x < edgeSize && cam.scrollX > 0) {
                cam.scrollX -= SCROLL_SPEED;
            } else if (pointer.x > GAME_WIDTH - edgeSize && cam.scrollX < MAP_WIDTH - GAME_WIDTH) {
                cam.scrollX += SCROLL_SPEED;
            }
            if (pointer.y < edgeSize && cam.scrollY > 0) {
                cam.scrollY -= SCROLL_SPEED;
            } else if (pointer.y > GAME_HEIGHT - edgeSize && cam.scrollY < MAP_HEIGHT - GAME_HEIGHT) {
                cam.scrollY += SCROLL_SPEED;
            }
        }

        // Update minimap each frame
        this.updateMinimap();
    }

    private setupHtmlMinimap() {
        // Get the minimap container and canvas
        this.minimapContainer = document.getElementById('minimap-container');
        this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
        
        if (this.minimapContainer && this.minimapCanvas) {
            // Show the minimap container
            this.minimapContainer.style.display = 'block';
            
            // Get the canvas context
            this.minimapContext = this.minimapCanvas.getContext('2d');
            
            // Set canvas size
            this.minimapCanvas.width = MAP_SIZE * 1.5;
            this.minimapCanvas.height = MAP_SIZE * 1.5;
            
            // Add click listener to minimap
            this.minimapCanvas.addEventListener('click', (event) => {
                const rect = this.minimapCanvas!.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                
                // Convert click position to map position
                const relativeX = x / this.minimapCanvas!.width;
                const relativeY = y / this.minimapCanvas!.height;
                
                // Calculate target camera position (center on the clicked point)
                const targetX = relativeX * MAP_WIDTH - GAME_WIDTH / 2;
                const targetY = relativeY * MAP_HEIGHT - GAME_HEIGHT / 2;
                
                // Bound camera position within map bounds
                this.cameras.main.scrollX = Math.max(0, Math.min(MAP_WIDTH - GAME_WIDTH, targetX));
                this.cameras.main.scrollY = Math.max(0, Math.min(MAP_HEIGHT - GAME_HEIGHT, targetY));
            });
        }
    }
    
    // Method to clean up minimap when scene is stopped
    private cleanupMinimap() {
        // Hide the minimap container when leaving the scene
        if (this.minimapContainer) {
            this.minimapContainer.style.display = 'none';
        }
        
        // Hide the resource display
        if (this.resourceDisplay) {
            this.resourceDisplay.textContent = '';
        }
        
        // Clean up event listeners
        if (this.minimapCanvas) {
            // Clean up would be better with a named function reference
            // But for now we'll just remove all
            this.minimapCanvas.removeEventListener('click', () => {});
        }
    }

    private updateMinimap() {
        if (!this.minimapContext || !this.minimapCanvas) return;
        
        // Safety check - ensure map is initialized
        if (!this.map || this.map.length === 0) return;
        
        const ctx = this.minimapContext;
        const scale = 1.5; // Scale for minimap
        
        // Clear the canvas
        ctx.clearRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);
        
        // Draw background
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, MAP_SIZE * scale, MAP_SIZE * scale);
        
        // Draw tiles
        for (let x = 0; x < MAP_SIZE; x++) {
            for (let y = 0; y < MAP_SIZE; y++) {
                if (this.map[x] && this.map[x][y]) {
                    const tile = this.map[x][y];
                    const tileType = tile.getData('type') as TileType;
                    ctx.fillStyle = '#' + COLORS[tileType].toString(16).padStart(6, '0');
                    ctx.globalAlpha = 0.7;
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
        }
        
        // Draw units
        ctx.globalAlpha = 1.0;
        if (this.units) {
            this.units.forEach(unit => {
                const unitType = unit.getData('unitType') as UnitType;
                const gridX = unit.getData('gridX');
                const gridY = unit.getData('gridY');
                ctx.fillStyle = '#' + COLORS[unitType].toString(16).padStart(6, '0');
                
                // Make units slightly larger on minimap for better visibility
                const unitSize = scale * 1.5;
                ctx.fillRect(
                    gridX * scale - unitSize/4, 
                    gridY * scale - unitSize/4, 
                    unitSize, 
                    unitSize
                );
            });
        }
        
        // Draw viewport rectangle
        if (this.cameras && this.cameras.main) {
            const cam = this.cameras.main;
            const viewX = cam.scrollX / TILE_SIZE * scale;
            const viewY = cam.scrollY / TILE_SIZE * scale;
            const viewWidth = GRID_SIZE * scale;
            const viewHeight = GRID_SIZE * scale;
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(viewX, viewY, viewWidth, viewHeight);
        }
    }

    // Centers the camera on the player's units or spawn point
    private centerCameraOnPlayerUnits() {
        // Find our player in the player list
        const player = this.pendingGameStart?.players.find((p: { id: string; team: string | null; ready: boolean }) => p.id === socket.id);
        
        if (player && player.spawnPoint) {
            // If we have spawn point information, use that
            const tileX = player.spawnPoint.x;
            const tileY = player.spawnPoint.y;
            
            // Convert tile coordinates to pixel coordinates and center the camera there
            const pixelX = tileX * TILE_SIZE;
            const pixelY = tileY * TILE_SIZE;
            
            // Center the camera on this position
            this.cameras.main.scrollX = Math.max(0, pixelX - GAME_WIDTH / 2);
            this.cameras.main.scrollY = Math.max(0, pixelY - GAME_HEIGHT / 2);
            
            console.log(`Centering camera on spawn point (${tileX}, ${tileY})`);
            return;
        }
        
        // Fallback: Find any units owned by this player
        const playerUnits = this.units.filter(unit => unit.getData('owner') === socket.id);
        
        if (playerUnits.length > 0) {
            // Calculate the average position of all player units
            let avgX = 0;
            let avgY = 0;
            
            playerUnits.forEach(unit => {
                avgX += unit.getData('gridX') || 0;
                avgY += unit.getData('gridY') || 0;
            });
            
            avgX = avgX / playerUnits.length;
            avgY = avgY / playerUnits.length;
            
            // Convert to pixel coordinates
            const pixelX = avgX * TILE_SIZE;
            const pixelY = avgY * TILE_SIZE;
            
            // Center the camera on the average position
            this.cameras.main.scrollX = Math.max(0, pixelX - GAME_WIDTH / 2);
            this.cameras.main.scrollY = Math.max(0, pixelY - GAME_HEIGHT / 2);
            
            console.log(`Centering camera on player units at (${avgX}, ${avgY})`);
            return;
        }
        
        // Default: If we can't find units or spawn point, center on the map
        console.log('No player units or spawn point found, centering on map');
        this.cameras.main.scrollX = (MAP_WIDTH - GAME_WIDTH) / 2;
        this.cameras.main.scrollY = (MAP_HEIGHT - GAME_HEIGHT) / 2;
    }

    // Add a method to update the resource display
    private updateResourceDisplay() {
        if (this.resourceDisplay) {
            this.resourceDisplay.textContent = `Resources: ${this.resources}`;
        } else if (this.resourceText) {
            this.resourceText.setText(`Resources: ${this.resources}`);
        }
    }

    private harvest(harvester: Phaser.GameObjects.Rectangle, oreTile: Phaser.GameObjects.Rectangle) {
        const harvestAmount = 50;
        this.resources += harvestAmount;
        this.updateResourceDisplay();
        
        // Visual feedback
        const originalColor = oreTile.fillColor;
        oreTile.setFillStyle(0xffffff);
        this.time.delayedCall(200, () => oreTile.setFillStyle(originalColor));
    }

    private setupControlPanel() {
        this.controlPanel = document.getElementById('control-panel');
        this.buildButton = document.getElementById('build-button');
        this.attackButton = document.getElementById('attack-button');
        this.harvestButton = document.getElementById('harvest-button');
        
        if (this.controlPanel) {
            this.controlPanel.style.display = 'flex';
        }
        
        // Add event listeners to buttons
        if (this.buildButton) {
            this.buildButton.addEventListener('click', () => this.setMode('build'));
        }
        
        if (this.attackButton) {
            this.attackButton.addEventListener('click', () => this.setMode('attack'));
        }
        
        if (this.harvestButton) {
            this.harvestButton.addEventListener('click', () => this.setMode('harvest'));
        }
        
        // Initially disable all buttons until a unit is selected
        this.updateControlButtons();
    }
    
    private updateControlButtons() {
        if (!this.selectedUnit) {
            // Disable all buttons if no unit selected
            if (this.buildButton) this.buildButton.setAttribute('disabled', 'true');
            if (this.attackButton) this.attackButton.setAttribute('disabled', 'true');
            if (this.harvestButton) this.harvestButton.setAttribute('disabled', 'true');
            return;
        }
        
        const unitType = this.selectedUnit.getData('unitType') as UnitType;
        
        // Enable/disable buttons based on unit type
        if (this.buildButton) {
            if (unitType === 'INFANTRY') {
                this.buildButton.removeAttribute('disabled');
            } else {
                this.buildButton.setAttribute('disabled', 'true');
            }
        }
        
        if (this.attackButton) {
            if (unitType === 'TANK' || unitType === 'INFANTRY') {
                this.attackButton.removeAttribute('disabled');
            } else {
                this.attackButton.setAttribute('disabled', 'true');
            }
        }
        
        if (this.harvestButton) {
            if (unitType === 'HARVESTER') {
                this.harvestButton.removeAttribute('disabled');
            } else {
                this.harvestButton.setAttribute('disabled', 'true');
            }
        }
    }
    
    private setMode(mode: 'normal' | 'build' | 'attack' | 'harvest') {
        this.currentMode = mode;
        
        // Update button styles to show active mode
        if (this.buildButton) {
            this.buildButton.style.backgroundColor = mode === 'build' ? 'var(--ore-yellow)' : 'var(--allied-blue)';
            this.buildButton.style.color = mode === 'build' ? 'var(--black)' : 'var(--white)';
        }
        
        if (this.attackButton) {
            this.attackButton.style.backgroundColor = mode === 'attack' ? 'var(--ore-yellow)' : 'var(--allied-blue)';
            this.attackButton.style.color = mode === 'attack' ? 'var(--black)' : 'var(--white)';
        }
        
        if (this.harvestButton) {
            this.harvestButton.style.backgroundColor = mode === 'harvest' ? 'var(--ore-yellow)' : 'var(--allied-blue)';
            this.harvestButton.style.color = mode === 'harvest' ? 'var(--black)' : 'var(--white)';
        }
    }
    
    private attackLocation(unit: Phaser.GameObjects.Rectangle, x: number, y: number) {
        // Check if there's a valid target at the location
        if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) {
            return;
        }
        
        // Find a target at the location
        const target = this.units.find(u => 
            u.getData('gridX') === x && 
            u.getData('gridY') === y && 
            u !== unit
        );
        
        if (target) {
            // Move close to the target if not in range
            const unitX = unit.getData('gridX');
            const unitY = unit.getData('gridY');
            const range = unit.getData('range') || 1;
            
            const distance = Phaser.Math.Distance.Between(unitX, unitY, x, y);
            
            if (distance > range) {
                // Find a position within range
                const angle = Phaser.Math.Angle.Between(unitX, unitY, x, y);
                const newX = Math.round(x - Math.cos(angle) * range);
                const newY = Math.round(y - Math.sin(angle) * range);
                
                // Move to the position first, then attack
                if (this.isValidMove(newX, newY)) {
                    this.moveUnit(unit, newX, newY);
                    
                    // After moving, attack
                    this.time.delayedCall(1000, () => {
                        this.performAttack(unit, target);
                    });
                }
            } else {
                // Already in range, attack directly
                this.performAttack(unit, target);
            }
        }
    }
    
    private performAttack(attacker: Phaser.GameObjects.Rectangle, target: Phaser.GameObjects.Rectangle) {
        const damage = attacker.getData('damage') || 10;
        const targetHealth = target.getData('health') || 0;
        const newHealth = Math.max(0, targetHealth - damage);
        
        target.setData('health', newHealth);
        
        // Visual feedback
        const originalColor = target.fillColor;
        target.setFillStyle(0xff0000);
        this.time.delayedCall(200, () => {
            if (newHealth <= 0) {
                // Target destroyed
                const index = this.units.indexOf(target);
                if (index !== -1) {
                    this.units.splice(index, 1);
                }
                target.destroy();
            } else {
                target.setFillStyle(originalColor);
            }
        });
    }
    
    private harvestLocation(harvester: Phaser.GameObjects.Rectangle, x: number, y: number) {
        if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) {
            return;
        }
        
        const tile = this.map[x][y];
        if (tile.getData('type') === 'ORE') {
            // Move to the ore tile first if not adjacent
            const harvesterX = harvester.getData('gridX');
            const harvesterY = harvester.getData('gridY');
            
            const distance = Phaser.Math.Distance.Between(harvesterX, harvesterY, x, y);
            
            if (distance > 1) {
                // Find an adjacent position
                const positions = [
                    {x: x+1, y: y}, {x: x-1, y: y}, 
                    {x: x, y: y+1}, {x: x, y: y-1}
                ];
                
                // Filter valid positions
                const validPositions = positions.filter(pos => this.isValidMove(pos.x, pos.y));
                
                if (validPositions.length > 0) {
                    // Move to the closest valid position
                    const closest = validPositions.reduce((prev, curr) => {
                        const prevDist = Phaser.Math.Distance.Between(harvesterX, harvesterY, prev.x, prev.y);
                        const currDist = Phaser.Math.Distance.Between(harvesterX, harvesterY, curr.x, curr.y);
                        return prevDist < currDist ? prev : curr;
                    });
                    
                    this.moveUnit(harvester, closest.x, closest.y);
                    
                    // After moving, harvest
                    this.time.delayedCall(1000, () => {
                        this.harvest(harvester, tile);
                    });
                }
            } else {
                // Already adjacent, harvest directly
                this.harvest(harvester, tile);
            }
        }
    }
    
    private buildStructure(x: number, y: number) {
        if (!this.isValidMove(x, y) || this.resources < 500) {
            return;
        }
        
        // Deduct resources
        this.resources -= 500;
        this.updateResourceDisplay();
        
        // Create a new building
        this.createBuilding('BARRACKS', x, y);
    }

    private cleanupUI() {
        // Hide the minimap container when leaving the scene
        if (this.minimapContainer) {
            this.minimapContainer.style.display = 'none';
        }
        
        // Hide the resource display
        if (this.resourceDisplay) {
            this.resourceDisplay.textContent = '';
        }
        
        // Hide the control panel
        if (this.controlPanel) {
            this.controlPanel.style.display = 'none';
        }
        
        // Clean up event listeners
        if (this.minimapCanvas) {
            this.minimapCanvas.removeEventListener('click', () => {});
        }
        
        if (this.buildButton) {
            this.buildButton.removeEventListener('click', () => {});
        }
        
        if (this.attackButton) {
            this.attackButton.removeEventListener('click', () => {});
        }
        
        if (this.harvestButton) {
            this.harvestButton.removeEventListener('click', () => {});
        }
    }

    private createMap(mapData?: TileType[][]) {
        // Create grid-based map
        for (let x = 0; x < MAP_SIZE; x++) {
            this.map[x] = [];
            for (let y = 0; y < MAP_SIZE; y++) {
                // Use server-provided map data if available, otherwise generate random
                const tileType: TileType = mapData && mapData[x] && mapData[x][y] 
                    ? mapData[x][y] 
                    : (Math.random() < 0.1 ? 'WATER' : Math.random() < 0.25 ? 'ORE' : 'GRASS');
                
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
        
        console.log(`Map created ${mapData ? 'from server data' : 'with random generation'}`);
    }

    private setupInput() {
        // Set up cleanup when scene stops
        this.events.on('shutdown', this.cleanupUI, this);

        // Handle unit selection
        this.input.on('gameobjectdown', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Rectangle) => {
            if (gameObject.getData('type') === 'UNIT' && gameObject.getData('owner') === socket.id) {
                if (this.selectedUnit) {
                    this.selectedUnit.setStrokeStyle(1, 0x000000);
                }
                this.selectedUnit = gameObject;
                gameObject.setStrokeStyle(2, 0xffff00);
                
                // Enable/disable buttons based on unit type
                this.updateControlButtons();
            }
        });

        // Handle map clicks
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // We're handling minimap clicks in HTML, so this is only for regular map clicks
            if (this.selectedUnit) {
                // Account for camera position when calculating grid coordinates
                const x = Math.floor((pointer.x + this.cameras.main.scrollX) / TILE_SIZE);
                const y = Math.floor((pointer.y + this.cameras.main.scrollY) / TILE_SIZE);
                
                if (this.currentMode === 'normal' && this.isValidMove(x, y)) {
                    this.moveUnit(this.selectedUnit, x, y);
                } else if (this.currentMode === 'attack') {
                    this.attackLocation(this.selectedUnit, x, y);
                } else if (this.currentMode === 'harvest' && this.selectedUnit.getData('unitType') === 'HARVESTER') {
                    this.harvestLocation(this.selectedUnit, x, y);
                } else if (this.currentMode === 'build') {
                    this.buildStructure(x, y);
                }
                
                // Reset mode after action
                this.setMode('normal');
            }
        });
    }

    private handleGameState(data: GameStateData, isRefocus: boolean = false) {
        this.gameId = data.gameId;
        
        if (this.inLobby) {
            this.showLobbyUI(data.players);
            return;
        }

        // Safety check - ensure map and units are initialized
        if (!this.map || this.map.length === 0) {
            console.log('Map not initialized yet, creating map first');
            this.createMap();
        }
        
        const now = Date.now();
        const updatedUnits = new Set<string>();
        
        Object.entries(data.units).forEach(([id, unitData]) => {
            let unit = this.units.find(u => u.getData('id') === id);
            const isNewUnit = !unit;
            
            if (!unit) {
                // Create new unit if it doesn't exist
                console.log(`Creating new unit ${unitData.type} with ID ${id}`);
                unit = this.createUnit(unitData.type as UnitType, unitData.x, unitData.y);
                unit.setData('id', id);
                unit.setData('owner', unitData.owner);
                if (unitData.owner === socket.id) {
                    unit.setData('selectable', true);
                }
            }
            
            const currentX = unit.getData('gridX');
            const currentY = unit.getData('gridY');
            
            // Clear current position
            if (currentX >= 0 && currentX < MAP_SIZE && currentY >= 0 && currentY < MAP_SIZE) {
                this.map[currentX][currentY].setData('occupied', false);
            }

            const targetX = unitData.x * TILE_SIZE + TILE_SIZE/2;
            const targetY = unitData.y * TILE_SIZE + TILE_SIZE/2;
            const originalColor = unit.getData('originalColor') || COLORS[unitData.type as UnitType];

            // Kill any existing tweens for this unit
            this.tweens.killTweensOf(unit);

            if (isRefocus) {
                // On tab refocus, instantly set position without animation
                unit.setPosition(targetX, targetY);
                unit.setAngle(unitData.facing);
                unit.setData('gridX', unitData.x);
                unit.setData('gridY', unitData.y);
                unit.setData('facing', unitData.facing);
                unit.setFillStyle(originalColor);
                if (unitData.x >= 0 && unitData.x < MAP_SIZE && 
                    unitData.y >= 0 && unitData.y < MAP_SIZE) {
                    this.map[unitData.x][unitData.y].setData('occupied', true);
                }
            } else if (unitData.lastMove && (isNewUnit || currentX !== unitData.x || currentY !== unitData.y)) {
                const lastMove = unitData.lastMove;
                const elapsed = now - lastMove.timestamp;
                const totalDuration = lastMove.duration + lastMove.turnDuration;
                
                if (elapsed < totalDuration) {
                    // Unit is still in motion - animate from last position
                    const startX = lastMove.x * TILE_SIZE + TILE_SIZE/2;
                    const startY = lastMove.y * TILE_SIZE + TILE_SIZE/2;
                    
                    // Position at start of motion
                    unit.setPosition(startX, startY);
                    unit.setAngle(lastMove.facing);
                    
                    // Calculate remaining duration
                    const remainingDuration = Math.max(0, totalDuration - elapsed);
                    
                    // Animate remaining motion
                    this.tweens.add({
                        targets: unit,
                        x: targetX,
                        y: targetY,
                        angle: unitData.facing,
                        duration: remainingDuration,
                        ease: 'Linear',
                        onComplete: () => {
                            unit.setData('gridX', unitData.x);
                            unit.setData('gridY', unitData.y);
                            unit.setData('facing', unitData.facing);
                            if (unitData.x >= 0 && unitData.x < MAP_SIZE && 
                                unitData.y >= 0 && unitData.y < MAP_SIZE) {
                                this.map[unitData.x][unitData.y].setData('occupied', true);
                            }
                        }
                    });
                } else {
                    // Motion complete - set final position
                    unit.setPosition(targetX, targetY);
                    unit.setAngle(unitData.facing);
                    unit.setData('gridX', unitData.x);
                    unit.setData('gridY', unitData.y);
                    unit.setData('facing', unitData.facing);
                    if (unitData.x >= 0 && unitData.x < MAP_SIZE && 
                        unitData.y >= 0 && unitData.y < MAP_SIZE) {
                        this.map[unitData.x][unitData.y].setData('occupied', true);
                    }
                }
            }
            
            updatedUnits.add(id);
        });
        
        // Remove units that no longer exist
        this.units = this.units.filter(unit => {
            const id = unit.getData('id');
            if (!updatedUnits.has(id)) {
                const x = unit.getData('gridX');
                const y = unit.getData('gridY');
                if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) {
                    this.map[x][y].setData('occupied', false);
                }
                unit.destroy();
                return false;
            }
            return true;
        });
        
        // Update minimap
        if (this.minimapContext && this.minimapCanvas) {
            this.updateMinimap();
        }
        
        // If this is the first time receiving a game state or a tab refocus,
        // center the camera on player's units
        if (isRefocus || !this.lastStateUpdate) {
            this.centerCameraOnPlayerUnits();
        }
    }

    private updateGameIdText(gameId: string) {
        if (this.gameId) {
            this.gameId = gameId;
            this.updateGameIdText(gameId);
        }
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
    scene: [MainMenu, GameScene], // Include both scenes
    physics: {
        default: 'arcade',
        arcade: {
            debug: true
        }
    }
};

// Initialize Phaser
console.log('Creating Phaser game instance');
const gameContainer = document.getElementById('game-container') as HTMLElement;
if (gameContainer) {
    gameContainer.style.display = 'block'; // Show game container
}
const game = new Phaser.Game(config);

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode');

// Start the main menu
game.scene.start('MainMenu');

// Handle window resize
window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
    const gameScene = game.scene.getScene('GameScene') as GameScene;
    if (gameScene && gameScene.scene.isActive()) {
        gameScene.handleResize();
    }
}); 