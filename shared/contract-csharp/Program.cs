using System.Text.Json;
using System.Text.Json.Serialization;
using FlappyX.Core;
using FlappyX.Contract;

var root = args[0];
var c = ConfigJson.Load(File.ReadAllText(Path.Combine(root, "shared/config/gameplay.json")));
using var casesDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "shared/fixtures/gameplay-cases.json")));
using var replayDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "shared/fixtures/replay-baseline.json")));
using var lifecycleDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "shared/fixtures/lifecycle-cases.json")));
var cases = casesDoc.RootElement;
var replay = replayDoc.RootElement;
var lifecycle = lifecycleDoc.RootElement;
int[] Ints(JsonElement array) => array.EnumerateArray().Select(v => v.GetInt32()).ToArray();
object Run(Game game, int ticks, int[] flapTicks, double? fps = null)
{
    var flaps = flapTicks.ToHashSet();
    var snapshots = new List<object> { game.Snapshot() };
    var events = new List<object>();
    var ignored = new List<int>();
    void Step()
    {
        var flap = flaps.Contains(game.Tick + 1);
        if (flap && game.State is GameState.Dying or GameState.GameOver) ignored.Add(game.Tick + 1);
        events.Add(new { tick = game.Tick + 1, events = game.Step(flap) });
        snapshots.Add(game.Snapshot());
    }
    if (fps is { } rate)
    {
        var clock = new FixedClock(c.Simulation);
        for (var frame = 0; frame < ticks * rate / c.Simulation.TickRate; frame++) clock.Frame(1000 / rate, Step);
    }
    else for (var i = 0; i < ticks; i++) Step();
    return new { snapshots, events, ignoredFlapTicks = ignored };
}
var runs = new Dictionary<string, object>();
var items = new[] { cases.GetProperty("trajectory") }.Concat(cases.GetProperty("stepCases").EnumerateArray()).Append(cases.GetProperty("recycle")).ToArray();
for (var i = 0; i < items.Length; i++)
{
    var item = items[i];
    var ticks = item.GetProperty("snapshots").EnumerateArray().Max(s => s.GetProperty("tick").GetInt32());
    runs[$"case{i}"] = Run(new Game(c, ConfigJson.Read<GameOptions>(item.GetRawText())), ticks, Ints(item.GetProperty("flapTicks")));
}
foreach (var fps in Ints(replay.GetProperty("renderFps")))
    runs[$"fps{fps}"] = Run(new Game(c, new GameOptions
    {
        Initial = new InitialState { Seed = replay.GetProperty("seed").GetUInt32(), BestScore = replay.GetProperty("initialBestScore").GetInt32() },
        PipeGapCenters = Ints(replay.GetProperty("pipeGapCenters"))
    }), replay.GetProperty("totalTicks").GetInt32(), Ints(replay.GetProperty("flapTicks")), fps);
var collisionQueries = cases.GetProperty("collisionQueries").EnumerateArray().Select(q =>
{
    double? ox = null, oy = null;
    if (q.TryGetProperty("hitboxOffset", out var o)) { ox = o.GetProperty("x").GetDouble(); oy = o.GetProperty("y").GetDouble(); }
    return Game.PipeCollision(c, q.GetProperty("birdY").GetDouble(), q.GetProperty("pipeX").GetDouble(), q.GetProperty("gapCenterY").GetDouble(), ox, oy) is not null;
}).ToArray();
var scoreQueries = cases.GetProperty("scoreQueries").EnumerateArray().Select(q => Game.ScoreDelta(c,
    ConfigJson.Read<GameState>(q.GetProperty("state").GetRawText()), q.GetProperty("pipeX").GetDouble(),
    q.GetProperty("passed").GetBoolean(), q.GetProperty("collided").GetBoolean(),
    q.TryGetProperty("hitboxOffsetX", out var ox) ? ox.GetDouble() : null)).ToArray();
var random = new List<uint>();
var seed = cases.GetProperty("random").GetProperty("seed").GetUInt32();
foreach (var _ in cases.GetProperty("random").GetProperty("uint32Sequence").EnumerateArray()) { seed = Game.Xorshift32(seed); random.Add(seed); }
var zeroRejected = false;
try { Game.Xorshift32(0); } catch (ArgumentOutOfRangeException) { zeroRejected = true; }
var model = new Game(c, new GameOptions { Initial = ConfigJson.Read<InitialState>(lifecycle.GetProperty("initial").GetRawText()), Pipes = Array.Empty<Pipe>() });
var fixedClock = new FixedClock(c.Simulation);
var lifecycleResults = new List<object>();
foreach (var action in lifecycle.GetProperty("steps").EnumerateArray())
{
    if (action.TryGetProperty("event", out var e))
    {
        if (e.GetString() == "blur") fixedClock.Pause();
        if (e.GetString() == "resume") fixedClock.Resume();
    }
    var processed = action.TryGetProperty("elapsedMilliseconds", out var ms) ? fixedClock.Frame(ms.GetDouble(), () => model.Step()) : 0;
    lifecycleResults.Add(new { snapshot = model.Snapshot(), processedTicks = processed, fixedClock.AccumulatedTicks, fixedClock.Paused });
}
var restart = new Game(c, new GameOptions { Initial = ConfigJson.Read<InitialState>(cases.GetProperty("restart").GetProperty("initial").GetRawText()) });
var accepted = new List<bool>();
foreach (var action in cases.GetProperty("restart").GetProperty("actions").EnumerateArray())
{
    while (restart.Tick < action.GetProperty("tick").GetInt32()) restart.Step();
    accepted.Add(restart.Restart());
}
var restartSnapshot = restart.Snapshot();
var rounds = new List<object>();
for (var round = 0; round < 10; round++)
{
    restart.Step(true);
    while (!restart.CanRestart) restart.Step();
    restart.Restart();
    rounds.Add(restart.Snapshot());
}
var steady = new Game(c);
for (var tick = 1; tick <= 210; tick++) steady.Step((tick - 1) % 24 == 0);
var output = new { runs, collisionQueries, scoreQueries, random, zeroRejected, lifecycle = lifecycleResults,
    restart = new { accepted, snapshot = restartSnapshot, rounds }, steady = steady.Snapshot() };
// 只有事件省略空字段；快照保留 null，便于与 TS 的完整字段比较。
var options = new JsonSerializerOptions(ConfigJson.Options);
options.TypeInfoResolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver
{
    Modifiers = { info => { if (info.Type == typeof(GameEvent)) foreach (var p in info.Properties) p.ShouldSerialize = (_, value) => value is not null; } }
};
File.WriteAllText(args[1], JsonSerializer.Serialize(output, options));
Console.WriteLine($"C# corpus: {runs.Count} traces, 3 render rates, lifecycle and 10 restarts");
