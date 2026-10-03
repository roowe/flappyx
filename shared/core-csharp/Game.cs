using System;
using System.Collections.Generic;
using System.Linq;

namespace FlappyX.Core
{

    public enum GameState { Ready, Playing, Dying, GameOver }
    public enum DeathReason { Ground, Ceiling, UpperPipe, LowerPipe }

    public static class ContractNames
    {
        public static string Name(this GameState state) => state switch
        {
            GameState.Ready => "ready", GameState.Playing => "playing", GameState.Dying => "dying",
            GameState.GameOver => "gameOver", _ => throw new ArgumentOutOfRangeException(nameof(state))
        };
        public static string Name(this DeathReason reason) => reason switch
        {
            DeathReason.Ground => "ground", DeathReason.Ceiling => "ceiling",
            DeathReason.UpperPipe => "upperPipe", DeathReason.LowerPipe => "lowerPipe",
            _ => throw new ArgumentOutOfRangeException(nameof(reason))
        };
    }

    public sealed class Pipe
    {
        public int Id { get; set; }
        public double X { get; set; }
        public double GapCenterY { get; set; }
        public bool Passed { get; set; }
    }
    public sealed class InitialState
    {
        public GameState? State { get; set; } public int? Tick { get; set; }
        public double? Y { get; set; } public double? VelocityY { get; set; }
        public int? Score { get; set; } public int? BestScore { get; set; } public int? DeathTick { get; set; }
        public double? FirstPipeX { get; set; } public bool? PipesPassed { get; set; } public uint? Seed { get; set; }
    }
    public sealed class GameOptions
    {
        public InitialState Initial { get; set; } = new();
        public IReadOnlyList<int>? PipeGapCenters { get; set; }
        public IReadOnlyList<Pipe>? Pipes { get; set; }
    }
    public sealed class GameEvent
    {
        public string Type { get; }
        public int? PipeId { get; }
        public int? Score { get; }
        public int? BestScore { get; }
        public string? Reason { get; }
        public GameEvent(string type, int? pipeId = null, int? score = null, int? bestScore = null, string? reason = null)
        { Type = type; PipeId = pipeId; Score = score; BestScore = bestScore; Reason = reason; }
    }

    // 所有运动数值用 double，逻辑不依赖系统时间、物理节点或渲染帧率。
    public sealed class Game
    {
        public GameplayConfig Settings { get; }
        public int Tick { get; private set; }
        public GameState State { get; private set; }
        public double Y { get; private set; }
        public double VelocityY { get; private set; }
        public int Score { get; private set; }
        public int BestScore { get; private set; }
        public int? DeathTick { get; private set; }
        public DeathReason? DeathReason { get; private set; }
        public int? GameOverTick { get; private set; }
        public int FlightTicks { get; private set; }
        public int ConsumedGapCenters { get; private set; }
        public IReadOnlyList<Pipe> Pipes => _pipes;
        private readonly List<Pipe> _pipes = new();
        private readonly uint _seed;
        private uint _randomState;
        private readonly IReadOnlyList<int>? _fixedGaps;

        public Game(GameplayConfig settings, GameOptions? options = null)
        {
            Settings = settings;
            options ??= new GameOptions();
            var initial = options.Initial;
            _seed = initial.Seed ?? settings.Random.DefaultSeed;
            Xorshift32(_seed); // 验证种子，但不消费随机序列。
            _randomState = _seed;
            _fixedGaps = options.PipeGapCenters;
            Tick = initial.Tick ?? 0;
            State = initial.State ?? GameState.Ready;
            Y = initial.Y ?? settings.Bird.InitialY;
            VelocityY = initial.VelocityY ?? 0;
            Score = initial.Score ?? 0;
            BestScore = initial.BestScore ?? 0;
            DeathTick = initial.DeathTick;
            if (options.Pipes is { } explicitPipes)
                _pipes.AddRange(explicitPipes.Select((p, id) => new Pipe { Id = id, X = p.X, GapCenterY = p.GapCenterY, Passed = p.Passed }));
            else CreatePipes(initial.FirstPipeX ?? settings.Pipes.FirstCenterX, initial.PipesPassed ?? false);
        }

        public static uint Xorshift32(uint value)
        {
            if (value == 0) throw new ArgumentOutOfRangeException(nameof(value), "Seed must be a nonzero uint32");
            unchecked { value ^= value << 13; value ^= value >> 17; value ^= value << 5; }
            return value;
        }

        public static DeathReason? PipeCollision(GameplayConfig c, double y, double x, double gap,
            double? offsetX = null, double? offsetY = null)
        {
            var ox = offsetX ?? c.Bird.Hitbox.OffsetX;
            var oy = offsetY ?? c.Bird.Hitbox.OffsetY;
            if (Math.Abs(x - c.Bird.X - ox) > (c.Pipes.Width + c.Bird.Hitbox.Width) / 2) return null;
            if (y + oy - c.Bird.Hitbox.Height / 2 <= gap - c.Pipes.GapHeight / 2) return Core.DeathReason.UpperPipe;
            if (y + oy + c.Bird.Hitbox.Height / 2 >= gap + c.Pipes.GapHeight / 2) return Core.DeathReason.LowerPipe;
            return null;
        }
        public static int ScoreDelta(GameplayConfig c, GameState state, double x, bool passed, bool collided, double? offsetX = null)
            => state == GameState.Playing && !passed && !collided
                && x + c.Pipes.Width / 2 < c.Bird.X + (offsetX ?? c.Bird.Hitbox.OffsetX) - c.Bird.Hitbox.Width / 2 ? 1 : 0;

