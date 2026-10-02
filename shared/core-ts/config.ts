import gameplay from '../config/gameplay.json';

export type GameplayConfig = typeof gameplay;
export const config: GameplayConfig = gameplay;

const supportedRules = {
  firstFlapStartsAndFlaps: true, flapResetsVelocity: true, maxFlapsPerTick: 1,
  movementOrder: 'positionThenGravity', collisionBeforeScore: true,
  collisionPriority: ['ground', 'ceiling', 'upperPipe', 'lowerPipe'],
  pipeCollisionShape: 'axisAlignedHitbox', pipeTouchIsCollision: true,
  floorAndCeilingShape: 'unrotatedDisplayBounds',
  scoreWhen: 'pipeRightStrictlyLessThanHitboxLeft',
  recycleWhen: 'pipeRightStrictlyLessThanZero', restartTarget: 'ready',
  restartInputFlaps: false, restartResetsTick: true,
};

export function validateConfig(c: GameplayConfig) {
  for (const [key, value] of Object.entries(supportedRules)) {
    if (JSON.stringify(c.rules[key as keyof typeof c.rules]) !== JSON.stringify(value)) {
      throw new Error(`Unsupported gameplay rule: ${key}`);
    }
  }
  if (c.schemaVersion !== 1 || c.canvas.origin !== 'topLeft' || c.canvas.yAxis !== 'down'
    || c.canvas.scaleMode !== 'fitWithLetterbox' || c.simulation.numericType !== 'float64'
    || c.simulation.overflowTimePolicy !== 'discardWholeTicksKeepFraction'
    || c.death.guardStartsAt !== 'deathTick' || c.random.algorithm !== 'xorshift32'
    || c.random.zeroSeedPolicy !== 'reject' || c.random.gapMapping !== 'minPlusUint32ModuloInclusiveRange'
    || !c.lifecycle.pauseOnBlur || !c.lifecycle.requireExplicitResume || !c.lifecycle.clearAccumulatedTimeOnResume) {
    throw new Error('Unsupported gameplay coordinate, timing, random or lifecycle contract');
  }
  const positive = [c.canvas.width, c.canvas.height, c.simulation.tickRate, c.simulation.maxCatchUpTicks,
    c.bird.displayWidth, c.bird.displayHeight, c.bird.hitbox.width, c.bird.hitbox.height,
    c.bird.gravityPerTickSquared, c.death.gravityPerTickSquared, c.pipes.width,
    c.pipes.headHeight, c.pipes.gapHeight, c.pipes.spacing, c.pipes.scrollPerTick, c.pipes.activeCount];
  if (positive.some(n => !Number.isFinite(n) || n <= 0)
    || !Number.isInteger(c.pipes.activeCount) || !Number.isInteger(c.simulation.maxCatchUpTicks)
    || !Number.isInteger(c.death.restartGuardTicks) || c.death.restartGuardTicks < 0
    || !Number.isFinite(c.bird.flapVelocityPerTick) || c.bird.flapVelocityPerTick >= 0
    || !Number.isFinite(c.bird.hitbox.offsetX) || !Number.isFinite(c.bird.hitbox.offsetY)
    || !Number.isFinite(c.death.entryVelocityPerTick)) {
    throw new Error('Invalid gameplay dimensions or motion parameters');
  }
  const min = c.pipes.topClearance + c.pipes.headHeight + c.pipes.gapHeight / 2;
  const max = c.ground.topY - c.pipes.bottomClearance - c.pipes.gapHeight / 2 - c.pipes.headHeight;
  if (c.pipes.gapCenterMin !== min || c.pipes.gapCenterMax !== max
    || !Number.isInteger(min) || !Number.isInteger(max) || min > max
    || c.ground.topY + c.ground.height !== c.canvas.height
    || c.bird.initialY < c.bird.displayHeight / 2
    || c.bird.initialY > c.ground.topY - c.bird.displayHeight / 2) {
    throw new Error('Invalid pipe opening range, ground or initial bird position');
  }
}

validateConfig(config);
