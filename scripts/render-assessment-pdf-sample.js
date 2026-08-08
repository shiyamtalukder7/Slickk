const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'services', 'assessment-pdf.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const assessmentModule = new Module('assessment-pdf-sample');
assessmentModule.filename = path.join(root, 'src', 'services', 'assessment-pdf.ts');
assessmentModule.require = (id) => {
  if (id === 'expo-print' || id === 'expo-sharing') return {};
  return require(id);
};
assessmentModule._compile(compiled, assessmentModule.filename);

const questions = Array.from({ length: 10 }, (_, index) => ({
  id: `q-${index + 1}`,
  number: index + 1,
  subject: index % 2 ? 'English' : 'Mathematics',
  topic: index % 2 ? 'Reading comprehension' : 'Fractions',
  kind: ['diagnostic', 'explain', 'apply', 'misconception-check', 'teach-back'][index % 5],
  prompt: index % 2
    ? 'Explain how the author supports the main idea and include one detail from the passage.'
    : 'Show how equivalent fractions work using a new example, and explain your reasoning.',
  points: 2,
  priorityReasons: ['verified mastery needs support'],
}));
const assessment = {
  id: 'weekly-visual-quality-sample', submissionId: 'sample',
  title: 'Slickk Adaptive Weekly Test', generatedAt: new Date().toISOString(),
  studentName: 'Sample Student', grade: 'Class 7', durationMinutes: 20,
  totalPoints: 20, questions,
};
const outputDirectory = path.join(root, 'tmp', 'pdfs');
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'slickk-weekly-test-sample.html'), assessmentModule.exports.weeklyAssessmentHtml(assessment));
