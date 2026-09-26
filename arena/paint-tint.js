import * as THREE from 'three';

// Models own their geometry, but campaign materials may be shared. Only clone
// the paint emissive material; retain the authored wood, metal and skin colors.
export function createPaintTint(models) {
    const vertices=[],emissives=[];
    const authored=[new THREE.Color(0x2f62d8),new THREE.Color(0x3a5aa8)];
    for(const model of Object.values(models))model.traverse(object=>{
        const colors=object.geometry?.attributes.color;
        if(colors){
            const indices=[];
            for(let i=0;i<colors.count;i++){
                const shade=authored.findIndex(c=>Math.abs(colors.getX(i)-c.r)+Math.abs(colors.getY(i)-c.g)+Math.abs(colors.getZ(i)-c.b)<.001);
                if(shade>=0)indices.push([i,shade===1?.75:1]);
            }
            if(indices.length)vertices.push({colors,indices});
        }
        if(object.material?.emissive?.getHex()===0x0f2a80){object.material=object.material.clone();emissives.push(object.material);}
    });
    let previous;
    return color=>{
        if(color===previous)return;previous=color;
        const tint=new THREE.Color(color);
        for(const {colors,indices} of vertices){for(const [i,shade] of indices)colors.setXYZ(i,tint.r*shade,tint.g*shade,tint.b*shade);colors.needsUpdate=true;}
        for(const material of emissives)material.emissive.copy(tint).multiplyScalar(.3);
    };
}
