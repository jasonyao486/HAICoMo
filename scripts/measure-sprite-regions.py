"""Read alpha projections into renderer crop metadata; never modify source pixels."""
from pathlib import Path
from PIL import Image
import numpy as np,json
root=Path(__file__).resolve().parents[1]
families=['chatgpt','claude','gemini','deepseek','grok','kimi','glm','minimax','mistral','qwen','llama','seedance','ernie','perplexity']
def cuts(projection):
 n=len(projection);result=[0]
 for i in range(1,4):
  centre=n*i/4; lo,hi=int(centre-n*.065),int(centre+n*.065)
  p=projection[lo:hi]; candidates=np.where(p==p.min())[0]+lo
  result.append(int(min(candidates,key=lambda v:abs(v-centre))))
 return result+[n]
regions={}
for family in families:
 im=Image.open(root/'public/local-assets'/f'{family}-atlas.png').convert('RGBA');a=np.asarray(im)[:,:,3]>64
 ys=cuts(a.sum(1));frames=[]
 for row in range(4):
  xs=cuts(a[ys[row]:ys[row+1]].sum(0))
  for col in range(4):
   mask=a[ys[row]:ys[row+1],xs[col]:xs[col+1]];yy,xx=np.where(mask)
   x=xs[col]+int(xx.min());y=ys[row]+int(yy.min());w=int(xx.max()-xx.min()+1);h=int(yy.max()-yy.min()+1)
   frames.append([x,y,w,h])
 regions[family]=frames
(root/'src/shared/sprite-regions.ts').write_text('// Generated alpha projection measurements; source PNG pixels are unchanged.\nexport const SPRITE_REGIONS: Record<string, [number, number, number, number][]> = '+json.dumps(regions,indent=2)+';\n')
print('Measured',len(regions),'atlases; 224 source regions.')
