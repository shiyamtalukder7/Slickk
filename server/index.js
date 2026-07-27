const express = require('express');
const cors = require('cors');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const OLLAMA_URL =
  process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || 'qwen2.5:3b';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

function normalizeHistory(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      (message) =>
        message &&
        typeof message.text === 'string' &&
        (message.role === 'student' ||
          message.role === 'tutor')
    )
    .slice(-12)
    .map((message) => ({
      role:
        message.role === 'student'
          ? 'user'
          : 'assistant',
      content: message.text.slice(0, 4000),
    }));
}

function buildSystemPrompt({
  studentName,
  grade,
  language,
  mode,
}) {
  return `
You are Slickk Tutor, an adaptive personal teacher.

STUDENT PROFILE
Name: ${studentName || 'Student'}
Academic level: ${grade || 'General'}
Preferred teaching language: ${language || 'English'}
Learning mode: ${mode || 'adaptive'}

YOUR PURPOSE
Teach the student rather than merely giving answers.
Adapt explanations to the student's age, knowledge,
mistakes, confidence and learning speed.

TEACHING RULES
1. Answer in ${language || 'English'} unless asked otherwise.
2. Explain ideas clearly and step by step.
3. Use simple examples connected to real life.
4. Ask only one question at a time.
5. Use hints before revealing answers when appropriate.
6. Correct mistakes kindly and explain why.
7. Never shame or insult the student.
8. Check whether the student understands.
9. Teach homework methods instead of encouraging cheating.
10. Never invent facts.
11. Clearly admit uncertainty.
12. Keep the answer readable on a phone screen.
13. Detect possible misconceptions.
14. Finish with one useful next action or checking question.
15. Support English, Bangla and Banglish naturally.

LEARNING MODES
adaptive: choose the best teaching method.
teach: teach from the beginning.
hint: guide without revealing everything immediately.
quiz: ask one question and wait.
explain: simplify the topic.

OUTPUT
Return valid JSON only.

Use exactly this structure:

{
  "reply": "The response shown to the student",
  "topic": "Main learning topic",
  "skill": "Specific skill being practised",
  "misconception": "",
  "nextAction": "Recommended next step",
  "confidence": 0.5,
  "masteryDelta": 1
}

confidence must be between 0 and 1.
masteryDelta must be an integer between -2 and 3.
Do not use markdown code fences.
`;
}

function safelyParseTutorResult(rawText) {
  try {
    const parsed = JSON.parse(rawText);

    return {
      reply:
        typeof parsed.reply === 'string'
          ? parsed.reply
          : rawText,

      topic:
        typeof parsed.topic === 'string'
          ? parsed.topic
          : 'General learning',

      skill:
        typeof parsed.skill === 'string'
          ? parsed.skill
          : 'Understanding',

      misconception:
        typeof parsed.misconception === 'string'
          ? parsed.misconception
          : '',

      nextAction:
        typeof parsed.nextAction === 'string'
          ? parsed.nextAction
          : 'Continue learning',

      confidence: Math.max(
        0,
        Math.min(1, Number(parsed.confidence) || 0.5)
      ),

      masteryDelta: Math.max(
        -2,
        Math.min(
          3,
          Math.round(Number(parsed.masteryDelta) || 0)
        )
      ),
    };
  } catch {
    return {
      reply: rawText,
      topic: 'General learning',
      skill: 'Understanding',
      misconception: '',
      nextAction: 'Continue learning',
      confidence: 0.5,
      masteryDelta: 0,
    };
  }
}

app.get('/', (request, response) => {
  response.json({
    status: 'online',
    service: 'Slickk Local Intelligence Core',
    provider: 'Ollama',
    model: OLLAMA_MODEL,
  });
});

app.get('/health', async (request, response) => {
  try {
    const ollamaResponse = await fetch(
      `${OLLAMA_URL}/api/tags`
    );

    if (!ollamaResponse.ok) {
      throw new Error('Ollama did not respond.');
    }

    return response.json({
      ok: true,
      ollama: 'connected',
      model: OLLAMA_MODEL,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return response.status(503).json({
      ok: false,
      ollama: 'disconnected',
      error:
        'Open Ollama on the laptop and try again.',
    });
  }
});

app.post('/api/tutor', async (request, response) => {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 120000);

  try {
    const {
      message,
      studentName = 'Student',
      grade = 'General',
      language = 'English',
      mode = 'adaptive',
      recentMessages = [],
    } = request.body || {};

    if (
      typeof message !== 'string' ||
      !message.trim()
    ) {
      return response.status(400).json({
        error: 'Please provide a learning question.',
      });
    }

    if (message.length > 12000) {
      return response.status(400).json({
        error: 'The message is too long.',
      });
    }

    const history = normalizeHistory(recentMessages);

    const ollamaResponse = await fetch(
      `${OLLAMA_URL}/api/chat`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        signal: controller.signal,

        body: JSON.stringify({
          model: OLLAMA_MODEL,

          stream: false,

          format: 'json',

          keep_alive: '10m',

          messages: [
            {
              role: 'system',
              content: buildSystemPrompt({
                studentName,
                grade,
                language,
                mode,
              }),
            },

            ...history,

            {
              role: 'user',
              content: message.trim(),
            },
          ],

          options: {
            temperature: 0.35,
            top_p: 0.9,
            num_predict: 700,
          },
        }),
      }
    );

    const ollamaData = await ollamaResponse.json();

    if (!ollamaResponse.ok) {
      throw new Error(
        ollamaData?.error ||
          'Ollama could not generate a response.'
      );
    }

    const rawReply =
      ollamaData?.message?.content?.trim();

    if (!rawReply) {
      throw new Error(
        'The local AI returned an empty response.'
      );
    }

    const tutorResult =
      safelyParseTutorResult(rawReply);

    return response.json({
      reply: tutorResult.reply,

      learningTwin: {
        topic: tutorResult.topic,
        skill: tutorResult.skill,
        misconception: tutorResult.misconception,
        nextAction: tutorResult.nextAction,
        confidence: tutorResult.confidence,
        masteryDelta: tutorResult.masteryDelta,
      },

      metadata: {
        provider: 'ollama',
        model: OLLAMA_MODEL,
        mode,
        language,
        grade,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(
      'Slickk tutor error:',
      error?.message || error
    );

    if (error?.name === 'AbortError') {
      return response.status(504).json({
        error:
          'The local tutor took too long to answer.',
      });
    }

    return response.status(500).json({
      error:
        'Slickk could not reach the local AI. Make sure Ollama is running.',
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.use((request, response) => {
  response.status(404).json({
    error: 'Slickk server route not found.',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log(' SLICKK LOCAL INTELLIGENCE IS ONLINE');
  console.log(` Port: ${PORT}`);
  console.log(` Model: ${OLLAMA_MODEL}`);
  console.log('========================================');
  console.log('');
});