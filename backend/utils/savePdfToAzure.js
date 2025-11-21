// utils/savePdfToAzure.js
import fs from "fs";
import { uploadToAzure } from "./azureUpload.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Saves a PDF buffer to a temporary local file,
 * uploads it to Azure Blob, and returns the blob URL.
 */
export async function savePdfToAzure(pdfBuffer, originalFilename = "document.pdf") {
  // 1️⃣ Save PDF temporarily
  const tempPath = `./tmp_pdf_${uuidv4()}.pdf`;
  await fs.promises.writeFile(tempPath, pdfBuffer);

  // 2️⃣ Upload PDF
  const blobName = `${uuidv4()}-${originalFilename}`;
  const pdfUrl = await uploadToAzure(blobName, pdfBuffer, "application/pdf");

  // 3️⃣ Remove local temp
  await fs.promises.unlink(tempPath);

  return pdfUrl;
}
