import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from "@azure/storage-blob";
import dotenv from "dotenv";
dotenv.config();

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const containerName = process.env.AZURE_STORAGE_CONTAINER || process.env.AZURE_STORAGE_CONTAINER_NAME;

const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
const blobServiceClient = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, sharedKeyCredential);
const containerClient = blobServiceClient.getContainerClient(containerName);

export async function uploadToAzure(filename, fileBuffer, contentType) {
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  await blockBlobClient.uploadData(fileBuffer, {
    blobHTTPHeaders: { blobContentType: contentType }
  });

  // ✅ Create a SAS URL that expires in 1 hour
  const expiresOn = new Date(new Date().valueOf() + 60 * 60 * 1000);
  const sasParams = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: filename,
      permissions: BlobSASPermissions.parse("r"), // read only
      expiresOn,
    },
    sharedKeyCredential
  ).toString();

  const sasUrl = `${blockBlobClient.url}?${sasParams}`;
  return sasUrl;
}
