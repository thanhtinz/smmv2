#!/usr/bin/env python3
"""Mock panel nguồn kiểu ThaTim để test đấu API: SMM v2 + Product API."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

ORDERS = {}
BUYS = {}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        p = {k: v[0] for k, v in parse_qs(self.rfile.read(n).decode()).items()}
        action = p.get("action", "")
        out = {}
        if action == "balance":
            out = {"balance": "5000000", "currency": "VND"}
        elif action == "services":
            out = [
                {"service": 101, "name": "TikTok Followers Mock | Nhanh", "type": "Default",
                 "category": "TikTok Followers", "rate": "20000", "min": 10, "max": 500000,
                 "refill": True, "cancel": True},
                {"service": 102, "name": "Facebook Comment Mock | Tuỳ chỉnh", "type": "Custom Comments",
                 "category": "Facebook Comment", "rate": "150000", "min": 5, "max": 1000,
                 "refill": False, "cancel": False},
            ]
        elif action == "add":
            oid = 777000 + len(ORDERS) + 1
            ORDERS[oid] = p
            out = {"order": oid}
        elif action == "status":
            out = {"charge": "20000", "start_count": "1500", "status": "Completed", "remains": "0", "currency": "VND"}
        elif action == "cancel":
            out = [{"order": p.get("orders"), "cancel": True}]
        elif action == "refill":
            out = {"refill": 555001}
        elif action == "refill_status":
            out = {"status": "Completed"}
        elif action == "category":
            out = [
                {"id": 1, "name": "Giải trí Mock", "products": [
                    {"id": 900, "name": "Netflix Mock 4K", "cycles": [
                        {"cycle": 1, "price": 30000}, {"cycle": 3, "price": 85000}]},
                    {"id": 901, "name": "Spotify Mock", "cycles": [
                        {"cycle": 6, "price": 100000}, {"cycle": 12, "price": 190000}]},
                ]},
            ]
        elif action == "buy":
            code = f"_{990000 + len(BUYS) + 1}"
            BUYS[code] = p
            out = {"order_code": code}
        elif action == "history":
            out = [
                {"order_code": c, "status": "Completed",
                 "delivery": f"Email: acc-{c}@mock.vn | Mật khẩu: mock123 | Profile 1"}
                for c in BUYS.keys()
            ]
        else:
            out = {"error": f"unknown action {action}"}
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

HTTPServer(("127.0.0.1", 3999), H).serve_forever()
