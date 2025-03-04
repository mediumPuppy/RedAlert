export const TILE_SIZE = 32; // Classic size from original game
export const GRID_SIZE = 20;
export const GAME_WIDTH = TILE_SIZE * GRID_SIZE; // 640px
export const GAME_HEIGHT = TILE_SIZE * GRID_SIZE; // 640px

export const MAP_SIZE = 128; // Total map size (much larger)
export const MAP_WIDTH = TILE_SIZE * MAP_SIZE; // 4096px (full map width) 
export const MAP_HEIGHT = TILE_SIZE * MAP_SIZE; // 4096px (full map height)

// Add scroll speed (inspired by SCROLL.CPP's ScrollRate)
export const SCROLL_SPEED = 5; // Pixels per frame when scrolling

// Multiplayer parameters
export const MAX_PLAYERS_PER_GAME = 6; // Max 6 players per game, per Red Alert
export const MATCHMAKING_TIMEOUT = 10000; // 10s to find a game
export const COMMAND_RATE_LIMIT = 100; // 100ms between commands
export const TEAMS = {
    ALLIES: 'ALLIES',
    SOVIETS: 'SOVIETS'
} as const;
export type TeamType = typeof TEAMS[keyof typeof TEAMS];

export type TileType = 'GRASS' | 'WATER' | 'ORE';
export type UnitType = 'TANK' | 'INFANTRY' | 'HARVESTER';
export type BuildingType = 'BASE' | 'BARRACKS';
export type ColorType = TileType | UnitType | BuildingType | 'EXPLOSION';

// Add 8 cardinal directions (in degrees)
export enum FacingDirection {
    NORTH = 0,
    NORTHEAST = 45,
    EAST = 90,
    SOUTHEAST = 135,
    SOUTH = 180,
    SOUTHWEST = 225,
    WEST = 270,
    NORTHWEST = 315
}

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
    turnSpeed?: number; // Degrees per second for vehicles
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
    TANK: {
        health: 100,
        damage: 20,
        range: 3,
        speed: 100, // Faster than infantry
        turnSpeed: 90 // 90 degrees/sec (vehicles turn slower)
    },
    INFANTRY: {
        health: 50,
        damage: 10,
        range: 2,
        speed: 80, // Slower than tank
        turnSpeed: 180 // Faster turning (infantry pivots quickly)
    },
    HARVESTER: {
        health: 75,
        speed: 60,
        capacity: 100,
        turnSpeed: 60 // Slower turning than tank
    }
};

// Terrain speed modifiers (multiplier to base speed)
export const TERRAIN_SPEED_MODIFIERS: Record<TileType, number> = {
    GRASS: 1.0,  // Normal speed
    WATER: 0.0,  // Impassable (handled in isValidMove)
    ORE: 0.7     // Slower on ore
}; 