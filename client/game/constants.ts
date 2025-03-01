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
export type BuildingType = 'POWER_PLANT' | 'REFINERY' | 'BARRACKS' | 'WAR_FACTORY' | 'RADAR';
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
    POWER_PLANT: 0xffff99,
    REFINERY: 0x808080,
    BARRACKS: 0x8b4513,
    WAR_FACTORY: 0x4682b4,
    RADAR: 0x9932cc,
    EXPLOSION: 0xffa500
};

interface UnitStats {
    health: number;
    damage?: number;
    range?: number;
    speed: number;
    capacity?: number;
    turnSpeed?: number; // Degrees per second for vehicles
    cost: number; // Resource cost to produce
    power: number; // Power consumption
    buildTime: number; // Time in ms to build
}

interface BuildingStats {
    health: number;
    cost: number;
    powerProvided?: number; // Power generation (positive)
    powerRequired: number; // Power consumption (negative)
    buildTime: number;
    produces?: UnitType[]; // Units this building can produce
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
    TANK: {
        health: 100,
        damage: 20,
        range: 3,
        speed: 100, // Faster than infantry
        turnSpeed: 90, // 90 degrees/sec (vehicles turn slower)
        cost: 700,
        power: 10,
        buildTime: 10000
    },
    INFANTRY: {
        health: 50,
        damage: 10,
        range: 2,
        speed: 80, // Slower than tank
        turnSpeed: 180, // Faster turning (infantry pivots quickly)
        cost: 100,
        power: 5,
        buildTime: 5000
    },
    HARVESTER: {
        health: 75,
        speed: 60,
        capacity: 100,
        turnSpeed: 60, // Slower turning than tank
        cost: 1400,
        power: 15,
        buildTime: 15000
    }
};

export const BUILDING_STATS: Record<BuildingType, BuildingStats> = {
    POWER_PLANT: {
        health: 200,
        cost: 300,
        powerProvided: 100,
        powerRequired: 0,
        buildTime: 8000
    },
    REFINERY: {
        health: 300,
        cost: 2000,
        powerRequired: 30,
        buildTime: 15000
    },
    BARRACKS: {
        health: 400,
        cost: 500,
        powerRequired: 20,
        buildTime: 10000,
        produces: ['INFANTRY']
    },
    WAR_FACTORY: {
        health: 500,
        cost: 2000,
        powerRequired: 30,
        buildTime: 20000,
        produces: ['TANK', 'HARVESTER']
    },
    RADAR: {
        health: 200,
        cost: 1000,
        powerRequired: 40,
        buildTime: 12000
    }
};

// Terrain speed modifiers (multiplier to base speed)
export const TERRAIN_SPEED_MODIFIERS: Record<TileType, number> = {
    GRASS: 1.0,  // Normal speed
    WATER: 0.0,  // Impassable (handled in isValidMove)
    ORE: 0.7     // Slower on ore
};

// Resource constants
export const ORE_PER_TILE = 500; // Initial ore amount per tile
export const ORE_HARVEST_RATE = 50; // Amount harvested per action 