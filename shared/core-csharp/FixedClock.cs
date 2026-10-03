using System;

namespace FlappyX.Core
{

    public sealed class FixedClock
    {
        private readonly SimulationConfig _simulation;
        public FixedClock(SimulationConfig simulation) => _simulation = simulation;
        public double AccumulatedTicks { get; private set; }
        public bool Paused { get; private set; }
        public void Pause() => Paused = true;
        public void Resume() { Paused = false; AccumulatedTicks = 0; }
        public void Reset() => AccumulatedTicks = 0;
        public int Frame(double milliseconds, Action step)
        {
            if (double.IsNaN(milliseconds) || double.IsInfinity(milliseconds) || milliseconds < 0)
                throw new ArgumentOutOfRangeException(nameof(milliseconds), "Frame delta must be finite and nonnegative");
            if (Paused) return 0;
            AccumulatedTicks += milliseconds * _simulation.TickRate / 1000;
            var whole = Math.Floor(AccumulatedTicks + 1e-9);
            var processed = (int)Math.Min(whole, _simulation.MaxCatchUpTicks);
            AccumulatedTicks = Math.Max(0, AccumulatedTicks - whole);
            for (var i = 0; i < processed; i++) step();
            return processed;
        }
    }
}
