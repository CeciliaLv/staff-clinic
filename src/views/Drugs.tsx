import React, { useState, useRef } from 'react';
import { useAppStore } from '../store';
import { fmt } from '../lib/utils';
import { Modal } from '../components/Modal';
import * as XLSX from 'xlsx';
import { Drug } from '../types';

export function Drugs() {
  const { data, saveData, stockOf, showToast, showConfirm } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<Drug>>({});

  const handleOpen = (code?: string) => {
    if (code) {
      const d = data.drugs.find(x => x.code === code);
      if (d) setFormData({ ...d });
      setEditingCode(code);
    } else {
      setFormData({
        code: genDrugCode(),
        unit: '盒',
        min: 0,
        max: 0,
        opening: 0,
        price: 0
      });
      setEditingCode(null);
    }
    setModalOpen(true);
  };

  const genDrugCode = () => {
    let max = 0;
    data.drugs.forEach(d => {
      const m = String(d.code || '').match(/(\d+)$/);
      if (m) {
        const n = +m[1];
        if (n > max) max = n;
      }
    });
    return 'A001-' + String(max + 1).padStart(2, '0');
  };

  const handleDelete = async (code: string) => {
    const d = data.drugs.find(x => x.code === code);
    if (!d) return;
    console.log(`[药品档案] 请求删除药品：${d.name} (${code})`);
    const recCount = data.inbound.filter(r => r.code === code).length + data.outbound.filter(r => r.code === code).length;
    if (recCount > 0) {
      console.log(`[药品档案] 删除拦截：已存在 ${recCount} 条出入库记录`);
      showToast(`该药品已存在 ${recCount} 条出入库记录，无法直接删除（请先删除相关出入库记录，或将其结存清零后再删）。`, 'error');
      return;
    }
    if (stockOf(code).stock > 0) {
      console.log(`[药品档案] 删除拦截：当前结存为 ${stockOf(code).stock} ${d.unit}`);
      showToast(`该药品当前结存为 ${stockOf(code).stock} ${d.unit}，需先出库清零后再删除。`, 'error');
      return;
    }
    if (await showConfirm(`确认删除药品档案「${d.name}」（${code}）？此操作不可撤销。`)) {
      saveData({ ...data, drugs: data.drugs.filter(x => x.code !== code) });
      console.log(`[药品档案] 删除成功：${d.name} (${code})，仍停留在药品档案页`);
      showToast('删除成功', 'success');
    } else {
      console.log(`[药品档案] 取消删除：${code}`);
    }
  };

  const handleSave = () => {
    const code = formData.code?.trim();
    const action = editingCode ? '编辑' : '新增';
    console.log(`[药品档案] 请求保存药品，模式：${action}，编码：${code || '(空)'}`);
    if (!code) {
      console.log(`[药品档案] 保存失败：编码为空`);
      return showToast('请填写药品编码', 'error');
    }
    
    if (!editingCode && data.drugs.find(x => x.code === code)) {
      console.log(`[药品档案] 保存失败：编码已存在 ${code}`);
      return showToast('编码已存在', 'error');
    }
    
    if ((formData.min || 0) < 0) return showToast('最低库存不能为负', 'error');
    if ((formData.max || 0) < 0) return showToast('最高库存不能为负', 'error');
    if ((formData.opening || 0) < 0) return showToast('期初库存不能为负', 'error');
    if ((formData.price || 0) < 0) return showToast('参考单价不能为负', 'error');

    const obj: Drug = {
      code,
      name: formData.name?.trim() || code,
      manufacturer: formData.manufacturer?.trim() || '',
      cat: formData.cat?.trim() || '',
      spec: formData.spec?.trim() || '',
      unit: formData.unit?.trim() || '盒',
      pos: formData.pos?.trim() || '',
      min: Number(formData.min) || 0,
      max: Number(formData.max) || 0,
      opening: Number(formData.opening) || 0,
      price: Number(formData.price) || 0
    };

    let newDrugs = [...data.drugs];
    if (editingCode) {
      newDrugs = newDrugs.map(d => d.code === editingCode ? obj : d);
    } else {
      newDrugs.push(obj);
    }

    saveData({ ...data, drugs: newDrugs });
    console.log(`[药品档案] 保存成功：${action} ${obj.name} (${code})，仍停留在药品档案页`);
    setModalOpen(false);
    showToast('保存成功', 'success');
  };

  const downloadTemplate = () => {
    const headers = ['药品编码', '药品名称', '生产厂商', '分类', '规格', '单位', '仓位', '最低库存', '最高库存', '期初库存', '参考单价'];
    const sample1 = ['', '布洛芬缓释胶囊', '中美天津史克', '解热镇痛', '0.3g*20粒', '盒', '仓位1', 1000, 5000, 0, 25.00];
    const sample2 = ['', '阿莫西林胶囊', '联邦制药', '抗生素', '0.25g*24粒', '盒', '仓位2', 2000, 5000, 0, 18.50];
    
    const aoa = [headers, sample1, sample2];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "导入模板");
    XLSX.writeFile(wb, "药品档案导入模板.xlsx");
  };

  const handleExport = (type: 'excel' | 'csv') => {
    const headers = ['药品编码', '药品名称', '生产厂商', '分类', '规格', '单位', '仓位', '最低库存', '最高库存', '期初库存', '参考单价'];
    const rows = data.drugs.map(d => [d.code, d.name, d.manufacturer || '', d.cat, d.spec, d.unit, d.pos, d.min, d.max, d.opening, d.price]);
    
    if (type === 'excel') {
      const aoa = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "药品档案");
      XLSX.writeFile(wb, "药品档案.xlsx");
    } else {
      const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '药品档案.csv';
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
        const newDrugs = [...data.drugs];
        let nextMaxCode = parseInt(
          newDrugs.map(d => d.code).filter(c => c.startsWith('A001-')).map(c => parseInt(c.split('-')[1]) || 0).sort((a,b)=>b-a)[0]?.toString() || '0'
        );

        dataArr.forEach((row: any) => {
          const name = (row['药品名称'] || '').toString().trim();
          if (!name) return;
          
          const code = (row['药品编码'] || '').toString().trim();
          // 按药品编码去重（编码是唯一标识符，同名不同规格允许存在）
          if (code && newDrugs.find(d => d.code === code)) {
            skipCount++;
            return;
          }

          nextMaxCode++;
          const finalCode = code || ('A001-' + String(nextMaxCode).padStart(2, '0'));
          
          newDrugs.push({
            code: finalCode,
            name,
            manufacturer: (row['生产厂商'] || '').toString(),
            cat: (row['分类'] || '').toString(),
            spec: (row['规格'] || '').toString(),
            unit: (row['单位'] || '').toString(),
            pos: (row['仓位'] || '').toString(),
            min: Number(row['最低库存']) || 0,
            max: Number(row['最高库存']) || 0,
            opening: Number(row['期初库存']) || 0,
            price: Number(row['参考单价']) || 0
          });
          importedCount++;
        });

        if (importedCount > 0) {
          saveData({ ...data, drugs: newDrugs });
          showToast(`成功导入 ${importedCount} 条记录${skipCount > 0 ? `，跳过已存在 ${skipCount} 条` : ''}。`, 'success');
        } else if (skipCount > 0) {
          showToast(`导入的 ${skipCount} 条记录均已存在，已跳过。`, 'info');
        } else {
          showToast(`未在文件中识别到有效药品数据。`, 'error');
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
        <button className="btn primary" onClick={() => handleOpen()}>＋ 新增药品</button>
        <button className="btn" onClick={downloadTemplate}>⬇ 下载模板</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>⬆ 批量导入</button>
        <button className="btn" onClick={() => handleExport('excel')}>⬇ 导出Excel</button>
        <button className="btn" onClick={() => handleExport('csv')}>⬇ 导出CSV</button>
        <span className="flex-1"></span>
        <span className="tag-soft">共 {data.drugs.length} 种药品</span>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
      </div>
      
      <div className="scroll flex-1 min-h-0 bg-white">
        <table>
          <thead>
            <tr>
              <th>药品编码</th><th>药品名称</th><th>厂商</th><th>分类</th><th>规格</th><th>单位</th><th>仓位</th>
              <th className="num">最低库存</th><th className="num">最高库存</th><th className="num">期初库存</th><th className="num">参考单价</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.drugs.map(d => (
              <tr key={d.code}>
                <td>{d.code}</td><td>{d.name}</td><td>{d.manufacturer || '—'}</td><td>{d.cat}</td>
                <td>{d.spec}</td><td>{d.unit}</td><td>{d.pos}</td>
                <td className="num">{fmt(d.min)}</td><td className="num">{fmt(d.max)}</td>
                <td className="num">{fmt(d.opening)}</td><td className="num">{fmt(d.price)}</td>
                <td>
                  <div className="flex gap-1.5">
                    <button className="btn sm" onClick={() => handleOpen(d.code)}>编辑</button>
                    <button className="btn sm danger" onClick={() => handleDelete(d.code)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} onOk={handleSave} title={`药品档案 ${editingCode ? '编辑' : '新增'}`}>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">药品编码</label>
            <input value={formData.code || ''} readOnly={!!editingCode} style={{color: editingCode ? 'inherit' : 'var(--muted)'}} onChange={e => setFormData({...formData, code: e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">药品名称</label>
            <input value={formData.name || ''} placeholder="如 布洛芬缓释胶囊" onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">生产厂商</label>
            <input value={formData.manufacturer || ''} placeholder="如 中美天津史克" onChange={e => setFormData({...formData, manufacturer: e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">药品分类</label>
            <input value={formData.cat || ''} list="lt_cat" placeholder="或输入新分类" onChange={e => setFormData({...formData, cat: e.target.value})} />
            <datalist id="lt_cat">{data.params.types.map(t => <option key={t} value={t} />)}</datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">规格型号</label>
            <input value={formData.spec || ''} placeholder="如 0.3g*20粒" onChange={e => setFormData({...formData, spec: e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">单位</label>
            <input value={formData.unit || ''} placeholder="盒/瓶/粒" onChange={e => setFormData({...formData, unit: e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">仓位</label>
            <input value={formData.pos || ''} list="lt_pos" placeholder="仓位1" onChange={e => setFormData({...formData, pos: e.target.value})} />
            <datalist id="lt_pos">{data.params.positions.map(t => <option key={t} value={t} />)}</datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">最低库存</label>
            <input type="number" min="0" value={formData.min ?? ''} onChange={e => setFormData({...formData, min: +e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">最高库存</label>
            <input type="number" min="0" value={formData.max ?? ''} onChange={e => setFormData({...formData, max: +e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">期初库存</label>
            <input type="number" min="0" value={formData.opening ?? 0} onChange={e => setFormData({...formData, opening: +e.target.value})} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">参考单价(元)</label>
            <input type="number" min="0" step="0.01" value={formData.price ?? ''} onChange={e => setFormData({...formData, price: +e.target.value})} />
          </div>
        </div>
        <div className="text-[12px] text-[var(--muted)] mt-2 leading-relaxed">
          {!editingCode && '编码由系统按「A001-序号」规则自动生成；'}编码为唯一主键；期初库存用于「期初 + 入库 − 出库 = 结存」计算。
        </div>
      </Modal>
    </div>
  );
}
