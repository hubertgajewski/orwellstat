"""Unit tests for the Claude/Codex git commit command hooks.

Usage:
    python3 scripts/test_commit_hook_config.py
"""

from __future__ import annotations

import json
import importlib.util
import io
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
    def test_allows_direct_commit_forms(self):
        for command in (
            "git commit -m test",
            'git commit -m "test && docs; still direct"',
            "git commit -m test\\;docs",
            'git commit -m "$MSG"',
        ):
            with self.subTest(command=command):
                self.assertEqual(hook.command_decision(command), "allow")

    def test_blocks_non_direct_commit_forms(self):
        for command in (
            "cd /tmp && git commit -m test",
            "git commit -m test && git status",
            "git commit -m test; git status",
            "git commit -m test || git status",
            "git -C . commit -m test",
            "git --git-dir . commit -m test",
            "git --work-tree . commit -m test",
            "git --config-env foo=bar commit -m test",
            "git --unknown commit -m test",
            "git ci -m test",
            "git cherry-pick abc123",
            "git merge feature",
            "git rebase main",
            "git rebase --continue",
            "git pull",
            "git -c alias.ci=commit ci -m test",
            "git -calias.ci=commit ci -m test",
            "git -c include.path=/tmp/gitconfig ci -m test",
            "git -c includeIf.gitdir:/path/.git.path=/tmp/gitconfig ci -m test",
            "git --config-env alias.ci=GIT_ALIAS ci -m test",
            "git --config-env includeIf.gitdir:/path/.git.path=GIT_INCLUDE ci -m test",
            "git --config-env=alias.ci=GIT_ALIAS ci -m test",
            "git commit -m ok -F <(git add bad.py)",
            "echo $(git -C . commit -m test)",
            "echo $(git -c alias.ci=commit ci -m test)",
            "echo $(git --config-env alias.ci=GIT_ALIAS ci -m test)",
            "git commit -m \"$(date)\"",
            'git "commit" -m test',
            "git 'commit' -m test",
            "git comm\\it -m test",
            "true\ngit commit -m test",
            "GIT_AUTHOR_NAME=test git commit -m test",
            "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.ci GIT_CONFIG_VALUE_0=commit git ci -m test",
            "GIT_CONFIG_GLOBAL=/tmp/gitconfig git ci -m test",
            "env GIT_CONFIG_GLOBAL=/tmp/gitconfig git ci -m test",
            "$'git' commit -m test",
            "`printf git` commit --no-verify -m test",
            "`printf /usr/bin/git` commit --no-verify -m test",
            "`printf git` -c alias.ci=commit ci -m test",
            "$(printf git) -c alias.ci=commit ci -m test",
            "$'git' -c alias.ci=commit ci -m test",
            "git${IFS}commit --no-verify",
            "G=git; $G commit -m test",
            "G=git; C=commit; $G $C -m test",
            "env git commit -m test",
            "env -- git commit -m test",
            "env FOO=bar git commit -m test",
            "env -i git commit -m test",
            "env -u FOO git commit -m test",
            "env -C /tmp git commit -m test",
            "env -P /usr/bin git commit -m test",
            "env -P/usr/bin git commit -m test",
            "env -S 'git commit -m test'",
            "env -S'git commit -m test'",
            "env -Sgit commit -m test",
            "env --split-string='git commit -m test'",
            "command env -S 'git commit -m test'",
            "exec env -S 'git commit -m test'",
            "command env -Sgit commit -m test",
            "env -S \"env -S 'env -S \\'env -S \\\\\\'git commit -m test\\\\\\'\\''\"",
            "command git commit -m test",
            "command -- bash -c 'git commit -m test'",
            "command -p git -c alias.ci=commit ci -m test",
            "command -p env -S 'git commit -m test'",
            "command eval 'git commit -m test'",
            "exec git commit -m test",
            "exec -a name git -c alias.ci=commit ci -m test",
            "exec -a name env -S 'git commit -m test'",
            "exec -c git -c alias.ci=commit ci -m test",
            "exec -l git -c alias.ci=commit ci -m test",
            "exec -cl git -c alias.ci=commit ci -m test",
            "exec -lc git -c alias.ci=commit ci -m test",
            "exec -la name git -c alias.ci=commit ci -m test",
            'eval "git commit -m test"',
            'cmd="git commit -m test"; eval "$cmd"',
            "printf 'commit -m test' | xargs git",
            "printf 'commit -m test' | xargs /usr/bin/git",
            "xargs -a /tmp/args sh -c 'git commit -m test'",
            "xargs -a /tmp/args git",
            "xargs -a /tmp/args -I{} git {} -m test",
            "xargs --arg-file=/tmp/args -I{} git {} -m test",
            "xargs -a /tmp/args git -C . commit -m test",
            "printf 'commit --no-verify' | xargs git -C .",
            "xargs -a /tmp/args git -c alias.ci=commit ci -m test",
            "xargs -a /tmp/args env GIT_CONFIG_GLOBAL=/tmp/gitconfig git ci -m test",
            "printf 'commit -m test' | xargs env git",
            "xargs -a /tmp/args env git",
            "printf 'commit -m test' | xargs env -S git",
            "xargs -a /tmp/args env -S git",
            "printf 'commit -m test' | xargs env -Sgit",
            "xargs -a /tmp/args env --split-string=git",
            'xargs -a /tmp/args -I{} sh -c "{}"',
            'xargs -a /tmp/args -I{} env sh -c "{}"',
            'xargs --replace={} sh -c "{}"',
            "xargs -i sh -c '{}'",
            "xargs -i git {} -m test",
            "xargs sh -c < /tmp/args",
            "printf 'git commit -m test' | sh",
            'printf "git commit -m test" | xargs -I{} sh -c "{}"',
            "printf git | xargs -I{} {} commit -m test",
            "printf git | xargs -I{} {} -c alias.ci=commit ci -m test",
            "printf git | xargs -I{} /usr/bin/{} -c alias.ci=commit ci -m test",
            "printf git | xargs --replace=G /usr/bin/G -c alias.ci=commit ci -m test",
            "printf git | xargs -I{} /usr/bin/env {} -c alias.ci=commit ci -m test",
            "dash -c 'git commit -m test'",
            "python3 -c 'import os; os.system(\"git commit -m test\")'",
            "python3 -c 'import os; os.system(\"git\"+\" commit -m test\")'",
            "node -e 'require(\"child_process\").execSync(\"git commit -m test\")'",
            "node -e 'require(\"child_process\").execSync(\"git\"+\" commit -m test\")'",
            "node --eval='require(\"child_process\").execSync(\"git commit -m test\")'",
            "node --print='require(\"child_process\").execSync(\"git commit -m test\")'",
            "node --eval='require(\"child_process\").execSync(\"git\"+\" commit -m test\")'",
            "node -p'require(\"child_process\").execSync(\"git commit -m test\")'",
            "node -p -e 'require(\"child_process\").execSync(\"git commit -m test\")'",
            "node --print --eval 'require(\"child_process\").execSync(\"git commit -m test\")'",
            "node -pe'require(\"child_process\").execSync(\"git commit -m test\")'",
            "bash -c 'git commit -m test'",
            "bash -lc 'git commit -m test'",
            "bash --rcfile /tmp/x -c 'git commit -m test'",
            "bash <<EOF\ngit commit -m test\nEOF",
            "true\nbash <<EOF\ngit commit -m test\nEOF",
            "sh <<EOF-1\ngit commit -m test\nEOF-1",
            "env bash -c 'git commit -m test'",
            "sh -c 'git commit -m test'",
            "zsh -c 'git commit -m test'",
            "zsh --no-rcs -c 'git commit -m test'",
            "/usr/bin/git commit -m test",
            "/usr/bin/env -- git commit -m test",
            "(git commit -m test)",
            "{ git commit -m test; }",
            "if true; then git commit -m test; fi",
            "echo git commit",
            "echo $(git commit -m test)",
            "echo `git commit -m test`",
            'python3 - <<X\nprint("echo $(printf \'git commit\')")\nX',
            "python3 - <<X\ngit commit -m test\nX",
            "python3 - <<'EOF-1'\ngit commit -m test\nEOF-1\ngit status",
            "git com$(printf mit) -m test",
            "git 'commit",
        ):
            with self.subTest(command=command):
                self.assertEqual(hook.command_decision(command), "block")

    def test_recursion_limit_blocks_commit_payload(self):
        self.assertEqual(
            hook.command_decision("git commit -m test", hook.MAX_ENV_SPLIT_DEPTH + 1),
            "block",
        )

    def test_ignores_non_commit_commands(self):
        for command in (
            'echo "; git commit --amend"',
            "git help commit",
            "git show commit",
            'git show :README.md | rg -n "commit hook"',
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
            "git diff",
            "git mv old new",
            "git rm --cached file",
            "git apply patch.diff",
            "git reflog",
            "git rebase --abort",
            "git rebase --quit",
            "git merge --abort",
            "git merge --quit",
            "git cherry-pick --abort",
            "git cherry-pick --quit",
            "git reset --soft HEAD~1",
            "git ls-tree HEAD",
            "git describe --tags",
            "git show-ref --heads",
            "git diff | xargs echo commit",
            "python3 scripts/foo.py git commit",
            "command -v git commit -m test",
            "command -V git commit -m test",
            "command -pv git commit -m test",
            "command -pV git commit -m test",
            "git status | xargs echo commit",
            "bash <<EOF\necho hi\nEOF",
            "git status | xargs echo",
            "echo $PATH | xargs echo",
            "echo $PATH | xargs echo commit",
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

        payload = json.dumps({"tool_input": {"command": "env git commit -m test"}})
        with (
            patch("sys.argv", ["hook", "codex"]),
            patch("sys.stdin", io.StringIO(payload)),
            redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(hook.main(), 2)

        root = MagicMock(returncode=0, stdout=f"{REPO_ROOT}\n", stderr="")
        with (
            patch("sys.argv", ["hook", "codex"]),
            patch("sys.stdin", io.StringIO(json.dumps({"tool_input": {"command": "git commit -m test"}}))),
            patch.object(hook.subprocess, "run", return_value=root),
        ):
            self.assertEqual(hook.main(), 0)

    def test_main_and_check_error_paths(self):
        with patch("sys.argv", ["hook", "unknown"]), redirect_stderr(io.StringIO()):
            self.assertEqual(hook.main(), 2)

        failed_root = MagicMock(returncode=1, stdout="", stderr="not a repo\n")
        with (
            patch("sys.argv", ["hook", "codex"]),
            patch("sys.stdin", io.StringIO(json.dumps({"tool_input": {"command": "git commit -m test"}}))),
            patch.object(hook.subprocess, "run", return_value=failed_root),
            redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(hook.main(), 2)

        failed_check = MagicMock(returncode=1, stdout="type output\n", stderr="type error\n")
        with patch.object(hook.subprocess, "run", return_value=failed_check), redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                hook.run_check(["npx", "tsc", "--noEmit"], REPO_ROOT)


class CommitCommandHookTests(unittest.TestCase):
    def run_hook_command(self, hook_command: str, command: str) -> tuple[int, list[str], str]:
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
                cwd=REPO_ROOT,
                env=env,
                input=json.dumps({"tool_input": {"command": command}}),
                capture_output=True,
                text=True,
                check=False,
            )
            calls = calls_path.read_text(encoding="utf-8").splitlines() if calls_path.exists() else []
            return result.returncode, calls, result.stderr

    def run_hook(self, hook_file: str, command: str) -> tuple[int, list[str], str]:
        return self.run_hook_command(self.commit_hook_command(hook_file), command)

    def commit_hook_command(self, hook_file: str) -> str:
        hook_config = json.loads((REPO_ROOT / hook_file).read_text(encoding="utf-8"))
        for group in hook_config["hooks"]["PreToolUse"]:
            if group.get("matcher") != "Bash":
                continue
            for hook in group["hooks"]:
                command = hook.get("command", "")
                if "verify_commit_command_hook.py" in command:
                    return command
        raise AssertionError(f"commit verifier hook not found in {hook_file}")

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

    def test_direct_commit_runs_type_and_format_checks(self):
        self.assert_hook_case(
            "git commit -m test",
            0,
            ["npx tsc --noEmit", "npm run format:check"],
        )

    def test_irrelevant_commands_skip_verifier_before_hash_check(self):
        for hook_file in HOOK_FILES:
            with self.subTest(hook_file=hook_file):
                hook_command = self.commit_hook_command(hook_file).replace("EXPECTED='", "EXPECTED='000")
                status, calls, stderr = self.run_hook_command(hook_command, "date")
                self.assertEqual(status, 0)
                self.assertEqual(calls, [])
                self.assertEqual(stderr, "")

    def test_dynamic_commands_do_not_skip_verifier_prefilter(self):
        for hook_file in HOOK_FILES:
            with self.subTest(hook_file=hook_file):
                hook_command = self.commit_hook_command(hook_file).replace("EXPECTED='", "EXPECTED='000")
                status, calls, stderr = self.run_hook_command(
                    hook_command,
                    "G=g; I=it; C=com; M=mit; $G$I $C$M --no-verify",
                )
                self.assertEqual(status, 2)
                self.assertEqual(calls, [])
                self.assertIn("hash mismatch", stderr)

    def test_compound_commit_forms_are_blocked(self):
        for command in (
            "cd /tmp && git commit -m test",
            "git commit -m test && git status",
            "git commit -m test; git status",
            "git commit -m test || git status",
            "git -C . commit -m test",
            "true\ngit commit -m test",
            "GIT_AUTHOR_NAME=test git commit -m test",
            "env git commit -m test",
            "command git commit -m test",
            "/usr/bin/git commit -m test",
            "(git commit -m test)",
            "echo $(git commit -m test)",
            "echo `git commit -m test`",
            "G=g; I=it; C=com; M=mit; $G$I $C$M --no-verify",
            "printf git | xargs -I{} {} -c alias.ci=commit ci -m test",
            "printf git | xargs -I{} /usr/bin/{} -c alias.ci=commit ci -m test",
            "printf git | xargs --replace=G /usr/bin/G -c alias.ci=commit ci -m test",
            "printf git | xargs -I{} /usr/bin/env {} -c alias.ci=commit ci -m test",
        ):
            with self.subTest(command=command):
                self.assert_hook_case(command, 2, [], "BLOCKED:")

    def test_quoted_or_non_executable_commit_text_is_ignored(self):
        for command in (
            'echo "; git commit --amend"',
            "git help commit",
            "git show commit",
            "git commit-graph verify",
            "git status",
        ):
            with self.subTest(command=command):
                self.assert_hook_case(command, 0, [])

    def test_quoted_or_escaped_control_chars_in_direct_commit_are_allowed(self):
        for command in (
            'git commit -m "test && docs; still direct"',
            "git commit -m test\\;docs",
        ):
            with self.subTest(command=command):
                self.assert_hook_case(
                    command,
                    0,
                    ["npx tsc --noEmit", "npm run format:check"],
                )


if __name__ == "__main__":
    unittest.main()
