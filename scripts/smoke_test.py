#!/usr/bin/env python3
"""Dependency-free structural and JavaScript syntax checks for StrangerCam."""

from __future__ import annotations

import argparse
import subprocess
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_FILE = ROOT / "index.html"
REQUIRED_IDS = {
    "tosModal",
    "tosCheck",
    "authModal",
    "emailAuthForm",
    "emailVerificationStep",
    "chatView",
    "remoteVideo",
    "localVideo",
    "chatMessages",
    "chatInput",
    "reportModal",
    "adminAuthLock",
    "adminDashboard",
    "adminReportsList",
    "adminBanList",
    "blacklistChips",
    "globalAnnouncementBanner",
}


class PageInspection(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.ids: list[str] = []
        self.module_parts: list[str] = []
        self.in_module = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        element_id = attributes.get("id")
        if element_id:
            self.ids.append(element_id)
        if tag == "script" and attributes.get("type") == "module":
            self.in_module = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self.in_module:
            self.in_module = False

    def handle_data(self, data: str) -> None:
        if self.in_module:
            self.module_parts.append(data)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-node", action="store_true")
    args = parser.parse_args()

    if not HTML_FILE.is_file():
        print("FAIL: index.html is missing", file=sys.stderr)
        return 1

    source = HTML_FILE.read_text(encoding="utf-8")
    page = PageInspection()
    page.feed(source)
    page.close()

    duplicates = sorted(element_id for element_id, count in Counter(page.ids).items() if count > 1)
    missing = sorted(REQUIRED_IDS - set(page.ids))
    if duplicates:
        print(f"FAIL: duplicate element IDs: {', '.join(duplicates)}", file=sys.stderr)
        return 1
    if missing:
        print(f"FAIL: missing required elements: {', '.join(missing)}", file=sys.stderr)
        return 1
    if not page.module_parts:
        print("FAIL: no inline JavaScript module found", file=sys.stderr)
        return 1

    print(f"PASS: required interface elements present ({len(REQUIRED_IDS)} checked)")
    node_check = subprocess.run(
        ["node", "--check", "--input-type=module"],
        input="".join(page.module_parts),
        text=True,
        capture_output=True,
        check=False,
    ) if shutil_which("node") else None

    if node_check is None:
        message = "Node.js not installed; JavaScript syntax check skipped"
        if args.require_node:
            print(f"FAIL: {message}", file=sys.stderr)
            return 1
        print(f"SKIP: {message}")
    elif node_check.returncode:
        print(node_check.stderr, file=sys.stderr)
        return node_check.returncode
    else:
        print("PASS: JavaScript module syntax")
    return 0


def shutil_which(command: str) -> str | None:
    from shutil import which

    return which(command)


if __name__ == "__main__":
    raise SystemExit(main())
