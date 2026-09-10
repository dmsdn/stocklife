import {getMemberToken} from './memberAuth';
export interface GuestGroup {id:number;title:string;products:{id:number;name:string;price:number;quantity:number;checked:boolean;image?:string}[]}
let snapshot: GuestGroup[] | null = null;
export function acceptGuestGroups(value: unknown) {
  if (getMemberToken() || !Array.isArray(value)) return;
  snapshot = value.filter(g => g && Number.isFinite(g.id) && typeof g.title === 'string' && Array.isArray(g.products)).slice(0,40);
}
export function guestGroups(): GuestGroup[] {
  if (getMemberToken()) return [];
  if (snapshot) return snapshot;
  try {const v=JSON.parse(localStorage.getItem('storeflow_cart_groups') ?? '[]');return Array.isArray(v)?v:[];} catch {return [];}
}
export function guestOptions() {
 return guestGroups().map(g => ({cartGroupId:g.id,title:g.title,status:'ACTIVE' as const,itemCount:g.products.length,
 items:g.products.map(p => ({cartItemId:-p.id,skuId:p.id,quantity:p.quantity,checked:p.checked}))}));
}
export function guestItems() {
 return guestGroups().flatMap(g => g.products.map(p => ({cartItemId:-p.id,skuId:p.id,name:p.name,price:p.price,stock:p.quantity,qty:p.quantity,locationId:''})));
}
