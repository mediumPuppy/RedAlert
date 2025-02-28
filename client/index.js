const socket = io();

class MainMenu extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  preload() {
    this.load.audio('bgm', 'assets/bgm.mp3');
  }

  create() {
    this.add.text(400, 200, 'Red Alert Reborn', {
      fontSize: '48px',
      color: '#fff',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    const playButton = this.add.text(400, 300, 'Play', {
      fontSize: '32px',
      color: '#0f0',
      backgroundColor: '#333',
      padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setInteractive();

    playButton.on('pointerdown', () => {
      this.scene.start('GameScene');
    });

    this.soundOn = true;
    const soundButton = this.add.text(400, 400, 'Sound: On', {
      fontSize: '32px',
      color: '#0f0',
      backgroundColor: '#333',
      padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setInteractive();

    this.bgm = this.sound.add('bgm', { loop: true });
    this.bgm.play();

    soundButton.on('pointerdown', () => {
      this.soundOn = !this.soundOn;
      soundButton.setText(`Sound: ${this.soundOn ? 'On' : 'Off'}`);
      this.bgm.setMute(!this.soundOn);
    });
  }
}

class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    // Placeholder assets (replace with AI-generated ones later)
    this.load.image('grass', 'assets/grass.png'); // 40x40 tile
    this.load.image('ore', 'assets/ore.png');     // 40x40 tile
    this.load.image('tank', 'assets/tank.png');   // 32x32 sprite
  }

  create() {
    // Grid Map (20x20 tiles, 40px each, inspired by MAP.CPP)
    this.map = [];
    for (let y = 0; y < 20; y++) {
      this.map[y] = [];
      for (let x = 0; x < 20; x++) {
        this.map[y][x] = this.add.sprite(x * 40, y * 40, 'grass').setOrigin(0);
      }
    }

    // Resources (ore patches, inspired by MONEY.CPP)
    this.ore = this.add.sprite(200, 200, 'ore').setOrigin(0);
    this.playerOre = 0;
    this.oreText = this.add.text(10, 10, 'Ore: 0', { fontSize: '20px', color: '#fff' });

    // Units (tank with click-to-move, inspired by UNIT.CPP, DRIVE.CPP)
    this.tank = this.add.sprite(100, 100, 'tank').setInteractive();
    this.tank.health = 100;
    this.tank.id = 'tank1';

    this.input.on('pointerdown', (pointer) => {
      const { worldX, worldY } = pointer;
      socket.emit('moveUnit', { id: this.tank.id, x: worldX, y: worldY });
    });

    socket.on('unitMoved', (data) => {
      if (data.id === this.tank.id) {
        this.tweens.add({
          targets: this.tank,
          x: data.x,
          y: data.y,
          duration: 500
        });
      }
    });

    // Combat (basic attack logic, inspired by COMBAT.CPP)
    this.enemy = this.add.rectangle(300, 300, 32, 32, 0xff0000).setInteractive();
    this.enemy.health = 50;

    this.tank.on('pointerdown', () => {
      if (Phaser.Math.Distance.Between(this.tank.x, this.tank.y, this.enemy.x, this.enemy.y) < 100) {
        this.enemy.health -= 10;
        if (this.enemy.health <= 0) this.enemy.destroy();
      }
    });

    // Harvester (click ore to collect, inspired by MONEY.CPP)
    this.ore.setInteractive();
    this.ore.on('pointerdown', () => {
      this.playerOre += 50;
      this.oreText.setText(`Ore: ${this.playerOre}`);
    });
  }

  update() {
    // Game loop (add more logic later)
  }
}

const config = {
  type: Phaser.WEBGL,
  width: 800,
  height: 600,
  scene: [MainMenu, GameScene],
  parent: 'game-container'
};

const game = new Phaser.Game(config);