// P2P Multiplayer Synchronization for Cross-Device Sports Arena Quiz
// The host phone runs the game and up to two friends join from their own phones
// over PeerJS WebRTC data connections. The host is authoritative: friends send
// their taps, the host broadcasts the full game state back to everyone.

import Peer, {DataConnection} from 'peerjs';

export type P2PMessage =
  | { type: 'STATE_SYNC'; payload: any }
  | { type: 'CLIENT_JOIN'; playerName?: string }
  | { type: 'CLIENT_BUZZ'; contestantId: string; timestamp: number }
  | { type: 'CLIENT_ANSWER'; contestantId: string; answer: string }
  | { type: 'CLIENT_SELECT_CLUE'; contestantId: string; catIdx: number; clueIdx: number }
  | { type: 'CLIENT_SET_WAGER'; contestantId: string; wager: number; lockIn?: boolean }
  | { type: 'CLIENT_FINAL_WAGER'; contestantId: string; wager: number }
  | { type: 'CLIENT_FINAL_ANSWER'; contestantId: string; answer: string }
  | { type: 'ROOM_FULL' }
  | { type: 'PING'; time: number };

export type P2PStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Prefix to keep room IDs unique and clean on public PeerJS broker
const PEER_PREFIX = 'sportsarena-quiz-';

// Uses the free public PeerJS broker unless VITE_PEER_HOST points at another
// signaling server (handy for local testing with `npx peerjs --port 9000`).
const env = import.meta.env;
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
  private callbacks: P2PCallbacks;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isDestroyed = false;

  constructor(roomCode: string, role: 'host' | 'client', callbacks: P2PCallbacks, playerName = 'Friend') {
    this.roomCode = roomCode.toUpperCase().trim();
    this.isHost = role === 'host';
    this.callbacks = callbacks;
    this.playerName = playerName;
    this.initPeer();
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
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ],
        },
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
    this.pingInterval = setInterval(() => this.send({ type: 'PING', time: Date.now() }), 5000);
  }

  // Client connects to Host Peer
  private connectToHost() {
    if (!this.peer) return;
    const conn = this.peer.connect(`${PEER_PREFIX}${this.roomCode}`, { reliable: true });

    conn.on('open', () => {
      this.setupDataConnection(conn);
      this.callbacks.onStatus('connected', 'Connected to the host!');
      this.send({ type: 'CLIENT_JOIN', playerName: this.playerName });
    });

    conn.on('error', (err: any) => {
      console.warn('[PeerJS] Host connect error:', err);
      this.callbacks.onStatus('error', 'Could not reach the host. Check the room code.');
    });
  }

  private setupDataConnection(conn: DataConnection) {
    this.connections.set(conn.peer, conn);

    conn.on('data', (data) => {
      this.callbacks.onMessage(data as P2PMessage, conn.peer);
    });

    conn.on('close', () => {
      if (this.isDestroyed) return;
      this.connections.delete(conn.peer);
      if (this.isHost) {
        this.callbacks.onPeerLeft?.(conn.peer);
        if (this.connections.size === 0) this.callbacks.onStatus('disconnected', 'All friends disconnected');
      } else {
        this.callbacks.onStatus('disconnected', 'Lost connection to the host');
      }
    });

    conn.on('error', (err: any) => {
      console.warn('[PeerJS] Data conn error:', err);
    });
  }

  /** Host: send to every friend (or one, with toPeerId). Client: send to the host. */
  public send(msg: P2PMessage, toPeerId?: string) {
    for (const [peerId, conn] of this.connections) {
      if (toPeerId && peerId !== toPeerId) continue;
      if (!conn.open) continue;
      try {
        conn.send(msg);
      } catch (err) {
        console.warn('[PeerJS] Send error:', err);
      }
    }
  }

  /** Host: drop one friend's connection (used to turn away a 4th phone). */
  public disconnectPeer(peerId: string) {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    this.connections.delete(peerId);
    // Give the ROOM_FULL message a moment to arrive before closing.
    setTimeout(() => conn.close(), 500);
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.pingInterval) clearInterval(this.pingInterval);
    for (const conn of this.connections.values()) conn.close();
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}
