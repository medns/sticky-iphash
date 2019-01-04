# Sticky-iphash

`Sticky-iphash` 模块为 Node.js 增加 `ip-hash` 负载均衡策略：拥有相同远端地址（IPv4/v6）的连接会被分发到相同的进程。

开发者只需在 `Master` 进程引入此模块并启用，无需修改原有业务逻辑与代码与 Node.js 源码，即可为 Node.js [cluster](https://nodejs.org/dist/latest/docs/api/cluster.html) 开启此均衡策略。

模块对上层完全透明，开启后直接使用 Node.js [cluster](https://nodejs.org/dist/latest/docs/api/cluster.html) 启动多进程，支持 `cluster` 模块所有提供的特性。

__使用此模块时，Node.js 在启动时需开启 `--expose_internals` 标志位。__

Node.js 版本需大于 v7.5.x

## 安装

``` bash
npm i sticky-iphash
```

## 用法

``` js
const sticky = require('sticky-iphash');
sticky.enable();
```

## 例子

``` js
const cluster = require('cluster');

if (cluster.isMaster) {
  // Master 进程中开启 `sticky-iphash`
  const sticky = require('sticky-iphash');
  sticky.enable();

  console.log(`Master ${process.pid} is running`);

  const numCPUs = require('os').cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
  const http = require('http');

  const requestListener = (req, res) => {
    res.writeHead(200);
    const { socket : { remoteAddress, localPort } } = req;
    res.end(`remoteAddress = ${remoteAddress}, localPort = ${localPort}, pid = ${process.pid}`);
  };

  http.createServer(requestListener).listen(8000);
  http.createServer(requestListener).listen(8001);

  console.log(`Worker ${process.pid} started`);
}
```

使用 `--expose_internals` 标志位启动 Node.js 

``` bash
node --expose_internals server.js
```