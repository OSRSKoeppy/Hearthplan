/* POH scene viewer. RuneScape model units are converted to 128 units per tile. */
(() => {
  'use strict';
  const DEG=Math.PI/180, ROOM=8, BOARD=7, STRIDE=14;
  const DIR=['N','E','S','W'], STEP=[[0,-1],[1,0],[0,1],[-1,0]];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mod4=n=>((n%4)+4)%4;
  const rotate=(x,z,q)=>[[x,z],[-z,x],[-x,-z],[z,-x]][mod4(q)];
  const rgb=n=>[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
  const roomData=(type,style,floor)=>window.POH_LOCATIONS?.forRoom?.(type,style,floor)||window.POH_LOCATIONS?.rooms?.[type];
  const getMesh=(id,shape=10)=>{
    if(id==null||id<0)return null;
    return window.HOUSE_MODELS?.get(id,shape===11?10:shape>=5&&shape<=8?4:shape)||null;
  };
  const textureData=id=>window.HOUSE_MODELS?.texture?.(id);
  function doorsFor(room,data) {
    let names=data?.doors;
    if(!names) {
      if(/portal-chamber|throne|costume|treasure/.test(room.type))names=['S'];
      else if(/kitchen|bedroom|chapel/.test(room.type))names=['E','S'];
      else if(/workshop|achievement|corridor/.test(room.type))names=['N','S'];
      else if(/parlour|dining|study|league|games|combat/.test(room.type))names=['N','E','S'];
      else names=DIR;
    }
    return names.map(n=>DIR[mod4(DIR.indexOf(n)+(room.rotation||0))]);
  }
  function localToWorld(room,x,north) {
    const [a,b]=rotate(x-4,4-north,room.rotation||0);
    return [room.x*ROOM+4+a,room.y*ROOM+4+b];
  }
  function doorSide(room,base) {return DIR[mod4(DIR.indexOf(base)+(room.rotation||0))];}
  function chooseLoc(loc,item,items) {
    if(!item)return loc.loc;
    if(window.POH_LOCATIONS?.resolve)return window.POH_LOCATIONS.resolve(loc,item.name,items);
    return loc.options && Object.hasOwn(loc.options,item.name)?loc.options[item.name]:null;
  }
  // Packed vertices: position, lit RGBA, pick identifier, wall direction, surface, UV, texture.
  class Geometry {
    constructor() {this.array=new Float32Array(STRIDE*4096);this.length=0;}
    put(p,c,id,edge,mat,uv=[0,0],tex=-1) {
      if(this.length+STRIDE>this.array.length){const next=new Float32Array(this.array.length*2);next.set(this.array);this.array=next;}
      const a=this.array;let i=this.length;this.length+=STRIDE;
      a[i++]=p[0];a[i++]=p[1];a[i++]=p[2];a[i++]=c[0];a[i++]=c[1];a[i++]=c[2];a[i++]=c[3]??1;
      a[i++]=id;a[i++]=edge[0];a[i++]=edge[1];a[i++]=mat;a[i++]=uv[0];a[i++]=uv[1];a[i]=tex;
    }
    tri(a,b,c,color,id,edge=[0,0],mat=0) {for(const p of [a,b,c])this.put(p,color,id,edge,mat);}
    quad(a,b,c,d,color,id,edge=[0,0],mat=0) {this.tri(a,b,c,color,id,edge,mat);this.tri(a,c,d,color,id,edge,mat);}
    plane(x,z,w,d,y,color,id,mat=0) {this.quad([x,y,z],[x+w,y,z],[x+w,y,z+d],[x,y,z+d],color,id,[0,0],mat);}
    view() {return this.array.subarray(0,this.length);}
  }
  function hull2(points) {
    const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    if(sorted.length<4)return sorted;
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const chain=arr=>{const out=[];for(const p of arr){while(out.length>=2&&cross(out[out.length-2],out[out.length-1],p)<=0)out.pop();out.push(p);}out.pop();return out;};
    return chain(sorted).concat(chain([...sorted].reverse()));
  }
  function meshGeometry(g,mesh,opts={}) {
    if(!mesh?.vertices?.length||!mesh.faces?.length)return null;
    const {x=0,z=0,y=0,angle=0,id=0,edge=[0,0],ghost=false,shadow=false}=opts;
    const co=Math.cos(angle),si=Math.sin(angle),points=[],shadows=[],bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    const v=mesh.vertices,faces=mesh.faces;
    for(let i=0;i<v.length;i+=3){
      const mx=v[i]/128,mz=-v[i+2]/128;
      const p=[x+mx*co-mz*si,y+v[i+1]/128,z+mx*si+mz*co];
      points.push(p);
      for(let a=0;a<3;a++){bounds[a]=Math.min(bounds[a],p[a]);bounds[a+3]=Math.max(bounds[a+3],p[a]);}
      if(shadow&&p[1]>0.04)shadows.push([p[0]+p[1]*0.28,p[2]+p[1]*0.15]);
    }
    for(let i=0;i<faces.length;i+=3){
      const f=i/3,a=points[faces[i]],b=points[faces[i+1]],c=points[faces[i+2]];
      if(!a||!b||!c)continue;
      const alpha=(mesh.alpha?.[f]??255)/255;if(alpha<0.018&&!ghost)continue;
      const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz);
      if(len<1e-10)continue;
      const light=clamp(0.84+0.27*(Math.abs(ny)*0.79-nx*0.43+nz*0.31)/len,0.62,1.15);
      const nativeTex=ghost?-1:(mesh.textures?.[f]??-1),tex=nativeTex>=0&&textureData(nativeTex)?nativeTex:-1;
      const base=ghost?[0.88,0.93,0.91]:tex>=0?[0.91,0.91,0.91]:rgb(mesh.colors?.[f]??0xb1a899);
      const color=[base[0]*light,base[1]*light,base[2]*light,ghost?Math.max(0.27,Math.min(0.45,alpha*0.71)):alpha];
      for(let k=0;k<3;k++){const j=f*6+k*2;g.put(points[faces[i+k]],color,id,edge,ghost?8:0,mesh.uv?[mesh.uv[j],mesh.uv[j+1]]:[k===1?1:0,k===2?1:0],tex);}
    }
    if(shadow&&shadows.length>2){
      const hull=hull2(shadows),dark=[0.10,0.12,0.055,0.18];
      for(let i=1;i<hull.length-1;i++) g.tri(...[hull[0],hull[i],hull[i+1]].map(([a,b])=>[a,0.026,b]),dark,id,[0,0],9);
    }
    return bounds;
  }
  function fallbackSurface(type,x,y) {
    if(/garden|menagerie/.test(type)){
      const path=x===3||x===4||y===3||y===4;
      return path?[0xa89974,5]:[0x6b833e,1];
    }
    if(/dungeon|treasure|oubliette/.test(type))return [0x797877,3];
    if(/chapel|portal|achievement|throne|kitchen|combat/.test(type))return [0xa8a18d,3];
    return [0xa18a65,2];
  }
  function surface(room,data,x,y) {
    const fallback=fallbackSurface(room.type,x,y), tile=data?.surface?.[y*8+x];
    if(!tile)return {color:fallback[0],material:fallback[1],tex:-1};
    const [underlay,overlay,shape,rot]=tile;
    const defs=window.POH_LOCATIONS;
    const u=defs.underlays?.[underlay]||window.HOUSE_MODELS?.underlays?.[underlay];
    const o=defs.overlays?.[overlay]||window.HOUSE_MODELS?.overlays?.[overlay];
    const entry=o||u;
    if(entry==null)return {color:fallback[0],material:fallback[1],tex:-1,shape,rot};
    const raw=(typeof entry==='number'||typeof entry==='string')?entry:(entry.rgb??entry.color??fallback[0]);
    const color=typeof raw==='string'?parseInt(raw.replace('#',''),16):raw;
    const texture=o?.texture??o?.textureId??defs.surfaceTextures?.[overlay]??-1;
    return {color:color===0xff00ff?fallback[0]:color,material:color===0x35720a?1:0,tex:texture,shape,rot};
  }
  function drawFloorTile(g,room,data,lx,ly,id){
    const raw=data?.surface?.[ly*8+lx];if(raw&&raw[0]===0&&raw[1]===0)return;
    const [px,pz]=localToWorld(room,lx+0.5,ly+0.5),s=surface(room,data,lx,ly);
    const c=rgb(s.color);
    if(s.tex>=0&&textureData(s.tex)){
      const corners=[[lx,ly],[lx+1,ly],[lx+1,ly+1],[lx,ly+1]],uv=[[0,1],[1,1],[1,0],[0,0]];
      for(const i of [0,1,2,0,2,3]){
        const [x,z]=localToWorld(room,...corners[i]);
        g.put([x,0.006,z],[0.94,0.94,0.94,1],id,[0,0],0,uv[mod4(i+(s.rot||0))],s.tex);
      }
    }else g.plane(px-0.5,pz-0.5,1,1,0.006,[...c,1],id,s.material);
  }
  function baseDoorFromLoc(loc) {
    if(typeof loc.door==='string')return loc.door;
    if(!loc.door)return null;
    const distances=[7-loc.y,7-loc.x,loc.y,loc.x];
    return DIR[distances.indexOf(Math.min(...distances))];
  }
  function staticWallEdge(room,loc) {
    if(loc.shape>3)return [0,0];
    let side=[3,0,1,2][mod4(loc.rotation||0)];
    const distance=[7-loc.y,7-loc.x,loc.y,loc.x][side];
    if(distance>0)return [0,0];
    return STEP[mod4(side+room.rotation)];
  }
  function defaultDoor(g,room,side,id) {
    const d=DIR.indexOf(side),[a,b]=STEP[d],x=room.x*8+4+a*3.94,z=room.y*8+4+b*3.94;
    const w=0.72,kx=b*w,kz=-a*w, color=[0.87,0.91,0.84,0.42];
    g.quad([x-kx,0,z-kz],[x+kx,0,z+kz],[x+kx,1.63,z+kz],[x-kx,1.63,z-kz],color,id,[0,0],8);
  }
  function overviewBounds(rooms) {
    if(!rooms.length)return {x:28,z:28,width:18,depth:18};
    const xs=rooms.map(r=>r.x*8), zs=rooms.map(r=>r.y*8);
    const x=Math.min(...xs),z=Math.min(...zs),w=Math.max(...xs)-x+8,d=Math.max(...zs)-z+8;
    return {x:x+w/2,z:z+d/2,width:w,depth:d};
  }
  function buildScene(state) {
    const g=new Geometry(),targets=[null],solid=new Set(),roomByCell=new Map(),doorMap=new Map(),missing=new Set(),slotCells=new Map();
    const add=t=>{targets.push(t);return targets.length-1;};
    const rooms=(state.rooms||[]).filter(r=>!r.floor||r.floor===state.floor);
    const isDungeon=state.floor==='dungeon';
    // The yard extends beyond the plot so a low camera sees continuous terrain.
    const garden=roomData('garden',state.style,'ground');
    const yardColor=isDungeon?0x57554a:surface({type:'garden'},garden,0,0).color;
    const yardY=state.floor==='upper'?-2.48:0;
    if(!state.noYard)g.plane(-130,-130,316,316,yardY-0.042,[...rgb(yardColor),1],0,isDungeon?6:1);
    for(let x=0;!state.noYard&&x<BOARD;x++)for(let y=0;y<BOARD;y++){
      const id=add({kind:'ground',x,y});
      g.plane(x*8,y*8,8,8,yardY-0.025,[...rgb(yardColor),1],id,isDungeon?6:1);
    }
    for(const room of rooms){
      const data=roomData(room.type,state.style,room.floor),doors=doorsFor(room,data), roomTarget={kind:'room',roomId:room.id,x:room.x,y:room.y};
      const roomId=add(roomTarget), slotIds=new Map(),doorIds=new Map(),shownDoors=new Set();
      roomByCell.set(room.x+','+room.y,room);doorMap.set(room.id,doors);
      for(let y=0;y<8;y++)for(let x=0;x<8;x++)drawFloorTile(g,room,data,x,y,roomId);
      for(const side of doors){
        const [dx,dy]=STEP[DIR.indexOf(side)];const nx=room.x+dx,ny=room.y+dy;
        if(nx>=0&&nx<BOARD&&ny>=0&&ny<BOARD)doorIds.set(side,add({kind:'door',roomId:room.id,side,x:nx,y:ny}));
      }
      if(!data)missing.add('placements');
      for(const loc of data?.locations||[]){
        const item=loc.hotspot?room.items?.[loc.hotspot]:null, ds=baseDoorFromLoc(loc);
        const side=ds?doorSide(room,ds):null;
        const ghost=!!(loc.hotspot&&!item)||!!ds;
        if(ghost&&!state.buildMode)continue;
        // Native door hotspots appear at an open edge of the house in building mode.
        if(side&&(!doorIds.has(side)||rooms.some(r=>r.x===targets[doorIds.get(side)].x&&r.y===targets[doorIds.get(side)].y)))continue;
        const chosen=chooseLoc(loc,item,room.items);
        if(chosen==null)continue;
        const shape=loc.shape??10,mesh=getMesh(chosen,shape);
        if(!mesh){missing.add(chosen);continue;}
        let pick=roomId;
        if(side){shownDoors.add(side);pick=doorIds.get(side);}
        else if(loc.hotspot){
          if(!slotIds.has(loc.hotspot))slotIds.set(loc.hotspot,add({...roomTarget,kind:'hotspot',slot:loc.hotspot,name:item?.name||null,built:!!item?.built}));
          pick=slotIds.get(loc.hotspot);
        }
        const nativeRot=mod4(item?.name==='Trailblazer rug'?0:loc.rotation||0), isLarge=shape===10||shape===11;
        const w=isLarge?(nativeRot%2?mesh.sizeZ:mesh.sizeX)||1:1, d=isLarge?(nativeRot%2?mesh.sizeX:mesh.sizeZ)||1:1;
        let [x,z]=localToWorld(room,loc.x+w/2,loc.y+d/2);
        if(shape===5){
          const wall=data.locations.find(p=>p.x===loc.x&&p.y===loc.y&&p.shape<=3);
          const displacement=(wall?window.HOUSE_MODELS?.definition?.(wall.loc)?.displacement:16)??16;
          const normal=STEP[mod4(nativeRot+3+room.rotation)];x-=normal[0]*displacement/128;z-=normal[1]*displacement/128;
        }
        const angle=(nativeRot+(room.rotation||0))*Math.PI/2+(shape===11?Math.PI/4:0);
        const edge=loc.hotspot||side?[0,0]:staticWallEdge(room,loc);
        const bounds=meshGeometry(g,mesh,{x,z,angle,id:pick,y:shape===22?0.014:0.008,edge,ghost,shadow:!ghost&&isLarge});
        if(loc.hotspot){
          const k=room.id+'\n'+loc.hotspot;
          if(!slotCells.has(k))slotCells.set(k,[]);
          slotCells.get(k).push({x,z,w,d,id:pick});
        }
        if(item&&isLarge&&bounds&&bounds[4]-bounds[1]>0.44){
          for(let i=0;i<w;i++)for(let j=0;j<d;j++){
            const [tx,tz]=localToWorld(room,loc.x+i+0.5,loc.y+j+0.5);solid.add(Math.floor(tx)+','+Math.floor(tz));
          }
        }
      }
      if(state.buildMode)for(const [side,id]of doorIds){
        if(!shownDoors.has(side)&&!rooms.some(r=>r.x===targets[id].x&&r.y===targets[id].y))defaultDoor(g,room,side,id);
      }
    }
    return {vertices:g.view(),targets,rooms,roomByCell,doorMap,solid,missing,slotCells,sky:rgb(yardColor),floor:state.floor};
  }
  function view(cam,width,height) {
    const a=cam.yaw*DEG,p=cam.pitch*DEG,s=Math.sin(a),c=Math.cos(a),v=Math.sin(p),t=Math.cos(p);
    return {target:[cam.x,cam.height??0.62,cam.z],right:[c,0,s],up:[s*v,t,-c*v],
      forward:[s*t,-v,-c*t],distance:cam.distance,aspect:width/Math.max(height,1),f:2.41421356};
  }
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function groundPoint(px,py,w,h,v) {
    const sx=(px/w*2-1)*v.aspect/v.f,sy=(1-py/h*2)/v.f;
    const ray=v.forward.map((n,i)=>n+v.right[i]*sx+v.up[i]*sy);
    const eye=v.target.map((n,i)=>n-v.forward[i]*v.distance);
    if(ray[1]>-0.00001)return null;
    const t=-eye[1]/ray[1];
    return t>0?[eye[0]+ray[0]*t,eye[2]+ray[2]*t]:null;
  }
  const VS=`
  attribute vec3 pos;
  attribute vec4 col;
  attribute float pickId;
  attribute vec3 layer;
  attribute vec3 material;
  uniform vec3 target, rightVec, upVec, forwardVec;
  uniform vec3 projection;
  uniform vec3 translation;
  uniform float facing;
  varying vec4 color;
  varying vec3 world, layerData, texData;
  varying float id, distanceToCamera;
  void main(){
    float c=cos(facing),s=sin(facing);
    world=vec3(c*pos.x-s*pos.z,pos.y,s*pos.x+c*pos.z)+translation;
    vec3 p=world-target;
    float depth=projection.x+dot(p,forwardVec);
    gl_Position=vec4(dot(p,rightVec)*projection.z/projection.y,dot(p,upVec)*projection.z,depth*1.001-0.28,depth);
    color=col;layerData=layer;texData=material;id=pickId;distanceToCamera=depth;
  }`;
  const FS=`
  precision highp float;
  varying vec4 color;varying vec3 world,layerData,texData;varying float id,distanceToCamera;
  uniform vec3 forwardVec;uniform vec3 sky;uniform float picking,hoverId;
  uniform sampler2D atlas;
  float noise(vec2 p){vec3 a=fract(vec3(p.xyx)*0.1031);a+=dot(a,a.yzx+33.33);return fract((a.x+a.y)*a.z);}
  void main(){
    float mt=layerData.z;
    if(dot(layerData.xy,-forwardVec.xz)>0.07 && world.y>0.34)discard;
    vec4 paint=color;
    if(texData.z>=-0.4){
      float key=floor(texData.z+0.5);
      vec2 cell=vec2(mod(key,16.0),floor(key/16.0));
      vec2 uv=(cell+(fract(texData.xy)*63.0+0.5)/64.0)/16.0;
      vec4 tx=texture2D(atlas,uv);
      if(tx.a<0.1)discard;
      paint.rgb*=tx.rgb;paint.a*=tx.a;
    }
    if(picking>0.5){
      if(mt>8.5)discard;
      float key=floor(id+0.5);gl_FragColor=vec4(mod(key,256.0)/255.0,mod(floor(key/256.0),256.0)/255.0,0.,1.);return;
    }
    if(mt>0.5 && mt<6.5){
      vec2 p=world.xz;
      float grain=noise(floor(p*16.0));
      float patch=noise(floor(p*1.3));
      if(mt<1.5){
        paint.rgb*=0.91+0.095*patch+0.075*grain;
        if(grain>0.958 && noise(floor(p*4.))>0.56)paint.rgb+=vec3(0.035,0.039,0.004);
      } else if(mt<2.5) {
        float row=floor(p.y*2.0);
        vec2 board=vec2((p.x+mod(row,3.)*0.78)/2.7,p.y*2.0);
        float seam=step(0.018,fract(board.x))*step(0.055,fract(board.y));
        paint.rgb*=(0.72+0.28*seam)*(0.91+0.12*noise(floor(board))+0.04*noise(floor(p*vec2(4.,31.))));
      } else if(mt<5.6){
        vec2 tile=p; if(mt>4.5)tile.x+=mod(floor(tile.y),2.)*0.5;
        float seam=step(0.032,fract(tile.x))*step(0.032,fract(tile.y));
        paint.rgb*=(0.73+0.27*seam)*(0.93+0.095*noise(floor(tile))+0.041*grain);
      } else paint.rgb*=0.89+0.12*patch+0.075*grain;
    }
    if(id>0.5&&abs(id-hoverId)<0.25&&mt<8.5)paint.rgb=mix(paint.rgb,vec3(1.0,0.88,0.53),0.19);
    paint.rgb=mix(paint.rgb,sky,smoothstep(47.0,134.0,distanceToCamera)*0.43);
    gl_FragColor=paint;
  }`;
  function splitGeometry(vertices){
    const tri=STRIDE*3,opaqueLength=(()=>{let n=0;for(let i=0;i<vertices.length;i+=tri)if(vertices[i+6]>=0.995)n+=tri;return n;})();
    const opaque=new Float32Array(opaqueLength),translucent=new Float32Array(vertices.length-opaqueLength),groups=[];
    let o=0,t=0,current=null;
    for(let i=0;i<vertices.length;i+=tri){
      if(vertices[i+6]>=0.995){opaque.set(vertices.subarray(i,i+tri),o);o+=tri;continue;}
      const id=vertices[i+7],layer=vertices[i+10];
      if(!current||current.id!==id||current.layer!==layer){
        current={id,layer,start:t/STRIDE,count:0,center:[0,0,0]};groups.push(current);
      }
      translucent.set(vertices.subarray(i,i+tri),t);t+=tri;current.count+=3;
      for(let k=0;k<3;k++)for(let j=0;j<3;j++)current.center[j]+=vertices[i+k*STRIDE+j];
    }
    for(const g of groups)g.center=g.center.map(p=>p/g.count);
    return {opaque,translucent,groups};
  }
  function depthOrder(groups,camera){
    return [...groups].sort((a,b)=>{
      if((a.layer===9)!==(b.layer===9))return a.layer===9?-1:1;
      return dot(b.center,camera.forward)-dot(a.center,camera.forward);
    });
  }
  function makeGl(canvas) {
    const gl=canvas.getContext('webgl',{alpha:false,depth:true,stencil:false,antialias:true,preserveDrawingBuffer:false});
    if(!gl)return null;
    const compile=(type,source)=>{
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'Scene shader failed');
      return shader;
    };
    const program=gl.createProgram(),vsh=compile(gl.VERTEX_SHADER,VS),fsh=compile(gl.FRAGMENT_SHADER,FS);
    gl.attachShader(program,vsh);gl.attachShader(program,fsh);gl.linkProgram(program);gl.deleteShader(vsh);gl.deleteShader(fsh);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Scene shader failed');
    gl.useProgram(program);
    const u={};for(const n of ['target','rightVec','upVec','forwardVec','projection','translation','facing','sky','picking','hoverId','atlas'])u[n]=gl.getUniformLocation(program,n);
    const attributes=[['pos',3,0],['col',4,3],['pickId',1,7],['layer',3,8],['material',3,11]].map(([n,count,offset])=>[gl.getAttribLocation(program,n),count,offset]);
    const vb=gl.createBuffer(),tb=gl.createBuffer(),pv=gl.createBuffer(),fb=gl.createFramebuffer(),depth=gl.createRenderbuffer(),target=gl.createTexture(),atlas=gl.createTexture();
    let width=0,height=0,count=0,playerCount=0,groups=[];
    const textureParams=()=>{gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);};
    gl.bindTexture(gl.TEXTURE_2D,atlas);textureParams();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,1024,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.uniform1i(u.atlas,0);
    const uploaded=new Set();
    function uploadTextures(vertices){
      const needed=new Set();
      for(let i=13;i<vertices.length;i+=STRIDE){const id=vertices[i];if(id>=0&&!uploaded.has(id))needed.add(id);}
      gl.bindTexture(gl.TEXTURE_2D,atlas);
      for(const key of needed){
        const tex=textureData(key);if(!tex||key>=256)continue;
        const {width:w,height:h,pixels}=tex,buf=new Uint8Array(64*64*4);
        for(let y=0;y<64;y++)for(let x=0;x<64;x++){
          const from=(Math.floor(y*h/64)*w+Math.floor(x*w/64))*4,to=(y*64+x)*4;
          for(let k=0;k<4;k++)buf[to+k]=pixels[from+k];
        }
        gl.texSubImage2D(gl.TEXTURE_2D,0,(key%16)*64,Math.floor(key/16)*64,64,64,gl.RGBA,gl.UNSIGNED_BYTE,buf);uploaded.add(key);
      }
    }
    function load(buffer,vertices){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);uploadTextures(vertices);}
    function resize(w,h){
      if(w===width&&h===height)return;
      width=w;height=h;canvas.width=w;canvas.height=h;
      gl.bindTexture(gl.TEXTURE_2D,target);textureParams();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);
      gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,atlas);
    }
    function drawBuffer(buffer,n,x,y,z,angle,start=0){
      if(!n)return;
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for(const [loc,size,offset]of attributes){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,STRIDE*4,offset*4);}
      gl.uniform3f(u.translation,x,y,z);gl.uniform1f(u.facing,angle);gl.drawArrays(gl.TRIANGLES,start,n);
    }
    function draw(camera,hover,sky,picking,player){
      gl.bindFramebuffer(gl.FRAMEBUFFER,picking?fb:null);gl.viewport(0,0,width,height);
      gl.depthMask(true);gl.clearColor(...(picking?[0,0,0]:sky),1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
      if(picking){gl.disable(gl.BLEND);gl.disable(gl.DITHER);}else{gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DITHER);}
      gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,atlas);
      gl.uniform3fv(u.target,camera.target);gl.uniform3fv(u.rightVec,camera.right);gl.uniform3fv(u.upVec,camera.up);gl.uniform3fv(u.forwardVec,camera.forward);
      gl.uniform3f(u.projection,camera.distance,camera.aspect,camera.f);gl.uniform3fv(u.sky,sky);gl.uniform1f(u.picking,picking?1:0);gl.uniform1f(u.hoverId,hover||-1);
      drawBuffer(vb,count,0,0,0,0);
      if(!picking&&player)drawBuffer(pv,playerCount,player.x,0,player.z,player.angle||0);
      gl.depthMask(!!picking);
      for(const group of depthOrder(groups,camera))drawBuffer(tb,group.count,0,0,0,0,group.start);
      gl.depthMask(true);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
    const px=new Uint8Array(4);
    return {resize,draw,load(v){const parts=splitGeometry(v);load(vb,parts.opaque);load(tb,parts.translucent);count=parts.opaque.length/STRIDE;groups=parts.groups;},setPlayer(v){load(pv,v);playerCount=v.length/STRIDE;},
      pick(x,y){gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.readPixels(clamp(Math.floor(x),0,width-1),clamp(height-1-Math.floor(y),0,height-1),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return px[0]+px[1]*256;},
      dispose(){for(const b of [vb,tb,pv])gl.deleteBuffer(b);for(const t of [target,atlas])gl.deleteTexture(t);gl.deleteRenderbuffer(depth);gl.deleteFramebuffer(fb);gl.deleteProgram(program);}};
  }
  /* Shared software depth buffer for inventory pictures and WebGL-less browsers. */
  function rasterFrame(w,h,background) {
    const buf=new Uint8ClampedArray(w*h*4),depth=new Float32Array(w*h),ids=new Uint16Array(w*h);
    if(background){
      const [r,g,b]=background.map(n=>n*255);
      for(let i=0;i<buf.length;i+=4){buf[i]=r;buf[i+1]=g;buf[i+2]=b;buf[i+3]=255;}
    }
    return {w,h,buf,depth,ids,idDepth:new Float32Array(w*h)};
  }
  function rasterize(vertices,v,frame,hover=0,actor=null) {
    const {w,h,depth,buf,ids}=frame,screenScale=h*v.f*0.5;
    const cos=actor?Math.cos(actor.angle||0):1,sin=actor?Math.sin(actor.angle||0):0;
    for(let i=0;i<vertices.length;i+=STRIDE*3){
      const mat=vertices[i+10];
      const cut=vertices[i+8]*(-v.forward[0])+vertices[i+9]*(-v.forward[2])>0.07;
      const p=[];let skip=false;
      for(let k=0;k<3;k++){
        const j=i+k*STRIDE;
        let x=vertices[j],y=vertices[j+1],z=vertices[j+2];
        if(actor){const xx=x*cos-z*sin+actor.x;z=x*sin+z*cos+actor.z;x=xx;y+=actor.bob||0;}
        const d=[x-v.target[0],y-v.target[1],z-v.target[2]],zd=v.distance+dot(d,v.forward);
        if(zd<=0.1){skip=true;break;}
        const inv=1/zd;
        p.push([w*0.5+dot(d,v.right)*screenScale*inv,h*0.5-dot(d,v.up)*screenScale*inv,inv,x,y,z,vertices[j+11],vertices[j+12]]);
      }
      if(skip||cut&&p.every(q=>q[4]>0.34))continue;
      const [a,b,c]=p,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
      if(Math.abs(den)<0.001)continue;
      const left=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),right=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0])));
      const top=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),bottom=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
      if(left>right||top>bottom)continue;
      const id=vertices[i+7],color=[vertices[i+3]*255,vertices[i+4]*255,vertices[i+5]*255];
      if(hover&&id===hover)for(let l=0;l<3;l++)color[l]=color[l]*0.81+[255,225,138][l]*0.19;
      const tex=vertices[i+13]>=0?textureData(vertices[i+13]):null,alpha=vertices[i+6];
      for(let yy=top;yy<=bottom;yy++)for(let xx=left;xx<=right;xx++){
        const l=((b[1]-c[1])*(xx+0.5-c[0])+(c[0]-b[0])*(yy+0.5-c[1]))/den;
        const m=((c[1]-a[1])*(xx+0.5-c[0])+(a[0]-c[0])*(yy+0.5-c[1]))/den,n=1-l-m;
        if(l<0||m<0||n<0)continue;
        const at=yy*w+xx,d=l*a[2]+m*b[2]+n*c[2];
        if(d+1e-7<depth[at])continue;
        const interp=k=>(l*a[k]*a[2]+m*b[k]*b[2]+n*c[k]*c[2])/d;
        if(cut&&interp(4)>0.34)continue;
        let r=color[0],g=color[1],bl=color[2],opacity=alpha;
        if(tex){
          const u=interp(6),t=interp(7),tx=Math.floor((u-Math.floor(u))*tex.width),ty=Math.floor((t-Math.floor(t))*tex.height),s=(ty*tex.width+tx)*4;
          if(tex.pixels[s+3]<24)continue;
          r*=tex.pixels[s]/255;g*=tex.pixels[s+1]/255;bl*=tex.pixels[s+2]/255;opacity*=tex.pixels[s+3]/255;
        }
        if(mat>0&&mat<7){
          const x=interp(3),z=interp(5),fx=x-Math.floor(x),fz=z-Math.floor(z);
          let shade=1;
          if(mat===2){const v=z*2;shade=(v-Math.floor(v)<0.06||((x+(Math.floor(v)%3)*0.78)/2.7)%1<0.018)?0.74:1;}
          else if(mat===3||mat===5)shade=fx<0.035||fz<0.035?0.78:1;
          if(mat===1){const seed=Math.imul(Math.floor(x*13),1597334677)^Math.imul(Math.floor(z*13),3812015801);shade=0.95+((seed>>>0)%101)/1000;}
          r*=shade;g*=shade;bl*=shade;
        }
        const o=at*4;
        buf[o]=r*opacity+buf[o]*(1-opacity);buf[o+1]=g*opacity+buf[o+1]*(1-opacity);buf[o+2]=bl*opacity+buf[o+2]*(1-opacity);
        buf[o+3]=255*(opacity+(buf[o+3]/255)*(1-opacity));
        if(opacity>=0.995)depth[at]=d;
        if(mat!==9&&!actor&&d>=frame.idDepth[at]){ids[at]=id;frame.idDepth[at]=d;}
      }
    }
  }
  function software(canvas) {
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('This browser cannot display the 3D canvas.');
    let parts=null,character=null,frame=null;
    return {software:true,resize(w,h){canvas.width=w;canvas.height=h;},load(v){parts=splitGeometry(v);},setPlayer(v){character=v;},
      draw(camera,hover,sky,picking,player){if(picking&&frame)return;frame=rasterFrame(canvas.width,canvas.height,sky);rasterize(parts.opaque,camera,frame,hover);if(player&&character)rasterize(character,camera,frame,0,player);
        for(const g of depthOrder(parts.groups,camera))rasterize(parts.translucent.subarray(g.start*STRIDE,(g.start+g.count)*STRIDE),camera,frame,hover);
        const data=ctx.createImageData(frame.w,frame.h);data.data.set(frame.buf);ctx.putImageData(data,0,0);},
      pick(x,y){return frame?.ids?.[clamp(Math.floor(y),0,canvas.height-1)*canvas.width+clamp(Math.floor(x),0,canvas.width-1)]||0;},dispose(){}};
  }
  function pathTo(scene,from,to){
    const size=BOARD*ROOM,valid=(x,z)=>x>=0&&z>=0&&x<size&&z<size&&!scene.solid.has(x+','+z)
      &&(scene.floor==='ground'||scene.roomByCell.has(Math.floor(x/ROOM)+','+Math.floor(z/ROOM)));
    const [sx,sz]=from.map(Math.floor);if(!valid(sx,sz))return [];
    let [tx,tz]=to.map(Math.floor);
    if(!valid(tx,tz)){
      let found=null;
      for(let radius=1;radius<3&&!found;radius++)for(const [dx,dz]of STEP){const ax=tx+dx*radius,az=tz+dz*radius;if(valid(ax,az)){found=[ax,az];break;}}
      if(!found)return [];[tx,tz]=found;
    }
    const start=sz*size+sx,goal=tz*size+tx;
    const prev=new Int16Array(size*size);prev.fill(-1);prev[start]=start;
    const queue=[start];
    for(let qi=0;qi<queue.length&&prev[goal]<0;qi++){
      const k=queue[qi],x=k%size,z=Math.floor(k/size);
      for(let dir=0;dir<4;dir++){
        const [dx,dz]=STEP[dir],nx=x+dx,nz=z+dz,nk=nz*size+nx;
        if(!valid(nx,nz)||prev[nk]>=0)continue;
        const ax=Math.floor(x/8),az=Math.floor(z/8),bx=Math.floor(nx/8),bz=Math.floor(nz/8);
        if(ax!==bx||az!==bz){
          const a=scene.roomByCell.get(ax+','+az),b=scene.roomByCell.get(bx+','+bz);
          const gate=dx?z%8:x%8;
          if((a||b)&&(gate!==3&&gate!==4))continue;
          if(a&&!scene.doorMap.get(a.id).includes(DIR[dir])||b&&!scene.doorMap.get(b.id).includes(DIR[(dir+2)%4]))continue;
        }
        prev[nk]=k;queue.push(nk);
      }
    }
    if(prev[goal]<0)return [];
    const result=[];for(let k=goal;k!==start;k=prev[k])result.push([k%size+0.5,Math.floor(k/size)+0.5]);
    return result.reverse();
  }
  function create(canvas,callbacks={}) {
    if(!canvas)throw Error('A house scene canvas is required.');
    const abort=new AbortController(),points=new Map();let engine,disposed=false;
    let state={},scene=null,key='',frame=0,pickDirty=true,hover=0,pressed=null,pinch=null,ignoreMenuUntil=0;
    let first=true,lastTime=0,walk=[],player=null,playerMesh=null;
    let building=null,feedbackId=0,feedbackUntil=0;
    let cssW=0,cssH=0,width=0,height=0;
    const cam={x:28,z:28,height:0.62,yaw:-36,pitch:38,distance:16,zoom:1};
    let lastXY=null,lastHover='',lastError='';
    try{engine=makeGl(canvas)||software(canvas);}catch(e){callbacks.onError?.(String(e.message||e));throw e;}
    canvas.style.touchAction='none';canvas.tabIndex=0;
    const on=(name,handler,options={})=>canvas.addEventListener(name,handler,{...options,signal:abort.signal});
    const getCamera=()=>({yaw:(cam.yaw+360)%360,pitch:cam.pitch,zoom:cam.zoom,x:cam.x/ROOM,y:cam.z/ROOM,distance:cam.distance});
    const emit=()=>callbacks.onCamera?.(getCamera());
    function schedule(){if(!frame&&!disposed)frame=requestAnimationFrame(render);}
    function changed(){pickDirty=true;schedule();emit();}
    function adjustDistance(){
      const aspect=(cssW||canvas.clientWidth||640)/(cssH||canvas.clientHeight||420);
      cam.distance=Math.max(14.7,15.9/Math.max(aspect,0.36))/cam.zoom;
    }
    function followPlayer(){
      const center=player||overviewBounds(scene?.rooms||[]);
      if(cam.x===center.x&&cam.z===center.z)return;
      cam.x=center.x;
      cam.z=center.z;
      pickDirty=true;
      emit();
    }
    function enterRoom(id){
      const room=scene?.rooms.find(r=>r.id===id);
      if(!room)return false;
      initPlayer(room,true);
      followPlayer();
      changed();
      return true;
    }
    function rotateCamera(deg){cam.yaw=((cam.yaw+deg+180)%360+360)%360-180;changed();}
    function pitch(deg){cam.pitch=clamp(cam.pitch+deg,17,78);changed();}
    function zoom(factor){if(!(factor>0))return;cam.zoom=clamp(cam.zoom*factor,0.29,3.3);adjustDistance();changed();}
    function resetCamera(){
      cam.yaw=-36;
      cam.pitch=38;
      cam.zoom=1;
      adjustDistance();
      changed();
    }
    const playerFrames=new WeakMap();
    function updatePlayerMesh(action,elapsed){
      const mesh=window.HOUSE_MODELS?.player?.(action,elapsed);if(!mesh)return false;
      if(mesh!==playerMesh){
        let frame=playerFrames.get(mesh);
        if(!frame){const g=new Geometry();for(const part of Array.isArray(mesh)?mesh:[mesh])meshGeometry(g,part);frame=g.view();playerFrames.set(mesh,frame);}
        engine.setPlayer(frame);playerMesh=mesh;
      }return true;
    }
    function initPlayer(room,force=false){
      if(!room){player=null;walk=[];return;}
      const currentX=Math.floor(player?.x),currentZ=Math.floor(player?.z);
      const currentRoom=scene.roomByCell.get(Math.floor(currentX/ROOM)+','+Math.floor(currentZ/ROOM));
      if(!force&&player?.floor===state.floor&&(state.floor==='ground'||currentRoom)&&!scene.solid.has(currentX+','+currentZ))return;
      if(!updatePlayerMesh('idle',0))return;
      const centerX=room.x*ROOM+ROOM/2,centerZ=room.y*ROOM+ROOM/2;
      let spawn=null;
      let bestDistance=Infinity;
      for(let x=room.x*ROOM;x<(room.x+1)*ROOM;x++){
        for(let z=room.y*ROOM;z<(room.y+1)*ROOM;z++){
          if(scene.solid.has(x+','+z))continue;
          const distance=Math.hypot(x+0.5-centerX,z+0.5-centerZ);
          if(distance>=bestDistance)continue;
          spawn=[x+0.5,z+0.5];
          bestDistance=distance;
        }
      }
      if(!spawn)spawn=[centerX,centerZ];
      player={x:spawn[0],z:spawn[1],floor:state.floor,angle:Math.PI*0.75,bob:0};
      walk=[];
      building=null;
    }
    function setScene(next) {
      if(disposed)return;
      state={...next,floor:next.floor||'ground',buildMode:next.buildMode!==false};
      const signature=JSON.stringify([state.floor,state.buildMode,state.style,(state.rooms||[]).filter(r=>!r.floor||r.floor===state.floor).map(r=>[r.id,r.type,r.x,r.y,r.rotation,r.items])]);
      const hasData=!!window.HOUSE_MODELS&&!!window.POH_LOCATIONS;
      if(signature+'|'+hasData!==key){
        key=signature+'|'+hasData;scene=buildScene(state);engine.load(scene.vertices);scene.vertices=null;
        walk=[];building=null;feedbackId=0;hover=0;lastHover='';callbacks.onHover?.(null);pickDirty=true;
        const error=!hasData?'The game model or room placement data is unavailable.':'';
        if(error!==lastError){lastError=error;if(error)callbacks.onError?.(error);}
      }
      const chosen=scene.rooms.find(r=>r.id===state.selectedId)||scene.rooms[0];
      initPlayer(chosen);
      if(first){first=false;resetCamera();}
      followPlayer();
      schedule();
    }
    function updateSize(){
      const box=canvas.getBoundingClientRect();const w=Math.round(box.width),h=Math.round(box.height);
      if(!w||!h)return false;
      if(w!==cssW||h!==cssH){
        cssW=w;cssH=h;const ratio=engine.software?Math.min(1,660/w,520/h):Math.min(1.65,window.devicePixelRatio||1);
        width=Math.max(1,Math.round(w*ratio));height=Math.max(1,Math.round(h*ratio));
        engine.resize(width,height);adjustDistance();pickDirty=true;emit();
      }return true;
    }
    const skyColor=()=>scene.sky;
    function render(time){
      frame=0;if(disposed||document.hidden||!scene||!updateSize())return;
      const dt=clamp((time-lastTime)/1000,0,0.075);lastTime=time;
      if(walk.length&&player){
        const [tx,tz]=walk[0],dx=tx-player.x,dz=tz-player.z,dist=Math.hypot(dx,dz),step=dt*2.7;
        if(dist<step+0.001){player.x=tx;player.z=tz;walk.shift();}else{player.x+=dx/dist*step;player.z+=dz/dist*step;}
        player.angle=Math.atan2(-dx,dz);updatePlayerMesh(walk.length?'walk':'idle',time);
        followPlayer();
        if(walk.length||building)schedule();
      }
      if(building&&!walk.length&&player){
        if(building.start===null){building.start=time;player.angle=Math.atan2(player.x-building.x,building.z-player.z);}
        const elapsed=time-building.start;
        if(elapsed<(window.HOUSE_MODELS?.playerDuration?.('build')||2080)){updatePlayerMesh('build',elapsed);schedule();}
        else{building=null;updatePlayerMesh('idle',0);}
      }
      if(feedbackId&&time>=feedbackUntil)feedbackId=0;
      const v=view(cam,width,height);engine.draw(v,feedbackId||hover,skyColor(),false,player);
      if(feedbackId)schedule();
      if(lastXY&&!pressed&&!points.size&&!walk.length&&pickDirty)updateHover(...lastXY);
    }
    function hit(clientX,clientY){
      if(!scene||!updateSize())return {id:0,target:null};
      const b=canvas.getBoundingClientRect(),x=(clientX-b.left)*width/cssW,y=(clientY-b.top)*height/cssH;
      if(x<0||x>=width||y<0||y>=height)return {id:0,target:null};
      const v=view(cam,width,height);
      if(pickDirty){
        if(engine.software)engine.draw(v,hover,skyColor(),false,player);
        else engine.draw(v,0,skyColor(),true,null);
        pickDirty=false;
      }
      const id=engine.pick(x,y);let target=scene.targets[id];if(!target)return {id:0,target:null};
      const p=groundPoint(x,y,width,height,v);
      // A tall object can cover another room's ground. Limit the walk tile to the picked room.
      if(p){
        const gx=target.kind==='door'?scene.rooms.find(r=>r.id===target.roomId)?.x:target.x;
        const gy=target.kind==='door'?scene.rooms.find(r=>r.id===target.roomId)?.y:target.y;
        target={...target,tileX:clamp(Math.floor(p[0]),gx*8,gx*8+7),tileY:clamp(Math.floor(p[1]),gy*8,gy*8+7)};
      }
      return {id,target};
    }
    function updateHover(x,y){
      const {id,target}=hit(x,y);
      if(id!==hover){hover=id;schedule();}
      const label=id+'-'+(target?.tileX??'')+'-'+(target?.tileY??'');
      if(label!==lastHover){lastHover=label;callbacks.onHover?.(target);}
      canvas.style.cursor=target?.kind==='hotspot'||target?.kind==='door'?'pointer':'grab';
    }
    function walkTo(target){
      if(!player||!target||!scene)return false;
      const destination=[target.tileX??target.x*8+4,target.tileY??target.y*8+4];
      if(destination.some(n=>!Number.isFinite(n)))return false;
      const route=pathTo(scene,[player.x,player.z],destination);
      if(!route.length)return Math.floor(player.x)===Math.floor(destination[0])&&Math.floor(player.z)===Math.floor(destination[1]);
      building=null;walk=route;lastTime=performance.now();schedule();return true;
    }
    function buildAt({roomId,slot}={}){
      const cells=scene?.slotCells.get(roomId+'\n'+slot);if(!cells?.length)return false;
      const room=scene.rooms.find(r=>r.id===roomId);if(!room)return false;
      const cell=player?[...cells].sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0]:cells[0];
      feedbackId=cell.id;feedbackUntil=performance.now()+680;schedule();
      if(!player)return false;
      const possible=[];
      for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
        const x=Math.floor(cell.x)+dx,z=Math.floor(cell.z)+dz;
        if(Math.floor(x/8)!==room.x||Math.floor(z/8)!==room.y||scene.solid.has(x+','+z))continue;
        const distance=Math.hypot(x+0.5-cell.x,z+0.5-cell.z);
        if(distance>Math.max(cell.w,cell.d)*0.5+1.45)continue;
        possible.push({x,z,dist:distance+Math.hypot(x+0.5-player.x,z+0.5-player.z)*0.18});
      }
      possible.sort((a,b)=>a.dist-b.dist);
      for(const p of possible){
        const here=Math.floor(player.x)===p.x&&Math.floor(player.z)===p.z;
        const route=here?[]:pathTo(scene,[player.x,player.z],[p.x,p.z]);
        if(!here&&!route.length)continue;
        building={x:cell.x,z:cell.z,start:null};walk=route;lastTime=performance.now();schedule();return true;
      }
      return false;
    }
    function pick(e){
      const result=hit(e.clientX,e.clientY);
      if(result.target)callbacks.onPick?.(result.target,e);
    }
    function fingers(){
      const [a,b]=Array.from(points.values());return Math.hypot(a.x-b.x,a.y-b.y);
    }
    on('pointerdown',e=>{
      canvas.focus({preventScroll:true});
      points.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
      if(points.size>=2){pinch=fingers();if(pressed)pressed.dragged=true;return;}
      pressed={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,button:e.button,dragged:false};
    });
    on('pointermove',e=>{
      lastXY=[e.clientX,e.clientY];
      if(points.has(e.pointerId))points.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(points.size>=2){
        const cur=fingers();
        if(pinch>3&&cur>3)zoom(cur/pinch);
        pinch=cur;return;
      }
      if(!pressed){if(e.pointerType!=='touch')updateHover(e.clientX,e.clientY);return;}
      if(pressed.id!==e.pointerId)return;
      if(Math.hypot(e.clientX-pressed.x,e.clientY-pressed.y)>4)pressed.dragged=true;
      if(pressed.dragged){
        const dx=e.clientX-pressed.lastX,dy=e.clientY-pressed.lastY;canvas.style.cursor='grabbing';
        rotateCamera(-dx*0.36);pitch(dy*0.24);
      }
      pressed.lastX=e.clientX;pressed.lastY=e.clientY;
    });
    function release(e,cancel=false){
      points.delete(e.pointerId);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      if(points.size<2)pinch=null;
      if(pressed?.id===e.pointerId){if(pressed.dragged)ignoreMenuUntil=performance.now()+300;else if(!cancel&&pressed.button===0)pick(e);pressed=null;}
      canvas.style.cursor='grab';
    }
    on('pointerup',e=>release(e));on('pointercancel',e=>release(e,true));
    on('pointerleave',()=>{if(!points.size){lastXY=null;lastHover='';hover=0;callbacks.onHover?.(null);schedule();}});
    on('contextmenu',e=>{e.preventDefault();if(performance.now()>ignoreMenuUntil&&!pressed?.dragged){pick(e);if(pressed)pressed.dragged=true;}});
    on('wheel',e=>{e.preventDefault();zoom(Math.exp(-clamp(e.deltaY,-160,160)*0.00165));},{passive:false});
    on('keydown',e=>{
      if(e.ctrlKey||e.metaKey||e.altKey)return;
      const key=e.key.toLowerCase();
      if(key==='arrowleft')rotateCamera(-6);
      else if(key==='arrowright')rotateCamera(6);
      else if(key==='arrowup')pitch(4);
      else if(key==='arrowdown')pitch(-4);
      else if(key==='+'||key==='=')zoom(1.12);
      else if(key==='-')zoom(1/1.12);
      else if(key==='home')resetCamera();
      else return;
      e.preventDefault();
    });
    on('webglcontextlost',e=>{e.preventDefault();callbacks.onError?.('The 3D graphics context was interrupted.');});
    on('webglcontextrestored',()=>{engine=makeGl(canvas);cssW=0;key='';playerMesh=null;setScene(state);});
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;observer?.observe(canvas);
    document.addEventListener('visibilitychange',schedule,{signal:abort.signal});
    return {setScene,enterRoom,resetCamera,rotate:rotateCamera,pitch,zoom,getCamera,walkTo,buildAt,
      dispose(){disposed=true;abort.abort();observer?.disconnect();cancelAnimationFrame(frame);engine.dispose();}};
  }
  const thumbnails=new Map();
  function drawThumbnail(canvas,spec={}) {
    if(!canvas||!window.HOUSE_MODELS)return false;
    const target=canvas.getBoundingClientRect?.(),ratio=Math.min(1.6,window.devicePixelRatio||1);
    const w=clamp(Math.round(target?.width?target.width*ratio:canvas.width||80),16,320);
    const h=clamp(Math.round(target?.height?target.height*ratio:canvas.height||80),16,300);
    const key=JSON.stringify([w,h,spec.kind,spec.roomType,spec.slot,spec.name,spec.modelId,spec.rotation,spec.items,spec.style]);
    let picture=thumbnails.get(key);
    if(!picture){
      let vertices;
      if(spec.kind==='room'){
        if(!roomData(spec.roomType,spec.style))return false;
        const r={id:'preview',type:spec.roomType,x:0,y:0,floor:'ground',rotation:spec.rotation||0,items:spec.items||{}};
        vertices=buildScene({rooms:[r],floor:'ground',style:spec.style,noYard:true,buildMode:false}).vertices;
      }else{
        let mesh=spec.modelId!=null?getMesh(spec.modelId,spec.shape??10):null;
        if(!mesh){
          let locations=roomData(spec.roomType,spec.style)?.locations||[];
          if(spec.slot)locations=locations.filter(l=>l.hotspot===spec.slot);
          if(!locations.length&&!spec.roomType)locations=Object.values(window.POH_LOCATIONS?.rooms||{}).flatMap(r=>r.locations);
          let best=-1;
          for(const loc of locations){
            if(!loc.options||!Object.hasOwn(loc.options,spec.name))continue;
            const m=getMesh(chooseLoc(loc,{name:spec.name},spec.items||{}),loc.shape);
            if(m&&m.faces.length>best){mesh=m;best=m.faces.length;}
          }
        }
        if(!mesh)return false;
        const g=new Geometry();meshGeometry(g,mesh,{angle:(spec.rotation||0)*Math.PI/2});vertices=g.view();
      }
      if(!vertices.length)return false;
      let xmin=Infinity,ymin=Infinity,zmin=Infinity,xmax=-Infinity,ymax=-Infinity,zmax=-Infinity;
      for(let i=0;i<vertices.length;i+=STRIDE){
        xmin=Math.min(xmin,vertices[i]);ymin=Math.min(ymin,vertices[i+1]);zmin=Math.min(zmin,vertices[i+2]);
        xmax=Math.max(xmax,vertices[i]);ymax=Math.max(ymax,vertices[i+1]);zmax=Math.max(zmax,vertices[i+2]);
      }
      const c={x:(xmin+xmax)/2,z:(zmin+zmax)/2,height:(ymin+ymax)/2,yaw:-35,pitch:spec.kind==='room'?42:24,distance:5};
      const v=view(c,w,h);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,extZ=0;
      for(let i=0;i<vertices.length;i+=STRIDE){
        const p=[vertices[i]-c.x,vertices[i+1]-c.height,vertices[i+2]-c.z],x=dot(p,v.right),y=dot(p,v.up);
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);extZ=Math.max(extZ,Math.abs(dot(p,v.forward)));
      }
      const dx=(minX+maxX)/2,dy=(minY+maxY)/2;
      v.target=v.target.map((q,i)=>q+dx*v.right[i]+dy*v.up[i]);
      // Long lens mimics the game's inventory model camera and keeps silhouettes readable.
      v.f=12;v.distance=Math.max(0.4,Math.max((maxX-minX)/v.aspect,maxY-minY)*0.55*v.f+extZ);
      const frame=rasterFrame(w,h,null);rasterize(vertices,v,frame);
      picture=frame.buf;thumbnails.set(key,picture);
      if(thumbnails.size>320)thumbnails.delete(thumbnails.keys().next().value);
    }
    const ctx=canvas.getContext('2d');if(!ctx)return false;
    canvas.width=w;canvas.height=h;
    const image=ctx.createImageData(w,h);image.data.set(picture);ctx.putImageData(image,0,0);return true;
  }
  window.POHWorld=Object.freeze({create,drawThumbnail});
})();
