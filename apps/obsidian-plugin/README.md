# Obsidian Plugin Packaging

## Build plugin bundle

Run from repository root:

```bash
npm run --workspace @self-hosted/obsidian-plugin build
```

Build output:

- `apps/obsidian-plugin/dist/main.js`
- `apps/obsidian-plugin/dist/manifest.json`

## Install into local vault

One command install (build + copy):

```bash
./scripts/install-obsidian-plugin.sh "<YOUR_VAULT>"
```

If you already built and only want to copy:

```bash
./scripts/install-obsidian-plugin.sh "<YOUR_VAULT>" --no-build
```

1. Create plugin folder in your vault:

```bash
mkdir -p "<YOUR_VAULT>/.obsidian/plugins/self-hosted-sync"
```

2. Copy build outputs:

```bash
cp apps/obsidian-plugin/dist/main.js "<YOUR_VAULT>/.obsidian/plugins/self-hosted-sync/main.js"
cp apps/obsidian-plugin/dist/manifest.json "<YOUR_VAULT>/.obsidian/plugins/self-hosted-sync/manifest.json"
```

3. In Obsidian:

- Settings -> Community plugins
- Disable Safe mode
- Enable `Self Hosted Sync`

## Commands

- `Self Hosted Sync: Run manual sync`
- `Self Hosted Sync: Show pending conflicts`
- `Self Hosted Sync: Resolve all conflicts (ours)`
- `Self Hosted Sync: Resolve all conflicts (theirs)`

## Usage

1. 确保服务端已启动并健康（默认 `http://127.0.0.1:8787`）。
2. 在 Obsidian 启用插件后，打开插件设置并填写：
   - `Server URL`
   - `Space ID`
   - 已有凭据则填写 `Access Token` 和 `Client ID`
3. 若没有凭据：填写 `Register Device ID` 和 `Register Client Name`，点击 `注册`。
4. 点击 `保存`，再点击 `测试连接`。
5. 在命令面板运行 `Self Hosted Sync: Run manual sync`。
6. 若出现冲突，先执行 `Self Hosted Sync: Show pending conflicts` 查看数量，再选择：
   - `Self Hosted Sync: Resolve all conflicts (ours)`
   - `Self Hosted Sync: Resolve all conflicts (theirs)`
