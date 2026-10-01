/**
 * Headless track verification: runs full 16-marble races on every track with several
 * seeds and checks that spawn positions are valid and that marbles reach the finish.
 *   npm run verify:tracks [-- trackId] [-- --seeds=5]
 */
import { PHYSICS } from '../src/shared/constants';
import { TRACKS, startSlots } from '../src/shared/tracks';
import { RaceSimulation } from '../src/server/game/RaceSimulation';

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'));
const seedCount = Number(args.find((a) => a.startsWith('--seeds='))?.split('=')[1] ?? 3);
const marbles = Number(args.find((a) => a.startsWith('--marbles='))?.split('=')[1] ?? 16);

let failed = false;
for (const track of TRACKS) {
  if (only && track.id !== only) continue;
  console.log(`== ${track.id}: ${track.width}x${track.height}, finish y=${track.finishY}, ${track.obstacles.length} obstacles`);
  // spawn sanity: inside the start chute, no overlaps
  const slots = startSlots(track, 16, PHYSICS.marble.radius);
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y) < PHYSICS.marble.radius * 2) {
        console.log(`  !! ${track.id}: spawn overlap ${i}/${j}`);
        failed = true;
      }
    }
  }
  const times: number[] = [];
  for (let seed = 1; seed <= seedCount; seed++) {
    const t0 = performance.now();
    const sim = new RaceSimulation(track.id, marbles, seed * 7919);
    let guard = 0;
    while (!sim.over && guard++ < 60 * 600) sim.step();
    const ranking = sim.ranking();
    const done = ranking.filter((r) => r.finished);
    const dnf = ranking.length - done.length;
    const first = done[0]?.timeMs ?? 0;
    const last = done[done.length - 1]?.timeMs ?? 0;
    times.push(last);
    const wall = performance.now() - t0;
    console.log(
      `${track.id.padEnd(9)} seed ${seed}: finished ${done.length}/${marbles} first ${(first / 1000).toFixed(1)}s last ${(last / 1000).toFixed(1)}s` +
        ` (sim ${(sim.timeMs / 1000).toFixed(0)}s in ${wall.toFixed(0)}ms)` + (dnf ? `  !! DNF ${dnf}` : ''),
    );
    if (dnf) {
      failed = true;
      const where = ranking.filter((r) => !r.finished).map((r) => {
        const p = sim.marblePosition(r.index);
        return `(${Math.round(p.x)},${Math.round(p.y)})`;
      });
      console.log('     stuck at', where.join(' '));
    }
    sim.dispose();
  }
}
process.exit(failed ? 1 : 0);
