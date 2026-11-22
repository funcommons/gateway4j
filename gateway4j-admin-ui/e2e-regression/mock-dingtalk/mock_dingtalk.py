#!/usr/bin/env python3
"""Mock 钉钉 OAuth2 服务（9390）+ Mock 上游（8091，回显 X-User 头）"""
import json, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

def upstream_handler(h):
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            body = ("<html><head><title>mock-upstream</title></head><body>"
                    f"<h1>UPSTREAM OK {self.path}</h1>"
                    f"<div id='xuser'>{h}</div>"
                    "</body></html>").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def log_message(self, *a): print(f"[upstream] {self.path} X-User={h}", flush=True)
    return H

class MockDing(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n) or b"{}")
        print(f"[mock-ding] POST {self.path} body={req}", flush=True)
        if self.path == "/v1.0/oauth2/userAccessToken":
            if req.get("grantType") != "authorization_code" or not req.get("code"):
                self._json(400, {"message": "bad request"})
                return
            self._json(200, {"accessToken": "mock-at-001", "refreshToken": "mock-rt",
                             "expireIn": 7200, "corpId": "ding-mock-corp"})
        else:
            self._json(404, {"message": "not found"})
    def do_GET(self):
        auth = self.headers.get("x-acs-dingtalk-access-token", "") or self.headers.get("Authorization", "")
        print(f"[mock-ding] GET {self.path} token={auth[:40]}", flush=True)
        if self.path == "/v1.0/contact/users/me" and auth == "mock-at-001":
            self._json(200, {"unionId": "mock-union-001", "nick": "张三",
                             "mobile": "13800138000", "corpId": "ding-mock-corp"})
        else:
            self._json(401, {"message": "unauthorized"})
    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def log_message(self, *a): pass

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "ding"
    if which == "ding":
        ThreadingHTTPServer(("127.0.0.1", 9390), MockDing).serve_forever()
    else:
        ThreadingHTTPServer(("127.0.0.1", 8091), upstream_handler("mock-union-001")).serve_forever()
