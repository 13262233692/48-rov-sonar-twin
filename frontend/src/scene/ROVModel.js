import * as THREE from 'three';
import { QuatMath } from '../utils/math.js';

export class ROVModel {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.manipulatorSegments = [];
    this._build();
    this.scene.add(this.root);
  }

  _build() {
    const hullMat = new THREE.MeshPhongMaterial({ color: 0xff6b35, shininess: 60, specular: 0x333333 });
    const frameMat = new THREE.MeshPhongMaterial({ color: 0x5a6778, shininess: 30 });
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x7ee7ff, transparent: true, opacity: 0.6, shininess: 100, specular: 0xffffff });
    const armMat = new THREE.MeshPhongMaterial({ color: 0x3a4758, shininess: 50 });
    const clawMat = new THREE.MeshPhongMaterial({ color: 0xc0c5cc, shininess: 80 });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.0), hullMat);
    this.root.add(hull);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.2), frameMat);
    frame.position.y = -0.42;
    this.root.add(frame);

    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x0088aa, shininess: 100 }));
      t.position.set((i % 2 === 0 ? -1 : 1) * 0.6, 0.3, (i < 2 ? -1 : 1) * 0.35);
      this.root.add(t);
    }

    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
    dome.position.set(0, 0.35, 0.25);
    this.root.add(dome);

    const transd = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.12, 24), new THREE.MeshPhongMaterial({ color: 0x1a1a1a }));
    transd.rotation.x = Math.PI / 2;
    transd.position.set(0, -0.48, -0.1);
    this.root.add(transd);

    const manipulator = new THREE.Group();
    manipulator.position.set(0.85, 0, -0.05);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.2, 18), armMat);
    manipulator.add(base);

    const seg1 = new THREE.Group();
    seg1.position.y = 0.1;
    const s1mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.75, 0.1), armMat);
    s1mesh.position.y = 0.375;
    seg1.add(s1mesh);
    manipulator.add(seg1);

    const joint1 = new THREE.Group();
    joint1.position.y = 0.75;
    const j1mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 14), clawMat);
    joint1.add(j1mesh);
    seg1.add(joint1);

    const seg2 = new THREE.Group();
    const s2mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.09), armMat);
    s2mesh.position.y = 0.3;
    seg2.add(s2mesh);
    joint1.add(seg2);

    const joint2 = new THREE.Group();
    joint2.position.y = 0.6;
    const j2mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 14), clawMat);
    joint2.add(j2mesh);
    seg2.add(joint2);

    const clawBase = new THREE.Group();
    const cBase = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.1), armMat);
    clawBase.add(cBase);
    const clawL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.04), clawMat);
    clawL.position.set(-0.06, 0.1, 0);
    clawBase.add(clawL);
    const clawR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.04), clawMat);
    clawR.position.set(0.06, 0.1, 0);
    clawBase.add(clawR);
    joint2.add(clawBase);

    this.root.add(manipulator);
    this.manipulatorSegments = [seg1, joint1, seg2, joint2, clawBase];
    this.body = hull;
    this.manipulator = manipulator;
  }

  update(quatArr, posArr, t = 0) {
    const [qw, qx, qy, qz] = quatArr;
    this.root.quaternion.set(qx, qy, qz, qw).normalize();
    this.root.position.set(posArr[0], posArr[1], posArr[2]);
    if (this.manipulatorSegments.length > 0) {
      this.manipulatorSegments[0].rotation.z = Math.sin(t * 1.1) * 0.35;
      this.manipulatorSegments[1].rotation.x = -0.7 - Math.sin(t * 1.4) * 0.25;
      this.manipulatorSegments[2].rotation.x = 1.1 + Math.cos(t * 1.2) * 0.35;
      this.manipulatorSegments[4].rotation.x = -0.4 + Math.sin(t * 2.5) * 0.2;
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
