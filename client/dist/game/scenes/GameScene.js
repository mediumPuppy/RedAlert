// client/game/scenes/GameScene.ts
import { Scene } from 'phaser';
import { TILE_SIZE, GRID_SIZE, COLORS, UNIT_STATS, GAME_WIDTH, FacingDirection, TERRAIN_SPEED_MODIFIERS } from '../constants';
export class GameScene extends Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.map = [];
        this.units = [];
        this.selectedUnit = null;
        this.resources = 1000;
    }
    create() {
        this.createMap();
        this.createInitialUnits();
        this.createUI();
        this.setupInput();
    }
    createMap() {
        for (let x = 0; x < GRID_SIZE; x++) {
            this.map[x] = [];
            for (let y = 0; y < GRID_SIZE; y++) {
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
            if (!this.selectedUnit)
                return;
            const scaleFactor = this.getScaleFactor();
            const x = Math.floor((pointer.x / scaleFactor) / TILE_SIZE);
            const y = Math.floor((pointer.y / scaleFactor) / TILE_SIZE);
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
    }
    getScaleFactor() {
        return this.scale.width / GAME_WIDTH;
    }
    createUnit(type, gridX, gridY) {
        const size = type === 'INFANTRY' ? TILE_SIZE / 2 : TILE_SIZE;
        const unit = this.add.rectangle(0, 0, size, size, COLORS[type]);
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
        unit.setData('id', Date.now().toString()); // Unique ID for multiplayer
        unit.setInteractive();
        this.units.push(unit); // Explicitly track the unit
        this.updateUnitPosition(unit); // Position unit initially
        console.log(`Created unit ${type} with ID ${unit.getData('id')} and color ${COLORS[type].toString(16)}`); // Debug
        return unit;
    }
    updateMapPositions() {
        const scaleFactor = this.getScaleFactor();
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
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
        if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE)
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
        const originalColor = unit.fillColor;
        console.log(`moveUnit: Unit ${unit.getData('id')} (${unitType}) color before move: ${originalColor.toString(16)}`); // Debug
        const targetTile = this.map[x][y];
        const terrainType = targetTile.getData('type');
        const terrainModifier = TERRAIN_SPEED_MODIFIERS[terrainType];
        const baseSpeed = UNIT_STATS[unitType].speed;
        const turnSpeed = UNIT_STATS[unitType].turnSpeed || 180;
        // Calculate distance and duration
        const distance = Phaser.Math.Distance.Between(currentX, currentY, x, y) * TILE_SIZE;
        const duration = (distance / (baseSpeed * terrainModifier)) * 1000; // Convert to ms
        // Calculate new facing direction
        const targetFacing = this.calculateFacing(currentX, currentY, x, y);
        const currentFacing = unit.getData('facing');
        // Calculate turn duration (if needed)
        const angleDiff = Phaser.Math.Angle.ShortestBetween(currentFacing, targetFacing);
        const turnDuration = Math.abs(angleDiff) / turnSpeed * 1000;
        // Only unset occupied if current position is valid
        if (currentX >= 0 && currentX < GRID_SIZE && currentY >= 0 && currentY < GRID_SIZE) {
            this.map[currentX][currentY].setData('occupied', false);
        }
        // Only set occupied if target is valid and not already occupied by another unit
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
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
                    this.performMove(unit, x, y, duration);
                }
            });
        }
        else {
            // Infantry turns instantly
            unit.setAngle(targetFacing);
            unit.setData('facing', targetFacing);
            this.performMove(unit, x, y, duration);
        }
    }
    performMove(unit, x, y, duration) {
        const scaleFactor = this.getScaleFactor();
        const targetX = (x * TILE_SIZE + TILE_SIZE / 2) * scaleFactor;
        const targetY = (y * TILE_SIZE + TILE_SIZE / 2) * scaleFactor;
        const originalColor = unit.fillColor; // Store original color
        this.tweens.add({
            targets: unit,
            x: targetX,
            y: targetY,
            duration: duration,
            ease: 'Linear', // Linear for constant speed movement
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
            // Visual feedback
            const originalColor = target.fillColor;
            console.log(`Attack: Target original color: ${originalColor.toString(16)}`); // Debug
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
}
