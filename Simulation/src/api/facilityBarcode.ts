// 시설 위치 ID를 검증 가능한 EAN-13으로 표현한다. 상품 담기 코드와 분리한다.
const KINDS = ["ATM", "RESTROOM_M", "RESTROOM_F", "LOUNGE", "RESTROOM_FAMILY", "WATER"];
export function facilityBarcode(locationId: string): string | null {
 const m=/^F([1-3])-X-([A-Z_]+)-(\d{1,3})$/.exec(locationId);
 if(!m) return null;
 const kind=KINDS.indexOf(m[2]); if(kind<0) return null;
 const body=`29${m[1]}${String(kind+1).padStart(2,"0")}${m[3].padStart(3,"0")}0000`;
 const sum=[...body].reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0);
 return body+String((10-sum%10)%10);
}
