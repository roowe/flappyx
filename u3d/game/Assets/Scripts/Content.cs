using System;
using System.IO;
using System.Linq;
using FlappyX.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using UnityEngine;

namespace FlappyX.UnityAdapter
{
    internal static class Content
    {
        internal static readonly JsonSerializerSettings Json = new()
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            Formatting = Formatting.Indented
        };
        internal static string Text(string name) => (Resources.Load<TextAsset>("Content/" + name)
            ?? throw new FileNotFoundException("Missing shared JSON: " + name)).text;
        internal static JObject Object(string name) => JObject.Parse(Text(name));
        internal static T Read<T>(string text) => JsonConvert.DeserializeObject<T>(text, Json)
            ?? throw new InvalidDataException("Expected " + typeof(T).Name);
        internal static void Write(string path, object value) => File.WriteAllText(path, JsonConvert.SerializeObject(value, Json));

        internal static GameplayConfig LoadConfig()
        {
            var raw = Object("gameplay");
            void Fields(JToken token, Type type)
            {
                foreach (var property in type.GetProperties())
                {
                    var name = char.ToLowerInvariant(property.Name[0]) + property.Name.Substring(1);
                    var field = token[name] ?? throw new InvalidDataException("Missing gameplay field: " + name);
                    if (field.Type == JTokenType.Null) throw new InvalidDataException("Null gameplay field: " + name);
                    if (property.PropertyType.Namespace == typeof(GameplayConfig).Namespace) Fields(field, property.PropertyType);
                }
            }
            Fields(raw, typeof(GameplayConfig));
            void Require(string path, object expected)
            {
                if (!JToken.DeepEquals(raw.SelectToken(path), JToken.FromObject(expected)))
                    throw new InvalidDataException("Unsupported gameplay contract: " + path);
            }
            Require("schemaVersion", 1); Require("canvas.origin", "topLeft"); Require("canvas.yAxis", "down");
            Require("canvas.scaleMode", "fitWithLetterbox"); Require("simulation.numericType", "float64");
            Require("simulation.overflowTimePolicy", "discardWholeTicksKeepFraction");
            Require("random.algorithm", "xorshift32"); Require("random.zeroSeedPolicy", "reject");
            Require("random.gapMapping", "minPlusUint32ModuloInclusiveRange"); Require("death.guardStartsAt", "deathTick");
            Require("rules.firstFlapStartsAndFlaps", true); Require("rules.flapResetsVelocity", true); Require("rules.maxFlapsPerTick", 1);
            Require("rules.movementOrder", "positionThenGravity"); Require("rules.collisionBeforeScore", true);
            Require("rules.collisionPriority", new[] { "ground", "ceiling", "upperPipe", "lowerPipe" });
            Require("rules.pipeCollisionShape", "axisAlignedHitbox"); Require("rules.pipeTouchIsCollision", true);
            Require("rules.floorAndCeilingShape", "unrotatedDisplayBounds"); Require("rules.scoreWhen", "pipeRightStrictlyLessThanHitboxLeft");
            Require("rules.recycleWhen", "pipeRightStrictlyLessThanZero"); Require("rules.restartTarget", "ready");
            Require("rules.restartInputFlaps", false); Require("rules.restartResetsTick", true);
            Require("lifecycle.pauseOnBlur", true); Require("lifecycle.requireExplicitResume", true);
            Require("lifecycle.clearAccumulatedTimeOnResume", true); Require("render.filter", "nearest");
            Require("render.mipmaps", false); Require("render.rotationAffectsCollision", false);
            Require("storage.schemaVersion", 1); Require("storage.fields", new[] { "schemaVersion", "bestScore" });
            Require("storage.writeBestScoreOn", "gameOver");
            var c = Read<GameplayConfig>(raw.ToString());
            var positive = new[] { c.Canvas.Width, c.Canvas.Height, c.Simulation.TickRate, c.Simulation.MaxCatchUpTicks,
                c.Bird.DisplayWidth, c.Bird.DisplayHeight, c.Bird.Hitbox.Width, c.Bird.Hitbox.Height,
                c.Bird.GravityPerTickSquared, c.Death.GravityPerTickSquared, c.Pipes.Width, c.Pipes.HeadHeight,
                c.Pipes.GapHeight, c.Pipes.Spacing, c.Pipes.ScrollPerTick, c.Pipes.ActiveCount };
            if (positive.Any(v => double.IsNaN(v) || double.IsInfinity(v) || v <= 0) || c.Bird.FlapVelocityPerTick >= 0
                || c.Death.RestartGuardTicks < 0) throw new InvalidDataException("Invalid gameplay dimensions or motion");
            if (c.Pipes.GapCenterMin != c.Pipes.TopClearance + c.Pipes.HeadHeight + c.Pipes.GapHeight / 2
                || c.Pipes.GapCenterMax != c.Ground.TopY - c.Pipes.BottomClearance - c.Pipes.GapHeight / 2 - c.Pipes.HeadHeight
                || c.Pipes.GapCenterMin > c.Pipes.GapCenterMax || c.Ground.TopY + c.Ground.Height != c.Canvas.Height)
                throw new InvalidDataException("Invalid opening range or ground");
            Game.Xorshift32(c.Random.DefaultSeed);
            return c;
        }
    }
}
