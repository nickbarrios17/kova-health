(function(){
if (customElements.get('gym-mannequin')) return;
let threeP;
function loadThree(){
  if (window.THREE) return Promise.resolve(window.THREE);
  if (!threeP) threeP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/three@0.149.0/build/three.min.js';
    s.onload = () => res(window.THREE); s.onerror = rej;
    document.head.appendChild(s);
  });
  return threeP;
}
const ACC = 0x9184d9;
const MUS = { cuadriceps:'Cuádriceps', isquios:'Isquiotibiales', gluteos:'Glúteos', gemelos:'Gemelos', abdomen:'Abdomen', lumbar:'Lumbares', pecho:'Pectorales', dorsales:'Dorsales', trapecio:'Trapecio', hombros:'Deltoides', biceps:'Bíceps', triceps:'Tríceps', antebrazo:'Antebrazos' };
const VIEWS = { front: 0, '34': 0.75, side: Math.PI / 2 };
const ease = x => x * x * (3 - 2 * x);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const PER = 3.4;
const KEYS = ['lumb','thor','hip','hipZ','knee','kneeZ','ank','shx','shz','elx','elz','lift'];
function phaseAt(f){
  if (f < .08) return [0, 0];
  if (f < .48) return [ease((f - .08) / .4), 1];
  if (f < .58) return [1, 0];
  if (f < .96) return [1 - ease((f - .58) / .38), 2];
  return [0, 0];
}
const EXS = {
  squat: { bar:'back', rack:true, c1:false, ty:.8, R:4.3, l1:'Bajada controlada', l2:'Subida · empuja el suelo', ang:[['knee','Rodilla'],['hip','Cadera']],
    act:{ cuadriceps:1, gluteos:1, isquios:.5, lumbar:.5, abdomen:.4, gemelos:.3 },
    a:{ lumb:.06, thor:.06, hip:-.12, knee:.2, shx:.35, shz:1.2, elz:2.15 },
    b:{ lumb:.32, thor:.3, hip:-1.85, knee:2.1, shx:.35, shz:1.2, elz:2.15 },
    faults:[
      { m:['cuadriceps','gemelos'], f:k => ({ hipZ:-.2*k, kneeZ:.42*k }) },
      { m:['gemelos'], f:k => ({ ank:.42*k, lift:.05*k }) },
      { m:['lumbar','abdomen'], f:k => ({ lumb:.5*k, thor:.28*k }) } ] },
  deadlift: { bar:'hand', c1:true, ty:.75, R:4.3, l1:'Subida · empuja y extiende cadera', l2:'Bajada · cadera atrás', ang:[['hip','Cadera'],['knee','Rodilla']],
    act:{ isquios:1, gluteos:1, lumbar:1, trapecio:.6, dorsales:.6, cuadriceps:.5, antebrazo:.5 },
    a:{ lumb:.6, thor:.55, hip:-1.55, knee:1.75, shx:-1.15, shz:.1 },
    b:{ lumb:-.02, thor:-.01, hip:.02, knee:.04, shx:.03, shz:.1 },
    faults:[
      { m:['dorsales','antebrazo'], f:k => ({ shx:-.35*(1-k*.4) }) },
      { m:['isquios','lumbar'], f:k => { const s = Math.sin(Math.PI*k); return { knee:-.7*s, lumb:.3*s, thor:.2*s, shx:-.35*s }; } },
      { m:['biceps','antebrazo'], f:k => ({ elx:-.85+.25*k }) } ] },
  bench: { bar:'hand', lying:true, c1:false, ty:.6, R:4.2, l1:'Bajada al pecho', l2:'Empuje', ang:[['elbow','Codo']],
    act:{ pecho:1, triceps:.8, hombros:.6 },
    a:{ shx:-1.57, shz:.28, elz:-.28, hip:.15, knee:1.4 },
    b:{ shx:.05, shz:.28, elx:-1.62, elz:-.28, hip:.15, knee:1.4 },
    faults:[
      { m:['pecho'], f:k => ({ shx:.16*k*k, elx:-.12*k*k }) },
      { m:['gluteos','lumbar'], f:k => { const s = .5+.5*k; return { lift:.07*s, lumb:-.17*s, hip:.3*s }; } },
      { m:['hombros'], f:k => ({ shz:1.0*k, elz:-1.0*k }) } ] },
  ohp: { bar:'hand', c1:true, ty:1.0, R:4.8, l1:'Empuje hacia arriba', l2:'Bajada a clavículas', ang:[['elbow','Codo']],
    act:{ hombros:1, triceps:.8, trapecio:.5, abdomen:.5 },
    a:{ shx:-.55, shz:.2, elx:-2.45, elz:-.2 },
    b:{ shx:-3.0, shz:.12, elx:-.08, elz:-.12 },
    faults:[
      { m:['lumbar','abdomen'], f:k => ({ lumb:-.32*k, thor:-.12*k }) },
      { m:['hombros'], f:k => ({ shx:.42*k }) },
      { m:['cuadriceps','gluteos'], f:(k, f) => { const d = f < .2 ? Math.sin(Math.PI*f/.2) : 0; return { knee:.55*d, hip:-.35*d }; } } ] },
  curl: { bar:'hand', short:true, c1:true, ty:.85, R:4.3, l1:'Subida sin balanceo', l2:'Bajada en 3 s', ang:[['elbow','Codo']],
    act:{ biceps:1, antebrazo:.6, hombros:.2 },
    a:{ shx:.05, shz:.12, elx:-.1 },
    b:{ shx:-.25, shz:.12, elx:-2.3 },
    faults:[
      { m:['lumbar'], f:k => { const s = Math.sin(Math.PI*k); return { lumb:-.25*s, thor:-.12*s }; } },
      { m:['hombros'], f:k => ({ shx:-.75*k }) },
      { m:['biceps'], f:k => ({ elx:-1.0*(1-k) }) } ] },
};
const IC = {
  play:'<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>',
  pause:'<svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/></svg>',
  reset:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
};
const CSS = `
:host{display:block;position:relative;width:100%;height:100%;user-select:none;-webkit-user-select:none;font-family:Inter,system-ui,sans-serif;color:#e6e8f2}
canvas{display:block;width:100%!important;height:100%!important;touch-action:none;cursor:grab}
canvas:active{cursor:grabbing}
button{font-family:inherit}
.top{position:absolute;top:10px;left:10px;right:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;pointer-events:none}
.right{display:flex;gap:6px;pointer-events:auto}
.info{display:flex;flex-direction:column;gap:6px;font-size:11px;color:#9397ab;padding-top:2px}
.hint{transition:opacity .4s}
.leg{display:flex;gap:10px;align-items:center;color:#cfd3e5}
.leg span{display:flex;align-items:center;gap:5px}
.sw{width:8px;height:8px;border-radius:2px;display:inline-block}
.seg{display:flex;border:1px solid rgba(255,255,255,.12);border-radius:8px;overflow:hidden;background:rgba(14,15,24,.72);backdrop-filter:blur(6px)}
.seg button{border:0;background:transparent;color:#9397ab;font-size:12px;font-weight:500;padding:7px 10px;cursor:pointer}
.seg button.on{background:rgba(145,132,217,.2);color:#d3ccfa}
.ic{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(14,15,24,.72);color:#cfd3e5;cursor:pointer;padding:0}
.bot{position:absolute;left:10px;right:10px;bottom:10px;display:flex;flex-direction:column;gap:6px}
.ph{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#cfd3e5;pointer-events:none;padding:0 2px}
.phl{display:flex;align-items:center;gap:7px}
.dot{width:6px;height:6px;border-radius:50%;background:#9184d9;box-shadow:0 0 10px #9184d9;display:inline-block;transition:background .2s}
.rep{color:#9397ab}
.ctl{display:flex;align-items:center;gap:8px}
.play{width:36px;height:36px;border-radius:10px;border:1px solid #9184d9;background:rgba(14,15,24,.75);color:#c4bbff;display:grid;place-items:center;cursor:pointer;flex:none;padding:0}
.spd{height:36px;min-width:48px;padding:0 8px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(14,15,24,.75);color:#cfd3e5;font-size:12px;cursor:pointer;flex:none}
.track{position:relative;flex:1;height:36px;cursor:pointer;touch-action:none}
.rail{position:absolute;left:0;right:0;top:16px;height:4px;border-radius:2px;overflow:hidden;display:flex;gap:2px}
.rail i{display:block;height:100%;border-radius:1px}
.thumb{position:absolute;top:10px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#eef0f8;box-shadow:0 0 0 4px rgba(145,132,217,.35),0 2px 6px rgba(0,0,0,.5)}
.angs{position:absolute;inset:0;pointer-events:none}
.ang{position:absolute;transform:translate(12px,-50%);font-size:11px;font-weight:600;color:#14151f;background:#c4bbff;padding:3px 7px;border-radius:6px;white-space:nowrap;font-variant-numeric:tabular-nums}
.tip{position:absolute;transform:translate(-50%,calc(-100% - 14px));background:rgba(22,23,34,.96);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:7px 10px;pointer-events:none;opacity:0;transition:opacity .2s;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.tip b{display:block;font-size:13px;font-weight:600}
.tip span{font-size:11px;color:#9397ab}
.load{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;color:#9397ab;pointer-events:none}
`;

