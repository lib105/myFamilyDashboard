import { useState } from 'react';

const PROMOTION_TYPES = [
  { value: 'flash-flight', label: '临期特价机票', emoji: '✈️' },
  { value: 'hotel-clearance', label: '酒店甩卖', emoji: '🏨' },
  { value: 'group-vacancy', label: '旅行团空缺位置', emoji: '🧳' },
  { value: 'custom-promo', label: '其他促销', emoji: '📣' },
];

const INITIAL_SUBMISSIONS = [
  {
    id: 'seed-1',
    agencyName: '阳光亲子假期',
    contactName: '陈顾问',
    contactInfo: '微信：suntrip2026',
    promotionType: 'group-vacancy',
    title: '暑期北海道亲子团剩余 4 个位置',
    validUntil: '2026-07-05',
    travelWindow: '7月中旬出发',
    summary: '札幌 + 小樽 6 天 5 晚，含亲子温泉酒店和中文领队，适合 4-10 岁儿童家庭。',
    details: '目前剩余 2 间家庭房，可接受 2 大 1 小/2 小组合。今天确认可保留早鸟价格。',
    imagePreviews: [],
    createdAt: '刚刚同步',
  },
  {
    id: 'seed-2',
    agencyName: '海岛假期 Travel',
    contactName: 'Lily',
    contactInfo: '电话：138-0000-2026',
    promotionType: 'hotel-clearance',
    title: '三亚海景亲子套房 72 小时闪促',
    validUntil: '2026-06-25',
    travelWindow: '端午后至暑期前',
    summary: '海景套房买 2 晚送 1 晚，含早餐 + 接机，适合短途度假家庭快速决策。',
    details: '可叠加儿童乐园权益，需提前上传住客名单。适用周日至周四入住。',
    imagePreviews: [],
    createdAt: '5 分钟前',
  },
];

