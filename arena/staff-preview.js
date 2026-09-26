import * as THREE from 'three';
import {buildArenaBody, attachArenaWeapon, updateArenaBodyPose, setArenaToolPaint} from '../src/arena/arena-models.js';
import {buildViewmodels} from '../src/viewmodels.js';
import {createPaintTint} from './paint-tint.js';
import {COLORS,PRESETS} from '../shared/arena/rules.js';

export function createStaffPreview(canvas) {
    const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffe9cd,0x4b5363,2));
    const key=new THREE.DirectionalLight(0xffffff,2.5);key.position.set(2,3,4);scene.add(key);
    const rim=new THREE.DirectionalLight(0xc8d8ff,1.5);rim.position.set(-2,1,-2);scene.add(rim);
    const camera=new THREE.PerspectiveCamera(33,1,.01,10);
    const bodies=Object.entries(PRESETS).map(([preset,value])=>{
        const body=buildArenaBody({variant:value.model});
        attachArenaWeapon(body,'paintbrush');scene.add(body.group);return {preset,body};
    });
    let selected='guard',color='brass',mode='staff',weapon='paintbrush',staffTool='paintbrush',width=0,height=0;
    let yaw=.35,zoom=1,walking=false,rotating=false,lastTime=0,models=null,tint=null;
    const tools={};
    let renderedKey=null,frames=0;
    let pointer=null;
    canvas.addEventListener('pointerdown',event=>{pointer=event.clientX;canvas.setPointerCapture(event.pointerId);});
    canvas.addEventListener('pointermove',event=>{if(pointer===null)return;yaw+=(event.clientX-pointer)*.015;pointer=event.clientX;});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{pointer=null;});
    canvas.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();yaw+=event.key==='ArrowLeft'?-.3:.3;}});
    function loadTools(){
        if(models)return;
        models=buildViewmodels();tint=createPaintTint(models);
        for(const [name,model] of Object.entries(models)){
            model.traverse(object=>object.layers.set(0));
            const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
            const wrapper=new THREE.Group(),scale=1.05/Math.max(size.x,size.y,size.z);
            model.position.sub(center);wrapper.add(model);wrapper.scale.setScalar(scale);wrapper.position.y=.5;
            scene.add(wrapper);tools[name]=wrapper;
        }
    }
    return {
        stats(){return {frames,modelsLoaded:!!models,geometries:renderer.info.memory.geometries};},
        set(preset,paint){selected=preset;color=paint;},
        inspect(value){mode=value;yaw=.35;if(mode==='weapons')loadTools();},
        weapon(value){weapon=value;},
        staffTool(value){staffTool=value;},
        rotate(amount){yaw+=amount;},
        reset(){yaw=.35;zoom=1;rotating=false;},
        zoom(value){zoom=value;},
        walk(value){walking=value;},
        spin(value){rotating=value;},
        render(time){
            const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
            if(w!==width||h!==height){width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
            if(rotating)yaw+=Math.min(.05,Math.max(0,time-lastTime))*.5;lastTime=time;
            const frameKey=[w,h,selected,color,mode,weapon,staffTool,yaw,zoom,walking&&mode==='staff'?time:0].join('|');
            if(renderedKey===frameKey)return;renderedKey=frameKey;frames++;
            // Fit tall characters and long tools even in a narrow preview column.
            const distance=Math.max(2.15,1.05/camera.aspect)/zoom;
            camera.position.set(0,.62,distance);camera.lookAt(0,.5,0);
            for(const entry of bodies){entry.body.group.visible=mode==='staff'&&entry.preset===selected;if(!entry.body.group.visible)continue;
                attachArenaWeapon(entry.body,staffTool);
                setArenaToolPaint(entry.body.weapon,COLORS[color]);
                entry.body.flashMats[0].color.setHex(COLORS[color]);entry.body.flashMats[1].color.copy(entry.body.flashMats[0].color).multiplyScalar(.6);
                updateArenaBodyPose(entry.body,{time,yaw,phase:time*8,alive:true,movement:walking?1:0});
            }
            tint?.(COLORS[color]);
            for(const [name,tool] of Object.entries(tools)){tool.visible=mode==='weapons'&&name===weapon;tool.rotation.y=yaw;}
            renderer.render(scene,camera);
        }
    };
}
