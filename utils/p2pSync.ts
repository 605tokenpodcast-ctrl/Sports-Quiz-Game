// P2P Multiplayer Synchronization for Cross-Device Sports Arena Quiz
// The host phone runs the game and up to two friends join from their own phones
// over PeerJS WebRTC data connections. The host is authoritative: friends send
// their taps, the host broadcasts the full game state back to everyone.

import Peer, {DataConnection} from 'peerjs';
import {exportHistory, type SharedHistory} from './questionHistory';

export type P2PMessage =
  | { type: 'STATE_SYNC'; payload: any }
  // history: the questions this phone has been shown, so the host can hold them back.
  | { type: 'CLIENT_JOIN'; playerName?: string; deviceId?: string; history?: SharedHistory }
  // Host to a phone that just joined: the group's question history, so that phone can host next time.
  | { type: 'QUESTION_HISTORY'; history: SharedHistory }
  // A big-screen stream view that only watches. quiet: the scoreboard strip, which makes no sound,
  // so the host (or a full stream screen) keeps reading clues aloud.
  | { type: 'SCREEN_JOIN'; quiet?: boolean }
  // reactionMs: how long after this phone showed the open buzzer the player tapped (for clueId).
  // early: tapped while this phone still showed "wait for the light" (it may reach the host after the light).
  | { type: 'CLIENT_BUZZ'; contestantId: string; timestamp: number; reactionMs?: number; clueId?: string; early?: boolean }
  | { type: 'CLIENT_ANSWER'; contestantId: string; answer: string; alternatives?: string[] }
  | { type: 'CLIENT_SELECT_CLUE'; contestantId: string; catIdx: number; clueIdx: number }
  | { type: 'CLIENT_SET_WAGER'; contestantId: string; wager: number; lockIn?: boolean }
  | { type: 'CLIENT_FINAL_WAGER'; contestantId: string; wager: number; lockIn?: boolean }
  | { type: 'CLIENT_FINAL_ANSWER'; contestantId: string; answer: string; lockIn?: boolean }
  | { type: 'ROOM_FULL' }
  // The game is on and the room is locked: the host has been asked to let this phone in.
  | { type: 'JOIN_WAITING' }
  | { type: 'JOIN_DENIED' }
  // A player's emoji reaction (phone to host), passed on by the host to every screen.
  | { type: 'CLIENT_REACTION'; emoji: string }
  | { type: 'CLIENT_GO_FOR_TWO'; accept: boolean }
  | { type: 'CLIENT_DRAFT_STRIKE'; categoryId: string }
  | { type: 'CLIENT_PICKEM'; gameId: string | null; team: string | null; lockIn?: boolean }
  | { type: 'REACTION'; emoji: string; seat: string; id: number }
  | { type: 'PING'; time: number }
  | { type: 'PONG'; time: number };

export type P2PStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Prefix to keep room IDs unique and clean on public PeerJS broker
const PEER_PREFIX = 'sportsarena-quiz-';

// A friend who sends nothing (not even a heartbeat) for this long is treated as gone.
// A phone that hears nothing from the host for this long reconnects.
const SILENT_PEER_MS = 12000;

// A phone that loses the host keeps trying to get back in for about two minutes
// (a locked screen, a Wi-Fi blip, the host reloading), waiting a little longer each time.
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 3000, 5000, 8000];
const RECONNECT_GIVE_UP_MS = 120000;

/**
 * Relay (TURN) servers let phones connect when a direct link is blocked, which is common on
 * cellular data and some guest Wi-Fi. When a direct link works, the relay is never used.
 *
 * By default the game uses the free public relay run by the PeerJS project, the same people
 * who run the free signaling broker the game already joins rooms through. It needs no account,
 * and its login ("peerjs"/"peerjsp") is published by PeerJS for exactly this use. It is shared
 * and best effort, so a dedicated relay can be added at build time and is tried first:
 *   VITE_TURN_URLS        comma-separated, e.g. "turn:global.relay.example.com:80,turns:global.relay.example.com:443"
 *   VITE_TURN_USERNAME    the relay account's username
 *   VITE_TURN_CREDENTIAL  the relay account's password
 * The Pages workflow reads these from the repository's Actions variables.
 * Anything set here is built into the public page where anyone can read it, so only use a
 * relay login meant to be public (or short-lived), never a private account password.
 */
