"""Guest planning snapshots never grant access to member cart APIs."""
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from app import cart_context, sot_client, config
from app.tools import action, query

class GuestCartTest(unittest.TestCase):
 def setUp(self):
  action.set_consumer_id(None,None);cart_context.set_guest(None);query.set_identity(None,'guest-session')
 def tearDown(self):
  action.set_consumer_id(None,None);cart_context.set_guest(None)
 def snapshot(self,group=8,sku=205400):
  return {'groupId':group,'groups':[{'cartGroupId':group,'title':'물 목록','items':[{'skuId':sku,'quantity':2}]}]}
 def test_read_local_items_with_server_product_price(self):
  cart_context.set_guest(self.snapshot())
  with patch.object(sot_client,'get_products_by_skus',return_value=[{'sku_id':205400,'name':'PB-생수 500ml × 6입','price_krw':4290}]),patch.object(sot_client,'_http_get',side_effect=AssertionError('member API must not be read')):
   out=query.run('get_session_cart',{})
   self.assertEqual(out['group_id'],8);self.assertEqual(out['total_krw'],8580);self.assertEqual(out['items'][0]['quantity'],2)
 def test_foreign_group_rejected(self):
  cart_context.set_guest(self.snapshot())
  with patch.object(config,'USE_MOCK_SOT',False):
   self.assertEqual(cart_context.resolve_group(99)[1]['error'],'invalid_group')
 def test_parallel_guest_requests_do_not_mix(self):
  def read(n):
   action.set_consumer_id(None,None);cart_context.set_guest(self.snapshot(n));return cart_context.groups()[0]['cartGroupId']
  with ThreadPoolExecutor(max_workers=4) as pool:self.assertEqual(list(pool.map(read,range(1,20))),list(range(1,20)))
 def test_member_reads_do_not_use_guest_snapshot(self):
  action.set_consumer_id(7,None);cart_context.set_guest(self.snapshot())
  with patch.object(sot_client,'_http_get',return_value=[{'cartGroupId':70}]) as get:
   self.assertEqual(cart_context.groups()[0]['cartGroupId'],70);self.assertEqual(get.call_args.args[1],{'consumerId':7})

if __name__=='__main__':unittest.main()
