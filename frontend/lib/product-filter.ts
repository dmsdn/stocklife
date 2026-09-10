export interface ProductFilters {categories:string[];statuses:string[];priceRange:[number,number]}
export function filterProducts<T extends {categoryL1:string;discontinued:boolean;finalPriceKrw:number}>(products:T[], filters:ProductFilters): T[] {
 return products.filter(p=>(!filters.categories.length||filters.categories.includes(p.categoryL1))
   && (!filters.statuses.length || (filters.statuses.includes('단종')&&p.discontinued) || (filters.statuses.includes('일반')&&!p.discontinued))
   && p.finalPriceKrw>=filters.priceRange[0] && p.finalPriceKrw<=filters.priceRange[1]);
}
