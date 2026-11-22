#!/bin/bash
# S11-4 全链路探针：cookie jar + 302 state 截获 + 回调 + 代理断言
set -e
JAR=/tmp/s114/cookies.txt
rm -f $JAR
GW=http://localhost:9300
P=/mock/hello

echo "=== 1. 未访问受保护路由 → 期望 302 → login.dingtalk.com（截获 state） ==="
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' "$GW$P")
echo "Location: $LOC"
echo "$LOC" | grep -q "login.dingtalk.com" && echo "PASS: 302 → login.dingtalk.com" || { echo "FAIL: not dingtalk login"; exit 1; }
STATE=$(echo "$LOC" | sed -n 's/.*[?&]state=\([^&]*\).*/\1/p')
[ -n "$STATE" ] && echo "PASS: state captured (${#STATE} chars)" || { echo "FAIL: no state"; exit 1; }
echo "$STATE" | grep -q '\.' && NDOT=$(echo "$STATE" | tr -cd '.' | wc -c) || NDOT=0
echo "state dots: $NDOT (期望 3=四段)"

echo "=== 2. 构造回调（authCode+state） → 期望 302 回原 URL + Set-Cookie fu-gw-token ==="
R2=$(curl -s -D - -o /dev/null -c $JAR "$GW$P?authCode=mock-code-1&state=$STATE")
echo "$R2" | grep -qi "HTTP/2 302\|HTTP/1.1 302" && echo "PASS: callback 302" || { echo "FAIL: callback not 302"; echo "$R2" | head -8; exit 1; }
echo "$R2" | grep -qi "set-cookie: fu-gw-token" && echo "PASS: JWT cookie set" || { echo "FAIL: no cookie"; echo "$R2" | grep -i set-cookie; exit 1; }
REDIR=$(echo "$R2" | grep -i '^location:' | tr -d '\r' | awk '{print $2}')
echo "redirect back: $REDIR"

echo "=== 3. 带 cookie 再访问 → 期望 200 代理到 mock 上游 + X-User 头到达 ==="
BODY=$(curl -s -b $JAR -L "$GW$P")
echo "$BODY" | grep -q "UPSTREAM OK" && echo "PASS: proxied to mock upstream" || { echo "FAIL: not proxied"; echo "$BODY" | head -5; exit 1; }
echo "$BODY" | grep -q "mock-union-001" && echo "PASS: X-User header reached upstream (unionId echo)" || { echo "FAIL: no X-User at upstream"; echo "$BODY"; exit 1; }

echo "=== 4. 篡改 state 回调 → 期望 401 JSON ==="
CODE=$(curl -s -o /tmp/s114/tamper.json -w '%{http_code}' "$GW$P?authCode=x&state=aaa.111.${STATE#*.}" -b $JAR)
[ "$CODE" = "401" ] && echo "PASS: tampered state → 401" || { echo "FAIL: got $CODE"; cat /tmp/s114/tamper.json; }
grep -q "state validation failed" /tmp/s114/tamper.json && echo "PASS: 401 body state validation failed"

echo "=== 5. logout → 清 cookie；再访问 → 302 重登 ==="
curl -s -b $JAR -c $JAR -o /dev/null -w 'logout http: %{http_code}\n' "$GW/mock/logout"
 curl -s -b $JAR -o /dev/null -w 'after-logout http: %{http_code} → %{redirect_url}\n' "$GW$P" | tee /dev/stderr | grep -q "302" && echo "PASS: after logout 302 re-login"
echo "ALL DONE"
