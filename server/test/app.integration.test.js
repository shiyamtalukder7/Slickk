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

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

test('gateway streams and persists the mobile tutor contract', async (context) => {
  const fakeOllama = createServer(async (request, response) => {
    if (request.url === '/api/tags') {
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          models: [{ name: 'slickk-tutor-3b-backup:latest' }],
        })
      );
      return;
    }

    if (request.url === '/api/chat') {
      const body = await readRequestBody(request);

      if (body.stream) {
        response.setHeader(
          'Content-Type',
          'application/x-ndjson'
        );
        response.write(
          `${JSON.stringify({
            message: { content: 'Seven' },
            done: false,
          })}\n`
        );
        response.write(
          `${JSON.stringify({
            message: { content: ' apples remain.' },
            done: false,
          })}\n`
        );
        response.end(
          `${JSON.stringify({
            message: { content: '' },
            done: true,
            done_reason: 'stop',
            total_duration: 2_000_000_000,
            load_duration: 100_000_000,
            prompt_eval_count: 100,
            eval_count: 20,
            eval_duration: 1_000_000_000,
          })}\n`
        );
        return;
      }

      response.setHeader('Content-Type', 'application/json');
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
  const {
    createConversationStore,
  } = require('../src/storage/conversations');
  const conversationStore =
    createConversationStore(':memory:');
  const gateway = createServer(
    createApp({ conversationStore })
  );
  const gatewayPort = await listen(gateway);

  context.after(async () => {
    conversationStore.close();
    await close(gateway);
    await close(fakeOllama);
  });

  const healthResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/health`
  );
  const health = await healthResponse.json();

  assert.equal(healthResponse.status, 200);
  assert.equal(health.ok, true);

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
  const conversationId = tutor.metadata.conversationId;

  assert.equal(tutorResponse.status, 200);
  assert.equal(tutor.reply, 'Two plus two equals four.');
  assert.equal(tutor.learningTwin.topic, 'Arithmetic');
  assert.match(conversationId, /^[0-9a-f-]{36}$/i);

  const streamResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/tutor/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'What is 12 minus 5?',
        conversationId,
      }),
    }
  );
  const streamEvents = (await streamResponse.text())
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));

  assert.equal(streamResponse.status, 200);
  assert.equal(streamEvents[0].type, 'start');
  assert.equal(
    streamEvents
      .filter((event) => event.type === 'token')
      .map((event) => event.content)
      .join(''),
    'Seven apples remain.'
  );
  assert.equal(
    streamEvents.at(-1).conversationId,
    conversationId
  );
  assert.equal(streamEvents.at(-1).type, 'complete');

  const messagesResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/conversations/${conversationId}/messages`
  );
  const stored = await messagesResponse.json();

  assert.equal(messagesResponse.status, 200);
  assert.equal(stored.messages.length, 4);
  assert.deepEqual(
    stored.messages.map((message) => message.role),
    ['student', 'tutor', 'student', 'tutor']
  );
});
