"""Independent contract and synthetic-fixture QA for all 80 catalog entries."""
import asyncio
import json
import math
import unittest
from datetime import datetime, timezone
from pathlib import Path

from test_engine.orchestrator import (
    CATALOG, ROOT, SafetyError, load_fixture, run_all, validate_catalog, validate_mode,
)


class CatalogContractTests(unittest.TestCase):
    def test_exactly_80_agents_and_one_group(self):
        agents = validate_catalog()
        self.assertEqual(len(agents), 80)
        self.assertEqual(CATALOG["agent_count"], 80)
        self.assertEqual(CATALOG["group_count"], 1)
        self.assertEqual(CATALOG["group_id"], "EARNINGS-INTELLIGENCE")

    def test_each_agent_has_independent_complete_catalog_contract(self):
        required = {"agent_id", "group_id", "domain", "responsibility"}
        seen = set()
        for agent in validate_catalog():
            with self.subTest(agent_id=agent.get("agent_id")):
                self.assertEqual(set(agent), required)
                self.assertTrue(agent["agent_id"])
                self.assertNotIn(agent["agent_id"], seen)
                seen.add(agent["agent_id"])
                self.assertEqual(agent["group_id"], CATALOG["group_id"])
                self.assertTrue(agent["domain"])
                self.assertTrue(agent["responsibility"])
        self.assertEqual(len(seen), 80)

    def test_domain_distribution_is_ten_domains_eight_agents_each(self):
        counts = {}
        for agent in validate_catalog():
            counts[agent["domain"]] = counts.get(agent["domain"], 0) + 1
        self.assertEqual(len(counts), 10)
        self.assertEqual(set(counts.values()), {8})

    def test_catalog_rejects_wrong_group_membership(self):
        broken = json.loads(json.dumps(CATALOG))
        broken["agents"][0]["group_id"] = "OTHER"
        with self.assertRaises(ValueError):
            validate_catalog(broken)

    def test_catalog_rejects_duplicate_ids(self):
        broken = json.loads(json.dumps(CATALOG))
        broken["agents"][1]["agent_id"] = broken["agents"][0]["agent_id"]
        with self.assertRaises(ValueError):
            validate_catalog(broken)


class AgentOutputContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = load_fixture()
        cls.output = asyncio.run(run_all(cls.fixture))
        cls.expected = {agent["agent_id"]: agent for agent in validate_catalog()}

    def test_output_envelope_contract(self):
        self.assertEqual(
            set(self.output),
            {"group_id", "data_mode", "agent_count", "passed", "results"},
        )
        self.assertEqual(self.output["group_id"], "EARNINGS-INTELLIGENCE")
        self.assertEqual(self.output["data_mode"], "synthetic")
        self.assertEqual(self.output["agent_count"], 80)
        self.assertEqual(self.output["passed"], 80)

    def test_each_of_80_agents_returns_its_own_contract(self):
        results = self.output["results"]
        self.assertEqual(len(results), 80)
        by_id = {result["agent_id"]: result for result in results}
        self.assertEqual(set(by_id), set(self.expected))
        for agent_id, agent in self.expected.items():
            with self.subTest(agent_id=agent_id):
                result = by_id[agent_id]
                self.assertEqual(
                    set(result),
                    {"agent_id", "domain", "status", "mode", "implementation"},
                )
                self.assertEqual(result["agent_id"], agent_id)
                self.assertEqual(result["domain"], agent["domain"])
                self.assertEqual(result["status"], "PASS")
                self.assertEqual(result["mode"], "synthetic")
                self.assertEqual(result["implementation"], "contract_stub")

    def test_result_order_is_deterministic(self):
        ids = [item["agent_id"] for item in self.output["results"]]
        self.assertEqual(ids, sorted(ids))

    def test_no_agent_claims_production_implementation(self):
        self.assertTrue(
            all(item["implementation"] == "contract_stub"
                for item in self.output["results"])
        )


