export interface Drug {
  code: string;
  name: string;
  manufacturer: string;
  cat: string;
  spec: string;
  unit: string;
  pos: string;
  min: number;
  max: number;
  opening: number;
  price: number;
}

export interface InboundRecord {
  id: number;
  date: string;
  code: string;
  name: string;
  manufacturer: string;
  cat: string;
  spec: string;
  unit: string;
  pos: string;
  qty: number;
  price: number;
  handler: string;
  remark: string;
  batchNo: string;
  prodDate: string;
  expDate: string;
  remaining: number;
  discarded?: boolean;
}

export interface OutboundRecord {
  id: number;
  date: string;
  code: string;
  name: string;
  manufacturer: string;
  cat: string;
  spec: string;
  unit: string;
  pos: string;
  qty: number;
  price: number;
  handler: string;
  remark: string;
  dept: string;
  recipient: string;
  batchNo: string;
}

export interface DiscardRecord {
  id: number;
  code: string;
  name: string;
  batchNo: string;
  expDate: string;
  qty: number;
  date: string;
}

export interface AppParams {
  types: string[];
  positions: string[];
  handlers: string[];
  depts: string[];
  tax: number;
  closedMonth: string;
}

export interface AppStateData {
  params: AppParams;
  drugs: Drug[];
  inbound: InboundRecord[];
  outbound: OutboundRecord[];
  discards?: DiscardRecord[];
}
