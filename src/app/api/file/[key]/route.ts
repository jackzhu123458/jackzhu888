import { NextRequest, NextResponse } from 'next/server';
import { serveLocalFile } from '@/lib/storage';

// GET /api/file/[key] - 代理访问本地存储的文件
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const fileKey = decodeURIComponent(key);
    const response = await serveLocalFile(fileKey);
    if (!response) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
