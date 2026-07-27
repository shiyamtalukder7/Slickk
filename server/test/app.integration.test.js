const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const test = require('node:test');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

test('gateway preserves the mobile tutor contract', async (context) => {
  const fakeOllama = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');

    if (request.url === '/api/tags') {
      response.end(
        JSON.stringify({
          models: [{ name: 'slickk-tutor-3b-backup:latest' }],
        })
      );
      return;
    }

    if (request.url === '/api/chat') {
      response.end(
        JSON.stringify({
          message: {
            role: 'assistant',
            content: JSON.stringify({
              reply: 'Two plus two equals four.',
              topic: 'Arithmetic',
              skill: 'Addition',
              misconception: '',
              nextAction: 'What is three plus two?',
              confidence: 0.8,
              masteryDelta: 1,
            }),
          },
          done: true,
          done_reason: 'stop',
          total_duration: 2_000_000_000,
          load_duration: 100_000_000,
          prompt_eval_count: 100,
          eval_count: 20,
          eval_duration: 1_000_000_000,
        })
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  const ollamaPort = await listen(fakeOllama);
  process.env.OLLAMA_URL = `http://127.0.0.1:${ollamaPort}`;
  process.env.OLLAMA_MODEL = 'slickk-tutor-3b-backup';

  const { createApp } = require('../src/app');
  const gateway = createServer(createApp());
  const gatewayPort = await listen(gateway);

  context.after(async () => {
    await close(gateway);
    await close(fakeOllama);
  });

  const healthResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/health`
  );
  const health = await healthResponse.json();

  assert.equal(healthResponse.status, 200);
  assert.equal(health.ok, true);
  assert.equal(health.modelInstalled, true);

  const tutorResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/tutor`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'What is 2 + 2?',
        grade: 'Grade 7-8',
      }),
    }
  );
  const tutor = await tutorResponse.json();

  assert.equal(tutorResponse.status, 200);
  assert.equal(tutor.reply, 'Two plus two equals four.');
  assert.equal(tutor.learningTwin.topic, 'Arithmetic');
  assert.equal(tutor.learningTwin.masteryDelta, 1);
  assert.equal(tutor.metadata.model, 'slickk-tutor-3b-backup');
  assert.equal(tutor.metadata.performance.generatedTokens, 20);
  assert.match(
    tutorResponse.headers.get('x-request-id'),
    /^[0-9a-f-]{36}$/i
  );
});
