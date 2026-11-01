/* 2D のチャッピー（説明・クリア・失敗の画面に出る）。
   compass/src/components/chappy/Chappy.tsx と同じ作り：パーツ画像（assets/chappy/*.webp）を重ね、顔（目と口）は線でかく。
   動き（呼吸・まばたき・しっぽ）は css/app.css の .cp で付ける */
(function(global){
  // パーツ画像の位置（x, y, 幅, 高さ）。元の SVG の座標系（viewBox 128 46 846 934）のまま
  const PARTS = { tail:[566,298,377,572], apple:[759,86,198,249], body:[212,595,437,378], patch:[499,623,119,253],
                  armR:[557,622,127,241], earL:[164,57,218,251], earR:[558,60,175,250], head:[141,179,619,462] };
  const EYES = [
    { cx:296.2, cy:409.5, rx:27, ry:46.6, rot:3.6, hx:288.5, hy:384, hrx:7.5, hry:10 },
    { cx:544.5, cy:417.1, rx:28, ry:46, rot:3.1, hx:536, hy:391, hrx:6.2, hry:7.8 },
  ];
  const FACE = '#3AB7C2';
  const LINE = `fill="none" stroke="${FACE}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"`;
  let uid = 0;

  const part = k => { const [x, y, w, h] = PARTS[k];
    return `<image href="assets/chappy/${k}.webp" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>`; };

  // mood: normal / happy / sleep / ouch
  function face(mood, grad){
    const eyes = EYES.map((e, i) => {
      if(mood === 'happy') return `<path d="M${e.cx - 25},${e.cy + 10} Q${e.cx},${e.cy - 40} ${e.cx + 25},${e.cy + 10}" ${LINE}/>`;
      if(mood === 'sleep') return `<path d="M${e.cx - 24},${e.cy + 2} Q${e.cx},${e.cy + 22} ${e.cx + 24},${e.cy + 2}" ${LINE}/>`;
      if(mood === 'ouch'){ const s = i ? -1 : 1; return `<path d="M${e.cx - 22 * s},${e.cy - 26} L${e.cx + 20 * s},${e.cy} L${e.cx - 22 * s},${e.cy + 26}" ${LINE}/>`; }
      return `<g transform="rotate(${e.rot} ${e.cx} ${e.cy})"><ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="url(#${grad})"/>`
           + `<ellipse cx="${e.hx}" cy="${e.hy}" rx="${e.hrx}" ry="${e.hry}" transform="rotate(-18 ${e.hx} ${e.hy})" fill="#E8FCFD" opacity=".92"/></g>`;
    }).join('');
    const mouth = mood === 'ouch'
      ? `<path d="M372,490 L388,476 L404,490 L420,476 L436,490 L452,476 L468,490" ${LINE.replace('14', '11')}/>`
      : `<path d="M367,474 C371,494 383,499 393,498 C405,497 412,490 416,484 C421,491 428,499 440,500 C452,500 464,493 469,474" ${LINE.replace('14', '12')}/>`;
    return `<g class="cp-face"><g class="cp-look"><g class="cp-eyes">${eyes}</g></g><g class="cp-mouth">${mouth}</g></g>`;
  }

  // cls に "wave" を付けると手をふる
  function svg(mood = 'normal', cls = ''){
    const id = 'cp' + (++uid);
    return `<svg class="cp cp-${mood} ${cls}" viewBox="128 46 846 934" role="img" aria-label="チャッピー">`
      + `<defs><linearGradient id="${id}e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4FC5D0"/><stop offset="1" stop-color="#2EA6B3"/></linearGradient>`
      + `<radialGradient id="${id}s"><stop offset="0" stop-color="#1D3A36" stop-opacity=".22"/><stop offset="1" stop-color="#1D3A36" stop-opacity="0"/></radialGradient></defs>`
      + `<ellipse class="cp-shadow" cx="448" cy="966" rx="210" ry="18" fill="url(#${id}s)"/>`
      + `<g class="cp-all"><g class="cp-tail">${part('tail')}<g class="cp-apple">${part('apple')}</g></g>${part('body')}`
      + `<g class="cp-patch">${part('patch')}</g><g class="cp-armR">${part('armR')}</g>`
      + `<g class="cp-head"><g class="cp-earL">${part('earL')}</g><g class="cp-earR">${part('earR')}</g>${part('head')}${face(mood, id + 'e')}</g></g></svg>`;
  }

  global.Chappy2D = { svg };
})(window);
