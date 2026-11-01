// Picking the host voice and splitting clues for reading aloud.
import assert from 'node:assert/strict';
import {answerLine, splitSentences, voiceScore} from '../utils/speech';

let failed = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).message}`);
  }
};

const best = (names: [string, string][]) =>
  names.map(([name, lang]) => ({name, lang})).sort((a, b) => voiceScore(b) - voiceScore(a))[0].name;

check('Edge picks a natural neural voice over the old desktop ones', () => {
  assert.equal(
    best([
      ['Microsoft David - English (United States)', 'en-US'],
      ['Microsoft Zira - English (United States)', 'en-US'],
      ['Microsoft Andrew Online (Natural) - English (United States)', 'en-US'],
      ['Google US English', 'en-US'],
    ]),
    'Microsoft Andrew Online (Natural) - English (United States)'
  );
});

check('iPhone picks an Enhanced or Premium voice, never a joke voice', () => {
  assert.equal(
    best([
      ['Fred', 'en-US'],
      ['Albert', 'en-US'],
      ['Samantha', 'en-US'],
      ['Ava (Premium)', 'en-US'],
      ['Evan (Enhanced)', 'en-US'],
    ]),
    'Ava (Premium)'
  );
  assert.ok(voiceScore({name: 'Zarvox', lang: 'en-US'}) <= -500);
  assert.ok(voiceScore({name: 'Bad News', lang: 'en-US'}) <= -500);
});

check('Chrome picks Google US English, Android picks a network voice', () => {
  assert.equal(best([['Google US English', 'en-US'], ['Google UK English Male', 'en-GB'], ['Daniel', 'en-GB']]), 'Google US English');
  assert.equal(best([['en-us-x-sfg-local', 'en-US'], ['en-us-x-iol-network', 'en-US']]), 'en-us-x-iol-network');
});

check('non-English voices are never picked', () => {
  assert.ok(voiceScore({name: 'Google Deutsch', lang: 'de-DE'}) < 0);
});

check('long clues are read a sentence at a time, short bits stay attached', () => {
  assert.deepEqual(splitSentences('Super Bowls, for 400! This QB won MVP. He threw 4 TDs in the game.'), [
    'Super Bowls, for 400!',
    'This QB won MVP.',
    'He threw 4 TDs in the game.',
  ]);
  assert.deepEqual(splitSentences('No. 1 pick in 2020'), ['No. 1 pick in 2020']);
  assert.deepEqual(splitSentences('Who is it'), ['Who is it']);
});

check('answer lines name the answer', () => {
  for (const pick of [0, 0.4, 0.9]) assert.ok(answerLine('Tom Brady', pick).includes('Tom Brady'));
});

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