class GymMannequin extends HTMLElement {
  static get observedAttributes() { return ['exercise','layer','angles','path','fault','seek','view']; }
  constructor() {
    super();
    this._ex = 'squat'; this._layer = 'normal'; this._angles = false; this._path = false; this._fault = -1; this._seek = ''; this._view = '34';
    this._playing = true; this._speed = 1; this._t = 0; this._fa = 0; this._fShown = -1; this._eff = .4; this._pts = []; this._lastRec = -1;
    this._yaw = this._tYaw = VIEWS['34']; this._pitch = this._tPitch = .13; this._zoom = this._tZoom = 1;
    const sh = this.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>${CSS}</style>
<div class="load">Cargando modelo 3D…</div>
<div class="angs"></div>
<div class="tip"><b></b><span></span></div>
<div class="top">
  <div class="info">
    <span class="hint">Arrastra para girar · toca un músculo</span>
    <span class="leg lm"><span><i class="sw" style="background:#c4bbff"></i>Principal</span><span><i class="sw" style="background:#5a528f"></i>Secundario</span></span>
    <span class="leg lf"><span><i class="sw" style="background:#e5826f"></i>Tu forma</span><span><i class="sw" style="background:rgba(145,132,217,.35);outline:1px solid #9184d9"></i>Correcta</span></span>
    <span class="leg lp"><span><i class="sw" style="background:#c4bbff;height:2px;width:12px"></i>Barra</span><span><i class="sw" style="border-top:1px dashed #9397ab;height:0;width:12px;border-radius:0"></i>Vertical ideal</span></span>
  </div>
  <div class="right"><div class="seg"><button data-v="front">Frente</button><button data-v="34">3/4</button><button data-v="side">Lado</button></div><button class="ic reset" aria-label="Restablecer vista">${IC.reset}</button></div>
</div>
<div class="bot">
  <div class="ph"><span class="phl"><i class="dot"></i><span class="phase"></span></span><span class="rep"></span></div>
  <div class="ctl"><button class="play"></button><button class="spd"></button><div class="track"><div class="rail"></div><div class="thumb"></div></div></div>
</div>`;
    this.$ = s => sh.querySelector(s);
    sh.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => this._setView(b.dataset.v)));
    this.$('.reset').addEventListener('click', () => this._setView(this._lastView || '34'));
    this.$('.play').addEventListener('click', () => this._setPlaying(!this._playing));
    this.$('.spd').addEventListener('click', () => { this._speed = this._speed === 1 ? .5 : this._speed === .5 ? .25 : 1; this._syncUI(); });
    const tr = this.$('.track');
    const seekX = e => { const r = tr.getBoundingClientRect(); const f = clamp((e.clientX - r.left) / r.width, 0, .999); this._t = Math.floor(this._t / PER) * PER + f * PER; };
    tr.addEventListener('pointerdown', e => { tr.setPointerCapture(e.pointerId); this._scrub = true; this._setPlaying(false); seekX(e); });
    tr.addEventListener('pointermove', e => { if (this._scrub) seekX(e); });
    const end = () => { this._scrub = false; };
    tr.addEventListener('pointerup', end); tr.addEventListener('pointercancel', end);
    this._syncUI();
  }
  attributeChangedCallback(n, o, v) { this._set(n, v); }
  _set(n, v) {
    const b = x => !(x === false || x === 'false' || x == null || x === '');
    if (n === 'exercise') { if (v && v !== this._ex && EXS[v]) { this._ex = v; this._t = 0; this._fa = 0; this._fShown = -1; this._pts = []; this._applyEx && this._applyEx(); } }
    else if (n === 'layer') this._layer = v === 'muscles' ? 'muscles' : 'normal';
    else if (n === 'angles') this._angles = b(v);
    else if (n === 'path') { const p = b(v); if (p !== this._path) this._pts = []; this._path = p; }
    else if (n === 'fault') { let i = parseInt(v, 10); if (isNaN(i)) i = -1; if (i !== this._fault) { this._fault = i; this._pts = []; if (i >= 0) this._setPlaying(true); } }
    else if (n === 'seek') { if (v && v !== this._seek) { this._seek = v; const t = parseFloat(v); if (!isNaN(t)) { this._t = Math.floor(this._t / PER) * PER + t * PER; this._setPlaying(false); } } }
    else if (n === 'view') this._setView(v);
    this._syncUI();
  }
  _setPlaying(p) { this._playing = p; this._syncUI(); }
  _setView(v) {
    if (VIEWS[v] == null) return;
    const tgt = VIEWS[v], TAU = Math.PI * 2;
    this._tYaw = tgt + TAU * Math.round((this._tYaw - tgt) / TAU);
    this._tPitch = .13; this._tZoom = 1; this._view = v; this._lastView = v; this._syncUI();
  }
  _syncUI() {
    const $ = this.$, P = EXS[this._ex];
    this.shadowRoot.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.v === this._view));
    $('.play').innerHTML = this._playing ? IC.pause : IC.play;
    $('.play').setAttribute('aria-label', this._playing ? 'Pausar' : 'Reproducir');
    $('.spd').textContent = (this._speed === 1 ? '1' : this._speed === .5 ? '0,5' : '0,25') + '×';
    $('.lm').style.display = this._layer === 'muscles' ? 'flex' : 'none';
    $('.lf').style.display = this._fault >= 0 ? 'flex' : 'none';
    $('.lp').style.display = this._path ? 'flex' : 'none';
    const ecc = 'rgba(145,132,217,.45)', con = '#9184d9', pau = 'rgba(255,255,255,.1)';
    const c1 = P.c1 ? con : ecc, c2 = P.c1 ? ecc : con;
    const key = this._ex;
    if (this._railKey !== key) {
      this._railKey = key;
      $('.rail').innerHTML = [[8, pau], [40, c1], [10, pau], [38, c2], [4, pau]].map(([w, c]) => `<i style="width:${w}%;background:${c}"></i>`).join('');
      $('.angs').innerHTML = P.ang.map(() => '<span class="ang"></span>').join('');
    }
  }
  connectedCallback() { loadThree().then(T => { if (this.isConnected && !this._r) this._init(T); }); }
  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    this._ro && this._ro.disconnect();
    if (this._r) { this._r.dispose(); this._r.domElement.remove(); this._r = null; }
  }

  _init(T) {
    if (T.ColorManagement) T.ColorManagement.legacyMode = false;
    const r = new T.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setClearColor(0x000000, 0);
    r.outputEncoding = T.sRGBEncoding;
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    this.shadowRoot.insertBefore(r.domElement, this.shadowRoot.firstElementChild.nextSibling);
    this._r = r; this._T = T;
    this.$('.load').style.display = 'none';
    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 60); this._cam = cam;

    const pm = new T.PMREMGenerator(r), env = new T.Scene();
    env.add(new T.Mesh(new T.BoxGeometry(12, 12, 12), new T.MeshBasicMaterial({ color: 0x0c0d14, side: T.BackSide })));
    const pan = (rgb, pos, size) => { const m = new T.Mesh(new T.PlaneGeometry(size[0], size[1]), new T.MeshBasicMaterial({ side: T.DoubleSide })); m.material.color.setRGB(rgb[0], rgb[1], rgb[2]); m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0, 0, 0); env.add(m); };
    pan([1.6, 1.6, 1.75], [0, 5, 1], [5, 3]); pan([.6, .5, 1.3], [-5, 1.5, -2], [2, 4]); pan([.8, .8, .9], [5, 2, 3], [2, 3]);
    scene.environment = pm.fromScene(env, .04).texture; pm.dispose();

    scene.add(new T.HemisphereLight(0xdfe2f5, 0x0e0f18, .5));
    const key = new T.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 3); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0005; key.shadow.normalBias = .02;
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.4, bottom: -2 }); scene.add(key);
    const rim = new T.DirectionalLight(ACC, 2.0); rim.position.set(-3, 2.5, -3); scene.add(rim);
    const fill = new T.DirectionalLight(0xbfc6ff, .35); fill.position.set(-3, 1, 3); scene.add(fill);

    const floor = new T.Mesh(new T.CircleGeometry(1.6, 72), new T.MeshStandardMaterial({ color: 0x111220, roughness: .9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const grid = new T.PolarGridHelper(1.55, 12, 5, 72, 0x2c2e44, 0x22243a); grid.position.y = .002;
    grid.material.transparent = true; grid.material.opacity = .5; scene.add(grid);
    const ring = new T.Mesh(new T.RingGeometry(1.57, 1.6, 120), new T.MeshBasicMaterial({ color: ACC, transparent: true, opacity: .5 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .003; scene.add(ring);

    // body
    const limb = (len, r0, r1, bulge, seg = 24) => {
      const pts = [], N = 20;
      for (let i = N; i >= 0; i--) { const t = i / N, cap = Math.pow(Math.sin(Math.PI * t), .32); const rr = (r0 + (r1 - r0) * t + bulge * Math.sin(Math.PI * t)) * cap; pts.push(new T.Vector2(Math.max(rr, 1e-4), -t * len)); }
      return new T.LatheGeometry(pts, seg);
    };
    const G = {
      sph: new T.SphereGeometry(1, 28, 20),
      uarm: limb(.29, .052, .04, .004), bic: limb(.2, .032, .026, .012), tri: limb(.22, .036, .022, .01),
      farm: limb(.27, .046, .028, .008), thigh: limb(.45, .088, .056, .008), quad: limb(.36, .062, .04, .016), ham: limb(.34, .056, .034, .01),
      shin: limb(.44, .058, .034, 0), calf: limb(.24, .046, .022, .016), erec: limb(.16, .03, .03, .004), neck: limb(.1, .05, .045, 0),
      foot: new T.CapsuleGeometry(.04, .13, 6, 14),
    };
    const skin = new T.MeshPhysicalMaterial({ color: 0x6c7188, roughness: .5, clearcoat: .3, clearcoatRoughness: .5, sheen: .5, sheenColor: new T.Color(0xc9cdf0), sheenRoughness: .6 });
    const mus = {}; Object.keys(MUS).forEach(k => { mus[k] = skin.clone(); });
    const ghostM = new T.MeshBasicMaterial({ color: ACC, transparent: true, opacity: .18, depthWrite: false });
    this._skin = skin; this._mus = mus; this._ghostM = ghostM;

    const build = (skinM, musM, ghost) => {
      const meshes = [];
      const add = (parent, geo, mat, pos, scl, rot, mu) => {
        const m = new T.Mesh(geo, mat); m.position.set(pos[0], pos[1], pos[2]);
        if (scl) m.scale.set(scl[0], scl[1], scl[2]); if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
        m.castShadow = !ghost; if (mu) m.userData.mus = mu; if (ghost) m.renderOrder = 2;
        parent.add(m); meshes.push(m); return m;
      };
      const M = n => ghost ? skinM : musM[n];
      const root = new T.Group();
      add(root, G.sph, skinM, [0, 0, 0], [.165, .11, .12]);
      [1, -1].forEach(s => add(root, G.sph, M('gluteos'), [.065 * s, -.035, -.07], [.085, .09, .075], null, 'gluteos'));
      const lumb = new T.Group(); lumb.position.set(0, .06, 0); root.add(lumb);
      add(lumb, G.sph, skinM, [0, .1, 0], [.14, .14, .1]);
      add(lumb, G.sph, M('abdomen'), [0, .1, .066], [.085, .12, .04], null, 'abdomen');
      [1, -1].forEach(s => add(lumb, G.erec, M('lumbar'), [.04 * s, .18, -.07], null, null, 'lumbar'));
      const thor = new T.Group(); thor.position.set(0, .2, 0); lumb.add(thor);
      add(thor, G.sph, skinM, [0, .14, 0], [.17, .17, .115]);
      [1, -1].forEach(s => {
        add(thor, G.sph, M('pecho'), [.075 * s, .2, .08], [.085, .065, .045], [0, 0, -.25 * s], 'pecho');
        add(thor, G.sph, M('dorsales'), [.115 * s, .12, -.055], [.06, .14, .05], [0, 0, .25 * s], 'dorsales');
      });
      add(thor, G.sph, M('trapecio'), [0, .275, -.045], [.12, .06, .06], null, 'trapecio');
      add(thor, G.neck, skinM, [0, .4, 0]);
      add(thor, G.sph, skinM, [0, .47, .01], [.088, .105, .098]);
      add(thor, G.sph, skinM, [0, .415, .03], [.065, .045, .065]);
      const anchor = new T.Object3D(); anchor.position.set(0, .3, -.12); thor.add(anchor);
      const limbs = {};
      [1, -1].forEach(s => {
        const sh = new T.Group(); sh.position.set(.2 * s, .27, 0); thor.add(sh);
        add(sh, G.sph, M('hombros'), [.012 * s, -.01, 0], [.07, .078, .072], null, 'hombros');
        add(sh, G.uarm, skinM, [0, -.01, 0]);
        add(sh, G.bic, M('biceps'), [0, -.05, .022], null, null, 'biceps');
        add(sh, G.tri, M('triceps'), [0, -.04, -.024], null, null, 'triceps');
        const el = new T.Group(); el.position.set(0, -.29, 0); sh.add(el);
        add(el, G.farm, M('antebrazo'), [0, 0, 0], null, null, 'antebrazo');
        const hand = add(el, G.sph, skinM, [0, -.29, 0], [.042, .055, .04]);
        const hip = new T.Group(); hip.position.set(.095 * s, -.05, 0); root.add(hip);
        add(hip, G.thigh, skinM, [0, 0, 0]);
        add(hip, G.quad, M('cuadriceps'), [0, -.05, .032], null, null, 'cuadriceps');
        add(hip, G.ham, M('isquios'), [0, -.06, -.03], null, null, 'isquios');
        const kn = new T.Group(); kn.position.set(0, -.43, 0); hip.add(kn);
        add(kn, G.shin, skinM, [0, 0, 0]);
        add(kn, G.calf, M('gemelos'), [0, -.03, -.03], null, null, 'gemelos');
        const ank = new T.Group(); ank.position.set(0, -.43, 0); kn.add(ank);
        add(ank, G.foot, skinM, [0, -.035, .06], [1.15, 1, .75], [Math.PI / 2, 0, 0]);
        limbs[s] = { sh, el, hip, kn, ank, hand };
      });
      scene.add(root);
      return { root, lumb, thor, anchor, limbs, meshes };
    };
    this._B = build(skin, mus, false);
    this._Gh = build(ghostM, null, true);

    // equipment
    const steel = new T.MeshStandardMaterial({ color: 0xd0d3de, metalness: 1, roughness: .28 });
    const plateM = new T.MeshStandardMaterial({ color: 0x232532, roughness: .55, metalness: .1 });
    const rimM = new T.MeshStandardMaterial({ color: ACC, roughness: .4, emissive: 0x2a2550, emissiveIntensity: .5 });
    const cyl = (rad, h, m, seg = 32) => { const me = new T.Mesh(new T.CylinderGeometry(rad, rad, h, seg), m); me.rotation.z = Math.PI / 2; me.castShadow = true; return me; };
    const mkBar = (len, sIn, plates) => {
      const g = new T.Group(), half = len / 2;
      g.add(cyl(.014, sIn * 2, steel, 16));
      [1, -1].forEach(s => {
        const sl = cyl(.025, half - sIn, steel, 20); sl.position.x = s * (sIn + (half - sIn) / 2); g.add(sl);
        const c0 = cyl(.04, .03, steel, 24); c0.position.x = s * (sIn + .015); g.add(c0);
        let x = sIn + .035;
        plates.forEach(([pr, w]) => {
          const p = cyl(pr, w, plateM, 56); p.position.x = s * (x + w / 2); g.add(p);
          const rb = cyl(pr + .002, w * .35, rimM, 56); rb.position.x = s * (x + w / 2); g.add(rb);
          const hub = cyl(.05, w + .006, steel, 24); hub.position.x = s * (x + w / 2); g.add(hub);
          x += w + .005;
        });
        const c1 = cyl(.035, .025, steel, 24); c1.position.x = s * (x + .0125); g.add(c1);
      });
      scene.add(g); return g;
    };
    this._barL = mkBar(2.0, .52, [[.225, .05], [.18, .035]]);
    this._barS = mkBar(1.2, .3, [[.12, .03], [.1, .025]]);

    const rackM = new T.MeshStandardMaterial({ color: 0x2a2c3a, metalness: .7, roughness: .4 });
    const boxIn = grp => (w, h, d, x, y, z, m) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m || rackM); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; grp.add(b); return b; };
    const rack = new T.Group(), rb = boxIn(rack);
    [1, -1].forEach(s => { rb(.07, 2.05, .07, .52 * s, 1.025, -.6); rb(.07, .04, .7, .52 * s, .02, -.4); rb(.05, .05, .12, .52 * s, 1.38, -.53, steel); rb(.04, .04, .6, .52 * s, .6, -.3, steel); });
    rb(1.11, .07, .07, 0, 2.05, -.6); scene.add(rack); this._rack = rack;
    const bench = new T.Group(), bb = boxIn(bench);
    const padM = new T.MeshStandardMaterial({ color: 0x26283a, roughness: .7 });
    bb(.34, .08, 1.15, 0, .41, -.25, padM); bb(.12, .37, .12, 0, .185, .15); bb(.12, .37, .12, 0, .185, -.65); bb(.5, .04, .1, 0, .02, .15); bb(.5, .04, .1, 0, .02, -.65);
    [1, -1].forEach(s => { bb(.06, 1.2, .06, .48 * s, .6, -.62); bb(.05, .05, .1, .48 * s, 1.1, -.56, steel); bb(.06, .04, .5, .48 * s, .02, -.62); });
    scene.add(bench); this._bench = bench;

    // overlays
    const PN = 150; this._PN = PN;
    const pGeo = new T.BufferGeometry(); pGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(PN * 3), 3));
    const pLine = new T.Line(pGeo, new T.LineBasicMaterial({ color: 0xc4bbff, transparent: true, opacity: .95, depthTest: false }));
    pLine.renderOrder = 10; pLine.frustumCulled = false; scene.add(pLine); this._pLine = pLine;
    const refGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 2.2, 0)]);
    const ref = new T.Line(refGeo, new T.LineDashedMaterial({ color: 0x9397ab, dashSize: .05, gapSize: .04, transparent: true, opacity: .7, depthTest: false }));
    ref.computeLineDistances(); ref.renderOrder = 9; scene.add(ref); this._ref = ref;
    this._angLines = [0, 1].map(() => {
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(9), 3));
      const l = new T.Line(g, new T.LineBasicMaterial({ color: 0xc4bbff, transparent: true, depthTest: false })); l.renderOrder = 11; l.frustumCulled = false; scene.add(l); return l;
    });

    const C = this._C = {};
    Object.entries({ skinN: 0x7a7f96, skinM: 0x1b1d29, musN: 0x959ab2, accL: 0xb3a9f3, acc: ACC, lo: 0x3f3970, hi: 0xc4bbff, off: 0x2b2e3e, err: 0xe5826f, white: 0xffffff }).forEach(([k, v]) => { C[k] = new T.Color(v); });
    this._v = new T.Vector3(); this._v2 = new T.Vector3(); this._v3 = new T.Vector3(); this._v4 = new T.Vector3();
    this._ray = new T.Raycaster();

    this._applyEx = () => {
      const P = EXS[this._ex];
      this._rack.visible = !!P.rack; this._bench.visible = !!P.lying;
      this._barL.visible = !P.short; this._barS.visible = !!P.short;
      this._syncUI();
    };
    this._applyEx();

    // input
    const cv = r.domElement, ptrs = new Map(); let drag = null, pinch = null;
    const dist = () => { const a = [...ptrs.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1; };
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      else if (ptrs.size === 2) { pinch = { d: dist(), z: this._tZoom }; drag = null; }
    });
    cv.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2 && pinch) { this._tZoom = clamp(pinch.z * pinch.d / dist(), .55, 1.5); return; }
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) { drag.moved = true; this.$('.hint').style.opacity = 0; this._view = null; this._syncUI(); }
      if (drag.moved) {
        this._tYaw -= (e.clientX - drag.x) * .01;
        this._tPitch = clamp(this._tPitch + (e.clientY - drag.y) * .006, -.1, 1.25);
        drag.x = e.clientX; drag.y = e.clientY;
      }
    });
    const up = e => {
      if (drag && !drag.moved && ptrs.size === 1) this._tap(e);
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => {
      if (!(e.ctrlKey || this.clientHeight > 480)) return;
      e.preventDefault(); this._tZoom = clamp(this._tZoom * Math.exp(e.deltaY * .002), .55, 1.5);
    }, { passive: false });
    cv.addEventListener('dblclick', () => this._setView(this._lastView || '34'));

    const size = () => { const w = this.clientWidth || 300, h = this.clientHeight || 300; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    this._ro = new ResizeObserver(size); this._ro.observe(this); size();

    let last = performance.now();
    const phEl = this.$('.phase'), repEl = this.$('.rep'), thumb = this.$('.thumb'), dot = this.$('.dot');
    const loop = now => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (this._playing && !this._scrub) this._t += dt * this._speed;
      const P = EXS[this._ex], f = (((this._t % PER) + PER) % PER) / PER;
      const [k, ph] = phaseAt(f);
      const want = this._fault >= 0 && P.faults[this._fault];
      if (want) this._fShown = this._fault;
      this._fa += ((want ? 1 : 0) - this._fa) * Math.min(1, dt * 5);
      const FD = this._fShown >= 0 && P.faults[this._fShown] ? P.faults[this._fShown] : null;
      const base = {}; KEYS.forEach(n => { const a = P.a[n] || 0, b = P.b[n] || 0; base[n] = a + (b - a) * k; });
      const pose = Object.assign({}, base);
      if (FD && this._fa > .001) { const d = FD.f(k, f); for (const n in d) pose[n] += d[n] * this._fa; }
      this._poseBody(this._B, P, pose);
      const gv = this._fa > .01; this._Gh.root.visible = gv;
      if (gv) { this._poseBody(this._Gh, P, base); ghostM.opacity = .2 * this._fa; }

      const v = this._v, v2 = this._v2, L = this._B.limbs;
      const bar = P.short ? this._barS : this._barL;
      if (P.bar === 'back') this._B.anchor.getWorldPosition(v);
      else { L[1].hand.getWorldPosition(v); L[-1].hand.getWorldPosition(v2); v.add(v2).multiplyScalar(.5); }
      bar.position.copy(v);

      const conc = (ph === 1 && P.c1) || (ph === 2 && !P.c1);
      this._eff += ((ph === 0 ? .3 : conc ? 1 : .6) - this._eff) * Math.min(1, dt * 4);
      this._paint(P, now, FD);

      // bar path
      if (this._path) {
        if (!this._pts.length || Math.abs(this._t - this._lastRec) >= PER / PN) {
          this._pts.push(v.clone()); this._lastRec = this._t;
          if (this._pts.length > PN) this._pts.shift();
          const arr = this._pLine.geometry.attributes.position.array;
          this._pts.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
          this._pLine.geometry.attributes.position.needsUpdate = true;
          this._pLine.geometry.setDrawRange(0, this._pts.length);
        }
        L[1].ank.getWorldPosition(v2); this._ref.position.set(0, 0, v2.z + .06);
      }
      this._pLine.visible = this._path && this._pts.length > 1;
      this._ref.visible = this._path && !P.lying;

      // camera
      const sm = Math.min(1, dt * 10);
      this._yaw += (this._tYaw - this._yaw) * sm; this._pitch += (this._tPitch - this._pitch) * sm; this._zoom += (this._tZoom - this._zoom) * sm;
      const R = P.R / Math.sqrt(Math.min(1, cam.aspect * 1.15)) * this._zoom;
      const ty = P.ty, tz = P.lying ? .05 : 0, cp = Math.cos(this._pitch);
      cam.position.set(Math.sin(this._yaw) * cp * R, ty + Math.sin(this._pitch) * R, tz + Math.cos(this._yaw) * cp * R);
      cam.lookAt(0, ty, tz);
      cam.updateMatrixWorld();

      // angles
      const labels = this.shadowRoot.querySelectorAll('.ang');
      const W = this.clientWidth, H = this.clientHeight;
      this._angLines.forEach((ln, i) => {
        const a = this._angles && P.ang[i];
        ln.visible = !!a; if (labels[i]) labels[i].style.display = a ? 'block' : 'none';
        if (!a) return;
        const l = L[1];
        const js = a[0] === 'knee' ? [l.hip, l.kn, l.ank] : a[0] === 'hip' ? [l.sh, l.hip, l.kn] : [l.sh, l.el, l.hand];
        const pA = js[0].getWorldPosition(this._v2), pB = js[1].getWorldPosition(this._v3), pC = js[2].getWorldPosition(this._v4);
        const arr = ln.geometry.attributes.position.array;
        [pA, pB, pC].forEach((p, j) => { arr[j * 3] = p.x; arr[j * 3 + 1] = p.y; arr[j * 3 + 2] = p.z; });
        ln.geometry.attributes.position.needsUpdate = true;
        const d1 = pA.clone().sub(pB), d2 = pC.clone().sub(pB);
        const deg = Math.round(d1.angleTo(d2) * 180 / Math.PI);
        const pr = pB.clone().project(cam);
        labels[i].style.left = ((pr.x + 1) / 2 * W) + 'px'; labels[i].style.top = ((1 - pr.y) / 2 * H) + 'px';
        const txt = a[1] + ' ' + deg + '°'; if (labels[i].textContent !== txt) labels[i].textContent = txt;
      });

      const lab = ph === 0 ? (k > .5 ? 'Pausa abajo' : 'Pausa') : ph === 1 ? P.l1 : P.l2;
      if (P.ex !== 'x' && phEl.textContent !== lab) phEl.textContent = lab;
      const rep = 'Rep ' + (Math.floor(this._t / PER) + 1); if (repEl.textContent !== rep) repEl.textContent = rep;
      thumb.style.left = (f * 100) + '%';
      dot.style.background = ph === 0 ? '#5d5675' : conc ? '#9184d9' : '#c4bbff';
      r.render(scene, cam);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _poseBody(B, P, p) {
    B.lumb.rotation.x = p.lumb; B.thor.rotation.x = p.thor;
    [1, -1].forEach(s => {
      const l = B.limbs[s];
      l.sh.rotation.set(p.shx, 0, p.shz * s);
      l.el.rotation.set(p.elx, 0, p.elz * s);
      l.hip.rotation.set(p.hip, 0, p.hipZ * s);
      l.kn.rotation.set(p.knee, 0, p.kneeZ * s);
      l.ank.rotation.set(-(p.hip + p.knee) + p.ank, 0, 0);
    });
    const R = B.root, v = this._v;
    if (P.lying) { R.rotation.set(-Math.PI / 2, 0, 0); R.position.set(0, .57 + p.lift, .3); R.updateMatrixWorld(true); }
    else {
      R.rotation.set(0, 0, 0); R.position.set(0, 1, 0); R.updateMatrixWorld(true);
      B.limbs[1].ank.getWorldPosition(v);
      R.position.y += .068 - v.y + p.lift; R.position.z += -.05 - v.z;
      R.updateMatrixWorld(true);
    }
  }

  _paint(P, now, FD) {
    const C = this._C, m = this._layer === 'muscles', e = this._eff, fa = this._fa;
    this._skin.color.copy(m ? C.skinM : C.skinN);
    const pulse = .75 + .25 * Math.sin(now / 180);
    for (const k in this._mus) {
      const mat = this._mus[k], a = P.act[k] || 0;
      if (m) {
        if (a > 0) { mat.color.copy(C.lo).lerp(C.hi, clamp(a * (.6 + .4 * e), 0, 1)); mat.emissive.copy(C.hi); mat.emissiveIntensity = a * (.12 + .5 * e); }
        else { mat.color.copy(C.off); mat.emissiveIntensity = 0; }
      } else { mat.color.copy(C.musN).lerp(C.accL, a * .5); mat.emissive.copy(C.acc); mat.emissiveIntensity = a * (.04 + .22 * e); }
      if (FD && fa > .01 && FD.m.includes(k)) { mat.color.lerp(C.err, fa); mat.emissive.lerp(C.err, fa); mat.emissiveIntensity = Math.max(mat.emissiveIntensity, .45 * fa * pulse); }
      if (this._pick && this._pick.k === k && now < this._pick.until) { mat.emissive.copy(C.white); mat.emissiveIntensity = Math.max(mat.emissiveIntensity, .3 * pulse); }
    }
  }

  _tap(e) {
    const T = this._T, rect = this._r.domElement.getBoundingClientRect();
    const nd = new T.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this._ray.setFromCamera(nd, this._cam);
    const hits = this._ray.intersectObjects(this._B.meshes, false);
    const tip = this.$('.tip');
    const hit = hits[0] && hits[0].object.userData.mus ? hits[0] : null;
    if (!hit) { tip.style.opacity = 0; this._pick = null; return; }
    const k = hit.object.userData.mus, a = EXS[this._ex].act[k] || 0;
    const role = a >= .9 ? 'Músculo principal' : a >= .5 ? 'Músculo secundario' : a > 0 ? 'Estabilizador' : 'Poco implicado aquí';
    tip.querySelector('b').textContent = MUS[k]; tip.querySelector('span').textContent = role;
    tip.style.left = clamp(e.clientX - rect.left, 70, rect.width - 70) + 'px';
    tip.style.top = Math.max(60, e.clientY - rect.top) + 'px';
    tip.style.opacity = 1;
    this._pick = { k, until: performance.now() + 2400 };
    clearTimeout(this._tipTO); this._tipTO = setTimeout(() => { tip.style.opacity = 0; }, 2400);
    this.dispatchEvent(new CustomEvent('musclepick', { detail: { muscle: k, name: MUS[k], role }, bubbles: true, composed: true }));
  }
}
['exercise','layer','angles','path','fault','seek','view'].forEach(n => Object.defineProperty(GymMannequin.prototype, n, {
  set(v) { this._set(n, v); }, get() { return this['_' + n]; }, configurable: true,
}));
customElements.define('gym-mannequin', GymMannequin);
})();