export const PEERJS_RELAY: RTCIceServer = {
  urls: [
    'turn:us-0.turn.peerjs.com:3478',
    'turn:eu-0.turn.peerjs.com:3478',
    // For networks that block UDP (some carriers and guest Wi-Fi).
    'turn:us-0.turn.peerjs.com:3478?transport=tcp',
    'turn:eu-0.turn.peerjs.com:3478?transport=tcp',
  ],
  username: 'peerjs',
  credential: 'peerjsp',
};

export function iceServersFromEnv(e: Record<string, string | undefined>): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
  const urls = (e.VITE_TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
  if (urls.length) servers.push({ urls, username: e.VITE_TURN_USERNAME || '', credential: e.VITE_TURN_CREDENTIAL || '' });
  servers.push(PEERJS_RELAY);
  return servers;
}

// Uses the free public PeerJS broker unless VITE_PEER_HOST points at another
// signaling server (handy for local testing with `npx peerjs --port 9000`).
const env = import.meta.env ?? {}; // empty outside Vite (unit tests)
const BROKER = env.VITE_PEER_HOST
  ? {
      host: env.VITE_PEER_HOST as string,
      port: Number(env.VITE_PEER_PORT || 443),
      path: (env.VITE_PEER_PATH as string) || '/',
      secure: env.VITE_PEER_SECURE !== 'false',
    }
  : {};

export interface P2PCallbacks {
  /** A message arrived. On the host, fromPeerId says which friend sent it. */
  onMessage: (msg: P2PMessage, fromPeerId: string) => void;
  onStatus: (status: P2PStatus, detail?: string) => void;
  /** Host only: a friend's connection closed. */
  onPeerLeft?: (peerId: string) => void;
}

export class P2PConnectionManager {
  private peer: Peer | null = null;
  // Host: one connection per friend. Client: just the host.
  private connections = new Map<string, DataConnection>();
  private isHost = false;
  private roomCode = '';
  private playerName: string;
  private joinAs: 'player' | 'screen' | 'strip';
  private callbacks: P2PCallbacks;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isDestroyed = false;
  // Smoothed round-trip time to each peer, in ms, from PING/PONG.
  private roundTrips = new Map<string, number>();
  // When each peer was last heard from. A phone that locks its screen can vanish without
  // closing its connection, so the host drops peers that go quiet.
  private lastHeard = new Map<string, number>();
  // Host: phones waiting for the host's OK. They get heartbeats and direct messages, not the game.
  private held = new Set<string>();
  private reopenTries = 0;
  // Phone only: reconnecting to the host after losing it.
  private hasJoined = false;
  /** Phone: tries left to find a room that isn't open yet (a QR scanned before the host is online). */
  private findRoomTries = 6;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private lostHostAt = 0;
  private onVisible = () => {
    // A phone coming back from a locked screen retries right away instead of waiting.
    if (document.visibilityState !== 'visible' || this.isHost || this.isDestroyed || this.hostConnection()) return;
    if (this.hasJoined) this.retryNow();
  };

