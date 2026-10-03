using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using FlappyX.Core;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

namespace FlappyX.UnityAdapter
{
    internal static class QaRunner
    {
        private static void Check(bool ok, string reason) { if (!ok) throw new InvalidOperationException(reason); }
        internal static IEnumerator Run(FlappyGame app)
        {
            // 等待原生 UI 完成布局后，使用实际 Input System 事件路径。
            yield return null;
            var directory = app.QaDirectory!;
            try
            {
                InputSystem.settings.updateMode = InputSettings.UpdateMode.ProcessEventsManually;
                InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
#if UNITY_EDITOR
                InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
#endif
                var keyboard = InputSystem.AddDevice<Keyboard>();
                var mouse = InputSystem.AddDevice<Mouse>();
                var touch = InputSystem.AddDevice<Touchscreen>();
                void InputFrame(Action send) { send(); InputSystem.Update(); app.CollectInput(); }
                var invalidPath = Path.Combine(directory, "invalid-best.json");
                const string invalid = "{\"schemaVersion\":2,\"bestScore\":9}";
                File.WriteAllText(invalidPath, invalid);
                var warnings = new List<string>();
                Check(new BestScoreStore(invalidPath, warnings.Add).Read() == 0 && warnings.Count == 1
                    && File.ReadAllText(invalidPath) == invalid, "Invalid storage handling");
                var storage = Path.Combine(directory, "best.json");
                File.WriteAllText(storage, "{\"schemaVersion\":1,\"bestScore\":7}");
                app.ResetNormal(); Check(app.Model.BestScore == 7, "Read pre-existing high score");
                InputFrame(() => InputSystem.QueueStateEvent(mouse, new MouseState { position = new Vector2(-1, -1) }.WithButton(MouseButton.Left)));
                app.AdvanceTick(); Check(app.Model.State == GameState.Ready, "Ignore letterbox/outside input");
                var playPoint = (Vector2)app.Camera.WorldToScreenPoint(new Vector3(100, 288, 0));
                InputFrame(() => InputSystem.QueueStateEvent(mouse, new MouseState { position = playPoint }.WithButton(MouseButton.Right)));
                app.AdvanceTick(); Check(app.Model.State == GameState.Ready, "Ignore secondary mouse");
                InputFrame(() =>
                {
                    InputSystem.QueueStateEvent(keyboard, new KeyboardState(Key.Space));
                    InputSystem.QueueStateEvent(mouse, new MouseState { position = playPoint }.WithButton(MouseButton.Left));
                });
                var events = app.AdvanceTick(); app.Render();
                Check(events.Count(e => e.Type == "flapped") == 1 && app.Model.Y == 408, "Merge keyboard/mouse input");
                Check(app.View.BirdFrame == 0, "First flying frame");
                InputFrame(() => InputSystem.QueueStateEvent(keyboard, new KeyboardState(Key.Space)));
                Check(app.AdvanceTick().All(e => e.Type != "flapped"), "Held key does not repeat");
                app.Render(); Check(app.View.BirdFrame == 0, "Flight frame 2");
                app.AdvanceTick(); app.Render(); Check(app.View.BirdFrame == 0, "Flight frame 3");
                app.AdvanceTick(); app.Render(); Check(app.View.BirdFrame == 1, "Flight frame 4");
                InputFrame(() => InputSystem.QueueStateEvent(keyboard, new KeyboardState()));
                app.ResetNormal();
                InputFrame(() => InputSystem.QueueStateEvent(touch, new TouchState { touchId = 1, phase = UnityEngine.InputSystem.TouchPhase.Began, position = playPoint }));
                Check(app.AdvanceTick().Any(e => e.Type == "flapped"), "Primary touch");
                InputFrame(() => InputSystem.QueueStateEvent(touch, new TouchState { touchId = 2, phase = UnityEngine.InputSystem.TouchPhase.Began, position = playPoint }));
                Check(app.AdvanceTick().All(e => e.Type != "flapped"), "Secondary touch ignored");
                InputSystem.RemoveDevice(keyboard); InputSystem.RemoveDevice(mouse); InputSystem.RemoveDevice(touch);
                app.QueueFlap(); app.Pause(); var tick = app.Model.Tick;
                Check(app.Clock.Frame(1000, () => app.AdvanceTick()) == 0 && app.Model.Tick == tick, "Pause freezes simulation");
                app.Ui.Continue.onClick.Invoke();
                Check(!app.Clock.Paused && app.Clock.AccumulatedTicks == 0, "Explicit resume clears time");
                Check(app.AdvanceTick().All(e => e.Type != "flapped"), "Pause clears queued input");
                Check(app.Clock.Frame(340, () => app.AdvanceTick()) == 5 && Math.Abs(app.Clock.AccumulatedTicks - .2) < 1e-9, "Five-tick catch-up");
                var original = File.ReadAllText(storage);
                app.StartReplay(); Check(app.Model.BestScore == 0 && app.Ui.BestText == "回放最高  0", "Replay isolation");
                var snapshots = new List<object> { app.Model.Snapshot() }; var frames = new List<int> { app.View.BirdFrame };
                for (var i = 0; i < 210; i++) { app.AdvanceTick(); app.Render(); snapshots.Add(app.Model.Snapshot()); frames.Add(app.View.BirdFrame); }
                Check(app.Model.DeathTick == 184 && app.Model.GameOverTick == 191 && app.Model.Score == 1, "Baseline contract");
                Check(File.ReadAllText(storage) == original && app.Ui.BestText == "回放最高  1", "Replay does not save");
                app.ResetNormal(); Check(app.Model.BestScore == 7 && app.Ui.BestText == "最高  7", "Return to player score");
                for (var round = 0; round < 10; round++)
                {
                    app.AdvanceTick(true); while (!app.Model.CanRestart) app.AdvanceTick();
                    app.Ui.Primary.onClick.Invoke(); app.AdvanceTick(); app.Render();
                    Check(app.Model.State == GameState.Ready && app.Model.Score == 0 && app.Model.BestScore == 7, "Restart without flap");
                    Check(app.Model.Pipes.Count == 7 && app.GetComponentsInChildren<SpriteRenderer>().Length == 35, "Bounded scene objects");
                }
                var fractional = new Game(app.Config, new GameOptions { Initial = new InitialState { Y = 240.5 } });
                app.View.Render(fractional); Check(app.View.BirdPosition.y == 240.5f, "Fractional rendering");
                app.Config.Render.RoundPixels = true; app.View.Render(fractional);
                Check(app.View.BirdPosition.y == 241 && fractional.Y == 240.5, "roundPixels display-only");
                app.Config.Render.RoundPixels = false; app.Render();
                Content.Write(Path.Combine(directory, "native-check.json"), new { success = true, syntheticUnityInput = true,
                    snapshots, birdFrames = frames, restarts = 10, storagePreserved = 7, invalidSaveHandled = true, diagnostics = app.Diagnostics() });
                Debug.Log("Unity native QA passed: 211 snapshots, Input System, pause, storage and 10 restarts");
                Quit(0);
            }
            catch (Exception e)
            {
                Content.Write(Path.Combine(directory, "native-check.json"), new { success = false, error = e.ToString() });
                Debug.LogException(e); Quit(1);
            }
        }
        internal static IEnumerator Capture(FlappyGame app)
        {
            app.StartReplay();
            foreach (var tick in new[] { 0, 134, 184, 191 })
            {
                while (app.Model.Tick < tick) app.AdvanceTick();
                app.Render(); yield return new WaitForEndOfFrame();
                var image = ScreenCapture.CaptureScreenshotAsTexture();
                File.WriteAllBytes(Path.Combine(app.QaDirectory!, $"tick-{tick}.png"), image.EncodeToPNG());
                UnityEngine.Object.Destroy(image);
                Content.Write(Path.Combine(app.QaDirectory!, $"tick-{tick}.json"), app.Diagnostics());
            }
            Quit(0);
        }
        private static void Quit(int code)
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.Exit(code);
#else
            Application.Quit(code);
#endif
        }
    }
}
