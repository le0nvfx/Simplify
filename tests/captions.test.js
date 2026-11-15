'use strict';
const assert = require('assert');
const C = require('../extension/js/lib/captions.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

module.exports = {
  'parseTime reads SRT, VTT and plain seconds'() {
    near(C.parseTime('00:01:02,500'), 62.5);
    near(C.parseTime('01:02.5'), 62.5);
    near(C.parseTime('7.25'), 7.25);
  },

  'parseSubtitles reads SRT with tags and multi-line cues'() {
    const srt = '\uFEFF1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hello</i> there\r\nfriend\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nBye\r\n';
    const cues = C.parseSubtitles(srt);
    assert.strictEqual(cues.length, 2);
    assert.strictEqual(cues[0].text, 'Hello there friend');
    near(cues[0].start, 1); near(cues[0].end, 2.5);
  },

  'parseSubtitles reads WebVTT and skips the header and notes'() {
    const vtt = 'WEBVTT\n\nNOTE made by a test\n\nintro\n00:01.000 --> 00:02.000 align:center\nHi &amp; welcome\n';
    const cues = C.parseSubtitles(vtt);
    assert.strictEqual(cues.length, 1);
    assert.strictEqual(cues[0].text, 'Hi & welcome');
  },

  'parseTranscriptJSON reads OpenAI verbose_json words'() {
    const r = C.parseTranscriptJSON({ text: 'Hello world', words: [{ word: 'Hello', start: 0, end: 0.4 }, { word: ' world', start: 0.5, end: 0.9 }] });
    assert.deepStrictEqual(r.words.map((w) => w.text), ['Hello', 'world']);
  },

  'parseTranscriptJSON reads segment-level words and falls back to segments'() {
    const a = C.parseTranscriptJSON({ segments: [{ start: 0, end: 1, text: ' Hi you', words: [{ word: ' Hi', start: 0, end: 0.4 }, { word: ' you', start: 0.5, end: 1 }] }] });
    assert.strictEqual(a.words.length, 2);
    const b = C.parseTranscriptJSON({ segments: [{ start: 0, end: 1, text: ' Hi you' }] });
    assert.strictEqual(b.cues.length, 1);
  },

  'parseTranscriptJSON merges whisper.cpp sub-word tokens and drops markers'() {
    const r = C.parseTranscriptJSON({
      transcription: [
        { offsets: { from: 0, to: 300 }, text: ' Edit' },
        { offsets: { from: 300, to: 500 }, text: 'ing' },
        { offsets: { from: 600, to: 900 }, text: ' rocks' },
        { offsets: { from: 900, to: 1500 }, text: ' [MUSIC]' }
      ]
    });
    assert.deepStrictEqual(r.words.map((w) => w.text), ['Editing', 'rocks']);
    near(r.words[0].end, 0.5);
  },

  'chunkWords respects the word limit and sentence ends'() {
    const words = 'one two three four five six. seven eight'.split(' ').map((t, i) => ({ start: i * 0.3, end: i * 0.3 + 0.25, text: t }));
    const cues = C.chunkWords(words, { maxWords: 4, maxChars: 100, lineChars: 100 });
    assert.deepStrictEqual(cues.map((c) => c.text), ['one two three four', 'five six.', 'seven eight']);
    assert.strictEqual(cues[0].words.length, 4);
  },

  'chunkWords splits on pauses and keeps captions from overlapping'() {
    const words = [{ start: 0, end: 0.3, text: 'a' }, { start: 0.35, end: 0.6, text: 'b' }, { start: 3, end: 3.3, text: 'c' }];
    const cues = C.chunkWords(words, { maxWords: 5, pause: 0.6 });
    assert.strictEqual(cues.length, 2);
    assert.ok(cues[0].end <= cues[1].start);
  },

  'chunkWords applies case and strips trailing punctuation per word'() {
    const words = [{ start: 0, end: 0.3, text: 'Hello,' }, { start: 0.3, end: 0.6, text: 'world!' }];
    const cues = C.chunkWords(words, { textCase: 'upper', stripPunctuation: true });
    assert.strictEqual(cues[0].text, 'HELLO WORLD');
    assert.strictEqual(cues[0].words[1].text, 'WORLD');
  },

  'wrap balances two lines'() {
    assert.strictEqual(C.wrap('this is a longer caption', 12), 'this is a\nlonger caption');
    assert.strictEqual(C.wrap('short', 12), 'short');
  },

  'build re-chunks subtitle cues with estimated word timing and offset'() {
    const parsed = { words: [], cues: [{ start: 0, end: 2, text: 'aa bb cc dd', words: [] }] };
    const cues = C.build(parsed, { maxWords: 2, timeOffset: 10 });
    assert.strictEqual(cues.length, 2);
    near(cues[0].start, 10);
    assert.strictEqual(cues[1].text, 'cc dd');
  },

  'fromText detects the format'() {
    assert.strictEqual(C.fromText('1\n00:00:00,000 --> 00:00:01,000\nhey you\n', { maxWords: 5 }).length, 1);
    assert.strictEqual(C.fromText('{"words":[{"word":"hey","start":0,"end":0.5}]}').length, 1);
  }
};
