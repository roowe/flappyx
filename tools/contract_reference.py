"""Executable M1 oracle; production TS/C# cores must independently pass the fixtures."""

from dataclasses import dataclass
from fractions import Fraction

RULES = {
    "firstFlapStartsAndFlaps": True, "flapResetsVelocity": True,
    "maxFlapsPerTick": 1, "movementOrder": "positionThenGravity",
    "collisionBeforeScore": True,
    "collisionPriority": ["ground", "ceiling", "upperPipe", "lowerPipe"],
    "pipeCollisionShape": "axisAlignedHitbox", "pipeTouchIsCollision": True,
    "floorAndCeilingShape": "unrotatedDisplayBounds",
    "scoreWhen": "pipeRightStrictlyLessThanHitboxLeft",
    "recycleWhen": "pipeRightStrictlyLessThanZero",
    "restartTarget": "ready", "restartInputFlaps": False, "restartResetsTick": True,
}


def validate_rules(config: dict) -> None:
    if config["rules"] != RULES:
        raise ValueError("M1 rules changed; update the contract and oracle together")
    expected = {"pauseOnBlur": True, "requireExplicitResume": True, "clearAccumulatedTimeOnResume": True}
    if config["lifecycle"] != expected or config["simulation"]["overflowTimePolicy"] != "discardWholeTicksKeepFraction":
        raise ValueError("Unsupported lifecycle or time accumulation rule")
    if config["death"]["guardStartsAt"] != "deathTick":
        raise ValueError("Restart guard must start at the death tick")
    if config["random"]["algorithm"] != "xorshift32" or config["random"]["zeroSeedPolicy"] != "reject" or config["random"]["gapMapping"] != "minPlusUint32ModuloInclusiveRange":
        raise ValueError("Unsupported random contract")


def xorshift32(value: int) -> int:
    if not 0 < value <= 0xffffffff:
        raise ValueError("Seed must be a nonzero uint32")
    value ^= (value << 13) & 0xffffffff
    value ^= value >> 17
    value ^= (value << 5) & 0xffffffff
    return value


def pipe_collision(config: dict, y: float, pipe_x: float, center_y: float, offset: dict | None = None) -> str | None:
    bird, pipes = config["bird"], config["pipes"]
    hitbox = bird["hitbox"]
    dx, dy = (hitbox["offsetX"], hitbox["offsetY"]) if offset is None else (offset["x"], offset["y"])
    if abs(pipe_x - (bird["x"] + dx)) > pipes["width"] / 2 + hitbox["width"] / 2:
        return None
    if y + dy - hitbox["height"] / 2 <= center_y - pipes["gapHeight"] / 2:
        return "upperPipe"
    if y + dy + hitbox["height"] / 2 >= center_y + pipes["gapHeight"] / 2:
        return "lowerPipe"
    return None


def score_delta(config: dict, case: dict) -> int:
    hitbox = config["bird"]["hitbox"]
    left = config["bird"]["x"] + case.get("hitboxOffsetX", hitbox["offsetX"]) - hitbox["width"] / 2
    return int(case["state"] == "playing" and not case["collided"] and not case["passed"] and case["pipeX"] + config["pipes"]["width"] / 2 < left)


@dataclass
class Pipe:
    id: int
    x: float
    gap_center: int
    passed: bool = False


