/* 3D の見た目（Three.js r158）
   sim.js の world（何がどこにあるか）を毎フレーム読んで、ボード・コース・ロボットカー・チャッピー・へやを描く。
   見た目だけを担当するので、ここを直してもセンサーの値やプログラムの動きは変わらない */
(function(global){
  const T = THREE;
  const W = VPSim.W, H = VPSim.H;
  const M = 30;                                   // ボードのふち
  const X = x => x - W / 2, Z = y => y - H / 2;   // 床の絵の座標 → 3D
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b, k = 0) => { const s = Math.sin(a * 12.9898 + b * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
  const SKY_DAY = 'linear-gradient(180deg,#BFDDF7 0%,#E3EFFA 55%,#F4F8FC 100%)';

  // ---------- 形と色の道具 ----------
  function rrShape(w, h, r){
    const s = new T.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }
  // 角の丸い箱（幅 w・高さ h・奥行き d、中心が原点）
  function roundedBox(w, h, d, r){
    r = Math.min(r, w / 2, h / 2, d / 2) * 0.98;
    const b = r * 0.6;
    const geo = new T.ExtrudeGeometry(rrShape(w - 2 * b, d - 2 * b, Math.max(0.01, r - b)),
      { depth:Math.max(0.01, h - 2 * b), bevelEnabled:true, bevelThickness:b, bevelSize:b, bevelSegments:3, curveSegments:6 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -(h - 2 * b) / 2, 0);
    return geo;
  }
  const std = (color, o) => new T.MeshStandardMaterial(Object.assign({ color, roughness:0.62 }, o));
  const toy = (color, o) => new T.MeshPhysicalMaterial(Object.assign({ color, roughness:0.42, clearcoat:0.6, clearcoatRoughness:0.3 }, o));
  function mesh(geo, material, x = 0, y = 0, z = 0, shadow = true){
    const m = new T.Mesh(geo, material); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true; return m;
  }
  function group(x = 0, y = 0, z = 0){ const g = new T.Group(); g.position.set(x, y, z); return g; }
  const cyl = (rt, rb, h, seg = 20, axis) => {
    const g = new T.CylinderGeometry(rt, rb, h, seg);
    if(axis === 'x') g.rotateZ(Math.PI / 2); if(axis === 'z') g.rotateX(Math.PI / 2);
    return g;
  };
  function canvasTex(w, h, draw){
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    t.redraw = (...a) => { draw(c.getContext('2d'), ...a); t.needsUpdate = true; };
    return t;
  }
  function roundRectPath(g, x, y, w, h, r){
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const glowTex = canvasTex(128, 128, g => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });
  glowTex.redraw();
  const glowSprite = (color, size) => {
    const s = new T.Sprite(new T.SpriteMaterial({ map:glowTex, color, transparent:true, opacity:0,
                                                  blending:T.AdditiveBlending, depthWrite:false, toneMapped:false }));
    s.scale.set(size, size, 1); return s;
  };
  const SHARED = new Set([glowTex]);   // コースを作り直しても捨てないテクスチャ

  // ---------- チャッピー ----------
  // compass/src/components/chappy（Chappy.tsx とパーツ画像）の見た目を 3D にしたもの：
  // ネコ耳の白い頭・黒い画面の顔（水色の目と ω の口）・洋なし形の体・先にりんごがついたしっぽ
  const CP_TEAL = '#3AB7C2';
  const cpWhite = () => toy('#F1F9F7', { roughness:0.3, clearcoat:1, clearcoatRoughness:0.1, sheen:0.5, sheenColor:new T.Color('#D6F2F4') });

  // 顔の画面に貼る絵（mood: normal / blink / happy / ouch、look: 目を左右に動かす量）。
  // 目と口の位置・大きさは元のチャッピー（Chappy.tsx の EYES と口の線）を画面の大きさに合わせたもの
  function drawChappyFace(g, mood, look = 0){
    g.fillStyle = '#0B0F11'; g.fillRect(0, 0, 256, 176);
    const hl = g.createLinearGradient(0, 4, 0, 60);
    hl.addColorStop(0, 'rgba(255,255,255,.1)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.beginPath(); g.ellipse(84, 28, 64, 18, -0.1, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';                   // 左上の白い光（元の絵と同じ）
    g.beginPath(); g.ellipse(40, 28, 13, 7, -0.55, 0, Math.PI * 2); g.fill();
    g.strokeStyle = CP_TEAL; g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = CP_TEAL; g.shadowBlur = 8;
    [[63, 82], [193, 84]].forEach(([x, y], i) => {
      x += look; g.beginPath();
      if(mood === 'happy'){ g.lineWidth = 9; g.moveTo(x - 17, y + 8); g.quadraticCurveTo(x, y - 24, x + 17, y + 8); g.stroke(); }
      else if(mood === 'blink'){ g.lineWidth = 8; g.moveTo(x - 15, y + 2); g.quadraticCurveTo(x, y + 13, x + 15, y + 2); g.stroke(); }
      else if(mood === 'ouch'){ const s = i ? -1 : 1; g.lineWidth = 9; g.moveTo(x - 13 * s, y - 15); g.lineTo(x + 12 * s, y); g.lineTo(x - 13 * s, y + 15); g.stroke(); }
      else {
        g.shadowBlur = 0;
        const gr = g.createLinearGradient(0, y - 26, 0, y + 26); gr.addColorStop(0, '#2FB0BF'); gr.addColorStop(1, '#168C9C');
        g.fillStyle = gr; g.ellipse(x, y, 15, 25, 0.06, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(232,252,253,.85)';
        g.beginPath(); g.ellipse(x - 4.5, y - 13, 3.6, 4.8, -0.3, 0, Math.PI * 2); g.fill(); g.shadowBlur = 8;
      }
    });
    if(mood === 'happy'){                                   // ほっぺ
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,125,160,.45)';
      [[44, 118], [212, 120]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x + look, y, 14, 7, 0, 0, Math.PI * 2); g.fill(); });
      g.shadowBlur = 8;
    }
    const mx = 128 + look * 0.5, my = 121;                  // ω の口
    g.lineWidth = 7; g.beginPath();
    if(mood === 'ouch'){ g.moveTo(mx - 26, my + 8); for(let i = 1; i <= 6; i++) g.lineTo(mx - 26 + i * 9, my + 8 + (i % 2 ? -7 : 0)); }
    else {
      g.moveTo(mx - 28, my);
      g.bezierCurveTo(mx - 26, my + 12, mx - 18, my + 15, mx - 12, my + 14);
      g.bezierCurveTo(mx - 5, my + 13, mx - 1, my + 9, mx, my + 6);
      g.bezierCurveTo(mx + 3, my + 10, mx + 8, my + 15, mx + 15, my + 15);
      g.bezierCurveTo(mx + 22, my + 15, mx + 28, my + 11, mx + 30, my);
    }
    g.stroke(); g.shadowBlur = 0;
  }

  // 頭は「超楕円体」：|x/a|^n + |y/b|^n + |z/c|^n = 1。n=3 で全体がぷっくりした角の丸い四角になる。
  // 元の絵と同じく、下の方を少しだけ細くする（taper）
  const HEAD = { a:35, b:27, c:24.5, n:3, taper:0.07 };
  const headA = y => HEAD.a * (1 - HEAD.taper * Math.max(0, -y / HEAD.b));
  function superEllipsoid(){
    const geo = new T.SphereGeometry(1, 72, 54), p = geo.attributes.position, n = HEAD.n;
    for(let i = 0; i < p.count; i++){
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = Math.pow(Math.abs(x) ** n + Math.abs(y) ** n + Math.abs(z) ** n, 1 / n) || 1;
      const yy = y / k * HEAD.b;
      p.setXYZ(i, x / k * headA(yy), yy, z / k * HEAD.c);
    }
    geo.computeVertexNormals();
    return geo;
  }
  // 頭の前の曲面にぴったり沿う画面（形は角の丸い四角＝スーパー楕円、中心から輪を重ねて作る）
  function screenCap(sa, sb, oy){
    const R = 16, A = 96, pos = [], uv = [], idx = [];
    const zOn = (x, y) => HEAD.c * Math.pow(Math.max(0, 1 - Math.abs(x / headA(y)) ** HEAD.n - Math.abs(y / HEAD.b) ** HEAD.n), 1 / HEAD.n) + 0.25;
    pos.push(0, oy, zOn(0, oy)); uv.push(0.5, 0.5);
    for(let i = 1; i <= R; i++) for(let j = 0; j < A; j++){
      const t = j / A * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), r = i / R;
      const x = sa * r * Math.sign(c) * Math.sqrt(Math.abs(c)), y = oy + sb * r * Math.sign(s) * Math.sqrt(Math.abs(s));
      pos.push(x, y, zOn(x, y)); uv.push(x / (2 * sa) + 0.5, (y - oy) / (2 * sb) + 0.5);
    }
    for(let j = 0; j < A; j++) idx.push(0, 1 + j, 1 + (j + 1) % A);
    for(let i = 1; i < R; i++) for(let j = 0; j < A; j++){
      const a0 = 1 + (i - 1) * A + j, a1 = 1 + (i - 1) * A + (j + 1) % A;
      idx.push(a0, a0 + A, a1 + A, a0, a1 + A, a1);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  // ネコ耳の形（compass の earL / earR と同じ）：内がわはゆるい坂、外がわはほぼまっすぐで、先は外寄りで丸い。
  // s = 1 が右耳、-1 が左耳（左右反対の形）
  function earPath(path, s, inner){
    const X = x => x * s * 1.45;
    if(inner){
      path.moveTo(X(-9.2), 3);
      path.bezierCurveTo(X(-6.6), 9, X(-2.6), 15.6, X(1.6), 21.4);
      path.quadraticCurveTo(X(3.6), 23.6, X(5.2), 21.2);
      path.bezierCurveTo(X(6.6), 15, X(7.2), 9, X(7), 2.6);
      path.quadraticCurveTo(X(-1), 1.2, X(-9.2), 3);
    } else {
      path.moveTo(X(-14), 0);
      path.bezierCurveTo(X(-10.5), 8, X(-4.5), 17.5, X(1.6), 25.6);
      path.quadraticCurveTo(X(4), 29.4, X(6.4), 25.8);
      path.bezierCurveTo(X(8.6), 19, X(10.2), 10, X(10), 0);
      path.quadraticCurveTo(X(-2), -3, X(-14), 0);
    }
    return path;
  }
  function chappyEar(s, white){
    const ear = group(s * 18.5, 13, -3); ear.rotation.set(-0.05, 0, -s * 0.12);
    // 耳の本体（うらがわは先に行くほどうすくなる）
    const body = new T.ExtrudeGeometry(earPath(new T.Shape(), s), { depth:5, bevelEnabled:true, bevelThickness:2, bevelSize:1.6, bevelSegments:4, curveSegments:14 });
    body.translate(0, 0, -4.5);
    const p = body.attributes.position;
    for(let i = 0; i < p.count; i++){ const z = p.getZ(i); if(z < 0) p.setZ(i, z * (1 - 0.5 * clamp(p.getY(i) / 28, 0, 1))); }
    body.computeVertexNormals();
    ear.add(mesh(body, white));
    // 白いふち（内がわの水色が少しへこんで見える）
    const rimShape = earPath(new T.Shape(), s); rimShape.holes.push(earPath(new T.Path(), s, true));
    const rim = new T.ExtrudeGeometry(rimShape, { depth:1.4, bevelEnabled:true, bevelThickness:0.5, bevelSize:0.35, bevelSegments:2, curveSegments:14 });
    ear.add(mesh(rim, white, 0, 0, 3, false));
    // 内がわの水色（上が明るく、下が少し濃い）
    const grad = canvasTex(4, 64, g => { const r = g.createLinearGradient(0, 0, 0, 64); r.addColorStop(0, '#86CCD8'); r.addColorStop(1, '#3F98AA'); g.fillStyle = r; g.fillRect(0, 0, 4, 64); });
    grad.redraw(); grad.repeat.set(1, 1 / 24);
    ear.add(mesh(new T.ShapeGeometry(earPath(new T.Shape(), s, true), 14), std('#FFFFFF', { map:grad, roughness:0.5 }), 0, 0, 2.6, false));
    return ear;
  }

  // 頭（幅70・高さ54・奥行き49、中心が原点、顔は +z 向き）
  function chappyHead(white){
    const g = new T.Group();
    g.add(mesh(superEllipsoid(), white));
    const face = canvasTex(256, 176, drawChappyFace); face.redraw('normal', 0);
    const screenMat = new T.MeshPhysicalMaterial({ map:face, emissiveMap:face, emissive:'#FFFFFF', emissiveIntensity:0.35,
                                                   roughness:0.18, clearcoat:1, clearcoatRoughness:0.05 });
    g.add(mesh(screenCap(27.3, 19.2, -1.5), screenMat, 0, 0, 0, false));
    const ears = [-1, 1].map(s => { const e = chappyEar(s, white); g.add(e); return e; });
    return { g, face, ears };
  }

  // しっぽの先のりんご
  function apple(r, mat){
    const g = new T.Group();
    const body = mesh(new T.SphereGeometry(r, 24, 18), mat); body.scale.set(1, 0.9, 1); g.add(body);
    g.add(mesh(cyl(r * 0.1, r * 0.12, r * 0.7, 6), std('#6B4423'), 0, r * 0.95, 0));
    const leaf = mesh(new T.SphereGeometry(r * 0.45, 12, 8), std('#4A9628', { roughness:0.5 }), r * 0.35, r * 1.05, 0, false);
    leaf.scale.set(1.5, 0.28, 0.75); leaf.rotation.z = 0.5; g.add(leaf);
    return g;
  }
  // しっぽ（先に行くほど少し細い）
  function tailTube(points, r0, r1, white){
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    const seg = 56, rad = 10, geo = new T.TubeGeometry(curve, seg, r0, rad, false);
    const p = geo.attributes.position, c = new T.Vector3(), v = new T.Vector3();
    for(let i = 0; i <= seg; i++){
      curve.getPointAt(i / seg, c); const k = (r0 + (r1 - r0) * i / seg) / r0;
      for(let j = 0; j <= rad; j++){ const n = i * (rad + 1) + j; v.fromBufferAttribute(p, n).sub(c).multiplyScalar(k).add(c); p.setXYZ(n, v.x, v.y, v.z); }
    }
    geo.computeVertexNormals();
    return { mesh:mesh(geo, white), end:curve.getPointAt(1) };
  }

  // 立っているチャッピー（高さ約110、足もとが原点、顔は +z 向き）
  function makeChappy(){
    // 大きさは元の絵の比率どおり：頭の幅70 に対して胴の幅37、頭:首から下 ＝ 1.35:1
    const white = cpWhite(), g = new T.Group(), all = new T.Group(); g.add(all);
    const legs = [-1, 1].map(s => {
      const leg = group(s * 7.4, 14, 0);                   // 足のつけ根を中心に前後にふる
      leg.add(mesh(new T.CapsuleGeometry(7, 3, 8, 16), white, 0, -5.5, 0));
      const foot = mesh(new T.SphereGeometry(7.8, 24, 16), white, s * 0.6, -10.6, 1.8); foot.scale.set(1, 0.52, 1.25); leg.add(foot);
      all.add(leg); return leg;
    });
    // 胴（洋なし形：下がふっくら、上が細い）
    const prof = [[0.01, 0], [13, 0.6], [17.6, 4], [19.4, 11.5], [19, 20], [17, 27], [12.5, 32], [6.5, 34], [0.01, 34.5]]
      .map(([r, y]) => new T.Vector2(r, y));
    const torso = mesh(new T.LatheGeometry(prof, 48), white, 0, 9.5, 0); torso.scale.z = 0.86; all.add(torso);
    const arms = [-1, 1].map(s => {
      const a = group(s * 17, 38.5, 0.5); a.rotation.z = s * 0.26;
      a.add(mesh(new T.CapsuleGeometry(6.2, 11, 8, 14), white, 0, -9.5, 0.6)); all.add(a); return a;
    });
    // しっぽ：おしりから体の横へ回って、上へのびる。先に大きなりんご
    const tail = group(2, 20, -10); all.add(tail);
    const t = tailTube([[0, 0, 0], [8, -5, -9], [24, -6, -12], [38, 3, -9], [43, 24, -6], [41, 48, -4], [39, 62, -4]], 2.3, 1.75, white);
    tail.add(t.mesh);
    const ap = apple(10.5, toy('#E2432F', { roughness:0.28, clearcoat:0.8 })); ap.position.copy(t.end).add(new T.Vector3(0, 9, 0)); tail.add(ap);
    const head = chappyHead(white); head.g.position.set(0, 64, 0); all.add(head.g);
    // ぶつかったときに頭の上を回る星
    const star = new T.Shape();
    for(let i = 0; i < 10; i++){ const r = i % 2 ? 2.6 : 6, a = i / 10 * Math.PI * 2 + Math.PI / 2; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const starGeo = new T.ExtrudeGeometry(star, { depth:1.8, bevelEnabled:false }); starGeo.center();
    const starMat = std('#FFD23F', { emissive:'#FFB800', emissiveIntensity:0.9 });
    const stars = group(0, 112, 0); stars.visible = false;
    for(let i = 0; i < 3; i++){ const a = i * Math.PI * 2 / 3; stars.add(mesh(starGeo, starMat, Math.cos(a) * 22, 0, Math.sin(a) * 22, false)); }
    all.add(stars);
    let blink = 2 + Math.random() * 2, key = '';
    // s: { mood, wave, jump, walk, hurt（ぶつかってからの残り秒数）}
    function update(time, dt, s){
      const hurt = s.hurt || 0, walk = s.walk ? 1 : 0, ph = time * 9;
      blink -= dt; if(blink < -0.14) blink = 2 + Math.random() * 2.5;
      const mood = hurt > 0 ? 'ouch' : s.mood !== 'normal' ? s.mood : blink < 0 ? 'blink' : 'normal';
      if(mood !== key){ key = mood; head.face.redraw(mood, 0); }
      // いたいアクション：のけぞって頭をおさえ、頭の上を星が回る
      const k = hurt > 0 ? Math.min(1, (2.4 - hurt) / 0.18, hurt / 0.5) : 0;
      all.position.set(0, (s.jump ? Math.abs(Math.sin(time * 7)) * 22 : 0) + walk * Math.abs(Math.sin(ph)) * 1.6, -8 * k);
      all.rotation.x = -0.42 * k;
      all.scale.y = 1 + Math.sin(time * 1.8) * 0.015;
      tail.rotation.y = Math.sin(time * (walk ? 6 : 1.8)) * 0.12;
      head.g.rotation.z = Math.sin(time * 0.9) * 0.05 + Math.sin(time * 28) * 0.16 * k;
      head.ears.forEach((e, i) => { e.rotation.x = -0.05 + (Math.sin(time * 3 + i) > 0.97 ? -0.25 : 0); });
      legs.forEach((l, i) => { l.rotation.x = walk * Math.sin(ph + i * Math.PI) * 0.55; });
      arms.forEach((a, i) => {
        let z = 0.26, x = walk * Math.sin(ph + (1 - i) * Math.PI) * 0.5;
        if(i === 1 && s.wave) z = 2.3 + Math.sin(time * 10) * 0.35;
        if(s.jump) z = 2.3 + Math.sin(time * 10 + i) * 0.3;
        if(k > 0){ z = 0.26 + 2.5 * k; x = -0.5 * k; }
        a.rotation.set(x, 0, (i ? 1 : -1) * z);
      });
      stars.visible = k > 0.05;
      if(stars.visible){ stars.rotation.y = time * 6; stars.scale.setScalar(0.5 + 0.5 * k); }
    }
    return { g, update, headTop:112 };
  }

  // ---------- コースに置く物 ----------
  const BUILD = {
    chappy(w){                      // 応援しているチャッピー（ゴールするとジャンプ）
      const c = makeChappy();
      c.g.position.set(X(w.x + w.w / 2), 0, Z(w.y + w.h / 2)); c.g.scale.setScalar(0.5); c.g.rotation.y = w.face || 0;
      c.g.userData.chappy = c; return c.g;
    },
    tree(w){
      const cx = w.x + w.w / 2, cy = w.y + w.h / 2, r = rnd(cx, cy);
      const g = group(X(cx), 0, Z(cy)); g.scale.setScalar(0.85 + r * 0.4); g.rotation.y = r * 6;
      const leaf = std(['#5DBB63','#4CAF6A','#7CCB5B'][Math.floor(r * 3)], { flatShading:true, roughness:0.8 });
      g.add(mesh(cyl(3, 4.2, 18, 8), std('#8B5E3C', { roughness:0.9 }), 0, 9, 0));
      g.add(mesh(new T.IcosahedronGeometry(15, 0), leaf, 0, 29, 0));
      g.add(mesh(new T.IcosahedronGeometry(10.5, 0), leaf, 4, 41, -2));
      return g;
    },
    house(w){
      const g = group(X(w.x + w.w / 2), 0, Z(w.y + w.h / 2)), bh = 42;
      g.add(mesh(roundedBox(w.w, bh, w.h, 4), toy(w.color), 0, bh / 2, 0));
      const sh = new T.Shape(), rw = w.w / 2 + 7;
      sh.moveTo(-rw, 0); sh.lineTo(rw, 0); sh.lineTo(0, 30); sh.closePath();
      const roof = new T.ExtrudeGeometry(sh, { depth:w.h + 8, bevelEnabled:true, bevelThickness:1.5, bevelSize:1.5, bevelSegments:1 });
      roof.translate(0, 0, -(w.h + 8) / 2);
      g.add(mesh(roof, toy(w.roof, { flatShading:true }), 0, bh - 1, 0));
      g.add(mesh(roundedBox(9, 18, 9, 2), toy('#B85C48'), w.w * 0.24, bh + 20, -w.h * 0.15));
      const glass = std('#CFEFFF', { roughness:0.15, emissive:'#3C6E91', emissiveIntensity:0.25 });
      g.add(mesh(roundedBox(14, 24, 3, 2), std('#8B5E3C'), 0, 12, w.h / 2 + 0.6));
      for(const s of [-1, 1]){
        g.add(mesh(roundedBox(14, 12, 2.5, 2), glass, s * w.w * 0.3, 27, w.h / 2 + 0.5, false));
        g.add(mesh(roundedBox(2.5, 12, 14, 2), glass, s * (w.w / 2 + 0.5), 27, 0, false));
      }
      return g;
    },
    building(w){
      const g = group(X(w.x + w.w / 2), 0, Z(w.y + w.h / 2)), ht = w.height;
      g.add(mesh(roundedBox(w.w, ht, w.h, 6), toy(w.color, { clearcoat:0.3 }), 0, ht / 2, 0));
      g.add(mesh(roundedBox(w.w - 10, 6, w.h - 10, 3), toy(w.accent), 0, ht + 3, 0));
      g.add(mesh(roundedBox(16, 10, 14, 3), std('#AEB8C4'), w.w * 0.2, ht + 11, -w.h * 0.15));
      g.add(mesh(roundedBox(24, 20, 4, 2), std('#38506B', { roughness:0.3 }), 0, 10, w.h / 2 + 1));
      g.add(mesh(roundedBox(34, 4, 12, 2), toy(w.accent), 0, 22, w.h / 2 + 5));
      // まど（たくさんあるので InstancedMesh でまとめて描く）
      const rows = Math.max(1, Math.floor((ht - 30) / 20)), cx = Math.max(1, Math.floor((w.w - 14) / 18)), cz = Math.max(1, Math.floor((w.h - 14) / 18));
      const win = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1),
        std('#A9D4F5', { roughness:0.12, metalness:0.1, emissive:'#28507A', emissiveIntensity:0.3 }), rows * (cx + cz) * 2);
      const m4 = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), s = new T.Vector3(); let i = 0;
      for(let r = 0; r < rows; r++){
        const y = 40 + r * 20;
        for(let c = 0; c < cx; c++) for(const k of [-1, 1]){
          m4.compose(p.set(-w.w / 2 + w.w / cx * (c + 0.5), y, k * (w.h / 2 + 0.4)), q, s.set(10, 12, 1.6)); win.setMatrixAt(i++, m4);
        }
        for(let c = 0; c < cz; c++) for(const k of [-1, 1]){
          m4.compose(p.set(k * (w.w / 2 + 0.4), y, -w.h / 2 + w.h / cz * (c + 0.5)), q, s.set(1.6, 12, 10)); win.setMatrixAt(i++, m4);
        }
      }
      win.receiveShadow = true; g.add(win);
      return g;
    },
    block(w){
      const g = group(X(w.x + w.w / 2), 0, Z(w.y + w.h / 2)), m = toy(w.color);
      g.add(mesh(roundedBox(w.w - 3, w.height, w.h - 3, 6), m, 0, w.height / 2, 0));
      const nx = Math.max(1, Math.round(w.w / 30)), nz = Math.max(1, Math.round(w.h / 30));
      const studs = new T.InstancedMesh(cyl(7, 7, 5, 20), m, nx * nz);
      const m4 = new T.Matrix4(); let i = 0;
      for(let a = 0; a < nx; a++) for(let b = 0; b < nz; b++)
        studs.setMatrixAt(i++, m4.makeTranslation(-w.w / 2 + (a + 0.5) * w.w / nx, w.height + 2.5, -w.h / 2 + (b + 0.5) * w.h / nz));
      studs.castShadow = studs.receiveShadow = true; g.add(studs);
      return g;
    },
    car(w){
      const g = group(X(w.x + w.w / 2), 0, Z(w.y + w.h / 2)), dark = std('#22272F', { roughness:0.85 });
      g.add(mesh(roundedBox(w.w, 13, w.h, 6), toy(w.color), 0, 12, 0));
      g.add(mesh(roundedBox(w.w - 6, 12, w.h * 0.5, 5), toy('#DDEBF7', { roughness:0.15 }), 0, 23, 2));
      for(const sx of [-1, 1]) for(const sz of [-1, 1]) g.add(mesh(cyl(6, 6, 5, 16, 'x'), dark, sx * (w.w / 2 - 1), 6, sz * w.h * 0.3));
      for(const s of [-1, 1]) g.add(mesh(roundedBox(6, 3, 1, 1), std('#FFF6C8', { emissive:'#FFE38A', emissiveIntensity:0.6 }), s * 10, 14, -w.h / 2 - 0.3, false));
      return g;
    },
    signal(w){
      const g = group(X(w.x + w.w / 2), 0, Z(w.y + w.h / 2)), dark = std('#2A303A', { roughness:0.6 });
      g.add(mesh(cyl(1.6, 1.8, 48, 10), std('#5B6574'), 0, 24, 0));
      g.add(mesh(roundedBox(8, 24, 8, 2.5), dark, 0, 54, 0));
      g.userData.lamps = ['#FF4D4D', '#FFC93C', '#3DDC84'].map((c, i) => {
        const m = std(c, { emissive:c, emissiveIntensity:0.05, roughness:0.3 });
        g.add(mesh(new T.SphereGeometry(2.6, 14, 10), m, 0, 61 - i * 7, 4.4, false));
        return m;
      });
      return g;
    },
    // ふん水のある池
    pond(w){
      const g = group(X(w.x + w.w / 2), 0, Z(w.y + w.h / 2)), stone = std('#D8D1C4', { roughness:0.85 });
      g.add(mesh(roundedBox(w.w, 12, w.h, 16), stone, 0, 6, 0));
      g.add(mesh(roundedBox(w.w - 14, 2, w.h - 14, 12), toy('#4FB3E8', { roughness:0.05, clearcoat:1 }), 0, 11.5, 0, false));
      g.add(mesh(cyl(7, 10, 18, 20), stone, 0, 13, 0), mesh(cyl(15, 6, 5, 24), stone, 0, 23, 0));
      const spray = mesh(new T.ConeGeometry(5, 24, 16, 1, true), new T.MeshBasicMaterial({ color:'#D6F2FF', transparent:true, opacity:0.6, depthWrite:false }), 0, 37, 0, false);
      g.add(spray);
      [[-30, -32], [28, 30], [-22, 36]].forEach(([x, z]) => g.add(mesh(cyl(6, 6, 0.8, 16), std('#6CC27A'), x, 12.8, z, false)));
      g.userData.spray = spray;
      return g;
    },
    // 通行止め（赤白のしまの板）
    barrier(w){
      const g = group(X(w.x + w.w / 2), 0, Z(w.y + w.h / 2)), white = toy('#FFFFFF');
      const stripe = canvasTex(256, 32, c => { c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, 256, 32); c.fillStyle = '#E8604C';
        for(let x = -32; x < 256; x += 40){ c.beginPath(); c.moveTo(x, 32); c.lineTo(x + 20, 0); c.lineTo(x + 40, 0); c.lineTo(x + 20, 32); c.fill(); } });
      stripe.redraw();
      const striped = std('#FFFFFF', { map:stripe });            // 板の大きな面（±x）だけしま模様
      g.add(mesh(new T.BoxGeometry(4, 14, w.h - 10), [striped, striped, white, white, white, white], 0, 26, 0));
      const lamps = [];
      for(const s of [-1, 1]){
        g.add(mesh(roundedBox(10, 34, 8, 2), white, 0, 17, s * (w.h / 2 - 8)));
        const lamp = mesh(new T.SphereGeometry(3.4, 14, 10), std('#FFC93C', { emissive:'#FFB000', emissiveIntensity:1 }), 0, 37, s * (w.h / 2 - 8), false);
        g.add(lamp); lamps.push(lamp);
      }
      g.userData.blink = lamps;
      return g;
    },
  };

  // ---------- ビュー ----------
  // opts.wheel：ホイールで拡大してよいかを返す関数（トップページでは、ふつうのスクロールをじゃましないように使う）
  function createView(host, world, opts = {}){
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' }); }
    catch(e){ host.insertAdjacentHTML('beforeend', '<div class="nogl">このパソコンでは 3D 表示ができません</div>'); return null; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = T.SRGBColorSpace;
    const canvas = renderer.domElement; canvas.style.touchAction = 'none';
    host.prepend(canvas);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(32, 1, 5, 8000);
    const hemi = new T.HemisphereLight('#EAF4FF', '#B9A88E', 1.4);
    const sun = new T.DirectionalLight('#FFF4E2', 2.4);
    sun.position.set(-280, 560, 340); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left:-440, right:440, top:440, bottom:-440, near:50, far:1700 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    scene.add(hemi, sun);

    // ボード（2段の板）と床
    const board = new T.Group();
    board.add(mesh(roundedBox(W + M * 2, 14, H + M * 2, 26), toy('#FBFCFE', { clearcoat:0.3 }), 0, -7, 0));
    board.add(mesh(roundedBox(W + M * 2 - 10, 16, H + M * 2 - 10, 24), std('#34445A', { roughness:0.7 }), 0, -21, 0));
    const floorTex = new T.CanvasTexture(world.floor);
    floorTex.colorSpace = T.SRGBColorSpace; floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const floorGeo = new T.PlaneGeometry(W, H); floorGeo.rotateX(-Math.PI / 2);
    board.add(mesh(floorGeo, std('#FFFFFF', { map:floorTex, roughness:0.85 }), 0, 0.4, 0, false));
    const shadowTex = canvasTex(512, 384, g => {
      g.clearRect(0, 0, 512, 384); g.shadowColor = 'rgba(30,45,75,.5)'; g.shadowBlur = 48; g.shadowOffsetX = 2000;
      g.fillStyle = '#000'; roundRectPath(g, 96 - 2000, 72, 320, 240, 40); g.fill();
    });
    shadowTex.redraw();
    const shGeo = new T.PlaneGeometry((W + M * 2) * 1.6, (H + M * 2) * 1.6); shGeo.rotateX(-Math.PI / 2);
    board.add(mesh(shGeo, new T.MeshBasicMaterial({ map:shadowTex, transparent:true, depthWrite:false, toneMapped:false }), 30, -70, 40, false));
    scene.add(board);

    // ---------- ロボットカー ----------
    const car = buildCar(); scene.add(car.root);
    function buildCar(){
      // チャッピーが車に変身した姿：白い体に頭とネコ耳、しっぽの先のりんごが LED、頭の上のプロペラがファン
      const root = new T.Group();
      const white = cpWhite(), teal = toy(CP_TEAL), amber = toy('#F5B301');
      const dark = std('#20262F', { roughness:0.85 }), metal = std('#D5DCE4', { roughness:0.3, metalness:0.6 });
      root.add(mesh(roundedBox(46, 13, 30, 6), white, 0, 13, 0));
      root.add(mesh(roundedBox(44, 4, 31, 2), teal, 0, 8, 0));
      for(const s of [-1, 1]) root.add(mesh(new T.SphereGeometry(4.2, 16, 12), white, 20, 15, s * 11));   // 前足
      const head = chappyHead(white);
      head.g.scale.setScalar(0.5); head.g.rotation.y = Math.PI / 2; head.g.position.set(3, 33, 0); root.add(head.g);
      const tail = tailTube([[-21, 15, 0], [-28, 17, 0], [-33, 28, 0], [-32, 42, 0], [-29, 50, 0]], 1.8, 1.4, white);
      root.add(tail.mesh);
      const ledMat = toy('#E2432F', { roughness:0.3, emissive:'#FF5A4A', emissiveIntensity:0 });
      const ap = apple(5, ledMat); ap.position.copy(tail.end).add(new T.Vector3(0, 4.5, 0)); root.add(ap);
      const glow = glowSprite('#FF9A7A', 46); glow.position.copy(ap.position); root.add(glow);
      const ledLight = new T.PointLight('#FFB59A', 0, 260, 2); ledLight.position.copy(ap.position).y += 2; root.add(ledLight);
      // 距離センサー（前）
      root.add(mesh(roundedBox(3, 10, 22, 1.5), teal, 22.5, 12, 0));
      for(const s of [-1, 1]){
        root.add(mesh(cyl(3.6, 3.6, 4, 20, 'x'), metal, 25.5, 12, s * 5.5));
        root.add(mesh(cyl(2.4, 2.4, 4.4, 16, 'x'), dark, 25.6, 12, s * 5.5, false));
      }
      // 明るさセンサー（前の下）と、床を照らす赤い点
      root.add(mesh(roundedBox(5, 2.5, 7, 1), dark, 16, 5, 0, false));
      const spotGeo = new T.CircleGeometry(5.5, 28); spotGeo.rotateX(-Math.PI / 2);
      const spot = new T.Mesh(spotGeo, new T.MeshBasicMaterial({ color:'#FF4D3D', transparent:true, opacity:0.55, depthWrite:false, toneMapped:false }));
      spot.position.set(16, 0.25, 0); root.add(spot);
      root.add(mesh(new T.SphereGeometry(3.5, 14, 10), metal, 14, 3.5, 0));
      // タイヤ（左 = -z、右 = +z）
      const wheel = z => {
        const spin = group(-6, 10, z);
        spin.add(mesh(cyl(10, 10, 7, 28, 'z'), dark), mesh(cyl(5.5, 5.5, 7.6, 20, 'z'), teal), mesh(new T.BoxGeometry(2.2, 14, 7.9), white));
        root.add(spin); return spin;
      };
      const wheelL = wheel(-19), wheelR = wheel(19);
      // ファン（頭の上のプロペラ）
      root.add(mesh(cyl(1, 1, 16, 8), dark, 1, 53, 0));
      const fan = group(1, 61, 0);
      for(let i = 0; i < 3; i++){ const arm = new T.Group(); arm.rotation.y = i * Math.PI * 2 / 3; arm.add(mesh(roundedBox(11, 1.2, 4.5, 0.6), amber, 6, 0, 0)); fan.add(arm); }
      fan.add(mesh(new T.SphereGeometry(2.2, 12, 8), teal));
      root.add(fan);
      return { root, wheelL, wheelR, ledMat, glow, ledLight, fan, faceTex:head.face, spot };
    }

    // 距離センサーのビーム（±20° に広がる。先へ行くほどうすい）と、いちばん近い物に当たったところの輪
    const beamFade = canvasTex(4, 64, g => { const r = g.createLinearGradient(0, 0, 0, 64); r.addColorStop(0, '#000'); r.addColorStop(1, '#FFF'); g.fillStyle = r; g.fillRect(0, 0, 4, 64); });
    beamFade.redraw(); beamFade.colorSpace = T.NoColorSpace; SHARED.add(beamFade);
    const beamGeo = new T.CylinderGeometry(7, 0.6, 1, 28, 1, true); beamGeo.rotateZ(-Math.PI / 2); beamGeo.translate(0.5, 0, 0);
    const beam = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ color:'#FF6B5B', alphaMap:beamFade, transparent:true, opacity:0.32, depthWrite:false, side:T.DoubleSide, toneMapped:false }));
    const ring = new T.Mesh(new T.RingGeometry(3, 5.5, 28), new T.MeshBasicMaterial({ color:'#FF5A4A', transparent:true, opacity:0.9, side:T.DoubleSide, depthWrite:false, toneMapped:false }));
    scene.add(beam, ring);
    const BEAM_TAN = Math.tan(world.BEAM);

    // 走った跡（軌跡）
    const TRAIL_MAX = 5000, trailPos = new Float32Array(TRAIL_MAX * 3), trailGeo = new T.BufferGeometry();
    trailGeo.setAttribute('position', new T.BufferAttribute(trailPos, 3).setUsage(T.DynamicDrawUsage)); trailGeo.setDrawRange(0, 0);
    const trail = new T.Line(trailGeo, new T.LineBasicMaterial({ color:'#0FB5AA', transparent:true, opacity:0.8 }));
    trail.frustumCulled = false; scene.add(trail);
    let trailN = 0, trailX = 1e9, trailZ = 1e9;
    function addTrail(x, z){
      if(Math.hypot(x - trailX, z - trailZ) < 3) return;
      if(trailN >= TRAIL_MAX){ trailPos.copyWithin(0, 3); trailN--; }
      trailPos[trailN * 3] = x; trailPos[trailN * 3 + 1] = 0.9; trailPos[trailN * 3 + 2] = z; trailN++;
      trailX = x; trailZ = z; trailGeo.setDrawRange(0, trailN); trailGeo.attributes.position.needsUpdate = true;
    }

    // まっすぐ進んだ区間ごとに「4.0秒・4マス」の札を道の横に出す（自分のプログラムのときだけ。直進の秒数を考えるヒント）
    let segLabelsOn = true, seg = null;
    const segLabels = [];
    function addSegLabel(s){
      const dx = world.car.x - s.x, dy = world.car.y - s.y, len = Math.hypot(dx, dy);
      s.t = len / s.v;                               // 進んだ長さ ÷ 速さ（画面のコマ送りに左右されない正しい秒数）
      if(s.t < 0.3 || len < 15) return;
      const tex = canvasTex(256, 72, g => {
        g.clearRect(0, 0, 256, 72); g.fillStyle = 'rgba(30,42,56,.88)'; roundRectPath(g, 4, 4, 248, 64, 30); g.fill();
        g.fillStyle = '#FFFFFF'; g.font = '800 34px "BIZ UDPGothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(`${s.t.toFixed(1)}秒・${(len / 60).toFixed(1)}マス`, 128, 38);
      });
      tex.redraw();
      const sp = new T.Sprite(new T.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, toneMapped:false }));
      // 進んだ向きの左がわに少しずらして置く
      const mx = (s.x + world.car.x) / 2 + dy / len * 26, my = (s.y + world.car.y) / 2 - dx / len * 26;
      sp.position.set(X(mx), 14, Z(my)); sp.scale.set(86, 24, 1);
      scene.add(sp); segLabels.push(sp);
    }
    // 区間の始まりは sim.js が記録した場所（モーターの命令が来た瞬間）を使う
    function updateSegments(){
      const now = world.active && segLabelsOn ? world.straight : null;
      if(now !== seg){ if(seg) addSegLabel(seg); seg = now; }
    }
    function clearSegLabels(){
      segLabels.forEach(s => { scene.remove(s); s.material.map.dispose(); s.material.dispose(); });
      segLabels.length = 0; seg = null;
    }

    // 音符（ブザー）と紙ふぶき（ゴール）
    const noteTex = canvasTex(64, 64, g => {
      g.clearRect(0, 0, 64, 64); g.font = '900 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = '#FFFFFF'; g.strokeText('♪', 32, 34); g.fillStyle = '#2F6FB0'; g.fillText('♪', 32, 34);
    });
    noteTex.redraw();
    const notes = Array.from({ length:10 }, () => {
      const s = new T.Sprite(new T.SpriteMaterial({ map:noteTex, transparent:true, depthWrite:false }));
      s.visible = false; s.scale.set(16, 16, 1); scene.add(s); return { s, life:0, base:new T.Vector3(), ph:0 };
    });
    const CONF = 170, dummy = new T.Object3D();
    const confetti = new T.InstancedMesh(new T.PlaneGeometry(4, 6.5), new T.MeshBasicMaterial({ side:T.DoubleSide, toneMapped:false }), CONF);
    confetti.instanceMatrix.setUsage(T.DynamicDrawUsage); confetti.frustumCulled = false; confetti.visible = false;
    const CC = ['#F26B5B','#F7C744','#4D9DE0','#6CC27A','#F79A3E','#9B7FD1','#FF7FB6'].map(c => new T.Color(c));
    for(let i = 0; i < CONF; i++) confetti.setColorAt(i, CC[i % CC.length]);
    const parts = Array.from({ length:CONF }, () => ({ p:new T.Vector3(), v:new T.Vector3(), r:new T.Euler(), w:new T.Vector3(), life:0 }));
    scene.add(confetti);

    // 画面に重ねる吹き出し（表示パネル・ゴツン）と、センサーの値の札
    const el = cls => { const d = document.createElement('div'); d.className = cls; d.style.display = 'none'; host.appendChild(d); return d; };
    const bubble = el('bubble3d'), tagD = el('tag3d'), tagL = el('tag3d light');
    let walkers = [];   // 道を横切るチャッピー（3D と吹き出し）

    // ---------- コース ----------
    let course = new T.Group(), anims = [];
    scene.add(course);
    function disposeCourse(){
      course.traverse(o => {
        if(o.geometry) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          if(!m) return;
          ['map', 'emissiveMap', 'alphaMap'].forEach(k => { if(m[k] && !SHARED.has(m[k])) m[k].dispose(); });
          m.dispose();
        });
      });
      scene.remove(course);
      walkers.forEach(w => w.say.remove()); walkers = [];
    }
    // resetView: ステージが変わったときは true（カメラを「ななめ」にもどす）
    function setCourse(resetView = true){
      disposeCourse();
      course = new T.Group(); anims = [];
      const c = world.course;
      floorTex.needsUpdate = true;
      hemi.intensity = 1.4; hemi.color.set('#EAF4FF'); sun.intensity = 2.4; sun.color.set('#FFF4E2');
      host.style.background = SKY_DAY;
      if(c.plant) buildPlant(course);
      else if(c.room) buildRoom(course);
      else {
        buildRim(course);
        c.walls.forEach(w => {
          const o = BUILD[w.kind] && BUILD[w.kind](w); if(!o) return;
          course.add(o);
          if(o.userData.chappy) anims.push((t, dt) => o.userData.chappy.update(t, dt, { mood:happy > 0 ? 'happy' : 'normal', wave:happy > 0, jump:happy > 0 }));
          if(o.userData.lamps) anims.push(t => {           // 信号機：青4秒→黄1秒→赤4秒
            const p = (t + rnd(w.x, w.y) * 9) % 9, on = p < 4 ? 2 : p < 5 ? 1 : 0;
            o.userData.lamps.forEach((m, i) => { m.emissiveIntensity = i === on ? 2.2 : 0.05; });
          });
          if(o.userData.blink) anims.push(t => o.userData.blink.forEach((l, i) => { l.material.emissiveIntensity = (Math.sin(t * 6 + i * Math.PI) > 0) ? 2.2 : 0.2; }));
          if(o.userData.spray) anims.push(t => { o.userData.spray.scale.set(1 + Math.sin(t * 7) * 0.08, 1 + Math.sin(t * 5) * 0.12, 1 + Math.sin(t * 7) * 0.08); });
        });
        if(c.goal) buildGoal(course, c.goal);
        if(c.checkpoints) buildCheckpoints(course, c.checkpoints);
        buildWalkers(course);
      }
      scene.add(course);
      car.root.visible = !c.room; beam.visible = ring.visible = false;
      resetFx();
      if(resetView) setView('iso');
      else if(cam.mode === 'iso' || cam.mode === 'top') cam.radius = fitRadius(cam.theta, cam.phi);
    }

    function buildRim(g){
      const m = toy('#FFFFFF', { clearcoat:0.3 });
      g.add(mesh(roundedBox(W + 20, 12, 10, 3), m, 0, 6, -H / 2 - 5));
      g.add(mesh(roundedBox(W + 20, 12, 10, 3), m, 0, 6, H / 2 + 5));
      g.add(mesh(roundedBox(10, 12, H, 3), m, -W / 2 - 5, 6, 0));
      g.add(mesh(roundedBox(10, 12, H, 3), m, W / 2 + 5, 6, 0));
    }

    function buildGoal(g, goal){
      const cx = X(goal.x + goal.w / 2), cz = Z(goal.y + goal.h / 2);
      // 光の柱（下ほど濃い）
      const fade = canvasTex(8, 128, c => { const r = c.createLinearGradient(0, 0, 0, 128);
        r.addColorStop(0, 'rgba(255,226,122,0)'); r.addColorStop(1, 'rgba(255,226,122,.75)'); c.fillStyle = r; c.fillRect(0, 0, 8, 128); });
      fade.redraw();
      const side = new T.MeshBasicMaterial({ map:fade, transparent:true, depthWrite:false, side:T.DoubleSide, toneMapped:false, blending:T.AdditiveBlending });
      const none = new T.MeshBasicMaterial({ visible:false });
      const pillar = new T.Mesh(new T.BoxGeometry(goal.w - 8, 70, goal.h - 8), [side, side, none, none, side, side]);
      pillar.position.set(cx, 35.5, cz); g.add(pillar);
      const pad = new T.Mesh(new T.PlaneGeometry(goal.w - 6, goal.h - 6).rotateX(-Math.PI / 2),
        new T.MeshBasicMaterial({ color:'#FFD23F', transparent:true, opacity:0.3, depthWrite:false, toneMapped:false }));
      pad.position.set(cx, 0.8, cz); g.add(pad);
      let clothGeo = null, base = null;
      if(goal.flag){                                         // 旗
        const [fx, fy] = goal.flag, pole = group(X(fx), 0, Z(fy));
        pole.add(mesh(cyl(1.3, 1.3, 64, 10), std('#E3E8EF', { metalness:0.5, roughness:0.3 }), 0, 32, 0));
        pole.add(mesh(new T.SphereGeometry(2.8, 14, 10), toy('#F5B301'), 0, 65, 0));
        const check = canvasTex(64, 40, c => { for(let i = 0; i < 8; i++) for(let j = 0; j < 5; j++){ c.fillStyle = (i + j) % 2 ? '#1E2A38' : '#FFFFFF'; c.fillRect(i * 8, j * 8, 8, 8); } });
        check.redraw();
        clothGeo = new T.PlaneGeometry(28, 18, 12, 6); clothGeo.translate(14, 0, 0);
        base = clothGeo.attributes.position.array.slice();
        pole.add(mesh(clothGeo, std('#FFFFFF', { map:check, side:T.DoubleSide, roughness:0.8 }), 0, 53, 0));
        g.add(pole);
      }
      anims.push(t => {
        if(clothGeo){
          const a = clothGeo.attributes.position;
          for(let i = 0; i < a.count; i++){ const x = base[i * 3]; a.array[i * 3 + 2] = Math.sin(x * 0.25 - t * 6) * x * 0.09; }
          a.needsUpdate = true; clothGeo.computeVertexNormals();
        }
        const open = !world.course.checkpoints || world.cp >= world.course.checkpoints.length;   // チェックポイントがのこっている間はうすく
        const k = world.cleared ? 0.15 : open ? 0.5 + Math.sin(t * 3) * 0.25 : 0.1;
        pad.material.opacity = 0.18 + k * 0.25; side.opacity = world.cleared ? 0.25 : open ? 0.55 + Math.sin(t * 3) * 0.3 : 0.12;
      });
    }

    // チェックポイント（床の輪と番号）。次に通る所は光り、通った所は水色になる
    function buildCheckpoints(g, cps){
      cps.forEach((p, i) => {
        const ringM = new T.MeshBasicMaterial({ color:'#FFFFFF', transparent:true, opacity:0.9, depthWrite:false, toneMapped:false });
        const r = new T.Mesh(new T.RingGeometry(p.r - 7, p.r - 2, 48).rotateX(-Math.PI / 2), ringM);
        r.position.set(X(p.x), 0.9, Z(p.y)); g.add(r);
        const badge = canvasTex(64, 64, (c, col) => { c.clearRect(0, 0, 64, 64); c.fillStyle = col; c.beginPath(); c.arc(32, 32, 28, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#FFFFFF'; c.font = '900 36px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), 32, 35); });
        const sprite = new T.Sprite(new T.SpriteMaterial({ map:badge, transparent:true, depthWrite:false }));
        sprite.scale.set(20, 20, 1); sprite.position.set(X(p.x), 40, Z(p.y)); g.add(sprite);
        let state = '';
        anims.push(t => {
          const s = world.cp > i ? 'done' : world.cp === i ? 'next' : 'later';
          if(s !== state){ state = s; badge.redraw(s === 'done' ? '#0FB5AA' : s === 'next' ? '#F5B301' : '#9AA8B8'); ringM.color.set(s === 'done' ? '#0FB5AA' : s === 'next' ? '#F5B301' : '#FFFFFF'); }
          sprite.position.y = 40 + (state === 'next' ? Math.sin(t * 4) * 4 : 0);
          ringM.opacity = state === 'next' ? 0.6 + Math.sin(t * 5) * 0.3 : 0.75;
        });
      });
    }

    // 道を横切るチャッピー
    function buildWalkers(g){
      walkers = world.movers.map(() => {
        const c = makeChappy(); c.g.scale.setScalar(0.42); g.add(c.g);
        return { c, say:el('bubble3d ouch'), yaw:0 };
      });
    }
    function updateWalkers(t, dt){
      world.movers.forEach((m, i) => {
        const w = walkers[i]; if(!w) return;
        w.c.g.position.set(X(m.x), 0, Z(m.y));
        const want = Math.atan2(Math.cos(m.face), Math.sin(m.face));
        w.yaw += Math.atan2(Math.sin(want - w.yaw), Math.cos(want - w.yaw)) * Math.min(1, dt * 10);
        w.c.g.rotation.y = w.yaw;
        w.c.update(t, dt, { mood:'normal', walk:m.walking, hurt:m.hurt });
        const text = m.hurt > 0.3 ? 'いたっ！' : m.phase === 'stay' ? 'あっ！' : null;
        w.say.classList.toggle('ouch', m.hurt > 0);
        place(w.say, X(m.x), 62, Z(m.y), text);
      });
    }

    // ---------- へや ----------
    // へやの かべ・窓・カーテン・外の空（3章のへやと 6章の植物の部屋で使う）。外の空の絵を返す
    function roomShell(g, curtainColor){
      const WH = 230, WT = 12;
      const backM = std('#F3EBDD', { roughness:0.92 }), leftM = std('#E4EEF6', { roughness:0.92 }), white = toy('#FFFFFF', { clearcoat:0.2 });
      const woodDark = std('#7A5230', { roughness:0.8 });
      // 奥のかべ（窓の穴あき）と左のかべ
      const wx0 = X(300), wx1 = X(480), wy0 = 80, wy1 = 192, wcx = (wx0 + wx1) / 2, wcy = (wy0 + wy1) / 2, ww = wx1 - wx0, wh = wy1 - wy0;
      const back = new T.Shape(); back.moveTo(-W / 2 - WT, 0); back.lineTo(W / 2, 0); back.lineTo(W / 2, WH); back.lineTo(-W / 2 - WT, WH); back.closePath();
      const hole = new T.Path(); hole.moveTo(wx0, wy0); hole.lineTo(wx1, wy0); hole.lineTo(wx1, wy1); hole.lineTo(wx0, wy1); hole.closePath();
      back.holes.push(hole);
      g.add(mesh(new T.ExtrudeGeometry(back, { depth:WT, bevelEnabled:false }), backM, 0, 0, -H / 2 - WT));
      const left = new T.Shape(); left.moveTo(-H / 2, 0); left.lineTo(H / 2, 0); left.lineTo(H / 2, WH); left.lineTo(-H / 2, WH); left.closePath();
      const leftGeo = new T.ExtrudeGeometry(left, { depth:WT, bevelEnabled:false }); leftGeo.rotateY(Math.PI / 2);
      g.add(mesh(leftGeo, leftM, -W / 2 - WT, 0, 0));
      g.add(mesh(new T.BoxGeometry(W + WT, 5, WT + 4), white, -WT / 2, WH + 2.5, -H / 2 - WT / 2));
      g.add(mesh(new T.BoxGeometry(WT + 4, 5, H), white, -W / 2 - WT / 2, WH + 2.5, 0));
      g.add(mesh(new T.BoxGeometry(W, 9, 3), white, 0, 4.5, -H / 2 + 1.5));
      g.add(mesh(new T.BoxGeometry(3, 9, H), white, -W / 2 + 1.5, 4.5, 0));

      // 窓・カーテン・外の空
      const fz = -H / 2 - WT / 2;
      for(const s of [-1, 1]){
        g.add(mesh(new T.BoxGeometry(ww + 12, 6, WT + 6), white, wcx, wcy + s * (wh / 2 + 3), fz));
        g.add(mesh(new T.BoxGeometry(6, wh, WT + 6), white, wcx + s * (ww / 2 + 3), wcy, fz));
      }
      g.add(mesh(new T.BoxGeometry(4, wh, 4), white, wcx, wcy, fz), mesh(new T.BoxGeometry(ww, 4, 4), white, wcx, wcy, fz));
      g.add(mesh(new T.BoxGeometry(ww + 24, 5, 20), white, wcx, wy0 - 2.5, -H / 2 + 6));
      g.add(mesh(new T.PlaneGeometry(ww, wh), new T.MeshBasicMaterial({ color:'#DDF1FF', transparent:true, opacity:0.12, depthWrite:false }), wcx, wcy, fz, false));
      const curtain = std(curtainColor, { roughness:0.85 });
      for(const s of [-1, 1]) for(let i = 0; i < 3; i++)
        g.add(mesh(roundedBox(12, 150, 8, 4), curtain, wcx + s * (ww / 2 + 14 + i * 9), 122, -H / 2 + 7 + (i % 2) * 2));
      g.add(mesh(cyl(1.6, 1.6, ww + 90, 10, 'x'), woodDark, wcx, 200, -H / 2 + 8));
      const sky = canvasTex(512, 320, drawSky);
      // 外の空はかべのすぐ後ろに置く（上からのぞいても、かべの上にはみ出さない高さ）
      g.add(mesh(new T.PlaneGeometry(300, 150), new T.MeshBasicMaterial({ map:sky, toneMapped:false }), wcx, 136, -H / 2 - 30, false));
      return sky;
    }
    // せん風機：(fx, fy) に置いて (ax, ay) の方を向く。update(回すか, dt) で動かす
    // (ax, ay) の方を向く。(bx, by) もわたすと、2つの向きのあいだを首ふりする
    function makeFan(g, fx, fy, ax, ay, bx, by){
      // せん風機（ファン）
      const fanG = group(X(fx), 0, Z(fy)), fanW = toy('#F4F6FA'), fanGray = std('#AEB8C4', { metalness:0.3, roughness:0.4 });
      fanG.add(mesh(cyl(22, 24, 5, 28), fanW, 0, 2.5, 0), mesh(cyl(3, 3, 82, 12), fanGray, 0, 45, 0));
      // 頭の前（羽根の側）はローカルの +x。y軸で yaw 回すと +x は (cos, 0, -sin) を向く
      const yawTo = (x, y) => Math.atan2(-(Z(y) - Z(fy)), X(x) - X(fx));
      const yawA = yawTo(ax, ay);
      let yawB = bx == null ? null : yawTo(bx, by);
      if(yawB != null) yawB = yawA + Math.atan2(Math.sin(yawB - yawA), Math.cos(yawB - yawA));   // 近いほうに回る
      const baseYaw = yawB == null ? yawA : (yawA + yawB) / 2, amp = yawB == null ? 0.45 : Math.abs(yawB - yawA) / 2;
      const head = group(0, 92, 0);
      head.rotation.y = baseYaw;
      head.add(mesh(roundedBox(18, 18, 18, 7), fanW, -9, 0, 0));
      const blades = group(4, 0, 0);
      for(let i = 0; i < 3; i++){ const arm = new T.Group(); arm.rotation.x = i * Math.PI * 2 / 3; arm.add(mesh(roundedBox(2, 21, 11, 4), toy('#7CC8F2', { transparent:true, opacity:0.9 }), 0, 12, 0)); blades.add(arm); }
      blades.add(mesh(cyl(4.5, 4.5, 4, 16, 'x'), fanW));
      head.add(blades);
      const cage = new T.TorusGeometry(26, 1.1, 8, 48); cage.rotateY(Math.PI / 2);
      head.add(mesh(cage, fanGray, 5, 0, 0), mesh(new T.BoxGeometry(1, 52, 1.2), fanGray, 9, 0, 0), mesh(new T.BoxGeometry(1, 1.2, 52), fanGray, 9, 0, 0));
      fanG.add(head); g.add(fanG);
      let speed = 0, swing = 0;
      return (on, dt) => {
        speed += ((on ? 24 : 0) - speed) * Math.min(1, dt * 2);
        blades.rotation.x -= speed * dt;
        if(on) swing += dt; head.rotation.y = baseYaw + Math.sin(swing * 0.9) * amp;
      };
    }
    // 温度計（左のかべ、奥からの位置 tz）。update(温度, dt) で動かす
    function makeThermo(g, tz){
      const white = toy('#FFFFFF', { clearcoat:0.2 });
      const tx = -W / 2;
      g.add(mesh(roundedBox(4, 124, 34, 5), white, tx + 2, 150, tz));
      g.add(mesh(cyl(3.4, 3.4, 92, 14), std('#FFFFFF', { transparent:true, opacity:0.5, roughness:0.1 }), tx + 6.5, 152, tz, false));
      const red = std('#E8604C', { emissive:'#E8604C', emissiveIntensity:0.25 });
      const column = mesh(cyl(2.2, 2.2, 1, 12), red, tx + 6.5, 110, tz, false);
      g.add(column, mesh(new T.SphereGeometry(6, 16, 12), red, tx + 6.5, 104, tz, false));
      const tLabel = canvasTex(128, 64, (c, v) => {
        c.clearRect(0, 0, 128, 64); c.fillStyle = '#FFFFFF'; roundRectPath(c, 4, 4, 120, 56, 14); c.fill();
        c.fillStyle = v >= 28 ? '#E8604C' : '#1E2A38'; c.font = '800 38px "BIZ UDPGothic",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(v + '℃', 64, 34);
      });
      g.add(mesh(new T.PlaneGeometry(40, 20).rotateY(Math.PI / 2), new T.MeshBasicMaterial({ map:tLabel, transparent:true }), tx + 5, 225, tz, false));
      let last = null;
      return (temp, dt) => {
        if(temp !== last){ last = temp; tLabel.redraw(temp); }
        const ch = 2 + 84 * clamp(temp / 40, 0, 1); column.scale.y += (ch - column.scale.y) * Math.min(1, dt * 6); column.position.y = 106 + column.scale.y / 2;
      };
    }
    function buildRoom(g){
      const P = world.panel, O = world.out, white = toy('#FFFFFF', { clearcoat:0.2 });
      const wood = std('#B07A4A', { roughness:0.7 }), woodDark = std('#7A5230', { roughness:0.8 });
      const sky = roomShell(g, '#5CC2BA');

      // ソファ
      const sofa = group(X(140), 0, Z(58)), sofaM = toy('#3FA7A0', { clearcoat:0.1, roughness:0.8 }), cushion = toy('#5CC2BA', { clearcoat:0.1, roughness:0.85 });
      sofa.add(mesh(roundedBox(180, 24, 74, 8), sofaM, 0, 16, 0));
      for(const s of [-1, 1]){
        sofa.add(mesh(roundedBox(84, 12, 56, 6), cushion, s * 43, 33, 8));
        sofa.add(mesh(roundedBox(16, 34, 74, 7), sofaM, s * 82, 28, 0));
        sofa.add(mesh(cyl(2.5, 2, 6, 8), woodDark, s * 80, 3, 30), mesh(cyl(2.5, 2, 6, 8), woodDark, s * 80, 3, -30));
      }
      sofa.add(mesh(roundedBox(180, 46, 18, 8), sofaM, 0, 40, -28));
      const pillow = mesh(roundedBox(30, 24, 9, 6), toy('#F7C744', { roughness:0.8 }), -52, 50, -15); pillow.rotation.z = 0.2;
      sofa.add(pillow); g.add(sofa);

      // 絵（ソファの上）
      const art = canvasTex(256, 168, c => {
        const r = c.createLinearGradient(0, 0, 0, 168); r.addColorStop(0, '#8FD0F7'); r.addColorStop(1, '#E8F6FF');
        c.fillStyle = r; c.fillRect(0, 0, 256, 168);
        c.fillStyle = '#FFD23F'; c.beginPath(); c.arc(190, 50, 22, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#6CC27A'; c.beginPath(); c.moveTo(0, 168); c.lineTo(80, 70); c.lineTo(150, 140); c.lineTo(200, 95); c.lineTo(256, 150); c.lineTo(256, 168); c.fill();
        c.fillStyle = '#4D9DE0'; c.fillRect(0, 140, 256, 28);
      });
      art.redraw();
      g.add(mesh(roundedBox(74, 52, 3, 2), wood, X(140), 160, -H / 2 + 1.5));
      g.add(mesh(new T.PlaneGeometry(64, 42), new T.MeshBasicMaterial({ map:art }), X(140), 160, -H / 2 + 3.2, false));

      // 表示パネル（📟 表示する の値が出る）と人感センサー
      g.add(mesh(roundedBox(74, 48, 4, 4), std('#1A1F27', { roughness:0.4 }), X(545), 140, -H / 2 + 2));
      const screen = canvasTex(256, 160, (c, text) => {
        c.fillStyle = '#0D1B14'; c.fillRect(0, 0, 256, 160);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = 'rgba(90,224,122,.6)'; c.font = '800 22px "BIZ UDPGothic",sans-serif'; c.fillText('表示パネル', 128, 26);
        const s = text === '' ? '--' : text; c.font = '800 64px "BIZ UDPGothic",monospace';
        const w = c.measureText(s).width; if(w > 230) c.font = `800 ${Math.floor(64 * 230 / w)}px "BIZ UDPGothic",monospace`;
        c.fillStyle = '#5AE07A'; c.shadowColor = '#5AE07A'; c.shadowBlur = 16; c.fillText(s, 128, 94); c.shadowBlur = 0;
      });
      g.add(mesh(new T.PlaneGeometry(66, 41), new T.MeshBasicMaterial({ map:screen, toneMapped:false }), X(545), 140, -H / 2 + 4.2, false));
      const pirM = toy('#FFFFFF', { emissive:'#FF4D4D', emissiveIntensity:0 });
      const dome = new T.SphereGeometry(6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.rotateX(Math.PI / 2);
      g.add(mesh(dome, pirM, X(545), 196, -H / 2, false));

      // フロアランプ（LED）
      const lamp = group(X(272), 0, Z(48));
      lamp.add(mesh(cyl(12, 14, 3, 24), woodDark, 0, 1.5, 0), mesh(cyl(1.6, 1.6, 150, 10), std('#C9A46A', { metalness:0.4, roughness:0.4 }), 0, 78, 0));
      const shadeM = std('#FFF3D6', { side:T.DoubleSide, emissive:'#FFC86B', emissiveIntensity:0, roughness:0.7 });
      lamp.add(mesh(new T.CylinderGeometry(17, 25, 26, 28, 1, true), shadeM, 0, 160, 0));
      const bulbM = std('#FFF8E8', { emissive:'#FFD27A', emissiveIntensity:0 });
      lamp.add(mesh(new T.SphereGeometry(7, 16, 12), bulbM, 0, 153, 0, false));
      const lampGlow = glowSprite('#FFC86B', 190); lampGlow.position.set(0, 155, 0); lamp.add(lampGlow);
      const lampLight = new T.PointLight('#FFCB8A', 0, 0, 2); lampLight.position.set(0, 150, 10); lamp.add(lampLight);
      g.add(lamp);

      // テーブルとめざまし時計（ブザー）
      const table = group(X(210), 0, Z(250));
      table.add(mesh(roundedBox(110, 6, 60, 3), wood, 0, 30, 0));
      for(const sx of [-1, 1]) for(const sz of [-1, 1]) table.add(mesh(cyl(2.5, 2.5, 27, 8), woodDark, sx * 48, 13.5, sz * 24));
      table.add(mesh(cyl(4.2, 3.8, 9, 14), toy('#4D9DE0'), -30, 37.5, -6));
      const clock = group(22, 33, 0);
      clock.add(mesh(cyl(9, 9, 6, 24, 'z'), toy('#E8604C'), 0, 11, 0), mesh(cyl(7, 7, 6.4, 24, 'z'), std('#FFFFFF'), 0, 11, 0.3, false));
      for(const s of [-1, 1]) clock.add(mesh(new T.SphereGeometry(4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toy('#F7C744'), s * 6, 19, 0));
      for(const s of [-1, 1]) clock.add(mesh(cyl(1, 1, 4, 6), woodDark, s * 5, 1, 0));
      table.add(clock); g.add(table);

      const fan = makeFan(g, 515, 300, 370, 250);   // チャッピーの方を向いて首ふり

      const thermo = makeThermo(g, Z(150)), tx = -W / 2;

      // 本だな・ドア・植木ばち
      const shelf = group(tx + 14, 0, Z(262));
      shelf.add(mesh(roundedBox(26, 108, 90, 3), wood, 0, 54, 0));
      for(let s = 0; s < 3; s++) for(let i = 0; i < 7; i++){
        const r = rnd(s, i), h = 22 + r * 10;
        shelf.add(mesh(new T.BoxGeometry(18, h, 9), std(['#F26B5B','#4D9DE0','#F7C744','#6CC27A','#9B7FD1','#F79A3E'][(s * 7 + i) % 6], { roughness:0.7 }), 3, 8 + s * 34 + h / 2, -36 + i * 11.5));
      }
      g.add(shelf);
      g.add(mesh(roundedBox(4, 150, 70, 3), std('#C48A55', { roughness:0.6 }), tx + 2, 75, Z(368)));
      g.add(mesh(new T.SphereGeometry(3, 12, 8), std('#E3C27A', { metalness:0.7, roughness:0.3 }), tx + 5, 75, Z(345), false));
      const plant = group(X(565), 0, Z(40));
      plant.add(mesh(cyl(13, 9, 24, 18), toy('#E07A5F'), 0, 12, 0));
      [[0, 38, 0, 15], [-8, 50, 4, 11], [8, 48, -4, 12], [0, 62, 0, 9]].forEach(([x, y, z, r]) =>
        plant.add(mesh(new T.IcosahedronGeometry(r, 0), std('#4CAF6A', { flatShading:true, roughness:0.8 }), x, y, z)));
      g.add(plant);

      // 人の役はチャッピー（人感センサーが反応すると出てきて手をふる）
      const cp = makeChappy(), person = new T.Group(), CP_SIZE = 1.3;
      cp.g.scale.setScalar(CP_SIZE); person.add(cp.g);
      person.position.set(X(370), 0, Z(250)); person.scale.setScalar(0.001); person.visible = false;
      g.add(person);
      roomChappyAt = new T.Vector3(X(370), cp.headTop * CP_SIZE + 16, Z(250));
      let wasPir = false, waveT = 0, gladT = 0, wasBad = false;

      // へやの動き：明るさ・LED・ファン・人・温度・表示・ブザー
      const NIGHT_H = new T.Color('#7F95D6'), DAY_H = new T.Color('#EAF4FF'), MOON = new T.Color('#9FB4F0'), SUNC = new T.Color('#FFF4E2');
      let lastK = -1, lastDisp = null, lampOn = 0;
      anims.push((t, dt) => {
        const k = clamp(P.light / 100, 0, 1);
        hemi.intensity = 0.25 + 1.2 * k; sun.intensity = 0.15 + 2.25 * k;
        hemi.color.lerpColors(NIGHT_H, DAY_H, k); sun.color.lerpColors(MOON, SUNC, k);
        if(Math.abs(k - lastK) > 0.009){ lastK = k; sky.redraw(k); host.style.background = roomBg(k); }
        lampOn += ((O.led ? 1 : 0) - lampOn) * Math.min(1, dt * 10);
        shadeM.emissiveIntensity = 1.3 * lampOn; bulbM.emissiveIntensity = 3 * lampOn;
        lampGlow.material.opacity = 0.9 * lampOn; lampLight.intensity = 26000 * lampOn;
        fan(O.fan, dt);
        const s = person.scale.x + ((P.pir ? 1 : 0) - person.scale.x) * Math.min(1, dt * 9);
        person.scale.setScalar(Math.max(0.001, s)); person.visible = s > 0.02; person.rotation.y = Math.sin(t * 0.7) * 0.25;
        // チャッピーの気持ち：暗いのに明かりがない・暑いのにファンが回っていないと困る。直してもらうと喜ぶ
        if(P.pir && !wasPir) waveT = 1.8;
        wasPir = P.pir; waveT -= dt; gladT -= dt;
        const dark = P.pir && P.light < 30 && !O.led, hot = P.temp >= 28 && !O.fan, bad = dark || hot;
        if(wasBad && !bad) gladT = 2.5;
        wasBad = bad;
        cp.update(t, dt, { mood: bad ? 'ouch' : gladT > 0 ? 'happy' : 'normal', wave: waveT > 0 || gladT > 0, jump: gladT > 0 });
        roomSay = !P.pir ? null : P.temp >= 35 && !O.buzzer ? 'あぶない！ 35℃ 以上だよ' : hot ? 'あつい〜 💦' : dark ? 'くらいよ…' : gladT > 0 ? 'ありがとう！' : null;
        pirM.emissiveIntensity = P.pir ? 2.2 : 0;
        thermo(P.temp, dt);
        if(O.display !== lastDisp){ lastDisp = O.display; screen.redraw(O.display); }
        clock.rotation.z = O.buzzer ? Math.sin(t * 55) * 0.16 : 0;
      });
      roomNoteAt = new T.Vector3(X(210) + 22, 64, Z(250));
    }
    // 植物の部屋（6章）：プランターのトマト・植物ライト（LED）・水やりポンプ・土の水分センサー・時計・ファン
    // 土の水分で葉がしおれたり、水たまりができたりする。時間がたつとトマトが育つ
    function buildPlant(g){
      const P = world.panel, O = world.out, sc = world.course.script;
      const sky = roomShell(g, '#9BCB6B');
      const wood = std('#B07A4A', { roughness:0.7 }), woodDark = std('#7A5230', { roughness:0.8 });
      const metal = std('#AEB8C4', { metalness:0.4, roughness:0.4 }), dark = std('#2A3240', { roughness:0.5 });

      // プランター（木の箱と土）
      const PX = 300, PY = 200, BW = 300, BD = 96, BH = 40;
      const planter = group(X(PX), 0, Z(PY));
      planter.add(mesh(roundedBox(BW, BH, BD, 4), wood, 0, BH / 2, 0));
      for(const y of [13, 27]) planter.add(mesh(new T.BoxGeometry(BW + 0.6, 1.4, BD + 0.6), woodDark, 0, y, 0, false));
      const DRY = new T.Color('#C49A6C'), WET = new T.Color('#4E3524');
      const soilM = std('#8A6440', { roughness:1 });
      planter.add(mesh(new T.BoxGeometry(BW - 10, 2, BD - 10), soilM, 0, BH + 0.4, 0));
      const puddleM = new T.MeshStandardMaterial({ color:'#7FC4F0', transparent:true, opacity:0, roughness:0.05, metalness:0.2, depthWrite:false });
      planter.add(mesh(new T.PlaneGeometry(BW - 18, BD - 18).rotateX(-Math.PI / 2), puddleM, 0, BH + 1.6, 0, false));
      g.add(planter);

      // トマトの株（3つ）。葉は根もとで回るので、しおれると下を向く
      const GREEN = new T.Color('#4CAF6A'), WILT = new T.Color('#B9A548'), RED = new T.Color('#E2432F'), UNRIPE = new T.Color('#8CC152');
      const leafM = std('#4CAF6A', { flatShading:true, roughness:0.75 }), stemM = std('#3E8E4E', { roughness:0.8 });
      const fruitM = toy('#8CC152', { roughness:0.3, clearcoat:0.8 });
      const leafGeo = new T.SphereGeometry(15, 12, 8); leafGeo.scale(1, 0.2, 0.62); leafGeo.translate(15, 0, 0);
      const plants = [-100, 0, 100].map((dx, n) => {
        const p = group(dx, BH, 0), leaves = [];
        p.add(mesh(cyl(2.4, 4, 92, 10), stemM, 0, 46, 0));
        for(let i = 0; i < 11; i++){
          const pv = group(0, 12 + i * 7.6, 0); pv.rotation.y = i * 2.4 + n; pv.add(mesh(leafGeo, leafM)); p.add(pv); leaves.push(pv);
        }
        const fruits = [[9, 58, 7], [-9, 46, -6], [6, 74, -8], [-7, 66, 8]].map(([x, y, z]) => mesh(new T.SphereGeometry(7, 18, 14), fruitM, x, y, z));
        fruits.forEach(f => p.add(f));
        planter.add(p);
        return { p, leaves, fruits };
      });

      // 植物ライト：プランターの上に わたしたバーの LED（ピンクむらさきの光）
      const lampY = 150;
      for(const s of [-1, 1]) g.add(mesh(cyl(2.2, 2.2, lampY + 8, 10), metal, X(PX) + s * (BW / 2 + 10), (lampY + 8) / 2, Z(PY)));
      g.add(mesh(cyl(2.2, 2.2, BW + 24, 10, 'x'), metal, X(PX), lampY + 8, Z(PY)));
      g.add(mesh(roundedBox(BW - 30, 7, 18, 3), dark, X(PX), lampY, Z(PY)));
      const ledM = std('#FFE3F6', { emissive:'#FF5FD2', emissiveIntensity:0 });
      g.add(mesh(new T.BoxGeometry(BW - 40, 1.2, 10), ledM, X(PX), lampY - 4, Z(PY), false));
      const growGlow = [-1, 0, 1].map(s => { const sp = glowSprite('#FF6FD8', 120); sp.position.set(X(PX) + s * 90, lampY - 8, Z(PY)); g.add(sp); return sp; });
      const growLight = new T.PointLight('#FF7BE0', 0, 0, 2); growLight.position.set(X(PX), lampY - 14, Z(PY)); g.add(growLight);
      const coneGeo = new T.CylinderGeometry(0.62, 1, 1, 4, 1, true); coneGeo.rotateY(Math.PI / 4);
      const coneM = new T.MeshBasicMaterial({ color:'#FF7BE0', transparent:true, opacity:0, blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide, toneMapped:false });
      const cone = mesh(coneGeo, coneM, X(PX), (lampY - 5 + BH) / 2, Z(PY), false); cone.scale.set(BW * 0.66, lampY - 5 - BH, BD * 0.8); g.add(cone);

      // 水やり：水のタンク → ポンプ → プランターの奥のパイプ → 株の上のノズル
      const TX = 525, TY = 205;
      const tank = group(X(TX), 0, Z(TY));
      tank.add(mesh(cyl(25, 25, 6, 24), dark, 0, 3, 0));
      tank.add(mesh(cyl(22, 22, 66, 28), std('#DDF1FF', { transparent:true, opacity:0.35, roughness:0.05 }), 0, 39, 0, false));
      tank.add(mesh(cyl(20, 20, 48, 28), std('#4DA8E8', { transparent:true, opacity:0.7, roughness:0.1 }), 0, 30, 0, false));
      tank.add(mesh(cyl(23, 23, 4, 28), toy('#4D9DE0'), 0, 74, 0));
      g.add(tank);
      const pump = group(X(TX) - 40, 0, Z(TY) + 20);
      pump.add(mesh(roundedBox(30, 22, 24, 5), toy('#F7C744'), 0, 11, 0));
      const pumpLedM = std('#DDDDDD', { emissive:'#3BE07A', emissiveIntensity:0 });
      pump.add(mesh(new T.SphereGeometry(2.6, 12, 8), pumpLedM, 8, 18, 12.5, false));
      g.add(pump);
      const pipeM = std('#E8604C', { roughness:0.5 }), backZ = Z(PY) - BD / 2 + 8, pipeY = 98, px0 = X(TX) - 40, pz0 = Z(TY) + 20;
      g.add(mesh(cyl(2.4, 2.4, pipeY - 22, 10), pipeM, px0, 22 + (pipeY - 22) / 2, pz0));
      g.add(mesh(cyl(2.4, 2.4, pz0 - backZ, 10, 'z'), pipeM, px0, pipeY, (pz0 + backZ) / 2));
      g.add(mesh(cyl(2.4, 2.4, px0 - X(PX - 120), 10, 'x'), pipeM, (px0 + X(PX - 120)) / 2, pipeY, backZ));
      const nozzles = [-100, 0, 100].map(dx => {
        const n = mesh(cyl(1.6, 3.2, 8, 10), dark, X(PX) + dx + 14, pipeY - 5, backZ + 3); n.rotation.x = 0.6; g.add(n);
        return new T.Vector3(X(PX) + dx + 14, pipeY - 9, backZ + 6);
      });
      // 水の すじ（ノズル → 土）。遠くからでも 水が出ているのが わかるように、光る水色で 流れる模様を つける
      const flowTex = canvasTex(32, 128, c => {
        c.clearRect(0, 0, 32, 128);
        for(let i = 0; i < 6; i++){ c.fillStyle = `rgba(255,255,255,${0.55 + 0.45 * (i % 2)})`; c.fillRect(4 + (i * 7) % 22, i * 21, 5, 13); }
      });
      flowTex.redraw(); flowTex.wrapS = flowTex.wrapT = T.RepeatWrapping; flowTex.repeat.set(3, 2);
      const streamM = new T.MeshBasicMaterial({ color:'#2FA8F5', map:flowTex, transparent:true, opacity:0,
                                                 depthWrite:false, side:T.DoubleSide, toneMapped:false });
      const streams = nozzles.map(n => {
        const land = new T.Vector3(n.x, BH + 2, Z(PY) + 4), dir = land.clone().sub(n), L = dir.length();
        const geo = new T.CylinderGeometry(2.2, 17, L, 18, 1, true); geo.translate(0, -L / 2, 0);
        const st = mesh(geo, streamM, n.x, n.y, n.z, false);
        st.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), dir.normalize()); st.renderOrder = 2; st.visible = false; g.add(st);
        return { n, land, st };
      });
      // しぶきの粒（大きめ・明るめ）
      const dropGeo = new T.SphereGeometry(2.4, 8, 6); dropGeo.scale(1, 1.7, 1);
      const dropM = new T.MeshBasicMaterial({ color:'#3FB6FF', toneMapped:false });
      const drops = Array.from({ length:200 }, () => { const d = mesh(dropGeo, dropM, 0, -50, 0, false); d.visible = false; g.add(d); return { d, v:new T.Vector3(), life:0 }; });
      // 土に落ちたところに広がる 波の輪
      const ringGeo = new T.RingGeometry(0.75, 1, 28).rotateX(-Math.PI / 2);
      const ripples = Array.from({ length:12 }, () => {
        const m = new T.MeshBasicMaterial({ color:'#7FD0FF', transparent:true, opacity:0, depthWrite:false, toneMapped:false });
        const r = mesh(ringGeo, m, 0, BH + 2.2, 0, false); r.visible = false; g.add(r); return { r, m, life:0 };
      });
      // 「水やり中」の札（プランターの上）
      const pumpTag = canvasTex(256, 80, c => {
        c.clearRect(0, 0, 256, 80); c.fillStyle = '#2F8FE0'; roundRectPath(c, 4, 4, 248, 72, 36); c.fill();
        c.fillStyle = '#FFFFFF'; c.font = '800 38px "BIZ UDPGothic",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🚿 水やり中', 128, 42);
      });
      pumpTag.redraw();
      const pumpSprite = new T.Sprite(new T.SpriteMaterial({ map:pumpTag, transparent:true, depthTest:false, toneMapped:false, opacity:0 }));
      pumpSprite.scale.set(84, 26, 1); pumpSprite.renderOrder = 4; g.add(pumpSprite);
      let dropT = 0, rippleT = 0, flow = 0;

      // 土の水分センサー（土にさした2本の足と、値の札）
      const probe = group(X(PX) + 128, BH, Z(PY) + 22);
      for(const s of [-1, 1]) probe.add(mesh(cyl(0.8, 0.8, 22, 6), metal, s * 3, 4, 0));
      probe.add(mesh(roundedBox(14, 10, 5, 2), toy('#3AB7C2'), 0, 18, 0));
      g.add(probe);
      const mLabel = canvasTex(160, 72, (c, v) => {
        c.clearRect(0, 0, 160, 72); c.fillStyle = v < 30 ? '#E8604C' : v > 85 ? '#2F6FB0' : '#FFFFFF'; roundRectPath(c, 4, 4, 152, 64, 18); c.fill();
        c.fillStyle = v < 30 || v > 85 ? '#FFFFFF' : '#1E2A38'; c.font = '800 34px "BIZ UDPGothic",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('💧 ' + v, 80, 38);
      });
      const mSprite = new T.Sprite(new T.SpriteMaterial({ map:mLabel, transparent:true, depthTest:false, toneMapped:false }));
      mSprite.scale.set(52, 23, 1); mSprite.position.set(X(PX) + 128, BH + 40, Z(PY) + 22); mSprite.renderOrder = 3; g.add(mSprite);

      // かべの時計（時刻センサーの値）
      const clockTex = canvasTex(256, 300, (c, h) => {
        c.clearRect(0, 0, 256, 300);
        c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(128, 124, 118, 0, Math.PI * 2); c.fill();
        c.lineWidth = 10; c.strokeStyle = '#2F6FB0'; c.stroke();
        c.fillStyle = '#1E2A38'; c.font = '800 26px "BIZ UDPGothic",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for(let i = 1; i <= 12; i++){ const a = i / 12 * Math.PI * 2; c.fillText(i, 128 + Math.sin(a) * 92, 124 - Math.cos(a) * 92); }
        const a = (h % 12) / 12 * Math.PI * 2;
        c.lineCap = 'round'; c.strokeStyle = '#1E2A38'; c.lineWidth = 12;
        c.beginPath(); c.moveTo(128, 124); c.lineTo(128 + Math.sin(a) * 58, 124 - Math.cos(a) * 58); c.stroke();
        c.strokeStyle = '#E8604C'; c.lineWidth = 6;
        c.beginPath(); c.moveTo(128, 124); c.lineTo(128, 124 - 84); c.stroke();
        c.fillStyle = '#1E2A38'; c.beginPath(); c.arc(128, 124, 10, 0, Math.PI * 2); c.fill();
        const night = h < 6 || h >= 18;
        c.fillStyle = night ? '#24305E' : '#FFD23F'; roundRectPath(c, 48, 252, 160, 44, 22); c.fill();
        c.fillStyle = night ? '#FFFFFF' : '#2A1F00'; c.font = '800 30px "BIZ UDPGothic",sans-serif';
        c.fillText((night ? '🌙 ' : '☀️ ') + h + '時', 128, 275);
      });
      g.add(mesh(new T.PlaneGeometry(64, 75), new T.MeshBasicMaterial({ map:clockTex, transparent:true, toneMapped:false }), X(130), 150, -H / 2 + 2.5, false));

      // ファンと温度計
      const fan = makeFan(g, 80, 330, 260, 200, 175, 370);   // トマトと チャッピーの あいだを 首ふり
      const thermo = makeThermo(g, Z(300));

      // 世話をするチャッピー（植物が困っていると知らせる。夜はねむる）
      const cp = makeChappy(), keeper = new T.Group(), CP_SIZE = 1.25;
      cp.g.scale.setScalar(CP_SIZE); keeper.add(cp.g);
      keeper.position.set(X(175), 0, Z(370)); keeper.rotation.y = 0.45; g.add(keeper);
      roomChappyAt = new T.Vector3(X(175), cp.headTop * CP_SIZE + 16, Z(370));
      roomNoteAt = new T.Vector3(X(130), 200, -H / 2 + 10);
      let lastK = -1, lastSky = '', lastH = null, lastM = null, ledOn = 0, gladT = 0, wasBad = false;
      const tested = key => sc.checks.some(c => key in c.expect);
      const care = { light:tested('led'), fan:tested('fan'), soil:!!sc.soil };
      const NIGHT_H = new T.Color('#7F95D6'), DAY_H = new T.Color('#EAF4FF'), MOON = new T.Color('#9FB4F0'), SUNC = new T.Color('#FFF4E2');

      anims.push((t, dt) => {
        const k = clamp(P.light / 100, 0, 1), m = Math.round(P.moisture), night = P.hour < 6 || P.hour >= 18;
        hemi.intensity = 0.25 + 1.2 * k; sun.intensity = 0.15 + 2.25 * k;
        hemi.color.lerpColors(NIGHT_H, DAY_H, k); sun.color.lerpColors(MOON, SUNC, k);
        const dayK = P.hour >= 7 && P.hour < 17 ? 1 : P.hour === 6 || P.hour === 17 ? 0.6 : 0, overcast = dayK ? 1 - P.cloud : 0;
        const skyKey = dayK + ',' + overcast;
        if(skyKey !== lastSky){ lastSky = skyKey; sky.redraw(dayK, overcast); }
        if(Math.abs(k - lastK) > 0.009){ lastK = k; host.style.background = roomBg(k); }
        // 植物ライト
        ledOn += ((O.led ? 1 : 0) - ledOn) * Math.min(1, dt * 10);
        ledM.emissiveIntensity = 3 * ledOn; growLight.intensity = 30000 * ledOn; coneM.opacity = 0.16 * ledOn;
        growGlow.forEach(sp => { sp.material.opacity = 0.8 * ledOn; });
        // 土の色・水たまり・葉のしおれ・トマトの育ち
        soilM.color.lerpColors(DRY, WET, clamp(m / 100, 0, 1));
        puddleM.opacity = 0.65 * clamp((m - 80) / 15, 0, 1);
        const wilt = clamp((32 - m) / 17, 0, 1), grow = clamp(world.simTime / sc.end, 0, 1);
        leafM.color.lerpColors(GREEN, WILT, wilt);
        fruitM.color.lerpColors(UNRIPE, RED, grow);
        plants.forEach((pl, i) => {
          pl.p.scale.setScalar(0.8 + 0.35 * grow);
          pl.p.rotation.z = wilt * 0.22 * (i - 1 || 1) + Math.sin(t * 1.3 + i) * 0.02;
          pl.leaves.forEach((lv, j) => { lv.rotation.z = 0.45 - wilt * 1.3 + Math.sin(t * 2 + i + j) * 0.03; });
          pl.fruits.forEach((f, j) => f.scale.setScalar(clamp(grow * 1.6 - j * 0.22, 0.25, 1)));
        });
        // 水やり
        pump.position.x = px0 + (O.pump ? Math.sin(t * 90) * 0.5 : 0);
        pumpLedM.emissiveIntensity = O.pump ? 2.5 : 0;
        // 水の すじは ふわっと 出て ふわっと 止まる
        flow += ((O.pump ? 1 : 0) - flow) * Math.min(1, dt * 8);
        streamM.opacity = flow * (0.62 + 0.1 * Math.sin(t * 23));
        flowTex.offset.y -= dt * 2.6;
        streams.forEach(sx => { sx.st.visible = flow > 0.02; });
        pumpSprite.material.opacity = flow;
        pumpSprite.visible = flow > 0.02;
        pumpSprite.position.set(X(PX), lampY + 34 + Math.sin(t * 4) * 3, Z(PY));
        dropT -= dt; rippleT -= dt;
        if(O.pump) while(dropT <= 0){
          dropT += 0.006;
          const d = drops.find(q => q.life <= 0);
          if(!d) break;
          const sx = streams[(Math.random() * 3) | 0], tt = 0.35 + Math.random() * 0.15;
          d.d.position.copy(sx.n);
          // 土の まわりに 落ちるように、とどく時間から 速さを決める（重力 320）
          d.v.set((sx.land.x - sx.n.x + (Math.random() - 0.5) * 40) / tt, (sx.land.y - sx.n.y) / tt + 160 * tt,
                  (sx.land.z - sx.n.z + (Math.random() - 0.5) * 30) / tt);
          d.life = 1.2; d.d.visible = true;
        }
        else dropT = 0;
        drops.forEach(q => {
          if(q.life <= 0) return;
          q.life -= dt; q.v.y -= 320 * dt; q.d.position.addScaledVector(q.v, dt);
          if(q.d.position.y < BH + 2 || q.life <= 0){
            q.life = 0; q.d.visible = false;
            if(rippleT <= 0){
              const r = ripples.find(w => w.life <= 0);
              if(r){ rippleT = 0.05; r.life = 0.7; r.r.visible = true; r.r.position.set(q.d.position.x, BH + 2.2, q.d.position.z); }
            }
          }
        });
        ripples.forEach(w => {
          if(w.life <= 0) return;
          w.life -= dt; const k = 1 - w.life / 0.7;
          w.r.scale.setScalar(3 + k * 16); w.m.opacity = 0.9 * (1 - k);
          if(w.life <= 0) w.r.visible = false;
        });
        fan(O.fan, dt); thermo(P.temp, dt);
        if(P.hour !== lastH){ lastH = P.hour; clockTex.redraw(P.hour); }
        if(m !== lastM){ lastM = m; mLabel.redraw(m); }
        // チャッピーの気持ち：植物が困っていると知らせる。直してもらうと喜ぶ
        gladT -= dt;
        // そのステージで テストしていること（光・ファン・水）にだけ 反応する。水やりのステージで「くらい」と言うと、失敗したように見えるため
        const thirsty = care.soil && m < 25, soggy = care.soil && m > 85, hot = care.fan && P.temp >= 30 && !O.fan;
        const darkDay = care.light && P.light < 30 && !O.led && (!sc.rest || !night), glare = care.light && sc.rest && night && O.led;
        const bad = thirsty || soggy || hot || darkDay || glare;
        if(wasBad && !bad) gladT = 2.5;
        wasBad = bad;
        const sleepy = night && !bad && gladT <= 0;
        cp.update(t, dt, { mood: bad ? 'ouch' : gladT > 0 ? 'happy' : sleepy ? 'blink' : 'normal', wave: gladT > 0, jump: gladT > 0 });
        roomSay = thirsty ? 'のどが かわいたよ… 💧' : soggy ? 'お水が 多すぎるよ！' : hot ? 'あつい〜 💦' : glare ? 'まぶしくて ねむれないよ…'
          : darkDay ? 'くらくて そだたないよ…' : gladT > 0 ? 'ありがとう！' : sleepy ? 'zzz…' : null;
      });
    }
    let roomNoteAt = null, roomChappyAt = null, roomSay = null;

    // k：明るさ（0＝夜〜1＝昼）、overcast：くもりぐあい（0〜1。植物の部屋で使う）
    function drawSky(c, k, overcast = 0){
      const mix = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
      const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
      const r = c.createLinearGradient(0, 0, 0, 320);
      r.addColorStop(0, rgb(mix([10, 18, 46], [86, 170, 240]))); r.addColorStop(1, rgb(mix([40, 50, 92], [214, 238, 255])));
      c.fillStyle = r; c.fillRect(0, 0, 512, 320);
      if(k < 0.5){
        c.globalAlpha = (0.5 - k) * 2; c.fillStyle = '#FFFFFF';
        for(let i = 0; i < 60; i++){ c.beginPath(); c.arc(rnd(i, 1) * 512, rnd(i, 2) * 220, 0.8 + rnd(i, 3) * 1.6, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#FFF6D8'; c.beginPath(); c.arc(330, 90, 26, 0, Math.PI * 2); c.fill();
        c.fillStyle = rgb(mix([10, 18, 46], [86, 170, 240])); c.beginPath(); c.arc(342, 82, 22, 0, Math.PI * 2); c.fill();
      }
      if(k > 0.35){
        c.globalAlpha = (k - 0.35) / 0.65;
        const s = c.createRadialGradient(170, 90, 0, 170, 90, 70); s.addColorStop(0, 'rgba(255,230,140,1)'); s.addColorStop(0.35, 'rgba(255,214,90,.9)'); s.addColorStop(1, 'rgba(255,214,90,0)');
        c.fillStyle = s; c.fillRect(80, 0, 180, 180);
        c.fillStyle = 'rgba(255,255,255,.9)';
        [[300, 70, 34], [330, 62, 26], [360, 74, 24], [120, 150, 22], [146, 142, 18]].forEach(([x, y, rr]) => { c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill(); });
      }
      if(overcast > 0){
        c.globalAlpha = overcast * 0.85; c.fillStyle = rgb(mix([40, 44, 56], [150, 158, 170])); c.fillRect(0, 0, 512, 320);
        c.globalAlpha = overcast; c.fillStyle = rgb(mix([60, 64, 78], [190, 196, 206]));
        [[60, 60, 50], [130, 50, 42], [210, 70, 56], [300, 52, 46], [390, 66, 54], [470, 50, 44], [170, 120, 40], [350, 128, 44]]
          .forEach(([x, y, rr]) => { c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill(); });
      }
      c.globalAlpha = 1;
      c.fillStyle = rgb(mix([24, 36, 62], [126, 196, 110]));
      c.beginPath(); c.moveTo(0, 320); c.lineTo(0, 250); c.quadraticCurveTo(130, 200, 260, 250); c.quadraticCurveTo(390, 210, 512, 240); c.lineTo(512, 320); c.fill();
      c.fillStyle = rgb(mix([30, 40, 70], [240, 226, 200]));
      [[60, 236, 46, 40], [380, 232, 54, 48]].forEach(([x, y, w, h]) => c.fillRect(x, y, w, h));
      c.fillStyle = k < 0.45 ? '#FFD86B' : rgb(mix([30, 40, 70], [150, 196, 230]));
      [[70, 248], [90, 248], [392, 246], [414, 246], [392, 262]].forEach(([x, y]) => c.fillRect(x, y, 10, 9));
    }
    function roomBg(k){
      const mix = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',');
      return `linear-gradient(180deg, rgb(${mix([20, 28, 52], [191, 221, 247])}) 0%, rgb(${mix([38, 48, 80], [244, 248, 252])}) 100%)`;
    }

    // ---------- カメラ ----------
    const cam = { mode:'iso', theta:-0.5, phi:0.9, radius:900, target:new T.Vector3() };
    const camPos = new T.Vector3(0, 700, 900), camLook = new T.Vector3(), wantPos = new T.Vector3(), wantLook = new T.Vector3();
    const tmpCam = new T.PerspectiveCamera();
    const view = { setCourse, setView, celebrate, resetFx, onMode:null, setSegmentLabels(on){ segLabelsOn = on; },
      zoom(f){ toFree(); cam.radius = clamp(cam.radius * f, 200, 3000); } };
    function spherical(out, theta, phi, r){
      return out.set(r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta)).add(cam.target);
    }
    function fitRadius(theta, phi){
      tmpCam.copy(camera);
      const top = world.course.cam.top, pts = [];
      for(const sx of [-1, 1]) for(const sz of [-1, 1]) for(const y of [-26, top]) pts.push(new T.Vector3(sx * (W / 2 + M), y, sz * (H / 2 + M)));
      let lo = 150, hi = 5000;
      for(let i = 0; i < 26; i++){
        const r = (lo + hi) / 2;
        spherical(tmpCam.position, theta, phi, r); tmpCam.lookAt(cam.target); tmpCam.updateMatrixWorld();
        const ok = pts.every(p => { const v = p.clone().project(tmpCam); return Math.abs(v.x) < 0.97 && Math.abs(v.y) < 0.95 && v.z < 1; });
        if(ok) hi = r; else lo = r;
      }
      return hi;
    }
    function setView(mode){
      const d = world.course.cam;
      if(world.isRoom() && (mode === 'follow' || mode === 'robot')) mode = 'iso';
      cam.mode = mode; cam.target.set(0, d.ty, 0);
      if(mode === 'iso'){ cam.theta = d.theta; cam.phi = d.phi; }
      if(mode === 'top'){ cam.theta = 0; cam.phi = 0.001; }
      if(mode === 'iso' || mode === 'top') cam.radius = fitRadius(cam.theta, cam.phi);
      if(view.onMode) view.onMode(mode);
    }
    function toFree(){
      if(cam.mode === 'free') return;
      if(cam.mode === 'follow' || cam.mode === 'robot'){
        const v = camPos.clone().sub(cam.target);
        cam.radius = v.length(); cam.phi = Math.acos(clamp(v.y / cam.radius, -1, 1)); cam.theta = Math.atan2(v.x, v.z);
      }
      cam.mode = 'free'; if(view.onMode) view.onMode('free');
    }
    const ptrs = new Map();
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY }); });
    canvas.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if(!p) return;
      if(ptrs.size === 1){
        const dx = e.clientX - p.x, dy = e.clientY - p.y; if(!dx && !dy) return;
        toFree(); cam.theta -= dx * 0.008; cam.phi = clamp(cam.phi - dy * 0.008, 0.001, 1.45);
      } else if(ptrs.size === 2){
        const o = [...ptrs.entries()].find(([id]) => id !== e.pointerId)[1];
        const d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y);
        if(d0 > 0 && d1 > 0){ toFree(); cam.radius = clamp(cam.radius * d0 / d1, 200, 3000); }
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = e => ptrs.delete(e.pointerId);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { if(opts.wheel && !opts.wheel()) return; e.preventDefault(); toFree(); cam.radius = clamp(cam.radius * Math.exp(e.deltaY * 0.0012), 200, 3000); }, { passive:false });
    canvas.addEventListener('dblclick', () => setView('iso'));

    // ふつうの視点は「角度・距離」でなめらかに動かす（真上にしても画面がかたむかない）。
    // 車を追う視点は位置でなめらかに動かし、車の向きもゆっくり追う（ライントレースのジグザグでゆれない）
    const cur = { theta:0, phi:0, radius:0 };
    let chasing = true, chaseA = 0, robotSide = 1;
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    function updateCamera(dt){
      const c = world.car, k = 1 - Math.exp(-dt * 6), kLook = 1 - Math.exp(-dt * 12);
      const chase = (cam.mode === 'follow' || cam.mode === 'robot') && !world.isRoom();
      if(chase){
        if(!chasing){ chasing = true; chaseA = c.a; }
        chaseA += wrap(c.a - chaseA) * Math.min(1, dt * 3);
        // 車のまわりのカメラは、間に建物があるときは車に近づける
        const around = (a, max, min) => { const d = clamp(world.freeDistance(c.x, c.y, a, max) - 14, min, max); return [Math.cos(a) * d, Math.sin(a) * d, d]; };
        if(cam.mode === 'follow'){
          const [bx, bz, d] = around(chaseA + Math.PI, 190, 50);
          wantPos.set(X(c.x) + bx, 130 + (190 - d) * 0.45, Z(c.y) + bz);
          wantLook.set(X(c.x) + Math.cos(chaseA) * 80, 10, Z(c.y) + Math.sin(chaseA) * 80);
        } else {                                              // ロボットを前ななめから見る（顔・LED が見える）
          const R = around(chaseA + 0.5, 215, 60), L = around(chaseA - 0.5, 215, 60);
          if(robotSide > 0 ? L[2] > R[2] + 40 : R[2] > L[2] + 40) robotSide = -robotSide;   // 空いている側に回りこむ
          const [fx, fz, d] = robotSide > 0 ? R : L;
          wantPos.set(X(c.x) + fx, 85 + (215 - d) * 0.5, Z(c.y) + fz); wantLook.set(X(c.x), 26, Z(c.y));
        }
        camPos.lerp(wantPos, k); camLook.lerp(wantLook, kLook);
      } else {
        if(chasing){
          chasing = false;
          const v = camPos.clone().sub(cam.target);
          cur.radius = v.length(); cur.phi = Math.acos(clamp(v.y / cur.radius, -1, 1)); cur.theta = Math.atan2(v.x, v.z);
        }
        cur.theta += wrap(cam.theta - cur.theta) * k; cur.phi += (cam.phi - cur.phi) * k; cur.radius += (cam.radius - cur.radius) * k;
        spherical(camPos, cur.theta, cur.phi, cur.radius); camLook.lerp(cam.target, k);
      }
      camera.position.copy(camPos); camera.lookAt(camLook);
    }

    function resize(){
      const w = host.clientWidth, h = host.clientHeight; if(!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      if(cam.mode === 'iso' || cam.mode === 'top') cam.radius = fitRadius(cam.theta, cam.phi);
    }
    new ResizeObserver(resize).observe(host);

    // ---------- 演出 ----------
    let happy = 0, blink = 2.5, faceKey = '', fanSpeed = 0, noteT = 0, ledOn = null;
    function celebrate(goal){
      const p = goal ? new T.Vector3(X(goal.x + goal.w / 2), 20, Z(goal.y + goal.h / 2))
        : world.isRoom() && roomChappyAt ? roomChappyAt.clone().setY(40) : car.root.position.clone().setY(30);
      parts.forEach(q => {
        q.p.set(p.x + (Math.random() - 0.5) * 24, p.y, p.z + (Math.random() - 0.5) * 24);
        q.v.set((Math.random() - 0.5) * 240, 170 + Math.random() * 230, (Math.random() - 0.5) * 240);
        q.r.set(Math.random() * 6, Math.random() * 6, 0); q.w.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, 0);
        q.life = 3 + Math.random() * 1.6;
      });
      confetti.visible = true; happy = 3.2;
    }
    function resetFx(){
      parts.forEach(q => { q.life = 0; }); confetti.visible = false; happy = 0;
      notes.forEach(n => { n.life = 0; n.s.visible = false; });
      trailN = 0; trailX = trailZ = 1e9; trailGeo.setDrawRange(0, 0);
      clearSegLabels();
    }
    function updConfetti(dt){
      if(!confetti.visible) return;
      let alive = 0;
      parts.forEach((q, i) => {
        if(q.life > 0){
          q.life -= dt; alive++;
          if(q.p.y > 1.2){ q.v.y -= 330 * dt; q.v.multiplyScalar(1 - Math.min(0.9, 2.6 * dt)); q.p.addScaledVector(q.v, dt); q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; }
          else { q.p.y = 1.2; q.r.x = -Math.PI / 2; }
        }
        dummy.position.copy(q.p); dummy.rotation.copy(q.r); dummy.scale.setScalar(q.life > 0 ? Math.min(1, q.life) : 0);
        dummy.updateMatrix(); confetti.setMatrixAt(i, dummy.matrix);
      });
      confetti.instanceMatrix.needsUpdate = true;
      if(!alive) confetti.visible = false;
    }
    function updNotes(dt, at){
      noteT -= dt;
      if(world.out.buzzer && at && noteT <= 0){
        noteT = 0.22; const n = notes.find(n => n.life <= 0);
        if(n){ n.life = 1.3; n.base.copy(at); n.ph = Math.random() * 6; n.s.visible = true; }
      }
      notes.forEach(n => {
        if(n.life <= 0) return;
        n.life -= dt; const a = 1.3 - n.life;
        n.s.position.set(n.base.x + Math.sin(n.ph + a * 5) * 8, n.base.y + a * 46, n.base.z);
        n.s.material.opacity = clamp(n.life * 1.6, 0, 1);
        if(n.life <= 0) n.s.visible = false;
      });
    }

    function updateCar(dt, t){
      const c = world.car, o = world.out;
      const hop = world.bump > 0 ? Math.abs(Math.sin(world.bump * 16)) * 3 * world.bump : 0;
      car.root.position.set(X(c.x), 0.4 + hop, Z(c.y)); car.root.rotation.y = -c.a;
      addTrail(X(c.x), Z(c.y));
      car.wheelL.rotation.z = -world.wheel.l / 10; car.wheelR.rotation.z = -world.wheel.r / 10;
      if(ledOn !== o.led){
        ledOn = o.led;
        car.ledMat.color.set(o.led ? '#FF8A6E' : '#E2432F'); car.ledMat.emissiveIntensity = o.led ? 2.4 : 0;
        car.glow.material.opacity = o.led ? 0.95 : 0; car.ledLight.intensity = o.led ? 3200 : 0;
      }
      fanSpeed += ((o.fan ? 30 : 0) - fanSpeed) * Math.min(1, dt * 3); car.fan.rotation.y += fanSpeed * dt;
      happy -= dt; blink -= dt; if(blink < -0.14) blink = 2 + Math.random() * 2.5;
      const mood = happy > 0 ? 'happy' : world.bump > 0 ? 'ouch' : blink < 0 ? 'blink' : 'normal';
      const look = Math.round(clamp((o.r - o.l) * 0.22, -20, 20));
      if(mood + look !== faceKey){ faceKey = mood + look; car.faceTex.redraw(mood, look); }
      car.spot.material.opacity = 0.45 + Math.sin(t * 6) * 0.12;
      const r = world.ray;
      beam.visible = !!r;
      if(r){
        const len = Math.max(1, r.len), k = Math.max(0.3, len * BEAM_TAN / 7);
        beam.position.set(X(r.x1), 12.4, Z(r.y1)); beam.rotation.y = -c.a; beam.scale.set(len, k, k);
        ring.visible = r.hit;
        ring.position.set(X(r.x2) - Math.cos(r.a) * 1.5, 12.4, Z(r.y2) - Math.sin(r.a) * 1.5);
        ring.rotation.set(0, Math.atan2(-Math.cos(r.a), -Math.sin(r.a)), 0);
        ring.scale.setScalar(1 + Math.sin(t * 8) * 0.15);
      }
    }

    // 3D の点を画面の位置にして、札を置く
    const pv = new T.Vector3();
    function place(div, x, y, z, text){
      if(text == null){ if(div.style.display !== 'none') div.style.display = 'none'; return; }
      pv.set(x, y, z).project(camera);
      if(pv.z > 1){ div.style.display = 'none'; return; }
      div.style.display = '';
      div.style.left = ((pv.x + 1) / 2 * canvas.clientWidth) + 'px'; div.style.top = ((1 - pv.y) / 2 * canvas.clientHeight) + 'px';
      if(div.textContent !== text) div.textContent = text;
    }
    function updateOverlay(s){
      if(world.isRoom()){
        [tagD, tagL].forEach(d => place(d));
        bubble.classList.toggle('ouch', roomSay !== null && roomSay !== 'ありがとう！' && roomSay !== 'zzz…');
        place(bubble, roomChappyAt.x, roomChappyAt.y, roomChappyAt.z, roomSay);
        return;
      }
      const c = world.car, o = world.out, r = world.ray;
      const chappyHurt = world.movers.some(m => m.hurt > 0);   // チャッピーにぶつかったときは、チャッピーの「いたっ！」だけ出す
      const say = world.bump > 0 && !chappyHurt ? 'ゴツン！' : o.display !== '' ? '📟 ' + o.display : null;
      place(bubble, X(c.x), 72, Z(c.y), say);
      bubble.classList.toggle('ouch', world.bump > 0);
      place(tagD, r ? X(r.x2) : 0, 30, r ? Z(r.y2) : 0, r && r.hit ? s.distance + ' cm' : null);
      // 明るさの札は、センサーの見ている床から車の右横にずらして置く（車体に重ならないように）
      const ax = c.x + Math.cos(c.a) * world.SENSOR_AHEAD - Math.sin(c.a) * 30, ay = c.y + Math.sin(c.a) * world.SENSOR_AHEAD + Math.cos(c.a) * 30;
      place(tagL, X(ax), 0, Z(ay), '明るさ ' + s.light);
    }

    let last = performance.now(), time = 0;
    function frame(now){
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; time += dt;
      const s = world.sensors();
      if(!world.isRoom()){ updateCar(dt, time); updateWalkers(time, dt); updateSegments(); }
      anims.forEach(f => f(time, dt));
      updNotes(dt, world.isRoom() ? roomNoteAt : car.root.position.clone().setY(64));
      updConfetti(dt); updateCamera(dt);
      renderer.render(scene, camera);
      updateOverlay(s);
      requestAnimationFrame(frame);
    }

    resize(); setCourse();
    spherical(camPos, cam.theta + 0.6, cam.phi * 0.7, cam.radius * 1.5); camLook.copy(cam.target);   // 最初は遠くから寄っていく
    requestAnimationFrame(frame);
    return view;
  }

  global.VPView = { createView, makeChappy };
})(window);
