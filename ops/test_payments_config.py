"""Private payment configuration must preserve other settings and reject live keys."""

import tempfile
import unittest
from pathlib import Path

from configure_payments import configure


class PaymentConfigurationTests(unittest.TestCase):
    def test_configure_separates_server_secret_and_public_build_key(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / ".env").write_text("POSTGRES_PASSWORD=existing-private\nAURA_WEB_REPLICAS=2\n")
            values = {
                "AURA_TOSS_SECRET_KEY": "test_gsk_example_secret",
                "NEXT_PUBLIC_TOSS_CLIENT_KEY": "test_gck_example_client",
            }
            configure(root, values)
            configure(root, values)
            public = (root / ".env").read_text()
            secret = (root / ".env.payments").read_text()
            self.assertIn("POSTGRES_PASSWORD=existing-private", public)
            self.assertIn("AURA_WEB_REPLICAS=2", public)
            self.assertEqual(public.count("NEXT_PUBLIC_TOSS_CLIENT_KEY="), 1)
            self.assertNotIn(values["AURA_TOSS_SECRET_KEY"], public)
            self.assertEqual(
                secret,
                "AURA_PAYMENT_PROVIDER=toss\nAURA_TOSS_SECRET_KEY="
                + values["AURA_TOSS_SECRET_KEY"]
                + "\n",
            )
            for file in (".env", ".env.payments"):
                self.assertEqual((root / file).stat().st_mode & 0o777, 0o600)

    def test_invalid_or_incomplete_pairs_do_not_change_any_files(self):
        for secret, client in [
            ("live_sk_example_secret", "test_ck_example_client"),
            ("test_sk_example_secret", ""),
            ("test_sk_example_secret", "test_ck_bad\ninjected=value"),
        ]:
            with self.subTest(secret_prefix=secret[:7]):
                with tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary)
                    (root / ".env").write_text("EXISTING=preserved\n")
                    with self.assertRaises(ValueError):
                        configure(
                            root,
                            {"AURA_TOSS_SECRET_KEY": secret, "NEXT_PUBLIC_TOSS_CLIENT_KEY": client},
                        )
                    self.assertEqual((root / ".env").read_text(), "EXISTING=preserved\n")
                    self.assertFalse((root / ".env.payments").exists())


if __name__ == "__main__":
    unittest.main()
