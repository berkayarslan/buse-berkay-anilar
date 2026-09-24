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
    const validPin = process.env.ADMIN_PIN || '1810';

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

// DELETE: Delete an item from R2
export async function DELETE(req: NextRequest) {
  try {
    const pin = req.headers.get('x-admin-pin');
    const validPin = process.env.ADMIN_PIN || '1810';

    if (pin !== validPin) {
      return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 401 });
    }

    const { key } = await req.json();
    if (!key) {
      return NextResponse.json({ error: 'Key eksik' }, { status: 400 });
    }

    const bucketName = process.env.R2_BUCKET_NAME || 'buse-berkay-anilar';
    const r2Client = getR2Client();

    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    return NextResponse.json({ success: true, key });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
