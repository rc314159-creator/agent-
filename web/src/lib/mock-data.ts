// Mock transcript data simulating a product group interview discussion
export const mockTranscripts = [
  { id: 1, speaker: "Speaker A", text: "我觉得这个产品的核心痛点在于用户在多平台之间切换的成本太高了。", time: "00:01:23", emotion: "calm" },
  { id: 2, speaker: "Speaker B", text: "同意，而且现在市场上已有的解决方案都太重了，用户学习成本很高。", time: "00:01:45", emotion: "calm" },
  { id: 3, speaker: "Speaker C", text: "我做了一些竞品调研，发现飞书和 Notion 虽然功能强大，但在移动端体验很差。", time: "00:02:10", emotion: "happy" },
  { id: 4, speaker: "Speaker A", text: "那我们可以主打轻量化和移动优先的策略？", time: "00:02:35", emotion: "calm" },
  { id: 5, speaker: "Speaker D", text: "对，但轻量化不代表功能少，我们可以用 AI 来弥补功能的缺失。", time: "00:02:50", emotion: "happy" },
  { id: 6, speaker: "Speaker B", text: "我觉得可以从三个维度来分析：用户需求、市场空间和技术可行性。", time: "00:03:15", emotion: "calm" },
  { id: 7, speaker: "Speaker C", text: "用户需求方面，根据我查到的数据，Z 世代用户更偏好轻量化工具。", time: "00:03:40", emotion: "calm" },
  { id: 8, speaker: "Speaker A", text: "那我们可以定位为面向年轻职场人的智能协作助手。", time: "00:04:05", emotion: "happy" },
  { id: 9, speaker: "Speaker D", text: "好的，我来整理一下大家的观点，形成一个结构化的方案。", time: "00:04:20", emotion: "calm" },
  { id: 10, speaker: "Speaker B", text: "我补充一点，商业模式可以考虑 freemium，基础版免费，高级 AI 功能收费。", time: "00:04:45", emotion: "calm" },
];

// Mock AI summary output
export const mockSummary = `## 讨论要点

### 1. 核心问题
- 用户在多平台切换成本高
- 现有解决方案学习成本过高
- 移动端体验普遍较差

### 2. 产品定位
- **目标用户**：Z 世代年轻职场人
- **核心策略**：轻量化 + 移动优先 + AI 增强
- **差异化**：用 AI 弥补轻量化带来的功能缺失

### 3. 竞品分析
- 飞书：功能全面但移动端体验差
- Notion：学习成本高，不够轻量

### 4. 商业模式
- Freemium 模式：基础版免费，高级 AI 功能付费

### 5. 下一步行动
- [ ] 完成用户画像和需求调研
- [ ] 输出竞品分析报告
- [ ] 确定 MVP 功能列表
`;

// Mock search results
export const mockSearchResults = [
  {
    title: "2026年协同办公市场报告",
    source: "艾瑞咨询",
    summary: "中国协同办公市场规模预计2026年达到680亿元，年增长率22.3%。移动办公占比持续提升至67%。",
    url: "#",
  },
  {
    title: "Z世代职场人工具偏好调查",
    source: "36氪研究院",
    summary: "73%的Z世代职场人更偏好轻量化、即开即用的工具。AI辅助功能成为第二大关注点。",
    url: "#",
  },
  {
    title: "飞书2026年用户数据",
    source: "字节跳动官方",
    summary: "飞书企业版用户突破800万，但移动端日均使用时长仅为桌面端的1/3。",
    url: "#",
  },
];

// Mock chat messages
export const mockChatMessages = [
  {
    role: "user" as const,
    content: "根据讨论内容，我们的产品和飞书的主要差异是什么？",
  },
  {
    role: "assistant" as const,
    content:
      "根据讨论内容，你们的产品与飞书的主要差异体现在三个方面：\n\n1. **定位差异**：飞书是全功能企业协作平台，你们定位为面向Z世代的轻量化智能助手\n2. **移动体验**：飞书移动端体验是短板，你们主打移动优先策略\n3. **AI 策略**：飞书的AI是锦上添花，你们将AI作为核心竞争力来弥补轻量化的功能缺失\n\n建议在方案中突出这些差异化优势。",
  },
];

// Mock mind map data
export const mockMindMapData = {
  data: { text: "智能协作助手" },
  children: [
    {
      data: { text: "用户需求" },
      children: [
        { data: { text: "多平台切换成本高" }, children: [] },
        { data: { text: "移动端体验差" }, children: [] },
        { data: { text: "学习成本过高" }, children: [] },
      ],
    },
    {
      data: { text: "产品定位" },
      children: [
        { data: { text: "Z世代职场人" }, children: [] },
        { data: { text: "轻量化+移动优先" }, children: [] },
        { data: { text: "AI增强" }, children: [] },
      ],
    },
    {
      data: { text: "竞品分析" },
      children: [
        { data: { text: "飞书 - 功能全但重" }, children: [] },
        { data: { text: "Notion - 学习成本高" }, children: [] },
        { data: { text: "钉钉 - 偏管理工具" }, children: [] },
      ],
    },
    {
      data: { text: "商业模式" },
      children: [
        { data: { text: "Freemium" }, children: [] },
        { data: { text: "AI功能付费" }, children: [] },
        { data: { text: "企业版定制" }, children: [] },
      ],
    },
  ],
};

// Mock outline content (Plate editor initial value)
export const mockOutlineContent = [
  {
    type: "h1",
    children: [{ text: "产品群面讨论记录" }],
  },
  {
    type: "h2",
    children: [{ text: "一、核心问题分析" }],
  },
  {
    type: "p",
    children: [{ text: "当前协同办公领域存在以下痛点：" }],
  },
  {
    type: "ul",
    children: [
      {
        type: "li",
        children: [{ text: "用户在多平台之间切换的成本过高" }],
      },
      {
        type: "li",
        children: [{ text: "现有解决方案（飞书/Notion）学习成本高" }],
      },
      {
        type: "li",
        children: [{ text: "移动端体验普遍不佳" }],
      },
    ],
  },
  {
    type: "h2",
    children: [{ text: "二、产品定位" }],
  },
  {
    type: "p",
    children: [
      { text: "面向 " },
      { text: "Z世代年轻职场人", bold: true },
      { text: " 的智能协作助手，主打：" },
    ],
  },
  {
    type: "ol",
    children: [
      { type: "li", children: [{ text: "轻量化 — 即开即用，零学习成本" }] },
      { type: "li", children: [{ text: "移动优先 — 移动端体验领先桌面端" }] },
      {
        type: "li",
        children: [{ text: "AI增强 — 用AI弥补轻量化的功能缺失" }],
      },
    ],
  },
  {
    type: "h2",
    children: [{ text: "三、商业模式" }],
  },
  {
    type: "p",
    children: [{ text: "Freemium 模式：基础版免费，高级 AI 功能付费。" }],
  },
];
