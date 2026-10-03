using System.Text.Json;
using FlappyX.Contract;
using FlappyX.Core;
using Godot;

namespace FlappyX.GodotAdapter;

// 仅在显式 --qa / --capture / --watch 参数下执行。测试存档与玩家 user:// 完全隔离。
internal static class QaRunner
{
    private static void Check(bool condition, string message)
    { if (!condition) throw new InvalidOperationException(message); }
    private static async Task Frame(FlappyGame app) => await app.ToSignal(app.GetTree(), SceneTree.SignalName.ProcessFrame);
    private static void Write(string path, object value) => File.WriteAllText(path, JsonSerializer.Serialize(value, new JsonSerializerOptions(ConfigJson.Options) { WriteIndented = true }));

    public static async void Run(FlappyGame app)
    {
        var directory = app.QaDirectory ?? throw new InvalidOperationException("--qa-dir is required");
        Directory.CreateDirectory(directory);
        try
        {
            var invalidStorage = Path.Combine(directory, "invalid-best.json");
            const string invalidSave = "{\"schemaVersion\":2,\"bestScore\":9}";
            File.WriteAllText(invalidStorage, invalidSave);
            var warnings = new List<string>();
            Check(new BestScoreStore(invalidStorage, warnings.Add).Read() == 0 && warnings.Count == 1
                && File.ReadAllText(invalidStorage) == invalidSave, "Invalid save warns without stopping the game or changing the file");
            var storage = Path.Combine(directory, "best.json");
            File.WriteAllText(storage, "{\"schemaVersion\":1,\"bestScore\":7}");
            app.ResetNormal();
            Check(app.Model.BestScore == 7, "Pre-existing high score");
            Input.ParseInputEvent(new InputEventMouseButton { ButtonIndex = MouseButton.Left, Pressed = true, Position = new Vector2(-1, 480) });
            // Godot 的实际输入分发路径，包含重复按键、次键与非主触摸过滤。
            Input.ParseInputEvent(new InputEventKey { PhysicalKeycode = Key.Space, Pressed = true, Echo = true });
            Input.ParseInputEvent(new InputEventMouseButton { ButtonIndex = MouseButton.Right, Pressed = true, Position = new Vector2(100, 480) });
            Input.ParseInputEvent(new InputEventScreenTouch { Index = 1, Pressed = true, Position = new Vector2(100, 480) });
            await Frame(app);
            app.AdvanceTick();
            Check(app.Model.State == GameState.Ready, "Ignore echo, secondary mouse/touch");
            Input.ParseInputEvent(new InputEventKey { PhysicalKeycode = Key.Space, Pressed = true });
            Input.ParseInputEvent(new InputEventScreenTouch { Index = 0, Pressed = true, Position = new Vector2(100, 480) });
            await Frame(app);
            var flapEvents = app.AdvanceTick();
            Check(flapEvents.Count(e => e.Type == "flapped") == 1 && app.Model.Y == 408, "Merge keyboard and primary touch into one flap");
            Check(app.View.BirdFrame == 0, "Initial frame");
            app.Render();
            app.AdvanceTick(); app.Render(); Check(app.View.BirdFrame == 0, "Flight frame tick 2");
            app.AdvanceTick(); app.Render(); Check(app.View.BirdFrame == 0, "Flight frame tick 3");
            app.AdvanceTick(); app.Render(); Check(app.View.BirdFrame == 1, "Flight frame tick 4");
            app.QueueFlap(); app.Pause();
            var tick = app.Model.Tick;
            Check(app.Clock.Frame(1000, () => app.AdvanceTick()) == 0 && app.Model.Tick == tick, "Pause freezes model");
            app.ResumeButton.EmitSignal(BaseButton.SignalName.Pressed);
            Check(!app.Clock.Paused && app.Clock.AccumulatedTicks == 0, "Explicit resume");
            var resumed = app.AdvanceTick(); Check(resumed.All(e => e.Type != "flapped"), "Resume clears input");
            Check(app.Clock.Frame(340, () => app.AdvanceTick()) == 5 && Math.Abs(app.Clock.AccumulatedTicks - .2) < 1e-9, "Bounded catch-up");
            var priorBytes = File.ReadAllText(storage);
            app.StartReplay();
            Check(app.Model.BestScore == 0 && app.BestText == "回放最高  0", "Replay HUD is isolated");
            var snapshots = new List<object> { app.Model.Snapshot() };
            var frames = new List<int> { app.View.BirdFrame };
            for (var i = 0; i < 210; i++) { app.AdvanceTick(); app.Render(); snapshots.Add(app.Model.Snapshot()); frames.Add(app.View.BirdFrame); }
            Check(app.Model.DeathTick == 184 && app.Model.GameOverTick == 191 && app.Model.Score == 1, "Baseline ticks and score");
            Check(File.ReadAllText(storage) == priorBytes && app.BestText == "回放最高  1", "Replay does not write storage");
            app.ResetNormal(); Check(app.Model.BestScore == 7 && app.BestText == "最高  7", "Return restores player high score");
            for (var round = 0; round < 10; round++)
            {
                app.AdvanceTick(true);
                while (!app.Model.CanRestart) app.AdvanceTick(false);
                app.StartButton.EmitSignal(BaseButton.SignalName.Pressed);
                app.AdvanceTick(); app.Render();
                Check(app.Model.State == GameState.Ready && app.Model.Score == 0 && app.Model.BestScore == 7, "Restart button cannot flap");
                Check(app.Model.Pipes.Count == 7 && app.View.SpriteCount == 35, "Bounded sprites and pipes");
            }
            Check(ConfigJson.Read<JsonElement>(File.ReadAllText(storage)).GetProperty("bestScore").GetInt32() == 7, "Preserve greater saved score");
            var fractional = new Game(app.Config, new GameOptions { Initial = new InitialState { Y = 240.5 } });
            app.View.Render(fractional);
            Check(app.View.BirdPosition.Y == 240.5f, "Fractional rendering");
            app.Config.Render.RoundPixels = true;
            app.View.Render(fractional);
            Check(app.View.BirdPosition.Y == 241 && fractional.Y == 240.5, "roundPixels changes display only");
            app.Config.Render.RoundPixels = false;
            app.Render();
            Write(Path.Combine(directory, "native-check.json"), new { success = true, syntheticGodotInput = true, snapshots, birdFrames = frames,
                restarts = 10, storagePreserved = 7, invalidSaveHandled = true, diagnostics = app.Diagnostics(), godotVersion = Engine.GetVersionInfo()["string"].AsString() });
            GD.Print("Godot native QA passed: 211 snapshots, input, pause, replay storage and 10 restarts");
            app.GetTree().Quit();
        }
        catch (Exception e)
        {
            Write(Path.Combine(directory, "native-check.json"), new { success = false, error = e.ToString() });
            GD.PushError(e.ToString()); app.GetTree().Quit(1);
        }
    }
    public static async void Capture(FlappyGame app)
    {
        var directory = app.QaDirectory ?? throw new InvalidOperationException("--qa-dir is required");
        Directory.CreateDirectory(directory);
        app.StartReplay();
        foreach (var tick in new[] { 0, 134, 184, 191 })
        {
            while (app.Model.Tick < tick) app.AdvanceTick();
            app.Render();
            await Frame(app);
            await app.ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);
            using var image = app.GetViewport().GetTexture().GetImage();
            var error = image.SavePng(Path.Combine(directory, $"tick-{tick}.png"));
            if (error != Error.Ok) throw new IOException($"PNG capture failed: {error}");
            Write(Path.Combine(directory, $"tick-{tick}.json"), app.Diagnostics());
        }
        app.GetTree().Quit();
    }
    public static async void Watch(FlappyGame app)
    {
        var directory = app.QaDirectory ?? throw new InvalidOperationException("--qa-dir is required");
        Directory.CreateDirectory(directory);
        while (GodotObject.IsInstanceValid(app) && app.IsInsideTree())
        {
            Write(Path.Combine(directory, "live.json"), app.Diagnostics());
            await app.ToSignal(app.GetTree().CreateTimer(.1), SceneTreeTimer.SignalName.Timeout);
        }
    }
}
