#!/usr/bin/env python3
"""Verify reuse of a shared Caddy using only disposable containers and networks."""

import ipaddress
import json
import os
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]


def main():
    project = "aura-caddy-test-" + secrets.token_hex(4)
    network = project + "-shared"
    environment = {
        **os.environ,
        "AURA_CADDY_NETWORK": network,
        "AURA_API_PROXY_URL": "http://caddy:8080",
        "AURA_API_REPLICAS": "2",
    }
    network_ids = subprocess.check_output(["docker", "network", "ls", "-q"], text=True).split()
    networks = json.loads(subprocess.check_output(["docker", "network", "inspect", *network_ids]))
    used = [
        ipaddress.ip_network(config["Subnet"])
        for item in networks
        for config in (item.get("IPAM", {}).get("Config") or [])
        if config.get("Subnet")
    ]
    first = secrets.randbelow(256)
    available = [
        ipaddress.ip_network(f"10.252.{(first + offset) % 256}.0/24") for offset in range(256)
    ]
    available = [
        candidate
        for candidate in available
        if not any(
            candidate.version == subnet.version and candidate.overlaps(subnet) for subnet in used
        )
    ]
    if len(available) < 2:
        raise RuntimeError("No free isolated test subnets in 10.252.0.0/16")
    shared_subnet, private_subnet = map(str, available[:2])
    environment["AURA_TEST_PRIVATE_SUBNET"] = private_subnet
    environment["AURA_DOCKER_SUBNET"] = private_subnet
    with tempfile.TemporaryDirectory(prefix=project + "-") as temporary:
        root = Path(temporary)
        shutil.copy2(SOURCE / "compose.lb.yaml", root / "compose.lb.yaml")
        shutil.copy2(SOURCE / "compose.yaml", root / "compose.production.yaml")
        shutil.copy2(SOURCE / "ops/fixtures/proxy_backend.py", root / "server.py")
        # The public test listener uses HTTP on a random localhost port; no ACME or
        # production domains/certificates/configuration are used by this test.
        source_caddy = (SOURCE / "caddy/aura.caddy").read_text()
        (root / "Caddyfile").write_text(
            source_caddy.replace("mall.example.com {", "http://:8081 {").replace(
                "\ttls force_automate\n", ""
            )
        )
        # Check the real HTTPS configuration without requesting any certificate.
        (root / "Caddyfile.automation").write_text(
            "{\n on_demand_tls {\n ask http://127.0.0.1:9999/permission\n }\n}\n"
            "*.example.com {\n tls {\n on_demand\n }\n respond wildcard\n}\n" + source_caddy
        )
        (root / ".env").write_text(
            "\n".join(
                [
                    "POSTGRES_DB=aura",
                    "POSTGRES_USER=test",
                    "POSTGRES_PASSWORD=test-only-unused",
                    "AURA_BFF_SHARED_KEY=test-only-unused-key-0123456789012345",
                    "AURA_JWT_SIGNING_KEY=test-only-unused-key-0123456789012345",
                    "AURA_JWT_ISSUER=test",
                    "AURA_JWT_AUDIENCE=test",
                    "APP_ORIGIN=https://mall.example.com",
                    "",
                ]
            )
        )
        (root / "fixture.yaml").write_text("""services:
  api:
    image: python:3.12-slim
    command: [python, -u, /fixture/server.py]
    environment: {ROLE: api, PORT: '8000'}
    volumes: ['./server.py:/fixture/server.py:ro']
    networks: {aura-internal: {}}
  web:
    image: python:3.12-slim
    command: [python, -u, /fixture/server.py]
    environment: {ROLE: web, PORT: '3000'}
    volumes: ['./server.py:/fixture/server.py:ro']
    ports: ['127.0.0.1:13000:3000']
    networks: {aura-internal: {}}
  edge:
    image: caddy:2.11.4
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./Caddyfile.automation:/etc/caddy/automation.Caddyfile:ro
    ports: ['127.0.0.1::8081']
    networks:
      caddy:
        aliases: [caddy]
networks:
  aura-internal:
    ipam:
      config:
        - subnet: ${AURA_TEST_PRIVATE_SUBNET}
""")

        def run(*args, check=True):
            result = subprocess.run(
                list(map(str, args)), env=environment, capture_output=True, text=True, timeout=180
            )
            if check and result.returncode:
                raise RuntimeError(result.stderr)
            return result

        compose = [
            "docker",
            "compose",
            "--project-directory",
            root,
            "-p",
            project,
            "-f",
            root / "fixture.yaml",
            "-f",
            root / "compose.lb.yaml",
        ]

        def dc(*args, **kwargs):
            return run(*compose, *args, **kwargs)

        def eventually(action, seconds=40):
            deadline = time.monotonic() + seconds
            while True:
                try:
                    return action()
                except (AssertionError, urllib.error.URLError, RuntimeError):
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.5)

        run("docker", "network", "create", "--subnet", shared_subnet, network)
        try:
            production = json.loads(
                run(
                    "docker",
                    "compose",
                    "--project-directory",
                    root,
                    "-f",
                    root / "compose.production.yaml",
                    "-f",
                    root / "compose.lb.yaml",
                    "config",
                    "--format",
                    "json",
                ).stdout
            )
            assert set(production["services"]) == {"api", "web", "db"}
            assert not production["services"]["web"].get("ports")
            assert production["services"]["web"]["environment"]["API_URL"] == "http://caddy:8080"
            assert set(production["services"]["db"]["networks"]) == {"aura-internal"}
            print(
                "PASS: app Compose starts no proxy; Next.js has no host port; DB remains private",
                flush=True,
            )
            tls_config = json.loads(
                dc(
                    "run",
                    "--rm",
                    "--no-deps",
                    "--entrypoint",
                    "caddy",
                    "edge",
                    "adapt",
                    "--config",
                    "/etc/caddy/automation.Caddyfile",
                    "--adapter",
                    "caddyfile",
                ).stdout
            )
            assert "mall.example.com" in tls_config["apps"]["tls"]["certificates"]["automate"]
            print(
                "PASS: web certificate is explicitly automated alongside a shared wildcard site",
                flush=True,
            )
            dc(
                "run",
                "--rm",
                "--no-deps",
                "--entrypoint",
                "caddy",
                "edge",
                "validate",
                "--config",
                "/etc/caddy/Caddyfile",
                "--adapter",
                "caddyfile",
            )
            dc("up", "-d", "--scale", "api=2", "api", "web", "edge")
            edge = dc("ps", "-q", "edge").stdout.strip()
            port = dc("port", "edge", "8081").stdout.strip().rsplit(":", 1)[1]
            address = f"http://127.0.0.1:{port}"

            def request(path, *, data=None):
                req = urllib.request.Request(
                    address + path, data=data, headers={"Host": "mall.example.com"}
                )
                with urllib.request.urlopen(req, timeout=20) as response:
                    return json.load(response)

            def balanced(count):
                replies = [request("/probe?keep=yes") for _ in range(12)]
                assert all(
                    reply["via_web"]
                    and reply["public_host"] == "mall.example.com"
                    and reply["upstream_host"] == "caddy:8080"
                    and reply["path"] == "/probe?keep=yes"
                    for reply in replies
                )
                assert len({reply["backend"] for reply in replies}) == count

            eventually(lambda: balanced(2))
            print(
                "PASS: browser -> shared Caddy -> Next/BFF -> same Caddy -> two API replicas",
                flush=True,
            )

            def write_count():
                total = 0
                for container in dc("ps", "-q", "api").stdout.split():
                    reply = run(
                        "docker",
                        "exec",
                        container,
                        "python",
                        "-c",
                        "import urllib.request; print(urllib.request.urlopen("
                        "'http://127.0.0.1:8000/count').read().decode())",
                    )
                    total += json.loads(reply.stdout)["writes"]
                return total

            before = write_count()
            try:
                request("/drop-after-write", data=b"synthetic-write")
            except urllib.error.HTTPError as error:
                assert error.code == 502
            else:
                raise AssertionError("Expected an upstream disconnect")
            assert write_count() == before + 1
            print(
                "PASS: an upstream disconnect after a POST write does not replay the write",
                flush=True,
            )

            for count in (3, 1):
                dc("up", "-d", "--scale", f"api={count}", "api")
                eventually(lambda count=count: balanced(count))
                assert dc("ps", "-q", "edge").stdout.strip() == edge
            dc("stop", "api", "web")
            assert dc("ps", "--status", "running", "-q", "edge").stdout.strip() == edge
            print(
                "PASS: scale 2 -> 3 -> 1 without restarting Caddy; "
                "app stop leaves shared Caddy running",
                flush=True,
            )
        finally:
            dc("down", "--volumes", "--remove-orphans", check=False)
            run("docker", "network", "rm", network, check=False)


if __name__ == "__main__":
    main()