const EMPTY_FORM = {
  agencyName: '',
  contactName: '',
  contactInfo: '',
  promotionType: 'flash-flight',
  title: '',
  validUntil: '',
  travelWindow: '',
  summary: '',
  details: '',
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`无法读取文件：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function getPromotionTypeMeta(type) {
  return PROMOTION_TYPES.find((item) => item.value === type) || PROMOTION_TYPES[PROMOTION_TYPES.length - 1];
}

export default function AgencyUploadPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [submissions, setSubmissions] = useState(INITIAL_SUBMISSIONS);
  const [submitMessage, setSubmitMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleImageChange(event) {
    const files = Array.from(event.target.files || []).slice(0, 6);

    if (files.length === 0) {
      setImagePreviews([]);
      return;
    }

    const previews = await Promise.all(
      files.map(async (file, index) => ({
        id: `${file.name}-${index}-${file.lastModified}`,
        name: file.name,
        sizeLabel: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        url: await fileToDataUrl(file),
      })),
    );

    setImagePreviews(previews);
  }

  function removeImage(id) {
    setImagePreviews((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    const typeMeta = getPromotionTypeMeta(form.promotionType);
    const createdAt = new Date().toLocaleString('zh-CN', {
      hour12: false,
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const newSubmission = {
      id: `submission-${Date.now()}`,
      ...form,
      promotionType: typeMeta.value,
      imagePreviews,
      createdAt,
    };

    setSubmissions((prev) => [newSubmission, ...prev]);
    setForm(EMPTY_FORM);
    setImagePreviews([]);
    setSubmitMessage(`已提交「${form.title}」，当前共上传 ${newSubmission.imagePreviews.length} 张图片素材。`);
    setIsSubmitting(false);
    event.target.reset();
  }

  return (
    <div>
      <div className="page-header">
        <h1>📤 旅行社促销投稿</h1>
        <span className="badge badge-secondary">
          待处理投稿 {submissions.length} 条
        </span>
      </div>

      <div className="page-body">
        <div className="alert alert-info" style={{ marginBottom: 'var(--spacing-lg)' }}>
          支持旅行社上传文字介绍与图片素材，用于临期特价机票、酒店甩卖、旅行团空缺位置等促销内容收集。
        </div>

        <div className="upload-page-grid">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 'var(--spacing-md)' }}>
              📝 提交新的促销素材
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">旅行社名称</label>
                  <input
                    className="form-control"
                    value={form.agencyName}
                    onChange={(event) => updateField('agencyName', event.target.value)}
                    placeholder="例如：阳光亲子假期"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">联系人</label>
                  <input
                    className="form-control"
                    value={form.contactName}
                    onChange={(event) => updateField('contactName', event.target.value)}
                    placeholder="例如：陈顾问"
                    required
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">联系方式</label>
                  <input
                    className="form-control"
                    value={form.contactInfo}
                    onChange={(event) => updateField('contactInfo', event.target.value)}
                    placeholder="微信 / 电话 / 邮箱"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">促销类型</label>
                  <select
                    className="form-control"
                    value={form.promotionType}
                    onChange={(event) => updateField('promotionType', event.target.value)}
                  >
                    {PROMOTION_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.emoji} {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">促销标题</label>
                <input
                  className="form-control"
                  value={form.title}
                  onChange={(event) => updateField('title', event.target.value)}
                  placeholder="例如：暑期北海道亲子团剩余 4 个位置"
                  required
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">有效期截止</label>
                  <input
                    className="form-control"
                    type="date"
                    value={form.validUntil}
                    onChange={(event) => updateField('validUntil', event.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">适用出行时间</label>
                  <input
                    className="form-control"
                    value={form.travelWindow}
                    onChange={(event) => updateField('travelWindow', event.target.value)}
                    placeholder="例如：7月中旬 / 本周末 / 节假日前"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">促销摘要</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={form.summary}
                  onChange={(event) => updateField('summary', event.target.value)}
                  placeholder="一句话说明亮点、适合人群和核心卖点"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">详细说明</label>
                <textarea
                  className="form-control"
                  rows={5}
                  value={form.details}
                  onChange={(event) => updateField('details', event.target.value)}
                  placeholder="可填写库存、余位、套餐包含内容、限制条件等详细信息"
                  required
                />
              </div>

              <div className="uploader-dropzone">
                <div className="card-title" style={{ fontSize: 'var(--font-size-base)' }}>
                  🖼️ 上传宣传图片
                </div>
                <p className="text-sm text-muted" style={{ marginTop: 'var(--spacing-xs)' }}>
                  最多 6 张图片，建议上传海报、航班截图、酒店房型图、团位余位图等。
                </p>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                />

                {imagePreviews.length > 0 && (
                  <div className="image-preview-grid">
                    {imagePreviews.map((image) => (
                      <div className="image-preview-card" key={image.id}>
                        <img src={image.url} alt={image.name} />
                        <div className="image-preview-meta">
                          <strong>{image.name}</strong>
                          <span>{image.sizeLabel}</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => removeImage(image.id)}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg w-full"
                style={{ marginTop: 'var(--spacing-lg)' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? '提交中...' : '🚀 提交促销素材'}
              </button>
            </form>

            {submitMessage && (
              <div className="alert alert-success" style={{ marginTop: 'var(--spacing-md)' }}>
                {submitMessage}
              </div>
            )}
          </div>

          <div className="submission-feed">
            <div className="card">
              <div className="card-title" style={{ marginBottom: 'var(--spacing-md)' }}>
                📌 投稿说明
              </div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18, listStyle: 'disc' }}>
                <li>标题里尽量写清目的地、日期或库存信息，方便快速筛选。</li>
                <li>图片建议包含价格海报、酒店房型图、余位截图等高转化素材。</li>
                <li>详细说明里补充套餐包含内容、限制条件、儿童政策与联系人备注。</li>
                <li>提交后可在右侧查看待处理队列，方便运营整理为促销内容。</li>
              </ul>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">🗂️ 待处理投稿队列</span>
                <span className="badge badge-primary">{submissions.length} 条</span>
              </div>

              <div className="submission-feed">
                {submissions.map((submission) => {
                  const typeMeta = getPromotionTypeMeta(submission.promotionType);

                  return (
                    <div className="submission-card" key={submission.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--spacing-sm)' }}>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 800 }}>{submission.title}</div>
                          <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                            {submission.agencyName} · {submission.contactName}
                          </div>
                        </div>
                        <span className="badge badge-secondary">
                          {typeMeta.emoji} {typeMeta.label}
                        </span>
                      </div>

                      <div className="submission-meta">
                        <span className="submission-chip">📅 截止 {submission.validUntil}</span>
                        <span className="submission-chip">🧭 {submission.travelWindow}</span>
                        <span className="submission-chip">☎️ {submission.contactInfo}</span>
                        <span className="submission-chip">⏱️ {submission.createdAt}</span>
                      </div>

                      <p style={{ fontWeight: 600, marginBottom: 6 }}>{submission.summary}</p>
                      <p className="text-sm text-muted">{submission.details}</p>

                      {submission.imagePreviews.length > 0 && (
                        <div className="submission-gallery">
                          {submission.imagePreviews.map((image) => (
                            <img key={image.id} src={image.url} alt={image.name} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
