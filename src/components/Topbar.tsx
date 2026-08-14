import React from 'react';
import { useAppStore } from '../store';
import { todayStr } from '../lib/utils';
import { Calendar, User, LogOut, RotateCcw } from 'lucide-react';

const crumbs: Record<string, [string, string]> = {
  dash: ['首页', '集团医务室药品库存总览'],
  drugs: ['药品档案', '维护药品基础信息与安全库存'],
  in: ['入库管理', '采购/退库入库登记（含金额核算）'],
  out: ['出库管理', '门诊领用/出库登记'],
  stock: ['库存结存', '实时/月度结存 · 月度统计 · 库存预警 一体化'],
  batch: ['批次台账', '按批号 / 效期管理库存，支持过期作废'],
  query: ['明细查询', '按药品编码与日期区间检索出入库流水'],
  param: ['参数设置', '药品分类 / 仓位 / 经办人维护']
};

export function Topbar({ currentMod, user, onLogout }: { currentMod: string, user: string, onLogout: () => void }) {
  const { resetData, showConfirm } = useAppStore();

  const handleReset = async () => {
    if (await showConfirm('重置为初始演示数据？当前修改将丢失。')) {
      resetData();
    }
  };

  const [main, sub] = crumbs[currentMod] || ['', ''];

  return (
    <div className="h-[56px] shrink-0 flex items-center justify-between px-[22px] border-b border-[var(--border)] bg-white z-10">
      <div className="text-[15px] font-semibold text-[var(--text)]">
        {main} <small className="text-[var(--muted)] font-normal ml-[8px] text-[12px]">{sub}</small>
      </div>
      <div className="flex gap-[10px] items-center">
        <span className="pill"><Calendar size={14} /> {todayStr}</span>
        <span className="pill"><User size={14} /> {user}</span>
        <button className="btn ghost sm" onClick={handleReset}>
          <RotateCcw size={14} /> 重置演示数据
        </button>
        <button className="btn ghost sm" onClick={onLogout}>
          <LogOut size={14} /> 退出
        </button>
      </div>
    </div>
  );
}
