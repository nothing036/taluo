# 🔮 塔罗牌占卜系统 — 公开部署指南

## 前提条件

- 一台有公网 IP 的云服务器（阿里云/腾讯云/其他 VPS）
- 操作系统：Ubuntu 20.04+ 或 CentOS 7+
- 一个域名（可选，但推荐）

---

## 第一步：服务器环境准备

```bash
# SSH 登录服务器
ssh root@你的服务器IP

# 安装 Node.js 24（通过 nvm）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
node -v   # 确认 v24.x

# 安装 PM2（进程守护）
npm install -g pm2

# 安装 Nginx（反向代理 + HTTPS）
apt update && apt install -y nginx   # Ubuntu/Debian
# 或 yum install -y nginx            # CentOS
```

## 第二步：上传项目

```bash
# 在本地打包项目（排除 node_modules）
cd ~/Desktop/taluo
tar -czf taluo.tar.gz --exclude=node_modules --exclude=data/taluo.db .

# 上传到服务器
scp taluo.tar.gz root@你的服务器IP:/root/

# 在服务器上解压
ssh root@你的服务器IP
cd /root
mkdir -p /opt/taluo
tar -xzf taluo.tar.gz -C /opt/taluo
cd /opt/taluo
npm install
```

## 第三步：用 PM2 启动

```bash
# 生产模式启动（绑定所有网络接口）
cd /opt/taluo
HOST=0.0.0.0 PORT=3001 pm2 start server.js --name taluo

# 设置开机自启
pm2 save
pm2 startup
# 执行 pm2 startup 输出的命令

# 验证
curl http://localhost:3001/api/cards/major-00
```

## 第四步：配置 Nginx 反向代理

```bash
# 创建 Nginx 配置
nano /etc/nginx/sites-available/taluo
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name 你的域名.com;   # 或者用服务器IP

    # 上传限制
    client_max_body_size 10m;

    # 反向代理到 Node 应用
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：

```bash
ln -s /etc/nginx/sites-available/taluo /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default   # 删掉默认站点
nginx -t                              # 检查配置
systemctl reload nginx                # 重载
```

## 第五步：配置 HTTPS（推荐）

```bash
# 安装 certbot
apt install -y certbot python3-certbot-nginx

# 自动获取 SSL 证书
certbot --nginx -d 你的域名.com

# 测试自动续期
certbot renew --dry-run
```

## 安全加固建议

```bash
# 1. 防火墙：只开放 80/443/22
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable

# 2. 限制后台管理访问（仅内网）
# 在 server.js 的 /admin 路由前加入 IP 白名单

# 3. 定期备份数据库
# crontab -e
# 0 3 * * * cp /opt/taluo/data/taluo.db /backup/taluo-$(date +\%Y\%m\%d).db
```

---

## 日常维护命令

```bash
pm2 status              # 查看运行状态
pm2 logs taluo          # 查看日志
pm2 restart taluo       # 重启
pm2 stop taluo          # 停止

# 更新代码后
cd /opt/taluo
git pull                # 或者重新上传
npm install             # 如有新依赖
pm2 restart taluo
```

---

## 成本估算

| 项目 | 方案 | 月费 |
|------|------|------|
| 云服务器 | 阿里云轻量 2C2G | ~¥34 |
| 域名 | .com / .cn | ~¥5-15/月均 |
| SSL 证书 | Let's Encrypt | 免费 |
| 总计 | | ~¥40-50/月 |

如果用腾讯云 Lighthouse、阿里云 ECS 学生机等，起步可以更低。
