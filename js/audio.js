// Multi-instrument Web Audio engine with a look-ahead MIDI scheduler.
import {midiToFreq} from "./state.js";
const LOOKAHEAD_MS=25, SCHEDULE_AHEAD_S=0.12;
export class Engine{
  constructor(getSong){this.getSong=getSong;this.ctx=null;this.master=null;this.trackGains=new Map();this.playing=false;this.startTime=0;this.startBeat=0;this.pausedBeat=0;this.scheduledUpTo=0;this.timer=null;this.onStop=null;}
  ensureContext(){
    if(this.ctx){if(this.ctx.state==="suspended")this.ctx.resume();return;}
    this.ctx=new(window.AudioContext||window.webkitAudioContext)();
    this.master=this.ctx.createGain();this.master.gain.value=0.8;
    const limiter=this.ctx.createDynamicsCompressor();this.master.connect(limiter).connect(this.ctx.destination);
  }
  trackGain(track){
    let g=this.trackGains.get(track.id);
    if(!g){g=this.ctx.createGain();g.connect(this.master);this.trackGains.set(track.id,g);}
    return g;
  }
  syncMixer(){
    if(!this.ctx)return;
    const tracks=this.getSong().tracks,solo=tracks.some(t=>t.solo);
    for(const t of tracks)this.trackGain(t).gain.setTargetAtTime(!t.mute&&(!solo||t.solo)?t.volume:0,this.ctx.currentTime,0.01);
  }
  playNote(track,pitch,when,durationS){
    this.ensureContext();this.syncMixer();
    if(track.instrument==="drums"){this.playDrum(track,pitch,when);return;}
    const ctx=this.ctx,out=this.trackGain(track),f=midiToFreq(pitch),end=when+Math.max(0.05,durationS);
    const voice=ctx.createGain();voice.connect(out);
    const osc=ctx.createOscillator(),filter=ctx.createBiquadFilter(),amp=ctx.createGain();
    if(track.instrument==="bass"){
      osc.type="triangle";osc.frequency.setValueAtTime(f,when);
      filter.type="lowpass";filter.frequency.setValueAtTime(700,when);
      amp.gain.setValueAtTime(0.0001,when);amp.gain.linearRampToValueAtTime(0.65,when+0.012);
      amp.gain.setValueAtTime(0.55,end);amp.gain.exponentialRampToValueAtTime(0.0001,end+0.12);
    }else if(track.instrument==="synth"){
      const osc2=ctx.createOscillator(),mix=ctx.createGain();
      osc.type="sawtooth";osc.frequency.setValueAtTime(f,when);
      osc2.type="square";osc2.frequency.setValueAtTime(f*1.005,when);
      mix.gain.value=0.16;osc.connect(filter);osc2.connect(mix);mix.connect(filter);
      filter.type="lowpass";filter.frequency.setValueAtTime(2600,when);filter.frequency.exponentialRampToValueAtTime(900,end+0.25);
      amp.gain.setValueAtTime(0.0001,when);amp.gain.linearRampToValueAtTime(0.24,when+0.025);
      amp.gain.setValueAtTime(0.2,end);amp.gain.exponentialRampToValueAtTime(0.0001,end+0.25);
      filter.connect(amp);amp.connect(voice);osc.start(when);osc2.start(when);osc.stop(end+0.3);osc2.stop(end+0.3);
      return;
    }else{
      osc.type="sine";osc.frequency.setValueAtTime(f,when);
      filter.type="lowpass";filter.frequency.setValueAtTime(Math.min(9000,f*9),when);
      filter.frequency.exponentialRampToValueAtTime(Math.max(500,f*2),when+0.65);
      amp.gain.setValueAtTime(0.0001,when);amp.gain.linearRampToValueAtTime(0.42,when+0.005);
      amp.gain.setValueAtTime(0.34,end);amp.gain.exponentialRampToValueAtTime(0.0001,end+0.2);
    }
    osc.connect(filter);filter.connect(amp);amp.connect(voice);osc.start(when);osc.stop(end+0.35);
  }
  playDrum(track,pitch,when){
    const ctx=this.ctx,out=this.trackGain(track),voice=ctx.createGain();voice.connect(out);
    if(pitch<=38){
      const osc=ctx.createOscillator(),g=ctx.createGain();osc.type="sine";
      osc.frequency.setValueAtTime(pitch===36?145:190,when);osc.frequency.exponentialRampToValueAtTime(42,when+0.16);
      g.gain.setValueAtTime(0.8,when);g.gain.exponentialRampToValueAtTime(0.001,when+0.22);
      osc.connect(g).connect(voice);osc.start(when);osc.stop(when+0.24);
    }else{
      const length=Math.floor(ctx.sampleRate*(pitch===46?0.32:0.16));
      const buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<length;i++)data[i]=Math.random()*2-1;
      const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();
      src.buffer=buffer;filter.type="highpass";filter.frequency.value=pitch===42?6500:1300;
      g.gain.setValueAtTime(pitch===42?0.22:0.5,when);g.gain.exponentialRampToValueAtTime(0.001,when+(pitch===46?0.3:0.14));
      src.connect(filter).connect(g).connect(voice);src.start(when);
    }
  }
  preview(track,pitch,seconds=0.55){this.ensureContext();this.playNote(track,pitch,this.ctx.currentTime+0.005,seconds);}
  get secondsPerBeat(){return 60/this.getSong().bpm;}
  get loopBeats(){return this.getSong().bars*4;}
  currentBeat(){if(!this.playing)return this.pausedBeat;const a=this.startBeat+(this.ctx.currentTime-this.startTime)/this.secondsPerBeat;return a%this.loopBeats;}
  play(){if(this.playing)return;this.ensureContext();this.syncMixer();this.playing=true;this.startBeat=this.pausedBeat;this.startTime=this.ctx.currentTime+0.05;this.scheduledUpTo=this.startBeat;this.timer=setInterval(()=>this.tick(),LOOKAHEAD_MS);this.tick();}
  pause(){if(!this.playing)return;this.pausedBeat=this.currentBeat();this.halt();}
  stop(){this.pausedBeat=0;this.halt();}
  halt(){this.playing=false;clearInterval(this.timer);this.timer=null;if(this.ctx){for(const g of this.trackGains.values())g.disconnect();this.trackGains.clear();}if(this.onStop)this.onStop();}
  retime(){if(!this.playing)return;const here=this.startBeat+(this.ctx.currentTime-this.startTime)/this.secondsPerBeat;this.startBeat=here;this.startTime=this.ctx.currentTime;}
  tick(){
    if(!this.playing)return;
    const spb=this.secondsPerBeat,loop=this.loopBeats,now=this.startBeat+(this.ctx.currentTime-this.startTime)/spb,end=now+SCHEDULE_AHEAD_S/spb;
    const from=Math.max(this.scheduledUpTo,now);if(from>=end)return;
    const song=this.getSong(),first=Math.floor(from/loop),last=Math.floor(end/loop);
    for(let k=first;k<=last;k++)for(const track of song.tracks)for(const clip of track.clips||[])for(const n of clip.notes||[]){
      const abs=k*loop+clip.start+n.start;
      if(abs>=from&&abs<end&&clip.start+n.start<loop){
        const when=this.startTime+(abs-this.startBeat)*spb;
        this.playNote(track,n.pitch,when,Math.min(n.length,clip.length-n.start)*spb);
      }
    }
    this.scheduledUpTo=end;
  }
}
