"""장보기 제약·종단·재계산 계약을 검증한다. 합성 SoT이며 실제 구매나 학습을 실행하지 않는다."""
import itertools
import random
import unittest
from unittest.mock import patch

from app.tools import shopping_route as sr


class OrderChecks(unittest.TestCase):
    def test_exact_against_enumeration(self):
        rng = random.Random(908)
        for n in range(1, 8):
            for _ in range(5):
                # 비대칭 비용도 허용하는 작은 문제의 모든 순서를 직접 열거한다.
                cost = [[0 if i==j else rng.randrange(1,50) for j in range(n+4)] for i in range(n+4)]
                phases = [rng.randrange(3) for _ in range(n)]
                valid = [order for order in itertools.permutations(range(1,n+1))
                         if [phases[j-1] for j in order] == sorted(phases)]
                expected = min(sum(cost[a][b] for a,b in zip((0,)+order,order))
                               +min(cost[order[-1]][t]+cost[t][n+3] for t in (n+1,n+2)) for order in valid)
                order,t,value,exact=sr.solve_order(cost,phases,[n+1,n+2],n+3)
                self.assertEqual(value,expected)
                self.assertTrue(exact)
                self.assertEqual([phases[j-1] for j in order],sorted(phases))

    def test_checkout_exit_cost_changes_choice(self):
        # 가까운 계산대2에서 출구가 멀다. 마지막 상품 거리만 보면 틀린 계산대를 고른다.
        c=[[0,1,2,4,9],[1,0,1,3,8],[2,1,0,2,20],[4,3,2,0,1],[9,8,20,1,0]]
        self.assertEqual(sr.solve_order(c,[0],[2,3],4)[1:3],(3,5))

    def test_large_list_keeps_phase_and_every_item(self):
        n=30; c=[[abs(i-j) for j in range(n+3)] for i in range(n+3)]
        phases=[i%3 for i in range(n)]
        order,_,_,exact=sr.solve_order(c,phases,[n+1],n+2)
        self.assertFalse(exact)
        self.assertEqual(set(order),set(range(1,n+1)))
        self.assertEqual([phases[j-1] for j in order],sorted(phases))

    def test_cold_container_is_not_food(self):
        self.assertEqual(sr.cold_phase(dict(name="냉동밥 보관 용기",is_frozen=False,is_fresh=False,is_refrigerated=False)),0)
        self.assertEqual(sr.cold_phase(dict(is_frozen=True,is_fresh=True,is_refrigerated=True)),2)
        with self.assertRaises(ValueError): sr.cold_phase({"name":"우유"})

    def test_escalators_in_between_and_arrival_origin(self):
        path=[dict(floorNo=1,x=88,y=65),dict(floorNo=1,x=88,y=66),dict(floorNo=2,x=88,y=66),dict(floorNo=3,x=88,y=66),dict(floorNo=3,x=87,y=66)]
        steps=sr.split_steps([{"path":path}],[{"kind":"PRODUCT","skuId":1}])
        self.assertEqual([s["kind"] for s in steps],["WALK","ESCALATOR","WALK","ESCALATOR","PRODUCT"])
        self.assertEqual(steps[-1]["path"][0],path[3])
        self.assertEqual(sum(s["distance"] for s in steps),8)


