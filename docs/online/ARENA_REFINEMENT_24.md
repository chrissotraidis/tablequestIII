# Arena refinement 24 — playtest feedback: jitter, doors, tools, menus, password

September 26, 2026. From a hands-on playtest: movement felt more jittery than before, doors did not seem to work, the held/picked-up sprayer looked like red cylinders, the lobby dropdowns felt unpolished, and a VPS copy should be closable with a password.

## Jitter (the real cause)

Measured in a real browser by recording the drawn camera every frame while walking straight at 3.7 m/s: frame-to-frame speed ranged 3.08–3.95 m/s (p10–p90) with a 5.18 max — ±15% judder. The fixed 30 Hz prediction steps came from a separate timer that did not line up with display frames, so the camera stalled at the end of a step and then jumped. Steps are now taken inside the render loop from a time accumulator and the camera blends between the last two steps by the leftover fraction. After: p10, p50 and p90 are all 3.70 m/s with no stalls, on localhost and through the 40–100 ms jitter relay. Remote staff now use the sub-millisecond performance clock (Date.now's 1 ms steps added ~6% speed noise); three bots through the jitter relay showed 0 freezes in ~2,100 frames.

## Doors

They worked only by pressing E within 1.65 m; walking into one did nothing, unlike the campaign. Now: walking into a closed door opens it, E opens or closes the door you face, and open doors swing shut 4 s after nobody is near (never on someone). Tested in `test_arena_connection` (walk-in opens, leaving closes).

## Sprayer and other tools

Other players' held tools and the sprayer/nail gun/roller floor stations used the old placeholder models (the sprayer was a red can and cylinders). Held and floor tools now use the same detailed models as the first-person view. Each model is built once; instances share geometry and materials and copy only the painted parts, so each staff member's tool shows their paint. All held tools were also attached upside down (invisible with the old shapes); a roll fixes it. Resource test: shared models are never released, owned parts are released exactly once.

## Menus

Staff, paint, preview pose, held-tool preview, bot count and crosshair are now in-theme choice rows (paint as swatches, tools with icons) instead of native dropdowns. The native selects stay hidden as the source of truth, so existing handlers are unchanged. The main-menu Arena is bundled into `dist/index.html`; it was rebuilt and checked there, not only on `/arena/`.

## Password for a public host

`TQ_ACCESS_PASSWORD` gates every page, API call and Arena socket behind a styled sign-in page (30-day HttpOnly cookie, attempt limit, no open redirect); `/health` stays open. Unset, nothing changes. Tested over HTTP and in a real browser.

## Stability and performance

Full room (one browser, seven bots, 65 s): frame p95 17.1–17.7 ms (display rate), textures constant at 68, geometries 316–333 without growth, heap cycling 27–55 MB, no errors; server tick p95 0.65 ms. All suites, eight-browser smoke, classic and level checks pass.

## Not verified

Feel with real players and mouse input, and audio, remain for the next playtest.
