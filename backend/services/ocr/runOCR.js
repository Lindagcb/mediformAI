// /services/ocr/runOCR.js
import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";

export async function runOCR(pdfBuffer) {
  const endpoint = process.env.AZURE_OCR_ENDPOINT;
  const key = process.env.AZURE_OCR_KEY;

  if (!endpoint || !key) {
    console.warn("⚠️ Azure OCR disabled (missing env vars)");
    return "";
  }

  const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));

  try {
    const poller = await client.beginAnalyzeDocument("prebuilt-read", pdfBuffer);
    const result = await poller.pollUntilDone();

    let text = "";
    for (const page of result.pages || []) {
      for (const line of page.lines || []) {
        text += line.content + "\n";
      }
    }
    return text.trim();
  } catch (err) {
    console.error("Azure OCR error:", err);
    return "";
  }
}
