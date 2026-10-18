var W = innerWidth, H = innerHeight;
var gy = H * 0.7;
var pw = 110;
var g = 0.6, spd = 4, jv = -13;
var flyT = 150, flyP = -0.5;
var maxP = 10;

var world = document.getElementById('world');
var ground = document.getElementById('ground');
var menuBtn = document.getElementById('menuBtn');
var panel = document.getElementById('panel');
var mask = document.getElementById('panelMask');
var nameInput = document.getElementById('nameInput');
var nameBtn = document.getElementById('nameBtn');
var myRoomInput = document.getElementById('myRoomInput');
var copyBtn = document.getElementById('copyBtn');
var joinRoomInput = document.getElementById('joinRoomInput');
var joinBtn = document.getElementById('joinBtn');
var imgInput = document.getElementById('imgInput');
var countLabel = document.getElementById('countLabel');
var chatInput = document.getElementById('chatInput');
var sendBtn = document.getElementById('sendBtn');
var joyBase = document.getElementById('joystickBase');
var joyKnob = document.getElementById('joystickKnob');
var jumpBtn = document.getElementById('jumpBtn');
var toastEl = document.getElementById('toast');

var me = null;
var peer = null;
var myRoom = '';
var myName = '';
var myNum = 1;
var isHost = false;
var joined = false;
var seq = 1;
var others = {};
var conns = {};
var myImgData = '';
var fallbackImg = '';

var savedName = localStorage.getItem('bb_name');
if (savedName) { myName = savedName; nameInput.value = savedName; }

var tt = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  clearTimeout(tt);
  tt = setTimeout(function() { toastEl.style.display = 'none'; }, 2000);
}

var actx = null;
function beep(freq, dur, vol) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    var o = actx.createOscillator();
    var gn = actx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    gn.gain.value = vol || 0.08;
    o.connect(gn);
    gn.connect(actx.destination);
    var t = actx.currentTime;
    gn.gain.setValueAtTime(gn.gain.value, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
  } catch (e) {}
}
function sfxJoin() { beep(660, 0.12, 0.08); setTimeout(function(){ beep(880, 0.12, 0.08); }, 100); }
function sfxLeave() { beep(500, 0.12, 0.08); setTimeout(function(){ beep(330, 0.15, 0.08); }, 100); }

function clamp(v,a,b) { return v<a?a:(v>b?b:v); }
function num(v, def) { return (typeof v === 'number' && isFinite(v)) ? v : def; }

function makeFallback() {
  var cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  var ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, 62, 62);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 32, 34);
  return cv.toDataURL('image/png');
}
fallbackImg = makeFallback();

function fit() {
  W = innerWidth; H = innerHeight;
  gy = H * 0.7;
  pw = Math.min(160, Math.max(110, W * 0.28));
  ground.style.top = gy + 'px';
  if (me) {
    me.x = clamp(me.x, pw/2, W - pw/2);
    if (me.y > gy) me.y = gy;
    draw(me);
  }
  for (var id in others) draw(others[id]);
}
addEventListener('resize', fit);

function imgH(p) {
  if (p.img.naturalWidth > 0 && p.img.naturalHeight > 0) {
    return p.img.naturalHeight * pw / p.img.naturalWidth;
  }
  return pw;
}

function draw(p) {
  var h = imgH(p);
  var top = p.y - h;
  p.img.style.display = 'block';
  p.img.style.width = pw + 'px';
  p.img.style.height = 'auto';
  p.img.style.transform = 'translate(' + (p.x - pw/2) + 'px,' + top + 'px)';

  p.tag.style.left = p.x + 'px';
  p.tag.style.top = (top - 16) + 'px';
  p.tag.style.transform = 'translateX(-50%)';

  p.box.style.left = p.x + 'px';
  p.box.style.bottom = (H - (top - 18)) + 'px';
  p.box.style.transform = 'translateX(-50%)';
}

function bindLoad(p) {
  p.img.onload = function() { draw(p); };
  p.img.onerror = function() {
    if (p.img.src.indexOf('data:') !== 0) {
      p.img.src = fallbackImg;
    }
  };
}

