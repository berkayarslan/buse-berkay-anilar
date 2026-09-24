import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let senderName = '';
    let tableNumber = '';
    let note = '';
    let mediaType = 'photo';
    let fileName = '';
    let hasConsent = false;
    let buffer: Buffer;
    let mimeType = 'image/jpeg';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'Dosya seçilmedi.' }, { status: 400 });
      }

      senderName = (formData.get('senderName') as string) || '';
      tableNumber = (formData.get('tableNumber') as string) || '';
      note = (formData.get('note') as string) || '';
      mediaType = (formData.get('mediaType') as string) || (file.type.startsWith('video/') ? 'video' : 'photo');
      fileName = file.name || 'dosya';
      hasConsent = formData.get('hasConsent') === 'true';

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      mimeType = file.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
    } else {
      const body = await req.json();
      senderName = body.senderName || '';
      tableNumber = body.tableNumber || '';
      note = body.note || '';
      mediaType = body.mediaType || 'photo';
      fileName = body.fileName || '';
      hasConsent = Boolean(body.hasConsent);

      if (!body.base64Data) {
        return NextResponse.json({ error: 'Yüklenecek medya verisi bulunamadı.' }, { status: 400 });
      }

      const matches = body.base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(body.base64Data, 'base64');
      }
    }

    if (!hasConsent) {
      return NextResponse.json(
        { error: 'Yükleme izni ve açık rıza onaylanmalıdır.' },
        { status: 400 }
      );
    }

    // Prepare Cloudflare R2 Key
    const isVideo = mediaType === 'video' || fileName.match(/\.(mp4|mov|webm)$/i);
    const ext = isVideo ? 'mp4' : (mimeType.includes('png') ? 'png' : 'jpg');
    const timestamp = Date.now();
    const sanitizedSender = (senderName || 'davetli')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
    const tablePrefix = tableNumber ? `masa_${tableNumber}` : 'genel';
    const r2Key = `anilar/${tablePrefix}_${sanitizedSender}_${timestamp}.${ext}`;

    const bucketName = process.env.R2_BUCKET_NAME || 'buse-berkay-anilar';
    const r2Client = getR2Client();

    // Upload to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
        Body: buffer,
        ContentType: mimeType,
        Metadata: {
          sender: encodeURIComponent(senderName || 'İsimsiz'),
          table: encodeURIComponent(tableNumber || ''),
          note: encodeURIComponent(note || ''),
          uploadedat: new Date().toISOString(),
        },
      })
    );

    return NextResponse.json({
      success: true,
      message: 'Fotoğrafınız Buse & Berkay\'a başarıyla iletildi ❤️',
      r2Key,
    });
  } catch (error: any) {
    console.error('R2 Upload error:', error);
    return NextResponse.json(
      { error: 'Yükleme başarısız oldu: ' + (error.message || 'Bilinmeyen hata') },
      { status: 500 }
    );
  }
}
