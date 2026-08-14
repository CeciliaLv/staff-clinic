import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Modal } from '../components/Modal';
import { AppParams } from '../types';

const PARAM_CATS = [
  {key:'types',label:'药品分类',mode:'list'},
  {key:'positions',label:'仓位',mode:'list'},
  {key:'handlers',label:'经办人',mode:'list'},
  {key:'depts',label:'领用部门',mode:'list'},
  {key:'tax',label:'增值税率',mode:'single',hint:'增值税率，用于出入库金额自动计算（含税金额 = 金额×(1+税率)）。'},
  {key:'closedMonth',label:'结账至月份',mode:'single',hint:'设置后该月及之前的出入库记录锁定，用于月结关账；留空则不锁。'}
] as const;

export function Params() {
  const { data, saveData, taxRate, showToast, showConfirm } = useAppStore();
  const [catKey, setCatKey] = useState<keyof AppParams>('types');
  const [query, setQuery] = useState('');
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  
  const [singleVal, setSingleVal] = useState('');

  // Handle single param sync when catKey changes
  React.useEffect(() => {
    if (catKey === 'tax') {
      setSingleVal((taxRate * 100).toFixed(2));
    } else if (catKey === 'closedMonth') {
      setSingleVal(data.params.closedMonth || '');
    }
  }, [catKey, data.params, taxRate]);

  const cat = PARAM_CATS.find(x => x.key === catKey)!;

  const handleDel = async (idx: number) => {
    const v = (data.params[catKey] as string[])[idx];
    console.log(`[参数设置] 请求删除 [${catKey}] 项：${v}，idx=${idx}`);
    if (await showConfirm(`确认删除「${v}」？\n删除后已使用该项的单据仍保留原值。`)) {
      const arr = [...(data.params[catKey] as string[])];
      arr.splice(idx, 1);
      saveData({ ...data, params: { ...data.params, [catKey]: arr } });
      console.log(`[参数设置] 删除完成 [${catKey}]：${v}，当前模块仍为 ${catKey}`);
      showToast('删除成功', 'success');
    } else {
      console.log(`[参数设置] 取消删除 [${catKey}]：${v}`);
    }
  };

  const handleSaveList = () => {
    const v = editVal.trim();
    const action = editIdx != null ? '编辑' : '新增';
    console.log(`[参数设置] 请求保存列表 [${catKey}]，模式：${action}，值：${v || '(空)'}`);
    if (!v) {
      console.log(`[参数设置] 保存失败：名称为空`);
      return showToast(cat.label + '名称不能为空', 'error');
    }
    const arr = data.params[catKey] as string[];
    const exist = arr.some((x, i) => x === v && i !== editIdx);
    if (exist) {
      console.log(`[参数设置] 保存失败：配置已存在 [${catKey}] = ${v}`);
      return showToast('该配置已存在', 'error');
    }
    
    const newArr = [...arr];
    if (editIdx != null) {
      newArr[editIdx] = v;
    } else {
      newArr.push(v);
    }
    
    saveData({ ...data, params: { ...data.params, [catKey]: newArr } });
    console.log(`[参数设置] 保存成功 [${catKey}]：${action} 「${v}」，参数类别仍为 ${catKey}，未触发页面跳转`);
    setModalOpen(false);
    showToast('保存成功', 'success');
  };

  const handleSaveSingle = () => {
    const v = singleVal.trim();
    console.log(`[参数设置] 请求保存单值 [${catKey}]，值：${v || '(空)'}`);
    const newParams = { ...data.params };
    
    if (catKey === 'tax') {
      const n = +v;
      if (isNaN(n) || n < 0 || n > 100) {
        console.log(`[参数设置] 保存失败：税率越界 [tax=${v}]`);
        return showToast('税率须在 0~100 之间', 'error');
      }
      newParams.tax = n / 100;
    } else if (catKey === 'closedMonth') {
      if (v && !/^\d{4}-\d{2}$/.test(v)) {
        console.log(`[参数设置] 保存失败：结账月格式错误 [closedMonth=${v}]`);
        return showToast('格式应为 YYYY-MM', 'error');
      }
      newParams.closedMonth = v;
    }
    
    saveData({ ...data, params: newParams });
    console.log(`[参数设置] 保存成功 [${catKey}]：${v}，参数类别仍为 ${catKey}，未触发页面跳转`);
    showToast('保存成功', 'success');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="card flex-1 min-h-0 flex flex-col">
        <h3>⚙️ 参数设置 <span className="tag">配置参数统一管理</span></h3>

        {cat.mode === 'single' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-[var(--muted)]">{cat.label}</label>
              <div className="flex gap-1.5">
                <input 
                  type={catKey === 'tax' ? 'number' : 'month'} 
                  value={singleVal} 
                  onChange={e => setSingleVal(e.target.value)} 
                  className="flex-1"
                  min="0" max="100" step="0.1"
                />
                <button className="btn primary" onClick={handleSaveSingle}>保存</button>
              </div>
            </div>
            <div className="text-[13px] text-[var(--muted)] self-end pb-2">{cat.hint}</div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 items-end my-3">
              <div className="flex flex-col gap-1 w-[200px] shrink-0">
                <label className="text-[12px] text-[var(--muted)]">参数类别</label>
                <select value={catKey} onChange={e => { setCatKey(e.target.value as keyof AppParams); setQuery(''); }}>
                  {PARAM_CATS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
                <label className="text-[12px] text-[var(--muted)]">查询（按名称过滤）</label>
                <input placeholder="输入关键字查询已有配置…" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <button className="btn primary" onClick={() => { setEditIdx(null); setEditVal(''); setModalOpen(true); }}>
                ＋ 新增{cat.label}
              </button>
            </div>
            
            <div className="text-[13px] text-[var(--muted)] mb-2">
              共 {(data.params[catKey] as string[]).length} 项，匹配 {((data.params[catKey] as string[]).filter(v => v.includes(query.trim()))).length} 项
            </div>
            
            <div className="scroll flex-1 min-h-0 bg-white">
              <table>
                <thead>
                  <tr><th className="w-[60px]">#</th><th>配置项</th><th className="w-[170px]">操作</th></tr>
                </thead>
                <tbody>
                  {((data.params[catKey] as string[])).map((v, i) => ({ v, i })).filter(o => o.v.includes(query.trim())).length === 0 ? (
                    <tr><td colSpan={3} className="text-center text-[var(--muted)] py-4">无匹配配置项</td></tr>
                  ) : (
                    ((data.params[catKey] as string[])).map((v, i) => ({ v, i })).filter(o => o.v.includes(query.trim())).map((o, idx) => (
                      <tr key={o.i}>
                        <td>{idx + 1}</td>
                        <td>{o.v}</td>
                        <td>
                          <div className="flex gap-1.5">
                            <button className="btn sm" onClick={() => { setEditIdx(o.i); setEditVal(o.v); setModalOpen(true); }}>编辑</button>
                            <button className="btn sm danger" onClick={() => handleDel(o.i)}>删除</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
        
        <div className="text-[12px] text-[var(--muted)] mt-2.5">
          列表型参数（分类 / 仓位 / 经办人 / 领用部门）支持查询、新增、编辑、删除；单值参数（税率 / 结账月）在上方直接修改保存。修改后即时生效。
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} onOk={handleSaveList} title={`${editIdx != null ? '修改' : '新增'}${cat.label}`}>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[var(--muted)]">{cat.label}名称</label>
          <input value={editVal} placeholder={`请输入${cat.label}`} onChange={e => setEditVal(e.target.value)} autoFocus />
        </div>
      </Modal>
    </div>
  );
}
