'use strict';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n);
const compact=n=>n>=1000000?number(n/1000000)+'m':n>=1000?number(n/1000)+'k':number(n);
const hp=(tag,value)=>' data-'+tag+'="'+esc(value)+'"';
const button=(label,act,classes='neutral',symbol='')=>'<button class="'+classes+'" data-action="'+act+'">'+(symbol?icon(symbol):'')+esc(label)+'</button>';
const square=(label,act,symbol)=>'<button class="square" data-action="'+act+'" aria-label="'+esc(label)+'" title="'+esc(label)+'">'+icon(symbol)+'</button>';

const artIds=Object.fromEntries(Object.entries(POH_SPRITES.index).map(([kind,ids])=>[kind,new Map(Object.entries(ids).map(([name,id])=>[name.toLowerCase(),id]))]));
function thumb(name,kind='room',slot=''){
  const cls=kind==='room'?'room-thumb':'item-thumb';
  const id=artIds[kind]?.get(name.toLowerCase()),img=POH_SPRITES.images[id];
  if(img)return '<span class="'+cls+'"><img alt="" src="data:image/png;base64,'+img+'"></span>';
  return '<span class="'+cls+'"><canvas aria-hidden="true"'+hp('art',kind)+hp('name',name)+hp('slot',slot)+hp('type',kind==='room'?([...BOOK.values()].find(def=>def.name===name)?.id||''):(room()?.type||''))+'></canvas></span>';
}
const checkbox=(checked,label,attrs)=>'<input type="checkbox" class="check" aria-label="'+esc(label)+'" title="'+esc(label)+'" '+(checked?'checked ':'')+attrs+'>';

function paint(scope=document){
  for(const c of scope.querySelectorAll('canvas[data-art]')){
    if(c.dataset.painted||!c.clientWidth||!c.clientHeight)continue;
    if((c.dataset.art==='furniture'||c.dataset.art==='room')&&window.POHWorld?.drawThumbnail(c,{kind:c.dataset.art,roomType:c.dataset.type,slot:c.dataset.slot,name:c.dataset.name})){
      c.dataset.painted='true';
    }else{
      const label=document.createElement('span');label.className='unavailable';label.title='No icon available';label.textContent='·';c.replaceWith(label);
    }
  }
}
let plan,saveOk=true,loadWarning='';
try{const raw=localStorage.getItem(STORE);plan=raw?validPlan(JSON.parse(raw)):starter();}
catch{plan=starter();loadWarning='Your saved plan could not be loaded. The example house is open.';}
let floor='ground',selected=plan.rooms.find(r=>r.type==='chapel'&&r.floor===floor)?.id||plan.rooms.find(r=>r.floor===floor)?.id;
let view='planner', mode=null,scope='left',checkFilter='all',activeSlot=null,modalTile=null,refreshing=false,priceName='',noticeTimer;
const closedGroups=new Set();
const room=()=>plan.rooms.find(r=>r.id===selected);

