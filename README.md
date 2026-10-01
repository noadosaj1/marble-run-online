# 🎱 Marble Race

A multiplayer 2D marble race party game for the browser. Pick a name, host or join a room with a
short code, choose a track, and watch up to 16 marbles tumble through a physics-driven obstacle
course. **You don't control your marble** — the physics decide.

* No accounts, no login. Open the page and play.
* **Server-authoritative**: the Node server runs the physics (Matter.js) and decides the finishing
  order. Browsers only render what the server tells them.
* 5 tracks: **The Drop**, **The Spinner**, **The Maze**, **Chaos Factory**, **The Gauntlet**.
* TypeScript everywhere · React + Vite + Canvas client · Node + Socket.IO server.

## Quick start

```bash
npm install
npm run dev
```

This starts both processes:

| Process | URL | Notes |
| --- | --- | --- |
| Vite client | http://localhost:5173 | hot reload |
| Game server | http://localhost:3001 | Socket.IO + `/health` |

In dev the client talks to `http://<page-host>:3001`, so a phone on your LAN can join with
`http://<your-computer-ip>:5173`.

### Testing multiplayer locally

1. Open http://localhost:5173 in one tab, enter a name, click **HOST GAME**.
2. Open a second tab (or a private window / your phone), enter another name, click **JOIN GAME** and
   type the room code (lower case is fine). The lobby's **Copy invite link** button produces a URL
   that pre-fills the code.
3. As host, click **CHANGE TRACK**, pick a track, then **START RACE**.
4. After the results, the host clicks **PLAY AGAIN** (back to the lobby, room kept) or **CHANGE TRACK**.

Useful scripts:

```bash
npm run typecheck      # client + server + shared, strict TypeScript
npm run verify:tracks  # headless: 16-marble races on every track, checks everyone finishes
npm run test:server    # end-to-end socket test of lobby, validation, race, results, reconnect
```

`verify:tracks` accepts a track id and options: `npm run verify:tracks -- maze --seeds=10 --marbles=16`.

## Production build

```bash
npm run build     # typecheck, then client -> dist/, server -> dist-server/index.js
npm start         # node dist-server/index.js
```

By default the server also serves `dist/`, so one Node process hosts the whole game
(`SERVE_CLIENT=false` turns that off).

### Split deployment (static frontend + Node backend)

The frontend and the WebSocket server do **not** need to share an origin.

* Backend (Railway / Render / Fly.io / any Node host): run `npm run build:server && npm start`.
  Set `CLIENT_ORIGIN` to your frontend's origin, e.g. `https://marble.example.com`.
* Frontend (Vercel / Netlify / any static host): build with
  `VITE_SERVER_URL=https://your-backend.example.com npm run build:client` and publish `dist/`.

## Environment variables

