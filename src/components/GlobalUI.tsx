import React from 'react';
import { useAppStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, HelpCircle } from 'lucide-react';
import { Modal } from './Modal';

export function GlobalUI() {
  const { toasts, confirmReq, hideConfirm } = useAppStore();

  return (
    <>
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none items-center">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-[10px] shadow-[0_8px_20px_rgba(0,0,0,0.12)] text-[14px] font-medium min-w-[280px] max-w-[90vw] ${
                t.type === 'success' ? 'bg-[#f6ffed] border border-[#b7eb8f] text-[#389e0d]' :
                t.type === 'error' ? 'bg-[#fff2f0] border border-[#ffccc7] text-[#cf1322]' :
                'bg-[#e6f4ff] border border-[#91caff] text-[#0958d9]'
              }`}
            >
              {t.type === 'success' && <CheckCircle2 size={18} className="shrink-0" />}
              {t.type === 'error' && <AlertCircle size={18} className="shrink-0" />}
              {t.type === 'info' && <Info size={18} className="shrink-0" />}
              <span className="leading-snug">{t.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Modal
        isOpen={!!confirmReq}
        onClose={() => {
          confirmReq?.resolve(false);
          hideConfirm();
        }}
        onOk={() => {
          confirmReq?.resolve(true);
          hideConfirm();
        }}
        title="操作确认"
        width="420px"
      >
        <div className="py-2 text-[#1a2b42] text-[15px] flex items-start gap-3">
          <HelpCircle size={24} className="text-[#faad14] shrink-0 mt-0.5" />
          <div className="whitespace-pre-wrap leading-relaxed">{confirmReq?.msg}</div>
        </div>
      </Modal>
    </>
  );
}
