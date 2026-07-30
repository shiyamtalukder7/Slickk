import { env, pipeline } from "@huggingface/transformers";

env.cacheDir = "./.cache";
env.allowRemoteModels = true;

async function readInput() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");

  if (!text.trim()) {
    throw new Error("No JSON request was provided.");
  }

  return JSON.parse(text);
}

function assistantText(output) {
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

async function main() {
  const request = await readInput();
  const prompt = request.prompt;

  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("A non-empty prompt is required.");
  }

  const maxNewTokens = Number.isInteger(request.max_new_tokens)
    ? Math.min(Math.max(request.max_new_tokens, 1), 256)
    : 96;

  const generator = await pipeline(
    "text-generation",
    "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA",
    {
      device: "cpu",
      dtype: "q4",
    },
  );

  const messages = [
    {
      role: "system",
      content: (
        "You are Slickk, a helpful private educational tutor. " +
        "Give accurate, clear and age-appropriate answers."
      ),
    },
    {
      role: "user",
      content: prompt.trim(),
    },
  ];

  const output = await generator(messages, {
    max_new_tokens: maxNewTokens,
    do_sample: false,
  });

  process.stdout.write(
    JSON.stringify({
      text: assistantText(output),
      model: "slickk-edu-local",
      backend: "transformers-js-onnx-cpu",
      max_new_tokens: maxNewTokens,
    }),
  );
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }),
  );

  process.exit(1);
});
