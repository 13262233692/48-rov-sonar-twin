import * as THREE from 'three';
import { ROVModel } from './ROVModel.js';
import { SonarCloud } from './SonarCloud.js';

export class SceneEngine {
  constructor(canvas, dataBuffer) {
    this.canvas = canvas;
    this.dataBuffer = dataBuffer;
    this.running = false;
    this.t = 0;
    this.latestROV = null;
    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initLights();
    this._initEnvironment();
    this._initObjects();
    this._bindInput();
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onBuffer = this._onBuffer.bind(this);
    this._unsubBuffer = this.dataBuffer.subscribe(this._onBuffer);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000a18);
    this.scene.fog = new THREE.FogExp2(0x001122, 0.012);
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      62, this.canvas.clientWidth / this.canvas.clientHeight, 0.05, 500
    );
    this.cameraRig = new THREE.Group();
    this.cameraHolder = new THREE.Group();
    this.cameraHolder.position.set(0, 3.8, 12);
    this.cameraHolder.add(this.camera);
    this.cameraRig.add(this.cameraHolder);
    this.scene.add(this.cameraRig);
    this._camDist = 12;
    this._camYaw = 0.4;
    this._camPitch = 0.22;
    this._targetLook = new THREE.Vector3();
  }

  _initLights() {
    const amb = new THREE.AmbientLight(0x1a2a40, 0.45);
    this.scene.add(amb);
    const hemi = new THREE.HemisphereLight(0x66aaff, 0x002033, 0.35);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xaaccff, 0.5);
    sun.position.set(20, 40, 30);
    this.scene.add(sun);

    this.rovLight = new THREE.SpotLight(0x7ee7ff, 2.2, 80, Math.PI / 5, 0.5, 1.2);
    this.rovLight.position.set(0, 1, 5);
    this.rovLight.target.position.set(0, 0, 0);
    this.cameraRig.add(this.rovLight);
    this.cameraRig.add(this.rovLight.target);
  }

  _initEnvironment() {
    const caveMat = new THREE.MeshStandardMaterial({
      color: 0x1a2530,
      roughness: 0.95,
      metalness: 0.05,
    });
    const caveGroup = new THREE.Group();

    for (let i = 0; i < 8; i++) {
      const seg = new THREE.Mesh(new THREE.TorusGeometry(30 + Math.random() * 10, 20 + Math.random() * 8, 12, 48, Math.PI), caveMat);
      seg.rotation.x = Math.PI / 2;
      seg.position.set(-50 + i * 14, -2, -5 + Math.random() * 10);
      seg.scale.set(1, 0.65 + Math.random() * 0.2, 1);
      caveGroup.add(seg);
    }

    for (let i = 0; i < 120; i++) {
      const h = 2 + Math.random() * 8;
      const stal = new THREE.Mesh(new THREE.ConeGeometry(0.4 + Math.random() * 1.5, h, 8), caveMat);
      stal.position.set(
        -60 + Math.random() * 120,
        20 + Math.random() * 6,
        -40 + Math.random() * 80
      );
      stal.rotation.z = (Math.random() - 0.5) * 0.3;
      caveGroup.add(stal);
    }

    for (let i = 0; i < 80; i++) {
      const h = 1 + Math.random() * 5;
      const r = 0.3 + Math.random() * 1.2;
      const rock = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), caveMat);
      rock.rotation.x = Math.PI;
      rock.position.set(
        -50 + Math.random() * 100,
        -20,
        -30 + Math.random() * 70
      );
      caveGroup.add(rock);
    }

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 160, 64, 48), new THREE.MeshStandardMaterial({
      color: 0x0f1822, roughness: 1, metalness: 0
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -22;
    const pos = floor.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, pos.getZ(i) + (Math.random() - 0.5) * 1.2);
    }
    pos.needsUpdate = true;
    floor.geometry.computeVertexNormals();
    caveGroup.add(floor);

    this.scene.add(caveGroup);
    this.caveGroup = caveGroup;

    const grid = new THREE.GridHelper(80, 40, 0x0a2540, 0x061828);
    grid.position.y = -21.8;
    this.scene.add(grid);

    this.axesHelper = new THREE.AxesHelper(3);
    this.scene.add(this.axesHelper);
  }

  _initObjects() {
    this.rov = new ROVModel(this.scene);
    this.sonar = new SonarCloud(this.scene, { maxInstances: 256 * 1200 });
  }

  _bindInput() {
    const canvas = this.canvas;
    this._dragging = false;
    this._lastX = 0; this._lastY = 0;
    canvas.addEventListener('mousedown', (e) => { this._dragging = true; this._lastX = e.clientX; this._lastY = e.clientY; });
    canvas.addEventListener('mouseup', () => this._dragging = false);
    canvas.addEventListener('mouseleave', () => this._dragging = false);
    canvas.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX; this._lastY = e.clientY;
      this._camYaw -= dx * 0.005;
      this._camPitch = Math.max(0.02, Math.min(1.45, this._camPitch - dy * 0.004));
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._camDist = Math.max(3, Math.min(60, this._camDist + e.deltaY * 0.015));
    }, { passive: false });
  }

  _onBuffer(ping) {
    this.latestROV = { quat: ping.rov.quat.slice(), pos: ping.rov.pos.slice() };
    this.sonar.pushPing(ping, this.t);
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._loop();
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.t += dt;
    this._update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    if (this.latestROV) {
      this.rov.update(this.latestROV.quat, this.latestROV.pos, this.t);
      const p = this.latestROV.pos;
      this._targetLook.lerp(new THREE.Vector3(p[0], p[1], p[2]), 1 - Math.pow(0.001, dt));
    }
    const cx = this._targetLook.x + this._camDist * Math.sin(this._camYaw) * Math.cos(this._camPitch);
    const cy = this._targetLook.y + this._camDist * Math.sin(this._camPitch);
    const cz = this._targetLook.z + this._camDist * Math.cos(this._camYaw) * Math.cos(this._camPitch);
    this.cameraRig.position.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.pow(0.0005, dt));
    this.camera.lookAt(this._targetLook);
    this.sonar.updateFade(dt);
  }

  getStatus() {
    return {
      rovPos: this.latestROV ? this.latestROV.pos : [0, 0, 0],
      beamCount: this.dataBuffer.pings.length,
      t: this.t,
    };
  }

  clearSonar() { this.sonar.clearAll(); this.dataBuffer.clear(); }

  stop() {
    this.running = false;
    window.removeEventListener('resize', this._onResize);
    if (this._unsubBuffer) this._unsubBuffer();
  }

  dispose() {
    this.stop();
    this.rov.dispose();
    this.sonar.dispose();
    this.renderer.dispose();
  }
}
