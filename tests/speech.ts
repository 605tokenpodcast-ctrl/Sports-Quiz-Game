// Picking the host voice and splitting clues for reading aloud.
import assert from 'node:assert/strict';
import {answerLine, splitSentences, spokenText, spokenYear, voiceScore} from '../utils/speech';

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

check('years are read as years', () => {
  assert.equal(spokenYear(1998), 'nineteen ninety-eight');
  assert.equal(spokenYear(2000), 'two thousand');
  assert.equal(spokenYear(2005), 'two thousand five');
  assert.equal(spokenYear(2024), 'twenty twenty-four');
  assert.equal(spokenYear(1905), 'nineteen oh five');
  assert.equal(spokenText('the 1993 draft'), 'the nineteen ninety-three draft');
  assert.equal(spokenText('ran for 1600 yards'), 'ran for 1600 yards', 'counts stay numbers');
});

check('St. is Saint before a name and State after a school', () => {
  assert.equal(spokenText('beat the St. Louis Rams'), 'beat the Saint Louis Rams');
  assert.equal(spokenText('Amon-Ra St. Brown'), 'Amon-Ra Saint Brown');
  assert.equal(spokenText('Fresno St. receiver'), 'Fresno State receiver');
  assert.equal(spokenText('played at Ohio St.'), 'played at Ohio State');
});

check('names, picks, scores, records and Super Bowls read naturally', () => {
  assert.equal(spokenText('Michael Penix Jr. and Steve Smith Sr.'), 'Michael Penix Junior and Steve Smith Senior');
  assert.equal(spokenText('Kenneth Walker III'), 'Kenneth Walker the third');
  assert.equal(spokenText('the No. 1 pick'), 'the number 1 pick');
  assert.equal(spokenText('won 23-16 in Super Bowl XXXIV'), 'won 23 to 16 in Super Bowl 34');
  assert.equal(spokenText('this team went 13-3 under Jeff Fisher'), 'this team went 13 and 3 under Jeff Fisher');
  assert.equal(spokenText('a 10-6-1 record'), 'a 10 and 6 and 1 record');
  assert.equal(spokenText('the best record through Week 8, at 7-1.'), 'the best record through Week 8, at 7 and 1.');
  assert.equal(spokenText('head coach of the Bears, 3-4 so far this season'), 'head coach of the Bears, 3 and 4 so far this season');
  assert.equal(spokenText('stumbled to a league-worst 2-15 in 2023'), 'stumbled to a league-worst 2 and 15 in twenty twenty-three');
  assert.equal(spokenText('quarterbacked the Rams to a 23-16 win'), 'quarterbacked the Rams to a 23 to 16 win');
  assert.equal(spokenText('beating the Packers 28-22.'), 'beating the Packers 28 to 22.');
});

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
