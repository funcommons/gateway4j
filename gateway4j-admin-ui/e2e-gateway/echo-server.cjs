// 数据面测试用 echo 后端。用法：node echo-server.js <port> <tag>
// 返回 JSON：{echo:true, tag, path, method, header_x_echo, header_x_ver, body}
const http = require('http');

const port = Number(process.argv[2] || 19001);
const tag = process.argv[3] || 'gw-echo';

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const payload = JSON.stringify({
      echo: true,
      tag: tag,
      path: req.url,
      method: req.method,
      header_x_echo: req.headers['x-echo'] || null,
      header_x_ver: req.headers['x-ver'] || null,
      body: body || null,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(payload);
  });
});

server.listen(port, '127.0.0.1', () => console.log(`echo up on ${port} tag=${tag}`));
