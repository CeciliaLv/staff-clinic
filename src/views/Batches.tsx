import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useAppStore } from '../store';
import { fmt, todayStr, cn, NEAR_EXP_DAYS } from '../lib/utils';

export function Batches() {
  const { allBatches, data, saveData, amt, showToast, showConfirm } = useAppStore();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const allBatchesList = allBatches();
  
  const b = useMemo(() => {
    const statusFiltered = allBatchesList.filter(x => filter === 'all' ? true : x.status === filter);
    const q = query.trim().toLowerCase();
    if (!q) return statusFiltered;
    return statusFiltered.filter(x => 
      (x.name || '').toLowerCase().includes(q) || 
      (x.code || '').toLowerCase().includes(q) ||
      (x.batchNo || '').toLowerCase().includes(q)
    );
  }, [allBatchesList, filter, query]);

  const handleExport = (type: 'excel' | 'csv') => {
    const headers = ['药品编码', '药品名称', '厂商', '批号', '生产日期', '有效期至', '剩余数量', '单位', '状态'];
    const exportRows = b.map(x => [
      x.code, x.name, x.manufacturer || '', x.batchNo || '',
      x.prodDate || '', x.expDate || '', x.remaining, x.unit || '', x.status
    ]);
    
    if (type === 'excel') {
      const aoa = [headers, ...exportRows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "批次台账");
      XLSX.writeFile(wb, "批次台账.xlsx");
      showToast('导出Excel成功', 'success');
    } else {
      const csv = '\uFEFF' + [headers.join(','), ...exportRows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '批次台账.csv';
      a.click();
      URL.revokeObjectURL(url);
      showToast('导出CSV成功', 'success');
    }
  };

  const handleDiscard = async (id: number) => {
    const lot = data.inbound.find(r => r.id === id);
    if (!lot) return;
    console.log(`[批次台账] 请求作废批次 id=${id}，批号=${lot.batchNo}，药品=${lot.name}，剩余=${lot.remaining}`);
    if (!(lot.remaining > 0)) {
      console.log(`[批次台账] 作废拦截：批次库存为 0`);
      return showToast('该批次库存为 0，无需作废', 'error');
    }
    
    if (await showConfirm(`确认将批次「${lot.batchNo}」(${lot.name}，剩余 ${lot.remaining} ${lot.unit}) 过期作废？\n作废后库存清零且不可恢复。`)) {
      const q = lot.remaining;
      const newData = { ...data };
      const idx = newData.inbound.findIndex(r => r.id === id);
      newData.inbound[idx] = { ...lot, remaining: 0, discarded: true };
      
      const rec = { id: Date.now(), code: lot.code, name: lot.name, batchNo: lot.batchNo, expDate: lot.expDate, qty: q, date: todayStr };
      newData.discards = [...(newData.discards || []), rec];
      
      saveData(newData);
      console.log(`[批次台账] 作废成功：批次 ${lot.batchNo}，qty=${q}，仍停留在批次台账页`);
      showToast('作废成功', 'success');
    } else {
      console.log(`[批次台账] 取消作废：批次 ${lot.batchNo}`);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex gap-[10px] flex-wrap items-center mb-[14px]">
        <div className="inline-flex border border-[var(--border2)] rounded-[9px] overflow-hidden">
          {['all', '正常', '近效期', '已过期'].map(f => (
            <button key={f} className={cn("px-3.5 py-1.5 text-[13px] border-none cursor-pointer", filter === f ? 'bg-[var(--primary)] text-white font-semibold' : 'bg-white text-[var(--muted)]')} onClick={() => setFilter(f)}>
              {f === 'all' ? '全部' : f}
            </button>
          ))}
        </div>
        <input 
          placeholder="搜索药品名称 / 编码 / 批号..." 
          value={query} onChange={e => setQuery(e.target.value)} 
          className="flex-1 min-w-[200px] max-w-[300px]"
        />
        <button className="btn" onClick={() => handleExport('excel')}>⬇ 导出Excel</button>
        <button className="btn" onClick={() => handleExport('csv')}>⬇ 导出CSV</button>
        <span className="flex-1"></span>
        <span className="tag-soft">批次 {b.length} 条</span>
        <span className="tag-soft">库存合计 {fmt(b.reduce((s,r) => s + Number(r.remaining), 0))}</span>
        <span className="tag-soft">按批号 / 效期管理库存；近效期（≤{NEAR_EXP_DAYS}天）与已过期自动预警</span>
      </div>
      
      {b.length > 0 ? (
        <div className="scroll flex-1 min-h-0 bg-white">
          <table>
            <thead>
              <tr>
                <th>药品编码</th><th>名称</th><th>厂商</th><th>批号</th><th>生产日期</th><th>有效期至</th><th className="num">剩余</th><th>状态</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {b.map(x => (
                <tr key={x.id}>
                  <td>{x.code}</td><td>{x.name}</td><td>{x.manufacturer || '—'}</td>
                  <td>{x.batchNo || '—'}</td><td>{x.prodDate || '—'}</td><td>{x.expDate || '—'}</td>
                  <td className="num font-bold">{fmt(x.remaining)} {x.unit}</td>
                  <td><ExpBadge status={x.status} /></td>
                  <td>
                    {(x.status === '已过期' || x.status === '近效期') ? (
                      <button className="btn sm danger" onClick={() => handleDiscard(x.id)}>过期作废</button>
                    ) : <span className="text-[var(--muted)]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center text-[var(--muted)] py-[30px]">🎉 当前无「{filter === 'all' ? '在库' : filter}」批次。</div>
      )}
    </div>
  );
}

function ExpBadge({ status }: { status: string }) {
  if (status === '已过期') return <span className="badge b-low">已过期</span>;
  if (status === '近效期') return <span className="badge bg-[#fff7e6] text-[#d48806]">近效期</span>;
  return <span className="badge b-ok">正常</span>;
}
