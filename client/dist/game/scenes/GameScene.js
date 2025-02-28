// client/game/scenes/GameScene.ts
import { Scene } from 'phaser';
import { TILE_SIZE, GRID_SIZE, COLORS, UNIT_STATS, GAME_WIDTH, GAME_HEIGHT, FacingDirection, TERRAIN_SPEED_MODIFIERS, MAP_SIZE, MAP_WIDTH, MAP_HEIGHT, SCROLL_SPEED } from '../constants';
export class GameScene extends Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.map = [];
        this.units = [];
        this.selectedUnit = null;
        this.resources = 1000;
        this.minimapCanvas = null;
        this.minimapContext = null;
        this.minimapContainer = null;
    }
    create() {
        this.createMap();
        this.createInitialUnits();
        this.createUI();
        this.setupInput();
        // Set up camera for large map
        this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
        this.cameras.main.setViewport(0, 0, GAME_WIDTH, GAME_HEIGHT);
        // Start camera at center of map
        this.cameras.main.scrollX = (MAP_WIDTH - GAME_WIDTH) / 2;
        this.cameras.main.scrollY = (MAP_HEIGHT - GAME_HEIGHT) / 2;
        // Set up HTML minimap
        this.setupHtmlMinimap();
        this.updateMinimap();
        // Set up cleanup when scene stops
        this.events.on('shutdown', this.cleanupMinimap, this);
    }
    setupHtmlMinimap() {
        // Get the minimap container and canvas
        this.minimapContainer = document.getElementById('minimap-container');
        this.minimapCanvas = document.getElementById('minimap-canvas');
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
                const rect = this.minimapCanvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                // Convert click position to map position
                const relativeX = x / this.minimapCanvas.width;
                const relativeY = y / this.minimapCanvas.height;
                // Calculate target camera position (center on the clicked point)
                const targetX = relativeX * MAP_WIDTH - GAME_WIDTH / 2;
                const targetY = relativeY * MAP_HEIGHT - GAME_HEIGHT / 2;
                // Bound camera position within map bounds
                this.cameras.main.scrollX = Math.max(0, Math.min(MAP_WIDTH - GAME_WIDTH, targetX));
                this.cameras.main.scrollY = Math.max(0, Math.min(MAP_HEIGHT - GAME_HEIGHT, targetY));
            });
        }
    }
    createMap() {
        for (let x = 0; x < MAP_SIZE; x++) {
            this.map[x] = [];
            for (let y = 0; y < MAP_SIZE; y++) {
                const tileType = Math.random() < 0.1 ? 'WATER' :
                    Math.random() < 0.15 ? 'ORE' : 'GRASS';
                const tile = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE, COLORS[tileType]);
                tile.setStrokeStyle(1, 0x000000);
                tile.setData('type', tileType);
                tile.setData('x', x);
                tile.setData('y', y);
                tile.setInteractive();
                this.map[x][y] = tile;
            }
        }
        this.updateMapPositions(); // Position tiles initially
    }
    createInitialUnits() {
        this.units.push(this.createUnit('TANK', 2, 2));
        this.units.push(this.createUnit('INFANTRY', 3, 3));
        this.units.push(this.createUnit('HARVESTER', 4, 4));
    }
    createUI() {
        this.resourceText = this.add.text(0, 0, `Resources: ${this.resources}`, {
            fontSize: '16px',
            color: '#ffffff'
        }).setDepth(1);
        this.updateUIPositions(); // Position UI initially
    }
    setupInput() {
        this.input.on('gameobjectdown', (pointer, gameObject) => {
            const unit = gameObject;
            if (unit.getData('type') === 'UNIT') {
                if (this.selectedUnit)
                    this.selectedUnit.setStrokeStyle(1, 0x000000);
                this.selectedUnit = unit;
                unit.setStrokeStyle(2, 0xffff00);
            }
            if (this.selectedUnit && unit !== this.selectedUnit && unit.getData('type') === 'UNIT') {
                this.attack(this.selectedUnit, unit);
            }
        });
        this.input.on('pointerdown', (pointer) => {
            // We're handling minimap clicks in HTML now, so we only need to handle regular map clicks
            if (!this.selectedUnit)
                return;
            const scaleFactor = this.getScaleFactor();
            const x = Math.floor((pointer.x / scaleFactor + this.cameras.main.scrollX) / TILE_SIZE);
            const y = Math.floor((pointer.y / scaleFactor + this.cameras.main.scrollY) / TILE_SIZE);
            if (this.isValidMove(x, y)) {
                const tile = this.map[x][y];
                if (this.selectedUnit.getData('unitType') === 'HARVESTER' && tile.getData('type') === 'ORE') {
                    this.harvest(this.selectedUnit, tile);
                }
                else {
                    this.moveUnit(this.selectedUnit, x, y);
                }
            }
        });
    }
    update() {
        this.units = this.units.filter(unit => {
            const health = unit.getData('health');
            return health !== undefined && health > 0;
        });
        // Scroll based on mouse position (inspired by SCROLL.CPP)
        const pointer = this.input.activePointer;
        const cam = this.cameras.main;
        const edgeSize = 50; // Pixels from edge to trigger scrolling
        if (pointer.isDown || pointer.active) {
            if (pointer.x < edgeSize && cam.scrollX > 0) {
                cam.scrollX -= SCROLL_SPEED;
            }
            else if (pointer.x > GAME_WIDTH - edgeSize && cam.scrollX < MAP_WIDTH - GAME_WIDTH) {
                cam.scrollX += SCROLL_SPEED;
            }
            if (pointer.y < edgeSize && cam.scrollY > 0) {
                cam.scrollY -= SCROLL_SPEED;
            }
            else if (pointer.y > GAME_HEIGHT - edgeSize && cam.scrollY < MAP_HEIGHT - GAME_HEIGHT) {
                cam.scrollY += SCROLL_SPEED;
            }
        }
        this.updateMapPositions(); // Update visible tiles
        this.updateUnitPositions(); // Update unit positions relative to camera
        this.updateMinimap(); // Update minimap each frame
    }
    getScaleFactor() {
        return this.scale.width / GAME_WIDTH;
    }
    createUnit(type, gridX, gridY) {
        const size = type === 'INFANTRY' ? TILE_SIZE / 2 : TILE_SIZE;
        const unit = this.add.rectangle(0, 0, size, size, COLORS[type]);
        // Generate a truly unique ID with type prefix and timestamp
        const uniqueId = `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        unit.setStrokeStyle(1, 0x000000);
        unit.setData('type', 'UNIT');
        unit.setData('unitType', type);
        unit.setData('health', UNIT_STATS[type].health);
        unit.setData('damage', UNIT_STATS[type].damage || 0);
        unit.setData('range', UNIT_STATS[type].range || 1);
        unit.setData('gridX', gridX);
        unit.setData('gridY', gridY);
        unit.setData('facing', FacingDirection.NORTH); // Initial facing direction
        unit.setAngle(FacingDirection.NORTH); // Explicitly set initial angle to match facing
        unit.setData('id', uniqueId); // Unique ID for multiplayer
        unit.setData('originalColor', COLORS[type]); // Store original color in data
        unit.setInteractive();
        this.units.push(unit); // Explicitly track the unit
        this.updateUnitPosition(unit); // Position unit initially
        console.log(`GameScene: Created unit ${type} with ID ${uniqueId} and color ${COLORS[type].toString(16)}`); // Debug
        return unit;
    }
    updateMapPositions() {
        const scaleFactor = this.getScaleFactor();
        const cam = this.cameras.main; // Get the main camera
        const camX = cam.scrollX; // Camera's X offset
        const camY = cam.scrollY; // Camera's Y offset
        // Only position tiles within or near the viewport for performance
        const startX = Math.max(0, Math.floor(camX / TILE_SIZE));
        const startY = Math.max(0, Math.floor(camY / TILE_SIZE));
        const endX = Math.min(MAP_SIZE, startX + GRID_SIZE + 1);
        const endY = Math.min(MAP_SIZE, startY + GRID_SIZE + 1);
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                const tile = this.map[x][y];
                tile.setPosition((x * TILE_SIZE + TILE_SIZE / 2) * scaleFactor, (y * TILE_SIZE + TILE_SIZE / 2) * scaleFactor);
                tile.setScale(scaleFactor);
            }
        }
    }
    updateUnitPositions() {
        this.units.forEach(unit => this.updateUnitPosition(unit));
    }
    updateUnitPosition(unit) {
        const scaleFactor = this.getScaleFactor();
        const gridX = unit.getData('gridX');
        const gridY = unit.getData('gridY');
        unit.setPosition((gridX * TILE_SIZE + TILE_SIZE / 2) * scaleFactor, (gridY * TILE_SIZE + TILE_SIZE / 2) * scaleFactor);
        unit.setScale(scaleFactor);
        // Apply rotation based on facing direction
        const facing = unit.getData('facing');
        if (facing !== undefined) {
            unit.setAngle(facing);
        }
    }
    updateUIPositions() {
        const scaleFactor = this.getScaleFactor();
        this.resourceText.setPosition(10 * scaleFactor, 10 * scaleFactor);
        this.resourceText.setScale(scaleFactor);
    }
    handleResize() {
        this.updateMapPositions();
        this.updateUnitPositions();
        this.updateUIPositions();
    }
    isValidMove(x, y) {
        if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE)
            return false;
        if (this.map[x][y].getData('type') === 'WATER')
            return false;
        // Check if position is occupied by another unit
        const occupied = this.units.some(unit => unit.getData('gridX') === x &&
            unit.getData('gridY') === y &&
            unit !== this.selectedUnit);
        return !occupied;
    }
    calculateFacing(currentX, currentY, targetX, targetY) {
        const angle = Phaser.Math.Angle.Between(currentX, currentY, targetX, targetY);
        const degrees = Phaser.Math.RadToDeg(angle);
        // Convert to 0-360 range
        const normalizedDegrees = (degrees + 360) % 360;
        // Map to 8 cardinal directions
        if (normalizedDegrees >= 337.5 || normalizedDegrees < 22.5) {
            return FacingDirection.EAST;
        }
        else if (normalizedDegrees >= 22.5 && normalizedDegrees < 67.5) {
            return FacingDirection.SOUTHEAST;
        }
        else if (normalizedDegrees >= 67.5 && normalizedDegrees < 112.5) {
            return FacingDirection.SOUTH;
        }
        else if (normalizedDegrees >= 112.5 && normalizedDegrees < 157.5) {
            return FacingDirection.SOUTHWEST;
        }
        else if (normalizedDegrees >= 157.5 && normalizedDegrees < 202.5) {
            return FacingDirection.WEST;
        }
        else if (normalizedDegrees >= 202.5 && normalizedDegrees < 247.5) {
            return FacingDirection.NORTHWEST;
        }
        else if (normalizedDegrees >= 247.5 && normalizedDegrees < 292.5) {
            return FacingDirection.NORTH;
        }
        else {
            return FacingDirection.NORTHEAST;
        }
    }
    moveUnit(unit, x, y) {
        const unitType = unit.getData('unitType');
        const currentX = unit.getData('gridX');
        const currentY = unit.getData('gridY');
        const originalColor = unit.getData('originalColor') || unit.fillColor;
        console.log(`moveUnit: Unit ${unit.getData('id')} (${unitType}) color before move: ${originalColor.toString(16)}`); // Debug
        const targetTile = this.map[x][y];
        const terrainType = targetTile.getData('type');
        const terrainModifier = TERRAIN_SPEED_MODIFIERS[terrainType];
        const baseSpeed = UNIT_STATS[unitType].speed;
        const turnSpeed = UNIT_STATS[unitType].turnSpeed || 180;
        // Calculate distance and duration
        const distance = Phaser.Math.Distance.Between(currentX, currentY, x, y) * TILE_SIZE;
        let duration = (distance / (baseSpeed * terrainModifier)) * 1000; // Convert to ms
        // Ensure minimum duration to prevent teleporting
        const MIN_DURATION = 250; // ms
        if (duration < MIN_DURATION) {
            duration = MIN_DURATION;
            console.log(`moveUnit: Adjusted duration to minimum ${MIN_DURATION}ms for unit ${unit.getData('id')}`);
        }
        // Calculate new facing direction
        const targetFacing = this.calculateFacing(currentX, currentY, x, y);
        const currentFacing = unit.getData('facing');
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
            const alreadyOccupied = this.units.some(u => u !== unit && u.getData('gridX') === x && u.getData('gridY') === y);
            if (!alreadyOccupied) {
                this.map[x][y].setData('occupied', true);
            }
        }
        // Emit move event for multiplayer
        if (typeof socket !== 'undefined') {
            socket.emit('moveUnit', {
                id: unit.getData('id'),
                x: x,
                y: y,
                facing: targetFacing,
                duration: duration,
                turnDuration: turnDuration
            });
        }
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
        }
        else {
            // Infantry turns instantly
            unit.setAngle(targetFacing);
            unit.setData('facing', targetFacing);
            unit.setFillStyle(originalColor); // Ensure color is correct before move
            this.performMove(unit, x, y, duration);
        }
    }
    performMove(unit, x, y, duration) {
        const scaleFactor = this.getScaleFactor();
        const targetX = (x * TILE_SIZE + TILE_SIZE / 2) * scaleFactor;
        const targetY = (y * TILE_SIZE + TILE_SIZE / 2) * scaleFactor;
        // Get the original color from data or use current fillColor as fallback
        const originalColor = unit.getData('originalColor') || unit.fillColor;
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
            },
            onComplete: () => {
                unit.setData('gridX', x);
                unit.setData('gridY', y);
                unit.setFillStyle(originalColor); // Restore original color
            }
        });
    }
    attack(attacker, target) {
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
            // Visual feedback - get stored original color
            const originalColor = target.getData('originalColor') || target.fillColor;
            console.log(`Attack: Target ${target.getData('id')} (${target.getData('unitType')}) original color: ${originalColor.toString(16)}`); // Debug
            // Flash red for attack
            target.setFillStyle(0xff0000);
            this.time.delayedCall(100, () => {
                target.setFillStyle(originalColor);
                console.log(`Attack: Restored target color to: ${originalColor.toString(16)}`); // Debug
            });
            // Face the target when attacking
            const targetFacing = this.calculateFacing(attackerX, attackerY, targetX, targetY);
            attacker.setAngle(targetFacing);
            attacker.setData('facing', targetFacing);
        }
    }
    harvest(harvester, oreTile) {
        const harvestAmount = 50;
        this.resources += harvestAmount;
        this.resourceText.setText(`Resources: ${this.resources}`);
        // Visual feedback
        const originalColor = oreTile.fillColor;
        oreTile.setFillStyle(0xffffff);
        this.time.delayedCall(200, () => oreTile.setFillStyle(originalColor));
    }
    updateMinimap() {
        if (!this.minimapContext || !this.minimapCanvas)
            return;
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
                const tile = this.map[x][y];
                const tileType = tile.getData('type');
                ctx.fillStyle = '#' + COLORS[tileType].toString(16).padStart(6, '0');
                ctx.globalAlpha = 0.7;
                ctx.fillRect(x * scale, y * scale, scale, scale);
            }
        }
        // Draw units
        ctx.globalAlpha = 1.0;
        this.units.forEach(unit => {
            const unitType = unit.getData('unitType');
            const gridX = unit.getData('gridX');
            const gridY = unit.getData('gridY');
            ctx.fillStyle = '#' + COLORS[unitType].toString(16).padStart(6, '0');
            // Make units slightly larger on minimap for better visibility
            const unitSize = scale * 1.5;
            ctx.fillRect(gridX * scale - unitSize / 4, gridY * scale - unitSize / 4, unitSize, unitSize);
        });
        // Draw viewport rectangle
        const cam = this.cameras.main;
        const viewX = cam.scrollX / TILE_SIZE * scale;
        const viewY = cam.scrollY / TILE_SIZE * scale;
        const viewWidth = GRID_SIZE * scale;
        const viewHeight = GRID_SIZE * scale;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(viewX, viewY, viewWidth, viewHeight);
    }
    // Method to clean up minimap when scene is stopped
    cleanupMinimap() {
        // Hide the minimap container when leaving the scene
        if (this.minimapContainer) {
            this.minimapContainer.style.display = 'none';
        }
        // Clean up event listeners
        if (this.minimapCanvas) {
            // Clean up would be better with a named function reference
            // But for now we'll just remove all
            this.minimapCanvas.removeEventListener('click', () => { });
        }
    }
}