class JourneyChecks(unittest.TestCase):
    def setUp(self):
        self.facilities=[dict(location_id=k,kind=kind,label=kind,floor_no=1,x=x,y=1)
                         for k,kind,x in [('entrance','ENTRANCE',0),('cash','CHECKOUT',1),('toilet','RESTROOM_M',9)]]
        self.stops=[]
        def facility(kind=None): return [dict(p) for p in self.facilities if kind is None or p['kind']==kind]
        def matrix(start,nodes):
            pts=[start]+nodes
            return dict(policy='ESC_ADJACENT',costs=[[abs(a['x']-b['x']) for b in pts] for a in pts])
        def route(f,x,y,nodes,**kw):
            self.assertTrue(kw['escalators_only'])
            self.stops=nodes
            legs=[]
            for node in nodes:
                end=node['x'];sign=1 if end>=x else -1
                path=[dict(floorNo=1,x=k,y=1) for k in range(x,end+sign,sign)]
                legs.append(dict(status='OK',path=path,distance=abs(end-x),skuId=node.get('skuId')));x=end
            return dict(legs=legs,totalDistance=sum(l['distance'] for l in legs))
        mocks=[patch.object(sr.infer,'facility_points',side_effect=facility),
               patch.object(sr.infer,'facility_point',side_effect=lambda k:next((p for p in self.facilities if p['location_id']==k),None)),
               patch.object(sr.infer,'nearest_facility_point',return_value=self.facilities[0]),
               patch.object(sr.sot_client,'get_navigation_matrix',side_effect=matrix),
               patch.object(sr.sot_client,'get_navigation_route',side_effect=route),
               patch('app.tools.compute._choose_destination',side_effect=lambda sku:dict(location_id=f'loc{sku}',tier_role='PICK',qty=0 if sku==99 else 3,floor_no=1,x=sku,y=1)),
               patch.object(sr.sot_client,'get_product',side_effect=lambda sku:dict(name=f'상품{sku}',is_frozen=sku==2,is_fresh=sku==3,is_refrigerated=False))]
        for m in mocks:m.start();self.addCleanup(m.stop)

    def test_full_trip_cold_and_exclusion(self):
        r=sr.optimize([2,3,4,99])
        self.assertNotIn('error',r)
        self.assertEqual(r['orderedSkuIds'],[4,3,2])
        self.assertEqual([s['kind'] for s in self.stops][-2:],['CHECKOUT','EXIT'])
        self.assertEqual(r['start']['x'],0)
        self.assertEqual(r['journeySteps'][-1]['path'][-1]['x'],0)
        self.assertEqual(r['excluded'][0]['skuId'],99)

    def test_detour_is_first_but_not_start_until_confirmed(self):
        r=sr.optimize([3,4],anchor={'skuId':5},detour_id='toilet')
        self.assertEqual(r['start']['x'],5)
        self.assertEqual(r['journeySteps'][0]['kind'],'FACILITY')
        r=sr.optimize([4],anchor={'locationId':'toilet'})
        self.assertEqual(r['start']['x'],9)
        self.assertEqual(r['orderedSkuIds'],[4])

    def test_empty_cart_and_paid_exit(self):
        r=sr.optimize([])
        self.assertEqual([s['kind'] for s in r['journeySteps']],['CHECKOUT','EXIT'])
        r=sr.optimize([3],anchor={'locationId':'cash'},paid=True)
        self.assertEqual([s['kind'] for s in r['journeySteps']],['EXIT'])
        self.assertEqual(r['orderedSkuIds'],[])

    def test_missing_anchor_does_not_silently_start_at_entrance(self):
        self.assertIn('error',sr.optimize([4],anchor={'locationId':'bad'}))


class ForecastChecks(unittest.TestCase):
    def test_identity_auth_and_probability_units(self):
        from fastapi import HTTPException
        from app.routes_frontend import list_insights, InsightsBody
        from app.tools import query
        with patch.dict('os.environ',{'INTERNAL_SERVICE_KEY':'test-only-key'}):
            with self.assertRaises(HTTPException):list_insights(InsightsBody(skuIds=[1],consumerId=4),'wrong')
            before=query.current_member_id()
            with patch.object(sr.infer,'predict_repurchase',return_value={'items':[{'sku_id':1,'typical_cycle_days':14,'past_intervals':2,'days_since_last':12}]}), patch.object(sr.infer,'predict_availability',return_value={'curve':[{'within':'5분','prob_pct':0.4}]}):
                result=list_insights(InsightsBody(skuIds=[1],consumerId=4),'test-only-key')
            self.assertEqual(query.current_member_id(),before)
            self.assertIn('0.4%',result['items'][0]['availability'])
            self.assertIn('구매 이력 기준',result['items'][0]['repurchase'])

if __name__=='__main__': unittest.main(verbosity=2)