Server (process environment, see `.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3001` | HTTP/WebSocket port |
| `CLIENT_ORIGIN` | `*` | Allowed browser origin(s), comma separated |
| `SERVE_CLIENT` | `true` | Serve the built `dist/` from the server |
| `MAX_PLAYERS` | `16` | Room capacity (max 16) |
| `MAX_ROOMS` | `500` | Safety cap on simultaneous rooms |
| `COUNTDOWN_MS` | `3500` | Length of the pre-race countdown |
| `ROOM_EMPTY_TTL_MS` | `30000` | How long an empty room lives before it is destroyed |
| `RECONNECT_GRACE_MS` | `10000` | How long a dropped lobby player keeps their seat |

Client (Vite, build time): `VITE_SERVER_URL` — URL of the game server. Empty means "same origin"
(or `:3001` of the current host during `npm run dev`).

## How multiplayer works

```
 Browser (React + Canvas)                         Node server
 ───────────────────────                          ───────────────────────────────
 room:host / room:join / room:setTrack  ───────▶  validates, owns the Room
 race:start / room:reset                          RaceStateMachine
                                                  WAITING→COUNTDOWN→RACING→FINISHED→RESULTS→WAITING
                                                  RaceSimulation (Matter.js, fixed 60 Hz steps)
 room:state  (lobby/phase/results)      ◀───────  on every change
 race:snapshot (30 Hz, compact arrays)  ◀───────  marble x,y,vx,vy,angle,finishPos
 race:finish                            ◀───────  when the *server* sees a marble cross the line
```

* **Authority.** Clients can only send lobby actions (`host`, `join`, `setTrack`, `start`, `reset`,
  `leave`). There is no message for position, finishing or host changes, so a client cannot claim a
  win. Identity comes from the socket's server-side session, never from the payload; host-only actions
  are checked against the server's `hostId`; every payload (nickname, room code, track id) is
  validated; events are rate-limited per socket.
* **Phases.** `RaceStateMachine` is an explicit table of legal transitions; an illegal one throws.
  Joining is only possible in `WAITING`, so starting a race locks the lobby.
* **Time.** The server picks the GO timestamp (`goAt`, server wall-clock) and every client counts down
  to it using a measured clock offset. Physics starts when the server clock passes `goAt`; the
  simulation advances in fixed 1/60 s steps tied to that clock, so all rooms and clients agree on
  race time `t`.
* **Smooth rendering.** Snapshots carry the simulation time `t`. The client keeps a short buffer,
  plays it ~110 ms in the past and interpolates (with brief velocity extrapolation if a packet is late).
  Moving obstacles are not networked at all: they are pure functions of `t` (`obstaclePose`), evaluated
  identically on server and client.
* **Determinism / replays.** The simulation uses fixed steps, a seeded PRNG for start-slot shuffling and
  anti-stuck nudges, and no wall-clock reads. `(trackId, racer count, seed)` — all included in the room
  state — reproduces a race, which is what a future replay feature would need.
* **Disconnects.** In the lobby a dropped player keeps their seat for a short grace period (refreshing
  the page resumes it via a per-seat token in `sessionStorage`), then is removed with a "left the room"
  notice. If the host leaves, the next connected player becomes host. During a race a disconnected
  player's marble keeps racing, marked as away, and is removed when the room returns to the lobby.
  Empty rooms are destroyed after `ROOM_EMPTY_TTL_MS` (physics world and timers are released).
* **Race end.** The race ends when every marble has finished, 45 s after the first finisher (stragglers
  are ranked by progress and shown as DNF), or at the track's hard time limit.
* **Anti-stuck.** A marble that barely moves for a couple of seconds gets a seeded nudge, then a hop,
  then (last resort) a reset to the start.

## Project layout

```
src/
  shared/            types, constants, validation, obstacle definitions, tracks — used by both sides
    tracks/          one file per track (theDrop, spinner, maze, chaosFactory, gauntlet) + index.ts registry
  server/
    rooms/           Room, RoomManager (loop + cleanup), room-code generation
    game/            RaceSimulation (Matter.js), RaceStateMachine, seeded RNG
    networking/      Socket.IO handlers, validation, rate limiting
  client/
    screens/         Menu, Lobby, Race, Results, Connecting
    components/      Button, PlayerList, TrackPicker, CountdownOverlay, RaceCanvas, …
    game/
      renderer/      GameRenderer (background, track, obstacles, marbles, labels, HUD), thumbnails
      camera/        follow camera   effects/ particles + trails   audio/ WebAudio sound system
      raceFeed.ts    snapshot buffer + interpolation (kept outside React)
    networking/      socket, actions, clock sync, session persistence
    state/           tiny external store (useSyncExternalStore)
scripts/             verify-tracks.ts, test-server.ts
```

### Adding a track

1. Create `src/shared/tracks/myTrack.ts`. Build it with `assembleTrack({...meta}, [[label, section], …])`
   using the helpers in `shared/obstacles.ts` (`wall`, `slope`, `peg`, `bumper`, `conveyor`, `rotor`,
   `platform`, `piston`, `gate`, `funnel`, `pegField`, `switchbacks`) or your own section functions.
2. Register it in `src/shared/tracks/index.ts`.
3. Run `npm run verify:tracks -- myTrack` — every marble must finish.

### Tuning the physics

Everything lives in `PHYSICS` in `src/shared/constants.ts` (gravity, marble radius / restitution / air
drag, bumper kick, speed clamp). Note that Matter's friction makes marbles stick on gentle slopes, so
marbles have `friction: 0`; the roll animation is computed client-side.

### Sound

All sounds are synthesised with WebAudio, so the game has audio without asset files. To use recordings,
put files in `public/sounds/` and list them in `SOUND_FILES` in `src/client/game/audio/sound.ts`.

## Not included on purpose

Accounts, matchmaking, ranked play, chat, skins, spectators. The room/player model is plain data
keyed by temporary ids, so those could be layered on later.
