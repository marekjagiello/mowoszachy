#!/usr/bin/env python3
"""
tools/test_mcp_servers.py
Automated adversarial unit and protocol test suite for MowoSzachy MCP servers:
  1. tools/mcp_chess_server.py
  2. tools/mcp_dev_server.py
"""
import sys
import os
import json

# Ensure repository root is on sys.path
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import tools.mcp_chess_server as chess_server
import tools.mcp_dev_server as dev_server

def assert_true(cond, msg):
    if not cond:
        raise AssertionError(msg)

def test_chess_server():
    print("[*] Testing Chess MCP Server (tools/mcp_chess_server.py)...")

    # 1. initialize handshake
    res = chess_server.handle_request({"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    assert_true(res["id"] == 1, "initialize response id mismatch")
    assert_true(res["result"]["serverInfo"]["name"] == "mowoszachy-chess-tools", "serverInfo name mismatch")

    # 2. ping
    res = chess_server.handle_request({"jsonrpc": "2.0", "id": 2, "method": "ping"})
    assert_true(res["id"] == 2 and res["result"] == {}, "ping response mismatch")

    # 3. tools/list
    res = chess_server.handle_request({"jsonrpc": "2.0", "id": 3, "method": "tools/list"})
    tools = [t["name"] for t in res["result"]["tools"]]
    assert_true("validate_fen" in tools and "describe_fen_pl" in tools, "tools/list missing expected tools")

    # 4. validate_fen - valid FEN
    fen_valid = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    res = chess_server.handle_request({
        "jsonrpc": "2.0", "id": 4, "method": "tools/call",
        "params": {"name": "validate_fen", "arguments": {"fen": fen_valid}}
    })
    data = json.loads(res["result"]["content"][0]["text"])
    assert_true(data["valid"] is True, "valid FEN marked as invalid")
    assert_true(data["active_color"] == "w", "active_color mismatch")

    # 5. validate_fen - invalid FEN
    res = chess_server.handle_request({
        "jsonrpc": "2.0", "id": 5, "method": "tools/call",
        "params": {"name": "validate_fen", "arguments": {"fen": "invalid_fen_string"}}
    })
    data = json.loads(res["result"]["content"][0]["text"])
    assert_true(data["valid"] is False, "invalid FEN marked as valid")

    # 6. validate_fen - null fen
    res = chess_server.handle_request({
        "jsonrpc": "2.0", "id": 6, "method": "tools/call",
        "params": {"name": "validate_fen", "arguments": {"fen": None}}
    })
    data = json.loads(res["result"]["content"][0]["text"])
    assert_true(data["valid"] is False, "null fen crashed or marked valid")

    # 7. validate_fen - omitted arguments
    res = chess_server.handle_request({
        "jsonrpc": "2.0", "id": 7, "method": "tools/call",
        "params": {"name": "validate_fen", "arguments": None}
    })
    data = json.loads(res["result"]["content"][0]["text"])
    assert_true(data["valid"] is False, "omitted arguments crashed or marked valid")

    # 8. describe_fen_pl - valid FEN black to move
    fen_black = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2"
    res = chess_server.handle_request({
        "jsonrpc": "2.0", "id": 8, "method": "tools/call",
        "params": {"name": "describe_fen_pl", "arguments": {"fen": fen_black}}
    })
    text = res["result"]["content"][0]["text"]
    assert_true("czarne" in text, "describe_fen_pl black turn missing in text")

    # 9. describe_fen_pl - null fen
    res = chess_server.handle_request({
        "jsonrpc": "2.0", "id": 9, "method": "tools/call",
        "params": {"name": "describe_fen_pl", "arguments": {"fen": None}}
    })
    text = res["result"]["content"][0]["text"]
    assert_true("Pozycja z FEN:" in text, "describe_fen_pl failed on null fen")

    # 10. unknown tool
    res = chess_server.handle_request({
        "jsonrpc": "2.0", "id": 10, "method": "tools/call",
        "params": {"name": "non_existent_tool", "arguments": {}}
    })
    assert_true("error" in res and res["error"]["code"] == -32601, "unknown tool did not return -32601")

    # 11. unknown method
    res = chess_server.handle_request({"jsonrpc": "2.0", "id": 11, "method": "unsupported_method"})
    assert_true("error" in res and res["error"]["code"] == -32601, "unknown method did not return -32601")

    # 12. notification without id
    res = chess_server.handle_request({"jsonrpc": "2.0", "method": "notifications/initialized"})
    assert_true(res is None, "notification returned non-None response")

    # 13. malformed non-dict request
    res = chess_server.handle_request("not a dict")
    assert_true("error" in res and res["error"]["code"] == -32600, "non-dict req did not return -32600")

    # 14. non-dict params and arguments
    res = chess_server.handle_request({"jsonrpc": "2.0", "id": 14, "method": "tools/call", "params": "string_param"})
    assert_true("error" in res and res["error"]["code"] == -32601, "string_param crashed")

    print("  [+] Chess MCP Server: All 14 tests passed.")

def test_dev_server():
    print("[*] Testing Dev/Telemetry MCP Server (tools/mcp_dev_server.py)...")

    # 1. initialize handshake
    res = dev_server.handle_request({"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    assert_true(res["id"] == 1, "initialize response id mismatch")
    assert_true(res["result"]["serverInfo"]["name"] == "mowoszachy-dev-mcp", "serverInfo name mismatch")

    # 2. ping
    res = dev_server.handle_request({"jsonrpc": "2.0", "id": 2, "method": "ping"})
    assert_true(res["id"] == 2 and res["result"] == {}, "ping response mismatch")

    # 3. tools/list
    res = dev_server.handle_request({"jsonrpc": "2.0", "id": 3, "method": "tools/list"})
    tools = [t["name"] for t in res["result"]["tools"]]
    assert_true("read_app_log" in tools and "clear_app_log" in tools and "get_server_status" in tools, "tools/list missing expected tools")

    # 4. read_app_log with default args
    res = dev_server.handle_request({
        "jsonrpc": "2.0", "id": 4, "method": "tools/call",
        "params": {"name": "read_app_log", "arguments": {}}
    })
    assert_true("content" in res["result"], "read_app_log missing content")

    # 5. read_app_log with null lines
    res = dev_server.handle_request({
        "jsonrpc": "2.0", "id": 5, "method": "tools/call",
        "params": {"name": "read_app_log", "arguments": {"lines": None}}
    })
    assert_true("content" in res["result"], "read_app_log null lines crashed")

    # 6. read_app_log with invalid string lines
    res = dev_server.handle_request({
        "jsonrpc": "2.0", "id": 6, "method": "tools/call",
        "params": {"name": "read_app_log", "arguments": {"lines": "invalid"}}
    })
    assert_true("content" in res["result"], "read_app_log invalid string lines crashed")

    # 7. get_server_status with default port
    res = dev_server.handle_request({
        "jsonrpc": "2.0", "id": 7, "method": "tools/call",
        "params": {"name": "get_server_status", "arguments": {}}
    })
    assert_true("Server is" in res["result"]["content"][0]["text"], "get_server_status output invalid")

    # 8. get_server_status with null port
    res = dev_server.handle_request({
        "jsonrpc": "2.0", "id": 8, "method": "tools/call",
        "params": {"name": "get_server_status", "arguments": {"port": None}}
    })
    assert_true("Server is" in res["result"]["content"][0]["text"], "get_server_status null port crashed")

    # 9. get_server_status with invalid string port
    res = dev_server.handle_request({
        "jsonrpc": "2.0", "id": 9, "method": "tools/call",
        "params": {"name": "get_server_status", "arguments": {"port": "abc"}}
    })
    assert_true("Server is" in res["result"]["content"][0]["text"], "get_server_status invalid string port crashed")

    # 10. unknown tool
    res = dev_server.handle_request({
        "jsonrpc": "2.0", "id": 10, "method": "tools/call",
        "params": {"name": "non_existent_tool", "arguments": {}}
    })
    assert_true("error" in res and res["error"]["code"] == -32601, "unknown tool did not return -32601")

    # 11. unknown method
    res = dev_server.handle_request({"jsonrpc": "2.0", "id": 11, "method": "unknown"})
    assert_true("error" in res and res["error"]["code"] == -32601, "unknown method did not return -32601")

    # 12. notification
    res = dev_server.handle_request({"jsonrpc": "2.0", "method": "notify"})
    assert_true(res is None, "notification returned non-None response")

    # 13. malformed non-dict request
    res = dev_server.handle_request(12345)
    assert_true("error" in res and res["error"]["code"] == -32600, "non-dict req did not return -32600")

    print("  [+] Dev/Telemetry MCP Server: All 13 tests passed.")

def main():
    print("=" * 60)
    print("  ♔ MowoSzachy - MCP Servers Protocol & Resilience Suite")
    print("=" * 60)
    test_chess_server()
    test_dev_server()
    print("=" * 60)
    print("  [✓] All MCP Server tests PASSED successfully.")
    print("=" * 60)

if __name__ == '__main__':
    main()
