// Song model. Notes live inside clips; legacy tracks with flat notes are migrated.
export const SCHEMA_VERSION = 2;
export function uid(){ return Math.random().toString(36).slice(2,10); }
export function newClip(start=0,length=4){
  return {id:uid(), name:"MIDI", start, length, notes:[]};
}
export function newTrack(index){
  return {id:uid(),name:"Instrument "+index,instrument:"piano",volume:0.8,mute:false,solo:false,clips:[newClip()]};
}
export function newSong(){
  return {version:SCHEMA_VERSION,title:"Untitled song",bpm:120,bars:4,tracks:[]};
}
export function normalizeSong(raw){
  const song=newSong();
  if(!raw||typeof raw!=="object") return song;
  song.title=typeof raw.title==="string"?raw.title:song.title;
  song.bpm=clamp(Number(raw.bpm)||120,40,240);
  song.bars=clamp(Math.round(Number(raw.bars)||4),1,64);
  song.tracks=(Array.isArray(raw.tracks)?raw.tracks:[]).map((t,i)=>{
    const track={id:t.id||uid(),name:typeof t.name==="string"?t.name:"Track "+(i+1),
      instrument:INSTRUMENTS[t.instrument]?t.instrument:"piano",
      volume:clamp(Number(t.volume??0.8),0,1),mute:!!t.mute,solo:!!t.solo,clips:[]};
    if(Array.isArray(t.clips)){
      track.clips=t.clips.map((c,j)=>({
        id:c.id||uid(),name:typeof c.name==="string"?c.name:"MIDI",
        start:Math.max(0,Number(c.start)||0),length:Math.max(0.25,Number(c.length)||4),
        notes:normalizeNotes(c.notes)
      }));
    } else if(Array.isArray(t.notes)&&t.notes.length){
      track.clips=[{...newClip(0,Math.max(4,song.bars*4)),notes:normalizeNotes(t.notes)}];
    }
    if(!track.clips.length) track.clips=[newClip(0,4)];
    return track;
  });
  return song;
}
function normalizeNotes(notes){
  return (Array.isArray(notes)?notes:[]).map(n=>({
    id:n.id||uid(),pitch:clamp(Math.round(Number(n.pitch)||60),0,127),
    start:Math.max(0,Number(n.start)||0),length:Math.max(0.0625,Number(n.length)||0.25)
  }));
}
export const INSTRUMENTS={
  piano:"Grand Piano",synth:"Synth",bass:"Bass",drums:"Drum Kit"
};
export function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}
const NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
export function noteName(midi){return NAMES[midi%12]+(Math.floor(midi/12)-1);}
export function isBlackKey(midi){return [1,3,6,8,10].includes(midi%12);}
export function midiToFreq(midi){return 440*Math.pow(2,(midi-69)/12);}
