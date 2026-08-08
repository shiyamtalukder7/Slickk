const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } =
  require('node:fs');
const path = require('node:path');

function source(relative) {
  return readFileSync(
    path.join(process.cwd(), relative),
    'utf8'
  );
}

test(
  'runtime memory aggregation exposes recent and lifetime evidence separately',
  () => {
    const storage =
      source(
        'server/src/storage/conversations.js'
      );

    assert.match(
      storage,
      /recent_effective_count/
    );
    assert.match(
      storage,
      /recent_ineffective_count/
    );
    assert.match(
      storage,
      /freshnessWindowMs/
    );
    assert.match(
      storage,
      /revalidationEligible/
    );
    assert.match(
      storage,
      /revalidationStatus/
    );
  }
);

test(
  'selection fails closed when stored strategy evidence requires revalidation',
  () => {
    const memory =
      source(
        'server/src/outcomes/memory.js'
      );

    assert.match(
      memory,
      /strategy-revalidation-required/
    );
    assert.match(
      memory,
      /revalidationRequired:\s*true/
    );
    assert.match(
      memory,
      /lifetimeDecisiveCount/
    );
    assert.match(
      memory,
      /recentDecisiveCount/
    );
  }
);

test(
  'revalidation remains descriptive and subordinate to mastery policy',
  () => {
    const reflection =
      source(
        'server/src/reflection/engine.js'
      );
    const storage =
      source(
        'server/src/storage/conversations.js'
      );

    assert.match(
      reflection,
      /mayChangeMastery:\s*false/
    );
    assert.match(
      reflection,
      /mayCreateMisconception:\s*false/
    );
    assert.match(
      storage,
      /descriptiveOnly:\s*true/
    );
    assert.match(
      storage,
      /revalidationVersion/
    );
  }
);
