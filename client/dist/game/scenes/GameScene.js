// client/game/scenes/GameScene.ts
import { Scene } from 'phaser';
import { TILE_SIZE, GRID_SIZE, COLORS, UNIT_STATS } from '../constants';
export class GameScene extends Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.map = [];
        this.units = [];
        this.selectedUnit = null;
        this.resources = 1000;
    }
    create() {
        // Create 20x20 grid map
        for (let x = 0; x < GRID_SIZE; x++) {
            this.map[x] = [];
            for (let y = 0; y < GRID_SIZE; y++) {
                const tileType = Math.random() < 0.1 ? 'WATER' :
                    Math.random() < 0.15 ? 'ORE' : 'GRASS';
                const tile = this.add.rectangle(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, COLORS[tileType]);
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
        // Resource display
        this.resourceText = this.add.text(10, 10, `Resources: ${this.resources}`, {
            fontSize: '16px',
            color: '#ffffff'
        }).setDepth(1); // Ensure visibility
        // Handle unit selection
        this.input.on('gameobjectdown', (pointer, gameObject) => {
            const unit = gameObject;
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
        this.input.on('pointerdown', (pointer) => {
            if (!this.selectedUnit)
                return;
            const x = Math.floor(pointer.x / TILE_SIZE);
            const y = Math.floor(pointer.y / TILE_SIZE);
            if (this.isValidMove(x, y)) {
                const tile = this.map[x][y];
                // Handle harvesting
                if (this.selectedUnit.getData('unitType') === 'HARVESTER' &&
                    tile.getData('type') === 'ORE') {
                    this.harvest(this.selectedUnit, tile);
                }
                else {
                    this.moveUnit(this.selectedUnit, x, y);
                }
            }
        });
    }
    update() {
        // Update game state if needed
        this.units = this.units.filter(unit => unit.getData('health') > 0);
    }
    createUnit(type, gridX, gridY) {
        const size = type === 'INFANTRY' ? TILE_SIZE / 2 : TILE_SIZE;
        const unit = this.add.rectangle(gridX * TILE_SIZE + TILE_SIZE / 2, gridY * TILE_SIZE + TILE_SIZE / 2, size, size, COLORS[type]);
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
    moveUnit(unit, x, y) {
        const unitType = unit.getData('unitType');
        const speed = UNIT_STATS[unitType].speed;
        this.tweens.add({
            targets: unit,
            x: x * TILE_SIZE + TILE_SIZE / 2,
            y: y * TILE_SIZE + TILE_SIZE / 2,
            duration: speed * 10,
            ease: 'Linear',
            onComplete: () => {
                unit.setData('gridX', x);
                unit.setData('gridY', y);
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
            target.setFillStyle(0xff0000);
            this.time.delayedCall(100, () => target.setFillStyle(originalColor));
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
