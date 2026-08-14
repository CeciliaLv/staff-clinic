import React from 'react';
import { cn } from '../lib/utils';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onOk?: () => void;
  okText?: string;
  width?: string;
}

export function Modal({ isOpen, onClose, title, children, onOk, okText = '保存', width }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#0a142859] grid place-items-center z-30 p-5" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div 
        className="bg-[var(--panel)] border border-[var(--border2)] rounded-[16px] w-full max-h-[88vh] flex flex-col shadow-[var(--shadow)]"
        style={{ maxWidth: width || '720px' }}
      >
        <div className="px-5 py-4 border-b border-[var(--border)] flex justify-between items-center font-semibold shrink-0">
          {title}
          <button className="text-[var(--muted)] hover:bg-[var(--panel2)] hover:text-white p-1.5 rounded-md" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="p-5 overflow-auto">
          {children}
        </div>
        <div className="px-5 py-3.5 border-t border-[var(--border)] flex justify-end gap-2.5 shrink-0">
          <button className="btn ghost" onClick={onClose}>取消</button>
          {onOk && <button className="btn primary" onClick={onOk}>{okText}</button>}
        </div>
      </div>
    </div>
  );
}
