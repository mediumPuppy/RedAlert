export const TILE_SIZE = 32; // Classic size from original game
export const GRID_SIZE = 20;
export const GAME_WIDTH = TILE_SIZE * GRID_SIZE; // 640px
export const GAME_HEIGHT = TILE_SIZE * GRID_SIZE; // 640px
export const COLORS = {
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
export const UNIT_STATS = {
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
