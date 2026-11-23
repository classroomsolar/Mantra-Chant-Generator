import test from 'node:test';
import assert from 'node:assert/strict';
import {detectMeter, detectScript, indicToDevanagari, parseBatchShlokas, syllabify, tagWeights, toSlp1} from './sanskritMeter';

test('detects Devanagari, Kannada, and Telugu scripts', () => {
  assert.equal(detectScript('वसुदेवसुतं देवं'), 'Devanagari');
  assert.equal(detectScript('ಗುರುರ್ಬ್ರಹ್ಮಾ ಗುರುರ್ವಿಷ್ಣುಃ'), 'Kannada');
  assert.equal(detectScript('సరస్వతి నమస్తుభ్యం'), 'Telugu');
});

test('indicToDevanagari preserves Malayalam chillus and Bengali R/V', () => {
  assert.equal(indicToDevanagari('കൃഷ്ണൻ കർമം നൽകൽ'), 'कृष्णन् कर्मं नल्कल्');
  assert.equal(indicToDevanagari('രാമൺ അവൾ വാൿ'), 'रामण् अवळ् वाक्');
  assert.equal(indicToDevanagari('ৰাম ৱদ'), 'राम वद');
  assert.equal(detectScript('കൃഷ്ണൻ നമഃ'), 'Malayalam');
});

test('correctly detects anuṣṭubh meter on Vasudevasutaṃ', () => {
  const verse = 'वसुदेवसुतं देवं कंसचाणूरमर्दनम् ।\nदेवकीपरमानन्दं कृष्णं वन्दे जगद्गुरुम् ॥';
  const res = detectMeter(verse);
  assert.equal(res.bankKey, 'anuṣṭubh');
  assert.equal(res.syllableCount, 32);
  assert.equal(res.recognized, true);
  assert.equal(res.syllables.length, 32);
  assert.equal(res.syllables.map((s) => s.weight).join(''), res.pattern);
  assert.equal(res.syllables[0].iast, 'va');
  assert.equal(res.syllables[0].weight, 'L');
  assert.equal(res.syllables[2].iast, 'de');
  assert.equal(res.syllables[2].weight, 'G');
  assert.equal(res.syllables[2].cause, 'long_vowel');
  assert.ok(res.syllables.some((s) => s.isPadaFinal));
});

test('correctly detects exact and near-match śārdūlavikrīḍita meter', () => {
  const exact = `या कुन्देन्दुतुषारहारधवला या शुभ्रवस्त्रावृता
या वीणावरदण्डमण्डितकरा या श्वेतपद्मासना ।
या ब्रह्माच्युतशङ्करप्रभृतिभिर्देवैः सदा वन्दिता
सा मां पातु सरस्वती भगवती निःशेषजाड्यापहा ॥`;
  const resExact = detectMeter(exact);
  assert.equal(resExact.bankKey, 'śārdūlavikrīḍita');
  assert.equal(resExact.syllableCount, 76);
  assert.equal(resExact.recognized, true);

  const devotional = `हे रामा पुरुषोत्तमा नरहरे नारायणा केशवा।
हे गोविन्दा गरुडध्वजा गुणनिधो दामोदरा माधवा॥
हे कृष्ण कमलापते यदुपते सीतापते श्रीपते।
हे वैकुण्ठाधिपते चराचरपते लक्ष्मीपते पाहि माम्॥`;
  const resNear = detectMeter(devotional);
  assert.equal(resNear.bankKey, 'śārdūlavikrīḍita');
  assert.equal(resNear.recognized, true);
});

test('correctly detects upajāti / indravajrā on 11-syllable verse', () => {
  const verse = `नमस्तुते व्यास विशालबुद्धे।
फुल्लारविन्दायतपत्रनेत्र।
येन त्वया भारततैलपूर्णः।
प्रज्वलितो ज्ञानमयः प्रदीपः॥`;
  const res = detectMeter(verse);
  assert.equal(res.syllableCount, 44);
  assert.ok(['upajāti', 'indravajrā', 'upendravajrā'].includes(res.bankKey));
  assert.equal(res.recognized, true);
});

test('correctly detects mālinī meter (15x4)', () => {
  const verse = `हठलुठ दल घिष्टोत्कण्ठदष्टोष्ठ विद्युत्
सटशठ कठिनोरः पीठभित्सुष्ठुनिष्ठाम् ।
पठतिनुतव कण्ठाधिष्ठ घोरान्त्रमाला
दह दह नरसिंहासह्यवीर्याहितं मे ॥`;
  const res = detectMeter(verse);
  assert.equal(res.syllableCount, 60);
  assert.equal(res.bankKey, 'mālinī');
});

test('syllabifier handles conjuncts and visarga weights', () => {
  const slp = toSlp1('रामाः कृष्णः');
  const syls = syllabify(slp);
  tagWeights(syls);
  assert.equal(syls.length, 4);
  assert.equal(syls[0].weight, 'G'); // rA
  assert.equal(syls[1].weight, 'G'); // mAH (visarga)
});

