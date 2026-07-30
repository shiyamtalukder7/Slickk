import { env, pipeline } from "@huggingface/transformers";

env.cacheDir = "./.cache";
env.allowRemoteModels = true;

async function main() {
  console.log("Slickk: loading the local AI model on CPU...");

  const generator = await pipeline(
    "text-generation",
    "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA",
    {
      device: "cpu",
      dtype: "q4",
    },
  );

  console.log("Slickk: model loaded.");

  const messages = [
    {
      role: "system",
      content: "You are Slickk, a helpful local educational tutor.",
    },
    {
      role: "user",
      content: "Explain photosynthesis in two simple sentences.",
    },
  ];

  const output = await generator(messages, {
    max_new_tokens: 48,
    do_sample: false,
  });

  console.log("");
  console.log("Slickk response:");
  console.log(JSON.stringify(output, null, 2));
}

main()
  .then(() => {
    console.log("\nSlickk inference test completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nSlickk inference failed:");
    console.error(error);
    process.exit(1);
  });
