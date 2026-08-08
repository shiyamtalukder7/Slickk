function safeList(value) {
  return Array.isArray(value) ? value : [];
}

function buildParentSummary(profile, { now = new Date(), latestCheckIn = null } = {}) {
  const subjects = safeList(profile?.subjects);
  const assessed = subjects.filter((item) => Number(item.masteryEvidence) > 0);
  const strengths = assessed.filter((item) => Number(item.masteryScore) >= 0.72)
    .sort((a, b) => Number(b.masteryScore) - Number(a.masteryScore));
  const priorities = subjects.filter((item) => Number(item.masteryScore) < 0.58 || item.lastMisconception)
    .sort((a, b) => Number(a.masteryScore) - Number(b.masteryScore));
  const correct = assessed.reduce((sum, item) => sum + (Number(item.correctAnswers) || 0), 0);
  const incorrect = assessed.reduce((sum, item) => sum + (Number(item.incorrectAnswers) || 0), 0);
  const verifiedAnswers = correct + incorrect;
  const firstPriority = priorities[0];

  return {
    policy: 'parent-summary-v1', generatedAt: new Date(now).toISOString(),
    studentName: profile?.educationProfile?.studentName || profile?.studentName || 'Student',
    grade: profile?.educationProfile?.grade || profile?.grade || '',
    lessonsCompleted: Number(profile?.totalTurns) || 0,
    subjectsStudied: subjects.length, verifiedAnswers,
    accuracyPercentage: verifiedAnswers ? Math.round((correct / verifiedAnswers) * 100) : null,
    strengths: strengths.slice(0, 3).map((item) => ({ subject: item.subject, masteryPercentage: Math.round(Number(item.masteryScore) * 100), evidenceCount: Number(item.masteryEvidence) || 0 })),
    priorities: priorities.slice(0, 3).map((item) => ({ subject: item.subject, topic: item.lastTopic || 'Foundational understanding', misconception: item.lastMisconception || '', nextAction: item.nextAction || `Complete a short guided review in ${item.subject}.`, masteryPercentage: Math.round(Number(item.masteryScore) * 100) })),
    homeSupport: firstPriority
      ? `Ask ${profile?.studentName || 'the student'} to explain one idea from ${firstPriority.subject} aloud. Praise the reasoning, then use Slickk's guided review for the part that is unclear.`
      : verifiedAnswers
        ? 'Celebrate the verified progress and ask the student to teach back one idea they learned this week.'
        : 'Help the student complete one short tutor session and the weekly check so Slickk can provide evidence-based guidance.',
    evidenceNotice: 'Mastery and accuracy use educator-verified answers only. Tutor conversation signals are not treated as test results.',
    wellbeingSupport: latestCheckIn ? {
      needsTrustedAdult: latestCheckIn.needsTrustedAdult === true,
      learningPace: latestCheckIn.learningPace,
      createdAt: latestCheckIn.createdAt,
    } : null,
  };
}

module.exports = { buildParentSummary };
