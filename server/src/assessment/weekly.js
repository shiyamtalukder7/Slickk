const { createHash, randomUUID } = require('node:crypto');
const { buildPersonalLearningPlan } = require('../learning/plan');

const QUESTION_KINDS = ['diagnostic', 'explain', 'apply', 'misconception-check', 'teach-back'];

function questionText(kind, subject, topic) {
  const focus = topic && topic !== 'Diagnostic check' ? topic : `a recent ${subject} idea`;
  const templates = {
    diagnostic: `What is the most important idea you remember about ${focus}?`,
    explain: `Explain ${focus} in your own words and include one important detail.`,
    apply: `Give a new example where ${focus} could be applied, and explain your reasoning.`,
    'misconception-check': `State one common mistake about ${focus}, then correct it.`,
    'teach-back': `Teach ${focus} to a younger student in three clear steps.`,
  };
  return templates[kind];
}

function buildWeeklyAssessment(profile, { now = new Date(), questionCount = 10, subjects = [] } = {}) {
  const count = Math.min(20, Math.max(5, Number(questionCount) || 10));
  const plan = buildPersonalLearningPlan(profile, { now, limit: 5 });
  const selected = new Set(subjects.map((subject) => String(subject).trim().toLowerCase()).filter(Boolean));
  const filtered = selected.size
    ? plan.items.filter((item) => selected.has(item.subject.toLowerCase()))
    : plan.items;
  const source = filtered.length ? filtered : plan.items.length ? plan.items : [{ subject: 'General Studies', topic: 'recent learning', reasons: [] }];
  const questions = Array.from({ length: count }, (_, index) => {
    const item = source[index % source.length];
    const kind = QUESTION_KINDS[index % QUESTION_KINDS.length];
    return {
      id: `q-${index + 1}`,
      number: index + 1,
      subject: item.subject,
      topic: item.topic,
      kind,
      prompt: questionText(kind, item.subject, item.topic),
      points: 2,
      rubric: { required: ['relevant concept', 'clear reasoning'], partialCredit: true, requiresEducatorReview: kind !== 'diagnostic' },
      priorityReasons: item.reasons || [],
    };
  });
  const generatedAt = new Date(now).toISOString();
  const identity = JSON.stringify({ student: plan.studentName, generatedAt, questions });

  return {
    id: `weekly-${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`,
    submissionId: randomUUID(),
    title: 'Slickk Adaptive Weekly Test',
    generatedAt,
    studentName: plan.studentName,
    grade: plan.grade,
    durationMinutes: count * 2,
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
    policy: 'adaptive-weekly-assessment-v1',
    questions,
  };
}

module.exports = { buildWeeklyAssessment, questionText };
