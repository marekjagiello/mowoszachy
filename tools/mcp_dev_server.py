#!/usr/bin/env python3
"""
tools/mcp_dev_server.py
Model Context Protocol (MCP) server for MowoSzachy local dev server and telemetry.
Exposes tools for reading/clearing app_console.log and checking server health via stdio JSON-RPC 2.0.
"""
import sys
import json
import os
import urllib.request
import urllib.error

TOOLS = [
    {
        "name": "read_app_log",
        "description": "Reads the most recent lines from app_console.log to inspect browser runtime errors or STT events.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "lines": {
                    "type": "integer",
                    "description": "Number of recent lines to return (default 50).",
                    "default": 50
                }
            }
        }
    },
    {
        "name": "clear_app_log",
        "description": "Clears the contents of app_console.log before running a new test session.",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_server_status",
        "description": "Checks whether the local MowoSzachy Python HTTP server is responding on localhost:8000.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "port": {
                    "type": "integer",
                    "description": "Port to check (default 8000).",
                    "default": 8000
                }
            }
        }
    }
]

def get_log_path():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    return os.path.join(root, 'app_console.log')

def handle_request(req):
    if not isinstance(req, dict):
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid Request: expected object"}}

    method = req.get("method")
    req_id = req.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "mowoszachy-dev-mcp",
                    "version": "1.0.0"
                }
            }
        }

    if req_id is None:
        # JSON-RPC notifications do not return a response
        return None

    if method == "ping":
        return {"jsonrpc": "2.0", "id": req_id, "result": {}}

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}

    if method == "tools/call":
        params = req.get("params") if isinstance(req.get("params"), dict) else {}
        name = params.get("name")
        args = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}

        if name == "read_app_log":
            raw_lines = args.get("lines")
            try:
                count = int(raw_lines) if raw_lines is not None else 50
            except (ValueError, TypeError):
                count = 50
            log_path = get_log_path()
            if not os.path.exists(log_path):
                content = "(app_console.log does not exist yet - no logs recorded)"
            else:
                with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                    all_lines = f.readlines()
                recent = all_lines[-count:] if count > 0 else all_lines
                content = "".join(recent) or "(empty log)"

            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": content}]
                }
            }

        if name == "clear_app_log":
            log_path = get_log_path()
            try:
                with open(log_path, 'w', encoding='utf-8') as f:
                    f.truncate(0)
                msg = "Successfully cleared app_console.log."
            except Exception as e:
                msg = f"Failed to clear log: {str(e)}"

            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": msg}]
                }
            }

        if name == "get_server_status":
            raw_port = args.get("port")
            try:
                port = int(raw_port) if raw_port is not None else 8000
            except (ValueError, TypeError):
                port = 8000
            url = f"http://localhost:{port}/"
            try:
                req_obj = urllib.request.Request(url, method="HEAD")
                with urllib.request.urlopen(req_obj, timeout=2.0) as resp:
                    status_text = f"Server is ONLINE at {url} (HTTP status: {resp.status})"
            except Exception as e:
                status_text = f"Server is OFFLINE at {url} ({str(e)})"

            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": status_text}]
                }
            }

        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Tool '{name}' not found"}}

    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method '{method}' not found"}}

def main():
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        try:
            req = json.loads(line)
        except Exception as e:
            err = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Parse error: {str(e)}"}}
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()
            continue

        try:
            res = handle_request(req)
            if res is not None:
                sys.stdout.write(json.dumps(res) + "\n")
                sys.stdout.flush()
        except Exception as e:
            req_id = req.get("id") if isinstance(req, dict) else None
            err = {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32603, "message": f"Internal error: {str(e)}"}}
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()

if __name__ == '__main__':
    main()
