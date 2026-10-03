using System;
using FlappyX.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace FlappyX.UnityAdapter
{
    internal sealed class GameUi
    {
        private readonly Text _score, _best, _title, _detail, _notice;
        private readonly GameObject _panel, _pausePanel;
        private readonly Button _replay, _back;
        internal Button Primary { get; }
        internal Button Continue { get; }
        internal string BestText => _best.text;
        internal GameUi(FlappyGame app, Camera camera)
        {
            var events = new GameObject("Input UI", typeof(EventSystem), typeof(InputSystemUIInputModule));
            events.transform.SetParent(app.transform, false);
            events.GetComponent<InputSystemUIInputModule>().AssignDefaultActions();
            var root = new GameObject("Interface", typeof(RectTransform), typeof(Canvas), typeof(GraphicRaycaster));
            root.transform.SetParent(app.transform, false);
            var canvas = root.GetComponent<Canvas>(); canvas.renderMode = RenderMode.WorldSpace;
            canvas.worldCamera = camera; canvas.sortingOrder = 100;
            var rect = root.GetComponent<RectTransform>(); rect.sizeDelta = new Vector2(1024, 768); rect.position = new Vector3(512, 384, -1);
#if UNITY_WEBGL && !UNITY_EDITOR
            var font = Resources.Load<Font>("Fonts/FlappyUI")
                ?? throw new InvalidOperationException("Missing bundled Web UI font");
#else
            var font = Font.CreateDynamicFontFromOSFont(new[] { "PingFang SC", "Heiti SC", "Arial" }, 32);
#endif
            RectTransform Box(Transform parent, string name, float x, float y, float width, float height)
            {
                var go = new GameObject(name, typeof(RectTransform)); var r = go.GetComponent<RectTransform>();
                r.SetParent(parent, false); r.anchorMin = r.anchorMax = new Vector2(0, 1); r.pivot = new Vector2(0, 1);
                r.anchoredPosition = new Vector2(x, -y); r.sizeDelta = new Vector2(width, height); return r;
            }
            Text Label(Transform parent, string name, float x, float y, float width, float height, int size)
            {
                var text = Box(parent, name, x, y, width, height).gameObject.AddComponent<Text>();
                text.font = font; text.fontSize = size; text.alignment = TextAnchor.MiddleCenter; text.raycastTarget = false;
                text.color = new Color32(23, 60, 67, 255); text.text = name; return text;
            }
            Button Button(Transform parent, string text, float x, float y, float width, float height, Action action)
            {
                var r = Box(parent, text, x, y, width, height);
                var image = r.gameObject.AddComponent<Image>(); image.color = new Color32(255, 228, 155, 255);
                var button = r.gameObject.AddComponent<Button>(); button.targetGraphic = image;
                button.navigation = new Navigation { mode = Navigation.Mode.None }; button.onClick.AddListener(() => action());
                Label(r, text, 0, 0, width, height, 24); return button;
            }
            GameObject Panel(string name)
            {
                var panel = Box(rect, name, 272, 186, 480, 254);
                panel.gameObject.AddComponent<Image>().color = new Color32(255, 248, 223, 255); return panel.gameObject;
            }
            Label(rect, "UNITY · C#", 24, 18, 210, 48, 26);
            _score = Label(rect, "0", 420, 54, 184, 72, 64);
            // 中文 Web 字体的行高大于字号，允许分数字形超出布局框的行高限制。
            _score.verticalOverflow = VerticalWrapMode.Overflow;
            _best = Label(rect, "最高  0", 714, 26, 182, 38, 22);
            Button(rect, "暂停", 902, 22, 94, 46, app.Pause);
            Label(rect, "30 Hz · EASY V1", 20, 714, 250, 38, 20);
            _notice = Label(rect, "", 280, 714, 710, 38, 16);
            _panel = Panel("Round panel");
            _title = Label(_panel.transform, "FLAPPY BIRD", 20, 14, 440, 56, 36);
            _detail = Label(_panel.transform, "", 20, 80, 440, 40, 22);
            Primary = Button(_panel.transform, "开始飞行", 80, 134, 320, 52, () =>
            { if (app.Clock.Paused) return; if (app.Model.State == GameState.Ready) app.QueueFlap(); else app.Restart(); });
            _replay = Button(_panel.transform, "基准回放", 140, 196, 200, 42, app.StartReplay);
            _back = Button(rect, "返回游戏", 824, 674, 170, 52, app.ResetNormal);
            _pausePanel = Panel("Pause panel");
            Label(_pausePanel.transform, "已暂停", 20, 24, 440, 56, 36);
            Label(_pausePanel.transform, "回到窗口后，点击继续恢复", 20, 94, 440, 40, 22);
            Continue = Button(_pausePanel.transform, "继续", 100, 164, 280, 58, app.Resume);
        }
        internal void Warn(string message) { Debug.LogWarning(message); _notice.text = message; }
        internal void Render(FlappyGame app)
        {
            var model = app.Model; var ready = model.State == GameState.Ready;
            _score.text = model.Score.ToString();
            _best.text = $"{(app.Replaying ? "回放最高" : "最高")}  {model.BestScore}";
            _panel.SetActive(ready || model.State == GameState.GameOver);
            _title.text = ready ? "FLAPPY BIRD" : "本局结束";
            _detail.text = ready ? "空格 / 点击 / 触摸，穿过水管" : $"得分  {model.Score}     {_best.text}";
            Primary.GetComponentInChildren<Text>().text = ready ? "开始飞行" : app.Replaying ? "再看一次" : "重新开始";
            Primary.interactable = !app.Clock.Paused && (ready || model.CanRestart);
            _replay.gameObject.SetActive(ready && !app.Replaying); _back.gameObject.SetActive(app.Replaying);
            _pausePanel.SetActive(app.Clock.Paused);
        }
    }
}