const dialog=$('#dialog'), dialogBody=$('#dialog-content');
const previousFocus=[];
function notify(message){$('#notice').textContent=message;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').textContent='',4200);}
function persist(){try{localStorage.setItem(STORE,JSON.stringify(plan));saveOk=true;}catch{saveOk=false;notify('Browser storage is unavailable. Export your plan to keep a copy.');}}
function changed(){persist();render();}
function dialogShow(title,html){
  dialog.classList.remove('build-picker');
  if(!dialog.open)previousFocus.push(document.activeElement);
  dialogBody.innerHTML='<div class="dialog-head"><h2 id="dialog-title">'+esc(title)+'</h2>'+square('Close dialog','close','close')+'</div><div class="dialog-body">'+html+'</div>';
  dialog.setAttribute('aria-labelledby','dialog-title');
  if(!dialog.open)dialog.showModal();
  paint(dialogBody);
}
function closeDialog(){if(dialog.open)dialog.close();buildChoice=null;}
dialog.addEventListener('close',()=>{buildChoice=null;const last=previousFocus.pop();if(last?.isConnected)last.focus({preventScroll:true});});
dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeDialog();}});
const VIEWS={planner:['House builder','Build your player-owned house.','layout'],rooms:['Room builder','Lay out your rooms, then enter a room to furnish it.','home'],checklist:['Build checklist','Check off the rooms and furniture you have built in game.','checklist'],supplies:['Supplies','See what to buy and how much gold to set aside for your house.','supplies']};
function navTo(v){if(!VIEWS[v])v='planner';if(location.hash==='#'+v){view=v;render();}else location.hash=v;}
function render(){
  view=Object.hasOwn(VIEWS,location.hash.slice(1))?location.hash.slice(1):'planner';
  const [name,blurb]=VIEWS[view];
  $('#page-title').textContent=name;$('#subtitle').textContent=blurb;
  $('#navigation').innerHTML=Object.entries(VIEWS).map(([id,[title,,symbol]])=>'<a href="#'+id+'" '+(view===id?'class="active" aria-current="page"':'')+'>'+icon(symbol)+title+'</a>').join('');
  $('#save-state').innerHTML=icon('save')+(saveOk?'Saved locally':'Unsaved');
  $('#headline-action').innerHTML=view==='supplies'?icon('export')+'Export supplies':view==='rooms'?icon('layout')+'Go to house':icon('layout')+'House builder';
  $('#planner').hidden=view!=='planner';
  $('#room-builder').hidden=view!=='rooms';
  $('#detail').hidden=view==='planner'||view==='rooms';
  $('#detail-heading').hidden=view==='planner';
  $('#plan-name').textContent=plan.name;
  const summary=summarize(plan);
  if(view==='planner'){renderInspector();syncScene();}
  else if(view==='rooms')renderRoomBuilder();
  else if(view==='checklist')renderChecklist(summary);
  else renderSupplies(summary);
  renderMetrics(summary);paint();
}
function roomRow(def,action){
  return '<button class="room-row'+(mode?.type===def.id?' chosen':'')+'" data-action="'+action+'"'+hp('type',def.id)+'>'+thumb(def.name)+'<span><strong>'+esc(def.name)+'</strong><span class="meta">Lvl '+def.level+' <b>·</b> '+compact(def.fee)+' gp</span></span></button>';
}
function libraryRooms(query){
  return [...BOOK.values()].filter(d=>allowedFloor(d,floor)&&d.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name));
}

function renderInspector(){drawSide();}
function setFloor(value){
  floor=value;mode=null;selected=plan.rooms.find(r=>r.floor===floor)?.id;render();
}
function openRooms(tile=null){
  if(plan.rooms.length>=MAX_ROOMS){notify('Your plan has reached the 38-room limit.');return;}
  modalTile=tile;
  dialogShow('Room Creation Menu','<label class="search">'+icon('search')+'<input type="search" id="dialog-search" aria-label="Search room library" placeholder="Find a room"></label><div class="dialog-list" id="room-options"></div>');
  function filter(){const defs=libraryRooms($('#dialog-search').value);$('#room-options').innerHTML=defs.map(d=>roomRow(d,'pick-room')).join('')||'<p class="empty-note">No matching rooms on this floor.</p>';paint($('#room-options'));}
  filter();$('#dialog-search').oninput=filter;$('#dialog-search').focus();
}

