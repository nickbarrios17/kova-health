/* <gym-mannequin> — parametric 3D training mannequin (canvas 2D, no dependencies).
   Attributes: slug, muscle, equipment, category, layer (normal|muscles), view (front|34|side),
   paused ("true"), speed (number). Each exercise slug is mapped to a movement pattern
   (two or more key poses solved with two-bone IK) plus its equipment. */
(function () {
'use strict';
if (window.GymMannequin) return;
var D = Math.PI / 180;

/* ---------- math ---------- */
function rx(a){a*=D;var c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,c,-s,0,s,c];}
function ry(a){a*=D;var c=Math.cos(a),s=Math.sin(a);return[c,0,s,0,1,0,-s,0,c];}
function rz(a){a*=D;var c=Math.cos(a),s=Math.sin(a);return[c,-s,0,s,c,0,0,0,1];}
function mm(a,b){var r=[];for(var i=0;i<3;i++)for(var j=0;j<3;j++)r[i*3+j]=a[i*3]*b[j]+a[i*3+1]*b[3+j]+a[i*3+2]*b[6+j];return r;}
function mv(m,v){return[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];}
function add(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
function sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function mul(a,s){return[a[0]*s,a[1]*s,a[2]*s];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function len(a){return Math.sqrt(dot(a,a));}
function nrm(a){var l=len(a)||1;return mul(a,1/l);}
function mix(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function clamp(x,a,b){return x<a?a:x>b?b:x;}
function sm(x){x=clamp(x,0,1);return x*x*(3-2*x);}
function perpTo(v,u){var p=sub(v,mul(u,dot(v,u)));if(len(p)<1e-5){p=Math.abs(u[1])<.9?sub([0,1,0],mul(u,u[1])):sub([0,0,1],mul(u,u[2]));}return nrm(p);}
function X(){var o={};for(var i=0;i<arguments.length;i++){var a=arguments[i];if(a)for(var k in a)o[k]=a[k];}return o;}
function H(x,y,z){return{hl:[x,y,z],hr:[x,y,z]};}
function F(x,y,z){return{fl:[x,y,z],fr:[x,y,z]};}
function TO(x,y,z){return{tl:[x,y,z],tr:[x,y,z]};}

/* two-bone IK: root S, target T, bone lengths a,b, pole vector */
function ik(S,T,a,b,pole){
  var d=sub(T,S),l=len(d),u=l>1e-6?mul(d,1/l):[0,-1,0];
  l=clamp(l,Math.abs(a-b)+.01,a+b-.002);
  var ca=(a*a+l*l-b*b)/(2*a*l),sa=Math.sqrt(Math.max(0,1-ca*ca));
  var p=perpTo(pole,u);
  return[add(S,add(mul(u,a*ca),mul(p,a*sa))),add(S,mul(u,l)),p];
}

/* ---------- pose model ---------- */
var DEF={root:[0,1,0],pitch:0,roll:0,ptw:0,lumb:0,thor:0,twist:0,bend:0,neck:0,nside:0,shrug:0,
  hf:'s',hl:[.03,-.55,.05],hr:[.03,-.55,.05],ep:[.35,-.25,-1],epw:null,wr:0,gr:0,
  ff:'w',fl:[.12,.08,.02],fr:[.12,.08,.02],tl:null,tr:null,kp:null,kpw:null,mir:1};

function solve(P){
  var Rb=mm(mm(rx(P.pitch),rz(P.roll)),ry(P.ptw));
  var Rl=mm(Rb,rx(P.lumb));
  var Rt=mm(mm(mm(Rl,rx(P.thor)),ry(P.twist)),rz(P.bend));
  var R0=P.root,L=add(R0,mv(Rl,[0,.2,0])),N=add(L,mv(Rt,[0,.3,0]));
  var Rh=mm(mm(Rt,rx(P.neck)),rz(P.nside));
  var J={Rb:Rb,Rl:Rl,Rt:Rt,Rh:Rh,R0:R0,L:L,N:N,Hd:add(N,mv(Rh,[0,.13,.025])),side:{}};
  var X1=mv(Rt,[1,0,0]),fwdB=mv(Rb,[0,0,1]);
  [1,-1].forEach(function(s){
    var k=s>0?'l':'r',m=P.mir?s:1;
    var S=add(L,mv(Rt,[s*.18,.255+P.shrug,0]));
    var hs=P['h'+k],hv=[m*hs[0],hs[1],hs[2]],T;
    if(P.hf==='s')T=add(S,hv);else if(P.hf==='t')T=add(S,mv(Rt,hv));else if(P.hf==='r')T=add(R0,hv);else T=hv;
    var ep=P.epw?[s*P.epw[0],P.epw[1],P.epw[2]]:mv(Rt,[s*P.ep[0],P.ep[1],P.ep[2]]);
    var a1=ik(S,T,.29,.27,ep),E=a1[0],W=a1[1];
    var f=nrm(sub(W,E)),pp=perpTo(ep,f),wr=P.wr*D;
    var hd=nrm(add(mul(f,Math.cos(wr)),mul(pp,-Math.sin(wr))));
    var ax=perpTo(X1,f),ax2=cross(f,ax),g=P.gr*D;
    ax=nrm(add(mul(ax,Math.cos(g)),mul(ax2,Math.sin(g))));
    var hip=add(R0,mv(Rb,[s*.095,-.06,0]));
    var fs=P['f'+k],fv=[m*fs[0],fs[1],fs[2]],Ft=P.ff==='r'?add(R0,fv):fv;
    var kp=P.kpw?[s*P.kpw[0],P.kpw[1],P.kpw[2]]:mv(Rb,P.kp?[s*P.kp[0],P.kp[1],P.kp[2]]:[s*.18,0,1]);
    var a2=ik(hip,Ft,.45,.44,kp),K=a2[0],A=a2[1],toe,ts=P['t'+k];
    if(ts){var tv=[m*ts[0],ts[1],ts[2]];var tw=P.ff==='r'?add(R0,tv):tv;toe=add(A,mul(nrm(sub(tw,A)),.17));}
    else{
      var shn=nrm(sub(A,K));
      if(A[1]<.17){var fw=[fwdB[0],0,fwdB[2]];if(len(fw)<.3){var hh=sub(A,hip);fw=[hh[0],0,hh[2]];}if(len(fw)<.05)fw=[0,0,1];fw=nrm(fw);toe=add(add(A,mul(fw,.16)),[0,-.05,0]);}
      else toe=add(A,mul(perpTo(fwdB,shn),.17));
    }
    J.side[k]={s:s,S:S,E:E,W:W,hd:hd,tip:add(W,mul(hd,.075)),ax:ax,f:f,ep:a1[2],hip:hip,K:K,A:A,toe:toe,kp:a2[2]};
  });
  return J;
}

function lerpPose(a,b,f){
  var o={},k;
  for(k in a){var x=a[k],y=b[k];
    if(typeof x==='number'&&typeof y==='number')o[k]=x+(y-x)*f;
    else if(Array.isArray(x)&&Array.isArray(y))o[k]=x.map(function(v,i){return v+(y[i]-v)*f;});
    else o[k]=f<.5?x:y;}
  return o;
}

/* ---------- props ---------- */
var C={frame:[62,65,86],pad:[56,59,82],steel:[190,194,210],plate:[46,48,64],rim:[145,132,217],band:[145,132,217],
  cable:[205,208,224],ball:[83,75,140],kb:[72,75,96],wall:[36,38,54],rope:[90,92,116]};
function box(c,s,rot,col,under){return{t:'box',c:c,s:s,rot:rot||0,col:col||C.frame,under:under!==false};}
function capP(a,b,r,col,under){return{t:'cap',a:a,b:b,r:r,col:col||C.frame,under:!!under};}
function sphP(c,r,col,under){return{t:'sph',c:c,r:r,col:col,under:!!under};}
function discP(c,n,r,col){return{t:'disc',c:c,n:n,r:r,col:col||C.plate};}
function lineP(a,b,w,col){return{t:'line',a:a,b:b,w:w,col:col||C.cable};}
function benchP(cz,lenz,h){h=h||.45;return[box([0,h-.04,cz],[.32,.08,lenz],0,C.pad),box([0,(h-.08)/2,cz],[.14,h-.08,lenz*.55])];}
function backPad(P,l,off){
  var dir=mv(rx(P.pitch),[0,1,0]),fw=mv(rx(P.pitch),[0,0,1]);
  var c=add(add(P.root,mul(dir,off==null?.2:off)),mul(fw,-.17));
  var out=[box(c,[.34,l||1.15,.08],P.pitch,C.pad)];
  if(c[1]>.3)out.push(box([0,(c[1]-.06)/2,c[2]],[.14,c[1]-.06,.45]));
  return out;
}
function frontPad(P,l){
  var dir=mv(rx(P.pitch),[0,1,0]),fw=mv(rx(P.pitch),[0,0,1]);
  var c=add(add(P.root,mul(dir,.25)),mul(fw,.17));
  return[box(c,[.34,l||.9,.08],P.pitch,C.pad),box([0,(c[1]-.06)/2,c[2]],[.14,Math.max(.05,c[1]-.06),.4])];
}
function seatP(withBack){var o=[box([0,.45,.05],[.36,.08,.42],0,C.pad),box([0,.21,.05],[.12,.42,.3])];if(withBack)o.push(box([0,.82,-.17],[.36,.6,.08],0,C.pad));return o;}
function pullBar(y,z,w){w=w||.75;return[capP([-w,y,z],[w,y,z],.018,C.steel),capP([-w,0,z],[-w,y+.05,z],.035),capP([w,0,z],[w,y+.05,z],.035)];}
function dipBars(y){var o=[];[1,-1].forEach(function(s){o.push(capP([s*.26,y,-.45],[s*.26,y,.45],.025,C.steel),capP([s*.26,0,-.4],[s*.26,y,-.4],.03),capP([s*.26,0,.4],[s*.26,y,.4],.03));});return o;}
function stepBox(c,s){return box(c,s,0,C.frame);}
function plank(h,A,Lb){Lb=Lb||1.41;var sn=clamp((h-A[1])/Lb,-1,1),th=Math.asin(sn),cs=Math.cos(th),dir=[0,sn,cs];var S=add(A,mul(dir,Lb));return{root:sub(S,mul(dir,.46)),pitch:Math.atan2(cs,sn)/D,sz:S[2]};}
function supPlank(h,A){var Lb=1.41,sn=clamp((h-A[1])/Lb,-1,1),th=Math.asin(sn),cs=Math.cos(th),dir=[0,sn,-cs];var S=add(A,mul(dir,Lb));return{root:sub(S,mul(dir,.46)),pitch:Math.atan2(-cs,sn)/D,sz:S[2]};}

/* ---------- base postures ---------- */
var SIDE=H(.03,-.55,.05);
function SEAT(x){return X({root:[0,.6,0]},F(.17,.08,.44),x);}
function SUPB(x){return X({root:[0,.58,.22],pitch:-90,hf:'t'},F(.3,.08,.7),x);}
function SUPF(x){return X({root:[0,.13,0],pitch:-90},F(.14,.08,.42),x);}
function SUPFL(x){return X({root:[0,.13,0],pitch:-90},F(.08,.1,.94),x);}
function PROF(x){return X({root:[0,.13,0],pitch:90},F(.1,.07,-.9),TO(.1,.0,-.8),x);}
function KNEEL(x){return X({root:[0,.6,0]},F(.11,.1,-.42),TO(.11,.02,-.58),x);}
function QUAD(x){return X({root:[0,.56,0],pitch:90,hf:'w'},H(.18,.05,.48),F(.1,.1,-.42),TO(.1,.02,-.58),x);}
function HANG(x){return X({root:[0,1.24,0],hf:'w',ff:'r',ep:[1,-.6,.2]},H(.33,2.25,0),F(.1,-.82,-.12),x);}
function HINGE(x){return X({root:[0,.92,-.15],lumb:55,thor:8,neck:-18},F(.14,.08,.02),x);}

function supKind(o){return o.floor?'floor':o.incline?'incline':o.decline?'decline':o.ball?'ball':'flat';}
function supBase(kind,x){
  var b;
  if(kind==='incline')b=X({root:[0,.6,.18],pitch:-48,hf:'t'},F(.28,.08,.62));
  else if(kind==='decline')b=X({root:[0,.64,.2],pitch:-110,hf:'t',neck:12},F(.14,.52,.74));
  else if(kind==='floor')b=X({root:[0,.13,0],pitch:-90,hf:'t',neck:8},F(.15,.08,.42));
  else if(kind==='ball')b=X({root:[0,.62,.05],pitch:-82,hf:'t'},F(.16,.08,.6));
  else b=SUPB();
  return X(b,x);
}
function supProps(kind,P){
  if(kind==='floor')return[];
  if(kind==='ball')return[sphP([0,.32,-.17],.33,C.ball,true)];
  var o=backPad(P);
  if(kind==='incline')o.push(box([0,.43,.32],[.34,.08,.38],0,C.pad));
  if(kind==='decline')o.push(capP([-.22,.42,.8],[.22,.42,.8],.05,C.pad));
  return o;
}

var CAM_STAND={ty:.95,d:4.5,yo:0},CAM_LOW={ty:.55,d:4.6,yo:.9},CAM_HANG={ty:1.3,d:5.2,yo:0};

/* ---------- movement patterns ---------- */
var P={};
var LABEL={};
function def(k,label,fn){P[k]=fn;LABEL[k]=label;}

def('squat','Sentadilla',function(o){
  var w=o.wide||o.sumo?.3:o.close?.09:.16,hands,ep,upright=false,one=false;
  if(o.front){hands=H(-.02,.03,.17);ep=[.25,-.4,1];upright=true;}
  else if(o.goblet){hands=H(-.13,-.2,.2);ep=[.25,-1,.2];upright=true;one=true;}
  else if(o.overhead){hands=H(.25,.56,-.02);upright=true;}
  else if(o.zercher){hands=H(-.1,-.32,.25);ep=[.3,-1,.1];upright=true;}
  else if(o.eq==='dumbbell'||o.eq==='kettlebell'){hands=X(SIDE);ep=[.2,-.2,-1];}
  else if(o.eq==='bodyweight'||o.eq==='other'){hands=H(0,-.02,.55);}
  else if(o.eq==='band'||o.eq==='cable'){hands=H(-.02,.03,.17);ep=[.25,-.4,1];upright=true;}
  else{hands=H(.26,-.01,-.11);ep=[.3,-1,-.3];}
  var hf=(o.eq==='dumbbell'||o.eq==='kettlebell')&&!o.goblet?'s':'t';
  var a=X({hf:hf,lumb:4,ep:ep||DEF.ep},hands,F(w,.08,.03),{kp:[w>.2?.6:.2,0,1]});
  var b=X(a,{root:upright?[0,.56,-.15]:[0,.56,-.2],lumb:upright?18:30,thor:upright?2:6,neck:-12});
  var props=[];
  if(o.box){b.root=[0,.64,-.18];props.push(stepBox([0,.23,-.32],[.4,.46,.4]));}
  if(o.ball)props.push(sphP([0,.18,.0],.18,C.ball,true));
  return{keys:[a,b],one:one,cam:CAM_STAND,props:props,anc:[0,.03,.03]};
});
def('jumpsquat','Sentadilla con salto',function(o){
  var st=X({hf:'s'},H(.05,-.5,.1),F(.15,.08,.03));
  var bot=X(st,{root:[0,.58,-.2],lumb:32,thor:6},H(.05,-.42,-.25));
  var air=X(st,{root:[0,1.18,0]},H(.08,.3,.3),F(.15,.24,.03));
  return{keys:[st,bot,air],seq:true,dur:2.2,cam:CAM_STAND};
});
def('pistol','Sentadilla a una pierna',function(o){
  var a=X({hf:'t'},H(0,-.05,.55),{fl:[.08,.08,.02],fr:[.1,.32,.55]});
  var b=X(a,{root:[0,.5,-.17],lumb:38,fr:[.1,.14,.85]});
  return{keys:[a,b],cam:CAM_STAND};
});
def('sissy','Sissy squat',function(o){
  var a=X({hf:'t'},H(0,-.05,.5),F(.12,.08,.02));
  var b=X(a,{root:[0,.66,.1],lumb:-28,thor:-5},F(.12,.13,.02),TO(.12,.01,.16));
  return{keys:[a,b],cam:CAM_STAND};
});
def('wallsit','Sentadilla isométrica en pared',function(o){
  var a=X({root:[0,.55,-.35]},H(.05,-.45,.12),F(.14,.08,.12));
  var b=X(a,{fr:[.14,.35,.25]});
  return{keys:[a,b],altL:true,ease:'sine',dur:2.4,props:[box([0,1.1,-.52],[1.4,2.2,.06],0,C.wall)],cam:CAM_STAND};
});
def('deadlift','Peso muerto',function(o){
  var a,b,hx=.24;
  if(o.sumo){a=X({hf:'w',root:[0,.6,-.14],lumb:42,thor:8,neck:-20,kp:[.9,0,1]},H(.17,.25,.08),F(.36,.08,.06));b=X(a,{root:[0,1,-.02],lumb:0,thor:0,neck:0},H(.17,.84,.1));}
  else{
    var low=o.eq==='dumbbell'||o.eq==='kettlebell';
    a=X({hf:'w',root:o.rack?[0,.85,-.14]:[0,.58,-.25],lumb:o.rack?38:55,thor:o.rack?6:15,neck:-25},H(low?.2:hx,o.rack?.62:low?.17:.25,low?.04:.06),F(.13,.08,0));
    b=X(a,{root:[0,1,-.02],lumb:0,thor:0,neck:0},H(low?.22:.22,low?.78:.86,low?.04:.1));
  }
  return{keys:[a,b],cam:X(CAM_STAND,{ty:.8}),anc:[0,.1,.9]};
});
def('rdl','Peso muerto rumano',function(o){
  var a=X({hf:'w',root:[0,1,-.02]},H(.22,.86,.1),F(.13,.08,0));
  var b=X(a,{root:[0,.97,-.16],lumb:64,thor:10,neck:-25},H(.22,.45,.16));
  if(o.toetouch){b=X(b,{lumb:75},H(.1,.15,.2));}
  return{keys:[a,b],cam:X(CAM_STAND,{ty:.85}),anc:[0,.1,.9]};
});
def('pullthrough','Pull through',function(o){
  var a=X({hf:'w',root:[0,1,0]},H(.06,.9,.15),F(.22,.08,.02));
  var b=X(a,{root:[0,.92,-.12],lumb:62,thor:8,neck:-20},H(.06,.42,-.22));
  return{keys:[a,b],anc:[0,.15,-1.1],one:true,cam:X(CAM_STAND,{yo:.6})};
});
def('goodmorning','Good morning',function(o){
  var base=o.seated?SEAT({hf:'t'}):X({hf:'t'},F(.15,.08,.02));
  var a=X(base,H(.26,-.01,-.11),{ep:[.3,-1,-.3]});
  var b=X(a,o.seated?{lumb:60,thor:8}:{root:[0,.96,-.17],lumb:70,thor:8});
  return{keys:[a,b],props:o.seated?seatP(false):[],cam:CAM_STAND};
});
def('sldl','Peso muerto a una pierna',function(o){
  var a=X({fl:[.1,.08,.02],fr:[.1,.08,.02]},H(.03,-.55,.05));
  var b=X(a,{root:[0,.95,-.08],lumb:80,thor:5,neck:-25,fr:[.1,.85,-.85]});
  return{keys:[a,b],cam:X(CAM_STAND,{yo:.5})};
});
def('swing','Swing',function(o){
  var a=X({hf:'w',root:[0,.85,-.2],lumb:50,thor:5,neck:-20},H(.05,.5,-.06),F(.2,.08,.03));
  var b=X(a,{root:[0,1,0],lumb:0,thor:0,neck:0},H(.05,1.4,.55));
  return{keys:[a,b],one:true,dur:1.6,ease:'sine',cam:CAM_STAND};
});
def('clean','Cargada',function(o){
  var a=X({hf:'t',root:[0,.9,-.15],lumb:45,thor:5,neck:-20,ep:[.3,-.4,1]},H(.06,-.55,0),F(.15,.08,.02));
  var b=X(a,{root:[0,.98,-.02],lumb:0,thor:0,neck:0},H(-.02,.03,.17));
  return{keys:[a,b],cam:CAM_STAND};
});
def('snatch','Arrancada',function(o){
  var a=X({hf:'t',root:[0,.62,-.24],lumb:52,thor:12,neck:-25},H(.3,-.55,0),F(.16,.08,.02));
  var b=X(a,{root:[0,1,0],lumb:0,thor:0,neck:0},H(.3,.55,-.02));
  return{keys:[a,b],cam:CAM_STAND};
});
def('thruster','Thruster',function(o){
  var a=X({hf:'t',root:[0,.56,-.15],lumb:18,thor:2,neck:-10,ep:[.3,-.4,1]},H(-.02,.03,.17),F(.16,.08,.03));
  var b=X(a,{root:[0,1,0],lumb:0,thor:0,neck:0},H(.08,.56,.02));
  return{keys:[a,b],cam:CAM_STAND};
});
def('pushpress','Push press',function(o){
  var a=X({hf:'t',root:[0,.9,-.04],lumb:5,ep:[.4,-.6,.8]},H(.06,.04,.15),F(.14,.08,.02));
  var b=X(a,{root:[0,1,0],lumb:0},H(.07,.56,.02));
  return{keys:[a,b],cam:CAM_STAND};
});
function lungeHands(o){
  if(o.eq==='barbell'||o.eq==='smith')return X({hf:'t',ep:[.3,-1,-.3]},H(.26,-.01,-.11));
  if(o.eq==='bodyweight'||o.eq==='other')return X({hf:'t',ep:[1,0,-.6]},H(-.03,-.3,.02));
  return X({hf:'s'},SIDE);
}
def('lunge','Zancada',function(o){
  var h=lungeHands(o),split={fl:[.12,.08,.36],fr:[.12,.14,-.44],tl:null,tr:[.12,.01,-.33]};
  var b=X(h,split,{root:[0,.56,-.04],lumb:2});
  var a=o.split?X(b,{root:[0,.92,-.04]}):X(h,F(.12,.08,.02),{tl:null,tr:null});
  if(o.single){b=X(b,{root:[0,.55,.02],fl:[.12,.08,.32],fr:[.12,.5,-.62],tr:[.12,.47,-.78]});a=X(b,{root:[0,.9,0]});
    return{keys:[a,b],props:benchP(-.72,.5),cam:X(CAM_STAND,{yo:.5})};}
  return{keys:[a,b],cam:X(CAM_STAND,{yo:.5})};
});
def('lungejump','Zancada con salto',function(o){
  var a=X({root:[0,.62,-.04],hf:'s'},H(.05,-.45,.1),{fl:[.12,.08,.36],fr:[.12,.14,-.44],tl:null,tr:[.12,.01,-.33]});
  var b=X(a,{fl:[.12,.14,-.44],fr:[.12,.08,.36],tl:[.12,.01,-.33],tr:null});
  return{keys:[a,b],ease:'sine',hop:.25,dur:1.4,cam:X(CAM_STAND,{yo:.5})};
});
def('sidelunge','Zancada lateral',function(o){
  var h=o.eq==='bodyweight'?X({hf:'t'},H(0,-.05,.5)):lungeHands(o);
  var a=X(h,{mir:0,root:[0,.95,0],fl:[.38,.08,.02],fr:[-.38,.08,.02],kp:[.9,0,1]});
  if(h.hf==='s'){a.hl=[.03,-.55,.05];a.hr=[-.03,-.55,.05];}
  if(h.hf==='t'&&h.hl[0]!==0){a.hl=[h.hl[0],h.hl[1],h.hl[2]];a.hr=[-h.hr[0],h.hr[1],h.hr[2]];}
  var b=X(a,{root:[.3,.6,-.08],lumb:30,thor:5});
  return{keys:[a,b],cam:CAM_STAND};
});
def('curtsy','Sentadilla curtsy',function(o){
  var h=lungeHands(o);
  var a=X(h,F(.12,.08,.02));
  var b=X(h,{mir:0,root:[.04,.58,-.08],lumb:6,fl:[.12,.08,.1],fr:[.22,.14,-.45],tr:[.2,.01,-.34]});
  if(h.hf==='s'){b.hl=[.03,-.55,.05];b.hr=[-.03,-.55,.05];}else{b.hl=h.hl;b.hr=[-h.hr[0],h.hr[1],h.hr[2]];}
  return{keys:[a,b],cam:CAM_STAND};
});
def('stepup','Step-up',function(o){
  var h=lungeHands(o);
  var a=X(h,{root:[0,.98,-.05],fl:[.12,.43,.32],fr:[.12,.08,-.1]});
  var b=X(a,{root:[0,1.36,.25],fr:[.12,.62,.28]});
  return{keys:[a,b],props:[stepBox([0,.2,.36],[.6,.4,.45])],cam:X(CAM_STAND,{ty:1.1,yo:.5})};
});
def('legpress','Prensa de piernas',function(o){
  var a=X({root:[0,.42,0],pitch:-58,hf:'r'},H(.25,.05,.15),F(.15,.82,.42));
  var b=X(a,F(.15,1.02,.7));
  if(o.calf){a=X(b,TO(.15,1.14,.58));b=X(b,TO(.15,1.08,.84));}
  return{keys:[a,b],props:[box([0,.41,-.3],[.45,.8,.08],-58,C.pad),box([0,.3,.05],[.45,.12,.4],0,C.pad),box([0,.15,-.1],[.2,.3,.6]),
    capP([-.42,.12,-.1],[-.42,1.15,1.0],.03),capP([.42,.12,-.1],[.42,1.15,1.0],.03)],
    dyn:function(J){var c=mix(J.side.l.A,J.side.r.A,.5),hm=mix(J.side.l.hip,J.side.r.hip,.5),n=nrm(sub(c,hm));c=add(c,mul(n,.06));return[box(c,[.7,.06,.5],Math.atan2(n[2],n[1])/D,C.frame,false)];},
    cam:CAM_LOW};
});
def('legext','Extensión de cuádriceps',function(o){
  var a=X(SEAT({lumb:-12,hf:'r'}),H(.24,-.04,.05),F(.12,.12,.5));
  var b=X(a,F(.12,.55,.89));
  return{keys:[a,b],props:[box([0,.25,.12],[.42,.5,.55],0,C.frame),box([0,.48,.12],[.42,.06,.55],0,C.pad),box([0,.88,-.2],[.42,.65,.08],-12,C.pad)],
    dyn:function(J){var c=mix(J.side.l.A,J.side.r.A,.5),d=nrm(sub(J.side.l.toe,J.side.l.A));c=add(c,mul(d,.06));return[capP(add(c,[-.22,0,0]),add(c,[.22,0,0]),.05,C.pad)];},
    cam:X(CAM_STAND,{ty:.7,yo:.9})};
});
def('legcurl','Curl femoral tumbado',function(o){
  var a=X({root:[0,.66,0],pitch:90,hf:'w'},H(.2,.5,.72),F(.1,.62,-.9));
  var b=X(a,F(.1,1.02,-.36));
  return{keys:[a,b],props:[box([0,.265,-.05],[.42,.53,1.25],0,C.frame),box([0,.51,-.05],[.42,.05,1.25],0,C.pad)],
    dyn:function(J){var c=mix(J.side.l.A,J.side.r.A,.5),d=nrm(sub(J.side.l.toe,J.side.l.A));c=add(c,mul(d,-.07));return[capP(add(c,[-.2,0,0]),add(c,[.2,0,0]),.05,C.pad)];},
    cam:CAM_LOW};
});
def('legcurl_seated','Curl femoral sentado',function(o){
  var a=X(SEAT({lumb:-10,hf:'r'}),H(.24,-.04,.05),F(.12,.52,.89));
  var b=X(a,F(.12,.12,.32));
  return{keys:[a,b],props:seatP(true).concat([capP([-.22,.66,.3],[.22,.66,.3],.05,C.pad)]),
    dyn:function(J){var c=mix(J.side.l.A,J.side.r.A,.5),d=nrm(sub(J.side.l.toe,J.side.l.A));c=add(c,mul(d,-.07));return[capP(add(c,[-.22,0,0]),add(c,[.22,0,0]),.05,C.pad)];},
    cam:X(CAM_STAND,{ty:.7,yo:.9})};
});
def('legcurl_standing','Curl femoral de pie',function(o){
  var a=X({hf:'w',lumb:8},H(.22,1.1,.45),F(.12,.08,.02),{kpw:[0,-1,.15]});
  var b=X(a,{fr:[.12,.58,-.3]});
  return{keys:[a,b],uniL:true,footCable:true,anc:[0,.1,-.8],cam:X(CAM_STAND,{yo:.8})};
});
def('nordic','Curl nórdico',function(o){
  var a=X({root:[0,.59,0],hf:'s'},H(.05,-.5,.1),F(.1,.1,-.42),TO(.1,.03,-.58));
  var b=X(a,{root:[0,.375,.42],pitch:55},H(.05,-.3,.3));
  return{keys:[a,b],props:[capP([-.22,.2,-.44],[.22,.2,-.44],.045,C.pad),box([0,.04,-.1],[.5,.08,.9],0,C.pad)],cam:CAM_LOW};
});
def('calf','Elevación de talones',function(o){
  var h;
  if(o.eq==='barbell'||o.eq==='smith'||o.eq==='lever'||o.eq==='machine')h=X({hf:'t',ep:[.3,-1,-.3]},H(.26,-.01,-.11));
  else h=X({hf:'s'},SIDE);
  var a=X(h,{root:[0,.99,0]},F(.12,.09,0),TO(.12,.01,.15));
  var b=X(a,{root:[0,1.08,0]},F(.12,.18,-.01),TO(.12,.01,.13));
  var spec={keys:[a,b],cam:CAM_STAND};
  if(o.single){a.fl=[.1,.45,-.25];a.tl=null;b.fl=[.1,.45,-.25];b.tl=null;}
  return spec;
});
def('calf_seated','Elevación de talones sentado',function(o){
  var a=X(SEAT({hf:'w'}),H(.17,.6,.42),F(.14,.09,.44),TO(.14,.01,.6));
  var b=X(a,F(.14,.17,.44),TO(.14,.01,.58));
  return{keys:[a,b],props:seatP(false),dyn:function(J){var c=mix(J.side.l.K,J.side.r.K,.5);return[capP(add(c,[-.26,.08,0]),add(c,[.26,.08,0]),.05,C.pad)];},cam:X(CAM_STAND,{ty:.6,yo:.6})};
});
def('calf_donkey','Elevación de talones burro',function(o){
  var a=X({hf:'w',root:[0,1.0,-.1],lumb:80,thor:5,neck:-20},H(.2,1.02,.55),F(.12,.09,0),TO(.12,.01,.15));
  var b=X(a,{root:[0,1.09,-.1]},F(.12,.18,-.01),TO(.12,.01,.13));
  return{keys:[a,b],props:[box([0,.5,.62],[.6,1.0,.3])],cam:X(CAM_STAND,{yo:.9})};
});
def('bridge','Puente de glúteos',function(o){
  var bar=o.eq==='barbell'||o.eq==='smith';
  var a=X(SUPF({hf:bar?'r':'w'}),bar?H(.3,.13,0):H(.24,.04,-.25),F(.15,.08,.42));
  var b=X(a,{root:[0,.37,0],pitch:-118,neck:28},bar?H(.3,.12,-.06):{});
  var props=[];
  if(o.feetBench){a=X(a,F(.15,.45,.7));b=X(b,{root:[0,.45,0],pitch:-120},F(.15,.45,.7));props=[box([0,.21,.75],[1.1,.42,.35])];}
  if(o.march){var m=X(b,{fr:[.15,.55,.32]});return{keys:[b,m],altL:true,ease:'sine',dur:2,cam:CAM_LOW,props:props};}
  if(o.single){a.fl=[.08,.4,.8];b.fl=[.08,.62,.78];}
  return{keys:[a,b],cam:CAM_LOW,props:props};
});
def('hipthrust','Hip thrust',function(o){
  var a=X({root:[0,.27,0],pitch:-60,hf:'r'},H(.32,.12,.07),F(.18,.08,.5));
  var b=X(a,{root:[0,.52,0],pitch:-92,neck:20},H(.32,.14,0));
  return{keys:[a,b],props:[box([0,.2,-.6],[1.1,.4,.3])],cam:CAM_LOW};
});
def('kneel_thrust','Hip thrust de rodillas',function(o){
  var a=KNEEL({root:[0,.36,-.18],lumb:25,hf:'t'});a=X(a,H(-.03,-.3,.02),{ep:[1,0,-.6]});
  var b=X(a,{root:[0,.6,0],lumb:-5});
  return{keys:[a,b],cam:CAM_LOW};
});
def('kickback_glute','Patada de glúteo',function(o){
  var a=QUAD();
  var b=X(a,{fr:[.1,.72,-.82],tr:null});
  return{keys:[a,b],uniL:true,footCable:true,anc:[0,.1,-1.0],cam:CAM_LOW};
});
def('hipext','Extensión de cadera de pie',function(o){
  var a=X({hf:'w',lumb:10},H(.22,1.15,.45),F(.12,.08,.02));
  var b=X(a,{fr:[.12,.3,-.55]});
  return{keys:[a,b],uniL:true,footCable:true,anc:[0,.1,.6],cam:X(CAM_STAND,{yo:.9})};
});
def('revhyper','Hiperextensión inversa',function(o){
  var a=X({root:[0,.85,0],pitch:90,hf:'w'},H(.2,.68,.72),F(.1,.08,-.15));
  var b=X(a,F(.1,.9,-.92));
  return{keys:[a,b],props:[box([0,.38,.28],[.42,.76,.6]),box([0,.77,.28],[.42,.05,.6],0,C.pad)],cam:CAM_LOW};
});
def('backext','Extensión lumbar',function(o){
  var hh=o.handsHead?H(-.08,.22,-.03):H(-.12,-.08,.14);
  if(o.ball){
    var a0=X({root:[0,.72,0],pitch:90,lumb:40,hf:'t',ep:[1,0,0]},hh,F(.15,.08,-.85));
    return{keys:[a0,X(a0,{lumb:-8})],props:[sphP([0,.33,0],.33,C.ball,true)],cam:CAM_LOW};
  }
  var a=X({root:[0,.95,0],pitch:90,lumb:75,hf:'t',ep:[1,0,0]},hh,F(.11,.42,-.72));
  var b=X(a,{lumb:-5});
  return{keys:[a,b],props:[box([0,.87,.05],[.45,.1,.32],0,C.pad),capP([0,.82,.05],[0,.12,-.75],.04),box([0,.4,-.75],[.4,.04,.25])],cam:CAM_LOW};
});
def('superman','Superman',function(o){
  var a=X(PROF({hf:'t'}),H(0,.5,.02));
  var b=X(a,{lumb:-18,thor:-10,neck:-15},H(0,.52,-.05),F(.1,.25,-.86));
  return{keys:[a,b],cam:CAM_LOW};
});
def('cobra','Cobra / perro boca arriba',function(o){
  var a=X(PROF({hf:'w'}),H(.25,.04,.35));
  var b=X(a,{lumb:-40,thor:-10,neck:-20});
  return{keys:[a,b],dur:4,cam:CAM_LOW};
});
def('legraise','Elevación de piernas',function(o){
  if(o.seated){var s0=X(SEAT({lumb:-25,hf:'r'}),H(.24,-.02,-.05),F(.1,.25,.85));return{keys:[s0,X(s0,F(.1,.65,.75))],props:seatP(false),cam:X(CAM_STAND,{ty:.6,yo:.9})};}
  if(o.bench){var b0=X(SUPB({hf:'w'}),H(.12,.5,-.55),F(.08,.48,1.15));return{keys:[b0,X(b0,F(.08,1.45,.4))],props:backPad(b0),cam:CAM_LOW};}
  var a=X(SUPFL({hf:'w'}),H(.25,.05,-.05));
  var b=X(a,F(.08,.95,.12));
  return{keys:[a,b],cam:CAM_LOW};
});
def('hang_legraise','Elevación de piernas colgado',function(o){
  var a=HANG();
  var b=X(a,o.knee?F(.1,-.35,.3):F(.1,-.25,.8));
  return{keys:[a,b],props:pullBar(2.27,0),cam:CAM_HANG};
});
def('chair_legraise','Elevación de rodillas en silla',function(o){
  var a=X({root:[0,1.25,0],hf:'w',ff:'r',ep:[.2,-1,-.4]},H(.24,1.38,.25),F(.1,-.82,-.05));
  var b=X(a,o.knee?F(.1,-.35,.35):F(.1,-.2,.8));
  return{keys:[a,b],props:[box([0,1.5,-.2],[.4,.6,.08],0,C.pad),capP([-.24,1.33,-.1],[-.24,1.33,.35],.04,C.pad),capP([.24,1.33,-.1],[.24,1.33,.35],.04,C.pad),capP([-.3,0,-.2],[-.3,1.8,-.2],.035),capP([.3,0,-.2],[.3,1.8,-.2],.035)],cam:CAM_HANG};
});
def('revcrunch','Crunch invertido',function(o){
  var a=X(SUPF({hf:'w'}),H(.25,.05,-.05),F(.1,.45,.45));
  var b=X(a,{root:[0,.2,-.02],pitch:-78,lumb:8},F(.1,.75,.15));
  return{keys:[a,b],cam:CAM_LOW};
});
def('crunch','Crunch',function(o){
  if(o.ball){var c0=X({root:[0,.66,0],pitch:-78,lumb:-18,thor:-8,hf:'t',ep:[1,.1,-.2]},H(-.1,.22,-.03),F(.16,.08,.55));
    return{keys:[c0,X(c0,{lumb:18,thor:18})],props:[sphP([0,.32,-.1],.33,C.ball,true)],cam:CAM_LOW};}
  var arms=o.overheadArms?H(0,.5,0):H(-.1,.22,-.03);
  var a=X(SUPF({hf:'t',ep:[1,.1,-.2]}),arms);
  var b=X(a,{lumb:18,thor:24,neck:12});
  if(o.oblique){b.twist=25;}
  return{keys:[a,b],cam:CAM_LOW};
});
def('crunch_kneel','Crunch de rodillas en polea',function(o){
  var a=X(KNEEL({lumb:15,thor:5,hf:'t',ep:[.4,-.2,1]}),H(-.12,.2,.1));
  var b=X(a,{lumb:70,thor:20});
  return{keys:[a,b],one:true,anc:[0,2.2,.55],cableBar:true,cam:X(CAM_STAND,{ty:.6,yo:.9})};
});
def('crunch_stand','Crunch de pie',function(o){
  var a=X({lumb:5,hf:'t',ep:[.4,-.2,1]},H(-.12,.2,.1),F(.14,.08,.02));
  var b=X(a,{lumb:40,thor:12});
  return{keys:[a,b],one:true,anc:[0,2.0,-.5],cableBar:true,cam:X(CAM_STAND,{yo:.9})};
});
def('crunch_seated','Crunch sentado en máquina',function(o){
  var a=X(SEAT({hf:'t',ep:[.4,-.2,1]}),H(-.12,.15,.15));
  var b=X(a,{lumb:40,thor:15});
  return{keys:[a,b],props:seatP(false),cam:X(CAM_STAND,{ty:.7,yo:.9})};
});
def('situp','Abdominal completo',function(o){
  var arms=o.overheadArms?H(0,.5,0):H(-.2,-.06,.13);
  if(o.decline){var d0=X({root:[0,.7,.3],pitch:-112,hf:'t',ep:[.8,-.3,.6]},arms,F(.12,.62,.8));
    return{keys:[d0,X(d0,{lumb:70,thor:20})],props:backPad(d0,1.2),cam:CAM_LOW};}
  var a=X(SUPF({hf:'t',ep:[.8,-.3,.6]}),arms);
  var b=X(a,{lumb:55,thor:25,neck:10});
  return{keys:[a,b],cam:CAM_LOW};
});
def('vup','V-up',function(o){
  var a=X(SUPFL({hf:'t'}),H(0,.5,.02));
  var b=X(a,{lumb:55,thor:15},F(.08,.75,.45),H(-.08,-.1,.5));
  return{keys:[a,b],cam:CAM_LOW};
});
def('lsit','L-sit',function(o){
  var a=X({root:[0,.22,0],hf:'w'},H(.25,.04,.02),F(.08,.28,.9));
  var b=X(a,{root:[0,.25,0]},F(.08,.33,.9));
  return{keys:[a,b],dur:3.5,cam:CAM_LOW};
});
def('bicycle','Bicicleta abdominal',function(o){
  var a=X(SUPF({hf:'t',ep:[1,.1,-.2],lumb:22,thor:10,twist:25}),H(-.1,.22,-.03),{fl:[.1,.3,.45],fr:[.1,.3,.9]});
  var b=X(a,{twist:-25,fl:[.1,.3,.9],fr:[.1,.3,.45]});
  return{keys:[a,b],ease:'sine',dur:1.8,cam:CAM_LOW};
});
def('deadbug','Dead bug',function(o){
  var a=X(SUPF({hf:'s'}),{hl:[0,.05,-.55],hr:[0,.55,0],fl:[.12,.5,.45],fr:[.1,.2,.95]});
  var b=X(a,{hl:[0,.55,0],hr:[0,.05,-.55],fl:[.1,.2,.95],fr:[.12,.5,.45]});
  return{keys:[a,b],ease:'sine',dur:3,cam:CAM_LOW};
});
def('russian','Russian twist',function(o){
  var a=X({root:[0,.15,0],pitch:-38,hf:'t',twist:-38},H(-.15,-.12,.33),F(.12,.32,.52));
  var b=X(a,{twist:38});
  return{keys:[a,b],one:true,ease:'sine',dur:2.2,cam:CAM_LOW};
});
def('twist','Giro de tronco de pie',function(o){
  var a=X({hf:'s',twist:-45,ptw:-8},H(-.15,-.1,.45),F(.22,.08,.02));
  var b=X(a,{twist:45,ptw:8});
  return{keys:[a,b],one:true,ease:'sine',dur:2.4,anc1:[.9,1.2,0],cableBar:true,cam:CAM_STAND};
});
def('pallof','Press Pallof',function(o){
  var a=X({hf:'t'},H(-.15,-.15,.12),F(.2,.08,.02));
  var b=X(a,H(-.15,-.1,.5));
  return{keys:[a,b],one:true,anc1:[.9,1.15,.3],cableBar:true,cam:CAM_STAND};
});
def('sidebend','Inclinación lateral',function(o){
  var a=X({bend:-8},SIDE,F(.15,.08,.02));
  var b=X(a,{bend:28});
  return{keys:[a,b],hands:['r'],cam:CAM_STAND,anc:[0,.1,0]};
});
def('heeltouch','Toques de talón',function(o){
  var a=X(SUPF({hf:'t',lumb:15,thor:10,bend:22}),H(.12,-.5,.05));
  var b=X(a,{bend:-22});
  return{keys:[a,b],ease:'sine',dur:1.6,cam:CAM_LOW};
});
def('flutter','Tijeras',function(o){
  var a=X(SUPFL({hf:'w'}),H(.12,.05,.05),{fl:[.08,.32,.9],fr:[.08,.12,.94]});
  var b=X(a,{fl:[.08,.12,.94],fr:[.08,.32,.9]});
  return{keys:[a,b],ease:'sine',dur:.9,cam:CAM_LOW};
});
def('windmill','Windmill',function(o){
  var a=X({hl:[.03,-.55,.05],hr:[0,.56,0]},F(.25,.08,0));
  var b=X(a,{bend:-45,lumb:30,twist:30});
  return{keys:[a,b],hands:['r'],cam:CAM_STAND};
});
def('plank','Plancha',function(o){
  var A=[0,.1,-.95],p=plank(.36,A);
  var a=X({root:p.root,pitch:p.pitch,hf:'w',epw:[0,-1,-.6]},H(.12,.05,p.sz+.28),F(.1,.1,-.95),TO(.1,.0,-.88));
  var b=X(a,{root:add(p.root,[0,.03,0])});
  if(o.twist){a.ptw=-25;b.ptw=25;}
  return{keys:[a,b],dur:o.twist?2.4:4,ease:'sine',cam:CAM_LOW};
});
def('sideplank','Plancha lateral',function(o){
  var a={mir:0,root:[0,.45,0],roll:-72,hf:'w',hl:[.49,.05,.27],hr:[.6,1.25,0],epw:[0,-1,-.4],fl:[-.9,.09,.04],fr:[-.88,.2,-.04]};
  var b=X(a,{root:[0,.5,0]});
  if(o.abd)b=X(b,{fr:[-.78,.62,-.04]});
  if(o.add)b=X(b,{fl:[-.82,.35,.04]});
  return{keys:[a,b],ease:'sine',dur:o.abd||o.add?2.2:4,cam:X(CAM_LOW,{yo:0})};
});
def('sidelying','Elevación lateral de pierna tumbado',function(o){
  var a={mir:0,root:[0,.14,0],roll:-90,hf:'w',hl:[.62,.06,.08],hr:[.25,.05,.28],fl:[-.9,.07,0],fr:[-.9,.18,0]};
  var b=o.add?X(a,{fl:[-.88,.32,0],fr:[-.35,.1,.38]}):X(a,{fr:[-.82,.58,0]});
  if(o.add)a=X(a,{fr:[-.35,.1,.38]});
  return{keys:[a,b],cam:X(CAM_LOW,{yo:0})};
});
def('abd_seated','Abducción de cadera sentado',function(o){
  var a=X(SEAT({hf:'r'}),H(.25,-.03,.05),F(.14,.08,.44),{kp:[.3,0,1]});
  var b=X(a,F(.32,.08,.4),{kp:[1,0,.5]});
  if(o.add){var t=a;a=b;b=t;}
  return{keys:[a,b],props:seatP(true),dyn:function(J){return['l','r'].map(function(k){var K=J.side[k].K,s=J.side[k].s;return capP(add(K,[s*.09,.02,-.12]),add(K,[s*.09,.02,.08]),.045,C.pad);});},cam:X(CAM_STAND,{ty:.7})};
});
def('abd_stand','Abducción de cadera de pie',function(o){
  var a=X({hf:'w'},H(.22,1.1,.4),F(.12,.08,.02));
  var b=X(a,{fr:[.48,.15,0]});
  if(o.add){a=X(a,{fr:[.42,.14,0]});b=X(b,{fr:[-.02,.08,.06]});}
  return{keys:[a,b],uniL:true,footCable:true,anc:o.add?[-.9,.1,0]:[.9,.1,0],cam:CAM_STAND};
});
def('butterfly','Mariposa (aductores)',function(o){
  var a=X({root:[0,.14,0],hf:'w',lumb:5},H(.07,.1,.42),F(.07,.07,.36),{kpw:[1,.6,.1]});
  var b=X(a,{lumb:35,thor:10});
  return{keys:[a,b],dur:4,ease:'sine',cam:CAM_LOW};
});
def('monster','Monster walk',function(o){
  var a=X({root:[0,.84,-.05],lumb:15},H(.03,-.5,.12),{fl:[.26,.08,.04],fr:[.12,.08,.04],kp:[.6,0,1]});
  var b=X(a,{fl:[.12,.08,.04],fr:[.26,.08,.04]});
  return{keys:[a,b],ease:'sine',dur:1.4,cam:CAM_STAND};
});
def('bench','Press de banca',function(o){
  var kind=supKind(o),x=o.close?.08:o.wide?.34:(o.eq==='dumbbell'||o.eq==='kettlebell')?.22:.24;
  if(o.seatMachine){
    var s0=X(SEAT({hf:'t',lumb:-5}),H(x,-.05,.12)),s1=X(s0,H(x,-.02,.55));
    return{keys:[s0,s1],props:seatP(true),cam:X(CAM_STAND,{ty:.85,yo:.7})};
  }
  if(o.standing){
    var t0=X({hf:'t'},H(x,-.06,.14),{fl:[.12,.08,.22],fr:[.12,.08,-.22]}),t1=X(t0,H(x,-.02,.55));
    return{keys:[t0,t1],anc:[.3,1.3,-.8],cam:X(CAM_STAND,{yo:.7})};
  }
  var a=supBase(kind,X(H(x,kind==='floor'?-.1:-.07,kind==='floor'?.13:.17)));
  var b=X(a,H(x,0,.54));
  var props=supProps(kind,a);
  if(o.eq==='barbell'&&(kind==='flat'||kind==='incline'))props=props.concat([capP([-.58,0,-.12],[-.58,1.12,-.12],.03),capP([.58,0,-.12],[.58,1.12,-.12],.03)]);
  return{keys:[a,b],props:props,anc:[.8,.15,a.root[2]-.3],cam:CAM_LOW};
});
def('fly','Aperturas',function(o){
  if(o.standing){
    var lo=o.low;
    var s0=X({hf:'t',lumb:15,ep:[.7,0,-1]},lo?H(.55,-.35,.1):H(.58,.15,.05),{fl:[.12,.08,.2],fr:[.12,.08,-.2]});
    var s1=X(s0,lo?H(.05,.15,.42):H(.02,-.22,.42));
    return{keys:[s0,s1],anc:lo?[.95,.12,-.2]:[.95,2.05,-.25],cam:CAM_STAND};
  }
  if(o.seatMachine){var m0=X(SEAT({hf:'t',ep:[0,-1,0]}),H(.52,0,.02));return{keys:[m0,X(m0,H(.05,0,.4))],props:seatP(true),cam:X(CAM_STAND,{ty:.85})};}
  var kind=supKind(o);
  var a=supBase(kind,X({ep:[.7,0,-1]},H(.6,.02,.1)));
  var b=X(a,H(.1,0,.5));
  return{keys:[a,b],props:supProps(kind,a),anc:[.9,.1,a.root[2]-.4],cam:CAM_LOW};
});
def('pullover','Pullover',function(o){
  var kind=o.decline?'decline':o.ball?'ball':'flat';
  var a=supBase(kind,X({ep:[.4,.3,1]},H(-.1,.48,-.22)));
  var b=X(a,H(-.1,.02,.52));
  return{keys:[a,b],one:o.eq==='dumbbell'||o.eq==='kettlebell',props:supProps(kind,a),anc:[0,.3,-1.3],cableBar:true,cam:CAM_LOW};
});
def('pushup','Flexión',function(o){
  var A=[0,.1,-.95],top=.6,bot=.24,x=o.close?.09:o.wide?.4:.25,props=[],L;
  if(o.incline){top=.98;bot=.66;}
  if(o.decline){A=[0,.5,-1.0];top=.62;bot=.3;}
  if(o.knee){A=[0,.08,-.42];L=.97;top=.55;bot=.24;}
  if(o.wall){A=[0,.1,-.25];top=1.32;bot=1.2;}
  if(o.scap){bot=.54;}
  var pt=plank(top,A,L),pb=plank(bot,A,L);
  var hy=o.incline?.47:o.wall?1.3:.04,hz=o.wall?1.0:pt.sz;
  var feet=o.knee?X(F(.1,.12,-.82),TO(.1,.3,-.9)):X(F(.1,A[1],A[2]),TO(.1,A[1]-.09,A[2]+.07));
  var a=X({root:pt.root,pitch:pt.pitch,hf:'w',kpw:o.knee?[0,-1,0]:null},H(x,hy,hz),feet);
  var b=X(a,{root:pb.root,pitch:pb.pitch,shrug:o.scap?.04:0});
  if(o.incline)props.push(stepBox([0,.22,hz],[.8,.44,.35]));
  if(o.decline)props.push(stepBox([0,.22,-1.0],[.6,.44,.4]));
  if(o.wall)props.push(box([0,1.2,1.04],[1.6,2.4,.05],0,C.wall));
  return{keys:[a,b],props:props,hop:o.plyo?.1:0,cam:o.wall?CAM_STAND:CAM_LOW};
});
def('pike','Flexión pike',function(o){
  var a=X({root:[0,.95,-.15],pitch:140,hf:'w'},H(.24,.04,.4),F(.1,.1,-.65),TO(.1,.01,-.55));
  var b=X(a,{root:[0,.82,-.08],pitch:150});
  return{keys:[a,b],cam:CAM_LOW};
});
def('handstand','Parada de manos',function(o){
  var a=X({root:[0,1.05,0],pitch:180,hf:'w',ff:'r'},H(.2,.03,0),F(.1,.95,0));
  var b=o.press?X(a,{root:[0,.82,0]}):X(a,{root:[0,1.06,.01]});
  return{keys:[a,b],ease:o.press?null:'sine',dur:o.press?3.2:4,cam:X(CAM_STAND,{ty:1})};
});
def('planche','Plancha calisténica',function(o){
  var a=X({root:[0,.55,-.25],pitch:90,lumb:30,hf:'w',ff:'r'},H(o.wide?.5:.22,.04,-.1),F(.08,.1,-.3));
  var b=X(a,{root:[0,.58,-.46],lumb:0},F(.08,0,-.92));
  return{keys:[a,b],dur:4,cam:CAM_LOW};
});
def('lever_hold','Front lever',function(o){
  var a=HANG();
  var back=o.back;
  var b=X(a,{root:back?[0,1.69,-.46]:[0,1.69,.46],pitch:back?90:-90},F(.08,0,back?-.92:.92));
  return{keys:[a,b],dur:4,load:'none',props:pullBar(2.27,0),cam:CAM_HANG};
});
def('dip','Fondos en paralelas',function(o){
  var lean=o.chest?25:8;
  var a=X({root:[0,1.35,0],hf:'w',ff:'r',lumb:lean},H(.25,1.25,0),F(.1,-.6,-.3));
  var b=X(a,{root:[0,1.06,-.02],lumb:lean+12});
  if(o.scap){b=X(a,{root:[0,1.29,0],shrug:.05});}
  return{keys:[a,b],props:dipBars(1.25),cam:X(CAM_HANG,{ty:1.1,yo:.6})};
});
def('benchdip','Fondos en banco',function(o){
  var a=X({root:[0,.6,-.2],hf:'w'},H(.21,.47,-.34),o.knees?F(.12,.08,.45):F(.12,.08,.65));
  var b=X(a,{root:[0,.32,-.15],lumb:10});
  return{keys:[a,b],props:[box([0,.22,-.48],[1.1,.44,.36])],cam:X(CAM_STAND,{ty:.6,yo:.9})};
});
function standOrSeat(o,x){return o.seated?SEAT(X({hf:'s'},x)):X({hf:'s'},F(.14,.08,.02),x);}
def('ohp','Press de hombros',function(o){
  var db=o.eq==='dumbbell'||o.eq==='kettlebell'||o.eq==='band',a,b;
  if(o.arnold){a=standOrSeat(o,X({ep:[.3,-1,1]},H(-.05,.03,.15)));b=X(a,H(.04,.56,0),{ep:[.9,-1,.2]});}
  else if(o.behind){a=standOrSeat(o,X({ep:[.5,-1,-.2]},H(.1,.05,-.1)));b=X(a,H(.08,.56,0));}
  else if(db){a=standOrSeat(o,X({ep:[.9,-1,.2]},H(.14,.06,.07)));b=X(a,H(.04,.56,0));}
  else{a=standOrSeat(o,X({ep:[.5,-1,.6]},H(.07,.04,.15)));b=X(a,H(.07,.56,.02));}
  return{keys:[a,b],props:o.seated?seatP(true):[],cam:o.seated?X(CAM_STAND,{ty:.95}):X(CAM_STAND,{ty:1.05})};
});
def('lateral','Elevación lateral',function(o){
  var a=standOrSeat(o,X({ep:[.2,-.3,-1]},H(.05,-.55,.07)));
  var b=X(a,H(.54,-.08,.06));
  return{keys:[a,b],props:o.seated?seatP(false):[],anc:[-.25,.1,.05],cam:CAM_STAND};
});
def('frontraise','Elevación frontal',function(o){
  var a=standOrSeat(o,X({ep:[.2,-.3,-1]},H(.04,-.55,.08)));
  var b=X(a,o.overhead?H(.04,.45,.3):H(.04,-.04,.55));
  return{keys:[a,b],props:o.seated?seatP(false):[],anc:[0,.1,-.4],cableBar:true,cam:X(CAM_STAND,{yo:.7})};
});
def('yraise','Y-raise',function(o){
  var a=X({root:[0,.78,0],pitch:42,hf:'s'},H(.03,-.54,.03),F(.15,.08,-.55));
  var b=X(a,H(.35,.25,.35));
  return{keys:[a,b],props:frontPad(a),cam:X(CAM_STAND,{ty:.8,yo:.8})};
});
def('reardelt','Apertura posterior',function(o){
  var a,props=[];
  if(o.seatMachine){a=X(SEAT({hf:'t'}),H(.05,0,.5));return{keys:[a,X(a,H(.55,0,.05))],props:seatP(false).concat([box([0,.95,.3],[.34,.5,.08],0,C.pad)]),cam:X(CAM_STAND,{ty:.85,yo:.4})};}
  if(o.standing&&o.eq==='cable'){a=X({hf:'s'},H(-.05,-.02,.5),F(.14,.08,.02));return{keys:[a,X(a,H(.55,0,.05))],anc:[-.9,1.55,.7],cam:CAM_STAND};}
  if(o.prone){a=X({root:[0,.78,0],pitch:42,hf:'s'},H(.03,-.54,.04),F(.15,.08,-.55));props=frontPad(a);}
  else if(o.seated){a=SEAT({lumb:60,thor:8,hf:'s'});a=X(a,H(.02,-.48,.08));props=seatP(false);}
  else a=X(HINGE({hf:'s',neck:-15}),H(.02,-.54,.06));
  var b=X(a,H(.52,-.12,-.04));
  return{keys:[a,b],props:props,anc:[-.3,.1,.3],cam:X(CAM_STAND,{yo:.6})};
});
def('uprow','Remo al mentón',function(o){
  var a=X({hf:'s',ep:[1,.8,-.2]},H(-.07,-.5,.1),F(.14,.08,.02));
  var b=X(a,H(0,-.04,.13));
  if(o.hinge)a=X(a,{root:[0,.85,-.12],lumb:35});
  return{keys:[a,b],one:o.eq==='kettlebell',anc:[0,.1,.4],cableBar:true,cam:CAM_STAND};
});
def('facepull','Face pull / remo posterior',function(o){
  var a=X({hf:'s',ep:[1,.4,-.4]},H(0,-.05,.55),F(.14,.08,.02));
  var b=X(a,H(.25,.06,.06));
  return{keys:[a,b],anc:[0,1.5,1.4],cam:X(CAM_STAND,{yo:.6})};
});
def('extrot','Rotación de hombro',function(o){
  var a=X({hf:'s',ep:[0,-1,-.1]},H(-.2,-.29,.15),F(.14,.08,.02));
  var b=X(a,H(.22,-.29,.15));
  if(o.internal){var t=a;a=b;b=t;}
  return{keys:[a,b],hands:o.uni?['r']:null,anc:o.internal?[.8,1.1,.1]:[-.8,1.1,.1],cam:CAM_STAND};
});
def('shrug','Encogimiento de hombros',function(o){
  var a=X({hf:'s'},H(.06,-.55,o.eq==='barbell'||o.eq==='smith'?.1:.03),F(.14,.08,.02));
  var b=X(a,{shrug:.07});
  if(o.prone){a=X(a,{root:[0,.78,0],pitch:42},F(.15,.08,-.55));b=X(a,{shrug:.07});return{keys:[a,b],props:frontPad(a),cam:CAM_STAND};}
  return{keys:[a,b],anc:[0,.1,.25],cam:CAM_STAND};
});
def('row','Remo inclinado',function(o){
  var a=X(HINGE({hf:'s'}),H(.07,-.54,.04));
  var b=X(a,H(.1,-.3,-.18));
  if(o.pendlay){a=X(a,{root:[0,.92,-.2],lumb:75});b=X(a,H(.1,-.2,-.18));}
  return{keys:[a,b],anc:[0,.1,.9],cam:X(CAM_STAND,{yo:.25})};
});
def('row_one','Remo a una mano',function(o){
  var a=X({root:[0,.95,-.18],lumb:75,thor:5,neck:-15,hf:'s',hl:[.0,-.45,.2],hr:[.03,-.54,.03]},{fl:[.15,.08,.25],fr:[.15,.08,-.15]});
  var b=X(a,{hr:[.08,-.25,-.2]});
  return{keys:[a,b],hands:['r'],props:[box([0,.25,.6],[.4,.5,.6]),box([0,.52,.6],[.4,.06,.6],0,C.pad)],anc:[0,.1,.9],cam:X(CAM_STAND,{yo:.7})};
});
def('row_seated','Remo sentado',function(o){
  if(o.machine){var m0=X(SEAT({hf:'s'}),H(.15,-.05,.55)),m1=X(m0,H(.18,-.12,.04));
    return{keys:[m0,m1],props:seatP(false).concat([box([0,1.0,.36],[.34,.5,.08],0,C.pad)]),cam:X(CAM_STAND,{ty:.85,yo:.8})};}
  var a=X({root:[0,.5,0],lumb:28,neck:-5,hf:'s'},H(.1,-.08,.55),F(.12,.3,.78));
  var b=X(a,{lumb:-5,neck:0},H(.12,-.26,.06));
  return{keys:[a,b],anc:[0,.42,1.35],cableBar:true,props:[box([0,.2,-.05],[.32,.4,.8],0,C.pad),box([0,.25,.88],[.5,.5,.06])],cam:X(CAM_STAND,{ty:.6,yo:1.1})};
});
def('row_high','Remo alto',function(o){
  var a=X(SEAT({hf:'s',ep:[1,-.4,-.4]}),H(.22,.4,.42));
  var b=X(a,H(.25,-.08,0));
  if(o.kneel){a=X(KNEEL({hf:'s',ep:[1,-.4,-.4]}),H(.22,.4,.42));b=X(a,H(.25,-.08,0));return{keys:[a,b],anc:[0,2.2,.8],cam:X(CAM_STAND,{yo:.7})};}
  return{keys:[a,b],anc:[0,2.2,.8],props:seatP(false),cam:X(CAM_STAND,{yo:.7})};
});
def('row_incline','Remo con apoyo en banco inclinado',function(o){
  var a=X({root:[0,.78,0],pitch:42,hf:'s'},H(.05,-.54,.04),F(.15,.08,-.55));
  var b=X(a,H(.12,-.27,-.16));
  return{keys:[a,b],props:frontPad(a),cam:X(CAM_STAND,{ty:.8,yo:.8})};
});
def('row_inverted','Remo invertido',function(o){
  var A=[0,.08,1.35],p0=supPlank(.49,A),p1=supPlank(.85,A);
  var a=X({root:p0.root,pitch:p0.pitch,hf:'w'},H(.28,1.05,0),F(.1,.1,1.35));
  var b=X(a,{root:p1.root,pitch:p1.pitch});
  return{keys:[a,b],props:pullBar(1.07,0),cam:X(CAM_LOW,{ty:.6})};
});
def('row_standing','Remo de pie',function(o){
  var a=X({root:[0,.93,-.12],pitch:-22,hf:'w'},H(.12,1.2,.55),F(.12,.08,.15));
  var b=X(a,{root:[0,.98,-.02],pitch:-8});
  if(o.eq==='cable'||o.eq==='band'){a=X({hf:'s'},H(.1,-.15,.55),F(.14,.08,.02),{lumb:10});b=X(a,H(.15,-.3,.05));return{keys:[a,b],anc:[0,1.1,1.3],cableBar:true,cam:X(CAM_STAND,{yo:.7})};}
  return{keys:[a,b],props:[capP([0,0,.6],[0,1.4,.6],.035)],cam:X(CAM_STAND,{yo:.7})};
});
def('renegade','Remo renegado',function(o){
  var p=plank(.6,[0,.1,-.95]);
  var a=X({root:p.root,pitch:p.pitch,hf:'w'},H(.22,.14,p.sz),F(.14,.1,-.95),TO(.14,.01,-.88));
  var b=X(a,{hl:[.24,.45,p.sz-.2],hr:[.24,.45,p.sz-.2]});
  return{keys:[a,b],altA:true,ease:'sine',dur:2.4,cam:CAM_LOW};
});
def('pullup','Dominada',function(o){
  var x=o.wide?.42:o.close?.17:.33;
  var a=HANG(X(H(x,2.25,0),o.chin?{ep:[.25,-.5,1]}:{}));
  var b=X(a,{root:[0,1.62,.06],neck:-10});
  if(o.muscleup)b=X(a,{root:[0,2.02,.12],lumb:10});
  if(o.scap)b=X(a,{root:[0,1.32,0]});
  return{keys:[a,b],props:pullBar(2.27,0),cam:CAM_HANG};
});
def('pulldown','Jalón al pecho',function(o){
  var x=o.wide?.46:o.close?.15:.38;
  if(o.standing||o.kneel){
    var base=o.kneel?KNEEL({hf:'w',ep:[1,-.4,.1]}):X({hf:'w',ep:[1,-.4,.1]},F(.14,.08,.02));
    var hy=o.kneel?1.5:2.0,ly=o.kneel?.95:1.32;
    var k0=X(base,H(x,hy,.12)),k1=X(k0,H(x-.08,ly,.14));
    return{keys:[k0,k1],anc:[0,2.6,.12],cableBar:true,cam:CAM_HANG};
  }
  var a=X(SEAT({hf:'w',ep:[1,-.4,.1]}),H(x,2.1,.12));
  var b=X(a,{lumb:-12},o.behind?H(x-.08,1.55,-.05):H(x-.08,1.42,.14));
  return{keys:[a,b],anc:[0,2.6,.12],cableBar:true,props:seatP(false).concat([capP([-.3,.72,.42],[.3,.72,.42],.05,C.pad),capP([0,0,-.35],[0,2.62,-.35],.045),capP([0,2.62,-.35],[0,2.62,.12],.035)]),cam:CAM_HANG};
});
def('sapd','Jalón con brazos rectos',function(o){
  var a=X({hf:'s',root:[0,.98,-.08],lumb:25,ep:[.2,1,0]},H(.15,.38,.45),F(.14,.08,.02));
  var b=X(a,H(.12,-.48,.1));
  return{keys:[a,b],anc:[0,2.1,.9],cableBar:true,cam:X(CAM_STAND,{yo:.8})};
});
def('curl','Curl de bíceps',function(o){
  var x=o.wide?.1:o.close?-.04:.02;
  var a=standOrSeat(o,X({ep:[.1,-.3,-1]},H(x,-.55,.06)));
  var b=X(a,H(x,-.12,.22));
  if(o.drag){a.ep=[.1,0,-1];b=X(a,H(x,-.18,.05));}
  return{keys:[a,b],grip:o.hammer?'neutral':null,props:o.seated?seatP(false):[],anc:[0,.12,.65],cableBar:true,cam:CAM_STAND};
});
def('curl_preacher','Curl predicador',function(o){
  var a=X(SEAT({lumb:8,hf:'s',ep:[0,-1,0]}),H(.02,-.42,.5));
  var b=X(a,H(.02,.04,.24));
  return{keys:[a,b],grip:o.hammer?'neutral':null,props:seatP(false).concat([box([0,.85,.3],[.55,.42,.06],-45,C.pad),capP([0,0,.42],[0,.78,.42],.035)]),anc:[0,.4,1.0],cableBar:true,cam:X(CAM_STAND,{ty:.85,yo:.8})};
});
def('curl_conc','Curl concentrado',function(o){
  var a=X(SEAT({lumb:40,thor:5,hf:'s',ep:[0,-1,.2]}),{hl:[.0,-.35,.25],hr:[-.04,-.52,.12]},F(.25,.08,.44));
  var b=X(a,{hr:[-.04,-.2,.25]});
  return{keys:[a,b],hands:['r'],props:seatP(false),anc:[0,.1,.5],cam:X(CAM_STAND,{ty:.7,yo:.5})};
});
def('curl_incline','Curl inclinado',function(o){
  var a=X({root:[0,.58,.1],pitch:o.lying?-70:-35,hf:'s',ep:[.1,-.3,-1]},H(.04,-.55,-.08),F(.2,.08,.6));
  var b=X(a,H(.04,-.18,.16));
  return{keys:[a,b],grip:o.hammer?'neutral':null,props:backPad(a,1),cam:X(CAM_STAND,{ty:.7,yo:1})};
});
def('curl_prone','Curl spider',function(o){
  var a=X({root:[0,.78,0],pitch:42,hf:'s',ep:[0,-1,-.3]},H(.03,-.55,.03),F(.15,.08,-.55));
  var b=X(a,H(.03,-.2,.2));
  return{keys:[a,b],grip:o.hammer?'neutral':null,props:frontPad(a),cam:X(CAM_STAND,{ty:.8,yo:.9})};
});
def('curl_overhead','Curl sobre la cabeza en polea',function(o){
  var a=X({hf:'s',ep:[.3,-1,-.5]},H(.55,.02,.05),F(.14,.08,.02));
  var b=X(a,H(.15,.12,.05));
  return{keys:[a,b],anc:[1.0,1.65,0],cam:CAM_STAND};
});
def('wristcurl','Curl de muñeca',function(o){
  var a=X(SEAT({lumb:30,hf:'w',ep:[.2,-1,0],wr:o.rev?40:-45}),H(.12,.58,.56));
  var b=X(a,{wr:o.rev?-40:45});
  return{keys:[a,b],grip:o.neutral?'neutral':null,props:seatP(false),cam:X(CAM_STAND,{ty:.7,yo:.7})};
});
def('wristcurl_back','Curl de muñeca tras la espalda',function(o){
  var a=X({hf:'s'},H(.03,-.55,-.1),F(.14,.08,.02));
  var b=X(a,{wr:-50});
  return{keys:[a,b],anc:[0,.1,-.4],cableBar:true,cam:X(CAM_STAND,{yo:2.4})};
});
def('forearm_rot','Pronación / supinación',function(o){
  var a=X(SEAT({lumb:15,hf:'w',ep:[.2,-1,0]}),H(.15,.62,.5));
  var b=X(a,{gr:160});
  return{keys:[a,b],hands:['r'],props:seatP(false),cam:X(CAM_STAND,{ty:.7,yo:.5})};
});
def('grip','Agarre / muñeca',function(o){
  var a=X({hf:'s'},H(.05,-.3,.4),F(.14,.08,.02));
  var b=X(a,{wr:o.circles?50:20});
  return{keys:[a,b],ease:'sine',dur:o.circles?1.6:1.2,cam:CAM_STAND};
});
def('wristroll','Enrollador de muñeca',function(o){
  var a=X({hf:'s',wr:-40},H(-.1,-.05,.52),F(.14,.08,.02));
  var b=X(a,{wr:40});
  return{keys:[a,b],altA:true,ease:'sine',dur:1.4,load:'bar',barHalf:.3,cam:CAM_STAND};
});
def('pushdown','Extensión de tríceps en polea',function(o){
  var a=X({hf:'s',lumb:12,ep:[.1,-.2,-1]},H(.03,-.12,.24),F(.14,.08,.02));
  var b=X(a,H(.03,-.52,.13));
  if(o.seated){a=X(SEAT({hf:'s',ep:[.1,-.2,-1]}),H(.03,-.12,.24));b=X(a,H(.03,-.52,.13));return{keys:[a,b],props:seatP(true),cam:X(CAM_STAND,{ty:.85})};}
  return{keys:[a,b],anc:[0,2.15,.45],cableBar:true,cam:X(CAM_STAND,{yo:.7})};
});
def('ohext','Extensión de tríceps sobre la cabeza',function(o){
  var bar=o.eq==='barbell'||o.eq==='ez-bar'||o.eq==='smith';
  var x=bar?-.02:-.12;
  if(o.eq==='cable'&&!o.uni){
    var c0=X({hf:'s',lumb:25,ep:[0,1,.4]},H(-.1,.15,-.12),{fl:[.12,.08,.22],fr:[.12,.08,-.22]}),c1=X(c0,H(-.1,.4,.5));
    return{keys:[c0,c1],anc:[0,1.8,-.6],cableBar:true,cam:X(CAM_STAND,{yo:.9})};
  }
  var base=o.kneel?KNEEL({hf:'s',ep:[0,1,.4]}):standOrSeat(o,{ep:[0,1,.4]});
  var a=X(base,H(x,.1,-.15));
  var b=X(a,H(x,.55,0));
  if(o.uni){a.hr=[-.02,.1,-.15];b.hr=[-.02,.55,0];}
  return{keys:[a,b],one:!bar&&!o.uni&&(o.eq==='dumbbell'||o.eq==='kettlebell'),hands:o.uni?['r']:null,props:o.seated?seatP(true):[],anc:[0,.1,-.3],cam:X(CAM_STAND,{ty:1})};
});
def('skull','Press francés tumbado',function(o){
  var kind=o.incline?'incline':o.decline?'decline':o.floor?'floor':o.ball?'ball':'flat';
  var x=(o.eq==='barbell'||o.eq==='ez-bar')?-.04:-.02;
  var a=supBase(kind,X({ep:[0,-.3,1]},H(x,.26,.1)));
  var b=X(a,H(x,.03,.55));
  return{keys:[a,b],props:supProps(kind,a),anc:[0,.3,-1.3],cableBar:true,cam:CAM_LOW};
});
def('kickback_tri','Patada de tríceps',function(o){
  var a=o.seated?SEAT({lumb:60,thor:8,hf:'t',ep:[.2,.2,-1]}):X({root:[0,.95,-.15],lumb:65,thor:10,neck:-15,hf:'t',ep:[.2,.2,-1]},F(.14,.08,.02));
  a=X(a,H(.02,-.36,.26));
  var b=X(a,H(.02,-.56,-.02));
  return{keys:[a,b],hands:o.uni?['r']:null,props:o.seated?seatP(false):[],anc:[0,.15,.6],cam:X(CAM_STAND,{yo:1.1})};
});
/* stretches */
def('st_ham','Estiramiento de isquiotibiales',function(o){
  var a=X({root:[0,.14,0],lumb:25,hf:'w'},H(.12,.2,.7),F(.1,.06,.9),TO(.1,.22,.95));
  var b=X(a,{lumb:65,thor:15,neck:10},H(.1,.12,.9));
  return{keys:[a,b],ease:'sine',dur:5,cam:CAM_LOW};
});
def('st_calf','Estiramiento de gemelo',function(o){
  var a=X({root:[0,.96,.1],pitch:12,hf:'w'},H(.22,1.45,.78),{fl:[.12,.08,.38],fr:[.12,.08,-.42]});
  var b=X(a,{root:[0,.94,.16],pitch:18});
  return{keys:[a,b],ease:'sine',dur:4.5,props:[box([0,1.2,.84],[1.6,2.4,.05],0,C.wall)],cam:X(CAM_STAND,{yo:1})};
});
def('st_quad','Estiramiento de cuádriceps',function(o){
  var a=X({hf:'w',hl:[.38,.95,.15],hr:[.15,.8,-.3],fl:[.1,.08,.02],fr:[.1,.74,-.3],kpw:[0,-1,.15]});
  var b=X(a,{hr:[.15,.86,-.34],fr:[.1,.8,-.33]});
  return{keys:[a,b],ease:'sine',dur:4.5,cam:X(CAM_STAND,{yo:1})};
});
def('st_hip','Estiramiento de flexores de cadera',function(o){
  var a=X({root:[0,.55,-.02],hf:'t',ep:[1,0,-.6]},H(-.03,-.3,.02),{fl:[.12,.08,.45],fr:[.12,.1,-.5],tr:[.12,.01,-.66]});
  var b=X(a,{root:[0,.5,.1],lumb:-5});
  return{keys:[a,b],ease:'sine',dur:4.5,cam:X(CAM_STAND,{ty:.6,yo:1})};
});
def('st_chest','Estiramiento de pecho',function(o){
  var a=X({hf:'s',ep:[.5,-.5,.6]},H(.3,-.3,-.25),F(.14,.08,.02));
  var b=X(a,{thor:-8,neck:-5},H(.42,-.12,-.35));
  return{keys:[a,b],ease:'sine',dur:4.5,cam:X(CAM_STAND,{yo:.7})};
});
def('st_tri','Estiramiento de tríceps',function(o){
  var a=X({hf:'s',ep:[0,1,.3],hl:[-.12,.22,-.12],hr:[-.34,.29,.02]},F(.14,.08,.02));
  var b=X(a,{hl:[-.15,.2,-.14],hr:[-.36,.3,0],bend:-6});
  return{keys:[a,b],ease:'sine',dur:4.5,cam:X(CAM_STAND,{yo:.5})};
});
def('st_shoulder','Estiramiento de hombro',function(o){
  var a=X({hf:'s',ep:[0,-1,-.3],hl:[-.42,-.02,.28],hr:[-.25,-.08,.3]},F(.14,.08,.02));
  var b=X(a,{hl:[-.48,-.02,.2],hr:[-.3,-.06,.24]});
  return{keys:[a,b],ease:'sine',dur:4.5,cam:CAM_STAND};
});
def('st_side','Estiramiento lateral',function(o){
  var a=X({hf:'s',bend:10},H(-.12,.54,0),F(.18,.08,.02));
  var b=X(a,{bend:32});
  return{keys:[a,b],ease:'sine',dur:4.5,cam:CAM_STAND};
});
def('st_neck','Estiramiento de cuello',function(o){
  var a=X({hf:'t',nside:-10,ep:[.8,.6,0],hl:[.03,-.55,.05],hr:[-.24,.28,.03]},F(.14,.08,.02));
  var b=X(a,{nside:-38});
  return{keys:[a,b],ease:'sine',dur:4.5,cam:CAM_STAND};
});
def('st_glute','Estiramiento de glúteo',function(o){
  var a=X(SUPF({mir:0,hf:'w',hl:[-.02,.5,.2],hr:[-.16,.5,.2]}),{fl:[.08,.08,.94],fr:[-.1,.45,.3]});
  var b=X(a,{hl:[-.02,.56,.12],hr:[-.16,.56,.12],fr:[-.08,.55,.15]});
  return{keys:[a,b],ease:'sine',dur:4.5,cam:CAM_LOW};
});
def('st_wrist','Estiramiento de muñeca',function(o){
  var a=X({hf:'s',wr:20},H(-.08,-.08,.5),F(.14,.08,.02));
  var b=X(a,{wr:60});
  return{keys:[a,b],ease:'sine',dur:4,cam:CAM_STAND};
});
def('st_catcow','Movilidad de columna (gato-camello)',function(o){
  var a=QUAD({lumb:15,thor:10,neck:15});
  var b=X(a,{lumb:-15,thor:-10,neck:-20});
  return{keys:[a,b],ease:'sine',dur:4,cam:CAM_LOW};
});
def('st_twist','Giro de columna tumbado',function(o){
  var a=X(SUPF({hf:'w',ptw:35,twist:-35}),H(.65,.05,-.45));
  var b=X(a,{ptw:-35,twist:35});
  return{keys:[a,b],ease:'sine',dur:5,cam:CAM_LOW};
});
/* cardio / power */
def('run','Carrera',function(o){
  var hi=o.high?.6:.45;
  var a=X({hf:'s',lumb:6,ep:[.1,-.3,-1]},H(.05,-.32,-.22),{fl:[.11,hi,.25],fr:[.11,hi,.25]});
  var b=X(a,H(.05,-.32,.22),F(.11,.14,-.3));
  return{keys:[a,b],altA:true,altL:true,ease:'sine',dur:o.high?.7:.8,cam:CAM_STAND};
});
def('walk','Caminar',function(o){
  var a=X({hf:'s'},o.farmer?H(.05,-.55,.03):H(.04,-.5,-.12),{fl:[.11,.2,.18],fr:[.11,.2,.18]});
  var b=X(a,o.farmer?{}:H(.04,-.5,.12),F(.11,.09,-.18));
  var props=o.tread?[box([0,.05,0],[.75,.1,1.7]),capP([-.38,.1,.6],[-.38,1.1,.7],.03),capP([.38,.1,.6],[.38,1.1,.7],.03),capP([-.38,1.1,.7],[.38,1.1,.7],.03)]:[];
  if(o.tread){a.root=[0,1.1,0];a.fl=[.11,.3,.18];a.fr=[.11,.3,.18];b.root=[0,1.1,0];b.fl=[.11,.19,-.18];b.fr=[.11,.19,-.18];}
  return{keys:[a,b],altA:!o.farmer,altL:true,ease:'sine',dur:1.2,props:props,cam:CAM_STAND};
});
def('jack','Jumping jack',function(o){
  var a=X({hf:'s'},H(.05,-.55,.05),F(.1,.08,.02));
  var b=X(a,H(.33,.48,0),F(.42,.12,.02));
  return{keys:[a,b],ease:'sine',hop:.12,dur:1.0,cam:CAM_STAND};
});
def('jumprope','Comba',function(o){
  var a=X({hf:'s',wr:-20},H(.15,-.42,.15),F(.1,.08,.02));
  var b=X(a,{root:[0,1.06,0],wr:20},F(.1,.16,.02));
  return{keys:[a,b],ease:'sine',dur:.45,cam:CAM_STAND};
});
def('burpee','Burpee',function(o){
  var p=plank(.6,[0,.1,-.95]);
  var st=X({hf:'w'},H(.22,.92,.05),F(.13,.08,0));
  var sq=X(st,{root:[0,.55,-.05],lumb:55,thor:10},H(.22,.05,p.sz));
  var pl=X({root:p.root,pitch:p.pitch,hf:'w'},H(.22,.05,p.sz),F(.13,.1,-.95),TO(.13,.01,-.88));
  var jp=X(st,{root:[0,1.2,0]},H(.2,2.0,.05),F(.13,.25,0));
  return{keys:[st,sq,pl,sq,jp],seq:true,dur:4,cam:CAM_STAND};
});
def('inchworm','Gusano (inchworm)',function(o){
  var p=plank(.6,[0,.1,-.95]);
  var st=X({hf:'w'},H(.22,.92,.05),F(.13,.08,0));
  var fold=X(st,{root:[0,.95,-.15],lumb:70,thor:15},H(.22,.05,.35));
  var pl=X({root:p.root,pitch:p.pitch,hf:'w'},H(.22,.05,p.sz),F(.13,.1,-.95),TO(.13,.01,-.88));
  return{keys:[st,fold,pl,fold],seq:true,dur:5,cam:CAM_STAND};
});
def('climber','Escalador',function(o){
  var p=plank(.6,[0,.1,-.95]);
  var a=X({root:p.root,pitch:p.pitch,hf:'w'},H(.22,.04,p.sz),F(.1,.1,-.95),TO(.1,.01,-.88));
  var b=X(a,F(.1,.35,-.25),TO(.1,.26,-.12));
  return{keys:[a,b],altL:true,ease:'sine',dur:.9,cam:CAM_LOW};
});
def('bearcrawl','Paseo del oso',function(o){
  var a=QUAD({root:[0,.62,0]},F(.1,.1,-.3),TO(.1,.01,-.18));
  a=X(a,{hl:[.18,.05,.58],hr:[.18,.05,.58],fl:[.1,.1,-.4],fr:[.1,.1,-.4]});
  var b=X(a,{hl:[.18,.05,.4],hr:[.18,.05,.4],fl:[.1,.14,-.22],fr:[.1,.14,-.22]});
  return{keys:[a,b],altA:true,altL:true,ease:'sine',dur:1.2,cam:CAM_LOW};
});
def('bike','Bicicleta estática',function(o){
  var a=X({root:[0,.95,-.12],lumb:30,thor:5,hf:'w'},H(.2,1.05,.48),F(.12,.62,.33));
  var b=X(a,F(.12,.22,.28));
  return{keys:[a,b],altL:true,ease:'sine',dur:1.0,props:[capP([0,.87,-.2],[0,.87,-.02],.05,C.pad),capP([0,.85,-.1],[0,.35,.2],.035),capP([0,.35,.2],[0,1.02,.48],.035),capP([-.24,1.05,.48],[.24,1.05,.48],.025),discP([0,.38,.38],[1,0,0],.24,C.frame)],cam:CAM_STAND};
});
def('elliptical','Elíptica',function(o){
  var a=X({hf:'w'},H(.25,1.2,.4),{fl:[.12,.32,.25],fr:[.12,.32,.25]});
  var b=X(a,H(.25,1.1,.2),F(.12,.2,-.2));
  a.root=[0,1.2,0];b.root=[0,1.15,0];
  return{keys:[a,b],altA:true,altL:true,ease:'sine',dur:1.4,props:[box([0,.1,0],[.6,.2,1.2]),capP([-.25,.2,.55],[-.25,1.2,.4],.03),capP([.25,.2,.55],[.25,1.2,.4],.03)],cam:CAM_STAND};
});
def('handbike','Bicicleta de brazos',function(o){
  var a=X(SEAT({hf:'s'}),H(.12,-.15,.5));
  var b=X(a,H(.12,.05,.35));
  return{keys:[a,b],altA:true,ease:'sine',dur:1.2,props:seatP(false),cam:X(CAM_STAND,{ty:.85})};
});
def('skater','Saltos de patinador',function(o){
  var a={mir:0,root:[.32,.82,-.05],lumb:30,hf:'s',hl:[-.25,-.4,.25],hr:[.3,-.45,-.15],fl:[.36,.08,.02],fr:[.05,.22,-.38]};
  var b={mir:0,root:[-.32,.82,-.05],lumb:30,hf:'s',hl:[-.3,-.45,-.15],hr:[.25,-.4,.25],fl:[-.05,.22,-.38],fr:[-.36,.08,.02]};
  return{keys:[X(DEF,a),X(DEF,b)],ease:'sine',hop:.12,dur:1.4,cam:CAM_STAND};
});
def('slam','Slam con balón medicinal',function(o){
  var a=X({hf:'s'},H(-.13,.52,.05),F(.16,.08,.02));
  var b=X(a,{root:[0,.7,-.15],lumb:50},H(-.13,-.5,.25));
  return{keys:[a,b],one:true,load:'ball',dur:1.8,cam:CAM_STAND};
});
def('mbpass','Pase de pecho',function(o){
  var a=X({hf:'t'},H(-.12,-.18,.18),{fl:[.12,.08,.2],fr:[.12,.08,-.2]});
  var b=X(a,H(-.12,-.05,.56));
  if(o.lying){a=supBase('floor',H(-.12,-.18,.18));b=X(a,H(-.12,-.05,.56));return{keys:[a,b],one:true,load:'ball',cam:CAM_LOW};}
  return{keys:[a,b],one:true,load:'ball',dur:1.8,cam:CAM_STAND};
});
def('ropes','Cuerdas de batalla',function(o){
  var a=X({root:[0,.82,-.08],lumb:20,hf:'s'},H(.08,-.38,.45),F(.2,.08,.05));
  var b=X(a,H(.08,-.1,.48));
  return{keys:[a,b],altA:true,ease:'sine',dur:.6,load:'rope',anc:[.25,.1,3],cam:CAM_STAND};
});
def('hook','Gancho de boxeo',function(o){
  var a=X({hf:'s',twist:-10,ep:[1,.3,0]},H(-.12,-.15,.25),{fl:[.12,.08,.2],fr:[.12,.08,-.2]});
  var b=X(a,{twist:40,hl:[-.32,-.02,.35]});
  return{keys:[a,b],dur:1.3,cam:CAM_STAND};
});
def('circles','Círculos de brazos',function(o){
  var a=X({hf:'s'},H(.45,-.25,.2),F(.14,.08,.02));
  var b=X(a,H(.45,.2,-.1));
  return{keys:[a,b],ease:'sine',dur:1.4,cam:CAM_STAND};
});
def('neutral','Postura neutra',function(o){
  var a=X({},SIDE,F(.13,.08,.02));
  var b=X(a,{root:[0,1.01,0],thor:-2});
  return{keys:[a,b],ease:'sine',dur:4,cam:CAM_STAND};
});

/* ---------- muscle involvement per pattern ---------- */
var MS={
  squat:['glutes quads hamstrings','spine abs adductors calves'],jumpsquat:['glutes quads calves','hamstrings abs'],pistol:['quads glutes','abs hamstrings calves'],
  sissy:['quads','abs'],wallsit:['quads glutes','calves'],deadlift:['glutes hamstrings spine','quads traps forearms lats'],rdl:['hamstrings glutes spine','forearms'],
  pullthrough:['glutes hamstrings','spine'],goodmorning:['hamstrings spine glutes','abs'],sldl:['hamstrings glutes','spine abs'],swing:['glutes hamstrings','spine delts abs'],
  clean:['glutes hamstrings traps','quads delts forearms'],snatch:['glutes traps delts','hamstrings quads triceps'],thruster:['quads glutes delts','triceps abs'],pushpress:['delts triceps','quads glutes'],
  lunge:['quads glutes','hamstrings adductors calves'],lungejump:['quads glutes calves','hamstrings'],sidelunge:['adductors quads glutes','hamstrings'],curtsy:['glutes quads','abductors adductors'],
  stepup:['quads glutes','hamstrings calves'],legpress:['quads glutes','hamstrings adductors calves'],legext:['quads',''],legcurl:['hamstrings','calves glutes'],legcurl_seated:['hamstrings','calves'],
  legcurl_standing:['hamstrings','calves'],nordic:['hamstrings','glutes spine calves'],calf:['calves',''],calf_seated:['calves',''],calf_donkey:['calves',''],
  bridge:['glutes hamstrings','spine abs'],hipthrust:['glutes hamstrings','quads spine'],kneel_thrust:['glutes','hamstrings'],kickback_glute:['glutes','hamstrings spine'],hipext:['glutes','hamstrings'],
  revhyper:['glutes hamstrings spine',''],backext:['spine glutes','hamstrings'],superman:['spine glutes','upper-back delts'],cobra:['spine','abs'],
  legraise:['abs','quads'],hang_legraise:['abs','forearms lats quads'],chair_legraise:['abs','quads'],revcrunch:['abs',''],crunch:['abs',''],crunch_kneel:['abs','lats'],crunch_stand:['abs',''],
  crunch_seated:['abs',''],situp:['abs','quads'],vup:['abs','quads'],lsit:['abs quads','triceps'],bicycle:['abs','quads'],deadbug:['abs','quads delts'],russian:['abs','spine'],
  twist:['abs','delts spine'],pallof:['abs','delts'],sidebend:['abs','spine'],heeltouch:['abs',''],flutter:['abs','quads'],windmill:['abs delts','glutes hamstrings'],
  plank:['abs','delts glutes quads'],sideplank:['abs','glutes delts abductors'],sidelying:['abductors','glutes'],abd_seated:['abductors','glutes'],abd_stand:['abductors','glutes'],
  butterfly:['adductors',''],monster:['abductors glutes','quads'],bench:['pectorals triceps delts','serratus-anterior'],fly:['pectorals','delts biceps'],pullover:['lats pectorals','triceps serratus-anterior'],
  pushup:['pectorals triceps delts','abs serratus-anterior'],pike:['delts triceps','pectorals'],handstand:['delts triceps','traps abs'],planche:['delts pectorals abs','triceps biceps'],
  lever_hold:['lats abs','upper-back forearms'],dip:['triceps pectorals delts','abs'],benchdip:['triceps','delts pectorals'],ohp:['delts triceps','traps upper-back abs'],
  lateral:['delts','traps'],frontraise:['delts','pectorals traps'],yraise:['delts upper-back','traps'],reardelt:['delts upper-back','traps'],uprow:['delts traps','biceps'],
  facepull:['delts upper-back','traps biceps'],extrot:['delts',''],shrug:['traps','forearms'],row:['upper-back lats','biceps delts spine forearms'],row_one:['lats upper-back','biceps delts'],
  row_seated:['upper-back lats','biceps delts'],row_high:['upper-back lats','biceps delts'],row_incline:['upper-back lats','biceps delts'],row_inverted:['upper-back lats','biceps abs'],
  row_standing:['upper-back lats','biceps'],renegade:['upper-back lats abs','triceps'],pullup:['lats upper-back','biceps forearms abs'],pulldown:['lats upper-back','biceps'],sapd:['lats','triceps abs'],
  curl:['biceps','forearms'],curl_preacher:['biceps','forearms'],curl_conc:['biceps','forearms'],curl_incline:['biceps','forearms'],curl_prone:['biceps','forearms'],curl_overhead:['biceps','delts'],
  wristcurl:['forearms',''],wristcurl_back:['forearms',''],forearm_rot:['forearms',''],grip:['forearms',''],wristroll:['forearms','delts'],
  pushdown:['triceps',''],ohext:['triceps',''],skull:['triceps',''],kickback_tri:['triceps','delts'],
  st_ham:['hamstrings','calves spine'],st_calf:['calves',''],st_quad:['quads',''],st_hip:['quads','glutes'],st_chest:['pectorals','delts'],st_tri:['triceps','lats'],st_shoulder:['delts','upper-back'],
  st_side:['lats abs',''],st_neck:['levator-scapulae','traps'],st_glute:['glutes',''],st_wrist:['forearms',''],st_catcow:['spine abs',''],st_twist:['spine abs','glutes'],
  run:['quads calves glutes','hamstrings'],walk:['quads calves glutes','forearms'],jack:['calves delts','quads glutes'],jumprope:['calves','forearms delts'],burpee:['quads pectorals glutes','triceps abs'],
  inchworm:['hamstrings abs','delts'],climber:['abs quads','delts'],bearcrawl:['delts quads abs',''],bike:['quads','calves glutes'],elliptical:['quads glutes','calves'],handbike:['delts','biceps triceps'],
  skater:['glutes quads','adductors calves'],slam:['lats abs','delts glutes'],mbpass:['pectorals triceps','delts'],ropes:['delts','forearms abs'],hook:['delts abs','pectorals'],circles:['delts',''],neutral:['','']
};

/* ---------- classification ---------- */
function flags(s,m,eq){
  function has(re){return re.test(s);}
  return{eq:eq,m:m,s:s,
    uni:has(/one-arm|single-arm|one-hand|unilateral|-one-|archer/)&&!has(/one-leg|single-leg/),
    alt:has(/alternat|seesaw/),single:has(/single-leg|one-leg|one-legged|stork/),
    seated:has(/seated|sitted|chair/),incline:has(/incline/),decline:has(/decline/),
    wide:has(/wide/),close:has(/close|narrow|diamond/),hammer:has(/hammer|neutral|parallel|palm-in|palms-in/),
    kneel:has(/kneel/),ball:has(/stability-ball|exercise-ball|on-ball|bosu/),standing:has(/standing/),
    lying:has(/lying|supine/),prone:has(/prone/),floor:has(/floor/)};
}
function stretchKey(s,m){
  if(/neck/.test(s)||m==='levator-scapulae')return'st_neck';
  if(/hamstring|toe|seated-wide|big-toe|leg-up|lower-back-stretch-pyramid/.test(s))return'st_ham';
  if(/calf|calves|peroneal|tibialis|ankle|knee-stretch/.test(s))return'st_calf';
  if(/hip-flexor|world-greatest|lunge|runners/.test(s))return'st_hip';
  if(/quad|squad|rectus-femoris|chair-leg/.test(s))return'st_quad';
  if(/chest|pec|pectoralis/.test(s))return'st_chest';
  if(/tricep/.test(s))return'st_tri';
  if(/deltoid|shoulder/.test(s))return'st_shoulder';
  if(/glute|piriformis|frog|iron-cross|roller-hip/.test(s))return'st_glute';
  if(/adductor|butterfly/.test(s))return'butterfly';
  if(/wrist/.test(s))return'st_wrist';
  if(/lat|lateral|side/.test(s))return'st_side';
  if(/back|spine/.test(s))return'st_catcow';
  return{hamstrings:'st_ham',calves:'st_calf',quads:'st_quad',pectorals:'st_chest',triceps:'st_tri',delts:'st_shoulder',glutes:'st_glute',adductors:'butterfly',forearms:'st_wrist',lats:'st_side',spine:'st_catcow','upper-back':'st_shoulder',abs:'st_quad'}[m]||'st_side';
}
function curlKey(t,o){
  if(t(/wrist/)){o.neutral=t(/neutral/);return'wristcurl';}
  if(t(/preacher|peacher|scott/))return'curl_preacher';
  if(t(/spider|prone/))return'curl_prone';
  if(t(/concentration/))return'curl_conc';
  if(t(/incline/)&&!t(/prone/))return'curl_incline';
  if(t(/lying/)){o.lying=true;return'curl_incline';}
  if(t(/overhead/))return'curl_overhead';
  o.drag=t(/drag/);return'curl';
}
function pick(s,m,eq,cat,o){
  var t=function(re){return re.test(s);};
  if(cat==='stretching'||t(/stretch|yoga-pose|pose-sequence|reclining-big-toe/))return stretchKey(s,m);
  if(t(/neck/))return'st_neck';
  if(t(/front-lever|elevator|skin-the-cat/))return'lever_hold';
  if(t(/back-lever/)){o.back=true;return'lever_hold';}
  if(t(/planche|maltese/))return'planche';
  if(t(/handstand-push|stalder/)){o.press=true;return'handstand';}
  if(t(/handstand/))return'handstand';
  if(t(/flag|side-bridge|side-plank|push-up-to-side-plank|side-hip-on-parallel|side-push-up/)){if(t(/abduction/))o.abd=true;if(t(/adduction/))o.add=true;return'sideplank';}
  if(t(/burpee/))return'burpee';
  if(t(/inchworm/))return'inchworm';
  if(t(/climber|butt-ups/))return'climber';
  if(t(/jump-rope/))return'jumprope';
  if(t(/scissor/))return'lungejump';
  if(t(/jack-jump|star-jump|astride|jumping-jack/))return'jack';
  if(t(/hands-bike/))return'handbike';
  if(t(/bike|cycle-cross|air-bike/)){if(t(/air-bike/))return'bicycle';return'bike';}
  if(t(/elliptical|ski-step-?$/)&&!t(/skater/))return t(/ski-step/)?'skater':'elliptical';
  if(t(/skater|ski-step/))return'skater';
  if(t(/bear-crawl/))return'bearcrawl';
  if(t(/farmers/)){o.farmer=true;return'walk';}
  if(t(/high-knee|quick-feet/)){o.high=true;return'run';}
  if(t(/(^|-)run|sprint|push-to-run/))return'run';
  if(t(/treadmill|stepmill/)){o.tread=true;return'walk';}
  if(t(/walk(?!ing-lunge)|back-and-forth-step|march-sit/)&&!t(/lunge/)){if(t(/monster/))return'monster';if(t(/march-sit/))return'wallsit';return'walk';}
  if(t(/battling-ropes/))return'ropes';
  if(t(/hook|boxing/))return'hook';
  if(t(/round-arm|around-world|figure-8|circles/)&&m!=='forearms'&&m!=='calves')return'circles';
  if(t(/slam|sledge|overhead-throw|catch-and-overhead/))return'slam';
  if(t(/chest-pass|chest-push|chest-throw/)){o.lying=t(/supine/);return'mbpass';}
  if(t(/swing/)&&!t(/lunge|kneeling-step/))return'swing';
  if(t(/thruster|clean-and-press|squat-jerk|clean-and-jerk/))return'thruster';
  if(t(/jerk|push-press/))return'pushpress';
  if(t(/snatch-pull/))return'deadlift';
  if(t(/snatch/))return'snatch';
  if(t(/clean/)&&!t(/front-squat/))return'clean';
  if(t(/high-pull/)){o.hinge=true;return'uprow';}
  if(t(/get-up/)){o.goblet=true;return'squat';}
  if(t(/scapular-pull-up/)){o.scap=true;return'pullup';}
  if(t(/muscle-up/)){o.muscleup=true;return'pullup';}
  if(t(/gorilla-chin/)){o.knee=true;return'hang_legraise';}
  if(t(/assisted-standing|lever-assisted|band-assisted-pull/)&&t(/(^|-)chin|pull-up/)){o.standing=t(/standing/);if(t(/(^|-)chin/))o.chin=true;return o.standing?'pulldown':'pullup';}
  if(t(/(^|-)chin|pull-up|pull-ups|rope-climb/)&&!t(/pulldown|chest-dip|leg-curl/)){if(t(/(^|-)chin|underhand|reverse-grip|biceps/))o.chin=true;return'pullup';}
  if((t(/straight-arm-pulldown|pushdown-straight-arm|incline-pushdown/)&&m==='lats')||t(/ski-ergometer/))return'sapd';
  if(t(/pulldown|pull-down/)&&m!=='biceps'||t(/cable-pulldown-bicep|standing-pulldown-with-rope/)){if(t(/rear|behind/))o.behind=true;if(t(/underhand|reverse/))o.chin=true;if(t(/v-bar|close|rope|twin/))o.close=true;return'pulldown';}
  if(t(/pullover/))return'pullover';
  if(t(/scapula-dips/)){o.scap=true;return'dip';}
  if(t(/bench-dip|between-benches|three-bench|dips-floor|bench-leg|exercise-ball-dip|reverse-dip|korean|impossible|lever-seated-dip/)){o.knees=t(/knees-bent|floor/);return'benchdip';}
  if(t(/dip/)){o.chest=m==='pectorals'||t(/chest/);return'dip';}
  if(t(/pike-push|pike-to/))return'pike';
  if(t(/push-up|pushup|body-up|triceps-press$/)&&!t(/sit-up/)){
    if(t(/wall/))o.wall=true;else if(t(/incline|on-box/))o.incline=true;else if(t(/decline/))o.decline=true;
    if(t(/knee|kneeling|modified/))o.knee=true;if(t(/scapula|plus/))o.scap=true;if(t(/clap|plyo|drop|depth/))o.plyo=true;
    if(m==='triceps'||t(/close|narrow|diamond/))o.close=true;if(t(/wide/))o.wide=true;return'pushup';}
  if(t(/renegade/))return'renegade';
  if(t(/plank|shoulder-tap|power-point/)){o.twist=t(/twist/);return'plank';}
  if(t(/rollerout|wheel-roll|body-saw|fallout/))return'plank';
  if(t(/reverse-hyper|bench-hip-extension|reverse-hyperextension/))return'revhyper';
  if(t(/hyperextension|back-extension|lower-back-curl/)){o.handsHead=t(/hands-behind/);return'backext';}
  if(t(/superman|swimmer|prone-leg-raise/))return'superman';
  if(t(/sphinx|upward-facing|cobra/))return'cobra';
  if(t(/glute-ham|inverse-leg-curl|nordic/))return'nordic';
  if(t(/leg-curl|femoral|hamstring-curl|platform-slide/)){if(t(/standing/))return'legcurl_standing';if(t(/seated/))return'legcurl_seated';return'legcurl';}
  if(t(/leg-extension/))return'legext';
  if(t(/calf-press|hack-calf|lever-calf|squat-calf-raise-on-leg-press|calf-press-on/)){o.calf=true;return'legpress';}
  if(t(/leg-press|horizontal-one-leg|45-degrees|sled-lying-squat/))return'legpress';
  if(t(/calf|toe-raise|standing-calves|ankle-circles|balance-board/)){if(t(/donkey/))return'calf_donkey';if(t(/seated|ankle-circles/))return'calf_seated';return'calf';}
  if(m==='abs'&&t(/hanging-leg-hip|hanging-straight|hanging-oblique|hanging-pike|hanging-leg-raise|weighted-hanging|arm-slingers|hanging-knee|assisted-hanging/)){o.knee=t(/knee|bent/);return'hang_legraise';}
  if(t(/captains-chair|vertical-leg-raise|parallel-bars/)){return'chair_legraise';}
  if(t(/incline-leg-hip-raise|lying-leg-hip-raise|bottoms-up|reverse-crunch|tuck-crunch|cocoons|leg-pull-in|pull-in|roller-reverse/))return'revcrunch';
  if(m==='biceps'&&t(/curl/))return curlKey(t,o);
  if(t(/spine-twist|lying-twist/))return'st_twist';
  if(t(/hug-keens|hug-knees/))return'st_glute';
  if(t(/forward-jump|backward-jump|box-jump/))return'jumpsquat';
  if(t(/hip-thrust/)){if(t(/knees/))return'kneel_thrust';return'hipthrust';}
  if(t(/glute-bridge|hip-lift|hip-raise|bridge|pelvic-tilt|lifting-on-hip/)&&!t(/standing/)){o.march=t(/march/);o.feetBench=t(/on-bench|decline-bridge/);return'bridge';}
  if(m==='triceps'&&t(/kickback|bent-over/))return'kickback_tri';
  if(t(/pull-through/))return'pullthrough';
  if(t(/kickback|donkey-kick|bent-over-hip-extension/))return'kickback_glute';
  if(t(/hip-extension/))return'hipext';
  if(t(/flutter/))return'flutter';
  if(t(/kick/)&&t(/push-up/))return'pushup';
  if(t(/side-lying-hip|side-hip-abduction|straight-leg-outer|side-lying-floor/)){o.add=t(/adduction/);return'sidelying';}
  if(t(/abduction|adduction/)){o.add=t(/adduction/);if(t(/seated|lever/))return'abd_seated';return'abd_stand';}
  if(t(/butterfly/))return'butterfly';
  if(t(/monster/))return'monster';
  if(t(/single-leg-deadlift|one-leg-deadlift|single-leg-deadlift/))return'sldl';
  if(t(/good-morning/))return'goodmorning';
  if(t(/romanian|stiff-leg|straight-leg-deadlift|straight-back-stiff|toe-touch/)){o.toetouch=t(/toe-touch/);return'rdl';}
  if(t(/deadlift|rack-pull|tire-flip/)){o.sumo=t(/sumo/);o.rack=t(/rack-pull/);return'deadlift';}
  if(t(/sissy/))return'sissy';
  if(t(/pistol|one-leg-squat|single-leg-squat/))return'pistol';
  if(t(/jump-squat|plyo-squat|drop-jump|semi-squat-jump|squat-jump/))return'jumpsquat';
  if(t(/split-squat|split/)){o.split=true;if(t(/single-leg|bulgarian/))o.single=true;if(t(/side-split/))return'sidelunge';return'lunge';}
  if(t(/cossack|lateral-lunge|side-lunge/))return'sidelunge';
  if(t(/curtsey|curtsy/))return'curtsy';
  if(t(/step-up/))return'stepup';
  if(t(/lunge/)){if(t(/jump/))return'lungejump';return'lunge';}
  if(t(/squat-row|squatting-row/))return'row_standing';
  if(t(/squat|potty|frankenstein|half-knee-bends/)){
    o.front=t(/front|clean-grip|frankenstein/);o.goblet=t(/goblet/)||(t(/^kettlebell/)&&!o.front)||t(/supported-squat/);o.overhead=t(/overhead/);o.zercher=t(/zercher/);
    o.box=t(/bench-squat|chair|box/);o.wide=t(/wide|sumo/);o.close=t(/narrow/);return'squat';}
  if(t(/shrug/)){o.prone=t(/incline|decline/);return'shrug';}
  if(t(/upright-row/))return'uprow';
  if(t(/face-pull|rear-delt-row/))return'facepull';
  if(m==='pectorals'&&t(/fly|flye|crossover|cross-over|breeding|seated-fly/)){
    if(t(/lever-seated|seated-fly/))o.seatMachine=true;else if(t(/standing|crossover|cross-over|low-fly|middle-fly|upper-chest/)){o.standing=true;o.low=t(/low-fly|upper-chest/);}
    return'fly';}
  if(t(/rear-delt-raise|rear-lateral|reverse-fly|rear-fly|revers-fly|deltoid-rear|rear-delt|reverse-fly/)){
    if(t(/lever-seated/))o.seatMachine=true;if(t(/lying|incline|prone/))o.prone=true;return'reardelt';}
  if(t(/y-raise/))return'yraise';
  if(m==='delts'&&t(/rotation/)){o.internal=t(/internal/);return'extrot';}
  if(m==='delts'&&t(/front-raise|forward-raise|front-shoulder|incline-raise|front-lateral/)){o.overhead=t(/over-head|above-head/);return'frontraise';}
  if(m==='delts'&&t(/raise|iron-cross/))return'lateral';
  if(m==='serratus-anterior'&&t(/raise/)){o.close=true;return'bench';}
  if(m==='delts'&&t(/press|military/)||t(/military/)){o.behind=t(/behind/);o.arnold=t(/arnold/);return'ohp';}
  if(t(/bent-press/))return'windmill';
  if(t(/windmill/))return'windmill';
  if(t(/row/)){
    if(t(/inverted|suspended/))return'row_inverted';
    if(t(/bodyweight-standing|towel/))return'row_standing';
    if(t(/high-row|vertical-row/)){o.kneel=t(/kneel/);return'row_high';}
    if(t(/incline-bench-row|incline-row|lying-row|cambered|prone|reverse-grip-incline-bench/))return'row_incline';
    if(t(/seated|low-row|kayak|elevated|floor-seated|straight-back-seated|lever-.*seated|seated-row/)){o.machine=t(/lever/);if(t(/standing-low/))return'row_standing';return'row_seated';}
    if(t(/one-arm|unilateral|single-arm/))return'row_one';
    if(t(/standing/))return'row_standing';
    o.pendlay=t(/pendlay/);return'row';}
  if(m==='biceps'||(t(/curl/)&&!t(/wrist|leg-curl|finger|lower-back|curl-up/)))return curlKey(t,o);
  if(m==='forearms'){
    if(t(/back-wrist/))return'wristcurl_back';
    if(t(/pronation|supination|rotate/))return'forearm_rot';
    if(t(/roller/))return'wristroll';
    if(t(/finger|gripper|squeeze|wrist-circles/)){o.circles=t(/circles/);return'grip';}
    o.rev=t(/reverse|revers|palms-down/);o.neutral=t(/neutral/);return'wristcurl';}
  if(m==='triceps'||t(/tricep|skull|french|tate|jm-bench/)){
    if(t(/pushdown|push-down|rear-drive/))return'pushdown';
    if(t(/lever-triceps-extension/)){o.seated=true;return'pushdown';}
    if(t(/skull|lying|tate|face-press|jm|decline-triceps|incline-triceps|incline-two-arm|supine|across-face|elbow-press|decline-close-grip-to-skull/)){if(t(/floor/))o.floor=true;return'skull';}
    if(t(/kickback|concentration-extension/)){return'kickback_tri';}
    if(t(/extension|french|overhead|behind-neck/)){o.uni=o.uni||t(/one-arm/);return'ohext';}
    if(t(/press/)){o.close=true;return'bench';}
    return'pushdown';}
  if((t(/press|chest-squeeze|svend|isometric/)&&m!=='abs')||m==='pectorals'){
    if(t(/lever|machine|seated-chest|chest-press|cable-seated/)&&!t(/incline-chest|decline-chest/)){if(t(/standing/))o.standing=true;else o.seatMachine=true;}
    if(t(/lever-incline|lever-decline/))o.seatMachine=true;
    if(t(/cable-bench|cable-decline|cable-incline|cable-press|band-bench/))o.seatMachine=false;
    if(t(/one-arm-twisting|band-one-arm/))o.standing=true;
    if(t(/svend|squeeze|isometric|wipers/)){o.standing=true;o.close=true;}
    return'bench';}
  if(t(/twist|russian|judo|landmine-180|spell-caster|standing-lift|twisting/)&&!t(/crunch|sit-up|leg-raise/)){if(t(/seated|russian|ball/))return'russian';return'twist';}
  if(t(/pallof/))return'pallof';
  if(t(/side-bend|side-bent|45-side-bend/))return'sidebend';
  if(t(/dead-bug/))return'deadbug';
  if(t(/bicycle|elbow-to-knee|cross-body-crunch/))return'bicycle';
  if(t(/heel-touch|side-to-side-toe|knee-touch/))return'heeltouch';
  if(t(/v-up|jackknife|jack-knife|v-sit/)){if(t(/v-sit/))return'lsit';return'vup';}
  if(t(/l-sit|kick-out-sit/))return'lsit';
  if(t(/leg-raise|seated-leg|twisted-leg/)){o.seated=t(/seated|sitted/);o.bench=t(/flat-bench/);return'legraise';}
  if(t(/sit-up|situp|otis|janda|curl-up/)){o.decline=t(/decline/);o.overheadArms=t(/overhead/);return'situp';}
  if(t(/crunch/)){
    if(t(/kneeling/))return'crunch_kneel';
    if(t(/standing/))return'crunch_stand';
    if(t(/seated/)&&!t(/wall/))return'crunch_seated';
    o.ball=t(/stability-ball|on-stability/);o.oblique=t(/oblique|side|twist|cross/);o.overheadArms=t(/overhead|arms-straight/);return'crunch';}
  if(t(/posterior-step/)){o.split=false;return'lunge';}
  if(t(/standing-pelvic-tilt|ball-hug/))return'neutral';
  if(t(/standing-archer/))return'row_standing';
  if(t(/scapula/))return'pushup';
  var fb={pectorals:'bench',delts:'ohp',biceps:'curl',triceps:'pushdown',lats:'pulldown','upper-back':'row',traps:'shrug',abs:'crunch',spine:'backext',
    glutes:'bridge',quads:'squat',hamstrings:'legcurl',calves:'calf',adductors:'abd_seated',abductors:'abd_seated',forearms:'wristcurl','serratus-anterior':'pushup',cardio:'run','levator-scapulae':'st_neck'};
  return fb[m]||'neutral';
}
function classify(slug,muscle,eq,cat){
  slug=String(slug||'');muscle=String(muscle||'');eq=String(eq||'bodyweight');
  var o=flags(slug,muscle,eq);
  var k=pick(slug,muscle,eq,cat,o);
  if(muscle==='adductors'&&(k==='abd_seated'||k==='abd_stand'||k==='sidelying'||k==='sideplank'))o.add=o.add||/adduct/.test(slug);
  return{key:k,label:LABEL[k]||k,o:o};
}

function build(slug,muscle,eq,cat){
  var c=classify(slug,muscle,eq,cat),o=c.o,spec=P[c.key](o);
  spec.key=c.key;spec.label=c.label;spec.o=o;
  spec.keys=spec.keys.map(function(k){return X(DEF,k);});
  if(o.alt&&!spec.altA&&!spec.hands)spec.altA=true;
  if(o.uni&&!spec.hands&&!spec.one)spec.hands=['r'];
  if(spec.hands&&spec.hands.length===1&&!spec.altA)spec.uniA=true;
  if(o.single&&!spec.uniL&&['calf','sldl','pistol','lunge','bridge','legpress','calf_seated'].indexOf(c.key)<0&&spec.keys[0].ff==='w'&&!spec.altL)spec.uniL=true;
  /* muscle activation */
  var act={},ms=MS[c.key]||['',''];
  ms[1].split(' ').forEach(function(n){if(n)act[n]=.28;});
  ms[0].split(' ').forEach(function(n){if(n)act[n]=.58;});
  if(muscle==='cardio'){['quads','calves','glutes','hamstrings'].forEach(function(n){act[n]=Math.max(act[n]||0,.6);});}
  else if(muscle)act[muscle]=1;
  spec.act=act;
  spec.dur=spec.dur||3.2;
  spec.cam=X({ty:.95,d:4.5,yo:0},spec.cam);
  return spec;
}

function poseAt(spec,u){
  var K=spec.keys,n=K.length,f,Pz;
  u=((u%1)+1)%1;
  if(spec.seq||n>2){var x=u*n,i=Math.floor(x)%n;f=sm(clamp((x-Math.floor(x)-.12)/.76,0,1));Pz=lerpPose(K[i],K[(i+1)%n],f);}
  else{
    if(spec.ease==='sine')f=(1-Math.cos(u*2*Math.PI))/2;
    else f=u<.08?0:u<.5?sm((u-.08)/.42):u<.58?1:1-sm((u-.58)/.42);
    Pz=lerpPose(K[0],K[1],f);
    if(spec.hop){var h=spec.hop*Math.sin(Math.PI*f);Pz.root=[Pz.root[0],Pz.root[1]+h,Pz.root[2]];if(Pz.ff==='w'){Pz.fl=[Pz.fl[0],Pz.fl[1]+h,Pz.fl[2]];Pz.fr=[Pz.fr[0],Pz.fr[1]+h,Pz.fr[2]];}}
  }
  return Pz;
}
function framePose(spec,u){
  var Pz=poseAt(spec,u);
  if(spec.altA||spec.altL){var P2=poseAt(spec,u+.5);if(spec.altA)Pz.hr=P2.hr;if(spec.altL){Pz.fr=P2.fr;Pz.tr=P2.tr;}}
  if(spec.uniA){Pz.hl=spec.keys[0].hl;}
  if(spec.uniL){Pz.fl=spec.keys[0].fl;Pz.tl=spec.keys[0].tl;}
  return Pz;
}

/* ---------- equipment ---------- */
function loadKind(spec){
  if(spec.load)return spec.load;
  var eq=spec.o.eq;
  if(eq==='barbell')return spec.hands&&spec.hands.length===1?'db':'bar';
  if(eq==='ez-bar')return'ez';
  if(eq==='smith')return'smith';
  if(eq==='dumbbell')return'db';
  if(eq==='kettlebell')return'kb';
  if(eq==='cable')return'cable';
  if(eq==='band')return'band';
  if(eq==='lever'||eq==='machine'||eq==='sled')return'machine';
  return'none';
}
function gear(spec,J){
  var out=[],kind=loadKind(spec),sides=spec.hands||['l','r'],two=sides.length===2;
  function grip(sd){return add(sd.W,mul(sd.hd,.035));}
  var gl=grip(J.side.l),gr=grip(J.side.r),mid=two?mix(gl,gr,.5):grip(J.side[sides[0]]);
  var axis=two&&len(sub(gl,gr))>.12?nrm(sub(gl,gr)):mv(J.Rt,[1,0,0]);
  function bar(half,plateR,plates,sleeve){
    out.push(capP(sub(mid,mul(axis,half)),add(mid,mul(axis,half)),.014,C.steel));
    if(sleeve)[1,-1].forEach(function(s){out.push(capP(add(mid,mul(axis,s*sleeve)),add(mid,mul(axis,s*(half+.02))),.024,C.steel));});
    plates.forEach(function(p){[1,-1].forEach(function(s){out.push(discP(add(mid,mul(axis,s*p)),axis,plateR,C.plate));});});
  }
  function dbAt(c,ax){out.push(capP(sub(c,mul(ax,.075)),add(c,mul(ax,.075)),.014,C.steel));[.095,.125].forEach(function(p){[1,-1].forEach(function(s){out.push(discP(add(c,mul(ax,s*p)),ax,.068,C.plate));});});}
  function kbAt(c,ax){out.push(sphP(add(c,[0,-.13,0]),.1,C.kb),capP(sub(c,mul(ax,.05)),add(c,mul(ax,.05)),.016,C.kb));}
  function handAx(sd){return spec.grip==='neutral'?nrm(cross(sd.f,sd.ax)):sd.ax;}
  var seen={};
  function column(A){var key=A.map(function(v){return v.toFixed(2);}).join();if(seen[key])return;seen[key]=1;
    out.push(sphP(A,.045,C.frame));
    if(A[1]>.2||Math.abs(A[2])>.2){var h=Math.sqrt(A[0]*A[0]+A[2]*A[2])||1,cx=A[0]+A[0]/h*.28,cz=A[2]+A[2]/h*.28,top=Math.max(A[1]+.12,2.25);
      out.push(capP([cx,0,cz],[cx,top,cz],.04,C.frame,true),capP([cx,A[1],cz],A,.02,C.frame));}}
  function anchorFor(sd){if(spec.anc1)return spec.anc1;var a=spec.anc||[0,.12,.8];return[sd.s*a[0],a[1],a[2]];}
  if(kind==='bar'&&two)bar(1.0,.225,[.69,.74,.79],.62);
  else if(kind==='ez'&&two)bar(.62,.16,[.45,.5],.38);
  else if(kind==='smith'&&two){bar(1.0,.2,[.7,.75],.62);[1,-1].forEach(function(s){var p=add(mid,mul(axis,s*.86));out.push(capP([p[0],0,p[2]],[p[0],2.25,p[2]],.03,C.frame,true));});}
  else if(kind==='ball')out.push(sphP(mid,.12,C.ball));
  else if((kind==='db'||kind==='bar'||kind==='ez'||kind==='smith')){
    if(spec.one&&two)dbAt(add(mid,[0,-.02,0]),[0,1,0]);else sides.forEach(function(k){dbAt(grip(J.side[k]),handAx(J.side[k]));});}
  else if(kind==='kb'){if(spec.one&&two)kbAt(mid,axis);else sides.forEach(function(k){kbAt(grip(J.side[k]),handAx(J.side[k]));});}
  else if(kind==='cable'||kind==='band'||kind==='rope'){
    var col=kind==='band'?C.band:kind==='rope'?C.rope:C.cable,w=kind==='rope'?5:kind==='band'?2.4:1.4;
    if(spec.footCable){var sd=J.side.r,A=spec.anc||[0,.1,.8];out.push(lineP(sd.A,A,w,col));if(kind==='cable')column(A);}
    else if(spec.cableBar&&two&&len(sub(gl,gr))<.7){
      var A2=spec.anc1||spec.anc||[0,.12,.8];
      if(kind==='band'&&!spec.anc1&&A2[1]<.5)A2=mix(J.side.l.A,J.side.r.A,.5);
      out.push(capP(sub(mid,mul(axis,.24)),add(mid,mul(axis,.24)),.014,C.steel),lineP(mid,A2,w,col));if(kind==='cable')column(A2);
    }else sides.forEach(function(k){var sd=J.side[k],g=grip(sd),A=anchorFor(sd);
      if(kind==='band'&&!spec.anc1&&A[1]<.5)A=sd.A;
      out.push(lineP(g,A,w,col),capP(sub(g,mul(sd.ax,.05)),add(g,mul(sd.ax,.05)),.014,C.frame));if(kind==='cable')column(A);});
  }else if(kind==='machine'&&!spec.footCable&&!(spec.props&&spec.props.length)&&!spec.dyn){
    var hy=Math.max(.3,mid[1]);
    sides.forEach(function(k){var sd=J.side[k],g=grip(sd);out.push(capP(sub(g,mul(sd.ax,.08)),add(g,mul(sd.ax,.08)),.02,C.frame),lineP(g,[sd.s*.32,hy,-.62],3,C.frame));});
    out.push(box([0,1.05,-.68],[.75,2.1,.1],0,C.frame));
  }
  return out;
}

/* ---------- rendering ---------- */
var SKIN=[108,113,136],SKIN_M=[60,63,84],MUS=[149,154,178],MUS_ON=[179,169,243],MUS_M=[78,81,104],MUS_M0=[92,82,158],MUS_M1=[196,187,255];
function musCol(a,lay){
  if(lay==='muscles')return a>0?mix(MUS_M0,MUS_M1,a):MUS_M;
  return mix(MUS,MUS_ON,a);
}
function bodyPrims(J,act,lay){
  var out=[],sk=lay==='muscles'?SKIN_M:SKIN;
  function cap(a,b,r,col,m){out.push({t:'cap',a:a,b:b,r:r,col:col,m:m});}
  function sph(c,r,col,m){out.push({t:'sph',c:c,r:r,col:col,m:m});}
  function mc(id){return musCol(act[id]||0,lay);}
  var Rb=J.Rb,Rl=J.Rl,Rt=J.Rt,R0=J.R0,L=J.L,N=J.N;
  function tp(v){return add(L,mv(Rt,v));}function lp(v){return add(R0,mv(Rl,v));}function bp(v){return add(R0,mv(Rb,v));}
  cap(bp([.07,-.04,0]),bp([-.07,-.04,0]),.115,sk);
  cap(lp([0,.02,0]),L,.122,sk);
  cap(tp([0,.06,-.01]),tp([0,.2,-.01]),.158,sk);
  cap(tp([.15,.25,-.01]),tp([-.15,.25,-.01]),.08,sk);
  cap(N,add(N,mv(J.Rh,[0,.07,.01])),.05,sk);
  sph(J.Hd,.105,sk);
  cap(lp([0,.06,.085]),tp([0,.05,.11]),.06,mc('abs'),'abs');
  [1,-1].forEach(function(s){
    cap(tp([s*.035,.17,.105]),tp([s*.12,.2,.095]),.066,mc('pectorals'),'pectorals');
    cap(tp([s*.11,.05,-.05]),tp([s*.14,.19,-.06]),.064,mc('lats'),'lats');
    cap(tp([s*.05,.17,-.11]),tp([s*.11,.22,-.1]),.058,mc('upper-back'),'upper-back');
    cap(add(N,mv(Rt,[s*.02,-.03,-.03])),tp([s*.15,.27,-.03]),.046,mc('traps'),'traps');
    cap(lp([s*.04,.02,-.085]),tp([s*.04,.1,-.11]),.044,mc('spine'),'spine');
    cap(add(N,mv(Rt,[s*.035,-.01,-.005])),add(N,mv(J.Rh,[s*.03,.07,-.01])),.026,mc('levator-scapulae'),'levator-scapulae');
    sph(tp([s*.135,.09,.06]),.04,mc('serratus-anterior'),'serratus-anterior');
    sph(bp([s*.075,-.07,-.075]),.095,mc('glutes'),'glutes');
    var sd=J.side[s>0?'l':'r'];
    sph(sd.S,.078,mc('delts'),'delts');
    cap(sd.S,sd.E,.05,sk);
    var ua=nrm(sub(sd.E,sd.S)),pp=perpTo(sd.ep,ua);
    cap(add(mix(sd.S,sd.E,.22),mul(pp,-.026)),add(mix(sd.S,sd.E,.8),mul(pp,-.022)),.04,mc('biceps'),'biceps');
    cap(add(mix(sd.S,sd.E,.15),mul(pp,.026)),add(mix(sd.S,sd.E,.85),mul(pp,.02)),.041,mc('triceps'),'triceps');
    cap(sd.E,mix(sd.E,sd.W,.92),.043,mc('forearms'),'forearms');
    sph(sd.W,.04,sk);cap(sd.W,sd.tip,.03,sk);
    cap(sd.hip,sd.K,.08,sk);
    var th=nrm(sub(sd.K,sd.hip)),kq=perpTo(sd.kp,th),lat=perpTo(mv(Rb,[s,0,0]),th);
    cap(add(mix(sd.hip,sd.K,.2),mul(kq,.035)),add(mix(sd.hip,sd.K,.85),mul(kq,.03)),.06,mc('quads'),'quads');
    cap(add(mix(sd.hip,sd.K,.2),mul(kq,-.035)),add(mix(sd.hip,sd.K,.85),mul(kq,-.03)),.057,mc('hamstrings'),'hamstrings');
    cap(add(mix(sd.hip,sd.K,.12),mul(lat,-.04)),add(mix(sd.hip,sd.K,.6),mul(lat,-.035)),.045,mc('adductors'),'adductors');
    cap(add(mix(sd.hip,sd.K,.04),mul(lat,.045)),add(mix(sd.hip,sd.K,.4),mul(lat,.04)),.045,mc('abductors'),'abductors');
    cap(sd.K,sd.A,.056,sk);
    var shn=nrm(sub(sd.A,sd.K)),kq2=perpTo(sd.kp,shn);
    cap(add(mix(sd.K,sd.A,.12),mul(kq2,-.035)),add(mix(sd.K,sd.A,.55),mul(kq2,-.025)),.05,mc('calves'),'calves');
    sph(sd.A,.045,sk);cap(sd.A,sd.toe,.04,sk);
  });
  return out;
}

function rgb(c,a){return'rgba('+(c[0]|0)+','+(c[1]|0)+','+(c[2]|0)+','+(a==null?1:a)+')';}
var WHITE=[255,255,255],DARK=[10,11,18];
function shade(c,k){return mix(DARK,c,k);}

function Camera(w,h,yaw,pitch,ty,d,tz){
  var T=[0,ty,tz||0],cp=Math.cos(pitch);
  var Cp=add(T,[d*Math.sin(yaw)*cp,d*Math.sin(pitch),d*Math.cos(yaw)*cp]);
  var f=nrm(sub(T,Cp)),r=nrm(cross(f,[0,1,0])),u=cross(r,f);
  var Fo=Math.min(h,w*1.25)*.5/Math.tan(15*D);
  this.pos=Cp;this.d=d;
  this.p=function(p){var q=sub(p,Cp),z=Math.max(.15,dot(q,f));return[w/2+dot(q,r)*Fo/z,h/2-dot(q,u)*Fo/z,z,Fo/z];};
}

function drawScene(ctx,w,h,cam,prims,J,dpr){
  ctx.clearRect(0,0,w,h);
  /* floor */
  function ring(rad,cx,cz){var pts=[];for(var i=0;i<=48;i++){var a=i/48*Math.PI*2;pts.push(cam.p([cx+Math.cos(a)*rad,0,cz+Math.sin(a)*rad]));}return pts;}
  function path(pts){ctx.beginPath();pts.forEach(function(p,i){i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});}
  path(ring(1.7,0,0));ctx.fillStyle='rgba(17,18,32,.92)';ctx.fill();
  ctx.lineWidth=1*dpr;
  [.55,1.1].forEach(function(rr){path(ring(rr,0,0));ctx.strokeStyle='rgba(44,46,68,.9)';ctx.stroke();});
  for(var i=0;i<12;i++){var a=i/12*Math.PI*2,p1=cam.p([Math.cos(a)*.25,0,Math.sin(a)*.25]),p2=cam.p([Math.cos(a)*1.7,0,Math.sin(a)*1.7]);ctx.beginPath();ctx.moveTo(p1[0],p1[1]);ctx.lineTo(p2[0],p2[1]);ctx.strokeStyle='rgba(34,36,58,.9)';ctx.stroke();}
  path(ring(1.7,0,0));ctx.strokeStyle='rgba(145,132,217,.55)';ctx.lineWidth=1.5*dpr;ctx.stroke();
  /* shadow */
  var c0=J.R0;path(ring(.42,c0[0],c0[2]));ctx.fillStyle='rgba(0,0,0,.32)';ctx.fill();
  /* depth sort */
  var under=[],rest=[];
  prims.forEach(function(pr){
    var c=pr.t==='cap'||pr.t==='line'?mix(pr.a,pr.b,.5):pr.c;
    pr.z=cam.p(c)[2];(pr.under?under:rest).push(pr);
  });
  under.sort(function(a,b){return b.z-a.z;});rest.sort(function(a,b){return b.z-a.z;});
  var zn=cam.d-1.2;
  function fog(col,z){return mix(col,DARK,clamp((z-zn)/2.6,0,1)*.38);}
  function draw(pr){
    var col=fog(pr.col,pr.z);
    if(pr.t==='cap'){
      var A=cam.p(pr.a),B=cam.p(pr.b),r=pr.r*(A[3]+B[3])/2;
      if(Math.abs(A[0]-B[0])+Math.abs(A[1]-B[1])<.01)B=[A[0]+.01,A[1],A[2],A[3]];
      ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);
      ctx.strokeStyle=rgb(shade(col,.72));ctx.lineWidth=r*2;ctx.stroke();
      ctx.strokeStyle=rgb(col);ctx.lineWidth=r*1.66;ctx.stroke();
      if(r>1.6){ctx.beginPath();ctx.moveTo(A[0]-r*.26,A[1]-r*.34);ctx.lineTo(B[0]-r*.26,B[1]-r*.34);ctx.strokeStyle=rgb(mix(col,WHITE,.26),.55);ctx.lineWidth=r*.62;ctx.stroke();}
    }else if(pr.t==='sph'){
      var S=cam.p(pr.c),rs=pr.r*S[3];
      var g=ctx.createRadialGradient(S[0]-rs*.35,S[1]-rs*.4,rs*.1,S[0],S[1],rs);
      g.addColorStop(0,rgb(mix(col,WHITE,.3)));g.addColorStop(.55,rgb(col));g.addColorStop(1,rgb(shade(col,.68)));
      ctx.beginPath();ctx.arc(S[0],S[1],Math.max(.5,rs),0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
    }else if(pr.t==='disc'){
      var n=nrm(pr.n),u=perpTo([0,1,0],n),v=cross(n,u),pts=[];
      for(var k=0;k<20;k++){var an=k/20*Math.PI*2;pts.push(cam.p(add(pr.c,add(mul(u,Math.cos(an)*pr.r),mul(v,Math.sin(an)*pr.r)))));}
      path(pts);ctx.closePath();ctx.fillStyle=rgb(col);ctx.fill();
      ctx.strokeStyle=rgb(C.rim,.8);ctx.lineWidth=Math.max(1,.012*pts[0][3]);ctx.stroke();
    }else if(pr.t==='line'){
      var a1=cam.p(pr.a),b1=cam.p(pr.b);ctx.beginPath();ctx.moveTo(a1[0],a1[1]);ctx.lineTo(b1[0],b1[1]);
      ctx.strokeStyle=rgb(col,.85);ctx.lineWidth=pr.w*dpr;ctx.lineCap='round';ctx.stroke();
    }else if(pr.t==='box'){
      var R=rx(pr.rot),hs=mul(pr.s,.5),cs=[];
      for(var q=0;q<8;q++)cs.push(add(pr.c,mv(R,[(q&1?1:-1)*hs[0],(q&2?1:-1)*hs[1],(q&4?1:-1)*hs[2]])));
      var faces=[[0,2,6,4,[-1,0,0]],[1,5,7,3,[1,0,0]],[0,4,5,1,[0,-1,0]],[2,3,7,6,[0,1,0]],[0,1,3,2,[0,0,-1]],[4,6,7,5,[0,0,1]]];
      var Lg=nrm([.4,.8,.5]);
      faces.map(function(fc){var nn=mv(R,fc[4]),cc=mul(add(add(cs[fc[0]],cs[fc[1]]),add(cs[fc[2]],cs[fc[3]])),.25);return{fc:fc,n:nn,c:cc,z:cam.p(cc)[2]};})
        .filter(function(o){return dot(o.n,sub(cam.pos,o.c))>0;}).sort(function(a,b){return b.z-a.z;})
        .forEach(function(o){var pts=[0,1,2,3].map(function(i){return cam.p(cs[o.fc[i]]);});path(pts);ctx.closePath();
          var k=.55+.45*Math.max(0,dot(o.n,Lg));ctx.fillStyle=rgb(shade(col,k));ctx.fill();ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=1;ctx.stroke();});
    }
  }
  under.forEach(draw);rest.forEach(draw);
}

/* ---------- custom element ---------- */
var VIEWS={front:0,'34':.62,side:Math.PI/2,back:Math.PI};
class GymMannequinEl extends HTMLElement{
  static get observedAttributes(){return['slug','muscle','equipment','category','layer','view','paused','speed'];}
  constructor(){
    super();
    var root=this.attachShadow({mode:'open'});
    /* touch-action pan-y: vertical swipes scroll the page (or the app screen around a WebView);
       horizontal drags turn the model. */
    root.innerHTML='<style>:host{display:block;position:relative;min-height:120px}canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab}canvas:active{cursor:grabbing}</style><canvas></canvas>';
    this.cv=root.querySelector('canvas');this.ctx=this.cv.getContext('2d');
    this.t=0;this.last=0;this.dyaw=0;this.dpitch=0;this.zoom=1;this.visible=true;this.spec=null;this.vyaw=0;
    var self=this,drag=null;
    /* Drag turns the model around its vertical axis only (no pitch, so it never tips over), following
       the finger 1:1; on release it keeps spinning a little and slows down (vyaw, see loop). */
    this.cv.addEventListener('pointerdown',function(e){drag={x:e.clientX,t:e.timeStamp,v:0};self.vyaw=0;self.cv.setPointerCapture(e.pointerId);});
    this.cv.addEventListener('pointermove',function(e){
      if(!drag)return;
      var dx=e.clientX-drag.x,dt=Math.max(1,e.timeStamp-drag.t),k=4/Math.max(200,self.clientWidth);
      self.dyaw-=dx*k;drag.v=.7*drag.v+.3*(-dx*k/dt*1000);drag.x=e.clientX;drag.t=e.timeStamp;});
    var end=function(){if(drag)self.vyaw=clamp(drag.v,-6,6);drag=null;};
    this.cv.addEventListener('pointerup',end);
    this.cv.addEventListener('pointercancel',function(){drag=null;self.vyaw=0;});
    this.cv.addEventListener('dblclick',function(){self.dyaw=0;self.dpitch=0;self.zoom=1;self.vyaw=0;self.paint();});
    this.cv.addEventListener('wheel',function(e){if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();self.zoom=clamp(self.zoom*(e.deltaY>0?1.08:.93),.6,1.8);self.paint();},{passive:false});
    this.loop=this.loop.bind(this);
  }
  connectedCallback(){
    var self=this;
    this.rebuild();
    if('ResizeObserver' in window){this.ro=new ResizeObserver(function(){self.paint();});this.ro.observe(this);}
    if('IntersectionObserver' in window){this.io=new IntersectionObserver(function(es){self.visible=es[0].isIntersecting;});this.io.observe(this);}
    this.raf=requestAnimationFrame(this.loop);
  }
  disconnectedCallback(){cancelAnimationFrame(this.raf);if(this.ro)this.ro.disconnect();if(this.io)this.io.disconnect();}
  attributeChangedCallback(n,o,v){if(o===v)return;if(['slug','muscle','equipment','category'].indexOf(n)>=0){this.rebuild();this.t=0;}this.paint();}
  rebuild(){
    try{this.spec=build(this.getAttribute('slug')||'',this.getAttribute('muscle')||'',this.getAttribute('equipment')||'bodyweight',this.getAttribute('category')||'');}
    catch(err){this.spec=build('neutral','', 'bodyweight','');}
    this.dispatchEvent(new CustomEvent('patternchange',{detail:{key:this.spec.key,label:this.spec.label}}));
  }
  loop(ts){
    this.raf=requestAnimationFrame(this.loop);
    var dt=this.last?Math.min(.1,(ts-this.last)/1000):0;this.last=ts;
    if(!this.visible)return;
    if(this.vyaw){this.dyaw+=this.vyaw*dt;this.vyaw*=Math.pow(.04,dt);if(Math.abs(this.vyaw)<.02)this.vyaw=0;}
    if(this.getAttribute('paused')!=='true'){var sp=parseFloat(this.getAttribute('speed')||'1')||1;this.t+=dt*sp/this.spec.dur;}
    this.paint();
  }
  paint(){
    if(!this.spec)return;
    var dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,this.clientWidth*dpr|0),h=Math.max(1,this.clientHeight*dpr|0);
    if(this.cv.width!==w||this.cv.height!==h){this.cv.width=w;this.cv.height=h;}
    var spec=this.spec,Pz=framePose(spec,this.t),J=solve(Pz);
    var view=this.getAttribute('view')||'34',yaw=(VIEWS[view]!=null?VIEWS[view]:.62)+(spec.cam.yo||0)*(view==='34'?1:0)+this.dyaw;
    var cam=new Camera(w,h,yaw,.13+this.dpitch,spec.cam.ty,spec.cam.d/this.zoom,0);
    var prims=bodyPrims(J,spec.act,this.getAttribute('layer')||'normal').concat(gear(spec,J),spec.props||[],spec.dyn?spec.dyn(J):[]);
    drawScene(this.ctx,w,h,cam,prims,J,dpr);
  }
}
if(!customElements.get('gym-mannequin'))customElements.define('gym-mannequin',GymMannequinEl);
window.GymMannequin={classify:function(s,m,e,c){var r=classify(s,m,e,c);return{key:r.key,label:r.label};},patterns:LABEL};
})();
