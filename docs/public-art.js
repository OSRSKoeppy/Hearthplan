// Original geometric previews for the public planner. Coordinates are in tile units.
(() => {
  const models=new Map();
  const rooms={};
  const palette=[0xb78152,0xa07d60,0xbb8e61,0x6e8b7f,0xc39549,0x7266a0];
  const styles=[
    {id:'cedar',name:'Cedar',wall:0xba8a65,floor:0xbc9f7e},
    {id:'limestone',name:'Limestone',wall:0xc9c2af,floor:0xc1b4a1},
    {id:'slate',name:'Slate',wall:0x75858b,floor:0x8e9c99}
  ];
  const box=(x,y,z,w,h,d,color)=>({x,y,z,w,h,d,color});
  function mesh(parts,sizeX=1,sizeZ=1){
    const vertices=[],faces=[],colors=[];
    const sides=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]];
    for(const {x,y,z,w,h,d,color} of parts){
      const offset=vertices.length/3;
      for(const [dx,dy,dz] of [[0,0,0],[1,0,0],[1,0,1],[0,0,1],[0,1,0],[1,1,0],[1,1,1],[0,1,1]]){
        vertices.push((x+w*(dx-.5))*128,(y+h*dy)*128,-(z+d*(dz-.5))*128);
      }
      for(const [a,b,c,e] of sides){
        faces.push(offset+a,offset+b,offset+c,offset+a,offset+c,offset+e);
        colors.push(color,color);
      }
    }
    return {vertices,faces,colors,sizeX,sizeZ};
  }
  const raised=(w,d)=>[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z])=>box(x*w/2,0,z*d/2,.14,.56,.14,0x604330));
  function furniture(slot,name,index){
    const label=(slot+' '+name).toLowerCase();
    const color=palette[index%palette.length];
    if(/fairy ring|portal frame|portal \d|exit portal|portal nexus|cage|fencing/.test(label)){
      return mesh([box(0,0,0,1.18,.15,.7,0x8c8690),box(-.47,.06,0,.19,1.55,.29,color),
        box(.47,.06,0,.19,1.55,.29,color),box(0,1.53,0,1.12,.2,.29,color),box(0,.17,0,.73,1.31,.07,0x846cc8)]);
    }
    if(/pool|pond|fountain|water|sink/.test(label)){
      return mesh([box(0,0,0,1.45,.18,1.45,0x6d7c83),box(0,.18,0,1.26,.04,1.26,0x58a4ad),
        ...[-.64,.64].flatMap(v=>[box(v,.18,0,.16,.22,1.46,0x95a2a3),box(0,.18,v,1.2,.22,.16,0x95a2a3)])]);
    }
    if(/plant|tree|hedge|topiary|flower|theme/.test(label)){
      const height=/tree|topiary/.test(label)?1.05:.45;
      return mesh([box(0,0,0,.22,height,.22,0x72513b),box(0,height*.75,0,.78,height*.56,.78,0x5b8a63),
        box(.11,height*1.2,-.13,.48,height*.39,.48,0x84a166)]);
    }
    if(/rug|carpet/.test(label))return mesh([box(0,.03,0,1.68,.025,1.31,color),box(0,.055,0,1.43,.006,1.08,0xae8359)]);
    if(/chair|seating|bench|throne/.test(label)&&!/workbench|repair/.test(label)){
      const width=/bench|seating/.test(label)?1.3:.76;
      return mesh([...raised(width*.7,.47),box(0,.43,0,width,.14,.62,color),box(0,.52,.26,width,.51,.14,color)]);
    }
    if(/altar|table|workbench|lectern|repair|clockmak/.test(label)){
      return mesh([...raised(1.03,.58),box(0,.53,0,1.33,.16,.85,color),
        ...(label.includes('altar')?[box(0,.69,0,.53,.08,.34,0xe9ddb9)]:[])]);
    }
    if(/window|icon|torch|lamp|statue|trophy|decoration|curtain/.test(label)){
      return mesh([box(0,0,0,.44,.17,.44,0x706760),box(0,.17,0,.22,.9,.23,color),box(0,1.07,0,.4,.31,.35,0xdab966)]);
    }
    return mesh([box(0,0,0,1.09,.72,.63,color),box(0,.72,0,1.17,.13,.7,0x826147),box(0,.38,-.33,.17,.1,.045,0xd7ba6f)]);
  }

  const anchors=[[2,5],[5,5],[2,2],[5,2],[1,4],[6,4],[4,6],[3,1],[4,3],[3,6],[6,2],[1,2]];
  const ringEdges={N:i=>[i,7,0],E:i=>[7,i,1],S:i=>[i,0,2],W:i=>[0,i,3]};
  for(const room of window.POH_DATA.rooms){
    const slots=room.hotspots.map((hotspot,i)=>{
      const [x,y]=anchors[i%anchors.length];
      const options=Object.fromEntries(hotspot.options.map((option,index)=>{
        const id=room.id+'/'+i+'/'+index;
        models.set(id,furniture(hotspot.name,option.name,index));
        return [option.name,id];
      }));
      return {x,y,shape:10,rotation:i%4,loc:Object.values(options)[0],hotspot:hotspot.name,options};
    });
    for(const style of styles){
      const outdoor=/garden|outdoor/.test(room.id);
      const locations=[...slots];
      if(!outdoor){
        const wallId='wall-'+style.id;
        models.set(wallId,mesh([box(0,0,-.47,1.005,1.68,.13,style.wall),box(0,1.64,-.47,1.005,.08,.2,0x787163)]));
        for(const [side,anchor] of Object.entries(ringEdges)){
          for(let i=0;i<8;i++){
            if(room.doors.includes(side)&&(i===3||i===4))continue;
            const [x,y,rotation]=anchor(i);
            locations.push({x,y,shape:0,rotation,loc:wallId});
          }
        }
      }
      const surface=Array.from({length:64},(_,i)=>[outdoor?0:style.id+(i%2),0,0,0]);
      rooms[room.id+'-'+style.id]={doors:room.doors,surface,locations};
    }
  }
  const underlays={};
  for(const style of styles){underlays[style.id+'0']=style.floor;underlays[style.id+'1']=style.floor;}
  const player=mesh([box(0,.56,0,.52,.62,.34,0x255f69),box(0,1.18,0,.35,.35,.33,0xc6946f),
    box(-.39,.65,0,.17,.48,.17,0x4a8694),box(.39,.65,0,.17,.48,.17,0x4a8694),box(-.14,0,0,.19,.58,.22,0x424852),box(.14,0,0,.19,.58,.22,0x424852)]);
  window.POH_LOCATIONS={styles,underlays,overlays:{},rooms:{},
    forRoom(id,style){return rooms[id+'-'+style]||rooms[id+'-cedar'];}};
  window.HOUSE_MODELS={get:id=>models.get(id),player:()=>player,playerDuration:()=>650};
  window.POH_SPRITES={index:{},images:{}};
})();
