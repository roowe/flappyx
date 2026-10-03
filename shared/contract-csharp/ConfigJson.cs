using System.Text.Json;
using System.Text.Json.Serialization;
using FlappyX.Core;

namespace FlappyX.Contract;

// .NET JSON 边界单独放置；netstandard 内核可被 Unity 直接复用。
public static class ConfigJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        RespectRequiredConstructorParameters = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };
    public static T Read<T>(string json) => JsonSerializer.Deserialize<T>(json, Options)
        ?? throw new InvalidDataException($"Expected {typeof(T).Name} JSON object");

    public static GameplayConfig Load(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        void RequireFields(JsonElement value, Type type)
        {
            foreach (var property in type.GetProperties())
            {
                var key = JsonNamingPolicy.CamelCase.ConvertName(property.Name);
                var field = value.GetProperty(key);
                if (field.ValueKind == JsonValueKind.Null) throw new InvalidDataException($"Missing gameplay field: {key}");
                if (property.PropertyType.Namespace == typeof(GameplayConfig).Namespace) RequireFields(field, property.PropertyType);
            }
        }
        RequireFields(root, typeof(GameplayConfig));
        void Require(string path, object expected)
        {
            var actual = root;
            foreach (var key in path.Split('.')) actual = actual.GetProperty(key);
            if (!JsonElement.DeepEquals(actual, JsonSerializer.SerializeToElement(expected, Options)))
                throw new InvalidDataException($"Unsupported gameplay contract: {path}");
        }
        Require("schemaVersion", 1);
        Require("canvas.origin", "topLeft"); Require("canvas.yAxis", "down"); Require("canvas.scaleMode", "fitWithLetterbox");
        Require("simulation.numericType", "float64"); Require("simulation.overflowTimePolicy", "discardWholeTicksKeepFraction");
        Require("death.guardStartsAt", "deathTick"); Require("random.algorithm", "xorshift32");
        Require("random.zeroSeedPolicy", "reject"); Require("random.gapMapping", "minPlusUint32ModuloInclusiveRange");
        Require("lifecycle.pauseOnBlur", true); Require("lifecycle.requireExplicitResume", true);
        Require("lifecycle.clearAccumulatedTimeOnResume", true);
        Require("storage.schemaVersion", 1); Require("storage.fields", new[] { "schemaVersion", "bestScore" });
        Require("storage.writeBestScoreOn", "gameOver");
        Require("render.filter", "nearest"); Require("render.mipmaps", false); Require("render.rotationAffectsCollision", false);
        var rules = new Dictionary<string, object>
        {
            ["firstFlapStartsAndFlaps"] = true, ["flapResetsVelocity"] = true, ["maxFlapsPerTick"] = 1,
            ["movementOrder"] = "positionThenGravity", ["collisionBeforeScore"] = true,
            ["collisionPriority"] = new[] { "ground", "ceiling", "upperPipe", "lowerPipe" },
            ["pipeCollisionShape"] = "axisAlignedHitbox", ["pipeTouchIsCollision"] = true,
            ["floorAndCeilingShape"] = "unrotatedDisplayBounds", ["scoreWhen"] = "pipeRightStrictlyLessThanHitboxLeft",
            ["recycleWhen"] = "pipeRightStrictlyLessThanZero", ["restartTarget"] = "ready",
            ["restartInputFlaps"] = false, ["restartResetsTick"] = true
        };
        foreach (var (key, value) in rules) Require($"rules.{key}", value);
        var c = Read<GameplayConfig>(json);
        var positive = new[] { c.Canvas.Width, c.Canvas.Height, c.Simulation.TickRate, c.Simulation.MaxCatchUpTicks,
            c.Bird.DisplayWidth, c.Bird.DisplayHeight, c.Bird.Hitbox.Width, c.Bird.Hitbox.Height,
            c.Bird.GravityPerTickSquared, c.Death.GravityPerTickSquared, c.Pipes.Width, c.Pipes.HeadHeight,
            c.Pipes.GapHeight, c.Pipes.Spacing, c.Pipes.ScrollPerTick, c.Pipes.ActiveCount };
        if (positive.Any(v => !double.IsFinite(v) || v <= 0) || c.Death.RestartGuardTicks < 0
            || !double.IsFinite(c.Bird.FlapVelocityPerTick) || c.Bird.FlapVelocityPerTick >= 0
            || !double.IsFinite(c.Bird.Hitbox.OffsetX) || !double.IsFinite(c.Bird.Hitbox.OffsetY)
            || !double.IsFinite(c.Death.EntryVelocityPerTick)) throw new InvalidDataException("Invalid gameplay motion or dimensions");
        var min = c.Pipes.TopClearance + c.Pipes.HeadHeight + c.Pipes.GapHeight / 2;
        var max = c.Ground.TopY - c.Pipes.BottomClearance - c.Pipes.GapHeight / 2 - c.Pipes.HeadHeight;
        if (c.Pipes.GapCenterMin != min || c.Pipes.GapCenterMax != max || min > max
            || c.Ground.TopY + c.Ground.Height != c.Canvas.Height
            || c.Bird.InitialY < c.Bird.DisplayHeight / 2 || c.Bird.InitialY > c.Ground.TopY - c.Bird.DisplayHeight / 2)
            throw new InvalidDataException("Invalid opening range, ground or initial bird position");
        Game.Xorshift32(c.Random.DefaultSeed);
        return c;
    }
}
