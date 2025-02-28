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
}; 