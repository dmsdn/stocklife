"""화면 동선 API의 실제 지도 정합 검사. 계정 조회·리스트 변경·결제는 실행하지 않는다.

python Agent/route_ui_check.py --sku-ids 101,102 --base-url http://localhost:8080
API 왕복과 보행 경로를 확인한다. 전역 최적성은 shopping_route_check의 완전 열거,
픽셀·버튼 흐름은 별도 브라우저 검수로 분리한다.
"""
import argparse
import json
import urllib.request


def request(base, path, body=None):
    """개발 서버의 공개 조회 API. body가 있으면 POST, 없으면 GET이다."""
    req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,
                               headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=120) as response:return json.load(response)


def check_result(result, ids, maps):
    """상품·종단·통행·인접 ESC를 검사한다. assertion 실패는 검사 실패다."""
    assert not result.get('error'),result
    assert result['optimizationSource']=='compute._optimize_route/shopping'
    order=result['orderedSkuIds'];excluded={e['skuId'] for e in result['excluded']}
    assert len(order)==len(set(order))
    assert set(order)|excluded==set(ids)
    steps=result['journeySteps']
    assert steps[-1]['kind']=='EXIT'
    assert result['paid'] or steps[-2]['kind']=='CHECKOUT'
    calculated=0;previous=None;transitions=0
    for leg in result['legs']:
        assert leg['status']=='OK' and leg['path']
        if previous is not None:assert previous==leg['path'][0]
        previous=leg['path'][-1]
        for p in leg['path']:assert maps[p['floorNo']][p['x'],p['y']]['passable']
        for a,b in zip(leg['path'],leg['path'][1:]):
            if a['floorNo']==b['floorNo']:
                assert abs(a['x']-b['x'])+abs(a['y']-b['y'])==1
                calculated+=1
            else:
                assert abs(a['floorNo']-b['floorNo'])==1
                assert (a['x'],a['y'])==(b['x'],b['y'])
                assert all(maps[p['floorNo']][p['x'],p['y']]['transitId']=='ESC' for p in (a,b))
                calculated+=3;transitions+=1
    assert calculated==result['totalDistance']==sum(s['distance'] for s in steps)
    assert transitions==sum(s['kind']=='ESCALATOR' for s in steps)


def main():
    """상품 번호를 명시하게 해 테스트가 임의 회원 리스트를 읽지 않게 한다."""
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',default='http://localhost:8080')
    parser.add_argument('--sku-ids',required=True)
    args=parser.parse_args();ids=[int(s) for s in args.sku_ids.split(',')]
    maps={f:{(c['x'],c['y']):c for c in request(args.base_url,f'/api/map/floors/{f}')['cells']} for f in (1,2,3)}
    result=request(args.base_url,'/api/ai/route-optimize',{'skuIds':ids})
    check_result(result,ids,maps)
    empty=request(args.base_url,'/api/ai/route-optimize',{'skuIds':[]})
    check_result(empty,[],maps)
    if result['orderedSkuIds']:
        first=result['orderedSkuIds'][0];remaining=[s for s in ids if s!=first]
        restart=request(args.base_url,'/api/ai/route-optimize',{'skuIds':remaining,'anchor':{'skuId':first}})
        check_result(restart,remaining,maps)
    print(json.dumps({'status':'PASS','orderedSkuIds':result['orderedSkuIds'],
                      'floors':result['floorOrder'],'cost':result['totalDistance'],'steps':len(result['journeySteps']),
                      'emptyCart':'CHECKOUT → EXIT','scope':'조회 API·통로·인접 ESC·합산·스캔 앵커'},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
