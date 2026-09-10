import type { GridPoint } from './types';
const distance=(a:GridPoint,b:GridPoint)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
/** 표시된 한 구간 안에서만 걷는다. 층이 끊긴 구간을 선으로 연결하지 않는다. */
export function displayedPath(segments:GridPoint[][],start:GridPoint,goal:GridPoint,walkable:(p:GridPoint)=>boolean,connect:(a:GridPoint,b:GridPoint)=>GridPoint[]):GridPoint[]|null {
 let best:GridPoint[]|null=null, bestJoin=Infinity;
 const minGoal=Math.min(...segments.flat().map(p=>distance(p,goal)));
 if(minGoal>2)return null; // 안내선에 없는 매대는 일반 이동으로 처리한다.
 for(const points of segments) {
  if(!points.length || points.some((p,i)=>!walkable(p)||(i>0&&distance(points[i-1],p)>1)))continue;
  const ends=points.map((p,i)=>distance(p,goal)===minGoal?i:-1).filter(i=>i>=0);
  if(!ends.length)continue;
  const minStart=Math.min(...points.map(p=>distance(p,start)));
  for(let from=0;from<points.length;from++) {
   if(distance(points[from],start)!==minStart)continue;
   const join=distance(points[from],start)===0?[start]:connect(start,points[from]);
   if(!join.length || distance(join[join.length-1],points[from])!==0)continue;
   for(const to of ends) {
    const section=from<=to?points.slice(from,to+1):points.slice(to,from+1).reverse();
    const path=[...join,...section.slice(1)];
    if(join.length<bestJoin||(join.length===bestJoin&&(!best||path.length<best.length))) {best=path;bestJoin=join.length;}
   }
  }
 }
 return best;
}
