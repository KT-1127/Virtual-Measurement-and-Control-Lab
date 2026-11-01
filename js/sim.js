/* 仮想空間のしくみ：ステージの中身・ロボットカーの動き・センサー・道を横切るチャッピー・クリア／失敗の判定と、
   プログラムを動かすランナー。見た目（3D）は view3d.js、ステージの一覧は stages.js が担当する
   - program = { threads:[{actions:[...]}, ...] }  ← blocks.js の buildProgram が作る形（お手本も同じ形）
   - ランナーの作りは chappy-lab-next/static/chappy-sim.js と同じ（token で止める） */
(function(global){
  const W = 600, H = 420;            // 仮想空間の大きさ（1 = 0.5cm、60 = 1マス = 30cm）
  const S = 3;                       // 床の絵の細かさ（3D の床にそのまま貼る）
  const CAR_R = 20;
  const WHEEL_BASE = 38.2, PX_PER_SPEED = 1.2;  // はやさ50で 1秒に1マス、その場回転は はやさ50・0.5秒で 90°
  const SENSOR_AHEAD = 16;           // 明るさセンサーは車の前の方の床を見る
  const RAY_MAX = 200;               // 距離センサーは 100cm まで測れる
  const BEAM = 20 * Math.PI / 180, BEAM_RAYS = 9;   // 距離センサーは ±20° に広がって、いちばん近い物を測る
  const MOVER_R = 12;                // 道を横切るチャッピーの大きさ（半径）
  const BOARD_CAM = { theta:-0.5, phi:0.9, ty:0, top:80 }, ROOM_CAM = { theta:0.42, phi:1.0, ty:60, top:240 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- 床の絵の道具（stages.js からも使う） ----------
  function roundRectPath(g, x, y, w, h, r){
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // 点を通るなめらかな輪（Catmull-Rom）
  function loopCurve(P, n){
    const out = [], N = P.length;
    for(let i = 0; i < N; i++){
      const p0 = P[(i - 1 + N) % N], p1 = P[i], p2 = P[(i + 1) % N], p3 = P[(i + 2) % N];
      for(let k = 0; k < n; k++){
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                        + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    return out;
  }
  const paint = {
    roundRect: roundRectPath, curve: loopCurve,
    mat(g, base, line){ g.fillStyle = base; g.fillRect(0, 0, W, H); if(line) paint.grid(g, line); },
    grid(g, color){
      g.strokeStyle = color; g.lineWidth = 1;
      for(let x = 60; x < W; x += 60){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for(let y = 60; y < H; y += 60){ g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    },
    box(g, x, y, w, h, color, r = 0){ g.fillStyle = color; if(r){ roundRectPath(g, x, y, w, h, r); g.fill(); } else g.fillRect(x, y, w, h); },
    // 点をつないだ太い道（角は丸い）。dash を指定するとまん中に点線
    path(g, pts, width, color, dash){
      g.lineJoin = g.lineCap = 'round';
      g.strokeStyle = color; g.lineWidth = width;
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
      if(dash){
        g.strokeStyle = dash; g.lineWidth = 3; g.setLineDash([14, 12]);
        g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.setLineDash([]);
      }
      g.lineCap = 'butt';
    },
    // 黒い線（ライントレース用）。closed なら輪にする
    line(g, pts, width, closed){
      g.strokeStyle = '#141414'; g.lineWidth = width; g.lineJoin = 'round';
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if(closed) g.closePath(); g.stroke();
    },
    // 横向きの道路の横断歩道（しまは道路と同じ向き）
    crosswalk(g, x, y, w, h){ g.fillStyle = '#FFFFFF'; for(let yy = y + 5; yy < y + h - 6; yy += 15) g.fillRect(x, yy, w, 8); },
    checker(g, x, y, w, h, cell){
      for(let i = 0; i * cell < w; i++) for(let j = 0; j * cell < h; j++){
        g.fillStyle = (i + j) % 2 ? 'rgba(30,42,56,.85)' : '#FFFFFF';
        g.fillRect(x + i * cell, y + j * cell, Math.min(cell, w - i * cell), Math.min(cell, h - j * cell));
      }
    },
    arrow(g, x, y, a, color){
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = color;
      g.beginPath(); g.moveTo(26, 0); g.lineTo(0, -16); g.lineTo(0, -6); g.lineTo(-26, -6); g.lineTo(-26, 6);
      g.lineTo(0, 6); g.lineTo(0, 16); g.closePath(); g.fill(); g.restore();
    },
    startMark(g, x, y, a){
      g.save(); g.translate(x, y); g.rotate(a);
      g.strokeStyle = 'rgba(47,111,176,.55)'; g.lineWidth = 3; g.setLineDash([6, 5]);
      g.beginPath(); g.arc(0, 0, 27, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(47,111,176,.55)';
      g.beginPath(); g.moveTo(40, 0); g.lineTo(31, -7); g.lineTo(31, 7); g.closePath(); g.fill();
      g.restore();
    },
    label(g, text, x, y, size, color){
      g.font = `800 ${size}px "BIZ UDPGothic","Yu Gothic UI",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = color; g.fillText(text, x, y);
    },
    // 小さな花（位置は seed で決まる）。明るい色だけなので明るさセンサーをじゃましない
    flowers(g, x, y, w, h, n, seed = 1){
      for(let i = 0; i < n; i++){
        const r1 = ((i + 1) * 9301 * seed + 49297) % 233280 / 233280, r2 = ((i + 7) * 7919 * seed + 12345) % 104729 / 104729;
        g.fillStyle = ['#FF8FB1','#FFD23F','#FFFFFF','#B98CFF'][i % 4];
        g.beginPath(); g.arc(x + r1 * w, y + r2 * h, 2.6, 0, Math.PI * 2); g.fill();
      }
    },
    // 植物の部屋（温室）の床：石のタイルと、まん中の小道
    plantFloor(g){
      g.fillStyle = '#C9CFC2'; g.fillRect(0, 0, W, H);
      for(let y = 0; y < H; y += 60) for(let x = 0; x < W; x += 60){
        g.fillStyle = ['#D8DDD0','#D1D7C8','#DDE1D5'][((x + y) / 60) % 3]; roundRectPath(g, x + 3, y + 3, 54, 54, 6); g.fill();
      }
      g.fillStyle = '#B9A68A'; g.fillRect(0, 300, W, 60);
      for(let i = 0; i < 80; i++){ g.fillStyle = i % 2 ? '#A8957A' : '#C7B597'; g.beginPath(); g.arc((i * 73) % W, 304 + (i * 37) % 52, 2 + i % 3, 0, Math.PI * 2); g.fill(); }
    },
    // へやのフローリングとラグ
    roomFloor(g){
      g.fillStyle = '#D9A86C'; g.fillRect(0, 0, W, H);
      for(let y = 0; y < H; y += 30){
        const off = (y / 30 % 2) * 90;
        for(let x = -off; x < W; x += 180){
          g.fillStyle = ['#D5A266','#DDAE72','#D19C60'][Math.abs(Math.round((x + y) / 30)) % 3];
          g.fillRect(x + 1, y + 1, 178, 28);
        }
      }
      g.fillStyle = '#E8604C'; g.globalAlpha = .9;
      g.beginPath(); g.ellipse(210, 250, 150, 95, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#F4E3C8'; g.beginPath(); g.ellipse(210, 250, 128, 76, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    },
  };

  // 毎回ちがう並びを作るための乱数（seed が同じなら同じ並び）
  function rng32(seed){
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // 点 (px, py) から線分 a-b までの きょり
  function segDist(px, py, a, b){
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / L, 0, 1);
    return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
  }
  // 光線と四角・円が当たるまでの長さ（当たらなければ best のまま）
  function rayRect(ox, oy, dx, dy, w, best){
    let t0 = 0, t1 = best;
    for(const [o, d, lo, hi] of [[ox, dx, w.x, w.x + w.w], [oy, dy, w.y, w.y + w.h]]){
      if(Math.abs(d) < 1e-9){ if(o < lo || o > hi) return best; continue; }
      let a = (lo - o) / d, b = (hi - o) / d; if(a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if(t0 > t1) return best;
    }
    return t0;
  }
  function rayCircle(ox, oy, dx, dy, cx, cy, r, best){
    const fx = ox - cx, fy = oy - cy, b = fx * dx + fy * dy, c = fx * fx + fy * fy - r * r, disc = b * b - c;
    if(disc < 0) return best;
    const t = -b - Math.sqrt(disc);
    if(t < 0) return c < 0 ? 0 : best;
    return Math.min(best, t);
  }

  const VERBS = { led:['ついて', '消えて'], fan:['回って', '止まって'], buzzer:['鳴って', '止まって'], pump:['動いて', '止まって'] };
  const NAMES = { led:'明かり（LED）', fan:'ファン', buzzer:'ブザー', pump:'水やりポンプ' };
  // 植物の部屋（6章）：1秒 ＝ 1時間。明るさは時刻（日の出・日の入り）と くもり（cloud）で決まる
  const daylight = h => h >= 7 && h < 17 ? 85 : h === 6 || h === 17 ? 50 : 8;

  function createWorld(){
    const floor = document.createElement('canvas'); floor.width = W * S; floor.height = H * S;
    const fctx = floor.getContext('2d', { willReadFrequently:true });
    const out = { led:false, fan:false, buzzer:false, pump:false, l:0, r:0, display:'' };
    const panel = { light:60, temp:22, distance:50, pir:false, button_red:false, button_blue:false, moisture:50, hour:12, cloud:1, dry:0 };
    const world = { W, H, CAR_R, SENSOR_AHEAD, MOVER_R, BEAM, PX_PER_SPEED, floor, out, panel,
      stage:null, course:null, seed:1, car:{ x:0, y:0, a:0 }, movers:[], ray:null, bump:0, wheel:{ l:0, r:0 },
      laps:0, cp:0, cleared:false, failed:null, active:false, simTime:0, checks:[], on:{} };
    let last = performance.now(), timer0 = 0, running = false, lapAcc = 0, lapPrev = 0, light = 0, distance = 0;
    const fire = (name, ...a) => { const f = world.on[name]; if(f) f(...a); };

    function setStage(stage, seed){ world.stage = stage; build(seed || stage.demoSeed || 1); }
    function build(seed){
      world.seed = seed;
      const c = world.stage.build(rng32(seed));
      c.walls = c.walls || [];
      c.cam = Object.assign({}, c.room ? ROOM_CAM : BOARD_CAM, c.cam);
      world.course = c;
      fctx.setTransform(S, 0, 0, S, 0, 0); c.floor(fctx);
      reset();
      fire('layout');
    }
    // ステージをはじめの状態にもどす（ランダムなステージは newSeed を渡すと並びがかわる）
    function restart(newSeed){ if(world.stage.random && newSeed != null) build(newSeed); else reset(); }
    function reset(){
      const c = world.course, s = c.start || { x:-999, y:-999, a:0 };
      world.car = { x:s.x, y:s.y, a:s.a };
      Object.assign(out, { led:false, fan:false, buzzer:false, pump:false, l:0, r:0, display:'' });
      Object.assign(world, { bump:0, laps:0, cp:0, cleared:false, failed:null, active:false, simTime:0, straight:null });
      world.movers = (c.movers || []).map(m => ({ def:m, x:m.a[0], y:m.a[1], phase:'wait', target:1, t:0,
        walking:false, hurt:0, face:Math.atan2(m.b[1] - m.a[1], m.b[0] - m.a[0]) }));
      world.checks = c.script ? c.script.checks.map(() => false) : [];
      if(c.script){
        panel.cloud = 1; panel.dry = c.script.soil ? c.script.soil.dry : 0;
        panel.moisture = c.script.soil ? c.script.soil.start : 60;
        applyScript(0);
      }
      lapAcc = 0; if(c.lap) lapPrev = Math.atan2(s.y - c.lap.cy, s.x - c.lap.cx);
      last = performance.now(); measure();
    }

    const inRect = (x, y, r, w) => { const cx = clamp(x, w.x, w.x + w.w), cy = clamp(y, w.y, w.y + w.h); return (x - cx) ** 2 + (y - cy) ** 2 < r * r; };
    const hitsObject = (x, y, r) => world.course.walls.some(w => inRect(x, y, r, w));
    const hitsWall = (x, y, r) => x < r || y < r || x > W - r || y > H - r || hitsObject(x, y, r);
    const moverAt = (x, y, r) => world.movers.find(m => (m.x - x) ** 2 + (m.y - y) ** 2 < (r + MOVER_R) ** 2);

    // 距離センサーの光線1本：ボードのふち・かべ・チャッピーのうち、いちばん近いところまでの長さ
    function castRay(ox, oy, dx, dy){
      let t = RAY_MAX;
      if(dx > 1e-9) t = Math.min(t, (W - ox) / dx); else if(dx < -1e-9) t = Math.min(t, -ox / dx);
      if(dy > 1e-9) t = Math.min(t, (H - oy) / dy); else if(dy < -1e-9) t = Math.min(t, -oy / dy);
      for(const w of world.course.walls) t = rayRect(ox, oy, dx, dy, w, t);
      for(const m of world.movers) t = rayCircle(ox, oy, dx, dy, m.x, m.y, MOVER_R, t);
      return Math.max(0, t);
    }
    function measure(){
      const car = world.car;
      if(world.course.room){ light = panel.light; distance = panel.distance; world.ray = null; return; }
      const ox = car.x + Math.cos(car.a) * CAR_R, oy = car.y + Math.sin(car.a) * CAR_R;
      let best = RAY_MAX, ba = car.a;
      for(let i = 0; i < BEAM_RAYS; i++){
        const an = car.a - BEAM + 2 * BEAM * i / (BEAM_RAYS - 1), t = castRay(ox, oy, Math.cos(an), Math.sin(an));
        if(t < best - 0.01 || (Math.abs(t - best) < 0.01 && Math.abs(an - car.a) < Math.abs(ba - car.a))){ best = t; ba = an; }
      }
      world.ray = { x1:ox, y1:oy, x2:ox + Math.cos(ba) * best, y2:oy + Math.sin(ba) * best, a:ba, len:best, hit:best < RAY_MAX };
      distance = Math.round(best / 2);
      const sx = Math.round((car.x + Math.cos(car.a) * SENSOR_AHEAD) * S), sy = Math.round((car.y + Math.sin(car.a) * SENSOR_AHEAD) * S);
      if(sx < 0 || sy < 0 || sx >= W * S || sy >= H * S){ light = 0; return; }
      const p = fctx.getImageData(sx, sy, 1, 1).data;
      light = Math.round((0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255 * 100);
    }

    // ---------- 道を横切るチャッピー ----------
    // meet の (x, y) は、車の通り道とチャッピーの通り道が交わる所。
    // 1回目は、車がどんな速さでも「車が gap だけ手前に来たとき」にちょうどそこへ出てくるよう、歩く速さを合わせる（飛び出し）。
    // そこで stay 秒立ち止まって車を見てから向こうへわたり、休んだあとは、車が離れているときだけ行ったり来たりする
    function updateMovers(h){
      const car = world.car, v = (out.l + out.r) / 2 * PX_PER_SPEED;
      for(const m of world.movers){
        const d = m.def, T = d.meet, norm = d.speed || 28;
        if(m.hurt > 0) continue;
        let spd = norm, tx, ty;
        if(m.phase === 'wait' || m.phase === 'approach'){
          const gap = T.gap || 55, dc = Math.hypot(car.x - T.x, car.y - T.y), rem = Math.hypot(T.x - m.x, T.y - m.y);
          const need = v > 3 ? rem / Math.max(0.05, (dc - gap) / v) : 0;
          if(m.phase === 'wait'){
            if(need < norm && dc > gap + 40){ m.walking = false; continue; }
            m.phase = 'approach';
          }
          spd = v > 3 ? clamp(need, 12, 75) : norm; tx = T.x; ty = T.y;
        } else if(m.phase === 'stay'){
          m.t -= h; m.walking = false; m.face = Math.atan2(car.y - m.y, car.x - m.x);
          if(m.t > 0) continue;
          m.phase = 'walk'; m.target = 1;
        } else if(m.phase === 'pause'){
          m.t -= h; m.walking = false;
          if(m.t > 0) continue;
          if(segDist(car.x, car.y, d.a, d.b) < (d.yieldDist || 110)) continue;   // 車が通りすぎるのを待つ
          m.phase = 'walk'; m.target ^= 1;
        }
        if(m.phase === 'walk') [tx, ty] = m.target ? d.b : d.a;
        const dx = tx - m.x, dy = ty - m.y, len = Math.hypot(dx, dy);
        if(len < 0.5){
          m.walking = false;
          if(m.phase === 'approach'){ m.phase = 'stay'; m.t = T.stay || 0; }
          else { m.phase = 'pause'; m.t = d.pause || 2.5; }
          continue;
        }
        m.face = Math.atan2(dy, dx);
        const step = Math.min(len, spd * h), nx = m.x + dx / len * step, ny = m.y + dy / len * step;
        if((nx - car.x) ** 2 + (ny - car.y) ** 2 < (CAR_R + MOVER_R + 2) ** 2){ m.walking = false; continue; }   // 車の前では止まる
        m.x = nx; m.y = ny; m.walking = true;
      }
    }

    // ---------- へやのテスト（明るさ・人・温度を台本どおりに変えて、出力が正しいか調べる） ----------
    // 植物の部屋は、時刻（clock 時から1秒に1時間）と、時刻・くもりで決まる明るさも動かす
    function applyScript(t){
      const sc = world.course.script;
      for(const st of sc.steps) if(st.t <= t) for(const k in st) if(k !== 't') panel[k] = st[k];
      if(sc.clock != null){
        panel.hour = Math.floor(sc.clock + t + 1e-6) % 24;
        panel.light = Math.round(daylight(panel.hour) * panel.cloud);
      }
    }
    function checkMessage(c, key){
      const sc = world.course.script;
      if(sc.plant){
        // その出力に関係する値だけを出す（ライト＝明るさ・昼か夜、ファン＝温度、ポンプ＝時刻だけ）
        const day = panel.hour >= 6 && panel.hour < 18 ? '昼間' : '夜';
        const env = key === 'led' ? `（明るさ${panel.light}＝${panel.light < 30 ? '暗い' : '明るい'}${sc.rest ? '・' + day : ''}）`
          : key === 'fan' ? `（${panel.temp}℃）` : '';
        const name = key === 'led' ? '植物ライト（LED）' : NAMES[key];
        return `${c.t}秒（${panel.hour}時）のとき${env}、${name}が${VERBS[key][c.expect[key] ? 1 : 0]}いたよ`;
      }
      const env = `${panel.light < 30 ? '暗い' : '明るい'}・${panel.pir ? '人がいる' : 'だれもいない'}・${panel.temp}℃`;
      return `${c.t}秒のとき（${env}）、${NAMES[key]}が${VERBS[key][c.expect[key] ? 1 : 0]}いたよ`;
    }
    // 土の水分：時間がたつと へり（dry／秒）、ポンプが動くと ふえる（soil.pump／秒）。少なすぎ・多すぎは失敗
    function runSoil(h){
      const so = world.course.script.soil; if(!so) return;
      panel.moisture = clamp(panel.moisture + ((out.pump ? so.pump : 0) - panel.dry) * h, 0, 100);
      const when = `${Math.floor(world.simTime)}秒（${panel.hour}時）`;
      if(panel.moisture < so.min) fail(`${when}に、土の水分が ${Math.round(panel.moisture)} まで へって、植物が しおれちゃった…`);
      else if(panel.moisture > so.max) fail(`${when}に、土の水分が ${Math.round(panel.moisture)} に！ 水の やりすぎで 根が くさっちゃうよ`);
    }
    function runScript(h){
      const sc = world.course.script, t = world.simTime;
      applyScript(t);
      runSoil(h);
      sc.checks.forEach((c, i) => {
        if(world.checks[i] || c.t > t || world.failed) return;
        const bad = Object.keys(c.expect).find(k => !!out[k] !== c.expect[k]);
        if(bad) fail(checkMessage(c, bad)); else world.checks[i] = true;
      });
      if(!world.failed && t >= sc.end && world.checks.every(Boolean)) clear();
    }

    // ---------- 車の動きと判定 ----------
    function moveCar(h){
      const car = world.car, v = (out.l + out.r) / 2 * PX_PER_SPEED, w = (out.r - out.l) / WHEEL_BASE * PX_PER_SPEED;
      world.wheel.l += out.l * PX_PER_SPEED * h; world.wheel.r += out.r * PX_PER_SPEED * h;
      if(!v && !w) return;
      car.a -= w * h;                 // 右モーターの方が速いと左に曲がる（床の絵は y が下向き）
      if(!v) return;
      const nx = car.x + Math.cos(car.a) * v * h, ny = car.y + Math.sin(car.a) * v * h;
      const m = moverAt(nx, ny, CAR_R);
      if(m){
        world.bump = 0.7;
        if(!m.hurt){
          m.hurt = 2.4; m.hitFrom = Math.atan2(m.y - car.y, m.x - car.x);
          // はね飛ばされて少し前へ（かべの中には入らない）
          const px = m.x + Math.cos(m.hitFrom) * 16, py = m.y + Math.sin(m.hitFrom) * 16;
          if(!hitsWall(px, py, MOVER_R)){ m.x = px; m.y = py; }
          m.face = m.hitFrom + Math.PI;
        }
        fail('チャッピーにぶつかっちゃった！');
        return;
      }
      if(hitsWall(nx, ny, CAR_R)){ world.bump = 0.7; if(world.course.noBump) fail('かべやブロックにぶつかっちゃった！'); return; }
      car.x = nx; car.y = ny;
    }
    // 判定はプログラムの実行中だけ（「止める」ボタンで止めたときに、たまたまゴールの中でも クリアにしない）
    function progress(){
      if(world.cleared || world.failed || !world.active) return;
      const c = world.course, car = world.car;
      if(c.lap){
        const ang = Math.atan2(car.y - c.lap.cy, car.x - c.lap.cx);
        let d = ang - lapPrev; lapPrev = ang;
        if(d > Math.PI) d -= Math.PI * 2; if(d < -Math.PI) d += Math.PI * 2;
        lapAcc += d;
        if(Math.abs(lapAcc) >= Math.PI * 2){
          lapAcc -= Math.sign(lapAcc) * Math.PI * 2; world.laps++; fire('lap', world.laps);
          if(world.laps >= (c.lap.need || 1)) return clear();
        }
      }
      if(c.checkpoints && world.cp < c.checkpoints.length){
        const p = c.checkpoints[world.cp];
        if(Math.hypot(car.x - p.x, car.y - p.y) < p.r){ world.cp++; fire('checkpoint', world.cp); }
      }
      const g = c.goal;
      if(g && (!c.checkpoints || world.cp >= c.checkpoints.length)
         && car.x >= g.x && car.y >= g.y && car.x <= g.x + g.w && car.y <= g.y + g.h
         && !(g.park && (out.l || out.r))) clear();            // ちゅう車は「止まる」までがゴール
    }
    function clear(){ if(world.cleared || world.failed) return; world.cleared = true; world.active = false; fire('clear', world.course.goal); }
    function fail(reason){ if(world.cleared || world.failed) return; world.failed = reason; world.active = false; fire('fail', reason); }

    // 時刻 now まで動かす（モーターを変える前・センサーを読む前にも呼ぶので、待つ秒数どおりに正確に動く）
    function advance(now){
      let dt = Math.min(1, (now - last) / 1000); last = now;
      if(dt <= 0) return;
      const c = world.course;
      while(dt > 0){
        const h = Math.min(dt, 1 / 120); dt -= h;
        world.bump = Math.max(0, world.bump - h);
        for(const m of world.movers) if(m.hurt > 0) m.hurt = Math.max(0, m.hurt - h);
        if(world.active){ world.simTime += h; updateMovers(h); if(c.script) runScript(h); }
        if(!c.room) moveCar(h);
        progress();
      }
      measure();
    }

    Object.assign(world, {
      setStage, build, restart, advance, isRoom:() => !!world.course.room,
      startSession(){ world.active = true; world.simTime = 0; },
      endSession(){ world.active = false; },
      // (x, y) から角度 a の向きに、建物やブロックまで何もない長さ（カメラがめり込まないように使う。ボードのふちは低いので数えない）
      freeDistance(x, y, a, max){
        let t = max; const dx = Math.cos(a), dy = Math.sin(a);
        for(const w of world.course.walls) t = rayRect(x, y, dx, dy, w, t);
        return t;
      },
      setMotor(l, r){
        advance(performance.now());
        // この命令の途中でクリア／失敗したら、もう動かさない（止める命令が先に入っても、あとから「進む」で上書きされないように）
        if((world.failed || world.cleared) && (l || r)) return;
        // まっすぐ進みはじめた場所と速さを覚える（3D の「○秒・○マス」の札に使う）
        if(l === r && l !== 0){ if(!(out.l === l && out.r === r)) world.straight = { x:world.car.x, y:world.car.y, v:Math.abs(l) * PX_PER_SPEED }; }
        else world.straight = null;
        out.l = l; out.r = r; progress();
      },
      setRunning(on){ running = on; if(on) timer0 = performance.now(); },
      // いまのセンサーの値（ランナーとグラフが読む）
      sensors(){
        advance(performance.now());
        return { light, distance, temp:panel.temp, pir:panel.pir, button_red:panel.button_red, button_blue:panel.button_blue,
                 moisture:Math.round(panel.moisture), hour:panel.hour,
                 timer: running ? Math.round((performance.now() - timer0) / 100) / 10 : 0 };
      },
    });
    return world;
  }

  // ---------- ランナー ----------
  function evalExpr(e, s){
    if(!e) return 0;
    switch(e.k){
      case 'sensor': return s[e.name];
      case 'num': return e.v;
      case 'not': return !evalExpr(e.a, s);
      case 'and': return !!evalExpr(e.a, s) && !!evalExpr(e.b, s);
      case 'or':  return !!evalExpr(e.a, s) || !!evalExpr(e.b, s);
      case 'cmp': {
        const a = Number(evalExpr(e.a, s)), b = Number(evalExpr(e.b, s));
        switch(e.op){ case '<': return a < b; case '<=': return a <= b; case '>': return a > b;
                      case '>=': return a >= b; case '==': return a === b; case '!=': return a !== b; }
      }
    }
    return 0;
  }

  // opts: { world, highlight:(id)=>void, onBuzzer:(on)=>void, onEnd:()=>void }
  function createRunner(opts){
    const w = opts.world, out = w.out;
    let token = 0, running = false;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function wait(ms, my){
      const end = performance.now() + ms;
      while(performance.now() < end){ if(token !== my) return; await sleep(Math.min(30, Math.max(1, end - performance.now()))); }
    }
    const cond = e => !!evalExpr(e, w.sensors());

    async function list(arr, my){ for(const a of (arr || [])){ if(token !== my) return; await one(a, my); } }
    // くりかえしの1回が一瞬で終わったときだけ少し休む（画面が固まらないように。待つの秒数はずらさない）
    async function loop(actions, my, more){
      while(token === my && more()){
        const t0 = performance.now();
        await list(actions, my);
        if(performance.now() - t0 < 8) await wait(16, my);
      }
    }
    async function one(a, my){
      if(a.id && opts.highlight) opts.highlight(a.id);
      switch(a.type){
        case 'motor':  w.setMotor(a.l, a.r); break;
        case 'turn': {                     // はやさ50・0.5秒で90° なので、角度から回る時間を決めて、回ったら止まる
          const s = a.dir === 'left' ? -50 : 50;
          w.setMotor(s, -s); await wait(a.deg / 90 * 500, my);
          if(token === my) w.setMotor(0, 0);
          break;
        }
        case 'led':    out.led = a.value; break;
        case 'fan':    out.fan = a.value; break;
        case 'buzzer': out.buzzer = a.value; if(opts.onBuzzer) opts.onBuzzer(a.value); break;
        case 'pump':   out.pump = a.value; break;
        case 'show': {
          const v = evalExpr(a.expr, w.sensors());
          out.display = typeof v === 'boolean' ? (v ? 'はい' : 'いいえ') : String(v);
          break;
        }
        case 'wait':   await wait(Math.max(20, a.value * 1000), my); break;
        case 'forever': await loop(a.actions, my, () => true); break;
        case 'repeat': { let i = 0; await loop(a.actions, my, () => i++ < a.times); break; }
        case 'until':  await loop(a.actions, my, () => !cond(a.condition)); break;
        case 'if': {
          const hit = a.branches.find(b => cond(b.condition));
          await list(hit ? hit.actions : a.else, my); break;
        }
      }
    }

    async function start(program){
      stop();
      const my = ++token; running = true; w.setRunning(true);
      try { await Promise.all(program.threads.map(t => list(t.actions, my))); }
      catch(e){ console.error(e); }
      if(token === my) finish(true);
    }
    function finish(natural){
      running = false; w.setRunning(false);
      w.setMotor(0, 0); out.buzzer = false; out.pump = false;
      if(opts.onBuzzer) opts.onBuzzer(false);
      if(opts.highlight) opts.highlight(null);
      if(opts.onEnd) opts.onEnd(natural);
    }
    function stop(){ if(running){ token++; finish(false); } }
    return { start, stop, isRunning:() => running };
  }

  global.VPSim = { createWorld, createRunner, paint, W, H, CAR_R };
})(window);
