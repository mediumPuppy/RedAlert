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
}