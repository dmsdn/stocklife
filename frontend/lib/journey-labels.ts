import type {JourneyStep} from "./navigation";
type PendingItem = JourneyStep;
export const collapseEscalatorLabels=(items:PendingItem[]):string[]=>{
    const isVertical=(it:PendingItem)=>{
      if(it.kind==="ESCALATOR"||it.label.includes("에스컬레이터")||it.label.includes("엘리베이터"))return true;
      const f0=it.path[0]?.floorNo,f1=it.path[it.path.length-1]?.floorNo;
      return f0!=null&&f1!=null&&f0!==f1;
    };
    const isBareFloor=(it:PendingItem)=>/^\s*\d+\s*층\s*$/.test(it.label);
    const startFloorOf=(it:PendingItem)=>it.path[0]?.floorNo;
    const endFloorOf=(it:PendingItem)=>it.path[it.path.length-1]?.floorNo;
    const out:string[]=[];
    let i=0;
    while(i<items.length){
      if(!isVertical(items[i])){out.push(items[i].label);i++;continue;}
      let j=i;
      let startFloor:number|undefined;
      let lastFloor:number|undefined;
      const kindLabel=items[i].label.includes("엘리베이터")?"엘리베이터":"에스컬레이터";
      while(j<items.length&&(isVertical(items[j])||isBareFloor(items[j]))){
        const s0=startFloorOf(items[j]),e0=endFloorOf(items[j]);
        if(startFloor==null)startFloor=s0;
        if(e0!=null)lastFloor=e0; else if(s0!=null)lastFloor=s0;
        j++;
      }
      if(startFloor!=null&&lastFloor!=null&&startFloor!==lastFloor){
        out.push(`${kindLabel}로 ${startFloor}층 → ${lastFloor}층 이동`);
      } else {
        for(let k=i;k<j;k++)out.push(items[k].label);
      }
      i=j;
    }
    return out;
  };
