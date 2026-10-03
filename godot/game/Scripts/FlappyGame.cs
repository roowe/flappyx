using System.Text.Json;
using FlappyX.Contract;
using FlappyX.Core;
using Godot;
using FileAccess = Godot.FileAccess;

namespace FlappyX.GodotAdapter;

public partial class FlappyGame : Node2D
{
    internal GameplayConfig Config { get; private set; } = null!;
    internal Game Model { get; private set; } = null!;
    internal FixedClock Clock { get; private set; } = null!;
    internal bool ManualMode { get; set; }
    internal bool Replaying { get; private set; }
    internal SpriteView View { get; private set; } = null!;
    private BestScoreStore _store = null!;
    private bool _pendingFlap, _initialized;
    private int _replayTicks;
    private HashSet<int> _replayFlaps = new();
    private Label _score = null!, _best = null!, _title = null!, _detail = null!, _notice = null!;
    private Panel _panel = null!, _pausePanel = null!;
    private Button _primary = null!, _replay = null!, _back = null!;
    internal Button ResumeButton { get; private set; } = null!;
    internal Button StartButton => _primary;
    internal string BestText => _best.Text;
    internal string? QaDirectory { get; private set; }

    public override void _Ready()
    {
        var args = OS.GetCmdlineUserArgs();
        QaDirectory = args.FirstOrDefault(a => a.StartsWith("--qa-dir=", StringComparison.Ordinal))?[9..];
        Config = ConfigJson.Load(FileAccess.GetFileAsString("res://Content/gameplay.json"));
        Clock = new FixedClock(Config.Simulation);
        BuildUi();
        _store = new BestScoreStore(QaDirectory is { } qa ? Path.Combine(qa, "best.json") : ProjectSettings.GlobalizePath("user://best.json"), message =>
        { GD.PushWarning(message); _notice.Text = message; });
        Model = new Game(Config, new GameOptions { Initial = new InitialState { BestScore = _store.Read() } });
        View = new SpriteView(this, Config);
        _initialized = true;
        Render();
        if (args.Contains("--qa")) { ManualMode = true; CallDeferred(MethodName.RunQa); }
        if (args.Contains("--capture")) { ManualMode = true; CallDeferred(MethodName.RunCapture); }
        if (args.Contains("--watch")) CallDeferred(MethodName.StartWatch);
    }
    public override void _Process(double delta)
    {
        if (!_initialized || ManualMode || (Replaying && Model.Tick >= _replayTicks)) return;
        Clock.Frame(delta * 1000, () => AdvanceTick());
        Render();
    }
    public override void _Notification(int what)
    {
        if (_initialized && (what == NotificationApplicationFocusOut || what == NotificationWMWindowFocusOut)) Pause();
    }
    public override void _UnhandledInput(InputEvent input)
    {
        if (!_initialized) return;
        if (input is InputEventKey { Pressed: true, Echo: false, PhysicalKeycode: Key.Escape })
        { Pause(); GetViewport().SetInputAsHandled(); return; }
        var pointer = input switch
        {
            InputEventMouseButton mouse => (Vector2?)mouse.Position,
            InputEventScreenTouch touch => touch.Position,
            _ => null
        };
        if (pointer is { } position && !GetViewportRect().HasPoint(position)) return;
        var flap = input is InputEventKey { Pressed: true, Echo: false, PhysicalKeycode: Key.Space }
            or InputEventMouseButton { Pressed: true, ButtonIndex: MouseButton.Left }
            or InputEventScreenTouch { Pressed: true, Index: 0 };
        if (!flap) return;
        QueueFlap();
        GetViewport().SetInputAsHandled();
    }
    internal void QueueFlap()
    {
        if (Clock.Paused || Replaying || Model.State is GameState.Dying or GameState.GameOver) return;
        _pendingFlap = true;
    }
    internal IReadOnlyList<GameEvent> AdvanceTick(bool? flap = null)
    {
        var events = Model.Step(flap ?? (Replaying ? _replayFlaps.Contains(Model.Tick + 1) : _pendingFlap));
        _pendingFlap = false;
        if (!Replaying && events.Any(e => e.Type == "gameOver")) _store.Write(Model.BestScore);
        return events;
    }
    internal void Pause() { Clock.Pause(); _pendingFlap = false; Render(); }
    internal void Resume() { _pendingFlap = false; Clock.Resume(); Render(); }
    internal void ResetNormal()
    {
        Replaying = false; _pendingFlap = false; Clock.Resume();
        Model = new Game(Config, new GameOptions { Initial = new InitialState { BestScore = _store.Read() } });
        Render();
    }
    internal void StartReplay()
    {
        using var doc = JsonDocument.Parse(FileAccess.GetFileAsString("res://Content/replay-baseline.json"));
        var replay = doc.RootElement;
        _replayTicks = replay.GetProperty("totalTicks").GetInt32();
        _replayFlaps = replay.GetProperty("flapTicks").EnumerateArray().Select(t => t.GetInt32()).ToHashSet();
        Model = new Game(Config, new GameOptions
        {
            Initial = new InitialState { Seed = replay.GetProperty("seed").GetUInt32(), BestScore = replay.GetProperty("initialBestScore").GetInt32() },
            PipeGapCenters = replay.GetProperty("pipeGapCenters").EnumerateArray().Select(h => h.GetInt32()).ToArray()
        });
        Replaying = true; _pendingFlap = false; Clock.Resume(); Render();
    }
    internal void Restart()
    {
        if (Clock.Paused) return;
        if (Replaying) { StartReplay(); return; }
        if (Model.Restart()) { _pendingFlap = false; Clock.Reset(); Render(); }
    }
    internal void Render()
    {
        if (!_initialized) return;
        View.Render(Model);
        _score.Text = Model.Score.ToString();
        _best.Text = $"{(Replaying ? "回放最高" : "最高")}  {Model.BestScore}";
        _panel.Visible = Model.State is GameState.Ready or GameState.GameOver;
        var ready = Model.State == GameState.Ready;
        _title.Text = ready ? "FLAPPY BIRD" : "本局结束";
        _detail.Text = ready ? "空格 / 点击 / 触摸，穿过水管" : $"得分  {Model.Score}     {(Replaying ? "回放最高" : "最高")}  {Model.BestScore}";
        _primary.Text = ready ? "开始飞行" : Replaying ? "再看一次" : "重新开始";
        _primary.Disabled = Clock.Paused || (!ready && !Model.CanRestart);
        _replay.Visible = ready && !Replaying;
        _back.Visible = Replaying;
        _pausePanel.Visible = Clock.Paused;
    }
    internal object Diagnostics() => new
    {
        snapshot = Model.Snapshot(), paused = Clock.Paused, Clock.AccumulatedTicks, replaying = Replaying,
        bestText = BestText, view = View.Diagnostics(), window = new { width = GetWindow().Size.X, height = GetWindow().Size.Y },
        logicalViewport = new { width = GetViewportRect().Size.X, height = GetViewportRect().Size.Y },
        transform = new { scaleX = GetViewport().GetFinalTransform().X.X, scaleY = GetViewport().GetFinalTransform().Y.Y,
            offsetX = GetViewport().GetFinalTransform().Origin.X, offsetY = GetViewport().GetFinalTransform().Origin.Y }
    };
    private void BuildUi()
    {
        var background = new ColorRect { Color = new Color(Config.Render.ClearColor), Size = new Vector2((float)Config.Canvas.Width, (float)Config.Canvas.Height), MouseFilter = Control.MouseFilterEnum.Ignore, ZIndex = -1 };
        AddChild(background);
        var layer = new CanvasLayer { Layer = 10 }; AddChild(layer);
        var ui = new Control { MouseFilter = Control.MouseFilterEnum.Ignore, Size = new Vector2(1024, 768) }; layer.AddChild(ui);
        var font = new SystemFont { FontNames = new[] { "PingFang SC", "Heiti SC", "Arial" } };
        var theme = new Theme { DefaultFont = font, DefaultFontSize = 24 };
        theme.SetColor("font_color", "Label", new Color("#173c43"));
        foreach (var state in new[] { "normal", "hover", "pressed", "disabled", "focus" })
            theme.SetStylebox(state, "Button", new StyleBoxFlat { BgColor = new Color(state == "hover" ? "#f9cf66" : "#ffe49b"),
                CornerRadiusTopLeft = 12, CornerRadiusTopRight = 12, CornerRadiusBottomLeft = 12, CornerRadiusBottomRight = 12 });
        theme.SetColor("font_color", "Button", new Color("#173c43"));
        theme.SetColor("font_hover_color", "Button", new Color("#173c43"));
        theme.SetColor("font_pressed_color", "Button", new Color("#173c43"));
        ui.Theme = theme;
        Label LabelAt(Control parent, string text, Vector2 position, Vector2 size, int fontSize = 24)
        {
            var label = new Label { Text = text, Position = position, Size = size, MouseFilter = Control.MouseFilterEnum.Ignore,
                HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            label.AddThemeFontSizeOverride("font_size", fontSize); parent.AddChild(label); return label;
        }
        Button ButtonAt(Control parent, string text, Vector2 position, Vector2 size, Action action)
        {
            var button = new Button { Text = text, Position = position, Size = size, FocusMode = Control.FocusModeEnum.None };
            button.Pressed += action; parent.AddChild(button); return button;
        }
        Panel Card(Vector2 position, Vector2 size)
        {
            var card = new Panel { Position = position, Size = size, MouseFilter = Control.MouseFilterEnum.Stop };
            card.AddThemeStyleboxOverride("panel", new StyleBoxFlat { BgColor = new Color("#fff8df"), CornerRadiusTopLeft = 20,
                CornerRadiusTopRight = 20, CornerRadiusBottomLeft = 20, CornerRadiusBottomRight = 20,
                ShadowColor = new Color(0, 0, 0, .16f), ShadowSize = 8 });
            ui.AddChild(card); return card;
        }
        LabelAt(ui, "GODOT · C#", new Vector2(24, 18), new Vector2(210, 48), 26);
        _score = LabelAt(ui, "0", new Vector2(420, 54), new Vector2(184, 72), 64);
        _best = LabelAt(ui, "最高  0", new Vector2(714, 26), new Vector2(182, 38), 22);
        ButtonAt(ui, "暂停", new Vector2(902, 22), new Vector2(94, 46), Pause);
        LabelAt(ui, "30 Hz · EASY V1", new Vector2(20, 714), new Vector2(250, 38), 20);
        _notice = LabelAt(ui, "", new Vector2(280, 714), new Vector2(710, 38), 16);
        _panel = Card(new Vector2(272, 186), new Vector2(480, 254));
        _title = LabelAt(_panel, "FLAPPY BIRD", new Vector2(20, 14), new Vector2(440, 56), 36);
        _detail = LabelAt(_panel, "", new Vector2(20, 80), new Vector2(440, 40), 22);
        _primary = ButtonAt(_panel, "开始飞行", new Vector2(80, 134), new Vector2(320, 52), () =>
        { if (Clock.Paused) return; if (Model.State == GameState.Ready) QueueFlap(); else Restart(); });
        _replay = ButtonAt(_panel, "基准回放", new Vector2(140, 196), new Vector2(200, 42), StartReplay);
        _back = ButtonAt(ui, "返回游戏", new Vector2(824, 674), new Vector2(170, 52), ResetNormal);
        _pausePanel = Card(new Vector2(272, 186), new Vector2(480, 254));
        LabelAt(_pausePanel, "已暂停", new Vector2(20, 24), new Vector2(440, 56), 36);
        LabelAt(_pausePanel, "回到窗口后，点击继续恢复", new Vector2(20, 94), new Vector2(440, 40), 22);
        ResumeButton = ButtonAt(_pausePanel, "继续", new Vector2(100, 164), new Vector2(280, 58), Resume);
    }
    private void RunQa() => QaRunner.Run(this);
    private void RunCapture() => QaRunner.Capture(this);
    private void StartWatch() => QaRunner.Watch(this);
}
