# development-doc —— 开发过程留档

这个目录记录**人 + AI 协作开发本项目的完整过程**，用途有两个：

1. 交接：新同事（或半年后的自己）不用读 commit 猜当时为什么这么改，直接看原始对话；
2. 归功：谁在什么时间解决了什么，这里是原始凭据，不是我事后写的总结。

## 文件说明
- `<UTC时间戳>_<会话UUID>.jsonl` —— 一次会话的**原始转录**，逐行 JSON（user / assistant / tool 调用与结果）。
  不压缩、不改写、不挑选：包括失败的尝试与被推翻的方案。留这些比只留"最后怎么成的"有用得多
  —— 本项目好几条硬规定就是从记录在案的错误做法里长出来的（比如把示例数据填成每批 1:1 的退化设计）。
- 本目录整体纳入版本管理，`r-portable-library` 一类产物除外。

## 会话文件从哪来、怎么补进来
pi（编码代理）把每个项目的会话存在按工作目录编码的子文件夹里。本机路径：

    C:\Users\uf107146\.pi\agent\sessions\--C--Custom-CodeRepository-Demo-electron-egg--\*.jsonl

会话**边跑边写**，所以什么时候复制都行；上下文满了或会话结束后再刷一次即可（同名覆盖）：

```powershell
# 在项目根目录执行
$src = "$env:USERPROFILE\.pi\agent\sessions\--C--Custom-CodeRepository-Demo-electron-egg--"
Copy-Item "$src\*.jsonl" development-doc\ -Force
git add development-doc ; git commit -m "docs(devlog): 会话转录留档"
```

## 提交前请注意
转录里会出现**绝对路径、用户名、内部主机名**，这些是正常内容；但如果某次会话里粘过
令牌、口令或内网接口地址，请先手工把那几行替换掉再提交。仓库里已存在的内容我不会自动改写。
