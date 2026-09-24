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

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileName, fileType, senderName, tableNumber, note } = body;

    const isVideo = fileType?.startsWith('video/') || fileName?.match(/\.(mp4|mov|webm|quicktime)$/i);
    let ext = 'jpg';
    if (isVideo) {
      ext = fileName?.match(/\.mov$/i) ? 'mov' : (fileName?.match(/\.webm$/i) ? 'webm' : 'mp4');
    } else if (fileType?.includes('png') || fileName?.match(/\.png$/i)) {
      ext = 'png';
    }
    const timestamp = Date.now();
    const sanitizedSender = (senderName || 'davetli')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
    const r2Key = `anilar/${sanitizedSender}_${timestamp}.${ext}`;

    const bucketName = process.env.R2_BUCKET_NAME || 'buse-berkay-anilar';
    const r2Client = getR2Client();

    const contentType = fileType || (isVideo ? 'video/mp4' : 'image/jpeg');

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: r2Key,
      ContentType: contentType,
      Metadata: {
        sender: encodeURIComponent(senderName || 'İsimsiz'),
        note: encodeURIComponent(note || ''),
        uploadedat: new Date().toISOString(),
      },
    });

    // 15 minutes pre-signed PUT url
    const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 });

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
