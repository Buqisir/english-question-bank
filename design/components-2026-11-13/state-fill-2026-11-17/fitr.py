import sys, numpy as np
from PIL import Image
from scipy import ndimage, optimize
def fit(path):
    im=np.asarray(Image.open(path).convert('RGB')).astype(float); g=im.mean(2)
    H,W=g.shape; out=[]
    # 候选填充色：灰度在 220..245、近中性、成块
    for fill in range(222,246):
        m=(np.abs(g-fill)<0.6)&(np.ptp(im,2)<3)
        lab,n=ndimage.label(m)
        for sl in ndimage.find_objects(lab):
            if sl is None: continue
            h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
            if not(40<=h<=80 and 40<=w<=700): continue
            area=(lab[sl]>0).sum()
            if area<0.8*h*w: continue
            y0,y1,x0,x1=sl[0].start,sl[0].stop,sl[1].start,sl[1].stop
            # 背景色：块左外 6px 的中位
            if x0<8: continue
            bg=np.median(g[(y0+y1)//2, x0-8:x0-3])
            if abs(bg-fill)<2: continue
            # 外扩到抗锯齿边：在 [y0-3,y1+3]x[x0-3,x1+3] 计算覆盖率
            Y0,Y1,X0,X1=max(0,y0-3),min(H,y1+3),max(0,x0-3),min(W,x1+3)
            cov=np.clip((g[Y0:Y1,X0:X1]-bg)/(fill-bg),0,1)
            # 实际直边位置（中间行/列的覆盖和）
            midr=cov[(y1-y0)//2+ (y0-Y0)]; left=X0+ (np.argmax(midr>0.5)) ;
            colsum=cov.sum(0); rowsum=cov.sum(1)
            top=Y0+(Y1-Y0)-rowsum[(x1-x0)//2+(x0-X0)] if False else None
            # 用左上角：每行的左缘亚像素 = 中线左缘 + (中线行覆盖长 - 本行覆盖长) 的一半(对称)
            mid=cov[(y1-y0)//2+(y0-Y0)].sum()
            L=X0+np.argmax(cov[(y1-y0)//2+(y0-Y0)]>0)  # 粗
            # 精确左边界与上边界：用列和、行和的饱和值
            fullh=cov[:, (x1-x0)//2+(x0-X0)].sum(); fullw=mid
            # 左缘亚像素 x_l：中线行从左数，覆盖累积
            row=cov[(y1-y0)//2+(y0-Y0)]; xl=X0+ (len(row)-row[::-1].cumsum().searchsorted(1e9) ) if False else None
            pts=[]
            for side in ('tl','tr','bl','br'):
                c=cov if side=='tl' else cov[:,::-1] if side=='tr' else cov[::-1,:] if side=='bl' else cov[::-1,::-1]
                rows=c.sum(1)  # 每行覆盖长度
                full=rows[len(rows)//2]
                colsums=c.sum(0); fullc=colsums[len(colsums)//2]
                # 顶边亚像素：中列的空白长度
                ctop=c[:, c.shape[1]//2]; top=np.argmax(ctop>0)+(1-ctop[np.argmax(ctop>0)])
                for yy in range(int(top), int(top)+24):
                    ycen=yy+0.5-top
                    gap=(full-rows[yy])/2  # 左右对称，每边缺口
                    if gap<=0.05: break
                    pts.append((gap,ycen))
            if len(pts)<6: continue
            P=np.array(pts)
            def res(r): return np.hypot(P[:,0]-r, P[:,1]-r)-r
            r=optimize.least_squares(lambda v: res(v[0]),[10]).x[0]
            e=np.sqrt(np.mean(res(r)**2))
            out.append((path.split('/')[-1],fill,int(bg),w,h,round(r/2,2),round(e/2,2),len(pts)))
    return out
for p in sys.argv[1:]:
    for o in fit(p): print(o)
