import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Game, FixedClock, config, pipeCollision, scoreDelta, xorshift32, type GameOptions, type GameState } from '../../shared/core-ts';
import cases from '../../shared/fixtures/gameplay-cases.json';
import replay from '../../shared/fixtures/replay-baseline.json';
import lifecycle from '../../shared/fixtures/lifecycle-cases.json';

const root = resolve(import.meta.dir, '../..');
const output = resolve(root, 'godot/.checks/csharp-corpus.json');
const process = Bun.spawn(['dotnet', 'run', '--project', resolve(root, 'shared/contract-csharp'), '--', root, output], {
  cwd: root, stdout: 'inherit', stderr: 'inherit', env: { ...Bun.env,
    DOTNET_CLI_HOME: resolve(root, 'godot/.dotnet'), NUGET_PACKAGES: resolve(root, 'godot/.packages'),
    DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' },
});
assert.equal(await process.exited, 0, 'C# verifier must execute');
const actual = await Bun.file(output).json();
type Trace = ReturnType<typeof run>;
function run(game: Game, ticks: number, flapTicks: readonly number[], fps?: number) {
  const flaps = new Set(flapTicks);
  const snapshots = [game.snapshot()];
  const events: { tick: number; events: ReturnType<Game['step']> }[] = [];
  const ignoredFlapTicks: number[] = [];
  const step = () => {
    const flap = flaps.has(game.tick + 1);
    if (flap && (game.state === 'dying' || game.state === 'gameOver')) ignoredFlapTicks.push(game.tick + 1);
    const tick = game.tick + 1;
    events.push({ tick, events: game.step(flap) });
    snapshots.push(game.snapshot());
  };
  if (fps) {
    const clock = new FixedClock();
    for (let f = 0; f < ticks * fps / config.simulation.tickRate; f++) clock.frame(1000 / fps, step);
  } else for (let tick = 0; tick < ticks; tick++) step();
  return { snapshots, events, ignoredFlapTicks };
}
const runs: Record<string, Trace> = {};
let assertions = 0;
function match(actual: Record<string, any>, expected: object) {
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(actual[key], value, key); assertions++;
  }
}
function verifyFixture(trace: Trace, item: { snapshots: object[]; expected: object }) {
  for (const snapshot of item.snapshots as { tick: number }[]) match(trace.snapshots[snapshot.tick], snapshot);
  const final = trace.snapshots.at(-1)!;
  match({ ...final, finalScore: final.score, ignoredFlapTicks: trace.ignoredFlapTicks,
    scoreTicks: trace.events.filter(e => e.events.some(v => v.type === 'scored')).map(e => e.tick) }, item.expected);
}
[cases.trajectory, ...cases.stepCases, cases.recycle].forEach((item, i) => {
  runs[`case${i}`] = run(new Game(config, item as GameOptions), Math.max(...item.snapshots.map(s => s.tick)), item.flapTicks);
  verifyFixture(runs[`case${i}`], item);
});
for (const fps of replay.renderFps) {
  runs[`fps${fps}`] = run(new Game(config, { initial: { seed: replay.seed, bestScore: replay.initialBestScore },
    pipeGapCenters: replay.pipeGapCenters }), replay.totalTicks, replay.flapTicks, fps);
  verifyFixture(runs[`fps${fps}`], replay);
}
const collisionQueries = cases.collisionQueries.map(q => pipeCollision(config, q.birdY, q.pipeX, q.gapCenterY, q.hitboxOffset) !== null);
const scoreQueries = cases.scoreQueries.map(q => scoreDelta(config, q.state as GameState, q.pipeX, q.passed, q.collided, q.hitboxOffsetX));
assert.deepEqual(collisionQueries, cases.collisionQueries.map(q => q.expected));
assert.deepEqual(scoreQueries, cases.scoreQueries.map(q => q.expectedDelta));
let seed = cases.random.seed;
const random = cases.random.uint32Sequence.map(() => seed = xorshift32(seed));
assert.deepEqual(random, cases.random.uint32Sequence);
assert.deepEqual(random.map(n => config.pipes.gapCenterMin + n % (config.pipes.gapCenterMax - config.pipes.gapCenterMin + 1)), cases.random.gapCenters);
assert.throws(() => xorshift32(0));
const model = new Game(config, { initial: lifecycle.initial as GameOptions['initial'], pipes: [] });
const clock = new FixedClock();
const lifecycleResults = lifecycle.steps.map(action => {
  if (action.event === 'blur') clock.pause();
  if (action.event === 'resume') clock.resume();
  const processedTicks = action.elapsedMilliseconds === undefined ? 0 : clock.frame(action.elapsedMilliseconds, () => model.step());
  const row = { snapshot: model.snapshot(), processedTicks, accumulatedTicks: clock.accumulatedTicks, paused: clock.paused };
  match({ ...row.snapshot, ...row }, action.expected);
  return row;
});
const restart = new Game(config, { initial: cases.restart.initial as GameOptions['initial'] });
const accepted = cases.restart.actions.map(a => {
  while (restart.tick < a.tick) restart.step();
  const ok = restart.restart(); assert.equal(ok, a.expectedAccepted); return ok;
});
const snapshot = restart.snapshot(); match(snapshot, cases.restart.expected);
const rounds = Array.from({ length: 10 }, () => {
  restart.step(true); while (!restart.canRestart) restart.step(); assert.equal(restart.restart(), true);
  assert.equal(restart.pipes.length, 7); assert.equal(restart.bestScore, 5); return restart.snapshot();
});
const steady = new Game();
for (let tick = 1; tick <= 210; tick++) steady.step((tick - 1) % 24 === 0);
assert.equal(steady.state, 'playing'); assert.equal(steady.score, 2);
const expected = { runs, collisionQueries, scoreQueries, random, zeroRejected: true, lifecycle: lifecycleResults,
  restart: { accepted, snapshot, rounds }, steady: steady.snapshot() };
// 比较完整字段和所有 tick 事件，避免只校验位置的公式掩盖状态或队列偏差。
assert.deepEqual(actual, expected);
const traceTicks = Object.values(runs).reduce((n, trace) => n + trace.snapshots.length, 0);
const report = { success: true, fixtureAssertions: assertions, fullSnapshots: traceTicks,
  renderFps: replay.renderFps, configSha256: new Bun.CryptoHasher('sha256').update(await Bun.file(resolve(root, 'shared/config/gameplay.json')).arrayBuffer()).digest('hex') };
await Bun.write(resolve(root, 'docs/baselines/godot/core-check.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`TS/C# identical: ${traceTicks} full snapshots + events; ${assertions} fixture fields; 10 restarts`);
