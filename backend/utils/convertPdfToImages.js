import pdf2img from "pdf-img-convert"; // Pure JS/NPM solution
import path from "path";
import { uploadToAzure } from "./azureUpload.js";

export async function convertPdfToImages(pdfLocalPath) {
  try {
    // 1. Convert PDF to Image Buffers
    // This uses Mozilla's PDF.js engine (bundled in the npm package)
    // instead of relying on external Linux installs like Ghostscript.
    const outputImages = await pdf2img.convert(pdfLocalPath, {
      width: 1240,
      height: 1754,
      page_numbers: [1], // Only convert page 1
      base64: false,     // request raw buffer data
    });

    if (!outputImages || outputImages.length === 0) {
      throw new Error("❌ No image created from PDF.");
    }

    // 2. Process the Buffer
    // pdf-img-convert returns Uint8Array, we need to wrap it in a Buffer for Azure
    const imageBuffer = Buffer.from(outputImages[0]);
    
    // Create a filename based on original
    const originalName = path.basename(pdfLocalPath, ".pdf");
    const imageFileName = `${originalName}.png`;

    console.log(`Processing ${imageFileName} (Size: ${imageBuffer.length} bytes)...`);

    // 3. Upload directly to Azure 
    // We skip fs.writeFile entirely to avoid "Read-only file system" errors on Vercel
    const imageUrl = await uploadToAzure(imageFileName, imageBuffer, "image/png");

    console.log("✅ PDF converted and uploaded:", imageUrl);
    return [imageUrl];

  } catch (error) {
    console.error("❌ Failed to convert PDF on Serverless Environment:", error);
    throw error;
  }
}