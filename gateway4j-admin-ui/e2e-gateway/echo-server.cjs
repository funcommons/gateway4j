// 数据面测试用 echo 后端。用法：node echo-server.js <port> <tag> [mode]
// 返回 JSON：{echo:true, tag, path, method, header_x_echo, header_x_ver, body}
//
// mode（可选，默认 echo，行为与历史版本完全一致——既有 5 场景不受影响）：
//   oauth —— 在 echo 基础上增加 OAuth2Plugin 自建 introspection 桩：
//            POST /oauth/introspect（form: token=xxx）
//              · token 以 e2e-oauth-valid 开头  → 200 {"active":true,"sub":"e2e-oauth-user",...}
//              · token 以 e2e-oauth-srvfail 开头 → 500（模拟 introspection 端点故障 → 插件应 401 fail-closed）
//              · 其余                          → 200 {"active":false}（无效令牌 → 插件应 401）
//            GET  /always500 → 恒 500（预留：恒 5xx 上游端点；注意 CircuitBreakerPlugin 以异常为失败信号，
//                              纯 5xx 响应不会进入其熔断统计，见 data-plane-security.spec.ts 头注释）
//   fail  —— 除 /__probe 外全部返回 500（预留恒 5xx 上游）
//
// 探活：GET /__probe 恒 200，body 含 {mode, tag}，供 spec 复用/换代判断。
const http = require('http');

const port = Number(process.argv[2] || 19001);
const tag = process.argv[3] || 'gw-echo';
const mode = process.argv[4] || 'echo';

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function echoPayload(req, body) {
  return {
    echo: true,
    tag: tag,
    mode: mode,
    path: req.url,
    method: req.method,
    header_x_echo: req.headers['x-echo'] || null,
    header_x_ver: req.headers['x-ver'] || null,
    // 插件注入的用户身份头（basic-auth X-User / oauth2 X-User、X-Username、X-OAuth2-Scope）
    header_x_user: req.headers['x-user'] || null,
    header_x_username: req.headers['x-username'] || null,
    header_x_oauth2_scope: req.headers['x-oauth2-scope'] || null,
    body: body || null,
  };
}

function handleOauth(req, res, body) {
  const tokenMatch = /(?:^|&)token=([^&]*)/.exec(body || '');
  const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : '';
  if (token.startsWith('e2e-oauth-srvfail')) {
    sendJson(res, 500, { error: 'introspection_endpoint_failure' });
    return;
  }
  if (token.startsWith('e2e-oauth-valid')) {
    sendJson(res, 200, {
      active: true,
      sub: 'e2e-oauth-user',
      username: 'e2e-oauth-username',
      scope: 'read write',
    });
    return;
  }
  sendJson(res, 200, { active: false });
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    // 探活恒 200（body 带 mode/tag，供 spec 判断端口上是新脚本还是历史进程）
    if (req.url === '/__probe') {
      sendJson(res, 200, { probe: true, mode: mode, tag: tag });
      return;
    }
    if (mode === 'fail') {
      sendJson(res, 500, { error: 'always_fail', tag: tag });
      return;
    }
    if (mode === 'oauth') {
      if (req.method === 'POST' && req.url === '/oauth/introspect') {
        handleOauth(req, res, body);
        return;
      }
      if (req.url === '/always500') {
        sendJson(res, 500, { error: 'always_fail', tag: tag });
        return;
      }
    }
    sendJson(res, 200, echoPayload(req, body));
  });
});

server.listen(port, '127.0.0.1', () => console.log(`echo up on ${port} tag=${tag} mode=${mode}`));
