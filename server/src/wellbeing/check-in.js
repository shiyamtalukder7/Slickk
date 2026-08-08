const MOODS = new Set(['great', 'okay', 'tired', 'worried', 'upset']);
const SCHOOL_DAYS = new Set(['good', 'mixed', 'difficult', 'not-today']);

function buildCheckIn(input, now = new Date()) {
  const mood = String(input?.mood || '').trim().toLowerCase();
  const schoolDay = String(input?.schoolDay || '').trim().toLowerCase();
  if (!MOODS.has(mood) || !SCHOOL_DAYS.has(schoolDay)) {
    const error = new Error('Choose how you feel and how school went.');
    error.code = 'INVALID_CHECK_IN'; error.status = 400; throw error;
  }
  const needsTrustedAdult = input?.needsTrustedAdult === true;
  const gentleDay = ['tired', 'worried', 'upset'].includes(mood) || schoolDay === 'difficult';
  return {
    mood, schoolDay, needsTrustedAdult, learningPace: gentleDay ? 'gentle' : 'standard',
    suggestedMinutes: gentleDay ? 10 : 20,
    response: needsTrustedAdult
      ? 'Thank you for telling me. Please go to a trusted adult near you now. You deserve real human support, and you do not have to handle this alone.'
      : gentleDay
        ? 'Thank you for checking in. We can take today gently: one small step, no pressure, and you can pause whenever you need.'
        : 'Thanks for checking in. Let’s use that energy for one clear learning goal, and celebrate the progress you make.',
    createdAt: new Date(now).toISOString(),
  };
}

module.exports = { buildCheckIn };
