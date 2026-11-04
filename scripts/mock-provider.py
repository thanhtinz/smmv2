#!/usr/bin/env python3
"""Mock panel nguồn theo ĐÚNG định dạng thật của thatim.vn (đối chiếu 2026-11-04):
- SMM: POST /api/v2 — services trả về dạng lồng theo danh mục {status, data:[{name, services:[...price...]}]}
- Product: POST /api/product — category/buy/history theo tài liệu thật (time_data, order_code, data bàn giao).
"""
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
        if self.path.startswith("/api/product"):
            out = self.product(action, p)
        else:
            out = self.smm(action, p)
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def smm(self, action, p):
        if action == "balance":
            return {"balance": "5000000", "currency": "VND"}
        if action == "services":
            return {"status": "success", "data": [
                {"id": 1, "name": "Tiktok", "services": [
                    {"id": 101, "name": "Buff Follow Tiktok Mock | 1000 Follow", "category": "Tiktok",
                     "min": 1000, "max": 1000000, "price_per": 1000, "price_per_currency": "VND",
                     "price": 20000, "type": "default", "refill": True, "cancel": True, "dripfeed": True,
                     "original_price": 22000, "status": "selling"},
                ]},
                {"id": 2, "name": "Facebook", "services": [
                    {"id": 102, "name": "Facebook Comment Mock | Tuỳ chỉnh", "category": "Facebook",
                     "min": 5, "max": 1000, "price_per": 1000, "price_per_currency": "VND",
                     "price": 150000, "type": "Custom Comments", "refill": False, "cancel": False,
                     "dripfeed": False, "original_price": 150000, "status": "selling"},
                ]},
            ]}
        if action == "add":
            oid = 777000 + len(ORDERS) + 1
            ORDERS[oid] = p
            return {"order": oid}
        if action == "status":
            return {"charge": "20000", "start_count": "1500", "status": "Completed", "remains": "0", "currency": "VND"}
        if action == "cancel":
            return [{"order": p.get("orders"), "cancel": True}]
        if action == "refill":
            return {"refill": 555001}
        if action == "refill_status":
            return {"status": "Completed"}
        return {"error": f"unknown action {action}"}

    def product(self, action, p):
        if action == "category":
            return {"status": "success", "message": "Lấy danh mục sản phẩm thành công", "data": [
                {"id": 6, "name": "Giải trí Mock", "slug": "giai-tri-mock", "price": "30000",
                 "image": "", "thumbnail": "", "note": "Sản phẩm mock để test", "desc": "Mô tả mock",
                 "status": "selling", "products": [
                     {"product_id": 900, "product_name": "Netflix Mock 4K", "total_product": 8, "time_data": [
                         {"cycle_id": 1, "cycle": "1 Tháng", "price": "30000", "original_price": "35000", "description": "Gói 1 tháng"},
                         {"cycle_id": 2, "cycle": "3 Tháng", "price": "85000", "original_price": "95000", "description": "Gói 3 tháng"},
                     ]},
                     {"product_id": 901, "product_name": "Spotify Mock", "total_product": 5, "time_data": [
                         {"cycle_id": 3, "cycle": "6 Tháng", "price": "100000", "original_price": "110000", "description": "Gói 6 tháng"},
                         {"cycle_id": 4, "cycle": "1 Năm", "price": "190000", "original_price": "210000", "description": "Gói 1 năm"},
                     ]},
                 ]},
            ]}
        if action == "buy":
            code = f"_{990000 + len(BUYS) + 1}"
            BUYS[code] = p
            return {"status": "success", "message": "Đã đặt hàng thành công, cảm ơn quý khách đã sử dụng dịch vụ!",
                    "data": {"order_id": 88000 + len(BUYS), "order_code": code, "total": 30000}, "responseTime": 12}
        if action == "history":
            items = []
            for c, b in BUYS.items():
                pid = int(b.get("product", "900"))
                if p.get("product_id") and int(p["product_id"]) != pid:
                    continue
                items.append({"product_id": pid, "product_name": "Netflix Mock 4K" if pid == 900 else "Spotify Mock",
                              "order_code": c, "price": "30000.00", "time_pay": int(b.get("cycle", "1")),
                              "status": "completed", "note": b.get("note", ""),
                              "data": f"Email: acc-{c}@mock.vn | Mật khẩu: mock123 | Profile 1",
                              "created_at": "2026-11-04T00:00:00.000000Z"})
            return {"status": "success", "message": "Lấy lịch sử mua hàng thành công", "data": items,
                    "pagination": {"current_page": 1, "last_page": 1, "per_page": int(p.get("limit", "50")), "total": len(items)}}
        return {"error": f"unknown product action {action}"}

HTTPServer(("127.0.0.1", 3999), H).serve_forever()
