import readline from "node:readline";

import {
  env,
  pipeline,
  TextStreamer,
} from "@huggingface/transformers";

env.cacheDir = "./.cache";
env.allowRemoteModels = true;

const MODEL_NAME =
  "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA";

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function extractAssistantText(output) {
  const generated = output?.[0]?.generated_text;

  if (Array.isArray(generated)) {
    const assistantMessage = [...generated]
      .reverse()
      .find((message) => message?.role === "assistant");

    return assistantMessage?.content ?? "";
  }

  if (typeof generated === "string") {
    return generated;
  }

  return "";
}

function normalizeMaxNewTokens(value) {
  if (!Number.isInteger(value)) {
    return 96;
  }

  return Math.min(Math.max(value, 1), 256);
}

const GENERATION_OPTIONS = {
  do_sample: false,
  repetition_penalty: 1.18,
  no_repeat_ngram_size: 3,
  return_full_text: false,
};

async function main() {
  const generator = await pipeline(
    "text-generation",
    MODEL_NAME,
    {
      device: "cpu",
      dtype: "q4",
    },
  );

  send({
    event: "ready",
    model: "slickk-edu-local",
    backend: "transformers-js-onnx-cpu",
  });

  const input = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of input) {
    if (!line.trim()) {
      continue;
    }

    let request;

    try {
      request = JSON.parse(line);
    } catch {
      send({
        ok: false,
        error: "The request must contain valid JSON.",
      });

      continue;
    }

    if (request.command === "shutdown") {
      send({
        ok: true,
        event: "shutdown",
      });

      break;
    }

    const prompt = request.prompt;

    if (typeof prompt !== "string" || !prompt.trim()) {
      send({
        ok: false,
        error: "A non-empty prompt is required.",
      });

      continue;
    }

    const maxNewTokens = normalizeMaxNewTokens(
      request.max_new_tokens,
    );

    const messages = [
      {
        role: "system",
        content:
          "You are Slickk, a helpful private educational tutor. " +
          "Give accurate, clear, concise, and age-appropriate answers.",
      },
      {
        role: "user",
        content: prompt.trim(),
      },
    ];

    try {
      const streamRequested = request.stream === true;

      if (streamRequested) {
        const requestId =
          request.id ?? `slickk-${Date.now()}`;

        const streamer = new TextStreamer(
          generator.tokenizer,
          {
            skip_prompt: true,
            skip_special_tokens: true,
            callback_function: (text) => {
              if (!text) {
                return;
              }

              send({
                event: "chunk",
                id: requestId,
                text,
              });
            },
          },
        );

        await generator(messages, {
          max_new_tokens: maxNewTokens,
          ...GENERATION_OPTIONS,
          streamer,
        });

        send({
          ok: true,
          event: "done",
          id: requestId,
          model: "slickk-edu-local",
          backend: "transformers-js-onnx-cpu",
          max_new_tokens: maxNewTokens,
        });
      } else {
        const output = await generator(messages, {
          max_new_tokens: maxNewTokens,
          ...GENERATION_OPTIONS,
        });

        send({
          ok: true,
          text: extractAssistantText(output),
          model: "slickk-edu-local",
          backend: "transformers-js-onnx-cpu",
          max_new_tokens: maxNewTokens,
        });
      }
    } catch (error) {
      send({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  input.close();
}

main().catch((error) => {
  send({
    ok: false,
    event: "startup_failed",
    error:
      error instanceof Error
        ? error.message
        : String(error),
  });

  process.exit(1);
});