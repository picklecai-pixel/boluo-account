# 菠萝账户

菠萝账户是一个可部署到 GitHub Pages 的 React + Firebase 记账小应用。它支持 Google 登录、Cloud Firestore 云同步、月份/全年筛选、收支统计、月均收入支出、趋势图、分类占比图、支出 Top 5，以及手机浏览器操作。

还支持导入微信支付导出的 Excel 或 CSV 账单。导入前会先预览识别结果，可以调整日期、类型、分类、金额和备注，确认后再写入 Firestore；已经导入过的微信交易会自动跳过，也可以撤销上一次导入或导出 CSV 备份。

## 本地运行

1. 安装依赖：

   ```bash
   npm install
   ```

2. 复制环境变量文件：

   ```powershell
   Copy-Item .env.example .env
   ```

3. 在 Firebase Console 创建 Web App，并把配置填入 `.env`。

4. 启动开发服务：

   ```bash
   npm run dev
   ```

## Firebase 设置

1. Authentication 中启用 Google 登录。
2. Cloud Firestore 中创建数据库。
3. 把 `firestore.rules` 发布到 Firestore Rules。
4. Authentication 的 Authorized domains 添加本地和部署域名：
   - `localhost`
   - GitHub Pages 域名，例如 `your-name.github.io`

## 部署到 GitHub Pages

如果仓库地址是 `https://github.com/your-name/boluo-account`，把 `.env` 里的 `VITE_BASE_PATH` 设置为：

```env
VITE_BASE_PATH=/boluo-account/
```

然后运行：

```bash
npm run deploy
```

部署完成后，用手机打开 GitHub Pages 地址并登录同一个 Google 账号，即可看到同步后的账目。

也可以使用仓库内置的 GitHub Actions 自动部署：

1. 在 GitHub 创建 `boluo-account` 仓库。
2. 上传本项目所有文件，除了 `.env`、`node_modules`、`.npm-cache`、`dist`。
3. 在仓库 `Settings -> Pages` 里，把 `Source` 设为 `GitHub Actions`。
4. 推送到 `main` 后，`Deploy to GitHub Pages` 工作流会自动构建并部署。
5. 到 Firebase Authentication 的 Authorized domains 添加 `your-name.github.io`。

## 数据字段

每条账目保存在 Firestore 的 `transactions` 集合中：

- `type`: `income` 或 `expense`
- `amount`: 金额
- `category`: 分类
- `date`: `YYYY-MM-DD`
- `note`: 备注
- `userId`: Firebase 用户 ID
- `createdAt`: 创建时间
- `updatedAt`: 更新时间
