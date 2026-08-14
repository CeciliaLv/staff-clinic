import React, { useState } from 'react';
import { useAppStore } from '../store';
import { fmt } from '../lib/utils';
import { InboundRecord, OutboundRecord } from '../types';

export function Query() {
  const { data, amt, showToast } = useAppStore();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [sDate, setSDate] = useState('2025-01-01');
  const [eDate, setEDate] = useState('2026-12-31');

  const [hasQueried, setHasQueried] = useState(false);
  const [ins, setIns] = useState<InboundRecord[]>([]);
  const [outs, setOuts] = useState<OutboundRecord[]>([]);

  const handleQuery = (reset?: boolean) => {
    const qCode = reset ? '' : code.trim();
    const qName = reset ? '' : name.trim().toLowerCase();
    const qsDate = reset ? '2025-01-01' : sDate;
    const qeDate = reset ? '2026-12-31' : eDate;

    if (reset) {
      setCode(''); setName(''); setSDate('2025-01-01'); setEDate('2026-12-31');
    }

    if (qCode && !data.drugs.find(x => x.code === qCode)) {
      return showToast('无此药品编码', 'error');
    }

    const fil = (r: any) => {
      if (qCode && r.code !== qCode) return false;
      if (qName && !(r.name || '').toLowerCase().includes(qName)) return false;
      if (r.date < qsDate || r.date > qeDate) return false;
      return true;
    };

    setIns(data.inbound.filter(fil).slice().sort((a, b) => a.date < b.date ? -1 : 1));
    setOuts(data.outbound.filter(fil).slice().sort((a, b) => a.date < b.date ? -1 : 1));
    setHasQueried(true);
  };

  const ti = ins.reduce((x, r) => x + Number(r.qty), 0);
  const to = outs.reduce((x, r) => x + Number(r.qty), 0);
  const ri = ins.reduce((x, r) => x + amt(r.qty, r.price).total, 0);
  const ro = outs.reduce((x, r) => x + amt(r.qty, r.price).total, 0);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="card mb-4 shrink-0">
        <h3>🔍 出入库明细查询</h3>
        <div className="flex flex-wrap gap-3 items-end mb-2">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">药品编码</label>
            <input list="q_l" placeholder="如 A001-02" value={code} onChange={e => setCode(e.target.value)} />
            <datalist id="q_l">{data.drugs.map(d => <option key={d.code} value={d.code} />)}</datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">药品名称</label>
            <input list="q_nl" placeholder="如 布洛芬" value={name} onChange={e => setName(e.target.value)} />
            <datalist id="q_nl">{data.drugs.map(d => <option key={d.name} value={d.name} />)}</datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">开始日期</label>
            <input type="date" value={sDate} onChange={e => setSDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--muted)]">截止日期</label>
            <input type="date" value={eDate} onChange={e => setEDate(e.target.value)} />
          </div>
          <button className="btn primary" onClick={() => handleQuery()}>查询</button>
          <button className="btn ghost" onClick={() => handleQuery(true)}>重置</button>
        </div>
        <div className="text-[12px] text-[var(--muted)] mt-2">支持按「编码 / 名称 + 日期区间」检索，左右对照展示入库与出库流水及合计。编码、名称可只填其一，留空则检索全部。</div>
      </div>
      
      {!hasQueried ? (
        <div className="card text-center text-[var(--muted)] py-[30px]">🔍 请输入药品编码（或留空查全部）并点击「查询」。</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
          <div className="card flex flex-col min-h-0">
            <h3>
              <span className="flex items-center gap-2">
                <span className="badge b-in">入库</span> {code || name || '全部'} 
              </span>
              <span className="tag">合计 {fmt(ti)} · 含税 ¥{fmt(ri)}</span>
            </h3>
            <div className="scroll flex-1 min-h-0 bg-white">
              <table>
                <thead>
                  <tr><th>日期</th><th>编码</th><th>名称</th><th>厂商</th><th>仓位</th><th className="num">数量</th><th>经办人</th></tr>
                </thead>
                <tbody>
                  {ins.length === 0 ? <tr><td colSpan={7} className="text-center text-[var(--muted)] py-4">无</td></tr> : 
                    ins.map(r => (
                      <tr key={r.id}>
                        <td>{r.date}</td><td>{r.code}</td><td>{r.name}</td><td>{r.manufacturer || '—'}</td><td>{r.pos}</td>
                        <td className="num">{fmt(r.qty)}</td><td>{r.handler}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="card flex flex-col min-h-0">
            <h3>
              <span className="flex items-center gap-2">
                <span className="badge b-out">出库</span> {code || name || '全部'} 
              </span>
              <span className="tag">合计 {fmt(to)} · 含税 ¥{fmt(ro)}</span>
            </h3>
            <div className="scroll flex-1 min-h-0 bg-white">
              <table>
                <thead>
                  <tr><th>日期</th><th>编码</th><th>名称</th><th>厂商</th><th>仓位</th><th className="num">数量</th><th>领用部门</th><th>领用人</th><th>经办人</th></tr>
                </thead>
                <tbody>
                  {outs.length === 0 ? <tr><td colSpan={9} className="text-center text-[var(--muted)] py-4">无</td></tr> : 
                    outs.map(r => (
                      <tr key={r.id}>
                        <td>{r.date}</td><td>{r.code}</td><td>{r.name}</td><td>{r.manufacturer || '—'}</td><td>{r.pos}</td>
                        <td className="num">{fmt(r.qty)}</td><td>{r.dept || '—'}</td><td>{r.recipient || '—'}</td><td>{r.handler}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
