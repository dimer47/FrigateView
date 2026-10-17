from PIL import Image, ImageDraw
import sys
out = sys.argv[1]
K=4; N=512*K
im=Image.new('RGBA',(N,N),(0,0,0,0)); d=ImageDraw.Draw(im)
B=(59,130,246,255); W=(255,255,255,255)
d.rounded_rectangle((0,0,N-1,N-1),radius=80*K,fill=B)
c=256*K
def circ(r,f): d.ellipse((c-r*K,c-r*K,c+r*K,c+r*K),fill=f)
circ(150,W); circ(110,B); circ(55,W)
im=im.resize((512,512),Image.LANCZOS)
im.save(out+'/icon.png')
im.save(out+'/icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
im.save(out+'/icon.icns')
