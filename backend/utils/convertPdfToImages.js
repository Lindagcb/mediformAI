import { fromPath } from "pdf2pic";
import path from "path";
import fs from "fs";
import { uploadToAzure } from "./azureUpload.js";

export async function convertPdfToImages(pdfLocalPath) {
  const outputDir = path.join(process.cwd(), "tmp_images");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const options = {
    density: 150,
    saveFilename: path.basename(pdfLocalPath, ".pdf"),
    savePath: outputDir,
    format: "png",
    width: 1240,
    height: 1754,
  };

  const storeAsImage = fromPath(pdfLocalPath, options);
  const result = await storeAsImage(1); // convert first page only
  const imagePath = result.path;

  if (!fs.existsSync(imagePath)) {
    throw new Error("❌ No image created from PDF.");
  }

  const buffer = fs.readFileSync(imagePath);
  const imageFileName = path.basename(imagePath);
  const imageUrl = await uploadToAzure(imageFileName, buffer, "image/png");

  // clean up temp image
  fs.unlinkSync(imagePath);

  console.log("✅ PDF converted to image:", imageUrl);
  return [imageUrl];
}
