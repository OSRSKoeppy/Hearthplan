'use strict';
const BOOK = new Map(POH_DATA.rooms.map(room => [room.id, room]));
const STORE = 'hearthplan-house-v1';
const FLOORS = {ground:'Ground floor',upper:'Upper floor',dungeon:'Dungeon'};
const BOARD_SIZE = 7;
const MAX_ROOMS = 38;
const freshId = () => globalThis.crypto?.randomUUID?.() || 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2);
const freshRoom = (type,x,y,floor='ground') => ({id:freshId(),type,x,y,floor,rotation:0,built:false,items:{}});
const roomDef = room => BOOK.get(room.type);
const slotDef = (room,slot) => roomDef(room).hotspots.find(h => h.name === slot);
const itemDef = (room,slot) => slotDef(room,slot)?.options.find(o => o.name === room.items[slot]?.name);
const allowedFloor = (def,floor) => !def.floors || def.floors.includes(floor);
function stages(option) { return Array.isArray(option?.stages) ? option.stages : []; }
function priorOptions(option,hotspot) {
  if(!option)return [];
  const names=stages(option).map(s=>s.name).filter(name=>name!==option.name);
  if(option.name==='Occult altar')names.push('Dark altar','Lunar altar');
  return hotspot.options.filter(o=>names.includes(o.name));
}
function altarRoutes(option,hotspot){
  if(option.name!=='Occult altar')return [];
  return ['Ancient altar','Lunar altar','Dark altar'].map(name=>hotspot.options.find(o=>o.name===name)).filter(Boolean);
}
function buildSteps(option,item,hotspot){
  const path=stages(option);
  if(!path.length)return [option];
  const first=altarRoutes(option,hotspot).find(o=>o.name===(item.route||item.base));
  if(!first||first.name===path[0].name)return path;
  const additional=Object.entries(option.materials)
    .map(([name,qty])=>[name,qty-(first.materials[name]||0)])
    .filter(([,qty])=>qty>0);
  return [first,{name:option.name,materials:Object.fromEntries(additional)}];
}
function completedSteps(item,steps){
  return item.built?steps.length:steps.findIndex(step=>step.name===item.base)+1;
}
function markBuildStep(item,steps,name,checked){
  const index=steps.findIndex(step=>step.name===name);
  if(index<0)return;
  const count=checked?index+1:index;
  item.built=count===steps.length;
  const base=steps[Math.min(count,steps.length-1)-1];
  if(base)item.base=base.name;
  else delete item.base;
}
function portalCapacity(room,slot) {
  const opt=itemDef(room,slot);
  if (!opt || !roomDef(room).teleports?.length) return 0;
  if (Number.isInteger(opt.capacity)) return opt.capacity;
  if (room.type==='portal-chamber' && /portal/.test(opt.name.toLowerCase())) return 1;
  if (room.type==='portal-nexus' && /nexus/i.test(opt.name)) return /crystalline/i.test(opt.name)?roomDef(room).teleports.length:/gilded/i.test(opt.name)?8:4;
  return 0;
}
function starter() {
  const rooms=[];
  const layout=[
    ['parlour',2,2,['Oak armchair','Oak bookcase','Brown rug','Clay fireplace']],
    ['kitchen',3,2,['Oak larder','Oak kitchen table','Firepit','Pump and drain']],
    ['chapel',4,2,['Gilded altar','Marble incense burners','Saradomin icon','Large statue','Opulent rug','Stained glass']],
    ['garden',2,3,['Exit portal','Oak tree','Fern','Plant','Tree']],
    ['superior-garden',3,3,['Restoration pool','Topiary bush','Teak garden bench','Zen theme']],
    ['portal-chamber',4,3,['Teak portal','Teleport focus']]
  ];
  for (const [type,x,y,choices] of layout) {
    const def=BOOK.get(type);
    if (!def) continue;
    const room=freshRoom(type,x,y);
    if(type==='chapel'||type==='portal-chamber')room.rotation=1;
    for (const h of def.hotspots) {
      const match=choices.map(n=>h.options.find(o=>o.name.toLowerCase()===n.toLowerCase())).find(Boolean);
      if (match) room.items[h.name]={name:match.name,built:false};
    }
    rooms.push(room);
  }
  return {version:1,name:'Example house',style:'limestone',rooms};
}
function validPlan(raw) {
  if (!raw || raw.version!==1 || !Array.isArray(raw.rooms) || raw.rooms.length>MAX_ROOMS || typeof raw.name!=='string') throw Error('Choose a Hearthplan plan file (version 1).');
  const used=new Set(), ids=new Set();
  const rooms=raw.rooms.map(r=>{
    const def=BOOK.get(r.type);
    const pos=[r.floor,r.x,r.y].join(',');
    if (!def || !Object.hasOwn(FLOORS,r.floor) || !allowedFloor(def,r.floor) || ![r.x,r.y].every(n=>Number.isInteger(n)&&n>=0&&n<BOARD_SIZE) || used.has(pos) || !r.id || typeof r.id!=='string' || r.id.length>120 || ids.has(r.id)) throw Error('This plan has an invalid room or overlapping coordinates.');
    used.add(pos); ids.add(r.id);
    const room={id:r.id.slice(0,120),type:def.id,x:r.x,y:r.y,floor:r.floor,rotation:[0,1,2,3].includes(r.rotation)?r.rotation:0,built:r.built===true,items:{}};
    for (const [slot,item] of Object.entries(r.items||{})) {
      const opt=def.hotspots.find(h=>h.name===slot)?.options.find(o=>o.name===item?.name);
      if (!opt) throw Error('This plan contains a furniture choice outside the current catalog.');
      const next=room.items[slot]={name:opt.name,built:item.built===true};
      const hotspot=slotDef(room,slot);
      if (altarRoutes(opt,hotspot).some(s=>s.name===item.route)) next.route=item.route;
      if (buildSteps(opt,next.route?next:item,hotspot).slice(0,-1).some(s=>s.name===item.base)) next.base=item.base;
      if (item.dest?.length) {
        if (!Array.isArray(item.dest)||item.dest.length>portalCapacity(room,slot)||new Set(item.dest.map(d=>d.name)).size!==item.dest.length||!item.dest.every(d=>def.teleports?.some(t=>t.name===d.name))) throw Error('This plan contains an incompatible teleport destination.');
        next.dest=item.dest.map(d=>({name:d.name,built:d.built===true}));
      }
    }
    return room;
  });
  const style=window.POH_LOCATIONS?.styles?.some(s=>s.id===raw.style)?raw.style:'cedar';
  return {version:1,name:raw.name.trim().slice(0,60)||'My house',style,rooms};
}
function summarize(plan) {
  const byMaterial=new Map();
  let fees=0,feesLeft=0,done=0,entries=0;
  function tally(materials,built) {
    for (const [name,qty] of Object.entries(materials)) {
      const row=byMaterial.get(name)||{name,all:0,left:0,unit:POH_PRICES.get(name)};
      row.all+=qty; if(!built)row.left+=qty; byMaterial.set(name,row);
    }
  }
  for (const room of plan.rooms) {
    const def=roomDef(room);
    fees+=def.fee; if (!room.built) feesLeft+=def.fee;
    entries++; if (room.built) done++;
    for (const [slot,item] of Object.entries(room.items)) {
      const opt=itemDef(room,slot);
      if (!opt) continue;
      const steps=buildSteps(opt,item,slotDef(room,slot));
      const complete=completedSteps(item,steps);
      entries+=steps.length;
      done+=complete;
      steps.forEach((step,index)=>tally(step.materials,index<complete));
      for (const d of item.dest||[]) {
        const tp=def.teleports?.find(t=>t.name===d.name);
        if (!tp) continue;
        entries++; if (d.built) done++;
        tally(tp.materials,d.built);
      }
    }
  }
  const rows=Array.from(byMaterial.values()).sort((a,b)=>a.name.localeCompare(b.name));
  const sum=k=>rows.reduce((v,r)=>v+(r.unit??0)*r[k],0);
  const unpriced=k=>rows.filter(r=>r.unit==null&&r[k]>0).length;
  return {fees,feesLeft,rows,furniture:sum('all'),total:fees+sum('all'),left:feesLeft+sum('left'),unknown:unpriced('all'),leftUnknown:unpriced('left'),done,entries};
}
