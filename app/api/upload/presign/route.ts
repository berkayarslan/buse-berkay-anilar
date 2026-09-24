import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 ortam değişkenleri eksik.');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function sanitizeSenderName(name?: string): string {
  if (!name || !name.trim()) return 'davetli';
  const turkishMap: Record<string, string> = {
    'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g', 'ı': 'i', 'İ': 'i',
    'ö': 'o', 'Ö': 'o', 'ş': 's', 'Ş': 's', 'ü': 'u', 'Ü': 'u',
  };
  let clean = name.trim();
  for (const [key, val] of Object.entries(turkishMap)) {
    clean = clean.split(key).join(val);
  }
  clean = clean
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return clean || 'davetli';
}

function generate5CharId(): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileName, fileType, senderName } = body;

    const isVideo = fileType?.startsWith('video/') || fileName?.match(/\.(mp4|mov|webm|quicktime|m4v)$/i);
    let ext = 'jpg';
    if (isVideo) {
      ext = fileName?.match(/\.mov$/i) ? 'mov' : (fileName?.match(/\.webm$/i) ? 'webm' : 'mp4');
    } else if (fileType?.includes('png') || fileName?.match(/\.png$/i)) {
      ext = 'png';
    }

    const sanitizedSender = sanitizeSenderName(senderName);
    const shortId = generate5CharId();
    const r2Key = `anilar/${sanitizedSender}_${shortId}.${ext}`;
    const bucketName = process.env.R2_BUCKET_NAME || 'buse-berkay-anilar';
    const r2Client = getR2Client();

    // Critical: Do NOT include Metadata or ContentType in PutObjectCommand for pre-signing.
    // When Metadata is included, AWS S3 presigner calculates signature with SignedHeaders including
    // custom headers (x-amz-meta-*), which triggers 403 SignatureDoesNotMatch in browser uploads.
    // By keeping it clean, only 'host' is signed, allowing browser PUT requests to succeed seamlessly.
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: r2Key,
    });

    // 1 hour pre-signed PUT url
    const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });

    return NextResponse.json({
      success: true,
      presignedUrl,
      r2Key,
    });
  } catch (err: any) {
    console.error('Presign error:', err);
    return NextResponse.json(
      { error: 'Pre-sign URL oluşturulamadı: ' + err.message },
      { status: 500 }
    );
  }
}
