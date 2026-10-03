using System;
using System.IO;
using Newtonsoft.Json;

namespace FlappyX.UnityAdapter
{
    internal sealed class BestScoreStore
    {
        private readonly string _path;
        private readonly Action<string> _warn;
        private sealed class Save
        {
            [JsonProperty(Required = Required.Always)] public int SchemaVersion { get; set; }
            [JsonProperty(Required = Required.Always)] public int BestScore { get; set; }
        }
        internal BestScoreStore(string path, Action<string> warn) { _path = path; _warn = warn; }
        internal int Read()
        {
            try
            {
                if (!File.Exists(_path)) return 0;
                var value = Content.Read<Save>(File.ReadAllText(_path));
                if (value.SchemaVersion != 1 || value.BestScore < 0) throw new InvalidDataException("Invalid best score format");
                return value.BestScore;
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException or InvalidDataException)
            { _warn("最高分读取失败：" + e.Message); return 0; }
        }
        internal void Write(int score)
        {
            try
            {
                var best = Math.Max(Read(), score);
                Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
                Content.Write(_path, new Save { SchemaVersion = 1, BestScore = best });
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            { _warn("最高分保存失败：" + e.Message); }
        }
    }
}
