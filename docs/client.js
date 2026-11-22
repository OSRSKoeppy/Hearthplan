'use strict';
const DIRECTIONS=['N','E','S','W'];
const STEPS=[[0,-1],[1,0],[0,1],[-1,0]];
const SIDE_NAMES=['North','East','South','West'];
let world,building=true,sidePanel='hotspots',hoverTarget=null,placement=null,buildChoice=null;
let camera={yaw:0,pitch:50,zoom:1}, sceneError='';
let enterOnRender=null;
const gameMessages=[];
const floorRooms=()=>plan.rooms.filter(r=>r.floor===floor);
const positionedRoom=(x,y)=>floorRooms().find(r=>r.x===x&&r.y===y);
const onBoard=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<BOARD_SIZE&&y<BOARD_SIZE;
const rotatedDoors=(def,quarter)=>def.doors.map(side=>(DIRECTIONS.indexOf(side)+quarter)%4);
function addMessage(message){
  gameMessages.push(message);if(gameMessages.length>35)gameMessages.shift();
  const log=$('#messages');log.innerHTML=gameMessages.map((msg,i)=>'<p class="'+(i===gameMessages.length-1?'fresh':'')+'">'+esc(msg)+'</p>').join('');
  log.scrollTop=log.scrollHeight;
}
function startClient(){
  const failure=message=>{sceneError=String(message);const box=$('#scene-error');box.hidden=false;box.textContent=sceneError+' Use the floor plan and room panel to continue.';};
  try{world=POHWorld.create($('#map'),{onPick:scenePick,onHover:t=>{hoverTarget=t;hoverText();},onCamera:c=>{camera=c;drawRadar();},onError:failure});}
  catch(error){failure(error.message||'The 3D view could not start.');}
  addMessage('Welcome to your player-owned house.');
  addMessage('Select a furniture hotspot to build, or a doorway to add a room.');
  $('#radar #map-open').onclick=()=>navTo('rooms');
  $('#north').onclick=()=>world?.rotate(-camera.yaw);
  $('#build-room').onclick=()=>navTo('rooms');
  $('#build-switch').onclick=()=>{building=!building;mode=null;addMessage('Building mode is now '+(building?'on.':'off.'));render();};
  $('#toggle-log').onclick=e=>{const collapsed=$('#game-chat').classList.toggle('collapsed');e.currentTarget.setAttribute('aria-expanded',String(!collapsed));};
  document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{
    switch(b.dataset.camera){
      case 'turn-left':world?.rotate(-45);break;
      case 'turn-right':world?.rotate(45);break;
      case 'minus':world?.zoom(.82);break;
      case 'plus':world?.zoom(1.22);break;
      case 'reset':world?.resetCamera();break;
      case 'help':dialogShow('Camera controls','<p>The camera follows your character as you walk. Drag to orbit. Scroll or pinch to zoom.</p><p>With the scene focused, use the arrow keys to turn and tilt. Press Home to reset the camera angle and zoom.</p><p>Click a clear tile to walk. Right-click an object for its options. Open the Room builder from the minimap to lay out a floor.</p>');break;
    }
  });
  document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>{sidePanel=b.dataset.panel;renderInspector();paint();});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#choose-option'))dismissOptions();});
  window.addEventListener('blur',dismissOptions);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){dismissOptions();if(!dialog.open&&mode){mode=null;render();}}
    if(!dialog.open||!dialog.classList.contains('build-picker')||!buildChoice||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('select,input,textarea'))return;
    if(/^[1-9]$/.test(e.key)){const b=dialog.querySelectorAll('.build-option')[Number(e.key)-1];if(b){e.preventDefault();b.click();}}
  });
}
function enableBuilding(){building=true;}
function styleField(){
  const styles=window.POH_LOCATIONS?.styles||[];
  if(!styles.length)return '';
  return '<label class="field style-field">House style<select data-house-style>'+styles.map(s=>'<option value="'+esc(s.id)+'" '+((plan.style||'cedar')===s.id?'selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label>';
}
document.addEventListener('change',e=>{
  if(!e.target.matches('[data-house-style]'))return;
  const style=POH_LOCATIONS.styles.find(s=>s.id===e.target.value);if(!style)return;
  plan.style=style.id;addMessage('House style changed to '+style.name+'.');changed();
});
function syncScene(){
  $('#floor').value=floor;$('#plan-name').textContent=plan.name;
  $('#map-count').textContent=floorRooms().length+' rooms';
  const toggle=$('#build-switch');toggle.textContent='Building: '+(building?'On':'Off');toggle.setAttribute('aria-pressed',String(building));
  $('#map-hint').textContent='Click to walk · Drag to orbit';
  const box=$('#map-mode');box.hidden=!mode;
  if(mode)box.innerHTML=esc(mode.move?'Move room':mode.type?'Place '+BOOK.get(mode.type).name:'Build room')+' · Choose a door or use the floor plan. <button data-action="cancel-mode">Cancel</button>';
  world?.setScene({rooms:plan.rooms,floor,selectedId:selected,buildMode:building,style:plan.style||'cedar'});
  if(enterOnRender){
    world?.enterRoom(enterOnRender);
    enterOnRender=null;
  }
  drawRadar();hoverText();
}
function drawRadar(){
  const canvas=document.querySelector('#minimap');
  if(!canvas)return;
  const ctx=canvas.getContext('2d'),w=canvas.width,unit=24;ctx.clearRect(0,0,w,w);
  ctx.save();ctx.translate(w/2,w/2);ctx.rotate(-((camera?.yaw||0)*Math.PI/180));
  const focusRoom=room(),cx=Number.isFinite(camera?.x)?camera.x:((focusRoom?.x??3)+.5),cy=Number.isFinite(camera?.y)?camera.y:((focusRoom?.y??3)+.5);
  ctx.translate(-cx*unit,-cy*unit);ctx.fillStyle=floor==='dungeon'?'#36342d':'#596c33';ctx.fillRect(-250,-250,700,700);
  for(const r of floorRooms()){
    const x=r.x*unit,y=r.y*unit;ctx.fillStyle=/garden|outdoor/.test(r.type)?'#678146':'#837458';ctx.fillRect(x,y,unit,unit);
    ctx.strokeStyle=r.id===selected?'#fbe487':'#b8af91';ctx.lineWidth=r.id===selected?2:1;ctx.strokeRect(x+1,y+1,unit-2,unit-2);
    for(const d of rotatedDoors(roomDef(r),r.rotation)){
      const [dx,dy]=STEPS[d];ctx.fillStyle='#6c6948';ctx.fillRect(x+unit/2+dx*(unit/2-1)-(dx?1:3),y+unit/2+dy*(unit/2-1)-(dy?1:3),dx?3:6,dy?3:6);
    }
    const anchors=window.POH_LOCATIONS?.rooms?.[r.type]?.locations||[];
    for(const a of anchors){if(!a.hotspot||!r.items[a.hotspot])continue;
      let u=a.x+.5,v=7.5-a.y;for(let i=0;i<r.rotation;i++)[u,v]=[8-v,u];
      ctx.fillStyle='#34301e';ctx.fillRect(x+u*unit/8-1,y+v*unit/8-1,2,2);
    }
  }
  ctx.restore();ctx.fillStyle='#fff';ctx.fillRect(w/2-2,w/2-2,4,4);
  $('#north span').style.transform='rotate('+(-camera.yaw)+'deg)';
}
function selectSceneRoom(id,focus=false){
  if(!plan.rooms.some(r=>r.id===id&&r.floor===floor))return;
  selected=id;sidePanel='hotspots';render();
  if(focus)world?.enterRoom(id);
}
function enterHouseRoom(id){
  const target=plan.rooms.find(r=>r.id===id);
  if(!target)return;
  floor=target.floor;
  selected=id;
  sidePanel='hotspots';
  mode=null;
  enableBuilding();
  enterOnRender=id;
  navTo('planner');
}
function focusSelection(){if(room())world?.enterRoom(selected);}
function hitName(target){
  const r=plan.rooms.find(r=>r.id===target?.roomId);
  if(target?.kind==='hotspot'&&r)return r.items[target.slot]?.name||target.slot+' space';
  if(target?.kind==='door')return 'Door hotspot';
  return r?roomDef(r).name:'Ground';
}
function hoverText(){
  const label=$('#action-text');if(!label)return;
  const t=hoverTarget,r=plan.rooms.find(r=>r.id===t?.roomId);
  if(t?.kind==='hotspot'&&building)label.innerHTML=(r?.items[t.slot]?'Inspect ':'Build ')+'<span>'+esc(hitName(t))+'</span>';
  else if(t?.kind==='door'&&building)label.innerHTML='Build <span>Door hotspot</span>';
  else if(t)label.textContent='Walk here';
  else label.textContent=building?'Building mode':'Walk here';
}
function dismissOptions(){const box=document.querySelector('#choose-option');if(box)box.hidden=true;}
function contextOptions(target,e){
  const r=plan.rooms.find(r=>r.id===target.roomId),entries=[];
  const label=hitName(target),item=r?.items[target.slot];
  if(building&&target.kind==='hotspot'){
    entries.push([item?'Configure':'Build',label,()=>{selectSceneRoom(r.id);openSlot(target.slot);}]);
    if(item){
      entries.push([item.built?'Mark unbuilt':'Mark built',label,()=>{item.built=!item.built;changed();}]);
      entries.push(['Remove',label,()=>{selectSceneRoom(r.id);activeSlot=target.slot;confirmAction('Remove furniture?','Remove '+label+' from this plan?','clear-slot','Remove');}]);
    }
  }
  if(building&&target.kind==='door')entries.push(['Build','Door hotspot',()=>startAtTile(target.x,target.y,r?.id)]);
  if(r)entries.push(['Select',roomDef(r).name,()=>selectSceneRoom(r.id)]);
  entries.push(['Walk here','',()=>walk(target)]);
  if(r||target.kind==='door')entries.push(['Examine',label,()=>{const opt=item&&itemDef(r,target.slot);addMessage(opt?opt.name+' requires Construction level '+opt.level+'. '+materialsLine(opt.materials)+'.':label+'.');}]);
  entries.push(['Cancel','',()=>{}]);
  const box=$('#choose-option');box.replaceChildren();const header=document.createElement('div');header.className='context-title';header.textContent='Choose Option';box.append(header);
  for(const [verb,noun,action] of entries){const b=document.createElement('button');b.innerHTML=esc(verb)+' <span>'+esc(noun)+'</span>';b.onclick=()=>{dismissOptions();action();};box.append(b);}
  box.hidden=false;box.style.left='0';box.style.top='0';const rect=box.getBoundingClientRect();box.style.left=Math.max(0,Math.min(innerWidth-rect.width,e.clientX??0))+'px';box.style.top=Math.max(0,Math.min(innerHeight-rect.height,e.clientY??0))+'px';
}
function walk(t){if(world?.walkTo&&!world.walkTo(t))addMessage("You can't reach that tile.");}
function scenePick(target,e){
  dismissOptions();if(!target)return;
  if(e.type==='contextmenu'){contextOptions(target,e);return;}
  if(building&&(target.kind==='door'||(mode&&target.kind==='ground'))){startAtTile(target.x,target.y,target.kind==='door'?target.roomId:null);return;}
  if(building&&target.kind==='hotspot'&&!mode){
    const r=plan.rooms.find(r=>r.id===target.roomId);
    if(!r||!slotDef(r,target.slot))return;
    selectSceneRoom(r.id);openSlot(target.slot);return;
  }
  if(mode){notify('Select an available doorway or open the floor plan.');return;}
  walk(target);if(target.roomId&&selected!==target.roomId)selectSceneRoom(target.roomId);
}
function connectionAt(x,y,sourceId=null){
  if(!onBoard(x,y))return null;
  const rooms=floorRooms(),allowed=[];
  if(!rooms.length)return {sides:[],x,y};
  for(let d=0;d<4;d++){
    const [dx,dy]=STEPS[d],r=positionedRoom(x+dx,y+dy);
    if(!r||r.id===mode?.movingId||(sourceId&&r.id!==sourceId))continue;
    if(rotatedDoors(roomDef(r),r.rotation).includes((d+2)%4))allowed.push(d);
  }
  if(mode?.move&&rooms.length===1)return {sides:[],x,y};
  return allowed.length?{sides:allowed,x,y}:null;
}
function startAtTile(x,y,sourceId=null){
  if(!onBoard(x,y)||positionedRoom(x,y)){notify('Choose an empty space inside the 7 × 7 plot.');return;}
  const tile=connectionAt(x,y,sourceId);
  if(!tile){notify('This space needs an adjoining doorway.');return;}
  enableBuilding();
  if(mode?.move)previewRoom(room().type,tile,true);
  else if(mode?.type)previewRoom(mode.type,tile,false);
  else openRooms(tile);
}
function floorPlan(){
  let grid='';
  for(let y=0;y<BOARD_SIZE;y++)for(let x=0;x<BOARD_SIZE;x++){
    const r=positionedRoom(x,y),canBuild=!r&&!!connectionAt(x,y);
    const label=r?roomDef(r).name:canBuild?'Build room':'Empty';
    grid+='<button data-action="plot-cell" data-x="'+x+'" data-y="'+y+'" title="'+esc(label)+' · '+(x+1)+', '+(y+1)+'" aria-label="'+esc(label)+' '+(x+1)+', '+(y+1)+'" class="'+(r?'room':'')+(r?.id===selected?' selected':'')+(canBuild?' available':'')+'" '+(!r&&!canBuild?'disabled':'')+'>'+(r?esc(label):canBuild?'+':'·')+'</button>';
  }
  dialogShow('House floor plan','<p>'+esc(FLOORS[floor])+' · '+(mode?'Choose an available doorway (+).':'Select a room to focus the camera, or a + to build.')+'</p><div class="house-grid">'+grid+'</div>');
}
function matchingRotation(def,tile,initial=0){
  return [initial,(initial+1)%4,(initial+2)%4,(initial+3)%4].find(q=>!tile.sides?.length||rotatedDoors(def,q).some(d=>tile.sides.includes(d)));
}
function previewRoom(type,tile,moving=false){
  const def=BOOK.get(type);
  const initial=moving?room().rotation:0;
  placement={type,tile,moving:moving?selected:null,rotation:matchingRotation(def,tile,initial)??0};roomPreview();
}
function roomPreview(){
  const p=placement,def=BOOK.get(p.type),sides=rotatedDoors(def,p.rotation),valid=!p.tile.sides?.length||sides.some(d=>p.tile.sides.includes(d));
  dialogShow(p.moving?'Move room':'Room Creation Menu','<p>'+esc(def.name)+' · Level '+def.level+' Construction · '+(p.moving?'Already in plan':number(def.fee)+' gp')+'</p><div class="rotate-preview">'+button('↶','preview-left','neutral')+'<div class="preview-cell">'+thumb(def.name)+sides.map(d=>'<i class="opening '+DIRECTIONS[d]+'"></i>').join('')+'</div>'+button('↷','preview-right','neutral')+'</div><p class="preview-status">Doors: '+sides.map(d=>SIDE_NAMES[d]).join(', ')+'. '+(valid?'':'Rotate to connect the doorway.')+'</p><div class="dialog-actions">'+button('Cancel','close','neutral')+'<button class="primary" data-action="confirm-room" '+(!valid?'disabled':'')+'>'+(p.moving?'Move room':'Build room')+'</button></div>');
}
function commitRoomPlacement(p){
  const def=BOOK.get(p.type),{x,y,sides}=p.tile;
  if(positionedRoom(x,y)||(!p.moving&&plan.rooms.length>=MAX_ROOMS)||!allowedFloor(def,floor)||(sides?.length&&!rotatedDoors(def,p.rotation).some(d=>sides.includes(d))))return false;
  const r=p.moving?plan.rooms.find(existing=>existing.id===p.moving):freshRoom(p.type,x,y,floor);
  if(!r||r.floor!==floor)return false;
  r.x=x;
  r.y=y;
  r.rotation=p.rotation;
  if(!p.moving)plan.rooms.push(r);
  selected=r.id;
  mode=null;
  addMessage((p.moving?'You move the ':'You build a ')+def.name.toLowerCase()+'.');
  return true;
}
function finishRoom(){
  if(!placement||!commitRoomPlacement(placement))return;
  placement=null;
  sidePanel='hotspots';
  closeDialog();
  changed();
}
function drawSide(){
  const target=$('#inspector'),r=room();
  document.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panel===sidePanel)));
  if(sidePanel==='rooms'){
    target.innerHTML='<h3 class="side-title">'+esc(FLOORS[floor])+'</h3>'+styleField()+floorRooms().map(rr=>'<button class="panel-room'+(rr.id===selected?' current':'')+'" data-action="focus-room"'+hp('id',rr.id)+'>'+thumb(roomDef(rr).name)+'<span>'+esc(roomDef(rr).name)+'<span class="meta">Plot '+(rr.x+1)+', '+(rr.y+1)+'</span></span></button>').join('')+'<div class="dialog-actions" style="justify-content:center;margin:8px">'+button('Open floor plan','floor-plan')+'</div>';return;
  }
  if(sidePanel==='costs'){
    const s=summarize(plan);target.innerHTML='<h3 class="side-title">Build budget</h3><div class="side-cost">'+[['Room fees',s.fees],['Furniture',s.furniture],['Total estimate',s.total],['Remaining',s.left]].map(([k,v])=>'<p>'+k+'<b>'+number(v)+' gp</b></p>').join('')+(s.unknown?'<p>'+s.unknown+' unpriced materials</p>':'')+'<p>'+s.done+' of '+s.entries+' completed</p>'+button('View supplies','supplies')+button('Build checklist','checklist')+'</div>';return;
  }
  if(!r){target.innerHTML='<p class="room-note">There are no rooms on this floor. Choose Build room to start.</p>';return;}
  const def=roomDef(r);
  target.innerHTML='<div class="inspect-info">'+thumb(def.name)+'<div><h3>'+esc(def.name)+'</h3><div class="meta">Level '+def.level+' · '+number(def.fee)+' gp</div></div></div><div class="room-actions">'+button('Focus','camera-focus','','fit')+button('Rotate','rotate','','rotate')+button('Move','move','','move')+square('Remove room','remove','trash')+'</div><div class="furn-head"><h3>Hotspots</h3><span>'+Object.keys(r.items).length+' / '+def.hotspots.length+' filled</span></div><div class="hotspot-grid">'+def.hotspots.map(h=>{
    const it=r.items[h.name],n=it?.name||h.options[0]?.name||h.name;
    return '<div class="hotspot-cell"><button data-action="edit-slot"'+hp('slot',h.name)+' aria-label="'+esc(h.name+' · '+(it?it.name:'Build furniture'))+'" title="'+esc(it?.name||'Build '+h.name)+'"><span class="'+(it?'':'ghost')+'">'+thumb(n,'furniture',h.name)+'</span><span>'+esc(h.name)+'</span></button>'+(it?checkbox(it.built,'Built '+it.name,hp('room',r.id)+hp('slot',h.name)):'')+'</div>';
  }).join('')+'</div><label class="room-built">'+checkbox(r.built,'Room itself built',hp('room',r.id))+'Room built in game</label>';
}
function showBuildMenu(slot){
  const r=room(),h=slotDef(r,slot);if(!h)return;enableBuilding();activeSlot=slot;buildChoice={roomId:r.id,slot};
  const item=r.items[slot],opt=itemDef(r,slot);
  const staged=item?'<div id="upgrade-progress">'+upgradeChecklist(r,slot,true)+'</div>':'';
  const destinationsButton=portalCapacity(r,slot)>0?button('Destinations ('+(item.dest||[]).length+')','destinations','neutral'):'';
  const options=h.options.map((o,i)=>'<button class="build-option'+(item?.name===o.name?' current':'')+'" data-action="pick-item" '+hp('option',o.name)+' title="'+esc(materialsLine(o.materials))+'">'+thumb(o.name,'furniture',slot)+'<b>'+(i<9?i+1+'. ':'')+esc(o.name)+'</b><span>Level '+o.level+'</span></button>').join('');
  dialogShow('Furniture Creation Menu','<p>'+esc(roomDef(r).name)+' · '+esc(h.name)+'</p>'+staged+'<div class="build-grid">'+options+'</div><div class="recipe-preview" id="recipe-preview"></div>'+(item?'<div class="dialog-actions">'+button('Remove from plan','clear-slot','subtle')+destinationsButton+'</div>':''));
  dialog.classList.add('build-picker');
  const explain=o=>{$('#recipe-preview').innerHTML='<span><b>'+esc(o.name)+'</b><br>'+esc(materialsLine(o.materials))+(stages(o).length>1?'<br>Full cost from empty · '+stages(o).length+' build steps':'')+'</span>';};
  explain(opt||h.options[0]);dialog.querySelectorAll('.build-option').forEach((b,i)=>{b.onmouseenter=b.onfocus=()=>explain(h.options[i]);});
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button[data-action]');if(!b)return;
  switch(b.dataset.action){
    case 'floor-plan':floorPlan();break;
    case 'plot-cell':{const x=Number(b.dataset.x),y=Number(b.dataset.y),r=positionedRoom(x,y);if(r){if(mode){notify('Choose an available doorway (+).');return;}closeDialog();selectSceneRoom(r.id,true);}else startAtTile(x,y);break;}
    case 'focus-room':enterHouseRoom(b.dataset.id);break;
    case 'camera-focus':focusSelection();break;
    case 'preview-left':placement.rotation=(placement.rotation+3)%4;roomPreview();break;
    case 'preview-right':placement.rotation=(placement.rotation+1)%4;roomPreview();break;
    case 'confirm-room':finishRoom();break;
    case 'supplies':navTo('supplies');break;
    case 'checklist':navTo('checklist');break;
  }
});
