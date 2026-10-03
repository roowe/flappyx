using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using FlappyX.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace FlappyX.UnityAdapter
{
    public sealed class FlappyGame : MonoBehaviour
    {
        public Material SpriteMaterial = null!;
        internal GameplayConfig Config { get; private set; } = null!;
        internal Game Model { get; private set; } = null!;
        internal FixedClock Clock { get; private set; } = null!;
        internal SpriteView View { get; private set; } = null!;
        internal GameUi Ui { get; private set; } = null!;
        internal Camera Camera { get; private set; } = null!;
        internal string? QaDirectory { get; private set; }
        internal bool ManualMode { get; set; }
        internal bool Replaying { get; private set; }
        private BestScoreStore _store = null!;
        private bool _pendingFlap, _initialized, _watch;
        private double _lastFrame, _lastWatch;
        private int _replayTicks;
        private HashSet<int> _replayFlaps = new();
        private readonly List<RaycastResult> _hits = new();

        private void Awake()
        {
            Application.runInBackground = true; Application.targetFrameRate = 60;
            var args = Environment.GetCommandLineArgs();
            QaDirectory = args.FirstOrDefault(a => a.StartsWith("--qa-dir=", StringComparison.Ordinal))?.Substring(9);
            Config = Content.LoadConfig(); Clock = new FixedClock(Config.Simulation);
            var clear = new GameObject("Letterbox").AddComponent<Camera>(); clear.transform.SetParent(transform, false);
            clear.depth = -10; clear.cullingMask = 0; clear.clearFlags = CameraClearFlags.SolidColor; clear.backgroundColor = new Color32(23, 60, 67, 255);
            Camera = new GameObject("Game camera").AddComponent<Camera>(); Camera.transform.SetParent(transform, false);
            Camera.transform.position = new Vector3((float)Config.Canvas.Width / 2, (float)Config.Canvas.Height / 2, -10);
            Camera.orthographic = true; Camera.orthographicSize = (float)Config.Canvas.Height / 2;
            Camera.nearClipPlane = .1f; Camera.farClipPlane = 30; Camera.allowHDR = false; Camera.allowMSAA = false;
            Camera.clearFlags = CameraClearFlags.SolidColor; ColorUtility.TryParseHtmlString(Config.Render.ClearColor, out var color); Camera.backgroundColor = color;
            Ui = new GameUi(this, Camera);
            _store = new BestScoreStore(Path.Combine(QaDirectory ?? Application.persistentDataPath, "best.json"), Ui.Warn);
            Model = new Game(Config, new GameOptions { Initial = new InitialState { BestScore = _store.Read() } });
            View = new SpriteView(transform, Config, SpriteMaterial);
            _initialized = true; _lastFrame = Time.realtimeSinceStartupAsDouble;
            FitViewport(); Render();
            ManualMode = args.Contains("--qa") || args.Contains("--capture");
            _watch = args.Contains("--watch");
            if ((ManualMode || _watch) && QaDirectory == null) throw new ArgumentException("--qa-dir is required for diagnostics");
            if (QaDirectory != null) Directory.CreateDirectory(QaDirectory);
        }
        private void Start()
        {
            var args = Environment.GetCommandLineArgs();
            if (args.Contains("--qa")) StartCoroutine(QaRunner.Run(this));
            if (args.Contains("--capture")) StartCoroutine(QaRunner.Capture(this));
        }
        internal void FitViewport()
        {
            var fit = Math.Min(Screen.width / Config.Canvas.Width, Screen.height / Config.Canvas.Height);
            var w = (float)(Config.Canvas.Width * fit / Screen.width);
            var h = (float)(Config.Canvas.Height * fit / Screen.height);
            Camera.rect = new Rect((1 - w) / 2, (1 - h) / 2, w, h);
            Camera.aspect = (float)(Config.Canvas.Width / Config.Canvas.Height);
        }
        private void LateUpdate()
        {
            FitViewport();
            var now = Time.realtimeSinceStartupAsDouble; var elapsed = now - _lastFrame; _lastFrame = now;
            if (!ManualMode)
            {
                CollectInput();
                if (!Replaying || Model.Tick < _replayTicks) Clock.Frame(elapsed * 1000, () => AdvanceTick());
                Render();
            }
            if (_watch && now - _lastWatch >= .1) { _lastWatch = now; Content.Write(Path.Combine(QaDirectory!, "live.json"), Diagnostics()); }
        }
        internal void CollectInput()
        {
            if (Keyboard.current?.escapeKey.wasPressedThisFrame == true) { Pause(); return; }
            if (Keyboard.current?.spaceKey.wasPressedThisFrame == true) QueueFlap();
            var touch = Touchscreen.current?.primaryTouch;
            if (touch?.press.wasPressedThisFrame == true) PointerFlap(touch.position.ReadValue());
            // Input System 不生成旧 Input 的合成鼠标；触摸活跃时仍避免同时消费真实鼠标。
            if (touch?.press.isPressed != true && Mouse.current?.leftButton.wasPressedThisFrame == true)
                PointerFlap(Mouse.current.position.ReadValue());
        }
        internal void PointerFlap(Vector2 position)
        {
            if (!Camera.pixelRect.Contains(position)) return;
            _hits.Clear();
            EventSystem.current.RaycastAll(new PointerEventData(EventSystem.current) { position = position }, _hits);
            if (_hits.Count == 0) QueueFlap();
        }
        internal void QueueFlap()
        {
            if (!Clock.Paused && !Replaying && Model.State is GameState.Ready or GameState.Playing) _pendingFlap = true;
        }
        internal IReadOnlyList<GameEvent> AdvanceTick(bool? flap = null)
        {
            var events = Model.Step(flap ?? (Replaying ? _replayFlaps.Contains(Model.Tick + 1) : _pendingFlap));
            _pendingFlap = false;
            if (!Replaying && events.Any(e => e.Type == "gameOver")) _store.Write(Model.BestScore);
            return events;
        }
        private void OnApplicationFocus(bool focus) { if (_initialized && !focus) Pause(); }
        private void OnApplicationPause(bool pause) { if (_initialized && pause) Pause(); }
        internal void Pause() { Clock.Pause(); _pendingFlap = false; Render(); }
        internal void Resume() { _pendingFlap = false; Clock.Resume(); _lastFrame = Time.realtimeSinceStartupAsDouble; Render(); }
        internal void ResetNormal()
        {
            Replaying = false; _pendingFlap = false; Clock.Resume(); _lastFrame = Time.realtimeSinceStartupAsDouble;
            Model = new Game(Config, new GameOptions { Initial = new InitialState { BestScore = _store.Read() } }); Render();
        }
        internal void StartReplay()
        {
            var replay = Content.Object("replay-baseline");
            _replayTicks = (int)replay["totalTicks"]!;
            _replayFlaps = new HashSet<int>(replay["flapTicks"]!.ToObject<int[]>()!);
            Model = new Game(Config, new GameOptions
            {
                Initial = new InitialState { Seed = (uint)replay["seed"]!, BestScore = (int)replay["initialBestScore"]! },
                PipeGapCenters = replay["pipeGapCenters"]!.ToObject<int[]>()!
            });
            Replaying = true; _pendingFlap = false; Clock.Resume(); _lastFrame = Time.realtimeSinceStartupAsDouble; Render();
        }
        internal void Restart()
        {
            if (Clock.Paused) return;
            if (Replaying) { StartReplay(); return; }
            if (Model.Restart()) { _pendingFlap = false; Clock.Reset(); Render(); }
        }
        internal void Render() { View.Render(Model); Ui.Render(this); }
        private object InputDiagnostics()
        {
            var position = Mouse.current?.position.ReadValue() ?? Vector2.zero;
            var hits = new List<RaycastResult>();
            EventSystem.current.RaycastAll(new PointerEventData(EventSystem.current) { position = position }, hits);
            return new { focused = Application.isFocused, x = position.x, y = position.y,
                mouseEnabled = Mouse.current?.enabled, leftPressed = Mouse.current?.leftButton.isPressed,
                module = EventSystem.current.currentInputModule?.GetType().Name,
                hits = hits.Select(h => h.gameObject.name).ToArray() };
        }
        internal object Diagnostics() => new
        {
            snapshot = Model.Snapshot(), paused = Clock.Paused, accumulatedTicks = Clock.AccumulatedTicks, replaying = Replaying,
            bestText = Ui.BestText, view = View.Diagnostics(), window = new { width = Screen.width, height = Screen.height },
            viewport = new { x = Camera.pixelRect.x, y = Camera.pixelRect.y, width = Camera.pixelRect.width, height = Camera.pixelRect.height },
            persistentDataPath = Application.persistentDataPath, unityVersion = Application.unityVersion,
            input = InputDiagnostics()
        };
    }
}
