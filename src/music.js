// 程序化太空氛围音乐（Web Audio，无需任何音频素材，离线可用、无版权问题）。
// 设计：缓慢演化的合成器铺底（detune 叠加的暖 pad）+ 五声音阶随机点缀的清脆音粒
// + 反馈延迟营造的空间感。整体音量很低，作为背景陪衬。
export function createAmbientMusic() {
  let ctx = null;
  let master = null;
  let padFilter = null; // 点缀音连接的滤波器
  let playing = false;
  let twinkleTimer = null;
  const nodes = [];

  // A 小调五声：A C D E G，跨两个八度，用于随机点缀
  const TWINKLE = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
  // 铺底和弦：A2 / E3 / A3 / B3 / D4（挂留音，太空感）
  const PAD = [110.0, 164.81, 220.0, 246.94, 293.66];

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = 0.0001; // 从静音淡入
    master.connect(ctx.destination);

    // 空间感：反馈延迟
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.55;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    // 暖色低通 + 缓慢 LFO 扫动截止频率
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 0.7;
    filter.connect(master);
    filter.connect(delay);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05; // 20 秒一个周期
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    nodes.push(lfo);

    // 铺底 pad：每个音两把略微 detune 的振荡器
    const padGain = ctx.createGain();
    padGain.gain.value = 0.12;
    padGain.connect(filter);
    for (const f of PAD) {
      for (const det of [-4, 5]) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.5 / PAD.length;
        o.connect(g);
        g.connect(padGain);
        o.start();
        nodes.push(o);
      }
    }

    // 主音量缓慢起伏（呼吸感）
    const swell = ctx.createOscillator();
    const swellGain = ctx.createGain();
    swell.frequency.value = 0.03;
    swellGain.gain.value = 0.04;
    swell.connect(swellGain);
    swellGain.connect(master.gain);
    swell.start();
    nodes.push(swell);

    padFilter = filter; // 供点缀音连接
  }

  // 随机点缀：清脆的正弦音粒，随机左右声像 + 快速包络
  function twinkle() {
    if (!playing || !ctx) return;
    const now = ctx.currentTime;
    const f = TWINKLE[(Math.random() * TWINKLE.length) | 0];
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    o.connect(g);
    g.connect(pan);
    pan.connect(padFilter);
    pan.connect(master);
    o.start(now);
    o.stop(now + 2.4);
    // 下一颗音粒：2~7 秒后
    twinkleTimer = setTimeout(twinkle, 2000 + Math.random() * 5000);
  }

  function start() {
    if (playing) return;
    if (!ctx) build();
    playing = true;
    ctx.resume?.();
    // 淡入
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
    master.gain.exponentialRampToValueAtTime(0.6, now + 4);
    twinkleTimer = setTimeout(twinkle, 1500);
  }

  function stop() {
    if (!playing || !ctx) return;
    playing = false;
    clearTimeout(twinkleTimer);
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
  }

  function toggle() {
    if (playing) stop();
    else start();
    return playing;
  }

  return { start, stop, toggle, get playing() { return playing; } };
}
