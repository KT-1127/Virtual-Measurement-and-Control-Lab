/* 画面のうごき：ステージの選択・はじめの説明（チャッピーとのやりとり）・お手本の再生・実行・
   クリア／失敗のモーダル・プログラムの保存（いまはこのブラウザの中だけ。あとで Firebase に置きかえる） */
(function(){
  const $ = id => document.getElementById(id);
  const STAGES = VPStages.STAGES, CHAPTERS = VPStages.CHAPTERS;
  const LS = {
    get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
    set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
  };
  const status = (msg, cls) => { $('status').textContent = msg; $('status').className = 'status ' + (cls || ''); };
  const starText = n => '★'.repeat(n);

  // ---------- ブロックの画面 ----------
  VPBlocks.defineBlocks();
  const theme = Blockly.Theme.defineTheme('vplab', {
    base: Blockly.Themes.Classic,
    componentStyles:{ workspaceBackgroundColour:'#FBFDFF', toolboxBackgroundColour:'#EFF4FA',
      flyoutBackgroundColour:'#E7EEF6', flyoutOpacity:0.96, scrollbarColour:'#C3D0DE' },
    fontStyle:{ family:'"Hiragino Maru Gothic ProN","BIZ UDPGothic","Yu Gothic UI",sans-serif', size:12 },
  });
  const ws = Blockly.inject('blocklyDiv', {
    toolbox: VPBlocks.toolbox, theme, media:'lib/blockly/media/', renderer:'zelos',
    grid:{ spacing:24, length:3, colour:'#E3EAF2', snap:true },
    zoom:{ controls:false, wheel:true, startScale:0.85, maxScale:2.5, minScale:0.4 },
    move:{ scrollbars:true, drag:true, wheel:true }, trashcan:true,
  });
  window.addEventListener('resize', () => Blockly.svgResize(ws));
  $('zin').onclick = () => ws.zoomCenter(1);
  $('zout').onclick = () => ws.zoomCenter(-1);

  // ---------- 仮想空間 ----------
  let cur = Math.max(0, STAGES.findIndex(s => s.id === LS.get('vp-last', '1-1')));
  const world = VPSim.createWorld();
  world.setStage(STAGES[cur]);
  const view = VPView.createView($('stage'), world);
  let resetCam = false;
  world.on.layout = () => { if(view) view.setCourse(resetCam); resetCam = false; };

  // ブザー（Web Audio）とクリアの音
  let audio = null, osc = null;
  function buzzer(on){
    if(on && !osc && audio){
      osc = audio.createOscillator(); const g = audio.createGain(); g.gain.value = 0.06;
      osc.frequency.value = 880; osc.connect(g).connect(audio.destination); osc.start();
    } else if(!on && osc){ osc.stop(); osc = null; }
  }
  function jingle(){
    if(!audio) return;
    const t0 = audio.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = t0 + i * 0.12;
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.45);
    });
  }

  let demo = false, demoTimer = 0;
  const runner = VPSim.createRunner({
    world, onBuzzer: buzzer,
    highlight: id => ws.highlightBlock(id),
    onEnd: natural => {
      if(!natural || demo) return;
      // プログラムが最後まで終わったのに、クリアも失敗もしていない（へやのテストは台本の最後まで続く）
      setTimeout(() => {
        if(world.cleared || world.failed || world.isRoom() || demo) return;
        world.endSession(); setRunningUI(false);
        failed('プログラムが おわったけど、ゴールまで 行けなかったよ');
      }, 600);
    },
  });

  // アクセス解析（Google アナリティクス）。送るのはステージ番号だけ（プログラムや名前は送らない）
  const track = (name, stage) => { try{ if(window.gtag) gtag('event', name, { stage_id:stage }); }catch(e){} };
  world.on.clear = goal => {
    world.endSession(); runner.stop(); setRunningUI(false);
    if(view) view.celebrate(goal);
    jingle();
    if(demo){ endDemo(); return; }
    const st = STAGES[cur], cleared = LS.get('vp-cleared', {});
    track('stage_clear', st.id);
    cleared[st.id] = true; LS.set('vp-cleared', cleared); updateProgress();
    status('🎉 クリア！', 'ok');
    showResult(true, 'クリア！');
    setTimeout(() => showClear(st), 1300);
  };
  world.on.fail = reason => {
    world.endSession(); runner.stop(); setRunningUI(false);
    if(demo){ endDemo(); return; }
    failed(reason);
  };
  // 失敗したときは、すぐにモーダルを出さない。仮想空間（走った跡・秒数の札・止まった場所）はそのまま残し、
  // 下の結果バーから「くわしく（ヒント）」「もう一度」を選べるようにする（何秒でどこまで行ったかをふりかえれる）
  let lastReason = '';
  function failed(reason){
    track('stage_fail', STAGES[cur].id);
    lastReason = reason;
    status('😢 ' + reason, 'err');
    showResult(false, reason);
  }
  function showResult(ok, text){
    const bar = $('resultBar'), time = world.isRoom() ? '' : `　⏱ ${world.simTime.toFixed(1)}秒`;
    bar.className = 'result-bar on ' + (ok ? 'ok' : 'ng');
    $('resultText').textContent = (ok ? '🎉 ' : '😢 おしい！ ') + text + time;
    $('resultMore').textContent = ok ? '🏆 結果を見る' : '💡 くわしく・ヒント';
    $('resultNext').hidden = !(ok && cur + 1 < STAGES.length);
  }
  function hideResult(){ $('resultBar').className = 'result-bar'; }

  // ---------- モーダルウィンドウ（説明・お手本・クリア・失敗・ステージ一覧・おしらせ） ----------
  let openModal = null;
  function modal({ html, wide, buttons = [], onOpen }){
    if(openModal) openModal(undefined);
    return new Promise(resolve => {
      const back = document.createElement('div'); back.className = 'modal-back';
      back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}<div class="actions"></div></div>`;
      const box = back.querySelector('.modal'), acts = back.querySelector('.actions');
      const close = v => { if(!back.isConnected) return; back.remove(); document.removeEventListener('keydown', onKey); openModal = null; resolve(v); };
      const onKey = e => { if(e.key === 'Escape' && buttons.some(b => b.value === 'cancel')) close('cancel'); };
      buttons.forEach(b => { const e = document.createElement('button'); e.className = 'btn ' + (b.cls || ''); e.textContent = b.label; e.onclick = () => close(b.value); acts.appendChild(e); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      openModal = close;
      if(onOpen) onOpen(box, close, acts);
    });
  }
  const say = (text, mood = 'normal', cls = '') =>
    `<div class="talk"><div class="avatar">${Chappy2D.svg(mood, cls)}</div><div class="say">${text}</div></div>`;
  const addButton = (acts, label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; acts.appendChild(b); return b; };
  const notice = (text, mood) => modal({ html:say(text, mood), buttons:[{ label:'わかった', value:'ok', cls:'primary' }] });
  // Blockly が出すかくにん（例：右クリックで「ブロックをぜんぶ消す」）も、ブラウザのポップアップではなくモーダルにする
  if(Blockly.dialog){
    Blockly.dialog.setConfirm((msg, cb) => modal({ html:say(msg), buttons:[{ label:'やめる', value:false }, { label:'OK', value:true, cls:'primary' }] }).then(v => cb(v === true)));
    Blockly.dialog.setAlert((msg, cb) => notice(msg).then(() => { if(cb) cb(); }));
    Blockly.dialog.setPrompt((msg, def, cb) => {
      let input = null;
      modal({ html:say(msg) + '<input class="dlg-input">', buttons:[{ label:'やめる', value:'cancel' }, { label:'OK', value:'ok', cls:'primary' }],
              onOpen(box){ input = box.querySelector('.dlg-input'); input.value = def || ''; input.focus(); } })
        .then(v => cb(v === 'ok' ? input.value : null));
    });
  }

  // ---------- 目安（きじゅんの値） ----------
  const SENSE = { light:['💡', '明るさ', '', 0, 100], distance:['📏', 'きょり', 'cm', 0, 100], temp:['🌡️', '温度', '℃', 0, 40],
                  moisture:['💧', '土の水分', '', 0, 100], hour:['🕐', '時刻', '時', 0, 23] };
  const ruleText = r => {
    if(r.text) return r.text;
    const [icon, name, u] = SENSE[r.s];
    return `${icon} ${name} ${r.v}${u}より小さい ＝ ${r.lo}　／　${r.v}${u}以上 ＝ ${r.hi}`;
  };
  // 3D画面の上のミッション欄には、みじかい形で出す
  const ruleShort = r => {
    if(r.text) return r.short || r.text;
    const [icon, name, u] = SENSE[r.s];
    return r.s === 'temp' ? `${icon} ${name} ${r.v}${u}以上＝${r.hi}` : `${icon} ${name} ${r.v}${u}より小さい＝${r.lo}`;
  };
  // いまの値が、このステージの目安で「暗い」「近い」…のどれに あたるか
  function stateWord(key, v){
    const rs = STAGES[cur].rule.filter(r => r.s === key).sort((a, b) => a.v - b.v);
    if(!rs.length) return '';
    let w = rs[0].lo; rs.forEach(r => { if(v >= r.v) w = r.hi; });
    return w;
  }
  // センサー欄の小さな説明（だいたい どのくらいの値になるか）
  function markText(key){
    const c = world.course, car = !world.isRoom();
    if(key === 'distance') return car ? '1マス ＝ 30cm。前に何もないときは 100' : '';
    if(key === 'light') return car ? '白い床・芝生 85〜95くらい、黒い線 10くらい'
      : c.plant ? '晴れの昼 85・朝夕 50・くもりの昼 20くらい・夜 8' : '明るい部屋 80くらい・暗い部屋 10〜15';
    if(key === 'temp') return car ? '' : 'ふつう 22〜25℃。あつい日は 30℃をこえる';
    if(key === 'moisture') return '水やり直後 60〜90。時間がたつと へっていく';
    if(key === 'hour') return '1秒で 1時間 すすむ';
    return '';
  }
  function renderRules(){
    const st = STAGES[cur];
    $('rule').innerHTML = st.rule.length ? '📐 目安：' + st.rule.filter(r => !r.limit).map(r => `<span>${ruleShort(r)}</span>`).join('') : '';
    document.querySelectorAll('.sensor .ticks').forEach(el => {
      const [, , , lo, hi] = SENSE[el.dataset.s];
      el.innerHTML = st.rule.filter(r => r.s === el.dataset.s)
        .map(r => `<i style="left:${(r.v - lo) / (hi - lo) * 100}%"><b>${r.v}</b></i>`).join('');
    });
    document.querySelectorAll('.sensor .mark').forEach(el => { el.textContent = markText(el.dataset.s); });
  }

  // はじめの説明：チャッピーが話す → さいごに「お手本を見る」「プログラムを作る」
  function showTalk(st){
    const html = `<div class="sub">ステージ ${st.id}　${starText(st.stars)}</div><h3>${st.title}</h3>`
      + `<div class="talk"><div class="avatar">${Chappy2D.svg('normal', 'wave')}</div><div class="say"></div></div>`
      + `<div class="mission-box"><small>ミッション</small>${st.mission}</div>`
      + (st.rule.length ? `<div class="rule-box"><small>📐 このステージの目安（どの数で 分けるか）</small>${st.rule.map(ruleText).join('<br>')}</div>` : '')
      + `<div class="hint-box">💡 ${st.hint}</div>`;
    return modal({ html, onOpen(box, close, acts){
      const bubble = box.querySelector('.say'); let i = 0;
      const btn = (label, cls, fn) => addButton(acts, label, cls, fn);
      const render = () => {
        bubble.innerHTML = st.talk[i] + `<span class="pager">${i + 1} / ${st.talk.length}</span>`;
        bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
        acts.innerHTML = '';
        if(i > 0) btn('◀ もどる', '', () => { i--; render(); });
        if(i < st.talk.length - 1) btn('つぎへ ▶', 'primary', () => { i++; render(); });
        else {
          if(teacher) btn('📖 答え', '', () => close('answer'));
          btn('💡 ヒント', '', () => box.querySelector('.hint-box').classList.toggle('on'));
          btn('🎬 お手本を見る', 'warm', () => close('demo'));
          btn('✏️ プログラムを作る', 'primary', () => close('build'));
        }
      };
      render();
    }}).then(r => { if(r === 'demo') playDemo(); else if(r === 'answer') showAnswer(st); });
  }

  function showStageList(){
    const cleared = LS.get('vp-cleared', {});
    const html = `<h3>ステージを えらぼう</h3><div class="sub">上から じゅんばんに むずかしく なるよ</div><div class="chapters">`
      + CHAPTERS.map(ch => `<div class="chapter"><h4>${ch.n}章　${ch.title}<small>${ch.note}</small></h4><div class="stage-grid">`
        + STAGES.map((s, i) => [s, i]).filter(([s]) => s.ch === ch.n).map(([s, i]) =>
          `<button class="stage-card ${i === cur ? 'cur' : ''}" data-i="${i}">${cleared[s.id] ? '<span class="done">クリア</span>' : ''}`
          + `<span class="sid">${s.id}</span><span class="ttl">${s.title}</span><span class="stars">${starText(s.stars)}</span></button>`).join('')
        + '</div></div>').join('') + '</div>';
    return modal({ html, wide:true, buttons:[{ label:'とじる', value:'cancel' }], onOpen(box, close){
      box.querySelectorAll('.stage-card').forEach(b => { b.onclick = () => close(+b.dataset.i); });
    }}).then(r => { if(typeof r === 'number') openStage(r, true); });
  }

  function showClear(st){
    const hasNext = cur + 1 < STAGES.length;
    const html = `<div class="result"><div class="avatar">${Chappy2D.svg('happy', 'wave')}</div><div class="sub">ステージ ${st.id}　${st.title}</div>`
      + `<h3>クリア！ 🎉</h3><div class="big-stars">${starText(st.stars)}</div>`
      + `<p>${hasNext ? 'やったね！ つぎの ステージに ちょうせんしよう！' : 'ぜんぶの ステージを クリアしたよ！ きみは 計測と制御の 名人だ！'}</p></div>`;
    const buttons = [{ label:'👀 ふりかえる', value:'look' }, { label:'もう一度', value:'retry' }, { label:'ステージ一覧', value:'list' }];
    if(hasNext) buttons.push({ label:'つぎのステージへ ▶', value:'next', cls:'primary' });
    return modal({ html, buttons }).then(r => {
      if(r === 'next') openStage(cur + 1, true);
      else if(r === 'list') showStageList();
      else if(r === 'retry') restartStage();
      // 「ふりかえる」・とじたときは、仮想空間をそのまま残す
    });
  }
  function showFail(st, reason){
    const html = `<div class="result fail"><div class="avatar">${Chappy2D.svg('ouch')}</div><h3>おしい！</h3><div class="reason">${reason}</div>`
      + `<p>プログラムを 見なおして、もう一度 ちょうせんしよう。</p><div class="hint-box on">💡 ${st.hint}</div></div>`;
    const buttons = [{ label:'👀 ふりかえる', value:'look' }, { label:'🎬 お手本を見る', value:'demo', cls:'warm' }, { label:'もう一度', value:'retry', cls:'primary' }];
    if(teacher) buttons.unshift({ label:'📖 答え', value:'answer' });
    return modal({ html, buttons })
      .then(r => { if(r === 'demo') playDemo(); else if(r === 'answer') showAnswer(st); else if(r === 'retry') restartStage(); });
  }

  // ---------- 先生用：シークレットキーで「答え（例）」をブロックで見る ----------
  // キーが正しいと「先生モード」になり、このタブを閉じるまで「📖 答え」ボタンが使える
  const SS = {
    get(k){ try { return sessionStorage.getItem(k); } catch(e){ return null; } },
    set(k, v){ try { if(v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch(e){} },
  };
  const KEY_HASH = (window.VP_CONFIG || {}).answerKeyHash || '';
  let teacher = !!KEY_HASH && SS.get('vp-teacher') === KEY_HASH, wrongTries = 0, lockUntil = 0, answerWs = null;
  function setTeacher(on){
    teacher = on; SS.set('vp-teacher', on ? KEY_HASH : null);
    $('answerBtn').hidden = !on; $('teacherBadge').hidden = !on;
    $('keyBtn').textContent = on ? '🔓' : '🔑';
    $('keyBtn').title = on ? '先生モード中（クリックで おわる）' : '先生用：シークレットキー（Ctrl＋Shift＋K）';
  }
  function openKey(){
    if(demo) return;
    if(teacher){
      modal({ html:say('先生モードを おわりにしますか？<br>答え（例）は 見えなくなります。'),
              buttons:[{ label:'やめる', value:'cancel' }, { label:'🔒 おわりにする', value:'lock', cls:'primary' }] })
        .then(v => { if(v === 'lock'){ setTeacher(false); status('🔒 先生モードを おわりにしました'); } });
      return;
    }
    modal({ html:say('先生用の シークレットキーを 入れてください。<br>正しいキーを 入れると、ステージの 答え（例）を ブロックで 見られます。')
        + '<input class="dlg-input" type="password" autocomplete="off" placeholder="シークレットキー"><div class="key-msg"></div>',
      onOpen(box, close, acts){
        const input = box.querySelector('.dlg-input'), msg = box.querySelector('.key-msg');
        addButton(acts, 'やめる', '', () => close('cancel'));
        addButton(acts, '🔑 ひらく', 'primary', submit);
        input.addEventListener('keydown', e => { if(e.key === 'Enter') submit(); if(e.key === 'Escape') close('cancel'); });
        input.focus();
        function submit(){
          const wait = Math.ceil((lockUntil - Date.now()) / 1000);
          if(wait > 0){ msg.textContent = `あと ${wait} 秒 まってから 入れてね`; return; }
          if(KEY_HASH && VPSecret.check(input.value)){ setTeacher(true); close('ok'); return; }
          wrongTries++; input.value = ''; input.focus();
          box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
          if(wrongTries >= 3){ wrongTries = 0; lockUntil = Date.now() + 10000; msg.textContent = 'キーが ちがうよ。10秒 まってから もう一度 入れてね'; }
          else msg.textContent = 'キーが ちがうよ';
        }
      } }).then(v => { if(v === 'ok'){ status('🔓 先生モード：「📖 答え」で 答え（例）が 見られます', 'ok'); showAnswer(STAGES[cur]); } });
  }
  // 答え（例）：お手本と同じプログラムを、読むだけのブロック画面で見せる
  function showAnswer(st){
    if(!teacher){ openKey(); return; }
    const json = VPBlocks.programToJson(st.solution);
    modal({ wide:true,
      html:`<div class="sub">ステージ ${st.id}　${st.title}（先生用）</div><h3>📖 答えの例</h3><div class="answer-ws"></div>`
        + '<p class="answer-note">これは 答えの 一例です。ほかの 作り方でも クリアできます。ブロックは ドラッグで 動かして 見られます。</p>',
      buttons:[{ label:'とじる', value:'cancel' }, { label:'このプログラムを読みこむ', value:'load', cls:'primary' }],
      onOpen(box){
        answerWs = Blockly.inject(box.querySelector('.answer-ws'), { readOnly:true, theme, media:'lib/blockly/media/', renderer:'zelos',
          zoom:{ controls:false, wheel:true, startScale:0.85, maxScale:1.1, minScale:0.3 }, move:{ scrollbars:true, drag:true, wheel:true } });
        Blockly.serialization.workspaces.load(json, answerWs);
        const fit = () => { if(answerWs){ Blockly.svgResize(answerWs); answerWs.zoomToFit(); } };
        fit(); setTimeout(fit, 350);                     // モーダルが開くアニメーションのあとに大きさを合わせ直す
      } })
      .then(v => {
        if(answerWs){ answerWs.dispose(); answerWs = null; }
        if(v !== 'load') return;
        modal({ html:say('答えの プログラムを 読みこむよ。いまの ブロックは 消えるけど いい？'),
                buttons:[{ label:'やめる', value:'cancel' }, { label:'読みこむ', value:'ok', cls:'primary' }] })
          .then(r => {
            if(r !== 'ok') return;
            loading = true; ws.clear(); Blockly.serialization.workspaces.load(json, ws); loading = false;
            saveWorkspace(); status('📖 答え（例）を 読みこみました', 'ok');
          });
      });
  }

  // ---------- お手本（プログラムは見せずに、ゴールまでの動きだけを見せる） ----------
  function playDemo(){
    const st = STAGES[cur];
    world.endSession(); runner.stop();
    demo = true; setDemoUI(true); hideResult();
    try { audio = audio || new AudioContext(); audio.resume(); } catch(e){}
    world.restart(st.random ? (st.demoSeed || 1) : undefined);
    if(view) view.resetFx();
    lastWatch = ''; if(view) view.setSegmentLabels(false);   // お手本では秒数のラベルを出さない（答えになってしまうので）
    world.startSession(); runner.start(st.solution);
    setRunningUI(true); status('🎬 お手本を再生中…');
    clearTimeout(demoTimer); demoTimer = setTimeout(() => { if(demo) endDemo(true); }, 60000);
  }
  function endDemo(skipped){
    if(!demo) return;
    demo = false; clearTimeout(demoTimer);
    world.endSession(); runner.stop(); setDemoUI(false); setRunningUI(false); status('');
    setTimeout(() => modal({
      html:`<div class="result"><div class="avatar">${Chappy2D.svg('happy', 'wave')}</div><h3>こんなふうに 動けば クリア！</h3>`
        + `<p>こんどは きみが プログラムを 作ってみよう。<br>お手本の プログラムは ないしょだよ。</p></div>`,
      buttons:[{ label:'🎬 もう一度見る', value:'demo' }, { label:'✏️ プログラムを作る', value:'build', cls:'primary' }],
    }).then(r => { if(r === 'demo') playDemo(); else restartStage(); }), skipped ? 0 : 1300);
  }
  function setDemoUI(on){
    $('demoCover').classList.toggle('on', on); $('demoLabel').classList.toggle('on', on);
    ['runBtn', 'stopBtn', 'resetBtn', 'stageBtn', 'demoBtn', 'talkBtn', 'saveBtn', 'loadBtn', 'answerBtn', 'keyBtn'].forEach(id => { $(id).disabled = on; });
  }
  function setRunningUI(on){ $('sensorCard').classList.toggle('panel-locked', on && world.isRoom()); }

  // ---------- 実行・止める・はじめから ----------
  const newSeed = () => (Math.random() * 1e9) | 0;
  function run(){
    if(demo) return;
    const prog = VPBlocks.buildProgram(ws);
    if(!prog.threads.some(t => t.actions.length)){
      notice('「▶ 実行したとき」ブロックを 置いて、その下に ブロックを つなげてね。');
      return;
    }
    try { audio = audio || new AudioContext(); audio.resume(); } catch(e){}
    world.endSession(); runner.stop();
    world.restart(STAGES[cur].random ? newSeed() : undefined);   // 毎回はじめから。🎲のステージは並びもかわる
    if(view) view.resetFx();
    lastWatch = ''; if(view) view.setSegmentLabels(true);
    world.startSession(); runner.start(prog);
    hideResult(); setRunningUI(true); status('実行中…', 'ok');
  }
  function stopRun(){ world.endSession(); runner.stop(); setRunningUI(false); status('止めました'); }
  function restartStage(){
    world.endSession(); runner.stop(); setRunningUI(false);
    world.restart(STAGES[cur].random ? newSeed() : undefined);
    if(view) view.resetFx();
    lastWatch = ''; hideResult(); status('');
  }

  // ---------- ステージをひらく ----------
  let loading = false, saveTimer = 0;
  function saveWorkspace(){ if(!loading) LS.set('vp-ws-' + STAGES[cur].id, Blockly.serialization.workspaces.save(ws)); }
  function loadWorkspace(st){
    loading = true;
    ws.clear();
    const data = LS.get('vp-ws-' + st.id, null);
    try {
      if(data) Blockly.serialization.workspaces.load(data, ws);
      else Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom('<xml><block type="vc_start" x="30" y="30"></block></xml>'), ws);
    } catch(e){ console.error(e); }
    loading = false;
  }
  ws.addChangeListener(e => { if(e.isUiEvent || loading) return; clearTimeout(saveTimer); saveTimer = setTimeout(saveWorkspace, 600); });

  function openStage(i, withTalk){
    if(demo){ demo = false; setDemoUI(false); }
    world.endSession(); runner.stop(); setRunningUI(false);
    clearTimeout(saveTimer); saveWorkspace();
    cur = i; const st = STAGES[i]; LS.set('vp-last', st.id);
    resetCam = true; world.setStage(st);
    loadWorkspace(st);
    lastWatch = ''; hideResult(); updateHud(); status('');
    if(withTalk) showTalk(st);
  }
  function updateHud(){
    const st = STAGES[cur];
    $('stageId').textContent = st.id; $('stageTitle').textContent = st.title;
    $('missionTitle').innerHTML = `${st.id}　${st.title}<span class="stars">${starText(st.stars)}</span>`;
    $('mission').textContent = st.mission;
    const room = world.isRoom();
    document.querySelectorAll('.views .carview').forEach(b => { b.disabled = room; });
    document.querySelectorAll('.plant-only').forEach(el => { el.hidden = !world.course.plant; });
    ['sDist', 'sLight'].forEach(id => {
      $(id).classList.toggle('auto', !room);
      $(id).querySelector('.note').textContent = room ? '' : 'コースから自動で測っています';
    });
    renderRules();
    updateProgress();
  }
  function updateProgress(){
    const cleared = LS.get('vp-cleared', {}), n = STAGES.filter(s => cleared[s.id]).length;
    $('progress').textContent = `クリア ${n} / ${STAGES.length}`;
  }
  // 仮想空間の左下に、すすみぐあいを出す
  // 実行・お手本のあいだはストップウォッチ（直進の秒数を考えるヒント）。終わったあとも最後の時間を残す
  let lastWatch = '';
  function chipText(){
    if(!world.isRoom()){
      if(world.active) lastWatch = `⏱ ${world.simTime.toFixed(1)}秒`;
      const info = chipInfo();
      return lastWatch ? lastWatch + (info ? '　｜　' + info : '') : info;
    }
    return chipInfo();
  }
  function chipInfo(){
    const c = world.course;
    const clock = c.plant ? `🕐 ${world.panel.hour}時　｜　` : '';
    if(c.script) return clock + (world.active ? `テスト中 ${Math.min(c.script.end, world.simTime).toFixed(0)} / ${c.script.end}秒` : '▶ 実行すると テストが はじまるよ' + (c.plant ? '（1秒で1時間）' : ''));
    if(c.lap) return `周回 ${world.laps} / ${c.lap.need || 1}`;
    if(c.checkpoints) return `チェックポイント ${world.cp} / ${c.checkpoints.length}`;
    if(world.stage.random) return '🎲 実行するたびに 場所がかわるよ';
    return '';
  }

  // ---------- ボタン ----------
  $('runBtn').onclick = run;
  $('stopBtn').onclick = stopRun;
  $('resetBtn').onclick = restartStage;
  $('stageBtn').onclick = showStageList;
  $('demoBtn').onclick = playDemo;
  $('talkBtn').onclick = () => showTalk(STAGES[cur]);
  $('skipBtn').onclick = () => endDemo(true);
  $('keyBtn').onclick = openKey;
  $('resultMore').onclick = () => { if($('resultBar').classList.contains('ok')) showClear(STAGES[cur]); else showFail(STAGES[cur], lastReason); };
  $('resultRetry').onclick = restartStage;
  $('resultNext').onclick = () => openStage(cur + 1, true);
  $('answerBtn').onclick = () => showAnswer(STAGES[cur]);
  document.addEventListener('keydown', e => {          // Ctrl＋Shift＋K でもシークレットキーの画面をひらく
    if(e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'k'){ e.preventDefault(); if(!openModal) openKey(); }
  });
  $('saveBtn').onclick = () => {
    LS.set('vp-save-' + STAGES[cur].id, Blockly.serialization.workspaces.save(ws));
    status('💾 保存しました（このブラウザの中）', 'ok');
  };
  $('loadBtn').onclick = () => {
    const data = LS.get('vp-save-' + STAGES[cur].id, null);
    if(!data){ notice('このステージでは、まだ「💾 保存」していないよ。'); return; }
    modal({ html:say('保存した プログラムを 読みこむよ。いまの ブロックは 消えるけど いい？'),
            buttons:[{ label:'やめる', value:'cancel' }, { label:'読みこむ', value:'ok', cls:'primary' }] })
      .then(r => { if(r !== 'ok') return; loading = true; ws.clear(); Blockly.serialization.workspaces.load(data, ws); loading = false; saveWorkspace(); status('📂 読みこみました', 'ok'); });
  };

  // 視点と「大きく見る」
  if(view) view.onMode = m => document.querySelectorAll('.views [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === m));
  document.querySelectorAll('.views [data-view]').forEach(b => { b.onclick = () => view && view.setView(b.dataset.view); });
  function setBig(on){
    $('stageCard').classList.toggle('big', on); $('backdrop').classList.toggle('on', on);
    $('bigBtn').textContent = on ? '✕ もどす' : '⛶ 大きく';
  }
  $('bigBtn').onclick = () => setBig(!$('stageCard').classList.contains('big'));
  $('backdrop').onclick = () => setBig(false);
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !openModal) setBig(false); });

  // ---------- センサーパネル ----------
  const bind = (rid, key) => { $(rid).oninput = () => { world.panel[key] = Number($(rid).value); }; };
  bind('rDist', 'distance'); bind('rLight', 'light'); bind('rTemp', 'temp'); bind('rMoist', 'moisture'); bind('rHour', 'hour');
  $('bPir').onclick = () => { world.panel.pir = !world.panel.pir; };
  [['bRed', 'button_red'], ['bBlue', 'button_blue']].forEach(([id, key]) => {
    const set = v => () => { world.panel[key] = v; $(id).classList.toggle('on', v); };
    $(id).onpointerdown = set(true); $(id).onpointerup = $(id).onpointerleave = set(false);
  });

  // ---------- 計測グラフ・表示の更新 ----------
  const gc = $('graph'), g = gc.getContext('2d'), hist = [], N = 300;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const SERIES = [['distance', '--coral'], ['light', '--amber'], ['temp', '--blue'], ['moisture', '--teal']];
  function drawGraph(){
    const dpr = window.devicePixelRatio || 1, w = gc.clientWidth, h = gc.clientHeight;
    if(gc.width !== w * dpr){ gc.width = w * dpr; gc.height = h * dpr; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const pad = 22, y = v => h - 6 - (h - 12) * Math.max(0, Math.min(100, v)) / 100;
    g.strokeStyle = '#E3EAF2'; g.fillStyle = '#8A99AB'; g.font = '10px sans-serif'; g.lineWidth = 1;
    [0, 50, 100].forEach(v => { g.beginPath(); g.moveTo(pad, y(v)); g.lineTo(w, y(v)); g.stroke(); g.fillText(v, 2, y(v) + 3); });
    SERIES.forEach(([k, c]) => {
      g.strokeStyle = css(c); g.lineWidth = 2; g.beginPath();
      hist.forEach((s, i) => { const x = pad + (w - pad) * i / (N - 1); i ? g.lineTo(x, y(s[k])) : g.moveTo(x, y(s[k])); });
      g.stroke();
    });
  }
  function setOut(id, on, text){ $(id).classList.toggle('on', on); $(id).querySelector('.v').textContent = text; }
  setInterval(() => {
    const s = world.sensors(), o = world.out, p = world.panel;
    hist.push(s); if(hist.length > N) hist.shift();
    drawGraph();
    const word = (key, v) => { const w = stateWord(key, v); return w ? '・' + w : ''; };
    $('vDist').textContent = s.distance + ' cm' + word('distance', s.distance);
    $('vLight').textContent = s.light + word('light', s.light); $('vTemp').textContent = s.temp + ' ℃' + word('temp', s.temp);
    $('rDist').value = s.distance; $('rLight').value = s.light; $('rTemp').value = p.temp;
    $('vMoist').textContent = s.moisture + word('moisture', s.moisture);
    $('vHour').textContent = s.hour + ' 時・' + (s.hour >= 6 && s.hour < 18 ? '昼間' : '夜'); $('rMoist').value = s.moisture; $('rHour').value = s.hour;
    $('bPir').classList.toggle('on', p.pir);
    setOut('oLed', o.led, o.led ? '点灯' : '消');
    setOut('oFan', o.fan, o.fan ? '回転' : '止');
    setOut('oBuz', o.buzzer, o.buzzer ? '♪' : '－');
    setOut('oPump', o.pump, o.pump ? '水やり' : '止');
    setOut('oMot', !!(o.l || o.r), Math.round(o.l) + ' / ' + Math.round(o.r));
    const t = chipText(); if($('chip').textContent !== t) $('chip').textContent = t;
  }, 100);

  // ---------- はじめ ----------
  loadWorkspace(STAGES[cur]);
  updateHud();
  setTeacher(teacher);                                   // 同じタブで先生モードだったら、そのまま続ける
  showTalk(STAGES[cur]);
})();
