# Sports Arena Quiz

An NFL trivia game show for phones. Up to 3 people can play on their own phones, or
one person can play against two AI opponents (Coach Dave and Stats Riley).

**Play it:** https://605tokenpodcast-ctrl.github.io/Sports-Quiz-Game/

## Running it

```sh
npm install
npm run dev        # local dev server
npm run build      # production build in dist/
npm test           # type check plus the answer, voice and rules tests
npm run test:game  # plays a whole game in a headless browser (needs Playwright)
```

`npm run dev` also accepts `?board=2x2` (2 categories of 2 clues, add `&dd=0` for no
Daily Double) to play a short game while testing.

## Code layout

- `App.tsx`: picks the host studio or the phone controller and lays out the host screen.
- `game/useGameController.ts`: all game state and flow (the host runs the game; phones keep a copy).
- `game/rules.ts`, `game/types.ts`: the game rules (clocks, scoring, wagers) as plain functions, and shared types.
- `host/`: the host screen's parts (scoreboard, board and Final, clue card, menus, leaderboards, results).
- `phone/PhoneScreen.tsx`: a friend's phone.
- `screen/StreamScreen.tsx`: the big-screen stream view.
- `triviaData.ts`, `triviaEngine.ts`: loading questions, building boards, checking answers.
- `utils/`, `ui/`: multiplayer connection, voice answers, sounds, leaderboard and other helpers.

## Questions

`public/questions/nfl.json` holds about 4,000 NFL questions, written as Jeopardy-style clues, generated from
[nflverse](https://github.com/nflverse) data (CC BY 4.0). Rebuild it with:

```sh
npm run questions
```

The **Refresh NFL questions** GitHub Action does this every Tuesday, which keeps the
"this week" and "this season" categories current. Every game has one current column on
each board: **This Week in the NFL** in Round 1 and the **season so far** in Round 2. Each device remembers
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

## Streaming or recording

Open **Invite Phones** on the host and copy the **Stream Screen** link (it ends in
`role=screen`). Open it on a laptop or TV and click once to turn on its sound. It shows the
board, each clue, who buzzed, the Final Showdown and the results in big type, with the join
QR code, and it doesn't take a player seat. Everyone keeps playing on their phones.

**Read Clues Aloud** (on the start screen and in the menu) has the browser's voice read each
clue, and the buzzers open once it has been read. The answer is read when it's shown. The
stream screen does the reading when one is connected, otherwise the host device does.

Each seat has its own buzz-in sound so listeners can tell who buzzed: P1 rings a bell, P2
honks a horn, P3 (or Stats Riley) chirps and Coach Dave blows a whistle.

After the game, **Share Recap Card** makes a 1080 x 1350 image with the final standings and
best moments, for social posts. Phones open the share sheet; computers download it.

## Final Showdown

Like on TV, only players with money in the bank play the Final Showdown. Anyone at $0 or
below sits it out and keeps their score. If nobody has money, the scores stand.

## Answering by voice

When it's your turn to answer, tap **🎙️ SAY IT** and say your answer. On multiple
choice, the game picks the option you named (a last name or team nickname is enough).
If it isn't sure, it shows what it heard and you tap instead. In expert mode and the
Final Showdown it fills in the answer box for you to check. Voice uses the browser's
speech recognition, which works in Chrome (Android, desktop) and Safari (iPhone).
The button hides itself on browsers without it. `npm run test:voice` checks the matching.

For a voice-only game, pick **Mic Only** as the answer format. No options are shown:
the mic starts listening as soon as you buzz in, and whatever you say is checked like
a typed answer (nicknames and small mistakes are fine). If nothing is heard, tap the
mic to try again before the 10-second timer runs out.

## Publishing

The **Publish game** GitHub Action builds the game and puts it on GitHub Pages on
every push to `main` and after each weekly question refresh. One-time setup: in the
repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Settings

`game-config.json` holds the tuned settings: the question timer, the buzzer delay,
the AI reflex speed and how close a typed answer must be.
