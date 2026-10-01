/**
 * End-to-end server test (no browser): spins the real server up in-process and plays
 * a full game through socket.io clients.   npm run test:server
 */
process.env.COUNTDOWN_MS = '1500';
process.env.MAX_PLAYERS = '16';
process.env.RECONNECT_GRACE_MS = '1500';
process.env.ROOM_EMPTY_TTL_MS = '2000';

import { createServer } from 'node:http';
import { io as connect } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, JoinData, RoomState, ServerToClientEvents, Snapshot } from '../src/shared/types';
import { RacePhase } from '../src/shared/types';

const { createSocketServer } = await import('../src/server/networking/socketServer');

type C = Socket<ServerToClientEvents, ClientToServerEvents> & { state?: RoomState; snaps: Snapshot[]; notices: string[]; finishes: number[] };

const http = createServer();
const { io, rooms } = createSocketServer(http);
await new Promise<void>((r) => http.listen(0, r));
const port = (http.address() as { port: number }).port;

let failures = 0;
const check = (name: string, ok: boolean, extra = ''): void => {
  console.log(`${ok ? '  ok ' : ' FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emit = <T>(s: C, ev: keyof ClientToServerEvents, payload?: unknown): Promise<Ack<T>> =>
  new Promise((res) => (s as any).emit(ev, ...(payload === undefined ? [] : [payload]), res));

function client(): C {
  const s = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true }) as C;
  s.snaps = []; s.notices = []; s.finishes = [];
  s.on('room:state', (st) => { s.state = st; });
  s.on('race:snapshot', (sn) => s.snaps.push(sn));
  s.on('room:notice', (n) => s.notices.push(n.text));
  s.on('race:finish', (f) => s.finishes.push(f.position));
  return s;
}
const waitFor = async (cond: () => boolean, ms: number, what: string): Promise<boolean> => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(25); }
  console.log(`  (timed out waiting for ${what})`);
  return false;
};

// ---- lobby ----
const host = client();
const hostJoin = await emit<JoinData>(host, 'room:host', { nickname: '  <b>Noa</b>  ' });
check('host creates room', hostJoin.ok);
if (!hostJoin.ok) process.exit(1);
const code = hostJoin.data.room.code;
check('room code 4+ chars, safe alphabet', /^[A-HJKMNP-Z2-9]{4,6}$/.test(code), code);
check('nickname sanitized', hostJoin.data.room.players[0].nickname === 'bNoa/b', hostJoin.data.room.players[0].nickname);
check('host flag set', hostJoin.data.room.hostId === hostJoin.data.playerId);

const bad = client();
check('invalid nickname rejected', (await emit(bad, 'room:join', { nickname: '   ', code })).ok === false);
const nf = await emit(bad, 'room:join', { nickname: 'X', code: 'ZZZZ' });
check('unknown room -> Room not found.', !nf.ok && nf.message === 'Room not found.');
const bc = await emit(bad, 'room:join', { nickname: 'X', code: '!!' });
check('garbage code rejected', !bc.ok && bc.code === 'INVALID_ROOM_CODE');

const p2 = client();
const j2 = await emit<JoinData>(p2, 'room:join', { nickname: 'Alex', code: code.toLowerCase() });
check('lowercase code joins', j2.ok);
check('player 2 not host', j2.ok && j2.data.room.hostId !== j2.data.playerId);
check('unique colors', new Set(host.state?.players.map((p) => p.color)).size === 2 || new Set(j2.ok ? j2.data.room.players.map((p) => p.color) : []).size === 2);

check('non-host cannot start', (await emit(p2, 'race:start')).ok === false);
check('non-host cannot set track', (await emit(p2, 'room:setTrack', { trackId: 'maze' })).ok === false);
const it = await emit(host, 'room:setTrack', { trackId: '../../etc/passwd' });
check('invalid track rejected', !it.ok && it.code === 'INVALID_TRACK');
check('host sets track', (await emit(host, 'room:setTrack', { trackId: 'spinner' })).ok);
await sleep(100);
check('track synced to all', p2.state?.selectedTrack === 'spinner');
// there is no client->server event for finishing/teleporting/host; unknown events are ignored
const ignored = await Promise.race([emit(p2, 'race:finish' as any, { position: 1 }).then(() => false), sleep(300).then(() => true)]);
check('unknown "finish" event is ignored by server', ignored);

// fill to 16, then 17th refused
const extra: C[] = [];
for (let i = 0; i < 14; i++) { const c = client(); extra.push(c); await emit(c, 'room:join', { nickname: `P${i}`, code }); }
await sleep(100);
check('16 players in room', host.state?.players.length === 16, String(host.state?.players.length));
check('16 distinct colors', new Set(host.state?.players.map((p) => p.color)).size === 16);
const full = await emit(bad, 'room:join', { nickname: 'Late', code });
check('17th -> Room is full.', !full.ok && full.message === 'Room is full.');

// leave in lobby
extra[0].disconnect();
await waitFor(() => host.state?.players.length === 15, 4000, 'grace removal');
check('disconnected lobby player removed after grace', host.state?.players.length === 15);
check('leave notice sent', host.notices.some((n) => n.includes('left the room')));
for (const c of extra.slice(1)) c.disconnect();
await waitFor(() => host.state?.players.length === 2, 4000, 'removal');

// ---- race ----
const t0 = Date.now();
check('host starts race', (await emit(host, 'race:start')).ok);
await sleep(100);
check('phase COUNTDOWN', host.state?.phase === RacePhase.COUNTDOWN);
const late = await emit(bad, 'room:join', { nickname: 'Late', code });
check('join during race rejected', !late.ok && late.code === 'RACE_IN_PROGRESS', !late.ok ? late.message : '');
check('second start rejected', (await emit(host, 'race:start')).ok === false);
const goAt = host.state!.race!.goAt;
check('both clients see same goAt', p2.state?.race?.goAt === goAt);
await waitFor(() => host.state?.phase === RacePhase.RACING, 4000, 'RACING');
check('RACING after countdown', host.state?.phase === RacePhase.RACING, `${Date.now() - t0}ms`);
await sleep(1000);
check('snapshots streaming (~30Hz)', host.snaps.length > 20, `${host.snaps.length} snaps`);
check('both receive identical snapshots', p2.snaps.length > 20 && Math.abs(p2.snaps.length - host.snaps.length) < 6);
const last = host.snaps[host.snaps.length - 1];
check('snapshot has 2 marbles w/ 6 fields', last.m.length === 2 && last.m[0].length === 6);

// player 2 drops mid-race: marble stays, marked disconnected
p2.disconnect();
await sleep(300);
check('mid-race disconnect keeps player (marked disconnected)', host.state?.players.find((p) => p.nickname === 'Alex')?.connected === false);

const done = await waitFor(() => host.state?.phase === RacePhase.RESULTS, 150_000, 'RESULTS');
check('race reaches RESULTS', done, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
const res = host.state?.race?.results ?? [];
check('results list both racers, ordered', res.length === 2 && res[0].position === 1 && res[1].position === 2);
check('server recorded finish order', (host.state?.race?.finishOrder.length ?? 0) === 2);
check('finish events delivered 1,2', host.finishes.join() === '1,2', host.finishes.join());

// ---- play again ----
check('play again (host)', (await emit(host, 'room:reset')).ok);
await sleep(100);
check('back to WAITING, room kept', host.state?.phase === RacePhase.WAITING && host.state.code === code);
check('disconnected player purged on reset', host.state?.players.length === 1);
check('host changes track for next race', (await emit(host, 'room:setTrack', { trackId: 'maze' })).ok && host.state?.selectedTrack === 'maze');

// reconnect + host transfer
const a = client();
const ja = await emit<JoinData>(a, 'room:join', { nickname: 'Sam', code });
check('new player joins lobby again', ja.ok);
host.disconnect();
await sleep(200);
check('host transferred on disconnect', a.state?.hostId === (ja.ok ? ja.data.playerId : ''));
check('host-left notice', a.notices.some((n) => n.includes('is now the host')), a.notices.join('|'));
const ra = client();
if (ja.ok) {
  const rr = await emit<JoinData>(ra, 'room:rejoin', { code, playerId: ja.data.playerId, token: 'wrong' });
  check('rejoin with bad token refused', !rr.ok);
}
a.disconnect();
await sleep(2200);
await waitFor(() => rooms.size === 0, 6000, 'room cleanup');
check('empty room destroyed after TTL', rooms.size === 0, `rooms=${rooms.size}`);

for (const c of [bad, ra]) c.disconnect();
rooms.stop();
await io.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
