// utils/azureSAS.js
import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from "@azure/storage-blob";
import dotenv from "dotenv";
dotenv.config();

// ✅ use the SAME variable names your upload helper already uses
const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const containerName = process.env.AZURE_STORAGE_CONTAINER || process.env.AZURE_STORAGE_CONTAINER_NAME;

// ✅ re-use the same credential setup
const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
const blobServiceClient = new BlobServiceClient(
  `https://${accountName}.blob.core.windows.net`,
  sharedKeyCredential
);
const containerClient = blobServiceClient.getContainerClient(containerName);

// ✅ Generate a read-only SAS URL for an existing blob
export async function getBlobSasUrl(filename, expiresInMinutes = 60) {
  const blobClient = containerClient.getBlobClient(filename);

  const expiresOn = new Date(Date.now() + expiresInMinutes * 60 * 1000);
  const sasParams = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: filename,
      permissions: BlobSASPermissions.parse("r"), // read only
      expiresOn,
    },
    sharedKeyCredential
  ).toString();

  return `${blobClient.url}?${sasParams}`;
}
