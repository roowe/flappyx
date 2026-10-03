using System.Text.Json;
using FlappyX.Contract;

namespace FlappyX.GodotAdapter;

internal sealed class BestScoreStore(string path, Action<string> warn)
{
    private sealed record Save(int SchemaVersion, int BestScore);
    public int Read()
    {
        try
        {
            if (!File.Exists(path)) return 0;
            var value = ConfigJson.Read<Save>(File.ReadAllText(path));
            if (value.SchemaVersion != 1 || value.BestScore < 0) throw new InvalidDataException("Invalid best score format");
            return value.BestScore;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException or InvalidDataException)
        { warn($"最高分读取失败：{e.Message}"); return 0; }
    }
    public void Write(int bestScore)
    {
        try
        {
            var best = Math.Max(Read(), bestScore);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, JsonSerializer.Serialize(new Save(1, best), ConfigJson.Options));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        { warn($"最高分保存失败：{e.Message}"); }
    }
}
