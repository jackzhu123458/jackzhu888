import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 英文单位 → 中文映射
const UNIT_MAP: Record<string, string> = {
  PCS: '个',
  PC: '个',
  SET: '套',
  KG: '千克',
  KGS: '千克',
  M: '米',
  BOX: '箱',
  PKG: '包',
  EA: '个',
  LOT: '批',
  UNIT: '个',
  PIECE: '片',
  SHEET: '张',
  PAIR: '副',
  ROLL: '卷',
  STRIP: '条',
  ROOT: '根',
  ONLY: '只',
  PLATFORM: '台',
};

export function translateUnit(unit: string | null | undefined): string {
  if (!unit) return '';
  const upper = unit.toUpperCase().trim();
  return UNIT_MAP[upper] || unit;
}
