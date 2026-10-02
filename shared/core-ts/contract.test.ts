import { expect, test } from 'bun:test';
import cases from '../fixtures/gameplay-cases.json';
import replay from '../fixtures/replay-baseline.json';
import lifecycle from '../fixtures/lifecycle-cases.json';
import { config, FixedClock, Game, pipeCollision, scoreDelta, xorshift32, type GameOptions, type GameState } from './index';

function match(actual: object, expected: object) {
  const fields = Object.fromEntries(Object.entries(actual));
  for (const [key, value] of Object.entries(expected)) {
    expect(key in fields).toBe(true);
    if (typeof value === 'number') expect(Math.abs(fields[key] - value)).toBeLessThanOrEqual(config.simulation.positionTolerance);
    else expect(fields[key]).toEqual(value);
  }
}

function run(game: Game, ticks: number, flapTicks: readonly number[]) {
  const flaps = new Set(flapTicks);
  const scoreTicks: number[] = [];
  const ignoredFlapTicks: number[] = [];
  const snapshots = [game.snapshot()];
  const step = () => {
    const flap = flaps.has(game.tick + 1);
    if (flap && (game.state === 'dying' || game.state === 'gameOver')) ignoredFlapTicks.push(game.tick + 1);
    for (const event of game.step(flap)) if (event.type === 'scored') scoreTicks.push(game.tick);
    snapshots.push(game.snapshot());
  };
  for (let i = 0; i < ticks; i++) step();
  return { snapshots, result: { ...game.snapshot(), finalScore: game.score, scoreTicks, ignoredFlapTicks } };
}

test('M1 trajectories, collision priority, offsets, score boundaries and seven-pipe recycling', () => {
  for (const item of [cases.trajectory, ...cases.stepCases, cases.recycle]) {
    const game = new Game(config, item as GameOptions);
    const result = run(game, Math.max(...item.snapshots.map(s => s.tick)), item.flapTicks);
    for (const expected of item.snapshots) match(result.snapshots[expected.tick], expected);
    match(result.result, item.expected);
  }
  for (const q of cases.collisionQueries) {
    expect(pipeCollision(config, q.birdY, q.pipeX, q.gapCenterY, q.hitboxOffset) !== null).toBe(q.expected);
  }
  for (const q of cases.scoreQueries) {
    expect(scoreDelta(config, q.state as GameState, q.pipeX, q.passed, q.collided, q.hitboxOffsetX)).toBe(q.expectedDelta);
  }
  let seed = cases.random.seed;
  for (let i = 0; i < cases.random.uint32Sequence.length; i++) {
    seed = xorshift32(seed);
    expect(seed).toBe(cases.random.uint32Sequence[i]);
    expect(config.pipes.gapCenterMin + seed % (config.pipes.gapCenterMax - config.pipes.gapCenterMin + 1)).toBe(cases.random.gapCenters[i]);
  }
  expect(() => xorshift32(0)).toThrow('nonzero uint32');
});

test('same baseline at 30, 60 and 120 render FPS, including all snapshots and events', () => {
  for (const fps of replay.renderFps) {
    const game = new Game(config, { initial: { bestScore: replay.initialBestScore, seed: replay.seed }, pipeGapCenters: replay.pipeGapCenters });
    const clock = new FixedClock();
    const flaps = new Set(replay.flapTicks);
    const snapshots = [game.snapshot()];
    const scoreTicks: number[] = [];
    const ignoredFlapTicks: number[] = [];
    for (let frame = 0; frame < replay.totalTicks * fps / config.simulation.tickRate; frame++) {
      clock.frame(1000 / fps, () => {
        const flap = flaps.has(game.tick + 1);
        if (flap && (game.state === 'dying' || game.state === 'gameOver')) ignoredFlapTicks.push(game.tick + 1);
        for (const event of game.step(flap)) if (event.type === 'scored') scoreTicks.push(game.tick);
        snapshots.push(game.snapshot());
      });
    }
    expect(game.tick).toBe(replay.totalTicks);
    for (const expected of replay.snapshots) match(snapshots[expected.tick], expected);
    match({ ...game.snapshot(), finalScore: game.score, scoreTicks, ignoredFlapTicks }, replay.expected);
  }
});

test('pause, focus, explicit resume and bounded catch-up execute lifecycle fixture', () => {
  const game = new Game(config, { initial: lifecycle.initial as GameOptions['initial'], pipes: [] });
  const clock = new FixedClock();
  for (const action of lifecycle.steps) {
    let processedTicks = 0;
    if (action.event === 'blur') clock.pause();
    if (action.event === 'resume') clock.resume();
    if (action.elapsedMilliseconds !== undefined) processedTicks = clock.frame(action.elapsedMilliseconds, () => game.step());
    match({ ...game.snapshot(), processedTicks, accumulatedTicks: clock.accumulatedTicks, paused: clock.paused }, action.expected);
  }
});

test('restart protection preserves best score and ten new rounds stay at seven pipes', () => {
  const game = new Game(config, { initial: cases.restart.initial as GameOptions['initial'] });
  for (const action of cases.restart.actions) {
    while (game.tick < action.tick) game.step();
    expect(game.restart()).toBe(action.expectedAccepted);
  }
  match(game.snapshot(), cases.restart.expected);
  for (let round = 0; round < 10; round++) {
    game.step(true);
    while (!game.canRestart) game.step();
    expect(game.restart()).toBe(true);
    expect(game.state).toBe('ready');
    expect(game.score).toBe(0);
    expect(game.bestScore).toBe(5);
    expect(game.pipes.length).toBe(7);
    expect(game.consumedGapCenters).toBe(7);
  }
});
