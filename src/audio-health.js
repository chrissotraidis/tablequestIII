// Optional device-output APIs: these are distinct from the JS note scheduler.
const rounded = value => Number.isFinite(value) ? +value.toFixed(4) : null;
export function playbackHealth(ctx, now = performance.now()) {
    if (!ctx) return { playback: null, outputTimestamp: null };
    let playback = null, outputTimestamp = null;
    try {
        const stats = ctx.playbackStats;
        if (stats) playback = Object.fromEntries(['underrunDuration', 'underrunEvents', 'totalDuration', 'averageLatency', 'minimumLatency', 'maximumLatency'].map(key => [key, rounded(stats[key])]));
    } catch { /* experimental API may be unavailable or restricted */ }
    try {
        const stamp = ctx.getOutputTimestamp?.();
        if (stamp && stamp.performanceTime > 0) outputTimestamp = {
            contextTime: rounded(stamp.contextTime),
            ageMs: Math.round(now - stamp.performanceTime),
        };
    } catch { /* older browsers still get scheduler and bus diagnostics */ }
    return { playback, outputTimestamp, sampleRate: ctx.sampleRate,
        baseLatency: rounded(ctx.baseLatency), outputLatency: rounded(ctx.outputLatency) };
}

// Consecutive foreground samples only; background throttling and context
// replacement must never look like an output stall.
export function audioProgress(previous, current) {
    const comparable = previous && previous.generation === current.generation &&
        previous.state === 'running' && current.state === 'running' &&
        !previous.hidden && !current.hidden && current.at - previous.at >= 500 && current.at - previous.at < 2500;
    if (!comparable) return { stalled: false, underrunSeconds: 0, underrunEvents: 0 };
    const outputStalled = previous.outputTimestamp && current.outputTimestamp &&
        current.outputTimestamp.contextTime <= previous.outputTimestamp.contextTime && current.outputTimestamp.ageMs > 2000;
    return {
        stalled: current.contextTime <= previous.contextTime || !!outputStalled,
        underrunSeconds: Math.max(0, (current.playback?.underrunDuration ?? 0) - (previous.playback?.underrunDuration ?? 0)),
        underrunEvents: Math.max(0, (current.playback?.underrunEvents ?? 0) - (previous.playback?.underrunEvents ?? 0)),
    };
}
