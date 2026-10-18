var W = innerWidth, H = innerHeight;
var gy = H * 0.7;
var pw = 110;
var g = 0.6, spd = 4, jv = -13;
var flyT = 150, flyP = -0.5;

var SUPABASE_URL = 'https://eecsrjjfjypwzgqbjtdw.supabase.co';
var SUPABASE_KEY = 'sb_publishable_FNMKaMMEoT9CMCpw39Ir1A_T5INh3SV';
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
var channel = null;

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
var myRoom = '';
var myName = '';
var myId = 'u' + Math.random().toString(36).substring(2, 8);
var others = {};
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

function newPlayer(isMe) {
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
    id: isMe ? myId : '',
    x: W/2, y: gy, vy: 0, onGround: true,
    hold: false, holdAt: 0,
    img: img, tag: tag, box: box,
    customName: isMe ? myName : '', imgData: '', isMe: isMe
  };
  bindLoad(p);
  img.src = 'player.png';
  draw(p);
  return p;
}

function refreshTag(p) {
  var txt = p.customName;
  if (!txt) {
    if (p.isMe) txt = '我';
    else {
      var nums = ['一','二','三','四','五','六','七','八','九','十'];
      var idx = Object.keys(others).indexOf(p.id) + 1;
      txt = '用户' + (nums[idx] || idx);
    }
  }
  p.tag.textContent = txt;
}

function applyImg(p, data) {
  if (!data) return;
  if (p.imgData === data) return;
  p.imgData = data;
  bindLoad(p);
  p.img.src = data;
  draw(p);
}

me = newPlayer(true);
refreshTag(me);

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
  refreshTag(me);
  if (n) toast('名字：' + n);
  else toast('没名字，别人看你还是默认名');
  if (channel) {
    channel.send({ type: 'broadcast', event: 'who', payload: { id: myId, n: myName, img: myImgData } });
  }
});

function newRoomId() {
  var s = '';
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var i = 0; i < 6; i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function joinRoom(rid, save) {
  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }
  for (var id in others) {
    others[id].img.remove();
    others[id].tag.remove();
    others[id].box.remove();
    delete others[id];
  }
  upCount();

  myRoom = rid;
  myRoomInput.value = rid;
  if (save) localStorage.setItem('bb_room', rid);

  channel = sb.channel('room_' + rid, {
    config: { broadcast: { self: false } }
  });

  channel
    .on('broadcast', { event: 'who' }, function(payload) {
      var d = payload.payload;
      if (d.id === myId) return;
      if (!others[d.id]) {
        others[d.id] = newPlayer(false);
        others[d.id].id = d.id;
        sfxJoin();
      }
      others[d.id].customName = d.n || '';
      applyImg(others[d.id], d.img);
      refreshTag(others[d.id]);
      upCount();
      
      channel.send({ type: 'broadcast', event: 'who', payload: { id: myId, n: myName, img: myImgData } });
    })
    .on('broadcast', { event: 'pos' }, function(payload) {
      var d = payload.payload;
      if (d.id === myId) return;
      if (!others[d.id]) {
        others[d.id] = newPlayer(false);
        others[d.id].id = d.id;
        sfxJoin();
        channel.send({ type: 'broadcast', event: 'who', payload: { id: myId, n: myName, img: myImgData } });
      }
      var p = others[d.id];
      p.x = d.xr * W;
      p.y = d.yr * H;
      p.x = clamp(p.x, pw/2, W - pw/2);
      if (!p.customName && d.n) {
        p.customName = d.n;
        refreshTag(p);
      }
    })
    .on('broadcast', { event: 'say' }, function(payload) {
      var d = payload.payload;
      if (d.id === myId) return;
      if (others[d.id]) addBubble(others[d.id], d.text);
    })
    .on('broadcast', { event: 'img' }, function(payload) {
      var d = payload.payload;
      if (d.id === myId) return;
      if (others[d.id]) applyImg(others[d.id], d.data);
    })
    .on('broadcast', { event: 'leave' }, function(payload) {
      var d = payload.payload;
      if (d.id === myId) return;
      if (others[d.id]) {
        others[d.id].img.remove();
        others[d.id].tag.remove();
        others[d.id].box.remove();
        delete others[d.id];
        sfxLeave();
        upCount();
      }
    });

  channel.subscribe(function(status) {
    if (status === 'SUBSCRIBED') {
      toast('进房了：' + rid);
      channel.send({ type: 'broadcast', event: 'who', payload: { id: myId, n: myName, img: myImgData } });
    }
  });
}

function upCount() {
  countLabel.textContent = String(Object.keys(others).length + 1);
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
  if (channel) {
    channel.send({ type: 'broadcast', event: 'say', payload: { id: myId, text: t } });
  }
  chatInput.blur();
}
sendBtn.addEventListener('click', say);
chatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); say(); }
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
      if (channel) {
        channel.send({ type: 'broadcast', event: 'img', payload: { id: myId, data: data } });
      }
      toast('换了');
    };
    im.src = ev.target.result;
  };
  reader.readAsDataURL(f);
});

var last = performance.now();
var lastPosTime = 0;
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

  if (channel && now - lastPosTime > 50) {
    lastPosTime = now;
    channel.send({
      type: 'broadcast', event: 'pos',
      payload: { id: myId, xr: me.x / W, yr: me.y / H, n: myName }
    });
  }

  for (var id in others) draw(others[id]);

  requestAnimationFrame(loop);
}

window.addEventListener('beforeunload', function() {
  if (channel) {
    channel.send({ type: 'broadcast', event: 'leave', payload: { id: myId } });
  }
});

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
