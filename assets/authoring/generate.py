"""One-time asset authoring. Requires draw, draw-sheet, sfx-synth and music.
The application build only bundles the resulting committed files.
"""
import json
import math
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
A = ROOT / 'assets'

def run(binary, *args):
    subprocess.run([binary, *map(str, args)], check=True, stdout=subprocess.DEVNULL)

def sprite(name, kind, frame=0):
    pixels = []
    for y in range(32):
        for x in range(32):
            color = None
            if kind == 'body':
                d = abs(y - 15.5)
                if d < 11:
                    color = '#0c665fff' if d > 8 else '#19ba9fff' if d > 5 else '#5bf2caff'
                    if 8 < y < 22 and x % 8 in (0, 1):
                        color = '#159d8aff'
                    if y == 7: color = '#b7ffe0ff'
            elif kind == 'corner':
                # A quarter-annulus: right and bottom exits have matching body widths.
                d = math.hypot(x - 31.5, y - 31.5)
                if 5 < d < 27:
                    color = '#0c665fff' if d > 25 or d < 8 else '#19ba9fff' if d > 22 or d < 11 else '#5bf2caff'
                    if 23 < d < 24: color = '#b7ffe0ff'
                    if int(math.atan2(31.5-y,31.5-x)*16) % 5 == 0 and 12 < d < 21: color = '#159d8aff'
            elif kind == 'tail':
                width = 1 + x * .34
                d = abs(y - 15.5)
                if d < width:
                    color = '#0c665fff' if d > width - 2 else '#19ba9fff' if d > width - 4 else '#5bf2caff'
            else:
                # Broad armored crown, snout, bright paired eyes, articulated jaws.
                spread = [0, 3, 7, 3][frame]
                if x < 9 and 5 <= y <= 26: color = '#19ba9fff'
                if 5 <= x <= 24 and 3 <= y <= 28 and not (x < 9 and (y < 5 or y > 26)):
                    color = '#39dcb8ff'
                if 10 <= x <= 23 and 5 <= y <= 26: color = '#a1ffddff'
                if 24 <= x <= 30 and 7-spread//2 <= y <= 24+spread//2: color = '#65f8cfff'
                if x >= 19 and abs(y-15.5) < spread: color = None
                if 12 <= x <= 18 and (7 <= y <= 11 or 20 <= y <= 24): color = '#06282dff'
                if 15 <= x <= 18 and (8 <= y <= 10 or 21 <= y <= 23): color = '#fff2a3ff'
                if x in (25, 26) and (y == 9-spread//2 or y == 22+spread//2): color = '#f1fff4ff'
                if frame == 0 and 23 <= x <= 30 and y == 16: color = '#12615dff'
                if 5 <= x <= 9 and y in (6, 25): color = '#d4ffedff'
            if color:
                pixels.append({'op':'fill_rect','x':x,'y':y,'width':1,'height':1,'color':color})
    log = A / 'authoring' / (name.replace('/','-') + '.json')
    log.write_text(json.dumps(pixels))
    run('draw-sheet' if kind == 'head' else 'draw', 'render', '--actions', log, '--out', A/'snake'/f'{name}.png', '--width',32,'--height',32,'--no-layers')

for kind in ('body','corner','tail'): sprite(kind,kind)
for f in range(4): sprite(f'head/{f}','head',f)

def config(name, duration, music=False):
    c = {'sample_rate':44100,'channels':'stereo','max_duration_ms':duration,'seed':42,'actions':str(A/'authoring'/f'{name}-ops.json'),'preview':str(A/'authoring'/f'{name}-preview.png'),'wav':str(A/'audio'/f'{name}.wav')}
    if music: c.update({'mid':str(A/'authoring'/'music.mid'),'instrument_bank':'synthwave'})
    path=A/'authoring'/f'{name}-config.json'
    path.write_text(json.dumps(c))
    return path

for name, dur, voices in [('eat',90,[('triangle',880,65,-15,0,1320)]),('combo-up',180,[('sine',1320,95,-18,0,1760),('triangle',1760,75,-21,45,2200)]),('death',650,[('saw',180,520,-20,0,42),('noise',100,320,-28,0,100),('sine',80,600,-15,0,32)])]:
    c=config(name,dur)
    run('sfx-synth','--config',c,'init')
    for i,(wave,freq,length,gain,start,end) in enumerate(voices):
        v=f'v{i}'
        run('sfx-synth','--config',c,'add-voice','--name',v,'--wave',wave,'--freq',freq,'--dur',length,f'--gain={gain}','--start',start)
        run('sfx-synth','--config',c,'set-envelope','--voice',v,'--env','pluck')
        run('sfx-synth','--config',c,'set-pitch','--voice',v,'--slide-to',end,'--over',length)
    run('sfx-synth','--config',c,'render')

c=config('music',16000,True)
run('music','--config',c,'init')
run('music','--config',c,'set-tempo','--bpm',120)
for name,wave,gain in [('bass','triangle',-21),('arp','sine',-25),('pad','triangle',-31)]:
    run('music','--config',c,'define-track','--name',name,'--instrument',wave)
    run('music','--config',c,'set-track-fx','--track',name,f'--gain={gain}','--env','pluck' if name!='pad' else 'swell')
for bar,root in enumerate([45,41,48,43]*2):
    for beat in range(4):
        run('music','--config',c,'add-note','--track','bass','--pitch',root,'--t',bar*4+beat,'--dur',.8,'--velocity',72)
    for step,offset in enumerate([12,19,24,19,15,19,24,27]):
        run('music','--config',c,'add-note','--track','arp','--pitch',root+offset,'--t',bar*4+step*.5,'--dur',.35,'--velocity',60)
    for offset in [12,15,19]:
        run('music','--config',c,'add-note','--track','pad','--pitch',root+offset,'--t',bar*4,'--dur',3.8,'--velocity',55)
run('music','--config',c,'render')
# Trim the render's release tail to an exact eight-bar loop; all final notes
# have already decayed before the seam. No generation occurs during npm build.
import wave
p=A/'audio'/'music.wav'
with wave.open(str(p),'rb') as w:
    params=w.getparams(); frames=w.readframes(44100*16)
frames += bytes(max(0, 44100*16*params.nchannels*params.sampwidth-len(frames)))
with wave.open(str(p),'wb') as w:
    w.setparams(params); w.writeframes(frames)
print('Generated seven sprites and four audio cues.')
