import { socket } from './socket';

/** Estimated (server clock - client clock), from NTP-style ping samples. */
let offset = 0;
let bestRtt = Infinity;

export const serverNow = (): number => Date.now() + offset;

/** Best measured round-trip time to the server in ms (Infinity before the first sample). */
export const getRtt = (): number => bestRtt;

function sample(): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    socket.timeout(2000).emit('time:sync', (err: unknown, serverTime: number) => {
      if (!err && typeof serverTime === 'number') {
        const rtt = Date.now() - t0;
        // Trust the lowest-latency sample most: its asymmetry error is smallest.
        if (rtt <= bestRtt * 1.5) {
          const o = serverTime + rtt / 2 - Date.now();
          offset = rtt <= bestRtt ? o : offset * 0.7 + o * 0.3;
          bestRtt = Math.min(bestRtt, rtt);
        }
      }
      resolve();
    });
  });
}

export async function syncClock(): Promise<void> {
  bestRtt = Infinity;
  for (let i = 0; i < 5; i++) {
    await sample();
    await new Promise((r) => setTimeout(r, 120));
  }
}

setInterval(() => {
  if (socket.connected) void sample();
}, 15_000);
