import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { config, Game } from '../../shared/core-ts';
import replay from '../../shared/fixtures/replay-baseline.json';
import sprites from '../../shared/assets/runtime/sprites.json';

const report = await Bun.file(Bun.argv[2]).json();
assert.equal(report.success, true);
const game = new Game(config, { initial: { seed: replay.seed, bestScore: replay.initialBestScore }, pipeGapCenters: replay.pipeGapCenters });
const flaps = new Set(replay.flapTicks);
assert.equal(report.snapshots.length, replay.totalTicks + 1);
for (let tick = 0; tick <= replay.totalTicks; tick++) {
  if (tick) game.step(flaps.has(tick));
  assert.deepEqual(report.snapshots[tick], game.snapshot(), `Godot/TS snapshot ${tick}`);
  const animationTick = game.state === 'ready' ? game.tick : Math.max(0, game.flightTicks - 1);
  assert.equal(report.birdFrames[tick], Math.floor(animationTick / sprites.animations['bird.flap'].ticksPerFrame) % 4);
}
const view = report.diagnostics.view;
assert.equal(view.spriteCount, 35);
assert.equal(view.textureCount, 9);
const byName = Object.fromEntries(view.sprites.map((s: any) => [s.name, s]));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) <= config.simulation.positionTolerance, `${a} != ${b}`);
for (const sprite of view.sprites) assert.equal(sprite.nearest, true);
for (let id = 0; id < config.pipes.activeCount; id++) {
  const [upperBody, upperHead, lowerHead, lowerBody] = [0, 1, 2, 3].map(part => byName[`Pipe${id}Part${part}`]);
  near(upperBody.y + upperBody.height / 2, upperHead.y - upperHead.height / 2);
  near(lowerHead.y + lowerHead.height / 2, lowerBody.y - lowerBody.height / 2);
  near(lowerBody.y + lowerBody.height / 2, config.ground.topY);
  near(lowerHead.y - lowerHead.height / 2 - (upperHead.y + upperHead.height / 2), config.pipes.gapHeight);
}
for (const layer of ['Sky', 'Land']) for (let i = 0; i < 2; i++) {
  const a = byName[`${layer}${i}`], b = byName[`${layer}${i + 1}`];
  near(a.x + a.width / 2, b.x - b.width / 2);
}
const output = Bun.argv[3] ?? resolve(import.meta.dir, '../../docs/baselines/godot/native-check.json');
await Bun.write(output, JSON.stringify({ ...report, comparedWithTs: true, checkedPipeSeams: 7, checkedTileSeams: 4 }, null, 2) + '\n');
console.log('Godot/TS: all 211 snapshots and bird frames match; pipe and tile seams verified');
