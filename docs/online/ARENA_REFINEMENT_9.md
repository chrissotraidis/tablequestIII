# Arena refinement — bot paint economy

September 12, 2026. Continuing the active refinement goal.

Bots could choose an unaffordable roller over an affordable brush and remain engaged without ammunition. They also ignored owned weapon stations when searching for supplies, although those stations refill paint. Weapon selection now checks cost, empty bots break distant engagement to resupply, urgent needs replace unrelated patrol goals, and owned stations qualify as paint refills. Human rules, bot damage, aim error and reaction timings remain unchanged.

The weapon selector is tested over 640 inventory/paint/range combinations. A real server fixture places an empty bot near an owned table-leg station: it abandons its distant patrol destination, routes to that station and collects paint. These checks are part of `test:arena:refinement`. Eight-client and bot lifecycle regressions also pass.

Three one-minute seven-bot simulations are retained in `docs/evidence/arena-refinement-9`: baseline, initial response, and final station-refill behavior. The baseline had 13 eliminations and one bot at 81/850 empty-paint alive samples. The first revision exposed longer resupply travel (one bot at 275/895), prompting the owned-station fix. The final sample had 15 eliminations, all bots explored 69–109 cells and fired 23–50 times, zero sampled empty-paint time, no protocol errors, and 0.69 ms p95 server ticks. Random matches are not controlled causal comparisons; the deterministic selection and actual-refill fixtures establish the behavioral fix. This is not a claim of final human difficulty acceptance.

The normal local server was restarted with the new behavior. The broader refinement goal remains active.
