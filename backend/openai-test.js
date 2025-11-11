import fetch from "node-fetch";
import 'dotenv/config';


async function runTest() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("❌ No OPENAI_API_KEY found in environment variables");
    return;
  }

  const testImage =
    "https://upload.wikimedia.org/wikipedia/commons/3/3f/JPEG_example_flower.jpg";

  console.log("🔍 Testing vision access with gpt-4o...");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this picture briefly." },
            { type: "image_url", image_url: { url: testImage } },
          ],
        },
      ],
    }),
  });

  console.log("HTTP status:", res.status);
  const text = await res.text();
  console.log("\n--- API reply ---\n");
  console.log(text);
}

runTest().catch((err) => console.error("❌ Error running test:", err));
