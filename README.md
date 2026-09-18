# Kitten Scientists v2

> [!IMPORTANT]
> **这是中文 fork。** 本仓库是 [kitten-science/kitten-scientists](https://github.com/kitten-science/kitten-scientists) @ `55e4afa`（`2.0.0-beta.12`）的个人中文分支，只发布中文版 userscript，不向上游提 PR。下面的中文部分记录了这个分支相对上游做的全部改动；其余英文内容是上游原文。

## 中文分支改动（zh-CN）

当前版本 **VER0013（`2.0.0-beta.12-zh-CN.13`）**，分支 `release/zh-cn`，标签 `KS-94C-VER0013`。

### 下载

<https://github.com/c940949574/kitten-scientists-94C/releases/latest>

从 VER0011 起，脚本头部的 `@updateURL` / `@downloadURL` 已指向本仓库的 latest 下载链接，脚本管理器自动更新拉到的永远是最新中文版。此前所有版本都指向 `kitten-science.com`，会被版本号更高的官方英文版静默覆盖。

### 改动一览

#### 界面中文化（VER0001、VER0002）

- 补翻 95 条原本仍是英文的界面文本（活动日志、日志过滤器、总结统计、存档管理、触发器对话框）
- 补齐上游所有语言都缺失的 9 个 key（贸易收支、大使馆通知、斑马升级）
- 修正 6 个 `summary.*` 字符串的占位符错误（源里写成 `Upgraded {0}`，正确应为 `{1}`，会显示错误的数字）
- 触发值输入统一支持百分比与绝对值两种写法

#### 价格预算限制器（VER0010 引入，VER0012、VER0013 重做）

上游的篝火自动化判据只看「有上限资源的现有量 / 上限」，判据里完全没有价格，价格只用来算「能建几个」并一直加到买不起为止。结果是低价期一触发就把 wood / minerals 吃光，高价期又出现「库存满了却不建」且每帧白跑一遍批量价格模拟。针对这一点补了两个限制器。

- **库存保留线**（内部设置，全局）。设一个比例后自动建造永远不动用被保留的部分，评估「能建几个」之前先扣掉保留量。只对有上限的资源生效，保留量大于现有量时夹到 0，默认关闭
- **价格预算**（限制器 B）。单台建筑的价格最多可占「可动用库存」的百分之多少，超了就跳过该次建造。以保留后的可动用量为基数，与保留线叠加计算
- VER0012 修掉逐台判定的漏洞：此前 `max=-1` 时仍会一路买到买不起，预算形同虚设；同时把篝火、太空、宗教、时间四个分区的条目与分区开关统一为「触发值 + 价格预算」双字段弹窗
- VER0013 把告警判据改成增长线，并补充了资源过滤（详见下两条）

换算参考：单周期最多消耗的可动用库存 ≈ `b × r ÷ (r − 1)`，其中 b 是预算百分比，r 是该建筑的价格指数。r=1.15 时约为 `b × 7.7`。

#### 超时空告警改用增长线判据（VER0013）

每座超时空传送仪带回 1.5% 的非制作资源，**67 座才达到 100.5%**，超过 100% 循环后资源才会变多。令 `k = 1.5% × 座数`，一轮消耗比例 f 之后留给下一轮的是 `k × (1 − f)`，因此只有 `f < 1 − 1/k` 才会增长。

| 座数 | 带回 k | 可安全消耗额度 |
|---|---|---|
| 40 | 60% | 无（怎么省都在缩水）|
| 67 | 100.5% | 0.50% |
| 100 | 150% | 33.33% |
| 200 | 300% | 66.67% |

座数不足 67 时提示「当前带回 k%，需 67 座才会增长」，不做额度告警。告警只统计超时空会带回的 19 种非制作、非奢侈资源（catnip、wood、minerals、coal、iron、titanium、gold、oil、uranium、unobtainium、antimatter、catpower、science、culture、faith、starchart、relic、void、blackcoin）；奢侈品永不保留，制作品需 Flux Condensator 且按 `sqrt(X) × 1.5 × N` 计算，都不计入。

#### 满级科技下的预算对应值

额度说的是「单周期最多能消耗多少」，但填进设置的是预算 b，两者相差一个放大倍数 `r ÷ (r − 1)`。反解得到 `b = 额度 × (r − 1) ÷ r`。下表是各座数下**恰好卡在安全线上**的预算值：

| 座数 | 可安全消耗额度 | 篝火满科技<br>r=1.01714 | r=1.03354 | r=1.06354 | r=1.08604 | 篝火无减免<br>r=1.15 | 太空/宗教/时间<br>r=1.25 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| <67 | 无（必缩水）| — | — | — | — | — | — |
| 67 | 0.50% | 0.008% | 0.016% | 0.030% | 0.039% | 0.065% | 0.100% |
| 70 | 4.76% | 0.080% | 0.155% | 0.284% | 0.377% | 0.621% | 0.952% |
| 80 | 16.67% | 0.281% | 0.541% | 0.996% | 1.320% | 2.174% | 3.333% |
| 90 | 25.93% | 0.437% | 0.841% | 1.549% | 2.054% | 3.382% | 5.185% |
| 100 | 33.33% | 0.562% | 1.082% | 1.991% | 2.641% | 4.348% | 6.667% |
| 110 | 39.39% | 0.664% | 1.278% | 2.354% | 3.121% | 5.138% | 7.879% |
| 120 | 44.44% | 0.749% | 1.442% | 2.655% | 3.521% | 5.797% | 8.889% |

120 座以上不再列出：额度继续变宽（150 座 55.56%、200 座 66.67%），预算已经不是瓶颈，这个表也就没什么参考价值了。真正需要照着填的区间是 67 到 120 座这一段。

各档 r 的含义：篝火的建造价格会被永久科技降低，`1.01714` 是减免拉满（满级科技）时的价格指数，往上依次是减免较少的状态，`1.15` 是完全没有减免的原值；太空、宗教、时间固定为 `1.25`，不吃减免。对应的消耗放大倍数分别是 ×59.34、×30.82、×16.74、×12.62、×7.67、×5.00。

举个具体例子：满级科技的篝火（r=1.01714，放大 ×59.34），配 100 座超时空传送仪（额度 33.33%），预算最多只能填 **0.562%**；填 1% 就已经越过安全线。同样的 100 座换成太空建筑（r=1.25），预算可以放到 **6.667%**。满级科技把篝火的安全预算压到不足百分之一，这正是高周目必须按上表反推、不能凭感觉填数字的原因。

> [!TIP]
> **价格预算与超时空告警只建议在篝火与太空分区启用。** 这两个分区的建筑数量多、单轮连锁购买规模大，库存基数也厚，设置预算才有实际收益。宗教与时间分区的建筑吃到的资源种类杂而库存薄（时间水晶、faith 一类），而预算是**按每种资源各自的库存分别算百分比**的——只要其中某一种资源库存偏少，第一台的价格就会顶到上限，结果是整条链一台都不建。

#### 冷冻仓（VER0006、VER0008）

- 新增「修复冷冻仓 → 优先新建」。重置后补容量有新建和修复两条路，价格走向相反：新建价只随「已建成的数量」上涨而重置会清空这个计数，所以重置后新建处于最低价；修复价随已修数量上涨，越修越贵。开启后每次重置先新建一个再开始修复
- VER0008 修掉该功能自 zh-CN.6 起**完全不生效**的缺陷。原实现用 `usedCryochambers` 的上升沿判定重置，而存档载入后首帧就已经是 N，不补额度则功能永不触发

#### 时间通量与时间控制（VER0002、VER0003、VER0007、VER0009）

- VER0002 「自动获取时间通量」新增选项，触发值支持百分比与绝对值
- VER0003 修掉过热：原来只在开始烧之前检查一次热量，会一口气把通量补到目标并冲过上限，之后一直被过热溢价拖住。现按剩余热容量限制本次燃烧数量，与「时间跳转」同一套算法，只有勾选「忽略过热」才无视
- VER0007 新增「建造超时空传送仪下限」。时间通量由超时空传送仪产出，早期数量不足时烧水晶换通量很不划算，开启后数量低于设定值时自动暂停
- VER0009 修掉时间控制小节每帧全量重绘导致的严重卡顿。根因是通量上限的比较用了 `NaN` 不安全的哨兵（`NaN !== NaN` 恒为真），每帧都会重建整个界面

#### 其他修复与功能

- VER0004 「举办节日」新增「无论收益如何都举办」。原判断只盯着节日成本那三种资源（manpower、culture、parchment）的每 tick 产出，三项同时为 0 就不举办，而节日实际还加成另外 15 种资源，且完全没考虑库存
- VER0005 修掉「探索新种族」让整个 KS 停摆的问题。游戏解锁接口在没有可发现种族时返回 `null`，被 `mustExist()` 包住后抛异常，冒泡到引擎主循环后计时器不再排程，所有自动化停止，直到刷新页面
- VER0010 修掉批量建造里的空转隐患。判断「买得起吗」用的是 `现有量 < 价格`，价格为 `NaN` 时该比较恒为 `false`，循环会跑满 1e5 次迭代上限且每帧都跑。改为 `!(现有量 >= 价格)`，`NaN` 一律视为买不起并立即退出

### 版本历史

| 版本 | 标签 | 内容 |
|---|---|---|
| VER0001 | `KS-94C-VER0001` | 首个中文化构建 |
| VER0002 | `KS-94C-VER0002` | 「自动获取时间通量」新增选项，触发值支持百分比/绝对值 |
| VER0003 | `KS-94C-VER0003` | 修复自动获取时间通量把热量烧过上限（功能同 VER0002）|
| VER0004 | `KS-94C-VER0004` | 「举办节日」新增收益开关，修复节日日志误报 |
| VER0005 | `KS-94C-VER0005` | 修复「探索新种族」异常导致 KS 整体停摆 |
| VER0006 | `KS-94C-VER0006` | 冷冻仓新增「优先新建」，修复 6 处行为缺陷 |
| VER0007 | `KS-94C-VER0007` | 「自动获取时间通量」新增超时空传送仪下限 |
| VER0008 | `KS-94C-VER0008` | 修复「优先新建」自 zh-CN.6 起完全不生效 |
| VER0009 | `KS-94C-VER0009` | 修复时间控制小节每帧全量重绘导致的严重卡顿 |
| VER0010 | `KS-94C-VER0010` | 新增库存保留线与价格预算，防止自动建造掏空库存 |
| VER0011 | `KS-94C-VER0011` | 触发值与价格预算合并同窗；更新链接改为本仓库 |
| VER0012 | `KS-94C-VER0012` | 价格预算逐台生效；四个分区条目与分区统一双字段弹窗 |
| VER0013 | `KS-94C-VER0013` | 告警改增长线判据、只算会被带回的资源；告警改确认弹窗；修复百分号缺失与 Space/Time 条目告警失效 |

### 构建

```bash
RELEASE_VERSION="2.0.0-beta.12-zh-CN.13" \
  npx vite --config vite.config.inject.js build && \
  npx vite --config vite.config.user.js build && \
  npx vite --config vite.config.meta.js build
```

产物为 `output/kitten-scientists.user.js` 单文件。每个版本的发布说明放在仓库 Releases 页面，本地草稿见 `pr-descriptions/`。

---

Kitten Scientists (KS) is a simple automation userscript for the complex [Kittens Game](https://kittensgame.com/web/).

For a full explanation of how everything in Kitten Scientists works, please visit the [**full documentation**](https://kitten-science.com/).

[![Pre-Release](https://github.com/kitten-science/kitten-scientists/actions/workflows/pre-release.yml/badge.svg)](https://github.com/kitten-science/kitten-scientists/actions/workflows/pre-release.yml) [![Crowdin](https://badges.crowdin.net/kitten-scientists/localized.svg)](https://crowdin.com/project/kitten-scientists)

## Quick Start

### Option 1: Userscript Manager (recommended)

Install <https://kitten-science.com/kitten-scientists.user.js>.

> [!TIP]
> If you don't have a userscript manager yet, [Tampermonkey](https://www.tampermonkey.net/) is a good solution for the most popular browsers.

### Option 2: Bookmarklet

```
javascript:(function(){var d=document,s=d.createElement('script');s.src='https://kitten-science.com/kitten-scientists.inject.js';d.body.appendChild(s);})();
```

This bookmarklet points to the latest stable release. If there's a new release, you will automatically use that one.

## Contributors

Kitten Scientists was originally developed by [Cameron Condry](https://github.com/cameroncondry/cbc-kitten-scientists) and extended by many great contributors.

A lot of thanks goes out to all the amazing people who contributed to the original Kitten Scientists 1.5 in the past.

-   [Cameron Condry](https://github.com/cameroncondry)
-   [adituv](https://github.com/adituv)
-   [amaranth](https://github.com/amaranth)
-   [Azulan](https://www.reddit.com/user/Azulan)
-   [carver](https://github.com/carver)
-   [coderpatsy](https://github.com/coderpatsy)
-   [cokernel](https://github.com/cokernel)
-   [DirCattus](https://www.reddit.com/user/DirCattus)
-   [DrGaellon](https://github.com/DrGaellon)
-   Eliezer Kanal
-   [enki1337](https://github.com/enki1337)
-   [FancyRabbitt](https://www.reddit.com/user/FancyRabbitt)
-   [gnidan](https://github.com/gnidan)
-   [Hastebro](https://github.com/Hastebro)
-   [hypehuman](https://github.com/hypehuman)
-   [ironchefpython](https://github.com/ironchefpython)
-   [jacob-keller](https://github.com/jacob-keller)
-   [jcranmer](https://github.com/jcranmer)
-   [KMChappell](https://github.com/KMChappell)
-   [Kobata](https://github.com/Kobata)
-   [magus424](https://github.com/magus424)
-   [mammothb](https://github.com/mammothb)
-   [markuskeunecke](https://github.com/markuskeunecke)
-   [Meleneth](https://github.com/meleneth)
-   [Mewnine](https://www.reddit.com/user/Mewnine)
-   [mjdillon](https://github.com/mjdillon)
-   [mmccubbing](https://github.com/mmccubbing)
-   [NoobKitten](https://github.com/NoobKitten)
-   [oliversalzburg](https://github.com/oliversalzburg)
-   [pefoley2](https://www.reddit.com/user/pefoley2)
-   [Phoenix09](https://github.com/Phoenix09)
-   [poizan42](https://github.com/poizan42)
-   [riannucci](https://github.com/riannucci)
-   [romanalexander](https://github.com/romanalexander)
-   [sapid](https://github.com/sapid)
-   [sjdrodge](https://github.com/sjdrodge)
-   [SphtMarathon](https://www.reddit.com/user/SphtMarathon)
-   [TeWeBu](https://github.com/TeWeBu)
-   [toadjaune](https://github.com/toadjaune)
-   [Tom Rauchenwald](https://github.com/TomRauchenwald)
-   [trini](https://github.com/trini)
-   [woutershep](https://github.com/woutershep)
-   [Wymrite](https://github.com/Wymrite)
-   [Xanidel](https://github.com/Xanidel)
-   [zelenay](https://github.com/zelenay)

> If you want to see a live view of contributors for _this_ repository, you can see it at <https://github.com/kitten-science/kitten-scientists/graphs/contributors>.
