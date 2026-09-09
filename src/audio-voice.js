// Every synthesized note owns its effect nodes. Disconnect them when all of
// its sources end instead of leaving cleanup to the browser's GC schedule.
const counts = new WeakMap();
export function voiceCounts(ctx) { return counts.get(ctx) || { voices: 0, nodes: 0 }; }
export function createVoice(ctx) {
    let count = counts.get(ctx);
    if (!count) { count = { voices: 0, nodes: 0 }; counts.set(ctx, count); }
    count.voices++;
    const nodes = [], sources = [];
    let disposed = false;
    function dispose() {
        if (disposed) return;
        disposed = true;
        for (const node of nodes) node.disconnect();
        count.voices--; count.nodes -= nodes.length;
        nodes.length = 0; sources.length = 0;
    }
    return {
        create(method, ...args) {
            const node = ctx[method](...args);
            nodes.push(node); count.nodes++;
            if (typeof node.start === 'function') sources.push(node);
            return node;
        },
        finish() {
            let remaining = sources.length;
            if (!remaining) { dispose(); return; }
            for (const source of sources) source.addEventListener('ended', () => {
                if (--remaining === 0) dispose();
            }, { once: true });
        },
        cancel() {
            for (const source of sources) { try { source.stop(); } catch { /* may not have started */ } }
            dispose();
        },
    };
}
