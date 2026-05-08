"""Regression tests for self-hosted runner helper scripts.

Usage:
    python3 scripts/test_runner_scripts.py
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SETUP_SCRIPT = REPO_ROOT / "scripts" / "setup-runners.sh"
REMOVE_SCRIPT = REPO_ROOT / "scripts" / "remove-runners.sh"
RUNNER_LIB = REPO_ROOT / "scripts" / "runner-lib.sh"
CI_DOCS = REPO_ROOT / "docs" / "CI_LOCAL.md"


class RunnerScriptTests(unittest.TestCase):
    def test_setup_runner_count_and_docs_stay_at_four(self):
        setup = SETUP_SCRIPT.read_text(encoding="utf-8")
        runner_lib = RUNNER_LIB.read_text(encoding="utf-8")
        docs = CI_DOCS.read_text(encoding="utf-8")

        self.assertIn("WORKERS=4", runner_lib)
        self.assertNotIn("WORKERS=8", setup)
        self.assertNotIn("WORKERS=8", runner_lib)
        self.assertIn("actions-runner-1` … `~/actions-runner-4", docs)
        self.assertIn("mac-runner-1` … `mac-runner-4", docs)
        self.assertNotIn("Replace 5..8", docs)
        self.assertNotIn("for i in 5 6 7 8", docs)

    def test_remove_runners_deregisters_configured_runners_and_tolerates_missing_ones(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            home = Path(tmpdir) / "home"
            bin_dir = Path(tmpdir) / "bin"
            home.mkdir()
            bin_dir.mkdir()
            log = Path(tmpdir) / "calls.log"

            gh = bin_dir / "gh"
            gh.write_text(
                textwrap.dedent(
                    f"""\
                    #!/bin/sh
                    echo "gh $*" >> "{log}"
                    case "$*" in
                      *remove-token*) echo REMOVE_TOKEN ;;
                      *) exit 1 ;;
                    esac
                    """
                ),
                encoding="utf-8",
            )
            gh.chmod(0o755)

            configured = home / "actions-runner-1"
            configured.mkdir()
            (configured / ".runner").touch()
            config = configured / "config.sh"
            config.write_text(
                textwrap.dedent(
                    f"""\
                    #!/bin/sh
                    echo "$(basename "$PWD") config $*" >> "{log}"
                    if [ "$1" = remove ]; then
                      [ "$3" = REMOVE_TOKEN ] || exit 7
                      [ "$4" != "--unattended" ] || exit 9
                      rm -f .runner
                      exit 0
                    fi
                    exit 1
                    """
                ),
                encoding="utf-8",
            )
            config.chmod(0o755)
            svc = configured / "svc.sh"
            svc.write_text(
                textwrap.dedent(
                    f"""\
                    #!/bin/sh
                    echo "$(basename "$PWD") svc $*" >> "{log}"
                    exit 0
                    """
                ),
                encoding="utf-8",
            )
            svc.chmod(0o755)

            partial = home / "actions-runner-2"
            partial.mkdir()
            (partial / ".credentials").touch()
            skipped = home / "actions-runner-5"
            skipped.mkdir()
            (skipped / ".runner").touch()

            env = os.environ.copy()
            env["HOME"] = str(home)
            env["PATH"] = f"{bin_dir}{os.pathsep}{env['PATH']}"
            result = subprocess.run(
                ["bash", str(REMOVE_SCRIPT)],
                cwd=REPO_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Skipping missing runner directory", result.stdout)
            self.assertNotIn("=== mac-runner-5 ===", result.stdout)
            self.assertIn("config.sh missing", result.stderr)
            calls = log.read_text(encoding="utf-8").splitlines()
            self.assertEqual(
                calls.count(
                    "gh api -X POST repos/hubertgajewski/orwellstat/actions/runners/remove-token --jq .token"
                ),
                1,
            )
            self.assertIn("actions-runner-1 svc stop", calls)
            self.assertIn("actions-runner-1 svc uninstall", calls)
            self.assertIn("actions-runner-1 config remove --token REMOVE_TOKEN", calls)
            self.assertFalse(any("actions-runner-5" in call for call in calls))

    def test_remove_runners_continues_when_one_runner_removal_fails(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            home = Path(tmpdir) / "home"
            bin_dir = Path(tmpdir) / "bin"
            home.mkdir()
            bin_dir.mkdir()
            log = Path(tmpdir) / "calls.log"

            gh = bin_dir / "gh"
            gh.write_text(
                textwrap.dedent(
                    f"""\
                    #!/bin/sh
                    echo "gh $*" >> "{log}"
                    echo REMOVE_TOKEN
                    """
                ),
                encoding="utf-8",
            )
            gh.chmod(0o755)

            for index in (1, 2):
                runner = home / f"actions-runner-{index}"
                runner.mkdir()
                (runner / ".runner").touch()
                config = runner / "config.sh"
                exit_code = 6 if index == 1 else 0
                config.write_text(
                    textwrap.dedent(
                        f"""\
                        #!/bin/sh
                        echo "$(basename "$PWD") config $*" >> "{log}"
                        exit {exit_code}
                        """
                    ),
                    encoding="utf-8",
                )
                config.chmod(0o755)

            env = os.environ.copy()
            env["HOME"] = str(home)
            env["PATH"] = f"{bin_dir}{os.pathsep}{env['PATH']}"
            result = subprocess.run(
                ["bash", str(REMOVE_SCRIPT)],
                cwd=REPO_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("failed to remove runner registration", result.stderr)
            calls = log.read_text(encoding="utf-8").splitlines()
            self.assertIn("actions-runner-1 config remove --token REMOVE_TOKEN", calls)
            self.assertIn("actions-runner-2 config remove --token REMOVE_TOKEN", calls)

    def test_setup_fails_when_registration_token_is_missing(self):
        for token in ("", "null"):
            with self.subTest(token=token):
                with tempfile.TemporaryDirectory() as tmpdir:
                    home = Path(tmpdir) / "home"
                    bin_dir = Path(tmpdir) / "bin"
                    src = home / "actions-runner-src"
                    home.mkdir()
                    bin_dir.mkdir()
                    src.mkdir()
                    (src / "config.sh").touch()

                    gh = bin_dir / "gh"
                    gh.write_text(
                        textwrap.dedent(
                            f"""\
                            #!/bin/sh
                            printf '%s\\n' "{token}"
                            """
                        ),
                        encoding="utf-8",
                    )
                    gh.chmod(0o755)

                    env = os.environ.copy()
                    env["HOME"] = str(home)
                    env["PATH"] = f"{bin_dir}{os.pathsep}{env['PATH']}"
                    result = subprocess.run(
                        ["bash", str(SETUP_SCRIPT), str(src)],
                        cwd=REPO_ROOT,
                        env=env,
                        capture_output=True,
                        text=True,
                        check=False,
                    )

                    self.assertEqual(result.returncode, 1)
                    self.assertIn("GitHub did not return a runner registration token", result.stderr)

    def test_setup_fails_when_removal_token_is_missing(self):
        for token in ("", "null"):
            with self.subTest(token=token):
                with tempfile.TemporaryDirectory() as tmpdir:
                    home = Path(tmpdir) / "home"
                    bin_dir = Path(tmpdir) / "bin"
                    src = home / "actions-runner-src"
                    runner = home / "actions-runner-1"
                    home.mkdir()
                    bin_dir.mkdir()
                    src.mkdir()
                    runner.mkdir()
                    (src / "config.sh").touch()
                    (runner / "config.sh").touch()
                    (runner / ".runner").touch()

                    gh = bin_dir / "gh"
                    gh.write_text(
                        textwrap.dedent(
                            f"""\
                            #!/bin/sh
                            case "$*" in
                              *remove-token*) printf '%s\\n' "{token}" ;;
                              *registration-token*) echo REGISTER_TOKEN ;;
                              *) exit 1 ;;
                            esac
                            """
                        ),
                        encoding="utf-8",
                    )
                    gh.chmod(0o755)

                    env = os.environ.copy()
                    env["HOME"] = str(home)
                    env["PATH"] = f"{bin_dir}{os.pathsep}{env['PATH']}"
                    result = subprocess.run(
                        ["bash", str(SETUP_SCRIPT), str(src)],
                        cwd=REPO_ROOT,
                        env=env,
                        capture_output=True,
                        text=True,
                        check=False,
                    )

                    self.assertEqual(result.returncode, 1)
                    self.assertIn("GitHub did not return a runner removal token", result.stderr)

    def test_setup_aborts_when_existing_runner_removal_fails(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            home = Path(tmpdir) / "home"
            bin_dir = Path(tmpdir) / "bin"
            src = home / "actions-runner-src"
            runner = home / "actions-runner-1"
            home.mkdir()
            bin_dir.mkdir()
            src.mkdir()
            runner.mkdir()
            log = Path(tmpdir) / "calls.log"

            gh = bin_dir / "gh"
            gh.write_text(
                textwrap.dedent(
                    f"""\
                    #!/bin/sh
                    echo "gh $*" >> "{log}"
                    case "$*" in
                      *remove-token*) echo REMOVE_TOKEN ;;
                      *registration-token*) echo REGISTER_TOKEN ;;
                      *) exit 1 ;;
                    esac
                    """
                ),
                encoding="utf-8",
            )
            gh.chmod(0o755)

            (src / "config.sh").write_text(
                textwrap.dedent(
                    f"""\
                    #!/bin/sh
                    echo "source config $*" >> "{log}"
                    exit 0
                    """
                ),
                encoding="utf-8",
            )
            (src / "config.sh").chmod(0o755)
            (runner / ".runner").touch()
            (runner / "config.sh").write_text(
                textwrap.dedent(
                    f"""\
                    #!/bin/sh
                    echo "$(basename "$PWD") config $*" >> "{log}"
                    exit 6
                    """
                ),
                encoding="utf-8",
            )
            (runner / "config.sh").chmod(0o755)

            env = os.environ.copy()
            env["HOME"] = str(home)
            env["PATH"] = f"{bin_dir}{os.pathsep}{env['PATH']}"
            result = subprocess.run(
                ["bash", str(SETUP_SCRIPT), str(src)],
                cwd=REPO_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 1)
            self.assertIn("failed to remove runner registration", result.stderr)
            calls = log.read_text(encoding="utf-8").splitlines()
            self.assertIn("actions-runner-1 config remove --token REMOVE_TOKEN", calls)
            self.assertFalse(
                any("config --url https://github.com/hubertgajewski/orwellstat" in call for call in calls)
            )

    def test_remove_fails_when_removal_token_is_missing(self):
        for token in ("", "null"):
            with self.subTest(token=token):
                with tempfile.TemporaryDirectory() as tmpdir:
                    home = Path(tmpdir) / "home"
                    bin_dir = Path(tmpdir) / "bin"
                    runner = home / "actions-runner-1"
                    home.mkdir()
                    bin_dir.mkdir()
                    runner.mkdir()
                    (runner / "config.sh").touch()
                    (runner / ".runner").touch()

                    gh = bin_dir / "gh"
                    gh.write_text(
                        textwrap.dedent(
                            f"""\
                            #!/bin/sh
                            printf '%s\\n' "{token}"
                            """
                        ),
                        encoding="utf-8",
                    )
                    gh.chmod(0o755)

                    env = os.environ.copy()
                    env["HOME"] = str(home)
                    env["PATH"] = f"{bin_dir}{os.pathsep}{env['PATH']}"
                    result = subprocess.run(
                        ["bash", str(REMOVE_SCRIPT)],
                        cwd=REPO_ROOT,
                        env=env,
                        capture_output=True,
                        text=True,
                        check=False,
                    )

                    self.assertEqual(result.returncode, 1)
                    self.assertIn("GitHub did not return a runner removal token", result.stderr)

    def test_setup_reconfigures_existing_runner_before_registering(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            home = Path(tmpdir) / "home"
            bin_dir = Path(tmpdir) / "bin"
            src = home / "actions-runner-src"
            runner = home / "actions-runner-1"
            home.mkdir()
            bin_dir.mkdir()
            src.mkdir()
            runner.mkdir()
            log = Path(tmpdir) / "calls.log"

            gh = bin_dir / "gh"
            gh.write_text(
                textwrap.dedent(
                    f"""\
                    #!/bin/sh
                    echo "gh $*" >> "{log}"
                    case "$*" in
                      *remove-token*) echo REMOVE_TOKEN ;;
                      *registration-token*) echo REGISTER_TOKEN ;;
                      *) exit 1 ;;
                    esac
                    """
                ),
                encoding="utf-8",
            )
            gh.chmod(0o755)

            config = src / "config.sh"
            config.write_text(
                textwrap.dedent(
                    f"""\
                    #!/bin/sh
                    echo "$(basename "$PWD") config $*" >> "{log}"
                    if [ "$1" = remove ]; then
                      [ "$3" = REMOVE_TOKEN ] || exit 7
                      [ "$4" != "--unattended" ] || exit 9
                      rm -f .runner
                      exit 0
                    fi
                    if [ -f .runner ]; then
                      echo "Cannot configure the runner because it is already configured." >&2
                      exit 1
                    fi
                    [ "$4" = REGISTER_TOKEN ] || exit 8
                    touch .runner
                    cat > svc.sh <<'EOF'
                    #!/bin/sh
                    echo "$(basename "$PWD") svc $*" >> "{log}"
                    exit 0
                    EOF
                    chmod +x svc.sh
                    """
                ),
                encoding="utf-8",
            )
            config.chmod(0o755)

            (runner / "config.sh").write_text(config.read_text(encoding="utf-8"), encoding="utf-8")
            (runner / "config.sh").chmod(0o755)
            (runner / ".runner").touch()
            svc = runner / "svc.sh"
            svc.write_text(
                textwrap.dedent(
                    f"""\
                    #!/bin/sh
                    echo "$(basename "$PWD") svc $*" >> "{log}"
                    exit 0
                    """
                ),
                encoding="utf-8",
            )
            svc.chmod(0o755)

            env = os.environ.copy()
            env["HOME"] = str(home)
            env["PATH"] = f"{bin_dir}{os.pathsep}{env['PATH']}"
            result = subprocess.run(
                ["bash", str(SETUP_SCRIPT), str(src)],
                cwd=REPO_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("All 4 runners started.", result.stdout)
            self.assertNotIn("=== mac-runner-5 ===", result.stdout)
            calls = log.read_text(encoding="utf-8").splitlines()
            self.assertLess(
                calls.index("actions-runner-1 config remove --token REMOVE_TOKEN"),
                calls.index(
                    "actions-runner-1 config --url https://github.com/hubertgajewski/orwellstat --token REGISTER_TOKEN --name mac-runner-1 --unattended --replace"
                ),
            )


if __name__ == "__main__":
    unittest.main()
