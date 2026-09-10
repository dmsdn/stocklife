import type {JourneyStep, PathPoint} from './navigation';
export function floorSegments(steps: Pick<JourneyStep,'path'>[], floor: number): PathPoint[][] {
 const result:PathPoint[][]=[];
 for(const step of steps){let segment:PathPoint[]=[];for(const p of step.path){if(p.floorNo===floor)segment.push(p);else if(segment.length){result.push(segment);segment=[];}}if(segment.length)result.push(segment);}
 return result;
}
export function nextDestinationSteps(steps: JourneyStep[]) {
 const index=steps.findIndex(s=>['PRODUCT','FACILITY','CHECKOUT','EXIT'].includes(s.kind));
 return index<0?steps:steps.slice(0,index+1);
}
