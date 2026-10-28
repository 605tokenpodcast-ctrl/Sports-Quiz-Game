// P2P Multiplayer Synchronization for Cross-Device Sports Arena Quiz
// Supports PeerJS WebRTC for true separate devices/mobile + BroadcastChannel for same-browser multi-tab instant sync.

export type PeerRole = 'host' | 'client' | 'local';

export type P2PMessage =
  | { type: 'STATE_SYNC'; payload: any }
  | { type: 'CLIENT_JOIN'; playerName?: string }
  | { type: 'CLIENT_BUZZ'; contestantId: string; timestamp: number }
  | { type: 'CLIENT_ANSWER'; contestantId: string; answer: string }
  | { type: 'CLIENT_SELECT_CLUE'; contestantId: string; catIdx: number; clueIdx: number }
  | { type: 'CLIENT_SET_WAGER'; contestantId: string; wager: number; lockIn?: boolean }
  | { type: 'CLIENT_FINAL_WAGER'; contestantId: string; wager: number }
  | { type: 'CLIENT_FINAL_ANSWER'; contestantId: string; answer: string }
  | { type: 'HOST_START_GAME' }
  | { type: 'HOST_RESTART_GAME' }
  | { type: 'PING'; time: number }
  | { type: 'PONG'; time: number; hostTime: number };

declare global {
  interface Window {
    Peer: any;
  }
}

// Prefix to keep room IDs unique and clean on public PeerJS broker
const PEER_PREFIX = 'sportsarena-quiz-';

export class P2PConnectionManager {
  private peer: any = null;
  private connection: any = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private isHost = false;
  private roomCode = '';
  private onMessageCallback: ((msg: P2PMessage) => void) | null = null;
  private onStatusCallback: ((status: 'disconnected' | 'connecting' | 'connected' | 'error', detail?: string) => void) | null = null;
  private pingInterval: any = null;
  private isDestroyed = false;

  constructor(
    roomCode: string,
    role: 'host' | 'client',
    onMessage: (msg: P2PMessage) => void,
    onStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error', detail?: string) => void
  ) {
    this.roomCode = roomCode.toUpperCase().trim();
    this.isHost = role === 'host';
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;

    this.initBroadcastChannel();
    this.initPeerJS();
  }

  // 1. Initialize local BroadcastChannel for zero-latency multi-tab sync
  private initBroadcastChannel() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel(`sa_room_${this.roomCode}`);
        this.broadcastChannel.onmessage = (e) => {
          if (e.data && this.onMessageCallback) {
            this.onMessageCallback(e.data as P2PMessage);
          }
        };
      }
    } catch (err) {
      console.warn('BroadcastChannel not supported', err);
    }
  }

  // 2. Load PeerJS script dynamically from unpkg
  private async loadPeerJSScript(): Promise<boolean> {
    if (window.Peer) return true;
    return new Promise((resolve) => {
      const existingScript = document.getElementById('peerjs-script');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(true));
        existingScript.addEventListener('error', () => resolve(false));
        return;
      }
      const script = document.createElement('script');
      script.id = 'peerjs-script';
      script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        console.warn('Failed to load PeerJS from CDN');
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  // 3. Initialize PeerJS connection
  private async initPeerJS() {
    this.onStatusCallback?.('connecting', 'Initializing WebRTC peer...');
    const loaded = await this.loadPeerJSScript();
    if (this.isDestroyed) return;

    if (!loaded || !window.Peer) {
      this.onStatusCallback?.('error', 'Local network mode active');
      return;
    }

    const peerId = this.isHost
      ? `${PEER_PREFIX}${this.roomCode}`
      : `${PEER_PREFIX}${this.roomCode}-client-${Math.floor(Math.random() * 10000)}`;

    try {
      this.peer = new window.Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ],
        },
      });

      this.peer.on('open', (id: string) => {
        if (this.isHost) {
          this.onStatusCallback?.('connecting', `Room ${this.roomCode} hosted. Waiting for Player 2...`);
        } else {
          this.onStatusCallback?.('connecting', `Connecting to host ${this.roomCode}...`);
          this.connectToHost();
        }
      });

      if (this.isHost) {
        this.peer.on('connection', (conn: any) => {
          this.setupDataConnection(conn);
          this.onStatusCallback?.('connected', 'Player 2 Connected via WebRTC!');
          // Send initial welcome message
          this.send({ type: 'PING', time: Date.now() });
        });
      }

      this.peer.on('error', (err: any) => {
        console.warn('[PeerJS] Error:', err);
        // If host ID is already taken, fallback gracefully
        if (err.type === 'unavailable-id' && this.isHost) {
          this.onStatusCallback?.('connected', 'Room session active');
        } else {
          this.onStatusCallback?.('error', err.message || 'WebRTC connection error');
        }
      });

      this.peer.on('disconnected', () => {
        if (!this.isDestroyed) {
          this.peer?.reconnect();
        }
      });
    } catch (e) {
      console.warn('[PeerJS] Exception:', e);
      this.onStatusCallback?.('error', 'Local sync active');
    }
  }

  // 4. Client connects to Host Peer
  private connectToHost() {
    if (!this.peer) return;
    const hostPeerId = `${PEER_PREFIX}${this.roomCode}`;
    const conn = this.peer.connect(hostPeerId, { reliable: true });

    conn.on('open', () => {
      this.setupDataConnection(conn);
      this.onStatusCallback?.('connected', 'Connected to Arena Host!');
      this.send({ type: 'CLIENT_JOIN', playerName: 'Player 2 (Online)' });
    });

    conn.on('error', (err: any) => {
      console.warn('[PeerJS] Host connect error:', err);
      this.onStatusCallback?.('error', 'Could not reach Host. Check room code.');
    });
  }

  // 5. Setup data connection listeners
  private setupDataConnection(conn: any) {
    this.connection = conn;

    conn.on('data', (data: any) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(data as P2PMessage);
      }
    });

    conn.on('close', () => {
      this.connection = null;
      this.onStatusCallback?.('disconnected', 'Player 2 Disconnected');
    });

    conn.on('error', (err: any) => {
      console.warn('[PeerJS] Data conn error:', err);
    });

    // Start heartbeat
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      this.send({ type: 'PING', time: Date.now() });
    }, 5000);
  }

  // 6. Send message to peer and local broadcast
  public send(msg: P2PMessage) {
    // Send via WebRTC DataChannel if open
    if (this.connection && this.connection.open) {
      try {
        this.connection.send(msg);
      } catch (err) {
        console.warn('[PeerJS] Send error:', err);
      }
    }

    // Also mirror to BroadcastChannel for instant same-browser multi-tab sync
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        // ignore
      }
    }
  }

  // 7. Cleanup
  public destroy() {
    this.isDestroyed = true;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}
