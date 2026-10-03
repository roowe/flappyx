namespace FlappyX.Core
{

    // 数据字段对应 shared/config/gameplay.json；JSON 与引擎资源加载留在适配边界。
    public sealed class GameplayConfig
    {
        public CanvasConfig Canvas { get; set; } = new();
        public SimulationConfig Simulation { get; set; } = new();
        public BirdConfig Bird { get; set; } = new();
        public GroundConfig Ground { get; set; } = new();
        public SkyConfig Sky { get; set; } = new();
        public PipesConfig Pipes { get; set; } = new();
        public DeathConfig Death { get; set; } = new();
        public RandomConfig Random { get; set; } = new();
        public RenderConfig Render { get; set; } = new();
    }
    public sealed class CanvasConfig { public double Width { get; set; } public double Height { get; set; } }
    public sealed class SimulationConfig { public double TickRate { get; set; } public int MaxCatchUpTicks { get; set; } }
    public sealed class HitboxConfig
    {
        public double Width { get; set; } public double Height { get; set; }
        public double OffsetX { get; set; } public double OffsetY { get; set; }
    }
    public sealed class BirdConfig
    {
        public double X { get; set; } public double InitialY { get; set; }
        public double DisplayWidth { get; set; } public double DisplayHeight { get; set; }
        public double FlapVelocityPerTick { get; set; } public double GravityPerTickSquared { get; set; }
        public HitboxConfig Hitbox { get; set; } = new();
    }
    public sealed class GroundConfig
    {
        public double TopY { get; set; } public double Height { get; set; } public double ScrollPerTick { get; set; }
    }
    public sealed class SkyConfig { public double ScrollPerTick { get; set; } }
    public sealed class PipesConfig
    {
        public double Width { get; set; } public double HeadHeight { get; set; } public double GapHeight { get; set; }
        public double Spacing { get; set; } public double ScrollPerTick { get; set; } public double FirstCenterX { get; set; }
        public double TopClearance { get; set; } public double BottomClearance { get; set; }
        public int GapCenterMin { get; set; } public int GapCenterMax { get; set; } public int ActiveCount { get; set; }
    }
    public sealed class DeathConfig
    {
        public double GravityPerTickSquared { get; set; } public double EntryVelocityPerTick { get; set; }
        public int RestartGuardTicks { get; set; }
    }
    public sealed class RandomConfig { public uint DefaultSeed { get; set; } }
    public sealed class RenderConfig
    {
        public string ClearColor { get; set; } = "";
        public bool RoundPixels { get; set; }
        public TiltConfig BirdTilt { get; set; } = new();
    }
    public sealed class TiltConfig
    {
        public double VelocityMultiplier { get; set; } public double MinDegrees { get; set; }
        public double MaxDegrees { get; set; } public double ReadyDegrees { get; set; }
    }
}