function chooseRoom(type,tile=null){
  if(tile){previewRoom(type,tile);return;}
  mode={type};enableBuilding();floorPlan();
}
function materialsLine(mats){return Object.entries(mats||{}).map(([n,q])=>number(q)+' × '+n).join(' · ')||'No consumable materials';}
function openSlot(slot){showBuildMenu(slot);}
function pickItem(name){
  const r=room(),slot=activeSlot,old=r.items[slot];
  if(old?.name!==name){
    const opt=slotDef(r,slot).options.find(o=>o.name===name);
    const next={name,built:false},base=old?.built?old.name:old?.base;
    if(priorOptions(opt,slotDef(r,slot)).some(s=>s.name===base))next.base=base;
    r.items[slot]=next;
    if(old?.dest&&portalCapacity(r,slot)>0&&stages(opt).some(s=>s.name===old.name))next.dest=old.dest.slice(0,portalCapacity(r,slot));
    addMessage('You build '+name.toLowerCase()+' in the '+roomDef(r).name.toLowerCase()+'.');
    changed();
    world?.buildAt?.({roomId:r.id,slot});
  }
  closeDialog();
}
function destinations(){
  const r=room(),slot=activeSlot,item=r.items[slot],def=roomDef(r),cap=portalCapacity(r,slot);
  if(!cap)return;
  const selectedDest=item.dest||[];
  dialogShow('Teleport destinations','<p style="margin-bottom:12px">'+esc(item.name)+' · '+selectedDest.length+' of '+cap+' destinations</p><div class="dialog-list">'+def.teleports.map(t=>{
    const on=selectedDest.some(d=>d.name===t.name);
    return '<label class="check-line"><input class="check" type="checkbox" data-destination="'+esc(t.name)+'" '+(on?'checked':selectedDest.length>=cap?'disabled':'')+'><span><strong>'+esc(t.name)+'</strong><span class="meta" style="display:block">'+esc(materialsLine(t.materials))+'</span></span></label>';
  }).join('')+'</div><div class="dialog-actions">'+button('Done','close','primary')+'</div>');
}

