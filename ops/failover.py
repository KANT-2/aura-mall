"""Single-host PostgreSQL failover with Docker fencing and strict synchronous commits.

This controller deliberately has no remote-node or network-quorum mode. The local
Docker daemon is the fencing authority; inability to confirm a stop forbids promotion.
Every phase is restartable, and old data directories are retained during rejoin.
"""

import fcntl
import json
import subprocess
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit
from uuid import uuid4

from database import OperationError, atomic, identifier, literal, run
from database_errors import PrimaryUnavailable

SYNC_NAMES = "FIRST 1 (aura_standby)"
DATA_ROOTS = {"db": "/var/lib/postgresql/data", "db-standby": "/var/lib/postgresql/standby/data"}


class Failover:
    def __init__(self, database):
        self.db = database
        self.failures = 0
        self.journal = database.state / "ha-transition.json"

    def sql(self, node, statement, *, timeout=3):
        return self.db.sql(
            node,
            f"SET statement_timeout='{timeout}s'; " + statement,
            timeout=timeout + 1,
        )

    def role(self, node, role, data, upstream):
        if (
            node not in DATA_ROOTS
            or upstream not in DATA_ROOTS
            or node == upstream
            or role not in {"primary", "standby"}
        ):
            raise OperationError("Invalid HA node pair")
        root = DATA_ROOTS[node]
        if data not in {root, root + "/rejoined"} and not (
            data.startswith(root + "/ha-") and data[len(root + "/ha-") :].isalnum()
        ):
            raise OperationError("Invalid HA data directory")
        atomic(self.db.state / f"node-{node}", f"{role}|{data}|{upstream}\n")

    def enable(self):
        if self.db.journal.exists() or self.journal.exists():
            raise OperationError("Recover the pending database operation before enabling HA")
        self.db.require_primary()
        self.db.wait_replica()
        for node in DATA_ROOTS:
            data = self.sql(node, "SHOW data_directory;")
            self.role(
                node,
                "primary" if node == self.db.primary else "standby",
                data,
                "db-standby" if node == "db" else "db",
            )
        # Adds the role-state mount to an existing legacy standby without replacing data.
        self.db.dc("up", "-d", "--no-deps", "db-standby")
        self.db.wait_replica()
        for node in DATA_ROOTS:
            self.sql(node, "ALTER SYSTEM SET synchronous_commit='remote_apply';")
            self.sql(node, f"ALTER SYSTEM SET synchronous_standby_names={literal(SYNC_NAMES)};")
            self.sql(node, "SELECT pg_reload_conf();")
        self.db.wait_replica()
        self.require_sync()
        self.db.write("ha.json", {"enabled": True, "synchronous_commit": "remote_apply"})
        print("Strict synchronous HA enabled; writes wait whenever the replica is unavailable.")

    def require_sync(self):
        if self.sql(self.db.primary, "SHOW synchronous_commit;") != "remote_apply":
            raise OperationError("HA requires synchronous_commit=remote_apply")
        if self.sql(self.db.primary, "SHOW synchronous_standby_names;") != SYNC_NAMES:
            raise OperationError("HA requires the designated synchronous standby")
        if (
            self.sql(
                self.db.primary,
                "SELECT count(*) FROM pg_stat_replication WHERE application_name='aura_standby' "
                "AND state='streaming' AND sync_state='sync';",
            )
            != "1"
        ):
            raise OperationError("Synchronous standby is not ready")

    def stopped(self, node):
        ids = self.db.dc("ps", "-a", "-q", node).stdout.split()
        if not ids:
            return True
        states = json.loads(run(["docker", "inspect", *[value.decode() for value in ids]]).stdout)
        return all(
            not item["State"]["Running"] and not item["State"]["Restarting"] for item in states
        )

    def transition(self):
        if not self.db.read("ha.json", {}).get("enabled"):
            raise OperationError("Enable and verify strict synchronous replication first")
        if not self.journal.exists():
            old, new = self.db.primary, self.db.standby
            if not self.db.running(new):
                self.db.dc("up", "-d", "--no-deps", new)
            if self.sql(new, "SELECT pg_is_in_recovery();", timeout=3) != "t":
                raise OperationError("The candidate is not a reachable standby")
            if self.sql(new, "SHOW synchronous_commit;") != "remote_apply":
                raise OperationError("Candidate does not have strict synchronous configuration")
            record = {
                "id": uuid4().hex,
                "old": old,
                "new": new,
                "new_data": self.sql(new, "SHOW data_directory;"),
                "rejoin_data": DATA_ROOTS[old] + "/ha-" + uuid4().hex,
                "phase": "fencing",
                "started": time.time(),
            }
            atomic(self.journal, json.dumps(record) + "\n")
        return self.resume()

    def credentials(self, new):
        def host(value):
            parts = urlsplit(value)
            return urlunsplit(
                parts._replace(netloc=f"{parts.username}:{parts.password}@{new}:5432")
            )

        if not self.db.journal.exists():
            return host(self.db.url_file.read_text().strip())
        rotation = json.loads(self.db.journal.read_text())
        if rotation["phase"] != "committed":
            old_user = unquote(urlsplit(rotation["old_url"]).username)
            password = rotation["old_replication_password"]
            # Only credential recovery uses a local admin commit before the fresh
            # replica exists. Application transactions retain strict remote_apply.
            self.sql(
                new,
                "SET synchronous_commit=local; "
                f"ALTER ROLE {identifier(old_user)} LOGIN; "
                f"ALTER ROLE {identifier(rotation['new_user'])} NOLOGIN; "
                f"ALTER ROLE aura_replicator PASSWORD {literal(password)};",
            )
            atomic(
                self.db.home / "replication/pgpass",
                f"*:5432:replication:aura_replicator:{password}\n",
            )
        rotation["old_url"] = host(rotation["old_url"])
        rotation["new_url"] = host(rotation["new_url"])
        atomic(self.db.journal, json.dumps(rotation) + "\n")
        return rotation["new_url" if rotation["phase"] == "committed" else "old_url"]

    def finish_credentials(self):
        if not self.db.journal.exists():
            return
        record = json.loads(self.db.journal.read_text())
        if record["phase"] == "committed":
            self.db.recover_rotation()
        else:
            # Credentials were already restored before the fresh basebackup. Do not
            # disconnect the newly established synchronous replication connection.
            self.db.wait_api_generation(record["old_url"])
            self.sql(self.db.primary, f"ALTER ROLE {identifier(record['new_user'])} NOLOGIN;")
            self.db.journal.unlink()

    def check_rejoin_space(self, old, new):
        size = int(
            self.sql(new, "SELECT COALESCE(sum(pg_database_size(oid)),0)::bigint FROM pg_database;")
        )
        result = self.db.dc(
            "run",
            "--rm",
            "--no-deps",
            "--entrypoint",
            "sh",
            old,
            "-c",
            'df -Pk "$1" | tail -n 1',
            "aura-ha-space",
            DATA_ROOTS[old],
            timeout=15,
        )
        free = int(result.stdout.decode().split()[-3]) * 1024
        if free < size * 2 + 512 * 1024 * 1024:
            raise OperationError("Insufficient free space for a retained copy and fresh standby")

    def resume(self):
        if not self.journal.exists():
            return
        record = json.loads(self.journal.read_text())
        old, new = record["old"], record["new"]
        if record["phase"] == "fencing":
            # Write the restart fence BEFORE stopping the old writer. A Docker/host
            # restart can never resurrect that writer during an interrupted transition.
            atomic(self.db.state / f"fence-{old}", "Fenced by the HA controller\n")
            self.db.dc("unpause", old, check=False, timeout=3)
            self.db.dc("stop", "--timeout", "1", old, timeout=10)
            if not self.stopped(old):
                raise OperationError("Cannot confirm fencing; promotion refused")
            self.role(new, "primary", record["new_data"], old)
            (self.db.state / f"fence-{new}").unlink(missing_ok=True)
            if not self.db.running(new):
                self.db.dc("up", "-d", "--no-deps", new)
            if self.sql(new, "SELECT pg_is_in_recovery();") == "t":
                if self.sql(new, "SELECT pg_promote(true, 5);", timeout=6) != "t":
                    raise OperationError("Standby promotion did not complete")
            record["phase"] = "publishing"
            atomic(self.journal, json.dumps(record) + "\n")
        if record["phase"] == "publishing":
            url = self.credentials(new)
            self.db.write("primary.json", new)
            atomic(self.db.url_file, url + "\n")
            record["phase"] = "rejoining"
            atomic(self.journal, json.dumps(record) + "\n")
        if record["phase"] == "rejoining":
            if not record.get("space_checked"):
                self.check_rejoin_space(old, new)
                record["space_checked"] = True
                atomic(self.journal, json.dumps(record) + "\n")
            # Physical slots are not copied by basebackup. Creating the slot does not
            # commit application WAL and therefore cannot wait on the missing replica.
            self.sql(
                new,
                "SELECT pg_create_physical_replication_slot('aura_standby') "
                "WHERE NOT EXISTS (SELECT FROM pg_replication_slots "
                "WHERE slot_name='aura_standby');",
            )
            self.role(old, "standby", record["rejoin_data"], new)
            self.db.dc("up", "-d", "--no-deps", old, timeout=30)
            self.db.wait_replica()
            self.require_sync()
            self.finish_credentials()
            self.db.wait_api_generation(seconds=15)
            record["phase"] = "complete"
            record["completed"] = time.time()
            history = self.db.state / "ha-history"
            history.mkdir(mode=0o700, exist_ok=True)
            atomic(history / f"{record['id']}.json", json.dumps(record) + "\n")
            self.journal.unlink()
            print(f"HA transition completed: {old} -> {new}; former writer rejoined", flush=True)

    def tick(self):
        if self.journal.exists():
            self.resume()
            return
        if not self.db.read("ha.json", {}).get("enabled"):
            raise OperationError("HA has not been enabled")
        try:
            result = self.sql(
                self.db.primary,
                "SET statement_timeout='1s'; SELECT NOT pg_is_in_recovery();",
                timeout=2,
            )
            if result != "t":
                raise OperationError("Writer is not available")
        except (OperationError, subprocess.TimeoutExpired):
            self.failures += 1
            if self.failures >= 3:
                self.transition()
            return
        self.failures = 0
        if not self.db.running(self.db.standby):
            # A stopped replica is recovered in its current role, never promoted.
            self.db.dc("up", "-d", "--no-deps", self.db.standby)

    def watch(self):
        with (self.db.home / "ha-watch.lock").open("a") as watcher:
            fcntl.flock(watcher, fcntl.LOCK_EX | fcntl.LOCK_NB)
            while True:
                with (self.db.home / "operations.lock").open("a") as lock:
                    try:
                        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        self.failures = 0
                    else:
                        try:
                            self.tick()
                        except (
                            OperationError,
                            PrimaryUnavailable,
                            subprocess.TimeoutExpired,
                            OSError,
                        ):
                            print("HA check incomplete; retaining fences and retrying", flush=True)
                time.sleep(0.5)

    def write_unit(self, directory):
        directory.mkdir(parents=True, exist_ok=True)
        root = str(self.db.home.parent).replace("%", "%%").replace('"', '\\"')
        atomic(
            directory / "aura-db-failover.service",
            f"""[Unit]
Description=AURA synchronous PostgreSQL failover (single host)

[Service]
WorkingDirectory={root}
ExecStart=/usr/bin/python3 "{root}/ops/database.py" --project {self.db.project} ha-watch
Restart=always
RestartSec=1s
UMask=0077
TimeoutStopSec=5s

[Install]
WantedBy=default.target
""",
        )

    def install(self):
        if not self.db.read("ha.json", {}).get("enabled"):
            raise OperationError("Run ha-enable before installing the failover service")
        self.write_unit(Path.home() / ".config/systemd/user")
        run(["systemctl", "--user", "daemon-reload"])
        run(["systemctl", "--user", "enable", "--now", "aura-db-failover.service"])
        run(["systemctl", "--user", "restart", "aura-db-failover.service"])
        print("HA failover service enabled")
