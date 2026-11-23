import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVerseNumberFromFilename,
  isSupportedAudioFilename,
  isZipFilename,
  matchImportedAudioFiles,
} from './batchAudioMatch';

function makeVerses(count: number, unselectedIdx: number[] = []) {
  const unset = new Set(unselectedIdx);
  return Array.from({length: count}, (_, i) => ({
    id: `shloka-${i + 1}`,
    index: i + 1,
    selected: !unset.has(i + 1),
  }));
}

test('filters supported audio and zip files while ignoring macOS archive junk', () => {
  assert.equal(isSupportedAudioFilename('out/shloka_001.wav'), true);
  assert.equal(isSupportedAudioFilename('012.MP3'), true);
  assert.equal(isSupportedAudioFilename('__MACOSX/._shloka_001.wav'), false);
  assert.equal(isSupportedAudioFilename('._001.wav'), false);
  assert.equal(isSupportedAudioFilename('notes.txt'), false);
  assert.equal(isZipFilename('colab_188_shlokas.zip'), true);
  assert.equal(isZipFilename('__MACOSX/colab.zip'), false);
});

test('extractVerseNumberFromFilename handles Colab naming patterns safely', () => {
  assert.equal(extractVerseNumberFromFilename('001.wav', 188), 1);
  assert.equal(extractVerseNumberFromFilename('out/shloka_188.wav', 188), 188);
  assert.equal(extractVerseNumberFromFilename('verse-42.mp3', 188), 42);
  assert.equal(extractVerseNumberFromFilename('20261123_07.wav', 188), 7);
  assert.equal(extractVerseNumberFromFilename('045_vasudeva.wav', 188), 45);
  assert.equal(extractVerseNumberFromFilename('shloka_999.wav', 188), null);
  assert.equal(extractVerseNumberFromFilename('unnumbered.wav', 188), null);
});

test('matches 188 out-of-order Colab files by verse index accurately', () => {
  const verses = makeVerses(188);
  const files = Array.from({length: 188}, (_, i) => ({
    name: `colab_out/shloka_${String(188 - i).padStart(3, '0')}.wav`,
  }));
  const res = matchImportedAudioFiles(files, verses);
  assert.equal(res.matched.length, 188);
  assert.equal(res.unmatched.length, 0);
  assert.equal(res.matched[0].entry.name, 'colab_out/shloka_001.wav');
  assert.equal(res.matched[0].verse.index, 1);
  assert.equal(res.matched[187].entry.name, 'colab_out/shloka_188.wav');
  assert.equal(res.matched[187].verse.index, 188);
});

test('aligns unnumbered audio files sequentially using natural sort order', () => {
  const verses = makeVerses(4, [1]); // only 2,3,4 selected
  const files = [{name: 'clip_c.wav'}, {name: 'clip_a.wav'}, {name: 'clip_b.wav'}];
  const res = matchImportedAudioFiles(files, verses);
  assert.equal(res.matched.length, 3);
  assert.deepEqual(
    res.matched.map((m) => [m.entry.name, m.verse.index, m.matchedBy]),
    [
      ['clip_a.wav', 2, 'sequence'],
      ['clip_b.wav', 3, 'sequence'],
      ['clip_c.wav', 4, 'sequence'],
    ]
  );
});
