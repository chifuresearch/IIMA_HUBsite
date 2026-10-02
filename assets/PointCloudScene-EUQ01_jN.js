import{r as q,g as X,s as Re,j as G,H as ke,h as ue,N as Ue}from"./index-Ca_G0wct.js";import{E as ye,S as Be,C as We,A as $e,V as F,H as Oe,D as je,a as Ge,b as Ye,T as He,M as Ke,c as Ze,d as qe,e as xe,f as Xe,g as Je}from"./babylon-EhJCSAGv.js";const Qe=`
    precision highp float;
    attribute vec3 position;
    attribute vec3 pcolor;
    uniform mat4 worldViewProjection;
    uniform float perspectiveFactor;
    uniform vec2 mousePos;
    uniform float time;
    uniform float uPointSize;
    uniform float uUseVColor;
    uniform float uGridSnap;
    uniform vec3 uColDark;
    uniform vec3 uColBright;
    uniform vec3 uColCore;
    uniform float uNoiseMode;   // 0 off / 1 glitch / 2 ripple / 3 repel / 4 swirl
    uniform float uNoiseRadius;
    uniform float uNoiseStrength;
    uniform float uFadeNear;
    uniform float uFadeFar;
    uniform float uGlobalAlpha;
    varying float vAlpha;
    varying vec3 vColor;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main(void) {
        // --- 1. Matrix 網格化（可關閉）---
        float gridSize = 0.05;
        vec3 snapped = floor(position / gridSize) * gridSize;
        vec3 srcPos = mix(position, snapped, uGridSnap);

        // --- 2. 垂直流動數據線 (Data Rain) ---
        float columnId = random(snapped.xz);
        float speed = 0.15 + columnId * 0.5;
        float flow = mod(snapped.y * 0.2 - time * speed, 0.3);
        float brightness = pow(1.0 - flow, 8.0);

        // --- 3. Pointer 周邊擾動 ---
        vec4 clipPos = worldViewProjection * vec4(srcPos, 1.0);
        // 透視投影下 clipPos.w == view-space 深度（比另傳 view 矩陣可靠）
        float distToCamera = clipPos.w;
        vec2 ndc = (clipPos.xy / clipPos.w) * 0.5 + 0.5;
        vec2 toMouse = ndc - mousePos;
        float d = length(toMouse);
        float falloff = 1.0 - smoothstep(0.0, max(uNoiseRadius, 1e-4), d);
        float interaction = falloff * uNoiseStrength;

        vec2 disp = vec2(0.0);
        vec2 dir = toMouse / max(d, 1e-5);
        if (uNoiseMode > 0.5 && uNoiseMode < 1.5) {
            // glitch：水平數據抖動
            float g = step(0.96, random(vec2(floor(time * 10.0), snapped.y * 13.7)));
            disp.x = g * (random(snapped.xy + time) - 0.5) * 0.15 * interaction;
        } else if (uNoiseMode > 1.5 && uNoiseMode < 2.5) {
            // ripple：由游標向外的漣漪
            float wave = sin(d * 60.0 - time * 8.0);
            disp = dir * wave * 0.02 * interaction;
        } else if (uNoiseMode > 2.5 && uNoiseMode < 3.5) {
            // repel：把點推離游標
            disp = dir * falloff * falloff * 0.09 * uNoiseStrength;
        } else if (uNoiseMode > 3.5 && uNoiseMode < 4.5) {
            // swirl：繞游標旋轉
            vec2 tang = vec2(-dir.y, dir.x);
            disp = tang * falloff * 0.07 * uNoiseStrength;
        }
        clipPos.xy += disp * clipPos.w;
        gl_Position = clipPos;

        // --- 4. 點的大小與顏色 ---
        float baseSize = perspectiveFactor / max(gl_Position.w, 1e-4);
        gl_PointSize = baseSize * (0.5 + brightness * 2.0 + interaction * 3.0) * uPointSize;
        gl_PointSize = clamp(gl_PointSize, 0.3, max(1.0, 3.0 * uPointSize));

        vec3 baseCol = mix(uColDark, uColBright, brightness);
        baseCol = mix(baseCol, uColCore, pow(brightness, 2.0) + interaction);

        // 有貼圖 / 頂點色：以掃描亮度調變原始色彩，互動時提亮
        vec3 scanned = pcolor * (0.25 + brightness * 0.75);
        vec3 vcCol = mix(scanned, vec3(1.0), interaction * 0.8);
        vColor = mix(baseCol, vcCol, uUseVColor);

        float distFade = 1.0 - smoothstep(uFadeNear, uFadeFar, distToCamera);
        vAlpha = mix(0.1 + brightness * 0.9, 0.25 + brightness * 0.55, uUseVColor) * distFade * uGlobalAlpha;
    }
`,et=`
    precision highp float;
    varying float vAlpha;
    varying vec3 vColor;
    void main(void) {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float maxDist = max(abs(uv.x), abs(uv.y));
        if (maxDist > 0.5) discard;
        float scanline = step(0.2, mod(gl_PointCoord.y * 10.0, 1.0));
        float edge = smoothstep(0.5, 0.48, maxDist);
        gl_FragColor = vec4(vColor * (scanline * 0.5 + 0.5), vAlpha * edge);
    }
`;async function tt(p){const d=await fetch(p);if(!d.ok)throw new Error(`PLY fetch failed: ${d.status}`);const b=await d.arrayBuffer(),g=new Uint8Array(b),f=Math.min(g.length,65536);let m="",h=0;for(let v=0;v<f;v++)if(m+=String.fromCharCode(g[v]),m.endsWith(`end_header
`)||m.endsWith(`end_header\r
`)){h=v+1;break}if(!h)throw new Error("PLY: end_header not found");const D=m.split(/\r?\n/);let E="",P=0,I=!1;const l=[],a={char:1,uchar:1,int8:1,uint8:1,short:2,ushort:2,int16:2,uint16:2,int:4,uint:4,int32:4,uint32:4,float:4,float32:4,double:8,float64:8};for(const v of D){const y=v.trim().split(/\s+/);if(y[0]==="format")E=y[1];else if(y[0]==="element")I=y[1]==="vertex",I&&(P=parseInt(y[2]));else if(y[0]==="property"&&I){if(y[1]==="list"){I=!1;continue}l.push({type:y[1],name:y[2]})}}if(!P)throw new Error("PLY: no vertex element");const u=new Float32Array(P*3),z=l.some(v=>["red","r","diffuse_red"].includes(v.name))?new Float32Array(P*3):null,W=v=>l.findIndex(y=>v.includes(y.name)),S=W(["x"]),$=W(["y"]),j=W(["z"]),Y=W(["red","r","diffuse_red"]),H=W(["green","g","diffuse_green"]),K=W(["blue","b","diffuse_blue"]);if(E==="ascii"){const y=new TextDecoder().decode(g.subarray(h)).split(/\r?\n/);let A=0;for(let O=0;O<y.length&&A<P;O++){const T=y[O].trim().split(/\s+/);if(!(T.length<l.length||T[0]==="")){if(u[A*3]=parseFloat(T[S]),u[A*3+1]=parseFloat(T[$]),u[A*3+2]=parseFloat(T[j]),z){const R=a[l[Y].type]>=4?1:1/255;z[A*3]=parseFloat(T[Y])*R,z[A*3+1]=parseFloat(T[H])*R,z[A*3+2]=parseFloat(T[K])*R}A++}}}else if(E==="binary_little_endian"||E==="binary_big_endian"){const v=E==="binary_little_endian",y=new DataView(b,h),A=[];let O=0;for(const N of l)A.push(O),O+=a[N.type]||4;const T=(N,R)=>{const Q=l[R],U=N+A[R];switch(Q.type){case"char":case"int8":return y.getInt8(U);case"uchar":case"uint8":return y.getUint8(U);case"short":case"int16":return y.getInt16(U,v);case"ushort":case"uint16":return y.getUint16(U,v);case"int":case"int32":return y.getInt32(U,v);case"uint":case"uint32":return y.getUint32(U,v);case"double":case"float64":return y.getFloat64(U,v);default:return y.getFloat32(U,v)}};for(let N=0;N<P;N++){const R=N*O;if(u[N*3]=T(R,S),u[N*3+1]=T(R,$),u[N*3+2]=T(R,j),z){const U=(a[l[Y].type]||4)>=4?1:1/255;z[N*3]=T(R,Y)*U,z[N*3+1]=T(R,H)*U,z[N*3+2]=T(R,K)*U}}}else throw new Error(`PLY: unsupported format ${E}`);return{positions:u,colors:z}}async function ot(p){const d=await fetch(p);if(!d.ok)throw new Error(`XYZ fetch failed: ${d.status}`);const g=(await d.text()).split(/\r?\n/),f=[],m=[];let h=!1,D=0;for(const I of g){const l=I.trim();if(!l||l.startsWith("#")||l.startsWith("//"))continue;const a=l.split(/[\s,;]+/).map(Number);a.length<3||a.some((u,k)=>k<3&&isNaN(u))||(f.push(a[0],a[1],a[2]),a.length>=6&&!isNaN(a[3])?(h=!0,m.push(a[3],a[4],a[5]),D=Math.max(D,a[3],a[4],a[5])):m.push(1,1,1))}const E=new Float32Array(f);let P=null;if(h){const I=D>1.001?.00392156862745098:1;P=new Float32Array(m.map(l=>l*I))}return{positions:E,colors:P}}function st(p,d){const b=p.positions,g=b.length/3;if(!g)return p;const f=[1/0,1/0,1/0],m=[-1/0,-1/0,-1/0];for(let a=0;a<g;a++)for(let u=0;u<3;u++){const k=b[a*3+u];k<f[u]&&(f[u]=k),k>m[u]&&(m[u]=k)}const h=[m[0]-f[0],m[1]-f[1],m[2]-f[2]],D=[(m[0]+f[0])/2,(m[1]+f[1])/2,(m[2]+f[2])/2],E=Math.max(...h)||1,P=d/E,I=h[2]<h[0]*.8&&h[2]<h[1]*.8,l=new Float32Array(b.length);for(let a=0;a<g;a++){const u=(b[a*3]-D[0])*P,k=(b[a*3+1]-D[1])*P,z=(b[a*3+2]-D[2])*P;I?(l[a*3]=u,l[a*3+1]=z,l[a*3+2]=k):(l[a*3]=u,l[a*3+1]=k,l[a*3+2]=z)}return{positions:l,colors:p.colors}}function nt(p,d){const b=p.positions.length/3;if(b<=d)return p;const g=new Float32Array(d*3),f=p.colors?new Float32Array(d*3):null;for(let m=0;m<d;m++){const h=Math.floor(m*b/d);g.set(p.positions.subarray(h*3,h*3+3),m*3),f&&p.colors&&f.set(p.colors.subarray(h*3,h*3+3),m*3)}return{positions:g,colors:f}}function rt(){const p=[],d=(g,f)=>g+Math.random()*(f-g);for(let g=0;g<3e4;g++)p.push(d(-18,18),d(-.05,.05),d(-18,18));const b=40;for(let g=0;g<b;g++){const f=Math.floor(d(-8,8))*2.2,m=Math.floor(d(-8,8))*2.2,h=d(.5,1.6),D=d(1.5,9);for(let E=0;E<1500;E++){const P=Math.floor(d(0,4)),I=d(0,D);let l=f,a=m;P===0?(l=f-h/2,a=m+d(-h/2,h/2)):P===1?(l=f+h/2,a=m+d(-h/2,h/2)):P===2?(a=m-h/2,l=f+d(-h/2,h/2)):(a=m+h/2,l=f+d(-h/2,h/2)),p.push(l,I,a)}}return{positions:new Float32Array(p),colors:null}}function be(p,d){const b=p.length;if(b===0)return F.Zero();if(b===1)return p[0].clone();const g=Math.max(0,Math.min(b-1-1e-6,d)),f=Math.floor(g),m=g-f,h=p[Math.max(0,f-1)],D=p[f],E=p[Math.min(b-1,f+1)],P=p[Math.min(b-1,f+2)];return F.CatmullRom(h,D,E,P,m)}function lt({config:p}){const d=q.useRef(null),[b,g]=q.useState(0),[f,m]=q.useState(!0),[h,D]=q.useState(!1),E=q.useRef(!1);return q.useEffect(()=>{if(window.parent!==window)try{window.parent.postMessage({type:"iima-bg-progress",p:b},"*"),f||window.parent.postMessage({type:"iima-bg-ready"},"*")}catch{}},[b,f]),q.useEffect(()=>{if(!d.current||!p)return;let P=!1;const I=new ye(d.current,!0,{preserveDrawingBuffer:!0,stencil:!0}),l=new Be(I);l.clearColor=new We(0,0,0,1);const a=p.normalizeSize??22,u=new $e("mainCamera",Math.PI/2,Math.PI/2.5,25,F.Zero(),l);u.minZ=.05,u.maxZ=800,l.activeCamera=u,new Oe("hemi",new F(0,1,0),l).intensity=.9;const k=new je("default",!0,l,[u]);k.bloomEnabled=!0,k.bloomThreshold=.2,k.bloomWeight=.5,k.bloomKernel=64;const z=new Ge(.5,.5),W=new F(0,0,0);let S=[],$=0,j=0,Y=1;const H=[];let K=null,v=[];const y=[];let A=0;const O=window.parent!==window,T=()=>{Y=Math.max(1,document.documentElement.scrollHeight-window.innerHeight)},N=()=>{O||(T(),j=Math.min(1,Math.max(0,window.scrollY/Y)))};window.addEventListener("scroll",N,{passive:!0});const R=t=>{const o=t.data||{};o.type==="iima-scroll"&&typeof o.p=="number"?j=Math.min(1,Math.max(0,o.p)):o.type==="iima-mouse"&&typeof o.x=="number"&&(z.x=o.x,z.y=1-o.y,W.x=(o.x-.5)*1.5,W.y=-(o.y-.5)*.4)};window.addEventListener("message",R);const Q=new ResizeObserver(()=>N());Q.observe(document.body),N();const U=t=>{z.x=t.detail.x,z.y=1-t.detail.y,W.x=(t.detail.x-.5)*1.5,W.y=-(t.detail.y-.5)*.4};window.addEventListener("updateMouse",U);const te=(t,o)=>{const e=o?[o]:H,r=ue(t.colorDark),i=ue(t.colorBright),s=ue(t.colorCore);e.forEach(c=>{c.setFloat("uPointSize",t.pointSize),c.setFloat("uGridSnap",t.gridSnap?1:0),c.setFloat("uUseVColor",c.metadata?.hasVColor&&t.useTextureColor?1:0),c.setVector3("uColDark",new F(r[0],r[1],r[2])),c.setVector3("uColBright",new F(i[0],i[1],i[2])),c.setVector3("uColCore",new F(s[0],s[1],s[2])),c.setFloat("uNoiseMode",Ue.indexOf(t.noiseMode)),c.setFloat("uNoiseRadius",t.noiseRadius),c.setFloat("uNoiseStrength",t.noiseStrength)})},ve=(t,o)=>{const e=new Xe("pcShader_"+t,l,{vertexSource:Qe,fragmentSource:et},{attributes:["position","pcolor"],uniforms:["worldViewProjection","perspectiveFactor","mousePos","time","uPointSize","uUseVColor","uGridSnap","uColDark","uColBright","uColCore","uNoiseMode","uNoiseRadius","uNoiseStrength","uFadeNear","uFadeFar","uGlobalAlpha"]});return e.setFloat("perspectiveFactor",2200),e.setFloat("uFadeNear",15),e.setFloat("uFadeFar",40),e.setFloat("uGlobalAlpha",1),e.fillMode=Je.PointFillMode,e.alphaMode=ye.ALPHA_ADD,e.needAlphaBlending=()=>!0,e.metadata={hasVColor:o},H.push(e),te(X(),e),e},oe=(t,o)=>{const e=o.positions.length/3;if(!e)return null;const r=new Ke("pc_"+t,l),i=new Ze;i.positions=o.positions,i.indices=Array.from({length:e},(c,M)=>M),i.applyToMesh(r);const s=o.colors??new Float32Array(e*3).fill(1);return r.setVerticesData("pcolor",s,!1,3),r.material=ve(t,!!o.colors),r.alwaysSelectAsActiveMesh=!0,y.push(r),r},de=t=>{const o=v.length>0,e=o&&(t==="mesh"||t==="wireframe"||t==="hybrid"),r=!o||t==="points"||t==="hybrid";v.forEach(i=>{i.setEnabled(e),i.isVisible=e,i.material&&(i.material.wireframe=t==="wireframe")}),y.forEach(i=>i.setEnabled(r))},Me=async t=>{const o=t.material,e=o?.albedoTexture??o?.diffuseTexture??null;if(!e)return null;try{await new Promise(L=>qe.WhenAllReady([e],()=>L()));const r=e.getSize();let i=0,s=r.width,c=r.height;for(;Math.max(s,c)>256&&i<8;)i++,s>>=1,c>>=1;let M=await e.readPixels(0,i);if(M&&M.byteLength===s*c*4)return{data:new Uint8Array(M.buffer,M.byteOffset,M.byteLength).slice(),w:s,h:c};if(M=await e.readPixels(0,0),!M||M.byteLength!==r.width*r.height*4)return null;const _=new Uint8Array(M.buffer,M.byteOffset,M.byteLength),C=Math.max(1,Math.floor(r.width/256));s=Math.floor(r.width/C),c=Math.floor(r.height/C);const V=new Uint8Array(s*c*4);for(let L=0;L<c;L++)for(let x=0;x<s;x++){const n=(L*C*r.width+x*C)*4,w=(L*s+x)*4;V[w]=_[n],V[w+1]=_[n+1],V[w+2]=_[n+2],V[w+3]=255}return{data:V,w:s,h:c}}catch(r){return console.warn("texture readPixels 失敗:",t.name,r),null}},Pe=(t,o,e)=>{t.computeWorldMatrix(!0);const r=t.getVerticesData(xe.PositionKind),i=t.getVerticesData(xe.UVKind),s=t.getIndices();if(!r||!s)return null;const c=new Float32Array(s.length/3);let M=0;for(let x=0;x<s.length;x+=3){const n=F.FromArray(r,s[x]*3),w=F.FromArray(r,s[x+1]*3),B=F.FromArray(r,s[x+2]*3),J=F.Cross(w.subtract(n),B.subtract(n)).length()/2;M+=J,c[x/3]=M}if(!M)return null;const _=new Float32Array(o*3),C=e&&i?new Float32Array(o*3):null,V=t.getWorldMatrix(),L=x=>{let n=0,w=c.length-1;for(;n<w;){const B=n+w>>1;c[B]<x?n=B+1:w=B}return n*3};for(let x=0;x<o;x++){const n=L(Math.random()*M),w=F.FromArray(r,s[n]*3),B=F.FromArray(r,s[n+1]*3),J=F.FromArray(r,s[n+2]*3);let Z=Math.random(),ee=Math.random();Z+ee>1&&(Z=1-Z,ee=1-ee);const ae=1-Z-ee,ie=Z,le=ee,_e=w.scale(ae).add(B.scale(ie)).add(J.scale(le)),ce=F.TransformCoordinates(_e,V);if(_[x*3]=ce.x,_[x*3+1]=ce.y,_[x*3+2]=ce.z,C&&i&&e){const ge=i[s[n]*2]*ae+i[s[n+1]*2]*ie+i[s[n+2]*2]*le,we=i[s[n]*2+1]*ae+i[s[n+1]*2+1]*ie+i[s[n+2]*2+1]*le,Le=ge-Math.floor(ge),Te=we-Math.floor(we),Ve=Math.min(e.w-1,Math.floor(Le*e.w)),De=Math.min(e.h-1,Math.floor(Te*e.h)),fe=((e.h-1-De)*e.w+Ve)*4;C[x*3]=e.data[fe]/255,C[x*3+1]=e.data[fe+1]/255,C[x*3+2]=e.data[fe+2]/255}}return{positions:_,colors:C}},Fe=()=>{const t=[];return l.cameras.forEach(o=>{if(o===u)return;const e=o.name.match(/^c(\d+)$/i);if(!e)return;o.computeWorldMatrix();const r=o.getWorldMatrix(),i=r.getTranslation().clone(),s=F.TransformNormal(new F(0,0,1),r).normalize();t.push({n:parseInt(e[1]),key:{pos:i,target:i.add(s.scale(a*.5)),fov:o.fov??null}})}),t.sort((o,e)=>o.n-e.n),t.map(o=>o.key)},Ce=t=>{const o=new Map;return t.forEach(e=>{const r=e.name.match(/^c(\d+)_loc$/),i=e.name.match(/^c(\d+)_target$/);if(r||i){const s=parseInt(r?r[1]:i[1]);o.has(s)||o.set(s,{}),o.get(s)[r?"loc":"target"]=e.getAbsolutePosition().clone(),e.isVisible=!1,e.setEnabled(!1)}}),[...o.entries()].filter(([,e])=>e.loc&&e.target).sort((e,r)=>e[0]-r[0]).map(([,e])=>({pos:e.loc,target:e.target,fov:null}))},se=()=>{const t=p.views||{};return Object.entries(t).sort((o,e)=>parseInt(o[0])-parseInt(e[0])).map(([,o])=>({pos:F.FromArray(o.loc),target:F.FromArray(o.target),fov:null}))},he=(t,o)=>{const e=o*(p.viewBoundScale??.9);return e>0?t.map(r=>{const i=r.pos.length();return i<=e?r:{...r,pos:r.pos.scale(e/i)}}):t},ne=()=>{const t=a*1.2;return[0,1,2,3].map(o=>{const e=Math.PI*.15+o*Math.PI*.35;return{pos:new F(Math.cos(e)*t,a*(.25+.2*o),Math.sin(e)*t),target:F.Zero(),fov:null}})},Se=()=>{y.forEach(t=>{t.material?.dispose(),t.dispose()}),y.length=0,H.length=0,K&&(l.activeCamera=u,K.dispose(!1,!0),K=null),l.cameras.slice().forEach(t=>{t!==u&&t.dispose()}),v=[],S=[]},Ae=async(t,o)=>{const e=`/IIMA_HUBsite/${t}`.replace(/\/+/g,"/"),r=e.substring(0,e.lastIndexOf("/")+1),i=e.substring(e.lastIndexOf("/")+1),s=await Ye.LoadAssetContainerAsync(r,i,l,n=>{n.lengthComputable&&g(Math.round(n.loaded*60/n.total))});if(o!==A||P){s.dispose();return}s.addAllToScene(),l.activeCamera=u;const c=new He("modelRoot",l);K=c,s.rootNodes.slice().forEach(n=>{n!==c&&(n.parent=c)});const M=s.meshes.filter(n=>n.getTotalVertices()>0&&!/_loc$|_target$/.test(n.name)),_=new F(1/0,1/0,1/0),C=new F(-1/0,-1/0,-1/0);M.forEach(n=>{n.computeWorldMatrix(!0);const w=n.getBoundingInfo().boundingBox;_.minimizeInPlace(w.minimumWorld),C.maximizeInPlace(w.maximumWorld)});let V=a*.5*Math.sqrt(3);if(M.length){const n=C.subtract(_),w=_.add(n.scale(.5)),B=a/(Math.max(n.x,n.y,n.z)||1);c.scaling=new F(B,B,B),c.position=w.scale(-B),V=n.scale(B*.5).length()}c.computeWorldMatrix(!0),M.forEach(n=>n.computeWorldMatrix(!0));let L=Fe();L.length||(L=Ce(s.meshes)),L.length||(L=se()),L.length||(L=ne()),S=he(L,V),v=M,v.forEach(n=>{n.isVisible=!1,n.setEnabled(!1);const w=n.material;w&&"unlit"in w&&(w.unlit=!0),w&&(w.backFaceCulling=!1)});const x=X().density;for(let n=0;n<v.length;n++){if(o!==A||P)return;const w=v[n],B=X().useTextureColor?await Me(w):null,J=Pe(w,x,B);J&&oe(w.name,J),g(60+Math.round((n+1)/v.length*40)),await new Promise(Z=>setTimeout(Z,0))}},Ne=async(t,o)=>{const e=`/IIMA_HUBsite/${t}`.replace(/\/+/g,"/");g(15);let i=/\.ply$/i.test(t)?await tt(e):await ot(e);if(o!==A||P)return;g(60),i=nt(i,p.pointBudget??2e5),i=st(i,a),g(85),oe("cloudfile",i);let s=0;const c=i.positions;for(let C=0;C<c.length;C+=3){const V=c[C]*c[C]+c[C+1]*c[C+1]+c[C+2]*c[C+2];V>s&&(s=V)}const M=Math.sqrt(s)||a;let _=se();_.length||(_=ne()),S=he(_,M)},pe=async t=>{const o=++A;E.current?(D(!0),g(0)):(m(!0),g(0)),Se();try{if(!t)throw new Error("no model configured");/\.(glb|gltf)$/i.test(t)?await Ae(t,o):await Ne(t,o)}catch(e){console.warn("模型載入失敗，改用程序化點雲:",e),o===A&&!P&&(oe("procedural",rt()),S=se(),S.length||(S=ne()))}o!==A||P||($=j*Math.max(0,S.length-1),de(X().effect),te(X()),g(100),E.current=!0,setTimeout(()=>{m(!1),D(!1)},350))},Ee=X().model||p.glb||p.pointcloud||"";pe(Ee);const Ie=Re((t,o)=>{if(o.some(e=>ke.includes(e))){pe(t.model);return}o.includes("effect")&&de(t.effect),te(t)});let me=0;I.runRenderLoop(()=>{const t=I.getDeltaTime()/1e3;if(me+=t,S.length>0){const s=S.length,c=j*(s-1),M=1-Math.exp(-t*X().scrollSpeed);if($+=(c-$)*M,s===1)u.setPosition(S[0].pos.clone()),u.setTarget(S[0].target.add(W)),S[0].fov&&(u.fov=S[0].fov);else{const _=be(S.map(w=>w.pos),$),C=be(S.map(w=>w.target),$);u.setPosition(_),u.setTarget(C.add(W));const V=Math.min(Math.floor($),s-2),L=$-V,x=S[V].fov,n=S[V+1].fov;x!==null&&n!==null&&(u.fov=x+(n-x)*L)}}const o=u.position.length(),e=Math.max(15,o*1.2),r=Math.max(40,o*3),i=Math.min(1,Math.pow(a/Math.max(o,a),2));H.forEach(s=>{s.setFloat("time",me),s.setVector2("mousePos",z),s.setFloat("uFadeNear",e),s.setFloat("uFadeFar",r),s.setFloat("uGlobalAlpha",i)}),l.render()}),window.__iimaScene={scene:l,camera:u,get pathKeys(){return S},get smoothT(){return $},get scrollProgress(){return j}};const re=()=>{I.resize()},ze=setTimeout(re,100);return window.addEventListener("resize",re),()=>{P=!0,A++,clearTimeout(ze),Ie(),Q.disconnect(),window.removeEventListener("scroll",N),window.removeEventListener("message",R),window.removeEventListener("updateMouse",U),window.removeEventListener("resize",re),I.dispose()}},[p]),G.jsxs(G.Fragment,{children:[f&&G.jsxs("div",{className:"fixed bottom-5 left-5 z-[100] font-mono text-[10px] tracking-[0.25em] text-[#ff5f00] bg-black/70 border border-[#ff5f00]/40 px-3 py-2 pointer-events-none select-none",children:[G.jsx("div",{className:"relative w-40 h-px bg-gray-800 mb-2",children:G.jsx("div",{className:"absolute inset-y-0 left-0 bg-[#ff5e00] transition-all duration-300 shadow-[0_0_8px_#ff5e00]",style:{width:`${b}%`}})}),G.jsxs("span",{className:"animate-pulse",children:["LOADING POINT CLOUD… ",b,"%"]})]}),!f&&h&&G.jsxs("div",{className:"fixed top-20 left-6 z-[100] font-mono text-[10px] tracking-[0.25em] text-[#ff5f00] bg-black/70 border border-[#ff5f00]/40 px-3 py-2 animate-pulse",children:["REBUILDING SCENE… ",b,"%"]}),G.jsx("canvas",{id:"renderCanvas",ref:d,className:"fixed inset-0 w-screen h-screen z-0 bg-black touch-none",style:{display:"block",opacity:f?0:1,transition:"opacity 1.2s ease"}})]})}export{lt as default};
