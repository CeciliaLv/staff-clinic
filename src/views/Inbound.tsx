import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useAppStore } from '../store';
import { fmt, todayStr, NEAR_EXP_DAYS, daysBetween } from '../lib/utils';
import { Modal } from '../components/Modal';

export function Inbound() {
  const { data, saveData, amt, isMonthLocked, showToast, showConfirm } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const rows = data.inbound;
  
  const totQty = rows.reduce((s, r) => s + Number(r.qty), 0);
  const totAmt = rows.reduce((s, r) => s + amt(r.qty, r.price).total, 0);

  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>({ date: todayStr, qty: 1, price: 0 });

  const handleDel = async (id: number) => {
    const rec = data.inbound.find(r => r.id === id);
    if (!rec) return;
    console.log(`[入库管理] 请求删除入库记录 id=${id}，药品=${rec.name}，日期=${rec.date}`);
    if (isMonthLocked(rec.date)) {
      console.log(`[入库管理] 删除拦截：该月份已结账锁定`);
      return showToast(`该记录业务日期（${rec.date}）所在月份已结账锁定，不能删除。`, 'error');
    }
    
    // stock check
    let stock = 0;
    data.inbound.forEach(r => { if (r.code === rec.code) stock += Number(r.remaining != null ? r.remaining : r.qty); });
    data.outbound.forEach(r => { if (r.code === rec.code) stock -= Number(r.qty); });
    const d = data.drugs.find(x => x.code === rec.code);
    if (d) stock += d.opening;
    
    const rem = Number(rec.remaining != null ? rec.remaining : rec.qty);
    const after = stock - rem;
    
    if (after < 0) {
      console.log(`[入库管理] 删除拦截：删除后结存将为 ${after}（负值）`);
      showToast(`删除该入库批次后，「${rec.name}」结存将变为 ${after}（负值），已阻止。请先调整相关出库记录。`, 'error');
      return;
    }

    if (await showConfirm('确认删除该条记录？此操作不可撤销。')) {
      saveData({ ...data, inbound: data.inbound.filter(r => r.id !== id) });
      console.log(`[入库管理] 删除成功：入库记录 id=${id}，仍停留在入库管理页`);
      showToast('删除成功', 'success');
    } else {
      console.log(`[入库管理] 取消删除：入库记录 id=${id}`);
    }
  };

  const handleCodeChange = (code: string) => {
    const d = data.drugs.find(x => x.code === code);
    if (!d) return;
    setFormData({ ...formData, code, name: d.name, cat: d.cat, spec: d.spec, unit: d.unit, pos: d.pos, price: d.price });
  };

  const handleSave = () => {
    console.log(`[入库管理] 请求保存入库单：编码=${formData.code}，药品=${formData.name}，数量=${formData.qty}`);
    if (!formData.code) {
      console.log(`[入库管理] 保存失败：未选择药品编码`);
      return showToast('请选择药品编码', 'error');
    }
    const d = data.drugs.find(x => x.code === formData.code);
    if (!d) {
      console.log(`[入库管理] 保存失败：药品不存在 ${formData.code}`);
      return showToast('药品不存在', 'error');
    }
    if (isMonthLocked(formData.date)) {
      console.log(`[入库管理] 保存失败：日期 ${formData.date} 已结账锁定`);
      return showToast(`业务日期 ${formData.date} 所在月份已结账锁定，不能新增记录。`, 'error');
    }
    
    const qty = +formData.qty;
    if (!(qty > 0)) {
      console.log(`[入库管理] 保存失败：数量不大于0`);
      return showToast('数量必须大于0', 'error');
    }
    
    const pv = formData.price;
    const price = (pv === '' || isNaN(+pv)) ? d.price : (+pv || 0);
    if (price < 0) return showToast('单价不能为负', 'error');

    const batch = formData.batchNo?.trim();
    const prod = formData.prodDate;
    const exp = formData.expDate;
    
    if (!batch) {
      console.log(`[入库管理] 保存失败：批号为空`);
      return showToast('请填写批号', 'error');
    }
    if (!exp) {
      console.log(`[入库管理] 保存失败：有效期为空`);
      return showToast('请填写有效期至', 'error');
    }
    if (prod && exp && exp < prod) {
      console.log(`[入库管理] 保存失败：有效期早于生产日期`);
      return showToast('有效期至不能早于生产日期', 'error');
    }

    const rec = {
      id: Date.now(),
      code: formData.code,
      date: formData.date,
      name: d.name,
      manufacturer: d.manufacturer,
      cat: d.cat,
      spec: d.spec,
      unit: d.unit,
      pos: d.pos,
      qty,
      price,
      handler: formData.handler || '—',
      remark: formData.remark,
      batchNo: batch,
      prodDate: prod,
      expDate: exp,
      remaining: qty
    };

    saveData({ ...data, inbound: [...data.inbound, rec] });
    console.log(`[入库管理] 保存成功：入库 ${d.name} qty=${qty}，仍停留在入库管理页`);
    setModalOpen(false);
    showToast('保存成功', 'success');
  };

  const downloadTemplate = () => {
    const headers = ['业务日期', '药品编码', '入库数量', '单价', '批号', '生产日期', '有效期至', '经办人', '备注'];
    const sample1 = [todayStr, 'A001-01', 100, 25.00, 'B001-01', '2025-01-01', '2027-01-01', '张三', '月度采购'];
    
    const aoa = [headers, sample1];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "导入模板");
    XLSX.writeFile(wb, "入库记录导入模板.xlsx");
  };

  const handleExport = (type: 'excel' | 'csv') => {
    const headers = ['业务日期', '药品编码', '药品名称', '厂商', '分类', '规格', '仓位', '入库数量', '单价', '含税金额', '批号', '生产日期', '有效期至', '经办人', '备注'];
    const exportRows = data.inbound.map(r => [
      r.date, r.code, r.name, r.manufacturer || '', r.cat, r.spec, r.pos, 
      r.qty, r.price, amt(r.qty, r.price).total, r.batchNo || '', r.prodDate || '', r.expDate || '', r.handler, r.remark || ''
    ]);
    
    if (type === 'excel') {
      const aoa = [headers, ...exportRows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "入库记录");
      XLSX.writeFile(wb, "入库记录.xlsx");
    } else {
      const csv = '\uFEFF' + [headers.join(','), ...exportRows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '入库记录.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const ab = evt.target?.result;
        const wb = XLSX.read(ab, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const dataArr = XLSX.utils.sheet_to_json(ws);
        
        let importedCount = 0;
        let skipCount = 0;
        const newInbound = [...data.inbound];
        let id = Date.now();

        dataArr.forEach((row: any) => {
          const code = (row['药品编码'] || '').toString().trim();
          const date = (row['业务日期'] || '').toString().trim();
          
          if (!code || !date) {
            skipCount++;
            return;
          }
          
          const d = data.drugs.find(x => x.code === code);
          if (!d || isMonthLocked(date)) {
            skipCount++;
            return;
          }

          const qty = Number(row['入库数量']);
          if (!(qty > 0)) {
            skipCount++;
            return;
          }

          newInbound.push({
            id: id++,
            date,
            code,
            name: d.name,
            manufacturer: d.manufacturer,
            cat: d.cat,
            spec: d.spec,
            unit: d.unit,
            pos: d.pos,
            qty,
            price: Number(row['单价']) || d.price,
            handler: (row['经办人'] || '').toString() || '—',
            remark: (row['备注'] || '').toString(),
            batchNo: (row['批号'] || '').toString(),
            prodDate: (row['生产日期'] || '').toString(),
            expDate: (row['有效期至'] || '').toString(),
            remaining: qty
          });
          importedCount++;
        });

        if (importedCount > 0) {
          saveData({ ...data, inbound: newInbound });
          showToast(`成功导入 ${importedCount} 条记录${skipCount > 0 ? `，跳过无效/拦截 ${skipCount} 条` : ''}。`, 'success');
        } else if (skipCount > 0) {
          showToast(`导入的 ${skipCount} 条记录均无效，已跳过。`, 'info');
        } else {
          showToast(`未在文件中识别到有效入库数据。`, 'error');
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
        <button className="btn primary" onClick={() => { setFormData({ date: todayStr, qty: 1, price: 0 }); setModalOpen(true); }}>＋ 新增入库单</button>
        <button className="btn" onClick={downloadTemplate}>⬇ 下载模板</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>⬆ 批量导入</button>
        <button className="btn" onClick={() => handleExport('excel')}>⬇ 导出Excel</button>
        <button className="btn" onClick={() => handleExport('csv')}>⬇ 导出CSV</button>
        <span className="flex-1"></span>
        <span className="tag-soft">入库明细 {rows.length} 条</span>
        <span className="tag-soft">入库数量合计 {fmt(totQty)}</span>
        <span className="tag-soft">含税金额合计 ¥{fmt(totAmt)}</span>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
      </div>
      <div className="scroll flex-1 min-h-0 bg-white">
        <table>
          <thead>
            <tr>
              <th>日期</th><th>药品编码</th><th>药品名称</th><th>厂商</th><th>分类</th><th>规格</th><th>仓位</th>
              <th className="num">入库数量</th><th className="num">单价</th><th className="num">含税金额</th>
              <th>批号</th><th>生产日期</th><th>有效期至</th><th>经办人</th><th>备注</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map(r => {
              const a = amt(r.qty, r.price);
              return (
                <tr key={r.id}>
                  <td>{r.date}</td><td>{r.code}</td><td>{r.name}</td><td>{r.manufacturer || '—'}</td><td>{r.cat}</td><td>{r.spec}</td><td>{r.pos}</td>
                  <td className="num">{fmt(r.qty)}</td><td className="num">{fmt(r.price)}</td><td className="num">{fmt(a.total)}</td>
                  <td>{r.batchNo || '—'}</td><td>{r.prodDate || '—'}</td><td>{r.expDate || '—'}</td>
                  <td>{r.handler}</td><td>{r.remark || ''}</td>
                  <td><button className="btn sm danger" onClick={() => handleDel(r.id)}>删除</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} onOk={handleSave} title="入库登记">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">业务日期</label>
            <input type="date" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} />
          </div>
          <div className="flex flex-col gap-1" style={{ flex: 1, minWidth: '200px' }}>
            <label className="text-[12px] text-[var(--muted)]">药品编码（选择后自动带出信息）</label>
            <select value={formData.code || ''} onChange={e => handleCodeChange(e.target.value)}>
              <option value="">— 选择药品 —</option>
              {data.drugs.map(d => <option key={d.code} value={d.code}>{d.code} {d.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">药品名称</label>
            <input readOnly placeholder="自动带出" value={formData.name || ''} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">入库数量 {formData.unit && <span className="text-[var(--muted)] font-normal">({formData.unit})</span>}</label>
            <input type="number" min="0.01" step="any" value={formData.qty ?? ''} onChange={e => setFormData({...formData, qty: e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">单价(元)</label>
            <input type="number" min="0" step="0.01" value={formData.price ?? ''} onChange={e => setFormData({...formData, price: e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">经办人</label>
            <input list="lt_h" placeholder="选择/输入" value={formData.handler || ''} onChange={e => setFormData({...formData, handler: e.target.value})} />
            <datalist id="lt_h">{data.params.handlers.map(t => <option key={t} value={t} />)}</datalist>
          </div>
          <div className="flex flex-col gap-1" style={{ flex: 1, minWidth: '220px' }}>
            <label className="text-[12px] text-[var(--muted)]">备注</label>
            <input placeholder="如 月度采购" value={formData.remark || ''} onChange={e => setFormData({...formData, remark: e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">批号</label>
            <input placeholder="如 B001-09" value={formData.batchNo || ''} onChange={e => setFormData({...formData, batchNo: e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">生产日期</label>
            <input type="date" value={formData.prodDate || ''} onChange={e => setFormData({...formData, prodDate: e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">有效期至</label>
            <input type="date" value={formData.expDate || ''} onChange={e => setFormData({...formData, expDate: e.target.value})} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
