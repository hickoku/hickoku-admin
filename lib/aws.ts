import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { IS_PROD } from "@/lib/env";

function creds() {
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  };
}

export const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: creds(),
});

export const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: creds(),
});

// Same naming as the storefront (lib/repositories/orderRepository.ts there).
export const ORDERS_TABLE = IS_PROD ? "orders" : "orders-stage";
export const SETTINGS_TABLE = IS_PROD ? "site-settings" : "site-settings-stage";
export const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE_NAME || "products";
export const S3_BUCKET = process.env.S3_BUCKET_NAME || "";
export const S3_REGION = process.env.AWS_REGION || "ap-south-1";

export function s3PublicUrl(key: string) {
  const customDomain = process.env.S3_PUBLIC_BASE_URL;
  if (customDomain) return `${customDomain.replace(/\/$/, "")}/${key}`;
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}
