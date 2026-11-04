"""Tests for tools/chatlens_links.py. Run: python -m unittest discover tools"""

import argparse
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import chatlens_links
import skypelens_links
from chatlens_links import (
    DEFAULT_CHATLENS_BASE_URL,
    add_chatlens_links,
    build_chatlens_url,
    finding_links_html,
    finding_links_markdown,
    normalize_base_url,
    resolve_conversation_id,
)

CONTRACT = json.loads(
    (Path(__file__).parent / "deep_link_contract.json").read_text(encoding="utf-8")
)


class BuildUrlTests(unittest.TestCase):
    def test_matches_shared_contract(self):
        self.assertEqual(CONTRACT["default_base_url"], DEFAULT_CHATLENS_BASE_URL)
        for case in CONTRACT["cases"]:
            with self.subTest(case=case):
                url = build_chatlens_url(
                    case["conversation_id"], case["message_id"], case["base_url"]
                )
                self.assertEqual(url, case["url"])

    def test_round_trips_special_characters(self):
        for conv_id, msg_id in [
            ("8:live:.cid.abc", "1700000000000"),
            ("19:x.y_z@thread.skype", "a:b.c"),
            ("8:live:a+b c", "&=#?%/"),
        ]:
            with self.subTest(conv_id=conv_id, msg_id=msg_id):
                url = urlsplit(build_chatlens_url(conv_id, msg_id))
                self.assertEqual(url.query, "")
                params = parse_qs(url.fragment)
                self.assertEqual(params["conversationId"], [conv_id])
                self.assertEqual(params["messageId"], [msg_id])

    def test_rejects_invalid_input(self):
        with self.assertRaises(ValueError):
            build_chatlens_url("", "1")
        with self.assertRaises(ValueError):
            build_chatlens_url("8:live:a", "")
        with self.assertRaises(ValueError):
            build_chatlens_url("8:live:a", "1", "localhost:5173")

    def test_replaces_existing_link_parameters(self):
        url = build_chatlens_url("new", "2", "http://h/?conversationId=old&messageId=1&x=y#old")
        self.assertEqual(url, "http://h/?x=y#conversationId=new&messageId=2")


class NormalizeBaseUrlTests(unittest.TestCase):
    # The result must equal what ChatLens' own tab shows before the "#", or following
    # a report link reloads the tab (see getAppBaseUrl in src/utils/deepLink.ts)

    def test_keeps_query_bytes(self):
        self.assertEqual(
            normalize_base_url("http://h/?note=a%20b&q=a+b&x=%2B&conversationId=old&&empty="),
            "http://h/?note=a%20b&q=a+b&x=%2B&empty=",
        )

    def test_matches_browser_normalization(self):
        for base, expected in [
            ("HTTPS://Example.GitHub.io:443/chatlens/", "https://example.github.io/chatlens/"),
            ("http://[::1]:5173", "http://[::1]:5173/"),
            ("http://h/a b/?x=a b&y='z'", "http://h/a%20b/?x=a%20b&y=%27z%27"),
            (" http://10.0.0.10:5173/ ", "http://10.0.0.10:5173/"),
        ]:
            with self.subTest(base=base):
                self.assertEqual(normalize_base_url(base), expected)

    def test_rejects_invalid_port(self):
        with self.assertRaises(ValueError):
            normalize_base_url("http://h:99999/")


class ConversationIdTests(unittest.TestCase):
    def test_single_conversation_export(self):
        data = {"userId": "u", "conversations": [{"id": "8:live:a", "MessageList": [{}]}]}
        self.assertEqual(resolve_conversation_id(data), "8:live:a")

    def test_ignores_empty_conversations(self):
        data = {
            "conversations": [
                {"id": "empty", "MessageList": []},
                {"id": "8:live:a", "MessageList": [{}]},
            ]
        }
        self.assertEqual(resolve_conversation_id(data), "8:live:a")

    def test_multiple_conversations_need_explicit_id(self):
        data = {
            "conversations": [
                {"id": "a", "MessageList": [{}]},
                {"id": "b", "MessageList": [{}]},
            ]
        }
        with self.assertRaises(ValueError):
            resolve_conversation_id(data)
        self.assertEqual(resolve_conversation_id(data, explicit="b"), "b")

    def test_message_list_uses_conversationid_field(self):
        messages = [{"id": "1", "conversationid": "8:live:a"}, {"id": "2", "conversationid": "8:live:a"}]
        self.assertEqual(resolve_conversation_id(messages), "8:live:a")


