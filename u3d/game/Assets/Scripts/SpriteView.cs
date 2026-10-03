using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using FlappyX.Core;
using UnityEngine;

namespace FlappyX.UnityAdapter
{
    internal sealed class SpriteView
    {
        private readonly GameplayConfig _config;
        private readonly Dictionary<string, (Sprite Sprite, double Width, double? Height)> _assets = new();
        private readonly SpriteRenderer[] _sky = new SpriteRenderer[3], _land = new SpriteRenderer[3];
        private readonly SpriteRenderer[][] _pipes;
        private readonly SpriteRenderer _bird;
        private readonly string[] _frames;
        private readonly int _ticksPerFrame;
        internal int BirdFrame { get; private set; }
        internal int SpriteCount => 7 + _pipes.Length * 4;
        internal Vector2 BirdPosition => new(_bird.transform.position.x, (float)_config.Canvas.Height - _bird.transform.position.y);

        internal SpriteView(Transform root, GameplayConfig config, Material material)
        {
            _config = config;
            var metadata = Content.Object("sprites");
            foreach (var s in metadata["sprites"]!)
            {
                var file = (string)s["file"]!;
                var sprite = Resources.Load<Sprite>("Content/" + Path.GetFileNameWithoutExtension(file))
                    ?? throw new FileNotFoundException("Missing sprite: " + file);
                var size = s["displaySize"]!;
                _assets.Add((string)s["id"]!, (sprite, (double)size["width"]!, (double?)size["height"]));
            }
            var animation = metadata["animations"]!["bird.flap"]!;
            _frames = animation["frames"]!.ToObject<string[]>()!;
            _ticksPerFrame = (int)animation["ticksPerFrame"]!;
            SpriteRenderer Create(string name, int order)
            {
                var go = new GameObject(name); go.transform.SetParent(root, false);
                var sprite = go.AddComponent<SpriteRenderer>(); sprite.sortingOrder = order; sprite.sharedMaterial = material;
                return sprite;
            }
            for (var i = 0; i < 3; i++) { _sky[i] = Create($"Sky{i}", 0); _land[i] = Create($"Land{i}", 2); }
            _pipes = Enumerable.Range(0, config.Pipes.ActiveCount).Select(id =>
                Enumerable.Range(0, 4).Select(part => Create($"Pipe{id}Part{part}", 1)).ToArray()).ToArray();
            _bird = Create("Bird", 3);
        }
        private double Position(double value) => _config.Render.RoundPixels ? Math.Floor(value + .5) : value;
        private void Place(SpriteRenderer sprite, string id, double x, double y, double? height = null)
        {
            var asset = _assets[id];
            var h = height ?? asset.Height ?? throw new InvalidOperationException("Height required for " + id);
            sprite.sprite = asset.Sprite;
            sprite.transform.position = new Vector3((float)Position(x), (float)(_config.Canvas.Height - Position(y)), 0);
            sprite.transform.localScale = new Vector3((float)(asset.Width / asset.Sprite.rect.width), (float)(h / asset.Sprite.rect.height), 1);
        }
        internal void Render(Game model)
        {
            var c = _config;
            for (var i = 0; i < 3; i++)
            {
                var sky = _assets["background.sky"]; var land = _assets["background.land"];
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
            var tick = model.State == GameState.Ready ? model.Tick : Math.Max(0, model.FlightTicks - 1);
            BirdFrame = tick / _ticksPerFrame % _frames.Length;
            Place(_bird, _frames[BirdFrame], c.Bird.X, model.Y);
            var tilt = c.Render.BirdTilt;
            var angle = model.State == GameState.Ready ? tilt.ReadyDegrees : Math.Clamp(model.VelocityY * tilt.VelocityMultiplier, tilt.MinDegrees, tilt.MaxDegrees);
            _bird.transform.rotation = Quaternion.Euler(0, 0, (float)-angle);
        }
        internal object Diagnostics() => new
        {
            spriteCount = SpriteCount, textureCount = _assets.Count, birdFrame = BirdFrame,
            birdPosition = new { x = BirdPosition.x, y = BirdPosition.y }, roundPixels = _config.Render.RoundPixels,
            sprites = _sky.Concat(_land).Concat(_pipes.SelectMany(p => p)).Append(_bird).Select(s => new
            {
                name = s.name, x = s.transform.position.x, y = _config.Canvas.Height - s.transform.position.y,
                width = s.sprite.rect.width * s.transform.localScale.x, height = s.sprite.rect.height * s.transform.localScale.y,
                nearest = s.sprite.texture.filterMode == FilterMode.Point
            }).ToArray()
        };
    }
}