function renderMetrics(s){
  const entries=[['Room fees',s.fees,'Hammer',0],['Furniture',s.furniture,'Oak plank',s.unknown],['Full build',s.total,'Coins',s.unknown],['Still needed',s.left,'Coins',s.leftUnknown]];
  $('#metrics').innerHTML=entries.map(([label,value,art,missing])=>'<div class="metric"><span class="metric-icon">'+thumb(art,'item')+'</span><div><small>'+label+'</small><strong>'+number(value)+'</strong><em>gp</em>'+(missing?'<span class="missing">+ '+missing+' unpriced</span>':'')+'</div></div>').join('');
}
function segment(opts,active,action){
  return '<div class="segmented">'+opts.map(([key,label])=>'<button data-action="'+action+'"'+hp('value',key)+' class="'+(key===active?'on':'')+'" aria-pressed="'+(key===active)+'">'+label+'</button>').join('')+'</div>';
}
function checkLine(checked,title,detail,attrs){
  if(checkFilter==='remaining'&&checked)return '';
  return '<label class="check-line'+(checked?' done':'')+'">'+checkbox(checked,title+' built',attrs)+'<span class="check-name">'+esc(title)+'</span><span class="meta">'+esc(detail)+'</span></label>';
}
function upgradeChecklist(r,slot,inDialog=false){
  const item=r.items[slot],option=itemDef(r,slot),hotspot=slotDef(r,slot);
  const steps=buildSteps(option,item,hotspot);
  if(steps.length<2)return '';
  const complete=completedSteps(item,steps);
  const attrs=hp('room',r.id)+hp('slot',slot);
  const lines=steps.map((step,index)=>{
    const checked=index<complete;
    if(!inDialog&&checkFilter==='remaining'&&checked)return '';
    return '<label class="upgrade-step'+(checked?' done':'')+'">'+checkbox(checked,step.name+' built',attrs+hp('stage',step.name))+
      '<span><strong>'+esc(step.name)+'</strong><small>'+esc(materialsLine(step.materials))+'</small></span></label>';
  }).join('');
  if(!lines)return '';
  const routes=altarRoutes(option,hotspot);
  const routePicker=routes.length?'<label class="upgrade-route">Starting altar <select '+attrs+' data-stage-route>'+routes.map(first=>'<option '+(steps[0].name===first.name?'selected':'')+'>'+esc(first.name)+'</option>').join('')+'</select></label>':'';
  return '<fieldset class="upgrade-list"><legend>'+esc(option.name)+' · '+complete+' / '+steps.length+' steps</legend>'+routePicker+lines+'</fieldset>';
}
function renderChecklist(s){
  const groups=plan.rooms.map(r=>{
    const def=roomDef(r),attr=hp('room',r.id);
    let lines=checkLine(r.built,'Build room',number(def.fee)+' gp',attr);
    for(const [slot,it] of Object.entries(r.items)){
      if(stages(itemDef(r,slot)).length>1)lines+=upgradeChecklist(r,slot);
      else lines+=checkLine(it.built,it.name,slot,attr+hp('slot',slot));
      for(const d of it.dest||[])lines+=checkLine(d.built,d.name,slot+' teleport',attr+hp('slot',slot)+hp('dest',d.name));
    }
    return lines?'<details class="check-group"'+hp('group',r.id)+(closedGroups.has(r.id)?'':' open')+'><summary>'+thumb(def.name)+'<strong>'+esc(def.name)+'</strong><span class="meta">'+FLOORS[r.floor]+' · '+(r.x+1)+', '+(r.y+1)+'</span>'+icon('chevronDown')+'</summary>'+lines+'</details>':'';
  }).join('');
  $('#detail').innerHTML='<div class="panel detail-panel"><div class="detail-toolbar"><p><strong>'+s.done+' / '+s.entries+'</strong> builds completed</p>'+segment([['all','All builds'],['remaining','Remaining']],checkFilter,'filter-check')+'</div>'+(groups||'<p class="empty-note">'+(s.entries?'All planned builds are complete.':'Add a room and choose furniture to start your checklist.')+'</p>')+'</div>';
  $('#detail').querySelectorAll('details').forEach(d=>{d.ontoggle=()=>{if(d.isConnected){if(d.open)closedGroups.delete(d.dataset.group);else closedGroups.add(d.dataset.group);}};});
}
function renderSupplies(s){
  const rows=s.rows.filter(r=>r[scope]>0),fees=scope==='all'?s.fees:s.feesLeft;
  const priceInfo=POH_PRICES.info();
  $('#detail').innerHTML='<div class="panel detail-panel"><div class="detail-toolbar"><p><strong>'+rows.length+'</strong> material types · Room fees '+number(fees)+' gp</p>'+segment([['left','Still needed'],['all','Whole plan']],scope,'scope')+'</div><div class="table-scroll"><table class="supplies-table"><thead><tr><th>Material</th><th>Quantity</th><th>Unit price (gp)</th><th>Subtotal (gp)</th></tr></thead><tbody>'+
    rows.map(r=>'<tr><td><span class="material-name">'+thumb(r.name,'item')+esc(r.name)+'</span></td><td>'+number(r[scope])+'</td><td><button class="price-button" data-action="price"'+hp('name',r.name)+' aria-label="Edit price for '+esc(r.name)+'">'+(r.unit==null?'Set price':number(r.unit))+'</button></td><td>'+(r.unit==null?'Unpriced':number(r.unit*r[scope]))+'</td></tr>').join('')+'</tbody></table></div>'+
    (rows.length?'':'<p class="empty-note">No materials needed for this selection.</p>')+'<div class="detail-foot"><span>'+esc(priceInfo)+' · Select a unit price to edit.</span><button class="neutral" data-action="refresh" '+(refreshing?'disabled':'')+'>'+icon('refresh')+(refreshing?'Refreshing…':'Refresh prices')+'</button></div></div>';
}
function download(filename,text,type) {
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');
  a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
const fileName=()=>plan.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'house';
function csv(){
  const s=summarize(plan),lines=[['Material','Full quantity','Remaining quantity','Unit price (gp)','Full estimate (gp)','Remaining estimate (gp)']];
  for(const r of s.rows)lines.push([r.name,r.all,r.left,r.unit??'Unpriced',r.unit==null?'Unpriced':r.all*r.unit,r.left===0?0:r.unit==null?'Unpriced':r.left*r.unit]);
  lines.push(['Room fees','','','',s.fees,s.feesLeft],['Total priced costs','','','',s.total,s.left],['Unpriced material types','','','',s.unknown,s.leftUnknown]);
  download(fileName()+'-supplies.csv','\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
function planMenu(){
  dialogShow('House options','<label class="field">House name<input id="rename" maxlength="60" value="'+esc(plan.name)+'"></label>'+styleField()+'<div class="menu-list">'+button('Export plan file','export-plan','','export')+button('Import plan file','import-plan','','upload')+button('Export shopping list (CSV)','csv','','ledger')+button('Start an empty house','new-plan','','home')+button('Open the example house','demo-plan','','layout')+'</div>');
  $('#rename').onchange=e=>{plan.name=e.target.value.trim().slice(0,60)||'My house';e.target.value=plan.name;changed();};
}
function confirmAction(title,body,action,label,danger=false){
  dialogShow(title,'<p>'+esc(body)+'</p><div class="dialog-actions">'+button('Cancel','close','neutral')+button(label,action,danger?'danger-button':'primary')+'</div>');
}
function priceEditor(name) {
  priceName=name;
  const current=POH_PRICES.get(name),source=POH_PRICES.source(name),shop=POH_PRICES.shopPrice(name);
  dialogShow('Unit price','<p style="margin-bottom:14px"><strong>'+esc(name)+'</strong> · '+esc(source)+'</p><form id="price-form"><label class="field">Gold pieces per unit<input type="number" id="new-price" min="0" max="9007199254740991" step="1" required value="'+(current??'')+'"></label>'+
    (shop!=null?'<p>Base shop price: '+number(shop)+' gp.</p>':'')+
    '<p>Use 0 for supplies you will gather yourself.</p><div class="dialog-actions"><button type="button" class="neutral" data-action="reset-price">Use default</button><button class="primary">Save price</button></div></form>');
  $('#price-form').onsubmit=e=>{e.preventDefault();try{POH_PRICES.set(name,Number($('#new-price').value));closeDialog();render();}catch(error){notify(error.message);}};
}
let toImport=null;
$('#import-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{
    if(file.size>2_000_000)throw Error('Choose a plan file smaller than 2 MB.');
    toImport=validPlan(JSON.parse(await file.text()));
    confirmAction('Open imported plan?','Replace the current layout with “'+toImport.name+'” ('+toImport.rooms.length+' rooms)? Export your current plan first if you want to keep a copy.','confirm-import','Open plan');
  }catch(error){toImport=null;notify(error instanceof SyntaxError?'This file is not valid plan JSON.':error.message);}
};
function replacePlan(next){plan=next;floor=next.rooms[0]?.floor||'ground';selected=next.rooms[0]?.id;mode=null;closeDialog();changed();navTo('planner');requestAnimationFrame(focusSelection);}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button[data-action]');if(!b)return;
  const d=b.dataset,r=room();
  switch(d.action){
    case 'close':closeDialog();break;
    case 'pick-room':chooseRoom(d.type,modalTile);modalTile=null;break;
    
    case 'cancel-mode':mode=null;render();break;
    case 'rotate':r.rotation=(r.rotation+1)%4;addMessage('You rotate the '+roomDef(r).name.toLowerCase()+' clockwise.');changed();break;
    case 'move':enableBuilding();mode={move:true,movingId:r.id};render();floorPlan();break;
    case 'remove':confirmAction('Remove '+roomDef(r).name+'?','This removes the room and its planned furniture from your house.','confirm-remove','Remove room',true);break;
    case 'confirm-remove':plan.rooms=plan.rooms.filter(x=>x.id!==selected);selected=plan.rooms.find(x=>x.floor===floor)?.id;mode=null;closeDialog();changed();break;
    case 'edit-slot':if(!building){notify('Turn on building mode to change furniture.');break;}openSlot(d.slot);break;
    case 'pick-item':pickItem(d.option);break;
    case 'clear-slot':delete r.items[activeSlot];closeDialog();changed();break;
    case 'destinations':destinations();break;
    case 'scope':scope=d.value;render();break;
    case 'filter-check':checkFilter=d.value;render();break;
    case 'price':priceEditor(d.name);break;
    case 'reset-price':POH_PRICES.set(priceName,null);closeDialog();render();break;
    case 'refresh':
      refreshing=true;render();
      try{await POH_PRICES.refresh();notify('GE prices refreshed.');}
      catch{notify('Price feed unavailable. Your saved prices are still in use.');}
      finally{refreshing=false;render();}break;
    case 'csv':csv();closeDialog();break;
    case 'export-plan':download(fileName()+'.hearthplan.json',JSON.stringify(plan,null,2),'application/json');closeDialog();break;
    case 'import-plan':$('#import-file').click();break;
    case 'confirm-import':if(toImport){replacePlan(toImport);toImport=null;}break;
    case 'new-plan':confirmAction('Start an empty house?','This replaces your current plan. Export it first to keep a copy.','confirm-new','Start empty',true);break;
    case 'demo-plan':confirmAction('Open example house?','This replaces the current plan with a furnished six-room example. Export your current plan first to keep a copy.','confirm-demo','Open example');break;
    case 'confirm-demo':{const demo=starter();replacePlan(demo);const chapel=demo.rooms.find(r=>r.type==='chapel');if(chapel)selectSceneRoom(chapel.id,true);break;}
    case 'confirm-new':replacePlan({version:1,name:'My house',rooms:[]});break;
  }
});
document.addEventListener('change',e=>{
  const d=e.target.dataset;
  if(d.destination){
    const item=room().items[activeSlot];item.dest??=[];
    if(e.target.checked&&item.dest.length<portalCapacity(room(),activeSlot))item.dest.push({name:d.destination,built:false});
    else item.dest=item.dest.filter(t=>t.name!==d.destination);
    changed();destinations();return;
  }
  if(!d.room)return;
  const r=plan.rooms.find(r=>r.id===d.room);
  if(!r)return;
  const it=d.slot?r.items[d.slot]:r;
  if(!it)return;
  if(d.stage||Object.hasOwn(d,'stageRoute')){
    const option=itemDef(r,d.slot),hotspot=slotDef(r,d.slot);
    if(d.stage)markBuildStep(it,buildSteps(option,it,hotspot),d.stage,e.target.checked);
    else{
      const nextRoute=e.target.value;
      if(!altarRoutes(option,hotspot).some(o=>o.name===nextRoute))return;
      it.route=nextRoute;
      if(it.base!==nextRoute)delete it.base;
    }
    changed();
    const panel=$('#upgrade-progress');
    if(panel)panel.innerHTML=upgradeChecklist(r,d.slot,true);
    const updateScope=panel||$('#detail');
    Array.from(updateScope.querySelectorAll('[data-room][data-slot]')).find(control=>
      control.dataset.room===d.room&&control.dataset.slot===d.slot&&control.dataset.stage===d.stage
    )?.focus({preventScroll:true});
    return;
  }
  const target=d.dest?it.dest?.find(t=>t.name===d.dest):it;
  if(target){target.built=e.target.checked;changed();}
});
$('#headline-action').onclick=()=>{
  if(view==='supplies')csv();
  else if(view==='rooms'&&room())enterHouseRoom(selected);
  else navTo('planner');
};

