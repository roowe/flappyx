export { config, validateConfig, type GameplayConfig } from './config';
export { Game, pipeCollision, scoreDelta, xorshift32 } from './game';
export type { GameState, DeathReason, GameEvent, Pipe, InitialState, GameOptions } from './game';
export { FixedClock } from './clock';
