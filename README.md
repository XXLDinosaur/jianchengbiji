<p align="center"><img src="notes/assets/app-icon.png" width="88" alt="简成竹叶图标"></p>
<h1 align="center">简成文档 · 简成笔记</h1>
<p align="center"><strong>把内容留在本地，把心思留给写作。</strong></p>
<p align="center"><a href="https://github.com/XXLDinosaur/jianchengbiji/releases/latest">下载安装包</a> · <a href="#下载与本次更新">本次更新</a> · <a href="#界面与功能">界面与功能</a> · <a href="#运行与构建">运行与构建</a> · <a href="OPEN_SOURCE.md">开源说明</a></p>

本地优先的 Windows Markdown 写作软件。直接编辑排版后的内容，文档保存在自己的电脑中。

| 产品 | 当前版本 | 定位 | 源码 |
| --- | --- | --- | --- |
| 简成文档（原名成简） | 0.5.11 | 专注单篇文档写作与记录，不包含仓库管理 | 本仓库根目录 |
| 简成笔记 | 0.10.4 | 相同的编辑能力，加上本地仓库、文件夹和多文档标签管理 | [notes/](notes/) |

## 下载与本次更新

**2026 年 11 月 27 日发布** · Windows x64 · [完整发布说明与 SHA-256 校验文件](https://github.com/XXLDinosaur/jianchengbiji/releases/tag/documents-v0.5.11-notes-v0.10.4)

| 简成文档 0.5.11 | 简成笔记 0.10.4 |
| --- | --- |
| [下载文档版 MSI](https://github.com/XXLDinosaur/jianchengbiji/releases/download/documents-v0.5.11-notes-v0.10.4/Jiancheng-Documents-0.5.11-x64.msi) | [下载笔记版 MSI](https://github.com/XXLDinosaur/jianchengbiji/releases/download/documents-v0.5.11-notes-v0.10.4/Jiancheng-Notes-0.10.4-x64.msi) |

### 两款软件都可以拖入 Markdown、检查更新

- **拖入文档**　在 Windows 文件资源管理器中选中 `.md` 文件，拖到编辑区即可打开。简成文档每次打开一篇；简成笔记可一次拖入多篇，每篇在独立标签页打开，保存时写回原文件。拖入图片会插入正文，文档和图片请分开拖。
- **检查更新**　启动后会自动检查新版，也可点右上角 **文件 → 检查更新…**。发现新版时，选 **稍后提醒** 可继续写作。要更新时，点 **下载安装包** 并选择保存位置，通过 SHA-256 校验后，再点 **打开安装向导**。

下图为简成笔记的「文件」菜单。「检查更新…」在菜单下方，简成文档也从这里进入。

![简成笔记的文件菜单，检查更新位于帮助上方](docs/images/release-file-menu.png)

### 简成笔记可以按 #标签找笔记

在仓库笔记的正文中写下 `#论文 #方法` 并保存，然后点左侧 **#标签**。下图中的 **#论文（2）** 表示仓库里有两篇笔记使用了这个标签。点标签名查看文件列表，再点文件名打开原文。同一篇内重复写同一个标签只计一次。

![仓库标签列表，方法和文献各有一篇笔记，论文有两篇](docs/images/release-tags.png)

要找正文中的一句话，可按 **Ctrl+Shift+F** 搜索整个仓库，再用文件夹或标签缩小范围。

### 从文献摘录到按章节导出 Word

1. 在简成笔记中打开一篇阅读笔记，点 **笔记工具 → 插入文献摘录…**，分别填写原文、自己的理解和出处。
2. 写好各章后，点 **文件 → 按章节导出 Word…**，从仓库选择要合并的笔记。
3. 用 **上移 / 下移** 排好章节，点 **导出 Word**，即可得到一份可继续编辑的 `.docx`。

![按章节导出 Word 对话框，研究问题排在阅读摘录之前，可调整顺序或添加章节](docs/images/release-chapters.png)

本版已移除简成笔记的会议面板和周会模板。以前写的会议纪要仍可从原文件夹作为普通笔记打开。

Windows 安装包未进行代码签名。历次改动见 [更新记录](CHANGELOG.md)。

## 界面与功能

### 简成文档：打开一份文档，安静写完一个想法

适合日常记录、文章草稿与独立文档。直接在纸张区域编辑，标题、图片、表格和格式工具就在手边。无需先建立仓库。

![简成文档：简洁工具栏与图文编辑界面](docs/images/documents.png)

### 简成笔记：从一篇笔记，生长为自己的资料库

保留相同的编辑体验，增加本地仓库、文件夹、文档标签与内部链接。适合整理项目资料、学习笔记和长期专题。

![简成笔记：仓库、文件夹和文档标签](docs/images/notes.png)

| 你的使用方式 | 简成文档 | 简成笔记 |
| --- | --- | --- |
| 标题、编号、图片、表格、格式刷 | ✓ | ✓ |
| 目录、查找、替换、主题与浮窗 | ✓ | ✓ |
| 富文本复制、PDF、独立 HTML | ✓ | ✓ |
| 仓库与文件夹管理 | — | ✓ |
| 多文档标签与仓库内文档链接 | — | ✓ |
| 更适合 | 专注写一篇文档 | 写作与资料整理 |

### 从写好，到分享出去

右上角「文件」集中放置保存、打印、复制富文本与导出。图片、表格可以随内容一起分享；独立 HTML 将样式与图片装进一个文件，便于离线阅读。

![文件菜单中的保存、打印和导出功能](docs/images/file-menu.png)

### 第一次打开，就有上手说明

使用首页直接显示在软件的文档区域，可离线查看。按 F1 或从「文件 → 帮助」随时回来，逐步了解编辑、图片表格、保存导出与快捷键。

![软件内部的功能介绍与使用首页](docs/images/welcome.png)

> 截图中的笔记均为演示内容。

### 用目录折叠浏览长文

两个软件都支持多级目录折叠。**点箭头收起 / 展开下级标题，点标题文字跳转正文**。折叠只影响左侧导航，不会隐藏或删除正文；展开父标题后，子标题原来的折叠状态会保留。

| 简成文档：展开目录 | 简成文档：收起章节 |
| --- | --- |
| ![文档版目录展开](docs/images/documents-outline-expanded.png) | ![文档版目录折叠](docs/images/documents-outline-collapsed.png) |

| 简成笔记：展开目录 | 简成笔记：收起章节 |
| --- | --- |
| ![笔记版导航目录展开](docs/images/notes-outline-expanded.png) | ![笔记版导航目录折叠](docs/images/notes-outline-collapsed.png) |

点击图片可查看大图。只有包含下级标题的条目显示箭头；不要求标题级别连续。

### 从 Word 粘贴时保留可见内容

过滤 Word 隐藏的引用域指令（例如 `ADDIN ZOTERO_ITEM CSL_CITATION`），保留可见引用编号和前后正文；移除仅用于强制分页的空段落，减少异常留白。此前已粘贴到文档里的乱码不会自动清除，请从 Word 重新复制粘贴。

## 编辑与分享

- 所见即所得 Markdown 编辑，标题、编号、项目符号、待办、高亮、格式刷。
- 图片拖入、粘贴、缩放；表格编辑；目录、查找和替换。
- 图片尺寸、空白段落、复杂表格往返保存；高级格式使用内嵌 HTML。
- 文档图片保存到相邻资源目录，搬迁时请同时携带资源文件夹。
- 富文本复制内嵌图片；A4 PDF / 打印；单文件离线 HTML 分享。
- 自定义主题、文档缩放、置顶浮窗、自动保存与软件内帮助。

不同外部编辑器可能过滤 Base64 图片或改变粘贴格式，无法保证所有平台完全一致。自动保存不替代备份。

## 运行与构建

使用 Windows、Node.js 22 及 npm。首次安装依赖需要联网。每个产品在各自目录独立安装依赖、构建：

```sh
# 简成文档：仓库根目录
npm ci
npm start
npm run installer:msi

# 简成笔记
cd notes
npm ci
npm start
npm run installer:msi
```

安装产物位于各自目录的 `发行版/MSI/<版本>/`。`npm run pack` 生成免安装程序目录。界面测试需要交互式桌面会话，使用独立临时用户配置。

```sh
npm run build
node --test tests/core.test.mjs
node tests/exports.cjs
npm run test:welcome
```

## 架构与代码导览

Electron 44 主进程负责窗口、文件、剪贴板与打印；preload 提供受限 IPC。前端采用原生 JavaScript / HTML / CSS，Tiptap 3 / ProseMirror 编辑内核，esbuild 构建，electron-builder 打包 MSI。

| 模块 | 入口 |
| --- | --- |
| 编辑器初始化、图片及表格 | `src/rich-editor.js` |
| Markdown 解析与序列化 | `src/core.mjs`、编辑器自定义序列化规则 |
| 文件与相对资源路径 | `src/files.cjs`、`src/resources.cjs` |
| 富文本、PDF、HTML 导出 | `src/export-ui.js`、`src/export-content.js`、`src/exports.cjs` |
| 文件菜单与内置首页 | `src/file-menu.js`、`src/welcome-guide.js`、`src/welcome-home.css` |
| 编号与格式刷 | `src/block-format.js`、`src/editor-features.js` |
| 仓库与多文档 | `notes/src/vaults.cjs` 及笔记版界面模块 |
| 构建与回归 | `scripts/`、`tests/`，笔记版有独立同名目录 |

历史内部标识 `moye-markdown`、`chengjian-notes` 保留以兼容原有数据目录。当前界面入口是 `rich.html` 和 `rich-editor.js`。

## 许可

项目沿用 [MIT License](LICENSE)，允许使用、修改及再分发，须保留版权与许可声明。第三方组件遵循各自许可证，构建生成 `dist/THIRD-PARTY-NOTICES.txt` 并随软件分发。
