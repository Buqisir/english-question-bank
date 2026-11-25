const {chromium}=require('playwright');const dir=process.argv[2];(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1500,height:2000}});
for(const n of [2,3,4,5,6,7,8]){await p.goto('file://'+dir+'/p'+n+'.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);await p.screenshot({path:dir+'/p'+n+'.png'});}await b.close();})()
