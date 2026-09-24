import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Initialize S3Client with Cloudflare R2 endpoint
function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 ortam değişkenleri eksik. Lütfen Vercel panelinden R2 değişkenlerini tanımlayınız.');
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      senderName,
      tableNumber,
      note,
      mediaType, // 'photo' | 'video'
      base64Data,
      fileName,
      hasConsent,
    } = body;

    // 1. Consent verification (Zorunlu açık rıza)
    if (!hasConsent) {
      return NextResponse.json(
        { error: 'Yükleme izni ve açık rıza onaylanmalıdır.' },
        { status: 400 }
      );
    }

    if (!base64Data) {
      return NextResponse.json(
        { error: 'Yüklenecek medya verisi bulunamadı.' },
        { status: 400 }
      );
    }

    // 2. Decode base64
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer: Buffer;
    let contentType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';

    if (matches && matches.length === 3) {
      contentType = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(base64Data, 'base64');
    }

    // 3. Prepare Cloudflare R2 Key
    const isVideo = mediaType === 'video' || (fileName && fileName.match(/\.(mp4|mov|webm)$/i));
    const ext = isVideo ? 'mp4' : 'jpg';
    const timestamp = Date.now();
    const sanitizedSender = (senderName || 'davetli')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
    const tablePrefix = tableNumber ? `masa_${tableNumber}` : 'genel';
    const r2Key = `anilar/${tablePrefix}_${sanitizedSender}_${timestamp}.${ext}`;

    const bucketName = process.env.R2_BUCKET_NAME || 'buse-berkay-anilar';
    const r2Client = getR2Client();

    // 4. PutObject to Cloudflare R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          sender: encodeURIComponent(senderName || 'İsimsiz'),
          table: encodeURIComponent(tableNumber || ''),
          note: encodeURIComponent(note || ''),
          uploadedat: new Date().toISOString(),
        },
      })
    );

    // 5. Construct public URL if custom domain is provided
    let publicUrl = '';
    if (process.env.NEXT_PUBLIC_R2_PUBLIC_URL) {
      const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL.replace(/\/+$/, '');
      publicUrl = `${base}/${r2Key}`;
    }

    // 6. Return minimal success response (Tek yönlü drop-box: dosya listesini dönme)
    return NextResponse.json({
      success: true,
      message: 'Fotoğrafınız Buse & Berkay\'a başarıyla iletildi ❤️',
      r2Key,
      publicUrl: publicUrl || undefined,
    });
  } catch (error: any) {
    console.error('R2 Upload error:', error);
    return NextResponse.json(
      { error: 'Yükleme başarısız oldu: ' + (error.message || 'Bilinmeyen hata') },
      { status: 500 }
    );
  }
}
