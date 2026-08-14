import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useAppStore } from '../store';
import { Modal } from '../components/Modal';
import { fmt, todayStr } from '../lib/utils';
import { OutboundRecord, Drug } from '../types';

export function Outbound() {
  const { data, amt, isMonthLocked, stockOf, costOf, fetchData, token, showToast } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  
  const [modalOpen, setModalOpen] = useState(false);
  const [selDrug, setSelDrug] = useState<Drug | null>(null);
  
  const [form, setForm] = useState<Partial<OutboundRecord>>({
    date: todayStr,
    qty: 0, handler: '', dept: '', recipient: '', remark: ''
  });

  const [saving, setSaving] = useState(false);

  // 补全出库记录的药品基础信息（name/spec/unit/...）
  // 历史记录可能缺失这些字段，根据 code 从 data.drugs 查找补齐
  const enrichedOutbound = useMemo(() => {
    return data.outbound.map(r => {
      if (r.name && r.spec && r.unit) return r;
      const d = data.drugs.find(x => x.code === r.code);
      if (!d) return r;
      return {
        ...r,
        name: r.name || d.name,
        manufacturer: r.manufacturer || d.manufacturer || '',
        cat: r.cat || d.cat || '',
        spec: r.spec || d.spec || '',
        unit: r.unit || d.unit || '',
        pos: r.pos || d.pos || ''
      };
    });
  }, [data.outbound, data.drugs]);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enrichedOutbound;
    return enrichedOutbound.filter(r => 
      (r.name || '').toLowerCase().includes(q) || 
      r.code.toLowerCase().includes(q) || 
      (r.remark && r.remark.toLowerCase().includes(q))
    );
  }, [enrichedOutbound, query]);

  const handleSave = async () => {
    console.log(`[出库管理] 请求保存出库单：药品=${selDrug?.code} ${selDrug?.name}，数量=${form.qty}`);
    if (!selDrug || !form.date || !form.qty || !form.handler || !form.dept || !form.recipient) {
      console.log(`[出库管理] 保存失败：必填项不完整`);
      return showToast('请填写完整带*的必填项', 'error');
    }
    if (form.qty <= 0) {
      console.log(`[出库管理] 保存失败：数量不大于0`);
      return showToast('数量必须大于0', 'error');
    }
    if (isMonthLocked(form.date)) {
      console.log(`[出库管理] 保存失败：日期 ${form.date} 已结账锁定`);
      return showToast('该月份已结账，无法登记', 'error');
    }

    const qty = Number(form.qty);
    const price = costOf(selDrug.code) || selDrug.price;

    setSaving(true);
    try {
      const res = await fetch('/api/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          date: form.date,
          code: selDrug.code,
          qty: qty,
          price: price,
          handler: form.handler,
          remark: form.remark,
          dept: form.dept,
          recipient: form.recipient
        })
      });
      if (res.ok) {
        await fetchData(); // Refresh data to see new outbound and remaining qty
        console.log(`[出库管理] 保存成功：出库 ${selDrug.name} qty=${qty}，仍停留在出库管理页`);
        setModalOpen(false);
        showToast('出库成功', 'success');
      } else {
        const json = await res.json();
        console.error(`[出库管理] 保存失败：${json.error || '未知错误'}`);
        showToast('出库失败: ' + (json.error || '未知错误'), 'error');
      }
    } catch (e) {
      console.error(`[出库管理] 保存异常：`, e);
      showToast('网络错误', 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    const headers = ['业务日期', '药品编码', '出库数量', '领用部门', '领用人', '经办人', '备注'];
    const sample1 = [todayStr, 'A001-01', 10, '住院部', '李四', '王五', '日常领用'];
    
    const aoa = [headers, sample1];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "导入模板");
    XLSX.writeFile(wb, "出库记录导入模板.xlsx");
  };

  const handleExport = (type: 'excel' | 'csv') => {
    const headers = ['业务日期', '药品编码', '药品名称', '厂商', '分类', '规格', '仓位', '领用部门', '领用人', '出库数量', '单价', '含税金额', '批号', '经办人', '备注'];
    const exportRows = enrichedOutbound.map(r => [
      r.date, r.code, r.name, r.manufacturer || '', r.cat, r.spec, r.pos,
      r.dept, r.recipient, r.qty, r.price, amt(r.qty, r.price).total, r.batchNo || '', r.handler, r.remark || ''
    ]);
    
    if (type === 'excel') {
      const aoa = [headers, ...exportRows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "出库记录");
      XLSX.writeFile(wb, "出库记录.xlsx");
    } else {
      const csv = '\uFEFF' + [headers.join(','), ...exportRows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '出库记录.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const ab = evt.target?.result;
        const wb = XLSX.read(ab, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const dataArr = XLSX.utils.sheet_to_json(ws);
        
        let importedCount = 0;
        let skipCount = 0;
        
        showToast('开始批量导入，请稍候...', 'info');

        for (const row of dataArr as any[]) {
          const code = (row['药品编码'] || '').toString().trim();
          const date = (row['业务日期'] || '').toString().trim();
          
          if (!code || !date) {
            skipCount++;
            continue;
          }
          
          const d = data.drugs.find(x => x.code === code);
          if (!d || isMonthLocked(date)) {
            skipCount++;
            continue;
          }

          const qty = Number(row['出库数量']);
          if (!(qty > 0)) {
            skipCount++;
            continue;
          }

          const dept = (row['领用部门'] || '').toString().trim();
          const recipient = (row['领用人'] || '').toString().trim();
          const handler = (row['经办人'] || '').toString().trim() || '—';
          const remark = (row['备注'] || '').toString().trim();

          if (!dept || !recipient) {
             skipCount++;
             continue;
          }

          const price = costOf(code) || d.price;

          const res = await fetch('/api/outbound', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ date, code, qty, price, handler, remark, dept, recipient })
          });

          if (res.ok) {
            importedCount++;
          } else {
            skipCount++;
          }
        }

        if (importedCount > 0) {
          await fetchData();
          showToast(`成功导入 ${importedCount} 条记录${skipCount > 0 ? `，跳过或失败 ${skipCount} 条` : ''}。`, 'success');
        } else if (skipCount > 0) {
          showToast(`导入的 ${skipCount} 条记录均无效或失败，已跳过。`, 'error');
        } else {
          showToast(`未在文件中识别到有效数据。`, 'error');
        }
      } catch (err) {
        showToast('解析文件失败，请检查文件格式。', 'error');
      }
      
      if (fileRef.current) fileRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex gap-[10px] flex-wrap items-center mb-[14px]">
        <button className="btn primary" onClick={() => {
          setSelDrug(null);
          setForm({ date: todayStr, qty: 0, handler: '', dept: '', recipient: '', remark: '' });
          setModalOpen(true);
        }}>＋ 新增出库单</button>
        <button className="btn" onClick={downloadTemplate}>⬇ 下载模板</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>⬆ 批量导入</button>
        <button className="btn" onClick={() => handleExport('excel')}>⬇ 导出Excel</button>
        <button className="btn" onClick={() => handleExport('csv')}>⬇ 导出CSV</button>
        <input 
          placeholder="搜索药品 / 备注..." 
          value={query} onChange={e => setQuery(e.target.value)} 
          className="flex-1 min-w-[200px] max-w-[300px]"
        />
        <span className="flex-1"></span>
        <span className="tag-soft">出库明细 {matched.length} 条</span>
        <span className="tag-soft">出库数量合计 {fmt(matched.reduce((s,r) => s + Number(r.qty), 0))}</span>
        <span className="tag-soft">含税金额合计 ¥{fmt(matched.reduce((s,r) => s + amt(r.qty, r.price).total, 0))}</span>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
      </div>

      <div className="scroll flex-1 min-h-0 bg-white">
        <table>
          <thead>
            <tr>
              <th>日期</th><th>药品编码</th><th>药品名称</th><th>厂商</th><th>分类</th><th>规格</th><th>仓位</th>
              <th>领用部门</th><th>领用人</th>
              <th className="num">出库数量</th><th className="num">单价</th><th className="num">含税金额</th>
              <th>批号</th><th>经办人</th><th>备注</th>
            </tr>
          </thead>
          <tbody>
            {matched.length === 0 ? (
              <tr><td colSpan={15} className="text-center text-[var(--muted)] py-4">无相关记录</td></tr>
            ) : (
              matched.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r => {
                const a = amt(r.qty, r.price);
                return (
                  <tr key={r.id}>
                    <td>{r.date}</td><td>{r.code}</td><td>{r.name}</td><td>{r.manufacturer || '—'}</td><td>{r.cat}</td><td>{r.spec}</td><td>{r.pos}</td>
                    <td>{r.dept}</td><td>{r.recipient}</td>
                    <td className="num">{fmt(r.qty)}</td><td className="num">{fmt(r.price)}</td><td className="num">{fmt(a.total)}</td>
                    <td>{r.batchNo || '—'}</td><td>{r.handler}</td><td>{r.remark || ''}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => !saving && setModalOpen(false)} onOk={handleSave} title="新增出库单" width="600px">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">选择药品 <span className="text-[#e34d4d]">*</span></label>
            <select 
              value={selDrug?.code || ''} 
              onChange={e => setSelDrug(data.drugs.find(x => x.code === e.target.value) || null)}
              className="font-medium"
            >
              <option value="">-- 请选择出库药品 --</option>
              {data.drugs.map(d => {
                const s = stockOf(d.code).stock;
                return <option key={d.code} value={d.code} disabled={s <= 0}>{d.name} ({d.spec}) - 当前结存: {s}{d.unit}</option>;
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-[var(--muted)]">出库日期 <span className="text-[#e34d4d]">*</span></label>
              <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-[var(--muted)]">出库数量 <span className="text-[#e34d4d]">*</span></label>
              <input 
                type="number" min="1" 
                value={form.qty || ''} 
                onChange={e => setForm({...form, qty: Number(e.target.value)})} 
                placeholder="数量"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-[var(--muted)]">领用部门 <span className="text-[#e34d4d]">*</span></label>
              <select value={form.dept} onChange={e => setForm({...form, dept: e.target.value})}>
                <option value="">-请选择-</option>
                {((data.params.depts as string[]) || []).map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-[var(--muted)]">领用人 <span className="text-[#e34d4d]">*</span></label>
              <input value={form.recipient} onChange={e => setForm({...form, recipient: e.target.value})} placeholder="输入领用人" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-[var(--muted)]">经办人 <span className="text-[#e34d4d]">*</span></label>
              <select value={form.handler} onChange={e => setForm({...form, handler: e.target.value})}>
                <option value="">-请选择-</option>
                {((data.params.handlers as string[]) || []).map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-[var(--muted)]">备注</label>
              <input value={form.remark} onChange={e => setForm({...form, remark: e.target.value})} placeholder="选填，用途等" />
            </div>
          </div>
          
          <div className="text-[12px] text-[var(--muted)] bg-[#f7fafc] p-2 rounded">
            提示：系统将自动按「先到期先出 (FEFO)」及「先进先出 (FIFO)」原则自动扣减最合适的库存批次，并在列表显示实际扣减的批号。当前库存金额采用加权平均价计算。
            {saving && <span className="text-[#1890ff] ml-2">正在保存中...</span>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
