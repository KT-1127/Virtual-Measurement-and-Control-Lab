/* 仮想プログラミングのブロック定義・ツールボックス・プログラム変換
   （chappy-lab-next/static/chappy-blocks.js を元に、ロボットカー用のモーターなどを追加）
   ★ブロックを増やす・変えるときは、このファイルだけを直す★ */
(function(global){

  function defineBlocks(){
    const B = Blockly.Blocks, F = Blockly.FieldDropdown;
    const ONOFF = [['つける','on'],['消す','off']];

    function sensor(name, label, check, tip){
      B[name] = { init(){
        this.appendDummyInput().appendField(label);
        this.setOutput(true, check); this.setColour(174);
        if(tip) this.setTooltip(tip);
      }};
    }
    sensor('sc_distance','📏 きょり(cm)','Number','前にある物までのきょり（0〜100cm）');
    sensor('sc_light','💡 明るさ','Number','明るさ（0〜100）。ロボットカーでは床の明るさ（黒い線の上は小さくなる）');
    sensor('sc_temp','🌡️ 温度(℃)','Number');
    sensor('sc_timer','⏲ タイマー(秒)','Number','「▶ 実行」をおしてからの秒数');
    sensor('sc_moisture','💧 土の水分','Number','土の しめりぐあい（0〜100）。かわくと小さく、水をやると大きくなる');
    sensor('sc_hour','🕐 時刻(時)','Number','いまの時刻（0〜23時）。植物の部屋では 1秒で 1時間 すすむ');
    sensor('sc_pir','👤 人がいる','Boolean');
    sensor('sc_button_red','🔴 赤ボタン','Boolean');
    sensor('sc_button_blue','🔵 青ボタン','Boolean');

    function stmt(name, colour, build, tip){
      B[name] = { init(){
        build(this);
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(colour);
        if(tip) this.setTooltip(tip);
      }};
    }
    // モーター（ロボットカー）
    stmt('vc_move', 260, b => b.appendDummyInput().appendField('🚗')
      .appendField(new F([['前に','fwd'],['後ろに','back']]),'DIR').appendField('すすむ  はやさ')
      .appendField(new Blockly.FieldNumber(50,0,100),'SPEED'));
    stmt('vc_turn', 260, b => b.appendDummyInput().appendField('↻')
      .appendField(new F([['左','left'],['右','right']]),'DIR').appendField('に回る  はやさ')
      .appendField(new Blockly.FieldNumber(40,0,100),'SPEED'), 'その場で回る');
    // 角度で曲がる（はやさや秒数を考えなくてよい。その場で回って止まる）
    stmt('vc_turn_deg', 260, b => b.appendDummyInput().appendField('↪')
      .appendField(new F([['左','left'],['右','right']]),'DIR').appendField('に')
      .appendField(new F([['90','90'],['45','45'],['180','180']]),'DEG').appendField('° 曲がる'),
      'その場で回って、決めた角度だけ曲がる');
    stmt('vc_curve', 260, b => b.appendDummyInput().appendField('↰ 左モーター')
      .appendField(new Blockly.FieldNumber(50,-100,100),'L').appendField('右モーター')
      .appendField(new Blockly.FieldNumber(50,-100,100),'R'),
      '左右のモーターのはやさを別々に決める（-100〜100）。ちがう数にするとカーブする');
    stmt('vc_stop', 260, b => b.appendDummyInput().appendField('⏹ 止まる'));

    // 出力
    stmt('sc_led', 16, b => b.appendDummyInput().appendField('💡 LED').appendField(new F(ONOFF),'STATE'));
    stmt('sc_fan', 16, b => b.appendDummyInput().appendField('🌀 ファン').appendField(new F(ONOFF),'STATE'));
    stmt('vc_pump', 16, b => b.appendDummyInput().appendField('🚿 水やりポンプ')
      .appendField(new F([['動かす','on'],['止める','off']]),'STATE'), '動かしているあいだ、植物に水をやる');
    stmt('vc_buzzer', 16, b => b.appendDummyInput().appendField('🔔 ブザー')
      .appendField(new F([['鳴らす','on'],['止める','off']]),'STATE'));
    B['vc_show'] = { init(){
      this.appendValueInput('VALUE').appendField('📟 表示する');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(16);
      this.setTooltip('数やセンサーの値を表示パネルに出す'); }};
    stmt('sc_wait', 16, b => b.appendDummyInput().appendField('⏱ 待つ')
      .appendField(new Blockly.FieldNumber(1,0.1,3600),'SEC').appendField('秒'));

    // くりかえし
    B['sc_forever'] = { init(){
      this.appendDummyInput().appendField('🔁 ずっと');
      this.appendStatementInput('DO');
      this.setPreviousStatement(true); this.setColour(120); }};
    B['sc_until'] = { init(){
      this.appendValueInput('COND').setCheck('Boolean').appendField('🔁');
      this.appendDummyInput().appendField('になるまで くりかえす');
      this.appendStatementInput('DO');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(120);
      this.setInputsInline(true); }};

    // はじまり
    B['vc_start'] = { init(){
      this.appendDummyInput().appendField('▶ 実行したとき');
      this.setNextStatement(true); this.setColour(45);
      this.setTooltip('この下につないだブロックが動く'); }};
  }

  const toolbox = { kind:'categoryToolbox', contents:[
    { kind:'category', name:'はじまり', colour:'45', contents:[
      {kind:'block',type:'vc_start'} ]},
    { kind:'category', name:'モーター', colour:'260', contents:[
      {kind:'block',type:'vc_move'},{kind:'block',type:'vc_turn_deg'},{kind:'block',type:'vc_turn'},
      {kind:'block',type:'vc_curve'},{kind:'block',type:'vc_stop'} ]},
    { kind:'category', name:'センサー', colour:'174', contents:[
      {kind:'block',type:'sc_distance'},{kind:'block',type:'sc_light'},
      {kind:'block',type:'sc_temp'},{kind:'block',type:'sc_pir'},
      {kind:'block',type:'sc_moisture'},{kind:'block',type:'sc_hour'},
      {kind:'block',type:'sc_button_red'},{kind:'block',type:'sc_button_blue'},
      {kind:'block',type:'sc_timer'} ]},
    { kind:'category', name:'すう字', colour:'230', contents:[
      {kind:'block',type:'math_number'} ]},
    { kind:'category', name:'はんだん', colour:'40', contents:[
      {kind:'block', type:'controls_if', extraState:{ hasElse:true } },
      {kind:'block', type:'controls_if'},
      {kind:'block',type:'logic_compare'},
      {kind:'block',type:'logic_operation'},
      {kind:'block',type:'logic_negate'},
      {kind:'block',type:'logic_boolean'} ]},
    { kind:'category', name:'出力', colour:'16', contents:[
      {kind:'block',type:'sc_led'},{kind:'block',type:'sc_fan'},{kind:'block',type:'vc_pump'},{kind:'block',type:'vc_buzzer'},
      {kind:'block',type:'vc_show', inputs:{ VALUE:{ block:{ type:'sc_distance' } } } },
      {kind:'block',type:'sc_wait'} ]},
    { kind:'category', name:'くりかえし', colour:'120', contents:[
      {kind:'block',type:'sc_forever'},
      {kind:'block',type:'controls_repeat_ext',
        inputs:{ TIMES:{ shadow:{ type:'math_number', fields:{ NUM:5 } } } } },
      {kind:'block',type:'sc_until'} ]},
  ]};

  const OP = { EQ:'==', NEQ:'!=', LT:'<', LTE:'<=', GT:'>', GTE:'>=' };
  const SENSOR = { sc_distance:'distance', sc_light:'light', sc_temp:'temp', sc_timer:'timer', sc_pir:'pir',
                   sc_button_red:'button_red', sc_button_blue:'button_blue', sc_moisture:'moisture', sc_hour:'hour' };

  // 値ブロック → 式（chappy では「センサー 記号 数」に限っていたが、ここでは木のまま持つ）
  function expr(b){
    if(!b) return null;
    const t = b.type;
    if(SENSOR[t]) return {k:'sensor', name:SENSOR[t]};
    if(t==='math_number') return {k:'num', v:Number(b.getFieldValue('NUM'))};
    if(t==='logic_boolean') return {k:'num', v:b.getFieldValue('BOOL')==='TRUE'};
    if(t==='logic_negate') return {k:'not', a:expr(b.getInputTargetBlock('BOOL'))};
    if(t==='logic_compare') return {k:'cmp', op:OP[b.getFieldValue('OP')]||'==',
      a:expr(b.getInputTargetBlock('A')), b:expr(b.getInputTargetBlock('B'))};
    if(t==='logic_operation') return {k:b.getFieldValue('OP')==='AND'?'and':'or',
      a:expr(b.getInputTargetBlock('A')), b:expr(b.getInputTargetBlock('B'))};
    return null;
  }

  function blockChainToActions(block){
    const acts = [];
    while(block){ const a = oneBlockToAction(block); if(a){ a.id = block.id; acts.push(a); } block = block.getNextBlock(); }
    return acts;
  }
  function body(b, name){ const x = b.getInputTargetBlock(name); return x ? blockChainToActions(x) : []; }
  function oneBlockToAction(b){
    const t = b.type, num = k => Number(b.getFieldValue(k)), sign = (k, neg) => b.getFieldValue(k)===neg ? -1 : 1;
    if(t==='vc_move'){ const s = num('SPEED') * sign('DIR','back'); return {type:'motor', l:s, r:s}; }
    if(t==='vc_turn'){ const s = num('SPEED') * sign('DIR','left'); return {type:'motor', l:s, r:-s}; }
    if(t==='vc_turn_deg') return {type:'turn', dir:b.getFieldValue('DIR'), deg:num('DEG')};
    if(t==='vc_curve') return {type:'motor', l:num('L'), r:num('R')};
    if(t==='vc_stop') return {type:'motor', l:0, r:0};
    if(t==='sc_led') return {type:'led', value:b.getFieldValue('STATE')==='on'};
    if(t==='sc_fan') return {type:'fan', value:b.getFieldValue('STATE')==='on'};
    if(t==='vc_buzzer') return {type:'buzzer', value:b.getFieldValue('STATE')==='on'};
    if(t==='vc_pump') return {type:'pump', value:b.getFieldValue('STATE')==='on'};
    if(t==='vc_show') return {type:'show', expr:expr(b.getInputTargetBlock('VALUE'))};
    if(t==='sc_wait') return {type:'wait', value:num('SEC')};
    if(t==='sc_forever') return {type:'forever', actions:body(b,'DO')};
    if(t==='controls_repeat_ext'){
      const n = expr(b.getInputTargetBlock('TIMES'));
      return {type:'repeat', times:n && n.k==='num' ? n.v : 5, actions:body(b,'DO')};
    }
    if(t==='sc_until') return {type:'until', condition:expr(b.getInputTargetBlock('COND')), actions:body(b,'DO')};
    if(t==='controls_if'){
      // 「でなければもし」にも対応：IF0, IF1 … を順に見る
      const branches = [];
      for(let i = 0; b.getInput('IF' + i); i++)
        branches.push({condition:expr(b.getInputTargetBlock('IF' + i)), actions:body(b,'DO' + i)});
      return {type:'if', branches, else:body(b,'ELSE')};
    }
    return null;
  }

  // ワークスペース → 動かす形。「▶ 実行したとき」の下だけを動かす。
  // 「▶ 実行したとき」が2つ以上あれば、同時に動くスレッドに分ける
  function buildProgram(ws){
    const starts = ws.getTopBlocks(true).filter(b => b.type === 'vc_start');
    return { threads: starts.map(s => ({ actions: blockChainToActions(s.getNextBlock()) })) };
  }

  // ---------- 動かす形 → ブロック（buildProgram の逆）。先生用の「答え（例）」を、お手本と同じプログラムからブロックで見せる ----------
  const SENSOR_BLOCK = Object.fromEntries(Object.entries(SENSOR).map(([type, name]) => [name, type]));
  const OP_NAME = Object.fromEntries(Object.entries(OP).map(([name, op]) => [op, name]));
  const onoff = v => v ? 'on' : 'off';
  function exprBlock(e){
    if(!e) return null;
    if(e.k === 'sensor') return { type:SENSOR_BLOCK[e.name] };
    if(e.k === 'num') return typeof e.v === 'boolean' ? { type:'logic_boolean', fields:{ BOOL:e.v ? 'TRUE' : 'FALSE' } } : { type:'math_number', fields:{ NUM:e.v } };
    if(e.k === 'not') return { type:'logic_negate', inputs:value('BOOL', e.a) };
    if(e.k === 'and' || e.k === 'or') return { type:'logic_operation', fields:{ OP:e.k.toUpperCase() }, inputs:Object.assign(value('A', e.a), value('B', e.b)) };
    if(e.k === 'cmp') return { type:'logic_compare', fields:{ OP:OP_NAME[e.op] }, inputs:Object.assign(value('A', e.a), value('B', e.b)) };
    return null;
  }
  function value(name, e){ const b = exprBlock(e); return b ? { [name]:{ block:b } } : {}; }
  function actionBlock(a){
    switch(a.type){
      case 'motor':
        if(!a.l && !a.r) return { type:'vc_stop' };
        if(a.l === a.r) return { type:'vc_move', fields:{ DIR:a.l > 0 ? 'fwd' : 'back', SPEED:Math.abs(a.l) } };
        if(a.l === -a.r) return { type:'vc_turn', fields:{ DIR:a.l < 0 ? 'left' : 'right', SPEED:Math.abs(a.l) } };
        return { type:'vc_curve', fields:{ L:a.l, R:a.r } };
      case 'turn':   return { type:'vc_turn_deg', fields:{ DIR:a.dir, DEG:String(a.deg) } };
      case 'wait':   return { type:'sc_wait', fields:{ SEC:a.value } };
      case 'led':    return { type:'sc_led', fields:{ STATE:onoff(a.value) } };
      case 'fan':    return { type:'sc_fan', fields:{ STATE:onoff(a.value) } };
      case 'buzzer': return { type:'vc_buzzer', fields:{ STATE:onoff(a.value) } };
      case 'pump':   return { type:'vc_pump', fields:{ STATE:onoff(a.value) } };
      case 'show':   return { type:'vc_show', inputs:value('VALUE', a.expr) };
      case 'forever': return { type:'sc_forever', inputs:statement('DO', a.actions) };
      case 'repeat': return { type:'controls_repeat_ext',
        inputs:Object.assign({ TIMES:{ shadow:{ type:'math_number', fields:{ NUM:a.times } } } }, statement('DO', a.actions)) };
      case 'until':  return { type:'sc_until', inputs:Object.assign(value('COND', a.condition), statement('DO', a.actions)) };
      case 'if': {
        const inputs = {};
        a.branches.forEach((b, i) => Object.assign(inputs, value('IF' + i, b.condition), statement('DO' + i, b.actions)));
        Object.assign(inputs, statement('ELSE', a.else));
        return { type:'controls_if', extraState:{ elseIfCount:a.branches.length - 1, hasElse:!!(a.else && a.else.length) }, inputs };
      }
    }
    return null;
  }
  // ブロックを上から下へつなぐ
  function chain(actions){
    let first = null, prev = null;
    for(const a of actions || []){
      const b = actionBlock(a); if(!b) continue;
      if(prev) prev.next = { block:b }; else first = b;
      prev = b;
    }
    return first;
  }
  function statement(name, actions){ const b = chain(actions); return b ? { [name]:{ block:b } } : {}; }
  function programToJson(program){
    return { blocks:{ languageVersion:0, blocks:program.threads.map((t, i) => {
      const start = { type:'vc_start', x:30 + i * 340, y:30 }, b = chain(t.actions);
      if(b) start.next = { block:b };
      return start;
    }) } };
  }

  global.VPBlocks = { defineBlocks, toolbox, buildProgram, programToJson };
})(window);
