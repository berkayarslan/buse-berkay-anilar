import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 bilgileri tanımlanmamış.');
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

// GET: List all uploaded memories from Cloudflare R2
export async function GET(req: NextRequest) {
  try {
    const pin = req.headers.get('x-admin-pin');
    const validPin = process.env.ADMIN_PIN || '9601';

    if (pin !== validPin) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
    }

    const bucketName = process.env.R2_BUCKET_NAME || 'buse-berkay-anilar';
    const r2Client = getR2Client();

    const result = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: 'anilar/',
      })
    );

    const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/+$/, '');

    const items = await Promise.all(
      (result.Contents || []).map(async (obj) => {
        let downloadUrl = '';
        if (publicBase) {
          downloadUrl = `${publicBase}/${obj.Key}`;
        } else {
          // Generate presigned GET URL valid for 2 hours
          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: obj.Key,
          });
          downloadUrl = await getSignedUrl(r2Client, command, { expiresIn: 7200 });
        }

        const isVideo = obj.Key?.match(/\.(mp4|mov|webm)$/i);

        return {
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
          url: downloadUrl,
          type: isVideo ? 'video' : 'photo',
        };
      })
    );

    return NextResponse.json({
      total: items.length,
      items: items.reverse(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Delete single item, multiple selected items, or all items from R2
export async function DELETE(req: NextRequest) {
  try {
    const pin = req.headers.get('x-admin-pin');
    const validPin = process.env.ADMIN_PIN || '9601';

    if (pin !== validPin) {
      return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { key, keys, all } = body;
    const bucketName = process.env.R2_BUCKET_NAME || 'buse-berkay-anilar';
    const r2Client = getR2Client();

    // 1. TÜMÜNÜ SİL
    if (all === true) {
      const listRes = await r2Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: 'anilar/',
        })
      );

      const allKeys = (listRes.Contents || [])
        .map((o) => o.Key)
        .filter((k): k is string => Boolean(k));

      // 10'ar gruplar halinde sil
      const chunkSize = 10;
      for (let i = 0; i < allKeys.length; i += chunkSize) {
        const chunk = allKeys.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map((k) =>
            r2Client.send(
              new DeleteObjectCommand({
                Bucket: bucketName,
                Key: k,
              })
            )
          )
        );
      }

      return NextResponse.json({
        success: true,
        deletedCount: allKeys.length,
        message: 'Tüm anılar Cloudflare R2 arşivinden silindi.',
      });
    }

    // 2. SEÇEREK TOPLU SİLME
    if (Array.isArray(keys) && keys.length > 0) {
      const validKeys = keys.filter((k) => typeof k === 'string' && k.length > 0);
      const chunkSize = 10;
      for (let i = 0; i < validKeys.length; i += chunkSize) {
        const chunk = validKeys.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map((k) =>
            r2Client.send(
              new DeleteObjectCommand({
                Bucket: bucketName,
                Key: k,
              })
            )
          )
        );
      }

      return NextResponse.json({
        success: true,
        deletedCount: validKeys.length,
        keys: validKeys,
        message: `${validKeys.length} adet dosya başarıyla silindi.`,
      });
    }

    // 3. TEKLİ SİLME
    if (key) {
      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: key,
        })
      );
      return NextResponse.json({ success: true, key });
    }

    return NextResponse.json({ error: 'Silinecek dosya (key veya keys) belirtilmedi.' }, { status: 400 });
  } catch (err: any) {
    console.error('Delete error in R2:', err);
    return NextResponse.json({ error: err.message || 'Silme işlemi sırasında hata oluştu' }, { status: 500 });
  }
}
