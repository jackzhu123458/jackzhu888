'use client';

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Product } from '@/types';

interface ProductSearchInputProps {
  /** 所有可选产品列表 */
  products: Product[];
  /** 当前选中的产品 ID */
  selectedId: string | null;
  /** 受控模式：搜索文本（传入则由外部控制） */
  value?: string;
  /** 受控模式：搜索文本变更回调 */
  onChange?: (value: string) => void;
  /** 非受控模式：选中后自动填充的搜索文本（如 "编码 - 名称"） */
  displayText?: string;
  /** 占位文字 */
  placeholder?: string;
  /** 选择回调 */
  onSelect: (product: Product) => void;
  /** 清除回调 */
  onClear?: () => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 需要排除的产品 ID 列表 */
  excludeIds?: string[];
  /** 额外的 className */
  className?: string;
}

/**
 * 通用产品模糊搜索输入框
 * - 输入编码或名称实时搜索
 * - 点选后自动填充显示文本
 * - 支持清除已选产品
 * - 支持受控模式（value + onChange）和非受控模式（displayText）
 */
export function ProductSearchInput({
  products,
  selectedId,
  value,
  onChange,
  displayText,
  placeholder = '输入编码或名称搜索...',
  onSelect,
  onClear,
  disabled = false,
  excludeIds = [],
  className = '',
}: ProductSearchInputProps) {
  const [internalSearch, setInternalSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 受控模式 vs 非受控模式
  const isControlled = value !== undefined;
  const search = isControlled ? value : internalSearch;
  const setSearch = isControlled
    ? (v: string) => onChange?.(v)
    : setInternalSearch;

  // 选中时显示自动填充文本
  const displayValue = selectedId
    ? (isControlled ? search : (displayText || ''))
    : search;

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = (search.trim()
    ? products.filter(p =>
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    : products
  ).filter(p => !excludeIds.includes(p.id));

  const handleSelect = (product: Product) => {
    onSelect(product);
    setSearch(`${product.code} - ${product.name}`);
    setShowDropdown(false);
  };

  const handleFocus = () => {
    if (selectedId) {
      // 已选中时，focus 清空搜索框让用户重新搜索
      setSearch('');
    }
    setShowDropdown(true);
  };

  const handleClear = () => {
    setSearch('');
    if (onClear) onClear();
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
        />
        {selectedId && onClear && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {showDropdown && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          {filtered.slice(0, 20).map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
              onClick={() => handleSelect(p)}
            >
              <span className="font-mono text-xs text-gray-500">{p.code}</span>
              <span className="truncate">{p.name}</span>
              {p.spec && <span className="text-xs text-gray-400">({p.spec})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
