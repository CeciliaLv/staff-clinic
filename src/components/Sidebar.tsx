import React from 'react';
import { cn } from '../lib/utils';
import { 
  BarChart2, Pill, ArrowDownToLine, ArrowUpFromLine, 
  PackageSearch, FlaskConical, Search, Settings,
  Stethoscope
} from 'lucide-react';

const navItems = [
  { mod: 'dash', icon: <BarChart2 size={18} />, label: '首页' },
  { mod: 'drugs', icon: <Pill size={18} />, label: '药品档案' },
  { mod: 'in', icon: <ArrowDownToLine size={18} />, label: '入库管理' },
  { mod: 'out', icon: <ArrowUpFromLine size={18} />, label: '出库管理' },
  { mod: 'stock', icon: <PackageSearch size={18} />, label: '库存结存' },
  { mod: 'batch', icon: <FlaskConical size={18} />, label: '批次台账' },
  { mod: 'query', icon: <Search size={18} />, label: '明细查询' },
  { mod: 'param', icon: <Settings size={18} />, label: '参数设置' },
];

export function Sidebar({ currentMod, onNavigate }: { currentMod: string, onNavigate: (mod: string) => void }) {
  return (
    <aside className="w-[226px] shrink-0 bg-gradient-to-b from-[#e8f1f8] to-[#dce9f4] border-r border-[var(--border)] py-[18px] px-[12px] sticky top-0 h-screen overflow-y-auto">
      <div className="flex items-center gap-[10px] pb-[16px] px-[8px]">
        <div className="w-[34px] h-[34px] rounded-[9px] bg-gradient-to-br from-[#1890ff] to-[#36cfc9] grid place-items-center text-white shadow-[0_4px_14px_rgba(24,144,255,0.35)] shrink-0">
          <Stethoscope size={20} />
        </div>
        <div>
          <h1 className="text-[14px] m-0 leading-tight font-bold text-[var(--text)]">集团医务室</h1>
          <p className="text-[11px] m-0 text-[var(--muted)]">药品进销存管理</p>
        </div>
      </div>
      <nav className="flex flex-col gap-[3px] mt-[6px]">
        {navItems.map(item => (
          <a
            key={item.mod}
            className={cn(
              "flex items-center gap-[10px] px-[11px] py-[9px] rounded-[9px] text-[var(--muted)] no-underline text-[13px] cursor-pointer transition-colors duration-150 select-none",
              currentMod === item.mod 
                ? "bg-gradient-to-r from-[rgba(24,144,255,0.18)] to-[rgba(24,144,255,0.04)] text-[#096dd9] shadow-[inset_2px_0_0_var(--primary)]"
                : "hover:bg-[var(--panel)] hover:text-[var(--text)]"
            )}
            onClick={() => onNavigate(item.mod)}
          >
            <span className="w-[18px] text-center">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
