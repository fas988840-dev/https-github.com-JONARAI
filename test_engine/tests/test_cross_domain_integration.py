"""Cross-domain integration QA over the synthetic TESTCO fixture only.

The pipeline below is a test oracle, not production agent behavior. It checks
that independently validated fixture domains reconcile before a report can be
assembled. The orchestrator's 80 agents remain contract stubs.
"""
import copy
import math
import unittest
from datetime import datetime, timezone

from test_engine.orchestrator import SafetyError, load_fixture, run_all, validate_mode

BASE = load_fixture()


def parse_utc(value):
    if not isinstance(value, str):
        raise ValueError("timestamp required")
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("timezone required")
    return dt.astimezone(timezone.utc)


def finite(value, *, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("finite numeric value required")
    if positive and value <= 0:
        raise ValueError("positive value required")
    return float(value)


def build_test_report(data):
    """Compose ten domain checks; raises before report assembly on any broken handoff."""
    validate_mode(data)

    company = data["company"]
    ticker, name, currency = company["ticker"], company["name"], company["currency"]
    if not all(isinstance(x, str) and x.strip() for x in (ticker, name, currency)):
        raise ValueError("company identity incomplete")

    period = data["period"]
    if not isinstance(period, str) or len(period) != 7 or period[4:6] != "-Q":
        raise ValueError("invalid fiscal period")
    year, quarter = period[:4], period[6:]
    if not year.isdigit() or quarter not in {"1", "2", "3", "4"}:
        raise ValueError("invalid fiscal period")

    revenue = finite(data["revenue_actual_m"], positive=True)
    prior_year = finite(data["revenue_prior_year_m"], positive=True)
    prior_quarter = finite(data["revenue_prior_quarter_m"], positive=True)
    yoy = (revenue / prior_year - 1) * 100
    qoq = (revenue / prior_quarter - 1) * 100

    gaap_eps = finite(data["gaap_eps_actual"])
    non_gaap_eps = finite(data["non_gaap_eps_actual"])

    cutoff = parse_utc(data["estimates_cutoff_utc"])
    estimate_rows = data["estimates"]
    if not isinstance(estimate_rows, list) or not estimate_rows:
        raise ValueError("estimate rows required")
    accepted = []
    for row in estimate_rows:
        value = finite(row["value"])
        published = parse_utc(row["published_at"])
        if published <= cutoff:
            accepted.append(value)
    if not accepted:
        raise ValueError("no estimates at or before cutoff")
    consensus = sum(accepted) / len(accepted)
    surprise_pct = (gaap_eps / consensus - 1) * 100 if consensus else None

    guidance = data["guidance"]
    low = finite(guidance["revenue_low_m"], positive=True)
    high = finite(guidance["revenue_high_m"], positive=True)
    if low > high:
        raise ValueError("guidance range reversed")
    guidance_mid = (low + high) / 2

    history = data["historical"]
    if not isinstance(history, list) or not history:
        raise ValueError("history required")
    periods = [row["period"] for row in history]
    if periods != sorted(periods) or periods[-1] != period:
        raise ValueError("history period continuity/reconciliation failed")
    last = history[-1]
    if finite(last["revenue_m"], positive=True) != revenue or finite(last["eps"]) != gaap_eps:
        raise ValueError("current period does not reconcile to history")

    moves = [finite(x) for x in data["event_moves_abs_pct"]]
    if not moves or any(x < 0 or x > 100 for x in moves):
        raise ValueError("event move range invalid")

    # Explicitly synthetic, internally reconciled, descriptive output only.
    return {
        "ticker": ticker,
        "company": name,
        "currency": currency,
        "period": period,
        "revenue_yoy_pct": yoy,
        "revenue_qoq_pct": qoq,
        "gaap_eps": gaap_eps,
        "non_gaap_eps": non_gaap_eps,
        "consensus_eps": consensus,
        "eps_surprise_pct": surprise_pct,
        "guidance_revenue_mid_m": guidance_mid,
        "history_period_count": len(history),
        "event_move_sample_count": len(moves),
        "data_mode": "synthetic",
        "execution_enabled": False,
    }


class CrossDomainIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.d = copy.deepcopy(BASE)

    def test_happy_path_reconciles_all_ten_domains(self):
        report = build_test_report(self.d)
        self.assertEqual(report["ticker"], "TEST")
        self.assertEqual(report["period"], "2026-Q3")
        self.assertEqual(report["data_mode"], "synthetic")
        self.assertAlmostEqual(report["revenue_yoy_pct"], 13.6363636364, places=8)
        self.assertAlmostEqual(report["revenue_qoq_pct"], 5.9322033898, places=8)
        self.assertAlmostEqual(report["consensus_eps"], 1.15, places=8)
        self.assertAlmostEqual(report["guidance_revenue_mid_m"], 1350)
        self.assertEqual(report["history_period_count"], 4)
        self.assertFalse(report["execution_enabled"])

    def test_calendar_company_and_report_identity_handoff(self):
        self.d["company"]["ticker"] = "OTHER"
        report = build_test_report(self.d)
        self.assertEqual(report["ticker"], "OTHER")
        self.d["company"]["name"] = ""
        with self.assertRaises(ValueError):
            build_test_report(self.d)

    def test_revenue_history_mismatch_blocks_report(self):
        self.d["historical"][-1]["revenue_m"] = 1249
        with self.assertRaisesRegex(ValueError, "does not reconcile"):
            build_test_report(self.d)

    def test_eps_history_mismatch_blocks_report(self):
        self.d["historical"][-1]["eps"] = 1.41
        with self.assertRaisesRegex(ValueError, "does not reconcile"):
            build_test_report(self.d)

    def test_expectations_cutoff_excludes_late_estimates(self):
        self.d["estimates"].append({
            "value": 99.0, "published_at": "2026-11-05T20:00:01Z"
        })
        report = build_test_report(self.d)
        self.assertAlmostEqual(report["consensus_eps"], 1.15)

    def test_estimate_exactly_at_cutoff_is_included(self):
        self.d["estimates"].append({
            "value": 1.3, "published_at": self.d["estimates_cutoff_utc"]
        })
        report = build_test_report(self.d)
        self.assertAlmostEqual(report["consensus_eps"], (1.1 + 1.2 + 1.3) / 3)

    def test_all_estimates_after_cutoff_blocks_report(self):
        for row in self.d["estimates"]:
            row["published_at"] = "2026-11-05T20:00:01Z"
        with self.assertRaisesRegex(ValueError, "no estimates"):
            build_test_report(self.d)

    def test_guidance_range_is_joined_to_revenue_without_reversal(self):
        self.d["guidance"] = {"revenue_low_m": 1400, "revenue_high_m": 1300}
        with self.assertRaisesRegex(ValueError, "reversed"):
            build_test_report(self.d)

    def test_empty_history_blocks_report(self):
        self.d["historical"] = []
        with self.assertRaisesRegex(ValueError, "history required"):
            build_test_report(self.d)

    def test_out_of_order_history_blocks_report(self):
        self.d["historical"] = list(reversed(self.d["historical"]))
        with self.assertRaisesRegex(ValueError, "continuity"):
            build_test_report(self.d)

    def test_missing_eps_estimates_blocks_report(self):
        self.d.pop("estimates")
        with self.assertRaises((KeyError, ValueError)):
            build_test_report(self.d)

    def test_invalid_timezone_blocks_report(self):
        self.d["estimates"][0]["published_at"] = "2026-11-05T19:30:00"
        with self.assertRaisesRegex(ValueError, "timezone"):
            build_test_report(self.d)

    def test_missing_company_currency_blocks_report(self):
        self.d["company"].pop("currency")
        with self.assertRaises((KeyError, ValueError)):
            build_test_report(self.d)

    def test_invalid_event_move_blocks_report(self):
        self.d["event_moves_abs_pct"][0] = 100.01
        with self.assertRaisesRegex(ValueError, "event move"):
            build_test_report(self.d)

    def test_zero_revenue_denominator_blocks_growth_composition(self):
        self.d["revenue_prior_year_m"] = 0
        with self.assertRaisesRegex(ValueError, "positive"):
            build_test_report(self.d)

    def test_live_or_execution_flags_are_rejected_at_pipeline_boundary(self):
        for key in ("data_mode", "broker_connected", "live_data", "orders_enabled", "execution_enabled"):
            bad = copy.deepcopy(self.d)
            bad[key] = "live" if key == "data_mode" else True
            with self.subTest(key=key):
                with self.assertRaises(SafetyError):
                    build_test_report(bad)

    def test_orchestrator_contract_runs_remain_synthetic_and_non_executing(self):
        import asyncio
        result = asyncio.run(run_all(self.d, concurrency=4))
        self.assertEqual(result["data_mode"], "synthetic")
        self.assertEqual(result["agent_count"], 80)
        self.assertEqual(result["passed"], 80)
        self.assertTrue(all(x["implementation"] == "contract_stub" for x in result["results"]))
        self.assertTrue(all(x["mode"] == "synthetic" for x in result["results"]))


if __name__ == "__main__":
    unittest.main()
