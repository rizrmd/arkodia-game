export type ObjectState = { id: string; name: string; frame: number };
export type ObjectTransition = {
  from: string;
  to: string;
  startFrame: number;
  endFrame: number;
  fps: number;
};
export type NamedObjectState = {
  id: string;
  name: string;
  values: ObjectState[];
  transitions?: ObjectTransition[];
  /** Empty means data only; omitted is the legacy all-layer state. */
  partIds?: string[];
};
export type StateAnimation = {
  stateDefinitions?: NamedObjectState[];
  image?: string;
  states?: ObjectState[];
  transitions?: ObjectTransition[];
};
export function transitionDuration(clip: ObjectTransition) {
  return Math.abs(clip.endFrame - clip.startFrame) / clip.fps;
}
export function transitionFrame(
  clip: ObjectTransition,
  seconds: number,
  start = clip.startFrame,
) {
  return (
    start +
    Math.sign(clip.endFrame - start) *
      Math.min(Math.abs(clip.endFrame - start), Math.max(0, seconds) * clip.fps)
  );
}
function validValues(config: StateAnimation) {
  const states = config.states ?? [];
  const ids = new Set(states.map((s) => s.id));
  const pairs = (config.transitions ?? []).map((c) => c.from + ">" + c.to);
  return (
    ids.size === states.length &&
    new Set(pairs).size === pairs.length &&
    states.every(
      (s) => s.id && s.name.trim() && Number.isInteger(s.frame) && s.frame >= 0,
    ) &&
    (config.transitions ?? []).every(
      (c) =>
        ids.has(c.from) &&
        ids.has(c.to) &&
        c.from !== c.to &&
        Number.isInteger(c.startFrame) &&
        c.startFrame >= 0 &&
        Number.isInteger(c.endFrame) &&
        c.endFrame >= 0 &&
        Number.isFinite(c.fps) &&
        c.fps >= 1 &&
        c.fps <= 120,
    )
  );
}

/** Legacy documents remain readable without rewriting their history or instance IDs. */
export function namedObjectStates(config: StateAnimation): NamedObjectState[] {
  if (config.stateDefinitions !== undefined) return config.stateDefinitions;
  if (config.states === undefined) return [];
  return [
    {
      id: "legacy",
      name: /(?:^|\/)gate-sheet\.png(?:\?|$)/.test(config.image ?? "")
        ? "Position"
        : "Current state",
      values: config.states,
      transitions: config.transitions,
    },
  ];
}
export function selectedStateValue(
  state: NamedObjectState,
  values: Record<string, string> = {},
  legacy?: string,
) {
  const requested =
    values[state.id] ?? (state.id === "legacy" ? legacy : undefined);
  return state.values.find((v) => v.id === requested) ?? state.values[0];
}
function validateStateAnimation(
  config: StateAnimation & { parts?: { id: string }[] },
) {
  if (!validValues(config)) return false;
  const states = namedObjectStates(config);
  const ids = new Set(states.map((s) => s.id));
  const names = new Set(states.map((s) => s.name.trim().toLowerCase()));
  const assigned = new Set<string>();
  if (ids.size !== states.length || names.size !== states.length) return false;
  return states.every((state) => {
    if (
      typeof state.id !== "string" ||
      !state.id ||
      !state.name.trim() ||
      !Array.isArray(state.values) ||
      !validValues({ states: state.values, transitions: state.transitions })
    )
      return false;
    if (state.partIds !== undefined && !Array.isArray(state.partIds))
      return false;
    const parts = state.partIds ?? config.parts?.map((p) => p.id) ?? [];
    return parts.every((id) => {
      if (
        typeof id !== "string" ||
        !id ||
        assigned.has(id) ||
        (config.parts && !config.parts.some((p) => p.id === id))
      )
        return false;
      assigned.add(id);
      return true;
    });
  });
}
/** Imported documents are untrusted; validation never mutates or throws. */
export function validStateAnimation(
  config: StateAnimation & { parts?: { id: string }[] },
) {
  try {
    return validateStateAnimation(config);
  } catch {
    return false;
  }
}
type Playback = {
  value: string;
  frame: number;
  start: number;
  time: number;
  clip?: ObjectTransition;
};
/** One controller per instance; each named state has an independent transition clock. */
export class ObjectStatePlayback {
  private definition?: StateAnimation;
  private playback = new Map<string, Playback>();
  frames(
    config: StateAnimation,
    values: Record<string, string> = {},
    legacy?: string,
    seconds = 0,
  ) {
    if (this.definition !== config) {
      this.definition = config;
      this.playback.clear();
    }
    const frames: Record<string, number> = {};
    for (const state of namedObjectStates(config)) {
      const value = selectedStateValue(state, values, legacy);
      if (!value) continue;
      let p = this.playback.get(state.id);
      if (!p) {
        p = {
          value: value.id,
          frame: value.frame,
          start: value.frame,
          time: seconds,
        };
        this.playback.set(state.id, p);
      }
      // Advance before accepting a new target, including between rendered ticks.
      const advance = () => {
        if (!p!.clip) return;
        p!.frame = transitionFrame(p!.clip, seconds - p!.time, p!.start);
        if (
          seconds - p!.time >=
          Math.abs(p!.clip.endFrame - p!.start) / p!.clip.fps
        ) {
          p!.frame =
            state.values.find((v) => v.id === p!.value)?.frame ??
            p!.clip.endFrame;
          p!.clip = undefined;
        }
      };
      advance();
      if (p.value !== value.id) {
        p.clip = state.transitions?.find(
          (c) => c.from === p!.value && c.to === value.id,
        );
        p.start = p.frame;
        if (
          p.clip &&
          p.frame === state.values.find((v) => v.id === p!.value)?.frame
        )
          p.start = p.clip.startFrame;
        p.value = value.id;
        p.time = seconds;
        p.frame = p.clip ? p.start : value.frame;
      }
      frames[state.id] = p.clip ? p.frame : value.frame;
    }
    return frames;
  }
}
export function stateFrameForPart(
  config: StateAnimation,
  frames: Record<string, number>,
  partId: string,
) {
  const state = namedObjectStates(config).find(
    (s) => s.partIds === undefined || s.partIds.includes(partId),
  );
  return state ? frames[state.id] : undefined;
}

/** Gameplay API: changing one named state preserves every other current value. */
export class ObjectStateController {
  private values: Record<string, string>;
  private playback = new ObjectStatePlayback();
  constructor(
    public readonly definition: StateAnimation,
    values: Record<string, string> = {},
    private legacy?: string,
  ) {
    if (!validStateAnimation(definition))
      throw new Error("Invalid object states");
    this.values = { ...values };
  }
  get current() {
    return Object.fromEntries(
      namedObjectStates(this.definition).flatMap((state) => {
        const value = selectedStateValue(state, this.values, this.legacy);
        return value ? [[state.id, value.id]] : [];
      }),
    );
  }
  setState(id: string, value: string) {
    const state = namedObjectStates(this.definition).find((s) => s.id === id);
    if (!state?.values.some((v) => v.id === value)) return false;
    this.values = { ...this.values, [id]: value };
    return true;
  }
  frames(seconds: number) {
    return this.playback.frames(
      this.definition,
      this.values,
      this.legacy,
      seconds,
    );
  }
}