function newPlayer() {
  var img = document.createElement('img');
  img.className = 'player';
  world.appendChild(img);

  var tag = document.createElement('div');
  tag.className = 'name-tag';
  world.appendChild(tag);

  var box = document.createElement('div');
  box.className = 'bubble-box';
  world.appendChild(box);

  var p = {
    x: W/2, y: gy, vy: 0, onGround: true,
    hold: false, holdAt: 0,
    img: img, tag: tag, box: box,
    customName: '', num: 0, seen: false, imgData: ''
  };
  bindLoad(p);
  img.src = 'player.png';
  draw(p);
  return p;
}

function cn(n) {
  var s = ['','一','二','三','四','五','六','七','八','九','十'];
  return s[n] || n;
}

function nameOf(p, self) {
  if (p.customName) return p.customName;
  if (self) return '我';
  return '用户' + cn(p.num);
}

function refreshTag(p, self) {
  p.tag.textContent = nameOf(p, self);
}

function applyImg(p, data) {
  if (!data) return;
  if (p.imgData === data) return;
  p.imgData = data;
  bindLoad(p);
  p.img.src = data;
  draw(p);
}

function ensureOther(id, info) {
  if (!peer || id === peer.id) return null;
  if (!others[id]) {
    var np = newPlayer();
    others[id] = np;
    sfxJoin();
  }
  var p = others[id];
  if (info) {
    if (info.n !== undefined) p.customName = info.n || '';
    if (info.u) p.num = info.u;
    if (info.img) applyImg(p, info.img);
    refreshTag(p, false);
  }
  p.seen = true;
  upCount();
  return p;
}

me = newPlayer();
me.num = 1;
me.customName = myName;
refreshTag(me, true);

var joy = false, jx = 0, jy = 0, dx = 0;
var JR = 40;
joyBase.addEventListener('pointerdown', function(e) {
  e.preventDefault(); e.stopPropagation();
  joy = true;
  var r = joyBase.getBoundingClientRect();
  jx = r.left + r.width/2;
  jy = r.top + r.height/2;
  joyBase.setPointerCapture(e.pointerId);
});
joyBase.addEventListener('pointermove', function(e) {
  if (!joy) return;
  e.preventDefault();
  var a = e.clientX - jx, b = e.clientY - jy;
  var d = Math.sqrt(a*a + b*b);
  if (d > JR) { a = a/d*JR; b = b/d*JR; }
  dx = a / JR;
  joyKnob.style.transform = 'translate(' + a + 'px,' + b + 'px)';
});
function endJoy() { joy = false; dx = 0; joyKnob.style.transform = 'translate(0,0)'; }
joyBase.addEventListener('pointerup', endJoy);
joyBase.addEventListener('pointercancel', endJoy);

jumpBtn.addEventListener('pointerdown', function(e) {
  e.preventDefault(); e.stopPropagation();
  if (me.onGround) { me.vy = jv; me.onGround = false; }
  else { if (me.vy > jv*0.8) me.vy = jv*0.8; }
  me.hold = true;
  me.holdAt = performance.now();
  jumpBtn.setPointerCapture(e.pointerId);
});
function endJump() { me.hold = false; }
jumpBtn.addEventListener('pointerup', endJump);
jumpBtn.addEventListener('pointercancel', endJump);

menuBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  panel.classList.add('open');
  mask.classList.add('open');
});
mask.addEventListener('click', function() {
  panel.classList.remove('open');
  mask.classList.remove('open');
});

nameBtn.addEventListener('click', function() {
  var n = nameInput.value.trim();
  myName = n;
  localStorage.setItem('bb_name', n);
  me.customName = n;
  refreshTag(me, true);
  if (n) toast('名字：' + n);
  else toast('没名字，别人看你还是默认名');
  if (joined) {
    bcast({ t: 'who', id: peer.id, n: myName, u: myNum, img: myImgData });
    bcast({ t: 'pos', x: me.x, y: me.y, n: myName, u: myNum, w: W, h: H, gy: gy });
  }
});

function rid2pid(r) {
  var h = 5381;
  for (var i = 0; i < r.length; i++) h = ((h << 5) + h + r.charCodeAt(i)) | 0;
  return 'r' + Math.abs(h).toString(36) + 'h';
}