        private void CreatePipes(double firstX, bool passed)
        {
            var p = Settings.Pipes;
            for (var id = 0; id < p.ActiveCount; id++)
                _pipes.Add(new Pipe { Id = id, X = firstX + id * (p.Width + p.Spacing), GapCenterY = NextGap(), Passed = passed });
        }
        private int NextGap()
        {
            var p = Settings.Pipes;
            int value;
            if (_fixedGaps is { } gaps)
            {
                if (ConsumedGapCenters >= gaps.Count) throw new InvalidOperationException("Explicit pipe heights exhausted");
                value = gaps[ConsumedGapCenters];
                if (value < p.GapCenterMin || value > p.GapCenterMax) throw new InvalidOperationException("Explicit pipe height outside the configured range");
            }
            else
            {
                _randomState = Xorshift32(_randomState);
                value = p.GapCenterMin + (int)(_randomState % (uint)(p.GapCenterMax - p.GapCenterMin + 1));
            }
            ConsumedGapCenters++;
            return value;
        }
        private DeathReason? Collision()
        {
            if (Y + Settings.Bird.DisplayHeight / 2 >= Settings.Ground.TopY) return Core.DeathReason.Ground;
            if (Y - Settings.Bird.DisplayHeight / 2 <= 0) return Core.DeathReason.Ceiling;
            var lower = false;
            foreach (var pipe in _pipes)
            {
                var hit = PipeCollision(Settings, Y, pipe.X, pipe.GapCenterY);
                if (hit == Core.DeathReason.UpperPipe) return hit;
                lower |= hit == Core.DeathReason.LowerPipe;
            }
            return lower ? Core.DeathReason.LowerPipe : null;
        }
        private void Land(List<GameEvent> events)
        {
            Y = Settings.Ground.TopY - Settings.Bird.DisplayHeight / 2;
            VelocityY = 0;
            State = GameState.GameOver;
            GameOverTick = Tick;
            BestScore = Math.Max(BestScore, Score);
            events.Add(new GameEvent("gameOver", score: Score, bestScore: BestScore));
        }
        public IReadOnlyList<GameEvent> Step(bool flap = false)
        {
            var events = new List<GameEvent>();
            Tick++;
            if (flap && State is GameState.Ready or GameState.Playing)
            {
                if (State == GameState.Ready) events.Add(new GameEvent("started"));
                State = GameState.Playing;
                VelocityY = Settings.Bird.FlapVelocityPerTick;
                events.Add(new GameEvent("flapped"));
            }
            if (State == GameState.Playing)
            {
                FlightTicks++;
                foreach (var pipe in _pipes) pipe.X -= Settings.Pipes.ScrollPerTick;
                Y += VelocityY;
                VelocityY += Settings.Bird.GravityPerTickSquared;
                var reason = Collision();
                if (reason is { } hit)
                {
                    DeathTick = Tick;
                    DeathReason = hit;
                    VelocityY = Settings.Death.EntryVelocityPerTick;
                    events.Add(new GameEvent("died", reason: hit.Name()));
                    if (hit == Core.DeathReason.Ground) Land(events);
                    else State = GameState.Dying;
                    return events;
                }
                foreach (var pipe in _pipes)
                {
                    if (ScoreDelta(Settings, State, pipe.X, pipe.Passed, false) == 0) continue;
                    pipe.Passed = true;
                    Score++;
                    events.Add(new GameEvent("scored", pipeId: pipe.Id, score: Score));
                }
                while (_pipes.Count > 0 && _pipes[0].X + Settings.Pipes.Width / 2 < 0)
                {
                    var pipe = _pipes[0];
                    _pipes.RemoveAt(0);
                    var lastX = _pipes.Count == 0 ? pipe.X : _pipes[_pipes.Count - 1].X;
                    pipe.X = lastX + Settings.Pipes.Width + Settings.Pipes.Spacing;
                    pipe.GapCenterY = NextGap();
                    pipe.Passed = false;
                    _pipes.Add(pipe);
                    events.Add(new GameEvent("recycled", pipeId: pipe.Id));
                }
            }
            else if (State == GameState.Dying)
            {
                Y += VelocityY;
                VelocityY += Settings.Death.GravityPerTickSquared;
                if (Y + Settings.Bird.DisplayHeight / 2 >= Settings.Ground.TopY) Land(events);
            }
            return events;
        }
        public bool CanRestart => State == GameState.GameOver && DeathTick is { } deathTick
            && Tick >= deathTick + Settings.Death.RestartGuardTicks;

        public bool Restart()
        {
            if (!CanRestart) return false;
            Tick = 0; State = GameState.Ready; Y = Settings.Bird.InitialY; VelocityY = 0; Score = 0;
            DeathTick = null; DeathReason = null; GameOverTick = null; FlightTicks = 0; ConsumedGapCenters = 0;
            _randomState = _seed;
            _pipes.Clear();
            CreatePipes(Settings.Pipes.FirstCenterX, false);
            return true;
        }
        public object Snapshot() => new
        {
            Tick, State = State.Name(), Y, BirdY = Y, VelocityY, Score, BestScore, DeathTick,
            DeathReason = DeathReason?.Name(), GameOverTick,
            RestartAllowedTick = DeathTick + Settings.Death.RestartGuardTicks,
            FirstPipeX = _pipes.Count == 0 ? (double?)null : _pipes[0].X, PipeCount = _pipes.Count,
            PipeIds = _pipes.Select(p => p.Id).ToArray(), PipeXs = _pipes.Select(p => p.X).ToArray(),
            PipeGapCenters = _pipes.Select(p => p.GapCenterY).ToArray(), PipePassed = _pipes.Select(p => p.Passed).ToArray(),
            PipesPassed = _pipes.Any(p => p.Passed), ConsumedGapCenters, FlightTicks
        };
    }
}
