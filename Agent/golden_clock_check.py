import unittest
from unittest.mock import patch
from datetime import datetime, timezone
from app import config,sot_client
from app.watchers import schedule
class ClockTest(unittest.TestCase):
 def test_fixed_store_time_is_preserved(self):
  with patch.object(config,"LIVE_INFERENCE_CLOCK",False):
   self.assertEqual(config.store_now(),config.DEMO_NOW)
   self.assertEqual(config.business_now().hour,5)
 def test_live_is_utc_and_store_is_korea(self):
  with patch.object(config,"LIVE_INFERENCE_CLOCK",True):
   self.assertLess(abs((config.business_now()-datetime.now(timezone.utc)).total_seconds()),2)
   self.assertEqual(config.store_now().hour,(datetime.now(timezone.utc).hour+9)%24)
 def test_live_event_window_does_not_include_august(self):
  with patch.object(config,"USE_MOCK_SOT",False),patch.object(config,"LIVE_INFERENCE_CLOCK",True),patch.object(sot_client,"_http_get",return_value=[]) as get:
   sot_client.get_change_events([205400],within_hours=24)
   self.assertEqual(get.call_args.args[1]["hours"],24)
 def test_gain_window_boundaries(self):
  self.assertFalse(schedule._in_gain_window(-1));self.assertFalse(schedule._in_gain_window(9))
  self.assertTrue(schedule._in_gain_window(10));self.assertTrue(schedule._in_gain_window(47));self.assertFalse(schedule._in_gain_window(48))
if __name__=="__main__":unittest.main()
