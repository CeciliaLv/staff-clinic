import React from 'react';
import { useAppStore } from '../store';
import { fmt, todayStr } from '../lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

export function Dashboard({ onNavigate }: { onNavigate: (mod: string) => void }) {
  const { data, allStock, expSummary } = useAppStore();
  const st = allStock();
  const total = st.reduce((s, d) => s + d.stock, 0);
  const low = st.filter(d => d.status === '库存过低').length;
  const over = st.filter(d => d.status === '库存过高').length;
  const thisMonth = todayStr.slice(0, 7);
  
  let mIn = 0, mOut = 0;
  data.inbound.forEach(r => { if (r.date.slice(0, 7) === thisMonth) mIn += Number(r.qty); });
  data.outbound.forEach(r => { if (r.date.slice(0, 7) === thisMonth) mOut += Number(r.qty); });
  
  const exp = expSummary();
  
  let dy = '2025';
  const allDates = [...data.inbound.map(r => r.date), ...data.outbound.map(r => r.date)].sort();
  if (allDates.length > 0) dy = allDates[allDates.length - 1].slice(0, 4);

  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const inByM = Array(12).fill(0), outByM = Array(12).fill(0);
  data.inbound.forEach(r => { const i = +r.date.slice(5, 7) - 1; if (i >= 0 && i < 12) inByM[i] += Number(r.qty); });
  data.outbound.forEach(r => { const i = +r.date.slice(5, 7) - 1; if (i >= 0 && i < 12) outByM[i] += Number(r.qty); });

  const lineData = months.map((m, i) => ({
    name: m,
    in: inByM[i],
    out: outByM[i]
  }));

  const pieData = [
    { name: '正常', value: st.length - low - over, color: '#22c55e' },
    { name: '过低', value: low, color: '#ef4444' },
    { name: '过高', value: over, color: '#f59e0b' }
  ].filter(d => d.value > 0);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <Kpi color="var(--primary)" label="药品品种" val={data.drugs.length} sub="在档药品总数" />
        <Kpi color="var(--in)" label="库存总量" val={fmt(total)} sub="当前结存合计（件/盒/瓶）" />
        <Kpi color="var(--out)" label="本月入库" val={fmt(mIn)} sub={`${thisMonth} 采购入库`} />
        <Kpi color="var(--out)" label="本月出库" val={fmt(mOut)} sub={`${thisMonth} 门诊领用`} />
        <Kpi color="var(--warn)" label="库存预警" val={<span style={{color: '#cf1322'}}>{low + over}</span>} sub={`过低 ${low} · 过高 ${over}`} />
        <Kpi color="#cf1322" label="已过期批次" val={<span style={{color: '#cf1322'}}>{exp.expired.length}</span>} sub="需立即作废处理" />
        <Kpi color="#d48806" label="近效期批次" val={<span style={{color: '#d48806'}}>{exp.near.length}</span>} sub="≤90天到期" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="card flex flex-col">
          <h3>📈 月度入库 / 出库趋势 <span className="tag">{dy} 全年</span></h3>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d4e0ec" />
                <XAxis dataKey="name" tick={{fontSize: 10, fill: '#8da3be'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 10, fill: '#8da3be'}} axisLine={false} tickLine={false} />
                <RechartsTooltip contentStyle={{borderRadius: '8px', border: '1px solid #d4e0ec', fontSize: '12px'}} />
                <Legend iconType="circle" wrapperStyle={{fontSize: '12px', color: 'var(--muted)'}} />
                <Line type="monotone" name="入库" dataKey="in" stroke="#22c55e" strokeWidth={2.4} dot={{r: 3}} activeDot={{r: 5}} />
                <Line type="monotone" name="出库" dataKey="out" stroke="#3b82f6" strokeWidth={2.4} dot={{r: 3}} activeDot={{r: 5}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card flex flex-col">
          <h3>🩹 库存状态分布</h3>
          <div className="h-[240px] w-full flex">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{borderRadius: '8px', border: '1px solid #d4e0ec', fontSize: '12px'}} />
                <Legend layout="vertical" verticalAlign="middle" align="right" iconType="rect" 
                  formatter={(value, entry, index) => <span className="text-[#4a6282]">{value} {pieData[index].value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({ color, label, val, sub }: { color: string, label: string, val: React.ReactNode, sub: string }) {
  return (
    <div className="bg-gradient-to-br from-[var(--panel2)] to-[var(--panel)] border border-[var(--border)] rounded-[14px] p-4 shadow-[0_1px_6px_rgba(24,144,255,0.06)]">
      <div className="text-[var(--muted)] text-[12px] flex items-center gap-1.5">
        <span className="w-[9px] h-[9px] rounded-full inline-block" style={{ background: color }}></span>
        {label}
      </div>
      <div className="text-[26px] font-bold mt-2 tracking-[0.5px]">{val}</div>
      <div className="text-[11px] text-[var(--muted)] mt-1">{sub}</div>
    </div>
  );
}
