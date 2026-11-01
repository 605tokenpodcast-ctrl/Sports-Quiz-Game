// The AI voice plays each sentence in order, generating the next while one plays, and a
// new line cuts off the old one. Uses a fake model and a fake AudioContext.
import assert from 'node:assert/strict';

const log: string[] = [];
const ended: (() => void)[] = [];
class FakeCtx {
  state = 'running';
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createBuffer(_c: number, len: number) {
    return {len, copyToChannel() {}};
  }
  createBufferSource() {
    const src: any = {connect() {}, stop() {}, start() {
      log.push(`play ${src.buffer.len}`);
      ended.push(() => src.onended?.());
    }};
    return src;
  }
}
(globalThis as any).window = {AudioContext: FakeCtx};

const tick = () => new Promise((r) => setTimeout(r, 5));

async function main() {
  const {setAiModelForTests, speakAi, stopAi} = await import('../utils/aiVoice');
  setAiModelForTests({
    async generate(text, o) {
      log.push(`gen ${text} @${o.speed} ${o.voice}`);
      return {audio: new Float32Array(text.length), sampling_rate: 24000};
    },
  });

  let done = 0;
  speakAi([{text: 'Intro!', speed: 1.3}, {text: 'The clue.', speed: 1.2}], 'am_michael', () => done++);
  await tick();
  assert.deepEqual([...log].sort(), ['gen Intro! @1.3 am_michael', 'gen The clue. @1.2 am_michael', 'play 6'].sort(), 'next sentence is generated while the first plays');
  ended.shift()!();
  await tick();
  assert.equal(log.at(-1), 'play 9');
  assert.equal(done, 0);
  ended.shift()!();
  await tick();
  assert.equal(done, 1, 'onDone after the last sentence');

  log.length = 0;
  speakAi([{text: 'Old line.', speed: 1}, {text: 'More old.', speed: 1}], 'af_heart', () => done++);
  await tick();
  const mark = log.length;
  speakAi([{text: 'New!', speed: 1}], 'af_heart', () => done++);
  await tick();
  ended.splice(0).forEach((fn) => fn());
  await tick();
  ended.splice(0).forEach((fn) => fn());
  await tick();
  const after = log.slice(mark).filter((l) => l.startsWith('play'));
  assert.deepEqual(after, ['play 4'], 'only the new line plays after the cut-off');
  assert.equal(done, 2, 'only the new line counts as finished');

  // A device too slow to have the first sentence ready in time hands over to the device voice.
  setAiModelForTests({generate: () => new Promise(() => {})});
  let slow = 0;
  let finished = 0;
  speakAi([{text: 'Stuck.', speed: 1}], 'af_heart', () => finished++, () => slow++, 20);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(slow, 1, 'falls back when the first sentence is late');
  assert.equal(finished, 0);

  // A failed sentence also hands over instead of leaving the buzzers waiting.
  setAiModelForTests({generate: () => Promise.reject(new Error('boom'))});
  speakAi([{text: 'Broken.', speed: 1}], 'af_heart', () => finished++, () => slow++, 1000);
  await tick();
  assert.equal(slow, 2, 'falls back when generating fails');

  stopAi();
  console.log('ok   AI voice plays sentences in order, prefetches, and cuts off cleanly');
}
main().catch((e) => {
  console.log(`FAIL AI voice\n     ${e.message}`);
  process.exit(1);
});
