'use strict';

let layoutType=null;
let layoutTile=null;

function clearLayoutTile(){
  layoutTile=null;
}

function layoutTileAt(x,y){
  if(positionedRoom(x,y))return null;
  return connectionAt(x,y);
}

function renderRoomBuilder(){
  const focused=document.activeElement;
  const focusKey=focused?.dataset.layoutFocus;
  const moving=mode?.move?room():null;
  const activeDef=BOOK.get(moving?.type||layoutType);
  const full=plan.rooms.length>=MAX_ROOMS;
  const current=room();
  const floorCount=floorRooms().length;
  $('#layout-count').textContent=plan.rooms.length+' / '+MAX_ROOMS+' rooms';
  document.querySelectorAll('[data-layout-floor]').forEach(b=>{
    b.setAttribute('aria-pressed',String(b.dataset.layoutFloor===floor));
  });
  let instructions='Choose a room type, then click an open plot.';
  if(full&&!moving)instructions='Your house has reached the '+MAX_ROOMS+'-room limit.';
  else if(moving)instructions='Choose an open plot for the '+roomDef(moving).name+'.';
  else if(layoutTile)instructions='Choose a room type for plot '+(layoutTile.x+1)+', '+(layoutTile.y+1)+'.';
  else if(activeDef)instructions='Click an open plot to place a '+activeDef.name+'.';
  else if(!floorCount)instructions='Choose a room from the library or click a plot to start this floor.';
  $('#layout-instructions').textContent=instructions;

  const cells=[];
  for(let y=0;y<BOARD_SIZE;y++){
    for(let x=0;x<BOARD_SIZE;x++){
      const existing=positionedRoom(x,y);
      const tile=layoutTileAt(x,y);
      const available=tile&&(!full||moving)&&(!activeDef||matchingRotation(activeDef,tile)!==undefined);
      const target=layoutTile?.x===x&&layoutTile?.y===y;
      const def=existing&&roomDef(existing);
      const doors=def?rotatedDoors(def,existing.rotation):[];
      const markers=doors.map(dir=>{
        const [dx,dy]=STEPS[dir];
        const neighbor=positionedRoom(x+dx,y+dy);
        const joined=neighbor&&rotatedDoors(roomDef(neighbor),neighbor.rotation).includes((dir+2)%4);
        return '<i aria-hidden="true" class="layout-door '+DIRECTIONS[dir]+(joined?' joined':'')+'"></i>';
      }).join('');
      const name=def?def.name:available?'Open plot':'Unavailable plot';
      const classes=['layout-cell',existing?'placed':'',available?'available':'',target||existing&&existing.id===selected?'active':''].join(' ');
      const action=' data-layout-plot="'+x+','+y+'" data-layout-focus="plot-'+x+'-'+y+'"';
      cells.push('<button type="button" class="'+classes+'"'+action+' aria-label="'+esc(name)+' '+(x+1)+', '+(y+1)+'" '+(!existing&&!available?'disabled':'')+'>'+markers+(def?'<span>'+esc(def.name)+'</span>':available?'<span aria-hidden="true">+</span>':'')+'</button>');
    }
  }
  $('#layout-grid').innerHTML=cells.join('');
  const tools=moving?'<button type="button" data-layout-command="cancel">Cancel move</button>':current?
    '<button type="button" data-layout-command="rotate">Rotate</button><button type="button" data-layout-command="move">Move</button><button type="button" data-layout-command="remove">Remove</button><button type="button" class="layout-enter" data-layout-command="enter">Enter room</button>':'';
  $('#layout-selection').innerHTML=current?
    '<div><strong>'+esc(roomDef(current).name)+'</strong><span>'+number(roomDef(current).fee)+' gp · Plot '+(current.x+1)+', '+(current.y+1)+'</span></div><div class="layout-actions">'+tools+'</div>':'';
  renderLayoutLibrary();
  if(focusKey){
    const replacement=[...document.querySelectorAll('[data-layout-focus]')].find(b=>b.dataset.layoutFocus===focusKey);
    replacement?.focus({preventScroll:true});
  }
}

function renderLayoutLibrary(){
  const options=libraryRooms($('#layout-search').value);
  const locked=plan.rooms.length>=MAX_ROOMS||mode?.move;
  $('#layout-library').innerHTML=options.map(def=>
    '<button type="button" data-layout-type="'+esc(def.id)+'" data-layout-focus="palette-'+esc(def.id)+'" aria-pressed="'+(layoutType===def.id)+'" '+(locked?'disabled':'')+'><strong>'+esc(def.name)+'</strong><span>Level '+def.level+' · '+number(def.fee)+' gp</span></button>'
  ).join('')||'<p>No rooms match your search.</p>';
}

function placeFromLayout(tile){
  const moving=mode?.move?room():null;
  const def=BOOK.get(moving?.type||layoutType);
  const rotation=matchingRotation(def,tile,moving?.rotation||0);
  if(rotation===undefined||!commitRoomPlacement({type:def.id,tile,moving:moving?.id,rotation})){
    notify('Choose an available plot with a matching doorway.');
    return;
  }
  clearLayoutTile();
  changed();
}

function startRoomBuilder(){
  const builder=$('#room-builder');
  $('#layout-search').addEventListener('input',renderLayoutLibrary);
  builder.addEventListener('click',event=>{
    const control=event.target.closest('button');
    if(!control)return;
    const {layoutFloor,layoutType:type,layoutPlot,layoutCommand}=control.dataset;
    if(layoutFloor){
      clearLayoutTile();
      if(!allowedFloor(BOOK.get(layoutType)||{},layoutFloor))layoutType=null;
      setFloor(layoutFloor);
      return;
    }
    if(type){
      layoutType=type===layoutType&&!layoutTile?null:type;
      if(layoutTile)placeFromLayout(layoutTile);
      else renderRoomBuilder();
      return;
    }
    if(layoutPlot){
      const [x,y]=layoutPlot.split(',').map(Number);
      const existing=positionedRoom(x,y);
      if(existing){
        if(mode?.move)return;
        selected=existing.id;
        clearLayoutTile();
        renderRoomBuilder();
        return;
      }
      const tile=layoutTileAt(x,y);
      if(!tile)return;
      if(mode?.move||layoutType)placeFromLayout(tile);
      else{
        layoutTile=tile;
        renderRoomBuilder();
        $('#layout-search').focus({preventScroll:true});
      }
      return;
    }
    const current=room();
    if(!layoutCommand||!current)return;
    if(layoutCommand==='enter')enterHouseRoom(current.id);
    if(layoutCommand==='rotate'){current.rotation=(current.rotation+1)%4;changed();}
    if(layoutCommand==='move'){
      clearLayoutTile();
      mode={move:true,movingId:current.id};
      renderRoomBuilder();
    }
    if(layoutCommand==='cancel'){mode=null;renderRoomBuilder();}
    if(layoutCommand==='remove')confirmAction('Remove '+roomDef(current).name+'?','This removes the room and its planned furniture from your house.','confirm-remove','Remove room',true);
  });
}
