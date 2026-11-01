/* ステージの一覧（6章・23ステージ。あとのステージほどむずかしい）
   - talk    : はじめにチャッピーが話すこと（説明のやりとり）
   - build   : コースを作る。rng はステージが random のとき、実行するたびにちがう並びを作るための乱数
   - solution: お手本の動き。画面にはプログラムを出さず、3D の動きだけを見せる
   1マス = 60（= 30cm）、はやさ50で 1秒に1マス、その場回転は はやさ50・0.5秒で 90° */
(function(global){
  const P = VPSim.paint;

  // ---------- お手本のプログラムを書く道具（ブロックと同じ形） ----------
  const M = (l, r) => ({ type:'motor', l, r });
  const FWD = (s = 50) => M(s, s), STOP = M(0, 0), LEFT = (s = 50) => M(-s, s), RIGHT = (s = 50) => M(s, -s);
  const WAIT = v => ({ type:'wait', value:v });
  const TURN = (dir, deg = 90) => ({ type:'turn', dir, deg });   // 「左／右に90°曲がる」ブロック
  const LED = on => ({ type:'led', value:on }), FAN = on => ({ type:'fan', value:on }), BUZ = on => ({ type:'buzzer', value:on });
  const PUMP = on => ({ type:'pump', value:on });
  const FOREVER = (...a) => ({ type:'forever', actions:a });
  const REPEAT = (n, ...a) => ({ type:'repeat', times:n, actions:a });
  const UNTIL = (c, ...a) => ({ type:'until', condition:c, actions:a });
  const IF = (c, then, els = []) => ({ type:'if', branches:[{ condition:c, actions:then }], else:els });
  const S = name => ({ k:'sensor', name }), N = v => ({ k:'num', v });
  const LT = (name, v) => ({ k:'cmp', op:'<', a:S(name), b:N(v) }), GE = (name, v) => ({ k:'cmp', op:'>=', a:S(name), b:N(v) });
  const EQ = (name, v) => ({ k:'cmp', op:'==', a:S(name), b:N(v) });
  const AND = (a, b) => ({ k:'and', a, b }), OR = (a, b) => ({ k:'or', a, b });
  const prog = (...actions) => ({ threads:[{ actions }] });

  // ---------- コースに置く物 ----------
  const COLORS = ['#F26B5B','#F7C744','#4D9DE0','#6CC27A','#F79A3E','#9B7FD1'];
  const tree = (x, y) => ({ kind:'tree', x:x - 12, y:y - 12, w:24, h:24 });
  const cheer = (x, y, face = 0) => ({ kind:'chappy', x:x - 12, y:y - 12, w:24, h:24, face });   // 応援するチャッピー
  const block = (x, y, w, h, height, color) => ({ kind:'block', x, y, w, h, height, color });
  const house = (x, y, w, h, color, roof) => ({ kind:'house', x, y, w, h, color, roof });
  const MAT = g => P.mat(g, '#EAF2FB', '#D5E3F2');
  const LANE = '#DCE8F6';

  // ブロックの島（4章のめいろ）：60×60 のおもちゃブロックをすきまなく並べる
  const ISLAND = [
    [0,120,60,40],[60,120,120,30],[180,120,60,62],[240,120,120,36],[360,120,60,48],[420,120,60,40],
    [0,180,120,50],[120,180,60,84],[180,180,120,34],[300,180,60,72],[360,180,120,44],
    [0,240,60,36],[60,240,120,46],[180,240,60,40],[240,240,60,58],[300,240,120,38],[420,240,60,52],
  ].map(([x, y, w, ht], i) => block(x, y, w, 60, ht, COLORS[(i * 5 + 2) % 6]));
  function mazeFloor(g){
    P.mat(g, '#EAF2FB', '#D5E3F2');
    P.checker(g, 10, 12, 90, 90, 15);
    [[300, 360, 0], [540, 210, -Math.PI / 2], [300, 60, Math.PI]].forEach(([x, y, a]) => P.arrow(g, x, y, a, 'rgba(47,111,176,.3)'));
    P.startMark(g, 60, 360, 0);
  }

  // まち（1-3）
  function townFloor(g){
    P.mat(g, '#BFE3A5');
    [[0,0,140,290],[220,0,200,100],[220,100,220,190],[520,100,80,190],[0,370,600,50]]
      .forEach(([x, y, w, h]) => P.box(g, x + 4, y + 4, w - 8, h - 8, '#E6E9EE', 10));
    P.box(g, 236, 236, 190, 46, '#BFE3A5', 10);
    g.fillStyle = '#5B6574'; g.fillRect(0, 290, 600, 80); g.fillRect(140, 0, 80, 290); g.fillRect(440, 100, 80, 190);
    g.fillStyle = '#6B7686'; g.fillRect(420, 0, 180, 100);
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 3; g.setLineDash([16, 12]);
    g.beginPath(); g.moveTo(0, 330); g.lineTo(600, 330); g.moveTo(180, 0); g.lineTo(180, 290); g.moveTo(480, 290); g.lineTo(480, 100); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#FFFFFF';
    for(let i = 0; i < 6; i++){ g.fillRect(230, 296 + i * 12, 34, 7); g.fillRect(398, 296 + i * 12, 34, 7); }
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 3;
    [450, 510, 570].forEach(x => { g.beginPath(); g.moveTo(x, 8); g.lineTo(x, 92); g.stroke(); });
    g.fillStyle = 'rgba(255,210,63,.35)'; g.fillRect(452, 10, 56, 80);
    g.strokeStyle = '#FFD23F'; g.lineWidth = 4; g.strokeRect(452, 10, 56, 80);
    P.label(g, 'P', 480, 50, 34, '#FFFFFF');
    P.startMark(g, 60, 330, 0);
  }

  // だ円のライン（4-2・5-4）
  const ELLIPSE = Array.from({ length:96 }, (_, i) => { const t = i / 96 * Math.PI * 2; return [300 + 220 * Math.cos(t), 210 + 140 * Math.sin(t)]; });
  function ellipseFloor(g){
    P.mat(g, '#F6F0E1', '#ECE3CC');
    g.fillStyle = '#CDEBB4'; g.beginPath(); g.ellipse(300, 210, 178, 104, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#A9DCF5'; g.beginPath(); g.ellipse(395, 245, 32, 17, -0.2, 0, Math.PI * 2); g.fill();
    P.flowers(g, 150, 140, 300, 140, 22, 3);
    P.line(g, ELLIPSE, 20, true);
    P.startMark(g, 300, 392, 0); P.label(g, 'スタート', 300, 410, 11, 'rgba(47,111,176,.75)');
  }
  const ellipseWalls = () => [house(262, 182, 76, 54, '#F6C28B', '#D9644A'), tree(200, 200), tree(400, 175),
                              tree(40, 40), tree(560, 40), tree(40, 380), tree(560, 380)];

  // くねくねライン（5-3）
  const LINE_PTS = [[300,365],[430,360],[505,328],[535,262],[525,175],[478,108],[405,78],[352,100],[300,145],
                    [248,100],[195,78],[122,108],[75,175],[65,262],[95,328],[170,360]];
  function wavyFloor(g){
    P.mat(g, '#F6F0E1', '#ECE3CC');
    // 線の内側の芝生と池（どれも明るい色なので、明るさセンサーは黒い線とまちがえない）
    const inner = P.curve(LINE_PTS.map(([x, y]) => [300 + (x - 300) * 0.8, 240 + (y - 240) * 0.74]), 24);
    g.fillStyle = '#CDEBB4'; g.beginPath(); inner.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
    g.fillStyle = '#A9DCF5'; g.beginPath(); g.ellipse(410, 300, 34, 18, -0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#E9C98F'; g.beginPath(); g.moveTo(300, 278); g.quadraticCurveTo(250, 300, 230, 330); g.lineTo(244, 333); g.quadraticCurveTo(262, 305, 308, 284); g.fill();
    P.flowers(g, 140, 175, 320, 120, 26, 1);
    P.line(g, P.curve(LINE_PTS, 24), 20, true);
    P.startMark(g, 300, 395, 0); P.label(g, 'スタート', 300, 410, 11, 'rgba(47,111,176,.75)');
  }

  // へや（3章）：script = 明るさ・人・温度を変える台本と、そのときの正しい出力
  const room = script => () => ({ room:true, floor:P.roomFloor, walls:[], script });
  // 植物の部屋（6章）：clock 時から 1秒で1時間すすむ。明るさは時刻と くもり（cloud）で決まる。
  // soil = 土の水分（start から dry／秒 でへり、ポンプで pump／秒 ふえる。min より少ない・max より多いと失敗）
  const plant = script => () => ({ room:true, plant:true, floor:P.plantFloor, walls:[], script:Object.assign({ plant:true, checks:[] }, script) });
  const DAYTIME = AND(GE('hour', 6), LT('hour', 18));

  const CHAPTERS = [
    { n:1, title:'じゅんばんに動かそう', note:'順次' },
    { n:2, title:'くりかえしで動かそう', note:'反復' },
    { n:3, title:'へやをかしこくしよう', note:'センサーで判断（分岐）' },
    { n:4, title:'きょりセンサーで止まろう', note:'計測と制御' },
    { n:5, title:'明るさセンサーで走ろう', note:'ライントレース' },
    { n:6, title:'植物をそだてよう', note:'時刻・土の水分センサー' },
  ];

  const STAGES = [
    // ===== 1章 順次 =====
    { id:'1-1', ch:1, stars:1, title:'まっすぐ進もう',
      mission:'まっすぐ進んで、光っているゴールの中で止まろう',
      talk:['こんにちは！ ぼくはチャッピー。きょうは ぼくが ロボットカーに へんしんするよ！',
            'さいしょは、まっすぐ進んで、光っている ゴールの中で 止まってみよう。',
            'ゴールの中で「止まる」ところまで できたら クリア！ まずは お手本を 見てね。'],
      hint:'「前にすすむ」「待つ」「止まる」を じゅんばんに ならべよう。はやさ50だと 1秒で 1マス（30cm）進むよ。',
      build:() => ({
        floor(g){ MAT(g); P.box(g, 40, 168, 520, 84, LANE, 14); P.arrow(g, 230, 210, 0, 'rgba(47,111,176,.28)'); P.startMark(g, 90, 210, 0); },
        start:{ x:90, y:210, a:0 }, goal:{ x:350, y:172, w:80, h:76, park:true, flag:[442, 166] },
        walls:[tree(40, 40), tree(560, 40), tree(40, 380), tree(560, 380), tree(300, 70), cheer(470, 330, -0.3)],
      }),
      solution:prog(FWD(), WAIT(5), STOP) },

    { id:'1-2', ch:1, stars:1, title:'曲がってみよう',
      mission:'角を左に曲がって、ゴールの中で止まろう',
      talk:['つぎは 曲がる練習だよ。',
            '曲がるときは「左に 90° 曲がる」ブロックを 使うと かんたんだよ。',
            '進む → 曲がる → 進む → 止まる。じゅんばんが だいじだよ！'],
      hint:'まず 何マス 進んだら 曲がるか 数えよう。曲がったあとも、ゴールまで 何マスか 数えてね。',
      build:() => ({
        floor(g){
          MAT(g); P.box(g, 50, 290, 322, 82, LANE, 14); P.box(g, 290, 108, 82, 264, LANE, 14);
          P.arrow(g, 200, 330, 0, 'rgba(47,111,176,.28)'); P.arrow(g, 330, 240, -Math.PI / 2, 'rgba(47,111,176,.28)'); P.startMark(g, 90, 330, 0);
        },
        start:{ x:90, y:330, a:0 }, goal:{ x:290, y:110, w:80, h:80, park:true, flag:[382, 108] },
        walls:[block(412, 292, 60, 78, 42, COLORS[0]), block(472, 292, 60, 78, 58, COLORS[2]),
               tree(60, 60), tree(540, 60), tree(160, 190), tree(520, 200), cheer(450, 150, -0.3)],
      }),
      solution:prog(FWD(), WAIT(4), TURN('left'), FWD(), WAIT(3), STOP) },

    { id:'1-3', ch:1, stars:2, title:'ちゅう車場に止めよう',
      mission:'道路を走って、光っているちゅう車場（P）に止めよう',
      talk:['ここは まち！ 道路を 走って、ちゅう車場（P）まで 行こう。',
            '道路から はみ出すと、建物に ぶつかっちゃうよ。',
            'どこで 曲がるか、マスを 数えて 考えてみよう。'],
      hint:'道路の 白い点線の 長さを 目安に、マスを 数えよう。1マス = はやさ50で 1秒。',
      build:() => ({
        floor:townFloor, cam:{ theta:-0.55, phi:0.92, ty:10, top:165 },
        start:{ x:60, y:330, a:0 }, goal:{ x:450, y:15, w:60, h:80, park:true, flag:[505, 10] },
        walls:[
          house(20, 20, 92, 66, '#F6C28B', '#D9644A'), house(20, 132, 92, 66, '#A7D3F2', '#3E7CB1'),
          { kind:'building', x:240, y:18, w:90, h:74, height:150, color:'#DCE7F2', accent:'#4D7FB8' },
          { kind:'building', x:346, y:18, w:66, h:74, height:86, color:'#F3E2C7', accent:'#D9644A' },
          { kind:'building', x:236, y:122, w:190, h:96, height:62, color:'#F7F3EA', accent:'#6CC27A' },
          { kind:'building', x:530, y:116, w:60, h:160, height:96, color:'#C9E6C1', accent:'#3F8F5A' },
          { kind:'car', x:522, y:24, w:36, h:58, color:'#E8604C' },
          { kind:'chappy', x:574, y:40, w:22, h:24, face:-0.5 },
          { kind:'signal', x:224, y:274, w:10, h:10 }, { kind:'signal', x:426, y:274, w:10, h:10 },
          tree(70, 240), tree(122, 110), tree(258, 258), tree(300, 258), tree(342, 258), tree(400, 258),
          tree(40, 396), tree(160, 396), tree(280, 396), tree(400, 396), tree(520, 396)],
      }),
      solution:prog(FWD(), WAIT(7), TURN('left'), FWD(), WAIT(4.5), STOP) },

    { id:'1-4', ch:1, stars:2, title:'くねくね道',
      mission:'くねくね道を通って、ゴールの中で止まろう',
      talk:['くねくね道に ちょうせん！ 右にも 左にも 曲がるよ。',
            '「左に 90°」と「右に 90°」を まちがえないようにね。',
            '長い プログラムに なるけど、一つずつ たしかめれば だいじょうぶ！'],
      hint:'曲がり角は 3つ。それぞれ 右か左か、その前に 何マス 進むかを 書き出してみよう。',
      build:() => ({
        floor(g){
          P.mat(g, '#C5E6AE'); P.flowers(g, 20, 20, 560, 380, 40, 7);
          P.path(g, [[20, 360], [300, 360], [300, 180], [480, 180], [480, 16]], 80, '#EDE3CC', '#FFFFFF');
          P.startMark(g, 60, 360, 0);
        },
        start:{ x:60, y:360, a:0 }, goal:{ x:440, y:22, w:80, h:76, park:true, flag:[528, 24] },
        walls:[house(60, 40, 96, 70, '#F6C28B', '#D9644A'), house(360, 240, 80, 68, '#A7D3F2', '#3E7CB1'),
               tree(150, 270), tree(215, 250), tree(550, 260), tree(380, 90), tree(560, 130), tree(40, 250), tree(250, 60),
               cheer(565, 45, -0.4)],
      }),
      solution:prog(FWD(), WAIT(4), TURN('left'), FWD(), WAIT(3), TURN('right'), FWD(), WAIT(3), TURN('left'), FWD(), WAIT(2), STOP) },

    // ===== 2章 反復 =====
    { id:'2-1', ch:2, stars:2, title:'池のまわりを1周',
      mission:'①②③を じゅんばんに通って、スタートにもどって止まろう',
      talk:['池のまわりを ぐるっと 1周しよう！ ①②③を じゅんばんに 通って、スタートに もどってきてね。',
            '「進む」と「曲がる」を 4回 ならべても できるけど…',
            '「くりかえし」を 使うと、同じ動きを まとめて 書けるよ！'],
      hint:'1辺の 動きは どれも 同じ。「くりかえし」の 回数と、中に入れる 動きを 考えよう。',
      build:() => ({
        floor(g){
          P.mat(g, '#F1ECE2', '#E4DCCB');
          g.strokeStyle = 'rgba(47,111,176,.28)'; g.lineWidth = 3; g.setLineDash([10, 10]); g.strokeRect(150, 90, 240, 240); g.setLineDash([]);
          P.flowers(g, 430, 60, 150, 300, 16, 5); P.startMark(g, 150, 330, 0);
        },
        start:{ x:150, y:330, a:0 }, goal:{ x:110, y:290, w:80, h:80, park:true },
        checkpoints:[{ x:390, y:330, r:36 }, { x:390, y:90, r:36 }, { x:150, y:90, r:36 }],
        walls:[{ kind:'pond', x:215, y:150, w:110, h:120 }, tree(40, 40), tree(560, 40), tree(40, 380), tree(560, 380),
               tree(500, 210), cheer(480, 395, -0.3)],
      }),
      solution:prog(REPEAT(4, FWD(), WAIT(4), TURN('left')), STOP) },

    { id:'2-2', ch:2, stars:3, title:'階段をのぼろう',
      mission:'階段のような道をのぼって、ゴールの中で止まろう',
      talk:['こんどは 階段みたいな 道。のぼって ゴールまで 行こう！',
            'よく見ると、同じ形が くりかえし 出てくるね。',
            'どの動きが くりかえされて いるかな？ 見つけられたら かんたんだよ。'],
      hint:'階段の「1段分」の 動きを 考えて、それを 何回 くりかえすか 数えよう。',
      build:() => ({
        floor(g){
          MAT(g);
          P.path(g, [[30, 390], [180, 390], [180, 330], [300, 330], [300, 270], [420, 270], [420, 210], [540, 210], [540, 150]], 76, LANE);
          P.startMark(g, 60, 390, 0);
        },
        cam:{ top:110 },
        start:{ x:60, y:390, a:0 }, goal:{ x:500, y:110, w:80, h:80, park:true },
        walls:[block(40, 220, 100, 130, 40, COLORS[3]), block(140, 160, 120, 130, 60, COLORS[2]),
               block(260, 100, 120, 130, 80, COLORS[5]), block(380, 40, 120, 130, 100, COLORS[0]),
               block(220, 370, 80, 50, 30, COLORS[1]), block(340, 310, 80, 110, 50, COLORS[4]), block(460, 250, 80, 170, 70, COLORS[3]),
               cheer(575, 60, -0.5)],
      }),
      solution:prog(REPEAT(4, FWD(), WAIT(2), TURN('left'), FWD(), WAIT(1), TURN('right')), STOP) },

    // ===== 3章 へや（分岐） =====
    { id:'3-1', ch:3, stars:2, title:'自動ライト',
      mission:'暗くなったら明かりをつけ、明るくなったら消そう（実行すると明るさが自動でかわるよ）',
      talk:['ここは ぼくの へや。だんだん 暗く なってきたよ…',
            '暗くなったら 明かりを つけて、明るくなったら 消す。そんな かしこい ライトを 作りたいな！',
            '「明るさ」センサーの 値を「もし」で くらべてみよう。実行すると、明るさが 自動で かわって テストするよ。'],
      hint:'「ずっと」の中に「もし〜なら／そうでなければ」を 入れて、明るさの 値で LED を 切りかえよう。',
      build:room({ end:13.5,
        steps:[{ t:0, light:80, pir:true, temp:22 }, { t:3, light:15 }, { t:7, light:85 }, { t:10, light:10 }],
        checks:[{ t:2.5, expect:{ led:false } }, { t:6, expect:{ led:true } }, { t:9.5, expect:{ led:false } }, { t:13, expect:{ led:true } }] }),
      solution:prog(FOREVER(IF(LT('light', 30), [LED(true)], [LED(false)]))) },

    { id:'3-2', ch:3, stars:2, title:'自動ファン',
      mission:'28℃以上になったらファンを回し、すずしくなったら止めよう（自動テスト）',
      talk:['あつい日は ファンを 回したいな。',
            '温度が 28℃ 以上に なったら ファンを 回して、すずしくなったら 止めよう。',
            '温度センサーの 値を くらべてみよう！'],
      hint:'「〜以上」は「≧」で くらべるよ。',
      build:room({ end:13.5,
        steps:[{ t:0, light:80, pir:true, temp:22 }, { t:3, temp:31 }, { t:7, temp:24 }, { t:10, temp:33 }],
        checks:[{ t:2.5, expect:{ fan:false } }, { t:6, expect:{ fan:true } }, { t:9.5, expect:{ fan:false } }, { t:13, expect:{ fan:true } }] }),
      solution:prog(FOREVER(IF(GE('temp', 28), [FAN(true)], [FAN(false)]))) },

    { id:'3-3', ch:3, stars:3, title:'人がいるときだけ',
      mission:'暗くて人がいるときだけ明かりをつけよう（自動テスト）',
      talk:['明かりが つけっぱなしだと もったいないね。',
            'だれも いないときは、暗くても 明かりを 消したいな。',
            '「暗い」と「人がいる」の 両方が そろったときだけ つけよう。「かつ」を 使うよ！'],
      hint:'「かつ」ブロックの 左右に、明るさの くらべと「人がいる」を 入れよう。',
      build:room({ end:14.5,
        steps:[{ t:0, light:80, pir:true, temp:22 }, { t:3, light:15 }, { t:6, pir:false }, { t:9, light:80 }, { t:11, light:12, pir:true }],
        checks:[{ t:2.5, expect:{ led:false } }, { t:5.5, expect:{ led:true } }, { t:8.5, expect:{ led:false } },
                { t:10.5, expect:{ led:false } }, { t:14, expect:{ led:true } }] }),
      solution:prog(FOREVER(IF(AND(LT('light', 30), S('pir')), [LED(true)], [LED(false)]))) },

    { id:'3-4', ch:3, stars:3, title:'スマートルーム',
      mission:'明かり・ファン・ブザー（35℃以上で鳴らす）を全部じどうで動かそう（自動テスト）',
      talk:['へやを まるごと かしこくしよう！',
            '暗くて 人がいたら 明かり、28℃ 以上で ファン。35℃ 以上は あぶないから ブザーで 知らせてね。',
            '「もし」を 3つ ならべると できるかも！'],
      hint:'明かり・ファン・ブザーは それぞれ べつの「もし」で 決められるよ。3つとも「ずっと」の中に 入れよう。',
      build:room({ end:15,
        steps:[{ t:0, light:80, pir:true, temp:24 }, { t:3, light:15 }, { t:6, temp:31 }, { t:9, pir:false, temp:36 }, { t:12, light:80, temp:25 }],
        checks:[{ t:2.5, expect:{ led:false, fan:false, buzzer:false } }, { t:5.5, expect:{ led:true, fan:false, buzzer:false } },
                { t:8.5, expect:{ led:true, fan:true, buzzer:false } }, { t:11.5, expect:{ led:false, fan:true, buzzer:true } },
                { t:14.5, expect:{ led:false, fan:false, buzzer:false } }] }),
      solution:prog(FOREVER(
        IF(AND(LT('light', 30), S('pir')), [LED(true)], [LED(false)]),
        IF(GE('temp', 28), [FAN(true)], [FAN(false)]),
        IF(GE('temp', 35), [BUZ(true)], [BUZ(false)]))) },

    // ===== 4章 きょりセンサー =====
    { id:'4-1', ch:4, stars:3, title:'かべの手前で止まろう', random:true, demoSeed:3,
      mission:'かべにぶつからずに、かべの手前（光っているところ）で止まろう 🎲かべの場所は毎回かわる',
      talk:['かべの 手前で ピタッと 止まろう！',
            'でも、かべの 場所は 実行するたびに かわるよ。時間で 止めるのは むずかしいね。',
            '距離センサーで かべまでの きょりを 測って、近くなったら 止まろう。かべに ぶつかったら アウトだよ！'],
      hint:'「〜になるまで くりかえす」を 使うと、きょりが 小さくなるまで 進みつづけられるよ。',
      build(rng){
        const X = 330 + Math.floor(rng() * 8) * 25;
        return {
          floor(g){ MAT(g); P.box(g, 30, 168, 560, 84, LANE, 14); P.startMark(g, 60, 210, 0); },
          start:{ x:60, y:210, a:0 }, goal:{ x:X - 62, y:172, w:41, h:76, park:true }, noBump:true,
          walls:[block(X, 120, 60, 90, 70, COLORS[0]), block(X, 210, 60, 90, 70, COLORS[4]),
                 tree(40, 40), tree(40, 380), tree(200, 60), tree(220, 370), cheer(560, 390, -0.5)],
        };
      },
      solution:prog(UNTIL(LT('distance', 10), FWD()), STOP) },

    { id:'4-2', ch:4, stars:3, title:'ブロックのめいろ',
      mission:'ブロックにぶつからないように走って、旗のゴールまで行こう',
      talk:['ブロックの めいろ！ かべに 近づいたら 曲がって、旗の ゴールまで 行こう。',
            '曲がり角を ぜんぶ 時間で 決めなくても、距離センサーを 使えば 同じ動きの くりかえしで 行けるよ。',
            'ぶつかったら アウト！'],
      hint:'「ずっと」の中で、きょりが 近いときと 遠いときで 動きを かえよう。曲がる向きは いつも 同じで だいじょうぶ。',
      build:() => ({
        floor:mazeFloor, start:{ x:60, y:360, a:0 }, goal:{ x:0, y:0, w:110, h:120, flag:[28, 28] }, noBump:true,
        walls:ISLAND.concat([cheer(28, 96, 0.9)]),
      }),
      solution:prog(FOREVER(IF(LT('distance', 15), [TURN('left')], [FWD(80)]))) },

    { id:'4-3', ch:4, stars:4, title:'横断歩道のチャッピー',
      mission:'横断歩道をわたるチャッピーにぶつからないように進み、通行止めの手前で止まろう',
      talk:['あっ、横断歩道で ぼくの 友だちの チャッピーが わたろうと してる！',
            'チャッピーが 前に いるときは 止まって、いなくなったら 進もう。ぶつかったら いたいよ〜。',
            '道の さいごは 通行止め。そこでも ちゃんと 止まってね！'],
      hint:'前に 何かが 近いときは 止まる、そうでなければ 進む。これを ずっと くりかえそう。',
      build:() => ({
        floor(g){
          P.mat(g, '#C5E6AE'); P.flowers(g, 20, 330, 560, 80, 20, 4);
          P.box(g, 0, 108, 600, 42, '#E6E9EE'); P.box(g, 0, 270, 600, 42, '#E6E9EE');
          P.box(g, 0, 150, 600, 120, '#5B6574'); P.box(g, 0, 154, 600, 3, '#FFFFFF'); P.box(g, 0, 263, 600, 3, '#FFFFFF');
          P.crosswalk(g, 280, 150, 40, 120); P.startMark(g, 60, 210, 0);
        },
        start:{ x:60, y:210, a:0 }, goal:{ x:470, y:175, w:72, h:70, park:true, flag:[548, 160] },
        walls:[{ kind:'barrier', x:562, y:150, w:38, h:120 },
               house(40, 16, 92, 70, '#F6C28B', '#D9644A'), house(420, 16, 92, 70, '#A7D3F2', '#3E7CB1'),
               { kind:'building', x:400, y:330, w:110, h:72, height:70, color:'#F3E2C7', accent:'#D9644A' },
               tree(230, 60), tree(330, 60), tree(200, 365), tree(540, 365), tree(60, 360)],
        movers:[{ a:[300, 128], b:[300, 292], speed:28, pause:2.5, meet:{ x:300, y:210, gap:90, stay:2.2 }, yieldDist:110 }],
      }),
      solution:prog(FOREVER(IF(LT('distance', 20), [STOP], [FWD()]))) },

    { id:'4-4', ch:4, stars:4, title:'かべ？それともチャッピー？',
      mission:'チャッピーにも かべにも ぶつからずに進み、旗の前のかべの手前で止まろう',
      talk:['むずかしい めいろだよ！ めいろの中を チャッピーが 横切るんだ。',
            '前に 何かあるとき、それが かべなのか チャッピーなのか、どうやって 見分ける？',
            'ヒント：チャッピーは 少し 待つと いなくなるけど、かべは ずっと そこに あるよね。さいごは 旗の前の かべの 手前で 止まってね。'],
      hint:'止まって 少し 待ってから、もう一度 きょりを 測ってみよう。まだ 近ければ、それは かべだよ。',
      build:() => ({
        floor:mazeFloor, start:{ x:60, y:360, a:0 }, goal:{ x:30, y:22, w:72, h:76, park:true, flag:[14, 14] }, noBump:true,
        walls:ISLAND,
        movers:[{ a:[300, 314], b:[300, 406], speed:34, pause:2.5, meet:{ x:300, y:360, gap:70 }, yieldDist:120 },
                { a:[250, 106], b:[250, 14], speed:34, pause:2.5, meet:{ x:250, y:60, gap:70 }, yieldDist:120 }],
      }),
      solution:prog(FOREVER(IF(LT('distance', 20),
        [STOP, WAIT(2), IF(LT('distance', 20), [TURN('left')])],
        [FWD(60)]))) },

    // ===== 5章 明るさセンサー =====
    { id:'5-1', ch:5, stars:3, title:'黒い線で止まろう', random:true, demoSeed:5,
      mission:'黒い「とまれ」の線の上で止まろう 🎲線の場所は毎回かわる',
      talk:['明るさセンサーは、車の 前の下に ある 赤い光の ところで、床の 明るさを 測っているよ。',
            '黒い「とまれ」の 線の上だと、明るさの 値が 小さく なるんだ。',
            '線の 場所は 毎回 かわるよ。明るさセンサーで 線を 見つけて 止まろう！'],
      hint:'明るさが 小さく（黒く）なるまで 進みつづけよう。',
      build(rng){
        const X = 300 + Math.floor(rng() * 9) * 25;
        return {
          floor(g){
            P.mat(g, '#C5E6AE'); P.flowers(g, 20, 20, 560, 110, 16, 2); P.flowers(g, 20, 300, 560, 110, 16, 6);
            P.box(g, 0, 150, 600, 120, '#EFE4CC'); P.box(g, 0, 150, 600, 4, '#FFFFFF'); P.box(g, 0, 266, 600, 4, '#FFFFFF');
            P.box(g, X - 8, 150, 16, 120, '#141414'); P.label(g, 'とまれ', X, 132, 16, '#E8604C');
            P.startMark(g, 60, 210, 0);
          },
          start:{ x:60, y:210, a:0 }, goal:{ x:X - 46, y:172, w:56, h:76, park:true },
          walls:[tree(100, 80), tree(250, 70), tree(540, 60), tree(150, 340), tree(330, 350), tree(500, 350), cheer(X + 60, 300, -0.4)],
        };
      },
      solution:prog(UNTIL(LT('light', 50), FWD()), STOP) },

    { id:'5-2', ch:5, stars:3, title:'ライントレース（だ円）',
      mission:'黒い線にそって走り、コースを1周しよう',
      talk:['いよいよ ライントレース！ 黒い線に そって 1周しよう。',
            'センサーが 黒い線の 上なら 少し 右へ、白い床なら 少し 左へ…',
            'ジグザグ しながら 線の ふちを たどるのが コツだよ！'],
      hint:'左右の モーターの はやさを かえると、カーブしながら 進めるよ（「左モーター ○ 右モーター ○」ブロック）。',
      build:() => ({ floor:ellipseFloor, start:{ x:300, y:350, a:0 }, lap:{ cx:300, cy:210, need:1 },
                     walls:ellipseWalls().concat([cheer(90, 385, 0.4)]) }),
      solution:prog(FOREVER(IF(LT('light', 50), [M(80, 20)], [M(20, 80)]))) },

    { id:'5-3', ch:5, stars:4, title:'ライントレース（くねくね）',
      mission:'くねくねの線にそって走り、コースを1周しよう',
      talk:['くねくね コースに ちょうせん！ くぼんだ ところでは 反対向きに 曲がるよ。',
            'さっきの プログラムで うまく いくかな？ だめなら はやさを 調整してみよう。'],
      hint:'カーブが きつい ところで 線から はずれるなら、はやさを 下げたり、左右の 差を 大きく したり してみよう。',
      build:() => ({ floor:wavyFloor, start:{ x:300, y:365, a:0 }, lap:{ cx:300, cy:240, need:1 },
        walls:[house(258, 215, 84, 58, '#F6C28B', '#D9644A'), tree(175, 240), tree(425, 240), tree(210, 300), tree(390, 300),
               tree(35, 35), tree(565, 35), tree(35, 385), tree(565, 385), cheer(300, 40, 0)] }),
      solution:prog(FOREVER(IF(LT('light', 50), [M(80, 20)], [M(20, 80)]))) },

    { id:'5-4', ch:5, stars:5, title:'線の上のチャッピー',
      mission:'線にそって1周しよう。とちゅうで横切るチャッピーにぶつからないでね',
      talk:['さいごの ステージ！ ライントレースの コースを チャッピーが 横切るよ。',
            '線に そって 走りながら、前に チャッピーが いたら 止まって 待とう。',
            '明るさセンサーと 距離センサー、2つの センサーを 使いこなせるかな？'],
      hint:'まず きょりを 調べて、近ければ 止まる。そうでなければ、ライントレースの 動きを しよう。',
      build:() => ({ floor:ellipseFloor, start:{ x:300, y:350, a:0 }, lap:{ cx:300, cy:210, need:1 }, walls:ellipseWalls(),
        movers:[{ a:[440, 210], b:[588, 210], speed:30, pause:3, meet:{ x:536, y:210, gap:80, stay:1.5 }, yieldDist:120 }] }),
      solution:prog(FOREVER(IF(LT('distance', 20), [STOP], [IF(LT('light', 50), [M(80, 20)], [M(20, 80)])]))) },

    // ===== 6章 植物（時刻・土の水分） 1秒 ＝ 1時間 =====
    { id:'6-1', ch:6, stars:2, title:'暗くなったら植物ライト',
      mission:'暗くなったら植物ライト（LED）をつけ、明るくなったら消そう（1秒で1時間すすむよ）',
      talk:['ここは ぼくの 植物の へや。トマトを そだてて いるんだ！',
            '植物は 光が ないと そだたないよ。くもって 暗くなったら、植物ライト（LED）で 光を あげたいな。',
            'この へやは 1秒で 1時間 すすむよ。朝8時から 夜10時まで、明るさが どう かわるか 見ていてね。'],
      hint:'3章の「自動ライト」と 同じ考え方だよ。「明るさ」が 30より 小さいときに LED を つけよう。',
      build:plant({ clock:8, end:14,
        steps:[{ t:0, temp:24, cloud:1 }, { t:3, cloud:0.25 }, { t:6, cloud:1 }],
        checks:[{ t:2.5, expect:{ led:false } }, { t:4.5, expect:{ led:true } }, { t:7.5, expect:{ led:false } }, { t:12.5, expect:{ led:true } }] }),
      solution:prog(FOREVER(IF(LT('light', 30), [LED(true)], [LED(false)]))) },

    { id:'6-2', ch:6, stars:3, title:'土がかわいたら水やり',
      mission:'土の水分が少なくなったら水やりポンプを動かそう。水が少なすぎても 多すぎても だめだよ（朝6時〜夜0時）',
      talk:['お昼は あつくて、土が どんどん かわいて いくよ。',
            '「土の水分」センサーで しめりぐあいを 測って、かわいたら ポンプで 水を あげよう。',
            'でも、水を あげすぎると 根が くさっちゃう！ 水分が もどったら ポンプを 止めてね。'],
      hint:'「もし 土の水分 ＜ 30 なら ポンプを動かす、そうでなければ 止める」を「ずっと」で くりかえそう。',
      build:plant({ clock:6, end:18,
        soil:{ start:60, dry:3, pump:12, min:15, max:95 },
        steps:[{ t:0, temp:24 }, { t:5, temp:29, dry:5 }, { t:11, temp:25, dry:3 }] }),
      solution:prog(FOREVER(IF(LT('moisture', 30), [PUMP(true)], [PUMP(false)]))) },

    { id:'6-3', ch:6, stars:3, title:'朝と夕方に水やり',
      mission:'毎日 朝7時と 夕方5時（17時）の 1時間だけ、水やりポンプを動かそう（朝5時〜夜1時）',
      talk:['植物の 水やりは、すずしい 朝と 夕方が いいんだって。',
            '「時刻」センサーを 使えば、決まった 時間に 水やりが できるよ。',
            '朝7時と 夕方17時の あいだだけ ポンプを 動かそう。ほかの 時間は 止めておいてね。'],
      hint:'「時刻 ＝ 7」または「時刻 ＝ 17」のときに ポンプを 動かそう。「または」ブロックを 使うよ。',
      build:plant({ clock:5, end:20,
        soil:{ start:50, dry:2.5, pump:14, min:15, max:95 },
        steps:[{ t:0, temp:23 }],
        checks:[{ t:1.5, expect:{ pump:false } }, { t:2.5, expect:{ pump:true } }, { t:3.5, expect:{ pump:false } },
                { t:12.5, expect:{ pump:true } }, { t:13.5, expect:{ pump:false } }] }),
      solution:prog(FOREVER(IF(OR(EQ('hour', 7), EQ('hour', 17)), [PUMP(true)], [PUMP(false)]))) },

    { id:'6-4', ch:6, stars:4, title:'くもりの日はライトでおぎなう',
      mission:'昼間（6時〜17時台）に くもって暗いときだけ 植物ライトをつけよう。夜は 植物も 休むので 消しておこう',
      talk:['植物も 夜は ねむって 休むんだ。夜じゅう 光を あてると つかれちゃう。',
            'だから、ライトを つけるのは「昼間なのに くもって 暗いとき」だけに したいな。',
            '「明るさ」と「時刻」、2つの センサーを 組み合わせて 考えてみよう！'],
      hint:'「明るさ ＜ 30」かつ「時刻 ≧ 6」かつ「時刻 ＜ 18」。「かつ」を 2つ 使うと 3つの 条件を つなげられるよ。',
      build:plant({ clock:4, end:21, rest:true,
        steps:[{ t:0, temp:22, cloud:1 }, { t:5, cloud:0.25 }, { t:8, cloud:1 }, { t:11, cloud:0.2 }, { t:13, cloud:1 }],
        checks:[{ t:1.5, expect:{ led:false } }, { t:3.5, expect:{ led:false } }, { t:6.5, expect:{ led:true } }, { t:9.5, expect:{ led:false } },
                { t:12.5, expect:{ led:true } }, { t:15.5, expect:{ led:false } }, { t:19.5, expect:{ led:false } }] }),
      solution:prog(FOREVER(IF(AND(LT('light', 30), DAYTIME), [LED(true)], [LED(false)]))) },

    { id:'6-5', ch:6, stars:5, title:'全自動ビニールハウス',
      mission:'水やり（水分30未満）・植物ライト（昼間に暗いとき）・ファン（30℃以上）を、ぜんぶ じどうで 動かそう',
      talk:['いよいよ さいごの ステージ！ ぼくの へやを 全自動の ビニールハウスに しよう。',
            '土が かわいたら 水やり、昼間に くもったら 植物ライト、30℃ 以上に なったら ファンで すずしく してね。',
            '3つの「もし」を 1つの「ずっと」に ならべてみよう。これまでの 考え方が ぜんぶ 生きるよ！'],
      hint:'ポンプ・ライト・ファンは それぞれ べつの「もし〜なら／そうでなければ」で 決められるよ。',
      build:plant({ clock:5, end:20, rest:true,
        soil:{ start:55, dry:3, pump:12, min:15, max:95 },
        steps:[{ t:0, temp:22, cloud:1 }, { t:4, cloud:0.25 }, { t:6, cloud:1, temp:27, dry:4 }, { t:7, temp:31, dry:5 },
               { t:9, cloud:0.2 }, { t:10, temp:33 }, { t:11, cloud:1 }, { t:12, temp:26, dry:3 }],
        checks:[{ t:0.5, expect:{ led:false, fan:false } }, { t:4.5, expect:{ led:true, fan:false } }, { t:6.5, expect:{ led:false, fan:false } },
                { t:9.5, expect:{ led:true, fan:true } }, { t:11.5, expect:{ led:false, fan:true } }, { t:13.5, expect:{ led:false, fan:false } },
                { t:18.5, expect:{ led:false, fan:false } }] }),
      solution:prog(FOREVER(
        IF(LT('moisture', 30), [PUMP(true)], [PUMP(false)]),
        IF(AND(LT('light', 30), DAYTIME), [LED(true)], [LED(false)]),
        IF(GE('temp', 30), [FAN(true)], [FAN(false)]))) },
  ];

  // ===== 目安（きじゅんの値） =====
  // 「暗い」「近い」「かわいた」「あつい」を、どの数で 分けるかを はっきり 見せる（ミッション・センサー欄に出す）
  // { s:センサー, v:さかいめの値, lo:v より小さいとき, hi:v 以上のとき }、または { text:そのまま出す文 }
  const DARK = { s:'light', v:30, lo:'暗い', hi:'明るい' };
  const BLACK = { s:'light', v:50, lo:'黒い線', hi:'白い床' };
  const NEAR = v => ({ s:'distance', v, lo:'近い', hi:'遠い' });
  // limit:true は失敗のさかいめ（画面上のミッション欄には出さない）
  const DRY = [{ s:'moisture', v:15, lo:'しおれる（失敗）', hi:'かわいた', limit:true }, { s:'moisture', v:30, lo:'かわいた', hi:'ちょうどよい' },
               { s:'moisture', v:96, lo:'ちょうどよい', hi:'多すぎ（失敗）', limit:true }];
  const DAY = { text:'🕐 昼間 ＝ 6時〜17時台（時刻が 6以上 かつ 18より小さい）。18時〜5時台は 夜', short:'🕐 昼間＝6〜17時台' };
  const RULES = {
    '3-1':[DARK], '3-2':[{ s:'temp', v:28, lo:'すずしい', hi:'あつい' }], '3-3':[DARK],
    '3-4':[DARK, { s:'temp', v:28, lo:'ふつう', hi:'あつい' }, { s:'temp', v:35, lo:'あつい', hi:'あぶない' }],
    '4-1':[NEAR(10)], '4-2':[NEAR(15)], '4-3':[NEAR(20)], '4-4':[NEAR(20)],
    '5-1':[BLACK], '5-2':[BLACK], '5-3':[BLACK], '5-4':[NEAR(20), BLACK],
    '6-1':[DARK], '6-2':DRY, '6-3':[{ text:'🕐 水やりの時間 ＝ 時刻が 7（朝7時台）または 17（夕方5時台）', short:'🕐 水やり＝7時台と17時台' }],
    '6-4':[DARK, DAY], '6-5':[...DRY, DARK, DAY, { s:'temp', v:30, lo:'すずしい', hi:'あつい' }],
  };
  STAGES.forEach(st => { st.rule = RULES[st.id] || []; });

  global.VPStages = { CHAPTERS, STAGES };
})(window);
