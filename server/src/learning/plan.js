const { rankLearningActions } = require('./recommendations');

function key(value) {
  return String(value || '').trim().toLowerCase();
}

function buildPersonalLearningPlan(profile, { now = new Date(), limit = 5 } = {}) {
  const progress = Array.isArray(profile?.subjects) ? profile.subjects : [];
  const enrolled = Array.isArray(profile?.educationProfile?.subjects)
    ? profile.educationProfile.subjects
    : [];
  const misconceptions = Array.isArray(profile?.activeMisconceptions)
    ? profile.activeMisconceptions
    : [];
  const bySubject = new Map(progress.map((item) => [key(item.subject), item]));
  const subjects = [...new Set([...enrolled, ...progress.map((item) => item.subject)].filter(Boolean))];
  const skills = subjects.map((subject) => {
    const current = bySubject.get(key(subject));
    const evidenceCount = Math.max(0, Number(current?.masteryEvidence) || 0);
    return {
      skillId: current?.subjectKey || key(subject).replace(/[^a-z0-9]+/g, '-') || 'general',
      subject,
      mastery: Number(current?.masteryScore) || 0.25,
      uncertainty: Math.max(0.1, 1 - Math.min(0.9, evidenceCount / 10)),
      evidenceCount,
      nextReviewAt: current?.nextReviewAt || '',
      hasMisconception: misconceptions.some((item) => key(item.subject) === key(subject)),
      topic: current?.lastTopic || '',
    };
  });
  const sourceById = new Map(skills.map((item) => [item.skillId, item]));
  const recommendations = rankLearningActions({ skills, now, limit });

  return {
    policy: 'personal-learning-plan-v1',
    generatedAt: new Date(now).toISOString(),
    studentName: profile?.educationProfile?.studentName || profile?.studentName || 'Student',
    grade: profile?.educationProfile?.grade || profile?.grade || '',
    totalMinutes: recommendations.reduce((total, item) => total + (item.action === 'guided-practice' ? 15 : 10), 0),
    items: recommendations.map((item, index) => {
      const source = sourceById.get(item.skillId) || {};
      return {
        id: `${item.skillId}-${index + 1}`,
        priority: index + 1,
        subject: item.subject,
        topic: source.topic || 'Diagnostic check',
        action: item.action,
        durationMinutes: item.action === 'guided-practice' ? 15 : 10,
        reasons: item.reasons,
        evidenceCount: item.evidenceCount,
        tutorPrompt: item.action === 'guided-practice'
          ? `Help me repair my weakest skill in ${item.subject}. Diagnose first, then guide me one step at a time.`
          : item.action === 'spaced-review'
            ? `Give me a short spaced review for ${item.subject}, one question at a time.`
            : `Give me a short diagnostic check in ${item.subject} and adapt from my answer.`,
      };
    }),
  };
}

module.exports = { buildPersonalLearningPlan };
