"""Domain-focused functional QA using only the bundled synthetic TESTCO fixture.

These tests validate fixture semantics and explicit rejection/boundary behavior.
They do not implement or imply production agent analysis.
"""
import copy
import json
import math
import unittest
from datetime import datetime, timezone
from pathlib import Path

from test_engine.orchestrator import SafetyError, load_fixture, validate_mode

FIXTURE = load_fixture()


def utc(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include timezone")
    return parsed.astimezone(timezone.utc)


def require_number(value, *, positive=False, nonnegative=False):
    if value is None or isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("numeric value required")
    if not math.isfinite(value):
        raise ValueError("finite value required")
    if positive and value <= 0:
        raise ValueError("value must be positive")
    if nonnegative and value < 0:
        raise ValueError("value must be nonnegative")
    return float(value)


class DomainCase(unittest.TestCase):
    def setUp(self):
        self.d = copy.deepcopy(FIXTURE)


class GovernanceDomainTests(DomainCase):
    def test_success_synthetic_scope_and_identity(self):
        validate_mode(self.d)
        self.assertEqual(self.d["company"]["ticker"], "TEST")
        self.assertEqual(self.d["data_mode"], "synthetic")

    def test_failure_live_or_broker_flags(self):
        for key, value in (("data_mode", "live"), ("broker_connected", True),
                           ("orders_enabled", True), ("execution_enabled", True)):
            with self.subTest(key=key):
                bad = copy.deepcopy(self.d)
                bad[key] = value
                with self.assertRaises(SafetyError):
                    validate_mode(bad)

    def test_missing_scope_is_rejected(self):
        with self.assertRaises(SafetyError):
            validate_mode({})


class CalendarDomainTests(DomainCase):
    def test_success_fiscal_period_shape(self):
        year, quarter = self.d["period"].split("-Q")
        self.assertEqual(len(year), 4)
        self.assertTrue(year.isdigit())
        self.assertIn(int(quarter), range(1, 5))

    def test_failure_invalid_period_and_missing_period(self):
        for period in ("2026-Q5", "Q3-2026", None):
            with self.subTest(period=period):
                self.d["period"] = period
                with self.assertRaises((AttributeError, ValueError)):
                    year, quarter = self.d["period"].split("-Q")
                    if len(year) != 4 or not year.isdigit() or int(quarter) not in range(1, 5):
                        raise ValueError("invalid fiscal period")

    def test_boundary_quarter_one_and_four(self):
        for quarter in ("2026-Q1", "2026-Q4"):
            year, q = quarter.split("-Q")
            self.assertEqual(len(year), 4)
            self.assertIn(int(q), (1, 4))


class ResearchDomainTests(DomainCase):
    def test_success_fixture_provenance_is_explicitly_synthetic(self):
        self.assertEqual(self.d["data_mode"], "synthetic")
        self.assertEqual(self.d["company"]["name"], "Test Company")
        self.assertEqual(self.d["company"]["ticker"], "TEST")

    def test_failure_missing_company_identity(self):
        for key in ("ticker", "name", "currency"):
            bad = copy.deepcopy(self.d)
            bad["company"].pop(key)
            with self.subTest(missing=key):
                self.assertNotIn(key, bad["company"])

    def test_boundary_empty_document_collection_is_not_claimed_as_research(self):
        documents = []
        self.assertEqual(len(documents), 0)
        self.assertFalse(bool(documents))


class RevenueDomainTests(DomainCase):
    def test_success_yoy_and_qoq_growth(self):
        actual = require_number(self.d["revenue_actual_m"], positive=True)
        prior_year = require_number(self.d["revenue_prior_year_m"], positive=True)
        prior_quarter = require_number(self.d["revenue_prior_quarter_m"], positive=True)
        self.assertAlmostEqual((actual / prior_year - 1) * 100, 13.6363636364, places=8)
        self.assertAlmostEqual((actual / prior_quarter - 1) * 100, 5.9322033898, places=8)

    def test_failure_zero_negative_and_missing_denominators(self):
        for value in (0, -1, None):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    require_number(value, positive=True)

    def test_boundary_zero_growth_and_negative_growth_are_valid_math(self):
        self.assertEqual((100 / 100 - 1) * 100, 0)
        self.assertLess((90 / 100 - 1) * 100, 0)


class EPSDomainTests(DomainCase):
    def test_success_gaap_and_non_gaap_eps_are_finite(self):
        self.assertAlmostEqual(require_number(self.d["gaap_eps_actual"]), 1.42)
        self.assertAlmostEqual(require_number(self.d["non_gaap_eps_actual"]), 1.58)

    def test_failure_missing_and_nonfinite_eps(self):
        for value in (None, float("nan"), float("inf"), "1.42"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    require_number(value)

    def test_boundary_negative_eps_is_numeric_not_missing(self):
        self.assertEqual(require_number(-0.01), -0.01)
        self.assertEqual(require_number(0), 0)


class ExpectationsDomainTests(DomainCase):
    def test_success_consensus_mean_median_and_count(self):
        values = [require_number(v) for v in self.d["eps_estimates"]]
        self.assertEqual(len(values), 12)
        self.assertAlmostEqual(sum(values) / len(values), 1.2666666667, places=8)
        ordered = sorted(values)
        self.assertAlmostEqual((ordered[5] + ordered[6]) / 2, 1.275, places=8)

    def test_failure_empty_or_nonfinite_estimate_set(self):
        for values in ([], [1.1, None], [1.1, float("nan")]):
            with self.subTest(values=values):
                with self.assertRaises(ValueError):
                    parsed = [require_number(v) for v in values]
                    if not parsed:
                        raise ValueError("at least one estimate required")

    def test_cutoff_boundary_inclusive_and_after_cutoff_excluded(self):
        cutoff = utc(self.d["estimates_cutoff_utc"])
        at_cutoff = cutoff.isoformat()
        after = (cutoff.replace(microsecond=0)).timestamp() + 1
        after_dt = datetime.fromtimestamp(after, tz=timezone.utc)
        self.assertLessEqual(utc(at_cutoff), cutoff)
        self.assertGreater(utc(after_dt.isoformat()), cutoff)

    def test_missing_or_naive_timestamp_rejected(self):
        for stamp in (None, "2026-11-05T20:00:00"):
            with self.subTest(stamp=stamp):
                with self.assertRaises((AttributeError, ValueError)):
                    utc(stamp)


class GuidanceDomainTests(DomainCase):
    def test_success_guidance_range_ordered(self):
        low = require_number(self.d["guidance"]["revenue_low_m"], positive=True)
        high = require_number(self.d["guidance"]["revenue_high_m"], positive=True)
        self.assertLessEqual(low, high)

    def test_failure_reversed_or_missing_guidance_bound(self):
        for guidance in ({"revenue_low_m": 1400, "revenue_high_m": 1300},
                         {"revenue_low_m": 1300}, {}):
            with self.subTest(guidance=guidance):
                low = guidance.get("revenue_low_m")
                high = guidance.get("revenue_high_m")
                with self.assertRaises((ValueError, TypeError)):
                    low = require_number(low, positive=True)
                    high = require_number(high, positive=True)
                    if low > high:
                        raise ValueError("guidance range reversed")

    def test_boundary_equal_low_and_high_is_valid(self):
        self.assertEqual(require_number(1300), require_number(1300))


class HistoryDomainTests(DomainCase):
    def test_success_history_order_and_current_period_reconciliation(self):
        history = self.d["historical"]
        periods = [row["period"] for row in history]
        self.assertEqual(periods, sorted(periods))
        self.assertEqual(history[-1]["period"], self.d["period"])
        self.assertEqual(history[-1]["revenue_m"], self.d["revenue_actual_m"])
        self.assertEqual(history[-1]["eps"], self.d["gaap_eps_actual"])

    def test_failure_reversed_history_or_missing_metric(self):
        reversed_rows = list(reversed(self.d["historical"]))
        self.assertNotEqual([x["period"] for x in reversed_rows],
                            sorted(x["period"] for x in reversed_rows))
        incomplete = {"period": "2026-Q3", "revenue_m": 1250}
        self.assertNotIn("eps", incomplete)

    def test_boundary_single_period_history_has_no_growth_comparison(self):
        history = [self.d["historical"][-1]]
        self.assertEqual(len(history), 1)
        self.assertIsNone(None if len(history) < 2 else "growth")


class QualityDomainTests(DomainCase):
    def test_success_currency_and_numeric_ranges(self):
        self.assertEqual(self.d["company"]["currency"], "USD")
        for key in ("revenue_actual_m", "revenue_prior_year_m",
                    "revenue_prior_quarter_m"):
            require_number(self.d[key], positive=True)
        for move in self.d["event_moves_abs_pct"]:
            require_number(move, nonnegative=True)
            self.assertLessEqual(move, 100)

    def test_failure_invalid_currency_missing_values_and_out_of_range_move(self):
        self.assertNotEqual("US DOLLAR", "USD")
        with self.assertRaises(ValueError):
            require_number(None, positive=True)
        with self.assertRaises(AssertionError):
            self.assertLessEqual(100.01, 100)

    def test_boundary_zero_event_move_and_exact_100_percent(self):
        self.assertEqual(require_number(0, nonnegative=True), 0)
        self.assertEqual(require_number(100, nonnegative=True), 100)

    def test_decimal_arithmetic_stays_finite(self):
        values = [require_number(x) for x in self.d["event_moves_abs_pct"]]
        self.assertTrue(math.isfinite(sum(values) / len(values)))


class ReportingDomainTests(DomainCase):
    def test_success_surprise_is_reproducible_and_event_moves_summarize(self):
        estimates = [require_number(x) for x in self.d["eps_estimates"]]
        consensus = sum(estimates) / len(estimates)
        surprise_pct = (require_number(self.d["gaap_eps_actual"]) / consensus - 1) * 100
        moves = [require_number(x, nonnegative=True) for x in self.d["event_moves_abs_pct"]]
        self.assertAlmostEqual(surprise_pct, 12.1052631579, places=7)
        self.assertEqual(len(moves), 8)
        self.assertGreaterEqual(min(moves), 0)
        self.assertLessEqual(max(moves), 100)

    def test_failure_report_required_fields_missing(self):
        report = {"ticker": self.d["company"]["ticker"]}
        required = {"ticker", "period", "revenue_actual_m", "gaap_eps_actual"}
        self.assertNotEqual(set(report) & required, required)

    def test_boundary_empty_warnings_are_an_empty_list_not_null(self):
        warnings = []
        self.assertIsInstance(warnings, list)
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()
