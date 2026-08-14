import React, { createContext, useContext, useState, useMemo, ReactNode, useEffect } from 'react';
import { AppStateData, Drug, InboundRecord, OutboundRecord, AppParams, DiscardRecord } from '../types';
import { todayStr, monthOf, daysBetween, NEAR_EXP_DAYS, TAX_DEFAULT } from '../lib/utils';
import { seedData } from './seed';

interface ToastMsg { id: number; msg: string; type: 'success' | 'error' | 'info' }
interface ConfirmReq { msg: string; resolve: (val: boolean) => void }

interface AppContextType {
  data: AppStateData;
  loading: boolean;
  setData: React.Dispatch<React.SetStateAction<AppStateData>>;
  saveData: (newData: AppStateData) => void;
  resetData: () => void;
  taxRate: number;
  isMonthLocked: (date: string) => boolean;
  stockOf: (code: string) => { opening: number, inQty: number, outQty: number, stock: number, min: number, max: number, status: string };
  allStock: () => (Drug & { inQty: number, outQty: number, stock: number, status: string })[];
  lotStatus: (lot: { remaining: number, expDate?: string }) => string;
  allBatches: () => (InboundRecord & { status: string })[];
  expSummary: () => { expired: (InboundRecord & { status: string })[], near: (InboundRecord & { status: string })[] };
  applyOutboundFEFO: (newData: AppStateData, code: string, qty: number) => { batchNo: string, price: number } | false;
  costOf: (code: string) => number;
  amt: (qty: number | string, price: number | string) => { amount: number, tax: number, total: number };
  fetchData: () => Promise<void>;
  token: string | null;
  setToken: (t: string | null) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  showConfirm: (msg: string) => Promise<boolean>;
  toasts: ToastMsg[];
  confirmReq: ConfirmReq | null;
  hideConfirm: () => void;
  removeToast: (id: number) => void;
  // Global navigation state
  currentMod: string;
  navigate: (mod: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppStateData>({ drugs: [], inbound: [], outbound: [], discards: [], params: {} as any });
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt_token'));
  
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [confirmReq, setConfirmReq] = useState<ConfirmReq | null>(null);

  // Global navigation state - persisted to localStorage
  const [currentMod, setCurrentMod] = useState<string>(() => {
    return localStorage.getItem('currentMod') || 'dash';
  });

  const navigate = (mod: string) => {
    console.log(`[页面导航] 请求从 ${currentMod} → ${mod} (${new Date().toLocaleTimeString()})`);
    setCurrentMod(mod);
    localStorage.setItem('currentMod', mod);
  };

  // Persist currentMod whenever it changes
  useEffect(() => {
    localStorage.setItem('currentMod', currentMod);
  }, [currentMod]);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const showConfirm = (msg: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmReq({ msg, resolve });
    });
  };
  const hideConfirm = () => setConfirmReq(null);
  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/data', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const json = await res.json();
        const defaultParams = seedData().params;
        const mergedParams = { ...defaultParams, ...(json.params || {}) };
        
        setData({
          drugs: json.drugs || [],
          inbound: json.inbound || [],
          outbound: json.outbound || [],
          discards: json.discards || [],
          params: mergedParams
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      localStorage.setItem('jwt_token', token);
      fetchData();
    } else {
      localStorage.removeItem('jwt_token');
    }
  }, [token]);

  const saveData = async (newData: AppStateData) => {
    console.log(`[数据保存] 开始保存 (${new Date().toLocaleTimeString()})`);
    console.log(`[数据保存] 变更前：drugs=${data.drugs.length}, inbound=${data.inbound.length}, outbound=${data.outbound.length}, params=${Object.keys(data.params || {}).length}`);
    console.log(`[数据保存] 变更后：drugs=${newData.drugs.length}, inbound=${newData.inbound.length}, outbound=${newData.outbound.length}, params=${Object.keys(newData.params || {}).length}`);

    // 检测 param 列表型参数的具体变化
    const paramKeys = ['types', 'positions', 'handlers', 'depts'] as const;
    for (const k of paramKeys) {
      const before = (data.params?.[k] as string[] | undefined) || [];
      const after = (newData.params?.[k] as string[] | undefined) || [];
      if (before.length !== after.length) {
        console.log(`[数据保存] 参数 [${k}] 变化：${before.length} 项 → ${after.length} 项`);
      }
    }

    setData(newData);
    if (!token) {
      console.log(`[数据保存] 未登录，跳过后端同步`);
      return;
    }
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newData)
      });
      if (res.ok) {
        console.log(`[数据保存] 后端同步成功 (HTTP ${res.status})`);
      } else {
        console.error(`[数据保存] 后端同步失败 (HTTP ${res.status})`);
      }
    } catch (e) {
      console.error(`[数据保存] 后端同步异常：`, e);
    }
  };

  const resetData = async () => {
    const d = seedData();
    await saveData(d);
  };

  const taxRate = useMemo(() => {
    return data.params && data.params.tax != null ? Number(data.params.tax) : TAX_DEFAULT;
  }, [data.params]);

  const isMonthLocked = (ds: string) => {
    const cm = data.params.closedMonth;
    return !!(cm && monthOf(ds) && monthOf(ds) <= cm);
  };

  const stockOf = (code: string) => {
    const d = data.drugs.find(x => x.code === code);
    if (!d) return { opening: 0, inQty: 0, outQty: 0, stock: 0, min: 0, max: 0, status: '正常' };
    let stock = 0, inQty = 0, outQty = 0;
    data.inbound.forEach(r => {
      if (r.code === code) {
        inQty += Number(r.qty);
        stock += Number(r.remaining != null ? r.remaining : r.qty);
      }
    });
    data.outbound.forEach(r => {
      if (r.code === code) outQty += Number(r.qty);
    });
    let status = '正常';
    if (stock < d.min) status = '库存过低';
    else if (stock > d.max) status = '库存过高';
    return { opening: d.opening, inQty, outQty, stock, min: d.min, max: d.max, status };
  };

  const allStock = () => {
    return data.drugs.map(d => ({ ...d, ...stockOf(d.code) }));
  };

  const lotStatus = (lot: { remaining: number, expDate?: string }) => {
    if (!(lot.remaining > 0)) return '空';
    if (!lot.expDate) return '正常';
    if (lot.expDate < todayStr) return '已过期';
    if (daysBetween(todayStr, lot.expDate) <= NEAR_EXP_DAYS) return '近效期';
    return '正常';
  };

  const allBatches = () => {
    return data.inbound.filter(r => (r.remaining || 0) > 0).map(r => ({ ...r, status: lotStatus(r) }));
  };

  const expSummary = () => {
    const b = allBatches();
    return {
      expired: b.filter(x => x.status === '已过期'),
      near: b.filter(x => x.status === '近效期')
    };
  };

  // Deprecated in favor of backend API transaction for real outbound
  const applyOutboundFEFO = (newData: AppStateData, code: string, qty: number) => {
    const lots = newData.inbound.filter(r => r.code === code && (r.remaining || 0) > 0).slice()
      .sort((a, b) => (a.expDate || '9999').localeCompare(b.expDate || '9999') || (a.date || '').localeCompare(b.date || ''));
    let left = +qty, hitBatch = '', hitPrice = 0, first = true;
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(lot.remaining, left);
      lot.remaining -= take;
      left -= take;
      if (first) {
        hitBatch = lot.batchNo || '';
        hitPrice = Number(lot.price) || 0;
        first = false;
      }
    }
    return left <= 0 ? { batchNo: hitBatch, price: hitPrice } : false;
  };

  const costOf = (code: string) => {
    const lots = data.inbound.filter(r => r.code === code && (r.remaining || 0) > 0);
    const tq = lots.reduce((s, l) => s + Number(l.remaining), 0);
    if (tq <= 0) return 0;
    return lots.reduce((s, l) => s + Number(l.price) * Number(l.remaining), 0) / tq;
  };

  const amt = (qty: number | string, price: number | string) => {
    const a = Number(qty) * Number(price);
    return { amount: a, tax: a * taxRate, total: a * (1 + taxRate) };
  };

  return (
    <AppContext.Provider value={{
      data, setData, saveData, resetData, taxRate, isMonthLocked,
      stockOf, allStock, lotStatus, allBatches, expSummary, applyOutboundFEFO, costOf, amt,
      loading, fetchData, token, setToken,
      showToast, showConfirm, toasts, confirmReq, hideConfirm, removeToast,
      currentMod, navigate
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppStore must be used within AppProvider');
  return ctx;
}
