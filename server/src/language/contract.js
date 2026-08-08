const BANGLA_SCRIPT_PATTERN =
  /[\u0980-\u09ff]/u;

const BANGLA_SCRIPT_GLOBAL =
  /[\u0980-\u09ff]/gu;

const LATIN_LETTER_GLOBAL =
  /[A-Za-z]/g;

function normalizeTeachingLanguage(value) {
  const normalized = String(
    value || 'English'
  )
    .trim()
    .toLowerCase();

  const mentionsEnglish =
    normalized === 'en' ||
    normalized === 'en-us' ||
    normalized.includes('english');

  const mentionsBangla =
    normalized === 'bn' ||
    normalized === 'bn-bd' ||
    normalized.includes('bangla') ||
    normalized.includes('bengali') ||
    BANGLA_SCRIPT_PATTERN.test(
      normalized
    );

  if (normalized.includes('banglish')) {
    return 'banglish';
  }

  if (
    normalized === 'bilingual' ||
    (
      mentionsEnglish &&
      mentionsBangla
    )
  ) {
    return 'bilingual';
  }

  if (mentionsBangla) {
    return 'bangla';
  }

  return 'english';
}

function languageContractLines(value) {
  const mode =
    normalizeTeachingLanguage(value);

  const header = [
    '',
    'LANGUAGE OUTPUT CONTRACT',
    `- Authoritative teaching language mode: ${mode}.`,
    '- This profile setting overrides the language of the student message and the speech-recognition setting.',
  ];

  if (mode === 'english') {
    return [
      ...header,
      '- Write the entire student-facing response in natural English only.',
      '- Do not use Bengali or Bangla-script characters.',
      '- Even when the student types or speaks Bangla, answer in English unless the saved teaching-language profile changes.',
      '- Keep necessary mathematical symbols, scientific notation, names, and code unchanged.',
    ];
  }

  if (mode === 'bangla') {
    return [
      ...header,
      '- Write the student-facing response in natural Bangladesh Bangla using Bengali script.',
      '- Construct the answer naturally in Bangla; do not translate English word by word.',
      '- English technical terms may appear only when academically necessary.',
      '- Do not use Romanized Bangla as the main response.',
    ];
  }

  if (mode === 'banglish') {
    return [
      ...header,
      '- Write conversational Bangla using Latin letters only.',
      '- Do not use Bengali-script characters.',
      '- Keep the wording readable and age appropriate.',
      '- Preserve necessary English academic terms.',
    ];
  }

  return [
    ...header,
    '- Use controlled English and natural Bangladesh Bangla.',
    '- Do not switch languages randomly inside a sentence.',
    '- Use Bangla for explanation and retain essential English academic terminology when useful.',
    '- Keep both languages concise and pedagogically connected.',
  ];
}

function characterCount(text, pattern) {
  return (
    String(text || '').match(pattern) || []
  ).length;
}

function auditTutorLanguage(
  text,
  requestedLanguage
) {
  const reply = String(text || '').trim();
  const mode =
    normalizeTeachingLanguage(
      requestedLanguage
    );

  if (!reply) {
    return {
      ok: false,
      mode,
      code: 'EMPTY_LANGUAGE_RESPONSE',
      banglaCharacters: 0,
      latinCharacters: 0,
    };
  }

  const banglaCharacters =
    characterCount(
      reply,
      BANGLA_SCRIPT_GLOBAL
    );

  const latinCharacters =
    characterCount(
      reply,
      LATIN_LETTER_GLOBAL
    );

  if (
    mode === 'english' &&
    BANGLA_SCRIPT_PATTERN.test(reply)
  ) {
    return {
      ok: false,
      mode,
      code: 'BANGLA_FOUND_IN_ENGLISH_RESPONSE',
      banglaCharacters,
      latinCharacters,
    };
  }

  if (
    mode === 'banglish' &&
    BANGLA_SCRIPT_PATTERN.test(reply)
  ) {
    return {
      ok: false,
      mode,
      code: 'BANGLA_SCRIPT_FOUND_IN_BANGLISH',
      banglaCharacters,
      latinCharacters,
    };
  }

  if (
    mode === 'bangla' &&
    banglaCharacters === 0 &&
    latinCharacters >= 4
  ) {
    return {
      ok: false,
      mode,
      code: 'BANGLA_MISSING_FROM_BANGLA_RESPONSE',
      banglaCharacters,
      latinCharacters,
    };
  }

  return {
    ok: true,
    mode,
    code: 'LANGUAGE_CONTRACT_PASSED',
    banglaCharacters,
    latinCharacters,
  };
}

function languageCorrectionInstruction(
  requestedLanguage
) {
  return [
    'LANGUAGE VALIDATION REPAIR',
    ...languageContractLines(
      requestedLanguage
    ),
    '',
    '- The previous model attempt violated the authoritative language contract.',
    '- Generate a fresh answer to the original student message.',
    '- Preserve the teaching objective and verified facts.',
    '- Do not mention validation, correction, retrying, or the previous response.',
    '- Follow the original output format exactly.',
  ].join('\n');
}

function languageFailureReply(
  requestedLanguage
) {
  const mode =
    normalizeTeachingLanguage(
      requestedLanguage
    );

  if (mode === 'bangla') {
    return (
      '\u0986\u09ae\u09bf ' +
      '\u09af\u09be\u099a\u09be\u0987\u0995\u09c3\u09a4 ' +
      '\u09ac\u09be\u0982\u09b2\u09be ' +
      '\u0989\u09a4\u09cd\u09a4\u09b0 ' +
      '\u09aa\u09cd\u09b0\u09b8\u09cd\u09a4\u09c1\u09a4 ' +
      '\u0995\u09b0\u09a4\u09c7 ' +
      '\u09aa\u09be\u09b0\u09bf\u09a8\u09bf\u0964 ' +
      '\u0985\u09a8\u09c1\u0997\u09cd\u09b0\u09b9 ' +
      '\u0995\u09b0\u09c7 ' +
      '\u09aa\u09cd\u09b0\u09b6\u09cd\u09a8\u099f\u09bf ' +
      '\u0986\u09ac\u09be\u09b0 ' +
      '\u0995\u09b0\u09cb\u0964'
    );
  }

  if (mode === 'banglish') {
    return (
      'Ami thik bhashay uttor prostut korte parini. ' +
      'Doya kore proshnoti abar bolo.'
    );
  }

  if (mode === 'bilingual') {
    return (
      'I could not prepare a verified bilingual response. ' +
      '\u09af\u09be\u099a\u09be\u0987\u0995\u09c3\u09a4 ' +
      '\u09a6\u09cd\u09ac\u09bf\u09ad\u09be\u09b7\u09bf\u0995 ' +
      '\u0989\u09a4\u09cd\u09a4\u09b0 ' +
      '\u09aa\u09cd\u09b0\u09b8\u09cd\u09a4\u09c1\u09a4 ' +
      '\u0995\u09b0\u09be ' +
      '\u09af\u09be\u09df\u09a8\u09bf\u0964'
    );
  }

  return (
    'I could not prepare a verified English response. ' +
    'Please ask the question again.'
  );
}

module.exports = {
  auditTutorLanguage,
  languageContractLines,
  languageCorrectionInstruction,
  languageFailureReply,
  normalizeTeachingLanguage,
};