function newRoomId() {
  var s = '';
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var i = 0; i < 6; i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function joinRoom(rid, save) {
  if (joined) leaveRoom();
  myRoom = rid;
  myRoomInput.value = rid;
  if (save) localStorage.setItem('bb_room', rid);
  countLabel.textContent = '1';
  joined = true;

  var hostId = rid2pid(rid);
  peer = new Peer(hostId, { debug: 0 });

  peer.on('open', function() {
    isHost = true;
    myNum = 1;
    seq = 1;
    me.num = 1;
    refreshTag(me, true);
    toast('进房了，你是房主：' + rid);
    peer.on('connection', onConn);
    upCount();
  });

  peer.on('error', function(err) {
    if (err.type === 'unavailable-id') {
      try { peer.destroy(); } catch(e) {}
      peer = null;
      peer = new Peer({ debug: 0 });
      peer.on('open', function() {
        isHost = false;
        peer.on('connection', onConn);
        wire(peer.connect(hostId, { reliable: true }));
        toast('进房了：' + rid);
      });
      peer.on('error', function(e2) {
        if (e2.type === 'peer-unavailable') toast('房间不存在或房主不在');
        else toast('连不上：' + e2.type);
      });
    } else {
      toast('出错：' + err.type);
    }
  });
}

function leaveRoom() {
  if (peer) { try { peer.destroy(); } catch(e){} peer = null; }
  for (var id in conns) delete conns[id];
  for (var id in others) {
    others[id].img.remove();
    others[id].tag.remove();
    others[id].box.remove();
    delete others[id];
  }
  joined = false;
  isHost = false;
}

function onConn(c) {
  if (Object.keys(conns).length >= maxP - 1) { c.close(); return; }
  wire(c);
}

function wire(c) {
  c.on('open', function() {
    if (conns[c.peer]) return;
    conns[c.peer] = c;

    c.send({ t: 'who', id: peer.id, n: myName, u: myNum, img: myImgData });
    c.send({ t: 'pos', x: me.x, y: me.y, n: myName, u: myNum, w: W, h: H, gy: gy });

    if (isHost) {
      seq++;
      var newNum = seq;
      var list = [{ id: peer.id, n: myName, u: 1, img: myImgData }];
      for (var id in others) {
        if (id === c.peer) continue;
        list.push({ id: id, n: others[id].customName, u: others[id].num, img: others[id].imgData || '' });
      }
      c.send({ t: 'hi', u: newNum, list: list });
    }
    upCount();
  });
  c.on('data', function(d) { onData(d, c); });
  c.on('close', function() { drop(c.peer); });
  c.on('error', function() { drop(c.peer); });
}

function onData(d, c) {
  if (!d || !d.t) return;

  if (d.t === 'who') {
    ensureOther(d.id || c.peer, { n: d.n, u: d.u, img: d.img });
  }

  else if (d.t === 'hi') {
    if (d.u) { myNum = d.u; me.num = myNum; refreshTag(me, true); }
    (d.list || []).forEach(function(item) {
      if (item.id === peer.id) return;
      ensureOther(item.id, item);
      if (!conns[item.id]) {
        wire(peer.connect(item.id, { reliable: true }));
      }
    });
    if (conns[c.peer]) {
      conns[c.peer].send({ t: 'who', id: peer.id, n: myName, u: myNum, img: myImgData });
    }
  }

  else if (d.t === 'pos') {
    var sx = num(d.x, null);
    var sy = num(d.y, null);
    if (sx === null || sy === null) return;
    var p = ensureOther(c.peer, { n: d.n, u: d.u });
    if (!p) return;
    var sw = num(d.w, W), sh = num(d.h, H), sgy = num(d.gy, sh*0.7);
    if (sw <= 0) sw = W;
    if (sh <= 0) sh = H;
    var nx = sx * W / sw;
    var ny = gy - (sgy - sy) * H / sh;
    if (!isFinite(nx)) nx = W/2;
    if (!isFinite(ny)) ny = gy;
    if (ny > gy) ny = gy;
    if (ny < -H) ny = -H;
    nx = clamp(nx, pw/2, W - pw/2);
    p.x = nx;
    p.y = ny;
    refreshTag(p, false);
  }

  else if (d.t === 'say') {
    var p = ensureOther(c.peer, null);
    if (p) addBubble(p, d.text);
  }

  else if (d.t === 'img') {
    var p = ensureOther(c.peer, null);
    if (p) applyImg(p, d.data);
  }
}

function drop(id) {
  if (conns[id]) delete conns[id];
  if (others[id]) {
    others[id].img.remove();
    others[id].tag.remove();
    others[id].box.remove();
    delete others[id];
    sfxLeave();
  }
  upCount();
}

function upCount() {
  countLabel.textContent = String(Object.keys(others).length + 1);
}

function bcast(o) {
  for (var id in conns) {
    try { conns[id].send(o); } catch(e) {}
  }
}

function addBubble(p, text) {
  var b = document.createElement('div');
  b.className = 'bubble';
  b.textContent = text;
  p.box.appendChild(b);
  while (p.box.children.length > 6) p.box.removeChild(p.box.firstChild);
}

function say() {
  var t = chatInput.value.trim();
  if (!t) { toast('先打字'); return; }
  chatInput.value = '';
  addBubble(me, t);
  bcast({ t: 'say', text: t });
  chatInput.blur();
}
sendBtn.addEventListener('click', say);
chatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); say(); }
});
chatInput.addEventListener('keyup', function(e) {
  if (e.keyCode === 13) { e.preventDefault(); say(); }
});

