"""Validate generated maintenance units with systemd's real configuration parser."""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]


class MaintenanceUnitTests(unittest.TestCase):
    def test_units_accept_absolute_working_directories_including_spaces(self):
        with tempfile.TemporaryDirectory(prefix="aura-systemd-test-") as temporary:
            spec = importlib.util.spec_from_file_location(
                "aura_timer_ops", SOURCE / "ops/database.py"
            )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            for name in ("application", "application with spaces"):
                with self.subTest(path=name):
                    module.ROOT = Path(temporary) / name
                    module.ROOT.mkdir()
                    database = module.Database("aura-timer-test")
                    units = module.ROOT / "units"
                    database.write_timer_units(units)
                    result = subprocess.run(
                        [
                            "systemd-analyze",
                            "verify",
                            "--man=no",
                            str(units / "aura-db-maintenance.service"),
                            str(units / "aura-db-maintenance.timer"),
                        ],
                        capture_output=True,
                        text=True,
                        timeout=30,
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
