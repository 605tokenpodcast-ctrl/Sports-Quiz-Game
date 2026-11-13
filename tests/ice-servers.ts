// Phones always get a relay (TURN) server so they can join on cellular data.
import assert from 'node:assert/strict';
import {iceServersFromEnv, PEERJS_RELAY} from '../utils/p2pSync';

const isTurn = (s: RTCIceServer) => [s.urls].flat().some((u) => /^turns?:/.test(u));

const plain = iceServersFromEnv({});
assert.ok(plain.filter((s) => !isTurn(s)).length >= 2, 'address-lookup (STUN) servers are kept');
assert.deepEqual(plain.filter(isTurn), [PEERJS_RELAY]);
assert.ok(PEERJS_RELAY.username && PEERJS_RELAY.credential, 'the free relay has its public login');
assert.ok([PEERJS_RELAY.urls].flat().some((u) => u.includes('transport=tcp')), 'the free relay also works where UDP is blocked');
console.log('ok   with nothing configured, the free PeerJS relay is on');

const relay = iceServersFromEnv({
  VITE_TURN_URLS: 'turn:relay.example.com:80, turns:relay.example.com:443',
  VITE_TURN_USERNAME: 'user',
  VITE_TURN_CREDENTIAL: 'secret',
});
const turns = relay.filter(isTurn);
assert.deepEqual(turns[0], {urls: ['turn:relay.example.com:80', 'turns:relay.example.com:443'], username: 'user', credential: 'secret'});
assert.deepEqual(turns[1], PEERJS_RELAY);
console.log('ok   a configured relay is tried first, with the free relay as backup');