copyBtn.addEventListener('click', function() {
  var val = myRoomInput.value;
  if (!val) return;
  function done() { toast('复制了：' + val); }
  function fallback() {
    myRoomInput.removeAttribute('readonly');
    myRoomInput.select();
    myRoomInput.setSelectionRange(0, val.length);
    try {
      var ok = document.execCommand('copy');
      if (ok) done(); else toast('房间ID：' + val);
    } catch(e) {
      toast('房间ID：' + val);
    }
    myRoomInput.setAttribute('readonly', 'readonly');
    window.getSelection().removeAllRanges();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(val).then(done, fallback);
  } else {
    fallback();
  }
});

joinBtn.addEventListener('click', function() {
  var r = joinRoomInput.value.trim().toUpperCase();
  if (!r) { toast('写个房间ID'); return; }
  if (r === myRoom) { toast('已经在这个房间'); return; }
  joinRoom(r, true);
});

imgInput.addEventListener('change', function() {
  var f = imgInput.files[0];
  if (!f) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var im = new Image();
    im.onload = function() {
      var size = 128;
      var w = im.width, h = im.height;
      if (w > h) { h = h * size / w; w = size; }
      else { w = w * size / h; h = size; }
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(im, 0, 0, w, h);
      var data = cv.toDataURL('image/png');
      myImgData = data;
      me.imgData = data;
      bindLoad(me);
      me.img.src = data;
      draw(me);
      bcast({ t: 'img', data: data });
      toast('换了');
    };
    im.src = ev.target.result;
  };
  reader.readAsDataURL(f);
});

var last = performance.now();
function loop(now) {
  var dt = now - last;
  if (dt > 50) dt = 50;
  last = now;

  me.x += dx * spd;

  if (me.hold && now - me.holdAt > flyT) me.vy += flyP;
  me.vy += g;
  me.y += me.vy;

  me.x = clamp(me.x, pw/2, W - pw/2);
  if (me.y >= gy) { me.y = gy; me.vy = 0; me.onGround = true; }
  else me.onGround = false;

  draw(me);
  if (joined && Object.keys(conns).length > 0) {
    bcast({ t: 'pos', x: me.x, y: me.y, n: myName, u: myNum, w: W, h: H, gy: gy });
  }

  for (var id in others) draw(others[id]);

  requestAnimationFrame(loop);
}

fit();
requestAnimationFrame(loop);

var params = new URLSearchParams(location.search);
var urlRoom = params.get('room');
if (urlRoom) {
  joinRoom(urlRoom.toUpperCase(), true);
} else {
  var savedRoom = localStorage.getItem('bb_room');
  var room = savedRoom || newRoomId();
  joinRoom(room, true);
}

if (!myName) {
  setTimeout(function() {
    toast('没设名字，别人看你叫 用户一');
  }, 800);
}
