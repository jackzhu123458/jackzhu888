/**
 * 文件存储服务 - 支持本地存储和对象存储两种模式
 * 当 COZE_BUCKET_ENDPOINT_URL 未配置时自动使用本地存储
 */

import { S3Storage } from 'coze-coding-dev-sdk';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

const UPLOAD_DIR = process.env.LOCAL_STORAGE_PATH || process.env.LOCAL_UPLOAD_DIR || '/app/uploads';

export interface StorageResult {
  fileKey: string;
  url: string;
}

function isLocalStorage(): boolean {
  return !process.env.COZE_BUCKET_ENDPOINT_URL;
}

// ========== 对象存储模式 ==========
let cachedS3Storage: S3Storage | null = null;
function getS3Storage(): S3Storage {
  if (!cachedS3Storage) {
    cachedS3Storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
  }
  return cachedS3Storage;
}

async function uploadToS3(fileContent: Buffer, fileName: string, contentType: string): Promise<StorageResult> {
  const storage = getS3Storage();
  const fileKey = await storage.uploadFile({ fileContent, fileName, contentType });
  const url = await storage.generatePresignedUrl({ key: fileKey, expireTime: 3600 * 24 * 30 });
  return { fileKey, url };
}

async function deleteFromS3(fileKey: string): Promise<void> {
  const storage = getS3Storage();
  await storage.deleteFile({ fileKey });
}

async function getSignedUrlFromS3(fileKey: string): Promise<string> {
  const storage = getS3Storage();
  return storage.generatePresignedUrl({ key: fileKey, expireTime: 3600 });
}

// ========== 本地存储模式 ==========
function getLocalFilePath(fileKey: string): string {
  return path.join(UPLOAD_DIR, fileKey);
}

function getLocalFileUrl(fileKey: string): string {
  // 通过 /api/file/[key] 路由访问本地文件
  return `/api/file/${encodeURIComponent(fileKey)}`;
}

async function uploadToLocal(fileContent: Buffer, fileName: string): Promise<StorageResult> {
  const filePath = getLocalFilePath(fileName);
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, fileContent);
  const url = getLocalFileUrl(fileName);
  return { fileKey: fileName, url };
}

async function deleteFromLocal(fileKey: string): Promise<void> {
  const filePath = getLocalFilePath(fileKey);
  if (existsSync(filePath)) {
    await unlink(filePath);
  }
}

async function readLocalFile(fileKey: string): Promise<Buffer | null> {
  const filePath = getLocalFilePath(fileKey);
  if (!existsSync(filePath)) return null;
  return readFile(filePath);
}

// ========== 统一接口 ==========
export async function uploadFile(fileContent: Buffer, fileName: string, contentType: string): Promise<StorageResult> {
  if (isLocalStorage()) {
    return uploadToLocal(fileContent, fileName);
  }
  return uploadToS3(fileContent, fileName, contentType);
}

export async function deleteFile(fileKey: string): Promise<void> {
  if (isLocalStorage()) {
    return deleteFromLocal(fileKey);
  }
  return deleteFromS3(fileKey);
}

export async function getFileUrl(fileKey: string): Promise<string> {
  if (isLocalStorage()) {
    return getLocalFileUrl(fileKey);
  }
  return getSignedUrlFromS3(fileKey);
}

export async function serveLocalFile(fileKey: string): Promise<NextResponse | null> {
  if (!isLocalStorage()) return null;
  const buffer = await readLocalFile(fileKey);
  if (!buffer) return null;

  const ext = path.extname(fileKey).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
    '.dwg': 'application/autocad',
    '.dxf': 'application/dxf',
    '.step': 'application/step',
    '.stp': 'application/step',
  };

  const contentType = contentTypes[ext] || 'application/octet-stream';
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Content-Disposition': `inline; filename="${encodeURIComponent(path.basename(fileKey))}"`,
    },
  });
}