class ReferenceGame:
    def __init__(self, config: dict, initial: dict, flap_ticks: list, gap_centers: list | None = None, pipes: list | None = None):
        self.config = config
        self.flap_ticks = set(flap_ticks)
        self.gap_centers = gap_centers
        self.random_state = initial.get("seed", config["random"]["defaultSeed"])
        self.consumed = 0
        self.tick = initial.get("tick", 0)
        self.state = initial.get("state", "ready")
        self.y = initial.get("y", config["bird"]["initialY"])
        self.velocity = initial.get("velocityY", 0)
        self.score = initial.get("score", 0)
        self.best = initial.get("bestScore", 0)
        self.death_tick = initial.get("deathTick")
        self.death_reason = None
        self.game_over_tick = None
        self.score_ticks = []
        self.ignored_flaps = []
        if pipes is not None:
            self.pipes = [Pipe(i, p["x"], p["gapCenterY"], p.get("passed", False)) for i, p in enumerate(pipes)]
        else:
            p = config["pipes"]
            start = initial.get("firstPipeX", p["firstCenterX"])
            self.pipes = [Pipe(i, start + i * (p["width"] + p["spacing"]), self.next_gap(), initial.get("pipesPassed", False)) for i in range(p["activeCount"])]

    def next_gap(self) -> int:
        p = self.config["pipes"]
        if self.gap_centers is None:
            self.random_state = xorshift32(self.random_state)
            value = p["gapCenterMin"] + self.random_state % (p["gapCenterMax"] - p["gapCenterMin"] + 1)
        else:
            if self.consumed == len(self.gap_centers):
                raise ValueError("Fixture exhausted its explicit pipe heights")
            value = self.gap_centers[self.consumed]
            if not isinstance(value, int) or not p["gapCenterMin"] <= value <= p["gapCenterMax"]:
                raise ValueError("Fixture pipe opening must be an integer in the configured range")
        self.consumed += 1
        return value

    def collision(self) -> str | None:
        bird = self.config["bird"]
        if self.y + bird["displayHeight"] / 2 >= self.config["ground"]["topY"]:
            return "ground"
        if self.y - bird["displayHeight"] / 2 <= 0:
            return "ceiling"
        hits = [pipe_collision(self.config, self.y, p.x, p.gap_center) for p in self.pipes]
        for reason in self.config["rules"]["collisionPriority"][2:]:
            if reason in hits:
                return reason
        return None

    def land(self) -> None:
        self.y = self.config["ground"]["topY"] - self.config["bird"]["displayHeight"] / 2
        self.velocity = 0
        self.state = "gameOver"
        self.game_over_tick = self.tick
        self.best = max(self.best, self.score)

    def step(self) -> None:
        self.tick += 1
        if self.tick in self.flap_ticks:
            if self.state in ("ready", "playing"):
                self.state = "playing"
                self.velocity = self.config["bird"]["flapVelocityPerTick"]
            else:
                self.ignored_flaps.append(self.tick)
        if self.state == "playing":
            p = self.config["pipes"]
            for pipe in self.pipes:
                pipe.x -= p["scrollPerTick"]
            self.y += self.velocity
            self.velocity += self.config["bird"]["gravityPerTickSquared"]
            reason = self.collision()
            if reason is not None:
                self.death_tick, self.death_reason = self.tick, reason
                self.velocity = self.config["death"]["entryVelocityPerTick"]
                if reason == "ground":
                    self.land()
                else:
                    self.state = "dying"
                return
            for pipe in self.pipes:
                query = {"state": self.state, "collided": False, "passed": pipe.passed, "pipeX": pipe.x}
                if score_delta(self.config, query):
                    self.score += 1
                    self.score_ticks.append(self.tick)
                    pipe.passed = True
            while self.pipes and self.pipes[0].x + p["width"] / 2 < 0:
                pipe = self.pipes.pop(0)
                last_x = self.pipes[-1].x if self.pipes else pipe.x
                pipe.x = last_x + p["width"] + p["spacing"]
                pipe.gap_center, pipe.passed = self.next_gap(), False
                self.pipes.append(pipe)
        elif self.state == "dying":
            self.y += self.velocity
            self.velocity += self.config["death"]["gravityPerTickSquared"]
            if self.y + self.config["bird"]["displayHeight"] / 2 >= self.config["ground"]["topY"]:
                self.land()

    def restart(self) -> bool:
        if self.state != "gameOver" or self.tick < self.death_tick + self.config["death"]["restartGuardTicks"]:
            return False
        best = self.best
        self.__init__(self.config, {"bestScore": best}, [], self.gap_centers)
        return True

    def snapshot(self) -> dict:
        return {
            "tick": self.tick, "state": self.state, "y": self.y, "birdY": self.y,
            "velocityY": self.velocity, "score": self.score, "bestScore": self.best,
            "firstPipeX": self.pipes[0].x if self.pipes else None,
            "pipeCount": len(self.pipes), "pipeIds": [p.id for p in self.pipes],
            "pipeXs": [p.x for p in self.pipes], "pipeGapCenters": [p.gap_center for p in self.pipes],
            "pipePassed": [p.passed for p in self.pipes], "consumedGapCenters": self.consumed,
            "pipesPassed": any(p.passed for p in self.pipes),
        }

    def result(self) -> dict:
        return {
            "deathTick": self.death_tick, "deathReason": self.death_reason,
            "gameOverTick": self.game_over_tick, "scoreTicks": self.score_ticks,
            "restartAllowedTick": None if self.death_tick is None else self.death_tick + self.config["death"]["restartGuardTicks"],
            "score": self.score, "finalScore": self.score, "bestScore": self.best,
            "ignoredFlapTicks": self.ignored_flaps,
        }


class ReferenceClock:
    def __init__(self, game: ReferenceGame):
        self.game = game
        self.accumulated = Fraction(0)
        self.paused = False

    def event(self, action: str) -> None:
        if action == "blur":
            self.paused = True
        elif action == "resume":
            self.paused = False
            self.accumulated = Fraction(0)
        elif action != "focus":
            raise ValueError(f"Unknown lifecycle event: {action}")

    def frame(self, milliseconds) -> int:
        if self.paused:
            return 0
        simulation = self.game.config["simulation"]
        self.accumulated += Fraction(str(milliseconds)) * simulation["tickRate"] / 1000
        whole_ticks = int(self.accumulated)
        processed = min(whole_ticks, simulation["maxCatchUpTicks"])
        for _ in range(processed):
            self.game.step()
        self.accumulated -= whole_ticks
        return processed
