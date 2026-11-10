// The relay (TURN) server is only added when it is configured at build time.
import assert from 'node:assert/strict';
import {iceServersFromEnv} from '../utils/p2pSync';

const plain = iceServersFromEnv({});
assert.ok(plain.length >= 2 && plain.every((s) => String(s.urls).startsWith('stun:')));
console.log('ok   no relay configured: address-lookup servers only');

const relay = iceServersFromEnv({
  VITE_TURN_URLS: 'turn:relay.example.com:80, turns:relay.example.com:443',
  VITE_TURN_USERNAME: 'user',
  VITE_TURN_CREDENTIAL: 'secret',
});
const turn = relay[relay.length - 1];
assert.deepEqual(turn, {urls: ['turn:relay.example.com:80', 'turns:relay.example.com:443'], username: 'user', credential: 'secret'});
console.log('ok   a configured relay is added with its login');
