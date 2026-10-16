# 首次开通（Grok Bot 执行）

用户已经 Fork 了这个仓库、打开了 GitHub Pages，并在对话里告诉了你仓库地址。按下面的步骤帮用户开通。`agent/TASK.md` 开头的「规则」在这里同样适用，先读一遍。

1. **准备令牌。** 检查环境变量 `XSHELF_GITHUB_TOKEN` 是否存在（只检查有没有，不要打印它的值）。
   - 不存在：用安全卡片向用户索取，名称填 `XSHELF_GITHUB_TOKEN`，说明写“xshelf 推送用的 GitHub 细粒度令牌：只选这个仓库，Contents 读写”。
   - 用户如果把令牌直接贴在了对话里：提醒用户这个令牌已经暴露，请到 GitHub 删除它、重新生成一个，再通过安全卡片填写。

2. **准备仓库。**
   - 同一个 Grok 账号的所有 Bot 共用一台电脑。xshelf 只使用 `/workspace/xshelf`，不要动 `/workspace` 下的其他目录。
   - 仓库放在 `/workspace/xshelf/repo`，不存在就用 `https://github.com/<用户名>/<仓库名>.git` 克隆过来。如果它已存在，但 `git remote get-url origin` 不是用户给的仓库，就停下来告诉用户，不要覆盖。
   - 在仓库里执行 `git config user.name`，结果为空时设置 `git config user.name "<GitHub 用户名>"` 和 `git config user.email "<GitHub 用户名>@users.noreply.github.com"`。仓库是公开的，不要用真实邮箱。
   - 用 TASK.md 第 6 步的推送命令加 `--dry-run` 试一次，确认令牌能推送。失败就请用户检查令牌：只选这一个仓库，Contents 是 Read and write；然后通过安全卡片重新填写。

3. **确认 X 插件可用。** 用 X 插件查当前登录账号（`GET /2/users/me`），记住它的 user id，不要写进仓库。查不到就请用户在 Connect apps 里添加 X 插件并登录 X（只登录 X 连接器读不到书签），然后停下等用户回复。

4. **拉取书签。** 在仓库目录里按 TASK.md 第 2、3 步执行。这是第一次，`../new_raw.json` 里就是全部书签。

5. **和用户确认设置。** 读完 `../new_raw.json` 里所有书签，发一条消息给用户，等用户回复后再继续：
   - 建议 6–10 个分类：彼此不重叠，覆盖所有书签，最后一个是兜底的「其他」。每个分类给一个 2–4 个字的短名（列表里显示用），附上会归进去的条数和两三条例子的标题。
   - 网站标题，默认「我的 X 书签」。
   - 时区，默认 `Asia/Shanghai`，写成 IANA 名称。
   - 每天几点同步，默认早上 9 点。
   - 告诉用户：可以直接回复“确认”，也可以说要改哪里。

6. **写入设置。** 按用户确认的内容：
   - 写 `data/categories.json`，格式：`[{"name": "分类全名", "short": "短名"}, ...]`。
   - 写 `config.json`：`title`、`timezone`，以及 `site_url`。`site_url` 一般是 `https://<用户名小写>.github.io/<仓库名>/`；如果仓库名就是 `<用户名>.github.io`，则是 `https://<用户名小写>.github.io/`。

7. **导入全部书签。** 按 TASK.md 第 4–6 步执行：写 `../new.json`、运行 `merge.py`、提交并推送。第一次的提交信息用 `setup: <merge.py 输出的那一行>`。

8. **建每日定时任务。** 按用户确认的时间每天运行一次，任务内容只写下面这一句（把地址换成用户的仓库）：

   ```
   进入 /workspace/xshelf/repo（不存在就克隆 https://github.com/<用户名>/<仓库名>.git），执行 git pull --rebase，然后读取并严格执行仓库里的 agent/TASK.md。
   ```

   不要把 TASK.md 的步骤抄进定时任务。步骤留在仓库里，模板更新后用户点一下 Sync fork 就生效。

9. **告诉用户结果。**
   - 网站地址（`site_url`）。第一次推送后 GitHub Pages 要一两分钟才能生效，打不开就等一会儿再试。
   - 还是 404 的话，请用户检查 Settings → Pages：Source 是 Deploy from a branch，分支 `main`，目录 `/ (root)`。
   - 导入了几条书签、分成了哪些类。
   - 以后每天几点自动同步；想改分类、站名或时间，直接跟你说。
