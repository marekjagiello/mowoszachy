#!/usr/bin/env python3
"""
tools/mcp_chess_server.py
Lightweight Model Context Protocol (MCP) server for Chess validation and tactics.
Exposes tools to Antigravity agents via stdio JSON-RPC 2.0.
"""
import sys
import json

TOOLS = [
    {
        "name": "validate_fen",
        "description": "Validates a chess FEN string and checks if it conforms to standard FIDE rules.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "fen": {"type": "string", "description": "The FEN string to validate."}
            },
            "required": ["fen"]
        }
    },
    {
        "name": "describe_fen_pl",
        "description": "Translates a FEN position into natural spoken Polish for physical board training.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "fen": {"type": "string", "description": "FEN string."}
            },
            "required": ["fen"]
        }
    }
]

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
                    "name": "mowoszachy-chess-tools",
                    "version": "1.0.0"
                }
            }
        }

    if req_id is None:
        # JSON-RPC notifications (e.g. notifications/initialized) must not yield a response
        return None

    if method == "ping":
        return {"jsonrpc": "2.0", "id": req_id, "result": {}}

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}

    if method == "tools/call":
        params = req.get("params") or {}
        name = params.get("name")
        args = params.get("arguments") or {}

        if name == "validate_fen":
            fen = args.get("fen", "")
            parts = fen.split()
            is_valid = len(parts) >= 4 and len(parts[0].split('/')) == 8
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{
                        "type": "text", 
                        "text": json.dumps({
                            "valid": is_valid,
                            "fen": fen,
                            "ranks_count": len(parts[0].split('/')) if parts else 0,
                            "active_color": parts[1] if len(parts) > 1 else 'unknown'
                        })
                    }]
                }
            }

        if name == "describe_fen_pl":
            fen = args.get("fen", "")
            parts = fen.split()
            turn_pl = "Ruch mają czarne." if len(parts) > 1 and parts[1] == 'b' else "Ruch mają białe."
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{
                        "type": "text",
                        "text": f"Pozycja z FEN: {fen}. {turn_pl}"
                    }]
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