class ReportLinkTests(unittest.TestCase):
    def finding(self):
        return {
            "message_key": "m0000123",
            "skype_id": "1700000000001",
            "source_index": 122,
            "quote": "synthetic quote <b>",
            "source_url": "history.html#m0000123",
        }

    def test_add_links_keeps_history_fallback(self):
        [finding] = add_chatlens_links([self.finding()], "8:live:a")
        self.assertEqual(
            finding["chatlens_url"],
            "http://localhost:5173/#conversationId=8%3Alive%3Aa&messageId=1700000000001",
        )
        self.assertEqual(finding["source_url"], "history.html#m0000123")
        self.assertNotIn("synthetic", finding["chatlens_url"])

    def test_missing_skype_id_gets_no_link(self):
        finding = self.finding()
        del finding["skype_id"]
        [finding] = add_chatlens_links([finding], "8:live:a")
        self.assertIsNone(finding["chatlens_url"])
        self.assertEqual(finding_links_markdown(finding), "[history.html](history.html#m0000123)")

    def test_html_links(self):
        [finding] = add_chatlens_links([self.finding()], "8:live:a", "https://x.github.io/chatlens/")
        rendered = finding_links_html(finding)
        self.assertIn(
            '<a class="chatlens-link" href="https://x.github.io/chatlens/#conversationId=8%3Alive%3Aa&amp;messageId=1700000000001" target="chatlens">View in ChatLens</a>',
            rendered,
        )
        # Either would make the browser open a new tab per click instead of reusing one
        self.assertNotIn("noopener", rendered)
        self.assertNotIn("noreferrer", rendered)
        self.assertIn('<a class="history-link" href="history.html#m0000123">history.html</a>', rendered)

    def test_markdown_links(self):
        [finding] = add_chatlens_links([self.finding()], "8:live:a")
        self.assertEqual(
            finding_links_markdown(finding),
            "[View in ChatLens](http://localhost:5173/#conversationId=8%3Alive%3Aa&messageId=1700000000001)"
            " · [history.html](history.html#m0000123)",
        )


class LegacyNameTests(unittest.TestCase):
    """What scripts and reports made when the project was called SkypeLens still use."""

    def test_old_env_var_is_still_read(self):
        with mock.patch.dict(os.environ, {"SKYPELENS_BASE_URL": "http://old.example/"}):
            os.environ.pop("CHATLENS_BASE_URL", None)
            self.assertEqual(chatlens_links.default_base_url(), "http://old.example/")
            os.environ["CHATLENS_BASE_URL"] = "http://new.example/"
            self.assertEqual(chatlens_links.default_base_url(), "http://new.example/")

    def test_old_findings_field_still_renders(self):
        finding = {"skypelens_url": "http://localhost:5173/#conversationId=a&messageId=1"}
        self.assertIn('target="chatlens">View in ChatLens</a>', finding_links_html(finding))
        self.assertIn("[View in ChatLens](http://localhost:5173/", finding_links_markdown(finding))

    def test_old_module_exposes_the_old_names(self):
        self.assertEqual(
            skypelens_links.build_skypelens_url("8:live:a", "1"),
            build_chatlens_url("8:live:a", "1"),
        )
        self.assertEqual(skypelens_links.DEFAULT_SKYPELENS_BASE_URL, DEFAULT_CHATLENS_BASE_URL)
        self.assertEqual(skypelens_links.SKYPELENS_BASE_URL_ENV, "SKYPELENS_BASE_URL")
        # The tab the app looks for, whatever the old constant is called
        self.assertEqual(skypelens_links.SKYPELENS_WINDOW_NAME, "chatlens")
        self.assertIs(skypelens_links.finding_links_html, finding_links_html)

    def test_old_module_imports_from_the_repository_root(self):
        # As tools.skypelens_links, which worked before the rename: tools/ is not on sys.path
        root = Path(__file__).resolve().parent.parent
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import tools.skypelens_links as m; "
                "print(m.build_skypelens_url('8:live:a', '1'), m.SKYPELENS_WINDOW_NAME)",
            ],
            cwd=root,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.split(),
            [build_chatlens_url("8:live:a", "1"), "chatlens"],
        )

    def test_old_add_links_stores_both_fields(self):
        [finding] = skypelens_links.add_skypelens_links(
            [{"skype_id": "1700000000001"}], "8:live:a"
        )
        self.assertEqual(finding["skypelens_url"], finding["chatlens_url"])
        self.assertIn("#conversationId=8%3Alive%3Aa&messageId=1700000000001", finding["skypelens_url"])

    def test_old_cli_arguments_keep_their_attribute_names(self):
        parser = argparse.ArgumentParser()
        skypelens_links.add_cli_arguments(parser)
        args = parser.parse_args(["--skypelens-base-url", "http://a/", "--chatlens-conversation-id", "c"])
        self.assertEqual(args.skypelens_base_url, "http://a/")
        self.assertEqual(args.skypelens_conversation_id, "c")

    def test_new_cli_arguments_accept_the_old_flags(self):
        parser = argparse.ArgumentParser()
        chatlens_links.add_cli_arguments(parser)
        args = parser.parse_args(["--skypelens-base-url", "http://a/", "--skypelens-conversation-id", "c"])
        self.assertEqual(args.chatlens_base_url, "http://a/")
        self.assertEqual(args.chatlens_conversation_id, "c")


if __name__ == "__main__":
    unittest.main()
