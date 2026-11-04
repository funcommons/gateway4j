/* 原型共享图标 sprite（feather 风格描边图标，注入 <body> 顶部）
 * 用法：<svg class="ic"><use href="#i-xxx"/></svg>
 * 语法：'名称|路径段|路径段…'，段前缀 c=圆 r=方 e=椭圆 p=多边形，其余为 path */
(function () {
  var DEFS = [
    'grid|M2 3h7v7H2zM12 3h7v7h-7zM2 13h7v7H2zM12 13h7v7h-7z',
    'branch|M6 3v12|M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M18 9a9 9 0 0 1-9 9',
    'zap|p13 2 3 14 12 14 11 22 21 10 12 10',
    'box|M21 8v13H3V8|M1 3h22v5H1zM10 12h4',
    'activity|M22 12h-4l-3 9L9 3l-3 9H2',
    'terminal|M4 17l6-6-6-6|M12 19h8',
    'sliders|M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M20 16h.01|M2 14h4M10 8h4M18 16h4',
    'globe|c12 12 10 10|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
    'users|M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|c9 7 4 4|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
    'shield|M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    'search|c11 11 8 8|M21 21l-4.35-4.35',
    'plus|M12 5v14M5 12h14',
    'chev-down|M6 9l6 6 6-6',
    'chev-right|M9 18l6-6-6-6',
    'arrow-right|M5 12h14M12 5l7 7-7 7',
    'check|p20 6 9 17 4 12',
    'x|M18 6L6 18M6 6l12 12',
    'alert|M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z|M12 9v4|M12 17h.01',
    'clock|c12 12 9 9|M12 6v6l4 2',
    'more|M12 5v.01M12 12v.01M12 19v.01',
    'edit|M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
    'play|p5 3 19 12 5 21 5 3',
    'rocket|M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z|M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z|M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0|M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
    'database|e12 5 8 3|M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5|M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3',
    'cpu|r4 4 16 16 2|M9 9h6v6H9z|M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3',
    'link|M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    'filter|p22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3',
    'layers|p12 2 2 7 12 12 22 7 12 2|p2 17 12 22 22 17|M2 12l10 5 10-5',
    'refresh|M23 4v6h-6|M1 20v-6h6|M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
    'upload|M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12',
    'eye|M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z|c12 12 3 3',
    'copy|r9 9 13 13 2|M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    'git-merge|c18 6 3 3|M3 9v6|M18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M3 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    'flag|M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z|M4 22v-7'
  ]
  function seg(s) {
    s = s.trim()
    var t = s[0]
    if (t === 'c') { var a = s.slice(1).trim().split(/\s+/); return '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="' + a[2] + '" class="sp"/>' }
    if (t === 'r') { var a = s.slice(1).trim().split(/\s+/); return '<rect x="' + a[0] + '" y="' + a[1] + '" width="' + a[2] + '" height="' + a[3] + '" rx="' + (a[4] || '2') + '" class="sp"/>' }
    if (t === 'e') { var a = s.slice(1).trim().split(/\s+/); return '<ellipse cx="' + a[0] + '" cy="' + a[1] + '" rx="' + a[2] + '" ry="' + a[3] + '" class="sp"/>' }
    if (t === 'p') return '<polygon points="' + s.slice(1).trim() + '" class="sp"/>'
    return '<path d="' + s + '" class="sp"/>'
  }
  var body = DEFS.map(function (d) {
    var p = d.split('|'), id = p.shift().trim()
    return '<symbol id="i-' + id + '" viewBox="0 0 24 24">' + p.map(seg).join('') + '</symbol>'
  }).join('')
  document.write('<svg xmlns="http://www.w3.org/2000/svg" style="display:none"><defs><style>.sp{fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}</style></defs>' + body + '</svg>')
})()
