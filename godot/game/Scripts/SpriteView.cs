using System.Text.Json;
using FlappyX.Core;
using Godot;
using FileAccess = Godot.FileAccess;

namespace FlappyX.GodotAdapter;

internal sealed class SpriteView
{
    private readonly GameplayConfig _config;
    private readonly Dictionary<string, (Texture2D Texture, double Width, double? Height)> _assets = new();
    private readonly Sprite2D[] _sky = new Sprite2D[3], _land = new Sprite2D[3];
    private readonly Sprite2D[][] _pipes;
    private readonly Sprite2D _bird;
    private readonly string[] _frames;
    private readonly int _ticksPerFrame;
    internal int BirdFrame { get; private set; }
    internal int SpriteCount => 7 + _pipes.Length * 4;
    internal Vector2 BirdPosition => _bird.Position;

    public SpriteView(Node2D root, GameplayConfig config)
    {
        _config = config;
        using var doc = JsonDocument.Parse(FileAccess.GetFileAsString("res://Content/sprites.json"));
        var metadata = doc.RootElement;
        foreach (var s in metadata.GetProperty("sprites").EnumerateArray())
        {
            var path = "res://Content/" + s.GetProperty("file").GetString();
            var texture = GD.Load<Texture2D>(path) ?? throw new InvalidDataException($"Texture failed to load: {path}");
            var size = s.GetProperty("displaySize");
            _assets.Add(s.GetProperty("id").GetString()!, (texture, size.GetProperty("width").GetDouble(),
                size.GetProperty("height").ValueKind == JsonValueKind.Null ? null : size.GetProperty("height").GetDouble()));
        }
        var animation = metadata.GetProperty("animations").GetProperty("bird.flap");
        _frames = animation.GetProperty("frames").EnumerateArray().Select(s => s.GetString()!).ToArray();
        _ticksPerFrame = animation.GetProperty("ticksPerFrame").GetInt32();
        Sprite2D Create(string name, int z)
        {
            var sprite = new Sprite2D { Name = name, Centered = true, ZIndex = z, TextureFilter = CanvasItem.TextureFilterEnum.Nearest };
            root.AddChild(sprite);
            return sprite;
        }
        for (var i = 0; i < 3; i++) { _sky[i] = Create($"Sky{i}", 0); _land[i] = Create($"Land{i}", 2); }
        _pipes = Enumerable.Range(0, config.Pipes.ActiveCount).Select(id =>
            Enumerable.Range(0, 4).Select(part => Create($"Pipe{id}Part{part}", 1)).ToArray()).ToArray();
        _bird = Create("Bird", 3);
    }
    private double Position(double value) => _config.Render.RoundPixels ? Math.Floor(value + 0.5) : value;
    private void Place(Sprite2D sprite, string id, double x, double y, double? height = null)
    {
        var asset = _assets[id];
        var displayHeight = height ?? asset.Height ?? throw new InvalidOperationException($"Height is required for {id}");
        sprite.Texture = asset.Texture;
        sprite.Position = new Vector2((float)Position(x), (float)Position(y));
        sprite.Scale = new Vector2((float)(asset.Width / asset.Texture.GetWidth()), (float)(displayHeight / asset.Texture.GetHeight()));
    }
    public void Render(Game model)
    {
        var c = _config;
        for (var i = 0; i < 3; i++)
        {
            var sky = _assets["background.sky"];
            var land = _assets["background.land"];
            Place(_sky[i], "background.sky", i * sky.Width - model.FlightTicks * c.Sky.ScrollPerTick % sky.Width + sky.Width / 2,
                c.Ground.TopY - sky.Height!.Value / 2);
            Place(_land[i], "background.land", i * land.Width - model.FlightTicks * c.Ground.ScrollPerTick % land.Width + land.Width / 2,
                c.Ground.TopY + c.Ground.Height / 2);
        }
        foreach (var pipe in model.Pipes)
        {
            var sprites = _pipes[pipe.Id];
            var upperEdge = pipe.GapCenterY - c.Pipes.GapHeight / 2;
            var lowerEdge = pipe.GapCenterY + c.Pipes.GapHeight / 2;
            var upperHeight = upperEdge - c.Pipes.HeadHeight;
            var lowerHeight = c.Ground.TopY - lowerEdge - c.Pipes.HeadHeight;
            Place(sprites[0], "pipe.upper.body", pipe.X, upperHeight / 2, upperHeight);
            Place(sprites[1], "pipe.upper.head", pipe.X, upperEdge - c.Pipes.HeadHeight / 2);
            Place(sprites[2], "pipe.lower.head", pipe.X, lowerEdge + c.Pipes.HeadHeight / 2);
            Place(sprites[3], "pipe.lower.body", pipe.X, lowerEdge + c.Pipes.HeadHeight + lowerHeight / 2, lowerHeight);
        }
        var ticks = model.State == GameState.Ready ? model.Tick : Math.Max(0, model.FlightTicks - 1);
        BirdFrame = ticks / _ticksPerFrame % _frames.Length;
        Place(_bird, _frames[BirdFrame], c.Bird.X, model.Y);
        var tilt = c.Render.BirdTilt;
        _bird.RotationDegrees = (float)(model.State == GameState.Ready ? tilt.ReadyDegrees
            : Math.Clamp(model.VelocityY * tilt.VelocityMultiplier, tilt.MinDegrees, tilt.MaxDegrees));
    }
    public object Diagnostics() => new
    {
        spriteCount = SpriteCount, textureCount = _assets.Count, birdFrame = BirdFrame,
        birdPosition = new { x = _bird.Position.X, y = _bird.Position.Y }, birdTilt = _bird.RotationDegrees,
        roundPixels = _config.Render.RoundPixels,
        sprites = _sky.Concat(_land).Concat(_pipes.SelectMany(p => p)).Append(_bird).Select(s => new
        {
            name = s.Name.ToString(), x = s.Position.X, y = s.Position.Y,
            width = s.Texture.GetWidth() * s.Scale.X, height = s.Texture.GetHeight() * s.Scale.Y,
            nearest = s.TextureFilter == CanvasItem.TextureFilterEnum.Nearest
        }).ToArray()
    };
}
