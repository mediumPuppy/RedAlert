const socket = io();
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scene: { create }
};
const game = new Phaser.Game(config);

function create() {
  this.add.text(100, 100, 'Red Alert Game');
  socket.on('unitMoved', (data) => console.log(`Unit ${data.id} at (${data.x}, ${data.y})`));
  this.input.on('pointerdown', () => socket.emit('moveUnit', { id: 'tank1', x: 200, y: 200 }));
}