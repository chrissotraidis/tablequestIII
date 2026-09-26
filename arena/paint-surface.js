import * as THREE from 'three';
// Decals belong only on permanent rendered planes. Collision volumes are not
// surfaces: furniture and moving doors use short-lived particles instead.
export function findPaintSurface(meshes, position, normal, size=.34) {
    if(normal.lengthSq()<.5) return null;
    const n=normal.clone().normalize(),ray=new THREE.Raycaster();
    const cast=(p,offset=.18,depth=.4)=>{
        ray.set(p.clone().addScaledVector(n,offset),n.clone().negate());ray.near=0;ray.far=depth;
        const hit=ray.intersectObjects(meshes,false)[0];
        if(!hit?.face)return null;
        const hitNormal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        return hitNormal.dot(n)>.98 ? hit : null;
    };
    const hit=cast(position);if(!hit)return null;
    const u=new THREE.Vector3().crossVectors(n,Math.abs(n.y)>.9 ? new THREE.Vector3(0,0,1) : new THREE.Vector3(0,1,0)).normalize();
    const v=new THREE.Vector3().crossVectors(n,u);
    // Bound the entire randomly rotated quad, shrinking at doorways and edges.
    for(let candidate=size;candidate>=.025;candidate*=.5){
        const fits=[[-1,-1],[-1,1],[1,-1],[1,1]].every(([x,y])=>{
            const point=hit.point.clone().addScaledVector(u,x*candidate*.72).addScaledVector(v,y*candidate*.72);
            const corner=cast(point,.05,.1);return corner && Math.abs(corner.point.clone().sub(hit.point).dot(n))<.015;
        });
        if(fits)return {position:hit.point,normal:n,size:candidate};
    }
    return null;
}
