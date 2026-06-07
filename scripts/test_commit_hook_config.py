"""Unit tests for the Claude/Codex publish-time Git command hooks.

Usage:
    python3 scripts/test_commit_hook_config.py
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import MagicMock, patch


REPO_ROOT = Path(__file__).resolve().parent.parent
HOOK_FILES = (".claude/settings.json", ".codex/hooks.json")
_SPEC = importlib.util.spec_from_file_location(
    "verify_commit_command_hook", REPO_ROOT / "scripts" / "verify_commit_command_hook.py"
)
hook = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(hook)


class CommandDecisionTests(unittest.TestCase):
    def test_allows_direct_push_forms(self):
        for command in (
            "git push",
            "git push origin HEAD",
            "git push --force-with-lease origin HEAD",
            "git push origin HEAD:refs/heads/main",
        ):
            with self.subTest(command=command):
                self.assertEqual(hook.command_decision(command), "allow")

    def test_blocks_non_direct_push_forms(self):
        for command in (
            "cd /tmp && git push",
            "git push && git status",
            "git push; git status",
            "git push || git status",
            "git -C . push",
            "git --git-dir . push",
            "git --work-tree . push",
            "git --unknown push",
            "git send-pack origin refs/heads/main",
            "git-send-pack origin refs/heads/main",
            "git -c alias.pub=push pub origin HEAD",
            "git -calias.pub=push pub origin HEAD",
            "git -c include.path=/tmp/gitconfig pub origin HEAD",
            "git -c includeIf.gitdir:/path/.git.path=/tmp/gitconfig pub origin HEAD",
            "git --config-env alias.pub=GIT_ALIAS pub origin HEAD",
            "git --config-env includeIf.gitdir:/path/.git.path=GIT_INCLUDE pub origin HEAD",
            "git --config-env=alias.pub=GIT_ALIAS pub origin HEAD",
            "echo $(git -C . push)",
            "echo $(git -c alias.pub=push pub origin HEAD)",
            "echo $(git --config-env alias.pub=GIT_ALIAS pub origin HEAD)",
            "git push origin \"$(date)\"",
            'git "push" origin HEAD',
            "git 'push' origin HEAD",
            "git pu\\sh origin HEAD",
            "true\ngit push",
            "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.pub GIT_CONFIG_VALUE_0=push git pub origin HEAD",
            "GIT_CONFIG_GLOBAL=/tmp/gitconfig git pub origin HEAD",
            "env GIT_CONFIG_GLOBAL=/tmp/gitconfig git pub origin HEAD",
            "$'git' push origin HEAD",
            "`printf git` push origin HEAD",
            "`printf /usr/bin/git` push origin HEAD",
            "`printf git` -c alias.pub=push pub origin HEAD",
            "$(printf git) -c alias.pub=push pub origin HEAD",
            "$'git' -c alias.pub=push pub origin HEAD",
            "git${IFS}push origin HEAD",
            "G=git; $G push origin HEAD",
            "G=git; C=push; $G $C origin HEAD",
            "env git push origin HEAD",
            "env -- git push origin HEAD",
            "env FOO=bar git push origin HEAD",
            "env -i git push origin HEAD",
            "env -u FOO git push origin HEAD",
            "env -C /tmp git push origin HEAD",
            "env -P /usr/bin git push origin HEAD",
            "env -P/usr/bin git push origin HEAD",
            "env -S 'git push origin HEAD'",
            "env -S'git push origin HEAD'",
            "env -Sgit push origin HEAD",
            "env --split-string='git push origin HEAD'",
            "command env -S 'git push origin HEAD'",
            "exec env -S 'git push origin HEAD'",
            "command env -Sgit push origin HEAD",
            "command git push origin HEAD",
            "command -- bash -c 'git push origin HEAD'",
            "command -p git -c alias.pub=push pub origin HEAD",
            "command -p env -S 'git push origin HEAD'",
            "command eval 'git push origin HEAD'",
            "exec git push origin HEAD",
            "exec -a name git -c alias.pub=push pub origin HEAD",
            "exec -a name env -S 'git push origin HEAD'",
            "exec -c git -c alias.pub=push pub origin HEAD",
            "exec -l git -c alias.pub=push pub origin HEAD",
            "exec -cl git -c alias.pub=push pub origin HEAD",
            "exec -lc git -c alias.pub=push pub origin HEAD",
            "exec -la name git -c alias.pub=push pub origin HEAD",
            'eval "git push origin HEAD"',
            'cmd="git push origin HEAD"; eval "$cmd"',
            "printf 'push origin HEAD' | xargs git",
            "printf 'push origin HEAD' | xargs /usr/bin/git",
            "xargs -a /tmp/args sh -c 'git push origin HEAD'",
            "xargs -a /tmp/args git",
            "xargs -a /tmp/args -I{} git {} origin HEAD",
            "xargs --arg-file=/tmp/args -I{} git {} origin HEAD",
            "xargs -a /tmp/args git -C . push origin HEAD",
            "printf 'push --force' | xargs git -C .",
            "xargs -a /tmp/args git -c alias.pub=push pub origin HEAD",
            "xargs -a /tmp/args env GIT_CONFIG_GLOBAL=/tmp/gitconfig git pub origin HEAD",
            "printf 'push origin HEAD' | xargs env git",
            "xargs -a /tmp/args env git",
            "printf 'push origin HEAD' | xargs env -S git",
            "xargs -a /tmp/args env -S git",
            "printf 'push origin HEAD' | xargs env -Sgit",
            "xargs -a /tmp/args env --split-string=git",
            'xargs -a /tmp/args -I{} sh -c "{}"',
            'xargs -a /tmp/args -I{} env sh -c "{}"',
            'xargs --replace={} sh -c "{}"',
            "xargs -i sh -c '{}'",
            "xargs -i git {} origin HEAD",
            "xargs sh -c < /tmp/args",
            "printf 'git push origin HEAD' | sh",
            'printf "git push origin HEAD" | xargs -I{} sh -c "{}"',
            "printf git | xargs -I{} {} push origin HEAD",
            "printf git | xargs -I{} {} -c alias.pub=push pub origin HEAD",
            "printf git | xargs -I{} /usr/bin/{} -c alias.pub=push pub origin HEAD",
            "printf git | xargs --replace=G /usr/bin/G -c alias.pub=push pub origin HEAD",
            "printf git | xargs -I{} /usr/bin/env {} -c alias.pub=push pub origin HEAD",
            "dash -c 'git push origin HEAD'",
            "python3 -c 'import os; os.system(\"git push origin HEAD\")'",
            "python3 -c 'import os; os.system(\"git\"+\" push origin HEAD\")'",
            "node -e 'require(\"child_process\").execSync(\"git push origin HEAD\")'",
            "node -e 'require(\"child_process\").execSync(\"git\"+\" push origin HEAD\")'",
            "node --eval='require(\"child_process\").execSync(\"git push origin HEAD\")'",
            "node --print='require(\"child_process\").execSync(\"git push origin HEAD\")'",
            "node --eval='require(\"child_process\").execSync(\"git\"+\" push origin HEAD\")'",
            "node -p'require(\"child_process\").execSync(\"git push origin HEAD\")'",
            "node -p -e 'require(\"child_process\").execSync(\"git push origin HEAD\")'",
            "node --print --eval 'require(\"child_process\").execSync(\"git push origin HEAD\")'",
            "node -pe'require(\"child_process\").execSync(\"git push origin HEAD\")'",
            "bash -c 'git push origin HEAD'",
            "bash -lc 'git push origin HEAD'",
            "bash -lc'git push origin HEAD'",
            "bash --rcfile /tmp/x -c 'git push origin HEAD'",
            "bash <<EOF\ngit push origin HEAD\nEOF",
            "true\nbash <<EOF\ngit push origin HEAD\nEOF",
            "sh <<EOF-1\ngit push origin HEAD\nEOF-1",
            "env bash -c 'git push origin HEAD'",
            "sh -c 'git push origin HEAD'",
            "zsh -c 'git push origin HEAD'",
            "zsh --no-rcs -c 'git push origin HEAD'",
            "/usr/bin/git push origin HEAD",
            "/usr/bin/env -- git push origin HEAD",
            "(git push origin HEAD)",
            "{ git push origin HEAD; }",
            "if true; then git push origin HEAD; fi",
            "echo git push",
            "echo $(git push origin HEAD)",
            "echo `git push origin HEAD`",
            'python3 - <<X\nprint("echo $(printf \'git push\')")\nX',
            "python3 - <<X\ngit push origin HEAD\nX",
            "python3 - <<'EOF-1'\ngit push origin HEAD\nEOF-1\ngit status",
            "git pu$(printf sh) origin HEAD",
            "git 'push",
        ):
            with self.subTest(command=command):
                self.assertEqual(hook.command_decision(command), "block")

    def test_recursion_limit_blocks_push_payload(self):
        self.assertEqual(
            hook.command_decision("git push origin HEAD", hook.MAX_ENV_SPLIT_DEPTH + 1),
            "block",
        )

    def test_ignores_non_push_commands(self):
        for command in (
            'echo "; git push --force"',
            "git help push",
            "git show push",
            'git show :README.md | rg -n "push hook"',
            "git commit -m test",
            'git commit -m "push docs"',
            "bash -c 'git commit -m push'",
            "python3 -c 'import os; os.system(\"git commit -m push\")'",
            "node -e 'require(\"child_process\").execSync(\"git commit -m push\")'",
            "git commit-graph verify",
            "GIT_CONFIG_NOSYSTEM=1 git status",
            "GIT_CONFIG_NOSYSTEM=1 git branch",
            "GIT_CONFIG_GLOBAL=/tmp/gitconfig echo git",
            "xargs -a /tmp/args git status",
            "xargs -a /tmp/args git -C . status",
            "xargs -a /tmp/args env -S 'git status'",
            "git config --get user.name",
            "git config get user.name",
            "git tag -l",
            "git submodule status",
            "git blame README.md",
            "git version",
            "git gc",
            "git worktree add /tmp/wt HEAD",
            "git worktree list",
            "git check-ignore -q .worktrees",
            "git diff",
            "git mv old new",
            "git rm --cached file",
            "git apply patch.diff",
            "git reflog",
            "git rebase origin/main",
            "git rebase --continue",
            "git rebase --abort",
            "git rebase --quit",
            "git merge feature",
            "git merge --abort",
            "git merge --quit",
            "git cherry-pick abc123",
            "git cherry-pick --abort",
            "git cherry-pick --quit",
            "git reset --soft HEAD~1",
            "git ls-tree HEAD",
            "git ls-remote --heads origin feature/563",
            "git describe --tags",
            "git show-ref --heads",
            "git diff | xargs echo push",
            "python3 scripts/foo.py git push",
            "command -v git push origin HEAD",
            "command -V git push origin HEAD",
            "command -pv git push origin HEAD",
            "command -pV git push origin HEAD",
            "git status | xargs echo push",
            "bash <<EOF\necho hi\nEOF",
            "git status | xargs echo",
            "echo $PATH | xargs echo",
            "echo $PATH | xargs echo push",
            "sh /tmp/setup.sh",
            "bash scripts/setup-runners.sh",
            "node scripts/setup.js",
            "git status",
        ):
            with self.subTest(command=command):
                self.assertEqual(hook.command_decision(command), "none")

    def test_main_returns_none_block_and_allow_decisions(self):
        payload = json.dumps({"tool_input": {"command": "git status"}})
        with patch("sys.argv", ["hook", "codex"]), patch("sys.stdin", io.StringIO(payload)):
            self.assertEqual(hook.main(), 0)

        for payload in ("", "{}", json.dumps({"tool_input": {}})):
            with self.subTest(payload=payload):
                with patch("sys.argv", ["hook", "codex"]), patch("sys.stdin", io.StringIO(payload)):
                    self.assertEqual(hook.main(), 0)

        payload = json.dumps({"tool_input": {"command": "env git push origin HEAD"}})
        with (
            patch("sys.argv", ["hook", "codex"]),
            patch("sys.stdin", io.StringIO(payload)),
            redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(hook.main(), 2)

        root = MagicMock(returncode=0, stdout=f"{REPO_ROOT}\n", stderr="")
        with (
            patch("sys.argv", ["hook", "codex"]),
            patch("sys.stdin", io.StringIO(json.dumps({"tool_input": {"command": "git push origin HEAD"}}))),
            patch.object(hook.subprocess, "run", return_value=root),
        ):
            self.assertEqual(hook.main(), 0)

    def test_main_and_check_error_paths(self):
        with patch("sys.argv", ["hook", "unknown"]), redirect_stderr(io.StringIO()):
            self.assertEqual(hook.main(), 2)

        failed_root = MagicMock(returncode=1, stdout="", stderr="not a repo\n")
        with (
            patch("sys.argv", ["hook", "codex"]),
            patch("sys.stdin", io.StringIO(json.dumps({"tool_input": {"command": "git push origin HEAD"}}))),
            patch.object(hook.subprocess, "run", return_value=failed_root),
            redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(hook.main(), 2)

        failed_check = MagicMock(returncode=1, stdout="type output\n", stderr="type error\n")
        with patch.object(hook.subprocess, "run", return_value=failed_check), redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                hook.run_check(["npx", "tsc", "--noEmit"], REPO_ROOT)


class PublishCommandHookTests(unittest.TestCase):
    def run_hook_command(
        self,
        hook_command: str,
        command: str,
        *,
        cwd: str | Path | None = None,
    ) -> tuple[int, list[str], str]:
        with tempfile.TemporaryDirectory() as tmpdir:
            calls_path = Path(tmpdir) / "calls.log"
            for executable in ("npx", "npm"):
                wrapper = Path(tmpdir) / executable
                wrapper.write_text(
                    textwrap.dedent(
                        f"""\
                        #!/bin/sh
                        echo "{executable} $*" >> "{calls_path}"
                        exit 0
                        """
                    ),
                    encoding="utf-8",
                )
                wrapper.chmod(0o755)

            env = os.environ.copy()
            env["PATH"] = f"{tmpdir}{os.pathsep}{env['PATH']}"
            result = subprocess.run(
                ["/bin/sh", "-c", hook_command],
                cwd=Path(cwd) if cwd is not None else REPO_ROOT,
                env=env,
                input=json.dumps({"tool_input": {"command": command}}),
                capture_output=True,
                text=True,
                check=False,
            )
            calls = calls_path.read_text(encoding="utf-8").splitlines() if calls_path.exists() else []
            return result.returncode, calls, result.stderr

    def run_hook(self, hook_file: str, command: str) -> tuple[int, list[str], str]:
        return self.run_hook_command(self.publish_hook_command(hook_file), command)

    def publish_hook_command(self, hook_file: str) -> str:
        return self._bash_hook_command(hook_file, "verify_commit_command_hook.py")

    def playwright_hook_command(self, hook_file: str) -> str:
        return self._bash_hook_command(hook_file, "verify_playwright_cli_hook.py")

    def _bash_hook_command(self, hook_file: str, marker: str) -> str:
        hook_config = json.loads((REPO_ROOT / hook_file).read_text(encoding="utf-8"))
        for group in hook_config["hooks"]["PreToolUse"]:
            if group.get("matcher") != "Bash":
                continue
            for hook_config_entry in group["hooks"]:
                command = hook_config_entry.get("command", "")
                if marker in command:
                    return command
        raise AssertionError(f"{marker} hook not found in {hook_file}")

    def assert_hook_case(
        self,
        command: str,
        expected_status: int,
        expected_calls: list[str],
        expected_stderr: str | None = None,
    ) -> None:
        for hook_file in HOOK_FILES:
            with self.subTest(hook_file=hook_file, command=command):
                status, calls, stderr = self.run_hook(hook_file, command)
                self.assertEqual(status, expected_status)
                self.assertEqual(calls, expected_calls)
                if expected_stderr is not None:
                    self.assertIn(expected_stderr, stderr)

    def test_direct_push_runs_type_and_format_checks(self):
        self.assert_hook_case(
            "git push origin HEAD",
            0,
            ["npx tsc --noEmit", "npm run format:check"],
        )

    def test_commit_and_rebase_do_not_run_publish_checks(self):
        for command in ("git commit -m test", "git rebase origin/main"):
            with self.subTest(command=command):
                self.assert_hook_case(command, 0, [])

    def test_dynamic_push_commands_do_not_skip_verifier_prefilter(self):
        for command in (
            "G=g; I=it; C=pu; H=sh; $G$I $C$H origin HEAD",
            "g''it push origin HEAD",
            'g""it push origin HEAD',
            "g\\it push origin HEAD",
            "git pub origin HEAD",
            "git pu''sh origin HEAD",
            "git pu\\sh origin HEAD",
        ):
            for hook_file in HOOK_FILES:
                with self.subTest(hook_file=hook_file, command=command):
                    hook_command = self.publish_hook_command(hook_file).replace("EXPECTED='", "EXPECTED='000")
                    status, calls, stderr = self.run_hook_command(hook_command, command)
                    self.assertEqual(status, 2)
                    self.assertEqual(calls, [])
                    self.assertIn("hash mismatch", stderr)

    def test_blocked_commands_use_platform_specific_messages(self):
        expectations = {
            ".claude/settings.json": hook.BLOCK_MESSAGES["claude"],
            ".codex/hooks.json": hook.BLOCK_MESSAGES["codex"],
        }
        for hook_file, expected_message in expectations.items():
            with self.subTest(hook_file=hook_file):
                status, calls, stderr = self.run_hook(hook_file, "env git push origin HEAD")
                self.assertEqual(status, 2)
                self.assertEqual(calls, [])
                self.assertIn(expected_message, stderr)

    def test_compound_push_forms_are_blocked(self):
        for command in (
            "cd /tmp && git push",
            "git push && git status",
            "git push; git status",
            "git push || git status",
            "git -C . push",
            "true\ngit push",
            "env git push origin HEAD",
            "command git push origin HEAD",
            "/usr/bin/git push origin HEAD",
            "(git push origin HEAD)",
            "echo $(git push origin HEAD)",
            "echo `git push origin HEAD`",
            "G=g; I=it; C=pu; H=sh; $G$I $C$H origin HEAD",
            "printf git | xargs -I{} {} -c alias.pub=push pub origin HEAD",
            "printf git | xargs -I{} /usr/bin/{} -c alias.pub=push pub origin HEAD",
            "printf git | xargs --replace=G /usr/bin/G -c alias.pub=push pub origin HEAD",
            "printf git | xargs -I{} /usr/bin/env {} -c alias.pub=push pub origin HEAD",
        ):
            with self.subTest(command=command):
                self.assert_hook_case(command, 2, [], "BLOCKED:")

    def test_quoted_or_non_executable_push_text_is_ignored(self):
        for command in (
            'echo "; git push --force"',
            "git help push",
            "git show push",
            "git commit -m push",
            "bash -c 'git commit -m push'",
            "git status",
        ):
            with self.subTest(command=command):
                self.assert_hook_case(command, 0, [])

    def test_hook_configs_keep_publish_gate_in_sync(self):
        commands = [self.publish_hook_command(hook_file) for hook_file in HOOK_FILES]
        normalized = [command.replace(" python3 \"$SCRIPT\" claude", " python3 \"$SCRIPT\"") for command in commands]
        self.assertEqual(normalized[0], normalized[1])
        for command in commands:
            self.assertIn("*git*", command)
            self.assertIn("*send-pack*", command)
            self.assertIn("verify_commit_command_hook.py", command)

    def test_hook_configs_keep_playwright_cli_gate_in_sync(self):
        commands = [self.playwright_hook_command(hook_file) for hook_file in HOOK_FILES]
        self.assertEqual(commands[0], commands[1])
        for command in commands:
            self.assertIn("verify_playwright_cli_hook.py", command)

    def test_playwright_hook_graceful_outside_repo(self):
        for hook_file in HOOK_FILES:
            with self.subTest(hook_file=hook_file):
                with tempfile.TemporaryDirectory() as tmpdir:
                    status, calls, stderr = self.run_hook_command(
                        self.playwright_hook_command(hook_file),
                        "npx playwright test",
                        cwd=tmpdir,
                    )
                self.assertEqual(status, 0)
                self.assertEqual(calls, [])
                self.assertEqual(stderr, "")

    def test_playwright_hook_blocks_in_repo(self):
        for hook_file in HOOK_FILES:
            with self.subTest(hook_file=hook_file):
                status, calls, stderr = self.run_hook_command(
                    self.playwright_hook_command(hook_file),
                    "npx playwright test",
                )
                self.assertEqual(status, 2)
                self.assertEqual(calls, [])
                self.assertIn("playwright-report-mcp", stderr)

    def test_playwright_hook_hash_mismatch_blocks(self):
        for hook_file in HOOK_FILES:
            with self.subTest(hook_file=hook_file):
                hook_command = self.playwright_hook_command(hook_file).replace(
                    "EXPECTED='", "EXPECTED='000"
                )
                status, calls, stderr = self.run_hook_command(hook_command, "npx playwright test")
                self.assertEqual(status, 2)
                self.assertEqual(calls, [])
                self.assertIn("hash mismatch", stderr)


if __name__ == "__main__":
    unittest.main()