class TestCoFixtureTests(unittest.TestCase):
    def setUp(self):
        self.data = load_fixture()

    def test_fixture_is_explicitly_synthetic_and_complete(self):
        self.assertEqual(self.data["data_mode"], "synthetic")
        self.assertEqual(
            set(self.data["company"]),
            {"ticker", "name", "currency"},
        )
        self.assertEqual(self.data["company"]["ticker"], "TEST")
        self.assertEqual(self.data["company"]["currency"], "USD")
        self.assertEqual(self.data["period"], "2026-Q3")

    def test_revenue_values_and_growth_arithmetic(self):
        d = self.data
        self.assertGreater(d["revenue_actual_m"], 0)
        self.assertGreater(d["revenue_prior_year_m"], 0)
        self.assertGreater(d["revenue_prior_quarter_m"], 0)
        yoy = (d["revenue_actual_m"] / d["revenue_prior_year_m"] - 1) * 100
        qoq = (d["revenue_actual_m"] / d["revenue_prior_quarter_m"] - 1) * 100
        self.assertAlmostEqual(yoy, 13.6363636364, places=8)
        self.assertAlmostEqual(qoq, 5.9322033898, places=8)

    def test_eps_estimate_distribution_arithmetic(self):
        values = self.data["eps_estimates"]
        self.assertEqual(len(values), 12)
        self.assertTrue(all(isinstance(v, (int, float)) and math.isfinite(v) for v in values))
        ordered = sorted(values)
        mean = sum(values) / len(values)
        median = (ordered[5] + ordered[6]) / 2
        surprise = (self.data["gaap_eps_actual"] / mean - 1) * 100
        self.assertAlmostEqual(mean, 1.2666666667, places=8)
        self.assertAlmostEqual(median, 1.275, places=8)
        self.assertAlmostEqual(surprise, 12.1052631579, places=7)

    def test_estimate_records_respect_cutoff_and_have_valid_timestamps(self):
        cutoff = datetime.fromisoformat(
            self.data["estimates_cutoff_utc"].replace("Z", "+00:00")
        )
        self.assertTrue(self.data["estimates"])
        for record in self.data["estimates"]:
            with self.subTest(record=record):
                self.assertEqual(set(record), {"value", "published_at"})
                self.assertTrue(math.isfinite(record["value"]))
                published = datetime.fromisoformat(
                    record["published_at"].replace("Z", "+00:00")
                )
                self.assertIsNotNone(published.tzinfo)
                self.assertLessEqual(published.astimezone(timezone.utc), cutoff)

    def test_guidance_range_is_ordered_and_positive(self):
        guidance = self.data["guidance"]
        self.assertGreater(guidance["revenue_low_m"], 0)
        self.assertGreaterEqual(guidance["revenue_high_m"], guidance["revenue_low_m"])

    def test_history_is_chronological_and_latest_matches_current_period(self):
        history = self.data["historical"]
        periods = [item["period"] for item in history]
        self.assertEqual(periods, sorted(periods))
        self.assertEqual(periods[-1], self.data["period"])
        self.assertEqual(history[-1]["revenue_m"], self.data["revenue_actual_m"])
        self.assertEqual(history[-1]["eps"], self.data["gaap_eps_actual"])

    def test_event_move_fixture_values_are_bounded_percentages(self):
        moves = self.data["event_moves_abs_pct"]
        self.assertGreaterEqual(len(moves), 2)
        self.assertTrue(all(0 <= value <= 100 for value in moves))
        self.assertTrue(all(math.isfinite(value) for value in moves))


class SafetyAndExecutionBoundaryTests(unittest.TestCase):
    def test_non_synthetic_mode_is_rejected(self):
        with self.assertRaises(SafetyError):
            validate_mode({"data_mode": "live"})

    def test_broker_and_execution_flags_are_rejected(self):
        for flag in ("broker_connected", "live_data", "orders_enabled", "execution_enabled"):
            with self.subTest(flag=flag):
                with self.assertRaises(SafetyError):
                    validate_mode({"data_mode": "synthetic", flag: True})

    def test_concurrency_limits_are_enforced(self):
        for value in (0, 33):
            with self.subTest(concurrency=value):
                with self.assertRaises(ValueError):
                    asyncio.run(run_all(load_fixture(), value))


if __name__ == "__main__":
    unittest.main()
