import gameplay from '../config/gameplay.json';

// 类型随共享 JSON 推导；调整难度时修改 gameplay.json，三套引擎使用同一份参数。
export type GameplayConfig = typeof gameplay;

/**
 * 坐标和尺寸使用逻辑画布像素，原点在左上角，Y 轴向下。
 * 速度单位为像素/tick，重力单位为像素/tick²；一个 tick 为 1 / tickRate 秒。
 * 因此拍翅速度为负数，重力为正数；改变 tickRate 也会改变实际运动速度。
 */
export const config: GameplayConfig = gameplay;

// 这些值声明了内核已经实现的行为，并非可任意切换的玩法选项。
// 修改规则时必须同步修改内核和回放验证，避免配置与实际行为不一致。
const supportedRules = {
  // 首次输入同时开始游戏和拍翅；每 tick 最多拍一次，并覆盖当前速度。
  firstFlapStartsAndFlaps: true, flapResetsVelocity: true, maxFlapsPerTick: 1,
  // 先按当前速度移动，再累加重力；同一 tick 发生碰撞时不计分。
  movementOrder: 'positionThenGravity', collisionBeforeScore: true,
  collisionPriority: ['ground', 'ceiling', 'upperPipe', 'lowerPipe'],
  // 鸟与水管碰撞时按碰撞盒判定，与地面或顶边碰撞时按显示尺寸判定；均忽略旋转。
  pipeCollisionShape: 'axisAlignedHitbox', pipeTouchIsCollision: true,
  floorAndCeilingShape: 'unrotatedDisplayBounds',
  // 必须完全越过边界才计分或回收；恰好贴边不触发。
  scoreWhen: 'pipeRightStrictlyLessThanHitboxLeft',
  recycleWhen: 'pipeRightStrictlyLessThanZero', restartTarget: 'ready',
  // 重开只回到待机并归零 tick，玩家需要再次输入才起飞。
  restartInputFlaps: false, restartResetsTick: true,
};

/** 校验参数约束及内核支持的规则；不匹配时直接报错，不自动修正配置。 */
export function validateConfig(c: GameplayConfig) {
  for (const [key, value] of Object.entries(supportedRules)) {
    // 序列化比较兼顾标量与数组，并保留碰撞优先级数组的顺序。
    if (JSON.stringify(c.rules[key as keyof typeof c.rules]) !== JSON.stringify(value)) {
      throw new Error(`Unsupported gameplay rule: ${key}`);
    }
  }
  // 固定坐标、计时、随机和暂停约定，保证相同输入在不同引擎中得到相同结果。
  if (c.schemaVersion !== 1 || c.canvas.origin !== 'topLeft' || c.canvas.yAxis !== 'down'
    || c.canvas.scaleMode !== 'fitWithLetterbox' || c.simulation.numericType !== 'float64'
    || c.simulation.overflowTimePolicy !== 'discardWholeTicksKeepFraction'
    || c.death.guardStartsAt !== 'deathTick' || c.random.algorithm !== 'xorshift32'
    || c.random.zeroSeedPolicy !== 'reject' || c.random.gapMapping !== 'minPlusUint32ModuloInclusiveRange'
    || !c.lifecycle.pauseOnBlur || !c.lifecycle.requireExplicitResume || !c.lifecycle.clearAccumulatedTimeOnResume) {
    throw new Error('Unsupported gameplay coordinate, timing, random or lifecycle contract');
  }
  // 尺寸、重力和水管速度必须为有限正数；数量与 tick 计数还需满足整数约束。
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
  // 缺口中心到上下边界都要留出半个缺口、管头高度和指定留白。
  // JSON 中的中心范围必须与几何推导一致；整数端点供随机数映射到闭区间。
  const min = c.pipes.topClearance + c.pipes.headHeight + c.pipes.gapHeight / 2;
  const max = c.ground.topY - c.pipes.bottomClearance - c.pipes.gapHeight / 2 - c.pipes.headHeight;
  // 地面应恰好铺到画布底部；鸟的初始显示边界不得越出顶边或进入地面。
  if (c.pipes.gapCenterMin !== min || c.pipes.gapCenterMax !== max
    || !Number.isInteger(min) || !Number.isInteger(max) || min > max
    || c.ground.topY + c.ground.height !== c.canvas.height
    || c.bird.initialY < c.bird.displayHeight / 2
    || c.bird.initialY > c.ground.topY - c.bird.displayHeight / 2) {
    throw new Error('Invalid pipe opening range, ground or initial bird position');
  }
}

// 导入时立即检查默认配置，让无效参数在游戏启动前暴露。
validateConfig(config);
