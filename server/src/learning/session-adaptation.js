const MAX_CHECK_IN_AGE_MS = 18 * 60 * 60 * 1000;

function sessionAdaptation(checkIn, now = new Date()) {
  const createdAt = Date.parse(checkIn?.createdAt || '');
  const fresh = Number.isFinite(createdAt) && Math.abs(now.getTime() - createdAt) <= MAX_CHECK_IN_AGE_MS;
  const gentle = fresh && checkIn?.learningPace === 'gentle';
  return {
    source: gentle ? 'recent-check-in' : 'standard',
    pace: gentle ? 'gentle' : 'standard',
    sessionMinutes: gentle ? 10 : 20,
    stepSize: gentle ? 'smaller' : 'normal',
    typedWordTarget: gentle ? '35-90' : '60-160',
    rule: gentle
      ? 'Use shorter explanations, one smaller cognitive step, extra wait space, and calm wording. Keep the same learning objective and evidence standard.'
      : 'Use concise age-appropriate teaching and the normal evidence standard.',
    mayLowerMasteryStandard: false,
  };
}

module.exports = { sessionAdaptation };