  /**
   * A random id for this browser tab. It survives a reload, so the host can tell a phone
   * coming back from a different phone that happens to use the same name.
   */
  public static deviceId(): string {
    const key = 'sportsarena_device_id';
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) return saved;
      const id = Math.random().toString(36).slice(2, 12);
      sessionStorage.setItem(key, id);
      return id;
    } catch {
      return Math.random().toString(36).slice(2, 12);
    }
  }

  constructor(
    roomCode: string,
    role: 'host' | 'client',
    callbacks: P2PCallbacks,
    playerName = 'Friend',
    joinAs: 'player' | 'screen' | 'strip' = 'player',
    reopening = false
  ) {
    // A host reopening its room after a reload may find the broker still holding the old id for a moment.
    this.reopenTries = reopening ? 20 : 0;
    this.roomCode = roomCode.toUpperCase().trim();
    this.isHost = role === 'host';
    this.callbacks = callbacks;
    this.playerName = playerName;
    this.joinAs = joinAs;
    this.initPeer();
  }

  /**
   * Host: about how long a message from this friend takes to arrive (half the round trip).
   * Used to judge buzzer races fairly, since a friend's tap reaches the host later than the host's own.
   */
  public oneWayDelayMs(peerId: string): number {
    const rtt = this.roundTrips.get(peerId);
    return rtt === undefined ? 0 : Math.min(rtt / 2, 500);
  }

  /** This device's PeerJS id (a client uses it to find its seat in the host's state). */
  public get peerId(): string {
    return this.peer?.id ?? '';
  }

  private initPeer() {
    this.callbacks.onStatus('connecting', 'Initializing WebRTC peer...');

    const peerId = this.isHost
      ? `${PEER_PREFIX}${this.roomCode}`
      : `${PEER_PREFIX}${this.roomCode}-client-${Math.floor(Math.random() * 1000000)}`;

    try {
      this.peer = new Peer(peerId, {
        ...BROKER,
        debug: 1,
        config: { iceServers: iceServersFromEnv(env as Record<string, string | undefined>) },
      });
    } catch (e) {
      console.warn('[PeerJS] Exception:', e);
      this.callbacks.onStatus('error', 'Could not start online play on this device');
      return;
    }

    this.peer.on('open', () => {
      if (this.isHost) {
        this.callbacks.onStatus('connecting', `Room ${this.roomCode} is open. Waiting for friends to join...`);
      } else {
        this.callbacks.onStatus('connecting', `Connecting to host ${this.roomCode}...`);
        this.connectToHost();
      }
    });

    if (this.isHost) {
      this.peer.on('connection', (conn) => {
        conn.on('open', () => {
          this.setupDataConnection(conn);
          this.callbacks.onStatus('connected', 'A friend connected!');
        });
      });
    }

    this.peer.on('error', (err: any) => {
      console.warn('[PeerJS] Error:', err);
      // A phone that was already in the game keeps trying: the host may be reloading or offline for a moment.
      if (!this.isHost && this.hasJoined && this.scheduleReconnect()) return;
      // A phone can get to the room before the host does (or while the host page is still loading),
      // so a room that isn't there yet is looked for again for a few seconds before giving up.
      if (err.type === 'peer-unavailable' && !this.isHost && !this.hasJoined && this.findRoomTries > 0 && !this.isDestroyed) {
        this.findRoomTries--;
        this.callbacks.onStatus('connecting', 'Looking for the room...');
        setTimeout(() => {
          if (!this.isDestroyed && !this.hasJoined) this.connectToHost();
        }, 1500);
        return;
      }
      if (err.type === 'unavailable-id' && this.isHost && this.reopenTries > 0 && !this.isDestroyed) {
        this.reopenTries--;
        this.callbacks.onStatus('connecting', 'Reopening the room...');
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.peer?.destroy();
        this.peer = null;
        setTimeout(() => {
          if (!this.isDestroyed) this.initPeer();
        }, 3000);
        return;
      }
      if (err.type === 'unavailable-id' && this.isHost) {
        this.callbacks.onStatus('error', 'That room code is already in use. Pick a new room code.');
      } else if (err.type === 'peer-unavailable') {
        this.callbacks.onStatus('error', 'Could not find that room. Check the room code.');
      } else {
        this.callbacks.onStatus('error', err.message || 'WebRTC connection error');
      }
    });

    this.peer.on('disconnected', () => {
      if (!this.isDestroyed) {
        this.peer?.reconnect();
      }
    });

    // Heartbeat keeps mobile connections from idling out.
    this.pingInterval = setInterval(() => {
      this.send({ type: 'PING', time: Date.now() });
      this.dropSilentPeers();
    }, 3000);

    if (!this.isHost && typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible);
  }

  /** Phone: the open connection to the host, if there is one. */
  private hostConnection(): DataConnection | undefined {
    return [...this.connections.values()].find((c) => c.open);
  }

  /**
   * Phone: try to get back to the host after a short wait. Returns false once it has tried
   * for too long, so the caller can show the error instead.
   */
  private scheduleReconnect(): boolean {
    if (this.isDestroyed) return true;
    if (!this.lostHostAt) this.lostHostAt = Date.now();
    if (Date.now() - this.lostHostAt > RECONNECT_GIVE_UP_MS) {
      this.lostHostAt = 0;
      this.reconnectAttempt = 0;
      return false;
    }
    if (this.reconnectTimer) return true;
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt++;
    this.callbacks.onStatus('connecting', 'Reconnecting to the host...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.retryNow();
    }, delay);
    return true;
  }

  private retryNow() {
    if (this.isDestroyed || !this.peer || this.hostConnection()) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.lostHostAt) this.lostHostAt = Date.now();
    this.callbacks.onStatus('connecting', 'Reconnecting to the host...');
    // Off the signaling server: reconnecting fires 'open', which connects to the host.
    if (this.peer.disconnected) {
      try {
        this.peer.reconnect();
      } catch {
        this.scheduleReconnect();
      }
      return;
    }
    this.connectToHost();
  }

  // Client connects to Host Peer
  private connectToHost() {
    if (!this.peer) return;
    if (this.hostConnection()) return;
    const conn = this.peer.connect(`${PEER_PREFIX}${this.roomCode}`, { reliable: true });
    // A connection that never opens (the host is gone) counts as a failed try.
    const openTimeout = setTimeout(() => {
      if (conn.open || this.isDestroyed) return;
      conn.close();
      if (this.hasJoined && !this.scheduleReconnect()) this.giveUp();
    }, 8000);

    conn.on('open', () => {
      clearTimeout(openTimeout);
      const back = this.hasJoined;
      this.hasJoined = true;
      this.reconnectAttempt = 0;
      this.lostHostAt = 0;
      this.setupDataConnection(conn);
      this.callbacks.onStatus('connected', back ? 'Back in the game!' : 'Connected to the host!');
      this.send(this.joinAs !== 'player' ? { type: 'SCREEN_JOIN', quiet: this.joinAs === 'strip' } : { type: 'CLIENT_JOIN', playerName: this.playerName, deviceId: P2PConnectionManager.deviceId(), history: exportHistory() });
    });

    conn.on('error', (err: any) => {
      console.warn('[PeerJS] Host connect error:', err);
      clearTimeout(openTimeout);
      if (this.hasJoined && this.scheduleReconnect()) return;
      this.callbacks.onStatus('error', 'Could not reach the host. Check the room code.');
    });
  }

  private giveUp() {
    this.callbacks.onStatus('disconnected', 'Lost connection to the host. Reload to rejoin.');
  }

  private setupDataConnection(conn: DataConnection) {
    this.connections.set(conn.peer, conn);

    this.lastHeard.set(conn.peer, Date.now());
    conn.on('data', (data) => {
      this.lastHeard.set(conn.peer, Date.now());
      const msg = data as P2PMessage;
      // Heartbeats double as latency probes and never reach the game.
      if (msg?.type === 'PING') {
        if (conn.open) conn.send({type: 'PONG', time: msg.time});
        return;
      }
      if (msg?.type === 'PONG') {
        const rtt = Date.now() - msg.time;
        const prev = this.roundTrips.get(conn.peer);
        this.roundTrips.set(conn.peer, prev === undefined ? rtt : prev * 0.7 + rtt * 0.3);
        return;
      }
      this.callbacks.onMessage(msg, conn.peer);
    });
    if (conn.open) conn.send({type: 'PING', time: Date.now()});

    conn.on('close', () => this.handleClosed(conn));

    conn.on('error', (err: any) => {
      console.warn('[PeerJS] Data conn error:', err);
    });
  }

  private handleClosed(conn: DataConnection) {
    if (this.isDestroyed || this.connections.get(conn.peer) !== conn) return;
    this.connections.delete(conn.peer);
    this.roundTrips.delete(conn.peer);
    this.lastHeard.delete(conn.peer);
    this.held.delete(conn.peer);
    if (this.isHost) {
      this.callbacks.onPeerLeft?.(conn.peer);
      if (this.connections.size === 0) this.callbacks.onStatus('disconnected', 'All friends disconnected');
    } else if (!this.scheduleReconnect()) {
      this.giveUp();
    }
  }

  /**
   * Drop connections we haven't heard from in a while (their heartbeat stopped). On the host
   * that frees the friend's seat; on a phone it starts reconnecting to a host that went quiet.
   */
  private dropSilentPeers() {
    const cutoff = Date.now() - SILENT_PEER_MS;
    for (const [peerId, conn] of this.connections) {
      if ((this.lastHeard.get(peerId) ?? 0) < cutoff) {
        this.handleClosed(conn);
        conn.close();
      }
    }
  }

  /** Host: send to every friend (or one, with toPeerId). Client: send to the host. */
  public send(msg: P2PMessage, toPeerId?: string) {
    for (const [peerId, conn] of this.connections) {
      if (toPeerId && peerId !== toPeerId) continue;
      if (!toPeerId && msg.type !== 'PING' && this.held.has(peerId)) continue;
      if (!conn.open) continue;
      try {
        conn.send(msg);
      } catch (err) {
        console.warn('[PeerJS] Send error:', err);
      }
    }
  }

  /** Host: keep a phone connected but out of the game until the host lets it in. */
  public hold(peerId: string) {
    this.held.add(peerId);
  }

  public release(peerId: string) {
    this.held.delete(peerId);
  }

  /** Host: drop one friend's connection (used to turn away a 4th phone). */
  public disconnectPeer(peerId: string) {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    this.connections.delete(peerId);
    this.roundTrips.delete(peerId);
    this.lastHeard.delete(peerId);
    this.held.delete(peerId);
    // Give the ROOM_FULL message a moment to arrive before closing.
    setTimeout(() => conn.close(), 500);
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
    for (const conn of this.connections.values()) conn.close();
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}
