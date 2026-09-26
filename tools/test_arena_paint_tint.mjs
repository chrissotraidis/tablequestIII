import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPaintTint} from '../arena/paint-tint.js';
const blue=new THREE.Color(0x2f62d8),wood=new THREE.Color(0x81582d);
const geometry=new THREE.BufferGeometry();
geometry.setAttribute('color',new THREE.Float32BufferAttribute([...blue.toArray(),...wood.toArray()],3));
const original=new THREE.MeshStandardMaterial({emissive:0x0f2a80});
const mesh=new THREE.Mesh(geometry,original),tint=createPaintTint({mesh});
assert.notEqual(mesh.material,original,'Clone shared material before recoloring');
for(const color of [0xb52d3c,0x2e9b68,0xc9a227]){
 tint(color);const expected=new THREE.Color(color),attribute=geometry.attributes.color;
 for(let i=0;i<3;i++){assert(Math.abs(attribute.array[i]-expected.toArray()[i])<1e-6);assert(Math.abs(attribute.array[i+3]-wood.toArray()[i])<1e-6,'Wood remains authored');}
 assert.equal(original.emissive.getHex(),0x0f2a80,'Campaign material remains untouched');
 const version=attribute.version;tint(color);assert.equal(attribute.version,version,'Unchanged paint does not upload again');
}
console.log('Arena paint tint: PASS (repeat choices, preserved wood, isolated materials, no redundant uploads)');
