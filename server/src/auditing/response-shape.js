function normalizedText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function wordCount(value) {
  const text = normalizedText(value);

  return text
    ? text.split(/\s+/u).filter(Boolean).length
    : 0;
}

function questionCount(value) {
  return (
    normalizedText(value).match(/\?/g) || []
  ).length;
}

function auditTutorResponseShape(
  reply,
  channel = 'typed'
) {
  const text = normalizedText(reply);
  const words = wordCount(text);
  const questions = questionCount(text);
  const issues = [];

  if (!text) {
    issues.push('EMPTY_RESPONSE');
  }

  if (/^\s*(?:\{|\[|```)/u.test(text)) {
    issues.push('STRUCTURED_WRAPPER_VISIBLE');
  }

  if (channel === 'live') {
    if (words > 70) {
      issues.push('LIVE_RESPONSE_TOO_LONG');
    }

    if (questions > 1) {
      issues.push('TOO_MANY_QUESTIONS');
    }
  }

  return {
    ok: issues.length === 0,
    channel,
    words,
    questions,
    issues,
  };
}

function firstQuestionOnly(text) {
  const firstQuestion = text.indexOf('?');

  return firstQuestion < 0
    ? text
    : text.slice(0, firstQuestion + 1);
}

function constrainLiveTutorReply(
  value,
  maxWords = 70
) {
  const text = normalizedText(value);

  if (!text) {
    return '';
  }

  const sentences =
    text.match(/[^.!?]+[.!?]+|[^.!?]+$/gu) ||
    [text];
  const selected = [];
  let words = 0;
  let questions = 0;

  for (const rawSentence of sentences) {
    let sentence = normalizedText(rawSentence);

    if (!sentence) {
      continue;
    }

    if (questionCount(sentence) > 1) {
      sentence = firstQuestionOnly(sentence);
    }

    const sentenceQuestions =
      questionCount(sentence);
    const sentenceWords = wordCount(sentence);

    if (
      questions >= 1 &&
      sentenceQuestions > 0
    ) {
      break;
    }

    if (
      selected.length > 0 &&
      words + sentenceWords > maxWords
    ) {
      break;
    }

    if (
      selected.length === 0 &&
      sentenceWords > maxWords
    ) {
      const shortened = sentence
        .split(/\s+/u)
        .slice(0, maxWords)
        .join(' ')
        .replace(/[,:;\-]+$/u, '')
        .trim();

      selected.push(
        /[.!?]$/u.test(shortened)
          ? shortened
          : `${shortened}.`
      );
      break;
    }

    selected.push(sentence);
    words += sentenceWords;
    questions += sentenceQuestions;

    if (questions >= 1) {
      break;
    }
  }

  return normalizedText(selected.join(' '));
}

function constrainTutorReply(
  reply,
  {
    channel = 'typed',
    maxLiveWords = 70,
  } = {}
) {
  const text = normalizedText(reply);

  if (channel !== 'live') {
    return text;
  }

  return constrainLiveTutorReply(
    text,
    maxLiveWords
  );
}

module.exports = {
  auditTutorResponseShape,
  constrainLiveTutorReply,
  constrainTutorReply,
  questionCount,
  wordCount,
};
