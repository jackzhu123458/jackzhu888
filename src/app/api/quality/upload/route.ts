import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/storage';

// POST /api/quality/upload - 上传质量警示图片
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 });
    }

    // 限制文件大小 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '文件大小不能超过10MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const result = await uploadFile(
      buffer,
      `quality/${timestamp}-${sanitizedFileName}`,
      file.type || 'application/octet-stream'
    );

    return NextResponse.json({ url: result.url, fileKey: result.fileKey });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
