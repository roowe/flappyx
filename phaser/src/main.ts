import Phaser from 'phaser';
import { config } from '../../shared/core-ts';
import { FlightScene } from './scene';
import '../../shared/web-ts/style.css';

const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: config.canvas.width, height: config.canvas.height,
  backgroundColor: config.render.clearColor,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // pixelArt=true forces rounding in Phaser; nearest sampling is selected by antialias=false.
  render: { pixelArt: false, antialias: false, antialiasGL: false, roundPixels: config.render.roundPixels },
  audio: { noAudio: true }, scene: [FlightScene],
});

if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
