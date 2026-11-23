import React from 'react';

export const CreditsSection: React.FC = () => {
  return (
    <footer
      id="credits"
      className="scroll-mt-20 border-t border-[#E4E4E7] pt-8 pb-6"
    >
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0F172A]">
            Credits &amp; Acknowledgements
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#52525B]">
            Chandaḥsvara builds upon open Sanskrit prosody research, acoustic DSP synthesis, and open-source audio tooling.
          </p>
        </div>

        <dl className="grid gap-6 border-t border-[#E4E4E7] pt-6 text-xs text-[#52525B] sm:grid-cols-2 lg:col-span-8 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
          <div>
            <dt className="text-sm font-semibold text-[#0F172A]">
              Vāgdhenu &amp; Prof. Prathosh A P (IISc Bengaluru)
            </dt>
            <dd className="mt-1.5 leading-relaxed">
              Meter-conditioned Sanskrit <em>pārāyaṇa</em> chanting model (<em>prathoshap/vagdhenu</em>, Apache-2.0) along with multi-script Indic-to-SLP1 transliteration, Pāṇinian Laghu/Guru syllabification, and classical <em>vṛtta</em> meter classification.{' '}
              <a
                href="https://prathosh.in/vagdhenu/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#1E3A8A] underline underline-offset-2 hover:text-[#172554]"
              >
                prathosh.in/vagdhenu
              </a>
            </dd>
          </div>

          <div>
            <dt className="text-sm font-semibold text-[#0F172A]">
              Acoustic Tanpura, Rāga Swaramandal &amp; Export
            </dt>
            <dd className="mt-1.5 leading-relaxed">
              Client-side YIN pitch tracking, 4-string Jawari Tanpura &amp; Just-Intonation Rāga Swaramandal synthesis, FFmpeg (<code className="font-mono-num">libmp3lame</code>) MP3 encoding, and JSZip archiving.
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-8 border-t border-[#E4E4E7] pt-4 text-xs text-[#52525B]">
        Chandaḥsvara · Synthesized audio is stored locally in your browser via IndexedDB.
      </p>
    </footer>
  );
};
