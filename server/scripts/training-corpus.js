const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const {
  buildCurriculumTrainingPlan,
} = require('../src/training/corpus');
const {
  createCurriculumStore,
} = require('../src/storage/curriculum');

function parseArguments(values) {
  const result = {};

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];

    if (!item.startsWith('--')) {
      continue;
    }

    result[item.slice(2)] = values[index + 1];
    index += 1;
  }

  return result;
}

function boundedInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value || ''), 10);

  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(1, parsed))
    : fallback;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const targetExamples = boundedInteger(
    args.target,
    1_000_000,
    1_000_000
  );
  const sourceLimit = boundedInteger(
    args.limit,
    10_000,
    150_000
  );
  const outputPath = path.resolve(
    __dirname,
    '..',
    args.output ||
      'data/training/curriculum-training-plan.json'
  );
  const store = createCurriculumStore();

  try {
    const sourceInventory =
      store.getTrainingInventory();
    const sources =
      store.listTrainingSources(sourceLimit);
    const plan = buildCurriculumTrainingPlan({
      sources,
      sourceInventory,
      targetExamples,
    });

    await mkdir(path.dirname(outputPath), {
      recursive: true,
    });
    await writeFile(
      outputPath,
      `${JSON.stringify(plan, null, 2)}\n`,
      'utf8'
    );

    console.log(
      JSON.stringify(
        {
          outputPath,
          targetExamples: plan.targetExamples,
          availableExamples: plan.availableExamples,
          shortfall: plan.shortfall,
          uniqueEligibleSources:
            plan.uniqueEligibleSources,
          excludedByRights: plan.excludedByRights,
          split: plan.split,
          readyForWeightTraining:
            plan.readyForWeightTraining,
        },
        null,
        2
      )
    );
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
