import { NextResponse } from "next/server";
import {
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET, s3PublicUrl } from "@/lib/aws";

const HERO_PREFIX = "hero/";
const MANIFEST_KEY = "site-config/hero.json";
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

function requireBucket() {
  if (!S3_BUCKET) {
    throw new Error("S3_BUCKET_NAME is not configured in the environment.");
  }
}

async function streamToString(body: any): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function readManifest(): Promise<{ activeKey: string | null; updatedAt?: string }> {
  try {
    const res = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: MANIFEST_KEY }));
    const text = await streamToString(res.Body);
    return JSON.parse(text);
  } catch {
    return { activeKey: null };
  }
}

async function writeManifest(activeKey: string | null) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: MANIFEST_KEY,
      Body: JSON.stringify({ activeKey, updatedAt: new Date().toISOString() }),
      ContentType: "application/json",
      CacheControl: "no-cache",
    }),
  );
}

export async function GET() {
  try {
    requireBucket();
    const [listRes, manifest] = await Promise.all([
      s3Client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: HERO_PREFIX })),
      readManifest(),
    ]);

    const images = (listRes.Contents || [])
      .filter((obj) => obj.Key && obj.Key !== HERO_PREFIX)
      .map((obj) => ({
        key: obj.Key!,
        url: s3PublicUrl(obj.Key!),
        size: obj.Size,
        uploadedAt: obj.LastModified,
      }))
      .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());

    const active = manifest.activeKey
      ? { key: manifest.activeKey, url: s3PublicUrl(manifest.activeKey) }
      : null;

    return NextResponse.json({ success: true, images, active });
  } catch (error: any) {
    console.error("Hero GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requireBucket();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const setActive = formData.get("setActive") === "true";

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${file.type}. Use JPEG, PNG, WebP or AVIF.` },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: "File too large (max 8MB)" }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${HERO_PREFIX}${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    if (setActive) await writeManifest(key);

    return NextResponse.json({
      success: true,
      image: { key, url: s3PublicUrl(key) },
      active: setActive,
    });
  } catch (error: any) {
    console.error("Hero POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    requireBucket();
    const { key } = await request.json();
    if (!key || typeof key !== "string" || !key.startsWith(HERO_PREFIX)) {
      return NextResponse.json({ success: false, error: "Invalid key" }, { status: 400 });
    }
    await writeManifest(key);
    return NextResponse.json({ success: true, active: { key, url: s3PublicUrl(key) } });
  } catch (error: any) {
    console.error("Hero PUT error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    requireBucket();
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    if (!key || !key.startsWith(HERO_PREFIX)) {
      return NextResponse.json({ success: false, error: "Invalid key" }, { status: 400 });
    }

    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));

    const manifest = await readManifest();
    if (manifest.activeKey === key) await writeManifest(null);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Hero DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
