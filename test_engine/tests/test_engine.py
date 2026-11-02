import asyncio, json, unittest
from pathlib import Path
from test_engine.orchestrator import run_all, load_fixture, validate_catalog, validate_mode, SafetyError
class EngineTests(unittest.TestCase):
 def test_catalog_has_80_unique_agents(self): self.assertEqual(len(validate_catalog()),80); self.assertEqual(len({a['agent_id'] for a in validate_catalog()}),80)
 def test_synthetic_integration_returns_all_agents(self):
  out=asyncio.run(run_all(load_fixture())); self.assertEqual(out['agent_count'],80); self.assertEqual(out['passed'],80); self.assertEqual(len(out['results']),80)
 def test_live_mode_rejected(self):
  with self.assertRaises(SafetyError): validate_mode({'data_mode':'live'})
 def test_broker_flag_rejected(self):
  with self.assertRaises(SafetyError): validate_mode({'data_mode':'synthetic','broker_connected':True})
 def test_execution_flag_rejected(self):
  with self.assertRaises(SafetyError): validate_mode({'data_mode':'synthetic','execution_enabled':True})
 def test_concurrency_bounds(self):
  with self.assertRaises(ValueError): asyncio.run(run_all(load_fixture(),0))
 def test_eps_summary_fixture_math(self):
  d=load_fixture(); vals=d['eps_estimates']; self.assertAlmostEqual(sum(vals)/len(vals),1.2666666667); self.assertEqual((sorted(vals)[5]+sorted(vals)[6])/2,1.275)
if __name__=='__main__': unittest.main()
