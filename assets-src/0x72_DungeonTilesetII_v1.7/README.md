# 0x72 DungeonTileset II v1.7 —— 外部素材来源与许可记录

- **来源**：https://0x72.itch.io/dungeontileset-ii （作者 0x72，www.0x72.pl）
- **版本**：v1.7（原包 `0x72_DungeonTilesetII_v1.7.zip`，406 kB，2026-10-25 由项目作者从 itch 页面下载）
- **许可**：**Creative Commons Zero v1.0 Universal（CC0，公有领域）**。两处依据：
  1. itch 页面的结构化许可表格写明 `Asset license — Creative Commons Zero v1.0 Universal`（同页 `Code license — MIT`，并注明 `No generative AI was used`）。
  2. 作者正文原话：*"You can use this tileset for whatever you like ( CC-0 ). Credit is not necessary, but if you create something using this tileset I'd be happy to see your work."*
  包内 `README` 只说明图集网格规格、不含许可文本，因此以上页面声明为许可依据；本目录保留该引用以备核查。
- **本目录保留的文件**（仅项目实际使用的帧，原包另有 700+ 文件）：
  - 道具 / 状态：`flask_big_red.png`（药瓶）、`skull.png`（骨头/死亡标记）、`ui_heart_full.png`（心/存活）
  - 手持物：`weapon_regular_sword.png`（10×21）、`weapon_bow.png`（14×26，内容包围盒 7×26）
  - 角色：`characters/knight_m_idle_anim_f0..3.png`、`characters/elf_f_idle_anim_f0..3.png`（各 4 帧待机，16×28）
- **本项目的使用方式**：不直接渲染这些 PNG，而是由 `scripts/gen-pixel-art.ts` 在生成 `camp-tiles.ts` 时把它们**量化为 `palette + rows` 数据**，因此运行时不依赖本目录，仓库产物里也不含位图（脚本读不到 PNG 时会跳过并在控制台提示）。
- **槽位高度是量出来的**：手持物与角色统一走 16×28 的竖槽 —— 实测剑 10×21、弓 26 行、人物 16×28。
  24 行的槽只能装下剑，会裁掉弓梢与人物脚部；16×16 更放不下（这也是它们此前被标记"未采用"的原因）。
  角色因此在画布上方保留了原包的抬头空间（骑士空 8 行、精灵空 12 行），多帧共用同一基线。
- **仍未采用的**：`doors_leaf_closed.png`(32×32) 是 2×2 墙砖，塞进 16 宽的道具槽会裁掉门框，本项目的 2D 场景也没有门的位置，故仅作存档不参与生成。
- **角色帧的获取路径**：作者本机的原包 zip 已不在，这批帧取自公开镜像仓库
  `series-ai/jam-ready-assets`（路径 `0x72-dungeon-tileset-ii/2D/dungeon/frames/`）中的同名文件，未做任何像素修改；
  CC0 允许再分发。若日后重新解压官方 zip，可直接用同名文件覆盖，生成结果不变。
  **注意该仓库用 Git LFS 存 PNG**：直接拉 `raw.githubusercontent.com` 拿到的是 128 字节的 LFS 指针文件，
  必须改用 `media.githubusercontent.com/media/<repo>/<ref>/<path>` 才能取到真图。
- **角色清单（2026-10-27 扩到 13 种）**：`knight_m` / `knight_f` / `elf_m` / `elf_f` / `dwarf_m` /
  `wizzard_m`（原包把 wizard 拼成 wizzard）/ `lizard_m` / `orc_warrior` / `orc_shaman` / `goblin` /
  `chort` / `imp` / `tiny_zombie`，各 4 帧待机（`goblin`/`imp`/`tiny_zombie` 原包是 3 帧循环，第 4 帧与第 2 帧重复）。
- **尺寸不统一，落槽一律贴底**：人形 6 个是 16×28；`orc_warrior`/`orc_shaman`/`chort` 是 16×23；
  `goblin`/`imp`/`tiny_zombie` 是 16×16。生成器按 `bottom: true` 贴底对齐，所有角色共用一条脚底基线
  （早期按画布居中会把这些小个子浮在半空）。`headRows`（头像裁切行区间）是逐个用行宽突变处量出来的。
- **未采用**：`ogre`(32×36，内容宽 20) 与 `big_demon`(32×36，内容宽 23) 放不进 16 宽的角色槽，会左右被裁；
  `wizzard_f`/`dwarf_f`/`lizard_f` 与对应男性版共用同一张剪影（只换配色），加进去只会重复轮廓，故未收。
  `knight_f` 同理与 `knight_m` 剪影相同、仅羽饰颜色不同，保留但排在骨架顺序最后一位，
  这样 12 人局不会同时抽到这两个"近似双胞胎"。
- **署名**：CC0 不要求署名，但在此记录以示感谢。
