import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { useAppStore } from '../store';
import { fmt, todayStr, cn } from '../lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function Stock() {
  const { data, allStock, allBatches, expSummary, showToast } = useAppStore();
  const [mode, setMode] = useState<'live'|'month'|'stat'|'alarm'>('live');
  const [month, setMonth] = useState('');
  const [queryCode, setQueryCode] = useState('');
  const [singleResult, setSingleResult] = useState<any>(null);

  const yr = data.inbound[0] ? data.inbound[0].date.slice(0, 4) : todayStr.slice(0, 4);
  const MON = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const MONN = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  const handleExport = (type: 'excel' | 'csv') => {
    const exportFileName = `库存结存报表_${todayStr}`;
    let headers: string[] = [];
    let exportRows: any[][] = [];

    if (mode === 'live') {
      headers = ['药品编码', '药品名称', '厂商', '分类', '规格', '仓位', '期初库存', '累计入库', '累计出库', '当前结存', '最低库存', '最高库存', '状态'];
      const st = allStock();
      exportRows = st.map(d => [
        d.code, d.name, d.manufacturer || '', d.cat, d.spec, d.pos,
        d.opening, d.inQty, d.outQty, d.stock, d.min, d.max, d.status
      ]);
    } else if (mode === 'month') {
      if (month === '') return showToast('请先选择月份', 'error');
      const m = +month;
      headers = ['药品编码', '药品名称', '厂商', '分类', '规格', '仓位', '期初', '本月入库', '本月出库', '期末结存', '最低', '最高', '状态'];
      exportRows = data.drugs.map(d => {
        const md = monthlyForDrug(d.code, m);
        let status = '正常';
        if (md.end < d.min) status = '库存过低';
        else if (md.end > d.max) status = '库存过高';
        return [d.code, d.name, d.manufacturer || '', d.cat, d.spec, d.pos, md.open, md.in, md.out, md.end, d.min, d.max, status];
      });
    } else if (mode === 'stat') {
      headers = ['月份', '入库数量', '出库数量', '净变动'];
      const inM = Array(12).fill(0), outM = Array(12).fill(0);
      data.inbound.forEach(r => { const i = +r.date.slice(5, 7) - 1; if (i >= 0 && i < 12) inM[i] += Number(r.qty); });
      data.outbound.forEach(r => { const i = +r.date.slice(5, 7) - 1; if (i >= 0 && i < 12) outM[i] += Number(r.qty); });
      const ti = inM.reduce((a, b) => a + b, 0), to = outM.reduce((a, b) => a + b, 0);
      exportRows = MONN.map((m, i) => [m, inM[i], outM[i], inM[i] - outM[i]]);
      exportRows.push(['全年合计', ti, to, ti - to]);
    } else if (mode === 'alarm') {
      headers = ['药品编码', '药品名称', '仓位', '当前结存', '最低库存', '最高库存', '预警状态'];
      const st = allStock().filter(d => d.status !== '正常');
      exportRows = st.map(d => [d.code, d.name, d.pos, d.stock, d.min, d.max, d.status]);
      if (exportRows.length === 0) {
        return showToast('暂无预警数据可导出', 'error');
      }
    }

    if (type === 'excel') {
      const aoa = [headers, ...exportRows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      const sheetName = mode === 'live' ? '实时结存' : mode === 'month' ? '月度结存' : mode === 'stat' ? '月度统计' : '库存预警';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${exportFileName}.xlsx`);
      showToast('导出Excel成功', 'success');
    } else {
      const csv = '\uFEFF' + [headers.join(','), ...exportRows.map(r => r.join(',')).join('\n')].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportFileName}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('导出CSV成功', 'success');
    }
  };

  const monthlyForDrug = (code: string, mi: number) => {
    const d = data.drugs.find(x => x.code === code);
    if (!d) return { open: 0, in: 0, out: 0, end: 0 };
    let open = d.opening;
    for (let m = 0; m <= mi; m++) {
      let inM = 0, outM = 0;
      data.inbound.forEach(r => { if (r.code === code && +r.date.slice(5, 7) - 1 === m) inM += Number(r.qty); });
      data.outbound.forEach(r => { if (r.code === code && +r.date.slice(5, 7) - 1 === m) outM += Number(r.qty); });
      if (m === mi) return { open, in: inM, out: outM, end: open + inM - outM };
      open = open + inM - outM;
    }
    return { open, in: 0, out: 0, end: open };
  };

  const handleSingleStock = () => {
    const inputStr = queryCode.trim();
    if (!inputStr) return showToast('请输入编码', 'error');
    const code = inputStr.split(' ')[0];
    const d = data.drugs.find(x => x.code === code);
    if (!d) return showToast('无此药品', 'error');
    const st = allStock().find(x => x.code === code);
    if (st) setSingleResult(st);
  };

  const renderContent = () => {
    if (mode === 'live') {
      const st = allStock();
      const bm: Record<string, { t: number, ex: number, ne: number }> = {};
      allBatches().forEach(b => {
        bm[b.code] = bm[b.code] || { t: 0, ex: 0, ne: 0 };
        bm[b.code].t++;
        if (b.status === '已过期') bm[b.code].ex++;
        else if (b.status === '近效期') bm[b.code].ne++;
      });
      return (
        <div className="scroll flex-1 min-h-0 bg-white">
          <table>
            <thead>
              <tr>
                <th>编码</th><th>名称</th><th>厂商</th><th>分类</th><th>规格</th><th>仓位</th>
                <th className="num">期初</th><th className="num">入库</th><th className="num">出库</th><th className="num">结存</th>
                <th className="num">最低</th><th className="num">最高</th><th>批次/效期</th><th>状态</th>
              </tr>
            </thead>
            <tbody>
              {st.map(d => (
                <tr key={d.code}>
                  <td>{d.code}</td><td>{d.name}</td><td>{d.manufacturer || '—'}</td><td>{d.cat}</td><td>{d.spec}</td><td>{d.pos}</td>
                  <td className="num">{fmt(d.opening)}</td><td className="num">{fmt(d.inQty)}</td><td className="num">{fmt(d.outQty)}</td>
                  <td className="num font-bold">{fmt(d.stock)}</td><td className="num">{fmt(d.min)}</td><td className="num">{fmt(d.max)}</td>
                  <td>
                    {!bm[d.code] ? <span className="text-[var(--muted)]">—</span> : (
                      <>
                        {bm[d.code].t}批 
                        {bm[d.code].ex > 0 && <span className="badge b-low ml-1">过{bm[d.code].ex}</span>}
                        {bm[d.code].ne > 0 && <span className="badge bg-[#fff7e6] text-[#d48806] ml-1">近{bm[d.code].ne}</span>}
                      </>
                    )}
                  </td>
                  <td><Badge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    
    if (mode === 'month') {
      if (month === '') return <div className="card text-center text-[var(--muted)] py-[30px]">📅 请在上方选择月份</div>;
      
      const m = +month;
      const rows = data.drugs.map(d => {
        const md = monthlyForDrug(d.code, m);
        let status = '正常';
        if (md.end < d.min) status = '库存过低';
        else if (md.end > d.max) status = '库存过高';
        return { ...d, ...md, status };
      });
      const tOpen = rows.reduce((s, r) => s + r.open, 0);
      const tIn = rows.reduce((s, r) => s + r.in, 0);
      const tOut = rows.reduce((s, r) => s + r.out, 0);
      const tEnd = rows.reduce((s, r) => s + r.end, 0);

      const ends = [];
      for (let i = 0; i < 12; i++) {
        let tot = 0;
        data.drugs.forEach(d => { tot += monthlyForDrug(d.code, i).end; });
        ends.push(tot);
      }
      
      const lineData = MONN.map((m, i) => ({ name: m, end: ends[i] }));

      return (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="scroll flex-1 min-h-0 bg-white mb-4">
            <table>
              <thead>
                <tr>
                  <th>编码</th><th>名称</th><th>厂商</th><th>分类</th><th>规格</th><th>仓位</th>
                  <th className="num">期初</th><th className="num">本月入库</th><th className="num">本月出库</th>
                  <th className="num">期末结存</th><th className="num">最低</th><th className="num">最高</th><th>状态</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.code}>
                    <td>{d.code}</td><td>{d.name}</td><td>{d.manufacturer || '—'}</td><td>{d.cat}</td><td>{d.spec}</td><td>{d.pos}</td>
                    <td className="num">{fmt(d.open)}</td><td className="num text-[#389e0d]">{fmt(d.in)}</td>
                    <td className="num text-[#096dd9]">{fmt(d.out)}</td>
                    <td className="num font-bold">{fmt(d.end)}</td><td className="num">{fmt(d.min)}</td><td className="num">{fmt(d.max)}</td>
                    <td><Badge status={d.status} /></td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td colSpan={6}>合计</td>
                  <td className="num">{fmt(tOpen)}</td><td className="num text-[#389e0d]">{fmt(tIn)}</td>
                  <td className="num text-[#096dd9]">{fmt(tOut)}</td><td className="num">{fmt(tEnd)}</td>
                  <td></td><td></td><td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="card shrink-0 h-[260px] flex flex-col">
            <h3>📈 各月期末结存总量趋势 <span className="tag">{yr} 全年</span></h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d4e0ec" />
                  <XAxis dataKey="name" tick={{fontSize: 10, fill: '#8da3be'}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fontSize: 10, fill: '#8da3be'}} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{borderRadius: '8px', border: '1px solid #d4e0ec', fontSize: '12px'}} />
                  <Line type="monotone" name="期末结存" dataKey="end" stroke="#1890ff" strokeWidth={2.4} dot={{r: 3}} activeDot={{r: 5}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      );
    }
    
    if (mode === 'stat') {
      const inM = Array(12).fill(0), outM = Array(12).fill(0);
      data.inbound.forEach(r => { const i = +r.date.slice(5, 7) - 1; if (i >= 0 && i < 12) inM[i] += Number(r.qty); });
      data.outbound.forEach(r => { const i = +r.date.slice(5, 7) - 1; if (i >= 0 && i < 12) outM[i] += Number(r.qty); });
      const ti = inM.reduce((a, b) => a + b, 0), to = outM.reduce((a, b) => a + b, 0);

      const lineData = MONN.map((m, i) => ({ name: m, in: inM[i], out: outM[i] }));

      return (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-gradient-to-br from-[var(--panel2)] to-[var(--panel)] border border-[var(--border)] rounded-[14px] p-4 shadow-[0_1px_6px_rgba(24,144,255,0.06)]">
              <div className="text-[var(--muted)] text-[12px] flex items-center gap-1.5">
                <span className="w-[9px] h-[9px] rounded-full inline-block bg-[var(--in)]"></span>全年入库
              </div>
              <div className="text-[26px] font-bold mt-2">{fmt(ti)}</div>
            </div>
            <div className="bg-gradient-to-br from-[var(--panel2)] to-[var(--panel)] border border-[var(--border)] rounded-[14px] p-4 shadow-[0_1px_6px_rgba(24,144,255,0.06)]">
              <div className="text-[var(--muted)] text-[12px] flex items-center gap-1.5">
                <span className="w-[9px] h-[9px] rounded-full inline-block bg-[var(--out)]"></span>全年出库
              </div>
              <div className="text-[26px] font-bold mt-2">{fmt(to)}</div>
            </div>
            <div className="bg-gradient-to-br from-[var(--panel2)] to-[var(--panel)] border border-[var(--border)] rounded-[14px] p-4 shadow-[0_1px_6px_rgba(24,144,255,0.06)]">
              <div className="text-[var(--muted)] text-[12px] flex items-center gap-1.5">
                <span className="w-[9px] h-[9px] rounded-full inline-block bg-[var(--primary)]"></span>净结存变动
              </div>
              <div className="text-[26px] font-bold mt-2">{fmt(ti - to)}</div>
            </div>
          </div>
          <div className="card h-[240px] flex flex-col shrink-0 mb-4">
            <h3>📅 月度入库 / 出库汇总 <span className="tag">{yr}</span></h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d4e0ec" />
                  <XAxis dataKey="name" tick={{fontSize: 10, fill: '#8da3be'}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fontSize: 10, fill: '#8da3be'}} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{borderRadius: '8px', border: '1px solid #d4e0ec', fontSize: '12px'}} />
                  <Line type="monotone" name="入库" dataKey="in" stroke="#22c55e" strokeWidth={2.4} dot={{r: 3}} activeDot={{r: 5}} />
                  <Line type="monotone" name="出库" dataKey="out" stroke="#3b82f6" strokeWidth={2.4} dot={{r: 3}} activeDot={{r: 5}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card flex-1 min-h-0 flex flex-col">
            <h3>📋 月度明细表</h3>
            <div className="scroll flex-1 min-h-0">
              <table>
                <thead><tr><th>月份</th><th className="num">入库数量</th><th className="num">出库数量</th><th className="num">净变动</th></tr></thead>
                <tbody>
                  {MONN.map((m, i) => (
                    <tr key={i}>
                      <td>{m}</td>
                      <td className="num text-[#4ade80]">{fmt(inM[i])}</td>
                      <td className="num text-[#7cb0ff]">{fmt(outM[i])}</td>
                      <td className="num">{fmt(inM[i] - outM[i])}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td>全年</td>
                    <td className="num text-[#4ade80]">{fmt(ti)}</td>
                    <td className="num text-[#7cb0ff]">{fmt(to)}</td>
                    <td className="num">{fmt(ti - to)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }
    
    if (mode === 'alarm') {
      return <AlarmView />;
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex gap-[10px] flex-wrap items-center mb-[14px]">
        <div className="inline-flex border border-[var(--border2)] rounded-[9px] overflow-hidden">
          {['live', 'month', 'stat', 'alarm'].map((m) => {
            const labels: any = { live: '实时结存', month: '月度结存', stat: '月度统计', alarm: '库存预警' };
            return (
              <button key={m} className={cn("px-3.5 py-1.5 text-[13px] border-none cursor-pointer", mode === m ? 'bg-[var(--primary)] text-white font-semibold' : 'bg-white text-[var(--muted)]')} onClick={() => setMode(m as any)}>{labels[m]}</button>
            )
          })}
        </div>
        
        {mode === 'month' && (
          <select value={month} onChange={e => setMonth(e.target.value)}>
            <option value="">— 选择月份 —</option>
            {MON.map((m, i) => <option key={m} value={i}>{yr}-{m}月</option>)}
          </select>
        )}
        
        <input list="s_l" placeholder="药品编码/名称查询" value={queryCode} onChange={e => setQueryCode(e.target.value)} className="w-[200px]" />
        <datalist id="s_l">{data.drugs.map(d => <option key={d.code} value={`${d.code} ${d.name}`} />)}</datalist>
        <button className="btn sm" onClick={handleSingleStock}>查询</button>
        <button className="btn" onClick={() => handleExport('excel')} title="导出Excel">⬇ 导出Excel</button>
        <button className="btn" onClick={() => handleExport('csv')} title="导出CSV">⬇ 导出CSV</button>
        <span className="flex-1"></span>
        <span className="tag-soft">
          {mode === 'live' ? '结存 = 期初 + 入库 − 出库（实时累计）' :
           mode === 'month' ? (month === '' ? '请选择月份，查看该月「期初 / 本月入库 / 本月出库 / 期末结存」' : `${yr}-${MON[+month]}月：期初 + 本月入库 − 本月出库 = 期末结存`) :
           mode === 'stat' ? '全年各月入库 / 出库汇总（数量）' : '低于 / 高于安全库存，以及近效期、已过期批次自动预警'}
        </span>
      </div>

      {renderContent()}

      {singleResult && (
        <div className="card mt-4 shrink-0">
          <h3>📌 {singleResult.name}（{singleResult.code}）结存明细</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              期初库存：<b>{fmt(singleResult.opening)}</b> {singleResult.unit}<br/>
              累计入库：<b className="text-[var(--in)]">{fmt(singleResult.inQty)}</b> {singleResult.unit}<br/>
              累计出库：<b className="text-[var(--out)]">{fmt(singleResult.outQty)}</b> {singleResult.unit}
            </div>
            <div>
              当前结存：<b className="text-[18px]">{fmt(singleResult.stock)}</b> {singleResult.unit}<br/>
              安全区间：{fmt(singleResult.min)} ~ {fmt(singleResult.max)} {singleResult.unit}<br/>
              状态：<Badge status={singleResult.status} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AlarmView() {
  const { allStock, expSummary, data, saveData, showToast, showConfirm } = useAppStore();
  const [filter, setFilter] = useState('all');

  const handleDiscard = async (id: number) => {
    const lot = data.inbound.find(r => r.id === id);
    if (!lot) return;
    if (!(lot.remaining > 0)) return showToast('该批次库存为 0，无需作废', 'error');
    if (await showConfirm(`确认将批次「${lot.batchNo}」(${lot.name}，剩余 ${lot.remaining} ${lot.unit}) 过期作废？\n作废后库存清零且不可恢复。`)) {
      const q = lot.remaining;
      const newData = { ...data };
      const idx = newData.inbound.findIndex(r => r.id === id);
      newData.inbound[idx] = { ...lot, remaining: 0, discarded: true };
      
      const rec = { id: Date.now(), code: lot.code, name: lot.name, batchNo: lot.batchNo, expDate: lot.expDate, qty: q, date: todayStr };
      newData.discards = [...(newData.discards || []), rec];
      
      saveData(newData);
      showToast('作废成功', 'success');
    }
  };

  const renderAlarmContent = () => {
    if (filter === '效期预警') {
      const { expired, near } = expSummary();
      const b = [...expired, ...near];
      if (b.length === 0) return <div className="card text-center text-[var(--muted)] py-[30px]">🎉 当前无近效期 / 过期批次。</div>;
      return (
        <div className="scroll flex-1 min-h-0 bg-white">
          <table>
            <thead>
              <tr><th>药品编码</th><th>名称</th><th>厂商</th><th>批号</th><th>有效期至</th><th className="num">剩余</th><th>状态</th><th>操作</th></tr>
            </thead>
            <tbody>
              {b.map(x => (
                <tr key={x.id}>
                  <td>{x.code}</td><td>{x.name}</td><td>{x.manufacturer || '—'}</td><td>{x.batchNo || '—'}</td><td>{x.expDate || '—'}</td>
                  <td className="num font-bold">{fmt(x.remaining)} {x.unit}</td>
                  <td><ExpBadge status={x.status} /></td>
                  <td><button className="btn sm danger" onClick={() => handleDiscard(x.id)}>过期作废</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const st = allStock().filter(d => d.status !== '正常');
    const list = filter === 'all' ? st : st.filter(d => d.status === filter);
    if (list.length === 0) return <div className="card text-center text-[var(--muted)] py-[30px]">🎉 当前无「{filter === 'all' ? '过低或过高' : filter}」预警，库存均在安全区间。</div>;
    
    return (
      <div className="scroll flex-1 min-h-0 bg-white">
        <table>
          <thead>
            <tr><th>编码</th><th>名称</th><th>仓位</th><th className="num">结存</th><th className="num">最低</th><th className="num">最高</th><th>状态</th><th>建议</th></tr>
          </thead>
          <tbody>
            {list.map(d => (
              <tr key={d.code}>
                <td>{d.code}</td><td>{d.name}</td><td>{d.pos}</td>
                <td className="num font-bold">{fmt(d.stock)}</td><td className="num">{fmt(d.min)}</td><td className="num">{fmt(d.max)}</td>
                <td><Badge status={d.status} /></td>
                <td className="text-[var(--muted)]">
                  {d.status === '库存过低' ? `建议补货 ${fmt(Math.max(d.min - d.stock, d.max * 0.8 - d.stock))} ${d.unit}` : '建议控制采购 / 促销'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex gap-[10px] flex-wrap items-center mb-[14px]">
        <div className="inline-flex border border-[var(--border2)] rounded-[9px] overflow-hidden">
          {['all', '库存过低', '库存过高', '效期预警'].map(f => (
            <button key={f} className={cn("px-3.5 py-1.5 text-[13px] border-none cursor-pointer", filter === f ? 'bg-[var(--primary)] text-white font-semibold' : 'bg-white text-[var(--muted)]')} onClick={() => setFilter(f)}>
              {f === 'all' ? '全部预警' : f}
            </button>
          ))}
        </div>
        <span className="flex-1"></span>
        <span className="tag-soft">效期预警请在「批次台账」执行过期作废</span>
      </div>
      {renderAlarmContent()}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  if (status === '库存过低') return <span className="badge b-low">库存过低</span>;
  if (status === '库存过高') return <span className="badge b-over">库存过高</span>;
  return <span className="badge b-ok">正常</span>;
}

function ExpBadge({ status }: { status: string }) {
  if (status === '已过期') return <span className="badge b-low">已过期</span>;
  if (status === '近效期') return <span className="badge bg-[#fff7e6] text-[#d48806]">近效期</span>;
  return <span className="badge b-ok">正常</span>;
}
