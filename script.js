import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/STLLoader.js';
import { STLExporter } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/STLExporter.js';

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
let scene, camera, renderer, controls, modelRoot, currentModel = 'phantom';
let exploded = false, blueprint = false, wireframe = false, selectedPart = null;
let partEntries = [], importedObject = null, toastTimer;
const palette = { pcb: 0x167d89, shroud: 0x293a50, fan: 0x111b2a, metal: 0x8a9fb7, accent: 0x5ee7ef, purple: 0x8e6df0, port: 0xc2d1df };
const modelSpecs = {
  phantom: { title: 'Phantom GPU · Demo', length: 280, width: 115, height: 48, fans: 3 },
  compact: { title: 'Compact GPU · Demo', length: 205, width: 112, height: 39, fans: 2 },
  workstation: { title: 'Workstation Card · Demo', length: 240, width: 105, height: 38, fans: 1 }
};
const material = (color, extra={}) => new THREE.MeshStandardMaterial({ color, metalness: extra.metalness ?? .35, roughness: extra.roughness ?? .42, wireframe: wireframe });
function addBox(parent, name, size, pos, color, opts={}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, opts));
  mesh.name = name; mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function addCylinder(parent, name, radius, depth, pos, color, axis='y') {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 40), material(color, {metalness:.55,roughness:.3}));
  mesh.name=name; mesh.position.set(...pos);
  if(axis==='z') mesh.rotation.x=Math.PI/2;
  parent.add(mesh); return mesh;
}
function createFan(parent, index, x, z) {
  const group = new THREE.Group(); group.name = `Cooling fan ${index+1}`; group.position.set(x, .18, z); parent.add(group);
  addCylinder(group, 'Fan frame', .49, .10, [0,0,0], 0x101b2a);
  addCylinder(group, 'Fan hub', .15, .12, [0,.06,0], palette.metal);
  for(let i=0;i<9;i++){
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.12,.045,.34),material(i%2?0x3e5871:0x5a7189));
    blade.position.set(0,.075,.28); blade.rotation.y=i*Math.PI*2/9; blade.rotation.z=.20; group.add(blade);
  }
  group.userData.partType='fan'; return group;
}
function clearModel() {
  if (modelRoot) { scene.remove(modelRoot); modelRoot.traverse(o=>{if(o.geometry)o.geometry.dispose(); if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}}); }
  partEntries=[]; selectedPart=null; importedObject=null;
}
function registerPart(object, label, detail, color, offset) {
  object.userData.label=label; object.userData.detail=detail; object.userData.color=color; object.userData.explodeOffset=offset;
  partEntries.push(object);
}
function buildGPU(type) {
  clearModel(); currentModel=type; exploded=false;
  const spec=modelSpecs[type]; const scale=spec.length/280;
  modelRoot=new THREE.Group(); modelRoot.name=spec.title; scene.add(modelRoot);
  const length=2.8*scale, width=1.05*(spec.width/115), boardY=-.08;
  const pcb=new THREE.Group(); pcb.name='PCB board';
  addBox(pcb,'PCB substrate',[length,.09,width],[0,boardY,0],palette.pcb,{metalness:.1,roughness:.7});
  // Board traces and chips are decorative demo geometry.
  for(let i=0;i<8;i++) addBox(pcb,'Circuit trace',[.025,.012,.36],[(-.95+i*.26)*scale,boardY+.055,-.22],0x65d5d0);
  addBox(pcb,'GPU package',[.66,.12,.57],[-.12,boardY+.10,0],0x18212d);
  addBox(pcb,'GPU die',[.40,.035,.34],[-.12,boardY+.18,0],0x5c6e83);
  for(let i=0;i<6;i++) addBox(pcb,'Memory module',[.20,.055,.16],[-.88+i*.30,boardY+.095,.32],0x303e52);
  addBox(pcb,'PCIe connector',[length*.62,.045,.12],[.05,boardY-.07,width*.48],0xd9b968);
  registerPart(pcb,'PCB + electronics','Printed circuit board, GPU package and decorative memory modules',palette.pcb,[0,-.28,0]); modelRoot.add(pcb);

  const cooler=new THREE.Group(); cooler.name='Cooler shroud';
  addBox(cooler,'Shroud shell',[length,.17,width*.87],[0,.18,0],palette.shroud,{metalness:.5,roughness:.32});
  addBox(cooler,'Front accent strip',[length*.78,.025,.035],[0,.275,-width*.43],palette.accent);
  registerPart(cooler,'Cooler shroud','Outer cooler housing · illustrative shape',palette.shroud,[0,.48,0]); modelRoot.add(cooler);

  const fans=new THREE.Group(); fans.name='Cooling fans';
  const fanCount=spec.fans, span=length*.72, start=-span/2;
  for(let i=0;i<fanCount;i++){ const x=fanCount===1?0:start+i*(span/(fanCount-1)); createFan(fans,i,x,0); }
  registerPart(fans,'Cooling fans',`${fanCount} decorative fan assemblies`,palette.purple,[0,.82,0]); modelRoot.add(fans);

  const heatsink=new THREE.Group(); heatsink.name='Heatsink';
  addBox(heatsink,'Heatsink base',[length*.68,.09,width*.55],[0,.01,0],palette.metal);
  for(let i=0;i<13;i++) addBox(heatsink,'Cooling fin',[.035,.18,width*.50],[-length*.31+i*(length*.62/12),.12,0],0x71869c,{metalness:.7,roughness:.3});
  registerPart(heatsink,'Heatsink','Base plate and decorative cooling fins',palette.metal,[0,-.82,0]); modelRoot.add(heatsink);

  const io=new THREE.Group(); io.name='I/O bracket';
  addBox(io,'I/O bracket',[.10,.55,width*.90],[-length*.53,.02,0],0x64768c,{metalness:.7});
  for(let i=0;i<3;i++) addBox(io,'Display port',[.06,.09,.13],[-length*.59,-.08+i*.15,.05],0x111722);
  registerPart(io,'I/O bracket','Display connector side · port details are decorative',0x64768c,[-.52,0,0]); modelRoot.add(io);

  const backplate=new THREE.Group(); backplate.name='Backplate';
  addBox(backplate,'Backplate panel',[length*.95,.055,width*.82],[0,-.20,0],0x35475d,{metalness:.55});
  for(let i=0;i<7;i++) addBox(backplate,'Backplate vent',[.04,.012,width*.35],[-length*.35+i*length*.115,-.166,0],0x101a29);
  registerPart(backplate,'Backplate','Rear support plate with decorative vents',0x35475d,[0,-.55,0]); modelRoot.add(backplate);

  // Keep each logical component in a named group so parts can be hidden/exploded.
  modelRoot.scale.set(1,1,1);
  $('modelTitle').textContent=spec.title;
  $('lengthValue').textContent=`${spec.length} mm`; $('widthValue').textContent=`${spec.width} mm`; $('heightValue').textContent=`${spec.height} mm`;
  $('componentValue').textContent=String(partEntries.length);
  $('partCount').textContent=`${partEntries.length} parts`;
  renderPartsList(); setExploded(false); setBlueprint(blueprint); setWireframe(wireframe); fitCamera();
  document.querySelectorAll('.model-card').forEach(c=>c.classList.toggle('selected',c.dataset.model===type));
  $('loadingNote').style.display='none';
}
function renderPartsList(){
  const list=$('partsList'); list.innerHTML='';
  partEntries.forEach((part,index)=>{
    const row=document.createElement('div'); row.className='part-row'+(part===selectedPart?' selected':'');
    const swatch=document.createElement('span'); swatch.className='part-swatch'; swatch.style.background='#'+part.userData.color.toString(16).padStart(6,'0');
    const info=document.createElement('div'); info.className='part-info';
    const b=document.createElement('b'); b.textContent=part.userData.label;
    const small=document.createElement('small'); small.textContent=part.userData.detail; info.append(b,small);
    const select=document.createElement('button'); select.textContent='⌖'; select.title='Highlight component'; select.onclick=()=>selectPart(part);
    const eye=document.createElement('button'); eye.textContent=part.visible?'◉':'⊘'; eye.title='Show/hide component'; eye.onclick=()=>{part.visible=!part.visible;eye.textContent=part.visible?'◉':'⊘';};
    row.append(swatch,info,select,eye); row.onclick=(e)=>{if(e.target!==select&&e.target!==eye)selectPart(part);}; list.append(row);
  });
}
function selectPart(part){selectedPart=part; renderPartsList(); partEntries.forEach(p=>p.traverse(o=>{if(o.isMesh){o.material.emissive=new THREE.Color(p===part?0x163e49:0x000000);o.material.emissiveIntensity=p===part?.55:0;}})); toast(`Selected: ${part.userData.label}`);}
function setExploded(value){exploded=value;partEntries.forEach(part=>{const target=value?part.userData.explodeOffset:[0,0,0];part.position.set(...target);});$('explodeLabel').textContent=value?'Exploded apart':'Parts assembled';$('explodeBtn').classList.toggle('active',value);if(value)toast('Exploded view enabled');}
function setBlueprint(value){blueprint=value;viewport.classList.toggle('blueprint-mode',value);$('blueprintBtn').classList.toggle('active',value);if(value){camera.position.set(0,4.6,0.01);camera.up.set(0,0,-1);camera.lookAt(0,0,0);controls.target.set(0,0,0);controls.update();}else{camera.up.set(0,1,0);fitCamera();} }
function setWireframe(value){wireframe=value;scene.traverse(o=>{if(o.isMesh&&o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.wireframe=value);else o.material.wireframe=value;}});$('wireBtn').classList.toggle('active',value);}
function fitCamera(){if(!camera||!controls)return;camera.position.set(3.8,2.6,4.5);camera.up.set(0,1,0);controls.target.set(0,0,0);camera.lookAt(0,0,0);controls.update();}
function init3D(){
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x0b1321);
  camera=new THREE.PerspectiveCamera(42,viewport.clientWidth/viewport.clientHeight,.1,100);camera.position.set(3.8,2.6,4.5);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setSize(viewport.clientWidth,viewport.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
  viewport.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=2;controls.maxDistance=12;
  scene.add(new THREE.HemisphereLight(0xb9e5ff,0x172032,2));
  const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(3,5,4);scene.add(key);
  const rim=new THREE.PointLight(0x5ee7ef,18,12);rim.position.set(-3,1,2);scene.add(rim);
  const floor=new THREE.GridHelper(10,30,0x2a4861,0x1b2b40);floor.position.y=-1.1;scene.add(floor);
  const animate=()=>{requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};animate();
  window.addEventListener('resize',()=>{const w=viewport.clientWidth,h=viewport.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);});
}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function exportSTL(){
  const exporter=new STLExporter();const exportRoot=new THREE.Group();
  const visibleParts=partEntries.filter(p=>p.visible);
  if(importedObject){exportRoot.add(importedObject.clone());}
  else visibleParts.forEach(p=>exportRoot.add(p.clone(true)));
  exportRoot.updateMatrixWorld(true);
  const result=exporter.parse(exportRoot,{binary:true});
  downloadBlob(new Blob([result],{type:'application/octet-stream'}),'3d-model-studio.stl');toast('STL export prepared');
}
function importSTL(file){
  if(!file)return;const reader=new FileReader();
  reader.onload=()=>{try{
    const geometry=new STLLoader().parse(reader.result);geometry.computeVertexNormals();
    clearModel();modelRoot=new THREE.Group();modelRoot.name=file.name;
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x5ee7ef,metalness:.3,roughness:.45,side:THREE.DoubleSide}));
    mesh.name=file.name;modelRoot.add(mesh);scene.add(modelRoot);importedObject=modelRoot;
    const box=new THREE.Box3().setFromObject(modelRoot),size=box.getSize(new THREE.Vector3());
    $('modelTitle').textContent=file.name;$('lengthValue').textContent=`${(size.x*100).toFixed(1)} mm`;$('widthValue').textContent=`${(size.z*100).toFixed(1)} mm`;$('heightValue').textContent=`${(size.y*100).toFixed(1)} mm`;
    partEntries=[modelRoot];modelRoot.userData.label='Imported STL';modelRoot.userData.detail='Imported mesh · dimensions depend on source units';modelRoot.userData.color=palette.accent;modelRoot.userData.explodeOffset=[0,0,0];
    $('partCount').textContent='1 mesh';$('componentValue').textContent='1';renderPartsList();fitCamera();toast('STL imported. Check source units before fabrication.');
  }catch(e){console.error(e);toast('Could not read this STL file. Try a valid STL.');}};
  reader.readAsArrayBuffer(file);
}
function blueprintSVG(){
 const s=modelSpecs[currentModel],w=900,h=460,scale=1.8,cardW=s.length*scale,cardH=s.width*scale;
 const x=(w-cardW)/2,y=(h-cardH)/2;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#07172d"/><g stroke="#244b71" stroke-width="1" opacity=".7">${Array.from({length:31},(_,i)=>`<path d="M ${i*30} 0 V ${h}"/>`).join('')}${Array.from({length:16},(_,i)=>`<path d="M 0 ${i*30} H ${w}"/>`).join('')}</g><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="12" fill="#0c314c" stroke="#61e7f0" stroke-width="3"/><rect x="${x+20}" y="${y+18}" width="${cardW-40}" height="${cardH-36}" rx="8" fill="none" stroke="#6aa6c6" stroke-width="2"/>${Array.from({length:s.fans},(_,i)=>{const cx=x+cardW*(i+1)/(s.fans+1),cy=y+cardH/2;return `<circle cx="${cx}" cy="${cy}" r="${Math.min(cardH*.34,cardW/(s.fans*3))}" fill="none" stroke="#61e7f0" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="8" fill="#61e7f0"/>`;}).join('')}<g fill="#c6faff" font-family="monospace" font-size="16"><text x="28" y="35">3D MODEL STUDIO / CONCEPT BLUEPRINT</text><text x="${x}" y="${y-22}">LENGTH: ${s.length} mm (illustrative)</text><text x="${x}" y="${y+cardH+28}">WIDTH: ${s.width} mm · DEMO DRAWING / NOT MANUFACTURER CAD</text></g><g stroke="#61e7f0" stroke-width="1.5" fill="none"><path d="M ${x} ${y-8} V ${y-28} M ${x+cardW} ${y-8} V ${y-28} M ${x} ${y-18} H ${x+cardW}"/><path d="M ${x-15} ${y} H ${x-35} M ${x-15} ${y+cardH} H ${x-35} M ${x-25} ${y} V ${y+cardH}"/></g></svg>`;
 downloadBlob(new Blob([svg],{type:'image/svg+xml'}),'gpu-concept-blueprint.svg');toast('Blueprint SVG downloaded');
}
function addChat(text,who){const el=document.createElement('div');el.className=`chat-bubble ${who}`;el.textContent=text;$('chatMessages').appendChild(el);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}
function handleChat(message){
 const q=message.toLowerCase();
 if(q.includes('explode')){setExploded(true);addChat('Exploded view is on. The demo components have moved apart.','bot');}
 else if(q.includes('assemble')||q.includes('reset parts')){setExploded(false);addChat('Components returned to their assembled positions.','bot');}
 else if(q.includes('blueprint')){setBlueprint(true);addChat('Blueprint top view enabled. Use “3D view” to return to perspective.','bot');}
 else if(q.includes('3d view')||q==='3d'){setBlueprint(false);addChat('Perspective 3D view enabled.','bot');}
 else if(q.includes('wireframe')){setWireframe(!wireframe);addChat(`Wireframe ${wireframe?'enabled':'disabled'}.`,'bot');}
 else if(q.includes('reset view')){setBlueprint(false);fitCamera();addChat('Camera view reset.','bot');}
 else if(q.includes('export')&&q.includes('stl')){exportSTL();addChat('STL export started.','bot');}
 else if(q.includes('fan')){const fan=partEntries.find(p=>(p.userData.label||'').toLowerCase().includes('cooling fans'));if(fan){selectPart(fan);addChat('Selected the cooling fan group in the component tree.','bot');}else addChat('This imported model does not have named fan components.','bot');}
 else addChat('I can run local commands: “explode parts”, “assemble parts”, “blueprint”, “3D view”, “wireframe”, “reset view”, or “export STL”. For natural-language AI design, connect a secure AI backend later.','bot');
}
init3D();buildGPU('phantom');
$('explodeBtn').onclick=()=>setExploded(!exploded);
$('assembleBtn').onclick=()=>setExploded(false);
$('resetViewBtn').onclick=()=>{setBlueprint(false);fitCamera();};
$('view3dBtn').onclick=()=>setBlueprint(false);
$('blueprintBtn').onclick=()=>setBlueprint(!blueprint);
$('wireBtn').onclick=()=>setWireframe(!wireframe);
$('downloadStlBtn').onclick=exportSTL;
$('downloadBlueprintBtn').onclick=blueprintSVG;
$('stlInput').addEventListener('change',e=>importSTL(e.target.files?.[0]));
document.querySelectorAll('.model-card').forEach(c=>c.addEventListener('click',()=>{blueprint=false;wireframe=false;buildGPU(c.dataset.model);}));
$('chatForm').addEventListener('submit',e=>{e.preventDefault();const input=$('chatInput');const message=input.value.trim();if(!message)return;addChat(message,'user');input.value='';handleChat(message);});
$('themeBtn').onclick=()=>document.body.classList.toggle('light');
  
