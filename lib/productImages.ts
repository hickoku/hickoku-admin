import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET, s3PublicUrl, PRODUCT_WRITES_ENABLED } from "@/lib/aws";
import { APP_ENV } from "@/lib/env";

// Product image upload to S3 (S3_BUCKET_NAME). Files go under
// <env>/products/<productKey>/…, so stage uploads stay apart from anything
// live. Stage only, like the rest of product editing.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { ext: "webp", magic: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
  "image/avif": { ext: "avif", magic: (b) => b.toString("ascii", 4, 12).startsWith("ftypavi") },
};

export const uploadsEnabled = () => PRODUCT_WRITES_ENABLED && !!S3_BUCKET;

export async function uploadProductImage(file: File, productKey: string): Promise<{ url: string } | { error: string; status: number }> {
  if (!PRODUCT_WRITES_ENABLED) return { error: `Image upload is off on ${APP_ENV}`, status: 403 };
  if (!S3_BUCKET) return { error: "Image upload isn't set up yet: S3_BUCKET_NAME is empty", status: 503 };
  const type = TYPES[file.type];
  if (!type) return { error: "Use a JPG, PNG, WebP or AVIF image", status: 400 };
  if (file.size > MAX_IMAGE_BYTES) return { error: `Image is ${(file.size / 1048576).toFixed(1)} MB; the limit is 5 MB`, status: 400 };

  const body = Buffer.from(await file.arrayBuffer());
  if (!type.magic(body)) return { error: "That file isn't a valid image", status: 400 };

  const safeKey = productKey.replace(/[^a-z0-9-]/gi, "").slice(0, 60) || "new";
  const key = `${APP_ENV}/products/${safeKey}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${type.ext}`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: file.type,
      // File names are unique, so they can be cached forever.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return { url: s3PublicUrl(key) };
}