$('#plan-menu').innerHTML=icon('file')+'Plan options'+icon('chevronDown');$('#plan-menu').onclick=planMenu;

$('#floor').onchange=e=>setFloor(e.target.value);
$('#credits').onclick=()=>dialogShow('Data & estimates','<p>Room fees, hotspots, furniture recipes and teleport requirements are adapted from the <a href="https://oldschool.runescape.wiki/w/Player-owned_house" target="_blank" rel="noopener">Old School RuneScape Wiki</a>. Catalog data is available under <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener">CC BY-NC-SA 3.0</a>.</p><p>Material estimates use the <a href="https://prices.runescape.wiki/osrs/" target="_blank" rel="noopener">OSRS Wiki GE price feed</a>, fixed fees and custom prices. Unpriced materials appear separately. Generic nails use steel nail prices. The estimate excludes tools, travel, servant wages and ongoing charges.</p><p>The 3D house uses original schematic artwork. Furniture previews depict the type and tier of each item, and the house colors are visual presets.</p><p>Plans and custom unit prices save in this browser. Export a plan file to transfer its layout, furniture and build progress.</p>');
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
window.addEventListener('hashchange',()=>{mode=null;clearLayoutTile();render();});
window.addEventListener('resize',()=>paint());
startClient();startRoomBuilder();render();if(loadWarning)notify(loadWarning);
