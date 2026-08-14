import { AppStateData } from "../types";
import { todayStr } from "../lib/utils";

export function seedData(): AppStateData {
  const drugs: any[] = [
    ['A001-01','布洛芬缓释胶囊','解热镇痛','0.3g*20粒/盒','盒','仓位1',1000,5000,25.0,'中美天津史克'],
    ['A001-02','阿莫西林胶囊','抗生素','0.25g*24粒/盒','盒','仓位2',2000,5000,18.5,'联邦制药'],
    ['A001-03','感冒灵颗粒','感冒用药','10g/袋','袋','仓位3',1000,5000,12.0,'华润三九'],
    ['A001-04','云南白药气雾剂','外用','85g+30g/瓶','瓶','仓位4',4000,8000,42.0,'云南白药'],
    ['A001-05','生理盐水','注射用药','500ml/瓶','瓶','仓位5',5000,9000,3.2,'科伦药业'],
    ['A001-06','碘伏消毒液','外用消毒','500ml/瓶','瓶','仓位1',6000,10000,6.8,'利尔康'],
    ['A001-07','维生素C片','维生素','100mg*100片/瓶','瓶','仓位2',1000,5000,9.5,'东北制药'],
    ['A001-08','创可贴','外用','72片/盒','盒','仓位3',4000,8000,8.0,'云南白药'],
    ['A001-09','蒙脱石散','消化用药','3g/袋','袋','仓位4',2000,6000,15.0,'博福-益普生'],
    ['A001-10','复方甘草片','止咳','100片/瓶','瓶','仓位5',5000,10000,11.0,'太极集团'],
  ].map((d,i)=>({code:d[0],name:d[1],cat:d[2],spec:d[3],unit:d[4],pos:d[5],min:d[6],max:d[7],opening:d[8],price:Number(d[8])||0,manufacturer:d[9]||''}));
  
  const prices=[25,18.5,12,42,3.2,6.8,9.5,8,15,11];
  drugs.forEach((d,i)=>d.price=prices[i]);

  const targets=[120,95,180,140,160,175,110,150,90,130];
  const minArr=[30,25,40,30,35,40,20,30,120,35];
  const maxArr=[200,180,200,180,200,150,180,200,170,200];
  const inbound: any[] = [], outbound: any[] = [];
  const handlers=['稻小壳1','稻小壳2','稻小壳3','稻小壳4','稻小壳5'];
  let id=1;
  
  function seedFEFO(code: string, qty: number){
    const lots=inbound.filter(r=>r.code===code && (r.remaining||0)>0).slice()
      .sort((a,b)=>(a.expDate||'9999').localeCompare(b.expDate||'9999')||(a.date||'').localeCompare(b.date||''));
    let left=qty, hit='';
    for(const lot of lots){ if(left<=0) break; if(!hit) hit=lot.batchNo||''; const t=Math.min(lot.remaining,left); lot.remaining-=t; left-=t; }
    return hit;
  }
  
  drugs.forEach((d,di)=>{
    d.min=minArr[di]; d.max=maxArr[di];
    let totIn=0, totOut=0;
    const mIn=[], mOut=[];
    for(let m=0;m<12;m++){
      const iq=Math.round(6 + (di%3) + m*0.8 + (m===5?8:0) + (di===7?3:0));
      const oq=Math.round(5 + (di%2) + m*0.6 + (m===7?6:0) + (di===2?3:0));
      mIn.push(iq); mOut.push(oq); totIn+=iq; totOut+=oq;
    }
    const demoEx=20, demoNear=30;
    const extraIn=demoEx+demoNear;
    d.opening=Math.max(0, targets[di]-totIn+totOut-extraIn);
    
    for(let m=0;m<12;m++){
      const mm=String(m+1).padStart(2,'0');
      if(mIn[m]>0){
        inbound.push({id:id++,date:`2025-${mm}-08`,code:d.code,name:d.name,manufacturer:d.manufacturer,cat:d.cat,spec:d.spec,unit:d.unit,pos:d.pos,
          qty:mIn[m],price:d.price,handler:handlers[di%5],remark:'月度采购',
          batchNo:`B${di+1}-${mm}`,prodDate:`2025-${mm}-10`,expDate:`2027-${mm}-15`,remaining:mIn[m]});
      }
      if(mOut[m]>0){
        const bno=seedFEFO(d.code, mOut[m]);
        outbound.push({id:id++,date:`2025-${mm}-18`,code:d.code,name:d.name,manufacturer:d.manufacturer,cat:d.cat,spec:d.spec,unit:d.unit,pos:d.pos,
          qty:mOut[m],price:d.price,handler:handlers[(di+2)%5],remark:'门诊领用',dept:'门诊部',recipient:'王芳',batchNo:bno});
      }
    }
    
    inbound.push({id:id++,date:todayStr,code:d.code,name:d.name,manufacturer:d.manufacturer,cat:d.cat,spec:d.spec,unit:d.unit,pos:d.pos,
      qty:demoEx,price:d.price,handler:'演示',remark:'历史积压（演示·过期）',
      batchNo:`B${di+1}-EX`,prodDate:'2025-08-01',expDate:'2025-12-31',remaining:demoEx});
    inbound.push({id:id++,date:todayStr,code:d.code,name:d.name,manufacturer:d.manufacturer,cat:d.cat,spec:d.spec,unit:d.unit,pos:d.pos,
      qty:demoNear,price:d.price,handler:'演示',remark:'近效期（演示）',
      batchNo:`B${di+1}-NE`,prodDate:'2025-10-01',expDate:'2026-10-15',remaining:demoNear});
  });

  return {
    params: {
        types:['解热镇痛','抗生素','感冒用药','外用','注射用药','外用消毒','维生素','消化用药','止咳'],
        positions:['仓位1','仓位2','仓位3','仓位4','仓位5'],
        handlers:handlers,
        depts:['门诊部','住院部','行政部','医务科','药剂科'],
        tax:0.13, closedMonth:''
    },
    drugs, inbound, outbound, discards: []
  };
}