test('parseBatchShlokas splits multi-verse text cleanly and strips numbers', () => {
  const batch = `
(1) वसुदेवसुतं देवं कंसचाणूरमर्दनम् ।
देवकीपरमानन्दं कृष्णं वन्दे जगद्गुरुम् ॥ १ ॥

(2) शुक्लाम्बरधरं विष्णुं शशिवर्णं चतुर्भुजम् ।
प्रसन्नवदनं ध्यायेत् सर्वविघ्नोपशान्तये ॥ २ ॥

(3) कराग्रे वसते लक्ष्मीः करमध्ये सरस्वती ।
करमूले तु गोविन्दः प्रभाते करदर्शनम् ॥ ३ ॥
`;
  const parsed = parseBatchShlokas(batch);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].meter.bankKey, 'anuṣṭubh');
  assert.equal(parsed[1].meter.bankKey, 'anuṣṭubh');
  assert.ok(!parsed[0].text.includes('(1)'));
});

test('parseBatchShlokas handles 100 ślokas with mixed numbering and ॥ N endings', () => {
  const verses: string[] = [];
  for (let i = 1; i <= 100; i++) {
    const body =
      i % 2 === 0
        ? 'वसुदेवसुतं देवं कंसचाणूरमर्दनम् ।\nदेवकीपरमानन्दं कृष्णं वन्दे जगद्गुरुम्'
        : 'या कुन्देन्दुतुषारहारधवला या शुभ्रवस्त्रावृता\nया वीणावरदण्डमण्डितकरा या श्वेतपद्मासना ।\nया ब्रह्माच्युतशङ्करप्रभृतिभिर्देवैः सदा वन्दिता\nसा मां पातु सरस्वती भगवती निःशेषजाड्यापहा';
    const suffix = i % 3 === 0 ? `॥ ${i}` : `॥ ${i} ॥`;
    verses.push(`${i}. ${body} ${suffix}`);
  }
  const parsed = parseBatchShlokas(verses.join('\n\n'));
  assert.equal(parsed.length, 100);
  assert.equal(parsed[1].meter.bankKey, 'anuṣṭubh');
  assert.equal(parsed[0].meter.bankKey, 'śārdūlavikrīḍita');
  assert.ok(!parsed[99].text.startsWith('100.'));
  assert.ok(!parsed[2].text.includes('3'));
});

test('detects mandākrāntā with yati and 16-mātrā pajjhaṭikā (Bhaja Govindam)', () => {
  const meghaduta = `कश्चित्कान्ताविरहगुरुणा स्वाधिकारात्प्रमत्तः
शापेनास्तङ्गमितमहिमा वर्षभोग्येण भर्तुः ।
यक्षश्चक्रे जनकतनयास्नानपुण्योदकेषु
स्निग्धच्छायातरुषु वसतिं रामगिर्याश्रमेषु ॥`;
  const m = detectMeter(meghaduta);
  assert.equal(m.bankKey, 'mandākrāntā');
  assert.equal(m.yati, '4+6+7');
  assert.equal(m.recognized, true);

  const bhajaGovindam = `भज गोविन्दं भज गोविन्दं
गोविन्दं भज मूढमते ।
सम्प्राप्ते सन्निहिते काले
न हि न हि रक्षति डुकृञ्करणे ॥`;
  const p = detectMeter(bhajaGovindam);
  assert.equal(p.bankKey, 'pajjhaṭikā');
  assert.equal(p.recognized, true);
});

test('handles NFC-decomposed IAST, Indic script numerals, and ardhavisarga prosody', () => {
  const decomposedIast = 'vasudevasutaṃ devaṃ kaṃsacāṇūramardanam'.normalize('NFD');
  const cleanIast = 'vasudevasutaṃ devaṃ kaṃsacāṇūramardanam'.normalize('NFC');
  assert.equal(detectScript(decomposedIast), 'IAST');
  assert.equal(toSlp1(decomposedIast), toSlp1(cleanIast));

  const kannadaBatch = `೧. ಗುರುರ್ಬ್ರಹ್ಮಾ ಗುರುರ್ವಿಷ್ಣುಃ ಗುರುರ್ದೇವೋ ಮಹೇಶ್ವರಃ ।
ಗುರುಃ ಸಾಕ್ಷಾತ್ ಪರಂ ಬ್ರಹ್ಮ ತಸ್ಮೈ ಶ್ರೀಗುರವೇ ನಮಃ ॥ ೧ ॥`;
  const parsed = parseBatchShlokas(kannadaBatch);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].meter.detectedScript, 'Kannada');
  assert.ok(!parsed[0].text.includes('೧'));

  const ardhavisarga = 'दुःखम् दु\u1CF5खम्'.normalize('NFC');
  const syls = syllabify(toSlp1(ardhavisarga));
  tagWeights(syls);
  assert.equal(syls[0].weight, 'G');
  assert.equal(syls[2].weight, 'G');
});


