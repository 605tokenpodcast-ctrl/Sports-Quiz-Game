# Sports Arena Quiz

An NFL trivia game show for phones. Up to 3 people can play on their own phones, or
one person can play against two AI opponents (Coach Dave and Stats Riley).

**Play it:** https://605tokenpodcast-ctrl.github.io/Sports-Quiz-Game/

## Running it

```sh
npm install
npm run dev        # local dev server
npm run build      # production build in dist/
```

## Questions

`public/questions/nfl.json` holds about 3,300 NFL questions generated from
[nflverse](https://github.com/nflverse) data (CC BY 4.0). Rebuild it with:

```sh
npm run questions
```

The **Refresh NFL questions** GitHub Action does this every Tuesday, which keeps the
"this week" and "this season" categories current. Each device remembers
which questions it has seen and skips them until it runs out.
`npm run simulate` plays 40 simulated games and reports how often questions repeat.

## Playing on several phones

The first phone opens the game and taps **Invite Phones**. Friends scan the QR
code or open the join link. The second phone to join is P2 and the third is P3.
If only one friend joins, Stats Riley (AI) plays the third seat. Phones connect
directly over WebRTC, using the free public PeerJS signaling server.

To test multiplayer offline, run your own signaling server and point the game at it:

```sh
npx peerjs --port 9000
VITE_PEER_HOST=localhost VITE_PEER_PORT=9000 VITE_PEER_SECURE=false npm run dev
```

## Answering by voice

When it's your turn to answer, tap **🎙️ SAY IT** and say your answer. On multiple
choice, the game picks the option you named (a last name or team nickname is enough).
If it isn't sure, it shows what it heard and you tap instead. In expert mode and the
Final Showdown it fills in the answer box for you to check. Voice uses the browser's
speech recognition, which works in Chrome (Android, desktop) and Safari (iPhone).
The button hides itself on browsers without it. `npm run test:voice` checks the matching.

## Publishing

The **Publish game** GitHub Action builds the game and puts it on GitHub Pages on
every push to `main` and after each weekly question refresh. One-time setup: in the
repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Settings

`game-config.json` holds the tuned timers and volumes, such as the question timer,
buzzer delay and AI reflex speed.
